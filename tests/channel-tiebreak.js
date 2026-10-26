"use strict";
// Review 5 (N2): two program commands stamped alike by two senders that
// had not heard each other yet (OBS's own browser and a Studio in Chrome,
// joined by the relay; two tabs within one millisecond, before the shared
// clock in localStorage reaches the other process). Every output must end
// on the same state, whatever order the transports hand them over in. The
// OBS program and a projector run the real display app over the real
// channel; only the renderer is a recorder.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { page } = require("./channel-clock");
const sources = ["shared/constants.js", "shared/channel.js", "display/app.js"].map((file) =>
  fs.readFileSync(path.join(__dirname, "../assets/js/" + file), "utf8"),
);

/** A real output (display/app.js): `search` is its URL query ("?projector=1"). */
function output(search, now) {
  const o = { calls: [], reports: [] };
  let bc;
  const node = { classList: { add() {} }, addEventListener() {}, hidden: false };
  const ctx = {
    console,
    Set,
    Map,
    Math,
    JSON,
    Object,
    Number,
    String,
    Promise,
    URLSearchParams,
    Date: { now },
    location: { hostname: "example.test", search, origin: "http://example.test" },
    localStorage: { getItem: () => null, setItem() {} },
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
      postMessage(m) {
        if (m.type === "output_state") o.reports.push(m);
      }
      close() {}
    },
  };
  ctx.window = ctx;
  ctx.parent = ctx;
  vm.createContext(ctx);
  vm.runInContext(sources[0], ctx);
  ctx.VerseObs.Renderer = function () {};
  ctx.VerseObs.Renderer.prototype = {
    layoutFrame: () => false,
    refit: () => false,
    updateStyle() {},
    show(data, placed) {
      o.calls.push("show " + (data.reference || data.title));
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
  o.hear = (m) => bc.onmessage({ data: JSON.parse(JSON.stringify(m)) });
  o.onAir = () => {
    const last = o.calls[o.calls.length - 1] || "";
    return last.indexOf("show ") === 0 ? last.slice(5) : "";
  };
  return o;
}

module.exports = async function testTieBreak(check) {
  const T = Date.now(),
    now = () => T;
  {
    // Two Studios with their own storage (they have not heard each other):
    // the same clock reading gives both commands the same stamp.
    const studio = page({}, { now }),
      tab = page({}, { now });
    const show = studio.send({ type: "show_verse", text: "A", reference: "Jean 11:35", cue: "a" });
    const hide = tab.send({ type: "hide" });
    const obs = output("", now),
      projector = output("?projector=1", now);
    obs.hear(show), obs.hear(hide);
    projector.hear(hide), projector.hear(show);
    await new Promise((r) => setTimeout(r, 0));
    const last = (o) => o.reports[o.reports.length - 1] || {};
    check("Tie: two senders' Diffuser and Masquer stamped alike end the same on the OBS program and a projector, delivered in opposite orders", () => {
      assert.equal(show.at, hide.at, "precondition: equal stamps");
      assert.notEqual(show.sender, hide.sender);
      assert.equal(obs.onAir(), projector.onAir(), `OBS ${JSON.stringify(obs.calls)} vs projector ${JSON.stringify(projector.calls)}`);
      assert.equal(last(obs).visible, last(projector).visible, "reported states differ");
      assert.equal(last(obs).role, "program");
      assert.equal(last(projector).role, "projector");
    });
    // The rule is a key, not an arrival order: the winner is the same one
    // in a third delivery order (each transport delivers twice).
    const third = output("", now);
    third.hear(hide), third.hear(show), third.hear(hide), third.hear(show);
    check("Tie: the same command wins whatever the delivery order, and an output never goes back to the other one", () =>
      assert.deepEqual([third.onAir(), obs.onAir()], [projector.onAir(), projector.onAir()]),
    );
  }
  {
    // The same tie in the style slots: one font size on every output.
    const a = page({}, { now }),
      b = page({}, { now }),
      one = page({}),
      two = page({});
    const settings = (p) => {
      const s = {};
      p.channel.onMessage((m) => Object.assign(s, m.settings || {}));
      return s;
    };
    const s1 = settings(one),
      s2 = settings(two);
    const x = a.send({ type: "update_style", settings: { fontSize: 72 } });
    const y = b.send({ type: "update_style", settings: { fontSize: 30 } });
    one.hear(x), one.hear(y);
    two.hear(y), two.hear(x);
    check("Tie: two style changes stamped alike end on the same value on both outputs", () => {
      assert.equal(x.at, y.at, "precondition: equal stamps");
      assert.equal(s1.fontSize, s2.fontSize);
    });
  }
};

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
