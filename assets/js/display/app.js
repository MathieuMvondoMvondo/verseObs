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

  /**
   * Clear any pending auto-hide timer.
   */
  function clearAutoHide() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  /**
   * Schedule auto-hide if duration > 0.
   */
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
   * Handle incoming messages from the channel.
   */
  function handleMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case MSG.SHOW_VERSE:
      case MSG.SHOW_TEXT:
        clearAutoHide();
        // Build display data from message properties
        var displayData = {
          text: msg.text || '',
          reference: msg.reference || ''
        };
        // Apply settings if provided
        if (msg.settings) {
          displayData.style = msg.settings;
          displayData.position = msg.settings.position;
          displayData.animation = msg.settings.animation;
          displayData.animationDuration = msg.settings.animationDuration;
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
        renderer.updateStyle(msg.settings || {});
        break;

      case MSG.PING:
        if (channel) {
          channel.send({ type: MSG.PONG, timestamp: Date.now() });
        }
        break;
    }
  }

  /**
   * Initialize the display overlay.
   */
  function init() {
    var container = document.getElementById('verse-container');
    if (!container) {
      console.error('VerseObs: #verse-container not found');
      return;
    }

    // Set default position
    container.classList.add(DEFAULTS.position);

    // Create renderer
    renderer = new Renderer(container);

    // Load saved settings if available
    try {
      var saved = localStorage.getItem(window.VerseObs.SETTINGS_KEY);
      if (saved) {
        var settings = JSON.parse(saved);
        renderer.updateStyle(settings);
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Set up channel listener
    channel = new Channel(window.VerseObs.CHANNEL_NAME);
    channel.onMessage(handleMessage);

    console.log('VerseObs display initialized');
  }

  // Initialize when DOM is ready
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
