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

  // ---- Long passages: a subtitle-like band, a split proposed to the operator.
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

  // ---- Régie readability: type floor, keyboard focus, phone targets.
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
  console.log("\n✓ Browser studio: " + passed + " checks passed.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
