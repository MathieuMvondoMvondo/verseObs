/* VerseObs - Verse/Text Queue */

(function () {
  "use strict";

  window.VerseObs = window.VerseObs || {};

  var QUEUE_KEY = "verseobs_queue";

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
    this.onChange = opts.onChange || null;
    this._items = [];
    this._currentIndex = -1;
    this._load();
  }

  Queue.prototype._load = function () {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        this._items =
          data && Array.isArray(data.items)
            ? Queue.validateItems(data.items)
            : [];
        this._currentIndex =
          data &&
          Number.isInteger(data.currentIndex) &&
          data.currentIndex >= 0 &&
          data.currentIndex < this._items.length
            ? data.currentIndex
            : this._items.length
              ? 0
              : -1;
      }
    } catch (e) {
      this._items = [];
      this._currentIndex = -1;
    }
  };

  Queue.prototype._save = function () {
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({
          items: this._items,
          currentIndex: this._currentIndex,
        }),
      );
      this._saveFailed = false;
    } catch (e) {
      this._saveFailed = true;
      if (this.onError) this.onError();
    }
  };

  /**
   * Add an item to the queue.
   * @param {object} item - { type: 'verse'|'text', text, html, reference, version, title, subtitle }
   */
  Queue.prototype.add = function (item) {
    if (this._items.length >= 500)
      throw new Error("Le conducteur est limité à 500 éléments.");
    this._items.push(Queue.validateItems([item])[0]);
    if (this._currentIndex < 0) this._currentIndex = 0;
    this._save();
    this.render();
  };

  /**
   * Remove item at index.
   */
  Queue.prototype.remove = function (index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._items.length)
      return;
    this._items.splice(index, 1);
    if (index < this._currentIndex) this._currentIndex--;
    else if (this._currentIndex >= this._items.length)
      this._currentIndex = this._items.length - 1;
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
    } else if (
      fromIndex < this._currentIndex &&
      toIndex >= this._currentIndex
    ) {
      this._currentIndex--;
    } else if (
      fromIndex > this._currentIndex &&
      toIndex <= this._currentIndex
    ) {
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
    if (this._currentIndex < 0 || this._currentIndex >= this._items.length)
      return;
    var item = this._items[this._currentIndex];
    if (typeof this.onShow === "function") {
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
      hasPrev: this._currentIndex > 0,
      saved: !this._saveFailed,
    };
  };

  /**
   * Render the queue list and counter.
   */
  Queue.prototype.render = function () {
    this._renderCounter();
    this._renderList();
    if (this.onChange) this.onChange(this.getState());
  };

  Queue.prototype._renderCounter = function () {
    if (!this.counterEl) return;
    var state = this.getState();
    if (state.total === 0) {
      this.counterEl.textContent = "0 élément";
    } else {
      this.counterEl.textContent =
        state.total + (state.total > 1 ? " éléments" : " élément");
    }
  };

  Queue.prototype._renderList = function () {
    if (!this.container) return;
    var self = this;
    this.container.innerHTML = "";

    if (this._items.length === 0) {
      var empty = document.createElement("div");
      empty.className = "cp-history-empty";
      empty.textContent =
        "Votre prochain temps fort commence ici. Ajoutez des passages depuis la Bible ou des paroles depuis Textes & chants.";
      this.container.appendChild(empty);
      return;
    }

    for (var i = 0; i < this._items.length; i++) {
      (function (idx) {
        var item = self._items[idx];
        var row = document.createElement("div");
        row.className = "cp-queue-item";
        row.tabIndex = 0;
        row.setAttribute(
          "aria-label",
          "Sélectionner " + (item.reference || item.title || "Texte libre"),
        );
        row.setAttribute(
          "aria-current",
          idx === self._currentIndex ? "true" : "false",
        );
        row.addEventListener("keydown", function (e) {
          if (e.target === row && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            self.select(idx);
          }
        });
        if (idx === self._currentIndex) {
          row.classList.add("cp-queue-current");
        }

        // Number
        var numEl = document.createElement("div");
        numEl.className = "cp-queue-num";
        numEl.textContent = String(idx + 1);
        row.appendChild(numEl);

        // Info
        var info = document.createElement("div");
        info.className = "cp-queue-info";

        var titleEl = document.createElement("div");
        titleEl.className = "cp-queue-title";
        if (item.type === "verse") {
          titleEl.textContent = item.reference || "Verset";
        } else {
          titleEl.textContent = item.title || "Texte libre";
        }

        var previewEl = document.createElement("div");
        previewEl.className = "cp-queue-preview";
        previewEl.textContent = item.text || "";

        info.appendChild(titleEl);
        info.appendChild(previewEl);
        row.appendChild(info);

        // Actions
        var actions = document.createElement("div");
        actions.className = "cp-queue-actions";

        // Move up
        if (idx > 0) {
          var upBtn = document.createElement("button");
          upBtn.className = "cp-queue-btn";
          upBtn.innerHTML = "&#9650;";
          upBtn.title = "Monter";
          upBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            self.move(idx, idx - 1);
          });
          actions.appendChild(upBtn);
        }

        // Move down
        if (idx < self._items.length - 1) {
          var downBtn = document.createElement("button");
          downBtn.className = "cp-queue-btn";
          downBtn.innerHTML = "&#9660;";
          downBtn.title = "Descendre";
          downBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            self.move(idx, idx + 1);
          });
          actions.appendChild(downBtn);
        }

        // Delete
        var delBtn = document.createElement("button");
        delBtn.className = "cp-queue-btn cp-queue-del";
        delBtn.innerHTML = "&times;";
        delBtn.title = "Retirer";
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.remove(idx);
        });
        actions.appendChild(delBtn);

        row.appendChild(actions);

        // Click to show
        row.addEventListener("click", function () {
          self.select(idx);
        });

        self.container.appendChild(row);
      })(i);
    }
  };

  Queue.prototype.selectNext = function () {
    if (this.getState().hasNext) this.select(this._currentIndex + 1);
  };
  Queue.prototype.selectPrevious = function () {
    if (this.getState().hasPrev) this.select(this._currentIndex - 1);
  };
  Queue.prototype.select = function (index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._items.length)
      return;
    this._currentIndex = index;
    this._save();
    this.render();
  };
  Queue.prototype.getItems = function () {
    return JSON.parse(JSON.stringify(this._items));
  };
  Queue.prototype.replace = function (items) {
    this._items = Queue.validateItems(items);
    this._currentIndex = this._items.length ? 0 : -1;
    this._save();
    this.render();
  };
  Queue.validateItems = function (items) {
    if (!Array.isArray(items) || items.length > 500)
      throw new Error("Le conducteur doit contenir au maximum 500 éléments.");
    return items.map(function (item) {
      if (
        !item ||
        !["verse", "text"].includes(item.type) ||
        typeof item.text !== "string" ||
        item.text.length > 30000 ||
        (!item.text.trim() &&
          !(typeof item.title === "string" && item.title.trim()))
      )
        throw new Error("Un élément du conducteur est invalide.");
      var clean = { type: item.type, text: item.text };
      ["html", "reference", "version", "title", "subtitle"].forEach(
        function (k) {
          if (
            item[k] != null &&
            (typeof item[k] !== "string" || item[k].length > 100000)
          )
            throw new Error("Le champ " + k + " est invalide.");
          clean[k] =
            k === "html" && window.VerseObs.sanitizeHtml
              ? window.VerseObs.sanitizeHtml(item[k] || "")
              : item[k] || "";
        },
      );
      return clean;
    });
  };
  window.VerseObs.Queue = Queue;
})();
