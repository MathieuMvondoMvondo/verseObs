/* Phone remote: pairing in Connexions and a short state for the remote page. */
(function () {
  "use strict";
  var V = window.VerseObs;
  var EXCERPT = 240;

  function excerpt(item) {
    if (!item) return null;
    var text = String(item.text || item.subtitle || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > EXCERPT)
      text =
        text
          .slice(0, EXCERPT)
          .replace(/\s+\S*$/, "")
          .replace(/[\s,;:.!?]+$/, "") + "…";
    return {
      label: String(item.reference || item.title || "Texte libre").slice(0, 140),
      text: text,
      cue: String(item.id || "").slice(0, 64),
      version: String(item.version || "").slice(0, 80),
    };
  }

  /**
   * options: { channel, queue, output(), commands: { prev, next, show, hide },
   *            notify(message, type) }
   */
  V.RemoteLink = function (options) {
    var self = this,
      el = function (id) {
        return document.getElementById(id);
      },
      card = el("remote-card"),
      status = null,
      relay = false,
      timer = 0,
      busy = "",
      lastQr = "";

    function send(action) {
      if (!options.channel.sendRelay({ type: "remote_admin", action: action })) {
        options.notify(
          "Relais local indisponible : lancez VerseObs avec npm start sur cet ordinateur.",
          "error",
        );
        return false;
      }
      return true;
    }
    function snapshot() {
      var items = options.queue.getItems(),
        position = options.queue.getState(),
        index = position.current - 1,
        output = options.output();
      return {
        session: (el("session-name").value || "Ma célébration").slice(0, 100),
        position: { index: items.length ? position.current : 0, total: items.length },
        current: excerpt(items[index]),
        next: excerpt(items[index + 1]),
        output: {
          connected: !!output.connected,
          visible: !!output.visible,
          confirmed: !!output.confirmed,
          label: String(output.label || "").slice(0, 140),
          cue: String(output.cue || "").slice(0, 64),
          version: String(output.version || "").slice(0, 80),
          // The verses really on air when the passage is shown in part.
          shown: String(output.shown || "").slice(0, 40),
        },
      };
    }
    function publish() {
      timer = 0;
      if (!status || !status.active || !relay) return;
      if (status.studio && !status.controller) return;
      options.channel.sendRelay({ type: "remote_state", state: snapshot() });
    }
    self.changed = function () {
      if (!timer) timer = setTimeout(publish, 60);
    };
    function plural(n, one, many) {
      return n + " " + (n > 1 ? many : one);
    }
    function render() {
      var active = !!(status && status.active),
        available = relay;
      card.dataset.state = !available ? "unavailable" : active ? "active" : "off";
      el("remote-off").hidden = active;
      el("remote-on").hidden = !active;
      el("remote-enable").disabled = !available || busy === "enable";
      el("remote-enable-label").textContent =
        busy === "enable" ? "Activation…" : "Activer le mode réseau local";
      el("remote-unavailable").hidden = available;
      el("remote-error").hidden = !(status && status.error);
      el("remote-error").textContent = (status && status.error) || "";
      document.body.classList.toggle("remote-lan-active", active);
      el("remote-badge").textContent = active ? "Actif" : "Facultatif";
      el("remote-header-badge").hidden = !active;
      if (!active) {
        lastQr = "";
        el("remote-qr").replaceChildren();
        el("remote-url").value = "";
        return;
      }
      if (status.url !== lastQr) {
        lastQr = status.url;
        try {
          el("remote-qr").innerHTML = V.QR.toSvg(status.url, {
            ecl: "M",
            border: 2,
            dark: "#111214",
          });
        } catch (e) {
          el("remote-qr").textContent = "QR code indisponible";
        }
        el("remote-url").value = status.url;
      }
      var count = status.remotes || 0;
      el("remote-count").textContent = count
        ? plural(count, "téléphone connecté", "téléphones connectés")
        : "Aucun téléphone connecté";
      el("remote-count").classList.toggle("is-connected", count > 0);
      var others = (status.addresses || []).slice(1);
      el("remote-other-addresses").hidden = !others.length;
      el("remote-other-addresses").textContent = others.length
        ? "Autres adresses : " +
          others
            .map(function (a) {
              return a.address;
            })
            .join(", ")
        : "";
      var elsewhere = status.studio && !status.controller;
      el("remote-elsewhere").hidden = !elsewhere;
      el("remote-here").hidden = elsewhere;
    }
    function onStatus(msg) {
      var wasActive = status && status.active;
      status = msg;
      if (busy === "enable" && (msg.active || msg.error)) busy = "";
      var announce = !wasActive && msg.active && busy !== "init";
      render();
      if (announce) {
        options.notify("Mode réseau local actif. Scannez le QR code.", "info");
        // The enable button is gone: keep keyboard focus inside the card.
        if (card.contains(document.activeElement) || document.activeElement === document.body)
          el("remote-url").focus();
      }
      self.changed();
    }
    function onCommand(command) {
      var action = options.commands[command];
      if (typeof action !== "function") return;
      action();
      // The Studio already confirms broadcasts; show where the command came from.
      var badge = el("remote-header-badge");
      badge.classList.remove("is-pulse");
      void badge.offsetWidth;
      badge.classList.add("is-pulse");
      self.changed();
    }

    options.channel.onMessage(function (msg) {
      if (msg.type === "remote_status") onStatus(msg);
      else if (msg.type === "remote_command") onCommand(msg.command);
    });
    self.setRelay = function (connected) {
      relay = connected;
      if (!connected) {
        status = null;
        busy = "";
      } else {
        busy = "init";
        send("status");
        setTimeout(function () {
          if (busy === "init") busy = "";
        }, 1500);
      }
      render();
    };
    el("remote-enable").addEventListener("click", function () {
      if (!send("enable")) return;
      busy = "enable";
      render();
      setTimeout(function () {
        if (busy !== "enable") return;
        busy = "";
        status = Object.assign({}, status, {
          active: false,
          error:
            "Le serveur local ne répond pas. Arrêtez-le puis relancez npm start.",
        });
        render();
      }, 8000);
    });
    el("remote-disable").addEventListener("click", function () {
      send("disable");
    });
    el("remote-revoke").addEventListener("click", function () {
      if (send("revoke"))
        options.notify(
          "Nouveau code créé : les télécommandes connectées sont déconnectées.",
          "success",
        );
    });
    el("remote-claim").addEventListener("click", function () {
      send("claim");
    });
    el("remote-header-badge").addEventListener("click", function () {
      if (options.openConnections) options.openConnections();
    });
    el("session-name").addEventListener("input", self.changed);
    relay = options.channel.relayConnected();
    render();
  };
})();
