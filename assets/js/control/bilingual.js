/* Prepare two translations together; only an explicit broadcast changes output. */
(function () {
  "use strict";
  var V = window.VerseObs;
  V.Bilingual = function (options) {
    var self = this,
      loader = options.loader,
      select = document.getElementById("secondary-version"),
      toggle = document.getElementById("bilingual-toggle"),
      panel = document.getElementById("secondary-preparation"),
      editor = document.getElementById("secondary-text"),
      status = document.getElementById("bilingual-status"),
      versions = [],
      enabled = false,
      busy = false,
      failure = false,
      request = 0,
      current = null,
      signature = "";
    function save() {
      try {
        localStorage.setItem(
          "verseobs_bilingual",
          JSON.stringify({ enabled: enabled, version: select.value }),
        );
      } catch (e) {
        options.notify(
          "Ce choix ne peut pas être enregistré sur cet appareil.",
          "error",
        );
      }
    }
    function controls(message) {
      panel.hidden = !enabled;
      document.getElementById("secondary-version-field").hidden = !enabled;
      document.getElementById("primary-version-label").hidden = !enabled;
      document
        .querySelector(".cp-preview")
        .classList.toggle("is-bilingual", enabled);
      status.textContent = message || "";
      status.hidden = !message;
      editor.disabled = !current || busy;
      ["btn-show", "btn-add-queue"].forEach(function (id) {
        document.getElementById(id).disabled =
          enabled && (!current || busy || !editor.value.trim());
      });
    }
    function entry() {
      return versions.find(function (v) {
        return v.id === select.value;
      });
    }
    /**
     * The second translation of a passage, or null when it is incomplete.
     * A whole chapter (start = null) keeps every verse of that version.
     */
    function build(bookId, chapter, start, end) {
      var version = entry(),
        id = select.value,
        passage;
      if (!version) return null;
      if (start == null) {
        var verses = loader.getChapter(id, bookId, chapter);
        if (!verses || !verses.length) return null;
        passage = loader.getRange(
          id,
          bookId,
          chapter,
          verses[0].verse,
          verses[verses.length - 1].verse,
        );
        if (!passage) return null;
        passage.reference = passage.reference.slice(
          0,
          passage.reference.lastIndexOf(":"),
        );
      } else {
        end = Math.max(start, end || start);
        for (var v = start; v <= end; v++)
          if (!loader.getVerse(id, bookId, chapter, v)) return null;
        passage =
          end > start
            ? loader.getRange(id, bookId, chapter, start, end)
            : loader.getVerse(id, bookId, chapter, start);
      }
      return {
        text: passage.text,
        html: passage.html || "",
        reference: passage.reference,
        version: version.name,
        lang: version.lang || "",
      };
    }
    self.refresh = function () {
      var selection = options.selection();
      document.getElementById("primary-version-label").textContent =
        document.getElementById("version-select").selectedOptions[0]
          ?.textContent || "Première version";
      if (!enabled) {
        controls("");
        return;
      }
      if (busy) {
        current = null;
        controls("Chargement de la deuxième version…");
        return;
      }
      if (!selection) {
        current = null;
        controls("Préparation du passage…");
        return;
      }
      if (select.value === selection.version) {
        current = null;
        controls("Choisissez deux versions différentes.");
        return;
      }
      if (failure) {
        current = null;
        controls(
          "Version indisponible. Réessayez ou désactivez le mode bilingue.",
        );
        return;
      }
      var next = [
        select.value,
        selection.version,
        selection.bookId,
        selection.chapter,
        selection.verse,
        selection.end,
      ].join(":");
      if (signature === next && current) {
        controls("");
        return;
      }
      current = build(
        selection.bookId,
        selection.chapter,
        selection.verse,
        selection.end,
      );
      if (!current) {
        signature = "";
        editor.value = "";
        controls(
          "Ce passage n’est pas complet dans cette version. Choisissez une autre version ou un autre passage.",
        );
        return;
      }
      signature = next;
      editor.value = current.text;
      editor.lang = current.lang;
      document.getElementById("secondary-reference").textContent =
        current.reference;
      document.getElementById("secondary-version-label").textContent =
        current.version;
      controls("");
    };
    function load() {
      signature = "";
      current = null;
      failure = false;
      var token = ++request;
      busy = enabled;
      self.refresh();
      options.changed();
      if (!enabled) return;
      loader.loadBible(select.value, function (error) {
        if (token !== request) return;
        busy = false;
        failure = !!error;
        self.refresh();
        options.changed();
      });
    }
    self.init = function (index) {
      versions = index.versions;
      versions.forEach(function (entry) {
        var option = document.createElement("option");
        option.value = entry.id;
        option.textContent =
          (entry.lang || "").toUpperCase() + " · " + entry.name;
        select.appendChild(option);
      });
      var saved = {};
      try {
        saved = JSON.parse(localStorage.getItem("verseobs_bilingual")) || {};
      } catch (e) {}
      select.value = versions.some(function (v) {
        return v.id === saved.version;
      })
        ? saved.version
        : "kjv";
      if (!select.value) select.value = versions[0].id;
      enabled = saved.enabled === true;
      toggle.checked = enabled;
      toggle.disabled = false;
      toggle.addEventListener("change", function () {
        enabled = toggle.checked;
        save();
        load();
      });
      select.addEventListener("change", function () {
        save();
        load();
      });
      editor.addEventListener("input", function () {
        controls(
          editor.value.trim()
            ? ""
            : "Ajoutez le texte de la deuxième traduction avant de diffuser.",
        );
        options.changed();
      });
      document
        .getElementById("secondary-retry")
        .addEventListener("click", load);
      load();
    };
    /** Mode of a plan import: same rules as adding the prepared passage. */
    self.planMode = function (primaryId) {
      var version = entry();
      if (!enabled) return { enabled: false, ready: true, message: "" };
      var message = busy
        ? "Chargement de la deuxième version…"
        : failure
          ? "Deuxième version indisponible : réessayez dans Bible ou désactivez « Deux versions »."
          : select.value === primaryId
            ? "Choisissez deux versions différentes dans Bible (« Deux versions »)."
            : "";
      return {
        enabled: true,
        ready: !message,
        message: message,
        name: version ? version.name : "",
        abbr: version ? version.abbr || select.value.toUpperCase() : "",
      };
    };
    self.secondaryFor = function (bookId, chapter, start, end) {
      return enabled && !busy && !failure ? build(bookId, chapter, start, end) : null;
    };
    self.ready = function () {
      return !enabled || (!busy && !!current && !!editor.value.trim());
    };
    self.value = function () {
      if (!enabled || !self.ready()) return null;
      return Object.assign({}, current, {
        text: editor.value,
        html: editor.value === current.text ? current.html : "",
      });
    };
  };
})();
