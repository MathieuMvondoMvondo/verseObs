/* VerseObs - Animation handling */
(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var DEFAULTS = window.VerseObs.DEFAULTS;

  /**
   * Remove all animation classes from an element.
   */
  function clearAnimClasses(el) {
    var classes = [
      'anim-fade-in', 'anim-fade-out',
      'anim-slide-up-in', 'anim-slide-up-out',
      'anim-slide-down-in', 'anim-slide-down-out',
      'anim-typewriter'
    ];
    for (var i = 0; i < classes.length; i++) {
      el.classList.remove(classes[i]);
    }
  }

  /**
   * Determine the appropriate slide direction based on position.
   * Lower-third / center / fullscreen: slides up on in, down on out.
   * Upper-third: slides down on in, up on out.
   */
  function getSlideClass(position, direction) {
    var isUpper = position === 'upper-third';
    if (direction === 'in') {
      return isUpper ? 'anim-slide-down-in' : 'anim-slide-up-in';
    }
    return isUpper ? 'anim-slide-up-out' : 'anim-slide-down-out'; // direction === 'out' is implied since we only have 'in' and 'out'
  }

  /**
   * Run a typewriter effect on the verse text element inside the card.
   * Returns a promise that resolves when complete.
   */
  function typewrite(el, duration) {
    return new Promise(function (resolve) {
      var textEl = el.querySelector('.verse-text');
      if (!textEl) {
        resolve();
        return;
      }

      var fullText = textEl.textContent;
      if (!fullText || fullText.length === 0) {
        resolve();
        return;
      }

      // Make element visible immediately
      el.classList.remove('hidden');
      el.style.opacity = '1';
      textEl.textContent = '';
      el.classList.add('anim-typewriter');

      var charDelay = Math.max(20, Math.min(80, duration / fullText.length));
      var index = 0;

      function addChar() {
        if (index < fullText.length) {
          textEl.textContent += fullText[index];
          index++;
          setTimeout(addChar, charDelay);
        } else {
          resolve();
        }
      }

      addChar();
    });
  }

  /**
   * Animate an element.
   * @param {HTMLElement} el - The element to animate.
   * @param {string} type - Animation type: 'fade', 'slide', 'typewriter', 'none'.
   * @param {string} direction - 'in' or 'out'.
   * @param {object} [opts] - Options: { position, duration }.
   * @returns {Promise} Resolves when animation completes.
   */
  function animate(el, type, direction, opts) {
    opts = opts || {};
    var position = opts.position || DEFAULTS.position;
    var duration = opts.duration || DEFAULTS.animationDuration;

    return new Promise(function (resolve) {
      clearAnimClasses(el);

      // None: instant show/hide
      if (type === 'none') {
        if (direction === 'in') {
          el.classList.remove('hidden');
          el.style.opacity = '1';
        } else {
          el.style.opacity = '0';
          el.classList.add('hidden');
        }
        resolve();
        return;
      }

      // Typewriter (only for 'in'; falls back to fade for 'out')
      if (type === 'typewriter' && direction === 'in') {
        typewrite(el, duration).then(resolve);
        return;
      }

      // Fade or slide (and typewriter-out which uses fade)
      var animClass;
      if (type === 'slide') {
        animClass = getSlideClass(position, direction);
      } else {
        // fade (and typewriter-out fallback)
        animClass = direction === 'in' ? 'anim-fade-in' : 'anim-fade-out';
      }

      if (direction === 'in') {
        el.classList.remove('hidden');
      }

      // Set animation duration
      el.style.animationDuration = duration + 'ms';
      el.classList.add(animClass);

      function onEnd() {
        el.removeEventListener('animationend', onEnd);
        clearAnimClasses(el);
        if (direction === 'out') {
          el.classList.add('hidden');
          el.style.opacity = '0';
        } else {
          el.style.opacity = '1';
        }
        resolve();
      }

      el.addEventListener('animationend', onEnd);

      // Fallback timeout in case animationend doesn't fire
      setTimeout(function () {
        el.removeEventListener('animationend', onEnd);
        if (direction === 'out') {
          el.classList.add('hidden');
          el.style.opacity = '0';
        } else {
          el.style.opacity = '1';
        }
        clearAnimClasses(el);
        resolve();
      }, duration + 100);
    });
  }

  window.VerseObs.Animations = {
    animate: animate,
    clearAnimClasses: clearAnimClasses
  };
})();
