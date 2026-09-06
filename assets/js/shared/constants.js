window.VerseObs = window.VerseObs || {};

window.VerseObs.MSG = {
  OUTPUT_STATE: "output_state",
  SHOW_VERSE: "show_verse",
  SHOW_TEXT: "show_text",
  HIDE: "hide",
  UPDATE_STYLE: "update_style",
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
  FADE: "fade",
  SLIDE: "slide",
  TYPEWRITER: "typewriter",
  NONE: "none",
};

window.VerseObs.DEFAULTS = {
  position: "lower-third",
  animation: "fade",
  animationDuration: 500,
  autoHide: 0, // 0 = disabled, otherwise ms
  fontFamily: "'Segoe UI', Calibri, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 40,
  textColor: "#edeef0",
  textAlign: "left",
  lineHeight: 1.55,
  bgColor: "#232428",
  bgOpacity: 0.92,
  shadow: true,
  borderRadius: 14,
  borderWidth: 2,
  padding: 24,
  maxWidth: 85, // percentage
  refFontSize: 23,
  refColor: "#27282c",
  refPosition: "top-left",
  refBgColor: "#92b3f5",
  borderColor: "#8b8f9b",
  highlightColor: "#ffff00",
  bgImage: "",
  template: "studio",
};

window.VerseObs.TEMPLATES = {
  studio: {
    label: "Studio",
    settings: {
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
