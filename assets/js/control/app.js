/* VerseObs - Control Panel App (Main Orchestrator) */

(function () {
  'use strict';

  window.VerseObs = window.VerseObs || {};

  var MSG = window.VerseObs.MSG;
  var CHANNEL_NAME = window.VerseObs.CHANNEL_NAME || 'verseobs';
  var LS_KEY = window.VerseObs.LS_KEY || 'verseobs_msg';

  // ---- Module instances ----
  var bibleLoader, search, navigation, settings, history, freeText;
  var channel = null;
  var currentBibleId = null;
  var currentBibleData = null;

  // ---- DOM references ----
  var dom = {};

  function init() {
    _cacheDom();
    _initModules();
    _initTabs();
    _initChannel();
    _initKeyboard();
    _initFormatToolbar();
    _loadDefaultBible();
  }

  // ---- DOM caching ----

  function _cacheDom() {
    dom.connectionDot = document.getElementById('connection-dot');
    dom.connectionText = document.getElementById('connection-text');

    // Tabs
    dom.tabs = document.querySelectorAll('.cp-tab');
    dom.tabContents = document.querySelectorAll('.cp-tab-content');

    // Bible tab
    dom.versionSelect = document.getElementById('version-select');
    dom.versionIndicator = document.getElementById('version-indicator');
    dom.searchInput = document.getElementById('search-input');
    dom.searchResults = document.getElementById('search-results');
    dom.bookSelect = document.getElementById('book-select');
    dom.chapterSelect = document.getElementById('chapter-select');
    dom.verseSelect = document.getElementById('verse-select');
    dom.previewText = document.getElementById('preview-text');
    dom.previewRef = document.getElementById('preview-ref');
    dom.btnShow = document.getElementById('btn-show');
    dom.btnHide = document.getElementById('btn-hide');
    dom.btnPrev = document.getElementById('btn-prev');
    dom.btnNext = document.getElementById('btn-next');
    dom.btnPrevChapter = document.getElementById('btn-prev-chapter');
    dom.btnNextChapter = document.getElementById('btn-next-chapter');

    // Format toolbar
    dom.formatToolbar = document.getElementById('format-toolbar');
    dom.highlightColorInput = document.getElementById('highlight-color');

    // Free text tab
    dom.freeTextArea = document.getElementById('freetext-area');
    dom.btnFreeShow = document.getElementById('btn-free-show');
    dom.btnFreeHide = document.getElementById('btn-free-hide');

    // History tab
    dom.historyContainer = document.getElementById('history-container');
    dom.btnClearHistory = document.getElementById('btn-clear-history');

    // Settings tab
    dom.settingsContainer = document.getElementById('settings-container');
    dom.btnResetSettings = document.getElementById('btn-reset-settings');
  }

  // ---- Module initialization ----

  function _initModules() {
    bibleLoader = new window.VerseObs.BibleLoader();
    search = new window.VerseObs.Search();

    navigation = new window.VerseObs.Navigation({
      bookSelect: dom.bookSelect,
      chapterSelect: dom.chapterSelect,
      verseSelect: dom.verseSelect,
      onSelectionChange: _onNavigationChange
    });

    settings = new window.VerseObs.Settings();
    settings.load();
    settings.bindUI(dom.settingsContainer);
    settings.bindExtras(dom.settingsContainer);
    settings.onChange = function (s) {
      _sendMessage(MSG.UPDATE_STYLE, { settings: s });
    };

    history = new window.VerseObs.History();
    history.onClick = function (entry) {
      _showVerseFromHistory(entry);
    };
    history.renderList(dom.historyContainer);

    freeText = new window.VerseObs.FreeText({
      textarea: dom.freeTextArea,
      onSend: function (text) {
        _sendMessage(MSG.SHOW_TEXT, { text: text, settings: settings.getForMessage() });
      }
    });

    _bindButtons();
    _bindSearch();
    _bindVersionSelector();
  }

  // ---- Format Toolbar ----

  function _initFormatToolbar() {
    if (!dom.formatToolbar) return;

    var buttons = dom.formatToolbar.querySelectorAll('[data-format]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        // Use mousedown to prevent focus loss from preview contenteditable
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var format = btn.getAttribute('data-format');
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
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      case 'highlight':
        var color = dom.highlightColorInput ? dom.highlightColorInput.value : '#ffff00';
        var sel = window.getSelection();
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
          var range = sel.getRangeAt(0);
          // Check if already highlighted
          var parent = sel.anchorNode.parentElement;
          if (parent && parent.tagName === 'MARK') {
            // Remove highlight: unwrap mark
            var text = document.createTextNode(parent.textContent);
            parent.parentNode.replaceChild(text, parent);
          } else {
            var mark = document.createElement('mark');
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
      case 'clear':
        document.execCommand('removeFormat', false, null);
        // Also remove mark elements
        var marks = dom.previewText.querySelectorAll('mark');
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
    // Check if any formatting tags exist
    if (/<(b|i|u|strong|em|mark|span)\b/i.test(html)) {
      return html;
    }
    return null;
  }

  // ---- Button bindings ----

  function _bindButtons() {
    if (dom.btnShow) {
      dom.btnShow.addEventListener('click', _showCurrentVerse);
    }
    if (dom.btnHide) {
      dom.btnHide.addEventListener('click', _hideVerse);
    }
    if (dom.btnPrev) {
      dom.btnPrev.addEventListener('click', function () { navigation.goToPrevious(); });
    }
    if (dom.btnNext) {
      dom.btnNext.addEventListener('click', function () { navigation.goToNext(); });
    }
    if (dom.btnPrevChapter) {
      dom.btnPrevChapter.addEventListener('click', function () { navigation.goToPreviousChapter(); });
    }
    if (dom.btnNextChapter) {
      dom.btnNextChapter.addEventListener('click', function () { navigation.goToNextChapter(); });
    }
    if (dom.btnFreeShow) {
      dom.btnFreeShow.addEventListener('click', function () { freeText.send(); });
    }
    if (dom.btnFreeHide) {
      dom.btnFreeHide.addEventListener('click', _hideVerse);
    }
    if (dom.btnClearHistory) {
      dom.btnClearHistory.addEventListener('click', function () {
        history.clear();
        history.renderList(dom.historyContainer);
      });
    }
    if (dom.btnResetSettings) {
      dom.btnResetSettings.addEventListener('click', function () {
        settings.reset();
      });
    }
  }

  // ---- Search ----

  function _bindSearch() {
    if (!dom.searchInput) return;

    dom.searchInput.addEventListener('input', function () {
      var val = dom.searchInput.value.trim();
      if (!val) {
        _hideSearchResults();
        return;
      }

      var ref = search.parseReference(val);
      if (ref && ref.bookId && ref.chapter) {
        _hideSearchResults();
        navigation.setSelection(ref.bookId, ref.chapter, ref.verseStart || 1);
        _updatePreview();
        return;
      }

      if (currentBibleData) {
        search.searchDebounced(val, currentBibleData, function (results) {
          _showSearchResults(results);
        });
      }
    });

    dom.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = dom.searchInput.value.trim();
        var ref = search.parseReference(val);
        if (ref && ref.bookId && ref.chapter) {
          navigation.setSelection(ref.bookId, ref.chapter, ref.verseStart || 1);
          _updatePreview();
          dom.searchInput.value = '';
          _hideSearchResults();
        }
      }
      if (e.key === 'Escape') {
        dom.searchInput.value = '';
        _hideSearchResults();
      }
    });
  }

  function _showSearchResults(results) {
    if (!dom.searchResults) return;
    dom.searchResults.innerHTML = '';

    if (results.length === 0) {
      dom.searchResults.classList.remove('visible');
      return;
    }

    for (var i = 0; i < results.length; i++) {
      (function (r) {
        var item = document.createElement('div');
        item.className = 'cp-search-result-item';

        var ref = document.createElement('div');
        ref.className = 'cp-search-result-ref';
        ref.textContent = r.reference;

        var text = document.createElement('div');
        text.className = 'cp-search-result-text';
        text.textContent = r.text;

        item.appendChild(ref);
        item.appendChild(text);

        item.addEventListener('click', function () {
          navigation.setSelection(r.bookId, r.chapter, r.verse);
          _updatePreview();
          dom.searchInput.value = '';
          _hideSearchResults();
        });

        dom.searchResults.appendChild(item);
      })(results[i]);
    }

    dom.searchResults.classList.add('visible');
  }

  function _hideSearchResults() {
    if (dom.searchResults) {
      dom.searchResults.classList.remove('visible');
    }
  }

  // ---- Version selector ----

  function _bindVersionSelector() {
    if (!dom.versionSelect) return;

    dom.versionSelect.addEventListener('change', function () {
      var id = dom.versionSelect.value;
      _loadBible(id);
    });
  }

  // ---- Navigation change ----

  function _onNavigationChange(sel) {
    _updatePreview();
  }

  // ---- Preview ----

  function _updatePreview() {
    if (!currentBibleId) return;

    var sel = navigation.getSelection();
    var verse = bibleLoader.getVerse(currentBibleId, sel.bookId, sel.chapter, sel.verse);

    if (verse) {
      if (dom.previewText) {
        dom.previewText.textContent = verse.text;
        dom.previewText.className = 'cp-preview-text';
        dom.previewText.setAttribute('contenteditable', 'true');
      }
      if (dom.previewRef) {
        dom.previewRef.textContent = verse.reference;
        dom.previewRef.style.display = '';
      }
    } else {
      if (dom.previewText) {
        dom.previewText.textContent = 'No verse found';
        dom.previewText.className = 'cp-preview-text cp-preview-empty';
        dom.previewText.setAttribute('contenteditable', 'false');
      }
      if (dom.previewRef) {
        dom.previewRef.style.display = 'none';
      }
    }
  }

  // ---- Show / Hide ----

  function _showCurrentVerse() {
    if (!currentBibleId) return;

    var sel = navigation.getSelection();
    var verse = bibleLoader.getVerse(currentBibleId, sel.bookId, sel.chapter, sel.verse);

    if (!verse) return;

    var versionName = '';
    if (dom.versionSelect) {
      var opt = dom.versionSelect.options[dom.versionSelect.selectedIndex];
      versionName = opt ? opt.textContent : currentBibleId;
    }

    var msgData = {
      text: verse.text,
      reference: verse.reference,
      version: versionName,
      settings: settings.getForMessage()
    };

    // Include formatted HTML if user applied formatting
    var html = _getFormattedHtml();
    if (html) {
      msgData.html = html;
    }

    _sendMessage(MSG.SHOW_VERSE, msgData);

    history.add({
      reference: verse.reference,
      text: verse.text,
      version: versionName
    });
    history.renderList(dom.historyContainer);
  }

  function _hideVerse() {
    _sendMessage(MSG.HIDE, {});
  }

  function _showVerseFromHistory(entry) {
    _sendMessage(MSG.SHOW_VERSE, {
      text: entry.text,
      reference: entry.reference,
      settings: settings.getForMessage()
    });

    _switchTab(0);
  }

  // ---- Messaging (BroadcastChannel + localStorage fallback) ----

  function _initChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = function (e) {
          _handleMessage(e.data);
        };
      } catch (err) {
        channel = null;
      }
    }

    _sendMessage(MSG.PING, {});

    window.addEventListener('storage', function (e) {
      if (e.key === LS_KEY && e.newValue) {
        try {
          var msg = JSON.parse(e.newValue);
          _handleMessage(msg);
        } catch (err) {}
      }
    });

    setInterval(function () {
      _sendMessage(MSG.PING, {});
    }, 5000);

    _connectionTimeout();
  }

  var _connTimer = null;

  function _connectionTimeout() {
    _connTimer = setTimeout(function () {
      _setConnected(false);
    }, 3000);
  }

  function _handleMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === MSG.PONG) {
      _setConnected(true);
      if (_connTimer) clearTimeout(_connTimer);
      _connTimer = setTimeout(function () {
        _setConnected(false);
      }, 8000);
    }
  }

  function _sendMessage(type, data) {
    var msg = { type: type };
    if (data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          msg[key] = data[key];
        }
      }
    }

    if (channel) {
      try {
        channel.postMessage(msg);
      } catch (e) {}
    }

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(msg));
      setTimeout(function () {
        localStorage.removeItem(LS_KEY);
      }, 100);
    } catch (e) {}
  }

  function _setConnected(connected) {
    if (dom.connectionDot) {
      if (connected) {
        dom.connectionDot.classList.add('connected');
      } else {
        dom.connectionDot.classList.remove('connected');
      }
    }
    if (dom.connectionText) {
      dom.connectionText.textContent = connected ? 'Connected' : 'Disconnected';
    }
  }

  // ---- Tabs ----

  function _initTabs() {
    for (var i = 0; i < dom.tabs.length; i++) {
      (function (index) {
        dom.tabs[index].addEventListener('click', function () {
          _switchTab(index);
        });
      })(i);
    }
  }

  function _switchTab(index) {
    for (var i = 0; i < dom.tabs.length; i++) {
      dom.tabs[i].classList.toggle('active', i === index);
    }
    for (var j = 0; j < dom.tabContents.length; j++) {
      dom.tabContents[j].classList.toggle('active', j === index);
    }

    if (index === 2) {
      history.renderList(dom.historyContainer);
    }
  }

  // ---- Keyboard shortcuts ----

  function _initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Don't intercept when editing in contenteditable preview
      var active = document.activeElement;
      var inPreview = active && active.id === 'preview-text' && active.getAttribute('contenteditable') === 'true';

      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        var activeTab = document.querySelector('.cp-tab-content.active');
        if (activeTab && activeTab.id === 'tab-freetext') {
          freeText.send();
        } else {
          _showCurrentVerse();
        }
        return;
      }

      if (e.key === 'Escape') {
        _hideVerse();
        return;
      }

      // Skip navigation shortcuts when editing in preview
      if (inPreview) return;

      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigation.goToNext();
        return;
      }

      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigation.goToPrevious();
        return;
      }

      if (e.ctrlKey && e.key === 'f') {
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
        console.warn('VerseObs: Could not load Bible index:', err);
        return;
      }

      _populateVersionSelector(index);

      var defaultId = 'lsg';
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

    dom.versionSelect.innerHTML = '';

    for (var i = 0; i < index.versions.length; i++) {
      var b = index.versions[i];
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name || b.id;
      if (b.type) opt.setAttribute('data-type', b.type);
      dom.versionSelect.appendChild(opt);
    }
  }

  function _loadBible(id) {
    _updateVersionIndicator(id);

    bibleLoader.loadBible(id, function (err, data) {
      if (err) {
        console.warn('VerseObs: Could not load Bible:', id, err);
        return;
      }

      currentBibleId = id;
      currentBibleData = data;
      navigation.populateBooks(data);
      _updatePreview();
    });
  }

  function _updateVersionIndicator(id) {
    if (!dom.versionIndicator || !dom.versionSelect) return;

    var opt = dom.versionSelect.querySelector('option[value="' + id + '"]');
    var type = opt ? (opt.getAttribute('data-type') || 'local') : 'local';

    dom.versionIndicator.textContent = type;
    dom.versionIndicator.className = 'cp-version-indicator ' + type;
  }

  // ---- Start ----

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
