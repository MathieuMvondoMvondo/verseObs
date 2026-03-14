const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'bibles');
const BOOKS_DIR = path.join(__dirname, '..', 'data', 'books');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const booksFr = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, 'books_fr.json'), 'utf8'));

/**
 * GetBible version definitions.
 * Format: { books: [ { nr, name, chapters: [ { chapter, verses: [ { verse, text } ] } ] } ] }
 */
const versions = [
  { rawFile: 'getbible_ls1910.json', id: 'lsg', name: 'Louis Segond 1910', abbr: 'LSG', lang: 'fr' },
];

function getBookName(bookNr) {
  const book = booksFr.find((b) => b.id === bookNr);
  return book ? book.name : `Livre ${bookNr}`;
}

/**
 * Convert getbible.net v2 full Bible to VerseObs format.
 */
function convertGetBible(rawData, versionInfo) {
  const { id, name, abbr, lang } = versionInfo;
  const rawBooks = rawData.books || [];
  const books = [];

  for (const rawBook of rawBooks) {
    const bookNr = rawBook.nr;
    if (bookNr < 1 || bookNr > 66) continue;

    const bookName = getBookName(bookNr);
    const chapters = [];

    for (const rawCh of (rawBook.chapters || [])) {
      const verses = [];
      for (const rawV of (rawCh.verses || [])) {
        verses.push({
          verse: rawV.verse,
          text: (rawV.text || '').trim()
        });
      }
      chapters.push({ chapter: rawCh.chapter, verses });
    }

    books.push({ id: bookNr, name: bookName, chapters });
  }

  books.sort((a, b) => a.id - b.id);

  return {
    meta: { id, name, abbr, lang },
    books
  };
}

function main() {
  console.log('=== Converting GetBible.net Bibles to VerseObs format ===\n');

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
      const result = convertGetBible(rawData, version);

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
