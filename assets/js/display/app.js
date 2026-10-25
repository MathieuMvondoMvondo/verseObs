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
    // Preview: number of the preview command whose text is measured.
    previewSeq = 0,
    cue = "",
    version = "",
    command = "";
  var params = new URLSearchParams(location.search);
  var preview = params.get("preview") === "1",
    monitor = params.get("monitor") === "1",
    projector = params.get("projector") === "1";
  var visible = false,
    // Cancels the plans being measured for the preview (see reportFit).
    stopMeasuring = null;
  function cancelMeasure() {
    if (stopMeasuring) stopMeasuring();
    stopMeasuring = null;
  }
  function clearTimer() {
    clearTimeout(timer);
    timer = null;
  }
  function report() {
    if (!preview && !monitor && channel)
      channel.send({
        type: MSG.OUTPUT_STATE,
        // OBS program or projector: the Studio's tally follows the program.
        role: projector ? "projector" : "program",
        visible: visible,
        label: label,
        cue: cue,
        version: version,
        command: command,
        // A passage too long for its band shows its first verses only.
        shown: visible && renderer && renderer.partial ? renderer.shown : "",
        // The OBS machine's own setting: the Studio tells the operator.
        reduced: !!(V.Motion && V.Motion.reduced()),
      });
  }
  /**
   * The Studio's preview monitor tells the operator when a text was reduced.
   * Too long for the band: what would go on air at once, then the plans
   * (whole verses) the operator may split it into, measured in short slices
   * (renderer.measurePages) so the Studio — same thread — never freezes.
   */
  function reportFit() {
    if (!preview || window.parent === window) return;
    cancelMeasure();
    var partial = renderer && renderer.partial ? renderer.partial : "",
      data = renderer && renderer._data,
      seq = previewSeq,
      post = function (pages, measuring) {
        try {
          window.parent.postMessage(
            {
              type: "verseobs:fit",
              seq: seq,
              visible: visible,
              fit: renderer ? renderer.fit : 1,
              overflow: renderer ? renderer.overflow : false,
              partial: partial,
              shown: partial ? renderer.shown : "",
              measuring: measuring,
              pages: pages,
            },
            location.origin,
          );
        } catch (e) {}
      };
    if (!(visible && partial && data)) return post(null, false);
    post(null, true);
    stopMeasuring = renderer.measurePages(data, function (pages) {
      stopMeasuring = null;
      if (seq === previewSeq && data === renderer._data) post(pages, false);
    });
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
      cancelMeasure();
      renderer.updateStyle(styleFor(msg.settings));
      reportFit();
      return;
    }
    if (preview) {
      if (msg.type === MSG.PREVIEW_HIDE) {
        cancelMeasure();
        previewSeq = Number(msg.seq) || 0;
        hide();
        return;
      }
      if (msg.type !== MSG.PREVIEW) return;
      cancelMeasure();
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
        if (preview) previewSeq = Number(msg.seq) || 0;
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
    // One logical 1080-line frame scaled to the source: same composition at
    // 720p, 1080p or 4K. Another aspect ratio refits what is on air.
    renderer.layoutFrame();
    window.addEventListener("resize", function () {
      if (renderer.layoutFrame() && renderer.refit()) {
        report();
        reportFit();
      }
    });
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
