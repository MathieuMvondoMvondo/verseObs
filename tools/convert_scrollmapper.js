const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'bibles');
const BOOKS_DIR = path.join(__dirname, '..', 'data', 'books');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load book name files
const booksFr = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, 'books_fr.json'), 'utf8'));
const booksEn = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, 'books_en.json'), 'utf8'));

/**
 * Scrollmapper version definitions.
 * Format: { translation: "...", books: [ { name, chapters: [ { chapter, verses: [ { verse, text } ] } ] } ] }
 * Books are in canonical order (Genesis=1, Exodus=2, ..., Revelation=66) but have no ID field.
 */
const versions = [
  { rawFile: 'FreBDM1744.json', id: 'mar', name: 'Martin 1744', abbr: 'MAR', lang: 'fr' },
  { rawFile: 'FreJND.json', id: 'drb', name: 'Darby Français', abbr: 'DRB', lang: 'fr' },
  { rawFile: 'FreCrampon.json', id: 'cra', name: 'Crampon 1923', abbr: 'CRA', lang: 'fr' },
  { rawFile: 'FrePGR.json', id: 'pgr', name: 'Perret-Gentil et Rilliet', abbr: 'PGR', lang: 'fr' },
  { rawFile: 'FreOltramare1874.json', id: 'olt', name: 'Oltramare 1874', abbr: 'OLT', lang: 'fr' },
  { rawFile: 'FreGeneve1669.json', id: 'gen', name: 'Genève 1669', abbr: 'GEN', lang: 'fr' },
  { rawFile: 'KJV.json', id: 'kjv', name: 'King James Version', abbr: 'KJV', lang: 'en' },
  { rawFile: 'Darby.json', id: 'dby', name: 'Darby English', abbr: 'DBY', lang: 'en' },
];

/**
 * Get canonical book name by index (0-based) and language.
 */
function getBookName(index, lang) {
  const books = lang === 'en' ? booksEn : booksFr;
  // index is 0-based, book IDs are 1-based
  if (index >= 0 && index < books.length) {
    return books[index].name;
  }
  return `Book ${index + 1}`;
}

/**
 * Convert scrollmapper JSON data to VerseObs format.
 * Scrollmapper format: { translation, books: [ { name, chapters: [ { chapter, verses: [ { verse, text } ] } ] } ] }
 * VerseObs format: { meta, books: [ { id, name, chapters: [ { chapter, verses: [ { verse, text } ] } ] } ] }
 */
function convertScrollmapper(rawData, versionInfo) {
  const { id, name, abbr, lang } = versionInfo;
  const rawBooks = rawData.books || [];

  const books = [];

  for (let i = 0; i < rawBooks.length; i++) {
    const rawBook = rawBooks[i];
    const bookId = i + 1; // 1-based canonical order

    // Only include canonical books (1-66)
    if (bookId > 66) break;

    // Use our standardized book name
    const bookName = getBookName(i, lang);

    // Chapters are already in the right format
    const chapters = (rawBook.chapters || []).map((ch) => {
      return {
        chapter: ch.chapter,
        verses: (ch.verses || []).map((v) => ({
          verse: v.verse,
          text: (v.text || '').trim()
        }))
      };
    });

    books.push({ id: bookId, name: bookName, chapters });
  }

  return {
    meta: { id, name, abbr, lang },
    books,
  };
}

function main() {
  console.log('=== Converting Scrollmapper Bibles to VerseObs format ===\n');

  for (const version of versions) {
    const rawPath = path.join(RAW_DIR, version.rawFile);

    if (!fs.existsSync(rawPath)) {
      console.log(`  [SKIP] ${version.abbr} - raw file not found: ${version.rawFile}`);
      continue;
    }

    console.log(`  [CONV] ${version.abbr} (${version.name}) ...`);

    try {
      const rawContent = fs.readFileSync(rawPath, 'utf8');
      const rawData = JSON.parse(rawContent);
      const result = convertScrollmapper(rawData, version);

      const outputPath = path.join(OUTPUT_DIR, `${version.id}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result), 'utf8');

      const bookCount = result.books.length;
      const verseCount = result.books.reduce(
        (sum, b) => sum + b.chapters.reduce((s, c) => s + c.verses.length, 0),
        0
      );
      const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`         -> ${bookCount} books, ${verseCount} verses (${size} MB) -> data/bibles/${version.id}.json`);
    } catch (err) {
      console.error(`         -> FAILED: ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main();
