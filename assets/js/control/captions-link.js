/* Live English captions: control of the local listening service (Connexions). */
(function () {
  "use strict";
  var V = window.VerseObs;

  /** options: { channel, notify(message, type) } */
  V.CaptionsLink = function (options) {
    var self = this,
      el = function (id) {
        return document.getElementById(id);
      },
      card = el("captions-card"),
      status = null,
      relay = false,
      busy = "",
      busyTimer = 0,
      lastQr = "";

    function send(action, extra) {
      var ok = options.channel.sendRelay(
        Object.assign({ type: "caption_admin", action: action }, extra || {}),
      );
      if (!ok)
        options.notify(
          "Relais local indisponible : lancez VerseObs avec npm start sur cet ordinateur.",
          "error",
        );
      return ok;
    }
    function wait(what) {
      busy = what;
      clearTimeout(busyTimer);
      busyTimer = setTimeout(function () {
        busy = "";
        render();
      }, 4000);
    }
    function seconds(n) {
      return n == null ? "—" : n.toFixed(1).replace(".", ",") + " s";
    }
    function option(select, value, label) {
      var o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      select.appendChild(o);
    }
    function render() {
      var s = status || { engine: false, state: null, share: {}, onAir: false },
        st = s.engine ? s.state || {} : null,
        engine = !!st,
        listening = engine && st.status === "listening",
        share = s.share || {};
      card.dataset.state = !relay ? "unavailable" : listening ? "active" : "off";
      card.dataset.engine = !engine ? "absent" : st.status;
      el("captions-unavailable").hidden = relay;
      el("captions-body").hidden = !relay;
      el("captions-badge").textContent = listening ? "À l’écoute" : "Facultatif";
      if (!relay) return;

      var line;
      if (!engine)
        line =
          "Service d’écoute non détecté : lancez « lancer-ecoute » sur cet ordinateur.";
      else if (st.status === "loading")
        line = "Service d’écoute : chargement des modèles…";
      else if (st.status === "stopping") line = "Arrêt en cours…";
      else if (listening)
        line =
          "À l’écoute : " +
          (st.source || "entrée audio") +
          (st.file ? " (simulation)" : "");
      else if (st.status === "error") line = "Service d’écoute en erreur.";
      else
        line =
          "Service d’écoute prêt" +
          (st.model ? " (" + [st.model, st.translator].filter(Boolean).join(", ") + ")" : "") +
          ".";
      el("captions-engine").textContent = line;

      var select = el("captions-device"),
        devices = (st && st.devices) || [],
        key = JSON.stringify([devices, st && st.file, engine]);
      if (select.dataset.key !== key) {
        var keep = select.value;
        select.dataset.key = key;
        select.replaceChildren();
        if (st && st.file) option(select, "", "Fichier de simulation");
        else {
          option(select, "", engine ? "Entrée par défaut de l’ordinateur" : "—");
          devices.forEach(function (d) {
            option(select, String(d.index), d.name);
          });
        }
        var wanted = keep || (st && st.device != null ? String(st.device) : "");
        for (var i = 0; i < select.options.length; i++)
          if (select.options[i].value === wanted) select.value = wanted;
      }
      select.disabled = !engine || listening || !!(st && st.file);
      el("captions-start").hidden = listening;
      el("captions-start").disabled =
        !engine ||
        st.status === "loading" ||
        st.status === "stopping" ||
        busy === "start";
      el("captions-stop").hidden = !listening;

      var lat = (st && st.latency) || {};
      el("captions-latency").textContent =
        lat.last == null
          ? "—"
          : seconds(lat.last) + (lat.avg != null ? " (moy. " + seconds(lat.avg) + ")" : "");
      el("captions-backlog").textContent =
        (listening && st.backlog != null ? seconds(st.backlog) : "—") +
        (lat.skipped ? " · " + Math.round(lat.skipped) + " s sautées" : "");
      el("captions-cpu").textContent =
        st && st.cpu != null
          ? Math.round(st.cpu) + " %" + (st.ram ? " · " + st.ram + " Mo" : "")
          : "—";

      var error = (st && st.error) || share.error || "";
      el("captions-error").hidden = !error;
      el("captions-error").textContent = error;

      var last = s.last;
      el("captions-last").hidden = !last;
      if (last) {
        el("captions-last-en").textContent = last.en || "";
        el("captions-last-fr").textContent = last.fr || "";
      }

      el("captions-share-off").hidden = !!share.active;
      el("captions-share-on").hidden = !share.active;
      el("captions-share").disabled = busy === "share";
      if (!share.active) {
        lastQr = "";
        el("captions-qr").replaceChildren();
        el("captions-url").value = "";
      } else if (share.url !== lastQr) {
        lastQr = share.url;
        try {
          el("captions-qr").innerHTML = V.QR.toSvg(share.url, {
            ecl: "M",
            border: 2,
            dark: "#111214",
          });
        } catch (e) {
          el("captions-qr").textContent = "QR code indisponible";
        }
        el("captions-url").value = share.url;
      }
      var n = share.viewers || 0;
      el("captions-viewers").textContent = n
        ? n + (n > 1 ? " téléphones connectés" : " téléphone connecté")
        : "Aucun téléphone connecté";
      el("captions-viewers").classList.toggle("is-connected", n > 0);
      el("captions-onair").checked = !!s.onAir;
    }

    options.channel.onMessage(function (msg) {
      if (msg.type === "caption_status") {
        var wasListening =
          status && status.engine && status.state && status.state.status === "listening";
        status = msg;
        var share = msg.share || {};
        if (busy === "share" && (share.active || share.error)) busy = "";
        var listening = msg.engine && msg.state && msg.state.status === "listening";
        if (busy === "start" && (listening || (msg.state && msg.state.error))) busy = "";
        if (!wasListening && listening)
          options.notify("Écoute démarrée : les sous-titres anglais arrivent.", "info");
        render();
      } else if (msg.type === "caption" && status && msg.en) {
        status.last = { en: msg.en, fr: msg.fr, latency: msg.latency };
        render();
      }
    });

    self.setRelay = function (connected) {
      relay = connected;
      if (!connected) status = null;
      else send("status");
      render();
    };

    el("captions-start").addEventListener("click", function () {
      var value = el("captions-device").value;
      if (send("start", { device: value === "" ? null : Number(value) })) {
        wait("start");
        render();
      }
    });
    el("captions-stop").addEventListener("click", function () {
      send("stop");
    });
    el("captions-share").addEventListener("click", function () {
      if (send("share")) {
        wait("share");
        render();
      }
    });
    el("captions-unshare").addEventListener("click", function () {
      send("unshare");
    });
    el("captions-revoke").addEventListener("click", function () {
      if (send("revoke"))
        options.notify(
          "Nouveau lien créé : les téléphones déjà connectés doivent scanner le nouveau QR code.",
          "success",
        );
    });
    el("captions-onair").addEventListener("change", function (e) {
      // Explicit operator action only: OBS shows nothing until this is ticked.
      if (!send(e.target.checked ? "onair" : "offair")) e.target.checked = false;
    });
    el("captions-obs-url").value =
      location.protocol + "//" + location.host + "/sous-titres.html?obs=1";

    relay = options.channel.relayConnected();
    if (relay) send("status");
    render();
  };
})();
