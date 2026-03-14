/* VerseObs - Verse History */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var HISTORY_KEY = window.VerseObs.HISTORY_KEY || 'verseobs_history';
  var HISTORY_MAX = window.VerseObs.HISTORY_MAX || 50;

  function History() {
    this._entries = [];
    this.onClick = null; // callback(entry)
    this._load();
  }

  /**
   * Load history from localStorage.
   */
  History.prototype._load = function () {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        this._entries = JSON.parse(raw);
        if (!Array.isArray(this._entries)) this._entries = [];
      }
    } catch (e) {
      this._entries = [];
    }
  };

  /**
   * Save history to localStorage.
   */
  History.prototype._save = function () {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this._entries));
    } catch (e) {
      // ignore
    }
  };

  /**
   * Add an entry to history.
   * @param {object} entry - { reference, text, version, timestamp }
   */
  History.prototype.add = function (entry) {
    if (!entry || !entry.reference) return;

    var item = {
      reference: entry.reference,
      text: entry.text || '',
      version: entry.version || '',
      timestamp: entry.timestamp || Date.now()
    };

    // Add to front
    this._entries.unshift(item);

    // Limit size
    if (this._entries.length > HISTORY_MAX) {
      this._entries = this._entries.slice(0, HISTORY_MAX);
    }

    this._save();
  };

  /**
   * Return all history entries.
   */
  History.prototype.getAll = function () {
    return this._entries.slice();
  };

  /**
   * Clear all history.
   */
  History.prototype.clear = function () {
    this._entries = [];
    this._save();
  };

  /**
   * Render history as a clickable list into a container element.
   */
  History.prototype.renderList = function (container) {
    if (!container) return;

    container.innerHTML = '';

    if (this._entries.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cp-history-empty';
      empty.textContent = 'No history yet';
      container.appendChild(empty);
      return;
    }

    var list = document.createElement('ul');
    list.className = 'cp-history-list';
    var self = this;

    for (var i = 0; i < this._entries.length; i++) {
      (function (entry, index) {
        var li = document.createElement('li');
        li.className = 'cp-history-item';

        var ref = document.createElement('div');
        ref.className = 'cp-history-ref';
        ref.textContent = entry.reference;

        var preview = document.createElement('div');
        preview.className = 'cp-history-preview';
        var previewText = entry.text || '';
        if (previewText.length > 80) previewText = previewText.substring(0, 80) + '...';
        preview.textContent = previewText;

        var meta = document.createElement('div');
        meta.className = 'cp-history-meta';

        var version = document.createElement('span');
        version.textContent = entry.version || '';

        var time = document.createElement('span');
        time.textContent = _formatTime(entry.timestamp);

        meta.appendChild(version);
        meta.appendChild(time);

        li.appendChild(ref);
        li.appendChild(preview);
        li.appendChild(meta);

        li.addEventListener('click', function () {
          if (typeof self.onClick === 'function') {
            self.onClick(entry);
          }
        });

        list.appendChild(li);
      })(this._entries[i], i);
    }

    container.appendChild(list);
  };

  /**
   * Format timestamp for display.
   */
  function _formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return diffMin + 'm ago';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    var diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return diffDay + 'd ago';

    // Full date
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + month + '-' + day;
  }

  window.VerseObs.History = History;
})();
