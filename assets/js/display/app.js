/* Preview, program monitor and real outputs deliberately have separate roles. */
(function () {
  "use strict";
  var V = window.VerseObs,
    MSG = V.MSG,
    renderer,
    channel,
    timer = null,
    generation = 0,
    label = "",
    // Echoed to the Studio: which conductor item (cue), in which version,
    // after which command — so a duplicate label is never marked on air.
    cue = "",
    version = "",
    command = "";
  var params = new URLSearchParams(location.search);
  var preview = params.get("preview") === "1",
    monitor = params.get("monitor") === "1",
    projector = params.get("projector") === "1";
  var visible = false;
  function clearTimer() {
    clearTimeout(timer);
    timer = null;
  }
  function report() {
    if (!preview && !monitor && channel)
      channel.send({
        type: MSG.OUTPUT_STATE,
        visible: visible,
        label: label,
        cue: cue,
        version: version,
        command: command,
        // A passage too long for its band shows its first verses only.
        shown: visible && renderer && renderer.partial ? renderer.shown : "",
      });
  }
  /** The Studio's preview monitor tells the operator when a text was reduced. */
  function reportFit() {
    if (!preview || window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: "verseobs:fit",
          visible: visible,
          fit: renderer ? renderer.fit : 1,
          overflow: renderer ? renderer.overflow : false,
          // Too long for the band: what would go on air, and the plans
          // (whole verses) the operator may split it into.
          partial: renderer && renderer.partial ? renderer.partial : "",
          shown: renderer && renderer.partial ? renderer.shown : "",
          pages:
            renderer && renderer.partial && renderer._data
              ? renderer.pages(renderer._data)
              : null,
        },
        location.origin,
      );
    } catch (e) {}
  }
  /**
   * A command without a layout comes from an older Studio: keep its card.
   * Stored settings follow the Studio's own migration (see migrateStyle).
   */
  function styleFor(style, stored) {
    var result = Object.assign({}, style || {});
    if (style && style.layout === undefined)
      if (stored) V.migrateStyle(style, result, V.DEFAULTS, "studio");
      else V.migrateStyle(style, result);
    if (result.bgImage === undefined) {
      try {
        result.bgImage = localStorage.getItem("verseobs_bgimage") || "";
      } catch (e) {}
    }
    if (projector) {
      result.position = "center";
      result.fontSize = Math.max(42, Number(result.fontSize) || 42);
      result.maxWidth = 85;
    }
    return result;
  }
  function hide(byCommand) {
    var token = ++generation;
    clearTimer();
    // An automatic hide answers the show command that started its timer.
    if (byCommand !== undefined) command = byCommand;
    // The output stops claiming the text as soon as it starts leaving.
    if (visible) {
      visible = false;
      label = cue = version = "";
      report();
    }
    renderer.hide().then(function () {
      if (token !== generation) return;
      visible = false;
      label = cue = version = "";
      report();
      reportFit();
    });
  }
  function handleMessage(msg) {
    if (!msg || !msg.type || !renderer) return;
    if (msg.type === MSG.PING) {
      report();
      return;
    }
    if (msg.type === MSG.UPDATE_STYLE) {
      renderer.updateStyle(styleFor(msg.settings));
      reportFit();
      return;
    }
    if (preview) {
      if (msg.type === MSG.PREVIEW_HIDE) {
        hide();
        return;
      }
      if (msg.type !== MSG.PREVIEW) return;
    } else {
      if (msg.type === MSG.HIDE) {
        hide(String(msg.command || ""));
        return;
      }
      if (msg.type !== MSG.SHOW_VERSE && msg.type !== MSG.SHOW_TEXT) return;
    }
    clearTimer();
    var token = ++generation,
      style = styleFor(msg.settings);
    var data = {
      text: msg.text || "",
      secondary: msg.secondary || null,
      html: msg.html || "",
      reference: msg.reference || "",
      version: msg.version || "",
      title: msg.title || "",
      subtitle: msg.subtitle || "",
      style: style,
      position: style.position,
      animation: preview ? "none" : style.animation,
      animationDuration: preview ? 0 : style.animationDuration,
    };
    // Confirm as soon as the new text is in place on the output, not at the
    // end of its entrance: the Studio's tally follows what OBS really shows.
    renderer
      .show(data, function () {
        if (token !== generation) return;
        visible = true;
        label = msg.reference || msg.title || "Texte libre";
        cue = String(msg.cue || "");
        version = String(msg.version || "");
        command = String(msg.command || "");
        report();
        reportFit();
      })
      .then(function (applied) {
        if (token !== generation || applied === false) return;
        var duration = Number(style.autoHide) || 0;
        if (!preview && duration > 0) timer = setTimeout(hide, duration);
      });
  }
  function init() {
    var container = document.getElementById("verse-container");
    if (!container) return;
    if (projector) document.body.classList.add("projector");
    renderer = new V.Renderer(container);
    container.classList.add(projector ? "center" : V.DEFAULTS.position);
    try {
      renderer.updateStyle(
        styleFor(
          JSON.parse(localStorage.getItem(V.SETTINGS_KEY)) || V.DEFAULTS,
          true,
        ),
      );
    } catch (e) {
      renderer.updateStyle(styleFor(V.DEFAULTS));
    }
    channel = new V.Channel({ autoPong: !preview && !monitor });
    channel.onMessage(handleMessage);
    if (!preview && !monitor) channel.send({ type: MSG.PONG });
    window.addEventListener("beforeunload", function () {
      channel.destroy();
    });
    // Projector fullscreen is an explicit, keyboard-accessible user action.
    if (projector) {
      var button = document.createElement("button");
      button.className = "projector-fullscreen";
      button.textContent = "Plein écran";
      button.addEventListener("click", function () {
        document.documentElement.requestFullscreen().catch(function () {});
      });
      document.body.appendChild(button);
      document.addEventListener("fullscreenchange", function () {
        button.hidden = !!document.fullscreenElement;
      });
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
  V.DisplayApp = { handleMessage: handleMessage };
})();
