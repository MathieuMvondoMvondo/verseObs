"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
module.exports = function testColorNormalization(check) {
  const ctx = { window: { VerseObs: {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/shared/constants.js"), "utf8"), ctx);
  const V = ctx.window.VerseObs;
  for (const [name, raw, expected] of [
    ["NBSP around a name", "\u00a0ReD\u00a0", "red"],
    ["BOM around hex", "\ufeff#ABC\ufeff", "#abc"],
    ["Kelvin sign in a name", "blac\u212a", "black"],
    ["NBSP and BOM inside rgb", "RGB(1\u00a02\ufeff3)", "rgb(1 2 3)"],
    ["mixed spaces inside hsl", "HSL(120\u00a0 50%\t50%)", "hsl(120 50% 50%)"],
    ["url still refused", "url(https://evil.example/a.png)", "#def"],
    ["overlong raw value still refused", " ".repeat(65) + "red", "#def"],
  ]) {
    const style = { textColor: raw };
    V.cleanColors(style, { textColor: "\ufeff#DEF\u00a0" });
    check("Colors are canonical CSS: " + name, () => assert.equal(style.textColor, expected));
  }
  {
    const style = { textColor: "url(a)", refBgColor: {}, fontFamily: "blac\u212a" };
    V.cleanColors(style, { textColor: "url(b)" });
    check("Colors: invalid values without a valid default disappear, other fields stay unchanged", () => {
      assert.equal(Object.hasOwn(style, "textColor"), false);
      assert.equal(Object.hasOwn(style, "refBgColor"), false);
      assert.equal(style.fontFamily, "blac\u212a");
    });
  }
};
