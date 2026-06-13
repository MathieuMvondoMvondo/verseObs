/* VerseObs - Display Orchestrator */
(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var MSG = window.VerseObs.MSG;
  var DEFAULTS = window.VerseObs.DEFAULTS;
  var Channel = window.VerseObs.Channel;
  var Renderer = window.VerseObs.Renderer;

  var renderer = null;
  var channel = null;
  var autoHideTimer = null;

  // Preview mode (in-dock mini overlay): ?preview=1. It renders PREVIEW messages,
  // never auto-hides, and never answers PINGs so the connection indicator only
  // reflects the real OBS overlay.
  var isPreview = /[?&]preview=1/.test(window.location.search);

  function clearAutoHide() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  function scheduleAutoHide(duration) {
    clearAutoHide();
    if (duration && duration > 0) {
      autoHideTimer = setTimeout(function () {
        autoHideTimer = null;
        renderer.hide();
      }, duration);
    }
  }

  /**
   * Read bgImage from localStorage (too large for broadcast channel).
   */
  function readBgImage() {
    try {
      // Try dedicated key first
      var img = localStorage.getItem('verseobs_bgimage');
      if (img) return img;
      // Fallback: read from settings
      var raw = localStorage.getItem(window.VerseObs.SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        return s.bgImage || '';
      }
    } catch (e) {}
    return '';
  }

  function handleMessage(msg) {
    if (!msg || !msg.type) return;

    // ---- Preview overlay: only PREVIEW / PREVIEW_HIDE / UPDATE_STYLE ----
    if (isPreview) {
      if (msg.type === MSG.PREVIEW) {
        clearAutoHide();
        var pData = {
          text: msg.text || '',
          html: msg.html || '',
          reference: msg.reference || '',
          version: msg.version || '',
          title: msg.title || '',
          subtitle: msg.subtitle || ''
        };
        if (msg.settings) {
          var ps = msg.settings;
          ps.bgImage = readBgImage();
          pData.style = ps;
          pData.position = ps.position;
          pData.animation = 'none'; // previews shouldn't replay animations
          pData.animationDuration = 0;
        }
        renderer.show(pData);
      } else if (msg.type === MSG.PREVIEW_HIDE) {
        renderer.hide();
      } else if (msg.type === MSG.UPDATE_STYLE) {
        var pStyle = msg.settings || {};
        pStyle.bgImage = readBgImage();
        renderer.updateStyle(pStyle);
      }
      return;
    }

    // The real overlay ignores preview-only traffic.
    if (msg.type === MSG.PREVIEW || msg.type === MSG.PREVIEW_HIDE) return;

    switch (msg.type) {
      case MSG.SHOW_VERSE:
      case MSG.SHOW_TEXT:
        clearAutoHide();
        var displayData = {
          text: msg.text || '',
          html: msg.html || '',
          reference: msg.reference || '',
          version: msg.version || '',
          title: msg.title || '',
          subtitle: msg.subtitle || ''
        };
        if (msg.settings) {
          // Restore bgImage from localStorage (excluded from broadcast)
          var settings = msg.settings;
          settings.bgImage = readBgImage();
          displayData.style = settings;
          displayData.position = settings.position;
          displayData.animation = settings.animation;
          displayData.animationDuration = settings.animationDuration;
        }
        renderer.show(displayData).then(function () {
          var autoHide = (msg.settings && msg.settings.autoHide !== undefined)
            ? Number(msg.settings.autoHide)
            : DEFAULTS.autoHide;
          scheduleAutoHide(autoHide);
        });
        break;

      case MSG.HIDE:
        clearAutoHide();
        renderer.hide();
        break;

      case MSG.UPDATE_STYLE:
        var styleSettings = msg.settings || {};
        // Restore bgImage from localStorage
        styleSettings.bgImage = readBgImage();
        renderer.updateStyle(styleSettings);
        break;

      case MSG.PING:
        if (channel) {
          channel.send({ type: MSG.PONG, timestamp: Date.now() });
        }
        break;
    }
  }

  function init() {
    var container = document.getElementById('verse-container');
    if (!container) {
      console.error('VerseObs: #verse-container not found');
      return;
    }

    container.classList.add(DEFAULTS.position);
    renderer = new Renderer(container);

    // Load saved settings
    try {
      var saved = localStorage.getItem(window.VerseObs.SETTINGS_KEY);
      if (saved) {
        var settings = JSON.parse(saved);
        // bgImage might be in the settings or in dedicated key
        if (!settings.bgImage) {
          settings.bgImage = readBgImage();
        }
        renderer.updateStyle(settings);
      }
    } catch (e) {}

    channel = new Channel({ autoPong: !isPreview });
    channel.onMessage(handleMessage);

    // Listen for bgImage changes via storage event
    window.addEventListener('storage', function (e) {
      if (e.key === 'verseobs_bgimage') {
        renderer.updateStyle({ bgImage: e.newValue || '' });
      }
    });

    console.log('VerseObs display initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.VerseObs.DisplayApp = {
    init: init,
    handleMessage: handleMessage
  };
})();
