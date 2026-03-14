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
    // Bible Loader
    bibleLoader = new window.VerseObs.BibleLoader();

    // Search
    search = new window.VerseObs.Search();

    // Navigation
    navigation = new window.VerseObs.Navigation({
      bookSelect: dom.bookSelect,
      chapterSelect: dom.chapterSelect,
      verseSelect: dom.verseSelect,
      onSelectionChange: _onNavigationChange
    });

    // Settings
    settings = new window.VerseObs.Settings();
    settings.load();
    settings.bindUI(dom.settingsContainer);
    settings.onChange = function (s) {
      _sendMessage(MSG.UPDATE_STYLE, { settings: s });
    };

    // History
    history = new window.VerseObs.History();
    history.onClick = function (entry) {
      _showVerseFromHistory(entry);
    };
    history.renderList(dom.historyContainer);

    // Free Text
    freeText = new window.VerseObs.FreeText({
      textarea: dom.freeTextArea,
      onSend: function (text) {
        _sendMessage(MSG.SHOW_TEXT, { text: text });
      }
    });

    // Wire up buttons
    _bindButtons();

    // Wire up search
    _bindSearch();

    // Wire up version selector
    _bindVersionSelector();
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

      // Try parsing as reference first
      var ref = search.parseReference(val);
      if (ref && ref.bookId && ref.chapter) {
        _hideSearchResults();
        // Navigate to this reference
        navigation.setSelection(ref.bookId, ref.chapter, ref.verseStart || 1);
        _updatePreview();
        return;
      }

      // Otherwise do text search
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
      }
      if (dom.previewRef) {
        dom.previewRef.textContent = verse.reference;
        dom.previewRef.style.display = '';
      }
    } else {
      if (dom.previewText) {
        dom.previewText.textContent = 'No verse found';
        dom.previewText.className = 'cp-preview-text cp-preview-empty';
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

    _sendMessage(MSG.SHOW_VERSE, {
      text: verse.text,
      reference: verse.reference,
      settings: settings.getAll()
    });

    // Add to history
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
      settings: settings.getAll()
    });

    // Switch to Bible tab
    _switchTab(0);
  }

  // ---- Messaging (BroadcastChannel + localStorage fallback) ----

  function _initChannel() {
    // Try BroadcastChannel
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

    // Ping display to check connection
    _sendMessage(MSG.PING, {});

    // Listen for localStorage messages (fallback)
    window.addEventListener('storage', function (e) {
      if (e.key === LS_KEY && e.newValue) {
        try {
          var msg = JSON.parse(e.newValue);
          _handleMessage(msg);
        } catch (err) {
          // ignore
        }
      }
    });

    // Periodic ping
    setInterval(function () {
      _sendMessage(MSG.PING, {});
    }, 5000);

    // Connection timeout
    _connectionTimeout();
  }

  var _connTimer = null;

  function _connectionTimeout() {
    // If no PONG within 3s, mark disconnected
    _connTimer = setTimeout(function () {
      _setConnected(false);
    }, 3000);
  }

  function _handleMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === MSG.PONG) {
      _setConnected(true);
      if (_connTimer) clearTimeout(_connTimer);
      // Reset timer for next ping cycle
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

    // BroadcastChannel
    if (channel) {
      try {
        channel.postMessage(msg);
      } catch (e) {
        // fallback
      }
    }

    // localStorage fallback
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(msg));
      // Clear after brief delay so next write triggers storage event
      setTimeout(function () {
        localStorage.removeItem(LS_KEY);
      }, 100);
    } catch (e) {
      // ignore
    }
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

    // Refresh history when switching to history tab
    if (index === 2) {
      history.renderList(dom.historyContainer);
    }
  }

  // ---- Keyboard shortcuts ----

  function _initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Ctrl+Enter: show
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        // Check which tab is active
        var activeTab = document.querySelector('.cp-tab-content.active');
        if (activeTab && activeTab.id === 'tab-freetext') {
          freeText.send();
        } else {
          _showCurrentVerse();
        }
        return;
      }

      // Escape: hide
      if (e.key === 'Escape') {
        _hideVerse();
        return;
      }

      // Ctrl+Right: next verse
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigation.goToNext();
        return;
      }

      // Ctrl+Left: previous verse
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigation.goToPrevious();
        return;
      }

      // Ctrl+F: focus search
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

      // Populate version selector
      _populateVersionSelector(index);

      // Find default (LSG) or first available
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
    // Update indicator
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
