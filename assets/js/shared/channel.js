/* One command, one delivery across browser, storage and the optional local relay. */
window.VerseObs = window.VerseObs || {};
window.VerseObs.Channel = function (opts) {
  "use strict";
  opts = opts || {};
  var self = this,
    V = window.VerseObs;
  var name = V.CHANNEL_NAME || "verseobs",
    key = V.LS_KEY || "verseobs_msg";
  var sender =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  var seq = 0,
    seen = new Set(),
    listeners = [],
    bc = null,
    ws = null;
  var stopped = false,
    reconnect = null,
    poll = null;
  // Ignore the prior run's transient command; reloading a source never goes live.
  var lastRaw = null;
  try {
    lastRaw = localStorage.getItem(key);
  } catch (e) {}
  function receive(msg) {
    if (
      stopped ||
      !msg ||
      typeof msg !== "object" ||
      typeof msg.type !== "string"
    )
      return;
    if (msg.sender === sender) return;
    var id = msg.id || msg.type + ":" + (msg.ts || msg.timestamp || "");
    if (seen.has(id)) return;
    seen.add(id);
    if (seen.size > 600) seen.delete(seen.values().next().value);
    if (msg.type === V.MSG.PING && opts.autoPong !== false)
      self.send({ type: V.MSG.PONG });
    listeners.slice().forEach(function (fn) {
      fn(msg);
    });
  }
  function readStorage(raw) {
    if (!raw || raw === lastRaw) return;
    lastRaw = raw;
    try {
      var m = JSON.parse(raw);
      if (!m.ts || Math.abs(Date.now() - m.ts) < 15000) receive(m);
    } catch (e) {}
  }
  function onStorage(e) {
    if (e.key === key) readStorage(e.newValue);
  }
  window.addEventListener("storage", onStorage);
  poll = setInterval(function () {
    try {
      readStorage(localStorage.getItem(key));
    } catch (e) {}
  }, 120);
  try {
    bc = new BroadcastChannel(name);
    bc.onmessage = function (e) {
      receive(e.data);
    };
  } catch (e) {}
  function relayState(connected) {
    if (typeof opts.onTransport === "function") opts.onTransport(connected);
  }
  function connectRelay() {
    if (stopped || opts.relay === false || typeof WebSocket === "undefined")
      return;
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") +
        location.host +
        "/verseobs-relay",
    );
    ws.onopen = function () {
      relayState(true);
      if (opts.autoPong === false) self.send({ type: V.MSG.PING });
    };
    ws.onmessage = function (e) {
      try {
        receive(JSON.parse(e.data));
      } catch (err) {}
    };
    ws.onerror = function () {};
    ws.onclose = function () {
      relayState(false);
      if (!stopped) reconnect = setTimeout(connectRelay, 4000);
    };
  }
  self.send = function (msg) {
    if (stopped) return;
    msg = Object.assign({}, msg, {
      sender: sender,
      id: sender + ":" + ++seq,
      ts: Date.now(),
    });
    var raw = JSON.stringify(msg);
    try {
      if (bc) bc.postMessage(msg);
    } catch (e) {}
    try {
      lastRaw = raw;
      localStorage.setItem(key, raw);
    } catch (e) {}
    try {
      if (ws && ws.readyState === 1) ws.send(raw);
    } catch (e) {}
    return msg.id;
  };
  self.onMessage = function (fn) {
    if (typeof fn === "function") listeners.push(fn);
  };
  self.destroy = function () {
    stopped = true;
    listeners = [];
    clearInterval(poll);
    clearTimeout(reconnect);
    window.removeEventListener("storage", onStorage);
    if (bc) bc.close();
    if (ws) ws.close();
  };
  connectRelay();
};
