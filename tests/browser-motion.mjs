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
      revealing: !!(copy && copy.classList.contains("is-revealing")),
      copies: card ? card.querySelectorAll(".vo-copy").length : 0,
      blocks: card ? card.querySelectorAll(".vo-refblock").length : 0,
      leaving: card ? card.querySelectorAll(".is-leaving").length : 0,
      ref: q(".verse-reference") ? q(".verse-reference").textContent.replace(/\s+/g, " ").trim() : "",
      moved: translations.some((t) => t !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)),
      axis: q(".vo-axis") ? getComputedStyle(q(".vo-axis")).transform : "",
      top: card ? card.getBoundingClientRect().top : null,
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

async function open(reducedMotion = "no-preference") {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion,
  });
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

  await check("Entrance: band, axis, reference and text arrive without a jump", async () => {
    await frames(page);
    await send(page, { ...A, settings: settings() });
    await settle(page);
    const f = await frames(page);
    finalOk(f[f.length - 1], "Jean 3:16");
    assert.ok(f.some((x) => x.revealing), "text revealed progressively");
    assert.ok(maxJump(f, "scrim") < 0.34, "band fades in over several frames");
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
  console.log("\n✓ Browser motion: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
