/*
 * VerseObs - small QR Code encoder (ISO/IEC 18004) for the phone remote, so
 * pairing never depends on a CDN or a network call.
 * Byte mode (UTF-8), versions 1 to 40, error correction L/M/Q/H, automatic
 * mask selection.
 *
 * Adapted from the QR Code generator library by Project Nayuki (MIT License),
 * https://www.nayuki.io/page/qr-code-generator-library - see
 * qrcode.LICENSE.txt. tests/run.js checks reference matrices and decodes the
 * output.
 */
(function (root) {
  "use strict";

  var LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
  var FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  var BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  function rawModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var align = Math.floor(ver / 7) + 2;
      result -= (25 * align - 10) * align - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function dataCodewords(ver, level) {
    return (
      Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[level][ver] * BLOCKS[level][ver]
    );
  }
  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var count = Math.floor(ver / 7) + 2,
      size = ver * 4 + 17,
      step = Math.floor((ver * 8 + count * 3 + 5) / (count * 4 - 4)) * 2,
      result = [6];
    for (var pos = size - 7; result.length < count; pos -= step)
      result.splice(1, 0, pos);
    return result;
  }

  // ---- Reed-Solomon over GF(2^8), polynomial 0x11D ----
  function multiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function divisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var r = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = multiply(result[j], r);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      r = multiply(r, 0x02);
    }
    return result;
  }
  function remainder(data, div) {
    var result = div.map(function () {
      return 0;
    });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      for (var i = 0; i < div.length; i++) result[i] ^= multiply(div[i], factor);
    });
    return result;
  }

  function utf8(text) {
    if (typeof TextEncoder !== "undefined")
      return Array.from(new TextEncoder().encode(text));
    var bytes = [],
      s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    return bytes;
  }

  /** Data codewords: byte mode, count, data, terminator and padding. */
  function encodeData(bytes, ver, level) {
    var bits = [];
    function put(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) {
      put(b, 8);
    });
    var capacity = dataCodewords(ver, level) * 8;
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    var words = [];
    for (var i = 0; i < bits.length; i += 8) {
      var w = 0;
      for (var j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      words.push(w);
    }
    return words;
  }

  /** Split into blocks, add error correction, interleave. */
  function interleave(data, ver, level) {
    var blocks = BLOCKS[level][ver],
      eccLen = ECC_PER_BLOCK[level][ver],
      raw = Math.floor(rawModules(ver) / 8),
      shortBlocks = blocks - (raw % blocks),
      shortLen = Math.floor(raw / blocks),
      div = divisor(eccLen),
      parts = [];
    for (var i = 0, k = 0; i < blocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = remainder(dat, div);
      if (i < shortBlocks) dat.push(0);
      parts.push(dat.concat(ecc));
    }
    var result = [];
    for (var n = 0; n < parts[0].length; n++)
      for (var b = 0; b < parts.length; b++)
        if (n !== shortLen - eccLen || b >= shortBlocks) result.push(parts[b][n]);
    return result;
  }

  function Matrix(ver) {
    this.size = ver * 4 + 17;
    this.dark = new Uint8Array(this.size * this.size);
    this.fixed = new Uint8Array(this.size * this.size);
  }
  Matrix.prototype.set = function (x, y, dark) {
    this.dark[y * this.size + x] = dark ? 1 : 0;
    this.fixed[y * this.size + x] = 1;
  };

  function finder(m, cx, cy) {
    for (var dy = -4; dy <= 4; dy++)
      for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)),
          x = cx + dx,
          y = cy + dy;
        if (x >= 0 && x < m.size && y >= 0 && y < m.size) m.set(x, y, d !== 2 && d !== 4);
      }
  }
  function formatBits(m, level, mask) {
    var data = (FORMAT_BITS[level] << 3) | mask,
      rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412,
      size = m.size,
      bit = function (n) {
        return ((bits >>> n) & 1) === 1;
      };
    for (var a = 0; a <= 5; a++) m.set(8, a, bit(a));
    m.set(8, 7, bit(6));
    m.set(8, 8, bit(7));
    m.set(7, 8, bit(8));
    for (var b = 9; b < 15; b++) m.set(14 - b, 8, bit(b));
    for (var c = 0; c < 8; c++) m.set(size - 1 - c, 8, bit(c));
    for (var d = 8; d < 15; d++) m.set(8, size - 15 + d, bit(d));
    m.set(8, size - 8, true);
  }
  function versionBits(m, ver) {
    if (ver < 7) return;
    var rem = ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (ver << 12) | rem;
    for (var k = 0; k < 18; k++) {
      var dark = ((bits >>> k) & 1) === 1,
        a = m.size - 11 + (k % 3),
        b = Math.floor(k / 3);
      m.set(a, b, dark);
      m.set(b, a, dark);
    }
  }
  function functionPatterns(m, ver, level) {
    for (var i = 0; i < m.size; i++) {
      m.set(6, i, i % 2 === 0);
      m.set(i, 6, i % 2 === 0);
    }
    finder(m, 3, 3);
    finder(m, m.size - 4, 3);
    finder(m, 3, m.size - 4);
    var pos = alignmentPositions(ver),
      n = pos.length;
    for (var a = 0; a < n; a++)
      for (var b = 0; b < n; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0))
          continue;
        for (var dy = -2; dy <= 2; dy++)
          for (var dx = -2; dx <= 2; dx++)
            m.set(pos[a] + dx, pos[b] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    formatBits(m, level, 0);
    versionBits(m, ver);
  }
  function placeCodewords(m, words) {
    var i = 0,
      size = m.size,
      total = words.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++)
        for (var j = 0; j < 2; j++) {
          var x = right - j,
            up = ((right + 1) & 2) === 0,
            y = up ? size - 1 - vert : vert,
            k = y * size + x;
          if (!m.fixed[k] && i < total) {
            m.dark[k] = (words[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
        }
    }
  }
  function maskHit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }
  function applyMask(m, mask) {
    for (var y = 0; y < m.size; y++)
      for (var x = 0; x < m.size; x++) {
        var k = y * m.size + x;
        if (!m.fixed[k] && maskHit(mask, x, y)) m.dark[k] ^= 1;
      }
  }

  /**
   * Penalty rules N1-N4 of the specification; the lowest score wins.
   * Finder-like patterns (N3) are counted on run lengths with a light border,
   * as in the reference implementation, so the chosen mask matches it.
   */
  function penalty(m) {
    var size = m.size,
      dark = m.dark,
      score = 0,
      count = 0;
    function at(x, y) {
      return dark[y * size + x];
    }
    function addHistory(length, history) {
      if (history[0] === 0) length += size;
      history.pop();
      history.unshift(length);
    }
    function finderLike(h) {
      var n = h[1],
        core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (
        (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) +
        (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
      );
    }
    function line(get) {
      var color = 0,
        run = 0,
        history = [0, 0, 0, 0, 0, 0, 0],
        s = 0;
      for (var i = 0; i < size; i++) {
        if (get(i) === color) {
          run++;
          if (run === 5) s += 3;
          else if (run > 5) s++;
        } else {
          addHistory(run, history);
          if (!color) s += finderLike(history) * 40;
          color = get(i);
          run = 1;
        }
      }
      if (color) {
        addHistory(run, history);
        run = 0;
      }
      addHistory(run + size, history);
      return s + finderLike(history) * 40;
    }
    for (var y = 0; y < size; y++) {
      score += line(function (i) {
        return at(i, y);
      });
      score += line(function (i) {
        return at(y, i);
      });
    }
    for (var by = 0; by < size - 1; by++)
      for (var bx = 0; bx < size - 1; bx++) {
        var c = at(bx, by);
        if (c === at(bx + 1, by) && c === at(bx, by + 1) && c === at(bx + 1, by + 1))
          score += 3;
      }
    for (var k = 0; k < dark.length; k++) count += dark[k];
    var total = size * size;
    score += (Math.ceil(Math.abs(count * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  /**
   * Encode text. options: { ecl: "L"|"M"|"Q"|"H" (default "M"), mask: 0-7 }.
   * Returns { version, size, ecl, mask, isDark(x, y), modules }.
   */
  function encode(text, options) {
    options = options || {};
    var level = LEVELS[options.ecl || "M"];
    if (level === undefined) throw new Error("Niveau de correction invalide");
    var bytes = utf8(String(text)),
      ver = 1;
    for (; ver <= 40; ver++) {
      var needed = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (needed <= dataCodewords(ver, level) * 8) break;
    }
    if (ver > 40) throw new Error("Texte trop long pour un QR code");
    var words = interleave(encodeData(bytes, ver, level), ver, level);
    var best = null,
      bestScore = Infinity;
    var masks =
      options.mask >= 0 && options.mask <= 7 ? [options.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
    masks.forEach(function (mask) {
      var m = new Matrix(ver);
      functionPatterns(m, ver, level);
      placeCodewords(m, words);
      applyMask(m, mask);
      formatBits(m, level, mask);
      var s = masks.length > 1 ? penalty(m) : 0;
      if (s < bestScore) {
        best = { matrix: m, mask: mask };
        bestScore = s;
      }
    });
    var matrix = best.matrix;
    return {
      version: ver,
      size: matrix.size,
      ecl: options.ecl || "M",
      mask: best.mask,
      modules: matrix.dark,
      isDark: function (x, y) {
        return (
          x >= 0 && y >= 0 && x < matrix.size && y < matrix.size &&
          matrix.dark[y * matrix.size + x] === 1
        );
      },
    };
  }

  /** SVG markup with a quiet zone; dark modules merged into horizontal runs. */
  function toSvg(text, options) {
    options = options || {};
    var qr = encode(text, options),
      border = options.border == null ? 4 : options.border,
      full = qr.size + border * 2,
      d = "";
    for (var y = 0; y < qr.size; y++)
      for (var x = 0; x < qr.size; x++) {
        if (!qr.isDark(x, y)) continue;
        var run = 1;
        while (qr.isDark(x + run, y)) run++;
        d += "M" + (x + border) + " " + (y + border) + "h" + run + "v1h-" + run + "z";
        x += run - 1;
      }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + full + " " + full +
      '" shape-rendering="crispEdges" aria-hidden="true"><rect width="' + full +
      '" height="' + full + '" fill="' + (options.light || "#ffffff") + '"/><path d="' +
      d + '" fill="' + (options.dark || "#000000") + '"/></svg>'
    );
  }

  var api = { encode: encode, toSvg: toSvg };
  root.VerseObs = root.VerseObs || {};
  root.VerseObs.QR = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
