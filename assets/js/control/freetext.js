/* VerseObs - Free Text Mode */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  /**
   * @param {object} opts
   * @param {HTMLTextAreaElement} opts.textarea
   * @param {Function} opts.onSend - callback(text) to send to display
   */
  function FreeText(opts) {
    opts = opts || {};
    this.textarea = opts.textarea || null;
    this.onSend = opts.onSend || null;
  }

  /**
   * Get current textarea value.
   */
  FreeText.prototype.getText = function () {
    return this.textarea ? this.textarea.value : '';
  };

  /**
   * Set textarea value.
   */
  FreeText.prototype.setText = function (text) {
    if (this.textarea) {
      this.textarea.value = text;
    }
  };

  /**
   * Clear textarea.
   */
  FreeText.prototype.clear = function () {
    if (this.textarea) {
      this.textarea.value = '';
    }
  };

  /**
   * Send the current text to the display.
   * Uses SHOW_TEXT message type via the channel.
   */
  FreeText.prototype.send = function () {
    var text = this.getText().trim();
    if (!text) return;

    if (typeof this.onSend === 'function') {
      this.onSend(text);
    }
  };

  window.VerseObs.FreeText = FreeText;
})();
