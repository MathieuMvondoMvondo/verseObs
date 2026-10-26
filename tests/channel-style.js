"use strict";
// Styles as the product sends them (review 6, N2): a style change is a
// patch of the properties one Studio tab changed (control/settings.js tells
// what changed, control/app.js sends it marked `patch`); a Diffuser carries
// the tab's whole style. Every message goes through the real channel.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { page } = require("./channel-clock");
const sources = ["shared/constants.js", "control/settings.js"].map((file) =>
  fs.readFileSync(path.join(__dirname, "../assets/js/" + file), "utf8"),
);
function output(store = {}) {
  const p = page(store);
  p.settings = {};
  p.channel.onMessage((m) => Object.assign(p.settings, m.settings || {}));
  return p;
}
/**
 * A Studio tab's verse style: the real Settings (settings.js) on the
 * localStorage shared by the tabs of one profile. `change(key, value)`
 * returns the message the tab sends for it while a verse is on air.
 */
function styleTab(store) {
  const ctx = {
    console,
    Object,
    JSON,
    Math,
    Number,
    String,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: (k) => delete store[k],
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const source of sources) vm.runInContext(source, ctx);
  const settings = new ctx.VerseObs.Settings();
  settings.load();
  let sent = null;
  settings.onChange = (all, changes) => (sent = { type: "update_style", settings: changes, patch: true });
  return {
    all: () => JSON.parse(JSON.stringify(settings.getAll())),
    change(key, value) {
      sent = null;
      settings.update(key, value);
      return JSON.parse(JSON.stringify(sent));
    },
    reset() {
      sent = null;
      settings.reset();
      return JSON.parse(JSON.stringify(sent));
    },
    template(name) {
      sent = null;
      settings.applyTemplate(name);
      return JSON.parse(JSON.stringify(sent));
    },
  };
}
module.exports = function testStyle(check) {
  {
    const store = {}, receiver = output(store), studio = page(store), tab = styleTab(store);
    const a = studio.send(tab.change("fontSize", 72));
    const b = studio.send(tab.change("fontSize", 30));
    receiver.hear(b), receiver.hear(a);
    check("Style: 72 then 30 px, delivered LIFO, ends at 30 px", () => assert.equal(receiver.settings.fontSize, 30));
    check("Style: a change sends only the property changed, as a patch", () =>
      assert.deepEqual([a.settings, a.patch, b.settings, b.patch], [{ fontSize: 72 }, true, { fontSize: 30 }, true]),
    );
  }
  {
    const store = {}, receiver = output(store), studio = page(store), tab = styleTab(store);
    const a = studio.send(tab.change("fontSize", 72));
    const b = studio.send(tab.change("textColor", "red"));
    receiver.hear(b), receiver.hear(a);
    check("Style: partial changes to different properties, delivered LIFO, both survive", () => assert.deepEqual(receiver.settings, { textColor: "red", fontSize: 72 }));
  }
  {
    // U6a (reviewer's probe): two tabs of one profile, both opened before
    // either change; neither re-reads the other's settings. A sets the size,
    // then B the colour: both stay on air, in order and last-in-first-out.
    const store = {}, inOrder = output(store), lifo = output({});
    const tabA = styleTab(store), tabB = styleTab(store);
    const A = page(store), B = page(store);
    const a = A.send(tabA.change("fontSize", 60));
    const b = B.send(tabB.change("textColor", "#ff3b30"));
    inOrder.hear(a), inOrder.hear(b);
    lifo.hear(b), lifo.hear(a);
    check("Style: two tabs change two properties: both stay on air, in order and LIFO", () => {
      assert.deepEqual(inOrder.settings, { fontSize: 60, textColor: "#ff3b30" });
      assert.deepEqual(lifo.settings, { fontSize: 60, textColor: "#ff3b30" });
    });
  }
  {
    const store = {}, receiver = output(store), studio = page(store), tab = styleTab(store);
    const a = studio.send({ type: "show_verse", text: "A", settings: Object.assign(tab.all(), { fontSize: 72, textColor: "white" }) });
    const b = studio.send(tab.change("fontSize", 30));
    receiver.hear(b), receiver.hear(a);
    check("Style: a Diffuser's settings delivered after a newer style keep that style and the text", () => {
      assert.equal(receiver.settings.fontSize, 30);
      assert.equal(receiver.settings.textColor, "white");
      assert.equal(receiver.onAir, "A");
    });
  }
  {
    const store = {}, receiver = output(store), studio = page(store), tab = styleTab(store);
    const a = studio.send(tab.change("fontSize", 72));
    const b = studio.send({ type: "show_text", text: "B", settings: Object.assign(tab.all(), { fontSize: 30 }) });
    receiver.hear(b), receiver.hear(a);
    check("Style: an older style never overrides a newer Diffuser's settings", () => assert.equal(receiver.settings.fontSize, 30));
  }
  {
    const store = {}, receiver = output(store), studio = page(store), tab = styleTab(store);
    const a = studio.send(tab.change("fontSize", 72));
    const late = page(store, { shift: -180e3 });
    const b = late.send(styleTab(store).change("fontSize", 30));
    receiver.hear(b), receiver.hear(a);
    check("Style: a second tab 180 s behind, opened after the first change, wins in LIFO too", () => assert.equal(receiver.settings.fontSize, 30));
  }
  {
    // A whole-look action (Réinitialiser, a preset) puts the whole look on
    // air, even a property another tab changed that this tab never saw.
    const store = {}, receiver = output(store);
    const tabA = styleTab(store), tabB = styleTab(store);
    const A = page(store), B = page(store);
    receiver.hear(B.send(tabB.change("fontSize", 60)));
    receiver.hear(B.send(tabB.change("textColor", "#ff3b30")));
    receiver.hear(A.send(tabA.reset()));
    const afterReset = [receiver.settings.fontSize, receiver.settings.textColor];
    receiver.hear(B.send(tabB.change("textColor", "#00ff00")));
    receiver.hear(A.send(tabA.template("antenne")));
    check("Style: Réinitialiser or a preset in one tab puts its whole look on air, over another tab's changes", () => {
      assert.deepEqual(afterReset, [tabA.all().fontSize, tabA.all().textColor], "after Réinitialiser");
      assert.equal(receiver.settings.textColor, tabA.all().textColor, "after a preset");
    });
  }
};
