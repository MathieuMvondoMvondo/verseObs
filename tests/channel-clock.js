"use strict";
// The program's order when clocks jump (review 4, R4-B1). Each page runs
// the real channel with its own clock (shifted by `shift` ms) and its own
// BroadcastChannel; the test hands every message over itself, in the order
// a slow transport would. Pages of one browser profile share a localStorage.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const sources = ["constants", "channel"].map((file) =>
  fs.readFileSync(
    path.join(__dirname, "../assets/js/shared/" + file + ".js"),
    "utf8",
  ),
);

function page(store, opts = {}) {
  const p = { shift: opts.shift || 0, out: [], onAir: "", styles: [] };
  let bc, poll, storage;
  const ctx = {
    console,
    Set,
    Math,
    JSON,
    Object,
    Date: { now: () => Date.now() + p.shift },
    location: { hostname: "example.test" },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = v),
    },
    setInterval: (fn) => ((poll = fn), 1),
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    addEventListener: (type, fn) => { if (type === "storage") storage = fn; },
    removeEventListener: () => {},
    BroadcastChannel: class {
      constructor() {
        bc = this;
      }
      postMessage(m) {
        p.out.push(JSON.parse(JSON.stringify(m)));
      }
      close() {}
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const source of sources) vm.runInContext(source, ctx);
  // An output answers pings, like the OBS source.
  p.channel = new ctx.VerseObs.Channel({ autoPong: !!opts.output });
  p.channel.onMessage((m) => {
    if (m.type === "hide") p.onAir = "";
    if (m.type === "show_verse" || m.type === "show_text") p.onAir = m.text;
    if (m.settings && /^(show_verse|show_text|update_style)$/.test(m.type))
      p.styles.push(m.type + " " + m.settings.fontSize);
  });
  p.hear = (m) => bc.onmessage({ data: JSON.parse(JSON.stringify(m)) });
  p.poll = () => poll();
  p.storage = (m) => storage({ key: "verseobs_msg", newValue: JSON.stringify(m) });
  p.send = (m) => {
    p.channel.send(m);
    return p.out[p.out.length - 1];
  };
  return p;
}
/** The Studio pings (every 3 s), the output answers: both hear each other. */
function ping(studio, output, ...others) {
  const m = studio.send({ type: "ping" });
  output.hear(m);
  for (const o of others) o.hear(m), o.hear(output.out[output.out.length - 1]);
  studio.hear(output.out[output.out.length - 1]);
}

module.exports = function testClock(check) {
  // The reviewer's case. One machine: every page reads the same clock. A
  // verse on air; ten seconds later the clock goes back 65 s (NTP, hour
  // changed by hand). Masquer, then Diffuser, must apply at once; a
  // Diffuser from another tab, sent before the jump and delivered late,
  // still never puts back the hidden text.
  {
    const store = {};
    const output = page(store, { output: true }),
      studio = page(store),
      tab = page(store);
    const clock = (ms) => [output, studio, tab].forEach((p) => (p.shift += ms));
    const a = studio.send({ type: "show_verse", text: "A" });
    output.hear(a), tab.hear(a);
    clock(10e3);
    const late = tab.send({ type: "show_verse", text: "C" });
    studio.hear(late);
    ping(studio, output, tab);
    clock(-65e3);
    output.hear(studio.send({ type: "hide" }));
    const hidden = output.onAir;
    output.hear(late);
    const stillHidden = output.onAir;
    output.hear(studio.send({ type: "show_verse", text: "B" }));
    check(
      "The machine's clock goes back 65 s, 10 s after the last order: Masquer then Diffuser apply at once, a late older Diffuser stays dropped",
      () => {
        assert.equal(hidden, "", "Masquer ignored");
        assert.equal(stillHidden, "", "late Diffuser put the text back");
        assert.equal(output.onAir, "B", "Diffuser ignored");
      },
    );
  }
  // Only the Studio's clock goes back 65 s, 10 s after its Diffuser.
  {
    const output = page({}, { output: true }),
      studio = page({});
    output.hear(studio.send({ type: "show_verse", text: "A" }));
    output.shift += 10e3;
    studio.shift += 10e3;
    ping(studio, output);
    studio.shift -= 65e3;
    output.hear(studio.send({ type: "hide" }));
    const hidden = output.onAir;
    output.hear(studio.send({ type: "show_verse", text: "B" }));
    check("Only the Studio's clock goes back 65 s: its Masquer and Diffuser apply", () => {
      assert.equal(hidden, "", "Masquer ignored");
      assert.equal(output.onAir, "B", "Diffuser ignored");
    });
  }
  // Only the output's clock goes back 65 s. Another tab's Diffuser, sent
  // before a Masquer the Studio sent after hearing it, arrives last.
  {
    const output = page({}, { output: true }),
      studio = page({}),
      tab = page({});
    output.hear(studio.send({ type: "show_verse", text: "A" }));
    output.shift -= 65e3;
    output.hear(studio.send({ type: "hide" }));
    const hidden = output.onAir;
    output.hear(studio.send({ type: "show_verse", text: "B" }));
    const shown = output.onAir;
    const late = tab.send({ type: "show_verse", text: "C" });
    studio.hear(late);
    output.hear(studio.send({ type: "hide" }));
    output.hear(late);
    check(
      "Only the output's clock goes back 65 s: Masquer and Diffuser apply, a late older Diffuser stays dropped",
      () => {
        assert.equal(hidden, "", "Masquer ignored");
        assert.equal(shown, "B", "Diffuser ignored");
        assert.equal(output.onAir, "", "late Diffuser put a text back");
      },
    );
  }
  // The machine's clock jumps 2 minutes ahead, a verse goes on air, and
  // 70 s later the clock is corrected (back 2 minutes). Another tab hides.
  {
    const store = {};
    const output = page(store, { output: true }),
      studio = page(store),
      tab = page(store);
    const clock = (ms) => [output, studio, tab].forEach((p) => (p.shift += ms));
    clock(120e3);
    const a = studio.send({ type: "show_verse", text: "A" });
    output.hear(a), tab.hear(a);
    clock(70e3);
    ping(studio, output, tab);
    clock(-120e3);
    output.hear(tab.send({ type: "hide" }));
    const hidden = output.onAir;
    output.hear(studio.send({ type: "show_verse", text: "B" }));
    check("The clock jumps 2 min ahead, then back: another tab's Masquer and the Studio's Diffuser apply", () => {
      assert.equal(hidden, "", "Masquer ignored");
      assert.equal(output.onAir, "B", "Diffuser ignored");
    });
  }
  // A tab whose clock is 180 s behind the others (impossible between the
  // tabs of one machine, which share its clock, but the order must not rest
  // on it): opened after the Diffuser (it reads the last message left in
  // localStorage), or in another profile (it hears the relay).
  {
    const store = {};
    const output = page(store, { output: true }),
      normal = page(store);
    const a = normal.send({ type: "show_verse", text: "A" });
    output.hear(a);
    const opened = page(store, { shift: -180e3 }),
      elsewhere = page({}, { shift: -180e3 });
    elsewhere.hear(a);
    output.hear(opened.send({ type: "hide" }));
    const hidden = output.onAir;
    output.hear(elsewhere.send({ type: "show_verse", text: "B" }));
    check("A tab 180 s behind follows what it heard: its Masquer and Diffuser apply", () => {
      assert.equal(hidden, "", "Masquer ignored");
      assert.equal(output.onAir, "B", "Diffuser ignored");
    });
  }
  // A reloaded Studio (new sender) starts after the last message left in
  // localStorage, even when the clock went back since: never frozen.
  {
    const store = {};
    const output = page(store, { output: true }),
      studio = page(store);
    output.hear(studio.send({ type: "show_verse", text: "A" }));
    output.shift += 10e3;
    studio.shift += 10e3;
    ping(studio, output);
    output.shift -= 65e3;
    const reloaded = page(store, { shift: studio.shift - 65e3 });
    output.hear(reloaded.send({ type: "hide" }));
    check("A Studio reloaded after the clock went back: its Masquer applies", () =>
      assert.equal(output.onAir, ""),
    );
  }
  // Storage alone must work too: its startup snapshot already avoids
  // replaying a previous run. A wall-clock age gate would drop the command
  // when only this output's clock moves, despite its later logical stamp.
  {
    const store = {};
    const output = page(store), studio = page(store);
    const a = studio.send({ type: "show_verse", text: "A" });
    output.storage(a);
    output.shift -= 180e3;
    output.storage(studio.send({ type: "hide" }));
    const hidden = output.onAir;
    studio.send({ type: "show_verse", text: "B" });
    output.poll();
    check("Storage alone after the output's clock went back 180 s: Masquer and Diffuser apply", () => {
      assert.equal(hidden, "");
      assert.equal(output.onAir, "B");
    });
  }
  // Expiration of the Studio's in-flight-command guard uses elapsed time,
  // not wall time. Run the real functions, not a mirrored implementation.
  {
    const source = fs.readFileSync(path.join(__dirname, "../assets/js/control/app.js"), "utf8");
    const funcs = ["_isStale", "_newCommand"].map((name) => {
      const start = source.indexOf("  function " + name + "(");
      return source.slice(start, source.indexOf("\n  }", start) + 4);
    }).join("\n");
    let elapsed = 10, wall = Date.now();
    const ctx = { _commands: [], _commandCount: 0,
      Date: { now: () => wall }, performance: { now: () => elapsed },
      window: { VerseObs: { Queue: { newId: () => "test" } } } };
    vm.createContext(ctx);
    vm.runInContext(funcs, ctx);
    const old = ctx._newCommand();
    ctx._newCommand();
    const inFlight = ctx._isStale({ command: old });
    wall -= 180e3;
    elapsed += 3100;
    const afterBack = ctx._isStale({ command: old });
    ctx._newCommand();
    wall += 360e3;
    elapsed += 100;
    const afterAhead = ctx._isStale({ command: old });
    check("The Studio's in-flight guard lasts 3 elapsed seconds, even when the clock jumps back or ahead", () => {
      assert.equal(inFlight, true);
      assert.equal(afterBack, false);
      assert.equal(afterAhead, true);
    });
  }
};
module.exports.page = page;
