/* VerseObs phone remote: four commands, a clear connection state, nothing else. */
(function () {
  "use strict";
  var CODE_KEY = "verseobs_remote_code";
  var RETRY = [1000, 2000, 4000, 8000, 10000];
  var STALE_MS = 40000;
  var ACK_MS = 4000;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var params = new URLSearchParams(location.search);
  var code = params.get("code") || "";
  try {
    if (code) sessionStorage.setItem(CODE_KEY, code);
    else code = sessionStorage.getItem(CODE_KEY) || "";
  } catch (e) {}
  // Keep the pairing code out of the address bar, screenshots and history.
  if (params.has("code") && history.replaceState)
    history.replaceState(null, "", location.pathname);

  var ws = null,
    attempt = 0,
    retryTimer = 0,
    staleTimer = 0,
    lastState = null,
    link = "connecting",
    stopped = false,
    stopMessage = "",
    seq = 0,
    pending = {};

  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }
  function setLink(state, pill) {
    link = state;
    document.body.dataset.link = state;
    $("link-pill").textContent = pill;
    render();
  }
  function banner(message, retry) {
    var el = $("banner");
    el.hidden = !message;
    el.replaceChildren();
    if (!message) return;
    var text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);
    if (retry) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Réessayer";
      button.addEventListener("click", function () {
        reconnectNow();
      });
      el.appendChild(button);
    }
  }
  function stop(state, pill, message) {
    stopped = true;
    stopMessage = message;
    lastState = null; // never keep showing the service once access ends
    clearTimeout(retryTimer);
    setLink(state, pill);
    banner(message, false);
  }

  /** « Psaumes 119:1-48 » → « 1-48 »; a whole chapter → « chapitre entier ». */
  function asked(label) {
    var m = /:(\S+)$/.exec(String(label || ""));
    return m ? m[1] : "chapitre entier";
  }

  function render() {
    var s = lastState,
      online = link === "online" && s && s.studio;
    var ended = link === "refused" || link === "disabled" || link === "nocode";
    $("session-name").textContent = s && s.studio
      ? s.session || "Session sans nom"
      : link === "online"
        ? "Studio indisponible"
        : link === "nocode"
          ? "Télécommande non appairée"
          : ended
            ? "Télécommande déconnectée"
            : "VerseObs Studio";
    var total = s && s.position ? s.position.total : 0,
      index = s && s.position ? s.position.index : 0;
    $("position").textContent = online && total ? index + " / " + total : "";
    var current = online && s.current,
      next = online && s.next;
    $("current-ref").textContent = current
      ? current.label
      : online
        ? "Conducteur vide"
        : "—";
    $("current-text").textContent = current
      ? current.text
      : online
        ? "Ajoutez des passages dans le Studio."
        : "";
    // A plan of a split passage says its place, as in the Studio's conductor.
    var plan = current && current.parts ? "plan " + current.part + "/" + current.parts : "";
    $("current-plan").textContent = plan;
    $("current-plan").hidden = !plan;
    $("next-ref").textContent = next ? next.label : online && total ? "Fin du conducteur" : "—";
    $("next-text").textContent = next ? next.text : "";
    var out = (online && s.output) || null,
      outState = !out
        ? "unknown"
        : out.visible && out.confirmed
          ? out.shown
            ? "partial"
            : "confirmed"
          : out.visible
            ? "pending"
            : out.connected
              ? "hidden"
              : "offline";
    $("output").dataset.state = outState;
    $("output-label").textContent = {
      unknown: "État de la sortie inconnu",
      confirmed: "Sortie confirmée",
      partial: "Partiel",
      pending: "Commande de diffusion",
      hidden: "Rien n’est diffusé",
      offline: "Aucune sortie connectée",
    }[outState];
    // Too long for the band: the verses really on air, then what was asked
    // (« Partiel · 119:1-4 (demandé 1-48) »), as the Studio says it.
    $("output-ref").textContent =
      outState === "partial"
        ? out.shown + " (demandé " + asked(out.label) + ")"
        : out && out.visible && out.label
          ? out.label
          : "";
    // Same rule as the Studio: the item's identifier, label + version only
    // when the output predates identifiers.
    var currentLive = !!(
      current &&
      out &&
      out.visible &&
      (out.cue
        ? out.cue === current.cue
        : out.label === current.label &&
          (out.version || "") === (current.version || ""))
    );
    $("current-live").hidden = !currentLive;
    $("current-live").textContent =
      outState === "partial"
        ? "Partiel"
        : out && out.confirmed
          ? "À l’antenne"
          : "Envoi…";
    $("current-title").parentNode.parentNode.classList.toggle(
      "is-live",
      currentLive,
    );
    // One colour per state, as in the Studio (red program, amber pending).
    document.body.dataset.output = outState;
    $("btn-prev").disabled = !online || index <= 1;
    $("btn-next").disabled = !online || !total || index >= total;
    $("btn-show").disabled = !online || !total;
    // Masquer stays available while paired: if the link drops, it reconnects
    // first. Once access is revoked or the mode is off, it can do nothing.
    $("btn-hide").disabled = ended;
  }

  function clearStale() {
    clearTimeout(staleTimer);
    staleTimer = setTimeout(function () {
      // No news from the computer for a while: the link is silently dead.
      if (ws) ws.close();
    }, STALE_MS);
  }
  function schedule() {
    if (stopped) return;
    clearTimeout(retryTimer);
    var delay = RETRY[Math.min(attempt, RETRY.length - 1)];
    attempt++;
    setLink("reconnecting", "Reconnexion…");
    banner(
      "Connexion perdue avec le Studio. Nouvelle tentative dans " +
        Math.round(delay / 1000) +
        " s. Vérifiez que le téléphone est sur le même Wi-Fi.",
      true,
    );
    retryTimer = setTimeout(connect, delay);
  }
  /** Why did the socket fail? Only the server can tell a refused code apart. */
  function diagnose() {
    fetch("/api/remote/check?code=" + encodeURIComponent(code), {
      cache: "no-store",
    })
      .then(function (res) {
        if (res.status === 401)
          stop(
            "refused",
            "Accès refusé",
            "Ce code n’est plus valide (révoqué ou mode réseau relancé). Scannez le nouveau QR code dans le Studio, onglet Connexions.",
          );
        else if (res.status === 429) {
          setLink("reconnecting", "En pause");
          banner(
            "Trop de tentatives depuis ce téléphone. Nouvel essai dans une minute.",
            false,
          );
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 60000);
        } else schedule();
      })
      .catch(schedule);
  }
  function connect() {
    if (stopped) return;
    clearTimeout(retryTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    if (link !== "reconnecting") setLink("connecting", "Connexion…");
    var socket;
    try {
      socket = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/verseobs-remote?code=" +
          encodeURIComponent(code),
      );
    } catch (e) {
      schedule();
      return;
    }
    ws = socket;
    var opened = false;
    socket.onopen = function () {
      opened = true;
      attempt = 0;
      banner("");
      setLink("online", "Connecté");
      clearStale();
    };
    socket.onmessage = function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      clearStale();
      if (msg.type === "state") {
        lastState = msg;
        if (!msg.studio)
          banner(
            "Le Studio est fermé ou n’est plus relié. Ouvrez VerseObs Studio sur l’ordinateur.",
            false,
          );
        else if (link === "online") banner("");
        render();
      } else if (msg.type === "ack" || msg.type === "error") settle(msg);
    };
    socket.onclose = function (event) {
      if (ws !== socket) return;
      ws = null;
      clearTimeout(staleTimer);
      Object.keys(pending).forEach(function (ref) {
        settle({ type: "error", ref: ref, reason: "closed" });
      });
      if (event.code === 4401)
        stop(
          "refused",
          "Accès révoqué",
          "L’accès a été révoqué depuis le Studio. Scannez le nouveau QR code pour reprendre la main.",
        );
      else if (event.code === 4000)
        stop(
          "disabled",
          "Désactivé",
          "Le mode réseau local a été désactivé dans le Studio. Réactivez-le, puis scannez le nouveau QR code.",
        );
      else if (!opened) diagnose();
      else schedule();
    };
  }
  function reconnectNow() {
    if (stopped || link === "online") return;
    attempt = 0;
    connect();
  }

  function settle(msg) {
    var entry = pending[msg.ref];
    if (!entry) return;
    delete pending[msg.ref];
    clearTimeout(entry.timer);
    entry.button.classList.remove("is-pending");
    entry.button.removeAttribute("aria-busy");
    if (msg.type === "ack") {
      entry.button.classList.add("is-done");
      setTimeout(function () {
        entry.button.classList.remove("is-done");
      }, 450);
      return;
    }
    haptic([30, 60, 30]);
    var reasons = {
      rate_limited: "Trop de commandes d’affilée : patientez une seconde.",
      studio_absent:
        "Le Studio n’est pas ouvert sur l’ordinateur : la commande n’a pas été envoyée.",
      timeout: "Pas de réponse du Studio. Vérifiez la connexion.",
      closed: "Connexion interrompue : la commande n’a peut-être pas été reçue.",
      forbidden: "Commande refusée.",
    };
    banner(reasons[msg.reason] || reasons.forbidden, false);
  }
  function press(button) {
    var command = button.dataset.command;
    haptic(12);
    if (stopped) {
      haptic([30, 60, 30]);
      banner(stopMessage, false);
      return;
    }
    if (!ws || ws.readyState !== 1 || link !== "online") {
      haptic([30, 60, 30]);
      banner(
        "Pas de connexion au Studio : nouvelle tentative en cours…",
        false,
      );
      reconnectNow();
      return;
    }
    var ref = "r" + ++seq;
    button.classList.add("is-pending");
    button.setAttribute("aria-busy", "true");
    pending[ref] = {
      button: button,
      timer: setTimeout(function () {
        settle({ type: "error", ref: ref, reason: "timeout" });
      }, ACK_MS),
    };
    ws.send(JSON.stringify({ type: "command", command: command, ref: ref }));
  }

  document.querySelectorAll("[data-command]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!button.disabled) press(button);
    });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") reconnectNow();
  });
  window.addEventListener("online", reconnectNow);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) reconnectNow();
  });

  if (!code) {
    stop(
      "nocode",
      "Non appairé",
      "Ouvrez cette page en scannant le QR code affiché dans le Studio, onglet Connexions.",
    );
  } else {
    render();
    connect();
  }
})();
