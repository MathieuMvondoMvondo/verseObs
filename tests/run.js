/*
 * VerseObs - lightweight test runner (no dependencies).
 *
 * Loads the browser modules (books.js, search.js) into a sandboxed context
 * with a minimal `window` global, then exercises the pure logic:
 * reference parsing, keyword search/scoring, and the fuzzy fallback.
 *
 * Run with: npm test   (or: node tests/run.js)
 */
'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// ---- Sandbox that mimics just enough of a browser global ----
var ctx = {};
ctx.window = ctx;
ctx.console = console;
vm.createContext(ctx);

function load(rel) {
  var p = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
}

load('assets/js/shared/books.js');
load('assets/js/control/search.js');

var VerseObs = ctx.VerseObs;
var search = new VerseObs.Search();

// ---- Tiny assertion framework ----
var passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ')', actual === expected);
}
function group(name) { console.log('\n' + name); }

// ===================================================================
group('parseReference');

var r;
r = search.parseReference('Jean 3:16');
eq('Jean 3:16 → bookId', r && r.bookId, '43');
eq('Jean 3:16 → chapter', r && r.chapter, 3);
eq('Jean 3:16 → verseStart', r && r.verseStart, 16);
eq('Jean 3:16 → verseEnd', r && r.verseEnd, null);

r = search.parseReference('Jn 3:16-18');
eq('Jn 3:16-18 → bookId', r && r.bookId, '43');
eq('Jn 3:16-18 → verseStart', r && r.verseStart, 16);
eq('Jn 3:16-18 → verseEnd', r && r.verseEnd, 18);

r = search.parseReference('1 Cor 13');
eq('1 Cor 13 → bookId', r && r.bookId, '46');
eq('1 Cor 13 → chapter', r && r.chapter, 13);
eq('1 Cor 13 → verseStart (none)', r && r.verseStart, null);

r = search.parseReference('Ps 23:1');
eq('Ps 23:1 → bookId', r && r.bookId, '19');
eq('Ps 23:1 → chapter', r && r.chapter, 23);

r = search.parseReference('Genesis 1:1');
eq('Genesis 1:1 → bookId', r && r.bookId, '1');

r = search.parseReference('Rom 8:28');
eq('Rom 8:28 → bookId', r && r.bookId, '45');
eq('Rom 8:28 → verse', r && r.verseStart, 28);

ok('garbage → null', search.parseReference('blah blah blah') === null);
ok('book without chapter → null', search.parseReference('Jean') === null);
ok('empty → null', search.parseReference('') === null);
ok('null input → null', search.parseReference(null) === null);

// dotted / comma separators
r = search.parseReference('Jean 3.16');
eq('Jean 3.16 (dot) → verse', r && r.verseStart, 16);

// ===================================================================
group('searchText — keyword');

var fakeBible = {
  books: {
    '43': {
      name: 'Jean',
      chapters: {
        '3': {
          '16': 'Car Dieu a tant aimé le monde',
          '17': 'Dieu n a pas envoyé son Fils pour juger le monde'
        }
      }
    },
    '19': {
      name: 'Psaumes',
      chapters: {
        '23': { '1': 'L Éternel est mon berger je ne manquerai de rien' }
      }
    }
  }
};

var res;
res = search.searchText('aimé', fakeBible);
eq('"aimé" → 1 result', res.length, 1);
eq('"aimé" → Jean 3:16', res[0] && res[0].reference, 'Jean 3:16');
ok('"aimé" → not fuzzy', search.lastFuzzy === false);

res = search.searchText('monde dieu', fakeBible);
ok('"monde dieu" (AND, any order) → ≥1', res.length >= 1);

res = search.searchText('berger', fakeBible);
eq('"berger" → Psaumes 23:1', res[0] && res[0].reference, 'Psaumes 23:1');

res = search.searchText('"le monde"', fakeBible);
ok('exact phrase "le monde" → ≥1', res.length >= 1);

res = search.searchText('xyzzyqwerty', fakeBible);
eq('nonsense → 0 results', res.length, 0);

// accents / case insensitivity
res = search.searchText('AIME', fakeBible);
ok('"AIME" (no accent, upper) matches "aimé"', res.length >= 1);

// ===================================================================
group('searchText — fuzzy fallback');

res = search.searchText('aimer', fakeBible); // typo/conjugation of "aime"
ok('"aimer" → fuzzy finds "aimé"', res.length >= 1);
ok('"aimer" → flagged fuzzy', search.lastFuzzy === true);

res = search.searchText('bergere', fakeBible); // 1 extra char vs "berger"
ok('"bergere" → fuzzy finds "berger"', res.length >= 1 && search.lastFuzzy === true);

res = search.searchText('zzzzzz', fakeBible);
eq('"zzzzzz" → still 0 (no near match)', res.length, 0);

// ===================================================================
group('highlight');

search.searchText('monde', fakeBible);
var hl = search.highlight('Car Dieu a tant aimé le monde');
ok('highlight wraps the term in <mark>', /<mark[^>]*>monde<\/mark>/i.test(hl));
ok('highlight escapes HTML', search.highlight('<script>').indexOf('&lt;script&gt;') !== -1);

// ===================================================================
console.log('\n' + (failed === 0 ? '✓ ALL PASSED' : '✗ FAILURES') +
  ' — ' + passed + ' passed, ' + failed + ' failed.');
process.exit(failed === 0 ? 0 : 1);
