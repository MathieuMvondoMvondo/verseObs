/* VerseObs - Settings Management */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var SETTINGS_KEY = window.VerseObs.SETTINGS_KEY || 'verseobs_settings';

  function Settings() {
    this._settings = {};
    this.onChange = null; // callback(settings)
    this._bindings = [];
    this._templateSelect = null;
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
      fontFamily: D.fontFamily || "'Segoe UI', sans-serif",
      fontSize: D.fontSize || 28,
      textColor: D.textColor || '#1a1a1a',
      textAlign: D.textAlign || 'left',
      lineHeight: D.lineHeight || 1.55,
      bgColor: D.bgColor || '#ffffff',
      bgOpacity: D.bgOpacity || 0.92,
      shadow: D.shadow !== undefined ? D.shadow : true,
      borderRadius: D.borderRadius || 14,
      borderWidth: D.borderWidth !== undefined ? D.borderWidth : 2,
      padding: D.padding || 24,
      maxWidth: D.maxWidth || 85,
      refFontSize: D.refFontSize || 15,
      refColor: D.refColor || '#ffffff',
      refPosition: D.refPosition || 'top-center',
      refBgColor: D.refBgColor || '#2d1a3e',
      borderColor: D.borderColor || '#50c8c8',
      highlightColor: D.highlightColor || '#ffff00',
      bgImage: D.bgImage || '',
      template: D.template || 'custom'
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
      // ignore quota errors (e.g. large bgImage)
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
   * Return settings safe for messaging (excludes large data like bgImage).
   */
  Settings.prototype.getForMessage = function () {
    var copy = this.getAll();
    delete copy.bgImage;
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
   * Send UPDATE_STYLE message (excludes bgImage from broadcast).
   */
  Settings.prototype._notifyChange = function () {
    if (typeof this.onChange === 'function') {
      this.onChange(this.getForMessage());
    }
  };

  /**
   * Bind settings panel UI inputs to settings values.
   * Skips "template" (handled by bindExtras).
   */
  Settings.prototype.bindUI = function (container) {
    var self = this;
    if (!container) return;

    var inputs = container.querySelectorAll('[data-setting]');
    self._bindings = [];

    for (var i = 0; i < inputs.length; i++) {
      (function (el) {
        var key = el.getAttribute('data-setting');
        if (!key || key === 'template') return;

        self._bindings.push({ el: el, key: key });

        // Set initial value
        _setInputValue(el, self._settings[key]);

        // Listen for changes
        var eventType = _getEventType(el);
        el.addEventListener(eventType, function () {
          var val = _getInputValue(el);
          self._settings[key] = val;
          self.save();

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
    if (this._templateSelect) {
      this._templateSelect.value = this._settings.template || 'custom';
    }
  };

  /**
   * Apply a template by name.
   */
  Settings.prototype.applyTemplate = function (templateKey) {
    var TEMPLATES = window.VerseObs.TEMPLATES || {};
    var tmpl = TEMPLATES[templateKey];
    if (!tmpl) return;

    var s = tmpl.settings;
    for (var key in s) {
      if (s.hasOwnProperty(key)) {
        this._settings[key] = s[key];
      }
    }
    this._settings.template = templateKey;
    this.save();
    this._updateUI();
    this._notifyChange();
  };

  /**
   * Bind template selector + image import.
   */
  Settings.prototype.bindExtras = function (container) {
    var self = this;

    var templateSelect = container.querySelector('[data-setting="template"]');
    self._templateSelect = templateSelect;

    if (templateSelect) {
      templateSelect.value = self._settings.template || 'custom';
      templateSelect.addEventListener('change', function () {
        var val = templateSelect.value;
        if (val === 'custom') {
          self._settings.template = 'custom';
          self.save();
          self._notifyChange();
        } else {
          self.applyTemplate(val);
        }
      });
    }

    // Image import
    var imageInput = container.querySelector('#bg-image-input');
    if (imageInput) {
      imageInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          self._settings.bgImage = ev.target.result;
          self._settings.template = 'custom';
          self.save();
          self._updateUI();
          self._notifyChange();
          // Also send bgImage directly via a separate localStorage key for the display
          try {
            localStorage.setItem('verseobs_bgimage', ev.target.result);
          } catch (e) {
            // ignore quota
          }
        };
        reader.readAsDataURL(file);
      });
    }

    var clearImageBtn = container.querySelector('#btn-clear-bg-image');
    if (clearImageBtn) {
      clearImageBtn.addEventListener('click', function () {
        self._settings.bgImage = '';
        self.save();
        self._notifyChange();
        try {
          localStorage.removeItem('verseobs_bgimage');
        } catch (e) {}
        if (imageInput) imageInput.value = '';
      });
    }

    // Auto-switch to 'custom' when user changes any setting manually
    var allInputs = container.querySelectorAll('[data-setting]');
    for (var i = 0; i < allInputs.length; i++) {
      (function (el) {
        if (el.getAttribute('data-setting') === 'template') return;
        var evt = _getEventType(el);
        el.addEventListener(evt, function () {
          if (self._settings.template !== 'custom') {
            self._settings.template = 'custom';
            if (templateSelect) templateSelect.value = 'custom';
          }
        });
      })(allInputs[i]);
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
    } else {
      el.value = val;
    }
  }

  function _getInputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    if (el.tagName === 'SELECT') {
      var v = el.value;
      if (v !== '' && !isNaN(v)) return Number(v);
    }
    return el.value;
  }

  function _formatValue(key, val) {
    if (key === 'bgOpacity') return Math.round(val * 100) + '%';
    if (key === 'maxWidth') return val + '%';
    if (key === 'animationDuration') return val + 'ms';
    if (key === 'autoHide') return val === 0 ? 'Off' : (val / 1000) + 's';
    if (key === 'fontSize' || key === 'refFontSize') return val + 'px';
    if (key === 'borderRadius' || key === 'padding' || key === 'borderWidth') return val + 'px';
    if (key === 'lineHeight') return (Math.round(val * 100) / 100).toString();
    return String(val);
  }

  window.VerseObs.Settings = Settings;
})();
