/* VerseObs - Verse Renderer */
(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var DEFAULTS = window.VerseObs.DEFAULTS;
  var POSITIONS = window.VerseObs.POSITIONS;
  var Animations = window.VerseObs.Animations;

  var REF_POSITIONS = ['ref-top-left', 'ref-top-right', 'ref-top-center', 'ref-inline'];

  /**
   * Renderer class - renders verses to the DOM.
   * @param {HTMLElement} container - The .verse-container element.
   */
  function Renderer(container) {
    this.container = container;
    this.card = null;
    this.currentPosition = DEFAULTS.position;
    this.currentAnimation = DEFAULTS.animation;
    this.animationDuration = DEFAULTS.animationDuration;
    this._refPosition = DEFAULTS.refPosition || 'top-center';
    this._visible = false;
    this._animating = false;
  }

  /**
   * Create the verse card element from data.
   * @param {object} data - { text, reference }
   * @returns {HTMLElement}
   */
  Renderer.prototype.createVerseElement = function (data) {
    var card = document.createElement('div');
    card.className = 'verse-card hidden';

    // Apply ref position class
    var refPos = this._refPosition || 'top-center';
    card.classList.add('ref-' + refPos);

    // Reference pill on top (hidden via CSS when inline)
    if (data.reference) {
      var refEl = document.createElement('div');
      refEl.className = 'verse-reference';
      refEl.textContent = data.reference;
      card.appendChild(refEl);
    }

    // Inline reference bar - always created, shown/hidden via CSS
    if (data.reference) {
      var inlineRef = document.createElement('div');
      inlineRef.className = 'verse-inline-ref';
      var refLeft = document.createElement('span');
      refLeft.textContent = data.reference;
      inlineRef.appendChild(refLeft);
      if (data.version) {
        var refRight = document.createElement('span');
        refRight.textContent = data.version;
        inlineRef.appendChild(refRight);
      }
      card.appendChild(inlineRef);
    }

    // Text body card
    var body = document.createElement('div');
    body.className = 'verse-body';

    var textEl = document.createElement('div');
    textEl.className = 'verse-text';

    // Add verse number as superscript if we can extract it
    var text = data.text || '';
    var verseNum = '';
    if (data.reference) {
      var match = data.reference.match(/:(\d+)/);
      if (match) verseNum = match[1];
    }

    if (verseNum) {
      var sup = document.createElement('sup');
      sup.className = 'verse-num';
      sup.textContent = verseNum;
      textEl.appendChild(sup);
      textEl.appendChild(document.createTextNode(text));
    } else {
      textEl.textContent = text;
    }

    body.appendChild(textEl);
    card.appendChild(body);

    return card;
  };

  /**
   * Update the ref position class on the current card (live update).
   */
  Renderer.prototype._updateRefPositionClass = function () {
    if (!this.card) return;
    for (var i = 0; i < REF_POSITIONS.length; i++) {
      this.card.classList.remove(REF_POSITIONS[i]);
    }
    this.card.classList.add('ref-' + (this._refPosition || 'top-center'));
  };

  /**
   * Set the position class on the container.
   */
  Renderer.prototype._setPosition = function (position) {
    var all = [
      POSITIONS.LOWER_THIRD,
      POSITIONS.UPPER_THIRD,
      POSITIONS.CENTER,
      POSITIONS.FULLSCREEN
    ];
    for (var i = 0; i < all.length; i++) {
      this.container.classList.remove(all[i]);
    }
    this.container.classList.add(position || DEFAULTS.position);
    this.currentPosition = position || DEFAULTS.position;
  };

  /**
   * Apply style settings to the container via CSS variables.
   * @param {object} style - Style settings object.
   */
  Renderer.prototype.updateStyle = function (style) {
    if (!style) return;
    var root = document.documentElement;

    if (style.textColor !== undefined) {
      root.style.setProperty('--text-color', style.textColor);
    }
    if (style.bgColor !== undefined) {
      // Convert hex to r, g, b for rgba usage
      var rgb = hexToRgb(style.bgColor);
      if (rgb) {
        root.style.setProperty('--bg-color', rgb.r + ', ' + rgb.g + ', ' + rgb.b);
      }
    }
    if (style.bgOpacity !== undefined) {
      root.style.setProperty('--bg-opacity', String(style.bgOpacity));
    }
    if (style.fontSize !== undefined) {
      root.style.setProperty('--font-size', style.fontSize + 'px');
    }
    if (style.fontFamily !== undefined) {
      root.style.setProperty('--font-family', style.fontFamily);
    }
    if (style.padding !== undefined) {
      root.style.setProperty('--padding', style.padding + 'px');
    }
    if (style.borderRadius !== undefined) {
      root.style.setProperty('--border-radius', style.borderRadius + 'px');
    }
    if (style.maxWidth !== undefined) {
      root.style.setProperty('--max-width', style.maxWidth + '%');
    }
    if (style.refColor !== undefined) {
      root.style.setProperty('--ref-color', style.refColor);
    }
    if (style.refFontSize !== undefined) {
      root.style.setProperty('--ref-font-size', style.refFontSize + 'px');
    }
    if (style.shadow !== undefined) {
      if (style.shadow === false || style.shadow === 'none') {
        root.style.setProperty('--shadow', 'none');
      } else {
        root.style.setProperty('--shadow', '0 4px 20px rgba(0, 0, 0, 0.5)');
      }
    }
    if (style.position !== undefined) {
      this._setPosition(style.position);
    }
    if (style.animation !== undefined) {
      this.currentAnimation = style.animation;
    }
    if (style.animationDuration !== undefined) {
      this.animationDuration = style.animationDuration;
    }
    if (style.refBgColor !== undefined) {
      root.style.setProperty('--ref-bg-color', style.refBgColor);
    }
    if (style.borderColor !== undefined) {
      root.style.setProperty('--border-color', style.borderColor);
    }
    if (style.refPosition !== undefined) {
      this._refPosition = style.refPosition;
      this._updateRefPositionClass();
    }
    if (style.bgImage !== undefined) {
      if (style.bgImage) {
        root.style.setProperty('--bg-image', 'url("' + style.bgImage + '")');
      } else {
        root.style.setProperty('--bg-image', 'none');
      }
    }
  };

  /**
   * Show a verse with animation.
   * @param {object} data - { text, reference, position, animation, animationDuration, style }
   * @returns {Promise}
   */
  Renderer.prototype.show = function (data) {
    var self = this;

    if (self._animating) {
      return Promise.resolve();
    }
    self._animating = true;

    // Apply style if provided
    if (data.style) {
      self.updateStyle(data.style);
    }

    // Set position
    if (data.position) {
      self._setPosition(data.position);
    }

    var animation = data.animation || self.currentAnimation;
    var duration = data.animationDuration || self.animationDuration;

    // If already visible, hide first then show new
    var hidePromise;
    if (self._visible && self.card) {
      hidePromise = Animations.animate(self.card, animation, 'out', {
        position: self.currentPosition,
        duration: duration
      }).then(function () {
        if (self.card && self.card.parentNode) {
          self.card.parentNode.removeChild(self.card);
        }
      });
    } else {
      hidePromise = Promise.resolve();
    }

    return hidePromise.then(function () {
      // Create new card
      self.card = self.createVerseElement(data);
      self.container.appendChild(self.card);

      return Animations.animate(self.card, animation, 'in', {
        position: self.currentPosition,
        duration: duration
      });
    }).then(function () {
      self._visible = true;
      self._animating = false;
    });
  };

  /**
   * Hide the current verse with animation.
   * @returns {Promise}
   */
  Renderer.prototype.hide = function () {
    var self = this;

    if (!self._visible || !self.card || self._animating) {
      return Promise.resolve();
    }
    self._animating = true;

    var animation = self.currentAnimation;
    var duration = self.animationDuration;

    return Animations.animate(self.card, animation, 'out', {
      position: self.currentPosition,
      duration: duration
    }).then(function () {
      if (self.card && self.card.parentNode) {
        self.card.parentNode.removeChild(self.card);
      }
      self.card = null;
      self._visible = false;
      self._animating = false;
    });
  };

  /**
   * Convert hex color to {r, g, b}.
   */
  function hexToRgb(hex) {
    if (!hex) return null;
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) return null;
    var num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  window.VerseObs.Renderer = Renderer;
})();
