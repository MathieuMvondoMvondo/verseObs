const https = require('https');
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');

// Ensure raw directory exists
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

/**
 * Download a file from a URL and save it locally.
 * Follows redirects (up to 5).
 */
function download(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error(`Too many redirects for ${url}`));
    }

    https.get(url, { headers: { 'User-Agent': 'VerseObs/1.0' } }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return download(redirectUrl, destPath, maxRedirects - 1).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

// Scrollmapper Bible files from GitHub
// Repository: scrollmapper/bible_databases (master branch)
// Path: formats/json/
const SCROLLMAPPER_BASE = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/';

const scrollmapperFiles = [
  { file: 'FreBDM1744.json', desc: 'Martin 1744 (MAR)' },
  { file: 'FreJND.json', desc: 'Darby Français (DRB)' },
  { file: 'FreCrampon.json', desc: 'Crampon 1923 (CRA)' },
  { file: 'FrePGR.json', desc: 'Perret-Gentil et Rilliet (PGR)' },
  { file: 'FreOltramare1874.json', desc: 'Oltramare 1874 (OLT)' },
  { file: 'FreGeneve1669.json', desc: 'Genève 1669 (GEN)' },
  { file: 'KJV.json', desc: 'King James Version (KJV)' },
  { file: 'Darby.json', desc: 'Darby English (DBY)' },
];

// GetBible.net API v2 - full Bible downloads
const getbibleVersions = [
  { id: 'ls1910', file: 'getbible_ls1910.json', desc: 'Louis Segond 1910 (LSG)' },
  { id: 'kjv', file: 'getbible_kjv.json', desc: 'King James Version - getbible (KJV backup)' },
];

async function downloadScrollmapper() {
  console.log('=== Downloading Scrollmapper Bible files ===\n');

  for (const entry of scrollmapperFiles) {
    const url = SCROLLMAPPER_BASE + entry.file;
    const destPath = path.join(RAW_DIR, entry.file);

    if (fs.existsSync(destPath)) {
      console.log(`  [SKIP] ${entry.desc} - already exists`);
      continue;
    }

    console.log(`  [DL]   ${entry.desc} ...`);
    try {
      await download(url, destPath);
      const size = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(`         -> saved to raw/${entry.file} (${size} MB)`);
    } catch (err) {
      console.error(`         -> FAILED: ${err.message}`);
    }
  }
}

async function downloadGetBible() {
  console.log('\n=== Downloading GetBible.net Bible files ===\n');

  for (const entry of getbibleVersions) {
    const url = `https://api.getbible.net/v2/${entry.id}.json`;
    const destPath = path.join(RAW_DIR, entry.file);

    if (fs.existsSync(destPath)) {
      console.log(`  [SKIP] ${entry.desc} - already exists`);
      continue;
    }

    console.log(`  [DL]   ${entry.desc} ...`);
    try {
      await download(url, destPath);
      const size = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(`         -> saved to raw/${entry.file} (${size} MB)`);
    } catch (err) {
      console.error(`         -> FAILED: ${err.message}`);
    }
  }
}

async function main() {
  console.log('VerseObs Bible Downloader\n');
  console.log(`Raw data directory: ${RAW_DIR}\n`);

  await downloadScrollmapper();
  await downloadGetBible();

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
