/* VerseObs — on-air motion primitives (Web Animations API).
 *
 * Every movement can be interrupted. freeze() commits what is on screen at
 * that instant and cancels the running animations, so the next movement always
 * starts from what the audience actually sees: no jump, no flash, no cut.
 * Without the Web Animations API (old engines, tests), states apply instantly. */
(function () {
  "use strict";

  var V = (window.VerseObs = window.VerseObs || {});

  var EASE = {
    // entrances: immediate response, long soft landing
    out: "cubic-bezier(0.23, 1, 0.32, 1)",
    // the axis being drawn and the reference rising from its slot
    expo: "cubic-bezier(0.16, 1, 0.3, 1)",
    // shapes that change size while staying on screen
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    // large areas (the band): no pop on the first frame, a soft landing
    fade: "cubic-bezier(0.4, 0, 0.2, 1)",
    // the band arriving: visible from the first frames, without popping
    soft: "cubic-bezier(0.25, 0.1, 0.25, 1)",
    // leaving: a short, decisive acceleration
    exit: "cubic-bezier(0.55, 0, 0.75, 0.3)",
    // reading-order reveal: starts at once, the last lines settle gently
    read: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  };

  var revealLength = false;
  try {
    if (window.CSS && typeof window.CSS.registerProperty === "function") {
      window.CSS.registerProperty({
        name: "--vo-reveal",
        syntax: "<length>",
        inherits: false,
        initialValue: "0px",
      });
      revealLength = true;
    }
  } catch (e) {
    // Already registered in this document: still animatable.
    revealLength = /registered/i.test(String(e && e.message));
  }

  // Interruptible motion needs finished promises and commitStyles()
  // (Chromium 84+). Older browser sources show every state instantly.
  var capable = !!(
    window.Animation &&
    window.Animation.prototype &&
    "finished" in window.Animation.prototype &&
    typeof window.Animation.prototype.commitStyles === "function"
  );

  function supported(el) {
    return !!(capable && el && typeof el.animate === "function");
  }

  function reduced() {
    try {
      return !!(
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  }

  function setStyle(el, name, value) {
    if (name.indexOf("--") === 0) el.style.setProperty(name, value);
    else el.style[name] = value;
  }

  function apply(el, frame) {
    if (!el || !frame) return;
    for (var name in frame) {
      if (
        Object.prototype.hasOwnProperty.call(frame, name) &&
        name !== "offset" &&
        name !== "easing" &&
        name !== "composite"
      )
        setStyle(el, name, frame[name]);
    }
  }

  /** Commit the values currently on screen and stop every animation of el. */
  function freeze(el) {
    if (!el || typeof el.getAnimations !== "function") return;
    el.getAnimations().forEach(function (animation) {
      try {
        animation.commitStyles();
      } catch (e) {}
      animation.cancel();
    });
  }

  function current(el, to) {
    var style = window.getComputedStyle(el),
      from = {};
    for (var name in to) {
      if (!Object.prototype.hasOwnProperty.call(to, name)) continue;
      from[name] =
        name.indexOf("--") === 0
          ? style.getPropertyValue(name).trim() || "0px"
          : style[name];
    }
    return from;
  }

  /**
   * Move el to `to`, from `opts.from` or from what is on screen now.
   * Resolves true when the movement finished, false when it was interrupted.
   */
  function tween(el, to, opts) {
    opts = opts || {};
    if (!el) return Promise.resolve(false);
    if (!supported(el) || !(opts.duration > 0)) {
      apply(el, to);
      return Promise.resolve(true);
    }
    var animation;
    try {
      animation = el.animate([opts.from || current(el, to), to], {
        duration: opts.duration,
        delay: opts.delay || 0,
        easing: opts.easing || EASE.out,
        fill: "both",
      });
    } catch (e) {
      apply(el, to);
      return Promise.resolve(true);
    }
    return animation.finished.then(
      function () {
        try {
          animation.commitStyles();
        } catch (e) {
          apply(el, to);
        }
        animation.cancel();
        return true;
      },
      function () {
        return false;
      },
    );
  }

  /**
   * Reveal a text block in reading order: a soft edge, about one and a half
   * lines tall, travels from the first line to the last. The text itself never
   * moves. Falls back to a fade when lengths cannot be animated.
   */
  function develop(el, opts) {
    opts = opts || {};
    var height = el.offsetHeight;
    if (!revealLength || !height || !supported(el)) {
      return tween(
        el,
        { opacity: "1" },
        {
          from: { opacity: "0" },
          duration: opts.duration,
          delay: opts.delay,
          easing: EASE.out,
        },
      );
    }
    // A soft edge of about two and a half lines: a gentle fade travelling
    // down the text rather than a hard wipe.
    var line = parseFloat(window.getComputedStyle(el).fontSize) * 1.45 || 40,
      feather = Math.round(Math.max(line * 2.4, height * 0.3));
    el.style.setProperty("--vo-h", height + "px");
    el.style.setProperty("--vo-f", feather + "px");
    el.style.opacity = "1";
    el.classList.add("is-revealing");
    return tween(
      el,
      { "--vo-reveal": "0px" },
      {
        from: { "--vo-reveal": -(height + feather) + "px" },
        duration: opts.duration,
        delay: opts.delay,
        easing: EASE.read,
      },
    ).then(function (done) {
      if (done) {
        el.classList.remove("is-revealing");
        el.style.removeProperty("--vo-reveal");
      }
      return done;
    });
  }

  V.Motion = {
    EASE: EASE,
    supported: supported,
    reduced: reduced,
    freeze: freeze,
    tween: tween,
    develop: develop,
    apply: apply,
  };
})();
