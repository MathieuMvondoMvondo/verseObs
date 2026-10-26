"use strict";
// The output's style as the real display app builds it (review 6, N3): the
// real channel and display/app.js run in a sandbox; the renderer records
// the style the way Renderer.updateStyle applies it (only the properties
// given change). Studio pages are the real channel too (tests/channel-clock.js).
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { page } = require("./channel-clock");
const sources = ["shared/constants.js", "shared/channel.js", "display/app.js"].map((file) =>
  fs.readFileSync(path.join(__dirname, "../assets/js/" + file), "utf8"),
);
const PICTURE = "data:image/png;base64,iVBORw0KGgo=";

/** A real output (display/app.js): `search` is its URL query (\"?projector=1\"). */
function output(search = "", store = {}) {
  const o = { style: {}, calls: [] };
  let bc;
  const node = { classList: { add() {} }, addEventListener() {}, hidden: false };
  const ctx = {
    console, Set, Map, Math, JSON, Object, Number, String, Promise, URLSearchParams,
    Date,
    location: { hostname: "example.test", search, origin: "http://example.test" },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)) },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    document: {
      readyState: "complete",
      getElementById: () => node,
      createElement: () => Object.assign({}, node),
      addEventListener() {},
      body: { classList: { add() {} }, appendChild() {} },
      documentElement: { requestFullscreen: () => Promise.resolve() },
    },
    BroadcastChannel: class {
      constructor() {
        bc = this;
      }
      postMessage() {}
      close() {}
    },
  };
  ctx.window = ctx;
  ctx.parent = ctx;
  vm.createContext(ctx);
  vm.runInContext(sources[0], ctx);
  const apply = (s) => s && Object.keys(s).forEach((k) => s[k] !== undefined && (o.style[k] = s[k]));
  ctx.VerseObs.Renderer = function () {};
  ctx.VerseObs.Renderer.prototype = {
    layoutFrame: () => false,
    refit: () => false,
    updateStyle: apply,
    show(data, placed) {
      apply(data.style);
      o.calls.push("show " + (data.reference || data.title || data.text));
      if (placed) placed();
      return Promise.resolve(true);
    },
    hide() {
      o.calls.push("hide");
      return Promise.resolve(true);
    },
  };
  vm.runInContext(sources[1], ctx);
  vm.runInContext(sources[2], ctx);
  o.V = ctx.VerseObs;
  o.hear = (m) => bc.onmessage({ data: JSON.parse(JSON.stringify(m)) });
  return o;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

module.exports = async function testDisplayStyle(check) {
  {
    // U7 (reviewer's probe): a verse style change still in flight, then a
    // free text in the « Antenne » song style. The older verse style comes
    // last (the storage poll ran ahead): the channel keeps only what the
    // text did not set (refPosition). The text keeps its layout and its
    // background, on the OBS program and on a projector; the verse's
    // picture stored by the Studio never comes onto the text.
    const store = {};
    const studio = page(store);
    const obs = output("", { verseobs_bgimage: PICTURE }),
      projector = output("?projector=1", { verseobs_bgimage: PICTURE });
    const V = obs.V;
    const verse = Object.assign({}, V.DEFAULTS, { bgImage: "" });
    const free = Object.assign({}, V.FREETEXT_DEFAULTS, V.FREETEXT_STYLES.antenne.settings, { fontSize: 60, bgImage: "" });
    const style = studio.send({ type: "update_style", settings: verse });
    const text = studio.send({ type: "show_text", text: "Annonce", title: "Annonce", settings: free });
    obs.hear(text), projector.hear(text);
    await tick();
    const before = [Object.assign({}, obs.style), Object.assign({}, projector.style)];
    obs.hear(style), projector.hear(style);
    await tick();
    check("A verse style delivered after a newer free text changes nothing the text set: layout, background, projector size", () => {
      assert.equal(before[0].layout, "antenne", "precondition");
      const changed = [];
      for (const [o, b, name] of [[obs, before[0], "OBS"], [projector, before[1], "projector"]])
        for (const k of ["layout", "bgImage", "fontSize", "textColor", "position"])
          if (o.style[k] !== b[k]) changed.push(`${name} ${k}: ${String(b[k]).slice(0, 30)} → ${String(o.style[k]).slice(0, 30)}`);
      assert.deepEqual(changed, []);
      assert.equal(obs.style.refPosition, verse.refPosition, "the verse's own property still applies");
    });
  }
  {
    // Only a real older Studio's style is migrated: a complete style with
    // no layout and no patch mark (a Studio from before the antenne layout,
    // unstamped) still keeps its framed card and the stored picture.
    const obs = output("", { verseobs_bgimage: PICTURE });
    const legacy = { type: "update_style", id: "old:1", sender: "old", ts: Date.now(), settings: { template: "studio", fontSize: 40, textColor: "#ffffff", position: "lower-third" } };
    obs.hear(legacy);
    await tick();
    check("An older Studio's complete style without a layout keeps its card and the stored picture", () => {
      assert.equal(obs.style.layout, "carte");
      assert.equal(obs.style.bgImage, PICTURE);
      assert.equal(obs.style.fontSize, 40);
    });
  }
  {
    // A complete, valid style renders as sent: nothing added, nothing
    // migrated (same on the OBS program; the projector's own rules apply).
    const store = {};
    const studio = page(store);
    const obs = output("", { verseobs_bgimage: PICTURE });
    const full = Object.assign({}, obs.V.DEFAULTS, { fontSize: 52, bgImage: "" });
    obs.hear(studio.send({ type: "update_style", settings: full }));
    await tick();
    check("A complete, valid style reaches the renderer unchanged", () => assert.deepEqual(obs.style, full));
  }
};
module.exports.output = output;

if (require.main === module) {
  // Alone (RED/GREEN logs): every check runs, failures are listed.
  let failed = 0,
    passed = 0;
  module.exports((name, fn) => {
    try {
      fn();
      passed++;
      console.log("  ✓ " + name);
    } catch (e) {
      failed++;
      console.log("  ✗ " + name + "\n      " + e.message.split("\n")[0]);
    }
  }).then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  });
}
