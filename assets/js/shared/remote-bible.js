/* Contrat borné commun au relais et à la régie ; aucun texte entrant du téléphone. */
(function (root) {
  "use strict";
  function integer(n, max) { return Number.isInteger(n) && n >= 1 && n <= max; }
  function selection(s) {
    if (!s || typeof s.version !== "string" || !/^[a-z0-9_-]{1,32}$/.test(s.version) ||
        !integer(s.bookId, 100) || !integer(s.chapter, 200) ||
        !integer(s.verseStart, 176) || !integer(s.verseEnd, 176) || s.verseEnd < s.verseStart) return null;
    return {version:s.version, bookId:s.bookId, chapter:s.chapter, verseStart:s.verseStart, verseEnd:s.verseEnd};
  }
  function catalog(c) {
    if (!c || typeof c.version !== "string" || !/^[a-z0-9_-]{1,32}$/.test(c.version) || !Array.isArray(c.books)) return null;
    return {
      version:c.version, name:typeof c.name === "string" ? c.name.slice(0,80) : c.version,
      books:c.books.slice(0,100).filter(function (b) { return b && integer(b.id,100) && Array.isArray(b.chapters); }).map(function (b) {
        return {id:b.id, name:typeof b.name === "string" ? b.name.slice(0,80) : String(b.id),
          chapters:b.chapters.slice(0,200).map(function (n) { return integer(n,176) ? n : 0; })};
      }),
    };
  }
  var api = {selection:selection, catalog:catalog};
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.VerseObs = root.VerseObs || {}; root.VerseObs.RemoteBible = api; }
})(typeof window === "undefined" ? globalThis : window);
