window.VerseObs = window.VerseObs || {};

window.VerseObs.MSG = {
  SHOW_VERSE: 'show_verse',
  SHOW_TEXT: 'show_text',
  HIDE: 'hide',
  UPDATE_STYLE: 'update_style',
  PING: 'ping',
  PONG: 'pong',
  // Preview-only: rendered by the in-dock preview iframe, ignored by the real overlay.
  PREVIEW: 'preview',
  PREVIEW_HIDE: 'preview_hide'
};

window.VerseObs.POSITIONS = {
  LOWER_THIRD: 'lower-third',
  UPPER_THIRD: 'upper-third',
  CENTER: 'center',
  FULLSCREEN: 'fullscreen',
  CUSTOM: 'custom'
};

window.VerseObs.ANIMATIONS = {
  FADE: 'fade',
  SLIDE: 'slide',
  TYPEWRITER: 'typewriter',
  NONE: 'none'
};

window.VerseObs.DEFAULTS = {
  position: 'lower-third',
  animation: 'fade',
  animationDuration: 500,
  autoHide: 0, // 0 = disabled, otherwise ms
  fontFamily: "'Segoe UI', Calibri, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 28,
  textColor: '#1a1a1a',
  textAlign: 'left',
  lineHeight: 1.55,
  bgColor: '#ffffff',
  bgOpacity: 0.92,
  shadow: true,
  borderRadius: 14,
  borderWidth: 2,
  padding: 24,
  maxWidth: 85, // percentage
  refFontSize: 15,
  refColor: '#ffffff',
  refPosition: 'top-center',
  refBgColor: '#2d1a3e',
  borderColor: '#50c8c8',
  highlightColor: '#ffff00',
  bgImage: '',
  template: 'custom'
};

window.VerseObs.TEMPLATES = {
  classique: {
    label: 'Classique',
    settings: {
      textColor: '#1a1a1a',
      textAlign: 'left',
      lineHeight: 1.55,
      bgColor: '#ffffff',
      bgOpacity: 0.92,
      shadow: true,
      borderRadius: 14,
      borderWidth: 2,
      padding: 24,
      refPosition: 'top-center',
      refBgColor: '#2d1a3e',
      refColor: '#ffffff',
      borderColor: '#50c8c8',
      bgImage: ''
    }
  },
  eglise: {
    label: 'Église',
    settings: {
      textColor: '#4a0e0e',
      textAlign: 'left',
      lineHeight: 1.55,
      bgColor: '#ffffff',
      bgOpacity: 0.95,
      shadow: true,
      borderRadius: 10,
      borderWidth: 2,
      padding: 28,
      refPosition: 'top-left',
      refBgColor: '#6b1a1a',
      refColor: '#ffffff',
      borderColor: '#8b2020',
      bgImage: ''
    }
  },
  moderne: {
    label: 'Moderne',
    settings: {
      textColor: '#ffffff',
      textAlign: 'left',
      lineHeight: 1.6,
      bgColor: '#1a1a2e',
      bgOpacity: 0.85,
      shadow: true,
      borderRadius: 8,
      borderWidth: 1,
      padding: 26,
      refPosition: 'top-right',
      refBgColor: '#111111',
      refColor: '#ffffff',
      borderColor: '#2a2a4a',
      bgImage: ''
    }
  },
  minimal: {
    label: 'Minimal',
    settings: {
      textColor: '#222222',
      textAlign: 'left',
      lineHeight: 1.5,
      bgColor: '#ffffff',
      bgOpacity: 0.95,
      shadow: false,
      borderRadius: 4,
      borderWidth: 0,
      padding: 20,
      refPosition: 'top-center',
      refBgColor: '#999999',
      refColor: '#666666',
      borderColor: '#eeeeee',
      bgImage: ''
    }
  }
};

window.VerseObs.CHANNEL_NAME = 'verseobs';
window.VerseObs.LS_KEY = 'verseobs_msg';
window.VerseObs.SETTINGS_KEY = 'verseobs_settings';
window.VerseObs.FREETEXT_SETTINGS_KEY = 'verseobs_freetext_style';
window.VerseObs.HISTORY_KEY = 'verseobs_history';
window.VerseObs.HISTORY_MAX = 50;
window.VerseObs.API_CACHE_KEY = 'verseobs_api_cache';

/**
 * Free-text style — independent from the Bible-verse style.
 * Only the properties relevant to free text (no reference pill).
 */
window.VerseObs.FREETEXT_DEFAULTS = {
  position: 'center',
  animation: 'fade',
  animationDuration: 500,
  autoHide: 0,
  fontFamily: "'Segoe UI', Calibri, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 34,
  textColor: '#ffffff',
  textAlign: 'center',
  lineHeight: 1.5,
  bgColor: '#101018',
  bgOpacity: 0.85,
  shadow: true,
  borderRadius: 16,
  borderWidth: 0,
  borderColor: '#50c8c8',
  padding: 32,
  maxWidth: 80,
  highlightColor: '#ffd54a',
  bgImage: '',
  template: 'chant'
};

/**
 * Free-text presets ("styles type"). Same shape as TEMPLATES.
 */
window.VerseObs.FREETEXT_STYLES = {
  chant: {
    label: 'Chant',
    settings: {
      position: 'center',
      textAlign: 'center',
      fontSize: 38,
      lineHeight: 1.55,
      textColor: '#ffffff',
      bgColor: '#0d1018',
      bgOpacity: 0.82,
      borderRadius: 18,
      borderWidth: 0,
      padding: 34,
      maxWidth: 82,
      shadow: true
    }
  },
  annonce: {
    label: 'Annonce',
    settings: {
      position: 'lower-third',
      textAlign: 'left',
      fontSize: 30,
      lineHeight: 1.4,
      textColor: '#ffffff',
      bgColor: '#1d4ed8',
      bgOpacity: 0.95,
      borderRadius: 10,
      borderWidth: 0,
      padding: 26,
      maxWidth: 70,
      shadow: true
    }
  },
  priere: {
    label: 'Prière',
    settings: {
      position: 'center',
      textAlign: 'center',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 32,
      lineHeight: 1.7,
      textColor: '#f3ece0',
      bgColor: '#241c12',
      bgOpacity: 0.8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#c4a35a',
      padding: 34,
      maxWidth: 72,
      shadow: true
    }
  },
  citation: {
    label: 'Citation',
    settings: {
      position: 'center',
      textAlign: 'center',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontSize: 34,
      lineHeight: 1.5,
      textColor: '#1a1a1a',
      bgColor: '#ffffff',
      bgOpacity: 0.96,
      borderRadius: 6,
      borderWidth: 0,
      padding: 30,
      maxWidth: 68,
      shadow: false
    }
  }
};
