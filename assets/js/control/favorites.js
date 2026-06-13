/* VerseObs - Favorite Verses */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var FAV_KEY = 'verseobs_favorites';
  var FAV_MAX = 30;

  function Favorites() {
    this._items = [];
    this.onShow = null;   // callback(item)
    this.onChange = null; // callback() — fired when the set changes
    this._load();
  }

  Favorites.prototype._load = function () {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      this._items = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      this._items = [];
    }
  };

  Favorites.prototype._save = function () {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(this._items));
    } catch (e) {}
  };

  /**
   * Stable identity for a verse favorite.
   */
  function _key(item) {
    if (!item) return '';
    return [item.bookId, item.chapter, item.verse].join(':');
  }

  Favorites.prototype.has = function (item) {
    var k = _key(item);
    return this._items.some(function (f) { return _key(f) === k; });
  };

  /**
   * Toggle a verse in/out of favorites. Returns true if now a favorite.
   */
  Favorites.prototype.toggle = function (item) {
    if (!item) return false;
    var k = _key(item);
    var idx = -1;
    for (var i = 0; i < this._items.length; i++) {
      if (_key(this._items[i]) === k) { idx = i; break; }
    }
    var nowFav;
    if (idx >= 0) {
      this._items.splice(idx, 1);
      nowFav = false;
    } else {
      this._items.unshift({
        reference: item.reference || '',
        text: item.text || '',
        version: item.version || '',
        bookId: item.bookId,
        chapter: item.chapter,
        verse: item.verse
      });
      if (this._items.length > FAV_MAX) this._items = this._items.slice(0, FAV_MAX);
      nowFav = true;
    }
    this._save();
    if (typeof this.onChange === 'function') this.onChange();
    return nowFav;
  };

  Favorites.prototype.remove = function (index) {
    this._items.splice(index, 1);
    this._save();
    if (typeof this.onChange === 'function') this.onChange();
  };

  Favorites.prototype.getAll = function () {
    return this._items.slice();
  };

  /**
   * Render favorites as clickable chips. Click shows the verse; the × removes it.
   */
  Favorites.prototype.render = function (container) {
    if (!container) return;
    var self = this;
    container.innerHTML = '';

    if (this._items.length === 0) {
      container.classList.remove('has-items');
      return;
    }
    container.classList.add('has-items');

    for (var i = 0; i < this._items.length; i++) {
      (function (idx) {
        var item = self._items[idx];
        var chip = document.createElement('div');
        chip.className = 'cp-fav-chip';
        chip.title = item.text || '';

        var label = document.createElement('button');
        label.className = 'cp-fav-chip-label';
        label.type = 'button';
        label.textContent = item.reference || '?';
        label.setAttribute('aria-label', 'Afficher ' + (item.reference || ''));
        label.addEventListener('click', function () {
          if (typeof self.onShow === 'function') self.onShow(item);
        });

        var del = document.createElement('button');
        del.className = 'cp-fav-chip-del';
        del.type = 'button';
        del.innerHTML = '&times;';
        del.title = 'Retirer des favoris';
        del.setAttribute('aria-label', 'Retirer ' + (item.reference || '') + ' des favoris');
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          self.remove(idx);
        });

        chip.appendChild(label);
        chip.appendChild(del);
        container.appendChild(chip);
      })(i);
    }
  };

  window.VerseObs.Favorites = Favorites;
})();
