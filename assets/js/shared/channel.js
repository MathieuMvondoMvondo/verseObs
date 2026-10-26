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
  // the same millisecond. This clock never goes back, even when the
  // machine's clock does (NTP correction, time changed by hand, a page whose
  // clock is behind): it then counts on from its last stamp until the
  // machine's clock catches up. Every stamp heard is followed, however far
  // ahead within the horizon below: a stamp an hour ahead is what every
  // page sends for an hour after the clock went back an hour. A new page (a
  // reloaded Studio) starts after the last message left in localStorage,
  // and follows the output's answer to its first ping.
  // A stamp is a plausible date: a positive number of milliseconds, at most
  // ten years ahead of this machine's clock. A clock set back by hand, or
  // another page an hour, a day or a year ahead, stays well within it. A
  // mark beyond (corrupted storage, a broken sender, the edge of the Date
  // range in year 275760) is neither followed nor kept, and orders nothing:
  // no page counts on from it past the range, and no output waits behind it
  // for ever (review 6, N1).
  var clock = 0,
    HORIZON = 10 * 365.25 * 864e5;
  function valid(at) {
    return typeof at === "number" && at > 0 && at <= Date.now() + HORIZON;
  }
  function see(at) {
    if (valid(at) && at > clock) clock = at;
    // Kept apart from the transient message (which pings overwrite): a
    // reload never forgets a high-water mark, and a tab need not wait for
    // another tab's message event before sending after it. Storage may be
    // unavailable in an isolated OBS context: its channel still follows
    // every received stamp and the output's answer to the first ping.
    // A stored mark that is not a plausible date is ignored, then
    // overwritten by this page's own.
    try {
      var saved = Number(localStorage.getItem(key + "_clock"));
      if (valid(saved) && saved > clock) clock = saved;
      if (valid(clock)) localStorage.setItem(key + "_clock", String(clock));
    } catch (e) {}
  }
  function stamp() {
    see();
    // Only a machine clock set back more than ten years leaves the mark
    // beyond the horizon: start again from the clock rather than send
    // stamps no output would order.
    if (!valid(clock + 1)) clock = 0;
    clock = Math.max(Date.now(), clock + 1);
    see(clock);
    return clock;
  }
  see();
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
  // Two senders' commands stamped alike (two tabs within one millisecond,
  // before the shared clock reaches the other one; OBS's own browser and a
  // Studio in Chrome before they first hear each other) are told apart by a
  // key every output reads the same way: the stamp, then the sender, then
  // the sender's command number. Whatever order the transports hand them
  // over in, every output (OBS program, projector) ends on the same one.
  // Every other command is delivered as is.
  var replaces = {},
    latest = {},
    top = {};
  replaces[V.MSG.PREVIEW] = replaces[V.MSG.PREVIEW_HIDE] = "preview";
  replaces[V.MSG.SHOW_VERSE] =
    replaces[V.MSG.SHOW_TEXT] =
    replaces[V.MSG.HIDE] =
      "program";
  function before(at, from, n, last) {
    if (at !== last.at) return at < last.at;
    if (from !== last.from) return from < last.from;
    return n < last.n;
  }
  function older(msg, slot, from, n) {
    var last = top[slot];
    if (n > 0 && latest[from + " " + slot] >= n) return true;
    // A recorded mark the clock has fallen ten years behind orders nothing.
    return !!last && valid(last.at) && valid(msg.at) && before(msg.at, from, n, last);
  }
  function record(msg, slot, from, n) {
    if (n > 0) latest[from + " " + slot] = n;
    var last = top[slot];
    if (valid(msg.at) && !(last && valid(last.at) && !before(last.at, last.from, last.n, { at: msg.at, from: from, n: n })))
      top[slot] = { at: msg.at, from: from, n: n };
  }
  function superseded(msg) {
    var slot = replaces[msg.type],
      id = String(msg.id || ""),
      from = String(msg.sender || "");
    if (!slot) return false;
    var n = from && id.indexOf(from + ":") === 0 ? Number(id.slice(from.length + 1)) : 0;
    if (older(msg, slot, from, n)) return true;
    record(msg, slot, from, n);
    return false;
  }
  // Styles are patches, not program takes: a later font change must not
  // discard an earlier colour change that arrives last. Order each property
  // independently, including settings carried by a Diffuser. If that
  // Diffuser arrives after a newer style, keep the newer values while still
  // delivering its text. Nothing about the output's rendering changes.
  var styleValues = Object.create(null);
  function orderStyle(msg) {
    var show = msg.type === V.MSG.SHOW_VERSE || msg.type === V.MSG.SHOW_TEXT;
    if ((!show && msg.type !== V.MSG.UPDATE_STYLE) ||
        !msg.settings || typeof msg.settings !== "object") return msg;
    var from = String(msg.sender || ""), id = String(msg.id || ""),
      n = from && id.indexOf(from + ":") === 0 ? Number(id.slice(from.length + 1)) : 0,
      settings = Object.create(null);
    Object.keys(msg.settings).forEach(function (k) {
      var slot = "style " + k;
      if (older(msg, slot, from, n)) {
        if (show) settings[k] = styleValues[k];
      } else {
        settings[k] = styleValues[k] = msg.settings[k];
        record(msg, slot, from, n);
      }
    });
    if (!show && !Object.keys(settings).length) return null;
    return Object.assign({}, msg, { settings: settings });
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
    msg = orderStyle(msg);
    if (!msg) return;
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
      receive(JSON.parse(raw));
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
