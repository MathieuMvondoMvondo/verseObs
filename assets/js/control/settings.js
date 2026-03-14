/* VerseObs - Settings Management */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var SETTINGS_KEY = window.VerseObs.SETTINGS_KEY || 'verseobs_settings';

  function Settings() {
    this._settings = {};
    this.onChange = null; // callback(settings)
    this._bindings = [];
  }

  /**
   * Get default settings.
   */
  Settings.prototype._getDefaults = function () {
    var D = window.VerseObs.DEFAULTS || {};
    return {
      position: D.position || 'lower-third',
      animation: D.animation || 'fade',
      animationDuration: D.animationDuration || 500,
      autoHide: D.autoHide || 0,
      fontFamily: D.fontFamily || 'Georgia, serif',
      fontSize: D.fontSize || 32,
      textColor: D.textColor || '#ffffff',
      bgColor: D.bgColor || '#000000',
      bgOpacity: D.bgOpacity || 0.7,
      shadow: D.shadow !== undefined ? D.shadow : true,
      borderRadius: D.borderRadius || 8,
      padding: D.padding || 20,
      maxWidth: D.maxWidth || 80,
      refFontSize: D.refFontSize || 20,
      refColor: D.refColor || '#cccccc'
    };
  };

  /**
   * Load settings from localStorage.
   */
  Settings.prototype.load = function () {
    var defaults = this._getDefaults();
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        // Merge: defaults as base, overwrite with saved values
        for (var key in defaults) {
          if (defaults.hasOwnProperty(key)) {
            this._settings[key] = saved.hasOwnProperty(key) ? saved[key] : defaults[key];
          }
        }
      } else {
        this._settings = defaults;
      }
    } catch (e) {
      this._settings = defaults;
    }
    return this._settings;
  };

  /**
   * Save current settings to localStorage.
   */
  Settings.prototype.save = function () {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    } catch (e) {
      // ignore
    }
  };

  /**
   * Return a copy of current settings.
   */
  Settings.prototype.getAll = function () {
    var copy = {};
    for (var key in this._settings) {
      if (this._settings.hasOwnProperty(key)) {
        copy[key] = this._settings[key];
      }
    }
    return copy;
  };

  /**
   * Update a single setting.
   */
  Settings.prototype.update = function (key, value) {
    this._settings[key] = value;
    this.save();
    this._notifyChange();
  };

  /**
   * Reset all settings to defaults.
   */
  Settings.prototype.reset = function () {
    this._settings = this._getDefaults();
    this.save();
    this._updateUI();
    this._notifyChange();
  };

  /**
   * Send UPDATE_STYLE message.
   */
  Settings.prototype._notifyChange = function () {
    if (typeof this.onChange === 'function') {
      this.onChange(this.getAll());
    }
  };

  /**
   * Bind settings panel UI inputs to settings values.
   * Expects input elements with data-setting="key" attributes.
   */
  Settings.prototype.bindUI = function (container) {
    var self = this;
    if (!container) return;

    var inputs = container.querySelectorAll('[data-setting]');
    self._bindings = [];

    for (var i = 0; i < inputs.length; i++) {
      (function (el) {
        var key = el.getAttribute('data-setting');
        if (!key) return;

        self._bindings.push({ el: el, key: key });

        // Set initial value
        _setInputValue(el, self._settings[key]);

        // Listen for changes
        var eventType = _getEventType(el);
        el.addEventListener(eventType, function () {
          var val = _getInputValue(el);
          self._settings[key] = val;
          self.save();

          // Update value display if exists
          var display = el.parentElement && el.parentElement.querySelector('.cp-setting-value');
          if (display) {
            display.textContent = _formatValue(key, val);
          }

          self._notifyChange();
        });
      })(inputs[i]);
    }
  };

  /**
   * Update all bound UI elements from current settings.
   */
  Settings.prototype._updateUI = function () {
    for (var i = 0; i < this._bindings.length; i++) {
      var binding = this._bindings[i];
      _setInputValue(binding.el, this._settings[binding.key]);

      var display = binding.el.parentElement && binding.el.parentElement.querySelector('.cp-setting-value');
      if (display) {
        display.textContent = _formatValue(binding.key, this._settings[binding.key]);
      }
    }
  };

  // ---- Helpers ----

  function _getEventType(el) {
    var type = el.type || el.tagName.toLowerCase();
    if (type === 'range' || type === 'color') return 'input';
    if (type === 'checkbox') return 'change';
    if (el.tagName === 'SELECT') return 'change';
    return 'change';
  }

  function _setInputValue(el, val) {
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el.type === 'range' || el.type === 'number') {
      el.value = val;
    } else {
      el.value = val;
    }
  }

  function _getInputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    return el.value;
  }

  function _formatValue(key, val) {
    if (key === 'bgOpacity') return Math.round(val * 100) + '%';
    if (key === 'maxWidth') return val + '%';
    if (key === 'animationDuration') return val + 'ms';
    if (key === 'autoHide') return val === 0 ? 'Off' : (val / 1000) + 's';
    if (key === 'fontSize' || key === 'refFontSize') return val + 'px';
    if (key === 'borderRadius' || key === 'padding') return val + 'px';
    return String(val);
  }

  window.VerseObs.Settings = Settings;
})();
