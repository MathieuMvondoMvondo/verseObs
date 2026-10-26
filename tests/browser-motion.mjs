// Real-browser motion regressions for the OBS output (optional: not part of
// `npm test`, which runs without a browser). Needs playwright-core and Chromium:
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chrome \
//   node tests/browser-motion.mjs
// Every scenario samples each animation frame of the real browser source and
// checks for flashes (sudden jumps), leftovers, clipped text and final states.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createServer } = require(path.join(ROOT, "tools/server.js"));
const PW = process.env.PLAYWRIGHT_CORE;
const CHROMIUM = process.env.CHROMIUM;
if (!PW || !CHROMIUM) {
  console.log("browser-motion: PLAYWRIGHT_CORE and CHROMIUM not set, skipped.");
  process.exit(0);
}
const { chromium } = await import(PW);
const PORT = Number(process.env.MOTION_PORT || 18650);

const LSG = require(path.join(ROOT, "data/bibles/lsg.json")).books;
function verse(name, chapter, start, end) {
  const book = Object.values(LSG).find((b) => b.name === name);
  const verses = book.chapters
    .find((c) => c.chapter === chapter)
    .verses.filter((v) => v.verse >= start && v.verse <= (end || start));
  return {
    type: "show_verse",
    text: verses.map((v) => v.text).join(" "),
    html:
      end > start
        ? verses.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" ")
        : "",
    reference: `${name} ${chapter}:${start}${end > start ? "-" + end : ""}`,
    version: "Louis Segond 1910",
  };
}
const settings = (extra) => ({
  layout: "antenne",
  position: "lower-third",
  animation: "reveal",
  animationDuration: 500,
  ...extra,
});

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("  ✓ " + name);
}

const SAMPLER = () => {
  window.__frames = [];
  window.__states = [];
  const bc = new BroadcastChannel("verseobs");
  bc.onmessage = (e) => {
    if (e.data && e.data.type === "output_state")
      window.__states.push({ t: performance.now(), visible: e.data.visible, label: e.data.label });
  };
  const num = (v) => (v === "" || v == null ? 1 : Number(v));
  function sample() {
    const card = document.querySelector(".verse-card");
    const q = (s) => (card ? card.querySelector(s) : null);
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const scrim = cs(q(".vo-scrim")),
      plate = cs(q(".vo-plate")),
      copy = q(".vo-copy"),
      stage = cs(card);
    const translations = card
      ? Array.from(card.querySelectorAll(".vo-line > span, .verse-card, .vo-copy")).map(
          (el) => getComputedStyle(el).transform,
        )
      : [];
    window.__frames.push({
      t: performance.now(),
      card: !!card,
      stage: stage ? num(stage.opacity) : 0,
      scrim: scrim ? num(scrim.opacity) * (stage ? num(stage.opacity) : 1) : 0,
      plate: plate ? num(plate.opacity) * (stage ? num(stage.opacity) : 1) : 0,
      copy: copy ? num(cs(copy).opacity) : 0,
      body: q(".verse-body") ? num(cs(q(".verse-body")).opacity) * (stage ? num(stage.opacity) : 1) : 0,
      revealing: !!(copy && copy.classList.contains("is-revealing")),
      copies: card ? card.querySelectorAll(".vo-copy").length : 0,
      blocks: card ? card.querySelectorAll(".vo-refblock").length : 0,
      leaving: card ? card.querySelectorAll(".is-leaving").length : 0,
      ref: q(".verse-reference") ? q(".verse-reference").textContent.replace(/\s+/g, " ").trim() : "",
      moved: translations.some((t) => t !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)),
      axis: q(".vo-axis") ? getComputedStyle(q(".vo-axis")).transform : "",
      top: card ? card.getBoundingClientRect().top : null,
      // what the audience sees of the axis and the reference margin (screen px)
      axisH: q(".vo-axis") ? q(".vo-axis").getBoundingClientRect().height : 0,
      // Math, 26/10: no axis drawn beside the text; the band's top edge
      // (screen px) is what moves when the length changes.
      axisShown: !!q(".vo-axis") && q(".vo-axis").getClientRects().length > 0 && q(".vo-axis").getBoundingClientRect().width > 0,
      bandTop: q(".vo-scrim") ? q(".vo-scrim").getBoundingClientRect().top : 0,
      marginTop: q(".vo-margin") ? q(".vo-margin").getBoundingClientRect().top : 0,
    });
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
};

const server = createServer(PORT);
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu"],
});

async function open(reducedMotion = "no-preference", viewport = { width: 1920, height: 1080 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/browser_source.html`);
  await page.evaluate(SAMPLER);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors };
}
const send = (page, msg) =>
  page.evaluate((m) => window.VerseObs.DisplayApp.handleMessage(m), msg);
const frames = (page) => page.evaluate(() => window.__frames.splice(0));
const states = (page) => page.evaluate(() => window.__states.splice(0));
const settle = (page, ms = 2000) => page.waitForTimeout(ms);
/**
 * Largest change of `key` per 60 fps frame (16.7 ms). Measured as a rate so a
 * frame dropped by a busy test machine is not mistaken for a jump in the
 * animation curve itself.
 */
function maxJump(list, key) {
  let max = 0;
  for (let i = 1; i < list.length; i++)
    if (list[i].card && list[i - 1].card) {
      const dt = Math.max(16.7, list[i].t - list[i - 1].t);
      max = Math.max(max, (Math.abs(list[i][key] - list[i - 1][key]) * 16.7) / dt);
    }
  return max;
}
function finalOk(f, ref) {
  assert.ok(f.card, "card on air");
  assert.equal(f.copies, 1, "one text block");
  assert.ok(f.blocks <= 1, "at most one reference block");
  assert.equal(f.leaving, 0, "no leftover leaving nodes");
  assert.equal(f.revealing, false, "text fully revealed (mask removed)");
  assert.equal(f.copy, 1, "text fully opaque");
  assert.ok(f.scrim > 0.999, "band fully present");
  if (ref) assert.equal(f.ref, ref);
}

try {
  const { page, errors } = await open();
  const A = verse("Jean", 3, 16),
    B = verse("Jean", 3, 17),
    C = verse("Romains", 8, 28),
    D = verse("Psaumes", 23, 1, 6);

  await check("Entrance: band, reference and text arrive without a jump, no axis beside the text", async () => {
    await frames(page);
    await send(page, { ...A, settings: settings() });
    await settle(page);
    const f = await frames(page);
    finalOk(f[f.length - 1], "Jean 3:16");
    assert.ok(f.some((x) => x.revealing), "text revealed progressively");
    assert.ok(maxJump(f, "scrim") < 0.34, "band fades in over several frames");
    assert.ok(f.every((x) => !x.axisShown), "no coloured axis beside the text (Math, 26/10)");
    const st = await states(page);
    assert.ok(st.some((s) => s.visible && s.label === "Jean 3:16"), "output confirmed");
    const first = st.find((s) => s.visible);
    const done = f.find((x) => !x.revealing && x.copy === 1 && x.t > f[0].t + 50);
    assert.ok(first.t <= done.t, "confirmation sent when the text is in place, not after the motion");
  });

  await check("Change within a book: the band stays, the verse numbers roll", async () => {
    await send(page, { ...B, settings: settings() });
    await settle(page);
    const f = await frames(page);
    assert.ok(Math.min(...f.map((x) => x.scrim)) > 0.999, "band never leaves the air");
    assert.ok(f.some((x) => x.leaving > 0), "old numbers roll out");
    assert.ok(f.every((x) => x.card), "no gap between passages");
    finalOk(f[f.length - 1], "Jean 3:17");
  });

  await check("Change of book and length: the band adapts its height, never flashes", async () => {
    await send(page, { ...D, settings: settings() });
    await settle(page);
    let f = await frames(page);
    assert.ok(Math.min(...f.map((x) => x.scrim)) > 0.999);
    // Too long for a lower third: its first whole verses, named on air.
    finalOk(f[f.length - 1]);
    assert.match(f[f.length - 1].ref, /^Psaumes 23:1-[2-5]$/);
    await send(page, { ...C, settings: settings() });
    await settle(page);
    f = await frames(page);
    assert.ok(Math.min(...f.map((x) => x.scrim)) > 0.999);
    finalOk(f[f.length - 1], "Romains 8:28");
  });

  await check("Same passage, other position: leaves and enters, never jumps on screen", async () => {
    await send(page, { ...C, settings: settings() });
    await settle(page);
    await frames(page);
    await send(page, { ...C, settings: settings({ position: "upper-third" }) });
    await settle(page);
    const f = await frames(page);
    let jump = 0;
    for (let i = 1; i < f.length; i++)
      if (f[i].card && f[i - 1].card && f[i].scrim > 0.2 && f[i - 1].scrim > 0.2)
        jump = Math.max(jump, Math.abs(f[i].top - f[i - 1].top));
    assert.ok(jump < 40, "visible band moved " + Math.round(jump) + " px in one frame");
    finalOk(f[f.length - 1], "Romains 8:28");
    assert.ok(f[f.length - 1].top < 300, "now an upper third");
    await send(page, { ...C, settings: settings() });
    await settle(page);
    await frames(page); // the way back is not part of the next scenario
  });

  await check("Rapid changes: the latest command wins, nothing is left behind", async () => {
    for (const m of [A, B, D, C, A]) {
      await send(page, { ...m, settings: settings() });
      await page.waitForTimeout(60);
    }
    await settle(page, 2000);
    const f = await frames(page);
    assert.ok(Math.min(...f.map((x) => x.scrim)) > 0.999, "band stays during the burst");
    finalOk(f[f.length - 1], "Jean 3:16");
    const geometry = await page.evaluate(() => {
      const card = document.querySelector(".verse-card").getBoundingClientRect();
      return { top: card.top, bottom: card.bottom, h: innerHeight };
    });
    assert.ok(geometry.bottom <= geometry.h * 0.95 && geometry.top >= geometry.h * 0.05);
  });

  await check("Hide during an entrance: leaves from where it is, no flash back", async () => {
    await send(page, { type: "hide" });
    await settle(page, 900);
    await frames(page);
    await states(page);
    await send(page, { ...C, settings: settings() });
    await page.waitForTimeout(160);
    await send(page, { type: "hide" });
    await settle(page, 1200);
    const f = await frames(page);
    assert.equal(f[f.length - 1].card, false, "output empty");
    const hideAt = f.findIndex((x, i) => i > 3 && x.scrim < f[i - 1].scrim);
    const after = f.slice(Math.max(1, hideAt));
    for (let i = 1; i < after.length; i++)
      if (after[i].card) assert.ok(after[i].scrim <= after[i - 1].scrim + 0.02, "band only goes down");
    const st = await states(page);
    assert.equal(st[st.length - 1].visible, false, "output reports hidden");
  });

  await check("Show again while leaving: picks up smoothly from the current state", async () => {
    await send(page, { ...A, settings: settings() });
    await settle(page);
    await frames(page);
    await send(page, { type: "hide" });
    await page.waitForTimeout(140);
    await send(page, { ...B, settings: settings() });
    await settle(page);
    const f = await frames(page);
    assert.ok(maxJump(f, "scrim") < 0.34, "no jump in the band");
    finalOk(f[f.length - 1], "Jean 3:17");
  });

  await check("Next verse while leaving: the reference comes back with the roll", async () => {
    await send(page, { ...A, settings: settings() });
    await settle(page);
    await send(page, { type: "hide" });
    await page.waitForTimeout(120);
    await send(page, { ...B, settings: settings() });
    await settle(page);
    const f = await frames(page);
    finalOk(f[f.length - 1], "Jean 3:17");
    const lines = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".vo-line > span")).map((s) => [
        getComputedStyle(s).opacity,
        getComputedStyle(s).transform,
      ]),
    );
    assert.ok(lines.length >= 3);
    assert.ok(lines.every(([o, t]) => o === "1" && (t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)")));
  });

  await check("Long chapter: whole verses at ≥ 32 px in a band ≤ 40 %, never a wall", async () => {
    await send(page, { ...verse("Psaumes", 119, 105, 128), settings: settings() });
    await settle(page, 2000);
    const g = await page.evaluate(() => {
      const card = document.querySelector(".verse-card");
      const scrim = card.querySelector(".vo-scrim").getBoundingClientRect();
      const text = card.querySelector(".verse-text");
      return {
        share: (innerHeight - scrim.top) / innerHeight,
        top: card.getBoundingClientRect().top,
        h: innerHeight,
        body: parseFloat(getComputedStyle(text).fontSize),
        nums: card.querySelector(".vo-roll").textContent,
        partial: card.dataset.partial || "",
      };
    });
    assert.ok(g.share <= 0.405, "band share " + g.share.toFixed(3));
    assert.ok(g.body >= 31.5, "body " + g.body + " px");
    assert.ok(g.top >= g.h * 0.05 - 1, "top inside the safe area");
    // The reference on air names exactly the verses shown.
    assert.match(g.nums, /^119:105-1\d\d$/);
    assert.ok(Number(g.nums.split("-")[1]) < 128, "first verses only: " + g.nums);
    assert.equal(g.partial, "119:105-128");
  });

  await check("Two translations: both blocks present and fitted", async () => {
    const LKJV = require(path.join(ROOT, "data/bibles/kjv.json")).books;
    const rom = Object.values(LKJV).find((b) => b.name === "Romans").chapters.find((c) => c.chapter === 8);
    const second = rom.verses.filter((v) => v.verse >= 28 && v.verse <= 30).map((v) => v.text).join(" ");
    await send(page, {
      ...verse("Romains", 8, 28, 30),
      secondary: { text: second, html: "", reference: "Romans 8:28-30", version: "King James Version", lang: "en" },
      settings: settings(),
    });
    await settle(page, 2000);
    const g = await page.evaluate(() => ({
      blocks: document.querySelectorAll(".verse-secondary").length,
      lang: document.querySelector(".verse-secondary").lang,
      bottom: document.querySelector(".vo-copy").getBoundingClientRect().bottom,
      top: document.querySelector(".verse-card").getBoundingClientRect().top,
      h: innerHeight,
    }));
    assert.equal(g.blocks, 1);
    assert.equal(g.lang, "en");
    assert.ok(g.bottom <= g.h * 0.95 && g.top >= g.h * 0.05);
  });
  assert.deepEqual(errors, []);

  // A 720p OBS source scales the 1080-line frame: the band, the axis and the
  // reference still morph from what is on screen, without a jump.
  const small = await open("no-preference", { width: 1280, height: 720 });
  await check("720p source: changes of length morph the band and the reference without a jump", async () => {
    const p = small.page;
    const E = verse("Psaumes", 23, 1);
    await send(p, { ...A, settings: settings() });
    await settle(p);
    await frames(p);
    // [command, final reference, the reference block stays and morphs]
    for (const [msg, ref, kept] of [[D, null, false], [E, "Psaumes 23:1", true], [D, null, true]]) {
      await send(p, { ...msg, settings: settings() });
      await settle(p);
      const f = await frames(p);
      assert.ok(Math.min(...f.map((x) => x.scrim)) > 0.999, "band stays on air");
      // 720 px frame: a scale error would jump by a third of the band at once.
      // (The axis is no longer drawn: the band's edge replaces it.)
      const band = maxJump(f, "bandTop"),
        margin = kept ? maxJump(f, "marginTop") : 0;
      console.log("    720p " + msg.reference + ": largest step per frame — band edge " + band.toFixed(1) + " px" + (kept ? ", reference " + margin.toFixed(1) + " px" : ""));
      assert.ok(band < 15, "band edge jumped " + band.toFixed(1) + " px in one frame");
      assert.ok(f.every((x) => !x.axisShown), "no axis drawn");
      assert.ok(margin < 15, "reference jumped " + margin.toFixed(1) + " px in one frame");
      finalOk(f[f.length - 1], ref);
    }
  });
  assert.deepEqual(small.errors, []);
  await small.ctx.close();

  const reduced = await open("reduce");
  await check("Reduced motion: opacity only, no movement, short", async () => {
    const p = reduced.page;
    await frames(p);
    const sent = await p.evaluate(
      (m) => {
        const t = performance.now();
        window.VerseObs.DisplayApp.handleMessage(m);
        return t;
      },
      { ...A, settings: settings() },
    );
    await settle(p, 900);
    let f = await frames(p);
    assert.ok(f.every((x) => !x.moved), "nothing moves");
    assert.ok(f.every((x) => !x.revealing), "no reveal mask");
    finalOk(f[f.length - 1], "Jean 3:16");
    const begin = f.find((x) => x.card && x.stage > 0 && x.t > sent);
    const end = f.find((x) => x.card && x.stage === 1 && x.t > sent);
    // A 240 ms fade; the margin absorbs a busy test machine's late frames.
    assert.ok(end.t - begin.t < 400, "fade shorter than 400 ms (" + Math.round(end.t - begin.t) + ")");
    await send(p, { ...C, settings: settings() });
    await settle(p, 900);
    f = await frames(p);
    assert.ok(f.every((x) => !x.moved), "change without movement");
    finalOk(f[f.length - 1], "Romains 8:28");
    await send(p, { type: "hide" });
    await settle(p, 700);
    f = await frames(p);
    assert.ok(f.every((x) => !x.moved));
    assert.equal(f[f.length - 1].card, false);
  });
  assert.deepEqual(reduced.errors, []);

  // ---- « Onglet » (Math, 26/10): a card with the reference in a tab ------
  const LKJV = require(path.join(ROOT, "data/bibles/kjv.json")).books;
  const kjv = (name, ch, v) =>
    Object.values(LKJV).find((b) => b.name === name).chapters.find((c) => c.chapter === ch).verses.find((x) => x.verse === v).text;
  const CHANT = [
    "À toi la gloire, ô Ressuscité !",
    "À toi la victoire pour l'éternité !",
    "Brillant de lumière, l'ange est descendu,",
    "Il roule la pierre du tombeau vaincu.",
  ].join("\n");
  const ROM = { ...C, secondary: { text: kjv("Romans", 8, 28), html: "", reference: "Romans 8:28", version: "King James Version", lang: "en" } };
  const SONG = { type: "show_text", title: "Chant d'entrée", subtitle: "", text: CHANT };
  const FREE = {
    type: "show_text",
    title: "",
    subtitle: "",
    text: "Bienvenue à toutes et à tous. Le culte commence dans cinq minutes : installez-vous, la louange va débuter.",
  };
  /** Sends msg with a preset of the page (verse or song presets), extra settings on top. */
  const sendStyled = (page, msg, preset, extra = {}) =>
    page.evaluate(
      ({ msg, preset, extra }) => {
        const V = window.VerseObs,
          song = msg.type === "show_text",
          presets = song ? V.FREETEXT_STYLES : V.TEMPLATES;
        if (!presets[preset]) throw new Error("no " + (song ? "song" : "verse") + " style « " + preset + " »");
        const settings = Object.assign({}, song ? V.FREETEXT_DEFAULTS : V.DEFAULTS, presets[preset].settings, extra);
        V.DisplayApp.handleMessage(Object.assign({}, msg, { settings }));
      },
      { msg, preset, extra },
    );
  /** What the audience sees of an onglet card (screen px). */
  const ONGLET_GEOMETRY = () => {
    const card = document.querySelector(".verse-card:not(.vo-probe)");
    if (!card) return null;
    const box = (el) => {
      if (!el || getComputedStyle(el).display === "none") return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    const tab = card.querySelector(".vo-margin");
    const painted = [];
    // Any thin vertical stroke painted inside the card: an accent bar or a rule.
    card.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
      if (filled && r.width > 0 && r.width <= 8 && r.height >= 20) painted.push("bar " + el.className);
      for (const side of ["Left", "Right"])
        if (parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none")
          painted.push("border-" + side.toLowerCase() + " " + el.className);
      if (/inset/.test(cs.boxShadow)) painted.push("inset shadow " + el.className);
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content !== "none" && ps.display !== "none" && (ps.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(ps.borderLeftWidth) > 0))
          painted.push(pseudo + " " + el.className);
      }
    });
    return {
      layout: document.querySelector("#verse-container").className,
      frame: { width: innerWidth, height: innerHeight },
      card: box(card.querySelector(".vo-plate")),
      tab: box(tab),
      tabText: tab ? tab.innerText.replace(/\s+/g, " ").trim() : "",
      tabClipped: tab ? tab.scrollWidth > tab.clientWidth + 1 : false,
      copy: box(card.querySelector(".vo-copy")),
      second: box(card.querySelector(".verse-secondary")),
      foot: box(card.querySelector(".vo-foot")),
      primaryText: box(card.querySelector(".vo-copy > .verse-text")),
      copyText: card.querySelector(".vo-copy").innerText.replace(/\s+/g, " ").trim(),
      sups: Array.from(card.querySelectorAll(".vo-copy sup.verse-num")).filter((s) => getComputedStyle(s).display !== "none").length,
      firstNum: (Array.from(card.querySelectorAll(".vo-copy .verse-text:not(.verse-secondary-text) sup.verse-num")).find((s) => getComputedStyle(s).display !== "none") || {}).textContent || "",
      align: getComputedStyle(card.querySelector(".vo-copy .verse-text")).textAlign,
      plan: card.querySelector(".vo-plan") ? card.querySelector(".vo-plan").textContent : "",
      planSize: card.querySelector(".vo-plan") ? parseFloat(getComputedStyle(card.querySelector(".vo-plan")).fontSize) : 0,
      partial: card.dataset.partial || "",
      roll: card.querySelector(".vo-nums .vo-roll:not(.is-leaving)") ? card.querySelector(".vo-nums .vo-roll:not(.is-leaving)").textContent : "",
      body: parseFloat(getComputedStyle(card.querySelector(".vo-copy .verse-text")).fontSize),
      painted,
    };
  };
  /** Whole text, inside the frame, the reference whole in its tab, no accent bar. */
  function ongletOk(g, what, { tab = true, part = false } = {}) {
    assert.ok(g, what + ": nothing on air");
    assert.match(g.layout, /layout-onglet/, what + ": onglet layout");
    // Too long for the card: its first whole verses, named in the tab (the
    // Studio then proposes « Découper »). Otherwise the whole text.
    if (part) assert.ok(g.partial && g.tabText.includes(g.roll), what + ": whole verses, named in the tab (" + g.tabText + ")");
    else assert.equal(g.partial, "", what + ": text whole, not partial");
    const scale = g.frame.height / 1080,
      safeX = g.frame.width * 0.05 - 1,
      safeY = g.frame.height * 0.05 - 1;
    for (const [name, b] of [["card", g.card], ["tab", g.tab]]) {
      if (!b) continue;
      assert.ok(b.left >= safeX && b.right <= g.frame.width - safeX, what + ": " + name + " inside the frame horizontally " + JSON.stringify(b));
      assert.ok(b.top >= safeY && b.bottom <= g.frame.height - safeY, what + ": " + name + " inside the frame vertically " + JSON.stringify(b));
    }
    assert.ok(g.card, what + ": card painted");
    assert.ok(g.copy.bottom <= g.card.bottom + 0.5 && g.copy.top >= g.card.top - 0.5, what + ": text inside the card");
    // signature and « 2/6 » close the card, under the text
    if (g.foot) assert.ok(g.foot.top >= g.copy.bottom - 0.5 && g.foot.bottom <= g.card.bottom + 0.5, what + ": signature and plan under the text " + JSON.stringify([g.copy, g.foot]));
    if (tab) {
      assert.ok(g.tab, what + ": tab painted");
      assert.ok(Math.abs(g.tab.bottom - g.card.top) <= 1.5 * scale, what + ": the tab stands on the card");
      assert.ok(g.tab.right <= g.card.right + 0.5 && g.tab.left >= g.card.left - 0.5, what + ": tab within the card's width");
      assert.equal(g.tabClipped, false, what + ": reference never clipped in its tab");
    } else assert.equal(g.tab, null, what + ": no tab");
    assert.deepEqual(g.painted, [], what + ": no accent bar, rule or side stroke");
    // computed sizes are in frame units (the 1080-line frame is scaled)
    assert.ok(g.body >= 31.5, what + ": body " + g.body + " px");
  }

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    const o = await open("no-preference", viewport);
    const label = viewport.width + "×" + viewport.height;
    await check("Onglet " + label + ": every case whole, inside the frame, reference in its tab", async () => {
      const shown = async (msg, preset, extra) => {
        await sendStyled(o.page, msg, preset, { animation: "none", ...extra });
        await o.page.waitForTimeout(250);
        return o.page.evaluate(ONGLET_GEOMETRY);
      };
      let g = await shown(A, "onglet");
      ongletOk(g, "Jean 3:16");
      assert.match(g.tabText, /^Jean 3:16 \(LSG\)$/, "reference and version in the tab");
      assert.ok(g.sups >= 1, "verse number as a superscript");
      // From the Studio a single verse comes with its editor's html (no
      // verse marker): the card still opens on its number.
      g = await shown({ ...A, html: A.text }, "onglet");
      assert.equal(g.firstNum, "16", "the Studio's single verse starts with its number");
      g = await shown(verse("Cantique des Cantiques", 2, 10, 13), "onglet");
      ongletOk(g, "Cantique des Cantiques 2:10-13", { part: !!g.partial });
      assert.match(g.tabText, /^Cantique des Cantiques 2:10-1[0-3] \(LSG\)$/);
      // Its plans: each one whole, the longest reference whole in its tab.
      g = await shown({ ...verse("Cantique des Cantiques", 2, 10, 11), part: 1, parts: 2 }, "onglet");
      ongletOk(g, "Cantique des Cantiques 2:10-11");
      assert.equal(g.tabText, "Cantique des Cantiques 2:10-11 (LSG)");
      // Even in a narrow card the long reference stays whole in its tab.
      g = await shown(verse("Cantique des Cantiques", 2, 10, 13), "onglet", { maxWidth: 40 });
      assert.equal(g.tabClipped, false, "narrow card: reference never clipped");
      assert.ok(g.tab.left >= g.card.left - 0.5 && g.tab.right <= g.card.right + 0.5, "narrow card: tab within the card");
      g = await shown(ROM, "onglet");
      ongletOk(g, "Romains 8:28 LSG/KJV");
      assert.equal(g.tabText, "Romains 8:28", "one reference for both translations");
      assert.ok(g.second && g.second.left >= g.primaryText.right, "the two translations side by side");
      assert.match(g.copyText, /LSG.*KJV/, "each column named by its version");
      assert.equal(g.sups, 2, "each translation starts with its verse number");
      g = await shown(SONG, "onglet");
      ongletOk(g, "chant");
      assert.equal(g.tabText, "Chant d'entrée", "the song title in the tab");
      assert.ok(!/Chant d'entrée/.test(g.copyText), "lyrics only in the card");
      assert.equal(g.align, "center", "lyrics centred in the card");
      g = await shown(FREE, "onglet");
      ongletOk(g, "texte libre", { tab: false });
      g = await shown(A, "onglet-sombre");
      ongletOk(g, "Jean 3:16, onglet sombre");
      // A long passage: its plans are measured by the output with this style,
      // each one then goes on air whole, with a discreet plan indicator.
      g = await shown(verse("Psaumes", 119, 1, 24), "onglet");
      assert.ok(g.partial === "119:1-24" && /^119:1-\d+$/.test(g.roll), "too long: its first verses, named");
      let first = 1,
        plans = [];
      while (first <= 24 && plans.length < 8) {
        g = await shown(verse("Psaumes", 119, first, 24), "onglet");
        const last = g.partial ? Number(g.roll.split("-")[1] || g.roll.split(":")[1]) : 24;
        plans.push([first, last]);
        first = last + 1;
      }
      assert.ok(plans.length >= 2 && plans[plans.length - 1][1] === 24, "plans cover the passage " + JSON.stringify(plans));
      const [a, b] = plans[1];
      g = await shown({ ...verse("Psaumes", 119, a, b), part: 2, parts: plans.length }, "onglet");
      ongletOk(g, "Psaumes 119:" + a + "-" + b + " (plan 2)");
      assert.ok(g.sups >= 2, "verse numbers in the plan");
      assert.equal(g.plan, "2/" + plans.length, "plan indicator");
      assert.ok(g.planSize > 0 && g.planSize <= 22, "plan indicator stays discreet: " + g.planSize + " px (frame units)");
      // The other styles never show a plan indicator.
      await sendStyled(o.page, { ...verse("Psaumes", 119, a, b), part: 2, parts: plans.length }, "antenne", { animation: "none" });
      await o.page.waitForTimeout(250);
      assert.equal(await o.page.evaluate(() => Array.from(document.querySelectorAll(".vo-plan, .vo-sign")).some((el) => el.getClientRects().length > 0)), false, "no plan or signature outside « Onglet »");
    });
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  }

  /** Records every animate() call: what moves, how long, after which delay. */
  const RECORD = () => {
    window.__anims = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      window.__anims.push({
        t: performance.now(),
        cls: typeof this.className === "string" ? this.className : "",
        from: keyframes && keyframes[0] ? JSON.stringify(keyframes[0]) : "",
        to: keyframes && keyframes[1] ? JSON.stringify(keyframes[1]) : "",
        duration: options && options.duration,
        delay: (options && options.delay) || 0,
      });
      return original.call(this, keyframes, options);
    };
  };
  const anims = (page) => page.evaluate(() => window.__anims.splice(0));
  const openRecorded = async (reducedMotion) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion });
    await ctx.addInitScript(RECORD);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/browser_source.html`);
    await page.evaluate(SAMPLER);
    await page.evaluate(() => document.fonts.ready);
    return { ctx, page, errors };
  };
  const end = (list) => Math.max(0, ...list.map((x) => x.delay + x.duration));
  const P1 = { ...verse("Psaumes", 119, 1, 2), part: 1, parts: 3 },
    P2 = { ...verse("Psaumes", 119, 3, 4), part: 2, parts: 3 };

  const rec = await openRecorded("no-preference");
  await check("Onglet motion: the card rises and fades in, the tab follows, Masquer is quicker", async () => {
    const p = rec.page;
    await anims(p);
    await sendStyled(p, A, "onglet");
    await settle(p, 1200);
    let list = await anims(p);
    const card = list.filter((x) => /verse-body/.test(x.cls)),
      tab = list.filter((x) => /vo-margin/.test(x.cls));
    assert.ok(card.length === 1 && tab.length === 1, "one movement for the card, one for the tab: " + JSON.stringify(list.map((x) => x.cls)));
    assert.match(card[0].from, /"opacity":"0"/, "the card fades in");
    assert.match(card[0].from, /translateY\((1[0-9]|[6-9])px\)/, "…rising slightly");
    assert.ok(card[0].duration >= 200 && card[0].duration <= 260, "card in " + card[0].duration + " ms");
    const lag = tab[0].delay - card[0].delay;
    assert.ok(lag >= 40 && lag <= 80, "the tab follows " + lag + " ms later");
    assert.ok(list.every((x) => !/--vo-reveal|scaleY/.test(x.from + x.to)), "no reading mask, no stretched shape");
    const enter = end(list);
    let f = await frames(p);
    assert.equal(f[f.length - 1].plate, 1, "card fully on air");
    // Masquer: shorter than the entrance.
    await send(p, { type: "hide" });
    await settle(p, 900);
    list = await anims(p);
    f = await frames(p);
    assert.equal(f[f.length - 1].card, false, "output empty");
    assert.ok(list.length > 0 && end(list) < enter, "Masquer (" + end(list) + " ms) quicker than the entrance (" + enter + " ms)");
  });

  await check("Onglet plan change: only the text changes, the card stays", async () => {
    const p = rec.page;
    const sign = { signature: "Culte du dimanche" };
    await sendStyled(p, P1, "onglet", sign);
    await settle(p, 1200);
    await frames(p);
    await anims(p);
    await sendStyled(p, P2, "onglet", sign);
    await settle(p, 1200);
    const f = await frames(p),
      list = await anims(p);
    assert.ok(Math.min(...f.map((x) => x.plate)) > 0.999, "the card never fades");
    assert.ok(f.every((x) => x.card), "never empty between two plans");
    assert.ok(list.some((x) => /vo-copy/.test(x.cls)), "the text changes");
    assert.ok(!list.some((x) => /vo-plate|verse-body|vo-margin/.test(x.cls) && /"opacity":"0"/.test(x.from + x.to)), "the card and its tab never leave");
    assert.ok(Math.min(...f.map((x) => x.body)) > 0.999, "the card is never faded");
    // measured right after the change (a style update would rebuild the card)
    const g = await p.evaluate(ONGLET_GEOMETRY);
    ongletOk(g, "plan 2");
    assert.ok(g.foot, "signature and plan shown after the change");
    assert.equal(g.plan, "2/3");
    assert.equal(g.tabText, "Psaumes 119:3-4 (LSG)");
  });
  assert.deepEqual(rec.errors, []);
  await rec.ctx.close();

  const recReduced = await openRecorded("reduce");
  await check("Onglet with reduced motion: a simple fade, nothing moves", async () => {
    const p = recReduced.page;
    await frames(p);
    await anims(p);
    await sendStyled(p, P1, "onglet");
    await settle(p, 900);
    await sendStyled(p, P2, "onglet");
    await settle(p, 900);
    await send(p, { type: "hide" });
    await settle(p, 700);
    const f = await frames(p),
      list = await anims(p);
    assert.ok(list.length > 0, "still a fade");
    assert.ok(list.every((x) => !/translate|scale/.test(x.from + x.to) || /translateY\(0px\)|none/.test(x.from)), "opacity only: " + JSON.stringify(list.filter((x) => /translate|scale/.test(x.from + x.to)).slice(0, 2)));
    assert.ok(f.every((x) => !x.moved), "nothing moves on screen");
    assert.equal(f[f.length - 1].card, false);
  });
  assert.deepEqual(recReduced.errors, []);
  await recReduced.ctx.close();

  // The existing styles keep their exact composition: the boxes measured on
  // dc8afdc, before the onglet layout (tests/fixtures/styles-dc8afdc.json).
  const FIXTURE = require(path.join(ROOT, "tests/fixtures/styles-dc8afdc.json")).shots;
  await check("Antenne and Carte keep the composition they had before Onglet (4 cases, 1080p and 720p)", async () => {
    const cases = {
      "jean-3-16": A,
      "psaume-119-plan-2": { ...verse("Psaumes", 119, 5, 8), part: 2, parts: 6 },
      "romains-8-28-lsg-kjv": ROM,
      chant: SONG,
    };
    let compared = 0;
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      const o = await open("no-preference", viewport);
      for (const style of ["antenne", "carte"])
        for (const [name, msg] of Object.entries(cases)) {
          const got = await o.page.evaluate(
            async ({ msg, style }) => {
              const V = window.VerseObs,
                song = msg.type === "show_text",
                key = style === "antenne" ? "antenne" : song ? "chant" : "studio",
                presets = song ? V.FREETEXT_STYLES : V.TEMPLATES;
              const settings = Object.assign({}, song ? V.FREETEXT_DEFAULTS : V.DEFAULTS, presets[key].settings, { animation: "none", animationDuration: 0, bgImage: "" });
              V.DisplayApp.handleMessage({ type: "hide" });
              await new Promise((r) => setTimeout(r, 60));
              V.DisplayApp.handleMessage(Object.assign({}, msg, { settings }));
              await new Promise((r) => setTimeout(r, 450));
              const card = document.querySelector(".verse-card:not(.vo-probe)");
              const box = (el) => {
                const r = el.getBoundingClientRect();
                return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
              };
              return {
                layout: document.querySelector("#verse-container").className,
                partial: card.dataset.partial || "",
                fit: card.dataset.fit,
                card: box(card),
                copy: box(card.querySelector(".vo-copy")),
                margin: box(card.querySelector(".vo-margin")),
                plate: box(card.querySelector(".vo-plate")),
                text: card.innerText.replace(/\s+/g, " ").trim().slice(0, 220),
              };
            },
            { msg, style },
          );
          const want = FIXTURE[`${style}-${name}-${viewport.width}x${viewport.height}`];
          assert.ok(want, "fixture for " + style + " " + name);
          for (const key of ["layout", "partial", "fit", "text"]) assert.equal(got[key], want[key], `${style} ${name} ${viewport.width}: ${key}`);
          for (const key of ["card", "copy", "margin", "plate"])
            for (const k of ["x", "y", "w", "h"])
              assert.ok(Math.abs(got[key][k] - want[key][k]) <= 0.5, `${style} ${name} ${viewport.width}: ${key}.${k} ${got[key][k]} ≠ ${want[key][k]}`);
          compared++;
        }
      assert.deepEqual(o.errors, []);
      await o.ctx.close();
    }
    assert.equal(compared, 16);
  });
  console.log("\n✓ Browser motion: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
