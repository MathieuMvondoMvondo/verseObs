// Real-browser checks for the Studio régie (optional, like browser-motion.mjs):
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chrome \
//   node tests/browser-studio.mjs
// Layout, monitors and readability need a real layout engine: JSDOM has none.
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
  console.log("browser-studio: PLAYWRIGHT_CORE and CHROMIUM not set, skipped.");
  process.exit(0);
}
const { chromium } = await import(PW);
const PORT = Number(process.env.STUDIO_PORT || 18622);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
// One check alone while working (STUDIO_CHECK=regex); never in verify-parent.
const ONLY_CHECK = process.env.STUDIO_CHECK ? new RegExp(process.env.STUDIO_CHECK) : null;
async function check(name, fn) {
  if (ONLY_CHECK && !ONLY_CHECK.test(name)) return;
  await fn();
  passed++;
  console.log("  ✓ " + name);
}

const server = createServer(PORT);
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu"],
});

/** Studio and OBS output in one context (they talk over BroadcastChannel). */
async function open(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const errors = [];
  const output = await ctx.newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  output.on("pageerror", (e) => errors.push("output: " + e.message));
  await output.goto(`${BASE}/browser_source.html`);
  const studio = await ctx.newPage();
  studio.on("pageerror", (e) => errors.push("studio: " + e.message));
  await studio.goto(`${BASE}/control_panel.html`);
  await studio.waitForSelector(".chapter-verse");
  await studio.waitForFunction(() =>
    document.querySelector("#connection-dot").classList.contains("connected"),
  );
  return { ctx, studio, output, errors };
}
async function prepare(studio, reference) {
  await studio.fill("#search-input", reference);
  await studio.waitForFunction(
    (r) => document.querySelector("#preview-ref").textContent === r,
    reference,
  );
}
/** Geometry of a monitor, and of its frame's content mapped into the page. */
function monitor(studio, stageId) {
  return studio.evaluate((stageId) => {
    const stage = document.getElementById(stageId);
    const frame = stage.querySelector("iframe");
    const s = stage.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const scale = f.width / 1920;
    const doc = frame.contentDocument;
    const map = (sel) => {
      const el = doc.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: f.top + r.top * scale, bottom: f.top + r.bottom * scale };
    };
    const line = (() => {
      const text = doc.querySelector(".vo-copy .verse-text");
      if (!text) return null;
      const range = doc.createRange();
      range.selectNodeContents(text);
      const first = range.getClientRects()[0];
      return first ? { top: f.top + first.top * scale, bottom: f.top + first.bottom * scale } : null;
    })();
    const card = doc.querySelector(".verse-card");
    const cs = getComputedStyle(stage);
    return {
      rect: { left: s.left, right: s.right, top: s.top, bottom: s.bottom, width: s.width, height: s.height },
      visible: cs.visibility === "visible" && s.width > 0 && s.height > 0,
      innerHeight: frame.contentWindow.innerHeight,
      fit: card ? card.dataset.fit : null,
      ref: map(".vo-refblock"),
      firstLine: line,
    };
  }, stageId);
}
const outputFit = (output) =>
  output.evaluate(() => document.querySelector(".verse-card")?.dataset.fit || null);
const inside = (box, rect) =>
  box && box.top >= rect.top - 0.5 && box.bottom <= rect.bottom + 0.5;
/**
 * What the audience sees, measured in a 1920×1080 output (or monitor frame):
 * share of the frame covered by the band (from the top of its soft edge to the
 * frame edge), body size and number of lines of each text block.
 */
const ON_AIR = () => {
  const card = document.querySelector(".verse-card");
  if (!card) return null;
  const frame = innerHeight;
  const scrim = card.querySelector(".vo-scrim");
  const box = card.getBoundingClientRect();
  const visibleScrim = scrim && getComputedStyle(scrim).display !== "none";
  const s = visibleScrim ? scrim.getBoundingClientRect() : box;
  const lower = document.querySelector("#verse-container").classList.contains("lower-third");
  const band = lower ? frame - Math.max(0, s.top) : Math.min(frame, s.bottom);
  const texts = Array.from(card.querySelectorAll(".vo-copy .verse-text"));
  const lines = texts.map((t) => Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)));
  return {
    share: band / frame,
    body: Math.min(...texts.map((t) => parseFloat(getComputedStyle(t).fontSize))),
    lines,
    nums: card.querySelector(".vo-nums .vo-roll:not(.is-leaving)")?.textContent || "",
    partial: card.dataset.partial || "",
    top: box.top,
    bottom: box.bottom,
  };
};
const onAir = (page) => page.evaluate(ON_AIR);
/** Visible text smaller than 12 px (text hidden with font-size: 0 excepted). */
const SMALL_TEXT = () => {
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || !el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility !== "visible") continue;
    let o = el,
      shown = true;
    while (o && o !== document.body && shown) {
      const st = getComputedStyle(o);
      shown = st.display !== "none" && Number(st.opacity) > 0;
      o = o.parentElement;
    }
    const px = parseFloat(cs.fontSize);
    if (shown && px > 0 && px < 11.95)
      out.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]) + " " + px + "px");
  }
  return out;
};
const inFrame = async (studio, frameId) =>
  (await (await studio.$("#" + frameId)).contentFrame()).evaluate(ON_AIR);

/**
 * The régie as the operator sees it (review 2, brief §7): visible take and
 * Masquer buttons, monitors, bay, controls on the first screen and the type
 * histogram of the visible texts.
 */
const REGIE = (META) => {
  const shown = (e) => {
    if (!e || !e.getClientRects().length) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let o = e; o && o !== document.documentElement; o = o.parentElement) {
      const s = getComputedStyle(o);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  };
  const name = (e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim();
  const buttons = Array.from(document.querySelectorAll("button, [role=button]")).filter(shown);
  const pick = (re) => buttons.filter((b) => re.test(name(b))).map((b) => ({ id: b.id, text: name(b).slice(0, 60), fixed: !!b.closest(".take-bar, .take") && getComputedStyle(b.closest(".take-bar, .take")).position === "fixed", disabled: b.disabled, ...box(b) }));
  // On the first screen: inside the viewport and not clipped away by a
  // scrolling panel (a list scrolled past an item hides it).
  const onScreen = (e) => {
    const r = e.getBoundingClientRect();
    let top = Math.max(r.top, 0),
      bottom = Math.min(r.bottom, innerHeight),
      left = Math.max(r.left, 0),
      right = Math.min(r.right, innerWidth);
    for (let o = e.parentElement; o && o !== document.body; o = o.parentElement) {
      const s = getComputedStyle(o);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const c = o.getBoundingClientRect();
        top = Math.max(top, c.top);
        bottom = Math.min(bottom, c.bottom);
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
      }
      if (s.position === "fixed") break;
    }
    return bottom - top > 1 && right - left > 1;
  };
  const controls = Array.from(document.querySelectorAll("button, input, select, textarea, [role=button], a[href]")).filter((e) => shown(e) && onScreen(e));
  const hist = {};
  const meta = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || !el || seen.has(el) || !shown(el) || !onScreen(el)) continue;
    seen.add(el);
    const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2;
    if (!px) continue;
    hist[px] = (hist[px] || 0) + 1;
    if (px < 14) meta.push(el);
  }
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  const large = Object.entries(hist).reduce((n, [k, v]) => n + (Number(k) >= 14 ? v : 0), 0);
  const stage = (id) => {
    const e = document.getElementById(id);
    return e && shown(e) ? box(e) : null;
  };
  return {
    vh: innerHeight,
    clientWidth: document.documentElement.clientWidth,
    takes: pick(/^(Re)?[Dd]iffuser\b/),
    hides: pick(/^Masquer\b/),
    preview: stage("preview-stage"),
    program: stage("program-stage"),
    bay: box(document.getElementById("monitor-bay")),
    controls: controls.length,
    controlNames: controls.map((e) => e.id || name(e).slice(0, 24) || e.tagName),
    hist,
    sizes: Object.keys(hist).length,
    share14: total ? large / total : 0,
    // 12-13 px texts must be meta (brief §3): kbd, rail, counters, chips,
    // verse numbers, captions, tally labels, excerpts, what the take sends.
    smallNotMeta: meta
      .filter((e) => !e.closest(META))
      .map((e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0]) + " " + getComputedStyle(e).fontSize + " « " + e.textContent.trim().slice(0, 30) + " »")
      .slice(0, 40),
  };
};
const META = [
  "kbd", "sup", ".verse-num", ".cp-tab", ".sidebar-help", ".cp-version-indicator", ".bilingual-order",
  ".search-suggestions > span", ".translation-caption", "#chapter-count", ".cp-queue-counter", ".queue-position",
  ".cp-queue-num", ".cp-queue-part", ".session-meta label", "#session-saved", ".plan-open-hint", ".queue-tip",
  ".favorites-strip .muted", ".freetext-style-panel summary span", ".monitor-tag", ".cp-onair-tally",
  ".editor-badge", ".take-cue", ".take-reason", ".cp-queue-preview",
].join(", ");
/** A filled conductor (passage, verse, split plans, two translations, song). */
function regieConductor() {
  const LSG = require(path.join(ROOT, "data/bibles/lsg.json")).books;
  const book = (name) => Object.values(LSG).find((b) => b.name === name);
  const verses = (name, chapter, from, to) =>
    book(name).chapters.find((c) => c.chapter === chapter).verses.filter((v) => v.verse >= from && v.verse <= to);
  const item = (id, name, chapter, from, to, extra = {}) => {
    const vs = verses(name, chapter, from, to);
    return {
      id,
      type: "verse",
      text: vs.map((v) => v.text).join(" "),
      html: vs.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" "),
      reference: `${name} ${chapter}:${from}${to > from ? "-" + to : ""}`,
      version: "Louis Segond 1910",
      ...extra,
    };
  };
  const plans = [1, 5, 9, 13, 17, 21].map((from, i) =>
    item("ps119plan" + (i + 1), "Psaumes", 119, from, from + 3, { group: "ps119group", part: i + 1, parts: 6, whole: "Psaumes 119:1-24" }),
  );
  return [
    item("jean316item", "Jean", 3, 16, 16),
    item("psaume23item", "Psaumes", 23, 1, 6),
    ...plans,
    item("romains828it", "Romains", 8, 28, 30),
    { id: "chantentree1", type: "text", title: "Chant d’entrée", subtitle: "1 / 2", text: "Saint, saint, saint est le Seigneur" },
  ];
}
/**
 * Studio at the given size with a filled conductor, plan 1 of Psaumes 119 on
 * air and plan 2 selected; the Bible view prepares Psaumes 23:1-6.
 */
async function openRegie(width, height, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  if (opts.init) await ctx.addInitScript(opts.init);
  await ctx.addInitScript((q) => {
    if (location.pathname.endsWith("control_panel.html") && !sessionStorage.getItem("__seeded")) {
      localStorage.setItem("verseobs_queue", q);
      sessionStorage.setItem("__seeded", "1");
    }
  }, JSON.stringify({ items: regieConductor(), currentIndex: 2 }));
  const errors = [];
  const output = await ctx.newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  output.on("pageerror", (e) => errors.push("output: " + e.message));
  await output.goto(`${BASE}/browser_source.html`);
  const studio = await ctx.newPage();
  studio.on("pageerror", (e) => errors.push("studio: " + e.message));
  await studio.goto(`${BASE}/control_panel.html`);
  await studio.waitForSelector(".chapter-verse");
  await studio.waitForFunction(() => document.querySelector("#connection-dot").classList.contains("connected"));
  await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
  await studio.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[2].click());
  await studio.evaluate(() => document.querySelector("#btn-queue-show").click());
  await output.waitForFunction(() => !!document.querySelector(".verse-card"));
  await studio.waitForFunction(() => document.body.dataset.onair === "live", null, { timeout: 10000 });
  await studio.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[3].click());
  await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
  await prepare(studio, "Psaumes 23:1-6");
  return { ctx, studio, output, errors };
}
async function showView(studio, tab) {
  await studio.evaluate((t) => document.querySelector("#tab-btn-" + t).click(), tab);
  await studio.evaluate(() => scrollTo(0, 0));
  await studio.waitForTimeout(300);
}

// Sections can be run alone while working (STUDIO_ONLY=output,merge …);
// verify-parent.py and `npm run test:browser` always run all of them.
const ONLY = (process.env.STUDIO_ONLY || "").split(",").filter(Boolean);
const run = (name) => !ONLY.length || ONLY.includes(name);

/**
 * What the audience sees on a real output of any size (OBS source at 720p,
 * 1080p or 4K): the verses, the fit and the band, expressed in frame terms.
 */
const PROGRAM = () => {
  const card = document.querySelector(".verse-card:not(.vo-probe)");
  if (!card) return null;
  const frame = innerHeight;
  const box = card.getBoundingClientRect();
  // CSS px → screen px (the output may scale a logical frame).
  const scale = card.offsetHeight ? box.height / card.offsetHeight : 1;
  const scrim = card.querySelector(".vo-scrim");
  const visibleScrim = scrim && getComputedStyle(scrim).display !== "none";
  const s = visibleScrim ? scrim.getBoundingClientRect() : box;
  const lower = document.querySelector("#verse-container").classList.contains("lower-third");
  const band = lower ? frame - Math.max(0, s.top) : Math.min(frame, s.bottom);
  const texts = Array.from(card.querySelectorAll(".vo-copy .verse-text"));
  const body = Math.min(...texts.map((t) => parseFloat(getComputedStyle(t).fontSize)));
  const ref = card.querySelector(".vo-refblock");
  const r = ref ? ref.getBoundingClientRect() : null;
  return {
    size: innerWidth + "x" + innerHeight,
    share: +(band / frame).toFixed(3),
    // body size as it would be in a 1080-line frame
    body1080: +((body * scale * 1080) / frame).toFixed(1),
    lines: texts.map((t) => Math.round(t.offsetHeight / parseFloat(getComputedStyle(t).lineHeight))),
    nums: card.querySelector(".vo-nums .vo-roll:not(.is-leaving)")?.textContent || "",
    partial: card.dataset.partial || "",
    fit: card.dataset.fit || "",
    refInside: !r || (r.top >= -0.5 && r.bottom <= frame + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5),
    cardInside: box.left >= -0.5 && box.right <= innerWidth + 0.5 && box.top >= -0.5 && box.bottom <= frame + 0.5,
  };
};
/** Entrance or change finished: nothing leaving, text fully revealed. */
const SETTLED = (nums) => {
  const card = document.querySelector(".verse-card:not(.vo-probe)");
  if (!card || document.querySelector(".vo-probe")) return false;
  const roll = card.querySelector(".vo-nums .vo-roll:not(.is-leaving)");
  const copy = card.querySelector(".vo-copy");
  return (
    (!nums || (roll && roll.textContent === nums)) &&
    !card.querySelector(".is-leaving") &&
    !!copy &&
    !copy.classList.contains("is-revealing") &&
    getComputedStyle(copy).opacity === "1"
  );
};
/** Studio at 1920×1080 and OBS outputs of several sizes, in one context. */
async function openOutputs(sizes, storage) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (storage)
    await ctx.addInitScript((s) => {
      if (location.pathname.endsWith("control_panel.html") && !sessionStorage.getItem("__seeded")) {
        for (const k in s) localStorage.setItem(k, s[k]);
        sessionStorage.setItem("__seeded", "1");
      }
    }, storage);
  const errors = [];
  const outputs = [];
  for (const [w, h] of sizes) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    page.on("pageerror", (e) => errors.push(`output ${w}x${h}: ` + e.message));
    await page.goto(`${BASE}/browser_source.html`);
    outputs.push({ name: `${w}x${h}`, page });
  }
  const studio = await ctx.newPage();
  studio.on("pageerror", (e) => errors.push("studio: " + e.message));
  await studio.goto(`${BASE}/control_panel.html`);
  await studio.waitForSelector(".chapter-verse");
  await studio.waitForFunction(() =>
    document.querySelector("#connection-dot").classList.contains("connected"),
  );
  return { ctx, studio, outputs, errors };
}
const programFrame = async (studio) => (await studio.$("#program-frame")).contentFrame();
/**
 * Every output shows exactly what the 1080 program monitor shows: same
 * verses, same fit, nothing partial that the monitor shows whole, band ≤ 40 %.
 */
async function sameAsMonitor(studio, outputs, label, expectNums) {
  const monitorFrame = await programFrame(studio);
  await monitorFrame.waitForFunction(SETTLED, expectNums || null, { timeout: 15000 });
  const monitor = await monitorFrame.evaluate(PROGRAM);
  const seen = [];
  for (const o of outputs) {
    await o.page.waitForFunction(SETTLED, monitor.nums, { timeout: 15000 }).catch(() => {});
    const g = await o.page.evaluate(PROGRAM);
    seen.push(g);
    const where = `${label} at ${o.name}`;
    assert.ok(g, where + ": on air");
    assert.equal(g.nums, monitor.nums, where + ": verses " + g.nums + " vs monitor " + monitor.nums);
    assert.equal(g.fit, monitor.fit, where + ": fit " + g.fit + " vs monitor " + monitor.fit);
    assert.equal(g.partial, monitor.partial, where + ": partial " + g.partial + " vs monitor " + monitor.partial);
    assert.ok(g.share <= 0.4 + 0.005, where + ": band share " + g.share);
    assert.ok(g.body1080 >= 31.5, where + ": body " + g.body1080 + " px at 1080p");
    assert.ok(g.refInside && g.cardInside, where + ": reference and card inside the frame");
  }
  return { monitor, seen };
}

try {
  if (run("monitors")) {
  for (const width of [1280, 1920]) {
    const { ctx, studio, output, errors } = await open(width, width === 1280 ? 800 : 1080);
    await check(`Studio Mode at ${width} px: preview on the left, program on the right`, async () => {
      const p = await monitor(studio, "preview-stage");
      const g = await monitor(studio, "program-stage");
      assert.ok(p.visible && g.visible, "both monitors visible");
      assert.ok(p.rect.right <= g.rect.left + 0.5, "preview left of program");
      assert.ok(Math.abs(p.rect.top - g.rect.top) < 1, "same row");
      assert.ok(p.rect.width >= 360 && g.rect.width >= 360, "readable monitors");
      // Each monitor shows the whole 16:9 frame, never a crop.
      assert.ok(Math.abs(p.rect.width / p.rect.height - 16 / 9) < 0.02, "16:9 preview");
      assert.ok(Math.abs(g.rect.width / g.rect.height - 16 / 9) < 0.02, "16:9 program");
    });
    await prepare(studio, "Psaumes 23:1-6");
    await studio.click("#btn-show");
    await output.waitForFunction(() =>
      (document.querySelector(".verse-reference")?.textContent || "").includes("23"),
    );
    await studio.waitForTimeout(1800);
    await check(`At ${width} px the program monitor is faithful to the output`, async () => {
      const g = await monitor(studio, "program-stage");
      const p = await monitor(studio, "preview-stage");
      const real = await outputFit(output);
      assert.ok(real, "output on air");
      assert.equal(g.fit, real, "program monitor fit = output fit");
      assert.equal(p.fit, real, "preview fit = output fit for the same passage");
      assert.ok(inside(g.ref, g.rect), "reference fully inside the program monitor");
      assert.ok(inside(g.firstLine, g.rect), "first line inside the program monitor");
    });
    assert.deepEqual(errors, []);
    await ctx.close();
  }

  const narrow = await open(1000, 900);
  await check("Below 1280 px one monitor at a time, still at the output's fit", async () => {
    const { studio, output } = narrow;
    await prepare(studio, "Psaumes 23:1-6");
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector(".verse-card"));
    await studio.waitForTimeout(1800);
    let p = await monitor(studio, "preview-stage");
    let g = await monitor(studio, "program-stage");
    assert.ok(p.visible && !g.visible, "preview shown first");
    assert.equal(g.innerHeight, 1080, "hidden program frame keeps its 1080 px layout");
    assert.equal(g.fit, await outputFit(output));
    await studio.click("#monitor-program");
    await studio.waitForTimeout(200);
    p = await monitor(studio, "preview-stage");
    g = await monitor(studio, "program-stage");
    assert.ok(g.visible && !p.visible, "program shown on demand");
    assert.ok(inside(g.ref, g.rect) && inside(g.firstLine, g.rect));
  });
  assert.deepEqual(narrow.errors, []);
  await narrow.ctx.close();
  }

  // ---- Long passages: a subtitle-like band, a split proposed to the operator.
  if (run("long")) {
  const desk = await open(1920, 1080);
  const { studio, output } = desk;
  const BAND = 0.4,
    MIN_BODY = 31.5;
  await check("Psaumes 23 on air: band ≤ 40 % of the frame, body ≥ 32 px, ≤ 4 lines", async () => {
    await prepare(studio, "Psaumes 23:1-6");
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector(".verse-card"));
    await studio.waitForTimeout(1600);
    const g = await onAir(output);
    assert.ok(g.share <= BAND + 0.005, "band share " + g.share.toFixed(3));
    assert.ok(g.body >= MIN_BODY, "body " + g.body + " px");
    assert.ok(g.lines[0] <= 4, "lines " + g.lines);
    // Only whole verses go on air, and the reference says which ones.
    assert.match(g.nums, /^23:1-\d$/);
    assert.notEqual(g.nums, "23:1-6");
    assert.ok(g.partial, "the output knows it shows part of the passage");
  });
  await check("The régie says the output shows part of the passage and offers the split", async () => {
    await studio.waitForFunction(() => /partiel|seuls/i.test(document.querySelector("#onair-bar").textContent));
    const hint = await studio.evaluate(() => ({
      text: document.querySelector("#fit-hint").textContent,
      hidden: document.querySelector("#fit-hint").hidden,
      split: document.querySelector("#btn-split")?.textContent || "",
      splitHidden: document.querySelector("#btn-split")?.hidden,
    }));
    assert.equal(hint.hidden, false);
    assert.match(hint.split, /Découper en \d+ plans/);
    assert.equal(hint.splitHidden, false);
  });
  await check("Psaumes 119:1-48: one click splits it at verse boundaries in the conductor", async () => {
    await studio.evaluate(() => document.querySelector("#btn-clear-queue").click());
    await prepare(studio, "Psaumes 119:1-48");
    await studio.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
    const label = await studio.textContent("#btn-split");
    const n = Number(/(\d+) plans/.exec(label)[1]);
    assert.ok(n >= 6, n + " plans");
    await studio.click("#btn-split");
    await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length === n, n);
    const rows = await studio.evaluate(() =>
      Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label),
    );
    assert.equal(rows[0].replace(/-\d+$/, ""), "Psaumes 119:1");
    assert.match(rows[rows.length - 1], /-48$/);
    // Contiguous ranges, nothing lost or repeated.
    let next = 1;
    for (const r of rows) {
      const [, a, b] = /119:(\d+)(?:-(\d+))?$/.exec(r);
      assert.equal(Number(a), next);
      next = Number(b || a) + 1;
    }
    assert.equal(next, 49);
  });
  await check("Each plan fits the band at ≥ 32 px; Suivant walks through them", async () => {
    const total = await studio.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item").length);
    await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
    await studio.evaluate(() => document.querySelector("#queue-container .cp-queue-item").click());
    for (let i = 0; i < total; i++) {
      await studio.waitForTimeout(500);
      const g = await inFrame(studio, "preview-frame");
      assert.ok(g, "preview shows plan " + (i + 1));
      assert.ok(g.share <= BAND + 0.005, "plan " + (i + 1) + " share " + g.share.toFixed(3));
      assert.ok(g.body >= MIN_BODY, "plan " + (i + 1) + " body " + g.body);
      assert.ok(g.lines[0] <= 4, "plan " + (i + 1) + " lines " + g.lines);
      assert.equal(g.partial, "", "plan " + (i + 1) + " shown whole");
      if (i < total - 1) await studio.click("#btn-queue-next");
    }
  });
  await check("The split is reversible in one click (Regrouper)", async () => {
    await studio.click("#btn-merge");
    await studio.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length === 1);
    assert.equal(
      await studio.evaluate(() => document.querySelector("#queue-container .cp-queue-item").dataset.label),
      "Psaumes 119:1-48",
    );
  });
  await check("Two translations: each plan of Romains 8:28-39 fits the band at ≥ 32 px", async () => {
    await studio.evaluate(() => document.querySelector("#btn-clear-queue").click());
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    await studio.check("#bilingual-toggle");
    await studio.selectOption("#secondary-version", "kjv");
    await prepare(studio, "Romains 8:28-39");
    await studio.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
    await studio.click("#btn-split");
    await studio.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length > 1);
    const total = await studio.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item").length);
    await studio.evaluate(() => document.querySelector("#queue-container .cp-queue-item").click());
    for (let i = 0; i < total; i++) {
      await studio.waitForTimeout(500);
      const g = await inFrame(studio, "preview-frame");
      console.log("    plan " + (i + 1) + ": " + JSON.stringify({ share: +g.share.toFixed(3), body: g.body, lines: g.lines, nums: g.nums }));
      assert.equal(g.lines.length, 2, "two translations");
      assert.ok(g.share <= BAND + 0.005, "plan " + (i + 1) + " share " + g.share.toFixed(3));
      assert.ok(g.body >= MIN_BODY, "plan " + (i + 1) + " body " + g.body);
      assert.equal(g.partial, "");
      if (i < total - 1) await studio.click("#btn-queue-next");
    }
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    await studio.uncheck("#bilingual-toggle");
  });
  await check("A song keeps its centred card by default", async () => {
    await studio.evaluate(() => document.querySelector("#tab-btn-1").click());
    await studio.fill("#freetext-title", "Chant d’entrée");
    await studio.evaluate(() => {
      const e = document.querySelector("#freetext-editable");
      e.textContent = "Saint, saint, saint est le Seigneur";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await studio.click("#btn-free-show");
    await output.waitForFunction(() => (document.querySelector(".verse-title")?.textContent || "").includes("Chant"));
    const c = await output.evaluate(() => document.querySelector("#verse-container").className);
    assert.match(c, /\bcenter\b/);
    assert.match(c, /layout-carte/);
  });
  assert.deepEqual(desk.errors, []);
  await desk.ctx.close();
  }

  // ---- The OBS source may be 720p, 1080p or 4K: the output composes one
  // logical 1080-line frame, so every size shows what the monitors show.
  if (run("output")) {
  const SIZES = [[1280, 720], [1920, 1080], [3840, 2160]];
  const multi = await openOutputs(SIZES);
  let plans = [];
  await check("Psaumes 23 and Jean 3:16 on 720p, 1080p and 4K sources: same verses and fit as the 1080 monitor", async () => {
    const { studio, outputs } = multi;
    await prepare(studio, "Psaumes 23:1-6");
    await studio.click("#btn-show");
    const ps23 = await sameAsMonitor(studio, outputs, "Psaumes 23:1-6");
    console.log("    Ps 23: monitor " + JSON.stringify(ps23.monitor) + " | " + ps23.seen.map((g) => g.size + " " + g.nums + " fit " + g.fit + " share " + g.share).join(" | "));
    await prepare(studio, "Jean 3:16");
    await studio.click("#btn-show");
    await sameAsMonitor(studio, outputs, "Jean 3:16", "3:16");
  });
  await check("The 12 plans of Psaumes 119:1-48 pass whole on 720p, 1080p and 4K sources", async () => {
    const { studio, outputs } = multi;
    await studio.evaluate(() => document.querySelector("#btn-clear-queue").click());
    await prepare(studio, "Psaumes 119:1-48");
    await studio.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
    await studio.click("#btn-split");
    await studio.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length > 1);
    plans = await studio.evaluate(() =>
      Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label),
    );
    assert.ok(plans.length >= 6, plans.length + " plans");
    const partial = [];
    for (let i = 0; i < plans.length; i++) {
      await studio.evaluate((i) => document.querySelectorAll("#queue-container .cp-queue-item")[i].click(), i);
      await studio.click("#btn-queue-show");
      const nums = plans[i].replace(/^.*\s/, "");
      const { seen } = await sameAsMonitor(studio, outputs, plans[i], nums);
      seen.forEach((g) => g.partial && partial.push(g.size + " " + plans[i]));
    }
    assert.deepEqual(partial, [], "no plan shown in part");
  });
  await check("Two translations: plans of Romains 8:28-39 on 720p, 1080p and 4K sources match the monitor", async () => {
    const { studio, outputs } = multi;
    await studio.evaluate(() => document.querySelector("#btn-clear-queue").click());
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    await studio.check("#bilingual-toggle");
    await studio.selectOption("#secondary-version", "kjv");
    await prepare(studio, "Romains 8:28-39");
    await studio
      .waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""), null, { timeout: 15000 })
      .catch(async (e) => {
        const b = await studio.evaluate(() => {
          const b = document.querySelector("#btn-split");
          return { text: b.textContent, hidden: b.hidden, disabled: b.disabled, hint: document.querySelector("#fit-hint").textContent, ref: document.querySelector("#preview-ref").textContent };
        });
        throw new Error("split not offered: " + JSON.stringify(b) + " — " + e.message);
      });
    await studio.click("#btn-split");
    await studio.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length > 1);
    const rows = await studio.evaluate(() =>
      Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label),
    );
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      await studio.evaluate((i) => document.querySelectorAll("#queue-container .cp-queue-item")[i].click(), i);
      await studio.click("#btn-queue-show");
      const { seen } = await sameAsMonitor(studio, outputs, rows[i] + " LSG+KJV", rows[i].replace(/^.*\s/, ""));
      seen.forEach((g) => assert.equal(g.lines.length, 2, "two translations at " + g.size));
    }
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    await studio.uncheck("#bilingual-toggle");
  });
  assert.deepEqual(multi.errors, []);
  await multi.ctx.close();
  }

  // ---- « Regrouper » never invents a passage: deleted, moved and re-split
  // plans, after a reload and through a backup export / import.
  if (run("merge")) {
  const mg = await open(1920, 1080);
  const st = mg.studio;
  const ready = async () => {
    await st.waitForSelector(".chapter-verse");
    await st.waitForFunction(() => document.querySelector("#connection-dot").classList.contains("connected"));
  };
  const toTab = (i) => st.evaluate((i) => document.querySelector("#tab-btn-" + i).click(), i);
  const labels = () =>
    st.evaluate(() => Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label));
  const partsShown = () =>
    st.evaluate(() => Array.from(document.querySelectorAll("#queue-container .cp-queue-part")).map((p) => p.textContent));
  const stored = () => st.evaluate(() => JSON.parse(localStorage.getItem("verseobs_queue")));
  const verseNums = (html) => [...String(html).matchAll(/<sup class="verse-num">(\d+)<\/sup>/g)].map((x) => Number(x[1]));
  const seq = (n) => Array.from({ length: n }, (_, i) => i + 1).join(",");
  const restore = async (q) => {
    await st.evaluate((q) => localStorage.setItem("verseobs_queue", JSON.stringify(q)), q);
    await st.reload();
    await ready();
    await toTab(2);
  };
  const selectRow = (i) =>
    st.evaluate((i) => document.querySelectorAll("#queue-container .cp-queue-item")[i].click(), i);
  const toasts = () => st.evaluate(() => Array.from(document.querySelectorAll(".cp-toast")).map((t) => t.textContent).join(" | "));
  await prepare(st, "Psaumes 119:1-48");
  await st.waitForFunction(() => /Découper en 12 plans/.test(document.querySelector("#btn-split")?.textContent || ""));
  await st.click("#btn-split");
  await st.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length === 12);
  const Q1 = await stored();

  await check("Regrouper with a deleted plan refuses, names the plan and changes nothing", async () => {
    await st.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[1].querySelector(".cp-queue-del").click());
    await selectRow(0);
    const button = await st.textContent("#btn-merge");
    assert.match(button, /^Regrouper les 11 plans/, "the button counts the plans present: " + button);
    assert.doesNotMatch(button, /1-48/, "no passage claimed: " + button);
    await st.click("#btn-merge");
    await st.waitForTimeout(300);
    const rows = await labels();
    assert.equal(rows.length, 11, "conductor unchanged");
    assert.ok(!rows.includes("Psaumes 119:1-48"), "no invented passage");
    assert.match(await toasts(), /Il manque le plan 2\/12 \(119:5-8\)/);
  });
  await check("Plans moved by hand are regrouped in verse order", async () => {
    await restore(Q1);
    await st.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[2].querySelector('[title="Monter"]').click());
    assert.deepEqual((await labels()).slice(0, 3), ["Psaumes 119:1-4", "Psaumes 119:9-12", "Psaumes 119:5-8"]);
    await selectRow(0);
    assert.equal(await st.textContent("#btn-merge"), "Regrouper les 12 plans (Psaumes 119:1-48)");
    await st.click("#btn-merge");
    await st.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length === 1);
    const q = await stored();
    assert.equal(q.items[0].reference, "Psaumes 119:1-48");
    assert.equal(verseNums(q.items[0].html).join(","), seq(48), "every verse once, in order");
  });
  await check("A plan split again after a style change stays in its passage, survives a reload and a backup, and regroups whole", async () => {
    await restore(Q1);
    // Another text size (34 px instead of 44): the column narrows with the
    // type and plan 1 (119:1-4) no longer fits its band.
    await toTab(4);
    await st.evaluate(() => {
      const range = document.querySelector('#tab-settings [data-setting="fontSize"]');
      range.value = "34";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await toTab(2);
    await selectRow(0);
    await st.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
    const extra = Number(/(\d+) plans/.exec(await st.textContent("#btn-split"))[1]) - 1;
    await st.click("#btn-split");
    await st.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length === n, 12 + extra);
    const total = 12 + extra;
    const expectParts = Array.from({ length: total }, (_, i) => `plan ${i + 1}/${total}`);
    assert.deepEqual(await partsShown(), expectParts, "one passage, renumbered in reading order");
    const groups = new Set((await stored()).items.map((i) => i.group));
    assert.equal(groups.size, 1, "a single group");
    const before = await labels();
    await st.reload();
    await ready();
    await toTab(2);
    assert.deepEqual(await labels(), before, "same plans after a reload");
    assert.deepEqual(await partsShown(), expectParts, "same numbering after a reload");
    // Backup (Habillage › Sauvegarde): export, empty conductor, import.
    await toTab(4);
    const [download] = await Promise.all([
      st.waitForEvent("download"),
      st.evaluate(() => document.querySelector("#btn-export-data").click()),
    ]);
    const file = path.join(ROOT, "artifacts", "merge-backup.json");
    await download.saveAs(file);
    await st.evaluate(() => localStorage.setItem("verseobs_queue", JSON.stringify({ items: [], currentIndex: -1 })));
    await st.setInputFiles("#import-data-input", file);
    await st.waitForEvent("load", { timeout: 15000 });
    await ready();
    await toTab(2);
    assert.deepEqual(await labels(), before, "same plans after the backup import");
    assert.deepEqual(await partsShown(), expectParts, "same numbering after the backup import");
    await selectRow(0);
    assert.equal(await st.textContent("#btn-merge"), `Regrouper les ${total} plans (Psaumes 119:1-48)`);
    await st.click("#btn-merge");
    await st.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length === 1);
    const q = await stored();
    assert.equal(q.items[0].reference, "Psaumes 119:1-48");
    assert.equal(verseNums(q.items[0].html).join(","), seq(48));
  });
  assert.deepEqual(mg.errors, []);
  await mg.ctx.close();
  }

  // ---- Phone remote over the local network: what it claims for a passage
  // shown in part must be what the output really shows (same scenario as
  // review 2: the whole Psaumes 119:1-48 sent, 119:1-4 on air).
  if (run("phone")) {
  const LAN_PORT = PORT + 2;
  const lan = createServer(LAN_PORT, { lan: { addresses: ["127.0.0.1"], port: 0 } });
  await new Promise((r) => lan.listen(LAN_PORT, "127.0.0.1", r));
  try {
    const status = await lan.remote.enable();
    const LSG = require(path.join(ROOT, "data/bibles/lsg.json")).books;
    const ps = Object.values(LSG).find((b) => b.name === "Psaumes").chapters.find((c) => c.chapter === 119).verses.filter((v) => v.verse <= 48);
    const whole = {
      id: "wholePs119x",
      type: "verse",
      text: ps.map((v) => v.text).join(" "),
      html: ps.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" "),
      reference: "Psaumes 119:1-48",
      version: "Louis Segond 1910",
    };
    const jn = { id: "jean316xx", type: "verse", text: "Car Dieu a tant aimé le monde.", reference: "Jean 3:16", version: "Louis Segond 1910" };
    // Two plans of a split passage (« Découper ») after Jean 3:16.
    const plans = [1, 5].map((from, i) => {
      const vs = ps.filter((v) => v.verse >= from && v.verse < from + 4);
      return {
        id: "ps119plan" + (i + 1) + "x",
        type: "verse",
        text: vs.map((v) => v.text).join(" "),
        html: vs.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" "),
        reference: `Psaumes 119:${from}-${from + 3}`,
        version: "Louis Segond 1910",
        group: "ps119grpx",
        part: i + 1,
        parts: 2,
        whole: "Psaumes 119:1-8",
      };
    });
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.addInitScript((q) => {
      if (location.pathname.endsWith("control_panel.html") && !sessionStorage.getItem("__seeded")) {
        localStorage.setItem("verseobs_queue", q);
        sessionStorage.setItem("__seeded", "1");
      }
    }, JSON.stringify({ items: [whole, jn, ...plans], currentIndex: 0 }));
    const errors = [];
    const output = await ctx.newPage();
    output.on("pageerror", (e) => errors.push("output: " + e.message));
    await output.goto(`http://127.0.0.1:${LAN_PORT}/browser_source.html`);
    const studio = await ctx.newPage();
    studio.on("pageerror", (e) => errors.push("studio: " + e.message));
    await studio.goto(`http://127.0.0.1:${LAN_PORT}/control_panel.html`);
    await studio.waitForSelector(".chapter-verse");
    await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await phoneCtx.newPage();
    phone.on("pageerror", (e) => errors.push("phone: " + e.message));
    await phone.goto(status.url);
    await phone.waitForFunction(() => !document.querySelector("[data-command=show]").disabled, null, { timeout: 20000 });
    const line = () =>
      phone.evaluate(() => ({
        state: document.querySelector("#output").dataset.state,
        // label · ref, the « · » being drawn by CSS before a non-empty ref
        text: [document.querySelector("#output-label").textContent, document.querySelector("#output-ref").textContent]
          .filter(Boolean)
          .join(getComputedStyle(document.querySelector("#output-ref"), "::before").content === '"· "' ? " · " : " "),
        live: document.querySelector("#current-live").hidden ? "" : document.querySelector("#current-live").textContent,
        color: getComputedStyle(document.querySelector("#output-label")).color,
      }));
    await check("Phone over the local network: a passage shown in part says « Partiel · 119:1-4 (demandé 1-48) » in amber", async () => {
      await phone.click("[data-command=show]");
      await output.waitForFunction(() => document.querySelector(".verse-card")?.dataset.partial === "119:1-48");
      const shown = await output.evaluate(() => document.querySelector(".vo-nums .vo-roll:not(.is-leaving)").textContent);
      await phone.waitForFunction(() => document.querySelector("#output").dataset.state !== "pending", null, { timeout: 10000 });
      await phone.waitForTimeout(400);
      const l = await line();
      console.log("    phone: " + JSON.stringify(l) + " · output shows " + shown);
      assert.equal(l.state, "partial", "partial state on the phone");
      assert.equal(l.text, `Partiel · ${shown} (demandé 1-48)`);
      assert.doesNotMatch(l.text, /Sortie confirmée/);
      assert.notEqual(l.live, "À l’antenne", "the item is not claimed whole on air");
      // amber (#ecc98f family), not the red/white of a confirmed output
      const [r, g, b] = l.color.match(/\d+/g).map(Number);
      assert.ok(r > 200 && g > 160 && b < 170 && r - b > 60, "amber label: " + l.color);
      await phone.screenshot({ path: path.join(ROOT, "artifacts", "phone-partial-390.png") });
    });
    await check("Phone: a passage shown whole is confirmed again, without « Partiel »", async () => {
      await phone.click("[data-command=next]");
      await phone.waitForFunction(() => document.querySelector("#current-ref").textContent === "Jean 3:16");
      await phone.click("[data-command=show]");
      await phone.waitForFunction(() => document.querySelector("#output").dataset.state === "confirmed", null, { timeout: 10000 });
      const l = await line();
      assert.equal(l.text, "Sortie confirmée · Jean 3:16");
      assert.equal(l.live, "À l’antenne");
    });
    await check("Phone: 56 px status band, session on one 14 px line, « plan n/N », the four commands fixed in the bottom 260 px (Masquer 16 px under Diffuser)", async () => {
      await phone.click("[data-command=next]");
      await phone.waitForFunction(() => document.querySelector("#current-ref").textContent === "Psaumes 119:1-4");
      await phone.click("[data-command=show]");
      // Confirmed for this plan (the previous check left Jean 3:16 confirmed).
      await phone.waitForFunction(
        () => document.querySelector("#output").dataset.state === "confirmed" && document.querySelector("#output-ref").textContent === "Psaumes 119:1-4",
        null,
        { timeout: 10000 },
      );
      await phone.waitForTimeout(400);
      const g = await phone.evaluate(() => {
        const box = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        };
        const fixed = (s) => {
          for (let o = document.querySelector(s); o; o = o.parentElement) if (getComputedStyle(o).position === "fixed") return true;
          return false;
        };
        const plan = document.querySelector("#current-plan");
        return {
          vh: innerHeight,
          vw: document.documentElement.clientWidth,
          prev: box("[data-command=prev]"),
          next: box("[data-command=next]"),
          show: box("[data-command=show]"),
          hide: box("[data-command=hide]"),
          band: box("#output"),
          fixed: ["prev", "next", "show", "hide"].every((c) => fixed("[data-command=" + c + "]")),
          plan: plan && !plan.hidden ? plan.textContent : "",
          live: document.querySelector("#current-live").hidden ? "" : document.querySelector("#current-live").textContent,
          session: { size: getComputedStyle(document.querySelector("#session-name")).fontSize, height: box("#session-name").height },
          tag: document.querySelector("#output").textContent.replace(/\s+/g, " ").trim(),
        };
      });
      console.log("    phone: " + JSON.stringify({ band: g.band.height, show: [g.show.width, g.show.height], hide: [g.hide.width, g.hide.height, g.hide.top - g.show.bottom], nav: [g.prev.width, g.prev.height], zone: g.vh - g.prev.top, plan: g.plan, tag: g.tag }));
      assert.ok(g.band.top <= 0.5 && g.band.height <= 56.5, "status band " + JSON.stringify(g.band));
      assert.match(g.tag, /^Antenne/i, "the band names the program");
      assert.equal(g.session.size, "14px");
      assert.ok(g.session.height <= 21, "session on one line: " + g.session.height);
      assert.equal(g.plan, "plan 1/2");
      assert.equal(g.live, "À l’antenne");
      assert.ok(g.fixed, "commands fixed in the thumb zone");
      assert.ok(g.prev.top >= g.vh - 260 && g.hide.bottom <= g.vh, "the four commands within the bottom 260 px: " + (g.vh - g.prev.top));
      assert.ok(g.hide.top - g.show.bottom <= 16.5 && g.hide.top > g.show.bottom, "Masquer right under Diffuser: " + (g.hide.top - g.show.bottom) + " px");
      assert.ok(Math.abs(g.show.width - (g.vw - 32)) <= 1 && g.show.height >= 88, "Diffuser " + g.show.width + "×" + g.show.height);
      assert.ok(Math.abs(g.hide.width - (g.vw - 32)) <= 1 && g.hide.height >= 56, "Masquer " + g.hide.width + "×" + g.hide.height);
      for (const b of [g.prev, g.next]) assert.ok(b.width >= 170 && b.height >= 64, "Préc./Suiv. " + b.width + "×" + b.height);
      await phone.screenshot({ path: path.join(ROOT, "artifacts", "phone-thumb-390.png") });
    });
    assert.deepEqual(errors, []);
    await phoneCtx.close();
    await ctx.close();
  } finally {
    await lan.remote.disable();
    lan.close();
  }
  }

  // ---- Two outputs at once (OBS program + projector): the Studio's tally
  // follows the program, deterministically, whatever the projector reports.
  if (run("tally")) {
  const tc = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const terrors = [];
  const obs = await tc.newPage();
  obs.on("pageerror", (e) => terrors.push("obs: " + e.message));
  await obs.goto(`${BASE}/browser_source.html`);
  const projector = await tc.newPage();
  await projector.setViewportSize({ width: 1280, height: 720 });
  projector.on("pageerror", (e) => terrors.push("projector: " + e.message));
  await projector.goto(`${BASE}/browser_source.html?projector=1`);
  const ts = await tc.newPage();
  ts.on("pageerror", (e) => terrors.push("studio: " + e.message));
  await ts.goto(`${BASE}/control_panel.html`);
  await ts.waitForSelector(".chapter-verse");
  await ts.waitForFunction(() => document.querySelector("#connection-dot").classList.contains("connected"));
  await check("OBS output and projector together: the tally follows the program over 4 pings, never flips", async () => {
    await prepare(ts, "Psaumes 23:1-6");
    await ts.click("#btn-show");
    await obs.waitForFunction(() => document.querySelector(".verse-card")?.dataset.partial === "23:1-6");
    await projector.waitForFunction(() => !!document.querySelector(".verse-card"));
    const program = await obs.evaluate(() => document.querySelector(".vo-nums .vo-roll:not(.is-leaving)").textContent);
    const shownOnProjector = await projector.evaluate(() => (document.querySelector(".verse-card").dataset.partial ? document.querySelector(".vo-nums .vo-roll:not(.is-leaving)").textContent : "whole"));
    // Record every change of the program strip for 4 pings (3 s apart).
    await ts.evaluate(() => {
      window.__tally = [];
      const read = () => document.querySelector("#onair-bar .cp-onair-label").textContent + " | " + document.querySelector("#onair-ref").textContent;
      let last = read();
      window.__tally.push({ t: 0, v: last });
      const t0 = performance.now();
      new MutationObserver(() => {
        const v = read();
        if (v !== last) window.__tally.push({ t: Math.round(performance.now() - t0), v: (last = v) });
      }).observe(document.querySelector("#onair-bar"), { subtree: true, childList: true, characterData: true });
    });
    await ts.waitForTimeout(12500);
    const timeline = await ts.evaluate(() => window.__tally);
    console.log("    program " + program + ", projector " + shownOnProjector + "; Studio timeline: " + JSON.stringify(timeline));
    assert.equal(timeline.length, 1, "the program strip never changed: " + JSON.stringify(timeline));
    assert.equal(timeline[0].v, "Sortie partielle · demandé 23:1-6 | Psaumes " + program);
  });
  await check("With the projector alone, its report still confirms the broadcast", async () => {
    await obs.close();
    await prepare(ts, "Jean 3:16");
    await ts.click("#btn-show");
    await ts.waitForFunction(
      () => document.querySelector("#onair-bar .cp-onair-label").textContent === "Sortie confirmée" &&
        document.querySelector("#onair-ref").textContent === "Jean 3:16",
      null,
      { timeout: 12000 },
    );
  });
  assert.deepEqual(terrors, []);
  await tc.close();
  }

  // ---- « Découper » applies only a measurement of the selected item, as it
  // is now (race between a selection change and the preview's report).
  if (run("race")) {
  const LSGr = require(path.join(ROOT, "data/bibles/lsg.json")).books;
  const ps119 = Object.values(LSGr).find((b) => b.name === "Psaumes").chapters.find((c) => c.chapter === 119).verses;
  const wholeOf = (id, end) => {
    const vs = ps119.filter((v) => v.verse <= end);
    return {
      id,
      type: "verse",
      text: vs.map((v) => v.text).join(" "),
      html: vs.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" "),
      reference: "Psaumes 119:1-" + end,
      version: "Louis Segond 1910",
    };
  };
  const seeded = JSON.stringify({ items: [wholeOf("raceA11948", 48), wholeOf("raceB11960", 60)], currentIndex: 0 });
  const rc = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await rc.addInitScript((q) => {
    if (location.pathname.endsWith("control_panel.html") && !sessionStorage.getItem("__seeded")) {
      localStorage.setItem("verseobs_queue", q);
      sessionStorage.setItem("__seeded", "1");
    }
  }, seeded);
  const rerrors = [];
  const rs = await rc.newPage();
  rs.on("pageerror", (e) => rerrors.push("studio: " + e.message));
  await rs.goto(`${BASE}/control_panel.html`);
  await rs.waitForSelector(".chapter-verse");
  await rs.evaluate(() => document.querySelector("#tab-btn-2").click());
  const splitReady = (n) =>
    rs.waitForFunction(
      (n) => {
        const b = document.querySelector("#btn-split");
        return !b.hidden && !b.disabled && b.textContent === "Découper en " + n + " plans";
      },
      n,
      { timeout: 20000 },
    );
  const versesByItem = () =>
    rs.evaluate(() =>
      JSON.parse(localStorage.getItem("verseobs_queue")).items.map((i) => ({
        ref: i.reference,
        nums: [...i.html.matchAll(/<sup class="verse-num">(\d+)<\/sup>/g)].map((m) => Number(m[1])),
      })),
    );
  await check("Découper right after a selection change never applies the previous item's plans", async () => {
    await rs.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[0].click());
    await splitReady(12);
    // The operator selects 119:1-60 and clicks « Découper » at once, in the
    // same instant (before any new report can arrive).
    const seen = await rs.evaluate(() => {
      document.querySelectorAll("#queue-container .cp-queue-item")[1].click();
      const b = document.querySelector("#btn-split");
      const state = { hidden: b.hidden, disabled: b.disabled, text: b.textContent };
      if (!b.hidden && !b.disabled) b.click();
      return state;
    });
    await rs.waitForTimeout(600);
    const items = await versesByItem();
    const all = items.flatMap((i) => i.nums);
    console.log("    at the click: " + JSON.stringify(seen) + "; conductor: " + items.map((i) => i.ref).join(", "));
    assert.ok(seen.hidden || seen.disabled, "the stale button is not usable: " + JSON.stringify(seen));
    assert.equal(items.length, 2, "nothing split on a stale measurement");
    assert.equal(all.filter((n) => n > 48).length, 12, "verses 49-60 still in the conductor");
  });
  await check("A forced click on a stale measurement is refused; the fresh one splits 119:1-60 whole", async () => {
    await rs.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[0].click());
    await splitReady(12);
    await rs.evaluate(() => {
      document.querySelectorAll("#queue-container .cp-queue-item")[1].click();
      document.querySelector("#btn-split").click(); // even hidden or disabled
    });
    await rs.waitForTimeout(300);
    assert.equal((await versesByItem()).length, 2, "refused while the report is stale");
    await rs.waitForFunction(() => {
      const b = document.querySelector("#btn-split");
      return !b.hidden && !b.disabled && /Découper en \d+ plans/.test(b.textContent) && b.textContent !== "Découper en 12 plans";
    }, null, { timeout: 20000 });
    await rs.click("#btn-split");
    await rs.waitForFunction(() => document.querySelectorAll("#queue-container .cp-queue-item").length > 2);
    const items = await versesByItem();
    const fromB = items.slice(1).flatMap((i) => i.nums);
    assert.equal(fromB.join(","), Array.from({ length: 60 }, (_, i) => i + 1).join(","), "every verse of 119:1-60, once, in order");
  });
  assert.deepEqual(rerrors, []);
  await rc.close();
  }

  // ---- Measuring the plans of a whole chapter never freezes the régie:
  // Échap and Masquer stay immediate while the preview measures.
  if (run("measure")) {
  const mc = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await mc.addInitScript(() => {
    if (!location.pathname.endsWith("control_panel.html")) return;
    window.__long = [];
    window.__lat = [];
    window.__fits = [];
    try {
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => window.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })),
      ).observe({ type: "longtask", buffered: true });
    } catch (e) {}
    // How long each input waited for the Studio's main thread: from the
    // moment the browser received it (event.timeStamp) to its handler.
    const lag = (name) => (e) => {
      // Masquer: the take's (régie) or the program head's (narrow dock).
      if (name === "Escape" ? e.key === "Escape" : e.target.closest && e.target.closest("#btn-hide, #onair-hide"))
        window.__lat.push({ name, t: e.timeStamp, wait: Math.round(performance.now() - e.timeStamp), at: Date.now() });
    };
    addEventListener("keydown", lag("Escape"), true);
    addEventListener("pointerdown", lag("Masquer"), true);
    // The preview's reports: when it starts measuring, when it offers plans.
    addEventListener("message", (e) => {
      if (e.data && e.data.type === "verseobs:fit")
        window.__fits.push({ t: performance.now(), measuring: !!e.data.measuring, pages: (e.data.pages || []).length });
    });
  });
  const merrors = [];
  const mo = await mc.newPage();
  mo.on("pageerror", (e) => merrors.push("output: " + e.message));
  await mo.goto(`${BASE}/browser_source.html`);
  const ms = await mc.newPage();
  ms.on("pageerror", (e) => merrors.push("studio: " + e.message));
  await ms.goto(`${BASE}/control_panel.html`);
  await ms.waitForSelector(".chapter-verse");
  await ms.waitForFunction(() => document.querySelector("#connection-dot").classList.contains("connected"));
  // Robustness check by hand: STUDIO_CPU_SLOWDOWN=3 runs the Studio (and its
  // preview) on a CPU three times slower.
  const slowdown = Number(process.env.STUDIO_CPU_SLOWDOWN || 1);
  if (slowdown > 1) await (await mc.newCDPSession(ms)).send("Emulation.setCPUThrottlingRate", { rate: slowdown });
  /**
   * Psaumes 119:1-176 prepared while Jean 3:16 is on air; the operator
   * presses Échap and clicks Masquer all along until the plans are offered.
   * Returns the waits of the inputs sent during the measurement and the
   * number of tasks (slices) the measurement took.
   */
  async function operateWhileMeasuring(attempt) {
    await prepare(ms, "Jean 3:16");
    await ms.click("#btn-show");
    await mo.waitForFunction(() => !!document.querySelector(".verse-card"));
    const box = await ms.evaluate(() => {
      window.__long = [];
      window.__lat = [];
      window.__fits = [];
      // Time every timer task of the preview (the measurement's slices).
      const fw = document.querySelector("#preview-frame").contentWindow;
      if (!fw.__slices) {
        const later = fw.setTimeout;
        fw.setTimeout = function (fn, ms) {
          return later.call(fw, function () {
            const t = performance.now();
            try {
              fn();
            } finally {
              fw.__slices.push({ t: performance.timeOrigin + t, d: performance.now() - t });
            }
          }, ms);
        };
      }
      fw.__slices = [];
      // The Masquer the operator sees (one per view).
      const r = Array.from(document.querySelectorAll("#btn-hide, #onair-hide"))
        .map((e) => e.getBoundingClientRect())
        .find((b) => b.width > 0 && b.height > 0);
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const t0 = await ms.evaluate(() => performance.now());
    // No page.evaluate from here until the inputs are sent: it would wait for
    // a busy main thread itself and hide the delay the operator would feel.
    await ms.fill("#search-input", "Psaumes 119:1-176");
    const sent = [];
    const ready = () =>
      ms.evaluate(() => {
        const b = document.querySelector("#btn-split");
        return !b.hidden && !b.disabled && /Découper en \d+ plans/.test(b.textContent);
      });
    // Inputs all along, until the plans are offered (whatever the speed).
    for (const deadline = Date.now() + 60000; Date.now() < deadline; ) {
      sent.push(Date.now());
      await ms.keyboard.press("Escape");
      await ms.waitForTimeout(50);
      sent.push(Date.now());
      await ms.mouse.click(box.x, box.y);
      await ms.waitForTimeout(50);
      if (sent.length >= 12 && (await ready())) break;
    }
    assert.ok(await ready(), "plans offered");
    const label = await ms.textContent("#btn-split");
    const seen = await ms.evaluate(() => ({
      origin: performance.timeOrigin,
      lat: window.__lat,
      fits: window.__fits,
      long: window.__long,
      slices: document.querySelector("#preview-frame").contentWindow.__slices,
    }));
    // The measurement: from the preview's « measuring » report to its plans.
    const start = seen.fits.find((f) => f.t >= t0 && f.measuring);
    const end = start && seen.fits.find((f) => f.t >= start.t && f.pages > 0);
    assert.ok(start && end, "the preview reported its measurement: " + JSON.stringify(seen.fits));
    const during = seen.lat.filter((x) => x.t >= start.t && x.t <= end.t);
    const before = seen.lat.filter((x) => x.t < start.t);
    const worst = (list) => Math.max(0, ...list.map((x) => x.wait));
    // Timer tasks of the preview during the measurement (same clock).
    const slices = seen.slices
      .map((x) => ({ t: x.t - seen.origin, d: x.d }))
      .filter((x) => x.t >= start.t - 1 && x.t <= end.t);
    const slowest = Math.max(0, ...slices.map((x) => x.d));
    const long = seen.long.filter((x) => x.t >= t0 - 1);
    console.log(
      "    attempt " + attempt + ": " + label + " after " + Math.round(end.t - t0) + " ms (measured in " +
        Math.round(end.t - start.t) + " ms, " + slices.length + " slices, slowest " + slowest.toFixed(1) + " ms" +
        (slowdown > 1 ? ", CPU ×" + slowdown : "") + "); long tasks [start, duration] " +
        JSON.stringify(long.map((x) => [Math.round(x.t - t0), x.d])),
    );
    console.log(
      "    inputs during the measurement: " + during.length + ", worst wait " + worst(during) + " ms " +
        JSON.stringify(during.map((x) => x.wait)) + "; before it (the Studio's rendering of 176 verses, the preview's first render): " +
        before.length + ", worst " + worst(before) + " ms",
    );
    assert.equal(seen.lat.length, sent.length, "every input handled");
    // The last Masquer leaves with its short exit, then nothing is on air.
    await mo.waitForFunction(() => !document.querySelector(".verse-card"), null, { timeout: 5000 });
    return { worst: worst(during), inputs: during.length, slices: slices.length };
  }
  await check("While the plans of Psaumes 119:1-176 are measured, Échap and Masquer are handled within 150 ms", async () => {
    // A pause of the VPS itself (swap, another process) can hold an input
    // whatever the Studio does (seen: 130 ms once, in an idle run), so a
    // second measurement may confirm the first. A measurement that holds the
    // régie fails both.
    let r = { worst: Infinity };
    for (let attempt = 1; attempt <= 2 && r.worst > 150; attempt++) r = await operateWhileMeasuring(attempt);
    assert.ok(r.worst <= 150, "an input waited " + r.worst + " ms during the measurement, in both attempts");
    assert.ok(r.inputs >= 3, "inputs sent during the measurement: " + r.inputs);
    assert.ok(r.slices >= 5, "measured in slices: " + r.slices);
  });
  assert.deepEqual(merrors, []);
  await mc.close();
  }

  // ---- A style change is reported at once: the program strip follows the
  // output's new fit, not the next ping (every 3 s).
  if (run("style")) {
  const sc = await open(1920, 1080);
  /**
   * Just after a ping (the next one is 3 s away), the operator changes the
   * position: when does the output send its next report, and when does the
   * Studio's program strip change?
   */
  async function restyle(position) {
    const r = await sc.studio.evaluate(
      (position) =>
        new Promise((resolve) => {
          const strip = () =>
            document.querySelector("#onair-bar .cp-onair-label").textContent + " | " + document.querySelector("#onair-ref").textContent;
          const bus = new BroadcastChannel("verseobs");
          bus.onmessage = (e) => {
            if (e.data.type !== "ping" || bus.waiting) return;
            bus.waiting = true;
            bus.close();
            // Once the output has answered this ping, change the position.
            setTimeout(() => {
              const before = strip();
              let ms = null;
              const obs = new MutationObserver(() => {
                if (ms === null && strip() !== before) ms = Math.round(performance.now() - t);
              });
              obs.observe(document.querySelector("#onair-bar"), { subtree: true, childList: true, characterData: true });
              const select = document.querySelector('#tab-settings [data-setting="position"]');
              const at = Date.now(),
                t = performance.now();
              select.value = position;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              // Well before the next ping.
              setTimeout(() => {
                obs.disconnect();
                resolve({ at, before, after: strip(), ms });
              }, 2000);
            }, 150);
          };
        }),
      position,
    );
    // The output's reports, as it sends them (same wall clock).
    const sent = await sc.output.evaluate(() => window.__reports);
    const first = sent.find((x) => x >= r.at);
    return { before: r.before, after: r.after, report: first === undefined ? null : first - r.at, strip: r.ms };
  }
  await check("A style change is reported within 300 ms and the program strip follows it (lower third ⇄ centre)", async () => {
    const { studio, output } = sc;
    await output.evaluate(() => {
      window.__reports = [];
      const post = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (m) {
        if (m && m.type === "output_state") window.__reports.push(Date.now());
        return post.call(this, m);
      };
    });
    await prepare(studio, "Psaumes 23:1-6");
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector(".verse-card")?.dataset.partial === "23:1-6");
    await studio.waitForFunction(() => /Sortie partielle/.test(document.querySelector("#onair-bar .cp-onair-label").textContent));
    await studio.evaluate(() => document.querySelector("#tab-btn-4").click());
    // A pause of the VPS can delay one report or the Studio itself (seen:
    // 310 ms once): the cycle is then measured again. Without a report on a
    // style change, the strip waits for the next ping and fails at once.
    const cycle = async (attempt) => {
      const slow = [];
      for (const [position, strip, partial] of [
        ["center", "Sortie confirmée | Psaumes 23:1-6", ""],
        ["lower-third", "Sortie partielle · demandé 23:1-6 | Psaumes 23:1-3", "23:1-6"],
      ]) {
        const r = await restyle(position);
        console.log("    attempt " + attempt + " → " + position + ": " + JSON.stringify(r));
        assert.ok(r.strip !== null, position + ": the program strip still says « " + r.after + " » before the next ping");
        assert.equal(r.after, strip);
        assert.equal(await output.evaluate(() => document.querySelector(".verse-card").dataset.partial || ""), partial);
        if (!(r.report !== null && r.report < 300 && r.strip < 1000))
          slow.push(position + ": report after " + r.report + " ms, strip after " + r.strip + " ms");
      }
      return slow;
    };
    let slow = await cycle(1);
    if (slow.length) slow = await cycle(2);
    assert.deepEqual(slow, [], "too slow in both attempts");
  });
  assert.deepEqual(sc.errors, []);
  await sc.ctx.close();
  }

  // ---- The type floor holds in a filled conductor: passages, plans, two
  // translations, a song, and the verse numbers of the selection.
  if (run("garni")) {
  const full = await open(1920, 1080);
  const { studio } = full;
  const labels = () =>
    studio.evaluate(() => Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label));
  /** Split the prepared passage from the Bible: its plans join the conductor. */
  const bible = () => studio.evaluate(() => document.querySelector("#tab-btn-0").click());
  const splitInto = async (reference) => {
    const n = (await labels()).length;
    await bible();
    await prepare(studio, reference);
    await studio.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
    await studio.click("#btn-split");
    await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length > n + 1, n);
  };
  await check("In a filled conductor, no visible text under 12 px (selection's verse numbers included) and no overflow at 1920, 1280 and 390 px", async () => {
    for (const reference of ["Jean 3:16", "Psaumes 23:1-6"]) {
      const n = (await labels()).length;
      await bible();
      await prepare(studio, reference);
      await studio.click("#btn-add-queue");
      await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length > n, n);
    }
    await splitInto("Psaumes 119:1-24");
    await bible();
    await studio.check("#bilingual-toggle");
    await studio.selectOption("#secondary-version", "kjv");
    await splitInto("Romains 8:28-39");
    await bible();
    await studio.uncheck("#bilingual-toggle");
    await studio.evaluate(() => document.querySelector("#tab-btn-1").click());
    await studio.fill("#freetext-title", "Chant d’entrée");
    await studio.evaluate(() => {
      const e = document.querySelector("#freetext-editable");
      e.textContent = "Saint, saint, saint est le Seigneur";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const n = (await labels()).length;
    await studio.click("#btn-free-add-queue");
    await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length > n, n);
    const rows = await labels();
    console.log("    conductor: " + rows.length + " items · " + rows.slice(0, 4).join(" · ") + " · …");
    // A passage, a plan (« Regrouper ») and a plan in two translations.
    const picks = [/^Psaumes 23:1-6$/, /^Psaumes 119:1-/, /^Romains 8:28/].map((re) => rows.findIndex((l) => re.test(l)));
    assert.ok(picks.every((i) => i >= 0), "items found: " + picks);
    const small = [];
    for (const [w, h] of [[1920, 1080], [1280, 800], [390, 844]]) {
      await studio.setViewportSize({ width: w, height: h });
      for (const i of picks) {
        await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
        await studio.evaluate((i) => document.querySelectorAll("#queue-container .cp-queue-item")[i].click(), i);
        for (const tab of [2, 0]) {
          await studio.evaluate((t) => document.querySelector("#tab-btn-" + t).click(), tab);
          await studio.waitForTimeout(250);
          if (tab === 2)
            assert.ok(await studio.evaluate(() => !!document.querySelector("#queue-selection-text sup")), "verse numbers in the selection");
          (await studio.evaluate(SMALL_TEXT)).forEach((s) => small.push(w + " px, tab " + tab + ", " + rows[i] + ": " + s));
          const overflow = await studio.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          assert.ok(overflow <= 0, w + " px, tab " + tab + ", " + rows[i] + ": overflows by " + overflow + " px");
        }
      }
    }
    assert.deepEqual([...new Set(small)], []);
  });
  assert.deepEqual(full.errors, []);
  await full.ctx.close();
  }

  // ---- Régie readability: type floor, keyboard focus, phone targets.
  if (run("regie")) {
  for (const [w, h] of [[1920, 1080], [1280, 800], [390, 844]]) {
    const view = await open(w, h);
    await check(`At ${w} px no visible text under 12 px and no overflow in Bible, Conducteur and Habillage`, async () => {
      for (const tab of [0, 2, 4]) {
        await view.studio.evaluate((t) => document.querySelector("#tab-btn-" + t).click(), tab);
        await view.studio.waitForTimeout(250);
        const small = await view.studio.evaluate(SMALL_TEXT);
        assert.deepEqual(small, [], "tab " + tab + ": " + small.slice(0, 12).join(", "));
        // Larger type must not push anything past the edge of a narrow dock.
        const overflow = await view.studio.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, "tab " + tab + " overflows by " + overflow + " px");
      }
    });
    await view.ctx.close();
  }
  const keys = await open(1920, 1080);
  await check("Keyboard focus is always visible in the régie", async () => {
    await keys.studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    await keys.studio.focus("#search-input");
    for (let i = 0; i < 8; i++) {
      await keys.studio.keyboard.press("Tab");
      const ring = await keys.studio.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        return {
          el: el.id || el.className || el.tagName,
          outline: cs.outlineStyle !== "none" ? parseFloat(cs.outlineWidth) : 0,
          shadow: cs.boxShadow !== "none",
        };
      });
      assert.ok(ring.outline >= 2 || ring.shadow, "focus ring on " + ring.el);
    }
  });
  await keys.ctx.close();
  const lanServer = createServer(PORT + 1, { lan: { addresses: ["127.0.0.1"], port: 0 } });
  await new Promise((r) => lanServer.listen(PORT + 1, "127.0.0.1", r));
  try {
    const status = await lanServer.remote.enable();
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await phoneCtx.newPage();
    await phone.goto(status.url);
    await phone.waitForSelector("#btn-show");
    await check("Phone remote: every touch target is at least 44 px, no text under 12 px", async () => {
      const targets = await phone.evaluate(() =>
        Array.from(document.querySelectorAll("button, a[href], [role=button]"))
          .filter((b) => b.getClientRects().length && getComputedStyle(b).visibility === "visible")
          .map((b) => {
            const r = b.getBoundingClientRect();
            return { id: b.id || b.className, w: r.width, h: r.height };
          }),
      );
      assert.ok(targets.length >= 4);
      const small = targets.filter((t) => t.w < 44 || t.h < 44);
      assert.deepEqual(small, []);
      assert.deepEqual(await phone.evaluate(SMALL_TEXT), []);
    });
    await phoneCtx.close();
  } finally {
    await lanServer.remote.disable();
    lanServer.close();
  }
  }
  // ---- Review 2, brief §7: « Préparer à gauche → Prendre au centre →
  // Antenne à droite ». One take per view, between the monitors, measured
  // with a filled conductor and a plan on air.
  if (run("take")) {
  const views = [[0, "Bible"], [1, "Textes"], [2, "Conducteur"]];
  for (const [w, h] of [[1920, 1080], [1280, 800]]) {
    const r = await openRegie(w, h);
    await check(`Régie at ${w}×${h}: exactly one Diffuser and one Masquer in each view, both on the first screen`, async () => {
      for (const [tab, name] of views) {
        await showView(r.studio, tab);
        const g = await r.studio.evaluate(REGIE, META);
        const where = `${w} px, ${name}: `;
        assert.equal(g.takes.length, 1, where + "takes " + JSON.stringify(g.takes));
        assert.equal(g.hides.length, 1, where + "Masquer " + JSON.stringify(g.hides));
        for (const b of [g.takes[0], g.hides[0]])
          assert.ok(b.top >= 0 && b.bottom <= g.vh, where + b.text + " off the first screen: " + JSON.stringify(b));
      }
    });
    await check(`Régie type scale at ${w} px (§3): at most 6 sizes, ≥ 60 % of visible texts at 14 px or more, 12-13 px for meta only`, async () => {
      const seen = {};
      for (const [tab, name] of views) {
        await showView(r.studio, tab);
        const g = await r.studio.evaluate(REGIE, META);
        seen[name] = { sizes: Object.keys(g.hist).map(Number).sort((a, b) => a - b).join("/"), share14: Math.round(g.share14 * 100) + " %" };
        const where = `${w} px, ${name}: `;
        assert.ok(g.sizes <= 6, where + g.sizes + " sizes " + JSON.stringify(g.hist));
        assert.ok(g.share14 >= 0.6, where + Math.round(g.share14 * 100) + " % at 14 px or more " + JSON.stringify(g.hist));
        assert.ok(Object.keys(g.hist).every((k) => Number(k) >= 12), where + "under 12 px " + JSON.stringify(g.hist));
        assert.deepEqual(g.smallNotMeta, [], where + "12-13 px outside meta");
      }
      console.log("    type at " + w + " px: " + JSON.stringify(seen));
    });
    if (w === 1920)
      await check("Régie at 1920 px: the take sits between the monitors, monitors ≥ 720 px, the bay reaches the content edge", async () => {
        for (const [tab, name] of views) {
          await showView(r.studio, tab);
          const g = await r.studio.evaluate(REGIE, META);
          const t = g.takes[0];
          const where = name + ": ";
          assert.ok(t.left >= g.preview.right && t.right <= g.program.left, where + "take " + JSON.stringify(t) + " between " + g.preview.right + " and " + g.program.left);
          assert.ok(t.top >= g.preview.top && t.bottom <= g.preview.bottom, where + "take within the monitors' band " + g.preview.top + "-" + g.preview.bottom);
          assert.ok(g.preview.width >= 720 && g.program.width >= 720, where + "monitors " + g.preview.width + " / " + g.program.width);
          assert.ok(g.clientWidth - g.bay.right <= 32, where + "bay ends " + (g.clientWidth - g.bay.right) + " px before the edge");
        }
      });
    if (w === 1920)
      await check("Régie at 1920 px: at most 26 controls on the first screen in each view, with a filled conductor", async () => {
        const counts = {};
        for (const [tab, name] of views) {
          await showView(r.studio, tab);
          const g = await r.studio.evaluate(REGIE, META);
          counts[name] = g.controls;
          assert.ok(g.controls <= 26, name + ": " + g.controls + " controls: " + g.controlNames.join(" | "));
        }
        console.log("    controls on the first screen: " + JSON.stringify(counts));
      });
    assert.deepEqual(r.errors, []);
    await r.ctx.close();
  }
  const dock = await openRegie(390, 844);
  await check("Dock at 390×844: one Diffuser in the fixed bottom bar, one Masquer in the fixed 56 px band, in each view", async () => {
    for (const [tab, name] of views) {
      await showView(dock.studio, tab);
      for (const scroll of [0, 700]) {
        await dock.studio.evaluate((y) => scrollTo(0, y), scroll);
        await dock.studio.waitForTimeout(150);
        const g = await dock.studio.evaluate(REGIE, META);
        const band = await dock.studio.evaluate(() => {
          const b = document.querySelector("#onair-bar");
          const r = b.getBoundingClientRect();
          return { position: getComputedStyle(b).position, top: r.top, height: r.height };
        });
        const where = `390 px, ${name}, scrolled ${scroll}: `;
        assert.equal(g.takes.length, 1, where + "takes " + JSON.stringify(g.takes));
        assert.equal(g.hides.length, 1, where + "Masquer " + JSON.stringify(g.hides));
        const t = g.takes[0],
          m = g.hides[0];
        assert.ok(t.fixed && t.bottom <= g.vh && t.top >= g.vh - 96, where + "take in the fixed bottom bar " + JSON.stringify(t));
        assert.ok(Math.abs(t.width - (g.clientWidth - 32 - 2 * 52)) <= 2, where + "take width " + t.width + " (width − 2×52 px)");
        assert.ok(band.position === "fixed" && band.top === 0 && band.height <= 56, where + "Antenne band " + JSON.stringify(band));
        assert.ok(m.top >= 0 && m.bottom <= 56 && m.width >= 44 && m.height >= 44, where + "Masquer in the band " + JSON.stringify(m));
        // Préc. | Suiv. flank the take in the Conducteur view only.
        const nav = await dock.studio.evaluate(() =>
          ["#btn-queue-prev", "#btn-queue-next"].map((s) => {
            const r = document.querySelector(s).getBoundingClientRect();
            return r.width ? { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top } : null;
          }),
        );
        if (tab === 2) {
          assert.ok(nav.every((b) => b && b.w >= 44 && b.h >= 44), where + "Préc./Suiv. " + JSON.stringify(nav));
          assert.ok(nav[0].right <= t.left && nav[1].left >= t.right, where + "Préc. | Diffuser | Suiv. " + JSON.stringify(nav));
        } else assert.deepEqual(nav, [null, null], where + "no Préc./Suiv. outside the Conducteur view");
      }
    }
  });
  assert.deepEqual(dock.errors, []);
  await dock.ctx.close();
  // Brief §4: the take says when it cannot send, and « Rediffuser » when the
  // preview already holds what is on air (same action).
  const tk = await openRegie(1920, 1080);
  await check("The take is disabled with its reason when the preview is empty, and says « Rediffuser » for the item on air", async () => {
    const st = tk.studio;
    const take = () =>
      st.evaluate(() => {
        const b = Array.from(document.querySelectorAll("#btn-show, #btn-free-show, #btn-queue-show")).find((e) => e.getClientRects().length);
        return { id: b.id, disabled: b.disabled, label: b.querySelector(".take-label").textContent, reason: (b.querySelector(".take-reason")?.textContent || "").trim(), opacity: getComputedStyle(b).opacity, reasonSize: b.querySelector(".take-reason") ? getComputedStyle(b.querySelector(".take-reason")).fontSize : "" };
      });
    await showView(st, 1);
    let t = await take();
    assert.equal(t.id, "btn-free-show");
    assert.ok(t.disabled, "empty text: take disabled");
    assert.equal(t.reason, "Écrivez un texte");
    assert.equal(t.reasonSize, "12px");
    assert.equal(Number(t.opacity), 0.5);
    await st.fill("#freetext-title", "Annonce");
    await st.waitForFunction(() => !document.querySelector("#btn-free-show").disabled);
    t = await take();
    assert.equal(t.reason, "", "no reason once there is a text");
    // Conducteur: plan 1 is on air; selecting it turns the take into « Rediffuser ».
    await showView(st, 2);
    t = await take();
    assert.equal(t.label, "Diffuser", "plan 2 selected");
    await st.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[2].click());
    await st.waitForFunction(() => document.querySelector("#btn-queue-show .take-label").textContent === "Rediffuser");
    const live = await st.evaluate(() => document.querySelector("#onair-ref").textContent);
    await st.click("#btn-queue-show");
    await tk.output.waitForTimeout(400);
    assert.equal(await st.evaluate(() => document.querySelector("#onair-ref").textContent), live, "same item still on air");
    await st.evaluate(() => document.querySelectorAll("#queue-container .cp-queue-item")[3].click());
    await st.waitForFunction(() => document.querySelector("#btn-queue-show .take-label").textContent === "Diffuser");
  });
  assert.deepEqual(tk.errors, []);
  await tk.ctx.close();
  // ---- Review 2, brief §6: the interface moves little, fast, and never
  // the antenna. WAAPI calls are recorded from the first script on.
  const RECORD = () => {
    window.__anims = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const frames = Array.isArray(keyframes) ? keyframes : [];
      window.__anims.push({
        target: (this.id ? "#" + this.id : "") + "." + String(this.className).split(" ").join("."),
        props: [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => !["offset", "easing", "composite"].includes(k)))],
        first: frames[0] || null,
        duration: typeof options === "number" ? options : options && options.duration,
        delay: (options && options.delay) || 0,
      });
      return animate.call(this, keyframes, options);
    };
  };
  for (const reduced of [false, true]) {
    const mo = await openRegie(1920, 1080, { init: RECORD, reduced });
    const st = mo.studio;
    await check(`Interface motion (§6)${reduced ? ", reduced" : ""}: press 120 ms, tally colours 160 ms without blinking, ${reduced ? "no fill" : "180 ms fill"} on confirmation, plans enter after Découper, nothing on selection`, async () => {
      // Press and tally transitions.
      const css = await st.evaluate(() => {
        const t = (s) => getComputedStyle(document.querySelector(s)).transition;
        return { show: t("#btn-show"), hide: t("#btn-hide"), next: t("#btn-queue-next"), tab: t("#tab-btn-0"), onair: t("#onair-bar"), tally: t(".cp-onair-tally") };
      });
      if (!reduced) {
        for (const k of ["show", "hide", "next", "tab"])
          assert.match(css[k], /transform 0\.12s cubic-bezier\(0\.23, 1, 0\.32, 1\)/, k + " press: " + css[k]);
        for (const k of ["onair", "tally"]) assert.match(css[k], /background-color 0\.16s ease-out/, k + ": " + css[k]);
      }
      for (const k of Object.keys(css)) assert.doesNotMatch(css[k], /\b(width|height|all)\b/, k + " never animates its size: " + css[k]);
      // A new take: amber without blinking, then red, filled once.
      await showView(st, 0);
      const before = await st.evaluate(() => window.__anims.length);
      const pending = await st.evaluate(() => {
        document.querySelector("#btn-show").click();
        return { state: document.querySelector("#onair-bar").dataset.state, dot: getComputedStyle(document.querySelector(".cp-onair-dot")).animationName };
      });
      assert.equal(pending.state, "pending");
      assert.equal(pending.dot, "none", "the amber state does not blink");
      await st.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live" && document.querySelector("#onair-ref").textContent.startsWith("Psaumes 23"), null, { timeout: 10000 });
      await st.waitForTimeout(300);
      const fills = await st.evaluate((n) => window.__anims.slice(n).filter((a) => a.target.includes("cp-onair-fill")), before);
      if (reduced) assert.deepEqual(fills, [], "no fill in reduced motion");
      else {
        assert.equal(fills.length, 1, "one fill: " + JSON.stringify(fills));
        assert.equal(fills[0].duration, 180);
        assert.deepEqual(fills[0].props, ["clipPath"]);
        assert.match(fills[0].first.clipPath, /inset\(0(px)? 100% 0(px)? 0(px)?\)/);
      }
      // Selecting in the conductor never animates.
      await showView(st, 2);
      const n0 = await st.evaluate(() => window.__anims.length);
      const sel = await st.evaluate(() => {
        document.querySelectorAll("#queue-container .cp-queue-item")[4].click();
        return document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("#queue-container")).length;
      });
      assert.equal(sel, 0, "CSS animations on selection");
      assert.equal(await st.evaluate(() => window.__anims.length), n0, "WAAPI on selection");
      // « Découper »: the new plans enter, 160 ms, 30 ms apart.
      await showView(st, 0);
      await prepare(st, "Psaumes 23:1-6");
      await st.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || "") && !document.querySelector("#btn-split").disabled, null, { timeout: 20000 });
      const n1 = await st.evaluate(() => window.__anims.length);
      const plans = Number((await st.textContent("#btn-split")).match(/\d+/)[0]);
      await st.click("#btn-split");
      await st.waitForFunction((n) => window.__anims.length >= n, n1 + plans, { timeout: 5000 });
      const rows = await st.evaluate((n) => window.__anims.slice(n).filter((a) => a.target.includes("cp-queue-item")), n1);
      console.log("    " + (reduced ? "reduced: " : "") + "fill " + JSON.stringify(fills.map((f) => f.duration)) + " · rows " + JSON.stringify(rows.map((r) => [r.duration, r.delay, r.props.join("+")])));
      assert.equal(rows.length, plans, "one entrance per new plan");
      rows.forEach((r, i) => {
        assert.equal(r.duration, 160);
        assert.equal(r.delay, Math.min(i, 8) * 30);
        assert.deepEqual(r.props.sort(), reduced ? ["opacity"] : ["opacity", "transform"]);
      });
      const all = await st.evaluate(() => window.__anims.flatMap((a) => a.props));
      assert.deepEqual([...new Set(all)].filter((p) => !["opacity", "transform", "clipPath"].includes(p)), [], "only transform, opacity and clip-path");
    });
    assert.deepEqual(mo.errors, []);
    await mo.ctx.close();
  }
  }

  console.log("\n✓ Browser studio: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
