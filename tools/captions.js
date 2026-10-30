"use strict";
/*
 * VerseObs Écoute : live English captions.
 *
 * The local listening service (tools/ecoute) publishes on the loopback relay.
 * This module keeps the last lines, reports the service to the Studio, and
 * serves a READ-ONLY caption page to phones on the local network, with its own
 * code: sharing captions never hands out the remote-control code, and nothing
 * a phone sends is ever relayed. Captions reach OBS only when the operator
 * turns « Sous-titres dans OBS » on (off at every start).
 */
const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const CAPTION_FILES =
  /^\/(sous-titres\.html|assets\/css\/sous-titres\.css|assets\/js\/sous-titres\/sous-titres\.js|assets\/icons\/[a-z0-9-]+\.svg)$/;
const CAPTION_LIMITS = {
  history: 40, // lines kept for a phone that joins or comes back
  hello: 25, // lines sent to a phone on (re)connection
  text: 600, // characters per line
  viewers: 40,
  windowMs: 5000,
  messages: 20, // anything received from a phone, per window
  authWindowMs: 60000,
  authFailures: 10,
};
const CLOSE_REVOKED = 4401,
  CLOSE_DISABLED = 4000,
  CLOSE_FLOOD = 4429;
const STATUSES = new Set(["idle", "loading", "listening", "error"]);

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function clean(value, max) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function num(value, max) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
    ? Math.round(value * 100) / 100
    : null;
}
function stamp(value) {
  return Number.isFinite(value) && value > 0 && value < 1e14
    ? Math.round(value)
    : 0;
}
/** What the Studio may show about the listening service. */
function engineState(state) {
  const s = obj(state),
    latency = obj(s.latency);
  return {
    status: STATUSES.has(s.status) ? s.status : "idle",
    error: clean(s.error, 200),
    source: clean(s.source, 80),
    file: s.file === true,
    model: clean(s.model, 60),
    translator: clean(s.translator, 60),
    devices: (Array.isArray(s.devices) ? s.devices : [])
      .filter((d) => d && Number.isInteger(d.index) && d.index >= 0)
      .slice(0, 40)
      .map((d) => ({
        index: d.index,
        name: clean(d.name, 80),
        api: clean(d.api, 40),
      })),
    device: Number.isInteger(s.device) ? s.device : null,
    latency: {
      last: num(latency.last, 3600),
      avg: num(latency.avg, 3600),
      max: num(latency.max, 3600),
      count: Number.isInteger(latency.count) ? latency.count : 0,
    },
    backlog: num(s.backlog, 86400),
    cpu: num(s.cpu, 100),
    ram: num(s.ram, 1e6),
  };
}
/** One translated line, or null. */
function captionLine(value) {
  const c = obj(value),
    en = clean(c.en, CAPTION_LIMITS.text);
  if (!en) return null;
  return {
    en,
    fr: clean(c.fr, CAPTION_LIMITS.text),
    end: stamp(c.end), // when the phrase ended in the room (service clock)
    ready: stamp(c.ready),
    latency: num(c.latency, 3600),
    audio: num(c.audio, 600),
  };
}

/**
 * options: { addresses: [..] | null, port: number | null }
 * helpers: { lanAddresses(), sendFile(req, res, pathname, headers) }
 */
function createCaptions(port, options, relayClients, helpers) {
  const settings = Object.assign({ addresses: null, port: null }, options);
  const viewers = new WebSocketServer({ noServer: true, maxPayload: 256 });
  const boot = crypto.randomBytes(4).toString("hex");
  const failures = new Map();
  let engine = null,
    info = null,
    history = [],
    n = 0,
    seq = 0,
    onAir = false,
    token = null,
    listeners = [],
    hosts = new Set(),
    urls = [],
    error = "",
    pending = null,
    generation = 0,
    heartbeat = null;
  const id = () => "captions-" + boot + "-" + ++seq;
  const live = () => !!engine && !!info && info.status === "listening";

  function status() {
    const last = history[history.length - 1] || null;
    return {
      type: "caption_status",
      id: id(),
      ts: Date.now(),
      engine: !!engine,
      state: info,
      onAir,
      last: last && { en: last.en, fr: last.fr, latency: last.latency },
      share: {
        active: !!token,
        url: urls.length ? urls[0].url : "",
        addresses: urls.map((u) => ({ address: u.address, url: u.url })),
        viewers: viewers.clients.size,
        error,
      },
    };
  }
  function toRelay(message, except) {
    const payload = JSON.stringify(message);
    for (const client of relayClients())
      if (client !== except && client.readyState === WebSocket.OPEN)
        client.send(payload);
  }
  function publish() {
    toRelay(status());
  }
  function toViewers(message, only) {
    const payload = JSON.stringify(message);
    for (const client of only ? [only] : viewers.clients)
      if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
  const forViewer = (c) => ({ n: c.n, en: c.en, end: c.end });
  function viewerState() {
    return { type: "caption_state", live: live(), service: !!engine };
  }

  // ---- Read-only page on the local network ----
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
          "/sous-titres.html?code=" +
          encodeURIComponent(token),
      };
    });
    for (const u of urls) hosts.add(u.host);
  }
  function blocked(ip) {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.start > CAPTION_LIMITS.authWindowMs) {
      failures.delete(ip);
      return false;
    }
    return entry.count >= CAPTION_LIMITS.authFailures;
  }
  function failed(ip) {
    const now = Date.now(),
      entry = failures.get(ip);
    if (!entry || now - entry.start > CAPTION_LIMITS.authWindowMs)
      failures.set(ip, { start: now, count: 1 });
    else entry.count++;
    if (failures.size > 1000) failures.delete(failures.keys().next().value);
  }
  function codeFrom(req) {
    try {
      return new URL(req.url, "http://captions").searchParams.get("code") || "";
    } catch {
      return "";
    }
  }
  function valid(code) {
    if (!token || typeof code !== "string") return false;
    const a = Buffer.from(code),
      b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
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
        new URL(req.url, "http://captions").pathname,
      );
    } catch {
      res.writeHead(400, security);
      return res.end();
    }
    const ip = req.socket.remoteAddress || "";
    if (pathname === "/api/sous-titres/check") {
      const headers = Object.assign({ "Cache-Control": "no-store" }, security);
      if (blocked(ip)) {
        res.writeHead(429, headers);
        return res.end();
      }
      const ok = valid(codeFrom(req));
      if (ok) failures.delete(ip);
      else failed(ip);
      res.writeHead(ok ? 204 : 401, headers);
      return res.end();
    }
    if (pathname === "/") pathname = "/sous-titres.html";
    if (!CAPTION_FILES.test(pathname)) {
      res.writeHead(404, security);
      return res.end("Not found");
    }
    const headers = Object.assign({}, security);
    if (pathname === "/sous-titres.html") {
      headers["Cache-Control"] = "no-store";
      headers["Content-Security-Policy"] =
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ws://" +
        req.headers.host +
        "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    }
    helpers.sendFile(req, res, pathname, headers);
  }
  function reject(socket, code, reason) {
    socket.end(
      "HTTP/1.1 " + code + " " + reason + "\r\nConnection: close\r\n\r\n",
    );
  }
  function lanUpgrade(req, socket, head) {
    const ip = req.socket.remoteAddress || "";
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://captions").pathname;
    } catch {}
    if (
      !hosts.has(req.headers.host) ||
      pathname !== "/verseobs-sous-titres" ||
      req.headers.origin !== "http://" + req.headers.host
    )
      return reject(socket, 403, "Forbidden");
    if (blocked(ip)) return reject(socket, 429, "Too Many Requests");
    if (!valid(codeFrom(req))) {
      failed(ip);
      return reject(socket, 401, "Unauthorized");
    }
    failures.delete(ip);
    if (viewers.clients.size >= CAPTION_LIMITS.viewers)
      return reject(socket, 503, "Service Unavailable");
    viewers.handleUpgrade(req, socket, head, (ws) =>
      viewers.emit("connection", ws),
    );
  }
  viewers.on("connection", (ws) => {
    const counter = { start: Date.now(), count: 0 };
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", () => {});
    // A phone only reads. Whatever it sends is counted, then dropped.
    ws.on("message", () => {
      const now = Date.now();
      if (now - counter.start > CAPTION_LIMITS.windowMs) {
        counter.start = now;
        counter.count = 0;
      }
      if (++counter.count > CAPTION_LIMITS.messages)
        ws.close(CLOSE_FLOOD, "Too many messages");
    });
    ws.on("close", publish);
    toViewers(
      Object.assign(viewerState(), {
        type: "captions_hello",
        lines: history.slice(-CAPTION_LIMITS.hello).map(forViewer),
      }),
      ws,
    );
    publish();
  });
  function beat() {
    for (const ws of viewers.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {}
    }
    toViewers(viewerState());
  }
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
      settings.addresses ||
      helpers.lanAddresses().map((entry) => entry.address);
    if (!addresses.length) {
      error =
        "Aucun réseau local détecté. Connectez cet ordinateur au Wi-Fi de l’église, puis réessayez.";
      return;
    }
    // Next to the Studio's port (8081 for 8080), never the remote's own port.
    let lanPort = settings.port == null ? port + 1 : settings.port;
    for (const address of addresses) {
      try {
        const listener = await listen(address, lanPort);
        listeners.push(listener);
        lanPort = listener.address().port;
      } catch (err) {
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
      for (const listener of listeners.splice(0)) listener.close();
      return;
    }
    if (!listeners.length) {
      error =
        "Impossible de partager les sous-titres sur cet ordinateur (adresse ou port indisponible).";
      return;
    }
    token = crypto.randomBytes(12).toString("base64url");
    buildUrls();
    heartbeat = setInterval(beat, 15000);
    heartbeat.unref();
  }
  async function share() {
    if (token) return publish();
    if (!pending) {
      error = "";
      pending = open().finally(() => {
        pending = null;
      });
    }
    await pending;
    publish();
  }
  async function unshare() {
    generation++;
    const closing = listeners;
    clearInterval(heartbeat);
    heartbeat = null;
    token = null;
    listeners = [];
    hosts = new Set();
    urls = [];
    error = "";
    for (const ws of viewers.clients) {
      ws.close(CLOSE_DISABLED, "Sharing stopped");
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
  }
  function revoke() {
    if (!token) return publish();
    token = crypto.randomBytes(12).toString("base64url");
    buildUrls();
    for (const ws of viewers.clients) {
      ws.close(CLOSE_REVOKED, "Link revoked");
      setTimeout(() => ws.terminate(), 1000).unref();
    }
    publish();
  }

  /** Relay messages about captions. Returns true when handled here. */
  function fromRelay(ws, msg) {
    if (msg.type === "caption_engine") {
      const wasLive = live(),
        first = engine !== ws;
      engine = ws;
      info = engineState(msg.state);
      publish();
      if (first || wasLive !== live()) toViewers(viewerState());
      return true;
    }
    if (msg.type === "caption") {
      if (ws !== engine) return true; // only the listening service writes
      const line = captionLine(msg.caption);
      if (!line) return true;
      line.n = ++n;
      history.push(line);
      if (history.length > CAPTION_LIMITS.history) history.shift();
      toViewers(Object.assign({ type: "caption" }, forViewer(line)));
      toRelay(
        {
          type: "caption",
          id: id(),
          ts: Date.now(),
          n: line.n,
          en: line.en,
          fr: line.fr,
          end: line.end,
          latency: line.latency,
          onAir,
        },
        ws,
      );
      return true;
    }
    if (msg.type === "caption_admin") {
      const action = msg.action;
      if (action === "status") toRelay(status(), null);
      else if (action === "start" || action === "stop") {
        if (engine && engine.readyState === WebSocket.OPEN)
          engine.send(
            JSON.stringify({
              type: "caption_command",
              id: id(),
              ts: Date.now(),
              action,
              device: Number.isInteger(msg.device) ? msg.device : null,
            }),
          );
      } else if (action === "share") share();
      else if (action === "unshare") unshare();
      else if (action === "revoke") revoke();
      else if (action === "onair" || action === "offair") {
        onAir = action === "onair";
        publish();
      } else if (action === "clear") {
        history = [];
        toViewers({ type: "caption_clear" });
        publish();
      }
      return true;
    }
    return msg.type === "caption_command" || msg.type === "caption_status";
  }
  function gone(ws) {
    if (ws !== engine) return;
    engine = null;
    info = null;
    publish();
    toViewers(viewerState());
  }
  function close() {
    for (const ws of viewers.clients) ws.terminate();
    viewers.close();
    return unshare();
  }
  return {
    fromRelay,
    gone,
    close,
    share,
    unshare,
    revoke,
    status,
    /** For tests: the current caption code. Never written to a log. */
    code: () => token,
  };
}

module.exports = {
  createCaptions,
  engineState,
  captionLine,
  CAPTION_LIMITS,
};
