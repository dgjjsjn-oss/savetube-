/* ============================================================
   qr.js — self-contained QR code generator (versions 1-5, ECC L)
   Renders to a PNG data URL via canvas. No external API, works
   offline and under this site's CSP (data: URIs are allowed).
   Based on the classic public-domain QR algorithm by Kazuhiko
   Arase (MIT-style license), compacted for this project.
   ============================================================ */
(function (global) {
  "use strict";

  var EXP_TABLE = [], LOG_TABLE = [];
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 256; i++) {
      EXP_TABLE[i] = x;
      LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
  })();

  function gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }
  function glog(n) { return LOG_TABLE[n]; }

  function mul(a, b) { if (!a || !b) return 0; return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255]; }

  // ECC level L block data: versions 1-5 all use a single block.
  var VERSIONS = {
    1: { modules: 21, ecc: 7,  data: 19 },
    2: { modules: 25, ecc: 10, data: 34 },
    3: { modules: 29, ecc: 15, data: 55 },
    4: { modules: 33, ecc: 20, data: 80 },
    5: { modules: 37, ecc: 26, data: 108 }
  };
  var ALIGNMENT = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

  function rsGeneratorPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= mul(poly[j], gexp(i));
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, gen) {
    var res = new Array(gen.length - 1).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (var j = 0; j < gen.length - 1; j++) res[j] ^= mul(gen[j + 1], factor);
    }
    return res;
  }

  function getDataCodewords(text, version) {
    var v = VERSIONS[version];
    var capacityBytes = Math.floor((v.data * 8 - 4 - 8) / 8);
    var payload = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c > 255) throw new Error("qr: text must be byte-encodable");
      payload.push(c);
    }
    if (payload.length > capacityBytes) throw new Error("qr: text too long for version " + version);
    // mode 0100 + 8-bit count
    var bits = [0, 1, 0, 0];
    pushBits(bits, payload.length, 8);
    for (var b = 0; b < payload.length; b++) pushBits(bits, payload[b], 8);
    // terminator (up to 4 zero bits), pad to byte, pad bytes
    var available = v.data * 8 - bits.length;
    var term = Math.min(4, available);
    for (var t = 0; t < term; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    var j = 0;
    while (bits.length < v.data * 8) {
      var padByte = ((j++ % 2) === 0) ? 0xEC : 0x11;
      pushBits(bits, padByte, 8);
    }
    var out = [];
    for (var k = 0; k < v.data * 8; k += 8) {
      var byte = 0;
      for (var bit = 0; bit < 8; bit++) byte = (byte << 1) | (bits[k + bit] & 1);
      out.push(byte);
    }
    return out;

    function pushBits(arr, val, count) {
      for (var sh = count - 1; sh >= 0; sh--) arr.push((val >> sh) & 1);
    }
  }

  function buildMatrix(version, dataCodewords, eccCodewords) {
    var size = VERSIONS[version].modules;
    var mat = [];
    var func = [];
    for (var r = 0; r < size; r++) { mat.push(new Array(size).fill(null)); func.push(new Array(size).fill(false)); }

    var mark = function (x, y) { if (x >= 0 && y >= 0 && x < size && y < size) func[y][x] = true; };

    // finder patterns + separators
    for (var f = 0; f < 3; f++) {
      var fx = f === 1 ? size - 7 : 0;
      var fy = f === 0 ? 0 : (f === 1 ? 0 : size - 7);
      setFinder(fx, fy);
    }
    // timing patterns
    for (var i = 8; i < size - 8; i++) {
      if (mat[6][i] === null) { mat[6][i] = (i % 2 === 0) ? 1 : 0; mark(i, 6); }
      if (mat[i][6] === null) { mat[i][6] = (i % 2 === 0) ? 1 : 0; mark(6, i); }
    }
    // alignment patterns
    var pos = ALIGNMENT[version];
    if (pos && pos.length) {
      for (var ax = 0; ax < pos.length; ax++) {
        for (var ay = 0; ay < pos.length; ay++) {
          if (pos[ax] === 6 && pos[ay] === 6) continue; // overlaps finder
          if (pos[ax] === 6 && pos[ay] === size - 7) continue;
          if (pos[ax] === size - 7 && pos[ay] === 6) continue;
          if (version === 1) continue;
          setAlignment(pos[ax], pos[ay]);
        }
      }
    }
    // dark module
    mat[size - 8][8] = 1;
    mark(8, size - 8);

    function setFinder(x, y) {
      for (var dy = -1; dy <= 7; dy++) {
        for (var dx = -1; dx <= 7; dx++) {
          var xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          var inOuter = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          var p = 0;
          if (inOuter) p = (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)) ? 1 : 0;
          mat[yy][xx] = p;
          mark(xx, yy);
        }
      }
    }
    function setAlignment(x, y) {
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var p = (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) ? 1 : 0;
          if (mat[y + dy][x + dx] === null) { mat[y + dy][x + dx] = p; mark(x + dx, y + dy); }
        }
      }
    }

    // place data
    var all = dataCodewords.concat(eccCodewords);
    var bitIndex = 0;
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // skip timing column
      for (var row = 0; row < size; row++) {
        var r = upward ? size - 1 - row : row;
        for (var c = 0; c < 2; c++) {
          var cx = col - c;
          if (mat[r][cx] === null) {
            var bit = 0;
            if (bitIndex < all.length * 8) bit = (all[Math.floor(bitIndex / 8)] >> (7 - (bitIndex % 8))) & 1;
            mat[r][cx] = bit;
            bitIndex++;
          }
        }
      }
      upward = !upward;
    }
    return { mat: mat, func: func };
  }

  function applyMask(built, mask) {
    var mat = built.mat;
    var func = built.func;
    var size = mat.length;
    var m = mat.map(function (row) { return row.slice(); });
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (func[r][c]) continue; // function module — never masked
        if (m[r][c] === null) continue;
        var invert = false;
        switch (mask) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
          case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        }
        if (invert) m[r][c] = m[r][c] === 1 ? 0 : 1;
      }
    }
    return m;
  }

  function formatBits(mask) {
    var data = (1 << 3) | mask; // ECC L = 01 -> bits 10
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) !== 0 ? 0x537 : 0);
    return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
  }

  function placeFormat(mat, mask) {
    var size = mat.length;
    var bits = formatBits(mask);
    // around top-left finder
    for (var i = 0; i <= 5; i++) set(i, 8, (bits >> i) & 1);
    set(7, 8, (bits >> 6) & 1);
    set(8, 8, (bits >> 7) & 1);
    set(8, 7, (bits >> 8) & 1);
    for (var j = 9; j < 15; j++) set(8, 14 - j, (bits >> j) & 1);
    // second copy
    for (var k = 0; k < 8; k++) set(size - 1 - k, 8, (bits >> k) & 1);
    for (var l = 8; l < 15; l++) set(8, size - 15 + l, (bits >> l) & 1);
    set(8, size - 8, 1);

    function set(x, y, v) {
      if (x >= 0 && y >= 0 && x < size && y < size && mat[y][x] === null) mat[y][x] = v;
    }
  }

  function penalty(m) {
    var size = m.length;
    var score = 0;
    // N1 rows + cols
    for (var dir = 0; dir < 2; dir++) {
      for (var r = 0; r < size; r++) {
        var run = 1, cur = dir === 0 ? m[r][0] : m[0][r];
        for (var c = 1; c < size; c++) {
          var v = dir === 0 ? m[r][c] : m[c][r];
          if (v === cur) { run++; } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1; cur = v;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }
    // N2 2x2
    for (var rr = 0; rr < size - 1; rr++) {
      for (var cc = 0; cc < size - 1; cc++) {
        var v0 = m[rr][cc], v1 = m[rr][cc + 1], v2 = m[rr + 1][cc], v3 = m[rr + 1][cc + 1];
        if (v0 === v1 && v1 === v2 && v2 === v3) score += 3;
      }
    }
    // N3 finder-like 1011101 with 0000 on either side
    var pattern = [1, 0, 1, 1, 1, 0, 1];
    for (var d2 = 0; d2 < 2; d2++) {
      for (var r2 = 0; r2 < size; r2++) {
        for (var c2 = 0; c2 <= size - 8; c2++) {
          var ok = true;
          for (var p = 0; p < 7; p++) {
            var vv = d2 === 0 ? m[r2][c2 + p] : m[c2 + p][r2];
            if (vv !== pattern[p]) { ok = false; break; }
          }
          if (!ok) continue;
          var before = c2 >= 2 ? (d2 === 0 ? m[r2][c2 - 1] : m[c2 - 1][r2]) : null;
          var before2 = c2 >= 2 ? (d2 === 0 ? m[r2][c2 - 2] : m[c2 - 2][r2]) : null;
          var after = c2 + 8 < size ? (d2 === 0 ? m[r2][c2 + 7] : m[c2 + 7][r2]) : null;
          var after2 = c2 + 8 < size ? (d2 === 0 ? m[r2][c2 + 8] : m[c2 + 8][r2]) : null;
          if ((before === 0 && before2 === 0) || (after === 0 && after2 === 0)) score += 40;
        }
      }
    }
    // N4 dark proportion
    var dark = 0;
    for (var r3 = 0; r3 < size; r3++) for (var c3 = 0; c3 < size; c3++) dark += m[r3][c3];
    var pct = (dark * 100) / (size * size);
    score += 10 * Math.floor(Math.abs(pct - 50) / 5);
    return score;
  }

  function makeQR(text) {
    var version = 1, chosen = null, bestPenalty = Infinity, bestMask = 0, bestData = null, bestEcc = null;
    for (version = 1; version <= 5; version++) {
      var v = VERSIONS[version];
      var capacityBytes = Math.floor((v.data * 8 - 4 - 8) / 8);
      var byteLen = 0;
      for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i);
        if (c > 255) throw new Error("qr: non-ASCII not supported");
        byteLen++;
      }
      if (byteLen > capacityBytes) continue;
      var data = getDataCodewords(text, version);
      var gen = rsGeneratorPoly(v.ecc);
      var ecc = rsRemainder(data, gen);
      for (var mask = 0; mask < 8; mask++) {
        var base = buildMatrix(version, data, ecc);
        var masked = applyMask(base, mask);
        placeFormat(masked, mask);
        var p = penalty(masked);
        if (p < bestPenalty) { bestPenalty = p; chosen = masked; bestMask = mask; bestData = data; bestEcc = ecc; }
      }
      break;
    }
    if (!chosen) throw new Error("qr: text too long");
    return chosen;
  }

  function renderToDataURL(text, sizePx, margin, invert) {
    var modules = makeQR(text);
    var n = modules.length;
    var m = margin == null ? 2 : margin;
    var cell = Math.floor(sizePx / (n + m * 2));
    var dim = (n + m * 2) * cell;
    var canvas = document.createElement("canvas");
    canvas.width = dim; canvas.height = dim;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = invert ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = invert ? "#ffffff" : "#111111";
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (modules[r][c]) ctx.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
      }
    }
    return canvas.toDataURL("image/png");
  }

  global.makeQRCodeDataURL = renderToDataURL;
})(typeof window !== "undefined" ? window : this);