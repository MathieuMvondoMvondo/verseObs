"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");
const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};
const TYPES = new Set([
  "show_verse",
  "show_text",
  "hide",
  "update_style",
  "preview",
  "preview_hide",
  "ping",
  "pong",
  "output_state",
]);
function createServer(port = 8080) {
  const hosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
  const server = http.createServer((req, res) => {
    if (!hosts.has(req.headers.host)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (pathname === "/") pathname = "/control_panel.html";
    // Serve product assets only, never git, dependencies, tests or private dotfiles.
    if (
      !/^\/(control_panel\.html|browser_source\.html|index\.html|assets\/[^.][^?]*|data\/[^.][^?]*)$/.test(
        pathname,
      ) ||
      pathname.split("/").some((p) => p.startsWith("."))
    ) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const filename = path.resolve(ROOT, "." + pathname);
    if (!filename.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.stat(filename, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(filename)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": stat.size,
      });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(filename);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    });
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4 * 1024 * 1024,
  });
  server.on("upgrade", (req, socket, head) => {
    if (
      !hosts.has(req.headers.host) ||
      req.url !== "/verseobs-relay" ||
      !["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
        req.headers.origin,
      )
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    ws.on("error", () => {});
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (
        !msg ||
        !TYPES.has(msg.type) ||
        typeof msg.id !== "string" ||
        msg.id.length > 150
      )
        return;
      const payload = JSON.stringify(msg);
      for (const client of wss.clients)
        if (
          client !== ws &&
          client.readyState === WebSocket.OPEN &&
          client.bufferedAmount < 4 * 1024 * 1024
        )
          client.send(payload);
    });
  });
  server.on("close", () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  return server;
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT invalide");
  const server = createServer(port);
  server.on("error", (err) => {
    console.error("Serveur indisponible : " + err.message);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      "VerseObs Studio : http://127.0.0.1:" +
        port +
        "/control_panel.html\nRelais OBS local actif. Ctrl+C pour arrêter.",
    ),
  );
}
