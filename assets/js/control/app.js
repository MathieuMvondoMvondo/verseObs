/* VerseObs - Control Panel App (Main Orchestrator) */

(function () {
  "use strict";

  window.VerseObs = window.VerseObs || {};

  var MSG = window.VerseObs.MSG;
  var CHANNEL_NAME = window.VerseObs.CHANNEL_NAME || "verseobs";
  var LS_KEY = window.VerseObs.LS_KEY || "verseobs_msg";

  // ---- Module instances ----
  var bibleLoader,
    search,
    navigation,
    settings,
    history,
    freeText,
    freeTextStyle,
    queue,
    favorites;
  var channel = null;
  var currentBibleId = null;
  var currentBibleData = null;
  var _onAirItem = null; // { type:'verse', bookId, chapter, verse } currently live
  var _pendingRange = null; // { bookId, chapter, start, end } for multi-verse display
  var _searchResults = []; // current keyword-search results (for keyboard nav)
  var _searchActiveIdx = -1;

  // ---- DOM references ----
  var dom = {};

  function init() {
    _cacheDom();
    window.VerseObs.Studio.prepareSettings();
    _initModules();
    _initTabs();
    _initChannel();
    _initKeyboard();
    _initFormatToolbar();
    _initPalette();
    _initPreviewFrame();
    _initCollapsibleSettings();
    _initHelp();
    window.VerseObs.Studio.init({
      queue: queue,
      settings: settings,
      notify: _notify,
      switchTab: _switchTab,
      selectReference: _selectReference,
      openPalette: _openPalette,
      getSelection: function () {
        return navigation.getSelection();
      },
      selectVerse: function (verse) {
        var sel = navigation.getSelection();
        navigation.setSelection(sel.bookId, sel.chapter, verse);
      },
      getBible: function () {
        return currentBibleData;
      },
    });
    _loadDefaultBible();
  }

  // ---- DOM caching ----

  function _cacheDom() {
    dom.connectionDot = document.getElementById("connection-dot");
    dom.connectionText = document.getElementById("connection-text");
    dom.toastContainer = document.getElementById("cp-toast-container");
    dom.versionLoading = document.getElementById("version-loading");
    dom.btnHelp = document.getElementById("btn-help");
    dom.helpOverlay = document.getElementById("help-overlay");
    dom.helpClose = document.getElementById("help-close");
    dom.btnFav = document.getElementById("btn-fav");
    dom.favoritesContainer = document.getElementById("favorites-container");

    // Quick search palette (Ctrl+K)
    dom.paletteOverlay = document.getElementById("palette-overlay");
    dom.paletteInput = document.getElementById("palette-input");
    dom.paletteResults = document.getElementById("palette-results");

    // Live preview + on-air + copy
    dom.previewStage = document.getElementById("preview-stage");
    dom.previewFrame = document.getElementById("preview-frame");
    dom.onairBar = document.getElementById("onair-bar");
    dom.onairRef = document.getElementById("onair-ref");
    dom.onairHide = document.getElementById("onair-hide");
    dom.btnCopy = document.getElementById("btn-copy");

    // Tabs
    dom.tabs = document.querySelectorAll(".cp-tab");
    dom.tabContents = document.querySelectorAll(".cp-tab-content");

    // Bible tab
    dom.versionSelect = document.getElementById("version-select");
    dom.versionIndicator = document.getElementById("version-indicator");
    dom.searchInput = document.getElementById("search-input");
    dom.searchResults = document.getElementById("search-results");
    dom.bookSelect = document.getElementById("book-select");
    dom.chapterSelect = document.getElementById("chapter-select");
    dom.verseSelect = document.getElementById("verse-select");
    dom.previewText = document.getElementById("preview-text");
    dom.previewRef = document.getElementById("preview-ref");
    dom.btnShow = document.getElementById("btn-show");
    dom.btnHide = document.getElementById("btn-hide");
    dom.btnPrev = document.getElementById("btn-prev");
    dom.btnNext = document.getElementById("btn-next");
    dom.btnPrevChapter = document.getElementById("btn-prev-chapter");
    dom.btnNextChapter = document.getElementById("btn-next-chapter");
    dom.btnAddQueue = document.getElementById("btn-add-queue");

    // Format toolbar
    dom.formatToolbar = document.getElementById("format-toolbar");
    dom.highlightColorInput = document.getElementById("highlight-color");

    // Free text tab
    dom.freeTextTitle = document.getElementById("freetext-title");
    dom.freeTextSubtitle = document.getElementById("freetext-subtitle");
    dom.freeTextEditable = document.getElementById("freetext-editable");
    dom.freeTextFormatToolbar = document.getElementById(
      "freetext-format-toolbar",
    );
    dom.btnFreeShow = document.getElementById("btn-free-show");
    dom.btnFreeHide = document.getElementById("btn-free-hide");
    dom.btnFreeAddQueue = document.getElementById("btn-free-add-queue");
    dom.btnFreeClear = document.getElementById("btn-free-clear");
    dom.btnFreeSave = document.getElementById("btn-free-save");
    dom.freeTextSaveName = document.getElementById("freetext-save-name");
    dom.savedTextsContainer = document.getElementById("saved-texts-container");

    dom.freeTextStyleContainer = document.getElementById(
      "freetext-style-container",
    );
    dom.freeTextPresets = document.getElementById("freetext-presets");
    dom.btnResetFreeTextStyle = document.getElementById(
      "btn-reset-freetext-style",
    );

    // Queue tab
    dom.queueContainer = document.getElementById("queue-container");
    dom.queueCounter = document.getElementById("queue-counter");
    dom.btnQueuePrev = document.getElementById("btn-queue-prev");
    dom.btnQueueNext = document.getElementById("btn-queue-next");
    dom.btnQueueShow = document.getElementById("btn-queue-show");
    dom.btnClearQueue = document.getElementById("btn-clear-queue");

    // History tab
    dom.historyContainer = document.getElementById("history-container");
    dom.btnClearHistory = document.getElementById("btn-clear-history");

    // Settings tab
    dom.settingsContainer = document.getElementById("settings-container");
    dom.btnResetSettings = document.getElementById("btn-reset-settings");
    dom.btnExportData = document.getElementById("btn-export-data");
    dom.btnImportData = document.getElementById("btn-import-data");
    dom.importDataInput = document.getElementById("import-data-input");
  }

  // ---- Module initialization ----

  function _initModules() {
    bibleLoader = new window.VerseObs.BibleLoader();
    search = new window.VerseObs.Search();

    navigation = new window.VerseObs.Navigation({
      bookSelect: dom.bookSelect,
      chapterSelect: dom.chapterSelect,
      verseSelect: dom.verseSelect,
      onSelectionChange: _onNavigationChange,
    });

    settings = new window.VerseObs.Settings();
    settings.load();
    settings.bindUI(dom.settingsContainer);
    settings.bindExtras(dom.settingsContainer);
    settings._updateUI();
    settings.onChange = function (s) {
      if (_onAirItem && _onAirItem.type !== "text")
        _sendMessage(MSG.UPDATE_STYLE, { settings: settings.getAll() });
      _sendPreview();
    };
    settings.onNotify = function (message, type) {
      _notify(message, type);
    };

    history = new window.VerseObs.History();
    history.onClick = function (entry) {
      _showVerseFromHistory(entry);
    };
    history.renderList(dom.historyContainer);

    favorites = new window.VerseObs.Favorites();
    favorites.onShow = function (item) {
      navigation.setSelection(item.bookId, item.chapter, item.verse);
      _updatePreview();
      _switchTab(0);
    };
    favorites.onChange = function () {
      favorites.render(dom.favoritesContainer);
      _updateFavButton();
    };
    favorites.render(dom.favoritesContainer);

    freeText = new window.VerseObs.FreeText({
      titleInput: dom.freeTextTitle,
      subtitleInput: dom.freeTextSubtitle,
      contentEditable: dom.freeTextEditable,
      formatToolbar: dom.freeTextFormatToolbar,
      savedListContainer: dom.savedTextsContainer,
      saveNameInput: dom.freeTextSaveName,
      onSend: function (data) {
        var msgData = {
          text: data.text,
          title: data.title,
          subtitle: data.subtitle,
          settings: freeTextStyle.getAll(),
        };
        if (data.html) {
          msgData.html = data.html;
        }
        _sendMessage(MSG.SHOW_TEXT, msgData);
        _notify("Texte affiché", "success");
        _onAirItem = { type: "text" };
        _setOnAir(data.title || "Texte libre");
      },
    });
    freeText.renderSavedList();

    // Independent free-text style (own storage key, defaults and presets)
    freeTextStyle = new window.VerseObs.Settings({
      storageKey: window.VerseObs.FREETEXT_SETTINGS_KEY,
      defaults: window.VerseObs.FREETEXT_DEFAULTS,
      templates: window.VerseObs.FREETEXT_STYLES,
    });
    freeTextStyle.load();
    freeTextStyle.bindUI(dom.freeTextStyleContainer);
    freeTextStyle.bindExtras(dom.freeTextStyleContainer);
    freeTextStyle._updateUI();
    freeTextStyle.onNotify = function (message, type) {
      _notify(message, type);
    };
    freeTextStyle.onChange = function (s) {
      // Reflect live in the dock preview, and on the overlay if free text is on air.
      if (_onAirItem && _onAirItem.type === "text") {
        _sendMessage(MSG.UPDATE_STYLE, { settings: freeTextStyle.getAll() });
      }
      _sendPreview();
    };
    _initFreeTextPresets();

    queue = new window.VerseObs.Queue({
      container: dom.queueContainer,
      counterEl: dom.queueCounter,
      onShow: function (item) {
        if (item.type === "verse") {
          _sendMessage(MSG.SHOW_VERSE, {
            text: item.text,
            html: item.html || "",
            reference: item.reference,
            version: item.version || "",
            settings: settings.getAll(),
          });
        } else {
          var msgData = {
            text: item.text,
            title: item.title || "",
            subtitle: item.subtitle || "",
            settings: freeTextStyle.getAll(),
          };
          if (item.html) {
            msgData.html = item.html;
          }
          _sendMessage(MSG.SHOW_TEXT, msgData);
        }
        _notify(
          "Affiché : " + (item.reference || item.title || "élément"),
          "success",
        );
        _onAirItem = { type: item.type === "verse" ? "verse-queue" : "text" };
        _setOnAir(item.reference || item.title || "Élément de file");
      },
    });
    queue.render();

    _bindButtons();
    _bindSearch();
    _bindVersionSelector();
  }

  // ---- Format Toolbar ----

  function _initFormatToolbar() {
    if (!dom.formatToolbar) return;

    var buttons = dom.formatToolbar.querySelectorAll("[data-format]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        // Use mousedown to prevent focus loss from preview contenteditable
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          var format = btn.getAttribute("data-format");
          _applyFormat(format);
        });
      })(buttons[i]);
    }
  }

  function _applyFormat(format) {
    if (!dom.previewText) return;

    // Ensure preview is focused
    dom.previewText.focus();

    switch (format) {
      case "bold":
        document.execCommand("bold", false, null);
        break;
      case "italic":
        document.execCommand("italic", false, null);
        break;
      case "underline":
        document.execCommand("underline", false, null);
        break;
      case "highlight":
        var color = dom.highlightColorInput
          ? dom.highlightColorInput.value
          : "#ffff00";
        var sel = window.getSelection();
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
          var range = sel.getRangeAt(0);
          // Check if already highlighted
          var parent = sel.anchorNode.parentElement;
          if (parent && parent.tagName === "MARK") {
            // Remove highlight: unwrap mark
            var text = document.createTextNode(parent.textContent);
            parent.parentNode.replaceChild(text, parent);
          } else {
            var mark = document.createElement("mark");
            mark.style.backgroundColor = color;
            try {
              range.surroundContents(mark);
            } catch (e) {
              // Range crosses element boundaries, use extractContents
              var fragment = range.extractContents();
              mark.appendChild(fragment);
              range.insertNode(mark);
            }
          }
        }
        break;
      case "clear":
        document.execCommand("removeFormat", false, null);
        // Also remove mark elements
        var marks = dom.previewText.querySelectorAll("mark");
        for (var i = 0; i < marks.length; i++) {
          var textNode = document.createTextNode(marks[i].textContent);
          marks[i].parentNode.replaceChild(textNode, marks[i]);
        }
        break;
    }
  }

  /**
   * Get the formatted HTML from the preview, or null if no formatting was applied.
   */
  function _getFormattedHtml() {
    if (!dom.previewText) return null;
    var html = dom.previewText.innerHTML;
    return window.VerseObs.sanitizeHtml(html);
  }

  // ---- Button bindings ----

  function _bindButtons() {
    if (dom.btnShow) {
      dom.btnShow.addEventListener("click", _showCurrentVerse);
    }
    if (dom.btnHide) {
      dom.btnHide.addEventListener("click", _hideVerse);
    }
    if (dom.btnPrev) {
      dom.btnPrev.addEventListener("click", function () {
        navigation.goToPrevious();
      });
    }
    if (dom.btnNext) {
      dom.btnNext.addEventListener("click", function () {
        navigation.goToNext();
      });
    }
    if (dom.btnPrevChapter) {
      dom.btnPrevChapter.addEventListener("click", function () {
        navigation.goToPreviousChapter();
      });
    }
    if (dom.btnNextChapter) {
      dom.btnNextChapter.addEventListener("click", function () {
        navigation.goToNextChapter();
      });
    }

    // Add to queue from Bible tab
    if (dom.btnAddQueue) {
      dom.btnAddQueue.addEventListener("click", function () {
        _addCurrentVerseToQueue();
      });
    }

    // Toggle favorite
    if (dom.btnFav) {
      dom.btnFav.addEventListener("click", _toggleFavorite);
    }

    // Copy current verse
    if (dom.btnCopy) {
      dom.btnCopy.addEventListener("click", _copyCurrentVerse);
    }

    // On-air "hide" shortcut button
    if (dom.onairHide) {
      dom.onairHide.addEventListener("click", _hideVerse);
    }

    // Live preview while editing free text
    var ftInputs = [
      dom.freeTextEditable,
      dom.freeTextTitle,
      dom.freeTextSubtitle,
    ];
    for (var fi = 0; fi < ftInputs.length; fi++) {
      if (ftInputs[fi]) ftInputs[fi].addEventListener("input", _sendPreview);
    }

    // Free text buttons
    if (dom.btnFreeShow) {
      dom.btnFreeShow.addEventListener("click", function () {
        freeText.send();
      });
    }
    if (dom.btnFreeHide) {
      dom.btnFreeHide.addEventListener("click", _hideVerse);
    }
    if (dom.btnFreeClear) {
      dom.btnFreeClear.addEventListener("click", function () {
        freeText.clear();
      });
    }
    if (dom.btnFreeSave) {
      dom.btnFreeSave.addEventListener("click", function () {
        freeText.saveCurrentText();
      });
    }
    if (dom.btnFreeAddQueue) {
      dom.btnFreeAddQueue.addEventListener("click", function () {
        _addFreeTextToQueue();
      });
    }

    // Queue buttons
    if (dom.btnQueuePrev) {
      dom.btnQueuePrev.addEventListener("click", function () {
        queue.selectPrevious();
      });
    }
    if (dom.btnQueueNext) {
      dom.btnQueueNext.addEventListener("click", function () {
        queue.selectNext();
      });
    }
    if (dom.btnQueueShow) {
      dom.btnQueueShow.addEventListener("click", function () {
        queue.showCurrent();
      });
    }
    if (dom.btnClearQueue) {
      dom.btnClearQueue.addEventListener("click", function () {
        window.VerseObs.Studio.clearQueue();
      });
    }

    // History
    if (dom.btnClearHistory) {
      dom.btnClearHistory.addEventListener("click", function () {
        history.clear();
        history.renderList(dom.historyContainer);
      });
    }
    if (dom.btnResetSettings) {
      dom.btnResetSettings.addEventListener("click", function () {
        settings.reset();
      });
    }

    // Data backup
    if (dom.btnExportData) {
      dom.btnExportData.addEventListener("click", _exportData);
    }
    if (dom.btnImportData && dom.importDataInput) {
      dom.btnImportData.addEventListener("click", function () {
        dom.importDataInput.click();
      });
      dom.importDataInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) _importData(file);
        dom.importDataInput.value = "";
      });
    }
  }

  // ---- Help modal ----

  function _initHelp() {
    if (dom.btnHelp) dom.btnHelp.addEventListener("click", _openHelp);
    if (dom.helpClose) dom.helpClose.addEventListener("click", _closeHelp);
    if (dom.helpOverlay) {
      dom.helpOverlay.addEventListener("mousedown", function (e) {
        if (e.target === dom.helpOverlay) _closeHelp();
      });
    }
  }

  var _modalFocus = null;
  function _openHelp() {
    _modalFocus = document.activeElement;
    if (dom.helpOverlay) dom.helpOverlay.hidden = false;
    if (dom.helpClose) dom.helpClose.focus();
  }

  function _closeHelp() {
    if (dom.helpOverlay) dom.helpOverlay.hidden = true;
    if (_modalFocus) _modalFocus.focus();
  }

  function _isHelpOpen() {
    return dom.helpOverlay && !dom.helpOverlay.hidden;
  }

  // ---- Collapsible settings groups ----

  function _initCollapsibleSettings() {
    if (!dom.settingsContainer) return;
    var titles = dom.settingsContainer.querySelectorAll(
      ".cp-setting-group-title",
    );
    for (var i = 0; i < titles.length; i++) {
      (function (title) {
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        var toggle = function () {
          var group = title.closest(".cp-setting-group");
          if (group) group.classList.toggle("collapsed");
        };
        title.addEventListener("click", toggle);
        title.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      })(titles[i]);
    }
  }

  // ---- Free-text style presets ("styles type") ----

  function _initFreeTextPresets() {
    // Preset chips
    if (dom.freeTextPresets) {
      var chips = dom.freeTextPresets.querySelectorAll("[data-ft-preset]");
      for (var i = 0; i < chips.length; i++) {
        (function (chip) {
          chip.addEventListener("click", function () {
            freeTextStyle.applyTemplate(chip.getAttribute("data-ft-preset"));
            _syncFreeTextPresetChips();
            _sendPreview();
            _notify("Style « " + chip.textContent + " » appliqué", "success");
          });
        })(chips[i]);
      }
    }

    if (dom.freeTextStyleContainer) {
      // Collapsible "Personnaliser" group(s)
      var titles = dom.freeTextStyleContainer.querySelectorAll(
        ".cp-setting-group-title",
      );
      for (var t = 0; t < titles.length; t++) {
        (function (title) {
          title.setAttribute("role", "button");
          title.setAttribute("tabindex", "0");
          var toggle = function () {
            var group = title.closest(".cp-setting-group");
            if (group) group.classList.toggle("collapsed");
          };
          title.addEventListener("click", toggle);
          title.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          });
        })(titles[t]);
      }

      // A manual tweak flips the preset to "Personnalisé" — refresh chip state
      // once all binding handlers have run.
      var refresh = function () {
        setTimeout(_syncFreeTextPresetChips, 0);
      };
      dom.freeTextStyleContainer.addEventListener("input", refresh);
      dom.freeTextStyleContainer.addEventListener("change", refresh);
    }

    if (dom.btnResetFreeTextStyle) {
      dom.btnResetFreeTextStyle.addEventListener("click", function () {
        freeTextStyle.reset();
        _syncFreeTextPresetChips();
        _sendPreview();
        _notify("Style du texte libre réinitialisé", "info");
      });
    }

    _syncFreeTextPresetChips();
  }

  function _syncFreeTextPresetChips() {
    if (!dom.freeTextPresets) return;
    var active = (freeTextStyle && freeTextStyle.getAll().template) || "custom";
    var chips = dom.freeTextPresets.querySelectorAll("[data-ft-preset]");
    for (var i = 0; i < chips.length; i++) {
      var key = chips[i].getAttribute("data-ft-preset");
      if (key === active) chips[i].classList.add("active");
      else chips[i].classList.remove("active");
      chips[i].setAttribute("aria-pressed", String(key === active));
    }
  }

  // ---- Data export / import ----

  function _exportData() {
    var data = {};
    window.VerseObs.Backup.keys.forEach(function (k) {
      var value = localStorage.getItem(k);
      if (value !== null) data[k] = value;
    });
    var payload = {
      app: "verseobs",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: data,
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "verseobs-backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      _notify("Sauvegarde exportée", "success");
    } catch (e) {
      _notify("Export impossible", "error");
    }
  }

  function _importData(file) {
    if (file.size > 8 * 1024 * 1024) {
      _notify("Sauvegarde trop volumineuse (8 Mo maximum)", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var payload = JSON.parse(e.target.result);
        var count = window.VerseObs.Backup.apply(payload, localStorage);
        _notify(
          "Import réussi (" + count + " clés) — rechargement…",
          "success",
        );
        setTimeout(function () {
          window.location.reload();
        }, 900);
      } catch (err) {
        _notify(err.message || "Fichier de sauvegarde invalide", "error");
      }
    };
    reader.onerror = function () {
      _notify("Lecture du fichier impossible", "error");
    };
    reader.readAsText(file);
  }

  // ---- Queue helpers ----

  function _addCurrentVerseToQueue() {
    var disp = _activeDisplay();
    if (!disp) return;
    queue.add({
      type: "verse",
      text: dom.previewText.innerText || disp.text,
      html: _getFormattedHtml() || "",
      reference: disp.reference,
      version: disp.version,
    });
    _notify("Passage ajouté au conducteur", "success");
    // Visual feedback
    if (dom.btnAddQueue) {
      dom.btnAddQueue.textContent = "Ajouté !";
      setTimeout(function () {
        dom.btnAddQueue.textContent = "+ Ajouter au conducteur";
      }, 1000);
    }
  }

  function _addFreeTextToQueue() {
    var data = freeText.getData();
    if (!data.text && !data.title) return;

    queue.add({
      type: "text",
      text: data.text,
      html: data.html || "",
      title: data.title,
      subtitle: data.subtitle,
    });

    // Visual feedback
    if (dom.btnFreeAddQueue) {
      dom.btnFreeAddQueue.textContent = "Ajouté !";
      setTimeout(function () {
        dom.btnFreeAddQueue.textContent = "+ Ajouter au conducteur";
      }, 1000);
    }
  }

  function _selectReference(value) {
    var ref = search.parseReference(value);
    if (!ref || !currentBibleId) return false;
    var start = ref.verseStart || 1;
    if (
      !bibleLoader.getVerse(currentBibleId, ref.bookId, ref.chapter, start) ||
      (ref.verseEnd &&
        !bibleLoader.getVerse(
          currentBibleId,
          ref.bookId,
          ref.chapter,
          ref.verseEnd,
        ))
    ) {
      _notify(
        "Cette référence n’existe pas dans la version sélectionnée",
        "error",
      );
      return false;
    }
    navigation.setSelection(ref.bookId, ref.chapter, start);
    _setPendingRange(ref);
    _updatePreview();
    return true;
  }

  // ---- Search ----

  function _bindSearch() {
    if (!dom.searchInput) return;

    dom.searchInput.addEventListener("input", function () {
      var val = dom.searchInput.value.trim();
      if (!val) {
        _hideSearchResults();
        return;
      }

      var ref = search.parseReference(val);
      if (ref && ref.bookId && ref.chapter) {
        _hideSearchResults();
        _selectReference(val);
        return;
      }

      if (currentBibleData) {
        search.searchDebounced(
          val,
          currentBibleData,
          function (results, total) {
            _showSearchResults(results, total);
          },
        );
      }
    });

    dom.searchInput.addEventListener("keydown", function (e) {
      var resultsVisible =
        dom.searchResults &&
        dom.searchResults.classList.contains("visible") &&
        _searchResults.length > 0;

      if (e.key === "ArrowDown" && resultsVisible) {
        e.preventDefault();
        _moveSearchActive(1);
        return;
      }
      if (e.key === "ArrowUp" && resultsVisible) {
        e.preventDefault();
        _moveSearchActive(-1);
        return;
      }

      if (e.key === "Enter") {
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        // Prefer the highlighted result when navigating with the keyboard.
        if (resultsVisible && _searchActiveIdx >= 0) {
          _selectSearchResult(_searchActiveIdx);
          return;
        }
        var val = dom.searchInput.value.trim();
        var ref = search.parseReference(val);
        if (ref && ref.bookId && ref.chapter) {
          _selectReference(val);
          dom.searchInput.value = "";
          _hideSearchResults();
        }
        return;
      }

      if (e.key === "Escape") {
        dom.searchInput.value = "";
        _hideSearchResults();
      }
    });
  }

  function _showSearchResults(results, total) {
    if (!dom.searchResults) return;
    _searchResults = results || [];
    _searchActiveIdx = -1;
    _renderSearchResults(total);
  }

  function _renderSearchResults(total) {
    dom.searchResults.innerHTML = "";

    if (_searchResults.length === 0) {
      var empty = document.createElement("div");
      empty.className = "cp-search-empty";
      empty.textContent = "Aucun verset trouvé";
      dom.searchResults.appendChild(empty);
      dom.searchResults.classList.add("visible");
      return;
    }

    // Count header (shows when the result list was capped).
    var count = document.createElement("div");
    count.className = "cp-search-count";
    var totalCount = typeof total === "number" ? total : _searchResults.length;
    if (totalCount > _searchResults.length) {
      count.textContent =
        totalCount + " versets — " + _searchResults.length + " affichés";
    } else {
      count.textContent =
        totalCount + (totalCount > 1 ? " versets" : " verset");
    }
    if (search.lastFuzzy) {
      count.textContent += " · résultats approchés";
      count.classList.add("cp-search-count-fuzzy");
    }
    dom.searchResults.appendChild(count);

    for (var i = 0; i < _searchResults.length; i++) {
      (function (r, idx) {
        var item = document.createElement("div");
        item.className =
          "cp-search-result-item" + (idx === _searchActiveIdx ? " active" : "");

        var ref = document.createElement("div");
        ref.className = "cp-search-result-ref";
        ref.textContent = r.reference;

        var text = document.createElement("div");
        text.className = "cp-search-result-text";
        // Highlight matched terms (search.highlight escapes the text first).
        text.innerHTML = search.highlight(r.text);

        item.appendChild(ref);
        item.appendChild(text);

        item.addEventListener("click", function () {
          _selectSearchResult(idx);
        });

        dom.searchResults.appendChild(item);
      })(_searchResults[i], i);
    }

    dom.searchResults.classList.add("visible");
  }

  function _moveSearchActive(delta) {
    if (_searchResults.length === 0) return;
    if (_searchActiveIdx === -1) {
      _searchActiveIdx = delta > 0 ? 0 : _searchResults.length - 1;
    } else {
      _searchActiveIdx =
        (_searchActiveIdx + delta + _searchResults.length) %
        _searchResults.length;
    }
    _renderSearchResults();
    var active = dom.searchResults.querySelector(
      ".cp-search-result-item.active",
    );
    if (active && active.scrollIntoView)
      active.scrollIntoView({ block: "nearest" });
  }

  function _selectSearchResult(idx) {
    var r = _searchResults[idx];
    if (!r) return;
    navigation.setSelection(r.bookId, r.chapter, r.verse);
    _pendingRange = null;
    _updatePreview();
    dom.searchInput.value = "";
    _hideSearchResults();
  }

  function _hideSearchResults() {
    if (dom.searchResults) {
      dom.searchResults.classList.remove("visible");
    }
  }

  // ---- Version selector ----

  function _bindVersionSelector() {
    if (!dom.versionSelect) return;

    dom.versionSelect.addEventListener("change", function () {
      var id = dom.versionSelect.value;
      _loadBible(id);
    });
  }

  // ---- Navigation change ----

  function _onNavigationChange(sel) {
    // Manually moving the dropdowns cancels any typed verse range.
    _pendingRange = null;
    _updatePreview();
  }

  // ---- Preview ----

  function _updatePreview() {
    if (!currentBibleId) return;

    var sel = navigation.getSelection();
    var verse = _activeDisplay();

    if (verse) {
      if (dom.previewText) {
        if (verse.isRange) dom.previewText.innerHTML = verse.html;
        else dom.previewText.textContent = verse.text;
        dom.previewText.className = "cp-preview-text";
        dom.previewText.setAttribute("contenteditable", "true");
      }
      if (dom.previewRef) {
        dom.previewRef.textContent = verse.reference;
        dom.previewRef.style.display = "";
      }
    } else {
      if (dom.previewText) {
        dom.previewText.textContent = "Aucun verset trouvé";
        dom.previewText.className = "cp-preview-text cp-preview-empty";
        dom.previewText.setAttribute("contenteditable", "false");
      }
      if (dom.previewRef) {
        dom.previewRef.style.display = "none";
      }
    }
    _updateFavButton();
    _sendPreview();
    if (window.VerseObs.Studio) window.VerseObs.Studio.refreshChapter();
    try {
      localStorage.setItem(
        "verseobs_selection",
        JSON.stringify({ version: currentBibleId, selection: sel }),
      );
    } catch (e) {}
  }

  // ---- Current verse helpers ----

  /**
   * Build a verse item {bookId, chapter, verse, reference, text, version}
   * from the current navigation selection, or null if unavailable.
   */
  function _currentVerseItem() {
    if (!currentBibleId) return null;
    var sel = navigation.getSelection();
    var verse = bibleLoader.getVerse(
      currentBibleId,
      sel.bookId,
      sel.chapter,
      sel.verse,
    );
    if (!verse) return null;
    return {
      bookId: sel.bookId,
      chapter: sel.chapter,
      verse: sel.verse,
      reference: verse.reference,
      text: verse.text,
      version: _currentVersionName(),
    };
  }

  /**
   * Resolve what should actually be displayed for the current selection,
   * honoring an active multi-verse range. Returns {text, html?, reference,
   * version, isRange} or null.
   */
  function _activeDisplay() {
    if (!currentBibleId) return null;
    var sel = navigation.getSelection();

    if (
      _pendingRange &&
      _pendingRange.bookId === sel.bookId &&
      Number(_pendingRange.chapter) === Number(sel.chapter) &&
      Number(_pendingRange.start) === Number(sel.verse)
    ) {
      var range = bibleLoader.getRange(
        currentBibleId,
        sel.bookId,
        sel.chapter,
        _pendingRange.start,
        _pendingRange.end,
      );
      if (range && range.lastVerse !== range.firstVerse) {
        return {
          text: range.text,
          html: range.html,
          reference: range.reference,
          version: _currentVersionName(),
          isRange: true,
        };
      }
    }

    var verse = bibleLoader.getVerse(
      currentBibleId,
      sel.bookId,
      sel.chapter,
      sel.verse,
    );
    if (!verse) return null;
    return {
      text: verse.text,
      reference: verse.reference,
      version: _currentVersionName(),
      isRange: false,
    };
  }

  /**
   * Mark a pending range from a parsed reference (call after setSelection to start).
   */
  function _setPendingRange(ref) {
    if (ref && ref.verseEnd && ref.verseEnd > (ref.verseStart || 1)) {
      _pendingRange = {
        bookId: ref.bookId,
        chapter: ref.chapter,
        start: ref.verseStart || 1,
        end: ref.verseEnd,
      };
    } else {
      _pendingRange = null;
    }
  }

  function _currentVersionName() {
    if (dom.versionSelect) {
      var opt = dom.versionSelect.options[dom.versionSelect.selectedIndex];
      if (opt) return opt.textContent;
    }
    return currentBibleId || "";
  }

  function _updateFavButton() {
    if (!dom.btnFav || !favorites) return;
    var item = _currentVerseItem();
    var isFav = item ? favorites.has(item) : false;
    dom.btnFav.classList.toggle("is-fav", isFav);
    dom.btnFav.setAttribute("aria-pressed", isFav ? "true" : "false");
    dom.btnFav.innerHTML = isFav ? "&#9733;" : "&#9734;"; // ★ / ☆
    dom.btnFav.title = isFav ? "Retirer des favoris" : "Ajouter aux favoris";
  }

  function _toggleFavorite() {
    var item = _currentVerseItem();
    if (!item) return;
    var nowFav = favorites.toggle(item);
    _notify(
      nowFav ? "Ajouté aux favoris : " + item.reference : "Retiré des favoris",
      nowFav ? "success" : "info",
    );
  }

  // ---- Show / Hide ----

  function _showCurrentVerse() {
    var disp = _activeDisplay();
    if (!disp) return;

    var sel = navigation.getSelection();
    var versionName = disp.version;

    var msgData = {
      text: dom.previewText ? dom.previewText.innerText : disp.text,
      reference: disp.reference,
      version: versionName,
      settings: settings.getAll(),
    };

    if (disp.isRange) {
      // Range carries its own multi-verse markup.
      msgData.html = _getFormattedHtml() || disp.html;
    } else {
      // Include manual formatting from the preview editor, if any.
      var html = _getFormattedHtml();
      if (html) msgData.html = html;
    }

    _sendMessage(MSG.SHOW_VERSE, msgData);
    _notify("Affiché : " + disp.reference, "success");
    _onAirItem = {
      type: "verse",
      bookId: sel.bookId,
      chapter: sel.chapter,
      verse: sel.verse,
    };
    _setOnAir(disp.reference + (versionName ? "  ·  " + versionName : ""));

    history.add({
      reference: disp.reference,
      text: msgData.text,
      html: msgData.html || "",
      version: versionName,
    });
    history.renderList(dom.historyContainer);
  }

  function _hideVerse() {
    _sendMessage(MSG.HIDE, {});
    _notify("Overlay masqué", "info");
    _onAirItem = null;
    _clearOnAir();
  }

  function _showVerseFromHistory(entry) {
    queue.add({
      type: "verse",
      text: entry.text,
      html: entry.html || "",
      reference: entry.reference,
      version: entry.version || "",
    });
    queue.select(queue.getState().total - 1);
    _switchTab(2);
    _notify("Passage préparé dans le conducteur", "info");
  }

  // ---- Messaging (BroadcastChannel + localStorage fallback) ----

  var _connTimer = null;
  function _initChannel() {
    channel = new window.VerseObs.Channel({
      autoPong: false,
      onTransport: function (connected) {
        if (window.VerseObs.Studio) window.VerseObs.Studio.setRelay(connected);
      },
    });
    channel.onMessage(_handleMessage);
    _sendMessage(MSG.PING, {});
    setInterval(function () {
      _sendMessage(MSG.PING, {});
    }, 3000);
  }
  function _handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === MSG.PONG || msg.type === MSG.OUTPUT_STATE) {
      _setConnected(true);
      clearTimeout(_connTimer);
      _connTimer = setTimeout(function () {
        _setConnected(false);
      }, 7000);
    }
    if (msg.type === MSG.OUTPUT_STATE) {
      if (msg.visible) {
        _setOnAir(msg.label || "Texte libre");
        document.querySelector(".cp-onair-label").textContent =
          "Sortie confirmée";
      } else {
        _onAirItem = null;
        _clearOnAir();
      }
    }
  }
  function _sendMessage(type, data) {
    var msg = Object.assign({ type: type }, data || {});
    // Carry the background with the command for isolated OBS browser contexts.
    if (msg.settings && msg.settings.bgImage === undefined)
      msg.settings.bgImage = "";
    if (channel) channel.send(msg);
    if ([MSG.SHOW_VERSE, MSG.SHOW_TEXT].indexOf(type) !== -1) {
      document.querySelector(".cp-onair-label").textContent =
        "Commande de diffusion";
      if (window.VerseObs.Studio) window.VerseObs.Studio.rememberOutput(msg);
    }
    if (type === MSG.HIDE && window.VerseObs.Studio)
      window.VerseObs.Studio.rememberOutput(null);
  }

  // ---- Toast notifications ----

  /**
   * Show a transient toast. type: 'success' | 'error' | 'info'.
   */
  function _notify(message, type) {
    if (!dom.toastContainer) return;
    var toast = document.createElement("div");
    toast.className = "cp-toast cp-toast-" + (type || "info");
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    // Trigger entrance transition on next frame.
    requestAnimationFrame(function () {
      toast.classList.add("cp-toast-visible");
    });

    setTimeout(function () {
      toast.classList.remove("cp-toast-visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 2200);
  }

  function _setLoading(loading) {
    if (dom.versionLoading) dom.versionLoading.hidden = !loading;
    if (dom.versionSelect) dom.versionSelect.disabled = loading;
  }

  function _setConnected(connected) {
    document.body.classList.toggle("output-connected", connected);
    if (dom.connectionDot) {
      if (connected) {
        dom.connectionDot.classList.add("connected");
      } else {
        dom.connectionDot.classList.remove("connected");
      }
    }
    if (dom.connectionText) {
      dom.connectionText.textContent = connected
        ? "Sortie connectée"
        : "Aucune sortie connectée";
    }
  }

  // ---- Quick search palette (Ctrl+K) ----

  var _paletteItems = [];
  var _paletteActive = -1;

  function _initPalette() {
    if (!dom.paletteInput || !dom.paletteOverlay) return;

    dom.paletteInput.addEventListener("input", function () {
      _runPaletteSearch(dom.paletteInput.value.trim());
    });

    dom.paletteInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        _movePaletteActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        _movePaletteActive(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        _selectPalette(_paletteActive >= 0 ? _paletteActive : 0);
      } else if (e.key === "Escape") {
        e.preventDefault();
        _closePalette();
      }
    });

    // Click outside the dialog closes it.
    dom.paletteOverlay.addEventListener("mousedown", function (e) {
      if (e.target === dom.paletteOverlay) _closePalette();
    });
  }

  function _openPalette() {
    if (!dom.paletteOverlay) return;
    _modalFocus = document.activeElement;
    dom.paletteOverlay.hidden = false;
    dom.paletteInput.value = "";
    _paletteItems = [];
    _paletteActive = -1;
    dom.paletteResults.innerHTML = "";
    dom.paletteInput.focus();
  }

  function _closePalette() {
    if (!dom.paletteOverlay) return;
    dom.paletteOverlay.hidden = true;
    if (_modalFocus && _modalFocus.getClientRects().length) _modalFocus.focus();
    else if (dom.searchInput) dom.searchInput.focus();
  }

  function _isPaletteOpen() {
    return dom.paletteOverlay && !dom.paletteOverlay.hidden;
  }

  function _runPaletteSearch(val) {
    _paletteItems = [];
    _paletteActive = -1;

    if (!val) {
      dom.paletteResults.innerHTML = "";
      return;
    }

    // Reference match → single direct result.
    var ref = search.parseReference(val);
    if (ref && ref.bookId && ref.chapter && currentBibleId) {
      var verse = bibleLoader.getVerse(
        currentBibleId,
        ref.bookId,
        ref.chapter,
        ref.verseStart || 1,
      );
      if (verse) {
        search._terms = []; // no keyword highlight on a pure reference match
        var pItem = {
          bookId: ref.bookId,
          chapter: ref.chapter,
          verse: ref.verseStart || 1,
          reference: verse.reference,
          text: verse.text,
        };
        // Multi-verse range: show combined text and a range reference.
        if (ref.verseEnd && ref.verseEnd > (ref.verseStart || 1)) {
          var rng = bibleLoader.getRange(
            currentBibleId,
            ref.bookId,
            ref.chapter,
            ref.verseStart || 1,
            ref.verseEnd,
          );
          if (rng && rng.lastVerse !== rng.firstVerse) {
            pItem.reference = rng.reference;
            pItem.text = rng.text;
            pItem.verseEnd = ref.verseEnd;
          }
        }
        _paletteItems = [pItem];
        _renderPalette();
        return;
      }
    }

    // Otherwise keyword search over the current Bible.
    if (currentBibleData) {
      var results = search.searchText(val, currentBibleData);
      _paletteItems = results.slice(0, 25).map(function (r) {
        return {
          bookId: r.bookId,
          chapter: r.chapter,
          verse: r.verse,
          reference: r.reference,
          text: r.text,
        };
      });
      _paletteActive = _paletteItems.length > 0 ? 0 : -1;
    }
    _renderPalette();
  }

  function _renderPalette() {
    dom.paletteResults.innerHTML = "";

    if (_paletteItems.length === 0) {
      var empty = document.createElement("div");
      empty.className = "cp-palette-empty";
      empty.textContent = dom.paletteInput.value.trim() ? "Aucun résultat" : "";
      dom.paletteResults.appendChild(empty);
      return;
    }

    for (var i = 0; i < _paletteItems.length; i++) {
      (function (item, idx) {
        var el = document.createElement("div");
        el.className =
          "cp-palette-item" + (idx === _paletteActive ? " active" : "");

        var ref = document.createElement("div");
        ref.className = "cp-palette-item-ref";
        ref.textContent = item.reference;

        var text = document.createElement("div");
        text.className = "cp-palette-item-text";
        text.innerHTML = search.highlight(item.text);

        el.appendChild(ref);
        el.appendChild(text);
        el.addEventListener("click", function () {
          _selectPalette(idx);
        });
        dom.paletteResults.appendChild(el);
      })(_paletteItems[i], i);
    }
  }

  function _movePaletteActive(delta) {
    if (_paletteItems.length === 0) return;
    _paletteActive =
      (_paletteActive + delta + _paletteItems.length) % _paletteItems.length;
    _renderPalette();
    var active = dom.paletteResults.querySelector(".cp-palette-item.active");
    if (active && active.scrollIntoView)
      active.scrollIntoView({ block: "nearest" });
  }

  function _selectPalette(idx) {
    var item = _paletteItems[idx];
    if (!item) return;
    _switchTab(0);
    navigation.setSelection(item.bookId, item.chapter, item.verse);
    if (item.verseEnd) {
      _setPendingRange({
        bookId: item.bookId,
        chapter: item.chapter,
        verseStart: item.verse,
        verseEnd: item.verseEnd,
      });
    } else {
      _pendingRange = null;
    }
    _updatePreview();
    _closePalette();
  }

  // ---- Live overlay preview (in-dock mini view) ----

  function _initPreviewFrame() {
    var frames = document.querySelectorAll(".cp-preview-frame");
    if (!frames.length) return;

    _scalePreviewFrame();
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(_scalePreviewFrame);
      document.querySelectorAll(".cp-preview-stage").forEach(function (stage) {
        ro.observe(stage);
      });
    }
    window.addEventListener("resize", _scalePreviewFrame);

    // Re-send the current preview once each iframe is ready (they may load after
    // the first verse was selected).
    for (var i = 0; i < frames.length; i++) {
      frames[i].addEventListener("load", function () {
        _scalePreviewFrame();
        setTimeout(_sendPreview, 120);
      });
    }
  }

  function _scalePreviewFrame() {
    var frames = document.querySelectorAll(".cp-preview-frame");
    for (var i = 0; i < frames.length; i++) {
      var stage = frames[i].parentElement;
      var w = stage ? stage.clientWidth : 0;
      if (!w) continue;
      var scale = w / 1920;
      var top = 0;
      if (
        stage.id === "preview-stage" &&
        !stage.classList.contains("full-frame")
      ) {
        var position = settings ? settings.getAll().position : "lower-third";
        if (position === "fullscreen") {
          scale = Math.min(w / 1920, stage.clientHeight / 1080);
        } else if (position === "lower-third")
          top = stage.clientHeight - 1080 * scale;
        else if (position === "center")
          top = (stage.clientHeight - 1080 * scale) / 2;
      }
      frames[i].style.transform = "scale(" + scale + ")";
      frames[i].style.top = top + "px";
      frames[i].style.left = (w - 1920 * scale) / 2 + "px";
    }
  }

  /**
   * Push the current Bible/free-text selection to the preview iframe so the
   * mini overlay mirrors exactly what "Afficher" would show.
   */
  function _sendPreview() {
    _scalePreviewFrame();
    var activeTab = document.querySelector(".cp-tab-content.active");
    var data = null;

    var isFreeText = activeTab && activeTab.id === "tab-freetext";
    if (isFreeText && freeText) {
      var ft = freeText.getData();
      if (ft.text || ft.title) {
        data = { text: ft.text, title: ft.title, subtitle: ft.subtitle };
        if (ft.html) data.html = ft.html;
      }
    } else {
      var disp = _activeDisplay();
      if (disp) {
        data = {
          text: dom.previewText ? dom.previewText.innerText : disp.text,
          reference: disp.reference,
          version: disp.version,
        };
        if (disp.isRange) {
          data.html = _getFormattedHtml() || disp.html;
        } else {
          var html = _getFormattedHtml();
          if (html) data.html = html;
        }
      }
    }

    if (!data) {
      _sendMessage(MSG.PREVIEW_HIDE, {});
      return;
    }
    data.settings = (isFreeText ? freeTextStyle : settings).getAll();
    _sendMessage(MSG.PREVIEW, data);
  }

  // ---- On-air tracking ----

  function _setOnAir(label) {
    if (dom.onairBar) dom.onairBar.hidden = false;
    if (dom.onairRef) dom.onairRef.textContent = label || "";
  }

  function _clearOnAir() {
    if (dom.onairBar) dom.onairBar.hidden = true;
    if (dom.onairRef) dom.onairRef.textContent = "";
  }

  // ---- Copy ----

  function _copyCurrentVerse() {
    var item = _activeDisplay();
    if (!item) return;
    var str =
      item.reference +
      " — " +
      (dom.previewText.innerText || item.text) +
      " (" +
      item.version +
      ")";
    var done = function () {
      _notify("Verset copié", "success");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(done, function () {
        _notify("Copie impossible", "error");
      });
    } else {
      try {
        var ta = document.createElement("textarea");
        ta.value = str;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        _notify("Copie impossible", "error");
      }
    }
  }

  // ---- Tabs ----

  function _initTabs() {
    for (var i = 0; i < dom.tabs.length; i++) {
      (function (index) {
        dom.tabs[index].addEventListener("click", function () {
          _switchTab(index);
        });
      })(i);
    }
  }

  function _switchTab(index) {
    if (document.body.dataset.tab !== String(index)) window.scrollTo(0, 0);
    document.body.dataset.tab = index;
    if (window.VerseObs.Studio) window.VerseObs.Studio.onTab(index);
    for (var i = 0; i < dom.tabs.length; i++) {
      var isActive = i === index;
      dom.tabs[i].classList.toggle("active", isActive);
      dom.tabs[i].setAttribute("aria-selected", isActive ? "true" : "false");
      dom.tabs[i].setAttribute("tabindex", isActive ? "0" : "-1");
    }
    for (var j = 0; j < dom.tabContents.length; j++) {
      dom.tabContents[j].classList.toggle("active", j === index);
    }

    // Render queue when switching to queue tab (index 2)
    if (index === 2) {
      queue.render();
    }
    // Render history when switching to history tab (index 3)
    if (index === 3) {
      history.renderList(dom.historyContainer);
    }
    // Keep the live preview in sync with the active tab's content.
    // (Settings tab also has a preview; rescale it now that it's visible.)
    if (index === 0 || index === 1 || index === 4) {
      _scalePreviewFrame();
      _sendPreview();
    }
  }

  // ---- Keyboard shortcuts ----

  function _initKeyboard() {
    document.addEventListener("keydown", function (e) {
      // Open quick search palette (Ctrl+K), works from anywhere.
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        _openPalette();
        return;
      }

      // While the palette is open, let it own all keys (its own handler runs).
      if (_isPaletteOpen()) return;

      // Help modal: Escape closes it.
      if (_isHelpOpen()) {
        if (e.key === "Escape") {
          e.preventDefault();
          _closeHelp();
        }
        return;
      }

      // Don't intercept when editing in contenteditable
      var active = document.activeElement;
      var inEditable =
        active && active.getAttribute("contenteditable") === "true";
      var inInput =
        active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        var activeTab = document.querySelector(".cp-tab-content.active");
        if (activeTab && activeTab.id === "tab-freetext") {
          freeText.send();
        } else if (activeTab && activeTab.id === "tab-queue") {
          queue.showCurrent();
        } else {
          _showCurrentVerse();
        }
        return;
      }

      if (e.key === "Escape") {
        _hideVerse();
        return;
      }

      // Skip navigation shortcuts when editing
      if (inEditable || inInput) return;

      // Open help (?)
      if (e.key === "?") {
        e.preventDefault();
        _openHelp();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowRight") {
        e.preventDefault();
        var activeTabNav = document.querySelector(".cp-tab-content.active");
        if (activeTabNav && activeTabNav.id === "tab-queue") {
          queue.selectNext();
        } else {
          navigation.goToNext();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        var activeTabNav2 = document.querySelector(".cp-tab-content.active");
        if (activeTabNav2 && activeTabNav2.id === "tab-queue") {
          queue.selectPrevious();
        } else {
          navigation.goToPrevious();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        _switchTab(0);
        if (dom.searchInput) dom.searchInput.focus();
        return;
      }
    });
  }

  // ---- Bible loading ----

  function _loadDefaultBible() {
    bibleLoader.loadIndex(function (err, index) {
      if (err) {
        console.warn("VerseObs: Could not load Bible index:", err);
        _notify("Impossible de charger la liste des versions", "error");
        if (dom.versionSelect) {
          dom.versionSelect.innerHTML =
            '<option value="">Erreur de chargement</option>';
        }
        return;
      }

      _populateVersionSelector(index);

      var defaultId = "lsg";
      try {
        var savedSel = JSON.parse(localStorage.getItem("verseobs_selection"));
        if (
          savedSel &&
          index.versions.some(function (v) {
            return v.id === savedSel.version;
          })
        )
          defaultId = savedSel.version;
      } catch (e) {}
      if (index.versions && index.versions.length > 0) {
        var found = false;
        for (var i = 0; i < index.versions.length; i++) {
          if (index.versions[i].id === defaultId) {
            found = true;
            break;
          }
        }
        if (!found) {
          defaultId = index.versions[0].id;
        }
      }

      if (dom.versionSelect) {
        dom.versionSelect.value = defaultId;
      }

      _loadBible(defaultId);
    });
  }

  function _populateVersionSelector(index) {
    if (!dom.versionSelect || !index.versions) return;

    dom.versionSelect.innerHTML = "";

    for (var i = 0; i < index.versions.length; i++) {
      var b = index.versions[i];
      var opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name || b.id;
      if (b.type) opt.setAttribute("data-type", b.type);
      dom.versionSelect.appendChild(opt);
    }
  }

  var _bibleRequest = 0;
  function _loadBible(id) {
    _updateVersionIndicator(id);
    _setLoading(true);

    // Save current selection to restore after loading
    var prevSelection = navigation.getSelection();
    if (!currentBibleId) {
      try {
        var saved = JSON.parse(localStorage.getItem("verseobs_selection"));
        prevSelection = saved && saved.selection;
      } catch (e) {}
      if (!prevSelection || !prevSelection.bookId)
        prevSelection = { bookId: "43", chapter: 3, verse: 16 };
    }
    var requestId = ++_bibleRequest;
    bibleLoader.loadBible(id, function (err, data) {
      if (requestId !== _bibleRequest) return;
      _setLoading(false);
      if (err) {
        console.warn("VerseObs: Could not load Bible:", id, err);
        _notify("Impossible de charger cette version", "error");
        if (currentBibleId) dom.versionSelect.value = currentBibleId;
        return;
      }

      currentBibleId = id;
      currentBibleData = data;
      navigation.populateBooks(data);

      // Restore previous selection if the book/chapter/verse exist in new version
      if (prevSelection && prevSelection.bookId) {
        var verse = bibleLoader.getVerse(
          id,
          prevSelection.bookId,
          prevSelection.chapter,
          prevSelection.verse,
        );
        if (verse) {
          navigation.setSelection(
            prevSelection.bookId,
            prevSelection.chapter,
            prevSelection.verse,
          );
        } else {
          // Try book + chapter (verse might not exist)
          var chapter = bibleLoader.getChapter(
            id,
            prevSelection.bookId,
            prevSelection.chapter,
          );
          if (chapter) {
            navigation.setSelection(
              prevSelection.bookId,
              prevSelection.chapter,
              1,
            );
          } else {
            // Try just the book
            var bookList = bibleLoader.getBookList(id);
            var bookExists =
              bookList &&
              bookList.some(function (b) {
                return b.id === prevSelection.bookId;
              });
            if (bookExists) {
              navigation.setSelection(prevSelection.bookId, 1, 1);
            }
          }
        }
      }

      _updatePreview();
    });
  }

  function _updateVersionIndicator(id) {
    if (!dom.versionIndicator || !dom.versionSelect) return;

    var opt = dom.versionSelect.querySelector('option[value="' + id + '"]');
    var type = opt ? opt.getAttribute("data-type") || "local" : "local";

    dom.versionIndicator.textContent = type;
    dom.versionIndicator.className = "cp-version-indicator " + type;
  }

  // ---- Start ----

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
