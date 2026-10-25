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
    await studio.waitForFunction(() => /Découper en \d+ plans/.test(document.querySelector("#btn-split")?.textContent || ""));
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
  console.log("\n✓ Browser studio: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
