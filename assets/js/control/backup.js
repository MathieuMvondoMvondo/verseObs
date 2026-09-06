/* Portable durable data only: transient display commands are never restored. */
(function () {
  "use strict";
  var V = window.VerseObs;
  var KEYS = [
    "verseobs_settings",
    "verseobs_freetext_style",
    "verseobs_freetext_style_bgimage",
    "verseobs_bgimage",
    "verseobs_favorites",
    "verseobs_history",
    "verseobs_saved_texts",
    "verseobs_queue",
    "verseobs_session_name",
    "verseobs_selection",
    "verseobs_bilingual",
    "verseobs_draft",
  ];
  function validate(payload) {
    if (
      !payload ||
      payload.app !== "verseobs" ||
      payload.version !== 1 ||
      !payload.data ||
      Array.isArray(payload.data)
    )
      throw new Error("Ce fichier n’est pas une sauvegarde VerseObs.");
    var clean = {};
    KEYS.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(payload.data, key)) return;
      var raw = payload.data[key];
      if (typeof raw !== "string" || raw.length > 4000000)
        throw new Error("Donnée invalide : " + key);
      if (key === "verseobs_session_name") {
        if (raw.length > 100) throw new Error("Nom de session trop long.");
        clean[key] = raw;
        return;
      }
      if (
        key === "verseobs_bgimage" ||
        key === "verseobs_freetext_style_bgimage"
      ) {
        if (
          raw &&
          !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(raw)
        )
          throw new Error("Image de sauvegarde invalide.");
        clean[key] = raw;
        return;
      }
      var value = JSON.parse(raw);
      if (key === "verseobs_queue") {
        if (!value || !Array.isArray(value.items))
          throw new Error("Conducteur invalide.");
        value = {
          items: V.Queue.validateItems(value.items),
          currentIndex: Number.isInteger(value.currentIndex)
            ? value.currentIndex
            : 0,
        };
      } else if (
        [
          "verseobs_favorites",
          "verseobs_history",
          "verseobs_saved_texts",
        ].includes(key)
      ) {
        if (!Array.isArray(value) || value.length > 1000)
          throw new Error("Liste invalide.");
        value = value.map(function (item) {
          if (
            !item ||
            typeof item !== "object" ||
            typeof item.text !== "string"
          )
            throw new Error("Texte invalide.");
          var entry = {};
          [
            "reference",
            "version",
            "text",
            "title",
            "subtitle",
            "name",
            "bookId",
            "chapter",
            "verse",
            "timestamp",
          ].forEach(function (k) {
            if (item[k] !== undefined) {
              if (!["string", "number"].includes(typeof item[k]))
                throw new Error("Champ invalide.");
              entry[k] = item[k];
            }
          });
          if (item.secondary)
            entry.secondary = V.validateSecondary(item.secondary);
          if (item.html) entry.html = V.sanitizeHtml(item.html);
          return entry;
        });
      } else if (
        key === "verseobs_settings" ||
        key === "verseobs_freetext_style"
      ) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Réglages invalides.");
        var settings = {};
        var defaults =
          key === "verseobs_settings" ? V.DEFAULTS : V.FREETEXT_DEFAULTS;
        Object.keys(defaults).forEach(function (k) {
          if (
            !Object.prototype.hasOwnProperty.call(value, k) ||
            k === "bgImage"
          )
            return;
          if (
            typeof value[k] !== typeof defaults[k] ||
            (typeof value[k] === "number" && !Number.isFinite(value[k]))
          )
            throw new Error("Réglage invalide : " + k);
          if (typeof value[k] === "string" && value[k].length > 1000)
            throw new Error("Réglage trop long.");
          settings[k] = value[k];
        });
        value = settings;
      } else if (key === "verseobs_draft") {
        if (
          !value ||
          typeof value.text !== "string" ||
          value.text.length > 100000
        )
          throw new Error("Brouillon invalide.");
        value = {
          text: value.text,
          title: String(value.title || "").slice(0, 500),
          subtitle: String(value.subtitle || "").slice(0, 500),
          html: V.sanitizeHtml(value.html || ""),
        };
      } else if (key === "verseobs_bilingual") {
        if (
          !value ||
          typeof value.enabled !== "boolean" ||
          typeof value.version !== "string" ||
          !/^[a-z0-9_-]{1,30}$/.test(value.version)
        )
          throw new Error("Choix des traductions invalide.");
        value = { enabled: value.enabled, version: value.version };
      } else if (key === "verseobs_selection") {
        if (
          !value ||
          typeof value.version !== "string" ||
          !value.selection ||
          typeof value.selection.bookId !== "string" ||
          !Number.isInteger(value.selection.chapter) ||
          !Number.isInteger(value.selection.verse)
        )
          throw new Error("Sélection invalide.");
      }
      clean[key] = JSON.stringify(value);
    });
    if (!Object.keys(clean).length) throw new Error("La sauvegarde est vide.");
    return clean;
  }
  V.Backup = {
    keys: KEYS,
    validate: validate,
    apply: function (payload, storage) {
      var clean = validate(payload),
        previous = {};
      Object.keys(clean).forEach(function (k) {
        previous[k] = storage.getItem(k);
      });
      try {
        Object.keys(clean).forEach(function (k) {
          storage.setItem(k, clean[k]);
        });
      } catch (e) {
        Object.keys(previous).forEach(function (k) {
          try {
            if (previous[k] === null) storage.removeItem(k);
            else storage.setItem(k, previous[k]);
          } catch (ignore) {}
        });
        throw new Error(
          "Stockage insuffisant. Les données précédentes ont été conservées.",
        );
      }
      return Object.keys(clean).length;
    },
  };
})();
