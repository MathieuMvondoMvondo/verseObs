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

  // ---- Bible references: one grammar for the search box and pasted plans ----

  var SP = '[\\x20\\t\\u00a0\\u202f]';
  var NUM = '([1-9]\\d{0,2})(?!\\d)';
  var PLAN_MAX_REFERENCES = 200;
  var PLAN_MAX_LENGTH = 20000;
  var TIER_STRONG = 0, TIER_NAME = 1, TIER_CAPITAL = 2;
  var WORD_CHAR = /[A-Za-z0-9\u00C0-\u024F]/;
  var FOLDED_WORD = /[a-z0-9\u00e0-\u024f]/;
  // Abdias, Philémon, 2 Jean, 3 Jean, Jude: "Jude 24" is verse 24.
  var SINGLE_CHAPTER = { 31: true, 57: true, 63: true, 64: true, 65: true };

  function _sticky(source) { return new RegExp(source, 'y'); }
  function _at(re, s, i) { re.lastIndex = i; return re.exec(s); }

  var R_CHAPTER = _sticky(NUM);
  var R_COLON = _sticky(SP + '*:' + SP + '*' + NUM);
  var R_DOT = _sticky('\\.' + NUM);
  var R_DOT_LOOSE = _sticky(SP + '*\\.' + SP + '*' + NUM);
  var R_COMMA = _sticky(',' + SP + '?' + NUM);
  var R_COMMA_LOOSE = _sticky(SP + '*,' + SP + '*' + NUM);
  var R_VERSE_WORD = _sticky(SP + '*,?' + SP + '*(?:versets?|vv?)(?![a-z])\\.?' + SP + '*' + NUM);
  var R_DASH = _sticky(SP + '*[-\\u2010-\\u2015]' + SP + '*' + NUM);
  var R_TO = _sticky(SP + '+(a|au|jusqu[\'\\u2019]a)' + SP + '+' + NUM);
  var R_SUFFIX = /(?:[abc]|ss?|ff?)(?![a-z])\.?/y;
  var R_CROSS = /[:.][1-9]/y;
  var R_SPACE_DIGIT = _sticky(SP + '+\\d');
  var R_BOOK_GAP = _sticky('\\.?' + SP + '*(?:(?:chapitres?|chap|ch)\\.?' + SP + '*)?');
  var R_CONNECTOR = _sticky(SP + '*(;|,|\\(|(?:et|ou|puis|aussi|cf|voir|ainsi' + SP + '+que)(?![a-z])\\.?)');
  var R_VERSE_MARK = _sticky(SP + '*(?:versets?|vv?)(?![a-z])\\.?' + SP + '*');
  var R_SPACES = _sticky(SP + '*');
  var R_CHAPTER_VERSE = _sticky('[1-9]\\d{0,2}(?:' + SP + '*:' + SP + '*|\\.)[1-9]');
  var R_LIST_END = _sticky(SP + '*(?:$|[;,.)\\]\\u00bb"\\u201d!?/\\r\\n]|(?:et|ou)' + SP + '+\\d)');
  var R_BARE = /([1-9]\d{0,2}):([1-9]\d{0,2})(?!\d)/g;
  var R_REF_CUE = /(?:^|[^a-z])(?:voir|cf|lire|lisons|lecture|texte|ref|verset|versets|v|vv|passage)\.?[ \t\u00a0\u202f:]*$|\([ \t\u00a0\u202f]*$/;
  var R_TIME_BEFORE = /(?:^|[^a-z])(?:a|vers|des|de|d|entre|et|jusqu['\u2019]?a|avant|apres|pour|le|la|du|au|aux|partir|heure|heures|horaire|rdv)[ \t\u00a0\u202f'\u2019]*$/;
  // "Daniel 5 min", "Marc 2 chants": a first name followed by a quantity.
  var R_UNIT_AFTER = _sticky(SP + '*(?:min|mn|minutes?|h|hrs?|heures?|fois|jours?|ans?|annees?|semaines?|mois|personnes?|enfants?|adultes?|chants?|places?|euros?|eur|km|kg|cm|m|pages?|points?|x)(?![a-z])');
  var R_TIME_AFTER = /^[ \t\u00a0\u202f]*(?:h(?![a-z])|heures?|hrs?|am(?![a-z])|pm(?![a-z])|[-\u2013\u2014][ \t\u00a0\u202f]*\d{1,2}[:h]\d\d)/;

  var MESSAGES = {
    cross: 'Plage sur deux chapitres : ajoutez une référence par chapitre.',
    chapters: 'Plage de chapitres : précisez un chapitre ou des versets.',
    possible: 'Référence possible, non ajoutée : écrivez le livre avec une majuscule ou précisez le verset.',
    nobook: 'Livre non précisé : écrivez par exemple « Jean 3:16 ».'
  };

  // Short abbreviations that are also everyday words ("le 25.10", "mar 3.10")
  // are never read in a plan; others only when written with a capital.
  var EXCLUDED = _set('le la de je re nu no ma mar ca ed ss sos mr ho da ge js pm nm ob hg zc zp rv jm jea song');
  var CAPITAL = _set('es est os ose ne lu jo jon joh am amo mi mic so sop soph ha hab na nah ab ag za zac zach co col ro rom he ja jas jac ju jug ex mat pro joe dan act is nom num lev gen gal tit mal lam rev ru josh hos',
    ['1 s', '2 s', '1 r', '2 r', '1 p', '2 p', '1 the', '2 the']);
  var ROMAN = { i: '1', ii: '2', iii: '3' };

  function _set(words, extra) {
    var out = {};
    words.split(' ').concat(extra || []).forEach(function (w) { out[w] = true; });
    return out;
  }

  /** Lowercase and strip accents without changing string length. */
  function _foldText(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i), l = c.toLowerCase();
      if (l.length !== 1) l = c;
      if (l > '\u007f' && l.normalize) {
        var d = l.normalize('NFD').charAt(0);
        if (d) l = d;
      }
      out += l;
    }
    return out;
  }

  function _bounded(f, q) {
    var c = f.charAt(q);
    return !c || !FOLDED_WORD.test(c);
  }

  function _suffix(f, q) {
    var m = _at(R_SUFFIX, f, q);
    return m ? q + m[0].length : q;
  }

  /** "16 à 18" needs a real "à"; a plain "a" is the verb avoir. */
  function _to(f, o, q) {
    var m = _at(R_TO, f, q);
    if (!m) return null;
    if (m[1] === 'a') {
      var i = q + m[0].indexOf('a');
      if (o.charAt(i) !== '\u00e0' && o.charAt(i) !== '\u00c0') return null;
    }
    return [m[0], m[2]];
  }

  /** "Romains 8, 1 Corinthiens 13": the comma separates two references. */
  function _numberedBookAt(f, i) {
    if (!/[123i]/.test(f.charAt(i))) return false;
    return !!_at(_getVocabulary().numbered, f, i);
  }

  /**
   * Parse "chapter[:verse[-verse]]" at position p of the folded text f.
   * Loose mode (search box) accepts spaces around every separator.
   * Returns { chapter, chapterEnd, verseStart, verseEnd, end, issue } or null.
   */
  function _parseTail(f, o, p, loose) {
    var m = _at(R_CHAPTER, f, p);
    if (!m) return null;
    var res = {
      chapter: Number(m[1]),
      chapterEnd: null,
      verseStart: null,
      verseEnd: null,
      end: p + m[0].length,
      issue: null
    };
    var q = res.end;
    var v = _at(R_COLON, f, q) || _at(loose ? R_DOT_LOOSE : R_DOT, f, q);
    if (!v) {
      v = _at(loose ? R_COMMA_LOOSE : R_COMMA, f, q);
      if (v && !loose && _numberedBookAt(f, q + v[0].length - v[1].length)) v = null;
    }
    if (!v) v = _at(R_VERSE_WORD, f, q);
    if (v) {
      res.verseStart = Number(v[1]);
      q = _suffix(f, q + v[0].length);
      var r = _at(R_DASH, f, q), word = !r;
      if (!r) r = _to(f, o, q);
      if (r) {
        var after = q + r[0].length;
        if (_at(R_CROSS, f, after)) {
          // "Jean 3:16 à 10:30" is a time; only a dash spans two chapters.
          if (word) r = null;
          else {
            res.issue = 'cross';
            res.end = after + _at(R_CHAPTER, f, after + 1)[0].length + 1;
            return res;
          }
        }
      }
      if (r) {
        res.verseEnd = Number(r[1]);
        q = _suffix(f, q + r[0].length);
      }
      if (!_bounded(f, q)) return null;
      res.end = q;
      return res;
    }
    var chapters = _at(R_DASH, f, q);
    if (!chapters) {
      chapters = _to(f, o, q);
      if (chapters && _at(R_CROSS, f, q + chapters[0].length)) chapters = null;
    }
    if (chapters) {
      res.issue = 'chapters';
      res.chapterEnd = Number(chapters[1]);
      res.end = q + chapters[0].length;
      return _bounded(f, res.end) ? res : null;
    }
    // "Jean 06 12 34 56 78" is a phone number, not John 6.
    if (!loose && _at(R_SPACE_DIGIT, f, q)) return null;
    return _bounded(f, q) ? res : null;
  }

  /** In a one-chapter book, a lone number is a verse ("Jude 24"). */
  function _singleChapter(bookId, tail) {
    if (!SINGLE_CHAPTER[bookId] || tail.verseStart != null) return tail;
    if (tail.issue === 'chapters') {
      tail.issue = null;
      tail.verseStart = tail.chapter;
      tail.verseEnd = tail.chapterEnd;
      tail.chapter = 1;
    } else if (!tail.issue && tail.chapter > 1) {
      tail.verseStart = tail.chapter;
      tail.chapter = 1;
    }
    return tail;
  }

  /**
   * Parse a Bible reference string.
   * Examples: "Jean 3:16", "Jn 3:16-18", "1 Cor 13", "Jean 3 v 16", "Ps 23"
   * Returns { bookId, chapter, verseStart, verseEnd } or null.
   */
  Search.prototype.parseReference = function (input) {
    if (!input || typeof input !== 'string') return null;

    var str = input.trim();
    if (!str) return null;
    var f = _foldText(str);

    // The chapter number follows a space or an abbreviation dot.
    for (var i = 1; i < f.length; i++) {
      if (!/\d/.test(f.charAt(i)) || !/[\s.]/.test(f.charAt(i - 1))) continue;
      var tail = _parseTail(f, str, i, true);
      if (!tail || tail.end !== f.length) continue;
      var bookPart = str.slice(0, i).replace(/[\s.]+$/, '');
      var book = null;
      // Resolve the book name via shared books.js. If it is not a known book,
      // treat the input as free text (return null) rather than a bogus ref.
      if (typeof window.VerseObs.findBook === 'function') {
        book = window.VerseObs.findBook(bookPart) ||
          window.VerseObs.findBook(bookPart.replace(/\s+(?:chapitres?|chap|ch)$/i, ''));
      }
      if (!book) continue;
      tail = _singleChapter(book.id, tail);
      if (tail.issue) return null;
      return {
        bookId: String(book.id),
        chapter: tail.chapter,
        verseStart: tail.verseStart,
        verseEnd: tail.verseEnd
      };
    }
    return null;
  };

  // ---- Plan import: every reference of a pasted text, in order ----

  var _vocabulary = null;

  function _getVocabulary() {
    if (_vocabulary) return _vocabulary;
    var V = window.VerseObs, fold = V.foldBookName, entries = {};
    function add(value, book, tier) {
      var key = fold(value);
      if (!key || EXCLUDED[key]) return;
      if (CAPITAL[key]) tier = TIER_CAPITAL;
      if (entries[key]) return;
      entries[key] = { bookId: String(book.id), tier: tier };
    }
    V.BOOKS.forEach(function (b) {
      add(b.name_fr, b, TIER_NAME);
      add(b.name_en, b, TIER_NAME);
      (b.alias_fr || []).forEach(function (a) { add(a, b, TIER_NAME); });
    });
    V.BOOKS.forEach(function (b) {
      b.abbr_fr.forEach(function (a) { add(a, b, TIER_STRONG); });
    });
    V.BOOKS.forEach(function (b) {
      b.abbr_en.forEach(function (a) { add(a, b, TIER_STRONG); });
    });
    // "2 Jean 3:16" may be item 2 of a list followed by "Jean 3:16".
    Object.keys(entries).forEach(function (key) {
      var rest = /^[123] (.+)$/.exec(key);
      if (rest && entries[rest[1]] && entries[rest[1]].bookId !== entries[key].bookId)
        entries[key].alt = entries[rest[1]].bookId;
    });
    var plain = [], numbered = [];
    Object.keys(entries)
      .sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); })
      .forEach(function (key) {
        var n = /^[123] (.+)$/.exec(key);
        var words = (n ? n[1] : key).split(' ').map(_escapeRegex).join(SP + '+');
        if (n) {
          if (numbered.indexOf(words) === -1) numbered.push(words);
        } else {
          plain.push(words);
        }
      });
    var numberedSource = '(?:[123]' + SP + '*|(?:iii|ii|i)' + SP + '+)(?:' + numbered.join('|') + ')';
    var tail = '(?![a-z\\u00e0-\\u024f])';
    _vocabulary = {
      entries: entries,
      re: new RegExp('(?:' + numberedSource + '|' + plain.join('|') + ')' + tail, 'g'),
      numbered: new RegExp(numberedSource + tail, 'y')
    };
    return _vocabulary;
  }

  /** "II  Co" -> "2 co", "1Co" -> "1 co". */
  function _bookKey(match) {
    var key = match.replace(/[\x20\t\u00a0\u202f]+/g, ' ');
    var roman = /^(iii|ii|i) (.+)$/.exec(key);
    if (roman && ROMAN[roman[1]]) return ROMAN[roman[1]] + ' ' + roman[2];
    return key.replace(/^([123]) ?/, '$1 ');
  }

  function _lineStarts(o) {
    var starts = [0];
    for (var i = 0; i < o.length; i++) if (o.charAt(i) === '\n') starts.push(i + 1);
    return starts;
  }

  function _lineOf(starts, index) {
    var lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function _place(o, starts, start, end) {
    var line = _lineOf(starts, start);
    var lineStart = starts[line];
    var lineEnd = line + 1 < starts.length ? starts[line + 1] - 1 : o.length;
    return {
      line: line + 1,
      lineText: o.slice(lineStart, lineEnd).replace(/\r$/, ''),
      column: start - lineStart,
      start: start,
      end: end,
      fragment: o.slice(start, end)
    };
  }

  function _capitalised(o, start, end) {
    var word = o.slice(start, end)
      .replace(/^(?:[123][\x20\t\u00a0\u202f]*|(?:III|II|I|iii|ii|i)[\x20\t\u00a0\u202f]+)/, '');
    var c = word.charAt(0);
    return !!c && c !== c.toLowerCase();
  }

  /** A list item after "Jean 3:16" : ", 18", "; 5:24", "et 20", "(voir 5:24)". */
  function _continuation(f, o, q, last) {
    var p = q, seps = '', m;
    while ((m = _at(R_CONNECTOR, f, p))) {
      var token = m[1].replace(/\.$/, '');
      seps += token === ';' ? ';' : token === ',' ? ',' : token === 'et' ? 'e' : 'w';
      p += m[0].length;
      if (seps.length > 4) return null;
    }
    if (!seps) return null;
    var mark = _at(R_VERSE_MARK, f, p), forceVerse = false;
    if (mark && mark[0].trim()) {
      forceVerse = true;
      p += mark[0].length;
    } else {
      p += _at(R_SPACES, f, p)[0].length;
    }
    if (!/[1-9]/.test(f.charAt(p))) return null;
    if (!forceVerse && _at(R_CHAPTER_VERSE, f, p)) {
      var tail = _parseTail(f, o, p, false);
      if (!tail) return null;
      tail.start = p;
      return tail;
    }
    var mode;
    if (forceVerse) mode = 'verse';
    else if (seps.indexOf('w') !== -1) return null;
    else if (seps.indexOf(';') !== -1) mode = 'chapter';
    else mode = last.verseStart != null ? 'verse' : 'chapter';
    var n = _at(R_CHAPTER, f, p);
    if (!n) return null;
    var e = p + n[0].length, endNum = null;
    var range = _at(R_DASH, f, e) || _to(f, o, e);
    if (range) {
      if (mode === 'chapter')
        return { issue: 'chapters', chapter: Number(n[1]), chapterEnd: Number(range[1]), start: p, end: e + range[0].length };
      endNum = Number(range[1]);
      e += range[0].length;
    }
    if (mode === 'verse') e = _suffix(f, e);
    if (!_at(R_LIST_END, f, e)) return null;
    return mode === 'verse'
      ? { chapter: last.chapter, verseStart: Number(n[1]), verseEnd: endNum, start: p, end: e, issue: null }
      : { chapter: Number(n[1]), verseStart: null, verseEnd: null, start: p, end: e, issue: null };
  }

  function _covered(spans, index) {
    for (var i = 0; i < spans.length; i++)
      if (index >= spans[i][0] && index < spans[i][1]) return true;
    return false;
  }

  /** The last reference of the same line and sentence before `index`. */
  function _sameSentence(o, refs, index) {
    for (var i = refs.length - 1; i >= 0; i--) {
      var r = refs[i];
      if (r.start >= index) continue;
      var between = o.slice(r.end, index);
      if (/[\r\n\u00b7\u2022|]/.test(between) || /[.!?](?:[\x20\t\u00a0\u202f]+[A-Z\u00C0-\u00DD]|[\x20\t\u00a0\u202f]*$)/.test(between))
        return null;
      return r;
    }
    return null;
  }

  /**
   * Chapter:verse written without a book. In the sentence of a reference it
   * belongs to that book ("Jean 3:16 et plus loin 5:24"); otherwise it is
   * reported. Times ("à 10:30", "10:30 Accueil", "10:30-11:00") stay silent.
   * Calls add(prev, start, end, chapter, verse) or issue(start, end).
   */
  function _bareReferences(o, f, starts, spans, refs, add, issue) {
    R_BARE.lastIndex = 0;
    var m;
    while ((m = R_BARE.exec(f)) !== null) {
      var s = m.index, e = s + m[0].length;
      if (_covered(spans, s)) continue;
      if (s > 0 && /[a-z0-9:.,\u00e0-\u024f]/.test(f.charAt(s - 1))) continue;
      if (e < f.length && /[a-z0-9:\u00e0-\u024f]/.test(f.charAt(e))) continue;
      var before = f.slice(starts[_lineOf(starts, s)], s);
      if (R_TIME_AFTER.test(f.slice(e, e + 16)) || /\d[:h]\d\d[ \t\u00a0\u202f]*(?:[-\u2013\u2014]|a)[ \t\u00a0\u202f]*$/.test(before)) continue;
      var cue = R_REF_CUE.test(before);
      if (!cue && R_TIME_BEFORE.test(before)) continue;
      // Clock times use round minutes (10:30, 9:45); verses rarely do.
      var clock = Number(m[1]) <= 23 && m[2].length === 2 && Number(m[2]) <= 59 && Number(m[2]) % 5 === 0;
      var prev = _sameSentence(o, refs, s);
      if (prev && !clock) {
        if (add(prev, s, e, Number(m[1]), Number(m[2])) === false) return;
      } else if (prev || cue || !clock) {
        issue(s, e);
      }
    }
  }

  /**
   * Find every Bible reference of a pasted text (message, sermon plan, run
   * sheet), in reading order. Chapter and verse limits are checked by the
   * caller against a translation: this function only reads the text.
   * Returns { references, issues, truncated, clipped }.
   */
  Search.prototype.findReferences = function (text) {
    var o = String(text == null ? '' : text);
    var clipped = o.length > PLAN_MAX_LENGTH;
    if (clipped) o = o.slice(0, PLAN_MAX_LENGTH);
    var f = _foldText(o);
    var starts = _lineStarts(o);
    var vocab = _getVocabulary();
    var refs = [], issues = [], spans = [], truncated = false, scanned = o.length;
    var re = vocab.re;

    function issue(start, end, kind) {
      var item = _place(o, starts, start, end);
      item.reason = MESSAGES[kind];
      issues.push(item);
    }
    function push(entry, tail, start, end) {
      if (refs.length >= PLAN_MAX_REFERENCES) {
        truncated = true;
        scanned = start;
        return false;
      }
      var ref = _place(o, starts, start, end);
      ref.bookId = entry.bookId;
      if (entry.alt) ref.alt = entry.alt;
      ref.chapter = tail.chapter;
      ref.verseStart = tail.verseStart;
      ref.verseEnd = tail.verseEnd;
      ref.wholeChapter = tail.verseStart == null;
      refs.push(ref);
      return true;
    }

    re.lastIndex = 0;
    var m;
    while (!truncated && (m = re.exec(f)) !== null) {
      var s = m.index, bookEnd = s + m[0].length;
      re.lastIndex = s + 1;
      if (s > 0 && WORD_CHAR.test(o.charAt(s - 1))) continue;
      var entry = vocab.entries[_bookKey(m[0])];
      if (!entry) continue;
      var gap = _at(R_BOOK_GAP, f, bookEnd);
      var tail = _parseTail(f, o, bookEnd + gap[0].length, false);
      if (!tail || (!gap[0].length && tail.verseStart == null)) continue;
      var capital = _capitalised(o, s, bookEnd);
      if (entry.tier === TIER_CAPITAL && !capital) continue;
      if (tail.verseStart == null && !tail.issue && _at(R_UNIT_AFTER, f, tail.end)) continue;
      tail = _singleChapter(Number(entry.bookId), tail);
      if (tail.issue || (!capital && tail.verseStart == null)) {
        issue(s, tail.end, tail.issue || 'possible');
        spans.push([s, tail.end]);
        re.lastIndex = tail.end;
        continue;
      }
      if (!push(entry, tail, s, tail.end)) break;
      var last = tail, end = tail.end, next;
      while ((next = _continuation(f, o, end, last))) {
        if (next.issue) {
          issue(next.start, next.end, next.issue);
          end = next.end;
          break;
        }
        if (!push(entry, _singleChapter(Number(entry.bookId), next), next.start, next.end)) break;
        last = next;
        end = next.end;
      }
      spans.push([s, end]);
      re.lastIndex = end;
    }

    var ordered = refs.slice();
    _bareReferences(o, f, starts, spans, ordered,
      function (prev, start, end, chapter, verse) {
        if (start >= scanned) return false;
        var ref = _place(o, starts, start, end);
        ref.bookId = prev.bookId;
        ref.chapter = chapter;
        ref.verseStart = verse;
        ref.verseEnd = null;
        ref.wholeChapter = false;
        refs.push(ref);
        spans.push([start, end]);
      },
      function (start, end) { issue(start, end, 'nobook'); });
    refs.sort(function (a, b) { return a.start - b.start; });
    if (refs.length > PLAN_MAX_REFERENCES) {
      truncated = true;
      scanned = Math.min(scanned, refs[PLAN_MAX_REFERENCES].start);
      refs = refs.slice(0, PLAN_MAX_REFERENCES);
    }
    issues = issues.filter(function (item) { return item.start < scanned; });
    issues.sort(function (a, b) { return a.start - b.start; });
    return { references: refs, issues: issues, truncated: truncated, clipped: clipped };
  };

  Search.PLAN_MAX_REFERENCES = PLAN_MAX_REFERENCES;
  Search.PLAN_MAX_LENGTH = PLAN_MAX_LENGTH;

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
