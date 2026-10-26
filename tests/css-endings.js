"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
module.exports = function testCssEndings(check) {
  for (const name of ["remote.css", "studio.css"]) {
    const fd = fs.openSync(path.join(__dirname, "../assets/css", name), "r");
    let end;
    try {
      const size = fs.fstatSync(fd).size, bytes = Buffer.alloc(Math.min(4, size));
      fs.readSync(fd, bytes, 0, bytes.length, size - bytes.length);
      end = bytes.toString("utf8");
    } finally { fs.closeSync(fd); }
    check(name + " ends in exactly one newline, no empty trailing lines", () =>
      assert.match(end, /\S\n$/, JSON.stringify(end)),
    );
  }
};
