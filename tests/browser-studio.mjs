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
async function check(name, fn) {
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

try {
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
  console.log("\n✓ Browser studio: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
