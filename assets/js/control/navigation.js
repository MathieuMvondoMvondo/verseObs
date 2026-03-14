/* VerseObs - Dropdown Navigation */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  /**
   * @param {object} opts
   * @param {HTMLSelectElement} opts.bookSelect
   * @param {HTMLSelectElement} opts.chapterSelect
   * @param {HTMLSelectElement} opts.verseSelect
   * @param {Function} opts.onSelectionChange - called with { bookId, chapter, verse }
   */
  function Navigation(opts) {
    opts = opts || {};
    this.bookSelect = opts.bookSelect || null;
    this.chapterSelect = opts.chapterSelect || null;
    this.verseSelect = opts.verseSelect || null;
    this.onSelectionChange = opts.onSelectionChange || null;

    this._bibleData = null;
    this._bookList = [];

    this._bindEvents();
  }

  Navigation.prototype._bindEvents = function () {
    var self = this;

    if (self.bookSelect) {
      self.bookSelect.addEventListener('change', function () {
        var bookId = self.bookSelect.value;
        self.populateChapters(bookId);
        self._fireChange();
      });
    }

    if (self.chapterSelect) {
      self.chapterSelect.addEventListener('change', function () {
        var bookId = self.bookSelect ? self.bookSelect.value : '';
        var chapter = self.chapterSelect.value;
        self.populateVerses(bookId, chapter);
        self._fireChange();
      });
    }

    if (self.verseSelect) {
      self.verseSelect.addEventListener('change', function () {
        self._fireChange();
      });
    }
  };

  Navigation.prototype._fireChange = function () {
    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange(this.getSelection());
    }
  };

  /**
   * Get current dropdown selection.
   */
  Navigation.prototype.getSelection = function () {
    return {
      bookId: this.bookSelect ? this.bookSelect.value : '',
      chapter: this.chapterSelect ? Number(this.chapterSelect.value) || 1 : 1,
      verse: this.verseSelect ? Number(this.verseSelect.value) || 1 : 1
    };
  };

  /**
   * Set Bible data and populate books.
   */
  Navigation.prototype.populateBooks = function (bibleData) {
    this._bibleData = bibleData;
    if (!this.bookSelect) return;

    var books = bibleData.books || bibleData;
    var keys = Object.keys(books);
    this._bookList = [];

    // Clear
    this.bookSelect.innerHTML = '';

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var book = books[key];
      if (typeof book !== 'object') continue;

      var name = book.name || key;
      this._bookList.push({ id: key, name: name });

      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      this.bookSelect.appendChild(opt);
    }

    // Populate chapters for first book
    if (keys.length > 0) {
      this.populateChapters(keys[0]);
    }
  };

  /**
   * Populate chapter dropdown for selected book.
   */
  Navigation.prototype.populateChapters = function (bookId) {
    if (!this.chapterSelect || !this._bibleData) return;

    var books = this._bibleData.books || this._bibleData;
    var book = books[bookId];
    if (!book) return;

    var chapters = book.chapters || book;
    var keys = Object.keys(chapters).filter(function (k) {
      return k !== 'name' && k !== 'id';
    });
    keys.sort(function (a, b) { return Number(a) - Number(b); });

    this.chapterSelect.innerHTML = '';
    for (var i = 0; i < keys.length; i++) {
      var opt = document.createElement('option');
      opt.value = keys[i];
      opt.textContent = keys[i];
      this.chapterSelect.appendChild(opt);
    }

    // Populate verses for first chapter
    if (keys.length > 0) {
      this.populateVerses(bookId, keys[0]);
    }
  };

  /**
   * Populate verse dropdown for selected book/chapter.
   */
  Navigation.prototype.populateVerses = function (bookId, chapter) {
    if (!this.verseSelect || !this._bibleData) return;

    var books = this._bibleData.books || this._bibleData;
    var book = books[bookId];
    if (!book) return;

    var chapters = book.chapters || book;
    var chapterData = chapters[String(chapter)];
    if (!chapterData || typeof chapterData !== 'object') return;

    var keys = Object.keys(chapterData);
    keys.sort(function (a, b) { return Number(a) - Number(b); });

    this.verseSelect.innerHTML = '';
    for (var i = 0; i < keys.length; i++) {
      var opt = document.createElement('option');
      opt.value = keys[i];
      opt.textContent = keys[i];
      this.verseSelect.appendChild(opt);
    }
  };

  /**
   * Set selection programmatically.
   */
  Navigation.prototype.setSelection = function (bookId, chapter, verse) {
    if (this.bookSelect && bookId) {
      this.bookSelect.value = bookId;
      this.populateChapters(bookId);
    }
    if (this.chapterSelect && chapter) {
      this.chapterSelect.value = String(chapter);
      this.populateVerses(bookId || this.bookSelect.value, chapter);
    }
    if (this.verseSelect && verse) {
      this.verseSelect.value = String(verse);
    }
  };

  /**
   * Navigate to next verse.
   */
  Navigation.prototype.goToNext = function () {
    if (!this.verseSelect) return;

    var idx = this.verseSelect.selectedIndex;
    if (idx < this.verseSelect.options.length - 1) {
      this.verseSelect.selectedIndex = idx + 1;
      this._fireChange();
    } else {
      // Next chapter
      this.goToNextChapter();
    }
  };

  /**
   * Navigate to previous verse.
   */
  Navigation.prototype.goToPrevious = function () {
    if (!this.verseSelect) return;

    var idx = this.verseSelect.selectedIndex;
    if (idx > 0) {
      this.verseSelect.selectedIndex = idx - 1;
      this._fireChange();
    } else {
      // Previous chapter, last verse
      this._goToPreviousChapterLastVerse();
    }
  };

  /**
   * Navigate to next chapter (first verse).
   */
  Navigation.prototype.goToNextChapter = function () {
    if (!this.chapterSelect) return;

    var idx = this.chapterSelect.selectedIndex;
    if (idx < this.chapterSelect.options.length - 1) {
      this.chapterSelect.selectedIndex = idx + 1;
      var bookId = this.bookSelect ? this.bookSelect.value : '';
      this.populateVerses(bookId, this.chapterSelect.value);
      if (this.verseSelect) this.verseSelect.selectedIndex = 0;
      this._fireChange();
    } else {
      // Next book
      if (this.bookSelect) {
        var bIdx = this.bookSelect.selectedIndex;
        if (bIdx < this.bookSelect.options.length - 1) {
          this.bookSelect.selectedIndex = bIdx + 1;
          this.populateChapters(this.bookSelect.value);
          if (this.verseSelect) this.verseSelect.selectedIndex = 0;
          this._fireChange();
        }
      }
    }
  };

  /**
   * Navigate to previous chapter (first verse).
   */
  Navigation.prototype.goToPreviousChapter = function () {
    if (!this.chapterSelect) return;

    var idx = this.chapterSelect.selectedIndex;
    if (idx > 0) {
      this.chapterSelect.selectedIndex = idx - 1;
      var bookId = this.bookSelect ? this.bookSelect.value : '';
      this.populateVerses(bookId, this.chapterSelect.value);
      if (this.verseSelect) this.verseSelect.selectedIndex = 0;
      this._fireChange();
    } else {
      // Previous book, last chapter
      if (this.bookSelect) {
        var bIdx = this.bookSelect.selectedIndex;
        if (bIdx > 0) {
          this.bookSelect.selectedIndex = bIdx - 1;
          this.populateChapters(this.bookSelect.value);
          if (this.chapterSelect) {
            this.chapterSelect.selectedIndex = this.chapterSelect.options.length - 1;
            this.populateVerses(this.bookSelect.value, this.chapterSelect.value);
          }
          if (this.verseSelect) this.verseSelect.selectedIndex = 0;
          this._fireChange();
        }
      }
    }
  };

  /**
   * Go to previous chapter's last verse.
   */
  Navigation.prototype._goToPreviousChapterLastVerse = function () {
    if (!this.chapterSelect) return;

    var idx = this.chapterSelect.selectedIndex;
    if (idx > 0) {
      this.chapterSelect.selectedIndex = idx - 1;
      var bookId = this.bookSelect ? this.bookSelect.value : '';
      this.populateVerses(bookId, this.chapterSelect.value);
      if (this.verseSelect) {
        this.verseSelect.selectedIndex = this.verseSelect.options.length - 1;
      }
      this._fireChange();
    } else {
      // Previous book, last chapter, last verse
      if (this.bookSelect) {
        var bIdx = this.bookSelect.selectedIndex;
        if (bIdx > 0) {
          this.bookSelect.selectedIndex = bIdx - 1;
          this.populateChapters(this.bookSelect.value);
          if (this.chapterSelect) {
            this.chapterSelect.selectedIndex = this.chapterSelect.options.length - 1;
            this.populateVerses(this.bookSelect.value, this.chapterSelect.value);
          }
          if (this.verseSelect) {
            this.verseSelect.selectedIndex = this.verseSelect.options.length - 1;
          }
          this._fireChange();
        }
      }
    }
  };

  window.VerseObs.Navigation = Navigation;
})();
