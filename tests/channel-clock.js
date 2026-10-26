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
    // `now`: a frozen clock reading, for commands stamped alike (tie tests).
    Date: { now: () => (opts.now ? opts.now() : Date.now()) + p.shift },
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
  // Review 6 (N1): a mark at the edge of the Date range (8.64e15, year
  // 275760) or beyond reasonable comes only from corrupted storage or a
  // broken sender. It must never be followed: stamps then left the range,
  // a late Diffuser came back after a Masquer, and a reloaded Studio was
  // ignored for good. Every stamp sent stays a plausible date.
  const plausible = (at) => typeof at === "number" && at > 0 && at <= Date.now() + 11 * 365.25 * 864e5;
  // U3 (reviewer's probe): a corrupted durable mark, a new page.
  for (const bad of ["abc", "-5", "1e300", "Infinity", "", "{}", "NaN", "0x1A2B3C4D5E6", "1e15", "8640000000000000", "8639999999999990"]) {
    const store = { verseobs_msg_clock: bad };
    const studio = page(store),
      output = page({}, { output: true });
    const a = studio.send({ type: "show_verse", text: "A" });
    const tab = page(store);
    const h = tab.send({ type: "hide" });
    output.hear(h), output.hear(a);
    check(`Durable mark « ${bad} »: a Diffuser, then another tab's Masquer delivered first: hidden, stamps plausible`, () => {
      assert.equal(output.onAir, "", "the late Diffuser put the text back");
      assert.ok(plausible(a.at) && plausible(h.at), "stamps " + a.at + ", " + h.at);
      assert.ok(h.at > a.at, "Masquer after the Diffuser: " + a.at + ", " + h.at);
    });
  }
  // K8 (reviewer's probe): the durable mark at the edge of the range, the
  // OBS output in the Studio's profile, a projector in its own; pings go
  // on for a while, then the Studio is reloaded.
  {
    const store = { verseobs_msg_clock: String(8.64e15 - 3) };
    const obs = page(store, { output: true }),
      projector = page({}, { output: true }),
      studio = page(store);
    const both = (m) => (obs.hear(m), projector.hear(m));
    const stamps = [];
    const send = (p, m) => {
      const sent = p.send(m);
      stamps.push(sent.at);
      both(sent);
      return sent;
    };
    send(studio, { type: "show_verse", text: "A" });
    const shown = [obs.onAir, projector.onAir];
    for (let i = 0; i < 3; i++) ping(studio, obs, projector);
    send(studio, { type: "hide" });
    const hidden = [obs.onAir, projector.onAir];
    const reloaded = page(store);
    send(reloaded, { type: "show_verse", text: "B" });
    const afterReload = [obs.onAir, projector.onAir];
    ping(reloaded, obs, projector);
    send(reloaded, { type: "hide" });
    send(reloaded, { type: "show_verse", text: "C" });
    check("Durable mark at the edge of the Date range: Diffuser, Masquer, a reloaded Studio's commands all apply on both outputs", () => {
      assert.deepEqual(shown, ["A", "A"], "Diffuser");
      assert.deepEqual(hidden, ["", ""], "Masquer");
      assert.deepEqual(afterReload, ["B", "B"], "reloaded Studio's Diffuser ignored");
      assert.deepEqual([obs.onAir, projector.onAir], ["C", "C"], "later Diffuser ignored");
      assert.ok(stamps.every(plausible), "stamps " + stamps.join(", "));
      assert.ok(plausible(Number(store.verseobs_msg_clock)), "durable mark left at " + store.verseobs_msg_clock);
    });
  }
  // U2 (reviewer's probe): a message stamped 8.64e15 - 1 reaches a Studio
  // and both outputs. It is neither followed nor allowed to order the
  // commands after it: another tab's Diffuser and Masquer, delivered in
  // order to OBS and last-in-first-out to the projector, end hidden.
  {
    const store = {};
    const obs = page(store, { output: true }),
      projector = page({}, { output: true }),
      studio = page(store);
    ping(studio, obs, projector);
    const rogue = { type: "show_verse", text: "R", sender: "rogue", id: "rogue:1", at: 8.64e15 - 1, ts: Date.now() };
    for (const p of [studio, obs, projector]) p.hear(rogue);
    const got = [];
    obs.channel.onMessage((m) => /^(show_verse|hide)$/.test(m.type) && got.push(m.type + (m.text ? " " + m.text : "")));
    const tab = page(store);
    const msgs = [studio.send({ type: "show_verse", text: "A" }), studio.send({ type: "hide" }), tab.send({ type: "show_verse", text: "B" }), tab.send({ type: "hide" })];
    msgs.forEach((m) => obs.hear(m));
    msgs.slice().reverse().forEach((m) => projector.hear(m));
    const reloaded = page(store);
    const c = reloaded.send({ type: "show_verse", text: "C" });
    obs.hear(c), projector.hear(c);
    check("A message stamped at the edge of the Date range is not followed: later commands keep their order, a reloaded Studio applies", () => {
      assert.deepEqual(got.slice(0, 4), ["show_verse A", "hide", "show_verse B", "hide"]);
      assert.ok(msgs.concat(c).every((m) => plausible(m.at)), "stamps " + msgs.concat(c).map((m) => m.at).join(", "));
      assert.deepEqual([obs.onAir, projector.onAir], ["C", "C"]);
    });
  }
  // The machine's clock set back eleven years (a dead battery, a date typed
  // by hand) while a Studio and the output run: every mark already sent is
  // now beyond the horizon. Nothing freezes and the order holds: another
  // tab's Masquer, sent after the Studio's Diffuser and delivered first,
  // keeps the text hidden.
  {
    const store = {};
    const output = page(store, { output: true }),
      studio = page(store);
    output.hear(studio.send({ type: "show_verse", text: "A" }));
    ping(studio, output);
    for (const p of [output, studio]) p.shift -= 11 * 365.25 * 864e5;
    const b = studio.send({ type: "show_verse", text: "B" });
    const tab = page(store, { shift: studio.shift });
    const h = tab.send({ type: "hide" });
    output.hear(h);
    const hidden = output.onAir;
    output.hear(b);
    const afterLate = output.onAir;
    const c = studio.send({ type: "show_verse", text: "C" });
    output.hear(c);
    check("The machine's clock set back eleven years: another tab's Masquer applies, the Diffuser sent before it stays dropped, the next one applies", () => {
      assert.equal(hidden, "", "Masquer ignored");
      assert.equal(afterLate, "", "the late Diffuser put the text back");
      assert.equal(output.onAir, "C", "Diffuser ignored");
      assert.ok(h.at > b.at && c.at > h.at, "stamps " + [b.at, h.at, c.at].join(", "));
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
