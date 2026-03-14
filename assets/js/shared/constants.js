window.VerseObs = window.VerseObs || {};

window.VerseObs.MSG = {
  SHOW_VERSE: 'show_verse',
  SHOW_TEXT: 'show_text',
  HIDE: 'hide',
  UPDATE_STYLE: 'update_style',
  PING: 'ping',
  PONG: 'pong'
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
  bgColor: '#ffffff',
  bgOpacity: 0.92,
  shadow: true,
  borderRadius: 14,
  padding: 24,
  maxWidth: 85, // percentage
  refFontSize: 15,
  refColor: '#ffffff',
  refPosition: 'top-center',
  refBgColor: '#2d1a3e',
  borderColor: '#50c8c8',
  bgImage: '',
  template: 'custom'
};

window.VerseObs.TEMPLATES = {
  classique: {
    label: 'Classique',
    settings: {
      textColor: '#1a1a1a',
      bgColor: '#ffffff',
      bgOpacity: 0.92,
      shadow: true,
      borderRadius: 14,
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
      bgColor: '#ffffff',
      bgOpacity: 0.95,
      shadow: true,
      borderRadius: 10,
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
      bgColor: '#1a1a2e',
      bgOpacity: 0.85,
      shadow: true,
      borderRadius: 8,
      padding: 26,
      refPosition: 'top-right',
      refBgColor: '#111111',
      refColor: '#ffffff',
      borderColor: 'rgba(255,255,255,0.15)',
      bgImage: ''
    }
  },
  minimal: {
    label: 'Minimal',
    settings: {
      textColor: '#222222',
      bgColor: '#ffffff',
      bgOpacity: 0.95,
      shadow: false,
      borderRadius: 4,
      padding: 20,
      refPosition: 'top-center',
      refBgColor: 'transparent',
      refColor: '#666666',
      borderColor: 'transparent',
      bgImage: ''
    }
  }
};

window.VerseObs.CHANNEL_NAME = 'verseobs';
window.VerseObs.LS_KEY = 'verseobs_msg';
window.VerseObs.SETTINGS_KEY = 'verseobs_settings';
window.VerseObs.HISTORY_KEY = 'verseobs_history';
window.VerseObs.HISTORY_MAX = 50;
window.VerseObs.API_CACHE_KEY = 'verseobs_api_cache';
