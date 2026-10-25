"use strict";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
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

// ---- Phone remote (optional local-network mode) ----
// A remote may only send these four commands; the server builds the message
// delivered to the Studio itself, so nothing else from the network is relayed.
const REMOTE_COMMANDS = new Set(["prev", "next", "show", "hide"]);
const REMOTE_FILES =
  /^\/(remote\.html|assets\/css\/remote\.css|assets\/js\/remote\/remote\.js|assets\/icons\/[a-z0-9-]+\.svg)$/;
const REMOTE_LIMITS = {
  windowMs: 5000,
  commands: 10, // per remote and per window
  allCommands: 20, // all remotes together, per window
  messages: 30, // anything received, per remote and per window
  maxRemotes: 8,
  authWindowMs: 60000,
  authFailures: 10, // per address before a temporary block
};
const CLOSE_REVOKED = 4401,
  CLOSE_DISABLED = 4000,
  CLOSE_FLOOD = 4429;

function isPrivateIPv4(address) {
  const p = address.split(".").map(Number);
  return (
    p.length === 4 &&
    (p[0] === 10 ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31))
  );
}
/** Private IPv4 addresses of real network adapters, best candidate first. */
function lanAddresses(interfaces = os.networkInterfaces()) {
  const virtual =
    /^(docker|br-|bridge|veth|virbr|vmnet|vboxnet|utun|tun|tap|tailscale|zt|wg|ham|awdl|llw|anpi|ap\d|lxc|lxd|podman|cni|flannel|vEthernet|VirtualBox|VMware|Hyper-V|Npcap|Loopback)/i;
  const found = [];
  for (const [name, list] of Object.entries(interfaces)) {
    if (virtual.test(name)) continue;
    for (const entry of list || []) {
      const family = entry.family === 4 ? "IPv4" : entry.family;
      if (family !== "IPv4" || entry.internal || !isPrivateIPv4(entry.address))
        continue;
      let score = entry.address.startsWith("192.168.")
        ? 30
        : entry.address.startsWith("10.")
          ? 20
          : 10;
      if (/^(en|eth|wl|wi-?fi|ethernet)/i.test(name)) score += 5;
      found.push({ address: entry.address, name, score });
    }
  }
  return found.sort((a, b) => b.score - a.score);
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function summary(value) {
  if (!value || typeof value !== "object") return null;
  return {
    label: text(value.label, 140),
    text: text(value.text, 280),
    // Identifier of the conductor item: the phone marks the row on air by it.
    cue: text(value.cue, 64),
    version: text(value.version, 80),
  };
}
/** Only short display data ever reaches a phone. */
function sanitizeState(state) {
  state = state && typeof state === "object" ? state : {};
  const position =
    state.position && typeof state.position === "object" ? state.position : {};
  const output =
    state.output && typeof state.output === "object" ? state.output : {};
  const int = (n) => (Number.isInteger(n) && n >= 0 && n <= 1000 ? n : 0);
  return {
    session: text(state.session, 100),
    position: { index: int(position.index), total: int(position.total) },
    current: summary(state.current),
    next: summary(state.next),
    output: {
      connected: output.connected === true,
      visible: output.visible === true,
      confirmed: output.confirmed === true,
      label: text(output.label, 140),
      cue: text(output.cue, 64),
      version: text(output.version, 80),
    },
  };
}
function sendFile(req, res, pathname, headers) {
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
    res.writeHead(
      200,
      Object.assign(
        {
          "Content-Type":
            MIME[path.extname(filename)] || "application/octet-stream",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": stat.size,
        },
        headers || {},
      ),
    );
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(filename);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}
function reject(socket, status, reason) {
  socket.end(
    "HTTP/1.1 " + status + " " + reason + "\r\nConnection: close\r\n\r\n",
  );
}

/**
 * Pairing, LAN listeners and the bridge between phones and the Studio.
 * `studios` lists the loopback relay clients (Studio, outputs, previews).
 */
function createRemote(port, options, studios) {
  const settings = Object.assign({ addresses: null, port: null }, options);
  const remotes = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const boot = crypto.randomBytes(4).toString("hex");
  const failures = new Map();
  let token = null,
    listeners = [],
    hosts = new Set(),
    urls = [],
    controller = null,
    state = null,
    error = "",
    pending = null,
    generation = 0,
    seq = 0,
    globalWindow = { start: 0, count: 0 };
  const id = () => "server-" + boot + "-" + ++seq;

  /** Pairing status as seen by one relay client (`receiver`). */
  function status(receiver) {
    return {
      type: "remote_status",
      id: id(),
      ts: Date.now(),
      active: !!token,
      url: urls.length ? urls[0].url : "",
      addresses: urls.map((u) => ({ address: u.address, url: u.url })),
      remotes: remotes.clients.size,
      studio: !!controller,
      controller: !!receiver && receiver === controller,
      error,
    };
  }
  function toStudios(message, only) {
    const payload = JSON.stringify(message);
    for (const client of only ? [only] : studios())
      if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
  function publish() {
    for (const client of studios())
      if (client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify(status(client)));
  }
  function toRemotes(message, only) {
    const payload = JSON.stringify(message);
    for (const client of only ? [only] : remotes.clients)
      if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
  function stateMessage() {
    return state && controller
      ? Object.assign({ type: "state", studio: true }, state)
      : { type: "state", studio: false };
  }
  function buildUrls() {
    hosts = new Set();
    urls = listeners.map((l) => {
      const { address, port: lanPort } = l.address();
      const host = address + ":" + lanPort;
      if (lanPort === 80) hosts.add(address);
      return {
        address,
        host,
        url:
          "http://" +
          host +
          "/remote.html?code=" +
          encodeURIComponent(token),
      };
    });
    for (const u of urls) hosts.add(u.host);
  }
  function blocked(ip) {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.start > REMOTE_LIMITS.authWindowMs) {
      failures.delete(ip);
      return false;
    }
    return entry.count >= REMOTE_LIMITS.authFailures;
  }
  function failed(ip) {
    const now = Date.now(),
      entry = failures.get(ip);
    if (!entry || now - entry.start > REMOTE_LIMITS.authWindowMs)
      failures.set(ip, { start: now, count: 1 });
    else entry.count++;
    if (failures.size > 1000) failures.delete(failures.keys().next().value);
  }
  function codeFrom(req) {
    try {
      return new URL(req.url, "http://remote").searchParams.get("code") || "";
    } catch {
      return "";
    }
  }
  function lanRequest(req, res) {
    const security = {
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    };
    if (!hosts.has(req.headers.host)) {
      res.writeHead(403, security);
      return res.end("Forbidden");
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, security);
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://remote").pathname,
      );
    } catch {
      res.writeHead(400, security);
      return res.end();
    }
    const ip = req.socket.remoteAddress || "";
    if (pathname === "/api/remote/check") {
      const headers = Object.assign({ "Cache-Control": "no-store" }, security);
      if (blocked(ip)) {
        res.writeHead(429, headers);
        return res.end();
      }
      const valid = !!token && safeEqual(codeFrom(req), token);
      if (valid) failures.delete(ip);
      else failed(ip);
      res.writeHead(valid ? 204 : 401, headers);
      return res.end();
    }
    if (pathname === "/") pathname = "/remote.html";
    if (!REMOTE_FILES.test(pathname)) {
      res.writeHead(404, security);
      return res.end("Not found");
    }
    const headers = Object.assign({}, security);
    if (pathname === "/remote.html") {
      headers["Cache-Control"] = "no-store";
      headers["Content-Security-Policy"] =
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ws://" +
        req.headers.host +
        "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    }
    sendFile(req, res, pathname, headers);
  }
  function lanUpgrade(req, socket, head) {
    const ip = req.socket.remoteAddress || "";
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://remote").pathname;
    } catch {}
    if (
      !hosts.has(req.headers.host) ||
      pathname !== "/verseobs-remote" ||
      req.headers.origin !== "http://" + req.headers.host
    )
      return reject(socket, 403, "Forbidden");
    if (blocked(ip)) return reject(socket, 429, "Too Many Requests");
    if (!token || !safeEqual(codeFrom(req), token)) {
      failed(ip);
      return reject(socket, 401, "Unauthorized");
    }
    failures.delete(ip);
    if (remotes.clients.size >= REMOTE_LIMITS.maxRemotes)
      return reject(socket, 503, "Service Unavailable");
    remotes.handleUpgrade(req, socket, head, (ws) =>
      remotes.emit("connection", ws),
    );
  }
  function allow(counter, key, limit) {
    const now = Date.now();
    if (now - counter.start > REMOTE_LIMITS.windowMs) {
      counter.start = now;
      counter.commands = 0;
      counter.messages = 0;
      counter.count = 0;
    }
    counter[key] = (counter[key] || 0) + 1;
    return counter[key] <= limit;
  }
  // Phones sleep and change networks: ping them, and resend the state so a
  // remote can tell a silent link from a quiet service.
  let heartbeat = null;
  function beat() {
    for (const ws of remotes.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {}
    }
    toRemotes(stateMessage());
  }
  remotes.on("connection", (ws) => {
    const counter = { start: Date.now(), commands: 0, messages: 0 };
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", () => {});
    ws.on("message", (raw) => {
      if (!allow(counter, "messages", REMOTE_LIMITS.messages)) {
        ws.close(CLOSE_FLOOD, "Trop de messages");
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        msg = null;
      }
      const ref =
        msg && typeof msg.ref === "string" ? msg.ref.slice(0, 40) : "";
      const answer = (type, extra) =>
        toRemotes(Object.assign({ type, ref }, extra), ws);
      if (
        !msg ||
        msg.type !== "command" ||
        !REMOTE_COMMANDS.has(msg.command)
      )
        return answer("error", { reason: "forbidden" });
      if (
        !allow(counter, "commands", REMOTE_LIMITS.commands) ||
        !allow(globalWindow, "count", REMOTE_LIMITS.allCommands)
      )
        return answer("error", { reason: "rate_limited" });
      if (!controller || controller.readyState !== WebSocket.OPEN)
        return answer("error", { reason: "studio_absent" });
      toStudios(
        {
          type: "remote_command",
          command: msg.command,
          id: id(),
          ts: Date.now(),
        },
        controller,
      );
      answer("ack", { command: msg.command });
    });
    ws.on("close", publish);
    toRemotes(stateMessage(), ws);
    publish();
  });

  function listen(address, lanPort) {
    return new Promise((resolve, rejectListen) => {
      const listener = http.createServer(lanRequest);
      listener.on("upgrade", lanUpgrade);
      listener.once("error", rejectListen);
      listener.listen(lanPort, address, () => {
        listener.removeListener("error", rejectListen);
        listener.on("error", () => {});
        resolve(listener);
      });
    });
  }
  async function open() {
    const run = generation;
    const addresses =
      settings.addresses || lanAddresses().map((entry) => entry.address);
    if (!addresses.length) {
      error =
        "Aucun réseau local détecté. Connectez cet ordinateur au Wi-Fi, puis réessayez.";
      return;
    }
    let lanPort = settings.port == null ? port : settings.port;
    for (const address of addresses) {
      try {
        const listener = await listen(address, lanPort);
        listeners.push(listener);
        lanPort = listener.address().port;
      } catch (err) {
        // The usual port is taken on this address: keep a free one instead.
        if (err.code === "EADDRINUSE" && !listeners.length && lanPort !== 0) {
          try {
            const listener = await listen(address, 0);
            listeners.push(listener);
            lanPort = listener.address().port;
          } catch {}
        }
      }
    }
    if (run !== generation) {
      // Disabled while the listeners were opening: never come back on.
      for (const listener of listeners.splice(0)) listener.close();
      return;
    }
    if (!listeners.length) {
      error =
        "Impossible d’ouvrir le mode réseau local sur cet ordinateur (adresse ou port indisponible).";
      return;
    }
    token = crypto.randomBytes(18).toString("base64url");
    buildUrls();
    heartbeat = setInterval(beat, 15000);
    heartbeat.unref();
  }
  async function enable() {
    if (token) return status();
    if (!pending) {
      error = "";
      pending = open().finally(() => {
        pending = null;
      });
    }
    await pending;
    publish();
    return status();
  }
  async function disable() {
    generation++;
    const closing = listeners;
    clearInterval(heartbeat);
    heartbeat = null;
    token = null;
    listeners = [];
    hosts = new Set();
    urls = [];
    error = "";
    controller = null;
    state = null;
    for (const ws of remotes.clients) {
      ws.close(CLOSE_DISABLED, "Mode réseau désactivé");
      setTimeout(() => ws.terminate(), 1000).unref();
    }
    await Promise.all(
      closing.map(
        (listener) =>
          new Promise((resolve) => {
            const done = setTimeout(resolve, 1500);
            done.unref();
            listener.close(() => {
              clearTimeout(done);
              resolve();
            });
            listener.closeAllConnections?.();
          }),
      ),
    );
    publish();
    return status();
  }
  function revoke() {
    if (!token) return status();
    token = crypto.randomBytes(18).toString("base64url");
    buildUrls();
    for (const ws of remotes.clients) {
      ws.close(CLOSE_REVOKED, "Accès révoqué");
      setTimeout(() => ws.terminate(), 1000).unref();
    }
    publish();
    return status();
  }
  /**
   * Messages from the loopback Studio. Returns true when handled here.
   * The first Studio window that publishes its conductor receives the
   * commands; another window takes over only on an explicit "claim".
   */
  function fromStudio(ws, msg) {
    if (msg.type === "remote_admin") {
      const action = msg.action;
      if (action === "status") toStudios(status(ws), ws);
      else if (action === "enable") enable();
      else if (action === "disable") disable();
      else if (action === "revoke") revoke();
      else if (action === "claim" && token) {
        controller = ws;
        state = null;
        publish();
      }
      return true;
    }
    if (msg.type === "remote_state") {
      if (!token) return true;
      if (controller && controller !== ws) return true;
      const first = !controller;
      controller = ws;
      state = sanitizeState(msg.state);
      toRemotes(stateMessage());
      if (first) publish();
      return true;
    }
    return false;
  }
  function studioGone(ws) {
    if (controller !== ws) return;
    controller = null;
    state = null;
    toRemotes(stateMessage());
    publish();
  }
  function close() {
    for (const ws of remotes.clients) ws.terminate();
    remotes.close();
    return disable();
  }
  return {
    enable,
    disable,
    revoke,
    status,
    fromStudio,
    studioGone,
    close,
    /** For tests: the current pairing code. Never written to a log. */
    code: () => token,
  };
}

function createServer(port = 8080, options = {}) {
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
    sendFile(req, res, pathname);
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4 * 1024 * 1024,
  });
  const remote = createRemote(port, options.lan, () => wss.clients);
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
    ws.on("close", () => remote.studioGone(ws));
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (
        !msg ||
        typeof msg.type !== "string" ||
        typeof msg.id !== "string" ||
        msg.id.length > 150
      )
        return;
      if (remote.fromStudio(ws, msg)) return;
      if (!TYPES.has(msg.type)) return;
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
    remote.close();
  });
  server.remote = remote;
  return server;
}
module.exports = { createServer, lanAddresses, sanitizeState, REMOTE_LIMITS };
if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT invalide");
  const lan = process.argv.slice(2).includes("--lan");
  const server = createServer(port);
  server.on("error", (err) => {
    console.error("Serveur indisponible : " + err.message);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", async () => {
    console.log(
      "VerseObs Studio : http://127.0.0.1:" +
        port +
        "/control_panel.html\nRelais OBS local actif. Ctrl+C pour arrêter.",
    );
    if (!lan) return;
    // The pairing code is shown only in the Studio, never in this console.
    const status = await server.remote.enable();
    if (status.active)
      console.log(
        "Mode réseau local actif : " +
          status.addresses.map((a) => a.address).join(", ") +
          ".\nAttention : les appareils de ce réseau qui obtiennent le code peuvent piloter le conducteur.\nScannez le QR code dans le Studio (onglet Connexions) et désactivez ce mode après usage.",
      );
    else console.log("Mode réseau local indisponible : " + status.error);
  });
}
