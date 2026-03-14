/* VerseObs - Bible Data Loader */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var API_BASE = 'https://api.getbible.net/v2/';

  function BibleLoader() {
    this._index = null;
    this._cache = {}; // bibleId -> parsed data
  }

  // ---- Internal fetch helper (fetch with XMLHttpRequest fallback for file://) ----

  BibleLoader.prototype._load = function (url, callback) {
    // Try fetch first
    if (typeof fetch === 'function') {
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          callback(null, data);
        })
        .catch(function (err) {
          // Fallback to XHR (file:// protocol)
          _xhrLoad(url, callback);
        });
    } else {
      _xhrLoad(url, callback);
    }
  };

  function _xhrLoad(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.onload = function () {
      if (xhr.status === 200 || xhr.status === 0) {
        var data = xhr.response;
        // Some browsers return string for file://
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) {
            callback(new Error('Failed to parse JSON'));
            return;
          }
        }
        callback(null, data);
      } else {
        callback(new Error('XHR error: ' + xhr.status));
      }
    };
    xhr.onerror = function () {
      callback(new Error('XHR network error'));
    };
    xhr.send();
  }

  // ---- Public API ----

  /**
   * Load the Bible index from data/bibles/index.json
   * callback(err, index)
   */
  BibleLoader.prototype.loadIndex = function (callback) {
    var self = this;
    if (self._index) {
      callback(null, self._index);
      return;
    }
    self._load('data/bibles/index.json', function (err, data) {
      if (err) {
        callback(err);
        return;
      }
      self._index = data;
      callback(null, data);
    });
  };

  /**
   * Load a specific Bible JSON file.
   * callback(err, bibleData)
   */
  BibleLoader.prototype.loadBible = function (id, callback) {
    var self = this;
    if (self._cache[id]) {
      callback(null, self._cache[id]);
      return;
    }

    // Find entry in index
    var entry = null;
    if (self._index && self._index.bibles) {
      for (var i = 0; i < self._index.bibles.length; i++) {
        if (self._index.bibles[i].id === id) {
          entry = self._index.bibles[i];
          break;
        }
      }
    }

    var file = entry && entry.file ? entry.file : id + '.json';
    var url = 'data/bibles/' + file;

    self._load(url, function (err, data) {
      if (err) {
        callback(err);
        return;
      }
      // Normalize array-based format to indexed object for fast lookup
      var normalized = _normalize(data);
      self._cache[id] = normalized;
      callback(null, normalized);
    });
  };

  /**
   * Get a specific verse.
   * Returns { text, reference } or null.
   */
  BibleLoader.prototype.getVerse = function (bibleId, bookId, chapter, verse) {
    var bible = this._cache[bibleId];
    if (!bible) return null;

    var books = bible.books || bible;
    var book = books[bookId];
    if (!book) return null;

    var chapterData = book.chapters ? book.chapters[String(chapter)] : book[String(chapter)];
    if (!chapterData) return null;

    var verseText = chapterData[String(verse)];
    if (verseText === undefined || verseText === null) return null;

    // Build reference string
    var bookName = bookId;
    if (book.name) bookName = book.name;

    return {
      text: String(verseText),
      book: bookName,
      bookId: bookId,
      chapter: Number(chapter),
      verse: Number(verse),
      reference: bookName + ' ' + chapter + ':' + verse
    };
  };

  /**
   * Get all verses in a chapter.
   * Returns array of { verse, text } or null.
   */
  BibleLoader.prototype.getChapter = function (bibleId, bookId, chapter) {
    var bible = this._cache[bibleId];
    if (!bible) return null;

    var books = bible.books || bible;
    var book = books[bookId];
    if (!book) return null;

    var chapterData = book.chapters ? book.chapters[String(chapter)] : book[String(chapter)];
    if (!chapterData) return null;

    var result = [];
    var keys = Object.keys(chapterData);
    // Sort numerically
    keys.sort(function (a, b) { return Number(a) - Number(b); });
    for (var i = 0; i < keys.length; i++) {
      result.push({
        verse: Number(keys[i]),
        text: String(chapterData[keys[i]])
      });
    }
    return result;
  };

  /**
   * Get list of books for a loaded Bible.
   * Returns array of { id, name } or null.
   */
  BibleLoader.prototype.getBookList = function (bibleId) {
    var bible = this._cache[bibleId];
    if (!bible) return null;

    var books = bible.books || bible;
    var list = [];
    var keys = Object.keys(books);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var book = books[key];
      list.push({
        id: key,
        name: book.name || key
      });
    }
    return list;
  };

  /**
   * Fetch verse from online API (api.getbible.net).
   * callback(err, { text, reference })
   */
  BibleLoader.prototype.fetchFromAPI = function (version, book, chapter, verse, callback) {
    var cacheKey = version + ':' + book + ':' + chapter + ':' + verse;
    var lsKey = window.VerseObs.API_CACHE_KEY || 'verseobs_api_cache';

    // Check localStorage cache
    try {
      var cached = localStorage.getItem(lsKey);
      if (cached) {
        var cacheObj = JSON.parse(cached);
        if (cacheObj[cacheKey]) {
          callback(null, cacheObj[cacheKey]);
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    var url = API_BASE + version + '/' + book + '/' + chapter + '/' + verse;

    // API requires real HTTP, no file:// fallback
    if (typeof fetch !== 'function') {
      callback(new Error('API requires fetch (online mode)'));
      return;
    }

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('API error: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // api.getbible.net v2 returns verses array
        var text = '';
        var ref = book + ' ' + chapter + ':' + verse;

        if (data.verses && data.verses.length > 0) {
          var parts = [];
          for (var i = 0; i < data.verses.length; i++) {
            parts.push(data.verses[i].text);
          }
          text = parts.join(' ').trim();
        } else if (data.text) {
          text = data.text;
        }

        var result = {
          text: text,
          reference: ref,
          book: book,
          chapter: Number(chapter),
          verse: Number(verse)
        };

        // Save to localStorage cache
        try {
          var raw = localStorage.getItem(lsKey);
          var cacheObj = raw ? JSON.parse(raw) : {};
          cacheObj[cacheKey] = result;
          localStorage.setItem(lsKey, JSON.stringify(cacheObj));
        } catch (e) {
          // ignore
        }

        callback(null, result);
      })
      .catch(function (err) {
        callback(err);
      });
  };

  /**
   * Normalize Bible data from array format to indexed object format.
   * Input:  { meta: {...}, books: [ { id: 1, name: "Genèse", chapters: [ { chapter: 1, verses: [ { verse: 1, text: "..." } ] } ] } ] }
   * Output: { books: { "1": { name: "Genèse", id: "1", chapters: { "1": { "1": "text..." } } } } }
   */
  function _normalize(data) {
    if (!data) return data;

    // If already in indexed format (books is an object), return as-is
    if (data.books && !Array.isArray(data.books)) {
      return data;
    }

    // If books is an array, convert to indexed format
    if (data.books && Array.isArray(data.books)) {
      var indexed = { meta: data.meta || {}, books: {} };
      var lang = (data.meta && data.meta.lang) || 'fr';

      for (var b = 0; b < data.books.length; b++) {
        var book = data.books[b];
        var bookId = String(book.id);
        var bookName = book.name || window.VerseObs.getBookName(Number(bookId), lang) || bookId;

        indexed.books[bookId] = { name: bookName, id: bookId, chapters: {} };

        if (Array.isArray(book.chapters)) {
          for (var c = 0; c < book.chapters.length; c++) {
            var ch = book.chapters[c];
            var chNum = String(ch.chapter);
            indexed.books[bookId].chapters[chNum] = {};

            if (Array.isArray(ch.verses)) {
              for (var v = 0; v < ch.verses.length; v++) {
                var vs = ch.verses[v];
                indexed.books[bookId].chapters[chNum][String(vs.verse)] = vs.text;
              }
            }
          }
        }
      }
      return indexed;
    }

    return data;
  }

  window.VerseObs.BibleLoader = BibleLoader;
})();
