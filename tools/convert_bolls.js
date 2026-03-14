const https = require('https');
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'bibles');
const BOOKS_DIR = path.join(__dirname, '..', 'data', 'books');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

const booksFr = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, 'books_fr.json'), 'utf8'));
const booksEn = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, 'books_en.json'), 'utf8'));

const versions = [
  { code: 'BDS', id: 'sem', name: 'Bible du Semeur', abbr: 'SEM', lang: 'fr' },
  { code: 'NBS', id: 'nbs', name: 'Nouvelle Bible Segond', abbr: 'NBS', lang: 'fr' },
  { code: 'AMP', id: 'amp', name: 'Amplified Bible', abbr: 'AMP', lang: 'en' },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'VerseObs/1.0' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

function getBookName(nr, lang) {
  const books = lang === 'en' ? booksEn : booksFr;
  const b = books.find(x => x.id === nr);
  return b ? b.name : 'Book ' + nr;
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function convert(rawPath, versionInfo) {
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const bookMap = new Map();

  for (const entry of raw) {
    const bk = entry.book;
    if (bk < 1 || bk > 66) continue;
    if (!bookMap.has(bk)) bookMap.set(bk, new Map());
    const chMap = bookMap.get(bk);
    if (!chMap.has(entry.chapter)) chMap.set(entry.chapter, []);
    chMap.get(entry.chapter).push({ verse: entry.verse, text: stripHtml(entry.text || '') });
  }

  const books = [];
  for (const bk of Array.from(bookMap.keys()).sort((a, b) => a - b)) {
    const chMap = bookMap.get(bk);
    const chapters = [];
    for (const ch of Array.from(chMap.keys()).sort((a, b) => a - b)) {
      chapters.push({ chapter: ch, verses: chMap.get(ch).sort((a, b) => a.verse - b.verse) });
    }
    books.push({ id: bk, name: getBookName(bk, versionInfo.lang), chapters });
  }

  return { meta: { id: versionInfo.id, name: versionInfo.name, abbr: versionInfo.abbr, lang: versionInfo.lang }, books };
}

async function main() {
  console.log('=== Downloading & Converting Bolls.life Bibles ===\n');

  for (const v of versions) {
    const rawFile = path.join(RAW_DIR, `bolls_${v.code}.json`);
    const outFile = path.join(OUTPUT_DIR, `${v.id}.json`);

    // Download if not exists
    if (!fs.existsSync(rawFile)) {
      const url = `https://bolls.life/static/translations/${v.code}.json`;
      console.log(`  [DL]   ${v.abbr} (${v.name})...`);
      try {
        await download(url, rawFile);
        const sz = (fs.statSync(rawFile).size / 1024 / 1024).toFixed(1);
        console.log(`         -> ${sz} MB downloaded`);
      } catch (err) {
        console.error(`         -> FAILED: ${err.message}`);
        continue;
      }
    }

    // Convert
    console.log(`  [CONV] ${v.abbr}...`);
    try {
      const result = convert(rawFile, v);
      fs.writeFileSync(outFile, JSON.stringify(result), 'utf8');
      const vc = result.books.reduce((s, b) => s + b.chapters.reduce((s2, c) => s2 + c.verses.length, 0), 0);
      const sz = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
      console.log(`         -> ${result.books.length} books, ${vc} verses (${sz} MB)`);
    } catch (err) {
      console.error(`         -> FAILED: ${err.message}`);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
