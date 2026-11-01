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
// Songs keep their centred card by default: « Antenne » is an explicit option.
eq("free-text default preset stays the song card", ftSettings.getAll().template, "chant");
eq("songs keep the framed card by default", ftSettings.getAll().layout, "carte");
eq("…centred on the frame", ftSettings.getAll().position, "center");
ok(
  "« Antenne » is offered as a song style",
  !!VerseObs.FREETEXT_STYLES.antenne &&
    VerseObs.FREETEXT_STYLES.antenne.settings.layout === "antenne",
);

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

eq(
  'legacy preset "annonce" keeps its framed card',
  ftSettings.getAll().layout,
  "carte",
);

// ===================================================================
group("habillage antenne — migration des réglages");

eq("verse default layout", verseSettings.getAll().layout, "antenne");
eq("verse default animation", verseSettings.getAll().animation, "reveal");
// A customised style saved before the antenne layout keeps its framed card.
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({
  template: "custom",
  animation: "typewriter",
  fontSize: 37,
});
var legacy = new VerseObs.Settings();
legacy.load();
eq("customised style without layout stays a card", legacy.getAll().layout, "carte");
eq("saved custom size kept", legacy.getAll().fontSize, 37);
eq("typewriter becomes the reading reveal", legacy.getAll().animation, "reveal");
// Never customised (still the former default base): the new default look.
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ template: "studio", fontSize: 40 });
legacy = new VerseObs.Settings();
legacy.load();
eq("former default base follows the new default", legacy.getAll().layout, "antenne");
eq("…with the antenne template", legacy.getAll().template, "antenne");
eq("…and its typography", legacy.getAll().fontSize, VerseObs.DEFAULTS.fontSize);
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ template: "cinema" });
legacy = new VerseObs.Settings();
legacy.load();
eq("another chosen base stays a card", legacy.getAll().layout, "carte");
// B1 — a saved « studio » template does not prove the operator never touched
// anything (applyTemplate keeps keys the template does not set): only the
// look follows the new default, never how and where the text is broadcast.
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({
  template: "studio",
  position: "upper-third",
  autoHide: 15000,
  animation: "slide",
  animationDuration: 800,
  maxWidth: 60,
  textAlign: "center",
  fontSize: 40,
});
legacy = new VerseObs.Settings();
legacy.load();
eq("studio base: the look follows the new default", legacy.getAll().layout, "antenne");
eq("studio base: the operator's position is kept", legacy.getAll().position, "upper-third");
eq("studio base: the operator's auto-hide is kept", legacy.getAll().autoHide, 15000);
eq("studio base: the operator's animation is kept", legacy.getAll().animation, "slide");
eq("studio base: the operator's duration is kept", legacy.getAll().animationDuration, 800);
eq("studio base: the operator's width is kept", legacy.getAll().maxWidth, 60);
eq("studio base: the operator's alignment is kept", legacy.getAll().textAlign, "center");
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ template: "studio", animation: "typewriter" });
legacy = new VerseObs.Settings();
legacy.load();
eq("studio base: only typewriter becomes the reveal", legacy.getAll().animation, "reveal");
// Songs are never migrated: an untouched song style stays the centred card.
_store[VerseObs.FREETEXT_SETTINGS_KEY] = JSON.stringify({ template: "chant" });
var legacySong = new VerseObs.Settings({
  storageKey: VerseObs.FREETEXT_SETTINGS_KEY,
  defaults: VerseObs.FREETEXT_DEFAULTS,
  templates: VerseObs.FREETEXT_STYLES,
});
legacySong.load();
eq("default song style stays a card", legacySong.getAll().layout, "carte");
eq("default song style stays centred", legacySong.getAll().position, "center");
_store[VerseObs.FREETEXT_SETTINGS_KEY] = JSON.stringify({
  template: "chant",
  position: "center",
  autoHide: 8000,
  animationDuration: 900,
  fontSize: 38,
});
legacySong.load();
eq("song auto-hide kept", legacySong.getAll().autoHide, 8000);
eq("song duration kept", legacySong.getAll().animationDuration, 900);
eq("song size kept", legacySong.getAll().fontSize, 38);
eq("song layout stays the card", legacySong.getAll().layout, "carte");
_store[VerseObs.FREETEXT_SETTINGS_KEY] = JSON.stringify({ template: "priere" });
legacySong.load();
eq("a chosen song style stays a card", legacySong.getAll().layout, "carte");
delete _store[VerseObs.FREETEXT_SETTINGS_KEY];
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ template: "antenne" });
legacy = new VerseObs.Settings();
legacy.load();
eq("saved antenne template keeps the antenne layout", legacy.getAll().layout, "antenne");
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ layout: "antenne", template: "custom" });
legacy = new VerseObs.Settings();
legacy.load();
eq("explicit layout is respected", legacy.getAll().layout, "antenne");
legacy.applyTemplate("cinema");
eq("legacy template applies the card layout", legacy.getAll().layout, "carte");
legacy.applyTemplate("antenne");
eq("antenne template applies the antenne layout", legacy.getAll().layout, "antenne");
delete _store[VerseObs.SETTINGS_KEY];
ok(
  "every template declares its layout",
  Object.keys(VerseObs.TEMPLATES).every(function (k) {
    return /^(antenne|carte|onglet|ruban|facettes)$/.test(VerseObs.TEMPLATES[k].settings.layout);
  }) &&
    Object.keys(VerseObs.FREETEXT_STYLES).every(function (k) {
      return /^(antenne|carte|onglet|ruban|facettes)$/.test(VerseObs.FREETEXT_STYLES[k].settings.layout);
    }),
);
// « Onglet » (Math, 26/10): a third layout, offered next to the others,
// for the verses and for the songs, light and dark.
["onglet", "onglet-sombre"].forEach(function (key) {
  [VerseObs.TEMPLATES, VerseObs.FREETEXT_STYLES].forEach(function (presets, i) {
    var preset = presets[key];
    ok(
      (i ? "song" : "verse") + " style « " + key + " » uses the onglet layout",
      !!preset && preset.settings.layout === "onglet",
    );
    ok(
      (i ? "song" : "verse") + " style « " + key + " » has only real colours",
      !!preset &&
        Object.keys(preset.settings).every(function (k) {
          return !/Color$/.test(k) || VerseObs.isColor(preset.settings[k]);
        }),
    );
  });
});
eq("the onglet styles are named for the operator", [
  VerseObs.TEMPLATES.onglet && VerseObs.TEMPLATES.onglet.label,
  VerseObs.TEMPLATES["onglet-sombre"] && VerseObs.TEMPLATES["onglet-sombre"].label,
].join(" / "), "Onglet clair / Onglet sombre");
_store[VerseObs.SETTINGS_KEY] = JSON.stringify({ layout: "onglet", template: "onglet", fontSize: 40 });
legacy = new VerseObs.Settings();
legacy.load();
eq("a saved onglet layout stays onglet (never taken for an old card)", legacy.getAll().layout, "onglet");
eq("…with its own size", legacy.getAll().fontSize, 40);
eq("the signature is empty by default", legacy.getAll().signature, "");
legacy.applyTemplate("onglet-sombre");
eq("« Onglet sombre » applies the onglet layout", legacy.getAll().layout, "onglet");
legacy.update("signature", "Culte du dimanche");
eq("the signature is a setting like the others", legacy.getAll().signature, "Culte du dimanche");
legacy.update("signature", "<b>x</b>" + new Array(90).join("y"));
ok("a signature stays short plain text", legacy.getAll().signature.length <= 60);
delete _store[VerseObs.SETTINGS_KEY];
// Trying « Onglet » never changes another base: Onglet then Studio (or a
// song's Chant) gives exactly what a fresh Studio (or Chant) gives.
[
  [VerseObs.SETTINGS_KEY, {}, ["studio", "papier", "cinema", "minimal", "antenne"]],
  [VerseObs.FREETEXT_SETTINGS_KEY, { storageKey: VerseObs.FREETEXT_SETTINGS_KEY, defaults: VerseObs.FREETEXT_DEFAULTS, templates: VerseObs.FREETEXT_STYLES }, ["chant", "annonce", "priere", "antenne"]],
].forEach(function (profile) {
  profile[2].forEach(function (base) {
    delete _store[profile[0]];
    var fresh = new VerseObs.Settings(profile[1]);
    fresh.load();
    fresh.applyTemplate(base);
    var expected = JSON.stringify(fresh.getAll());
    delete _store[profile[0]];
    var tried = new VerseObs.Settings(profile[1]);
    tried.load();
    tried.applyTemplate("onglet-sombre");
    tried.applyTemplate(base);
    eq("Onglet then « " + base + " » looks exactly like a fresh « " + base + " »", JSON.stringify(tried.getAll()), expected);
  });
  delete _store[profile[0]];
});
// Review 8 (B1): the same after a retouch in the panel, which names the look
// « custom » (a typed signature is enough), with or without a reload. What the
// operator set by hand stays theirs where the new base sets nothing: the
// signature, a highlight colour, a size the base leaves alone.
function panelOf(settings, keys) {
  var els = {};
  keys.forEach(function (key) {
    var fns = [];
    els[key] = {
      type: key === "fontSize" ? "range" : /Color$/.test(key) ? "color" : "text",
      tagName: "INPUT",
      value: "",
      parentElement: null,
      getAttribute: function () {
        return key;
      },
      addEventListener: function (t, fn) {
        fns.push(fn);
      },
      set: function (v) {
        this.value = String(v);
        fns.forEach(function (fn) {
          fn();
        });
      },
    };
  });
  settings.bindUI({
    querySelectorAll: function () {
      return keys.map(function (k) {
        return els[k];
      });
    },
  });
  return els;
}
[
  [VerseObs.SETTINGS_KEY, {}, VerseObs.TEMPLATES, ["studio", "papier", "cinema", "minimal", "antenne"]],
  [VerseObs.FREETEXT_SETTINGS_KEY, { storageKey: VerseObs.FREETEXT_SETTINGS_KEY, defaults: VerseObs.FREETEXT_DEFAULTS, templates: VerseObs.FREETEXT_STYLES }, VerseObs.FREETEXT_STYLES, ["chant", "annonce", "priere", "antenne"]],
].forEach(function (profile) {
  var retouches = [
    ["a typed signature", { signature: "Culte du dimanche" }],
    ["a signature, then colours and size", { signature: "Culte du dimanche", textColor: "#223344", highlightColor: "#ff3355", fontSize: 47 }],
  ];
  // Integration (26/10): « Ruban » and « Facettes » are layouts with a look of
  // their own too; the same retouch, with or without a reload, never follows
  // the operator to Studio, Cinéma or Chant.
  ["onglet", "onglet-sombre", "ruban", "facettes"].forEach(function (via) {
    retouches.forEach(function (retouch) {
      [false, true].forEach(function (reload) {
        var wrong = [];
        profile[3].forEach(function (base) {
          delete _store[profile[0]];
          var fresh = new VerseObs.Settings(profile[1]);
          fresh.load();
          fresh.applyTemplate(base);
          var expected = fresh.getAll();
          // A key the base does not set keeps the operator's own value.
          Object.keys(retouch[1]).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(profile[2][base].settings, k)) expected[k] = retouch[1][k];
          });
          delete _store[profile[0]];
          var tried = new VerseObs.Settings(profile[1]);
          tried.load();
          tried.applyTemplate(via);
          var panel = panelOf(tried, Object.keys(retouch[1]));
          Object.keys(retouch[1]).forEach(function (k) {
            panel[k].set(retouch[1][k]);
          });
          if (tried.getAll().template !== "custom") wrong.push(base + ": the retouch did not name the look custom");
          if (reload) {
            tried = new VerseObs.Settings(profile[1]);
            tried.load();
          }
          tried.applyTemplate(base);
          var got = tried.getAll();
          Object.keys(expected).forEach(function (k) {
            if (JSON.stringify(got[k]) !== JSON.stringify(expected[k]))
              wrong.push(base + "." + k + " " + JSON.stringify(got[k]) + " (expected " + JSON.stringify(expected[k]) + ")");
          });
        });
        delete _store[profile[0]];
        eq(
          (profile[0] === VerseObs.SETTINGS_KEY ? "Verses" : "Songs") + ": « " + via + " », " + retouch[0] + (reload ? ", reload" : "") +
            ", then each other base looks like a fresh one (the operator's own keys kept)",
          JSON.stringify(wrong),
          "[]",
        );
      });
    });
  });
  // Between the older bases nothing changes: a base writes its own keys only.
  var older = Object.keys(profile[2]).filter(function (k) {
      return VerseObs.OWN_LOOK_LAYOUTS.indexOf(profile[2][k].settings.layout) === -1;
    }),
    moved = [];
  older.forEach(function (a) {
    older.forEach(function (b) {
      if (a === b) return;
      delete _store[profile[0]];
      var s = new VerseObs.Settings(profile[1]);
      s.load();
      s.applyTemplate(a);
      var expected = JSON.stringify(Object.assign(s.getAll(), profile[2][b].settings, { template: b }));
      s.applyTemplate(b);
      if (JSON.stringify(s.getAll()) !== expected) moved.push(a + " → " + b);
    });
  });
  delete _store[profile[0]];
  eq("Between the older bases a base still writes its own keys only (" + older.length + " bases)", JSON.stringify(moved), "[]");
});
// Integration (26/10): the layouts with a look of their own are the three
// drawn ones; review 8 (B1) reads this list, so a new one must join it.
eq("layouts with a look of their own", JSON.stringify(VerseObs.OWN_LOOK_LAYOUTS), JSON.stringify(["onglet", "ruban", "facettes"]));
var ongletMigrated = {};
VerseObs.migrateStyle({ layout: "onglet", template: "onglet" }, ongletMigrated, VerseObs.DEFAULTS, "studio");
eq("the output's migration keeps the onglet layout too", ongletMigrated.layout, undefined);

// « Ruban » and « Facettes » (Math, 26/10, second reference): two more
// broadcast graphics, offered next to the others for the verses and the
// songs; Antenne, Carte and Onglet are untouched.
[["ruban", "Ruban"], ["facettes", "Facettes"]].forEach(function (pair) {
  var key = pair[0];
  [VerseObs.TEMPLATES, VerseObs.FREETEXT_STYLES].forEach(function (presets, i) {
    var preset = presets[key];
    ok((i ? "song" : "verse") + " style « " + key + " » exists and draws its own layout", !!preset && preset.settings.layout === key && preset.label === pair[1]);
    ok(
      (i ? "song" : "verse") + " style « " + key + " » has only real colours",
      !!preset &&
        Object.keys(preset.settings).every(function (k) {
          return !/Color$/.test(k) || VerseObs.isColor(preset.settings[k]);
        }),
    );
  });
  var migrated = {};
  VerseObs.migrateStyle({ layout: key, template: key }, migrated, VerseObs.DEFAULTS, "studio");
  eq("the output's migration keeps the " + key + " layout (never an old card)", migrated.layout, undefined);
  _store[VerseObs.SETTINGS_KEY] = JSON.stringify({ layout: key, template: key, fontSize: 41 });
  var saved = new VerseObs.Settings();
  saved.load();
  eq("a saved " + key + " layout stays " + key, saved.getAll().layout, key);
  delete _store[VerseObs.SETTINGS_KEY];
});
eq("the layouts the output knows", JSON.stringify(VerseObs.LAYOUTS), JSON.stringify({ ANTENNE: "antenne", CARTE: "carte", ONGLET: "onglet", RUBAN: "ruban", FACETTES: "facettes" }));
// Trying Ruban or Facettes never changes another base either.
[
  [VerseObs.SETTINGS_KEY, {}, ["studio", "papier", "cinema", "minimal", "antenne", "onglet", "onglet-sombre"]],
  [VerseObs.FREETEXT_SETTINGS_KEY, { storageKey: VerseObs.FREETEXT_SETTINGS_KEY, defaults: VerseObs.FREETEXT_DEFAULTS, templates: VerseObs.FREETEXT_STYLES }, ["chant", "annonce", "priere", "antenne", "onglet", "onglet-sombre"]],
].forEach(function (profile) {
  profile[2].forEach(function (base) {
    delete _store[profile[0]];
    var fresh = new VerseObs.Settings(profile[1]);
    fresh.load();
    fresh.applyTemplate(base);
    var expected = JSON.stringify(fresh.getAll());
    ["ruban", "facettes"].forEach(function (tried) {
      delete _store[profile[0]];
      var s = new VerseObs.Settings(profile[1]);
      s.load();
      s.applyTemplate(tried);
      s.applyTemplate(base);
      eq(tried + " then « " + base + " » looks exactly like a fresh « " + base + " »", JSON.stringify(s.getAll()), expected);
    });
  });
  delete _store[profile[0]];
});

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
group("conducteur — identifiant d'élément (tally sans libellé)");

load("assets/js/control/queue.js");
var CUE = {
  test: function (id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(id);
  },
};
var cues = VerseObs.Queue.validateItems([
  { type: "verse", text: "a", reference: "Jean 3:16" },
  { type: "verse", text: "a", reference: "Jean 3:16" },
  { type: "text", text: "x" },
  { type: "text", text: "y" },
]).map(function (item) {
  return item.id;
});
ok(
  "every conductor item gets an identifier",
  cues.every(function (id) {
    return CUE.test(id);
  }),
);
eq("identical items get distinct identifiers", new Set(cues).size, 4);
eq(
  "a valid identifier is kept",
  VerseObs.Queue.validateItems([{ type: "text", text: "x", id: "cue-123456" }])[0].id,
  "cue-123456",
);
var twice = VerseObs.Queue.validateItems([
  { type: "text", text: "x", id: "cue-123456" },
  { type: "text", text: "y", id: "cue-123456" },
]);
ok(
  "a duplicated identifier is replaced",
  twice[0].id === "cue-123456" && twice[1].id !== "cue-123456" && CUE.test(twice[1].id),
);
ok(
  "an invalid identifier is replaced",
  CUE.test(VerseObs.Queue.validateItems([{ type: "text", text: "x", id: "<b>" }])[0].id),
);
var cueQueue = new VerseObs.Queue({});
cueQueue.clear();
cueQueue.add({ type: "text", text: "x", id: "cue-123456" });
cueQueue.add({ type: "text", text: "y", id: "cue-123456" });
cueQueue.addMany([{ type: "text", text: "z", id: "cue-123456" }]);
eq(
  "adding never duplicates an identifier already in the conductor",
  new Set(
    cueQueue.getItems().map(function (item) {
      return item.id;
    }),
  ).size,
  3,
);
cueQueue.clear();
var serverState = require(path.join(ROOT, "tools/server.js")).sanitizeState({
  current: { label: "Jean 3:16", text: "t", cue: "cue-1", version: "LSG" },
  next: { label: "Jean 3:16", text: "t", cue: "cue-2", version: "LSG" },
  output: { visible: true, confirmed: true, label: "Jean 3:16", cue: "cue-1", version: "LSG" },
});
eq("the phone receives the selected item's identifier", serverState.current.cue, "cue-1");
eq("…the next item's identifier", serverState.next.cue, "cue-2");
eq("…the live identifier", serverState.output.cue, "cue-1");
eq("…and the live version", serverState.output.version, "LSG");
ok(
  "identifiers sent to the phone stay short",
  require(path.join(ROOT, "tools/server.js"))
    .sanitizeState({ output: { cue: new Array(300).join("x") } })
    .output.cue === new Array(65).join("x"),
);
// A plan of a split passage: the phone says « plan 2/12 », from integers only.
var planState = require(path.join(ROOT, "tools/server.js")).sanitizeState({
  current: { label: "Psaumes 119:5-8", text: "t", cue: "cue-2", part: 2, parts: 12 },
  next: { label: "Psaumes 119:9-12", text: "t", cue: "cue-3", part: "3", parts: 12 },
});
eq("the phone receives the plan's place", [planState.current.part, planState.current.parts].join("/"), "2/12");
eq("…and nothing for a malformed place", [planState.next.part, planState.next.parts].join("/"), "0/0");
// A passage too long for its band: the phone must say what really passes.
var partialState = require(path.join(ROOT, "tools/server.js")).sanitizeState({
  output: { visible: true, confirmed: true, label: "Psaumes 119:1-48", cue: "cue-1", shown: "119:1-4" },
});
eq("the phone receives the verses really on air", partialState.output.shown, "119:1-4");
["<img src=x onerror=alert(1)>", "119:1-4; drop", new Array(60).join("1"), 42, { a: 1 }].forEach(function (bad) {
  eq(
    "…and nothing else (" + JSON.stringify(bad).slice(0, 24) + ")",
    require(path.join(ROOT, "tools/server.js")).sanitizeState({ output: { visible: true, shown: bad } }).output.shown,
    "",
  );
});
eq(
  "…nor any partial claim for a hidden output",
  require(path.join(ROOT, "tools/server.js")).sanitizeState({ output: { visible: false, shown: "119:1-4" } }).output.shown,
  "",
);

// ===================================================================
group("passage — découpage aux frontières de versets");

load("assets/js/shared/passage.js");
load("assets/js/shared/secondary.js");
VerseObs.sanitizeHtml = function (html) {
  return String(html || "");
};
var P = VerseObs.Passage;
var lsgRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bibles/lsg.json"), "utf8"));
var kjvRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bibles/kjv.json"), "utf8"));
function rangeOf(raw, bookName, chapter, a, b) {
  var book = raw.books.find(function (x) { return x.name === bookName; });
  var vs = book.chapters.find(function (c) { return c.chapter === chapter; }).verses
    .filter(function (v) { return v.verse >= a && v.verse <= b; });
  return {
    text: vs.map(function (v) { return v.text; }).join(" "),
    html: vs.map(function (v) {
      return '<sup class="verse-num">' + v.verse + "</sup> " + v.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }).join(" "),
  };
}
var ps23 = rangeOf(lsgRaw, "Psaumes", 23, 1, 6),
  ps23en = rangeOf(kjvRaw, "Psalms", 23, 1, 6);
var longItem = {
  id: "cue-ps23-long",
  type: "verse",
  text: ps23.text,
  html: ps23.html,
  reference: "Psaumes 23:1-6",
  version: "Louis Segond 1910",
  secondary: { text: ps23en.text, html: ps23en.html, reference: "Psalms 23:1-6", version: "King James Version", lang: "en" },
};
var verses23 = P.verses(longItem.html);
eq("six verses found in Psaumes 23:1-6", verses23.length, 6);
eq("verse numbers kept in order", verses23.map(function (v) { return v.num; }).join(","), "1,2,3,4,5,6");
eq("no verse found in a single verse without markers", P.verses("Car Dieu a tant aimé le monde").length, 0);
eq("range label", P.range("Psaumes 23:1-6", 4, 6), "Psaumes 23:4-6");
eq("single verse label", P.range("1 Corinthiens 13:4-7", 5, 5), "1 Corinthiens 13:5");
var parts23 = P.split(longItem, [[1, 3], [4, 6]], "grp-123456");
eq("split gives one item per range", parts23.length, 2);
eq("part 1 reference", parts23[0].reference, "Psaumes 23:1-3");
eq("part 2 reference", parts23[1].reference, "Psaumes 23:4-6");
eq("part 1 keeps the item's identifier (tally on air)", parts23[0].id, "cue-ps23-long");
ok("part 2 gets its own identifier", !parts23[1].id);
ok("part 2 starts at verse 4", /^<sup class="verse-num">4<\/sup>/.test(parts23[1].html));
ok("part text has no verse numbers", parts23[1].text.indexOf("4") !== 0 && parts23[1].text.length > 40);
eq("part numbering", parts23[1].part + "/" + parts23[1].parts, "2/2");
eq("parts remember the whole passage", parts23[1].whole, "Psaumes 23:1-6");
eq("second translation follows the parts", parts23[1].secondary.reference, "Psalms 23:4-6");
ok("…with its own verses", /^<sup class="verse-num">4<\/sup>/.test(parts23[1].secondary.html));
var merged23 = P.merge(parts23);
eq("merging restores the reference", merged23.reference, "Psaumes 23:1-6");
eq("merging restores the text", merged23.text.replace(/\s+/g, " "), longItem.text.replace(/\s+/g, " "));
eq("merging restores the markup", merged23.html.replace(/\s+/g, " "), longItem.html.replace(/\s+/g, " "));
eq("merging restores the second reference", merged23.secondary.reference, "Psalms 23:1-6");
eq("merged item keeps the identifier", merged23.id, "cue-ps23-long");
ok("merged item is no longer a part", !merged23.group && !merged23.part && !merged23.parts);
var kept = VerseObs.Queue.validateItems([Object.assign({}, parts23[1], { id: "cue-part-2" })])[0];
eq("the conductor keeps the part fields", [kept.group, kept.part, kept.parts, kept.whole].join("|"), "grp-123456|2|2|Psaumes 23:1-6");
var dropped = VerseObs.Queue.validateItems([{ type: "verse", text: "x", group: "<b>", part: -1, parts: "x", whole: 3 }])[0];
ok("invalid part fields are dropped", !dropped.group && !dropped.part && !dropped.parts && !dropped.whole);

// ===================================================================
group("passage — « Regrouper » ne fabrique jamais un passage absent");

var ps119 = rangeOf(lsgRaw, "Psaumes", 119, 1, 48);
var item119 = {
  id: "cue-ps119-1-48",
  type: "verse",
  text: ps119.text,
  html: ps119.html,
  reference: "Psaumes 119:1-48",
  version: "Louis Segond 1910",
};
var ranges119 = [];
for (var r119 = 1; r119 <= 48; r119 += 4) ranges119.push([r119, r119 + 3]);
var plans119 = P.split(item119, ranges119, "grp-119119");
function numsOf(html) {
  return P.verses(html).map(function (v) { return v.num; });
}
function oneToN(n) {
  var out = [];
  for (var i = 1; i <= n; i++) out.push(i);
  return out.join(",");
}
eq("twelve plans of four verses", plans119.length, 12);
eq("a complete group can be regrouped", P.incomplete(plans119), "");
var withoutPlan2 = plans119.filter(function (_, i) { return i !== 1; });
eq(
  "a deleted plan is named with its verses",
  P.incomplete(withoutPlan2),
  "Il manque le plan 2/12 (119:5-8).",
);
var refusal = "";
try {
  P.merge(withoutPlan2);
} catch (e) {
  refusal = e.message;
}
eq("…and merging refuses instead of inventing Psaumes 119:1-48", refusal, "Il manque le plan 2/12 (119:5-8).");
eq(
  "the last plan missing",
  P.incomplete(plans119.slice(0, 11)),
  "Il manque le plan 12/12 (119:45-48).",
);
eq(
  "two plans missing in a row",
  P.incomplete(plans119.filter(function (_, i) { return i !== 1 && i !== 2; })),
  "Il manque les plans 2 et 3/12 (119:5-12).",
);
eq(
  "two separate holes",
  P.incomplete(plans119.filter(function (_, i) { return i !== 1 && i !== 6; })),
  "Il manque le plan 2/12 (119:5-8) et le plan 7/12 (119:25-28).",
);
eq(
  "a verse in two plans is refused",
  P.incomplete(plans119.concat([plans119[3]])),
  "Le verset 119:13 figure dans deux plans.",
);
var swapped = plans119.slice();
swapped[1] = plans119[2];
swapped[2] = plans119[1];
var mergedSwapped = P.merge(swapped);
eq("plans moved by hand are merged in verse order", numsOf(mergedSwapped.html).join(","), oneToN(48));
eq("…under the reference of the verses present", mergedSwapped.reference, "Psaumes 119:1-48");
eq("…with the passage's identifier", mergedSwapped.id, "cue-ps119-1-48");
ok(
  "…and its plain text in reading order",
  mergedSwapped.text.replace(/\s+/g, " ").indexOf(plans119[1].text.replace(/\s+/g, " ")) <
    mergedSwapped.text.replace(/\s+/g, " ").indexOf(plans119[2].text.replace(/\s+/g, " ")),
);
var claimsMore = P.split(
  Object.assign({}, item119, { html: rangeOf(lsgRaw, "Psaumes", 119, 1, 12).html }),
  [[1, 4], [5, 8], [9, 12]],
  "grp-claims",
).map(function (p) {
  return Object.assign({}, p, { whole: "Psaumes 119:1-48" });
});
eq(
  "the reference is computed from the verses present, never copied from the whole",
  P.merge(claimsMore).reference,
  "Psaumes 119:1-12",
);
// A plan split again inside its group (a larger style): one group, renumbered.
var subPlans = P.split(plans119[0], [[1, 2], [3, 4]], plans119[0].group);
eq("a plan split again keeps the passage", subPlans[1].whole, "Psaumes 119:1-48");
var regrouped = P.renumber(subPlans.concat(plans119.slice(1)), "grp-119119");
eq(
  "…its group is renumbered in reading order",
  regrouped.map(function (p) { return p.part + "/" + p.parts; }).join(" "),
  oneToN(13).split(",").map(function (n) { return n + "/13"; }).join(" "),
);
eq("…and is complete", P.incomplete(regrouped), "");
var mergedAgain = P.merge(regrouped);
eq("…merged again: the whole passage", mergedAgain.reference, "Psaumes 119:1-48");
eq("…with every verse once, in order", numsOf(mergedAgain.html).join(","), oneToN(48));
eq(
  "renumbering leaves other items alone",
  P.renumber([{ type: "text", text: "x" }].concat(plans119.slice(0, 2)), "grp-119119")[0].part,
  undefined,
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
group("régie — feuille de style intégrée");

var studioCss = fs.readFileSync(path.join(ROOT, "assets/css/studio.css"), "utf8");
ok(
  "no separate override layer for the régie",
  studioCss.indexOf("Régie « antenne »") === -1,
);
ok(
  "the régie components need no !important",
  !/!important/.test(studioCss.slice(studioCss.indexOf("/* ---- Monitor bay"))),
);
ok(
  "fewer !important than before the régie work (42)",
  (studioCss.match(/!important/g) || []).length < 42,
);
// Every size in a font or font-size declaration (line heights after « / »
// excepted); 0 px hides a visually replaced label.
var smallSizes = [];
(studioCss.match(/font(?:-size)?\s*:[^;{}]+/g) || []).forEach(function (decl) {
  var value = decl.slice(decl.indexOf(":") + 1),
    re = /(^|[^\/\w.])(\d+(?:\.\d+)?)px/g,
    m;
  while ((m = re.exec(value)))
    if (Number(m[2]) > 0 && Number(m[2]) < 12) smallSizes.push(decl.trim());
});
eq("no font size under 12 px left in the Studio stylesheet", smallSizes.join(" | "), "");

// ===================================================================
group("CSS file endings");
require("./css-endings")((name, fn) => {
  try {
    fn();
    ok(name, true);
  } catch (error) {
    ok(name, false);
    console.error(error.message);
  }
});

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
group("no side band (Math, 26/10)");

// Math rejects the coloured bands stuck to the left of an element (red or
// amber, « AI slop »): no inset side shadow, no coloured left border, no
// horizontal colour wash, in the régie, the phone and the output. A state
// is told by its text badge and, when needed, a thin full contour.
["studio.css", "control.css", "remote.css", "display.css"].forEach(function (file) {
  var css = fs
    .readFileSync(path.join(ROOT, "assets/css", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  var bands = css.match(/box-shadow:\s*inset\s+-?\d+(\.\d+)?px\s+0(px)?\s+0(px)?\s+[^;]*;/g) || [];
  eq(file + ": no inset side band", bands.join(" | "), "");
  var lefts = (css.match(/border-(left|right|inline-start|inline-end)\s*:[^;]*;/g) || []).filter(function (d) {
    // a neutral 1 px divider inside a split chip is not an accent band
    return !/:\s*(none|0)\s*;|1px solid var\(--cp-border\)/.test(d);
  });
  eq(file + ": no coloured side border", lefts.join(" | "), "");
  var washes = css.match(/linear-gradient\(\s*90deg[^;]*/g) || [];
  eq(file + ": no horizontal colour wash", washes.join(" | "), "");
});
// Two decorative halos flagged in the final visual check (26/10): the
// connected-phone dot of the régie and the phone's output dot keep their
// colour, without a glow or ring around them.
var studioNoComments = fs.readFileSync(path.join(ROOT, "assets/css/studio.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
var remoteNoComments = fs.readFileSync(path.join(ROOT, "assets/css/remote.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function rulesFor(css, selectorTest) {
  return (css.match(/[^{}]+\{[^}]*\}/g) || []).filter(function (rule) {
    return selectorTest.test(rule.slice(0, rule.indexOf("{")));
  });
}
eq(
  "régie: the connected-phone dot has no halo",
  rulesFor(studioNoComments, /\.remote-count\.is-connected::before/).filter(function (r) { return /box-shadow:(?!\s*none\b)/.test(r); }).join(" | "),
  "",
);
eq(
  "phone: the output dot has no halo",
  rulesFor(remoteNoComments, /\.output-dot/).filter(function (r) { return /box-shadow:(?!\s*none\b)/.test(r); }).join(" | "),
  "",
);
var outputCss = fs
  .readFileSync(path.join(ROOT, "assets/css/display.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
ok(
  "the Antenne output draws no axis between the reference and the text",
  !/\.vo-axis[^{}]*\{[^}]*display:(?!\s*none)/.test(outputCss),
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
