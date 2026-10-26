"use strict";
const assert = require("node:assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");
const { WebSocket } = require("ws");
const { createServer } = require("../tools/server");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const PORT = 18484,
  origin = "http://127.0.0.1:" + PORT;
let passed = 0;
const windows = [];
// The phone remote binds to loopback in tests; off until explicitly enabled.
const server = createServer(PORT, { lan: { addresses: ["127.0.0.1"], port: 0 } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  for (let i = 0; i < 120; i++) {
    if (fn()) return;
    await wait(25);
  }
  throw new Error("Timed out: " + label);
}
function check(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}
async function page(route, base = origin) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => {
    if (
      !e.message.includes("navigation") &&
      !e.message.includes("window.print")
    )
      errors.push(e);
  });
  const dom = await JSDOM.fromURL(base + "/" + route, {
    resources: "usable",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (url, opts) => fetch(new URL(url, w.location.href), opts);
      w.matchMedia = () => ({ matches: false });
      w.scrollTo = () => {};
      Object.defineProperty(w.HTMLElement.prototype, "innerText", {
        get() {
          return this.textContent;
        },
        set(v) {
          this.textContent = v;
        },
        configurable: true,
      });
      w.URL.createObjectURL = () => "blob:test";
      w.URL.revokeObjectURL = () => {};
    },
  });
  windows.push(dom.window);
  return { w: dom.window, d: dom.window.document, errors };
}
function input(p, selector, value, type = "input") {
  const e = p.d.querySelector(selector);
  assert(e, selector);
  e.value = value;
  e.dispatchEvent(new p.w.Event(type, { bubbles: true }));
}
function click(p, selector) {
  const e = p.d.querySelector(selector);
  assert(e, selector);
  e.click();
}
async function run() {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const cp = await page("control_panel.html");
  await until(
    () => cp.d.querySelectorAll(".chapter-verse").length === 36,
    "initial chapter",
  );
  await wait(300);
  check("Studio loads the twelve local translations", () =>
    assert.equal(cp.d.querySelectorAll("#version-select option").length, 12),
  );
  check("Preview frames do not pretend to be a connected output", () =>
    assert.equal(
      cp.d.querySelector("#connection-dot").classList.contains("connected"),
      false,
    ),
  );
  check("Initial verse and setting labels match their values", () => {
    assert.equal(cp.d.querySelector("#preview-ref").textContent, "Jean 3:16");
    const slider = cp.d.querySelector(
      "#settings-container [data-setting=fontSize]",
    );
    assert.equal(
      slider.parentElement.querySelector(".cp-setting-value").textContent,
      slider.value + "px",
    );
  });
  check("Settings start on essentials with advanced controls hidden", () => {
    assert.equal(
      cp.d.querySelector('[data-settings-page-panel="1"]').hidden,
      true,
    );
    assert.equal(
      cp.d.querySelector("#settings-container [data-setting=fontFamily]")
        .tagName,
      "SELECT",
    );
  });
  input(cp, "#search-input", "Jean 3:16-18");
  check("Range preparation contains the entire passage", () => {
    assert.equal(
      cp.d.querySelector("#preview-ref").textContent,
      "Jean 3:16-18",
    );
    assert(
      cp.d.querySelector("#preview-text").textContent.includes("déjà jugé"),
    );
  });
  click(cp, "#btn-add-queue");
  check("Adding a range to the conductor keeps all its verses", () => {
    const q = JSON.parse(cp.w.localStorage.getItem("verseobs_queue"));
    assert.equal(q.items[0].reference, "Jean 3:16-18");
    assert(q.items[0].text.includes("déjà jugé"));
    assert.equal(q.currentIndex, 0);
  });
  input(cp, "#search-input", "Jean 99:999");
  check("Invalid reference leaves the prepared passage unchanged", () =>
    assert.equal(
      cp.d.querySelector("#preview-ref").textContent,
      "Jean 3:16-18",
    ),
  );
  const output = await page("browser_source.html");
  await until(
    () => output.w.VerseObs && output.w.VerseObs.DisplayApp,
    "output ready",
  );
  await until(
    () => cp.d.querySelector("#connection-dot").classList.contains("connected"),
    "output connected",
  );
  input(cp, "#settings-container [data-setting=animation]", "none", "change");
  click(cp, "#btn-show");
  await until(() => output.d.querySelector(".verse-text"), "show");
  check("Local relay sends the prepared range to an isolated output", () =>
    assert(
      output.d.querySelector(".verse-text").textContent.includes("déjà jugé"),
    ),
  );
  await until(
    () =>
      cp.d.querySelector(".cp-onair-label").textContent === "Sortie confirmée",
    "acknowledged",
  );
  check("The program strip states a confirmed broadcast in red tally", () => {
    const bar = cp.d.querySelector("#onair-bar");
    assert.equal(bar.dataset.state, "live");
    assert.equal(cp.d.body.dataset.onair, "live");
    assert.equal(cp.d.querySelector("#onair-ref").textContent, "Jean 3:16-18");
    assert(cp.d.querySelector("#monitor-program").classList.contains("is-live"));
  });
  check("The output composes margin reference, axis and reading column", () => {
    const container = output.d.querySelector("#verse-container");
    assert(container.classList.contains("layout-antenne"));
    assert(output.d.querySelector(".verse-card").classList.contains("has-ref"));
    assert.equal(output.d.querySelector(".vo-book").textContent, "Jean");
    assert.equal(output.d.querySelector(".vo-nums").textContent, "3:16-18");
    assert(output.d.querySelector(".vo-version").textContent.length > 2);
    assert.equal(output.d.querySelectorAll(".vo-axis").length, 1);
    assert.equal(output.d.querySelectorAll(".vo-copy").length, 1);
  });
  // Objects come from the page's realm: compare them as plain JSON.
  const split = (r) =>
    JSON.parse(JSON.stringify(output.w.VerseObs.Renderer.splitReference(r)));
  check("References split into book and numbers for the margin", () => {
    assert.deepEqual(split("1 Corinthiens 13:4-7"), {
      book: "1 Corinthiens",
      nums: "13:4-7",
    });
    assert.deepEqual(split("Psaumes 119:105-112"), {
      book: "Psaumes",
      nums: "119:105-112",
    });
    assert.deepEqual(split("Psaumes 23"), { book: "Psaumes", nums: "23" });
    assert.deepEqual(split("Annonce"), { book: "Annonce", nums: "" });
  });
  check("A card's reference pill stays readable with the antenne colours", () => {
    const readable = output.w.VerseObs.Renderer.readableOn;
    assert.equal(readable("#f2b544", "#f3eee4"), "#14161b");
    assert.equal(readable("#92b3f5", "#27282c"), "#27282c");
    assert.equal(readable("#1d4ed8", "#1a1a1a"), "#ffffff");
  });
  cp.w.VerseObs.Studio.setFit({ visible: true, fit: 0.8, overflow: false });
  check("The preview tells the operator when a text had to be reduced", () => {
    const hint = cp.d.querySelector("#fit-hint");
    assert.equal(hint.hidden, false);
    assert.equal(hint.textContent, "Texte réduit à 80 % pour tenir à l’écran");
    assert(!hint.classList.contains("is-warning"));
  });
  cp.w.VerseObs.Studio.setFit({ visible: true, fit: 0.42, overflow: true });
  check("A text too long even when reduced is flagged before broadcast", () => {
    const hint = cp.d.querySelector("#fit-hint");
    assert(hint.classList.contains("is-warning"));
    assert.match(hint.textContent, /découpez le passage/);
  });
  // Another window cannot drive the hint: only the preview frame is trusted.
  cp.w.postMessage({ type: "verseobs:fit", visible: true, fit: 0.5 }, origin);
  await wait(60);
  check("Fit reports from another window are ignored", () =>
    assert.match(cp.d.querySelector("#fit-hint").textContent, /découpez/),
  );
  cp.w.VerseObs.Studio.setFit({ visible: true, fit: 1, overflow: false });
  check("A text shown at full size shows no hint", () =>
    assert.equal(cp.d.querySelector("#fit-hint").hidden, true),
  );
  click(cp, '[data-reference="Psaumes 23:1"]');
  await wait(180);
  check("Preparing another passage does not change the live output", () =>
    assert.equal(
      output.d.querySelector(".verse-reference").textContent,
      "Jean 3:16-18",
    ),
  );
  input(cp, "#version-select", "kjv", "change");
  await until(
    () => cp.d.querySelector("#preview-caption").textContent.includes("KJV"),
    "translation",
  );
  check("Changing translation does not silently replace the on-air verse", () =>
    assert.equal(
      output.d.querySelector(".verse-reference").textContent,
      "Jean 3:16-18",
    ),
  );
  cp.d.querySelector("#preview-text").textContent =
    "A custom editorial correction";
  cp.d
    .querySelector("#preview-text")
    .dispatchEvent(new cp.w.Event("input", { bubbles: true }));
  click(cp, "#btn-show");
  await until(
    () =>
      output.d.querySelector(".verse-text").textContent ===
      "A custom editorial correction",
    "edited text",
  );
  check("Plain editor changes are sent even without rich-text markup", () =>
    assert.equal(
      output.d.querySelector(".verse-text").textContent,
      "A custom editorial correction",
    ),
  );
  click(cp, "#btn-add-queue");
  click(cp, "#tab-btn-2");
  click(cp, ".cp-queue-item");
  await wait(150);
  check("Selecting a conductor item does not broadcast it", () =>
    assert.equal(
      output.d.querySelector(".verse-text").textContent,
      "A custom editorial correction",
    ),
  );
  click(cp, "#btn-queue-show");
  await until(
    () =>
      output.d.querySelector(".verse-reference").textContent === "Jean 3:16-18",
    "queue broadcast",
  );
  check(
    "Explicit conductor broadcast sends its stored version and full text",
    () =>
      assert(
        output.d.querySelector(".verse-text").textContent.includes("déjà jugé"),
      ),
  );
  click(cp, "#btn-clear-queue");
  check("Empty conductor disables broadcast and offers undo", () => {
    assert(cp.d.querySelector("#btn-queue-show").disabled);
    assert.equal(cp.d.querySelector("#undo-clear").hidden, false);
  });
  click(cp, "#undo-clear");
  check("Undo restores the full conductor", () =>
    assert.equal(
      JSON.parse(cp.w.localStorage.getItem("verseobs_queue")).items.length,
      2,
    ),
  );
  click(cp, "#tab-btn-1");
  input(cp, "#freetext-title", "Chant de test");
  cp.d.querySelector("#freetext-editable").textContent =
    "Premier couplet\nDeuxième ligne\n\nRefrain";
  click(cp, "#btn-song-slides");
  check("Song paragraphs become separate, numbered slides", () => {
    const items = JSON.parse(cp.w.localStorage.getItem("verseobs_queue")).items;
    assert.equal(items.length, 4);
    assert.equal(items[2].subtitle, "1 / 2");
    assert.equal(items[3].text, "Refrain");
  });
  click(cp, '[data-ft-preset="annonce"]');
  input(cp, "#freetext-style-container [data-setting=fontSize]", "51");
  click(cp, "#btn-free-show");
  await until(
    () =>
      output.d.documentElement.style.getPropertyValue("--font-size") === "51px",
    "free-text style sent",
  );
  check("Free-text broadcast uses its independent style", () => {
    assert.equal(
      output.d
        .querySelector("#verse-container")
        .classList.contains("lower-third"),
      true,
    );
    assert.equal(
      JSON.parse(cp.w.localStorage.getItem("verseobs_settings")).fontSize,
      cp.w.VerseObs.DEFAULTS.fontSize,
    );
  });
  const row = (key) =>
    cp.d
      .querySelector("#settings-container [data-setting=" + key + "]")
      .closest(".cp-setting-row");
  check("The antenne layout hides card-only settings", () => {
    assert.equal(row("refPosition").hidden, true);
    assert.equal(row("borderRadius").hidden, true);
    assert.match(row("refBgColor").textContent, /Accent/);
  });
  input(cp, "#settings-container [data-setting=layout]", "carte", "change");
  check("Choosing the framed card brings its settings back", () => {
    assert.equal(row("refPosition").hidden, false);
    assert.equal(row("borderRadius").hidden, false);
    assert.equal(cp.w.VerseObs && JSON.parse(cp.w.localStorage.getItem("verseobs_settings")).layout, "carte");
  });
  input(cp, "#settings-container [data-setting=layout]", "antenne", "change");
  input(cp, "#settings-container [data-setting=fontSize]", "42");
  await wait(150);
  check("Changing the Bible style does not restyle an on-air song", () =>
    assert.equal(
      output.d.documentElement.style.getPropertyValue("--font-size"),
      "51px",
    ),
  );
  const songBackup = cp.w.VerseObs.Backup.validate({
    app: "verseobs",
    version: 1,
    data: {
      verseobs_freetext_style: cp.w.localStorage.getItem(
        "verseobs_freetext_style",
      ),
    },
  });
  check("Backup preserves independent song settings", () =>
    assert.equal(JSON.parse(songBackup.verseobs_freetext_style).fontSize, 51),
  );
  const imported = {
    app: "verseobs-session",
    version: 1,
    name: "Session reçue",
    items: [{ type: "text", text: "Texte importé", title: "Accueil" }],
  };
  const fileInput = cp.d.querySelector("#session-file");
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [
      { size: 400, text: () => Promise.resolve(JSON.stringify(imported)) },
    ],
  });
  fileInput.dispatchEvent(new cp.w.Event("change"));
  await until(
    () =>
      JSON.parse(cp.w.localStorage.getItem("verseobs_queue")).items.length ===
      5,
    "import",
  );
  check("Session import validates and preserves existing prepared work", () => {
    assert.equal(cp.d.querySelector("#session-name").value, "Session reçue");
    assert.equal(
      JSON.parse(cp.w.localStorage.getItem("verseobs_queue")).items[0]
        .reference,
      "Jean 3:16-18",
    );
  });
  click(cp, "#btn-hide");
  await until(() => !output.d.querySelector(".verse-card"), "hide");
  check("Hide clears the output and acknowledged on-air state", () => {
    const bar = cp.d.querySelector("#onair-bar");
    // The program strip stays in place (no layout shift) and says it is empty.
    assert.equal(bar.hidden, false);
    assert.equal(bar.dataset.state, "off");
    assert.equal(cp.d.querySelector("#onair-ref").textContent, "");
    assert.equal(
      cp.d.querySelector(".cp-onair-label").textContent,
      "Rien à l’antenne",
    );
  });
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "show_verse",
    text: "Ancien habillage",
    reference: "Jean 1:1",
    settings: { template: "studio", animation: "none", fontSize: 40 },
  });
  await until(
    () => output.d.querySelector(".verse-reference")?.textContent === "Jean 1:1",
    "legacy style shown",
  );
  check("A style saved before the antenne layout still renders as a card", () =>
    assert(
      output.d
        .querySelector("#verse-container")
        .classList.contains("layout-carte"),
    ),
  );
  output.w.VerseObs.DisplayApp.handleMessage({ type: "hide" });
  await until(() => !output.d.querySelector(".verse-card"), "legacy hidden");
  // Pre-existing: a background value is placed inside url("…"). Only a picture
  // imported by the Studio (a base64 data URL) may get there.
  const bg = () => output.d.documentElement.style.getPropertyValue("--bg-image");
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "update_style",
    settings: { layout: "antenne", bgImage: 'x"), url("https://evil.example/t.png' },
  });
  // The OBS machine's own « reduce motion » setting is shown to the operator.
  output.w.matchMedia = (q) => ({ matches: /reduce/.test(q) });
  output.w.VerseObs.DisplayApp.handleMessage({ type: "ping" });
  await until(() => cp.d.querySelector("#program-note")?.hidden === false, "reduced shown");
  check("The Studio says when the OBS machine reduces animations", () =>
    assert.match(cp.d.querySelector("#program-note").textContent, /animations réduites/i),
  );
  output.w.matchMedia = () => ({ matches: false });
  output.w.VerseObs.DisplayApp.handleMessage({ type: "ping" });
  await until(() => cp.d.querySelector("#program-note").hidden === true, "reduced cleared");
  check("A background that is not an imported picture is refused", () =>
    assert.equal(bg(), "none"),
  );
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "update_style",
    settings: { layout: "antenne", bgImage: "data:image/png;base64,iVBORw0KGgo=" },
  });
  check("An imported picture still becomes the background", () =>
    assert.equal(bg(), 'url("data:image/png;base64,iVBORw0KGgo=")'),
  );
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "update_style",
    settings: { layout: "antenne", bgImage: "" },
  });
  // Review 3: a colour is only a colour. A value that could make the output
  // load something (url(), image-set() …) is refused and the default colour
  // kept: on the output itself, at import and at a style update.
  const Vc = cp.w.VerseObs;
  const cssVar = (n) => output.d.documentElement.style.getPropertyValue(n);
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "update_style",
    settings: {
      layout: "antenne",
      refBgColor: "url(https://evil.example/r.png)",
      textColor: "image-set('https://evil.example/t.png' 1x)",
      highlightColor: "#123456",
    },
  });
  check("The output keeps the default for a colour that is not one", () => {
    assert.equal(cssVar("--ref-bg-color"), Vc.DEFAULTS.refBgColor);
    assert.equal(cssVar("--text-color"), Vc.DEFAULTS.textColor);
    assert.equal(cssVar("--highlight-color"), "#123456");
  });
  output.w.VerseObs.DisplayApp.handleMessage({
    type: "update_style",
    settings: { layout: "antenne", highlightColor: Vc.DEFAULTS.highlightColor },
  });
  const importedColours = Vc.Backup.validate({
    app: "verseobs",
    version: 1,
    data: {
      verseobs_settings: JSON.stringify({ refBgColor: "url(https://evil.example/i.png)", textColor: "#123456" }),
      verseobs_freetext_style: JSON.stringify({ bgColor: "image-set('https://evil.example/j.png' 1x)" }),
    },
  });
  check("An imported backup keeps the default for a colour that is not one", () => {
    assert.equal(JSON.parse(importedColours.verseobs_settings).refBgColor, Vc.DEFAULTS.refBgColor);
    assert.equal(JSON.parse(importedColours.verseobs_settings).textColor, "#123456");
    assert.equal(JSON.parse(importedColours.verseobs_freetext_style).bgColor, Vc.FREETEXT_DEFAULTS.bgColor);
  });
  cp.w.localStorage.setItem("verseobs_colour_probe", JSON.stringify({ refColor: "url(https://evil.example/s.png)" }));
  const probeStyle = new Vc.Settings({ storageKey: "verseobs_colour_probe" });
  probeStyle.load();
  const loadedRef = probeStyle.getAll().refColor;
  probeStyle.update("refBgColor", "url(https://evil.example/u.png)");
  check("Stored or updated, a colour that is not one takes the default in the Studio", () => {
    assert.equal(loadedRef, Vc.DEFAULTS.refColor);
    assert.equal(probeStyle.getAll().refBgColor, Vc.DEFAULTS.refBgColor);
  });
  cp.w.localStorage.removeItem("verseobs_colour_probe");
  check("Colours are hex, rgb/rgba, hsl/hsla or colour names only", () => {
    for (const good of ["#f2b544", "#FFF", "#11223344", "rgb(242, 181, 68)", "rgba(0,0,0,.5)", "rgb(10% 20% 30% / 0.4)", "hsl(40 87% 61%)", "hsla(40, 87%, 61%, 0.8)", "tomato", "transparent", "RebeccaPurple"])
      assert.equal(Vc.isColor(good), true, good);
    for (const bad of ["url(http://evil.example/a.png)", "#f2b544 url(x)", "image-set('x.png' 1x)", "var(--x)", "rgb(1,2,3) url(x)", "red;background:url(x)", "linear-gradient(red, blue)", "rgb(1,2)", "#ggg", "", 42, null])
      assert.equal(Vc.isColor(bad), false, String(bad));
  });
  // Race regression: hide must win even during a long entrance transition.
  input(cp, "#settings-container [data-setting=animation]", "fade", "change");
  input(cp, "#settings-container [data-setting=animationDuration]", "1000");
  click(cp, "#btn-show");
  click(cp, "#btn-hide");
  await wait(1250);
  check("A fast hide cannot be lost during an entrance animation", () =>
    assert.equal(output.d.querySelector(".verse-card"), null),
  );
  const sanitized = cp.w.VerseObs.sanitizeHtml(
    '<img src=x onerror="alert(1)"><b onclick="x()">Titre</b><div>Ligne 2</div><script>x()</script>',
  );
  check("Imported rich text cannot keep executable markup", () => {
    assert(!/img|script|onclick|onerror/.test(sanitized));
    assert(sanitized.includes("<b>Titre</b>"));
    assert(sanitized.includes("<br>"));
  });
  const backup = cp.w.VerseObs.Backup;
  const validated = backup.validate({
    app: "verseobs",
    version: 1,
    data: {
      verseobs_session_name: "Équipe",
      verseobs_msg: JSON.stringify({ type: "show_text", text: "stale" }),
    },
  });
  check(
    "Restoring a backup never restores transient broadcast commands",
    () => {
      assert.equal(validated.verseobs_session_name, "Équipe");
      assert(!("verseobs_msg" in validated));
    },
  );
  let storage = {
    verseobs_settings: '{"fontSize":28}',
    verseobs_history: "[]",
  };
  const mockStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => {
      if (k === "verseobs_history" && v !== "[]") throw new Error("Quota");
      storage[k] = v;
    },
    removeItem: (k) => delete storage[k],
  };
  check("A failed backup import rolls back prior successful writes", () => {
    assert.throws(() =>
      backup.apply(
        {
          app: "verseobs",
          version: 1,
          data: {
            verseobs_settings: JSON.stringify({ fontSize: 40 }),
            verseobs_history: JSON.stringify([
              { reference: "Jean 3:16", text: "x" },
            ]),
          },
        },
        mockStorage,
      ),
    );
    assert.equal(storage.verseobs_settings, '{"fontSize":28}');
    assert.equal(storage.verseobs_history, "[]");
  });
  check("No application script errors during the complete workflow", () => {
    assert.deepEqual(
      cp.errors.map((e) => e.message),
      [],
    );
    assert.deepEqual(
      output.errors.map((e) => e.message),
      [],
    );
  });
  // Data and protocol regression coverage.
  const Q = cp.w.VerseObs.Queue;
  const q = new Q();
  q.replace([
    { type: "text", text: "A" },
    { type: "text", text: "B" },
    { type: "text", text: "C" },
  ]);
  q.select(2);
  q.remove(2);
  check(
    "Removing the final selected item selects its immediate predecessor",
    () => assert.equal(q.getState().current, 2),
  );
  q.select(1);
  q.move(1, 0);
  check("Reordering preserves the selected item", () =>
    assert.equal(q.getState().current, 1),
  );
  check("Malformed conductor imports are rejected before mutation", () =>
    assert.throws(() => q.replace([{ type: "bad", text: "x" }])),
  );
  check("Static server never exposes repository internals", () => {});
  for (const route of [
    "/.git/config",
    "/package.json",
    "/assets/../../package.json",
    "/node_modules/ws/package.json",
  ])
    assert.equal((await fetch(origin + route)).status, 404);
  const forbidden = await new Promise((resolve) => {
    const socket = new WebSocket("ws://127.0.0.1:" + PORT + "/verseobs-relay", {
      origin: "https://untrusted.example",
    });
    socket.on("unexpected-response", (req, res) => {
      resolve(res.statusCode);
      socket.terminate();
    });
    socket.on("error", () => {});
  });
  check("Local relay rejects commands from other web origins", () =>
    assert.equal(forbidden, 403),
  );
  await testBilingual(cp, output);
  await testPlan(cp, output);
  await testRemote(cp, output);
  await testDedup();
  require("./channel-clock")(check);
  require("./channel-style")(check);
  await require("./channel-tiebreak")(check);
  require("./color-normalization")(check);
  console.log("\n✓ Studio integration: " + passed + " checks passed.");
}
async function testBilingual(cp, output) {
  click(cp, "#tab-btn-0");
  input(cp, "#version-select", "lsg", "change");
  await until(
    () => cp.d.querySelector("#version-select").disabled === false,
    "primary version loaded",
  );
  input(cp, "#settings-container [data-setting=animation]", "none", "change");
  input(cp, "#search-input", "Jean 3:16-18");
  click(cp, "#bilingual-toggle");
  await until(
    () =>
      cp.d.querySelector("#secondary-text").value.includes("For God so loved"),
    "English translation prepared",
  );
  check(
    "FR and EN ranges are prepared together with the English reference",
    () => {
      assert(
        cp.d
          .querySelector("#secondary-text")
          .value.includes("condemned already"),
      );
      assert(
        cp.d
          .querySelector("#secondary-reference")
          .textContent.endsWith("3:16-18"),
      );
      assert.equal(cp.d.querySelector("#btn-show").disabled, false);
    },
  );
  click(cp, "#btn-show");
  await until(
    () => output.d.querySelector(".verse-secondary-text"),
    "bilingual broadcast",
  );
  check(
    "A real output receives French above English with both version labels",
    () => {
      const texts = output.d.querySelectorAll(".verse-text");
      assert(texts[0].textContent.includes("Dieu a tant aimé"));
      assert(texts[1].textContent.includes("For God so loved"));
      assert.equal(
        output.d.querySelectorAll(".verse-translation-label").length,
        2,
      );
      assert.equal(output.d.querySelector(".verse-secondary").lang, "en");
    },
  );
  const live = output.d.querySelector(".verse-secondary-text").textContent;
  input(cp, "#secondary-version", "dby", "change");
  await until(
    () =>
      cp.d.querySelector("#secondary-version-label").textContent ===
      "Darby English",
    "secondary changed",
  );
  await wait(150);
  check("Changing the second version never replaces live content", () =>
    assert.equal(
      output.d.querySelector(".verse-secondary-text").textContent,
      live,
    ),
  );
  input(cp, "#secondary-text", "Edited English translation");
  click(cp, "#btn-show");
  await until(
    () =>
      output.d.querySelector(".verse-secondary-text")?.textContent ===
      "Edited English translation",
    "edited second translation",
  );
  click(cp, "#btn-add-queue");
  const stored = JSON.parse(
    cp.w.localStorage.getItem("verseobs_queue"),
  ).items.at(-1);
  const roundtrip = cp.w.VerseObs.Queue.validateItems(
    JSON.parse(JSON.stringify([stored])),
  )[0];
  check("Conductor export/import retains the exact edited translation", () => {
    assert.equal(roundtrip.secondary.text, "Edited English translation");
    assert.equal(roundtrip.secondary.version, "Darby English");
  });
  check("History retains both translations", () =>
    assert.equal(
      JSON.parse(cp.w.localStorage.getItem("verseobs_history"))[0].secondary
        .text,
      "Edited English translation",
    ),
  );
  const backup = cp.w.VerseObs.Backup.validate({
    app: "verseobs",
    version: 1,
    data: {
      verseobs_bilingual: cp.w.localStorage.getItem("verseobs_bilingual"),
    },
  });
  check("Backup retains the bilingual version choice", () =>
    assert.equal(JSON.parse(backup.verseobs_bilingual).version, "dby"),
  );
  check(
    "Imported second translations reject invalid payloads and strip executable markup",
    () => {
      assert.throws(() =>
        cp.w.VerseObs.Queue.validateItems([
          { type: "verse", text: "test", secondary: { text: 42 } },
        ]),
      );
      const value = cp.w.VerseObs.validateSecondary({
        text: "safe",
        html: '<script>bad()</script><b onclick="bad()">safe</b>',
      });
      assert.equal(value.html, "<b>safe</b>");
    },
  );
  input(cp, "#secondary-version", "lsg", "change");
  check("Selecting the same version blocks accidental duplicate output", () =>
    assert.equal(cp.d.querySelector("#btn-show").disabled, true),
  );
  input(cp, "#secondary-version", "kjv", "change");
  await until(
    () => cp.d.querySelector("#btn-show").disabled === false,
    "KJV ready",
  );
  const proto = cp.w.VerseObs.BibleLoader.prototype,
    original = proto.getVerse;
  proto.getVerse = function (id, book, chapter, verse) {
    if (id === "kjv" && Number(verse) === 18) return null;
    return original.apply(this, arguments);
  };
  click(cp, "#secondary-retry");
  check("A missing verse blocks a partially translated range", () => {
    assert(cp.d.querySelector("#btn-show").disabled);
    assert(cp.d.querySelector("#btn-add-queue").disabled);
    assert(
      cp.d
        .querySelector("#bilingual-status")
        .textContent.includes("pas complet"),
    );
  });
  proto.getVerse = original;
  click(cp, "#secondary-retry");
  await until(
    () => cp.d.querySelector("#btn-show").disabled === false,
    "retry restored",
  );
  click(cp, "#bilingual-toggle");
  check("Disabling bilingual mode hides the second editor", () =>
    assert(cp.d.querySelector("#secondary-preparation").hidden),
  );
  click(cp, "#btn-show");
  await until(
    () => !output.d.querySelector(".verse-secondary-text"),
    "single version restored",
  );
  check("The next explicit broadcast returns to a single translation", () =>
    assert.equal(output.d.querySelectorAll(".verse-text").length, 1),
  );
  check("No script errors in the bilingual workflow", () =>
    assert.equal(cp.errors.length + output.errors.length, 0),
  );
}
async function testPlan(cp, output) {
  click(cp, "#tab-btn-2");
  click(cp, "#btn-clear-queue");
  const liveText = output.d.querySelector(".verse-text").textContent;
  click(cp, "#btn-open-plan");
  check("« Coller un plan » opens from the conductor", () =>
    assert.equal(cp.d.querySelector("#plan-overlay").hidden, false),
  );
  input(
    cp,
    "#plan-text",
    [
      "Culte du 25 octobre à 10:30",
      "Lecture : Ps 23",
      "1. Jean 3:16 ; 5:24",
      "2. Esaie 40:31 et Rm 8.28-30",
      "Appel : Ap 21:4. Puis relire 3:16 · Jean 22:1",
    ].join("\n"),
  );
  const labels = () =>
    [...cp.d.querySelectorAll(".plan-item strong")].map((n) => n.textContent);
  check("Each keystroke lists the references in reading order", () =>
    assert.deepEqual(labels(), [
      "Psaumes 23",
      "Jean 3:16",
      "Jean 5:24",
      "Ésaïe 40:31",
      "Romains 8:28-30",
      "Apocalypse 21:4",
    ]),
  );
  check("Each passage shows its text and its original line", () => {
    const first = cp.d.querySelector(".plan-item");
    assert(first.textContent.includes("L’Éternel est mon berger"));
    assert(first.textContent.includes("Chapitre entier"));
    assert.equal(
      first.querySelector(".plan-line").textContent,
      "Ligne 2 · Lecture : Ps 23",
    );
    assert.equal(first.querySelector(".plan-line mark").textContent, "Ps 23");
  });
  check("Unrecognised or out-of-range lines are reported, not added", () => {
    const issues = [...cp.d.querySelectorAll(".plan-issue")].map(
      (n) => n.textContent,
    );
    assert.equal(issues.length, 2);
    assert(issues[0].includes("3:16") && issues[0].includes("Livre non précisé"));
    assert(issues[1].includes("Jean 22:1") && issues[1].includes("21 chapitres"));
    assert(!issues.join().includes("10:30"));
  });
  const boxes = cp.d.querySelectorAll(".plan-item input");
  boxes[2].checked = false;
  boxes[2].dispatchEvent(new cp.w.Event("change", { bubbles: true }));
  check("Unchecking a passage updates the add button", () =>
    assert.equal(
      cp.d.querySelector("#plan-submit").textContent.trim(),
      "Ajouter 5 passages au conducteur",
    ),
  );
  cp.d
    .querySelector("#plan-text")
    .dispatchEvent(
      new cp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  check("Escape closes the dialog without touching the live output", () => {
    assert.equal(cp.d.querySelector("#plan-overlay").hidden, true);
    assert.equal(output.d.querySelector(".verse-text").textContent, liveText);
  });
  click(cp, "#btn-open-plan");
  click(cp, "#plan-submit");
  const queued = () =>
    JSON.parse(cp.w.localStorage.getItem("verseobs_queue")).items;
  check("Selected passages are added to the conductor in order", () => {
    assert.deepEqual(
      queued().map((i) => i.reference),
      ["Psaumes 23", "Jean 3:16", "Ésaïe 40:31", "Romains 8:28-30", "Apocalypse 21:4"],
    );
    assert(queued()[0].text.includes("Il me fait reposer"));
    assert(queued()[0].text.includes("maison de l’Éternel"));
    assert.equal(cp.d.querySelector("#plan-overlay").hidden, true);
  });
  click(cp, "#tab-btn-0");
  click(cp, "#bilingual-toggle");
  await until(
    () => cp.d.querySelector("#secondary-text").value.trim() !== "",
    "second version ready",
  );
  click(cp, "#btn-open-plan");
  input(cp, "#plan-text", "Jean 3:16-17");
  await wait(50);
  click(cp, "#plan-submit");
  check("With « Deux versions » on, pasted passages carry both translations", () => {
    const last = queued().at(-1);
    assert.equal(last.reference, "Jean 3:16-17");
    assert(last.secondary.text.includes("For God so loved"));
    assert.equal(last.secondary.reference, "John 3:16-17");
  });
  click(cp, "#bilingual-toggle");
  const q = new cp.w.VerseObs.Queue({});
  q.replace(Array.from({ length: 499 }, (_, i) => ({ type: "text", text: "T" + i })));
  check("A plan that would exceed 500 items is refused without partial add", () => {
    assert.throws(() =>
      q.addMany([
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ]),
    );
    assert.equal(q.getState().total, 499);
  });
}

function remoteSocket(url, originHeader) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, { origin: originHeader });
    const messages = [];
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    socket.on("open", () => resolve({ socket, messages, status: 101 }));
    socket.on("unexpected-response", (req, res) => {
      resolve({ status: res.statusCode });
      socket.terminate();
    });
    socket.on("error", () => resolve({ status: 0 }));
  });
}
async function testRemote(cp, output) {
  const logged = [];
  const spies = ["log", "info", "warn", "error"].map((name) => {
    const original = console[name];
    console[name] = (...args) => {
      logged.push(args.join(" "));
      original.apply(console, args);
    };
    return () => (console[name] = original);
  });
  try {
    await runRemoteChecks(cp, output, logged);
  } finally {
    spies.forEach((restore) => restore());
  }
}
async function runRemoteChecks(cp, output, logged) {
  check("Without --lan, nothing is exposed and the relay is unchanged", () =>
    assert.equal(server.remote.status().active, false),
  );
  assert.equal((await fetch(origin + "/remote.html")).status, 404);
  const loopbackRemote = await remoteSocket(
    "ws://127.0.0.1:" + PORT + "/verseobs-remote",
    origin,
  );
  check("The loopback server never accepts a phone remote", () =>
    assert.equal(loopbackRemote.status, 403),
  );

  // Prepare a conductor: Ps 23, Jean 3:16, Rm 8:28-30 and Jean 3:16 again
  // (a plan may quote the same verse twice: only the row sent is on air).
  click(cp, "#tab-btn-2");
  click(cp, "#btn-clear-queue");
  click(cp, "#btn-open-plan");
  input(cp, "#plan-text", "Ps 23\nJean 3:16\nRm 8.28-30\nJean 3:16");
  click(cp, "#plan-submit");
  click(cp, ".cp-queue-item");

  click(cp, "#tab-btn-5");
  await until(
    () => cp.d.querySelector("#remote-enable").disabled === false,
    "remote button ready",
  );
  click(cp, "#remote-enable");
  await until(
    () => cp.d.querySelector("#remote-on").hidden === false,
    "LAN mode active",
  );
  const pairing = new URL(cp.d.querySelector("#remote-url").value);
  const code = pairing.searchParams.get("code");
  const lan = "http://" + pairing.host;
  const wsBase = "ws://" + pairing.host + "/verseobs-remote";
  check("Enabling shows a local QR code, a strong code and a warning", () => {
    assert(cp.d.querySelector("#remote-qr svg path"));
    assert(/^[A-Za-z0-9_-]{24,}$/.test(code));
    assert(
      cp.d.querySelector(".remote-warning").textContent.includes("Mode réseau local actif"),
    );
    assert.equal(cp.d.querySelector("#remote-header-badge").hidden, false);
  });

  const noCode = await remoteSocket(wsBase, lan);
  const badCode = await remoteSocket(wsBase + "?code=" + "x".repeat(24), lan);
  const foreign = await remoteSocket(
    wsBase + "?code=" + code,
    "http://evil.example",
  );
  check("A remote without a valid code is refused", () => {
    assert.equal(noCode.status, 401);
    assert.equal(badCode.status, 401);
    assert.equal(foreign.status, 403);
  });
  const lanStatuses = [];
  for (const route of [
    "/control_panel.html",
    "/data/bibles/lsg.json",
    "/assets/js/control/app.js",
    "/remote.html",
    "/api/remote/check?code=" + code,
  ])
    lanStatuses.push((await fetch(lan + route)).status);
  check("The LAN listener serves the remote page only", () =>
    assert.deepEqual(lanStatuses, [404, 404, 404, 200, 204]),
  );

  // A real remote page, as on the phone.
  const phone = await page(pairing.pathname.slice(1) + pairing.search, lan);
  await until(
    () =>
      phone.d.body.dataset.link === "online" &&
      phone.d.querySelector("#position").textContent === "1 / 4",
    "remote online",
  );
  check("The remote shows the session, selection, next item and output", () => {
    assert.equal(
      phone.d.querySelector("#session-name").textContent,
      cp.d.querySelector("#session-name").value,
    );
    assert.equal(phone.d.querySelector("#current-ref").textContent, "Psaumes 23");
    assert.equal(phone.d.querySelector("#next-ref").textContent, "Jean 3:16");
    assert.notEqual(phone.d.querySelector("#output").dataset.state, "unknown");
    assert(!phone.w.location.search.includes(code));
  });
  phone.d.querySelector("#btn-next").click();
  await until(
    () => phone.d.querySelector("#current-ref").textContent === "Jean 3:16",
    "remote next",
  );
  phone.d.querySelector("#btn-show").click();
  await until(
    () => output.d.querySelector(".verse-reference")?.textContent === "Jean 3:16",
    "remote broadcast",
  );
  check("End to end: Suivant then Diffuser puts the passage on the source", () =>
    assert(
      output.d.querySelector(".verse-text").textContent.includes("Dieu a tant aimé"),
    ),
  );
  await until(
    () => phone.d.querySelector("#output").dataset.state === "confirmed",
    "output confirmed on the phone",
  );
  check("The phone shows « Sortie confirmée » like the Studio", () =>
    assert.equal(phone.d.querySelector("#output-label").textContent, "Sortie confirmée"),
  );
  // The phone may still show the previous confirmed broadcast for a moment:
  // wait for the confirmation of this one on the selected item.
  await until(
    () =>
      phone.d.querySelector(".slot-current").classList.contains("is-live") &&
      phone.d.body.dataset.output === "confirmed",
    "phone tally",
  );
  check("The phone marks the live selection in program colours", () => {
    assert.equal(phone.d.body.dataset.output, "confirmed");
    assert.equal(phone.d.querySelector("#current-live").hidden, false);
    assert.equal(phone.d.querySelector("#current-live").textContent, "À l’antenne");
  });
  const liveRows = () =>
    Array.from(cp.d.querySelectorAll("#queue-container .cp-queue-item.is-live"));
  const queueRows = () =>
    Array.from(cp.d.querySelectorAll("#queue-container .cp-queue-item"));
  check("The conductor marks the item on air, distinct from the selection", () => {
    assert.equal(liveRows().length, 1, "the duplicate « Jean 3:16 » is not on air");
    assert.equal(liveRows()[0], queueRows()[1]);
    assert.equal(liveRows()[0].dataset.label, "Jean 3:16");
    assert(liveRows()[0].classList.contains("cp-queue-current"));
    assert.match(liveRows()[0].getAttribute("aria-label"), /à l’antenne/);
    assert.equal(cp.d.querySelector("#queue-selection-badge").textContent, "À L’ANTENNE");
  });
  phone.d.querySelector("#btn-prev").click();
  await until(
    () => phone.d.querySelector("#current-ref").textContent === "Psaumes 23",
    "remote previous",
  );
  check("Moving the selection keeps the program tally on the live item", () => {
    assert.equal(liveRows().length, 1);
    assert.equal(liveRows()[0].dataset.label, "Jean 3:16");
    assert(!liveRows()[0].classList.contains("cp-queue-current"));
    assert.equal(cp.d.querySelector("#queue-selection-badge").textContent, "PRÊT À DIFFUSER");
    assert.equal(phone.d.querySelector("#current-live").hidden, true);
    assert(!phone.d.querySelector(".slot-current").classList.contains("is-live"));
  });
  // Select the second « Jean 3:16 », never sent: nothing claims it is live.
  for (const ref of ["Jean 3:16", "Romains 8:28-30", "Jean 3:16"]) {
    phone.d.querySelector("#btn-next").click();
    await until(
      () => phone.d.querySelector("#current-ref").textContent === ref,
      "remote next to " + ref,
    );
  }
  await until(
    () => phone.d.querySelector("#position").textContent === "4 / 4",
    "duplicate selected",
  );
  await wait(150);
  check("A duplicate of the live verse is not marked on air (Studio and phone)", () => {
    assert.equal(liveRows().length, 1);
    assert.equal(liveRows()[0], queueRows()[1]);
    assert(!queueRows()[3].classList.contains("is-live"));
    assert.doesNotMatch(queueRows()[3].getAttribute("aria-label"), /à l’antenne/);
    assert.equal(cp.d.querySelector("#queue-selection-badge").textContent, "PRÊT À DIFFUSER");
    assert.equal(phone.d.querySelector("#current-live").hidden, true);
    assert(!phone.d.querySelector(".slot-current").classList.contains("is-live"));
  });
  phone.d.querySelector("#btn-hide").click();
  await until(() => !output.d.querySelector(".verse-text"), "remote hide");
  check("Masquer from the phone clears the output", () =>
    assert.equal(output.d.querySelector(".verse-text"), null),
  );
  await until(() => liveRows().length === 0, "conductor tally cleared");
  check("Once hidden, nothing in the conductor claims to be on air", () => {
    assert.equal(cp.d.querySelector("#onair-bar").dataset.state, "off");
    assert.equal(cp.d.querySelectorAll(".cp-queue-item.is-live-pending").length, 0);
  });

  const raw = await remoteSocket(wsBase + "?code=" + code, lan);
  const reply = async (msg) => {
    const before = raw.messages.length;
    raw.socket.send(JSON.stringify(msg));
    await until(
      () => raw.messages.slice(before).some((m) => m.type === "ack" || m.type === "error"),
      "remote reply",
    );
    return raw.messages.slice(before).find((m) => m.type === "ack" || m.type === "error");
  };
  const attempts = [
    { type: "show_verse", text: "PIRATE", reference: "PIRATE" },
    { type: "command", command: "update_style", settings: { fontSize: 1 } },
    { type: "remote_admin", action: "disable" },
    { type: "command", command: "preview" },
  ];
  const answers = [];
  for (const attempt of attempts) answers.push(await reply(attempt));
  const smuggled = await reply({ type: "command", command: "show", text: "PIRATE", reference: "PIRATE" });
  await wait(150);
  check("Only previous, next, show and hide are accepted from a remote", () => {
    assert(answers.every((a) => a.type === "error" && a.reason === "forbidden"));
    assert.equal(smuggled.type, "ack");
    assert(!output.d.body.textContent.includes("PIRATE"));
    assert.equal(server.remote.status().active, true);
  });

  const burst = await remoteSocket(wsBase + "?code=" + code, lan);
  for (let i = 0; i < 14; i++)
    burst.socket.send(JSON.stringify({ type: "command", command: "hide", ref: "b" + i }));
  await until(
    () => burst.messages.filter((m) => m.ref && m.ref.startsWith("b")).length === 14,
    "burst replies",
  );
  const limited = burst.messages.filter((m) => m.reason === "rate_limited").length;
  const flood = await remoteSocket(wsBase + "?code=" + code, lan);
  const closed = new Promise((resolve) => flood.socket.on("close", (c) => resolve(c)));
  for (let i = 0; i < 40; i++) flood.socket.send("{}");
  const floodCode = await closed;
  check("Commands are rate limited and a flood closes the connection", () => {
    assert(limited >= 4, "rate limited replies: " + limited);
    assert.equal(floodCode, 4429);
  });

  const revoked = new Promise((resolve) => raw.socket.on("close", (c) => resolve(c)));
  click(cp, "#remote-revoke");
  const revokedCode = await revoked;
  await until(
    () => new URL(cp.d.querySelector("#remote-url").value).searchParams.get("code") !== code,
    "new code shown",
  );
  const newCode = new URL(cp.d.querySelector("#remote-url").value).searchParams.get("code");
  const oldAgain = await remoteSocket(wsBase + "?code=" + code, lan);
  await until(() => phone.d.body.dataset.link === "refused", "phone told");
  const fresh = await remoteSocket(wsBase + "?code=" + newCode, lan);
  check("Revoking disconnects remotes and refuses the old code", () => {
    assert.equal(revokedCode, 4401);
    assert.equal(oldAgain.status, 401);
    assert.equal(fresh.status, 101);
    assert(phone.d.querySelector("#banner").textContent.includes("révoqué"));
  });
  fresh.socket.close();
  burst.socket.close();

  check("No pairing code is ever written to the console", () => {
    const text = logged.join("\n");
    assert(!text.includes(code) && !text.includes(newCode));
  });
  click(cp, "#remote-disable");
  await until(() => server.remote.status().active === false, "LAN off");
  const afterOff = await remoteSocket(wsBase + "?code=" + newCode, lan);
  check("Disabling closes the network listener", () =>
    assert.equal(afterOff.status, 0),
  );
  await until(
    () => cp.d.querySelector("#remote-on").hidden === true,
    "Studio shows off",
  );
  // Two free texts without a title are both « Texte libre »: the tally must
  // follow the row actually sent, not the label.
  click(cp, "#btn-clear-queue");
  click(cp, "#tab-btn-1");
  input(cp, "#freetext-title", "");
  for (const words of ["Premier texte sans titre", "Second texte sans titre"]) {
    cp.d.querySelector("#freetext-editable").textContent = words;
    cp.d.querySelector("#freetext-editable").dispatchEvent(new cp.w.Event("input", { bubbles: true }));
    click(cp, "#btn-free-add-queue");
  }
  click(cp, "#tab-btn-2");
  await until(() => queueRows().length === 2, "two untitled texts");
  queueRows()[1].click();
  click(cp, "#btn-queue-show");
  await until(
    () => (output.d.querySelector(".verse-text")?.textContent || "").includes("Second texte"),
    "second text shown",
  );
  await until(() => liveRows().length > 0, "untitled text confirmed");
  await wait(100);
  check("Two untitled free texts: only the one sent is on air", () => {
    assert.equal(liveRows().length, 1);
    assert.equal(liveRows()[0], queueRows()[1]);
    assert(!queueRows()[0].classList.contains("is-live-pending"));
  });
  click(cp, "#btn-hide");
  await until(() => !output.d.querySelector(".verse-card"), "untitled hidden");
  check("No script errors in the plan and remote workflows", () =>
    assert.equal(cp.errors.length + output.errors.length + phone.errors.length, 0),
  );
  phone.w.close();
}
async function testDedup() {
  let interval,
    storageCb,
    listener,
    delivered = 0;
  const backing = {};
  // This machine's clock as the channel reads it (moved back in one check).
  let clockShift = 0;
  const ctx = {
    console,
    Set,
    Date: { now: () => Date.now() + clockShift },
    Math,
    JSON,
    Object,
    location: { hostname: "example.test" },
    localStorage: {
      getItem: (k) => backing[k] || null,
      setItem: (k, v) => (backing[k] = v),
    },
    setInterval: (fn) => ((interval = fn), 1),
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    addEventListener: (k, fn) => {
      if (k === "storage") storageCb = fn;
    },
    removeEventListener: () => {},
    BroadcastChannel: class {
      constructor() {
        listener = this;
      }
      postMessage() {}
      close() {}
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ["constants", "channel"])
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../assets/js/shared/" + file + ".js"),
        "utf8",
      ),
      ctx,
    );
  const channel = new ctx.VerseObs.Channel({ autoPong: false });
  channel.onMessage(() => delivered++);
  const msg = {
    type: "show_text",
    id: "peer:1",
    sender: "peer",
    ts: Date.now(),
    text: "A",
  };
  listener.onmessage({ data: msg });
  storageCb({ key: "verseobs_msg", newValue: JSON.stringify(msg) });
  backing.verseobs_msg = JSON.stringify(msg);
  interval();
  check(
    "A command received through three transports is delivered only once",
    () => assert.equal(delivered, 1),
  );
  channel.destroy();
  // The poll reads only the last command written to localStorage: on a busy
  // machine it may hand over a later preview before BroadcastChannel (or a
  // storage event) delivers an earlier one. The earlier one must not come
  // back on the preview monitor afterwards; other commands are untouched.
  const got = [];
  const preview = new ctx.VerseObs.Channel({ autoPong: false });
  preview.onMessage((m) => got.push(m.type + " " + m.id));
  const from = (n, type) => ({
    type,
    id: "studio:" + n,
    sender: "studio",
    ts: Date.now(),
    text: "T" + n,
  });
  backing.verseobs_msg = JSON.stringify(from(7, "preview"));
  interval();
  listener.onmessage({ data: from(6, "preview") });
  storageCb({ key: "verseobs_msg", newValue: JSON.stringify(from(6, "preview")) });
  listener.onmessage({ data: from(7, "preview") });
  listener.onmessage({ data: from(5, "preview_hide") });
  listener.onmessage({ data: from(4, "update_style") });
  listener.onmessage({ data: from(9, "preview_hide") });
  listener.onmessage({ data: from(8, "preview") });
  check(
    "A preview delivered late by a slower transport never replaces a later one",
    () =>
      assert.deepEqual(got, [
        "preview studio:7",
        "update_style studio:4",
        "preview_hide studio:9",
      ]),
  );
  preview.destroy();

  // The program the same way (show a verse, show a text, hide): a Diffuser
  // delivered late must never put back on air a text hidden since, whoever
  // sent the two commands: one Studio, two Studio tabs, a reloaded Studio
  // (a new sender). Two senders' commands stamped in the same millisecond
  // are both legitimate: arriving in key order (stamp, sender, number), as
  // here, both are applied; the reverse order, and two outputs that get
  // them in opposite orders, are checked in channel-tiebreak.js.
  const program = [];
  const output = new ctx.VerseObs.Channel({ autoPong: false });
  const outputBC = listener;
  output.onMessage((m) => program.push(m.type + " " + m.id));
  const t = Date.now();
  const cmd = (sender, n, type, at) => ({ type, id: sender + ":" + n, sender, ts: t, at, text: "T" });
  // One Studio, Diffuser (9) then Masquer (10) in one task: the poll hands
  // Masquer over first, BroadcastChannel brings Diffuser later.
  backing.verseobs_msg = JSON.stringify(cmd("studio", 10, "hide", t + 2));
  interval();
  outputBC.onmessage({ data: cmd("studio", 9, "show_verse", t + 1) });
  // Tab B hid what tab A showed; A's Diffuser arrives after B's Masquer.
  outputBC.onmessage({ data: cmd("tabB", 3, "hide", t + 20) });
  outputBC.onmessage({ data: cmd("tabA", 50, "show_text", t + 19) });
  // Same millisecond, two senders.
  outputBC.onmessage({ data: cmd("tabA", 51, "show_verse", t + 30) });
  outputBC.onmessage({ data: cmd("tabB", 4, "hide", t + 30) });
  // A reloaded Studio hid; the Studio before the reload arrives late.
  outputBC.onmessage({ data: cmd("reloaded", 1, "hide", t + 41) });
  outputBC.onmessage({ data: cmd("tabA", 52, "show_verse", t + 40) });
  // A preview is another slot: it neither replaces nor is replaced by the program.
  outputBC.onmessage({ data: cmd("reloaded", 2, "preview", t + 45) });
  outputBC.onmessage({ data: cmd("tabA", 53, "show_text", t + 44) });
  // An invalid stamp (outside the Date range) is delivered but orders
  // nothing: unlike a genuine future clock, it cannot be followed.
  outputBC.onmessage({ data: cmd("odd", 1, "show_text", 1e16) });
  outputBC.onmessage({ data: cmd("reloaded", 3, "hide", t + 50) });
  check(
    "A Diffuser delivered late never puts back a hidden text (one Studio, two tabs, a reloaded Studio); same millisecond: both applied",
    () =>
      assert.deepEqual(program, [
        "hide studio:10",
        "hide tabB:3",
        "show_verse tabA:51",
        "hide tabB:4",
        "hide reloaded:1",
        "preview reloaded:2",
        "show_text tabA:53",
        "show_text odd:1",
        "hide reloaded:3",
      ]),
  );
  // This machine's clock goes back ten minutes. A real sender follows the
  // last stamp, including after a reload, not its newly lower wall clock.
  clockShift = -600e3;
  const later = new ctx.VerseObs.Channel({ autoPong: false });
  later.send({ type: "show_verse" });
  const afterJump = JSON.parse(backing.verseobs_msg);
  outputBC.onmessage({ data: afterJump });
  check("After the clock went back, a new command is still applied", () =>
    assert.equal(program[program.length - 1], "show_verse " + afterJump.id),
  );
  later.destroy();
  clockShift = 0;
  output.destroy();

  // Stamps of the commands sent: always later than every command the
  // channel has read or received (a reloaded Studio, another tab), one
  // after the other even within one millisecond. A genuine clock an hour
  // ahead is followed too: later commands never freeze until it catches up.
  backing.verseobs_msg = JSON.stringify(cmd("before-reload", 7, "show_verse", t + 5000));
  const studio = new ctx.VerseObs.Channel({ autoPong: false });
  const studioBC = listener;
  const sent = () => JSON.parse(backing.verseobs_msg).at;
  studio.send({ type: "show_verse" });
  const a1 = sent();
  studio.send({ type: "hide" });
  const a2 = sent();
  studioBC.onmessage({ data: cmd("other-tab", 1, "show_text", t + 9000) });
  studio.send({ type: "hide" });
  const a3 = sent();
  studioBC.onmessage({ data: cmd("odd", 2, "show_text", t + 3600e3) });
  studio.send({ type: "hide" });
  const a4 = sent();
  check(
    "Commands are stamped after everything read or received, one after the other, even after a clock an hour ahead",
    () => {
      assert.ok(a1 > t + 5000, "after the last command before the reload: " + (a1 - t));
      assert.ok(a2 > a1, "one after the other: " + [a1 - t, a2 - t]);
      assert.ok(a3 > t + 9000, "after another tab's command: " + (a3 - t));
      assert.ok(a4 > a3 && a4 > t + 3600e3, "an hour ahead is followed, never frozen: " + (a4 - t));
    },
  );
  studio.destroy();
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const w of windows) w.close();
    server.close();
  });
