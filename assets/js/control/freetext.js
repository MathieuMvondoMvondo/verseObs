/* VerseObs - Enhanced Free Text Mode */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var SAVED_KEY = 'verseobs_saved_texts';

  /**
   * @param {object} opts
   * @param {HTMLInputElement} opts.titleInput
   * @param {HTMLInputElement} opts.subtitleInput
   * @param {HTMLElement} opts.contentEditable - contenteditable div for rich text
   * @param {HTMLElement} opts.formatToolbar - format toolbar for free text
   * @param {HTMLElement} opts.savedListContainer
   * @param {HTMLInputElement} opts.saveNameInput
   * @param {Function} opts.onSend - callback({ title, subtitle, text, html })
   */
  function FreeText(opts) {
    opts = opts || {};
    this.titleInput = opts.titleInput || null;
    this.subtitleInput = opts.subtitleInput || null;
    this.contentEditable = opts.contentEditable || null;
    this.formatToolbar = opts.formatToolbar || null;
    this.savedListContainer = opts.savedListContainer || null;
    this.saveNameInput = opts.saveNameInput || null;
    this.onSend = opts.onSend || null;

    this._savedTexts = [];
    this._loadSaved();
    this._bindFormatToolbar();
  }

  /**
   * Get current data.
   */
  FreeText.prototype.getData = function () {
    var title = this.titleInput ? this.titleInput.value.trim() : '';
    var subtitle = this.subtitleInput ? this.subtitleInput.value.trim() : '';
    var text = this.contentEditable ? this.contentEditable.textContent.trim() : '';
    var html = '';

    if (this.contentEditable) {
      var rawHtml = this.contentEditable.innerHTML;
      // Check if any formatting tags exist
      if (/<(b|i|u|strong|em|mark|span|br)\b/i.test(rawHtml)) {
        html = rawHtml;
      }
    }

    return { title: title, subtitle: subtitle, text: text, html: html };
  };

  /**
   * Set content.
   */
  FreeText.prototype.setData = function (data) {
    if (this.titleInput) this.titleInput.value = data.title || '';
    if (this.subtitleInput) this.subtitleInput.value = data.subtitle || '';
    if (this.contentEditable) {
      if (data.html) {
        this.contentEditable.innerHTML = data.html;
      } else {
        this.contentEditable.textContent = data.text || '';
      }
    }
  };

  /**
   * Clear all fields.
   */
  FreeText.prototype.clear = function () {
    if (this.titleInput) this.titleInput.value = '';
    if (this.subtitleInput) this.subtitleInput.value = '';
    if (this.contentEditable) this.contentEditable.innerHTML = '';
  };

  /**
   * Send the current content to the display.
   */
  FreeText.prototype.send = function () {
    var data = this.getData();
    if (!data.text && !data.title) return;

    if (typeof this.onSend === 'function') {
      this.onSend(data);
    }
  };

  // ---- Format Toolbar ----

  FreeText.prototype._bindFormatToolbar = function () {
    if (!this.formatToolbar || !this.contentEditable) return;
    var self = this;

    var buttons = this.formatToolbar.querySelectorAll('[data-format]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          self._applyFormat(btn.getAttribute('data-format'));
        });
      })(buttons[i]);
    }
  };

  FreeText.prototype._applyFormat = function (format) {
    if (!this.contentEditable) return;
    this.contentEditable.focus();

    var colorInput = this.formatToolbar ?
      this.formatToolbar.querySelector('.cp-format-color') : null;

    switch (format) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      case 'highlight':
        var color = colorInput ? colorInput.value : '#ffff00';
        var sel = window.getSelection();
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
          var range = sel.getRangeAt(0);
          var parent = sel.anchorNode.parentElement;
          if (parent && parent.tagName === 'MARK') {
            var textNode = document.createTextNode(parent.textContent);
            parent.parentNode.replaceChild(textNode, parent);
          } else {
            var mark = document.createElement('mark');
            mark.style.backgroundColor = color;
            try {
              range.surroundContents(mark);
            } catch (e) {
              var fragment = range.extractContents();
              mark.appendChild(fragment);
              range.insertNode(mark);
            }
          }
        }
        break;
      case 'clear':
        document.execCommand('removeFormat', false, null);
        var marks = this.contentEditable.querySelectorAll('mark');
        for (var i = 0; i < marks.length; i++) {
          var tn = document.createTextNode(marks[i].textContent);
          marks[i].parentNode.replaceChild(tn, marks[i]);
        }
        break;
    }
  };

  // ---- Saved Texts ----

  FreeText.prototype._loadSaved = function () {
    try {
      var raw = localStorage.getItem(SAVED_KEY);
      this._savedTexts = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this._savedTexts = [];
    }
  };

  FreeText.prototype._savePersist = function () {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(this._savedTexts));
    } catch (e) {}
  };

  FreeText.prototype.saveCurrentText = function () {
    var data = this.getData();
    if (!data.text && !data.title) return;

    var name = this.saveNameInput ? this.saveNameInput.value.trim() : '';
    if (!name) {
      name = data.title || data.text.substring(0, 40) + '...';
    }

    this._savedTexts.unshift({
      name: name,
      title: data.title,
      subtitle: data.subtitle,
      text: data.text,
      html: data.html,
      timestamp: Date.now()
    });

    this._savePersist();
    if (this.saveNameInput) this.saveNameInput.value = '';
    this.renderSavedList();
  };

  FreeText.prototype.deleteSaved = function (index) {
    this._savedTexts.splice(index, 1);
    this._savePersist();
    this.renderSavedList();
  };

  FreeText.prototype.loadSaved = function (index) {
    var item = this._savedTexts[index];
    if (!item) return;
    this.setData(item);
  };

  FreeText.prototype.renderSavedList = function () {
    if (!this.savedListContainer) return;
    var self = this;
    this.savedListContainer.innerHTML = '';

    if (this._savedTexts.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cp-history-empty';
      empty.textContent = 'Aucun texte sauvegardé';
      this.savedListContainer.appendChild(empty);
      return;
    }

    for (var i = 0; i < this._savedTexts.length; i++) {
      (function (idx) {
        var item = self._savedTexts[idx];
        var row = document.createElement('div');
        row.className = 'cp-saved-item';

        var info = document.createElement('div');
        info.className = 'cp-saved-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'cp-saved-name';
        nameEl.textContent = item.name;

        var previewEl = document.createElement('div');
        previewEl.className = 'cp-saved-preview';
        previewEl.textContent = item.text ? item.text.substring(0, 60) : '';

        info.appendChild(nameEl);
        info.appendChild(previewEl);

        var actions = document.createElement('div');
        actions.className = 'cp-saved-actions';

        var loadBtn = document.createElement('button');
        loadBtn.className = 'cp-saved-btn cp-saved-load';
        loadBtn.textContent = 'Charger';
        loadBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.loadSaved(idx);
        });

        var sendBtn = document.createElement('button');
        sendBtn.className = 'cp-saved-btn cp-saved-send';
        sendBtn.textContent = 'Afficher';
        sendBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.loadSaved(idx);
          self.send();
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'cp-saved-btn cp-saved-del';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Supprimer';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.deleteSaved(idx);
        });

        actions.appendChild(loadBtn);
        actions.appendChild(sendBtn);
        actions.appendChild(delBtn);

        row.appendChild(info);
        row.appendChild(actions);
        self.savedListContainer.appendChild(row);
      })(i);
    }
  };

  window.VerseObs.FreeText = FreeText;
})();
