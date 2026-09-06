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
const server = createServer(PORT);
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
async function page(route) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => {
    if (
      !e.message.includes("navigation") &&
      !e.message.includes("window.print")
    )
      errors.push(e);
  });
  const dom = await JSDOM.fromURL(origin + "/" + route, {
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
      40,
    );
  });
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
  check("Hide clears the output and acknowledged on-air state", () =>
    assert.equal(cp.d.querySelector("#onair-bar").hidden, true),
  );
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
  await testDedup();
  console.log("\n✓ Studio integration: " + passed + " checks passed.");
}
async function testDedup() {
  let interval,
    storageCb,
    listener,
    delivered = 0;
  const backing = {};
  const ctx = {
    console,
    Set,
    Date,
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
