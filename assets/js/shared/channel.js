window.VerseObs = window.VerseObs || {};

/**
 * Communication channel that tries BroadcastChannel first,
 * then falls back to localStorage polling if unavailable or unresponsive.
 *
 * Usage:
 *   var ch = new window.VerseObs.Channel();
 *   ch.onMessage(function(msg) { console.log(msg); });
 *   ch.send({ type: 'show_verse', text: 'John 3:16', ts: Date.now() });
 *   ch.destroy();
 *
 * @constructor
 */
window.VerseObs.Channel = function() {
  var self = this;
  var channelName = window.VerseObs.CHANNEL_NAME || 'verseobs';
  var lsKey = window.VerseObs.LS_KEY || 'verseobs_msg';
  var MSG = window.VerseObs.MSG || {};

  self._listeners = [];
  self._bc = null;
  self._pollInterval = null;
  self._lastLsTs = 0;
  self._mode = null; // 'broadcast' or 'localstorage'
  self._destroyed = false;
  self._pendingPong = false;

  // ── Internal: dispatch a message to all registered callbacks ──
  function _dispatch(msg) {
    if (self._destroyed) return;
    for (var i = 0; i < self._listeners.length; i++) {
      try {
        self._listeners[i](msg);
      } catch (e) {
        // Swallow listener errors to keep other listeners running
      }
    }
  }

  // ── Internal: handle incoming raw message data ──
  function _handleRaw(data) {
    if (!data || typeof data !== 'object') return;

    // If we sent a PING and got a PONG back, confirm BroadcastChannel works
    if (data.type === MSG.PONG && self._pendingPong) {
      self._pendingPong = false;
      return;
    }

    // Auto-respond to PINGs with a PONG
    if (data.type === MSG.PING) {
      self._sendRaw({ type: MSG.PONG, ts: Date.now() });
      return;
    }

    _dispatch(data);
  }

  // ── Internal: send raw data through the active transport ──
  self._sendRaw = function(msg) {
    if (self._bc && self._mode === 'broadcast') {
      try {
        self._bc.postMessage(msg);
        return;
      } catch (e) {
        // BroadcastChannel may have been closed; fall through to localStorage
      }
    }
    // localStorage transport
    try {
      localStorage.setItem(lsKey, JSON.stringify(msg));
    } catch (e) {
      // localStorage may be full or disabled
    }
  };

  // ── localStorage polling setup ──
  function _startLsPoll() {
    if (self._pollInterval) return;

    // Listen for storage events from other tabs
    self._storageHandler = function(e) {
      if (e.key !== lsKey || !e.newValue) return;
      try {
        var data = JSON.parse(e.newValue);
        if (data.ts && data.ts > self._lastLsTs) {
          self._lastLsTs = data.ts;
          _handleRaw(data);
        }
      } catch (err) {
        // Ignore malformed data
      }
    };
    window.addEventListener('storage', self._storageHandler);

    // Also poll for same-tab messages (storage event doesn't fire in same tab)
    self._pollInterval = setInterval(function() {
      if (self._destroyed) return;
      try {
        var raw = localStorage.getItem(lsKey);
        if (!raw) return;
        var data = JSON.parse(raw);
        if (data.ts && data.ts > self._lastLsTs) {
          self._lastLsTs = data.ts;
          _handleRaw(data);
        }
      } catch (err) {
        // Ignore
      }
    }, 200);
  }

  function _stopLsPoll() {
    if (self._pollInterval) {
      clearInterval(self._pollInterval);
      self._pollInterval = null;
    }
    if (self._storageHandler) {
      window.removeEventListener('storage', self._storageHandler);
      self._storageHandler = null;
    }
  }

  // ── Initialization: try BroadcastChannel, fall back to localStorage ──
  function _init() {
    // Always start localStorage as a baseline so messages are never lost
    _startLsPoll();

    if (typeof BroadcastChannel === 'undefined') {
      self._mode = 'localstorage';
      return;
    }

    try {
      self._bc = new BroadcastChannel(channelName);
    } catch (e) {
      self._mode = 'localstorage';
      return;
    }

    self._bc.onmessage = function(e) {
      _handleRaw(e.data);
    };

    // Send a PING and wait up to 1 second for a PONG
    self._pendingPong = true;
    self._mode = 'broadcast';

    try {
      self._bc.postMessage({ type: MSG.PING, ts: Date.now() });
    } catch (e) {
      self._mode = 'localstorage';
      self._pendingPong = false;
      return;
    }

    self._pongTimeout = setTimeout(function() {
      if (self._destroyed) return;
      // If no PONG received, BroadcastChannel may not be working across contexts
      // Keep it alive anyway (it works, just no other tab responded yet)
      // Both transports run in parallel for maximum reliability
      self._pendingPong = false;
    }, 1000);
  }

  _init();

  // ── Public API ──

  /**
   * Send a message to all other tabs/windows.
   * Automatically adds a timestamp if not present.
   * @param {object} msg - The message object to send
   */
  self.send = function(msg) {
    if (self._destroyed) return;
    if (!msg.ts) msg.ts = Date.now();

    // Send through BroadcastChannel if available
    if (self._bc && self._mode === 'broadcast') {
      try {
        self._bc.postMessage(msg);
      } catch (e) {
        // Fall through to localStorage
      }
    }

    // Always write to localStorage as well for maximum compatibility
    try {
      localStorage.setItem(lsKey, JSON.stringify(msg));
    } catch (e) {
      // localStorage may be unavailable
    }
  };

  /**
   * Register a callback for incoming messages.
   * @param {function} callback - Function called with the message object
   */
  self.onMessage = function(callback) {
    if (typeof callback === 'function') {
      self._listeners.push(callback);
    }
  };

  /**
   * Clean up all resources (BroadcastChannel, intervals, event listeners).
   */
  self.destroy = function() {
    self._destroyed = true;
    self._listeners = [];

    if (self._pongTimeout) {
      clearTimeout(self._pongTimeout);
      self._pongTimeout = null;
    }

    if (self._bc) {
      try { self._bc.close(); } catch (e) {}
      self._bc = null;
    }

    _stopLsPoll();
    self._mode = null;
  };
};
