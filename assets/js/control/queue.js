/* VerseObs - Verse/Text Queue */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var QUEUE_KEY = 'verseobs_queue';

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container - queue list container
   * @param {HTMLElement} opts.counterEl - current/total display
   * @param {Function} opts.onShow - callback(item) to show a queue item
   */
  function Queue(opts) {
    opts = opts || {};
    this.container = opts.container || null;
    this.counterEl = opts.counterEl || null;
    this.onShow = opts.onShow || null;
    this._items = [];
    this._currentIndex = -1;
    this._load();
  }

  Queue.prototype._load = function () {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        this._items = data.items || [];
        this._currentIndex = data.currentIndex || -1;
      }
    } catch (e) {}
  };

  Queue.prototype._save = function () {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify({
        items: this._items,
        currentIndex: this._currentIndex
      }));
    } catch (e) {}
  };

  /**
   * Add an item to the queue.
   * @param {object} item - { type: 'verse'|'text', text, html, reference, version, title, subtitle }
   */
  Queue.prototype.add = function (item) {
    this._items.push(item);
    this._save();
    this.render();
  };

  /**
   * Remove item at index.
   */
  Queue.prototype.remove = function (index) {
    this._items.splice(index, 1);
    if (this._currentIndex >= this._items.length) {
      this._currentIndex = this._items.length - 1;
    }
    if (this._currentIndex >= index && this._currentIndex > 0) {
      this._currentIndex--;
    }
    this._save();
    this.render();
  };

  /**
   * Move item from one position to another.
   */
  Queue.prototype.move = function (fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this._items.length) return;
    if (toIndex < 0 || toIndex >= this._items.length) return;
    var item = this._items.splice(fromIndex, 1)[0];
    this._items.splice(toIndex, 0, item);
    // Update current index
    if (this._currentIndex === fromIndex) {
      this._currentIndex = toIndex;
    } else if (fromIndex < this._currentIndex && toIndex >= this._currentIndex) {
      this._currentIndex--;
    } else if (fromIndex > this._currentIndex && toIndex <= this._currentIndex) {
      this._currentIndex++;
    }
    this._save();
    this.render();
  };

  /**
   * Clear all items.
   */
  Queue.prototype.clear = function () {
    this._items = [];
    this._currentIndex = -1;
    this._save();
    this.render();
  };

  /**
   * Show current item.
   */
  Queue.prototype.showCurrent = function () {
    if (this._currentIndex < 0 || this._currentIndex >= this._items.length) return;
    var item = this._items[this._currentIndex];
    if (typeof this.onShow === 'function') {
      this.onShow(item);
    }
    this.render();
  };

  /**
   * Show next item in queue.
   */
  Queue.prototype.showNext = function () {
    if (this._items.length === 0) return;
    if (this._currentIndex < this._items.length - 1) {
      this._currentIndex++;
    }
    this._save();
    this.showCurrent();
  };

  /**
   * Show previous item in queue.
   */
  Queue.prototype.showPrevious = function () {
    if (this._items.length === 0) return;
    if (this._currentIndex > 0) {
      this._currentIndex--;
    }
    this._save();
    this.showCurrent();
  };

  /**
   * Show item at specific index.
   */
  Queue.prototype.showAt = function (index) {
    if (index < 0 || index >= this._items.length) return;
    this._currentIndex = index;
    this._save();
    this.showCurrent();
  };

  /**
   * Get current state.
   */
  Queue.prototype.getState = function () {
    return {
      total: this._items.length,
      current: this._currentIndex + 1,
      hasNext: this._currentIndex < this._items.length - 1,
      hasPrev: this._currentIndex > 0
    };
  };

  /**
   * Render the queue list and counter.
   */
  Queue.prototype.render = function () {
    this._renderCounter();
    this._renderList();
  };

  Queue.prototype._renderCounter = function () {
    if (!this.counterEl) return;
    var state = this.getState();
    if (state.total === 0) {
      this.counterEl.textContent = 'File vide';
    } else {
      this.counterEl.textContent = state.current + ' / ' + state.total;
    }
  };

  Queue.prototype._renderList = function () {
    if (!this.container) return;
    var self = this;
    this.container.innerHTML = '';

    if (this._items.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cp-history-empty';
      empty.textContent = 'Ajoutez des versets ou textes depuis les autres onglets';
      this.container.appendChild(empty);
      return;
    }

    for (var i = 0; i < this._items.length; i++) {
      (function (idx) {
        var item = self._items[idx];
        var row = document.createElement('div');
        row.className = 'cp-queue-item';
        if (idx === self._currentIndex) {
          row.classList.add('cp-queue-current');
        }

        // Number
        var numEl = document.createElement('div');
        numEl.className = 'cp-queue-num';
        numEl.textContent = String(idx + 1);
        row.appendChild(numEl);

        // Info
        var info = document.createElement('div');
        info.className = 'cp-queue-info';

        var titleEl = document.createElement('div');
        titleEl.className = 'cp-queue-title';
        if (item.type === 'verse') {
          titleEl.textContent = item.reference || 'Verset';
        } else {
          titleEl.textContent = item.title || 'Texte libre';
        }

        var previewEl = document.createElement('div');
        previewEl.className = 'cp-queue-preview';
        previewEl.textContent = (item.text || '').substring(0, 50);

        info.appendChild(titleEl);
        info.appendChild(previewEl);
        row.appendChild(info);

        // Actions
        var actions = document.createElement('div');
        actions.className = 'cp-queue-actions';

        // Move up
        if (idx > 0) {
          var upBtn = document.createElement('button');
          upBtn.className = 'cp-queue-btn';
          upBtn.innerHTML = '&#9650;';
          upBtn.title = 'Monter';
          upBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            self.move(idx, idx - 1);
          });
          actions.appendChild(upBtn);
        }

        // Move down
        if (idx < self._items.length - 1) {
          var downBtn = document.createElement('button');
          downBtn.className = 'cp-queue-btn';
          downBtn.innerHTML = '&#9660;';
          downBtn.title = 'Descendre';
          downBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            self.move(idx, idx + 1);
          });
          actions.appendChild(downBtn);
        }

        // Delete
        var delBtn = document.createElement('button');
        delBtn.className = 'cp-queue-btn cp-queue-del';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Retirer';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.remove(idx);
        });
        actions.appendChild(delBtn);

        row.appendChild(actions);

        // Click to show
        row.addEventListener('click', function () {
          self.showAt(idx);
        });

        self.container.appendChild(row);
      })(i);
    }
  };

  window.VerseObs.Queue = Queue;
})();
