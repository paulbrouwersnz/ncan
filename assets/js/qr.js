/*
  qr.js - a QR code as an SVG, for a printed sheet to link back to the site.

    NCANQR.svg(text, { size: '30mm' })  -> an <svg> element, black on white
    NCANQR.matrix(text)                 -> [[true, false, ...], ...] (true = dark)

  Self-contained, so nothing is fetched from another site. Byte mode, error
  correction level M (copes with about 15% of the code smudged or torn),
  versions 1 to 10: up to 213 bytes of text, plenty for a page address.
  Follows ISO/IEC 18004; the layout and masking follow Project Nayuki's
  reference QR Code generator (MIT licence).
*/
(function () {
  'use strict';

  // level M, versions 1-10: error correction codewords per block, and blocks
  var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var FORMAT_M = 0;             // level M's two format bits

  function rawModules(ver) {
    var n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) { n -= 36; }
    }
    return n;
  }
  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];
  }
  function alignmentPositions(ver) {
    if (ver === 1) { return []; }
    var count = Math.floor(ver / 7) + 2;
    var step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
    var out = [6];
    for (var pos = ver * 4 + 10; out.length < count; pos -= step) { out.splice(1, 0, pos); }
    return out;
  }

  // ---- Reed-Solomon over GF(256), polynomial 0x11D
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var out = [];
    for (var i = 0; i < degree - 1; i++) { out.push(0); }
    out.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < out.length; j++) {
        out[j] = gfMul(out[j], root);
        if (j + 1 < out.length) { out[j] ^= out[j + 1]; }
      }
      root = gfMul(root, 0x02);
    }
    return out;
  }
  function rsRemainder(data, divisor) {
    var out = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ out.shift();
      out.push(0);
      divisor.forEach(function (c, i) { out[i] ^= gfMul(c, factor); });
    });
    return out;
  }

  function utf8(text) {
    var bytes = [];
    var s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) { bytes.push(s.charCodeAt(i)); }
    return bytes;
  }

  // the data codewords: byte mode, count, the bytes, terminator, padding
  function encode(bytes) {
    var ver;
    for (ver = 1; ver <= 10; ver++) {
      var bits = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (bits <= dataCodewords(ver) * 8) { break; }
    }
    if (ver > 10) { throw new Error('Text too long for a QR code here'); }
    var cap = dataCodewords(ver) * 8;
    var bb = [];
    var put = function (val, len) { for (var i = len - 1; i >= 0; i--) { bb.push((val >>> i) & 1); } };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) { put(pad, 8); }
    var words = [];
    for (var i = 0; i < bb.length; i += 8) {
      var w = 0;
      for (var j = 0; j < 8; j++) { w = (w << 1) | bb[i + j]; }
      words.push(w);
    }
    return { version: ver, data: words };
  }

  // split into blocks, add each block's error correction, interleave
  function withEcc(ver, data) {
    var blocks = BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var shortBlocks = blocks - raw % blocks;
    var shortLen = Math.floor(raw / blocks);
    var divisor = rsDivisor(eccLen);
    var all = [], k = 0;
    for (var i = 0; i < blocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < shortBlocks) { dat.push(0); }
      all.push(dat.concat(ecc));
    }
    var out = [];
    for (i = 0; i < all[0].length; i++) {
      for (var j = 0; j < all.length; j++) {
        if (i !== shortLen - eccLen || j >= shortBlocks) { out.push(all[j][i]); }
      }
    }
    return out;
  }

  function matrix(text) {
    var enc = encode(utf8(text));
    var ver = enc.version, size = ver * 4 + 17;
    var mods = [], fn = [];
    for (var y = 0; y < size; y++) {
      mods.push([]); fn.push([]);
      for (var x = 0; x < size; x++) { mods[y].push(false); fn[y].push(false); }
    }
    var set = function (x, y, dark) { mods[y][x] = dark; fn[y][x] = true; };

    // timing patterns, finders, alignment patterns
    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) { set(xx, yy, d !== 2 && d !== 4); }
        }
      }
    });
    var pos = alignmentPositions(ver), last = pos.length - 1;
    pos.forEach(function (a, ai) {
      pos.forEach(function (b, bi) {
        if ((ai === 0 && bi === 0) || (ai === 0 && bi === last) || (ai === last && bi === 0)) { return; }
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) { set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
        }
      });
    });

    function drawFormat(mask) {
      var data = FORMAT_M << 3 | mask, rem = data;
      for (var i = 0; i < 10; i++) { rem = (rem << 1) ^ ((rem >>> 9) * 0x537); }
      var bits = (data << 10 | rem) ^ 0x5412;
      var bit = function (i) { return ((bits >>> i) & 1) !== 0; };
      for (i = 0; i <= 5; i++) { set(8, i, bit(i)); }
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (i = 9; i < 15; i++) { set(14 - i, 8, bit(i)); }
      for (i = 0; i < 8; i++) { set(size - 1 - i, 8, bit(i)); }
      for (i = 8; i < 15; i++) { set(8, size - 15 + i, bit(i)); }
      set(8, size - 8, true);              // always dark
    }
    drawFormat(0);                         // reserve the format areas
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) { rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); }
      var vbits = ver << 12 | rem;
      for (i = 0; i < 18; i++) {
        var on = ((vbits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, on); set(b, a, on);
      }
    }

    // the codewords, in two-module columns zig-zagging up and down from the right
    var words = withEcc(ver, enc.data), n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) { right = 5; }
      for (var v = 0; v < size; v++) {
        for (var j = 0; j < 2; j++) {
          var xx = right - j, upward = ((right + 1) & 2) === 0, yy = upward ? size - 1 - v : v;
          if (!fn[yy][xx] && n < words.length * 8) {
            mods[yy][xx] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
            n++;
          }
        }
      }
    }

    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function applyMask(m) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) { if (!fn[y][x] && MASKS[m](x, y)) { mods[y][x] = !mods[y][x]; } }
      }
    }
    // the standard's penalty: long runs, 2x2 blocks, finder-like patterns, dark balance
    function penalty() {
      var score = 0, dark = 0, line = function (get) {
        var s = 0;
        for (var a = 0; a < size; a++) {
          var run = 1, str = '';
          for (var b = 0; b < size; b++) {
            str += get(a, b) ? '1' : '0';
            if (b > 0 && get(a, b) === get(a, b - 1)) { run++; } else {
              if (run >= 5) { s += 3 + run - 5; }
              run = 1;
            }
          }
          if (run >= 5) { s += 3 + run - 5; }
          var re = /(?=(10111010000|00001011101))/g, m;
          while ((m = re.exec(str)) !== null) { s += 40; re.lastIndex++; }
        }
        return s;
      };
      score += line(function (a, b) { return mods[a][b]; });
      score += line(function (a, b) { return mods[b][a]; });
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (mods[y][x]) { dark++; }
          if (x < size - 1 && y < size - 1) {
            var c = mods[y][x];
            if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) { score += 3; }
          }
        }
      }
      var total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var p = penalty();
      if (p < bestScore) { best = m; bestScore = p; }
      applyMask(m);                         // undo
    }
    applyMask(best); drawFormat(best);
    return mods;
  }

  function svg(text, opts) {
    var mods = matrix(text), size = mods.length, quiet = 4, full = size + quiet * 2;
    var NS = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 ' + full + ' ' + full);
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'QR code for ' + text);
    if (opts && opts.size) { el.style.width = el.style.height = opts.size; }
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', full); bg.setAttribute('height', full); bg.setAttribute('fill', '#fff');
    el.appendChild(bg);
    var d = '';
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (mods[y][x]) { d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z'; }
      }
    }
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', '#000');
    el.appendChild(path);
    return el;
  }

  window.NCANQR = { svg: svg, matrix: matrix, _rs: { divisor: rsDivisor, remainder: rsRemainder } };
}());
