"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  dest = path.join(root, "dist");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const name of [
  "index.html",
  "control_panel.html",
  "browser_source.html",
  "assets",
  "data",
])
  fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true });
console.log(
  "Static product ready in dist/. The local relay requires npm start.",
);
