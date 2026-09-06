"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let count = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (p.endsWith(".js")) {
      new vm.Script(fs.readFileSync(p, "utf8"), { filename: p });
      count++;
    }
  }
}
walk(path.join(root, "assets/js"));
walk(path.join(root, "tools"));
for (const file of ["control_panel.html", "browser_source.html"]) {
  const html = fs.readFileSync(path.join(root, file), "utf8"),
    ids = new Set();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    if (ids.has(match[1])) throw new Error("Duplicate ID " + match[1]);
    ids.add(match[1]);
  }
  for (const match of html.matchAll(
    /(?:src|href)="(assets\/[^"?]+)(?:\?[^" ]*)?"/g,
  )) {
    if (!fs.existsSync(path.join(root, match[1])))
      throw new Error("Missing asset " + match[1]);
  }
}
console.log(
  "Syntax verified: " +
    count +
    " JavaScript files; HTML IDs and local assets verified.",
);
