/* VerseObs - Reference Parser & Text Search */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  function Search() {
    this._debounceTimer = null;
  }

  /**
   * Parse a Bible reference string.
   * Examples: "Jean 3:16", "Jn 3:16-18", "1 Cor 13", "Genesis 1:1", "Ps 23"
   * Returns { bookId, chapter, verseStart, verseEnd } or null.
   */
  Search.prototype.parseReference = function (input) {
    if (!input || typeof input !== 'string') return null;

    var str = input.trim();
    if (!str) return null;

    // Pattern: optional number prefix + book name + chapter + optional :verse(-verseEnd)
    // Captures:
    //  1: book part (everything before the last number group)
    //  2: chapter
    //  3: verse start (optional)
    //  4: verse end (optional)
    var match = str.match(/^(.+?)\s+(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/);

    if (!match) {
      // Try just a book name with no chapter (e.g., "Psalms")
      return null;
    }

    var bookPart = match[1].trim();
    var chapter = parseInt(match[2], 10);
    var verseStart = match[3] ? parseInt(match[3], 10) : null;
    var verseEnd = match[4] ? parseInt(match[4], 10) : null;

    // Use findBook from shared books.js
    var bookId = null;
    if (typeof window.VerseObs.findBook === 'function') {
      var book = window.VerseObs.findBook(bookPart);
      if (book) {
        bookId = String(book.id);
      }
    }

    if (!bookId) {
      // Fallback: use the raw book part as ID
      bookId = bookPart.toLowerCase().replace(/\s+/g, '');
    }

    return {
      bookId: bookId,
      chapter: chapter,
      verseStart: verseStart,
      verseEnd: verseEnd
    };
  };

  /**
   * Full-text search across Bible data.
   * Case insensitive, accent insensitive.
   * Returns array of { bookId, bookName, chapter, verse, text } (max 50).
   */
  Search.prototype.searchText = function (query, bibleData) {
    if (!query || !bibleData) return [];

    var normalizedQuery = _normalizeText(query.toLowerCase());
    if (normalizedQuery.length < 2) return [];

    var results = [];
    var books = bibleData.books || bibleData;
    var bookKeys = Object.keys(books);

    for (var b = 0; b < bookKeys.length && results.length < 50; b++) {
      var bookId = bookKeys[b];
      var book = books[bookId];
      var bookName = book.name || bookId;
      var chapters = book.chapters || book;

      // Skip 'name' property if it's not a chapter
      var chapterKeys = Object.keys(chapters);

      for (var c = 0; c < chapterKeys.length && results.length < 50; c++) {
        var chKey = chapterKeys[c];
        if (chKey === 'name' || chKey === 'id') continue;

        var chapterData = chapters[chKey];
        if (typeof chapterData !== 'object') continue;

        var verseKeys = Object.keys(chapterData);
        for (var v = 0; v < verseKeys.length && results.length < 50; v++) {
          var verseText = String(chapterData[verseKeys[v]]);
          var normalizedText = _normalizeText(verseText.toLowerCase());

          if (normalizedText.indexOf(normalizedQuery) !== -1) {
            results.push({
              bookId: bookId,
              bookName: bookName,
              chapter: Number(chKey),
              verse: Number(verseKeys[v]),
              text: verseText,
              reference: bookName + ' ' + chKey + ':' + verseKeys[v]
            });
          }
        }
      }
    }

    return results;
  };

  /**
   * Debounced search: calls callback after 300ms of inactivity.
   */
  Search.prototype.searchDebounced = function (query, bibleData, callback) {
    var self = this;
    if (self._debounceTimer) {
      clearTimeout(self._debounceTimer);
    }
    self._debounceTimer = setTimeout(function () {
      var results = self.searchText(query, bibleData);
      callback(results);
    }, 300);
  };

  /**
   * Normalize text: remove diacritics/accents for comparison.
   */
  function _normalizeText(str) {
    if (typeof str !== 'string') return '';
    // NFD decompose, then strip combining diacritical marks
    if (String.prototype.normalize) {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return str;
  }

  window.VerseObs.Search = Search;
})();
