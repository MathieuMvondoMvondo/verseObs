// Dock OBS (28/10). The régie as OBS shows it in a dock (Math, live:
// « des trucs élémentaires c'est pas ça »), then two live findings: an
// output kept in OBS's cache, and a preview whose colours read otherwise
// than the antenna's.
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chrome \
//   node tests/browser-dock.mjs   (DOCK_ONLY=dock,reload,colours  DOCK_SIZES=340x900,…  DOCK_PORT)
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PLAYWRIGHT_CORE;
const CHROMIUM = process.env.CHROMIUM;
if (!PW || !CHROMIUM) {
  console.log("browser-dock: PLAYWRIGHT_CORE and CHROMIUM not set, skipped.");
  process.exit(0);
}
const { chromium } = await import(PW);
const { createServer } = require(path.join(ROOT, "tools/server.js"));
// A free port chosen at run time (28/10: fixed ports collided with other runs).
const PORT =
  Number(process.env.DOCK_PORT) ||
  (await new Promise((r) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  }));
const ONLY = process.env.DOCK_ONLY || "";
const run = (name) => !ONLY || ONLY.split(",").includes(name);
const server = createServer(PORT);
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${PORT}/`;
// Classic scrollbars, as in OBS on Windows (Playwright hides them by default).
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox"],
  ignoreDefaultArgs: ["--hide-scrollbars"],
});
let passed = 0,
  failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.log("  ✗ " + name + "\n      " + String((e && e.message) || e).split("\n").slice(0, 8).join("\n      "));
  }
}
const TOOLS = `
window.__vis = (e) => {
  if (!e) return false;
  const r = e.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false; // visually hidden (1 px)
  if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const shut = e.closest("details:not([open])");
  if (shut && !(e.closest("summary") && e.closest("summary").parentElement === shut)) return false;
  for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
  }
  return true;
};
window.__name = (e) =>
  e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") +
  (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
`;
// Math's rule (28/10, « un truc qui fonctionne conformément »): every
// display check reads the text AND the reference the OUTPUT really shows
// (browser_source in the same browser session), against the Bible itself
// (model: hotfix-live-tests/verif-texte.mjs).
const LSG = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bibles/lsg.json"), "utf8"));
const nums = (r) => (String(r).match(/\d+:\d+/) || [""])[0];
function verseText(ref) {
  const [c, v] = nums(ref).split(":").map(Number);
  const book = LSG.books.find((b) => Number(b.id) === 43); // the tests use Jean
  const ch = book.chapters.find((x) => Number(x.chapter) === c);
  return ch.verses.find((x) => Number(x.verse) === v).text.replace(/\s+/g, " ").trim();
}
async function expectOnAir(out, ref, where, prev) {
  const want = { nums: nums(ref), text: verseText(ref).slice(0, 48), gone: prev ? verseText(prev).slice(0, 48) : "" };
  try {
    await out.waitForFunction(
      (w) => {
        const t = (document.getElementById("verse-container") || document.body).innerText.replace(/\s+/g, " ");
        return t.replace(/\s+/g, "").includes(w.nums) && t.includes(w.text) && (!w.gone || !t.includes(w.gone));
      },
      want,
      { timeout: 10000 },
    );
  } catch (e) {
    const seen = await out.evaluate(() => (document.getElementById("verse-container") || document.body).innerText.replace(/\s+/g, " ").trim().slice(0, 220));
    throw new Error(where + ": the output does not show " + ref + " with its text " + JSON.stringify({ want, seen }));
  }
}
const READY = () => /\d+:\d+/.test(document.querySelector("#preview-ref")?.textContent || "");

async function openRegie(w, h, dpr = 1.25) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await ctx.addInitScript(TOOLS);
  const out = await ctx.newPage();
  await out.setViewportSize({ width: 1920, height: 1080 });
  await out.goto(BASE + "browser_source.html");
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "control_panel.html");
  await page.waitForFunction(READY, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, out, page, errors };
}
async function onAir(page) {
  await page.evaluate(() => document.querySelector("#btn-show").click());
  await page.waitForFunction(() => document.querySelector("#onair-bar")?.dataset.state === "live", null, { timeout: 15000 });
}
async function showView(page, tab) {
  await page.evaluate((t) => document.querySelector("#tab-btn-" + t).click(), tab);
  await page.waitForFunction((t) => document.body.dataset.tab === String(t), tab, { timeout: 5000 });
  await page.waitForTimeout(150);
}
// What the operator does: search, retouch the text, reach for the take
// (focus and scrollIntoView move every scrollable ancestor, sideways too).
async function operatorMoves(page, tab) {
  await page.evaluate((tab) => {
    const reach = (e) => {
      if (e && __vis(e)) {
        e.focus();
        e.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    if (tab === 0) {
      reach(document.querySelector("#search-input"));
      reach(document.querySelector(".cp-preview-text"));
    }
    for (const e of document.querySelectorAll(".take-go, #btn-hide, #onair-hide")) reach(e);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }, tab);
  await page.waitForTimeout(120);
}
const SIDEWAYS = () => {
  const de = document.documentElement,
    vw = de.clientWidth;
  const scrolled = [...document.querySelectorAll("body *")]
    .filter((e) => e.scrollLeft > 0 && !e.matches("input, textarea"))
    .map(__name);
  const over = [];
  for (const e of document.querySelectorAll("body *")) {
    if (!__vis(e) || e.closest(".sr-only")) continue;
    const r = e.getBoundingClientRect();
    if (r.right > vw + 0.5 || r.left < -0.5) over.push(__name(e) + " " + Math.round(r.left) + ".." + Math.round(r.right));
  }
  const trunc = [];
  for (const e of document.querySelectorAll("button, [role=tab], button > span, .cp-onair-label, #onair-ref")) {
    if (!__vis(e) || e.closest(".sr-only")) continue;
    if (e.scrollWidth > e.clientWidth + 1)
      trunc.push(__name(e) + " «" + e.textContent.trim().slice(0, 30) + "» " + e.scrollWidth + ">" + e.clientWidth);
  }
  return { vw, sb: innerWidth - vw, scrollW: de.scrollWidth, bodyW: document.body.scrollWidth, scrollX, scrolled, over: over.slice(0, 8), trunc };
};
const TAKES = () => {
  const vw = document.documentElement.clientWidth,
    vh = innerHeight;
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return {
      id: e.id,
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      w: Math.round(r.width),
      h: Math.round(r.height),
      inView: r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5,
      fixed: getComputedStyle(e.closest(".take, #onair-bar") || e).position === "fixed",
    };
  };
  return {
    vh,
    takes: [...document.querySelectorAll(".take-go")].filter(__vis).map(box),
    hides: [...document.querySelectorAll("#btn-hide, #onair-hide")].filter(__vis).map(box),
  };
};
// At the end of the page, nothing of the view stays under the bar (painted
// boxes, clipped by their scrolling ancestors).
const COVER = () => {
  scrollTo(0, document.documentElement.scrollHeight);
  const bar = document.querySelector(".take").getBoundingClientRect();
  const clip = (e) => {
    const r = e.getBoundingClientRect();
    let top = r.top,
      bottom = r.bottom;
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|hidden)/.test(cs.overflowY)) {
        const p = n.getBoundingClientRect();
        top = Math.max(top, p.top);
        bottom = Math.min(bottom, p.bottom);
      }
    }
    return { top, bottom };
  };
  const panel = document.querySelector(".cp-tab-content.active");
  let last = null;
  const under = [];
  for (const e of panel ? panel.querySelectorAll("*") : []) {
    if (!__vis(e)) continue;
    const c = clip(e);
    if (c.bottom - c.top < 1) continue;
    if (!last || c.bottom > last.bottom) last = { el: __name(e), bottom: Math.round(c.bottom) };
    if (e.matches("button, input, select, textarea, [contenteditable=true], h2, h3, p") && c.bottom > bar.top + 0.5 && c.top < bar.bottom - 0.5)
      under.push(__name(e));
  }
  const res = { barTop: Math.round(bar.top), last, under };
  scrollTo(0, 0);
  return res;
};
// The dock's controls at the top of the Bible view: targets of 32 px or
// more, no text under 12 px (the preview's miniature is an iframe).
const SMALL = () => {
  const vh = innerHeight,
    tiny = [],
    small = [];
  const sel =
    "#onair-bar button, .studio-sidebar [role=tab], .cp-header button, .take button, .bible-search-row :is(input, select, button, label), .passage-editor .section-heading :is(button, select, label)";
  for (const e of document.querySelectorAll(sel)) {
    if (!__vis(e) || e.matches("input[type=checkbox]")) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    if (r.height < 31.5 || r.width < 31.5) tiny.push(__name(e) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode()); ) {
    const p = n.parentElement;
    if (!n.textContent.trim() || !p || !__vis(p) || p.closest(".sr-only")) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    if (fs > 0 && fs < 12) small.push(__name(p) + " " + fs + "px «" + n.textContent.trim().slice(0, 20) + "»");
  }
  return { tiny, small: small.slice(0, 8) };
};

if (run("dock")) {
  const SIZES = (process.env.DOCK_SIZES || "300x700,340x900,380x800,420x900,520x1000,600x900,700x900,800x900,900x900,1000x900,1280x800")
    .split(",")
    .map((s) => s.split("x").map(Number));
  for (const [w, h] of SIZES) {
    const r = await openRegie(w, h);
    await onAir(r.page);
    await check(`Dock ${w}×${h} @1.25: no sideways scroll, no cut label, one Diffuser and one Masquer in view, nothing under the bar (six views)${w <= 620 ? ", ‹ Diffuser › Masquer at the same places in Bible and Conducteur" : ""}`, async () => {
      const dock = w <= 620;
      // 29/10 (review under CEF 127): in the Conducteur view › and Masquer
      // had swapped places; a hand that goes for › there took the verse off air.
      const bar = {};
      const BAR = (ids) =>
        ids.map((q) => {
          const e = document.querySelector(q);
          const b = e.getBoundingClientRect();
          return { q, shown: e.getClientRects().length > 0, l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) };
        });
      for (const tab of [0, 1, 2, 3, 4, 5]) {
        await showView(r.page, tab);
        await operatorMoves(r.page, tab);
        const where = `${w} px, view ${tab}: `;
        const m = await r.page.evaluate(SIDEWAYS);
        assert.ok(m.scrollW <= m.vw && m.bodyW <= m.vw && m.scrollX === 0, where + "sideways " + JSON.stringify(m));
        assert.deepEqual(m.scrolled, [], where + "scrolled sideways");
        assert.deepEqual(m.over, [], where + "past the edge");
        assert.deepEqual(m.trunc, [], where + "cut labels");
        await r.page.evaluate(() => scrollTo(0, 0));
        if (dock && tab === 0) bar[0] = await r.page.evaluate(BAR, ["#btn-take-prev-verse", "#btn-show", "#btn-take-next-verse", "#btn-hide"]);
        if (dock && tab === 2) bar[2] = await r.page.evaluate(BAR, ["#btn-queue-prev", "#btn-queue-show", "#btn-queue-next", "#btn-hide"]);
        const k = await r.page.evaluate(TAKES);
        assert.equal(k.hides.length, 1, where + "one Masquer " + JSON.stringify(k.hides));
        const hide = k.hides[0];
        assert.ok(hide.inView, where + "Masquer in view " + JSON.stringify(hide));
        if (tab <= 2) {
          assert.equal(k.takes.length, 1, where + "one Diffuser " + JSON.stringify(k.takes));
          assert.ok(k.takes[0].inView, where + "Diffuser in view " + JSON.stringify(k.takes[0]));
        }
        if (dock) {
          assert.ok(hide.fixed && hide.id === "btn-hide" && hide.bottom <= k.vh && hide.h >= 44, where + "Masquer in the bottom bar " + JSON.stringify(hide));
          if (tab <= 2) {
            const t = k.takes[0];
            assert.ok(t.fixed && Math.abs(t.top - hide.top) <= 1 && hide.left >= t.right, where + "Diffuser | Masquer " + JSON.stringify({ t, hide }));
          }
          const c = await r.page.evaluate(COVER);
          assert.deepEqual(c.under, [], where + "under the bar at the end " + JSON.stringify(c));
          assert.ok(c.last && c.last.bottom <= c.barTop, where + "last element above the bar " + JSON.stringify(c));
          if (tab === 0) {
            const s = await r.page.evaluate(SMALL);
            assert.deepEqual(s.tiny, [], where + "targets under 32 px");
            assert.deepEqual(s.small, [], where + "text under 12 px");
          }
        }
      }
      if (dock) {
        for (const tab of [0, 2]) {
          const [p, go, n, hide] = bar[tab];
          assert.ok([p, go, n, hide].every((b) => b.shown && (b.t + b.b) / 2 >= hide.t && (b.t + b.b) / 2 <= hide.b), `${w} px, view ${tab}: one row ` + JSON.stringify(bar[tab]));
          assert.ok(p.r <= go.l && go.r <= n.l && n.r <= hide.l, `${w} px, view ${tab}: ‹ | Diffuser | › | Masquer ` + JSON.stringify(bar[tab]));
        }
        bar[2].forEach((b, i) => assert.ok(Math.abs(b.l - bar[0][i].l) <= 1 && Math.abs(b.r - bar[0][i].r) <= 1, `${w} px: ${b.q} where ${bar[0][i].q} is in the Bible view ` + JSON.stringify([b, bar[0][i]])));
      }
      assert.deepEqual(r.errors, [], "page errors");
    });
    await r.ctx.close();
  }
  const g = await openRegie(800, 900);
  await check("Dock 800×900: a régie shifted sideways (page or container) comes back at once", async () => {
    const res = await g.page.evaluate(async () => {
      const wide = document.createElement("div");
      wide.style.cssText = "position:absolute;top:0;left:0;width:3000px;height:10px";
      document.body.appendChild(wide);
      scrollTo(600, 0);
      await new Promise((r) => setTimeout(r, 300));
      const page = scrollX;
      wide.remove();
      const box = document.querySelector(".preparation-panel");
      const inner = document.createElement("div");
      inner.style.cssText = "width:3000px;height:4px";
      box.style.overflowX = "auto";
      box.appendChild(inner);
      box.scrollLeft = 400;
      await new Promise((r) => setTimeout(r, 300));
      const panel = box.scrollLeft;
      inner.remove();
      box.style.overflowX = "";
      return { page, panel };
    });
    assert.deepEqual(res, { page: 0, panel: 0 }, "scrolled sideways: " + JSON.stringify(res));
  });
  await g.ctx.close();
}

if (run("chain")) {
  // Math in the live (28/10): « Pourquoi on ne peut pas mettre des versets
  // à la suite ». ◀ / ▶ in the dock's bar, « Enchaîner à l'antenne ».
  const ctx = await browser.newContext({ viewport: { width: 340, height: 900 }, deviceScaleFactor: 1.25 });
  await ctx.addInitScript(TOOLS);
  await ctx.addInitScript(() => {
    window.__sent = [];
    const post = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) {
      const x = m && m.type ? m : m && (m.msg || m.data || m.payload);
      if (x && x.command) window.__sent.push({ type: x.type, command: x.command, reference: x.reference || "" });
      return post.call(this, m);
    };
  });
  const out = await ctx.newPage();
  await out.setViewportSize({ width: 1920, height: 1080 });
  await out.goto(BASE + "browser_source.html");
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "control_panel.html");
  await page.waitForFunction(READY, null, { timeout: 30000 });
  const ref = () => page.evaluate(() => document.querySelector("#preview-ref").textContent.trim());
  const onScreen = (r, prev) => expectOnAir(out, r, "chain", prev);
  const shows = () => page.evaluate(() => window.__sent.filter((m) => m.type !== "hide").length);
  await check("Dock 340: ◀ Diffuser ▶ Masquer, « Enchaîner à l’antenne » (on) and « Ajouter au conducteur » in the bar, none covered", async () => {
    const r = await page.evaluate(() =>
      ["#btn-take-prev-verse", "#btn-show", "#btn-take-next-verse", "#btn-hide", "#chain-toggle", "#btn-add-queue"].map((q) => {
        const e = document.querySelector(q);
        const b = e.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { q, vis: __vis(e), inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, free: !!hit && (hit === e || e.contains(hit) || hit.contains(e) || (hit.closest("label") && hit.closest("label").contains(e))), x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      }),
    );
    for (const b of r) assert.ok(b.vis && b.inView && b.free, "control " + JSON.stringify(b));
    const [p, go, n, hide] = r;
    assert.ok(p.x + p.w <= go.x && go.x + go.w <= n.x && n.x + n.w <= hide.x, "◀ | Diffuser | ▶ | Masquer " + JSON.stringify(r.slice(0, 4)));
    assert.equal(await page.evaluate(() => document.querySelector("#chain-toggle").checked), true, "on by default");
  });
  await check("Off air, ▶ only prepares the next verse: nothing sent", async () => {
    const before = await ref();
    await page.click("#btn-take-next-verse");
    await page.waitForFunction((b) => document.querySelector("#preview-ref").textContent.trim() !== b, before, { timeout: 5000 });
    await page.waitForTimeout(800);
    assert.equal(await shows(), 0, "no SHOW off air");
    assert.equal(await out.evaluate(() => !!document.querySelector(".verse-card:not(.is-leaving)")), false, "nothing on air");
  });
  await check("On air, › ‹ and Ctrl+→ put the neighbouring verse on air in one click; unticked, › and an explorer click only prepare; Masquer stays last", async () => {
    await page.click("#btn-show");
    const r1 = await ref();
    await onScreen(r1);
    await page.click("#btn-take-next-verse");
    const r2 = await ref();
    assert.notEqual(nums(r2), nums(r1));
    await onScreen(r2, r1);
    await page.click("#btn-take-prev-verse");
    await onScreen(r1, r2);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press("Control+ArrowRight");
    await onScreen(r2, r1);
    assert.equal(await shows(), 4, "four SHOW: Diffuser, ▶, ◀, Ctrl+→");
    await page.click("#chain-toggle");
    await page.click("#btn-take-next-verse");
    const r3 = await ref();
    assert.notEqual(nums(r3), nums(r2));
    await page.waitForTimeout(1200);
    await onScreen(r2, r3);
    assert.equal(await shows(), 4, "unticked: ▶ only prepares");
    // The explorer's click (e822422) follows the switch too.
    await page.click("#explore-toggle");
    const item = (n) => `#chapter-list .chapter-verse[data-verse="${n}"]`;
    await page.click(item(5));
    await page.waitForTimeout(1200);
    await onScreen(r2, "Jean 3:5");
    assert.equal(await shows(), 4, "unticked: a click in the explorer only prepares");
    await page.click("#chain-toggle");
    await page.click(item(9));
    const r4 = "Jean 3:9";
    await onScreen(r4, r2);
    assert.equal(await shows(), 5, "ticked: the clicked verse goes on air");
    await page.click("#btn-hide");
    await out.waitForFunction(() => !document.querySelector(".verse-card:not(.is-leaving)"), null, { timeout: 10000 });
    await page.waitForTimeout(2500);
    assert.equal(await out.evaluate(() => !!document.querySelector(".verse-card:not(.is-leaving)")), false, "Masquer stays last: nothing comes back");
    const sent = await page.evaluate(() => window.__sent);
    assert.deepEqual(sent.map((m) => (m.type === "hide" ? "hide" : "show")), ["show", "show", "show", "show", "show", "hide"], JSON.stringify(sent));
    assert.equal(new Set(sent.map((m) => String(m.command))).size, 6, "one command each");
    assert.deepEqual(sent.slice(0, 5).map((m) => nums(m.reference)), [nums(r1), nums(r2), nums(r1), nums(r2), nums(r4)]);
    assert.deepEqual(errors, []);
  });
  // 29/10: folded, the list cannot scroll to the prepared verse; opened in
  // one click it must show it, and stay open after a reload of the dock.
  await check("Dock 340: the explorer opened in one click shows the prepared verse in its list, and stays open after a reload of the dock", async () => {
    const toggle = () => page.evaluate(() => document.querySelector("#explore-toggle").getAttribute("aria-expanded"));
    await page.click("#explore-toggle");
    assert.equal(await toggle(), "false", "folded again");
    await page.fill("#search-input", "Jean 3:30");
    await page.press("#search-input", "Enter");
    await page.waitForFunction(() => /3:30\b/.test(document.querySelector("#preview-ref").textContent), null, { timeout: 8000 });
    await page.click("#explore-toggle");
    const seen = await page.evaluate(() => {
      const v = document.querySelector("#chapter-list .chapter-verse.selected");
      const list = document.getElementById("chapter-list");
      const sc = list.closest(".chapter-scroll") || list;
      const a = v.getBoundingClientRect(), b = sc.getBoundingClientRect();
      return { verse: v.dataset.verse, top: Math.round(a.top - b.top), bottom: Math.round(a.bottom - b.top), height: Math.round(b.height) };
    });
    assert.ok(seen.verse === "30" && seen.top >= 0 && seen.bottom <= seen.height, "the prepared verse in the list's view " + JSON.stringify(seen));
    await page.reload();
    await page.waitForFunction(READY, null, { timeout: 30000 });
    const after = await page.evaluate(() => ({ expanded: document.querySelector("#explore-toggle").getAttribute("aria-expanded"), shown: document.querySelector("#chapter-list .chapter-verse").getClientRects().length > 0 }));
    assert.deepEqual(after, { expanded: "true", shown: true }, "open after the reload");
    assert.deepEqual(errors, []);
  });
  await ctx.close();
}

if (run("reload")) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const out = await ctx.newPage();
  await out.setViewportSize({ width: 1920, height: 1080 });
  let loads = 0;
  out.on("load", () => loads++);
  await out.goto(BASE + "browser_source.html");
  const page = await ctx.newPage();
  await page.goto(BASE + "control_panel.html");
  await page.waitForFunction(READY, null, { timeout: 30000 });
  await check("A Studio announcing a newer release: the OBS output reloads itself once, never while a text is on air, and works after", async () => {
    const build = await out.evaluate(() => window.VerseObs.BUILD);
    assert.ok(build >= 2.5, "release " + build);
    await page.waitForTimeout(7000); // two pings of the same release
    assert.equal(loads, 1, "same release: no reload");
    await onAir(page);
    await page.evaluate(() => {
      window.VerseObs.BUILD += 1;
    });
    await page.waitForTimeout(7000);
    assert.equal(loads, 1, "newer release, text on air: no reload");
    await page.evaluate(() => document.querySelector("#btn-hide").click());
    const t0 = Date.now();
    while (loads < 2 && Date.now() - t0 < 15000) await page.waitForTimeout(200);
    assert.equal(loads, 2, "reloaded after Masquer");
    await page.waitForTimeout(8000);
    assert.equal(loads, 2, "once for that release (no loop)");
    await page.evaluate(() => document.querySelector("#btn-show").click());
    await expectOnAir(out, await page.evaluate(() => document.querySelector("#preview-ref").textContent), "after the reload");
  });
  await ctx.close();
}

if (run("colours")) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const out = await ctx.newPage();
  await out.setViewportSize({ width: 1920, height: 1080 });
  await out.goto(BASE + "browser_source.html");
  const page = await ctx.newPage();
  await page.goto(BASE + "control_panel.html");
  await page.waitForFunction(READY, null, { timeout: 30000 });
  await check("Preview monitor (Facettes): a neutral backdrop, and the band's pixel equals the antenna's", async () => {
    await page.selectOption("#style-select", "facettes");
    await page.waitForTimeout(600);
    await onAir(page);
    await expectOnAir(out, await page.evaluate(() => document.querySelector("#preview-ref").textContent), "Facettes");
    await page.waitForTimeout(1500);
    await out.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 10000 }).catch(() => {});
    // The band: the card's text plate, its most frequent colour (letters
    // and the reference's block aside), on air over a neutral #202020 and
    // in the preview over its checkerboard.
    const P = await out.evaluate(() => {
      const c = document.querySelector(".verse-card").getBoundingClientRect();
      const b = (document.querySelector(".layout-facettes .vo-plate") || document.querySelector(".verse-body")).getBoundingClientRect();
      return { card: [c.left, c.top, c.right, c.bottom].map(Math.round), x: Math.round(b.left + 8), y: Math.round(b.top + 8), w: Math.round(b.width - 16), h: Math.round(b.height - 16) };
    });
    const outShot = await out.screenshot({ omitBackground: true, clip: { x: P.x, y: P.y, width: P.w, height: P.h } });
    const st = await page.evaluate(() => {
      const s = document.querySelector("#preview-stage");
      const r = s.getBoundingClientRect();
      return { x: r.left + s.clientLeft, y: r.top + s.clientTop, w: s.clientWidth };
    });
    const k = st.w / 1920;
    const pvShot = await page.screenshot({ clip: { x: Math.ceil(st.x + P.x * k), y: Math.ceil(st.y + P.y * k), width: Math.floor(P.w * k), height: Math.floor(P.h * k) } });
    const cornerShot = await page.screenshot({ clip: { x: Math.round(st.x + 6), y: Math.round(st.y + 6), width: 48, height: 48 } });
    const mode = (buf, under) =>
      page.evaluate(
        async ([b64, under]) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          if (under) {
            g.fillStyle = under;
            g.fillRect(0, 0, c.width, c.height);
          }
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data,
            n = new Map();
          for (let i = 0; i < d.length; i += 4) {
            const key = (d[i] >> 2) + "," + (d[i + 1] >> 2) + "," + (d[i + 2] >> 2);
            n.set(key, (n.get(key) || 0) + 1);
          }
          const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map((v) => v * 4 + 2);
          const avg = [0, 1, 2].map((j) => {
            let t = 0;
            for (let i = j; i < d.length; i += 4) t += d[i];
            return Math.round(t / (d.length / 4));
          });
          return { best, avg };
        },
        [buf.toString("base64"), under],
      );
    const onair = (await mode(outShot, "#202020")).best;
    const shown = (await mode(pvShot, null)).best;
    const corner = (await mode(cornerShot, null)).avg;
    console.log("    card " + P.card + ", band on air " + onair + ", in the preview " + shown + ", preview backdrop " + corner);
    assert.ok(onair.every((v, i) => Math.abs(v - [21, 23, 28][i]) <= 6), "sampled the Facettes band (#15171c): " + onair);
    assert.ok(onair.every((v, i) => Math.abs(v - shown[i]) <= 6), "band: antenna " + onair + " vs preview " + shown);
    assert.ok(Math.max(...corner) - Math.min(...corner) <= 3, "neutral backdrop, no colour cast: " + corner);
  });
  await ctx.close();
}

await browser.close();
server.close();
console.log("\nbrowser-dock: " + passed + " passed, " + failed + " failed.");
process.exit(failed ? 1 : 0);
