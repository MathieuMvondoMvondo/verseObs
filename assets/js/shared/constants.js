window.VerseObs = window.VerseObs || {};

window.VerseObs.MSG = {
  OUTPUT_STATE: "output_state",
  SHOW_VERSE: "show_verse",
  SHOW_TEXT: "show_text",
  HIDE: "hide",
  UPDATE_STYLE: "update_style",
  // A live style change: only the properties changed (review 8, B3). A type
  // of its own, so an output from before it (which would take a patch for
  // an older Studio's whole style) ignores it, however late it wakes up,
  // and takes the change with the next Diffuser's whole style.
  STYLE_PATCH: "style_patch",
  PING: "ping",
  PONG: "pong",
  // Preview-only: rendered by the in-dock preview iframe, ignored by the real overlay.
  PREVIEW: "preview",
  PREVIEW_HIDE: "preview_hide",
};

window.VerseObs.POSITIONS = {
  LOWER_THIRD: "lower-third",
  UPPER_THIRD: "upper-third",
  CENTER: "center",
  FULLSCREEN: "fullscreen",
  CUSTOM: "custom",
};

window.VerseObs.ANIMATIONS = {
  REVEAL: "reveal",
  FADE: "fade",
  SLIDE: "slide",
  NONE: "none",
};

/**
 * "antenne": full-bleed band with the reference in a margin; "carte": framed
 * card; "onglet": a light or dark card, the reference in a tab on its top
 * right corner (Math, 26/10, after the ICC broadcasts).
 */
window.VerseObs.LAYOUTS = { ANTENNE: "antenne", CARTE: "carte", ONGLET: "onglet" };
/**
 * Layouts whose presets bring a look of their own (typeface, line height,
 * width, colours the older bases never set). Leaving one for another base
 * puts the defaults back for what only its presets set, whatever was
 * retouched since (Settings.applyTemplate, review 8): a new layout of this
 * kind lists itself here. Between the older layouts a base still writes its
 * own keys only.
 */
window.VerseObs.OWN_LOOK_LAYOUTS = ["onglet"];
window.VerseObs.ANTENNE_FONT = "'VerseObs Lecture', Lora, Georgia, serif";
/** Inter (SIL OFL), bundled: a clean sans for the « Onglet » cards. */
window.VerseObs.ONGLET_FONT = "'VerseObs Onglet', Inter, 'Segoe UI', Arial, sans-serif";

/**
 * Short names of the bundled translations, for the « Onglet » tab
 * (« Jean 3:16 (LSG) »). An unknown name is shown as it is.
 */
window.VerseObs.VERSION_ABBR = {
  "Louis Segond 1910": "LSG",
  "Nouvelle Bible Segond": "NBS",
  "Bible du Semeur": "SEM",
  "Martin 1744": "MAR",
  "Darby Français": "DRB",
  "Crampon 1923": "CRA",
  "Perret-Gentil et Rilliet": "PGR",
  "Oltramare 1874": "OLT",
  "Genève 1669": "GEN",
  "King James Version": "KJV",
  "Darby English": "DBY",
  "Amplified Bible": "AMP",
};
window.VerseObs.versionAbbr = function (name) {
  var value = String(name || "").trim();
  return window.VerseObs.VERSION_ABBR[value] || value;
};
/** The optional signature of an « Onglet » card: one short line of text. */
window.VerseObs.cleanSignature = function (value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)
    : "";
};

/**
 * How and where a text is broadcast belongs to the operator: a new default
 * look never changes it (position, auto-hide, animation, duration, width,
 * alignment).
 */
window.VerseObs.OPERATOR_KEYS = [
  "position",
  "autoHide",
  "animation",
  "animationDuration",
  "maxWidth",
  "textAlign",
];

/**
 * Settings saved before the "antenne" layout existed:
 *  - Bible verses still on the former default base ("studio"): only the look
 *    (colours, typefaces, sizes, layout) follows the new default. A saved
 *    template does not prove the operator never changed anything, since a
 *    preset only writes its own keys: the operator's keys are always kept;
 *  - any other base, and every song style, keeps its framed card.
 * The former typewriter effect (which dropped verse numbers) becomes the reveal.
 * @param {object} saved - stored settings (as read)
 * @param {object} result - settings being built (modified in place)
 * @param {object} [defaults] - current defaults of this profile
 * @param {string} [formerDefault] - template whose look follows the new default
 */
window.VerseObs.migrateStyle = function (saved, result, defaults, formerDefault) {
  if (!saved || typeof saved !== "object") return result;
  if (saved.layout !== "antenne" && saved.layout !== "carte" && saved.layout !== "onglet") {
    if (defaults && formerDefault && saved.template === formerDefault) {
      var keep = window.VerseObs.OPERATOR_KEYS;
      for (var key in defaults)
        if (
          Object.prototype.hasOwnProperty.call(defaults, key) &&
          key !== "bgImage" &&
          !(keep.indexOf(key) !== -1 && saved[key] !== undefined)
        )
          result[key] = defaults[key];
    } else result.layout = saved.template === "antenne" ? "antenne" : "carte";
  }
  if (result.animation === "typewriter") result.animation = "reveal";
  return result;
};

window.VerseObs.DEFAULTS = {
  layout: "antenne",
  position: "lower-third",
  animation: "reveal",
  animationDuration: 500,
  autoHide: 0, // 0 = disabled, otherwise ms
  fontFamily: window.VerseObs.ANTENNE_FONT,
  fontSize: 44,
  textColor: "#f3eee4",
  textAlign: "left",
  lineHeight: 1.42,
  bgColor: "#0f1217",
  bgOpacity: 0.84,
  shadow: true,
  borderRadius: 0,
  borderWidth: 0,
  padding: 30,
  maxWidth: 86, // percentage
  refFontSize: 24,
  refColor: "#f3eee4",
  refPosition: "top-left",
  // In the "antenne" layout: the axis, verse numbers and version name.
  refBgColor: "#f2b544",
  borderColor: "#8b8f9b",
  highlightColor: "#f2b544",
  bgImage: "",
  // « Onglet » only: a short line at the card's bottom right (empty: none).
  signature: "",
  template: "antenne",
};

window.VerseObs.TEMPLATES = {
  antenne: {
    label: "Antenne",
    settings: {
      layout: "antenne",
      fontFamily: window.VerseObs.ANTENNE_FONT,
      textColor: "#f3eee4",
      bgColor: "#0f1217",
      bgOpacity: 0.84,
      refBgColor: "#f2b544",
      refColor: "#f3eee4",
      highlightColor: "#f2b544",
      borderColor: "#8b8f9b",
      borderWidth: 0,
      borderRadius: 0,
      padding: 30,
      fontSize: 44,
      lineHeight: 1.42,
      refFontSize: 24,
      refPosition: "top-left",
      textAlign: "left",
      maxWidth: 86,
      shadow: true,
      bgImage: "",
    },
  },
  onglet: {
    label: "Onglet clair",
    settings: {
      layout: "onglet",
      fontFamily: window.VerseObs.ONGLET_FONT,
      textColor: "#17171c",
      bgColor: "#ffffff",
      bgOpacity: 1,
      refBgColor: "#5e3ba3",
      refColor: "#ffffff",
      highlightColor: "#ffe08a",
      borderColor: "#d9d6e3",
      borderWidth: 0,
      borderRadius: 76,
      padding: 30,
      fontSize: 40,
      lineHeight: 1.3,
      refFontSize: 33,
      refPosition: "top-right",
      textAlign: "left",
      maxWidth: 84,
      shadow: true,
      bgImage: "",
    },
  },
  "onglet-sombre": {
    label: "Onglet sombre",
    settings: {
      layout: "onglet",
      fontFamily: window.VerseObs.ONGLET_FONT,
      textColor: "#f4f3f8",
      bgColor: "#121318",
      bgOpacity: 0.9,
      refBgColor: "#6b47c2",
      refColor: "#ffffff",
      highlightColor: "#6b47c2",
      borderColor: "#3a3b44",
      borderWidth: 0,
      borderRadius: 76,
      padding: 30,
      fontSize: 40,
      lineHeight: 1.3,
      refFontSize: 33,
      refPosition: "top-right",
      textAlign: "left",
      maxWidth: 84,
      shadow: true,
      bgImage: "",
    },
  },
  studio: {
    label: "Studio",
    settings: {
      layout: "carte",
      textColor: "#edeef0",
      bgColor: "#232428",
      bgOpacity: 0.95,
      refBgColor: "#92b3f5",
      refColor: "#27282c",
      borderColor: "#8b8f9b",
      borderWidth: 1,
      borderRadius: 12,
      padding: 30,
      fontSize: 40,
      refFontSize: 23,
      refPosition: "top-left",
      shadow: true,
      bgImage: "",
    },
  },
  papier: {
    label: "Papier",
    settings: {
      layout: "carte",
      textColor: "#282a2e",
      bgColor: "#f1eee4",
      bgOpacity: 0.97,
      refBgColor: "#dddbc9",
      refColor: "#282a2e",
      borderColor: "#c3c2ac",
      borderWidth: 1,
      borderRadius: 6,
      padding: 32,
      fontSize: 40,
      refFontSize: 23,
      refPosition: "top-left",
      shadow: true,
      bgImage: "",
    },
  },
  cinema: {
    label: "Cinéma",
    settings: {
      layout: "carte",
      textColor: "#fff5de",
      bgColor: "#131416",
      bgOpacity: 0.94,
      refBgColor: "#cab584",
      refColor: "#262719",
      borderColor: "#7d714c",
      borderWidth: 1,
      borderRadius: 0,
      padding: 32,
      fontSize: 40,
      refFontSize: 23,
      refPosition: "top-left",
      shadow: true,
      bgImage: "",
    },
  },
  classique: {
    label: "Classique",
    settings: {
      layout: "carte",
      textColor: "#1a1a1a",
      textAlign: "left",
      lineHeight: 1.55,
      bgColor: "#ffffff",
      bgOpacity: 0.92,
      shadow: true,
      borderRadius: 14,
      borderWidth: 2,
      padding: 24,
      refPosition: "top-center",
      refBgColor: "#2d1a3e",
      refColor: "#ffffff",
      borderColor: "#50c8c8",
      bgImage: "",
    },
  },
  eglise: {
    label: "Église",
    settings: {
      layout: "carte",
      textColor: "#4a0e0e",
      textAlign: "left",
      lineHeight: 1.55,
      bgColor: "#ffffff",
      bgOpacity: 0.95,
      shadow: true,
      borderRadius: 10,
      borderWidth: 2,
      padding: 28,
      refPosition: "top-left",
      refBgColor: "#6b1a1a",
      refColor: "#ffffff",
      borderColor: "#8b2020",
      bgImage: "",
    },
  },
  moderne: {
    label: "Moderne",
    settings: {
      layout: "carte",
      textColor: "#ffffff",
      textAlign: "left",
      lineHeight: 1.6,
      bgColor: "#1a1a2e",
      bgOpacity: 0.85,
      shadow: true,
      borderRadius: 8,
      borderWidth: 1,
      padding: 26,
      refPosition: "top-right",
      refBgColor: "#111111",
      refColor: "#ffffff",
      borderColor: "#2a2a4a",
      bgImage: "",
    },
  },
  minimal: {
    label: "Minimal",
    settings: {
      layout: "carte",
      textColor: "#222222",
      textAlign: "left",
      lineHeight: 1.5,
      bgColor: "#ffffff",
      bgOpacity: 0.95,
      shadow: false,
      borderRadius: 4,
      borderWidth: 0,
      padding: 20,
      refPosition: "top-center",
      refBgColor: "#999999",
      refColor: "#666666",
      borderColor: "#eeeeee",
      bgImage: "",
    },
  },
};

window.VerseObs.CHANNEL_NAME = "verseobs";
window.VerseObs.LS_KEY = "verseobs_msg";
window.VerseObs.SETTINGS_KEY = "verseobs_settings";
window.VerseObs.HISTORY_KEY = "verseobs_history";
window.VerseObs.HISTORY_MAX = 50;
window.VerseObs.API_CACHE_KEY = "verseobs_api_cache";

window.VerseObs.FREETEXT_SETTINGS_KEY = "verseobs_freetext_style";
/**
 * Free-text style — independent from the Bible-verse style.
 * Only the properties relevant to free text (no reference pill).
 */
window.VerseObs.FREETEXT_DEFAULTS = {
  layout: "carte",
  position: "center",
  animation: "fade",
  animationDuration: 500,
  autoHide: 0,
  fontFamily: "'Segoe UI', Calibri, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 34,
  textColor: "#ffffff",
  textAlign: "center",
  lineHeight: 1.5,
  bgColor: "#101018",
  bgOpacity: 0.85,
  shadow: true,
  borderRadius: 16,
  borderWidth: 0,
  borderColor: "#8b8f9b",
  padding: 32,
  maxWidth: 80,
  // Used when the operator picks the « Antenne » song style.
  refColor: "#f3eee4",
  refBgColor: "#f2b544",
  refFontSize: 24,
  highlightColor: "#ffd54a",
  bgImage: "",
  signature: "",
  template: "chant",
};

/**
 * Free-text presets ("styles type"). Same shape as TEMPLATES.
 */
window.VerseObs.FREETEXT_STYLES = {
  antenne: {
    label: "Antenne",
    settings: {
      layout: "antenne",
      position: "lower-third",
      textAlign: "center",
      fontFamily: window.VerseObs.ANTENNE_FONT,
      fontSize: 42,
      lineHeight: 1.4,
      textColor: "#f3eee4",
      bgColor: "#0f1217",
      bgOpacity: 0.84,
      refColor: "#f3eee4",
      refBgColor: "#f2b544",
      refFontSize: 24,
      highlightColor: "#f2b544",
      borderRadius: 0,
      borderWidth: 0,
      padding: 30,
      maxWidth: 80,
      shadow: true,
    },
  },
  onglet: {
    label: "Onglet clair",
    settings: {
      layout: "onglet",
      position: "lower-third",
      // Lyrics and free texts are centred in the card: short lines, no
      // empty half on the right.
      textAlign: "center",
      fontFamily: window.VerseObs.ONGLET_FONT,
      fontSize: 40,
      lineHeight: 1.3,
      textColor: "#17171c",
      bgColor: "#ffffff",
      bgOpacity: 1,
      refColor: "#ffffff",
      refBgColor: "#5e3ba3",
      refFontSize: 33,
      highlightColor: "#ffe08a",
      borderRadius: 76,
      borderWidth: 0,
      padding: 30,
      maxWidth: 84,
      shadow: true,
    },
  },
  "onglet-sombre": {
    label: "Onglet sombre",
    settings: {
      layout: "onglet",
      position: "lower-third",
      textAlign: "center",
      fontFamily: window.VerseObs.ONGLET_FONT,
      fontSize: 40,
      lineHeight: 1.3,
      textColor: "#f4f3f8",
      bgColor: "#121318",
      bgOpacity: 0.9,
      refColor: "#ffffff",
      refBgColor: "#6b47c2",
      refFontSize: 33,
      highlightColor: "#6b47c2",
      borderRadius: 76,
      borderWidth: 0,
      padding: 30,
      maxWidth: 84,
      shadow: true,
    },
  },
  chant: {
    label: "Chant",
    settings: {
      layout: "carte",
      position: "center",
      textAlign: "center",
      fontSize: 38,
      lineHeight: 1.55,
      textColor: "#ffffff",
      bgColor: "#0d1018",
      bgOpacity: 0.82,
      borderRadius: 18,
      borderWidth: 0,
      padding: 34,
      maxWidth: 82,
      shadow: true,
    },
  },
  annonce: {
    label: "Annonce",
    settings: {
      layout: "carte",
      position: "lower-third",
      textAlign: "left",
      fontSize: 30,
      lineHeight: 1.4,
      textColor: "#ffffff",
      bgColor: "#1d4ed8",
      bgOpacity: 0.95,
      borderRadius: 10,
      borderWidth: 0,
      padding: 26,
      maxWidth: 70,
      shadow: true,
    },
  },
  priere: {
    label: "Prière",
    settings: {
      layout: "carte",
      position: "center",
      textAlign: "center",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 32,
      lineHeight: 1.7,
      textColor: "#f3ece0",
      bgColor: "#241c12",
      bgOpacity: 0.8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#c4a35a",
      padding: 34,
      maxWidth: 72,
      shadow: true,
    },
  },
  citation: {
    label: "Citation",
    settings: {
      layout: "carte",
      position: "center",
      textAlign: "center",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 34,
      lineHeight: 1.5,
      textColor: "#1a1a1a",
      bgColor: "#ffffff",
      bgOpacity: 0.96,
      borderRadius: 6,
      borderWidth: 0,
      padding: 30,
      maxWidth: 68,
      shadow: false,
    },
  },
};

/**
 * A style's colours (every « …Color » setting) are CSS colours only: #hex,
 * rgb()/rgba(), hsl()/hsla() with plain numbers, or a colour name. Never a
 * value that could make an output load something (url(), image-set(),
 * var() …), whatever brings it: an imported backup, a stored or updated
 * style, a page of the same origin. A refused colour takes the default.
 */
(function (V) {
  var NAMES = (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
    "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse " +
    "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
    "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite " +
    "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
    "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
    "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey " +
    "lightsteelblue lightyellow lime limegreen linen magenta maroon " +
    "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise " +
    "palevioletred papayawhip peachpuff peru pink plum powderblue purple " +
    "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey " +
    "snow springgreen steelblue tan teal thistle tomato turquoise violet " +
    "wheat white whitesmoke yellow yellowgreen transparent currentcolor"
  ).split(" ");
  var NUM = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?",
    FIRST = NUM + "(?:deg|grad|rad|turn|%)?",
    ARG = NUM + "%?",
    FUNCTION = new RegExp(
      "^(?:rgba?|hsla?)\\(\\s*" +
        FIRST +
        "(?:\\s*,\\s*" + ARG + "\\s*,\\s*" + ARG + "(?:\\s*,\\s*" + ARG + ")?" +
        "|\\s+" + ARG + "\\s+" + ARG + "(?:\\s*\\/\\s*" + ARG + ")?)" +
        "\\s*\\)$",
    );
  // Keep exactly what was validated: Unicode spaces are not CSS spaces,
  // and Unicode case folding (e.g. Kelvin sign → k) may change a name.
  function canonicalColor(value) {
    return typeof value === "string" && value.length <= 64
      ? value.replace(/\s+/g, " ").trim().toLowerCase()
      : "";
  }
  V.isColor = function (value) {
    var v = canonicalColor(value);
    return (
      /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) ||
      FUNCTION.test(v) ||
      NAMES.indexOf(v) !== -1
    );
  };
  /** Every colour of `style` that is not one takes its default (or goes). */
  V.cleanColors = function (style, defaults) {
    Object.keys(style || {}).forEach(function (k) {
      if (!/Color$/.test(k)) return;
      var color = canonicalColor(style[k]);
      if (V.isColor(color)) style[k] = color;
      else {
        var fallback = canonicalColor(defaults && defaults[k]);
        if (V.isColor(fallback)) style[k] = fallback;
        else delete style[k];
      }
    });
    return style;
  };
})(window.VerseObs);
