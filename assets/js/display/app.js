/* Preview, program monitor and real outputs deliberately have separate roles. */
(function () {
  "use strict";
  var V = window.VerseObs,
    MSG = V.MSG,
    renderer,
    channel,
    timer = null,
    generation = 0,
    label = "";
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
      channel.send({ type: MSG.OUTPUT_STATE, visible: visible, label: label });
  }
  function styleFor(style) {
    var result = Object.assign({}, style || {});
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
  function hide() {
    var token = ++generation;
    clearTimer();
    renderer.hide().then(function () {
      if (token !== generation) return;
      visible = false;
      label = "";
      report();
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
        hide();
        return;
      }
      if (msg.type !== MSG.SHOW_VERSE && msg.type !== MSG.SHOW_TEXT) return;
    }
    clearTimer();
    var token = ++generation,
      style = styleFor(msg.settings);
    var data = {
      text: msg.text || "",
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
    renderer.show(data).then(function (applied) {
      if (token !== generation || applied === false) return;
      visible = true;
      label = msg.reference || msg.title || "Texte libre";
      report();
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
