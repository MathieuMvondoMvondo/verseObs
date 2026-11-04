"use strict";
// Frontière du relais : seules des coordonnées présentes dans un fichier local
// peuvent devenir une carte. Aucun texte biblique fourni par le moteur/modèle
// n'est utilisé, et aucun message de programme n'est construit ici.
const fs = require('node:fs');
const path = require('node:path');
const VERSIONS = new Set(['lsg', 'nbs', 'sem', 'mar', 'drb', 'pgr', 'olt', 'gen', 'kjv', 'dby', 'amp']);
const cache = new Map();
const names = require('../data/books/books_fr.json');
function heardProposal(p, now = Date.now()) {
  if (!p || typeof p !== 'object' || !VERSIONS.has(p.version)) return null;
  if (!['reference', 'lexical', 'model'].includes(p.method)) return null;
  if (!Number.isFinite(p.confidence) || p.confidence < .9 || p.confidence > 1) return null;
  for (const k of ['bookId', 'chapter', 'verse', 'verseEnd'])
    if (!Number.isInteger(p[k])) return null;
  if (p.bookId < 1 || p.bookId > 66 || p.chapter < 1 || p.chapter > 150) return null;
  if (p.verse < 0 || p.verseEnd < p.verse || p.verseEnd > 176 || p.verseEnd - p.verse > 30) return null;
  if ((!p.verse && p.verseEnd) || (!p.verse && p.method !== 'reference')) return null;
  if (!Number.isFinite(p.end) || now - p.end < -500 || now - p.end > 8000) return null;
  let bible = cache.get(p.version);
  if (!bible) {
    try { bible = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/bibles', p.version + '.json'), 'utf8')); }
    catch { return null; }
    cache.set(p.version, bible);
  }
  const book = bible.books.find(b => b.id === p.bookId);
  const chapter = book && book.chapters.find(c => c.chapter === p.chapter);
  if (!chapter) return null;
  const verses = [];
  for (let v = p.verse || 1; v <= (p.verseEnd || 1); v++) {
    const verse = chapter.verses.find(x => x.verse === v);
    if (!verse) return null;
    verses.push(verse.text.replace(/\s+/g, ' ').trim());
  }
  const reference = names.find(b => b.id === p.bookId).name + ' ' + p.chapter +
    (p.verse ? ':' + p.verse + (p.verseEnd > p.verse ? '-' + p.verseEnd : '') : '');
  return {
    version: p.version, bookId: p.bookId, chapter: p.chapter, verse: p.verse, verseEnd: p.verseEnd,
    reference, text: verses.join(' '), method: p.method, confidence: p.confidence,
    heard: typeof p.heard === 'string' ? p.heard.slice(0, 1200) : '',
    end: p.end, ready: now, latency: Math.max(0, now - p.end) / 1000,
  };
}
module.exports = { heardProposal };
