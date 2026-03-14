window.VerseObs = window.VerseObs || {};

window.VerseObs.BOOKS = [
  // ── Old Testament (39 books) ──
  { id: 1,  name_fr: 'Genèse',           name_en: 'Genesis',         abbr_fr: ['Gn', 'Gen', 'Ge'],              abbr_en: ['Gen', 'Ge', 'Gn'] },
  { id: 2,  name_fr: 'Exode',             name_en: 'Exodus',          abbr_fr: ['Ex', 'Exo'],                    abbr_en: ['Exod', 'Ex', 'Exo'] },
  { id: 3,  name_fr: 'Lévitique',         name_en: 'Leviticus',       abbr_fr: ['Lv', 'Lév', 'Lev'],             abbr_en: ['Lev', 'Lv', 'Le'] },
  { id: 4,  name_fr: 'Nombres',           name_en: 'Numbers',         abbr_fr: ['Nb', 'Nom', 'No'],              abbr_en: ['Num', 'Nu', 'Nm'] },
  { id: 5,  name_fr: 'Deutéronome',       name_en: 'Deuteronomy',     abbr_fr: ['Dt', 'Deut', 'De'],             abbr_en: ['Deut', 'Dt', 'De'] },
  { id: 6,  name_fr: 'Josué',             name_en: 'Joshua',          abbr_fr: ['Jos', 'Js'],                    abbr_en: ['Josh', 'Jos', 'Jo'] },
  { id: 7,  name_fr: 'Juges',             name_en: 'Judges',          abbr_fr: ['Jg', 'Jug', 'Ju'],              abbr_en: ['Judg', 'Jdg', 'Jg'] },
  { id: 8,  name_fr: 'Ruth',              name_en: 'Ruth',            abbr_fr: ['Rt', 'Ru'],                     abbr_en: ['Ruth', 'Ru', 'Rt'] },
  { id: 9,  name_fr: '1 Samuel',          name_en: '1 Samuel',        abbr_fr: ['1 S', '1S', '1 Sa', '1Sa'],     abbr_en: ['1 Sam', '1Sam', '1 Sa', '1Sa'] },
  { id: 10, name_fr: '2 Samuel',          name_en: '2 Samuel',        abbr_fr: ['2 S', '2S', '2 Sa', '2Sa'],     abbr_en: ['2 Sam', '2Sam', '2 Sa', '2Sa'] },
  { id: 11, name_fr: '1 Rois',            name_en: '1 Kings',         abbr_fr: ['1 R', '1R', '1 Ro', '1Ro'],     abbr_en: ['1 Kgs', '1Kgs', '1 Ki', '1Ki'] },
  { id: 12, name_fr: '2 Rois',            name_en: '2 Kings',         abbr_fr: ['2 R', '2R', '2 Ro', '2Ro'],     abbr_en: ['2 Kgs', '2Kgs', '2 Ki', '2Ki'] },
  { id: 13, name_fr: '1 Chroniques',      name_en: '1 Chronicles',    abbr_fr: ['1 Ch', '1Ch', '1 Chr'],         abbr_en: ['1 Chr', '1Chr', '1 Ch', '1Ch'] },
  { id: 14, name_fr: '2 Chroniques',      name_en: '2 Chronicles',    abbr_fr: ['2 Ch', '2Ch', '2 Chr'],         abbr_en: ['2 Chr', '2Chr', '2 Ch', '2Ch'] },
  { id: 15, name_fr: 'Esdras',            name_en: 'Ezra',            abbr_fr: ['Esd', 'Ed'],                    abbr_en: ['Ezra', 'Ezr', 'Ez'] },
  { id: 16, name_fr: 'Néhémie',           name_en: 'Nehemiah',        abbr_fr: ['Né', 'Neh', 'Ne'],              abbr_en: ['Neh', 'Ne'] },
  { id: 17, name_fr: 'Esther',            name_en: 'Esther',          abbr_fr: ['Est', 'Es'],                    abbr_en: ['Esth', 'Est', 'Es'] },
  { id: 18, name_fr: 'Job',               name_en: 'Job',             abbr_fr: ['Jb', 'Job'],                    abbr_en: ['Job', 'Jb'] },
  { id: 19, name_fr: 'Psaumes',           name_en: 'Psalms',          abbr_fr: ['Ps', 'Psa', 'Psm'],             abbr_en: ['Ps', 'Psa', 'Psm'] },
  { id: 20, name_fr: 'Proverbes',         name_en: 'Proverbs',        abbr_fr: ['Pr', 'Pro', 'Prov'],             abbr_en: ['Prov', 'Pr', 'Pro'] },
  { id: 21, name_fr: 'Ecclésiaste',       name_en: 'Ecclesiastes',    abbr_fr: ['Ec', 'Ecc', 'Qo'],              abbr_en: ['Eccl', 'Ecc', 'Ec'] },
  { id: 22, name_fr: 'Cantique des Cantiques', name_en: 'Song of Solomon', abbr_fr: ['Ct', 'Ca', 'Cant'],        abbr_en: ['Song', 'SoS', 'SS'] },
  { id: 23, name_fr: 'Ésaïe',             name_en: 'Isaiah',          abbr_fr: ['Es', 'Esa', 'Ésa'],             abbr_en: ['Isa', 'Is'] },
  { id: 24, name_fr: 'Jérémie',           name_en: 'Jeremiah',        abbr_fr: ['Jr', 'Jér', 'Jer'],             abbr_en: ['Jer', 'Jr', 'Je'] },
  { id: 25, name_fr: 'Lamentations',      name_en: 'Lamentations',    abbr_fr: ['Lm', 'Lam', 'La'],              abbr_en: ['Lam', 'Lm', 'La'] },
  { id: 26, name_fr: 'Ézéchiel',          name_en: 'Ezekiel',         abbr_fr: ['Ez', 'Éz', 'Eze'],              abbr_en: ['Ezek', 'Ez', 'Eze'] },
  { id: 27, name_fr: 'Daniel',            name_en: 'Daniel',          abbr_fr: ['Dn', 'Dan', 'Da'],              abbr_en: ['Dan', 'Dn', 'Da'] },
  { id: 28, name_fr: 'Osée',              name_en: 'Hosea',           abbr_fr: ['Os', 'Osé'],                    abbr_en: ['Hos', 'Ho'] },
  { id: 29, name_fr: 'Joël',              name_en: 'Joel',            abbr_fr: ['Jl', 'Joë', 'Joe'],             abbr_en: ['Joel', 'Jl', 'Joe'] },
  { id: 30, name_fr: 'Amos',              name_en: 'Amos',            abbr_fr: ['Am', 'Amo'],                    abbr_en: ['Amos', 'Am', 'Amo'] },
  { id: 31, name_fr: 'Abdias',            name_en: 'Obadiah',         abbr_fr: ['Ab', 'Abd'],                    abbr_en: ['Obad', 'Ob'] },
  { id: 32, name_fr: 'Jonas',             name_en: 'Jonah',           abbr_fr: ['Jon', 'Jo'],                    abbr_en: ['Jonah', 'Jon'] },
  { id: 33, name_fr: 'Michée',            name_en: 'Micah',           abbr_fr: ['Mi', 'Mic'],                    abbr_en: ['Mic', 'Mi'] },
  { id: 34, name_fr: 'Nahum',             name_en: 'Nahum',           abbr_fr: ['Na', 'Nah'],                    abbr_en: ['Nah', 'Na'] },
  { id: 35, name_fr: 'Habacuc',           name_en: 'Habakkuk',        abbr_fr: ['Ha', 'Hab'],                    abbr_en: ['Hab', 'Ha'] },
  { id: 36, name_fr: 'Sophonie',          name_en: 'Zephaniah',       abbr_fr: ['So', 'Sop', 'Soph'],            abbr_en: ['Zeph', 'Zep', 'Zp'] },
  { id: 37, name_fr: 'Aggée',             name_en: 'Haggai',          abbr_fr: ['Ag', 'Agg'],                    abbr_en: ['Hag', 'Hg'] },
  { id: 38, name_fr: 'Zacharie',          name_en: 'Zechariah',       abbr_fr: ['Za', 'Zac', 'Zach'],            abbr_en: ['Zech', 'Zec', 'Zc'] },
  { id: 39, name_fr: 'Malachie',          name_en: 'Malachi',         abbr_fr: ['Ml', 'Mal', 'Ma'],              abbr_en: ['Mal', 'Ml', 'Ma'] },

  // ── New Testament (27 books) ──
  { id: 40, name_fr: 'Matthieu',          name_en: 'Matthew',         abbr_fr: ['Mt', 'Mat', 'Matt'],             abbr_en: ['Matt', 'Mt', 'Mat'] },
  { id: 41, name_fr: 'Marc',              name_en: 'Mark',            abbr_fr: ['Mc', 'Mar', 'Mrc'],              abbr_en: ['Mark', 'Mk', 'Mr'] },
  { id: 42, name_fr: 'Luc',               name_en: 'Luke',            abbr_fr: ['Lc', 'Luc', 'Lu'],               abbr_en: ['Luke', 'Lk', 'Lu'] },
  { id: 43, name_fr: 'Jean',              name_en: 'John',            abbr_fr: ['Jn', 'Jean', 'Jea'],             abbr_en: ['John', 'Jn', 'Joh'] },
  { id: 44, name_fr: 'Actes',             name_en: 'Acts',            abbr_fr: ['Ac', 'Act'],                     abbr_en: ['Acts', 'Ac', 'Act'] },
  { id: 45, name_fr: 'Romains',           name_en: 'Romans',          abbr_fr: ['Rm', 'Rom', 'Ro'],               abbr_en: ['Rom', 'Rm', 'Ro'] },
  { id: 46, name_fr: '1 Corinthiens',     name_en: '1 Corinthians',   abbr_fr: ['1 Co', '1Co', '1 Cor', '1Cor'],  abbr_en: ['1 Cor', '1Cor', '1 Co', '1Co'] },
  { id: 47, name_fr: '2 Corinthiens',     name_en: '2 Corinthians',   abbr_fr: ['2 Co', '2Co', '2 Cor', '2Cor'],  abbr_en: ['2 Cor', '2Cor', '2 Co', '2Co'] },
  { id: 48, name_fr: 'Galates',           name_en: 'Galatians',       abbr_fr: ['Ga', 'Gal'],                     abbr_en: ['Gal', 'Ga'] },
  { id: 49, name_fr: 'Éphésiens',         name_en: 'Ephesians',       abbr_fr: ['Ep', 'Éph', 'Eph'],              abbr_en: ['Eph', 'Ep'] },
  { id: 50, name_fr: 'Philippiens',       name_en: 'Philippians',     abbr_fr: ['Ph', 'Php', 'Phil'],             abbr_en: ['Phil', 'Php', 'Ph'] },
  { id: 51, name_fr: 'Colossiens',        name_en: 'Colossians',      abbr_fr: ['Col', 'Co'],                     abbr_en: ['Col', 'Co'] },
  { id: 52, name_fr: '1 Thessaloniciens', name_en: '1 Thessalonians', abbr_fr: ['1 Th', '1Th', '1 The', '1The'],  abbr_en: ['1 Thess', '1Thess', '1 Th', '1Th'] },
  { id: 53, name_fr: '2 Thessaloniciens', name_en: '2 Thessalonians', abbr_fr: ['2 Th', '2Th', '2 The', '2The'],  abbr_en: ['2 Thess', '2Thess', '2 Th', '2Th'] },
  { id: 54, name_fr: '1 Timothée',        name_en: '1 Timothy',       abbr_fr: ['1 Ti', '1Ti', '1 Tm', '1Tm'],    abbr_en: ['1 Tim', '1Tim', '1 Ti', '1Ti'] },
  { id: 55, name_fr: '2 Timothée',        name_en: '2 Timothy',       abbr_fr: ['2 Ti', '2Ti', '2 Tm', '2Tm'],    abbr_en: ['2 Tim', '2Tim', '2 Ti', '2Ti'] },
  { id: 56, name_fr: 'Tite',              name_en: 'Titus',           abbr_fr: ['Tt', 'Tit'],                     abbr_en: ['Titus', 'Tit', 'Tt'] },
  { id: 57, name_fr: 'Philémon',          name_en: 'Philemon',        abbr_fr: ['Phm', 'Plm'],                    abbr_en: ['Phlm', 'Phm', 'Pm'] },
  { id: 58, name_fr: 'Hébreux',           name_en: 'Hebrews',         abbr_fr: ['Hé', 'Héb', 'Heb', 'He'],        abbr_en: ['Heb', 'He'] },
  { id: 59, name_fr: 'Jacques',           name_en: 'James',           abbr_fr: ['Jc', 'Jac', 'Ja'],               abbr_en: ['Jas', 'Jm', 'Ja'] },
  { id: 60, name_fr: '1 Pierre',          name_en: '1 Peter',         abbr_fr: ['1 P', '1P', '1 Pi', '1Pi'],      abbr_en: ['1 Pet', '1Pet', '1 Pe', '1Pe'] },
  { id: 61, name_fr: '2 Pierre',          name_en: '2 Peter',         abbr_fr: ['2 P', '2P', '2 Pi', '2Pi'],      abbr_en: ['2 Pet', '2Pet', '2 Pe', '2Pe'] },
  { id: 62, name_fr: '1 Jean',            name_en: '1 John',          abbr_fr: ['1 Jn', '1Jn', '1 Jean'],         abbr_en: ['1 John', '1John', '1 Jn', '1Jn'] },
  { id: 63, name_fr: '2 Jean',            name_en: '2 John',          abbr_fr: ['2 Jn', '2Jn', '2 Jean'],         abbr_en: ['2 John', '2John', '2 Jn', '2Jn'] },
  { id: 64, name_fr: '3 Jean',            name_en: '3 John',          abbr_fr: ['3 Jn', '3Jn', '3 Jean'],         abbr_en: ['3 John', '3John', '3 Jn', '3Jn'] },
  { id: 65, name_fr: 'Jude',              name_en: 'Jude',            abbr_fr: ['Jd', 'Jude', 'Ju'],              abbr_en: ['Jude', 'Jd', 'Ju'] },
  { id: 66, name_fr: 'Apocalypse',        name_en: 'Revelation',      abbr_fr: ['Ap', 'Apo', 'Apoc'],             abbr_en: ['Rev', 'Re', 'Rv'] }
];

/**
 * Find a book by name or abbreviation in any language.
 * @param {string} query - Book name or abbreviation (e.g. "Gn", "Genesis", "Jean")
 * @returns {object|null} The matching book object or null
 */
window.VerseObs.findBook = function(query) {
  if (!query || typeof query !== 'string') return null;

  var q = query.trim();
  if (!q) return null;

  var qLower = q.toLowerCase();
  var books = window.VerseObs.BOOKS;

  // 1. Exact match on full name (case-insensitive)
  for (var i = 0; i < books.length; i++) {
    if (books[i].name_fr.toLowerCase() === qLower ||
        books[i].name_en.toLowerCase() === qLower) {
      return books[i];
    }
  }

  // 2. Exact match on abbreviation (case-insensitive)
  for (var i = 0; i < books.length; i++) {
    var abbrFr = books[i].abbr_fr;
    for (var j = 0; j < abbrFr.length; j++) {
      if (abbrFr[j].toLowerCase() === qLower) return books[i];
    }
    var abbrEn = books[i].abbr_en;
    for (var j = 0; j < abbrEn.length; j++) {
      if (abbrEn[j].toLowerCase() === qLower) return books[i];
    }
  }

  // 3. Starts-with match on full name (case-insensitive), return first match
  for (var i = 0; i < books.length; i++) {
    if (books[i].name_fr.toLowerCase().indexOf(qLower) === 0 ||
        books[i].name_en.toLowerCase().indexOf(qLower) === 0) {
      return books[i];
    }
  }

  return null;
};

/**
 * Get a book's display name by its id and language.
 * @param {number} id - Book id (1-66)
 * @param {string} [lang='fr'] - Language code ('fr' or 'en')
 * @returns {string|null} The book name or null if not found
 */
window.VerseObs.getBookName = function(id, lang) {
  var books = window.VerseObs.BOOKS;
  for (var i = 0; i < books.length; i++) {
    if (books[i].id === id) {
      return (lang === 'en') ? books[i].name_en : books[i].name_fr;
    }
  }
  return null;
};
