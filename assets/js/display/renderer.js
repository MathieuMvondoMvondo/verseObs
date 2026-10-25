/* VerseObs — on-air renderer.
 *
 * The output behaves like a broadcast template (play / update / stop):
 *  - enter: the band settles, the axis is drawn, the reference rises from its
 *    slots, the text is revealed in reading order;
 *  - change: the band and the axis stay on air and adapt to the new height;
 *    only what changes leaves and comes back (verse numbers roll when the book
 *    stays the same);
 *  - leave: short and decisive.
 * Any command may arrive at any moment: the latest one wins and starts from
 * what is on screen (see Motion.freeze). Long passages are fitted to the frame
 * instead of being cut. */
(function () {
  "use strict";

  var V = (window.VerseObs = window.VerseObs || {});
  var DEFAULTS = V.DEFAULTS;
  var POSITIONS = V.POSITIONS;
  var M = V.Motion;
  var E = M.EASE;

  var REF_POSITIONS = [
    "ref-top-left",
    "ref-top-right",
    "ref-top-center",
    "ref-inline",
  ];
  var LAYOUTS = ["antenne", "carte"];
  /*
   * Readability rules (1080p frame; scaled for other frame heights):
   *  - a lower or upper third is read like subtitles: the band, soft edge
   *    included, covers at most BAND_SHARE of the frame, with at most
   *    BAND_LINES lines of reading text (BAND_LINES_TWO for two translations);
   *  - centred and full-screen texts may use LIMITS of the frame;
   *  - the body is reduced to fit, never below MIN_BODY;
   *  - a passage still too long shows its first whole verses only, and the
   *    reference on air names them (data-partial keeps what was asked): the
   *    Studio proposes « Découper » at verse boundaries;
   *  - a text without verses keeps the old safety net (whole safe area).
   */
  var BAND_SHARE = 0.4,
    BAND_LINES = 4,
    BAND_LINES_TWO = 6,
    MIN_BODY = 32;
  var LIMITS = { center: 0.72, fullscreen: 0.84 };
  var FLOOR_FIT = 0.42,
    SAFE_HEIGHT = 0.86;
  var ANIMATED =
    ".vo-scrim,.vo-axis,.vo-margin,.vo-plate,.vo-copy,.vo-refblock,.vo-line>span,.vo-roll";
  /*
   * The output composes one logical frame, FRAME_LINES units tall, scaled to
   * the browser source: an OBS source of 1280×720, 1920×1080 or 3840×2160
   * shows the very same composition (line breaks, fit, verses on air) as the
   * Studio's 1920×1080 monitors, and every rule above reads that frame.
   * Narrower than 4:3 (portrait), the frame keeps 4:3 units of width and
   * grows taller instead.
   */
  var FRAME_LINES = 1080,
    MIN_ASPECT = 4 / 3;

  /** Logical frame of a window: { width, height, scale } (scale = screen px per unit). */
  function frameOf(width, height) {
    width = width > 0 ? width : 1920;
    height = height > 0 ? height : FRAME_LINES;
    var scale = Math.min(
      height / FRAME_LINES,
      width / (FRAME_LINES * MIN_ASPECT),
    );
    var round = function (v) {
      return Math.round(v * 100) / 100;
    };
    return { width: round(width / scale), height: round(height / scale), scale: scale };
  }

  /** Removes every child (older OBS browser sources lack the DOM shortcut). */
  function empty(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** "1 Corinthiens 13:4-7" → { book: "1 Corinthiens", nums: "13:4-7" }. */
  function splitReference(reference) {
    var value = String(reference || "").trim(),
      match = /^(.*\S)\s+(\d[\d:.,\-–\s]*)$/.exec(value);
    return match
      ? { book: match[1], nums: match[2].trim() }
      : { book: value, nums: "" };
  }

  function secondaryOf(data) {
    try {
      return V.validateSecondary(data.secondary);
    } catch (e) {
      return null;
    }
  }

  function signature(data) {
    return JSON.stringify([
      data.reference || "",
      data.version || "",
      data.text || "",
      data.html || "",
      data.title || "",
      data.subtitle || "",
      secondaryOf(data),
    ]);
  }

  var fontsPromise = null;
  /** Bundled typefaces must be measured with their real metrics. */
  function fontsReady() {
    var fonts = document.fonts;
    if (!fonts || typeof fonts.load !== "function") return Promise.resolve();
    if (!fontsPromise) {
      fontsPromise = Promise.all([
        fonts.load('400 40px "VerseObs Lecture"'),
        fonts.load('italic 400 40px "VerseObs Lecture"'),
        fonts.load('600 40px "VerseObs Titrage"'),
      ]).catch(function () {});
    }
    return Promise.race([
      fontsPromise,
      new Promise(function (resolve) {
        setTimeout(resolve, 900);
      }),
    ]);
  }

  function Renderer(container) {
    this.container = container;
    this.card = null;
    this.currentPosition = DEFAULTS.position;
    this.currentAnimation = DEFAULTS.animation;
    this.animationDuration = DEFAULTS.animationDuration;
    this.layout = DEFAULTS.layout || "antenne";
    this._refPosition = DEFAULTS.refPosition || "top-left";
    this._textAlign = DEFAULTS.textAlign || "left";
    this._signature = null;
    this._data = null;
    this._gen = 0;
    this.fit = 1;
    this.overflow = false;
    this.partial = "";
    this.shown = "";
    this.frame = frameOf(0, 0);
    this._setLayout(this.layout);
  }

  // ---- Frame -----------------------------------------------------------------

  /**
   * Size the container to the logical frame of this window and scale it to
   * the window. Returns true when the logical frame itself changed (another
   * aspect ratio): the text on air must then be fitted again (refit).
   */
  Renderer.prototype.layoutFrame = function () {
    var doc = document.documentElement,
      f = frameOf(
        window.innerWidth || doc.clientWidth,
        window.innerHeight || doc.clientHeight,
      ),
      before = this.frame;
    doc.style.setProperty("--frame-w", f.width + "px");
    doc.style.setProperty("--frame-h", f.height + "px");
    // 1:1 (1080p source, Studio monitors): no transform at all.
    this.container.style.transform =
      f.scale === 1 ? "" : "scale(" + f.scale + ")";
    this.frame = f;
    return before.width !== f.width || before.height !== f.height;
  };

  /** A box in frame units (getBoundingClientRect measures screen px). */
  Renderer.prototype._box = function (el) {
    var r = el.getBoundingClientRect(),
      k = this.frame.scale || 1;
    return {
      top: r.top / k,
      bottom: r.bottom / k,
      width: r.width / k,
      height: r.height / k,
    };
  };

  /** Fit the text on air again (frame or style changed). */
  Renderer.prototype.refit = function () {
    if (!this.card || !this._data) return false;
    // Rebuilt from the data: a passage shortened for one frame or style may
    // show more verses with another.
    this._fill(this.card, this._data);
    this._fit(this.card);
    return true;
  };

  // ---- Building blocks ------------------------------------------------------

  Renderer.prototype._stage = function () {
    var stage = node("div", "verse-card vo-stage");
    stage.appendChild(node("div", "vo-scrim"));
    stage.appendChild(node("div", "vo-axis"));
    stage.appendChild(node("div", "vo-margin"));
    stage.appendChild(node("div", "verse-inline-ref"));
    var body = node("div", "verse-body");
    body.appendChild(node("div", "vo-plate"));
    stage.appendChild(body);
    return stage;
  };

  function parts(stage) {
    return {
      scrim: stage.querySelector(".vo-scrim"),
      axis: stage.querySelector(".vo-axis"),
      margin: stage.querySelector(".vo-margin"),
      inline: stage.querySelector(".verse-inline-ref"),
      body: stage.querySelector(".verse-body"),
      plate: stage.querySelector(".vo-plate"),
      copy: stage.querySelector(".vo-copy"),
      block: stage.querySelector(".vo-refblock"),
    };
  }

  /** Reference block: book, numbers and (single translation) version name. */
  function buildReference(data, secondary) {
    if (!data.reference) return null;
    var block = node("div", "vo-refblock"),
      split = splitReference(data.reference),
      ref = node("div", "verse-reference"),
      book = node("span", "vo-line vo-book");
    book.appendChild(node("span", "", split.book));
    ref.appendChild(book);
    if (split.nums) {
      ref.appendChild(document.createTextNode(" "));
      var nums = node("span", "vo-line vo-nums");
      nums.appendChild(node("span", "vo-roll", split.nums));
      ref.appendChild(nums);
    }
    block.appendChild(ref);
    if (data.version && !secondary) {
      var version = node("div", "vo-line vo-version");
      version.appendChild(node("span", "", data.version));
      block.appendChild(version);
    }
    return block;
  }

  /** Text block: title/subtitle (free text), passage, optional translation. */
  function buildCopy(data, secondary) {
    var copy = node("div", "vo-copy");
    if (data.title) copy.appendChild(node("div", "verse-title", data.title));
    if (data.subtitle)
      copy.appendChild(node("div", "verse-subtitle", data.subtitle));
    if (secondary)
      copy.appendChild(
        node("div", "verse-translation-label", data.version || ""),
      );
    var text = node("div", "verse-text");
    if (data.html) {
      // The HTML comes from the Studio's editor; only an inert allowlist passes.
      text.innerHTML = V.sanitizeHtml(data.html);
    } else {
      var match = data.reference ? /:(\d+)/.exec(data.reference) : null;
      if (match) {
        // The margin already shows the verse in the "antenne" layout (CSS).
        text.appendChild(node("sup", "verse-num vo-lead-num", match[1]));
        text.appendChild(document.createTextNode(data.text || ""));
      } else {
        text.textContent = data.text || "";
      }
    }
    copy.appendChild(text);
    if (secondary) {
      var second = node("section", "verse-secondary");
      if (secondary.lang) second.lang = secondary.lang;
      second.appendChild(
        node(
          "div",
          "verse-translation-label",
          secondary.version + " · " + secondary.reference,
        ),
      );
      var secondText = node("div", "verse-text verse-secondary-text");
      if (secondary.html) secondText.innerHTML = V.sanitizeHtml(secondary.html);
      else secondText.textContent = secondary.text;
      second.appendChild(secondText);
      copy.appendChild(second);
    }
    return copy;
  }

  function fillInline(inline, data) {
    empty(inline);
    if (!data.reference) return;
    inline.appendChild(node("span", "", data.reference));
    if (data.version) inline.appendChild(node("span", "", data.version));
  }

  Renderer.prototype._classes = function (stage, data, secondary) {
    stage.classList.toggle("has-ref", !!data.reference);
    stage.classList.toggle("verse-card-bilingual", !!secondary);
    stage.classList.toggle("align-center", this._textAlign === "center");
    stage.classList.toggle("align-right", this._textAlign === "right");
    REF_POSITIONS.forEach(function (c) {
      stage.classList.remove(c);
    });
    stage.classList.add("ref-" + (this._refPosition || "top-left"));
  };

  Renderer.prototype._fill = function (stage, data) {
    var p = parts(stage),
      secondary = secondaryOf(data);
    this._classes(stage, data, secondary);
    if (p.block) p.block.remove();
    var block = buildReference(data, secondary);
    if (block) p.margin.appendChild(block);
    if (p.copy) p.copy.remove();
    p.body.appendChild(buildCopy(data, secondary));
    fillInline(p.inline, data);
    this._signature = signature(data);
    this._data = data;
  };

  /**
   * Build and measure the next content off-screen, at the width of the stage
   * on air, while the current text is still leaving: the swap that follows
   * costs a single layout, so there is no visible gap between two passages.
   */
  Renderer.prototype._probe = function (data, width, raw) {
    var probe = this._stage(),
      secondary = secondaryOf(data);
    probe.classList.add("vo-probe");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:0;top:0;visibility:hidden;width:" +
      width +
      "px";
    this._classes(probe, data, secondary);
    var block = buildReference(data, secondary);
    if (block) probe.querySelector(".vo-margin").appendChild(block);
    probe.querySelector(".verse-body").appendChild(buildCopy(data, secondary));
    this.container.appendChild(probe);
    if (!raw) this._fit(probe);
    return probe;
  };

  // ---- Measuring -------------------------------------------------------------

  /** Lines of each reading block (primary, then second translation). */
  function linesOf(stage) {
    return Array.prototype.map.call(
      stage.querySelectorAll(".vo-copy .verse-text"),
      function (text) {
        var line = parseFloat(getComputedStyle(text).lineHeight);
        return line ? Math.round(text.offsetHeight / line) : 0;
      },
    );
  }

  /** The rules that apply to this stage in the logical frame and position. */
  Renderer.prototype._rules = function (stage) {
    var frame = this.frame.height,
      position = this.currentPosition,
      band = position === "lower-third" || position === "upper-third",
      size = parseFloat(getComputedStyle(stage).fontSize) || 44;
    stage.style.setProperty("--fit", "1");
    var two = stage.classList.contains("verse-card-bilingual"),
      // In an antenne band, two translations sit side by side (CSS): each
      // column is read like its own subtitle.
      columns = band && two && this.layout === "antenne";
    var rules = {
      frame: frame,
      minFit: Math.min(1, (MIN_BODY * frame) / 1080 / size),
      maxLines: band ? (two && !columns ? BAND_LINES_TWO : BAND_LINES) : Infinity,
      perBlock: columns,
      cap: frame * (LIMITS[position] || 0.72),
    };
    if (band) {
      // What the band adds around the text: soft edge, padding and the
      // margin down (or up) to the frame edge.
      var scrim = stage.querySelector(".vo-scrim"),
        extra =
          this.layout === "antenne" && scrim && scrim.offsetHeight
            ? scrim.offsetHeight - stage.offsetHeight
            : parseFloat(
                getComputedStyle(this.container)[
                  position === "upper-third" ? "paddingTop" : "paddingBottom"
                ],
              ) || 0;
      rules.cap = frame * BAND_SHARE - extra;
    }
    return rules;
  };

  function fits(stage, rules, fit) {
    stage.style.setProperty("--fit", String(fit));
    if (stage.offsetHeight > rules.cap) return false;
    if (rules.maxLines === Infinity) return true;
    var lines = linesOf(stage);
    return (
      (rules.perBlock
        ? Math.max.apply(null, lines.concat(0))
        : lines.reduce(function (a, b) {
            return a + b;
          }, 0)) <= rules.maxLines
    );
  }

  /** Largest fit in [minFit, 1] within the rules, or null when none fits. */
  function within(stage, rules) {
    if (fits(stage, rules, 1)) return 1;
    if (!fits(stage, rules, rules.minFit)) return null;
    var lo = rules.minFit,
      hi = 1;
    for (var i = 0; i < 7 && hi - lo > 0.004; i++) {
      var mid = (lo + hi) / 2;
      if (fits(stage, rules, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Too long at the smallest readable size: keep the first whole verses that
   * fit (at least one) and make the reference on air name them.
   * Returns false when the text has no verses to page through.
   */
  Renderer.prototype._trim = function (stage, rules) {
    var P = V.Passage,
      primary = stage.querySelector(".vo-copy .verse-text:not(.verse-secondary-text)"),
      second = stage.querySelector(".vo-copy .verse-secondary-text");
    if (!P || !primary) return false;
    var mine = P.verses(primary.innerHTML),
      theirs = second ? P.verses(second.innerHTML) : null;
    if (mine.length < 2 || (second && theirs.length < 2)) return false;
    var markup = function (list) {
      return list
        .map(function (v) {
          return v.html;
        })
        .join(" ");
    };
    var show = function (k) {
      var last = mine[k - 1].num;
      primary.innerHTML = markup(mine.slice(0, k));
      if (second)
        second.innerHTML = markup(
          theirs.filter(function (v) {
            return v.num <= last;
          }),
        );
    };
    var best = 1,
      a = 2,
      b = mine.length - 1;
    while (a <= b) {
      var m = (a + b) >> 1;
      show(m);
      if (fits(stage, rules, rules.minFit)) {
        best = m;
        a = m + 1;
      } else b = m - 1;
    }
    show(best);
    var first = mine[0].num,
      last = mine[best - 1].num,
      roll = stage.querySelector(".vo-nums .vo-roll:not(.is-leaving)"),
      label = stage.querySelector(".verse-secondary .verse-translation-label"),
      inline = stage.querySelector(".verse-inline-ref > span");
    if (roll) {
      stage.dataset.partial = roll.textContent;
      roll.textContent = P.range(roll.textContent, first, last);
    } else stage.dataset.partial = "1";
    if (label) label.textContent = P.range(label.textContent, first, last);
    if (inline) inline.textContent = P.range(inline.textContent, first, last);
    return true;
  };

  /** Without verses to page through: the old safety net (whole safe area). */
  function safetyNet(stage, rules) {
    var safe = rules.frame * SAFE_HEIGHT,
      measure = function (value) {
        stage.style.setProperty("--fit", String(value));
        return stage.offsetHeight;
      };
    if (measure(rules.minFit) <= safe) return rules.minFit;
    if (measure(FLOOR_FIT) > safe) return FLOOR_FIT;
    var lo = FLOOR_FIT,
      hi = rules.minFit;
    for (var i = 0; i < 7 && hi - lo > 0.004; i++) {
      var mid = (lo + hi) / 2;
      if (measure(mid) <= safe) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Reduce the text (never the reference) until the block fits its rules. */
  Renderer.prototype._fit = function (stage) {
    delete stage.dataset.partial;
    var rules = this._rules(stage),
      fit = 1;
    if (rules.frame && stage.offsetHeight) {
      fit = within(stage, rules);
      if (fit === null && this._trim(stage, rules)) fit = within(stage, rules);
      if (fit === null) fit = safetyNet(stage, rules);
      fit = Math.floor(fit * 1000) / 1000;
    }
    stage.style.setProperty("--fit", String(fit));
    stage.dataset.fit = fit.toFixed(2);
    this.fit = fit;
    this.partial = stage.dataset.partial || "";
    var roll = stage.querySelector(".vo-nums .vo-roll:not(.is-leaving)");
    this.shown = this.partial && roll ? roll.textContent : "";
    // Still taller than the safe area at the smallest size: say so (Studio hint).
    this.overflow = !!(
      rules.frame &&
      stage.offsetHeight > rules.frame * SAFE_HEIGHT + 1
    );
    this._fitMargin(stage);
    return fit;
  };

  /**
   * Plans for the operator's « Découper »: contiguous ranges of whole verses,
   * each fitting the rules on air (measured here, with the real typefaces, at
   * the width of the stage). Null when the passage has no verses to split.
   */
  Renderer.prototype.pages = function (data) {
    var plan = this._pagePlan(data);
    if (!plan) return null;
    var ranges = [],
      next = pageSearch(plan);
    while (!next(ranges));
    return ranges;
  };

  /**
   * Same plans, measured in slices of at most `budget` ms (default 40): the
   * Studio shares its thread with its preview, and Échap or Masquer must
   * never wait for a long chapter. done(ranges, or null when the passage
   * cannot be split). Returns a function that cancels the measurement.
   */
  Renderer.prototype.measurePages = function (data, done, budget) {
    var plan = this._pagePlan(data),
      cancelled = false,
      timer = null;
    budget = budget > 0 ? budget : 40;
    if (!plan) {
      timer = setTimeout(function () {
        if (!cancelled) done(null);
      }, 0);
    } else {
      var ranges = [],
        next = pageSearch(plan),
        now = function () {
          return window.performance && performance.now
            ? performance.now()
            : Date.now();
        },
        slice = function () {
          timer = null;
          if (cancelled) return;
          var start = now();
          while (!next(ranges))
            if (now() - start >= budget) {
              timer = setTimeout(slice, 0);
              return;
            }
          done(ranges);
        };
      // Let the render that asked for it finish first.
      timer = setTimeout(slice, 0);
    }
    return function () {
      cancelled = true;
      clearTimeout(timer);
    };
  };

  /**
   * One step of the greedy split: from each first verse, the longest run of
   * whole verses that fits (gallop 1, 3, 7… verses, then bisect: small
   * probes first, the same plans as a plain bisection). Each call measures at
   * most one probe; returns true when every verse has its plan.
   */
  function pageSearch(plan) {
    var all = plan.all,
      ok = plan.ok,
      i = 0,
      good,
      bad,
      step,
      gallop;
    function row() {
      good = i;
      bad = all.length;
      step = 1;
      gallop = true;
    }
    row();
    return function (ranges) {
      if (i >= all.length) return true;
      if (gallop) {
        var j = Math.min(good + step, bad - 1);
        if (j > good) {
          if (ok(i, j)) {
            good = j;
            step *= 2;
          } else {
            bad = j;
            gallop = false;
          }
          return false;
        }
        gallop = false;
      }
      if (bad - good > 1) {
        var m = (good + bad) >> 1;
        if (ok(i, m)) good = m;
        else bad = m;
        return false;
      }
      ranges.push([all[i].num, all[good].num]);
      i = good + 1;
      if (i < all.length) row();
      return i >= all.length;
    };
  }

  /** What the split measures: the verses, and « do verses i..j fit? ». */
  Renderer.prototype._pagePlan = function (data) {
    var P = V.Passage,
      all = P && data ? P.verses(data.html) : [];
    if (all.length < 2) return null;
    var self = this,
      width = self.card ? self.card.offsetWidth : 0,
      second = secondaryOf(data),
      theirs = second ? P.verses(second.html) : null;
    if (!width || (second && theirs.length < 2)) return null;
    var markup = function (list) {
      return list
        .map(function (v) {
          return v.html;
        })
        .join(" ");
    };
    var ok = function (i, j) {
      var lo = all[i].num,
        hi = all[j].num,
        part = Object.assign({}, data, {
          html: markup(all.slice(i, j + 1)),
          reference: P.range(data.reference, lo, hi),
        });
      if (second)
        part.secondary = Object.assign({}, second, {
          html: markup(
            theirs.filter(function (v) {
              return v.num >= lo && v.num <= hi;
            }),
          ),
          reference: P.range(second.reference, lo, hi),
        });
      var probe = self._probe(part, width, true),
        rules = self._rules(probe),
        result = fits(probe, rules, rules.minFit);
      probe.remove();
      return result;
    };
    return { all: all, ok: ok };
  };

  /** Long book names and ranges (« 119:105-112 ») stay inside the margin. */
  Renderer.prototype._fitMargin = function (stage) {
    stage.style.removeProperty("--book-fit");
    stage.style.removeProperty("--nums-fit");
    var margin = stage.querySelector(".vo-margin");
    if (this.layout !== "antenne" || !margin || !margin.clientWidth) return;
    var room = margin.clientWidth,
      book = stage.querySelector(".vo-book > span"),
      nums = stage.querySelector(".vo-nums");
    if (book) {
      // min-content = the longest word, which cannot wrap
      book.style.display = "inline-block";
      book.style.width = "min-content";
      var longest = this._box(book).width;
      book.style.display = "";
      book.style.width = "";
      if (longest > room)
        stage.style.setProperty("--book-fit", (room / longest).toFixed(3));
    }
    if (nums && nums.scrollWidth > room)
      stage.style.setProperty(
        "--nums-fit",
        (room / nums.scrollWidth).toFixed(3),
      );
  };

  function revealTime(copy, k) {
    var h = copy.offsetHeight || 120;
    return Math.min(720, 240 + h * 0.55) * k;
  }

  function freezeAll(stage) {
    M.freeze(stage);
    stage.querySelectorAll(ANIMATED).forEach(M.freeze);
  }

  // ---- Modes -----------------------------------------------------------------

  Renderer.prototype._mode = function (data) {
    var animation =
      data && data.animation !== undefined
        ? data.animation
        : this.currentAnimation;
    var duration =
      data && data.animationDuration !== undefined
        ? Number(data.animationDuration)
        : Number(this.animationDuration);
    if (animation === "typewriter") animation = "reveal";
    if (!M.supported(this.container) || animation === "none" || !(duration > 0))
      return "none";
    if (M.reduced()) return "reduced";
    if (animation === "fade" || animation === "slide") return animation;
    return "reveal";
  };

  Renderer.prototype._speed = function (data) {
    var duration =
      data && data.animationDuration !== undefined
        ? Number(data.animationDuration)
        : Number(this.animationDuration);
    return Math.max(0.4, Math.min(3, (duration || 500) / 500));
  };

  /**
   * Reference lines rising from (or sinking into) their own slots. A quick
   * exit (passage change) lasts exactly as long as the text's own exit.
   */
  function lines(block, direction, delay, k, quick) {
    if (!block) return Promise.resolve(true);
    var spans = Array.prototype.slice.call(
      block.querySelectorAll(".vo-line > span:not(.is-leaving)"),
    );
    return Promise.all(
      spans.map(function (span, i) {
        return direction === "in"
          ? M.tween(
              span,
              { transform: "none", opacity: "1" },
              {
                from: { transform: "translateY(110%)", opacity: "0" },
                duration: 560 * k,
                delay: delay + i * 55 * k,
                easing: E.expo,
              },
            )
          : M.tween(
              span,
              { transform: "translateY(105%)", opacity: "0" },
              {
                duration: (quick ? 150 : 180) * k,
                delay: quick ? delay : delay + (spans.length - 1 - i) * 20 * k,
                easing: E.exit,
              },
            );
      }),
    );
  }

  /** Final, fully visible state (instant mode and the end of every entrance). */
  Renderer.prototype._rest = function (stage) {
    var p = parts(stage);
    M.apply(stage, { opacity: "1", transform: "none" });
    M.apply(p.scrim, { opacity: "1", transform: "none" });
    M.apply(p.axis, {
      transform: stage.classList.contains("has-ref") ? "none" : "scaleY(0)",
    });
    M.apply(p.margin, { opacity: "1", transform: "none" });
    M.apply(p.plate, { opacity: "1", transform: "none" });
    if (p.plate) {
      p.plate.style.removeProperty("top");
      p.plate.style.removeProperty("bottom");
    }
    if (p.copy) {
      p.copy.classList.remove("is-revealing");
      p.copy.style.removeProperty("--vo-reveal");
      M.apply(p.copy, { opacity: "1" });
    }
    stage.querySelectorAll(".vo-roll.is-leaving").forEach(function (old) {
      old.remove();
    });
    stage.querySelectorAll(".vo-line > span").forEach(function (span) {
      M.apply(span, { opacity: "1", transform: "none" });
    });
  };

  // ---- Commands --------------------------------------------------------------

  /**
   * Show data. onCommit runs once the new content is in place on the output
   * (that is when the output may confirm it); the promise resolves true when
   * the movement ends, false when a later command took over.
   */
  Renderer.prototype.show = function (data, onCommit) {
    var self = this,
      gen = ++self._gen;
    return fontsReady().then(function () {
      if (gen !== self._gen) return false;
      var stage = self.card;
      if (!stage) {
        self._applyStyle(data);
        return self._enter(data, gen, onCommit);
      }
      // A different composition first: even the same passage must leave and
      // enter again rather than jump to its new place in one frame.
      var nextLayout = (data.style && data.style.layout) || self.layout,
        nextPosition =
          data.position ||
          (data.style && data.style.position) ||
          self.currentPosition;
      var moved =
        nextLayout !== self.layout || nextPosition !== self.currentPosition;
      if (!moved && self._signature === signature(data)) {
        if (data.style) self.updateStyle(data.style);
        return self._settle(stage, gen, data, onCommit);
      }
      if (moved) {
        // A different composition cannot morph: leave, then enter cleanly.
        return self._leave(stage, gen, self._mode(data)).then(function (done) {
          if (!done || gen !== self._gen) return false;
          self._applyStyle(data);
          return self._enter(data, gen, onCommit);
        });
      }
      return self._change(stage, data, gen, onCommit);
    });
  };

  Renderer.prototype._applyStyle = function (data) {
    if (data.style) {
      this.updateStyle(data.style, true);
      this._styleKey = JSON.stringify(data.style);
    }
    if (data.position) this._setPosition(data.position);
  };

  Renderer.prototype._enter = function (data, gen, onCommit) {
    var self = this,
      mode = self._mode(data),
      k = self._speed(data),
      stage = self._stage();
    self._fill(stage, data);
    empty(self.container).appendChild(stage);
    self.card = stage;
    self._fit(stage);
    var p = parts(stage),
      hasRef = stage.classList.contains("has-ref");
    if (onCommit) onCommit();
    if (mode === "none") {
      self._rest(stage);
      return Promise.resolve(true);
    }
    var steps;
    if (mode === "reduced") {
      steps = [
        M.tween(
          stage,
          { opacity: "1" },
          { from: { opacity: "0" }, duration: 240, easing: E.out },
        ),
      ];
    } else if (mode === "fade" || mode === "slide") {
      var lift = mode === "slide" ? "translateY(28px)" : "none";
      steps = [
        M.tween(
          stage,
          { opacity: "1", transform: "none" },
          {
            from: { opacity: "0", transform: lift },
            duration: 460 * k,
            easing: E.out,
          },
        ),
      ];
    } else {
      steps = [
        M.tween(
          p.scrim,
          { opacity: "1" },
          { from: { opacity: "0" }, duration: 440 * k, easing: E.soft },
        ),
        M.tween(
          p.plate,
          { opacity: "1", transform: "none" },
          {
            from: { opacity: "0", transform: "translateY(10px)" },
            duration: 440 * k,
            easing: E.fade,
          },
        ),
        hasRef
          ? M.tween(
              p.axis,
              { transform: "none" },
              {
                from: { transform: "scaleY(0)" },
                duration: 560 * k,
                delay: 110 * k,
                easing: E.expo,
              },
            )
          : null,
        self.layout === "carte" && hasRef
          ? M.tween(
              p.margin,
              { opacity: "1" },
              {
                from: { opacity: "0" },
                duration: 300 * k,
                delay: 80 * k,
                easing: E.out,
              },
            )
          : null,
        lines(p.block, "in", 140 * k, k),
        M.develop(p.copy, { duration: revealTime(p.copy, k), delay: 170 * k }),
      ];
    }
    return Promise.all(steps).then(function () {
      if (gen !== self._gen) return false;
      self._rest(stage);
      return true;
    });
  };

  Renderer.prototype._change = function (stage, data, gen, onCommit) {
    var self = this,
      mode = self._mode(data),
      k = self._speed(data),
      p = parts(stage),
      before = self._data || {},
      oldSplit = splitReference(before.reference),
      newSplit = splitReference(data.reference),
      oldSecondary = !!secondaryOf(before),
      newSecondary = secondaryOf(data);
    freezeAll(stage);
    var sameRef =
      !!before.reference &&
      before.reference === data.reference &&
      (before.version || "") === (data.version || "") &&
      oldSecondary === !!newSecondary;
    var roll =
      !sameRef &&
      mode === "reveal" &&
      !!before.reference &&
      !!data.reference &&
      oldSplit.book === newSplit.book &&
      !!oldSplit.nums &&
      !!newSplit.nums &&
      (before.version || "") === (data.version || "") &&
      oldSecondary === !!newSecondary;
    var keepBlock = sameRef || roll;

    if (mode === "none") {
      self._applyStyle(data);
      self._fill(stage, data);
      self._fit(stage);
      self._rest(stage);
      if (onCommit) onCommit();
      return Promise.resolve(true);
    }

    // The next content is prepared while the current one leaves, unless the
    // style itself changes (it would resize the text still on screen).
    var sameStyle =
      !data.style || JSON.stringify(data.style) === self._styleKey;
    var probe = sameStyle ? self._probe(data, stage.offsetWidth) : null;

    // Phase A — what changes leaves; the band and the axis stay.
    var exit = mode === "reduced" ? 150 : 150 * k;
    var leaving = [
      M.tween(
        p.copy,
        { opacity: "0" },
        { duration: exit, easing: E.exit },
      ),
    ];
    if (!keepBlock && p.block)
      leaving.push(
        mode === "reveal"
          ? lines(p.block, "out", 0, k, true)
          : M.tween(
              p.block,
              { opacity: "0" },
              { duration: exit, easing: E.exit },
            ),
      );

    return Promise.all(leaving).then(function () {
      if (gen !== self._gen) {
        if (probe) probe.remove();
        return false;
      }

      // Measure what the audience sees right now…
      var seen = {
        scrim: self._box(p.scrim),
        axis: self._box(p.axis),
        margin: self._box(p.margin),
        plate: self._box(p.plate),
      };

      // …swap the content while it is invisible…
      self._applyStyle(data);
      if (!probe) probe = self._probe(data, stage.offsetWidth);
      var secondary = newSecondary;
      self._classes(stage, data, secondary);
      p.copy.remove();
      var copy = probe.querySelector(".vo-copy");
      copy.style.opacity = "0";
      p.body.appendChild(copy);
      var oldRoll = null,
        newRoll = null,
        probeRoll = probe.querySelector(".vo-nums .vo-roll"),
        shownNums = probeRoll ? probeRoll.textContent : newSplit.nums;
      if (roll) {
        var nums = p.block.querySelector(".vo-nums");
        // Numbers still leaving from an interrupted roll fade out quickly.
        nums.querySelectorAll(".vo-roll.is-leaving").forEach(function (r) {
          M.tween(r, { opacity: "0" }, { duration: 120 * k, easing: E.exit })
            .then(function () {
              r.remove();
            });
        });
        oldRoll = nums.querySelector(".vo-roll");
        oldRoll.classList.add("is-leaving");
        newRoll = node("span", "vo-roll", shownNums);
        newRoll.style.transform = "translateY(100%)";
        newRoll.style.opacity = "0";
        nums.appendChild(newRoll);
      } else if (!keepBlock) {
        if (p.block) p.block.remove();
        var block = probe.querySelector(".vo-refblock");
        if (block) {
          block.querySelectorAll(".vo-line > span").forEach(function (s) {
            s.style.opacity = "0";
          });
          p.margin.appendChild(block);
        }
      }
      fillInline(p.inline, data);
      self._signature = signature(data);
      self._data = data;
      // The probe measured this content at this width: reuse its fit.
      ["--fit", "--nums-fit", "--book-fit"].forEach(function (name) {
        var value = probe.style.getPropertyValue(name);
        if (value) stage.style.setProperty(name, value);
        else stage.style.removeProperty(name);
      });
      stage.dataset.fit = probe.dataset.fit;
      if (probe.dataset.partial) stage.dataset.partial = probe.dataset.partial;
      else delete stage.dataset.partial;
      probe.remove();

      // …settle the geometry of the new content…
      [p.scrim, p.axis, p.margin, p.plate].forEach(function (el) {
        el.style.transform = "";
      });
      p.plate.style.removeProperty("top");
      p.plate.style.removeProperty("bottom");
      if (roll) self._fitMargin(stage);
      if (onCommit) onCommit();
      var hasRef = stage.classList.contains("has-ref");
      var natural = {
        scrim: self._box(p.scrim),
        margin: self._box(p.margin),
        plate: self._box(p.plate),
        axis: p.axis.offsetHeight,
      };

      // Phase B — morph what stayed, reveal what is new. When the band has
      // to grow, it leads and the text waits for it: no line is ever drawn
      // outside the band.
      var grow =
          self.layout === "antenne"
            ? natural.scrim.height - seen.scrim.height
            : natural.plate.height - seen.plate.height,
        growing = grow > 4,
        morph = mode !== "reduced",
        span = (growing ? 340 : 380) * k,
        shape = growing ? E.out : E.inOut,
        textDelay =
          morph && growing ? Math.min(260, 110 + grow * 0.3) * k : 0,
        steps = [
          // back to full opacity if a leave was interrupted
          M.tween(
            stage,
            { opacity: "1", transform: "none" },
            { duration: 200 * k, easing: E.out },
          ),
        ];
      steps.push(
        M.tween(
          p.scrim,
          { opacity: "1", transform: "none" },
          {
            from: {
              opacity: getComputedStyle(p.scrim).opacity,
              transform:
                morph && natural.scrim.height
                  ? "scaleY(" + seen.scrim.height / natural.scrim.height + ")"
                  : "none",
            },
            duration: morph ? span : 0,
            easing: shape,
          },
        ),
      );
      if (self.layout === "antenne") {
        steps.push(
          M.tween(
            p.axis,
            { transform: hasRef ? "none" : "scaleY(0)" },
            {
              from: {
                transform:
                  morph && natural.axis
                    ? "scaleY(" + seen.axis.height / natural.axis + ")"
                    : hasRef
                      ? "none"
                      : "scaleY(0)",
              },
              duration: morph ? span : 0,
              easing: shape,
            },
          ),
        );
      } else {
        steps.push(
          M.tween(
            p.plate,
            { top: "0px", bottom: "0px", opacity: "1" },
            {
              from: {
                top: (morph ? seen.plate.top - natural.plate.top : 0) + "px",
                bottom:
                  (morph ? natural.plate.bottom - seen.plate.bottom : 0) + "px",
                opacity: getComputedStyle(p.plate).opacity,
              },
              duration: morph ? span : 0,
              easing: shape,
            },
          ),
        );
      }
      if (keepBlock && morph && seen.margin.height && natural.margin.height) {
        steps.push(
          M.tween(
            p.margin,
            { transform: "none", opacity: "1" },
            {
              from: {
                transform:
                  "translateY(" + (seen.margin.top - natural.margin.top) + "px)",
                opacity: getComputedStyle(p.margin).opacity,
              },
              duration: span,
              easing: shape,
            },
          ),
        );
      } else {
        steps.push(
          M.tween(
            p.margin,
            { transform: "none", opacity: "1" },
            { duration: 160 * k, easing: E.out },
          ),
        );
      }
      if (keepBlock) {
        // A hide may have started to put the reference away: bring back
        // whatever stays (book, version, and the numbers if they are kept).
        stage
          .querySelectorAll(
            roll
              ? ".vo-line > span:not(.vo-roll)"
              : ".vo-line > span:not(.is-leaving)",
          )
          .forEach(function (span) {
            steps.push(
              M.tween(
                span,
                { opacity: "1", transform: "none" },
                { duration: 240 * k, easing: E.out },
              ),
            );
          });
      }
      if (roll) {
        // An odometer: both numbers move together, exactly one line apart,
        // so they never overlap inside their slot.
        // The old number leaves from wherever an interrupted roll left it.
        var rollTiming = { duration: 460 * k, easing: E.out };
        steps.push(
          M.tween(
            oldRoll,
            { transform: "translateY(-100%)", opacity: "0" },
            rollTiming,
          ).then(function () {
            oldRoll.remove();
          }),
          M.tween(
            newRoll,
            { transform: "translateY(0%)", opacity: "1" },
            Object.assign(
              { from: { transform: "translateY(100%)", opacity: "0" } },
              rollTiming,
            ),
          ),
        );
      } else if (!keepBlock) {
        var fresh = parts(stage).block;
        if (mode === "reveal")
          steps.push(lines(fresh, "in", Math.max(40 * k, textDelay * 0.6), k));
        else if (fresh)
          fresh.querySelectorAll(".vo-line > span").forEach(function (s) {
            steps.push(
              M.tween(
                s,
                { opacity: "1", transform: "none" },
                {
                  from: { opacity: "0", transform: "none" },
                  duration: 220 * k,
                  easing: E.out,
                },
              ),
            );
          });
      }
      steps.push(
        mode === "reveal"
          ? M.develop(copy, { duration: revealTime(copy, k), delay: textDelay })
          : M.tween(
              copy,
              { opacity: "1" },
              {
                from: { opacity: "0" },
                duration: mode === "reduced" ? 200 : 260 * k,
                delay: textDelay,
                easing: E.out,
              },
            ),
      );
      return Promise.all(steps).then(function () {
        if (gen !== self._gen) return false;
        self._rest(stage);
        return true;
      });
    });
  };

  /** Same content again: no re-entrance, just make sure it is fully on air. */
  Renderer.prototype._settle = function (stage, gen, data, onCommit) {
    var self = this,
      mode = self._mode(data),
      k = self._speed(data);
    freezeAll(stage);
    if (onCommit) onCommit();
    if (mode === "none") {
      self._rest(stage);
      return Promise.resolve(true);
    }
    var p = parts(stage),
      d = 260 * k,
      steps = [
        M.tween(stage, { opacity: "1", transform: "none" }, { duration: d }),
        M.tween(p.scrim, { opacity: "1", transform: "none" }, { duration: d }),
        M.tween(
          p.axis,
          {
            transform: stage.classList.contains("has-ref")
              ? "none"
              : "scaleY(0)",
          },
          { duration: d, easing: E.expo },
        ),
        M.tween(p.margin, { opacity: "1", transform: "none" }, { duration: d }),
        M.tween(p.plate, { opacity: "1" }, { duration: d }),
        M.tween(p.copy, { opacity: "1" }, { duration: d }),
      ];
    if (p.copy && p.copy.classList.contains("is-revealing"))
      steps.push(M.tween(p.copy, { "--vo-reveal": "0px" }, { duration: d }));
    stage.querySelectorAll(".vo-line > span:not(.is-leaving)").forEach(
      function (span) {
        steps.push(
          M.tween(span, { opacity: "1", transform: "none" }, { duration: d }),
        );
      },
    );
    return Promise.all(steps).then(function () {
      if (gen !== self._gen) return false;
      self._rest(stage);
      return true;
    });
  };

  Renderer.prototype._leave = function (stage, gen, mode) {
    var self = this,
      k = self._speed({});
    if (mode === "none") return Promise.resolve(true);
    freezeAll(stage);
    var p = parts(stage),
      steps;
    if (mode === "reduced") {
      steps = [
        M.tween(stage, { opacity: "0" }, { duration: 200, easing: E.exit }),
      ];
    } else if (mode === "fade" || mode === "slide") {
      steps = [
        M.tween(
          stage,
          {
            opacity: "0",
            transform: mode === "slide" ? "translateY(20px)" : "none",
          },
          { duration: 300 * k, easing: E.exit },
        ),
      ];
    } else {
      steps = [
        M.tween(p.copy, { opacity: "0" }, { duration: 180 * k, easing: E.exit }),
        lines(p.block, "out", 0, k),
        M.tween(
          p.margin,
          { opacity: "0" },
          { duration: 220 * k, delay: 40 * k, easing: E.exit },
        ),
        M.tween(
          p.axis,
          { transform: "scaleY(0)" },
          { duration: 280 * k, delay: 60 * k, easing: E.inOut },
        ),
        M.tween(
          p.plate,
          { opacity: "0" },
          { duration: 260 * k, delay: 60 * k, easing: E.exit },
        ),
        M.tween(
          p.scrim,
          { opacity: "0" },
          { duration: 340 * k, delay: 80 * k, easing: E.fade },
        ),
      ];
    }
    return Promise.all(steps).then(function () {
      return gen === self._gen;
    });
  };

  Renderer.prototype.hide = function () {
    var self = this,
      gen = ++self._gen,
      stage = self.card;
    if (!stage) return Promise.resolve(true);
    return self._leave(stage, gen, self._mode({})).then(function (done) {
      if (!done || gen !== self._gen) return false;
      empty(self.container);
      self.card = null;
      self._signature = null;
      self._data = null;
      return true;
    });
  };

  // ---- Style -----------------------------------------------------------------

  Renderer.prototype._setPosition = function (position) {
    var all = [
      POSITIONS.LOWER_THIRD,
      POSITIONS.UPPER_THIRD,
      POSITIONS.CENTER,
      POSITIONS.FULLSCREEN,
    ];
    for (var i = 0; i < all.length; i++)
      this.container.classList.remove(all[i]);
    var next = all.indexOf(position) === -1 ? DEFAULTS.position : position;
    this.container.classList.add(next);
    this.currentPosition = next;
  };

  Renderer.prototype._setLayout = function (layout) {
    var next = LAYOUTS.indexOf(layout) === -1 ? "antenne" : layout;
    var container = this.container;
    LAYOUTS.forEach(function (name) {
      container.classList.toggle("layout-" + name, name === next);
    });
    this.layout = next;
  };

  /**
   * Apply style settings through CSS variables on the root element.
   * @param {object} style - Style settings object.
   */
  Renderer.prototype.updateStyle = function (style, deferFit) {
    if (!style) return;
    var root = document.documentElement;
    function set(name, value) {
      root.style.setProperty(name, value);
    }
    if (style.textColor !== undefined) set("--text-color", style.textColor);
    if (style.bgColor !== undefined) {
      var rgb = hexToRgb(style.bgColor);
      if (rgb) set("--bg-color", rgb.r + ", " + rgb.g + ", " + rgb.b);
    }
    if (style.bgOpacity !== undefined)
      set("--bg-opacity", String(style.bgOpacity));
    if (style.fontSize !== undefined) set("--font-size", style.fontSize + "px");
    if (style.fontFamily !== undefined) set("--font-family", style.fontFamily);
    if (style.padding !== undefined) set("--padding", style.padding + "px");
    if (style.borderRadius !== undefined)
      set("--border-radius", style.borderRadius + "px");
    if (style.maxWidth !== undefined) set("--max-width", style.maxWidth + "%");
    if (style.refColor !== undefined) set("--ref-color", style.refColor);
    if (style.refFontSize !== undefined)
      set("--ref-font-size", style.refFontSize + "px");
    if (style.shadow !== undefined) {
      var off = style.shadow === false || style.shadow === "none";
      set("--shadow", off ? "none" : "0 4px 20px rgba(0, 0, 0, 0.5)");
      set("--text-shadow", off ? "none" : "0 1px 2px rgba(0, 0, 0, 0.55)");
    }
    if (style.layout !== undefined) this._setLayout(style.layout);
    if (style.position !== undefined) this._setPosition(style.position);
    if (style.animation !== undefined) this.currentAnimation = style.animation;
    if (style.animationDuration !== undefined)
      this.animationDuration = style.animationDuration;
    if (style.refBgColor !== undefined) set("--ref-bg-color", style.refBgColor);
    if (style.refBgColor !== undefined || style.refColor !== undefined) {
      this._refColors = {
        bg: style.refBgColor !== undefined ? style.refBgColor : (this._refColors || {}).bg,
        fg: style.refColor !== undefined ? style.refColor : (this._refColors || {}).fg,
      };
      // On the card's pill the reference must stay readable whatever the
      // colours chosen for the antenne layout (light text on the accent).
      set("--ref-ink", readableOn(this._refColors.bg, this._refColors.fg));
    }
    if (style.borderColor !== undefined)
      set("--border-color", style.borderColor);
    if (style.borderWidth !== undefined)
      set("--border-width", style.borderWidth + "px");
    if (style.refPosition !== undefined) this._refPosition = style.refPosition;
    if (style.textAlign !== undefined) {
      this._textAlign = style.textAlign;
      set("--text-align", style.textAlign);
    }
    if (style.lineHeight !== undefined)
      set("--line-height", String(style.lineHeight));
    if (style.highlightColor !== undefined)
      set("--highlight-color", style.highlightColor);
    // Only a picture imported by the Studio (re-encoded as a base64 data URL)
    // may be placed inside url("…").
    if (style.bgImage !== undefined)
      set(
        "--bg-image",
        /^data:image\/(png|jpeg|webp);base64,[a-z0-9+\/=]+$/i.test(
          String(style.bgImage),
        )
          ? 'url("' + style.bgImage + '")'
          : "none",
      );
    if (!deferFit) this.refit();
  };

  function luminance(rgb) {
    var c = [rgb.r, rgb.g, rgb.b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** fg when it contrasts enough with bg (3:1, large bold text), else ink or white. */
  function readableOn(bg, fg) {
    var b = hexToRgb(bg),
      f = hexToRgb(fg);
    if (!b) return fg || "#ffffff";
    var lb = luminance(b);
    var ratio = function (l) {
      return (Math.max(lb, l) + 0.05) / (Math.min(lb, l) + 0.05);
    };
    if (f && ratio(luminance(f)) >= 3) return fg;
    return ratio(0) >= ratio(1) ? "#14161b" : "#ffffff";
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    hex = String(hex).replace(/^#/, "");
    if (hex.length === 3)
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    var num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  Renderer.splitReference = splitReference;
  Renderer.frameOf = frameOf;
  Renderer.readableOn = readableOn;
  V.Renderer = Renderer;
})();
