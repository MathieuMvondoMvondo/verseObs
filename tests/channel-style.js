"use strict";
const assert = require("node:assert/strict");
const { page } = require("./channel-clock");
function output(store = {}) {
  const p = page(store);
  p.settings = {};
  p.channel.onMessage((m) => Object.assign(p.settings, m.settings || {}));
  return p;
}
module.exports = function testStyle(check) {
  {
    const store = {}, receiver = output(store), studio = page(store);
    const a = studio.send({ type: "update_style", settings: { fontSize: 72 } });
    const b = studio.send({ type: "update_style", settings: { fontSize: 30 } });
    receiver.hear(b), receiver.hear(a);
    check("Style: 72 then 30 px, delivered LIFO, ends at 30 px", () => assert.equal(receiver.settings.fontSize, 30));
  }
  {
    const store = {}, receiver = output(store), studio = page(store);
    const a = studio.send({ type: "update_style", settings: { fontSize: 72 } });
    const b = studio.send({ type: "update_style", settings: { textColor: "red" } });
    receiver.hear(b), receiver.hear(a);
    check("Style: partial changes to different properties, delivered LIFO, both survive", () => assert.deepEqual(receiver.settings, { textColor: "red", fontSize: 72 }));
  }
  {
    const store = {}, receiver = output(store), studio = page(store);
    const a = studio.send({ type: "show_verse", text: "A", settings: { fontSize: 72, textColor: "white" } });
    const b = studio.send({ type: "update_style", settings: { fontSize: 30 } });
    receiver.hear(b), receiver.hear(a);
    check("Style: a Diffuser's settings delivered after a newer style keep that style and the text", () => {
      assert.equal(receiver.settings.fontSize, 30);
      assert.equal(receiver.settings.textColor, "white");
      assert.equal(receiver.onAir, "A");
    });
  }
  {
    const store = {}, receiver = output(store), studio = page(store);
    const a = studio.send({ type: "update_style", settings: { fontSize: 72 } });
    const b = studio.send({ type: "show_text", text: "B", settings: { fontSize: 30 } });
    receiver.hear(b), receiver.hear(a);
    check("Style: an older style never overrides a newer Diffuser's settings", () => assert.equal(receiver.settings.fontSize, 30));
  }
  {
    const store = {}, receiver = output(store), studio = page(store);
    const a = studio.send({ type: "update_style", settings: { fontSize: 72 } });
    const tab = page(store, { shift: -180e3 });
    const b = tab.send({ type: "update_style", settings: { fontSize: 30 } });
    receiver.hear(b), receiver.hear(a);
    check("Style: a second tab 180 s behind, opened after the first change, wins in LIFO too", () => assert.equal(receiver.settings.fontSize, 30));
  }
};
