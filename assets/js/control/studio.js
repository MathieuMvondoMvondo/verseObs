/* Studio ergonomics, session handoff and integration guidance. */
(function () {
  "use strict";
  var V = window.VerseObs,
    api = null,
    lastChapter = "",
    lastVerse = 0,
    undo = null;
  var titles = [
    "Préparer un passage",
    "Textes & chants",
    "Conducteur de session",
    "Historique",
    "Habillage de diffusion",
    "Connexions & sorties",
  ];
  var subtitles = [
    "Votre Bible, votre prochain passage, votre diffusion.",
    "Des paroles, une annonce, un moment à partager.",
    "Une célébration préparée. Une équipe sereine.",
    "Retrouvez un passage et préparez-le à nouveau.",
    "Un habillage à votre image, jusque dans les détails.",
    "Reliez votre préparation à votre écran de diffusion.",
  ];
  function el(id) {
    return document.getElementById(id);
  }
  function on(id, fn) {
    var e = el(id);
    if (e) e.addEventListener("click", fn);
  }
  function store(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      api.notify(
        "Stockage plein : exportez votre session pour la conserver.",
        "error",
      );
      return false;
    }
  }
  function read(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }
  function download(data, name, type) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }
  function safeName(name) {
    return (
      (name || "conducteur")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "conducteur"
    );
  }
  function updateQueue() {
    var state = api.queue.getState();
    [
      "btn-queue-show",
      "session-export",
      "session-print",
      "btn-clear-queue",
    ].forEach(function (id) {
      el(id).disabled = !state.total;
    });
    el("btn-queue-prev").disabled = !state.hasPrev;
    el("btn-queue-next").disabled = !state.hasNext;
    el("tab-btn-2").setAttribute(
      "aria-label",
      "Conducteur, " + state.total + " éléments",
    );
    if (el("queue-selection-preview")) {
      var selected = api.queue.getItems()[state.current - 1];
      el("queue-selection-preview").hidden = !selected;
      el("queue-selection-title").textContent = selected
        ? selected.reference || selected.title || "Texte libre"
        : "";
      if (selected && selected.html)
        el("queue-selection-text").innerHTML = V.sanitizeHtml(selected.html);
      else
        el("queue-selection-text").textContent = selected ? selected.text : "";
    }
    el("session-saved").textContent = !state.saved
      ? "Non enregistré · exportez votre session"
      : state.total
        ? state.total +
          " élément" +
          (state.total > 1 ? "s" : "") +
          " · enregistré sur cet appareil"
        : "Sauvegarde automatique";
  }
  function markPreset() {
    var current = api.settings.getAll().template;
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.setAttribute(
        "aria-pressed",
        b.dataset.preset === current ? "true" : "false",
      );
    });
  }
  function prepareSettings() {
    var container = el("settings-container"),
      preview = document.querySelector(".cp-settings-preview");
    var rows = {};
    container.querySelectorAll("[data-setting]").forEach(function (input) {
      rows[input.dataset.setting] = input.closest(".cp-setting-row");
    });
    var oldGroups = Array.from(container.querySelectorAll(".cp-setting-group"));
    var backup = oldGroups[oldGroups.length - 1],
      reset = el("btn-reset-settings");
    var imageInput = el("bg-image-input"),
      imageRow = imageInput.closest(".cp-setting-row");
    var showcase = document.createElement("aside");
    showcase.className = "settings-showcase";
    showcase.innerHTML =
      '<div class="section-heading"><h2>Votre rendu</h2><span class="muted">Aperçu instantané</span></div>';
    showcase.appendChild(preview);
    var styles = document.querySelector(".style-choices").cloneNode(true);
    showcase.appendChild(styles);
    var note = document.createElement("p");
    note.className = "settings-explainer";
    note.textContent =
      "Choisissez une base, puis ajustez-la. Le moniteur reste à taille fixe pour garder vos réglages à portée de main.";
    showcase.appendChild(note);
    var edit = document.createElement("div");
    edit.className = "settings-edit";
    var tabs = document.createElement("div");
    tabs.className = "settings-sections";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Niveau de personnalisation");
    ["L’essentiel", "Les détails", "Sauvegarde"].forEach(function (name, i) {
      var b = document.createElement("button");
      b.textContent = name;
      b.dataset.settingsPage = i;
      b.setAttribute("aria-pressed", String(i === 0));
      tabs.appendChild(b);
    });
    edit.appendChild(tabs);
    var pages = [0, 1, 2].map(function (i) {
      var page = document.createElement("div");
      page.className = "settings-page";
      page.dataset.settingsPagePanel = i;
      page.hidden = i !== 0;
      edit.appendChild(page);
      return page;
    });
    function group(page, title, keys, hint) {
      var g = document.createElement("section");
      g.className = "settings-card";
      var h = document.createElement("h2");
      h.textContent = title;
      g.appendChild(h);
      if (hint) {
        var p = document.createElement("p");
        p.className = "settings-card-hint";
        p.textContent = hint;
        g.appendChild(p);
      }
      keys.forEach(function (key) {
        if (rows[key]) g.appendChild(rows[key]);
      });
      pages[page].appendChild(g);
      return g;
    }
    group(
      0,
      "Placer votre passage",
      ["position", "maxWidth"],
      "Où la Parole apparaît-elle sur votre écran ?",
    );
    group(0, "Rendre la lecture confortable", [
      "fontFamily",
      "fontSize",
      "textColor",
      "bgOpacity",
    ]);
    group(0, "Choisir le rythme", ["animation", "autoHide"]);
    group(1, "Composer votre carte", [
      "template",
      "refPosition",
      "padding",
      "borderRadius",
      "borderWidth",
      "shadow",
    ]);
    group(1, "Affiner la typographie", [
      "textAlign",
      "lineHeight",
      "refFontSize",
      "refColor",
      "refBgColor",
      "highlightColor",
    ]);
    group(1, "Fond et transition", [
      "bgColor",
      "borderColor",
      "animationDuration",
    ]).appendChild(imageRow);
    pages[2].appendChild(backup);
    pages[2].appendChild(reset);
    container.replaceChildren(showcase, edit);
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      tabs.querySelectorAll("button").forEach(function (btn) {
        btn.setAttribute("aria-pressed", String(btn === b));
      });
      pages.forEach(function (p, i) {
        p.hidden = String(i) !== b.dataset.settingsPage;
      });
    });
    var fonts = rows.fontFamily.querySelector("input"),
      select = document.createElement("select");
    select.className = "cp-select";
    select.dataset.setting = "fontFamily";
    [
      [
        "'Segoe UI', Calibri, 'Helvetica Neue', Arial, sans-serif",
        "Sans sérif · Moderne",
      ],
      ["Georgia, 'Times New Roman', serif", "Sérif · Éditorial"],
      ["Arial, Helvetica, sans-serif", "Arial · Universel"],
      ["'Trebuchet MS', sans-serif", "Trebuchet · Humaniste"],
    ].forEach(function (font) {
      var option = document.createElement("option");
      option.value = font[0];
      option.textContent = font[1];
      select.appendChild(option);
    });
    try {
      var stored = JSON.parse(localStorage.getItem(V.SETTINGS_KEY));
      if (
        stored &&
        stored.fontFamily &&
        !Array.from(select.options).some(function (o) {
          return o.value === stored.fontFamily;
        })
      ) {
        var custom = document.createElement("option");
        custom.value = stored.fontFamily;
        custom.textContent = "Votre police personnalisée";
        select.appendChild(custom);
      }
    } catch (e) {}
    fonts.replaceWith(select);
    var songFont = document.querySelector(
      '#freetext-style-container [data-setting="fontFamily"]',
    );
    if (songFont) {
      var songSelect = select.cloneNode(true);
      ["'Georgia', 'Times New Roman', serif"].forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = "Georgia · Classique";
        songSelect.appendChild(option);
      });
      try {
        var songSaved = JSON.parse(
          localStorage.getItem(V.FREETEXT_SETTINGS_KEY),
        );
        if (
          songSaved &&
          songSaved.fontFamily &&
          !Array.from(songSelect.options).some(function (o) {
            return o.value === songSaved.fontFamily;
          })
        ) {
          var option = document.createElement("option");
          option.value = songSaved.fontFamily;
          option.textContent = "Votre police personnalisée";
          songSelect.appendChild(option);
        }
      } catch (e) {}
      songFont.replaceWith(songSelect);
    }
    rows.position.querySelectorAll("option").forEach(function (o) {
      o.textContent =
        {
          "lower-third": "En bas de l’écran",
          "upper-third": "En haut de l’écran",
          center: "Au centre",
          fullscreen: "Tout l’écran",
        }[o.value] || o.textContent;
    });
    rows.animation.querySelectorAll("option").forEach(function (o) {
      o.textContent = {
        fade: "Fondu doux",
        slide: "Glissement",
        typewriter: "Machine à écrire",
        none: "Instantané",
      }[o.value];
    });
    var labels = {
      fontFamily: "Police de lecture",
      fontSize: "Taille du texte",
      textColor: "Couleur du texte",
      bgOpacity: "Opacité du fond",
      autoHide: "Masquer après",
      maxWidth: "Largeur à l’écran",
      template: "Autres styles",
      animation: "Apparition",
    };
    Object.keys(labels).forEach(function (k) {
      rows[k].querySelector(".cp-setting-label").textContent = labels[k];
    });
  }
  function init(config) {
    api = config;
    el("session-name").value = read(
      "verseobs_session_name",
      "Ma prochaine célébration",
    );
    el("session-name").addEventListener("input", function () {
      store("verseobs_session_name", this.value);
    });
    api.queue.onError = function () {
      api.notify(
        "Le conducteur n’a pas pu être enregistré. Exportez-le avant de fermer.",
        "error",
      );
    };
    var selectedPreview = document.createElement("div");
    selectedPreview.className = "queue-selection-preview";
    selectedPreview.id = "queue-selection-preview";
    selectedPreview.innerHTML =
      '<span class="editor-badge">PRÊT À DIFFUSER</span><h3 id="queue-selection-title"></h3><p id="queue-selection-text"></p>';
    el("btn-queue-show").parentElement.before(selectedPreview);
    api.queue.onChange = updateQueue;
    updateQueue();
    on("command-trigger", api.openPalette);
    on("toggle-format", function () {
      var hidden = el("format-toolbar").hidden;
      el("format-toolbar").hidden = !hidden;
      el("toggle-format").setAttribute("aria-expanded", String(hidden));
      document
        .querySelector(".passage-editor")
        .classList.toggle("format-open", hidden);
    });
    on("monitor-framing", function () {
      var full = el("preview-stage").classList.toggle("full-frame");
      el("monitor-framing").setAttribute("aria-pressed", String(full));
      el("monitor-framing").textContent = full
        ? "Réduire l’aperçu"
        : "Voir le cadre complet";
      window.dispatchEvent(new Event("resize"));
    });
    document.querySelectorAll("[data-reference]").forEach(function (b) {
      b.addEventListener("click", function () {
        api.selectReference(b.dataset.reference);
      });
    });
    [
      ["[data-open-connections]", 5],
      ["[data-open-settings]", 4],
      ["[data-open-queue]", 2],
    ].forEach(function (entry) {
      document.querySelectorAll(entry[0]).forEach(function (b) {
        b.addEventListener("click", function () {
          api.switchTab(entry[1]);
        });
      });
    });
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        var template = V.TEMPLATES[b.dataset.preset];
        api.settings.applyTemplate(b.dataset.preset);
        markPreset();
        api.notify("Habillage " + template.label + " appliqué", "success");
      });
    });
    markPreset();
    el("settings-container").addEventListener("change", markPreset);
    ["overlay-url", "dock-url"].forEach(function (id) {
      el(id).value = new URL(
        id === "overlay-url" ? "browser_source.html" : "control_panel.html",
        location.href,
      ).href;
    });
    document.querySelectorAll("[data-copy-url]").forEach(function (b) {
      b.addEventListener("click", function () {
        var input = el(b.dataset.copyUrl);
        if (navigator.clipboard)
          navigator.clipboard
            .writeText(input.value)
            .then(function () {
              api.notify("Adresse copiée", "success");
            })
            .catch(function () {
              input.select();
              api.notify("Sélectionnez puis copiez l’adresse.", "info");
            });
        else {
          input.select();
          document.execCommand("copy");
          api.notify("Adresse copiée", "success");
        }
      });
    });
    function monitor(program) {
      el("preview-frame").hidden = program;
      el("program-frame").hidden = !program;
      el("monitor-preview").classList.toggle("selected", !program);
      el("monitor-preview").setAttribute("aria-pressed", String(!program));
      el("monitor-program").classList.toggle("selected", program);
      el("monitor-program").setAttribute("aria-pressed", String(program));
      el("monitor-label").textContent = program
        ? "Retour des commandes"
        : "Non diffusé";
      document.querySelector(".stage-label").textContent = program
        ? "VERSEOBS / OUTPUT"
        : "VERSEOBS / PREVIEW";
    }
    on("monitor-preview", function () {
      monitor(false);
    });
    on("monitor-program", function () {
      monitor(true);
    });
    on("session-export", function () {
      var payload = {
        app: "verseobs-session",
        version: 1,
        name: el("session-name").value || "Ma célébration",
        exportedAt: new Date().toISOString(),
        items: api.queue.getItems(),
      };
      download(
        JSON.stringify(payload, null, 2),
        safeName(payload.name) + ".verseobs.json",
        "application/json",
      );
      api.notify("Conducteur exporté pour votre équipe", "success");
    });
    on("session-import", function () {
      el("session-file").click();
    });
    el("session-file").addEventListener("change", function () {
      var file = this.files[0];
      this.value = "";
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        api.notify("Fichier trop volumineux (4 Mo maximum)", "error");
        return;
      }
      file
        .text()
        .then(function (raw) {
          var data = JSON.parse(raw);
          if (
            data.app !== "verseobs-session" ||
            data.version !== 1 ||
            typeof data.name !== "string" ||
            data.name.length > 100
          )
            throw new Error(
              "Ce fichier n’est pas un conducteur VerseObs valide.",
            );
          var items = V.Queue.validateItems(data.items);
          if (!items.length) throw new Error("Ce conducteur est vide.");
          // Additive import preserves any work the receiving operator already prepared.
          api.queue.replace(api.queue.getItems().concat(items));
          el("session-name").value = data.name;
          store("verseobs_session_name", data.name);
          api.notify(
            items.length + " éléments importés et ajoutés au conducteur",
            "success",
          );
        })
        .catch(function (err) {
          api.notify(err.message || "Import impossible", "error");
        });
    });
    on("session-print", function () {
      api.switchTab(2);
      window.print();
    });
    var undoButton = document.createElement("button");
    undoButton.id = "undo-clear";
    undoButton.className = "cp-btn-queue-add";
    undoButton.textContent = "Annuler la suppression";
    undoButton.hidden = true;
    el("btn-clear-queue").after(undoButton);
    undoButton.addEventListener("click", function () {
      if (undo) {
        api.queue.replace(undo.concat(api.queue.getItems()));
        undo = null;
        undoButton.hidden = true;
        api.notify("Conducteur restauré", "success");
      }
    });
    // Paragraphs become independent song slides with an explicit action.
    var split = document.createElement("button");
    split.id = "btn-song-slides";
    split.className = "cp-btn-queue-add";
    split.textContent = "Créer une diapositive par couplet";
    el("btn-free-add-queue").parentNode.after(split);
    split.addEventListener("click", function () {
      var content = el("freetext-editable").innerText.trim();
      var blocks = content
        .split(/\n\s*\n/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
      if (!blocks.length) {
        api.notify("Écrivez les couplets, séparés par une ligne vide.", "info");
        return;
      }
      var title = el("freetext-title").value || "Chant";
      var items = blocks.map(function (text, i) {
        return {
          type: "text",
          title: title,
          subtitle: i + 1 + " / " + blocks.length,
          text: text,
        };
      });
      try {
        api.queue.replace(api.queue.getItems().concat(items));
        api.notify(
          blocks.length + " diapositives ajoutées au conducteur",
          "success",
        );
      } catch (e) {
        api.notify(e.message, "error");
      }
    });
    // Roving tabs and focus containment for both legacy modal surfaces.
    document
      .querySelector(".cp-tabs")
      .addEventListener("keydown", function (e) {
        var buttons = Array.from(document.querySelectorAll(".cp-tab")),
          index = buttons.indexOf(e.target);
        if (index < 0) return;
        var next;
        if (["ArrowDown", "ArrowRight"].includes(e.key))
          next = (index + 1) % buttons.length;
        if (["ArrowUp", "ArrowLeft"].includes(e.key))
          next = (index + buttons.length - 1) % buttons.length;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = buttons.length - 1;
        if (next !== undefined) {
          e.preventDefault();
          api.switchTab(next);
          buttons[next].focus();
        }
      });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var modal = ["help-overlay", "palette-overlay"]
        .map(el)
        .find(function (m) {
          return !m.hidden;
        });
      if (!modal) return;
      var nodes = Array.from(
        modal.querySelectorAll('button,input,[tabindex="0"]'),
      ).filter(function (n) {
        return !n.disabled;
      });
      var first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    });
    // Every setting has a label for keyboard and assistive technology users.
    document.querySelectorAll(".cp-setting-row").forEach(function (row) {
      var label = row.querySelector(".cp-setting-label");
      if (!label) return;
      row.querySelectorAll("input,select").forEach(function (input) {
        if (!input.hasAttribute("aria-label"))
          input.setAttribute("aria-label", label.textContent.trim());
      });
    });
    ["freetext-title", "freetext-subtitle", "freetext-save-name"].forEach(
      function (id, i) {
        el(id).setAttribute(
          "aria-label",
          ["Titre du texte", "Sous-titre du texte", "Nom du texte sauvegardé"][
            i
          ],
        );
      },
    );
  }
  function refreshChapter() {
    if (!api || !api.getBible()) return;
    var sel = api.getSelection(),
      bible = api.getBible(),
      book = bible.books[sel.bookId];
    if (!book || !book.chapters[sel.chapter]) return;
    var chapter = book.chapters[sel.chapter],
      signature =
        el("version-select").value + ":" + sel.bookId + ":" + sel.chapter;
    var list = el("chapter-list");
    if (signature !== lastChapter) {
      lastChapter = signature;
      list.replaceChildren();
      Object.keys(chapter)
        .sort(function (a, b) {
          return Number(a) - Number(b);
        })
        .forEach(function (num) {
          var button = document.createElement("button");
          button.className = "chapter-verse";
          button.dataset.verse = num;
          var n = document.createElement("span");
          n.className = "verse-number";
          n.textContent = num;
          var text = document.createElement("span");
          text.textContent =
            typeof chapter[num] === "string" ? chapter[num] : chapter[num].text;
          button.append(n, text);
          button.addEventListener("click", function () {
            api.selectVerse(Number(num));
          });
          list.appendChild(button);
        });
      el("chapter-count").textContent =
        Object.keys(chapter).length + " versets";
      lastVerse = 0;
    }
    list.querySelectorAll("button").forEach(function (b) {
      var selected = Number(b.dataset.verse) === sel.verse;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
    if (lastVerse !== sel.verse) {
      var selected = list.querySelector(".selected");
      if (selected)
        list.scrollTop =
          selected.offsetTop - list.offsetTop - list.clientHeight / 3;
      lastVerse = sel.verse;
    }
    el("preview-caption").textContent =
      el("preview-ref").textContent +
      " · " +
      el("version-select").value.toUpperCase();
  }
  V.Studio = {
    init: init,
    prepareSettings: prepareSettings,
    refreshChapter: refreshChapter,
    clearQueue: function () {
      undo = api.queue.getItems();
      api.queue.clear();
      el("undo-clear").hidden = false;
      api.notify("Conducteur vidé. Vous pouvez annuler cette action.", "info");
    },
    onTab: function (index) {
      if (!api) return;
      el("workspace-label").textContent = [
        "Bible",
        "Textes & chants",
        "Conducteur",
        "Historique",
        "Habillage",
        "Connexions",
      ][index];
      el("studio-title").textContent = titles[index];
      el("studio-subtitle").textContent = subtitles[index];
    },
    setRelay: function (connected) {
      if (!el("relay-status")) return;
      el("relay-status").textContent = connected
        ? "Relais local connecté"
        : "Communication entre onglets";
      el("relay-description").textContent = connected
        ? "Le navigateur, le dock OBS et la source peuvent communiquer sur cet ordinateur, même dans des navigateurs séparés."
        : "Utilisez la même origine dans le dock et la source. Pour relier des navigateurs séparés, lancez npm start et utilisez les adresses locales.";
    },
    rememberOutput: function (data) {
      el("monitor-program").title = data
        ? data.reference || data.title || "Texte libre"
        : "Sortie masquée";
    },
  };
})();
