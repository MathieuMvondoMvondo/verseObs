/* VerseObs · live English subtitles.
 * Phone page (local network, read-only code) or OBS source (?obs=1, this
 * computer only, shown when the operator turns it on in the Studio). */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search),
    obs = params.get("obs") === "1",
    code = params.get("code") || "",
    feed = document.getElementById("st-feed"),
    empty = document.getElementById("st-empty"),
    statusEl = document.getElementById("st-status"),
    back = document.getElementById("st-back"),
    body = document.body,
    SIZES = [22, 25, 28, 32, 36, 42],
    MAX_LINES = 150,
    OBS_LINES = 2,
    lastN = 0,
    live = false,
    service = false,
    ws = null,
    retry = 0,
    timer = 0,
    follow = true,
    link = "connecting";
  // Arrival log (time and line number) for latency measurements.
  var log = [];
  window.VerseObsSubtitles = { log: log };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }
  var saved = store("verseobs_st_size"),
    size = saved === null || saved === "" ? NaN : Number(saved);
  if (!(size >= 0 && size < SIZES.length)) size = 2; // 28 px by default
  function applySize() {
    body.style.setProperty("--st-size", SIZES[size] + "px");
    document.getElementById("st-smaller").disabled = size === 0;
    document.getElementById("st-larger").disabled = size === SIZES.length - 1;
  }

  function render() {
    body.dataset.link = link;
    body.dataset.live = live ? "1" : "0";
    var text;
    if (link === "denied")
      text = "This link has expired. Ask the media team for the new QR code.";
    else if (link === "offline") text = "Connection lost. Reconnecting…";
    else if (link === "connecting") text = "Connecting…";
    else if (live) text = "Live";
    else if (service) text = "Paused. Subtitles resume when the sermon starts.";
    else text = "Waiting for the translation service…";
    if (statusEl.textContent !== text) statusEl.textContent = text;
  }

  function nearBottom() {
    return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
  }
  function toBottom() {
    feed.scrollTop = feed.scrollHeight;
  }
  function add(line) {
    if (!line || typeof line.en !== "string" || !line.en) return;
    if (typeof line.n === "number") {
      if (line.n <= lastN) return;
      lastN = line.n;
    }
    log.push({ n: line.n, end: line.end || 0, at: Date.now() });
    if (log.length > 400) log.shift();
    var stick = follow || nearBottom();
    var p = document.createElement("p");
    p.className = "st-line is-latest";
    var span = document.createElement("span");
    span.textContent = line.en;
    p.appendChild(span);
    var previous = feed.querySelector(".st-line.is-latest");
    if (previous) previous.classList.remove("is-latest");
    feed.appendChild(p);
    if (empty) empty.hidden = true;
    var all = feed.querySelectorAll(".st-line");
    for (var i = 0; i < all.length - MAX_LINES; i++) all[i].remove();
    if (obs) {
      all = feed.querySelectorAll(".st-line");
      for (var j = 0; j < all.length; j++)
        all[j].classList.toggle("is-recent", j >= all.length - OBS_LINES);
    }
    if (stick) {
      toBottom();
      follow = true;
    }
    back.hidden = follow;
  }
  function clear() {
    feed.querySelectorAll(".st-line").forEach(function (p) {
      p.remove();
    });
    if (empty) empty.hidden = false;
  }

  function schedule() {
    clearTimeout(timer);
    var delay = Math.min(10000, 1000 * Math.pow(2, retry++));
    timer = setTimeout(connect, delay);
  }
  function check() {
    // A refused WebSocket says nothing: ask whether the code is still valid.
    fetch("/api/sous-titres/check?code=" + encodeURIComponent(code), {
      cache: "no-store",
    })
      .then(function (r) {
        if (r.status === 401) {
          link = "denied";
          render();
        } else schedule();
      })
      .catch(schedule);
  }
  function onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "captions_hello") {
      live = !!msg.live;
      service = !!msg.service;
      (msg.lines || []).forEach(add);
    } else if (msg.type === "caption") {
      add(msg);
    } else if (msg.type === "caption_state") {
      live = !!msg.live;
      service = !!msg.service;
    } else if (msg.type === "caption_clear") {
      clear();
    } else if (msg.type === "caption_status") {
      // OBS source only: the operator decides what goes on air.
      service = !!msg.engine;
      live = !!(msg.state && msg.state.status === "listening");
      body.dataset.onair = msg.onAir ? "1" : "0";
    }
    render();
  }
  function connect() {
    clearTimeout(timer);
    if (ws && ws.readyState <= 1) return;
    if (!obs && !code) {
      link = "denied";
      return render();
    }
    var opened = false;
    var url = obs
      ? "ws://" + location.host + "/verseobs-relay"
      : "ws://" +
        location.host +
        "/verseobs-sous-titres?code=" +
        encodeURIComponent(code);
    try {
      ws = new WebSocket(url);
    } catch (e) {
      link = "offline";
      render();
      return schedule();
    }
    ws.onopen = function () {
      opened = true;
      retry = 0;
      link = "open";
      if (obs)
        ws.send(
          JSON.stringify({
            type: "caption_admin",
            action: "status",
            id: "obs-captions-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
          }),
        );
      render();
    };
    ws.onmessage = function (e) {
      try {
        onMessage(JSON.parse(e.data));
      } catch (err) {}
    };
    ws.onerror = function () {};
    ws.onclose = function (e) {
      ws = null;
      if (e.code === 4401) {
        link = "denied";
        return render();
      }
      link = "offline";
      render();
      if (!obs && !opened) check();
      else schedule();
    };
  }

  if (obs) body.classList.add("obs");
  applySize();
  document.getElementById("st-smaller").addEventListener("click", function () {
    if (size > 0) size--;
    store("verseobs_st_size", String(size));
    applySize();
    if (follow) toBottom();
  });
  document.getElementById("st-larger").addEventListener("click", function () {
    if (size < SIZES.length - 1) size++;
    store("verseobs_st_size", String(size));
    applySize();
    if (follow) toBottom();
  });
  feed.addEventListener(
    "scroll",
    function () {
      follow = nearBottom();
      back.hidden = follow;
    },
    { passive: true },
  );
  back.addEventListener("click", function () {
    follow = true;
    toBottom();
    back.hidden = true;
  });
  // A phone that wakes up reconnects at once.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && link !== "denied" && !ws) {
      retry = 0;
      connect();
    }
  });
  render();
  connect();
})();
