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
  refColor: '#ffffff'
};

window.VerseObs.CHANNEL_NAME = 'verseobs';
window.VerseObs.LS_KEY = 'verseobs_msg';
window.VerseObs.SETTINGS_KEY = 'verseobs_settings';
window.VerseObs.HISTORY_KEY = 'verseobs_history';
window.VerseObs.HISTORY_MAX = 50;
window.VerseObs.API_CACHE_KEY = 'verseobs_api_cache';
