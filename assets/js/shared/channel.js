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
  // Every message carries `at`, a stamp later than every stamp this channel
  // has sent, read or received, and than this machine's clock (a hybrid
  // logical clock): a command sent after another one was seen, by the same
  // tab, another tab or a reloaded Studio, carries a later stamp, even in
  // the same millisecond. A stamp more than a minute ahead of the clock (the
  // clock went back since, or a page sent nonsense) orders nothing.
  var AHEAD = 60000,
    clock = 0;
  function trusted(at) {
    return typeof at === "number" && at > 0 && at <= Date.now() + AHEAD;
  }
  function see(at) {
    if (trusted(at) && at > clock) clock = at;
  }
  function stamp() {
    if (!trusted(clock)) clock = 0;
    clock = Math.max(Date.now(), clock + 1);
    return clock;
  }
  try {
    see(JSON.parse(lastRaw).at);
  } catch (e) {}
  // The poll below reads only the last command written to localStorage: on a
  // busy machine it may hand a later command over before BroadcastChannel, a
  // storage event or the relay delivers an earlier one. A preview replaces
  // the previous preview; a program command (show a verse, show a text,
  // hide) replaces the previous one. In each slot, a command older than the
  // one already delivered is dropped: from the same sender, by its command
  // number; from any sender (another tab, a reloaded Studio), by its stamp.
  // Two senders' commands stamped alike are both delivered, in arrival order.
  // Every other command is delivered as is.
  var replaces = {},
    latest = {},
    top = {};
  replaces[V.MSG.PREVIEW] = replaces[V.MSG.PREVIEW_HIDE] = "preview";
  replaces[V.MSG.SHOW_VERSE] =
    replaces[V.MSG.SHOW_TEXT] =
    replaces[V.MSG.HIDE] =
      "program";
  function superseded(msg) {
    var slot = replaces[msg.type],
      id = String(msg.id || ""),
      from = String(msg.sender || "");
    if (!slot) return false;
    var n = from && id.indexOf(from + ":") === 0 ? Number(id.slice(from.length + 1)) : 0,
      k = from + " " + slot;
    if (n > 0 && latest[k] >= n) return true;
    if (top[slot] && !trusted(top[slot])) delete top[slot];
    if (trusted(msg.at) && msg.at < top[slot]) return true;
    if (n > 0) latest[k] = n;
    if (trusted(msg.at) && !(top[slot] >= msg.at)) top[slot] = msg.at;
    return false;
  }
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
    see(msg.at);
    if (superseded(msg)) return;
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
      at: stamp(),
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
  /** Local relay only (phone remote administration): never other tabs. */
  self.sendRelay = function (msg) {
    if (stopped || !ws || ws.readyState !== 1) return false;
    try {
      ws.send(
        JSON.stringify(
          Object.assign({}, msg, {
            sender: sender,
            id: sender + ":" + ++seq,
            ts: Date.now(),
            at: stamp(),
          }),
        ),
      );
      return true;
    } catch (e) {
      return false;
    }
  };
  self.relayConnected = function () {
    return !!ws && ws.readyState === 1;
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
