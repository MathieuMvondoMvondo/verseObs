/* Studio ergonomics, session handoff and integration guidance. */
(function () {
  "use strict";
  var V = window.VerseObs,
    api = null,
    lastChapter = "",
    lastVerse = 0,
    undo = null,
    layoutRows = function () {},
    output = { visible: false, confirmed: false, label: "", cue: "", version: "" };
  var titles = [
    "Préparer un passage",
    "Textes & chants",
    "Conducteur de session",
    "Historique",
    "Habillage de diffusion",
    "Connexions & sorties",
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
      if (selected && selected.secondary) {
        var second = document.createElement("span");
        second.className = "queue-secondary-text";
        second.textContent = V.secondaryText(selected);
        el("queue-selection-text").appendChild(second);
      }
    }
    markLive();
    strip(state);
    el("session-saved").textContent = !state.saved
      ? "Non enregistré · exportez votre session"
      : state.total
        ? state.total +
          " élément" +
          (state.total > 1 ? "s" : "") +
          " · enregistré sur cet appareil"
        : "Sauvegarde automatique";
  }
  /**
   * Where the conductor stands, in one line (1280 px) and in the heading of
   * its compact column: « 3/10 », then what comes next.
   */
  function strip(state) {
    var items = api.queue.getItems(),
      next = items[state.current],
      position = state.total ? state.current + "/" + state.total : "";
    if (el("queue-position")) el("queue-position").textContent = position;
    var band = el("queue-strip");
    if (!band) {
      band = document.createElement("div");
      band.className = "queue-strip";
      band.id = "queue-strip";
      band.innerHTML =
        '<span class="queue-strip-label"></span><span class="queue-strip-next"></span>' +
        '<button type="button">Ouvrir le conducteur</button>';
      band.querySelector("button").addEventListener("click", function () {
        api.switchTab(2);
      });
      document.querySelector(".cp-panel").prepend(band);
    }
    band.querySelector(".queue-strip-label").textContent = state.total
      ? "Conducteur " + position
      : "Conducteur vide";
    band.querySelector(".queue-strip-next").textContent = next
      ? "Ensuite : " + (next.reference || next.title || "Texte libre")
      : state.total
        ? "Fin du conducteur"
        : "";
  }
  var lastTake = null,
    TAKES = ["btn-show", "btn-free-show", "btn-queue-show"],
    EMPTY = ["Choisissez un passage", "Écrivez un texte", "Conducteur vide"];
  function paintTake() {
    if (!lastTake) return;
    var tab = lastTake.tab,
      data = lastTake.data,
      button = el(TAKES[tab]),
      cue = el("take-cue-" + tab);
    if (!button || !cue) return;
    var label = data ? data.reference || data.title || "Texte libre" : "",
      again =
        !!data &&
        output.visible &&
        (data.cue
          ? data.cue === output.cue
          : !output.cue.indexOf("b") &&
            label === output.label &&
            (data.version || "") === output.version);
    cue.textContent = label;
    button.querySelector(".take-label").textContent = again ? "Rediffuser" : "Diffuser";
    var reason = button.querySelector(".take-reason");
    if (!reason) {
      reason = document.createElement("span");
      reason.className = "take-reason";
      button.insertBefore(reason, button.querySelector("kbd"));
    }
    reason.textContent = data ? "" : EMPTY[tab];
    // The conductor's own rule (empty conductor) stays; the text view waits
    // for a text.
    if (tab === 1) button.disabled = !data;
    lastTake.again = again;
    paintOnairSplit();
  }
  /**
   * The Antenne head's « Découper » (partial state, brief §4) is the same
   * action as « Découper en N plans » under the preview: offered only while
   * the preview holds what is on air and its measurement is ready, in the
   * view where it was prepared.
   */
  function paintOnairSplit() {
    var link = el("onair-split"),
      split = el("btn-split"),
      bar = el("onair-bar");
    if (!link) return;
    link.hidden = !(
      bar &&
      bar.hasAttribute("data-partial") &&
      lastTake &&
      lastTake.again &&
      lastTake.tab === Number(document.body.dataset.tab || 0) &&
      split &&
      !split.hidden &&
      !split.disabled
    );
  }
  /**
   * Is this conductor item the one the output shows? By its identifier (cue)
   * echoed by the output; label + version only for outputs that predate it.
   * Same rule on the phone remote.
   */
  function isLive(cue, label, version) {
    if (!output.visible) return false;
    if (output.cue) return cue === output.cue;
    return label === output.label && (version || "") === (output.version || "");
  }
  /**
   * Program tally in the conductor: the item the output shows is marked
   * « À l’antenne », whatever is selected.
   */
  function markLive() {
    document.querySelectorAll("#queue-container .cp-queue-item").forEach(
      function (row) {
        var on = isLive(row.dataset.cue, row.dataset.label, row.dataset.version);
        row.classList.toggle("is-live", on && output.confirmed);
        row.classList.toggle("is-live-pending", on && !output.confirmed);
        row.setAttribute(
          "aria-label",
          "Sélectionner " +
            row.dataset.label +
            (on ? (output.confirmed ? ", à l’antenne" : ", envoi en cours") : ""),
        );
      },
    );
    var preview = el("queue-selection-preview"),
      selected = api && api.queue.getItems()[api.queue.getState().current - 1];
    if (!preview) return;
    var selectedLive =
      !!selected &&
      isLive(
        selected.id,
        selected.reference || selected.title || "Texte libre",
        selected.version,
      );
    preview.classList.toggle("is-live", selectedLive);
    el("queue-selection-badge").textContent = selectedLive
      ? output.confirmed
        ? "À L’ANTENNE"
        : "ENVOI EN COURS"
      : "PRÊT À DIFFUSER";
  }
  function markPreset() {
    var current = api.settings.getAll().template,
      pick = el("style-select");
    if (pick)
      pick.value = Array.from(pick.options).some(function (o) {
        return o.value && o.value === current;
      })
        ? current
        : "";
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
      ["layout", "position", "maxWidth"],
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
      [V.ANTENNE_FONT, "Lora · Antenne"],
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
        reveal: "Révélation · lecture",
        fade: "Fondu doux",
        slide: "Glissement",
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
    // Card-only settings are hidden with the antenne layout, and the
    // reference colour becomes the accent (axis, verse numbers, version).
    var cardOnly = ["refPosition", "borderRadius", "borderWidth", "borderColor"],
      accentLabel = rows.refBgColor.querySelector(".cp-setting-label"),
      cardLabel = accentLabel.textContent;
    var layoutSelect = rows.layout.querySelector("select");
    layoutRows = function () {
      var antenne = layoutSelect.value !== "carte";
      cardOnly.forEach(function (key) {
        if (rows[key]) rows[key].hidden = antenne;
      });
      imageRow.hidden = antenne;
      accentLabel.textContent = antenne ? "Accent · axe et numéros" : cardLabel;
    };
    container.addEventListener("change", function () {
      layoutRows();
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-preset]"))
        setTimeout(layoutRows, 0);
    });
    layoutRows();
  }
  function init(config) {
    api = config;
    layoutRows();
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
      '<span class="editor-badge" id="queue-selection-badge">PRÊT À DIFFUSER</span><h3 id="queue-selection-title"></h3><p id="queue-selection-text"></p>';
    el("queue-container").parentElement.before(selectedPreview);
    // « Regrouper » (in the group header of the conductor) undoes
    // « Découper »: the plans of that passage become the passage again.
    api.queue.onMerge = function (group) {
      var items = api.queue.getItems(),
        indexes = [];
      if (!group) return;
      items.forEach(function (item, i) {
        if (item.group === group) indexes.push(i);
      });
      if (!indexes.length) return;
      var parts = indexes.map(function (i) {
        return items[i];
      });
      // Never a passage that is not all there: say which plan is missing.
      var missing = V.Passage.incomplete(parts);
      if (missing) {
        api.notify(missing + " Regroupement impossible : rien n’a changé.", "error");
        return;
      }
      var whole = V.Passage.merge(parts);
      // Plans moved apart by hand are gathered at the first one's place.
      var rest = items.filter(function (item) {
        return item.group !== group;
      });
      rest.splice(indexes[0], 0, whole);
      try {
        api.queue.splice(0, items.length, rest);
        api.queue.select(indexes[0]);
      } catch (e) {
        api.notify(e.message, "error");
        return;
      }
      api.notify(whole.reference + " regroupé", "success");
    };
    api.queue.onChange = updateQueue;
    updateQueue();
    bindChapterKeys();
    // « Style » in the editor's heading applies the same bases as the cards
    // of the Habillage view.
    el("style-select").addEventListener("change", function () {
      var preset = this.value,
        template = V.TEMPLATES[preset];
      if (!template) return;
      api.settings.applyTemplate(preset);
      markPreset();
      layoutRows();
      api.notify("Habillage " + template.label + " appliqué", "success");
    });
    // An item picked in the conductor column of another view is loaded in the
    // preview the same way as in the Conducteur view: the take sends it.
    function openPicked(e) {
      if (document.body.dataset.tab === "2") return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest && e.target.closest(".cp-queue-item");
      if (!row || e.target.closest("button")) return;
      api.switchTab(2);
    }
    el("queue-container").addEventListener("click", openPicked);
    el("queue-container").addEventListener("keydown", openPicked);
    on("command-trigger", api.openPalette);
    on("toggle-format", function () {
      var hidden = el("format-toolbar").hidden;
      el("format-toolbar").hidden = !hidden;
      el("toggle-format").setAttribute("aria-expanded", String(hidden));
      document
        .querySelector(".passage-editor")
        .classList.toggle("format-open", hidden);
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
    /** Below 1280 px only one monitor fits: the operator picks which. */
    function monitor(program) {
      el("monitor-bay").dataset.show = program ? "program" : "preview";
      el("monitor-preview").classList.toggle("selected", !program);
      el("monitor-preview").setAttribute("aria-pressed", String(!program));
      el("monitor-program").classList.toggle("selected", program);
      el("monitor-program").setAttribute("aria-pressed", String(program));
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
      var modal = ["help-overlay", "palette-overlay", "plan-overlay"]
        .map(el)
        .find(function (m) {
          return m && !m.hidden;
        });
      if (!modal) return;
      var nodes = Array.from(
        modal.querySelectorAll('button,input,textarea,[tabindex="0"]'),
      ).filter(function (n) {
        return !n.disabled && !n.hidden && n.getClientRects().length;
      });
      if (!nodes.length) return;
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
          var button = document.createElement("div");
          button.className = "chapter-verse";
          button.setAttribute("role", "option");
          button.tabIndex = -1;
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
    var options = list.querySelectorAll(".chapter-verse");
    options.forEach(function (b) {
      var selected = Number(b.dataset.verse) === sel.verse;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    if (!list.querySelector(".selected") && options[0]) options[0].tabIndex = 0;
    if (lastVerse !== sel.verse) {
      var selected = list.querySelector(".selected"),
        scroller = list.closest(".chapter-scroll") || list;
      if (selected) {
        var top =
          selected.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        scroller.scrollTop = top - scroller.clientHeight / 3;
        if (list.contains(document.activeElement)) selected.focus();
      }
      lastVerse = sel.verse;
    }
    el("preview-caption").textContent =
      el("preview-ref").textContent +
      " · " +
      el("version-select").value.toUpperCase() +
      (el("bilingual-toggle").checked
        ? " + " + el("secondary-version").value.toUpperCase()
        : "");
  }
  /** The chapter is one list: Tab enters it, the arrows walk the verses. */
  function bindChapterKeys() {
    var list = el("chapter-list");
    if (!list) return;
    list.addEventListener("keydown", function (e) {
      var options = Array.from(list.querySelectorAll(".chapter-verse")),
        current = e.target.closest(".chapter-verse"),
        i = options.indexOf(current),
        next = null;
      if (i < 0) return;
      if (e.key === "ArrowDown") next = options[Math.min(i + 1, options.length - 1)];
      else if (e.key === "ArrowUp") next = options[Math.max(i - 1, 0)];
      else if (e.key === "Home") next = options[0];
      else if (e.key === "End") next = options[options.length - 1];
      else if (e.key === "Enter" || e.key === " ") next = current;
      else return;
      e.preventDefault();
      api.selectVerse(Number(next.dataset.verse));
      next.focus();
    });
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
      paintOnairSplit();
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
    /** Program state changed (command sent, confirmed or hidden). */
    setOutput: function (state) {
      output = {
        visible: !!state.visible,
        confirmed: !!state.confirmed,
        label: String(state.label || ""),
        cue: String(state.cue || ""),
        version: String(state.version || ""),
      };
      el("monitor-program").classList.toggle("is-live", output.visible);
      // Reduced motion is decided by the OBS computer's system setting.
      var note = el("program-note");
      if (note) {
        note.hidden = !state.reduced;
        note.textContent = state.reduced
          ? "Sortie : animations réduites par le système de l’ordinateur OBS (fondus courts)."
          : "";
      }
      if (api) markLive();
      paintTake();
    },
    /**
     * The prepared text changed: until the preview reports on it, « Découper »
     * is inactive (no layout change, no plans of the previous text).
     */
    /**
     * New plans enter the conductor: 160 ms, opacity and 4 px, 30 ms apart
     * (at most 240 ms of delay); opacity only in reduced motion.
     */
    enterRows: function (cues) {
      var reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cues.forEach(function (cue, i) {
        var row = document.querySelector(
          '#queue-container .cp-queue-item[data-cue="' + cue + '"]',
        );
        if (!row || typeof row.animate !== "function") return;
        row.animate(
          reduce
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: "translateY(4px)" },
                { opacity: 1, transform: "none" },
              ],
          {
            duration: 160,
            delay: Math.min(i, 8) * 30,
            easing: "cubic-bezier(0.23, 1, 0.32, 1)",
            fill: "backwards",
          },
        );
      });
    },
    /**
     * The take names what it sends; with nothing prepared it is disabled and
     * says why; when the preview holds what is on air it says « Rediffuser »
     * (same action).
     */
    setTake: function (prepared) {
      var tab = Number(document.body.dataset.tab) || 0;
      if (tab > 2) return;
      lastTake = { tab: tab, data: (prepared && prepared.data) || null };
      paintTake();
    },
    setFitStale: function () {
      var split = el("btn-split");
      if (split) split.disabled = true;
      paintOnairSplit();
    },
    /**
     * What the preview monitor reports about the prepared text: reduced, too
     * long for the band (with the plans « Découper » would create), or too
     * long even for the whole frame.
     */
    setFit: function (info) {
      var hint = el("fit-hint"),
        split = el("btn-split");
      if (!hint) return;
      var fit = Number(info && info.fit) || 1,
        pages = info && Array.isArray(info.pages) ? info.pages : null;
      if (split) {
        // While the preview measures the plans (a long chapter takes a
        // moment), the button says so and waits.
        var measuring = !!(info && info.visible && info.measuring);
        split.hidden = !(
          info &&
          info.visible &&
          (measuring || (pages && pages.length > 1))
        );
        split.textContent = measuring
          ? "Mesure des plans…"
          : split.hidden
            ? "Découper"
            : "Découper en " + pages.length + " plans";
        // A report about another text (or an older version of this one).
        split.disabled = measuring || !(info && info.fresh !== false);
        paintOnairSplit();
      }
      if (
        !info ||
        !info.visible ||
        (fit >= 0.98 && !info.overflow && !info.partial)
      ) {
        hint.hidden = true;
        hint.textContent = "";
        hint.classList.remove("is-warning");
        return;
      }
      hint.hidden = false;
      hint.classList.toggle("is-warning", !!(info.overflow || info.partial));
      hint.textContent = info.partial
        ? "Trop long pour le bandeau : seuls " +
          info.shown +
          " passeraient à l’antenne (4 lignes, 32 px minimum)."
        : info.overflow
          ? "Trop long pour l’écran : découpez le passage"
          : "Texte réduit à " + Math.round(fit * 100) + " % pour tenir à l’écran";
    },
  };
})();
