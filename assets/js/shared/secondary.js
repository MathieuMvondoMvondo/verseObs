/* A portable second translation; never accept executable imported markup. */
(function () {
  "use strict";
  var V = window.VerseObs;
  V.validateSecondary = function (value) {
    if (value == null) return null;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.text !== "string" ||
      !value.text.trim()
    )
      throw new Error("Deuxième traduction invalide.");
    var clean = {};
    ["text", "html", "reference", "version", "lang"].forEach(function (key) {
      var v = value[key] == null ? "" : value[key];
      var max = key === "text" ? 30000 : key === "html" ? 100000 : 300;
      if (typeof v !== "string" || v.length > max)
        throw new Error("Deuxième traduction invalide : " + key);
      clean[key] = key === "html" ? V.sanitizeHtml(v) : v;
    });
    if (clean.lang && !/^[a-z]{2,3}(-[a-zA-Z]{2,8})?$/.test(clean.lang))
      throw new Error("Langue invalide.");
    return clean;
  };
  V.secondaryText = function (item) {
    return item && item.secondary
      ? "\n\n" +
          item.secondary.reference +
          " · " +
          item.secondary.version +
          "\n" +
          item.secondary.text
      : "";
  };
})();
