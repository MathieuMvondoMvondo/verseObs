/*
 * VerseObs - lightweight test runner (no dependencies).
 *
 * Loads the browser modules (books.js, search.js) into a sandboxed context
 * with a minimal `window` global, then exercises the pure logic:
 * reference parsing, keyword search/scoring, and the fuzzy fallback.
 *
 * Run with: npm test   (or: node tests/run.js)
 */
"use strict";

var vm = require("vm");
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");

// ---- Sandbox that mimics just enough of a browser global ----
var ctx = {};
ctx.window = ctx;
ctx.console = console;
vm.createContext(ctx);

function load(rel) {
  var p = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p });
}

load("assets/js/shared/books.js");
load("assets/js/control/search.js");

var VerseObs = ctx.VerseObs;
var search = new VerseObs.Search();

// ---- Tiny assertion framework ----
var passed = 0,
  failed = 0;
function ok(name, cond) {
  if (cond) {
    passed++;
    console.log("  ✓ " + name);
  } else {
    failed++;
    console.log("  ✗ " + name);
  }
}
function eq(name, actual, expected) {
  ok(name + " (got " + JSON.stringify(actual) + ")", actual === expected);
}
function group(name) {
  console.log("\n" + name);
}

// ===================================================================
group("parseReference");

var r;
r = search.parseReference("Jean 3:16");
eq("Jean 3:16 → bookId", r && r.bookId, "43");
eq("Jean 3:16 → chapter", r && r.chapter, 3);
eq("Jean 3:16 → verseStart", r && r.verseStart, 16);
eq("Jean 3:16 → verseEnd", r && r.verseEnd, null);

r = search.parseReference("Jn 3:16-18");
eq("Jn 3:16-18 → bookId", r && r.bookId, "43");
eq("Jn 3:16-18 → verseStart", r && r.verseStart, 16);
eq("Jn 3:16-18 → verseEnd", r && r.verseEnd, 18);

r = search.parseReference("1 Cor 13");
eq("1 Cor 13 → bookId", r && r.bookId, "46");
eq("1 Cor 13 → chapter", r && r.chapter, 13);
eq("1 Cor 13 → verseStart (none)", r && r.verseStart, null);

r = search.parseReference("Ps 23:1");
eq("Ps 23:1 → bookId", r && r.bookId, "19");
eq("Ps 23:1 → chapter", r && r.chapter, 23);

r = search.parseReference("Genesis 1:1");
eq("Genesis 1:1 → bookId", r && r.bookId, "1");

r = search.parseReference("Rom 8:28");
eq("Rom 8:28 → bookId", r && r.bookId, "45");
eq("Rom 8:28 → verse", r && r.verseStart, 28);

ok("garbage → null", search.parseReference("blah blah blah") === null);
ok("book without chapter → null", search.parseReference("Jean") === null);
ok("empty → null", search.parseReference("") === null);
ok("null input → null", search.parseReference(null) === null);

// dotted / comma separators
r = search.parseReference("Jean 3.16");
eq("Jean 3.16 (dot) → verse", r && r.verseStart, 16);

// French spellings shared with the plan import
r = search.parseReference("Jean 3 v 16");
eq("Jean 3 v 16 → verse", r && r.verseStart, 16);
r = search.parseReference("Jn 3,16");
eq("Jn 3,16 (French comma) → verse", r && r.verseStart, 16);
r = search.parseReference("Esaie 40:31");
eq("Esaie without accents → Ésaïe", r && r.bookId, "23");
r = search.parseReference("Es 40:31");
eq("Es → Ésaïe, not Esther", r && r.bookId, "23");
r = search.parseReference("Jude 24");
eq("Jude 24 is verse 24 of the only chapter", r && r.chapter + ":" + r.verseStart, "1:24");
r = search.parseReference("Jean chapitre 3");
eq("Jean chapitre 3 → whole chapter", r && r.chapter + "/" + r.verseStart, "3/null");
ok("cross-chapter range is not a single passage", search.parseReference("Jean 3:16-4:2") === null);

// ===================================================================
group("findReferences — coller un plan");

function found(text) {
  return search
    .findReferences(text)
    .references.map(function (x) {
      return (
        x.bookId +
        " " +
        x.chapter +
        (x.verseStart != null ? ":" + x.verseStart : "") +
        (x.verseEnd != null ? "-" + x.verseEnd : "")
      );
    })
    .join(" | ");
}
function flagged(text) {
  return search.findReferences(text).issues.map(function (x) {
    return x.fragment;
  });
}
[
  ["Jean 3:16", "Jean 3:16", "43 3:16"],
  ["Jean 3.16", "Jean 3.16", "43 3:16"],
  ["Jean 3 v 16", "Jean 3 v 16", "43 3:16"],
  ["Jean 3 verset 16", "Jean 3 verset 16", "43 3:16"],
  ["virgule française", "Jn 3,16", "43 3:16"],
  ["Rm 8.28-30", "Rm 8.28-30", "45 8:28-30"],
  ["chapitre entier", "Lecture : Ps 23", "19 23"],
  ["1 Co 13:4-7", "1 Co 13:4-7", "46 13:4-7"],
  ["1 Corinthiens 13", "1 Corinthiens 13", "46 13"],
  ["deuxième référence du même livre", "Jean 3:16 ; 5:24", "43 3:16 | 43 5:24"],
  ["verset supplémentaire", "Jean 3:16, 18", "43 3:16 | 43 3:18"],
  ["Matthieu 5:3-12", "Matthieu 5:3-12", "40 5:3-12"],
  ["Ap 21:4", "Ap 21:4", "66 21:4"],
  ["Ésaïe accentué", "Ésaïe 53:5", "23 53:5"],
  ["Esaie sans accents", "Esaie 53:5", "23 53:5"],
  ["Is", "Is 53:5", "23 53:5"],
  ["1Co collé", "1Co 13:4", "46 13:4"],
  ["chiffres romains", "II Corinthiens 5:17", "47 5:17"],
  ["livre numéroté après un autre", "Jean 3:16-18; 1 Jn 4:8", "43 3:16-18 | 62 4:8"],
  ["virgule entre deux livres", "Romains 8:28, 1 Corinthiens 13:4", "45 8:28 | 46 13:4"],
  ["versets 16 à 18", "Jean 3 versets 16 à 18", "43 3:16-18"],
  ["livre d'un seul chapitre", "Jude 24", "65 1:24"],
  ["deux psaumes", "Ps 23 et 91", "19 23 | 19 91"],
  ["abréviation pointée", "Héb. 11:1", "58 11:1"],
  ["chapitre et verset en toutes lettres", "Jean chapitre 3 verset 16", "43 3:16"],
  ["renvoi entre parenthèses", "Jean 3:16 (voir aussi 5:24)", "43 3:16 | 43 5:24"],
  ["même phrase, plus loin", "Jean 3:16 et plus loin 5:24", "43 3:16 | 43 5:24"],
  ["tiret demi-cadratin", "Mt 5:3–12", "40 5:3-12"],
  ["référence suivie d'une heure", "Jean 3:16 à 10:30", "43 3:16"],
  ["minuscules avec verset", "jean 3:16", "43 3:16"],
  // Faux positifs
  ["heure", "Culte à 10:30 puis prière", ""],
  ["heure à la française", "Rendez-vous 10h30 salle B", ""],
  ["date", "Le 25.10 nous jeûnons", ""],
  ["nombre seul", "Il a 3 enfants", ""],
  ["3:16 sans livre", "3:16", ""],
  ["Actes dans une phrase", "Les Actes des apôtres racontent la naissance de l’Église", ""],
  ["plage horaire", "Louange (10:30-10:50)", ""],
  ["numéro de téléphone", "Appeler Jean au 06 12 34 56 78", ""],
  ["prénom et durée", "Prière : Daniel 5 min", ""],
  ["prénom et quantité", "Louange avec Marc 2 chants", ""],
  ["verbe lire", "Lu 3 fois", ""],
  ["est n'est pas Esther", "il est 4 heures", ""],
].forEach(function (c) {
  eq("plan : " + c[0], found(c[1]), c[2]);
});

var lone = flagged("Annonces : relire 3:16 avant jeudi");
eq("3:16 sans livre est signalé", lone.join(), "3:16");
eq("une heure n'est pas signalée", flagged("Accueil à 10:30 · 10:30 Louange").length, 0);
eq(
  "plage sur deux chapitres signalée, pas ajoutée",
  found("Jean 3:16-4:2") + "/" + flagged("Jean 3:16-4:2").join(),
  "/Jean 3:16-4:2",
);
eq("minuscule sans verset signalée", flagged("ps 23").join(), "ps 23");

var sermon = search.findReferences(
  "Introduction : Hébreux 11:1\n1. Jean 3:16 ; 5:24\n   – Esaie 40:31 et Jr 29:11\nAppel : Ap 21:4",
);
eq(
  "un plan est lu dans l'ordre",
  sermon.references
    .map(function (x) {
      return x.bookId + "@" + x.line;
    })
    .join(" "),
  "58@1 43@2 43@2 23@3 24@3 66@4",
);
eq("la ligne d'origine est conservée", sermon.references[3].lineText, "   – Esaie 40:31 et Jr 29:11");
ok("Ps 23 est un chapitre entier", search.findReferences("Ps 23").references[0].wholeChapter === true);

var many = [];
for (var n = 1; n <= 260; n++) many.push("Ps " + ((n % 150) + 1) + ":1");
var capped = search.findReferences(many.join("\n"));
eq("au plus 200 passages par collage", capped.references.length, 200);
ok("le dépassement est signalé", capped.truncated === true);

// ===================================================================
group("searchText — keyword");

var fakeBible = {
  books: {
    43: {
      name: "Jean",
      chapters: {
        3: {
          16: "Car Dieu a tant aimé le monde",
          17: "Dieu n a pas envoyé son Fils pour juger le monde",
        },
      },
    },
    19: {
      name: "Psaumes",
      chapters: {
        23: { 1: "L Éternel est mon berger je ne manquerai de rien" },
      },
    },
  },
};

var res;
res = search.searchText("aimé", fakeBible);
eq('"aimé" → 1 result', res.length, 1);
eq('"aimé" → Jean 3:16', res[0] && res[0].reference, "Jean 3:16");
ok('"aimé" → not fuzzy', search.lastFuzzy === false);

res = search.searchText("monde dieu", fakeBible);
ok('"monde dieu" (AND, any order) → ≥1', res.length >= 1);

res = search.searchText("berger", fakeBible);
eq('"berger" → Psaumes 23:1', res[0] && res[0].reference, "Psaumes 23:1");

res = search.searchText('"le monde"', fakeBible);
ok('exact phrase "le monde" → ≥1', res.length >= 1);

res = search.searchText("xyzzyqwerty", fakeBible);
eq("nonsense → 0 results", res.length, 0);

// accents / case insensitivity
res = search.searchText("AIME", fakeBible);
ok('"AIME" (no accent, upper) matches "aimé"', res.length >= 1);

// ===================================================================
group("searchText — fuzzy fallback");

res = search.searchText("aimer", fakeBible); // typo/conjugation of "aime"
ok('"aimer" → fuzzy finds "aimé"', res.length >= 1);
ok('"aimer" → flagged fuzzy', search.lastFuzzy === true);

res = search.searchText("bergere", fakeBible); // 1 extra char vs "berger"
ok(
  '"bergere" → fuzzy finds "berger"',
  res.length >= 1 && search.lastFuzzy === true,
);

res = search.searchText("zzzzzz", fakeBible);
eq('"zzzzzz" → still 0 (no near match)', res.length, 0);

// ===================================================================
group("highlight");

search.searchText("monde", fakeBible);
var hl = search.highlight("Car Dieu a tant aimé le monde");
ok("highlight wraps the term in <mark>", /<mark[^>]*>monde<\/mark>/i.test(hl));
ok(
  "highlight escapes HTML",
  search.highlight("<script>").indexOf("&lt;script&gt;") !== -1,
);

// ===================================================================
group("settings — free-text style independence");

// Shim a fresh localStorage in the sandbox, then load the settings module.
var _store = {};
ctx.localStorage = {
  getItem: function (k) {
    return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null;
  },
  setItem: function (k, v) {
    _store[k] = String(v);
  },
  removeItem: function (k) {
    delete _store[k];
  },
};
load("assets/js/shared/constants.js");
load("assets/js/control/settings.js");

var verseSettings = new VerseObs.Settings();
verseSettings.load();
var ftSettings = new VerseObs.Settings({
  storageKey: VerseObs.FREETEXT_SETTINGS_KEY,
  defaults: VerseObs.FREETEXT_DEFAULTS,
  templates: VerseObs.FREETEXT_STYLES,
});
ftSettings.load();

ok(
  "verse + free-text have distinct defaults",
  verseSettings.getAll().fontSize !== ftSettings.getAll().fontSize,
);
eq("free-text default preset", ftSettings.getAll().template, "chant");

// Applying a free-text preset must not touch the verse style.
var verseSizeBefore = verseSettings.getAll().fontSize;
ftSettings.applyTemplate("annonce");
eq(
  'preset "annonce" applied to free text',
  ftSettings.getAll().template,
  "annonce",
);
eq(
  "verse style untouched by free-text preset",
  verseSettings.getAll().fontSize,
  verseSizeBefore,
);

// Each profile persists under its own key.
ftSettings.update("fontSize", 51);
ok(
  "free-text persists to its own key",
  !!_store[VerseObs.FREETEXT_SETTINGS_KEY] &&
    JSON.parse(_store[VerseObs.FREETEXT_SETTINGS_KEY]).fontSize === 51,
);
ok(
  "free-text message style excludes bgImage",
  !("bgImage" in ftSettings.getForMessage()),
);

// ===================================================================
group("plan — limites de la version active");

load("assets/js/control/bible-loader.js");
load("assets/js/control/plan.js");
var planLoader = new VerseObs.BibleLoader();
(function () {
  var raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data/bibles/lsg.json"), "utf8"),
  );
  var books = {};
  raw.books.forEach(function (b) {
    var chapters = {};
    b.chapters.forEach(function (c) {
      var verses = {};
      c.verses.forEach(function (v) {
        verses[v.verse] = v.text;
      });
      chapters[c.chapter] = verses;
    });
    books[String(b.id)] = { name: b.name, chapters: chapters };
  });
  planLoader._cache.lsg = { books: books };
})();
var planContext = {
  loader: planLoader,
  versionId: "lsg",
  versionName: "Louis Segond 1910",
};
function resolveText(text, context) {
  return VerseObs.Plan.resolve(
    search.findReferences(text).references[0],
    context || planContext,
  );
}
var whole = resolveText("Ps 23");
ok("chapitre entier : un seul élément complet", whole.ok && whole.verses === 6);
eq("chapitre entier : référence sans verset", whole.item.reference, "Psaumes 23");
eq("plage : texte de la version active", resolveText("Rm 8.28-30").item.reference, "Romains 8:28-30");
eq("chapitre hors limites signalé", resolveText("Jean 22:1").reason, "Jean ne compte que 21 chapitres.");
eq("psaume hors limites signalé", resolveText("Ps 151").reason, "Psaumes ne compte que 150 chapitres.");
eq("verset hors limites signalé", resolveText("Jean 3:37").reason, "Jean 3 ne compte que 36 versets.");
eq("fin de plage hors limites signalée", resolveText("Jude 24-26").ok, false);
eq("plage inversée signalée", resolveText("Jean 3:18-16").ok, false);
var listed = VerseObs.Plan.analyse(search, "1 Jean 4:8\n2 Jean 3:16", planContext);
eq(
  "liste numérotée : « 2 Jean 3:16 » devient Jean 3:16, « 1 Jean 4:8 » reste 1 Jean",
  listed.passages
    .map(function (p) {
      return p.label;
    })
    .join(" | "),
  "1 Jean 4:8 | Jean 3:16",
);
var missingSecond = resolveText(
  "Jean 3:16",
  Object.assign({}, planContext, {
    secondaryName: "King James Version",
    secondary: function () {
      return null;
    },
  }),
);
ok(
  "deux versions : un passage absent de la deuxième n'est pas ajouté",
  !missingSecond.ok && /King James Version/.test(missingSecond.reason),
);
var withSecond = resolveText(
  "Jean 3:16",
  Object.assign({}, planContext, {
    secondary: function (bookId, chapter, start, end) {
      return { text: "For God so loved", reference: "John 3:16", version: "KJV", lang: "en", html: "", range: [bookId, chapter, start, end].join(":") };
    },
  }),
);
eq("deux versions : la deuxième suit le passage", withSecond.item.secondary.range, "43:3:16:16");

// ===================================================================
group("QR code local (appairage)");

load("assets/js/shared/qrcode.js");
var crypto = require("crypto");
function matrixHash(qr) {
  var rows = [];
  for (var y = 0; y < qr.size; y++) {
    var row = "";
    for (var x = 0; x < qr.size; x++) row += qr.isDark(x, y) ? "1" : "0";
    rows.push(row);
  }
  return crypto.createHash("sha256").update(rows.join("\n")).digest("hex");
}
// Reference matrices produced by Project Nayuki's qrcodegen 1.8.0 (Python).
[
  ["http://192.168.1.24:8080/remote.html?code=Q2xlZi1kZS10ZXN0LTEyMzQ1Ng", "M", 5, 6, "17c760bb28cf330098b91bfd8d0e98658af39d9494fb018fa4c09725a94e31f2"],
  ["VerseObs", "L", 1, 3, "0705b6af75de504b9a9d4b02e6ffb122a7c92e6560a5657a3a076d26fe2514b5"],
  ["Ésaïe 53:5 — « Il était blessé pour nos péchés »", "Q", 5, 6, "6a3962c961e438a30471fa8f4ae078c1682ee3be70ae5d80163eca3bf83c1ddc"],
  [new Array(23).join("Jean 3:16 "), "H", 15, 4, "c29160d4a249164c543c29f7db2efb9375f7e491fb896b256eae3ad16bf3d5cc"],
  [new Array(1201).join("x"), "L", 25, 0, "5f0dd4aeadb08b5728bd578462821e6b0d75bb498f18de52a32c4447179a8db9"],
].forEach(function (c) {
  var qr = VerseObs.QR.encode(c[0], { ecl: c[1] });
  eq(
    "QR " + c[1] + " v" + c[2] + " identique à la référence",
    qr.version + "/" + qr.mask + "/" + matrixHash(qr),
    c[2] + "/" + c[3] + "/" + c[4],
  );
});

// Independent reader: function modules, unmasking, Reed-Solomon syndromes.
var QR_BLOCKS = {
  // version: [total codewords, { level: [ecc per block, blocks] }]
  4: [100, { M: [18, 2] }],
  5: [134, { M: [24, 2] }],
  6: [172, { M: [16, 4] }],
};
function gfMul(a, b) {
  var z = 0;
  for (var i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((b >>> i) & 1) * a;
  }
  return z & 0xff;
}
function readQr(qr) {
  var size = qr.size,
    v = qr.version,
    reserved = {};
  if (v < 2 || v > 6) throw new Error("readQr covers versions 2 to 6");
  function mark(x, y) {
    reserved[x + "," + y] = true;
  }
  for (var i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  [[0, 0], [size - 8, 0], [0, size - 8]].forEach(function (o) {
    for (var dy = 0; dy < 8; dy++)
      for (var dx = 0; dx < 8; dx++) mark(o[0] + dx, o[1] + dy);
  });
  for (var k = 0; k <= 8; k++) {
    mark(8, k);
    mark(k, 8);
  }
  for (var k2 = 0; k2 < 8; k2++) {
    mark(size - 1 - k2, 8);
    mark(8, size - 1 - k2);
  }
  for (var ay = -2; ay <= 2; ay++)
    for (var ax = -2; ax <= 2; ax++) mark(size - 7 + ax, size - 7 + ay);
  var format = 0;
  for (var b = 0; b <= 5; b++) format |= (qr.isDark(8, b) ? 1 : 0) << b;
  format |= (qr.isDark(8, 7) ? 1 : 0) << 6;
  format |= (qr.isDark(8, 8) ? 1 : 0) << 7;
  format |= (qr.isDark(7, 8) ? 1 : 0) << 8;
  for (var c = 9; c < 15; c++) format |= (qr.isDark(14 - c, 8) ? 1 : 0) << c;
  format ^= 0x5412;
  var mask = (format >> 10) & 7,
    level = ["M", "L", "H", "Q"][format >> 13];
  var masks = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
    function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; },
    function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; },
  ];
  var bits = [];
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++)
      for (var j = 0; j < 2; j++) {
        var x = right - j,
          y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!reserved[x + "," + y])
          bits.push((qr.isDark(x, y) ? 1 : 0) ^ (masks[mask](x, y) ? 1 : 0));
      }
  }
  var spec = QR_BLOCKS[v],
    total = spec[0],
    ecc = spec[1][level][0],
    count = spec[1][level][1],
    words = [];
  for (var w = 0; w < total; w++) {
    var byte = 0;
    for (var t = 0; t < 8; t++) byte = (byte << 1) | bits[w * 8 + t];
    words.push(byte);
  }
  // Undo the interleaving: column by column, short blocks skip one data slot.
  var shortCount = count - (total % count),
    shortLen = Math.floor(total / count),
    padded = [],
    pos = 0;
  for (var bi = 0; bi < count; bi++) padded.push([]);
  for (var col = 0; col <= shortLen; col++)
    for (var bk = 0; bk < count; bk++) {
      if (col === shortLen - ecc && bk < shortCount) continue;
      padded[bk][col] = words[pos++];
    }
  var syndromes = 0,
    data = [];
  padded.forEach(function (block, index) {
    if (index < shortCount) block.splice(shortLen - ecc, 1);
    for (var i = 0, root = 1; i < ecc; i++, root = gfMul(root, 2)) {
      var sum = 0;
      block.forEach(function (cw) {
        sum = gfMul(sum, root) ^ cw;
      });
      syndromes |= sum;
    }
    data = data.concat(block.slice(0, block.length - ecc));
  });
  var stream = data
    .map(function (d) {
      return ("0000000" + d.toString(2)).slice(-8);
    })
    .join("");
  var length = parseInt(stream.slice(4, 12), 2),
    payload = [];
  for (var p = 0; p < length; p++)
    payload.push(parseInt(stream.slice(12 + p * 8, 20 + p * 8), 2));
  return {
    level: level,
    mode: stream.slice(0, 4),
    syndromes: syndromes,
    text: Buffer.from(payload).toString("utf8"),
  };
}
var roundTrips = 0;
for (var trip = 0; trip < 12; trip++) {
  var pairing =
    "http://192.168." + trip + "." + (20 + trip) + ":8080/remote.html?code=" +
    crypto.randomBytes(18).toString("base64url");
  var decoded = readQr(VerseObs.QR.encode(pairing, { ecl: "M" }));
  if (decoded.level === "M" && decoded.mode === "0100" && decoded.syndromes === 0 && decoded.text === pairing)
    roundTrips++;
}
eq("12 adresses d'appairage aléatoires relues sans erreur", roundTrips, 12);
ok(
  "le SVG est autonome (aucune ressource externe)",
  !/https?:|href|<image|url\(/.test(
    VerseObs.QR.toSvg("http://192.168.1.2:8080/remote.html?code=abc")
      .replace(/<path d="[^"]*"/, "")
      .replace(' xmlns="http://www.w3.org/2000/svg"', ""),
  ),
);

// ===================================================================
group("control messaging fallback");

var controlAppSource = fs.readFileSync(
  path.join(ROOT, "assets/js/shared/channel.js"),
  "utf8",
);
ok(
  "localStorage fallback message is not immediately removed",
  controlAppSource.indexOf("localStorage.removeItem(key)") === -1,
);
ok(
  "control panel polls localStorage fallback for overlay replies",
  controlAppSource.indexOf("readStorage(localStorage.getItem(key))") !== -1,
);

// ===================================================================
console.log(
  "\n" +
    (failed === 0 ? "✓ ALL PASSED" : "✗ FAILURES") +
    " — " +
    passed +
    " passed, " +
    failed +
    " failed.",
);
process.exit(failed === 0 ? 0 : 1);
