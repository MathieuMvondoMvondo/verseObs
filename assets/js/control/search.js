/* VerseObs - Reference Parser & Text Search */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var MAX_RESULTS = 100;

  // Accent variants per base letter, used to build accent-insensitive
  // highlight regexes against the *original* (un-normalized) verse text.
  var ACCENT_MAP = {
    a: 'aàáâäãå',
    c: 'cç',
    e: 'eéèêëē',
    i: 'iïîíìį',
    n: 'nñ',
    o: 'oôöóòõ',
    u: 'uùûüú',
    y: 'yÿý'
  };

  function Search() {
    this._debounceTimer = null;
    this._terms = [];      // last query's normalized terms (for highlighting)
    this.lastTotal = 0;    // total matches before MAX_RESULTS cap
  }

  // Per-Bible cache of a flat, pre-normalized verse index. Keyed by the bible
  // data object so switching versions reuses each one's index instead of
  // re-normalizing ~31k verses on every keystroke.
  var _indexCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  var _fallbackIndex = null;
  var _fallbackData = null;

  /**
   * Build (or fetch from cache) a flat index of every verse:
   * [{ bookId, bookName, chapter, verse, text, normalized, reference }]
   */
  function _getIndex(bibleData) {
    if (_indexCache && _indexCache.has(bibleData)) return _indexCache.get(bibleData);
    if (!_indexCache && _fallbackData === bibleData) return _fallbackIndex;

    var index = [];
    var books = bibleData.books || bibleData;
    var bookKeys = Object.keys(books);

    for (var b = 0; b < bookKeys.length; b++) {
      var bookId = bookKeys[b];
      var book = books[bookId];
      if (!book || typeof book !== 'object') continue;

      var bookName = book.name || bookId;
      var chapters = book.chapters || book;
      var chapterKeys = Object.keys(chapters);

      for (var c = 0; c < chapterKeys.length; c++) {
        var chKey = chapterKeys[c];
        if (chKey === 'name' || chKey === 'id') continue;

        var chapterData = chapters[chKey];
        if (typeof chapterData !== 'object') continue;

        var verseKeys = Object.keys(chapterData);
        for (var v = 0; v < verseKeys.length; v++) {
          var verseText = String(chapterData[verseKeys[v]]);
          index.push({
            bookId: bookId,
            bookName: bookName,
            chapter: Number(chKey),
            verse: Number(verseKeys[v]),
            text: verseText,
            normalized: _normalize(verseText),
            reference: bookName + ' ' + chKey + ':' + verseKeys[v]
          });
        }
      }
    }

    if (_indexCache) {
      _indexCache.set(bibleData, index);
    } else {
      _fallbackData = bibleData;
      _fallbackIndex = index;
    }
    return index;
  }

  // Per-Bible vocabulary (unique normalized words ≥ 3 chars) for fuzzy fallback.
  var _vocabCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  var _vocabFallback = null;
  var _vocabFallbackData = null;

  function _getVocab(bibleData) {
    if (_vocabCache && _vocabCache.has(bibleData)) return _vocabCache.get(bibleData);
    if (!_vocabCache && _vocabFallbackData === bibleData) return _vocabFallback;

    var index = _getIndex(bibleData);
    var seen = {};
    var words = [];
    for (var i = 0; i < index.length; i++) {
      var parts = index[i].normalized.split(' ');
      for (var j = 0; j < parts.length; j++) {
        var w = parts[j];
        if (w.length >= 3 && !seen[w]) {
          seen[w] = true;
          words.push(w);
        }
      }
    }

    if (_vocabCache) {
      _vocabCache.set(bibleData, words);
    } else {
      _vocabFallbackData = bibleData;
      _vocabFallback = words;
    }
    return words;
  }

  /**
   * True if the Levenshtein distance between a and b is ≤ 1 (bounded, fast).
   */
  function _within1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    if (la > lb) { var t = a; a = b; b = t; var tl = la; la = lb; lb = tl; }
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; }
      else {
        edits++;
        if (edits > 1) return false;
        if (la === lb) { i++; j++; } // substitution
        else { j++; }                // insertion in the longer word
      }
    }
    edits += (la - i) + (lb - j);
    return edits <= 1;
  }

  /**
   * Fuzzy fallback: for each query term (≥4 chars) find close vocabulary words
   * (edit distance ≤ 1) and accept verses where every term has a close match.
   */
  function _fuzzySearch(parsed, bibleData) {
    var terms = parsed.terms;
    var vocab = _getVocab(bibleData);

    // Build accepted variant lists per term. Bail out if a term is too short
    // or is a multi-word phrase (fuzzy on phrases is too noisy).
    var variantSets = [];
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      if (term.indexOf(' ') !== -1 || term.length < 4) return { results: [], variants: [] };
      var variants = [term];
      for (var v = 0; v < vocab.length; v++) {
        var word = vocab[v];
        if (word !== term && Math.abs(word.length - term.length) <= 1 && _within1(term, word)) {
          variants.push(word);
          if (variants.length >= 8) break;
        }
      }
      if (variants.length === 1) return { results: [], variants: [] }; // no near matches
      variantSets.push(variants);
    }

    var index = _getIndex(bibleData);
    var results = [];
    for (var i = 0; i < index.length; i++) {
      var norm = index[i].normalized;
      var ok = true;
      var score = 0;
      for (var s = 0; s < variantSets.length; s++) {
        var matched = false;
        var set = variantSets[s];
        for (var k = 0; k < set.length; k++) {
          if (norm.indexOf(set[k]) !== -1) { matched = true; score += (set[k] === terms[s] ? 3 : 1); break; }
        }
        if (!matched) { ok = false; break; }
      }
      if (ok) {
        var e = index[i];
        results.push({
          bookId: e.bookId, bookName: e.bookName, chapter: e.chapter,
          verse: e.verse, text: e.text, reference: e.reference, score: score
        });
      }
    }

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.bookId !== b.bookId) return Number(a.bookId) - Number(b.bookId);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    // Flatten the variant words so the UI can highlight the fuzzy matches.
    var allVariants = [];
    for (var x = 0; x < variantSets.length; x++) {
      for (var y = 0; y < variantSets[x].length; y++) allVariants.push(variantSets[x][y]);
    }
    return { results: results, variants: allVariants };
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

    // Pattern: book name + chapter + optional :verse(-verseEnd)
    var match = str.match(/^(.+?)\s+(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
    if (!match) return null;

    var bookPart = match[1].trim();
    var chapter = parseInt(match[2], 10);
    var verseStart = match[3] ? parseInt(match[3], 10) : null;
    var verseEnd = match[4] ? parseInt(match[4], 10) : null;

    // Resolve the book name via shared books.js. If it is not a known book,
    // treat the input as free text (return null) rather than a bogus ref.
    var bookId = null;
    if (typeof window.VerseObs.findBook === 'function') {
      var book = window.VerseObs.findBook(bookPart);
      if (book) bookId = String(book.id);
    }
    if (!bookId) return null;

    return {
      bookId: bookId,
      chapter: chapter,
      verseStart: verseStart,
      verseEnd: verseEnd
    };
  };

  /**
   * Full-text search across Bible data.
   *
   * Improvements over a plain substring match:
   *  - Multi-word queries match when ALL words appear (any order, anywhere).
   *  - Quoted "exact phrase" forces a contiguous match.
   *  - Accent / apostrophe / ligature insensitive.
   *  - Results are scored by relevance and the WHOLE Bible is scanned
   *    (not cut off at the first 50 in Genesis order).
   *
   * Returns array of { bookId, bookName, chapter, verse, text, reference, score }
   * sorted by relevance (max MAX_RESULTS). Total match count is on this.lastTotal.
   */
  Search.prototype.searchText = function (query, bibleData) {
    this.lastTotal = 0;
    if (!query || !bibleData) {
      this._terms = [];
      return [];
    }

    var parsed = _parseQuery(query);
    this._terms = parsed.terms;

    if (parsed.terms.length === 0) return [];
    // Require at least 2 characters of meaningful signal.
    if (parsed.normalized.replace(/\s/g, '').length < 2) return [];

    var results = [];
    var index = _getIndex(bibleData);

    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      var score = _scoreVerse(entry.normalized, parsed);
      if (score > 0) {
        results.push({
          bookId: entry.bookId,
          bookName: entry.bookName,
          chapter: entry.chapter,
          verse: entry.verse,
          text: entry.text,
          reference: entry.reference,
          score: score
        });
      }
    }

    // Highest score first; canonical order (book/chapter/verse) breaks ties.
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.bookId !== b.bookId) return Number(a.bookId) - Number(b.bookId);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    this.lastFuzzy = false;

    // Fuzzy fallback only when an exact search finds nothing — keeps clean
    // queries noise-free, but rescues typos like "comandement".
    if (results.length === 0) {
      var fuzzy = _fuzzySearch(parsed, bibleData);
      if (fuzzy.results.length > 0) {
        this._terms = fuzzy.variants;   // highlight the close matches
        this.lastFuzzy = true;
        this.lastTotal = fuzzy.results.length;
        return fuzzy.results.slice(0, MAX_RESULTS);
      }
    }

    this.lastTotal = results.length;
    return results.slice(0, MAX_RESULTS);
  };

  /**
   * Debounced search: calls callback after 250ms of inactivity.
   * callback receives (results, totalCount).
   */
  Search.prototype.searchDebounced = function (query, bibleData, callback) {
    var self = this;
    if (self._debounceTimer) clearTimeout(self._debounceTimer);
    self._debounceTimer = setTimeout(function () {
      var results = self.searchText(query, bibleData);
      callback(results, self.lastTotal);
    }, 250);
  };

  /**
   * Return HTML for `text` with the current query's terms wrapped in <mark>.
   * The input text is HTML-escaped first, so the result is safe to inject.
   */
  Search.prototype.highlight = function (text) {
    var escaped = _escapeHtml(String(text));
    var terms = this._terms || [];
    if (terms.length === 0) return escaped;

    // Build a single alternation regex (longest terms first so multi-word
    // phrases win over their sub-words). One pass = no nested <mark> tags.
    var ordered = terms.slice().sort(function (a, b) {
      return b.length - a.length;
    });

    var parts = [];
    for (var i = 0; i < ordered.length; i++) {
      var p = _termPattern(ordered[i]);
      if (p) parts.push(p);
    }
    if (parts.length === 0) return escaped;

    var re;
    try {
      re = new RegExp('(' + parts.join('|') + ')', 'gi');
    } catch (e) {
      return escaped;
    }

    return escaped.replace(re, function (m) {
      return '<mark class="cp-hl">' + m + '</mark>';
    });
  };

  // ---- Internals ----

  /**
   * Parse a raw query into { normalized, terms }.
   * Supports "quoted phrases"; everything else is split into word terms.
   */
  function _parseQuery(query) {
    var terms = [];
    var seen = {};

    // Extract quoted phrases first.
    var remaining = String(query).replace(/"([^"]+)"/g, function (_, phrase) {
      var norm = _normalize(phrase);
      if (norm && !seen[norm]) {
        seen[norm] = true;
        terms.push(norm);
      }
      return ' ';
    });

    var normalizedRest = _normalize(remaining);
    if (normalizedRest) {
      var words = normalizedRest.split(' ');
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (w && !seen[w]) {
          seen[w] = true;
          terms.push(w);
        }
      }
    }

    return {
      normalized: _normalize(String(query).replace(/"/g, ' ')),
      terms: terms
    };
  }

  /**
   * Score a normalized verse against a parsed query.
   * Returns 0 when not all terms are present (AND semantics).
   */
  function _scoreVerse(normalizedText, parsed) {
    var terms = parsed.terms;
    var total = 0;

    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var idx = normalizedText.indexOf(term);
      if (idx === -1) return 0; // every term is required

      var occurrences = 0;
      var from = idx;
      while (from !== -1) {
        occurrences++;
        from = normalizedText.indexOf(term, from + term.length);
      }

      // Base: each occurrence counts; multi-word phrases weigh more.
      var wordCount = term.split(' ').length;
      total += occurrences * (2 + wordCount);

      // Whole-word bonus (term bounded by non-letters/digits).
      if (_hasWholeWord(normalizedText, term)) total += 5;

      // Earlier matches feel more on-topic.
      if (idx < 40) total += 2;
    }

    // Full multi-term phrase appearing verbatim is a strong signal.
    if (terms.length > 1 && normalizedText.indexOf(parsed.normalized) !== -1) {
      total += 10;
    }

    // Slight preference for shorter, more focused verses.
    total += Math.max(0, 4 - Math.floor(normalizedText.length / 120));

    return total;
  }

  function _hasWholeWord(haystack, term) {
    var re = new RegExp('(^|[^a-z0-9])' + _escapeRegex(term) + '([^a-z0-9]|$)');
    return re.test(haystack);
  }

  /**
   * Normalize text for comparison:
   *  - lowercase
   *  - strip diacritics (NFD)
   *  - expand ligatures (oe / ae)
   *  - collapse anything non-alphanumeric (incl. apostrophes) to a space
   */
  function _normalize(str) {
    if (typeof str !== 'string') return '';
    var s = str.toLowerCase();
    if (String.prototype.normalize) {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    s = s.replace(/œ/g, 'oe').replace(/æ/g, 'ae');
    s = s.replace(/[^a-z0-9]+/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Build an accent-insensitive regex *source* for a normalized term, to be
   * matched inside the original verse text (accents/apostrophes still present).
   */
  function _termPattern(term) {
    if (!term) return '';
    var pat = '';
    for (var i = 0; i < term.length; i++) {
      var ch = term[i];
      if (ch === ' ') {
        // Allow whitespace, apostrophes and hyphens between phrase words.
        pat += "[\\s'’ʼ\\-]+";
      } else if (ACCENT_MAP[ch]) {
        var variants = ACCENT_MAP[ch];
        pat += '[' + variants + variants.toUpperCase() + ']';
      } else {
        pat += _escapeRegex(ch);
      }
    }
    return pat;
  }

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.VerseObs.Search = Search;
})();
