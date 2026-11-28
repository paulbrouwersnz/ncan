/*
  card-looks.js - how a meeting recap's preview card looks: its theme (colours and a
  picture in the corner), layout, pattern, sticker, font, the count it features, its
  headline and a photo from the club's gallery.

  Each meeting gets a suggested look (suggest): a holiday it falls on, a special
  meeting, the level of a championship, the kind of meeting, then the season. Staff
  can change any part of it in the recap editor; what they choose is saved with the
  recap (the API's "look"), and anything they leave is the suggestion.

  build() lays the card out as shapes and words in points (600 x 315, drawn at 2x),
  for recaps.js to draw on a canvas:
    rect   { x, y, w, h, colour, round }
    svg    { svg }                    SVG drawn over the whole card (viewBox 0 0 600 315)
    strip  { x, y, w, h, course, colour }   the meeting's track or course (course-strip.js)
    photo  { url, x, y, zoom }        a photo covering the card: x and y (0 to 100) where it's cut, zoom 1 or more
    shade  { colour, mode }           the theme's colour over the photo: 'side' or 'all'
    logo   { x, y, w, h, dark }       the club's crest (dark: the one for dark backgrounds)
    badge  { src, x, y, w, h }        an event's own logo, on a white disc (the Colgate Games')
    text   { words, x, y, size, weight, font ('display' or 'sans'), colour, align, max,
             spacing, italic, squeeze (narrower, 0 to 1), dots (as lit dots), rotate }

  Plain functions, no page: the Node tests check them (tests/js/card-looks.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANCardLooks = api; }
}(this, function () {
  'use strict';

  var W = 600, H = 315, SCALE = 2, LANE = 40;
  var LOGO_RATIO = 888 / 508;
  var K = 600 / 330;            // the corner pictures are drawn on a 330 x 173 grid

  function r1(n) { return Math.round(n * 10) / 10; }

  /* SVG pieces ------------------------------------------------------------------- */
  function C(x, y, r, f, o, s) {
    return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '" fill="' + f + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (s ? ' ' + s : '') + '/>';
  }
  function R(x, y, w, h, f, o, t) {
    return '<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="' + f + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (t ? ' ' + t : '') + '/>';
  }
  function L(a, b, c, d, s, w, o, x) {
    return '<line x1="' + r1(a) + '" y1="' + r1(b) + '" x2="' + r1(c) + '" y2="' + r1(d) + '" stroke="' + s + '" stroke-width="' + (w || 1) + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (x ? ' ' + x : '') + '/>';
  }
  function P(points, f, x) { return '<polygon points="' + points + '" fill="' + f + '"' + (x ? ' ' + x : '') + '/>'; }
  function star(x, y, r, c, n, q, extra) {
    n = n || 5; q = q || 0.45;
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * q : r;
      pts.push(r1(x + Math.cos(a) * d) + ',' + r1(y + Math.sin(a) * d));
    }
    return P(pts.join(' '), c, extra);
  }

  /* Shared by the firework scenes: a seeded random number, a tapering streak, a shell of
     streaks on a sphere (front, back, bright tips and the pale centre stars) and a wiggly
     launch trail. All on a 1200 x 630 grid. */
  var fwRng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  var fwStreak = function (x0, y0, x1, y1, w) {
    var len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1.5) { return ''; }
    var ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    return 'M' + r1(x0) + ' ' + r1(y0) + 'L' + r1(x1 - uy * w) + ' ' + r1(y1 + ux * w) + 'L' + r1(x1 + ux * w * 1.6) + ' ' +
      r1(y1 + uy * w * 1.6) + 'L' + r1(x1 + uy * w) + ' ' + r1(y1 - ux * w) + 'Z';
  };
  var fwShell = function (cx, cy, R, n, pistils, seed) {
    var r = fwRng(seed), sc = Math.max(R / 300, 0.6), g = 0.06 * R, o = { front: '', back: '', tips: '', pist: '' }, i;
    for (i = 0; i < n; i++) {
      var z = 2 * r() - 1, ph = 2 * Math.PI * r(), s = Math.sqrt(1 - z * z), dx = s * Math.cos(ph), dy = s * Math.sin(ph);
      var t0 = 0.36 + 0.24 * r(), t1 = 0.84 + 0.16 * r();
      var x1 = cx + R * t1 * dx, y1 = cy + R * t1 * dy + g * t1 * t1;
      var d = fwStreak(cx + R * t0 * dx, cy + R * t0 * dy + g * t0 * t0, x1, y1, (0.8 + 0.9 * r()) * sc);
      if (z >= 0) { o.front += d; } else { o.back += d; }
      if (z > -0.3 && r() < 0.8) {
        var tr = r1((0.9 + 0.9 * r()) * sc);
        o.tips += 'M' + r1(x1 - tr) + ' ' + r1(y1) + 'a' + tr + ' ' + tr + ' 0 1 0 ' + r1(2 * tr) + ' 0a' + tr + ' ' + tr + ' 0 1 0 ' + r1(-2 * tr) + ' 0';
      }
    }
    for (i = 0; i < pistils; i++) {
      var pz = 2 * r() - 1, pp = 2 * Math.PI * r(), ps = Math.sqrt(1 - pz * pz), px = ps * Math.cos(pp), py = ps * Math.sin(pp);
      var pt = 0.24 + 0.14 * r(), ex = cx + R * pt * px, ey = cy + R * pt * py, k = 0.035 * R * ps;
      o.pist += fwStreak(ex - px * k, ey - py * k, ex, ey, 1.3 * R / 300);
    }
    return o;
  };
  var fwTrail = function (cx, fromY, toY, amp) {
    var d = 'M' + cx + ' ' + fromY;
    for (var y = fromY; y > toY; y -= 10) { d += 'L' + r1(cx + amp * Math.sin(y / 9) + amp * 0.5 * Math.sin(y / 23)) + ' ' + y; }
    return d;
  };
  /* New Year's fireworks: a big gold shell, a red one top right and a fading silver one
     further back, each hundreds of tapering streaks on a sphere (the near side bright,
     the far side dim, all drooping a little), with sparkle, glow and launch trails.
     Drawn on a 1200 x 630 grid and halved to fit the card; the left side is darkened
     so the words stay clear. Seeded, so every card gets the same sky. */
  var FIREWORKS = null;
  function fireworks() {
    if (FIREWORKS) { return FIREWORKS; }
    var shell = fwShell, trail = fwTrail;
    var g = shell(860, 230, 250, 340, 90, 20261231), red = shell(1100, 120, 135, 153, 0, 1225), sil = shell(640, 110, 100, 119, 0, 1105);
    var def = function (id, d) { return '<path id="' + id + '" d="' + d + '"/>'; };
    var use = function (id, attrs) { return '<use href="#' + id + '" ' + attrs + '/>'; };
    var stops = function (list) {
      return list.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '" stop-opacity="' + s[2] + '"/>'; }).join('');
    };
    var box = 'filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="630"';
    FIREWORKS = '<g transform="scale(.5)"><defs>' +
      '<radialGradient id="fw-sky" cx=".72" cy=".38" r=".8">' + stops([[0, '#1C130C', 1], [0.55, '#0B0807', 1], [1, '#050404', 1]]) + '</radialGradient>' +
      '<radialGradient id="fw-cg" cx=".5" cy=".5" r=".5">' + stops([[0, '#FFE7B0', 0.45], [0.35, '#FF9F2E', 0.1], [1, '#FF9F2E', 0]]) + '</radialGradient>' +
      '<radialGradient id="fw-cr" cx=".5" cy=".5" r=".5">' + stops([[0, '#FFB3A6', 0.4], [0.4, '#FF3B3B', 0.08], [1, '#FF3B3B', 0]]) + '</radialGradient>' +
      '<linearGradient id="fw-calm" x1="0" y1="0" x2="1" y2="0">' + stops([[0, '#050404', 0.9], [0.42, '#050404', 0.45], [0.6, '#050404', 0]]) + '</linearGradient>' +
      '<filter id="fw-bloom" ' + box + '><feGaussianBlur stdDeviation="3.5"/></filter>' +
      '<filter id="fw-haze" ' + box + '><feGaussianBlur stdDeviation="24"/></filter>' +
      '<filter id="fw-spark" ' + box + '><feTurbulence type="fractalNoise" baseFrequency=".95" numOctaves="1" seed="7" result="t"/>' +
        '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.6 -0.7" result="m"/>' +
        '<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>' +
      def('fw-gf', g.front) + def('fw-gb', g.back) + def('fw-rf', red.front) + def('fw-rb', red.back) + def('fw-sf', sil.front) +
      '</defs>' +
      '<rect width="1200" height="630" fill="url(#fw-sky)"/>' +
      '<g filter="url(#fw-haze)" opacity=".4"><ellipse cx="700" cy="200" rx="90" ry="50" fill="#5E5048"/>' +
        '<ellipse cx="620" cy="300" rx="60" ry="70" fill="#4A3F38"/><ellipse cx="980" cy="360" rx="110" ry="46" fill="#7A5E40"/>' +
        '<ellipse cx="1160" cy="240" rx="70" ry="60" fill="#6A3C36"/></g>' +
      '<g opacity=".6"><path d="' + sil.back + '" fill="#9AA3B8" opacity=".5"/>' +
        '<g filter="url(#fw-spark)">' + use('fw-sf', 'fill="#E9EEFF"') + '</g>' + use('fw-sf', 'fill="#C9D0E6" opacity=".35"') + '</g>' +
      '<path d="' + trail(860, 640, 245, 4) + '" fill="none" stroke="#E8A04A" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1.5 3" opacity=".6"/>' +
      '<path d="' + trail(1100, 640, 140, 3) + '" fill="none" stroke="#E87A5A" stroke-width="2" stroke-linecap="round" stroke-dasharray="1.5 3" opacity=".45"/>' +
      '<circle cx="1100" cy="120" r="80" fill="url(#fw-cr)"/>' +
      '<g filter="url(#fw-bloom)" opacity=".7">' + use('fw-rb', 'fill="#FF2E3A"') + use('fw-rf', 'fill="#FF4A4A"') + '</g>' +
      use('fw-rb', 'fill="#C8303A" opacity=".55"') + use('fw-rf', 'fill="#FF6A5E" opacity=".5"') +
      '<g filter="url(#fw-spark)">' + use('fw-rf', 'fill="#FFB0A0"') + '</g>' +
      '<path d="' + red.tips + '" fill="#FFE6DF"/>' +
      '<circle cx="860" cy="230" r="150" fill="url(#fw-cg)"/>' +
      '<g filter="url(#fw-bloom)" opacity=".7">' + use('fw-gb', 'fill="#FF8A1E"') + use('fw-gf', 'fill="#FF9F2E"') + '</g>' +
      use('fw-gb', 'fill="#C9822F" opacity=".5"') + use('fw-gf', 'fill="#FFC46A" opacity=".55"') +
      '<g filter="url(#fw-spark)">' + use('fw-gb', 'fill="#F0B060" opacity=".7"') + use('fw-gf', 'fill="#FFE2A6"') + '</g>' +
      '<path d="' + g.tips + '" fill="#FFF6DE"/>' +
      '<path d="' + g.pist + '" fill="#6F7CFF" opacity=".6" filter="url(#fw-bloom)"/><path d="' + g.pist + '" fill="#D9DEFF"/>' +
      '<circle cx="860" cy="230" r="3.5" fill="#FFF6DE"/>' +
      '<rect width="1200" height="630" fill="url(#fw-calm)"/></g>';
    return FIREWORKS;
  }

  /* Guy Fawkes: one big gold peony like a real shell over the park, its pale blue centre
     stars and launch trail, in a deep navy sky with drifting smoke. Same grid, halving
     and dark left side as the New Year scene. */
  var PEONY = null;
  function peony() {
    if (PEONY) { return PEONY; }
    var cx = 870, cy = 300, R = 330, b = fwShell(cx, cy, R, 460, 130, 20261105), i;
    var stops = function (list) {
      return list.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '" stop-opacity="' + s[2] + '"/>'; }).join('');
    };
    var box = 'filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="630"';
    var trail = fwTrail(cx, 640, cy + 12, 4);
    PEONY = '<g transform="scale(.5)"><defs>' +
      '<radialGradient id="pe-sky" cx=".72" cy=".48" r=".75">' + stops([[0, '#1E2244', 1], [0.55, '#0E1230', 1], [1, '#080A1E', 1]]) + '</radialGradient>' +
      '<radialGradient id="pe-core" cx=".5" cy=".5" r=".5">' + stops([[0, '#FFE7B0', 0.5], [0.35, '#FF9F2E', 0.12], [1, '#FF9F2E', 0]]) + '</radialGradient>' +
      '<linearGradient id="pe-calm" x1="0" y1="0" x2="1" y2="0">' + stops([[0, '#080A1E', 0.9], [0.42, '#080A1E', 0.45], [0.62, '#080A1E', 0]]) + '</linearGradient>' +
      '<filter id="pe-bloom" ' + box + '><feGaussianBlur stdDeviation="3.5"/></filter>' +
      '<filter id="pe-haze" ' + box + '><feGaussianBlur stdDeviation="22"/></filter>' +
      '<filter id="pe-spark" ' + box + '><feTurbulence type="fractalNoise" baseFrequency=".95" numOctaves="1" seed="7" result="t"/>' +
        '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.6 -0.7" result="m"/>' +
        '<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>' +
      '<path id="pe-f" d="' + b.front + '"/><path id="pe-b" d="' + b.back + '"/>' +
      '</defs>' +
      '<rect width="1200" height="630" fill="url(#pe-sky)"/>' +
      '<g filter="url(#pe-haze)" opacity=".35"><ellipse cx="640" cy="320" rx="70" ry="40" fill="#6A6A80"/>' +
        '<ellipse cx="610" cy="390" rx="50" ry="60" fill="#55566E"/><ellipse cx="1080" cy="520" rx="120" ry="50" fill="#3E4058"/></g>' +
      '<path d="' + trail + '" fill="none" stroke="#E8A04A" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1.5 3" opacity=".65"/>' +
      '<path d="' + trail + '" fill="none" stroke="#FF9F2E" stroke-width="6" opacity=".18" filter="url(#pe-bloom)"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.55) + '" fill="url(#pe-core)"/>' +
      '<g filter="url(#pe-bloom)" opacity=".7"><use href="#pe-b" fill="#FF8A1E"/><use href="#pe-f" fill="#FF9F2E"/></g>' +
      '<use href="#pe-b" fill="#C9822F" opacity=".5"/><use href="#pe-f" fill="#FFC46A" opacity=".55"/>' +
      '<g filter="url(#pe-spark)"><use href="#pe-b" fill="#F0B060" opacity=".7"/><use href="#pe-f" fill="#FFE2A6"/></g>' +
      '<path d="' + b.tips + '" fill="#FFF6DE"/>' +
      '<path d="' + b.pist + '" fill="#6F7CFF" opacity=".6" filter="url(#pe-bloom)"/><path d="' + b.pist + '" fill="#D9DEFF"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#FFF6DE"/>' +
      '<rect width="1200" height="630" fill="url(#pe-calm)"/></g>';
    return PEONY;
  }
  /* Shared by the spring scenes: a circle as a path, on the 1200 x 630 grid. */
  var spCirc = function (x, y, r) {
    return 'M' + r1(x - r) + ' ' + r1(y) + 'a' + r1(r) + ' ' + r1(r) + ' 0 1 0 ' + r1(2 * r) + ' 0a' + r1(r) + ' ' + r1(r) + ' 0 1 0 ' + r1(-2 * r) + ' 0Z';
  };
  var spPath = function (d, fill, extra) { return d ? '<path d="' + d + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>' : ''; };

  /* Spring (Daffodils): a field of daffodils in NCAN yellow on club green, in three
     depths (small and soft at the back, big and lit at the front right), each with
     six petals, an orange trumpet with a frilled rim, a papery spathe and leaves, and
     warm bokeh behind. From the Daffodil field design; the left side is darkened so the
     words stay clear. Seeded, so every card gets the same field. */
  var DAFFODILS = null;
  function daffodils() {
    if (DAFFODILS) { return DAFFODILS; }
    var f = r1, circ = spCirc, BASE = 640;
    var P2 = function (p) { return f(p[0]) + ' ' + f(p[1]); };
    // local (lx, ly) to the card: spin in the flower's plane, squash for the tilt away, then turn
    var X = function (cx, cy, spin, sq, turn) {
      var cs = Math.cos(spin), ss = Math.sin(spin), ct = Math.cos(turn), st = Math.sin(turn);
      return function (lx, ly) {
        var x = lx * cs - ly * ss, y = (lx * ss + ly * cs) * sq;
        return [cx + x * ct - y * st, cy + x * st + y * ct];
      };
    };
    var ring = function (T, r, ruff, n, s) {
      var d = '';
      n = Math.max(10, Math.round(n * Math.min(1, s / 40)));     // fewer points on the small flowers at the back
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2, rr = r * (1 + ruff * (0.6 * Math.sin(a * 11) + 0.4 * Math.sin(a * 23 + 1)) * (i % 2 ? 1 : 0.55));
        d += (i ? 'L' : 'M') + P2(T(rr * Math.cos(a), rr * Math.sin(a)));
      }
      return d + 'Z';
    };
    var blade = function (x, y, h, lean, w) {
      var tx = x + lean, ty = y - h;
      return {
        full: 'M' + f(x - w) + ' ' + f(y) + 'Q' + f(x - w * 0.6 + lean * 0.4) + ' ' + f(y - h * 0.6) + ' ' + f(tx) + ' ' + f(ty) +
          'Q' + f(x + w * 0.9 + lean * 0.5) + ' ' + f(y - h * 0.55) + ' ' + f(x + w) + ' ' + f(y) + 'Z',
        hi: 'M' + f(x - w * 0.15) + ' ' + f(y) + 'Q' + f(x + lean * 0.45) + ' ' + f(y - h * 0.6) + ' ' + f(tx) + ' ' + f(ty) +
          'Q' + f(x + w * 0.2 + lean * 0.45) + ' ' + f(y - h * 0.55) + ' ' + f(x + w * 0.25) + ' ' + f(y) + 'Z'
      };
    };
    var KEYS = ['leavesDark', 'leaves', 'leafHi', 'stems', 'stemHi', 'spathe', 'glow', 'petals', 'base', 'shade', 'streak', 'hi', 'vein',
                'trumpet', 'trumpetShade', 'rim', 'rimHi', 'throat', 'core', 'stamen'];
    var tier = function (seed, n, xs, ys, size) {
      var r = fwRng(seed), o = {}, heads = [], i, j, p, q;
      KEYS.forEach(function (k) { o[k] = ''; });
      for (i = 0; i < n; i++) {
        var u = r();
        heads.push({ x: xs[0] + (xs[1] - xs[0]) * Math.pow(u, xs[2]), y: ys[0] + (ys[1] - ys[0]) * r(),
                     s: size[0] + (size[1] - size[0]) * r(), r: r(), r2: r(), r3: r(), r4: r() });
      }
      heads.sort(function (a, b) { return a.y - b.y; });
      heads.forEach(function (h) {
        var s = h.s;
        for (j = 0; j < 3; j++) {     // leaves from the ground around the stem
          var lean = (r() - 0.5) * s * 2.2, bx = h.x + (r() - 0.5) * s * 1.2;
          var b = blade(bx, BASE, (BASE - h.y) * (0.55 + 0.5 * r()), lean, s * (0.1 + 0.05 * r()));
          if (j === 0) { o.leavesDark += b.full; } else { o.leaves += b.full; o.leafHi += b.hi; }
        }
        // the stem, its neck bending over just below the head
        var sw = Math.max(1.2, s * 0.075), bend = (h.r - 0.5) * s * 0.8, top = [h.x + bend * 0.4, h.y + s * 0.15], mid = f((BASE + top[1]) / 2);
        o.stems += 'M' + f(h.x - sw) + ' ' + BASE + 'Q' + f(h.x - sw + bend) + ' ' + mid + ' ' + f(top[0] - sw * 0.8) + ' ' + f(top[1]) +
          'L' + f(top[0] + sw * 0.8) + ' ' + f(top[1]) + 'Q' + f(h.x + sw + bend) + ' ' + mid + ' ' + f(h.x + sw) + ' ' + BASE + 'Z';
        o.stemHi += 'M' + f(h.x - sw * 0.2) + ' ' + BASE + 'Q' + f(h.x + bend) + ' ' + mid + ' ' + f(top[0]) + ' ' + f(top[1]) +
          'L' + f(top[0] + sw * 0.4) + ' ' + f(top[1]) + 'Q' + f(h.x + sw * 0.5 + bend) + ' ' + mid + ' ' + f(h.x + sw * 0.5) + ' ' + BASE + 'Z';
        o.spathe += 'M' + P2([top[0] - sw, top[1]]) + 'Q' + P2([top[0] + s * 0.25, top[1] - s * 0.05]) + ' ' + P2([top[0] + s * 0.32, top[1] + s * 0.22]) +
          'Q' + P2([top[0] + s * 0.05, top[1] + s * 0.12]) + ' ' + P2([top[0] + sw, top[1] + s * 0.18]) + 'Z';
        // the head: most nod sideways towards the light, a few face out
        var sq = 0.62 + 0.36 * h.r2, turn = (h.r3 < 0.7 ? -0.22 : 0.22) + (h.r4 - 0.5) * 0.6, spin = h.r * Math.PI;
        var T = X(h.x + bend * 0.4, h.y, spin, sq, turn);
        o.glow += circ(h.x, h.y, s * 0.7);
        var L = s, W2 = s * 0.6;
        for (p = 0; p < 6; p++) {
          var a = (p / 6) * Math.PI * 2 + (r() - 0.5) * 0.12, l = L * (p % 2 ? 0.94 : 1) * (0.95 + 0.1 * r()), w = W2 * (p % 2 ? 0.9 : 1) * (0.92 + 0.16 * r());
          var pt = (function (Tp) { return function (lx, ly) { var z = Tp(lx, ly); return P2(T(z[0], z[1])); }; })(X(0, 0, a, 1, 0));
          var curl = (r() - 0.5) * w * 0.25;
          var outline = 'M' + pt(0.05 * l, 0) + 'C' + pt(0.25 * l, w * 0.95) + ' ' + pt(0.98 * l, w * 0.75) + ' ' + pt(l, curl);
          o.petals += outline + 'C' + pt(0.98 * l, -w * 0.75) + ' ' + pt(0.25 * l, -w * 0.95) + ' ' + pt(0.05 * l, 0) + 'Z';
          o.shade += outline + 'Q' + pt(0.55 * l, w * 0.25) + ' ' + pt(0.05 * l, 0) + 'Z';
          if (s < 16) { r(); r(); r(); continue; }     // too small for veins and streaks to show
          o.vein += 'M' + pt(0.3 * l, 0) + 'L' + pt(0.85 * l, curl * 0.8) + 'M' + pt(0.35 * l, w * 0.12) + 'Q' + pt(0.6 * l, w * 0.35) + ' ' + pt(0.8 * l, w * 0.4) +
            'M' + pt(0.35 * l, -w * 0.12) + 'Q' + pt(0.6 * l, -w * 0.35) + ' ' + pt(0.8 * l, -w * 0.4);
          [-0.32, 0.05, 0.38].forEach(function (sd) {
            var so = sd * w + (r() - 0.5) * w * 0.1;
            o.streak += 'M' + pt(0.28 * l, so * 0.5) + 'Q' + pt(0.6 * l, so + w * 0.05) + ' ' + pt(0.9 * l, so * 0.7 + curl * 0.5) +
              'Q' + pt(0.6 * l, so - w * 0.04) + ' ' + pt(0.28 * l, so * 0.5) + 'Z';
          });
          o.hi += 'M' + pt(0.22 * l, 0) + 'Q' + pt(0.55 * l, -w * 0.22) + ' ' + pt(0.92 * l, curl * 0.8) + 'Q' + pt(0.55 * l, -w * 0.02) + ' ' + pt(0.22 * l, 0) + 'Z';
        }
        // the trumpet comes out of the flower towards the viewer
        var depth = s * 0.34 * Math.sqrt(Math.max(0, 1 - sq * sq)) + s * 0.05;
        var ox = -Math.sin(turn) * depth, oy = Math.cos(turn) * depth * 0.15 - depth * 0.05;
        var c0 = T(0, 0), rc = s * 0.46, rb = s * 0.34, sqr = Math.max(0.35, sq);
        var Tbase = X(c0[0], c0[1], 0, sq, turn), ax = Math.cos(turn), ay = Math.sin(turn);
        var at = function (k) { return X(c0[0] + ox * k, c0[1] + oy * k, 0, sqr, turn); };
        var e1 = [c0[0] + ax * rb, c0[1] + ay * rb], e2 = [c0[0] - ax * rb, c0[1] - ay * rb];
        var q1 = [c0[0] + ox + ax * rc, c0[1] + oy + ay * rc], q2 = [c0[0] + ox - ax * rc, c0[1] + oy - ay * rc];
        o.base += ring(Tbase, s * 0.5, 0, 24, s);
        o.core += ring(at(0.55), rc * 0.36, 0, 18, s);
        o.trumpet += ring(Tbase, rb, 0, 20, s) + 'M' + P2(e1) + 'L' + P2(q1) + 'L' + P2(q2) + 'L' + P2(e2) + 'Z';
        o.trumpetShade += 'M' + P2(e1) + 'L' + P2(q1) + 'L' + P2([(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2]) + 'L' + P2(c0) + 'Z';
        o.rim += ring(at(1), rc, 0.11, 72, s);
        o.rimHi += ring(at(0.95), rc * 0.86, 0.06, 60, s);
        o.throat += ring(at(0.85), rc * 0.74, 0.03, 36, s);
        for (q = 0; q < 4; q++) {
          var qa = q * 1.7 + h.r * 3;
          o.stamen += circ(c0[0] + ox * 0.75 + Math.cos(qa) * s * 0.06, c0[1] + oy * 0.75 + Math.sin(qa) * s * 0.06 * sq, Math.max(0.7, s * 0.035));
        }
      });
      return o;
    };
    var layer = function (o, filter, op, lit) {
      var p = spPath;
      return '<g' + (filter ? ' filter="url(#' + filter + ')"' : '') + ' opacity="' + op + '">' +
        p(o.leavesDark, '#174F2A') + p(o.leaves, '#2E7A3A') + p(o.leafHi, '#5FA34E', 'opacity=".55"') +
        p(o.stems, '#3C8A3A') + p(o.stemHi, '#8CC264', 'opacity=".6"') +
        p(o.spathe, '#B8976A') + p(o.spathe, 'none', 'stroke="#7E6440" stroke-width=".7" opacity=".7"') +
        p(o.glow, '#FFC629', 'opacity=".3" filter="url(#sd-glow)"') +
        '<g' + (lit ? ' filter="url(#sd-lit)"' : '') + '>' +
        p(o.petals, '#FFC629') + p(o.base, '#E2A200', 'opacity=".45"') + p(o.shade, '#D99A00', 'opacity=".5"') +
        p(o.petals, '#FFF4C2', 'opacity=".18" filter="url(#sd-grain)"') + p(o.streak, '#FFF7CF', 'opacity=".22"') + p(o.hi, '#FFF0B0', 'opacity=".6"') +
        p(o.vein, 'none', 'stroke="#E3AC00" stroke-width=".7" opacity=".4"') +
        p(o.trumpet, '#F79A35') + p(o.trumpetShade, '#D9700F', 'opacity=".55"') + p(o.rim, '#E95E12') + p(o.rimHi, '#F7862A') +
        p(o.throat, '#C9580A') + p(o.core, '#6E3A08', 'opacity=".85"') + p(o.stamen, '#FFD86A') + '</g></g>';
    };
    var rb2 = fwRng(77), bokeh = '', bokehGreen = '', i;
    for (i = 0; i < 46; i++) { var bx = 380 + 820 * Math.pow(rb2(), 0.6), by = 250 + 240 * rb2(); bokeh += circ(bx, by, 6 + 14 * rb2()); }
    for (i = 0; i < 26; i++) { var gx = 1200 * rb2(), gy = 300 + 260 * rb2(); bokehGreen += circ(gx, gy, 20 + 40 * rb2()); }
    var box = 'filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="630"';
    var blur = function (id, sd) { return '<filter id="' + id + '" ' + box + '><feGaussianBlur stdDeviation="' + sd + '"/></filter>'; };
    DAFFODILS = '<g transform="scale(.5)"><defs>' +
      '<linearGradient id="sd-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B3B2E"/><stop offset=".55" stop-color="#0F4C39"/>' +
        '<stop offset=".8" stop-color="#12684D"/><stop offset="1" stop-color="#0B3B2E"/></linearGradient>' +
      '<radialGradient id="sd-sun" cx=".82" cy=".18" r=".6"><stop offset="0" stop-color="#FFE27A" stop-opacity=".32"/>' +
        '<stop offset=".4" stop-color="#FFC629" stop-opacity=".08"/><stop offset="1" stop-color="#FFC629" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="sd-calm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06241B" stop-opacity=".85"/>' +
        '<stop offset=".5" stop-color="#06241B" stop-opacity=".45"/><stop offset=".76" stop-color="#06241B" stop-opacity="0"/></linearGradient>' +
      blur('sd-bokeh', 9) + blur('sd-far', 1.8) + blur('sd-mid', 0.6) + blur('sd-glow', 14) +
      '<filter id="sd-lit" ' + box + ' color-interpolation-filters="sRGB">' +
        '<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="9" result="tx"/>' +
        '<feComposite in="tx" in2="lum" operator="arithmetic" k2=".08" k3="1" result="hraw"/>' +
        '<feComposite in="hraw" in2="SourceAlpha" operator="in" result="h0"/><feGaussianBlur in="h0" stdDeviation="2.6" result="h"/>' +
        '<feDiffuseLighting in="h" surfaceScale="2.6" diffuseConstant="1.18" lighting-color="#FFFFFF" result="d"><feDistantLight azimuth="315" elevation="58"/></feDiffuseLighting>' +
        '<feSpecularLighting in="h" surfaceScale="2.6" specularConstant=".35" specularExponent="30" lighting-color="#FFF8DC" result="s"><feDistantLight azimuth="315" elevation="58"/></feSpecularLighting>' +
        '<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" result="m"/><feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>' +
        '<feComposite in="m" in2="s2" operator="arithmetic" k2="1" k3=".4" result="o"/>' +
        '<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="sb"/><feOffset in="sb" dx="-6" dy="9" result="so"/>' +
        '<feFlood flood-color="#03170F" flood-opacity=".5"/><feComposite in2="so" operator="in" result="sh"/>' +
        '<feMerge><feMergeNode in="sh"/><feMergeNode in="o"/></feMerge></filter>' +
      '<filter id="sd-grain" ' + box + '><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="4" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 0  0 0 0 .55 -.12" result="m"/>' +
        '<feComposite in="m" in2="SourceGraphic" operator="in"/></filter>' +
      '</defs>' +
      '<rect width="1200" height="630" fill="url(#sd-ground)"/><rect width="1200" height="630" fill="url(#sd-sun)"/>' +
      spPath(bokeh, '#FFC629', 'opacity=".35" filter="url(#sd-bokeh)"') + spPath(bokehGreen, '#2E8B57', 'opacity=".4" filter="url(#sd-bokeh)"') +
      layer(tier(11, 70, [120, 1200, 0.55], [372, 420], [9, 15]), 'sd-far', 0.75, false) +
      layer(tier(23, 34, [480, 1200, 0.7], [400, 470], [18, 27]), 'sd-mid', 0.95, true) +
      layer(tier(37, 11, [800, 1180, 0.9], [150, 520], [38, 58]), '', 1, true) +
      '<rect width="1200" height="630" fill="url(#sd-calm)"/></g>';
    return DAFFODILS;
  }

  /* Spring (Blossoms): cherry blossom in the Japanese style. A seigaiha wave pattern in
     club green, a gold sun disc, a dark ink branch with pink five-petalled blossoms,
     buds, and petals drifting across the card. From the Sakura pattern design; the left
     side is darkened so the words stay clear. Seeded, so every card gets the same tree. */
  var SAKURA = null;
  function sakura() {
    if (SAKURA) { return SAKURA; }
    var f = r1, circ = spCirc, i, j, x;
    // the waves, rows drawn top to bottom so each overlaps the one above
    var WR = 34, waves = '';
    for (j = 0; j < 42; j++) {
      var y = j * WR / 2 - WR, off = j % 2 ? WR : 0, fill = '', rings = '';
      for (x = -WR + off; x < 1200 + WR; x += 2 * WR) {
        fill += circ(x, y, WR);
        [1, 0.78, 0.56, 0.34].forEach(function (q) {
          rings += 'M' + f(x - WR * q) + ' ' + f(y) + 'a' + f(WR * q) + ' ' + f(WR * q) + ' 0 0 1 ' + f(2 * WR * q) + ' 0';
        });
      }
      waves += spPath(fill, '#0B3B2E') + spPath(rings, 'none', 'stroke="#1C5C48" stroke-width="2.4"');
    }
    // the ink branch: quadratic curves, thick to thin
    var Q = function (a, c, b) { return { a: a, c: c, b: b, d: 'M' + a.join(' ') + 'Q' + c.join(' ') + ' ' + b.join(' ') }; };
    var segs = [
      [Q([1230, 30], [1080, 40], [980, 110]), 22], [Q([980, 110], [880, 170], [760, 150]), 15], [Q([760, 150], [690, 140], [612, 92]), 9],
      [Q([980, 110], [1060, 190], [1034, 300]), 12], [Q([1034, 300], [1016, 360], [1060, 420]), 6], [Q([870, 158], [850, 90], [880, 40]), 6],
      [Q([1100, 52], [1150, 120], [1170, 210]), 7], [Q([700, 132], [660, 190], [600, 210]), 4], [Q([1040, 250], [1110, 270], [1150, 330]), 5],
      [Q([930, 140], [960, 200], [920, 250]), 4]
    ];
    var at = function (q, t) {
      return [(1 - t) * (1 - t) * q.a[0] + 2 * (1 - t) * t * q.c[0] + t * t * q.b[0], (1 - t) * (1 - t) * q.a[1] + 2 * (1 - t) * t * q.c[1] + t * t * q.b[1]];
    };
    var branches = segs.map(function (s) {
      return '<path d="' + s[0].d + '" fill="none" stroke="#24150F" stroke-width="' + s[1] + '" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="' + s[0].d + '" fill="none" stroke="#5A3A2C" stroke-width="' + f(Math.max(1, s[1] * 0.22)) + '" stroke-linecap="round" transform="translate(0,-1.5)"/>';
    }).join('');
    var knots = '';
    segs.slice(0, 4).forEach(function (s) { var p = at(s[0], 0.5); knots += circ(p[0], p[1] + 2, s[1] * 0.32); });
    // the blossoms: five notched petals around a deep pink eye and stamens
    var r = fwRng(4021);
    var flower = function (o, cx, cy, s, rot, veins) {
      for (var k = 0; k < 5; k++) {
        var a = rot + (k * 2 * Math.PI) / 5, ca = Math.cos(a), sa = Math.sin(a), w = s * 0.46;
        var T = (function (ca, sa) { return function (lx, ly) { return f(cx + lx * ca - ly * sa) + ' ' + f(cy + lx * sa + ly * ca); }; })(ca, sa);
        o.petals += 'M' + T(s * 0.08, 0) + 'C' + T(s * 0.35, w * 1.05) + ' ' + T(s * 0.9, w) + ' ' + T(s, w * 0.34) + 'L' + T(s * 0.86, 0) +
          'L' + T(s, -w * 0.34) + 'C' + T(s * 0.9, -w) + ' ' + T(s * 0.35, -w * 1.05) + ' ' + T(s * 0.08, 0) + 'Z';
        if (veins) {
          o.veins += 'M' + T(s * 0.3, 0) + 'L' + T(s * 0.74, 0) + 'M' + T(s * 0.36, w * 0.1) + 'L' + T(s * 0.7, w * 0.4) +
            'M' + T(s * 0.36, -w * 0.1) + 'L' + T(s * 0.7, -w * 0.4);
        }
      }
      o.eye += circ(cx, cy, s * 0.3);
      for (k = 0; k < 9; k++) {
        var sa2 = rot + k * 0.7 + r() * 0.3, l = s * (0.38 + 0.14 * r()), ex = cx + Math.cos(sa2) * l, ey = cy + Math.sin(sa2) * l;
        o.stamens += 'M' + f(cx) + ' ' + f(cy) + 'L' + f(ex) + ' ' + f(ey);
        o.dots += circ(ex, ey, Math.max(1.2, s * 0.06));
      }
    };
    var back = { petals: '', eye: '', stamens: '', dots: '', veins: '' }, front = { petals: '', eye: '', stamens: '', dots: '', veins: '' };
    var buds = '', budCups = '', spots = [];
    segs.forEach(function (s, si) { for (var k = 0; k < (si < 3 ? 5 : 3); k++) { spots.push(at(s[0], 0.15 + 0.8 * r())); } });
    spots.forEach(function (p, k) {
      var px = p[0] + (r() - 0.5) * 30, py = p[1] + (r() - 0.5) * 26;
      if (k % 3 === 2) { flower(back, px + 14, py - 12, 13 + 6 * r(), r() * 6.3, false); }
      if (r() < 0.25) {
        var bx = px + (r() - 0.5) * 40, by = py + 10 + r() * 18;
        buds += 'M' + f(bx) + ' ' + f(by - 9) + 'C' + f(bx + 7) + ' ' + f(by - 5) + ' ' + f(bx + 6) + ' ' + f(by + 4) + ' ' + f(bx) + ' ' + f(by + 5) +
          'C' + f(bx - 6) + ' ' + f(by + 4) + ' ' + f(bx - 7) + ' ' + f(by - 5) + ' ' + f(bx) + ' ' + f(by - 9) + 'Z';
        budCups += circ(bx, by + 5, 3.4);
      } else { flower(front, px, py, 19 + 10 * r(), r() * 6.3, true); }
    });
    // petals drifting down and left across the card
    var rf = fwRng(99), falling = '';
    for (i = 0; i < 39; i++) {
      var fx = 380 + 800 * rf(), fy = 60 + 470 * rf(), s = 9 + 6 * rf(), a = rf() * 6.3, sq = 0.45 + 0.5 * rf(), ca = Math.cos(a), sa = Math.sin(a), w = s * 0.5;
      var T = function (lx, ly) { return f(fx + lx * ca - ly * sq * sa) + ' ' + f(fy + lx * sa + ly * sq * ca); };
      falling += 'M' + T(0, 0) + 'C' + T(s * 0.3, w) + ' ' + T(s * 0.9, w) + ' ' + T(s, w * 0.35) + 'L' + T(s * 0.85, 0) + 'L' + T(s, -w * 0.35) +
        'C' + T(s * 0.9, -w) + ' ' + T(s * 0.3, -w) + ' ' + T(0, 0) + 'Z';
    }
    var line = 'stroke="#8E2E4C" stroke-linejoin="round"';
    SAKURA = '<g transform="scale(.5)"><defs><linearGradient id="sk-calm" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#0B3B2E" stop-opacity=".92"/><stop offset=".5" stop-color="#0B3B2E" stop-opacity=".6"/>' +
        '<stop offset=".78" stop-color="#0B3B2E" stop-opacity="0"/></linearGradient></defs>' +
      '<rect width="1200" height="630" fill="#0B3B2E"/>' + waves +
      '<circle cx="930" cy="230" r="158" fill="#FFC629" opacity=".16"/><circle cx="930" cy="230" r="158" fill="none" stroke="#FFC629" stroke-width="2" opacity=".35"/>' +
      branches + spPath(knots, '#24150F') +
      spPath(buds, '#E86F92', 'stroke="#8E2E4C" stroke-width="1.2"') + spPath(budCups, '#3E6B2E') +
      spPath(back.petals, '#F2A2BB', line + ' stroke-width="1.4"') + spPath(back.eye, '#D8476E', 'opacity=".75"') +
      spPath(back.stamens, 'none', 'stroke="#8E2E4C" stroke-width="1.1" stroke-linecap="round"') + spPath(back.dots, '#FFC629') +
      spPath(front.petals, '#F9C6D6', line + ' stroke-width="1.6"') +
      spPath(front.veins, 'none', 'stroke="#E07A99" stroke-width="1" stroke-linecap="round" opacity=".7"') + spPath(front.eye, '#E0587D') +
      spPath(front.stamens, 'none', 'stroke="#8E2E4C" stroke-width="1.2" stroke-linecap="round"') + spPath(front.dots, '#FFC629') +
      spPath(falling, '#F9C6D6', line + ' stroke-width="1.2" opacity=".9"') + '<rect width="1200" height="630" fill="url(#sk-calm)"/></g>';
    return SAKURA;
  }

  /* Teddy: the club's teddy bear in the club singlet, waving, for children's meetings.
     The sky behind him is the theme's scene (sun, clouds, confetti, grass along the
     bottom); he stands on the counts or the band in the layouts with room for him
     (TEDDY_AT), drawn from the Teddy on the podium design. */
  var TEDDY_SKY = null;
  function teddySky() {
    if (TEDDY_SKY) { return TEDDY_SKY; }
    var bits = [[380, 20, '#F2B705', 25], [420, 60, '#0E5A38', -30], [545, 125, '#FFFFFF', 50], [350, 105, '#F2B705', -15],
                [575, 165, '#0E5A38', 35], [450, 15, '#FF7A59', 60], [370, 165, '#FF7A59', -40], [530, 70, '#F2B705', 10],
                [300, 150, '#FFFFFF', 20], [420, 205, '#F2B705', -55]];
    TEDDY_SKY = '<defs><linearGradient id="ts-sky" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#7CC8F7"/><stop offset=".8" stop-color="#D8F0FF"/></linearGradient>' +
        '<radialGradient id="ts-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE27A" stop-opacity=".7"/>' +
        '<stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></radialGradient></defs>' +
      R(0, 0, W, H, 'url(#ts-sky)') +
      C(586, 22, 70, 'url(#ts-sun)') + C(586, 22, 26, '#FFD94A') +
      '<g fill="#FFFFFF" opacity=".9">' + C(320, 46, 15, '#FFFFFF') + C(338, 39, 19, '#FFFFFF') + C(358, 48, 14, '#FFFFFF') + R(306, 48, 66, 13, '#FFFFFF', 1, 'rx="6.5"') +
        C(250, 120, 10, '#FFFFFF') + C(263, 115, 13, '#FFFFFF') + C(277, 122, 9, '#FFFFFF') + R(241, 122, 45, 9, '#FFFFFF', 1, 'rx="4.5"') + '</g>' +
      bits.map(function (b) { return R(b[0], b[1], 7, 4, b[2], 1, 'rx="1" transform="rotate(' + b[3] + ' ' + (b[0] + 3.5) + ' ' + (b[1] + 2) + ')"'); }).join('') +
      C(400, 130, 2.5, '#F2B705') + C(585, 100, 2, '#FF7A59') + C(480, 45, 2.5, '#FFFFFF') +
      '<path d="M0 258 Q300 240 600 254 L600 315 L0 315 Z" fill="#7CC876"/>' +
      '<path d="M0 272 Q300 258 600 268 L600 315 L0 315 Z" fill="#5DB65A"/>';
    return TEDDY_SKY;
  }
  // Teddy, waving, on a 442 x 580 grid from (-22, 20); teddy(x, y, h): his box's top left and height
  var TEDDY_ART = '<defs><filter id="td-fluff" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter><clipPath id="td-vest"><path d="M118 262 L156 256 Q210 302 264 256 L302 262 C302 312 318 346 340 358 C346 400 348 446 352 490 Q306 502 262 495 Q210 506 158 495 Q114 502 68 490 C72 446 74 400 80 358 C102 346 118 312 118 262 Z"/></clipPath><clipPath id="td-vside"><path d="M348 356 C326 370 318 400 330 436 L366 436 L366 356 Z"/></clipPath><clipPath id="td-vcorner"><path d="M56 440 C64 474 72 496 84 516 L56 516 Z"/></clipPath><radialGradient id="td-vshade" cx="0.46" cy="0.52" r="0.62"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.32"/></radialGradient></defs><g filter="url(#td-fluff)"><circle cx="108" cy="70" r="48" fill="#DCC29A"/><circle cx="312" cy="70" r="48" fill="#DCC29A"/></g><circle cx="112" cy="76" r="26" fill="#F2E2C6"/><circle cx="308" cy="76" r="26" fill="#F2E2C6"/><g filter="url(#td-fluff)"><ellipse cx="150" cy="548" rx="58" ry="50" fill="#DCC29A"/><ellipse cx="270" cy="548" rx="58" ry="50" fill="#DCC29A"/><ellipse cx="210" cy="385" rx="132" ry="130" fill="#E3CBA3"/></g><path d="M80 468 L340 468 L352 550 L226 558 L210 522 L194 558 L68 550 Z" fill="#1C1C1C"/><rect x="96" y="530" width="30" height="6" rx="2" fill="#C9A227"/><g filter="url(#td-fluff)"><path d="M64.8 303.8 L10.2 438.8 A30 30 0 0 0 64.4 464.2 L133.5 336.0 A38 38 0 1 0 64.8 303.8 Z" fill="#DCC29A"/><path d="M353.6 335.7 L416.6 216.0 A30 30 0 0 0 365.3 185.0 L288.7 296.5 A38 38 0 1 0 353.6 335.7 Z" fill="#DCC29A"/></g><path d="M118 262 L156 256 Q210 302 264 256 L302 262 C302 312 318 346 340 358 C346 400 348 446 352 490 Q306 502 262 495 Q210 506 158 495 Q114 502 68 490 C72 446 74 400 80 358 C102 346 118 312 118 262 Z" fill="#0E5A38"/><g clip-path="url(#td-vest)"><path d="M50 230 L320 230 L314 296 C232 302 160 312 138 340 C120 370 124 440 158 520 L50 520 Z" fill="#ECEEEE"/><path d="M314 296 C232 302 160 312 138 340 C120 370 124 440 158 520" stroke="#0E5A38" stroke-width="4" fill="none"/><path d="M316 302 C236 308 168 318 146 344 C129 372 133 440 167 520" stroke="#F2B705" stroke-width="5.5" fill="none"/><g stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity="0.95"><path d="M316.0 309.0 l-6.3 13.5"/><path d="M304.1 310.0 l-6.1 13.0"/><path d="M292.5 311.0 l-5.8 12.5"/><path d="M281.3 312.1 l-5.6 12.0"/><path d="M270.3 313.3 l-5.4 11.5"/><path d="M259.6 314.6 l-5.1 11.0"/><path d="M249.3 316.0 l-4.9 10.5"/><path d="M239.4 317.5 l-4.6 10.0"/><path d="M229.9 319.2 l-4.4 9.5"/><path d="M220.8 320.9 l-4.2 8.9"/><path d="M212.2 322.9 l-3.9 8.4"/><path d="M204.0 324.9 l-3.7 7.9"/><path d="M196.3 327.2 l-3.5 7.4"/><path d="M189.1 329.6 l-3.2 6.9"/><path d="M182.4 332.2 l-3.0 6.4"/><path d="M176.3 334.9 l-2.8 5.9"/><path d="M170.7 337.9 l-2.5 5.4"/></g><g clip-path="url(#td-vside)" stroke="#FFFFFF" stroke-width="2.6"><path d="M314 354 L362 354"/><path d="M314 360 L362 360"/><path d="M314 366 L362 366"/><path d="M314 372 L362 372"/><path d="M314 378 L362 378"/><path d="M314 384 L362 384"/><path d="M314 390 L362 390"/><path d="M314 396 L362 396"/><path d="M314 402 L362 402"/><path d="M314 408 L362 408"/><path d="M314 414 L362 414"/><path d="M314 420 L362 420"/></g><path d="M70 380 C76 440 88 482 104 520" stroke="#0E5A38" stroke-width="22" fill="none"/><path d="M78 392 C84 446 95 484 110 520" stroke="#F2B705" stroke-width="5" fill="none"/><path d="M68 392 C72 444 82 484 96 520" stroke="#F2B705" stroke-width="3" fill="none"/><g clip-path="url(#td-vcorner)" stroke="#FFFFFF" stroke-width="2.4"><path d="M58 452 L100 452"/><path d="M58 457 L100 457"/><path d="M58 462 L100 462"/><path d="M58 467 L100 467"/><path d="M58 472 L100 472"/><path d="M58 477 L100 477"/><path d="M58 482 L100 482"/><path d="M58 487 L100 487"/><path d="M58 492 L100 492"/><path d="M58 497 L100 497"/><path d="M58 502 L100 502"/><path d="M58 507 L100 507"/><path d="M58 512 L100 512"/></g><path d="M116 274 L156 262 M114 280 L156 268" stroke="#0E5A38" stroke-width="3" fill="none"/><path d="M116 286 L156 274" stroke="#F2B705" stroke-width="5" fill="none"/><path d="M264 262 L306 274" stroke="#0E5A38" stroke-width="3" fill="none"/><path d="M264 270 L308 282" stroke="#F2B705" stroke-width="5" fill="none"/><path d="M92 374 C104 412 108 452 112 494 M328 374 C316 412 312 452 308 494 M176 498 C182 470 186 446 186 420 M248 498 C242 474 240 452 242 430" stroke="#062E1B" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.28"/><path d="M98 372 C110 410 114 450 118 492 M322 372 C310 410 306 450 302 492" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.12"/><path d="M68 490 Q114 502 158 495 Q210 506 262 495 Q306 502 352 490" stroke="#062E1B" stroke-width="7" fill="none" opacity="0.3"/><rect x="60" y="240" width="300" height="280" fill="url(#td-vshade)"/></g><path d="M302 262 C302 312 318 346 340 358 M80 358 C102 346 118 312 118 262 M156 256 Q210 302 264 256" stroke="#0A4A2E" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M118 262 L156 256 Q210 302 264 256 L302 262 C302 312 318 346 340 358 C346 400 348 446 352 490 Q306 502 262 495 Q210 506 158 495 Q114 502 68 490 C72 446 74 400 80 358 C102 346 118 312 118 262 Z" stroke="#08361F" stroke-width="2" stroke-opacity="0.5" fill="none"/><text x="236" y="386" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="25" textLength="70" lengthAdjust="spacingAndGlyphs" fill="#F2B705">NORTH</text><text x="236" y="413" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="25" textLength="140" lengthAdjust="spacingAndGlyphs" fill="#F2B705">CANTERBURY</text><g filter="url(#td-fluff)"><circle cx="210" cy="170" r="122" fill="#E8D3B0"/></g><ellipse cx="33.7" cy="459.1" rx="18" ry="14" fill="#F2E2C6"/><ellipse cx="395.2" cy="193.4" rx="18" ry="16" fill="#F2E2C6"/><ellipse cx="210" cy="220" rx="68" ry="54" fill="#F3E6CF"/><ellipse cx="210" cy="196" rx="28" ry="20" fill="#5A2E1E"/><ellipse cx="201" cy="189" rx="9" ry="4" fill="#8A5240"/><path d="M176 228 Q210 270 244 228 Q210 242 176 228 Z" fill="#6B2F22"/><circle cx="166" cy="148" r="12" fill="#1F1A17"/><circle cx="254" cy="148" r="12" fill="#1F1A17"/><circle cx="170" cy="144" r="4" fill="#FFFFFF"/><circle cx="258" cy="144" r="4" fill="#FFFFFF"/><ellipse cx="140" cy="202" rx="16" ry="9" fill="#F0B8A0" opacity="0.5"/><ellipse cx="280" cy="202" rx="16" ry="9" fill="#F0B8A0" opacity="0.5"/>';
  var TEDDY_RATIO = 442 / 580;
  function teddy(x, y, h) {
    var k = h / 580;
    return '<g transform="translate(' + r1(x + 22 * k) + ' ' + r1(y - 20 * k) + ') scale(' + Math.round(k * 10000) / 10000 + ')">' + TEDDY_ART + '</g>';
  }
  // where Teddy stands in each layout with room for him: [x, y, height] (his feet on the counts,
  // the poster's band or above the club's column)
  var TEDDY_AT = { classic: [452, 10, 150], poster: [452, 4, 146], podium: [460, 8, 144] };
  // whether the full-size Teddy is on this card (the Teddy theme, in a layout with room for him)
  function teddyShows(chosen) {
    var th = BY_ID[chosen.theme];
    return !!(th && th.mascot && TEDDY_AT[chosen.layout]);
  }
  /* The Teddy sticker: his head and singlet in a round sky badge with a gold ring, from the
     Teddy sticker design; at full size it reaches STICKER_R from its centre. */
  function teddySticker(cx, cy, k) {
    var s = 0.25;
    return '<defs><linearGradient id="tk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CC8F7"/>' +
        '<stop offset="1" stop-color="#D8F0FF"/></linearGradient><clipPath id="tk-in"><circle cx="0" cy="0" r="45"/></clipPath>' +
        '<filter id="tk-ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/></filter></defs>' +
      '<g transform="translate(' + r1(cx) + ' ' + r1(cy) + ') rotate(-12) scale(' + k + ')">' +
        '<g filter="url(#tk-ds)"><circle cx="0" cy="0" r="54" fill="#FFFFFF"/></g>' +
        '<circle cx="0" cy="0" r="51" fill="#F2B705"/><circle cx="0" cy="0" r="46.5" fill="#0E5A38"/>' +
        '<circle cx="0" cy="0" r="45" fill="url(#tk-sky)"/>' +
        '<g clip-path="url(#tk-in)"><path d="M-46 30 Q0 22 46 28 L46 50 L-46 50 Z" fill="#7CC876"/>' +
          '<g transform="translate(' + r1(-210 * s) + ' ' + r1(-232 * s) + ') scale(' + s + ')">' + TEDDY_ART + '</g></g>' +
        '<circle cx="0" cy="0" r="45" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="1.5"/>' +
      '</g>';
  }
  function poppy(x, y, s) {
    return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (p) {
      return C(x + p[0] * s * 0.55, y + p[1] * s * 0.55, s * 0.75, '#D7262B');
    }).join('') + C(x, y, s * 0.38, '#141414');
  }
  function leaf(x, y, a, c) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="9" ry="4.5" fill="' + c + '" transform="rotate(' + a + ' ' + x + ' ' + y + ')"/>';
  }
  function egg(x, y, c) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="8" ry="10.5" fill="' + c + '"/>' + L(x - 7.5, y, x + 7.5, y, '#fff', 1.6); }
  function pumpkin(x, y, s) {
    return '<ellipse cx="' + r1(x - s * 0.45) + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.8) + '" fill="#E8741C"/>' +
      '<ellipse cx="' + r1(x + s * 0.45) + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.8) + '" fill="#E8741C"/>' +
      '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.85) + '" fill="#F28C28"/>' + R(x - 1.5, y - s * 1.15, 3, s * 0.4, '#3C5A1E');
  }
  function laurel(x, y, c) {
    var s = '';
    [-1, 1].forEach(function (sd) {
      for (var i = 0; i < 5; i++) {
        var cx = x + sd * (18 - i * 1.5), cy = y + 28 - i * 9;
        s += '<ellipse cx="' + r1(cx) + '" cy="' + cy + '" rx="3" ry="6.5" fill="' + c + '" transform="rotate(' + sd * (30 - i * 10) + ' ' + r1(cx) + ' ' + cy + ')"/>';
      }
    });
    return s;
  }
  function peaks(c) {
    return P('220,62 250,22 268,40 288,10 312,44 330,30 330,62', c) + P('282,18 288,10 294,18', '#fff');
  }
  function baton(x, y, c) { return R(x, y, 7, 30, c, 1, 'rx="3" transform="rotate(30 ' + x + ' ' + y + ')"'); }
  function ring(x, y, c, inner) { return C(x, y, 13, 'none', 1, 'stroke="' + c + '" stroke-width="1.5"') + inner; }
  function waves(y, c, w, o) {
    return '<path d="M240 ' + y + ' q15 -12 30 0 t30 0 t30 0" fill="none" stroke="' + c + '" stroke-width="' + w + '"' +
      (o ? ' opacity="' + o + '"' : '') + '/>';
  }
  function pohutukawa(x, y, r) {
    var s = '';
    for (var i = 0; i < 14; i++) {
      var a = i * Math.PI / 7, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
      s += L(x, y, ex, ey, '#D7263D', 1.6) + C(ex, ey, 1.4, '#FFD34D');
    }
    return s;
  }
  function southernCross() {
    var s = '';
    [[300, 58, 9], [316, 30, 8], [286, 22, 7], [298, 10, 6]].forEach(function (p) {
      s += star(p[0], p[1], p[2], '#C8102E', 5, 0.42, 'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"');
    });
    return s;
  }
  function rosette() {
    var s = '<g transform="translate(283 46)">' + P('-10,10 -20,52 -12,46 -6,56 0,14', '#C8102E') + P('10,10 20,52 12,46 6,56 0,14', '#111');
    for (var i = 0; i < 16; i++) {
      var a = i * Math.PI / 8;
      s += C(Math.cos(a) * 19, Math.sin(a) * 19, 8, i % 2 ? '#C8102E' : '#111');
    }
    return s + C(0, 0, 16, '#fff') + C(0, 0, 13, '#C8102E') + '</g>';
  }
  function combined(c) {
    return ring(252, 22, c, R(244, 24, 16, 2, c) + L(246, 24, 246, 32, c, 1.5) + L(258, 24, 258, 32, c, 1.5)) +
      ring(284, 22, c, C(284, 22, 6, c)) + ring(316, 22, c, L(306, 30, 326, 14, c, 2)) +
      ring(268, 48, c, L(259, 44, 277, 44, c, 1.5) + L(260, 44, 260, 56, c, 1.5) + L(276, 44, 276, 56, c, 1.5)) +
      ring(300, 48, c, '<path d="M292 54 q8 -14 16 0" fill="none" stroke="' + c + '" stroke-width="1.8"/>');
  }
  function cheq(x, y) {
    var s = '';
    for (var r = 0; r < 4; r++) { for (var c = 0; c < 6; c++) { if ((r + c) % 2) { s += R(x + c * 9, y + r * 9, 9, 9, '#fff'); } } }
    return s;
  }

  // the club singlet: bottle green, the white sweep up across the chest to the bottom
  // right, edged in gold pinstripes, with a band of white hatching above it
  var SINGLET = R(0, 0, 330, 1.7, '#E2BD2F') +
    P('220,173 258.5,173 330,99 330,52.25', '#F7F7F2') +
    L(207.9, 173, 330, 39, '#FFFFFF', 5.5, 0.85, 'stroke-dasharray="1.6 2.75"') +
    L(215.6, 173, 330, 47.3, '#E2BD2F', 2.2) + L(265.1, 173, 330, 105.6, '#E2BD2F', 2.2) + L(271.7, 173, 330, 112.2, '#E2BD2F', 1.1);
  // where the sweep is on the card (600 x 315), hatching and pinstripes included: words
  // go left of its upper edge, or right of its lower one
  var SWEEP = {
    upper: function (y) { return 370 + (315 - y) * (230 / 253); },
    lower: function (y) { return 500 + (315 - y) * (100 / 105); }
  };

  /* Themes: colours (bg the background, band the counts' band, accent, soft for quieter
     words, text), the line across the top, and the picture in the top right corner. */
  var GROUPS = ['Club', 'Occasions', 'Seasons', 'Championships', 'Special events', 'Event types'];
  var THEMES = [
    { id: 'club', name: 'Club', group: 'Club', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#B8D4C8', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: '' },
    { id: 'singlet', name: 'Club singlet', group: 'Club', bg: '#0E4634', band: '#0A3727', accent: '#E2BD2F', soft: '#CFE3D8', text: '#FFFFFF',
      eyebrow: 'NORTH CANTERBURY', strip: 'none', far: '#0E4634', sweep: true, art: SINGLET },
    { id: 'singlet-track', name: 'Club singlet, with the track', group: 'Club', bg: '#0E4634', band: '#0A3727', accent: '#E2BD2F', soft: '#CFE3D8',
      text: '#FFFFFF', eyebrow: 'NORTH CANTERBURY', far: '#0E4634', sweep: true, art: SINGLET, plain: 'singlet' },   // plain: the same theme without the track

    { id: 'new-year', name: 'New Year', group: 'Occasions', bg: '#070505', band: '#1C130C', accent: '#FFD34D', soft: '#D8CDBE', text: '#FFFFFF',
      eyebrow: 'HAPPY NEW YEAR', art: '', scene: fireworks },    // scene: a picture across the whole card, behind everything
    { id: 'waitangi', name: 'Waitangi Day', group: 'Occasions', bg: '#012169', band: '#0B2E80', accent: '#FFFFFF', soft: '#C9D3EE', text: '#FFFFFF',
      eyebrow: 'WAITANGI DAY', art: southernCross() + pohutukawa(252, 24, 11) + pohutukawa(262, 52, 8) },
    { id: 'easter', name: 'Easter', group: 'Occasions', bg: '#5B4B8A', band: '#6C5C9E', accent: '#FFE27A', soft: '#E4DDF7', text: '#FFFFFF',
      eyebrow: 'HAPPY EASTER', art: egg(266, 28, '#FFB3C7') + egg(288, 20, '#9FE3C5') + egg(310, 30, '#FFE27A') },
    { id: 'anzac', name: 'Anzac', group: 'Occasions', bg: '#1E2326', band: '#2B3135', accent: '#E8463E', soft: '#D3D6D8', text: '#FFFFFF',
      eyebrow: 'ANZAC', art: poppy(268, 24, 10) + poppy(298, 16, 8) + poppy(312, 40, 9) },
    { id: 'kings-birthday', name: 'King’s Birthday weekend', group: 'Occasions', bg: '#3B1F6B', band: '#4A2A82', accent: '#E9C46A', soft: '#DCD0F0', text: '#FFFFFF',
      eyebrow: 'KING’S BIRTHDAY WEEKEND', art: P('268,50 264,26 278,38 290,20 302,38 316,26 312,50', '#E9C46A') + R(268, 50, 44, 6, '#E9C46A') +
        C(290, 20, 3, '#E9C46A') + C(264, 26, 2.5, '#E9C46A') + C(316, 26, 2.5, '#E9C46A') + C(290, 44, 3, '#C8102E') },
    { id: 'matariki', name: 'Matariki', group: 'Occasions', bg: '#0A1633', band: '#13234A', accent: '#F5D67A', soft: '#C3CEE8', text: '#FFFFFF',
      eyebrow: 'MATARIKI', art: [[262, 14], [276, 22], [290, 12], [284, 34], [300, 28], [270, 40], [312, 16], [302, 44], [256, 30]]
        .map(function (p) { return C(p[0], p[1], 2.6, '#F5D67A'); }).join('') },
    { id: 'halloween', name: 'Halloween', group: 'Occasions', bg: '#1E1430', band: '#2C1F45', accent: '#FF8C1A', soft: '#D7CDEB', text: '#FFFFFF',
      eyebrow: 'SPOOKY RESULTS', art: pumpkin(278, 34, 11) + pumpkin(308, 40, 8) + C(306, 14, 9, '#F4E9C1') },
    { id: 'guy-fawkes', name: 'Guy Fawkes', group: 'Occasions', bg: '#141B3D', band: '#1F2856', accent: '#FF5E5E', soft: '#C8CEEE', text: '#FFFFFF',
      eyebrow: 'FIREWORKS', art: '', scene: peony },
    { id: 'canterbury-anniversary', name: 'Canterbury Anniversary', group: 'Occasions', bg: '#111111', band: '#232323', accent: '#E4002B', soft: '#D6D6D6', text: '#FFFFFF',
      eyebrow: 'CANTERBURY ANNIVERSARY', art: [0, 1, 2, 3, 4, 5, 6].map(function (i) { return R(236, i * 24 - 6, 94, 12, '#C8102E'); }).join('') +
        R(236, 0, 94, 152, '#000', 0.25) + rosette() },
    { id: 'christmas', name: 'Christmas', group: 'Occasions', bg: '#8E1B1B', band: '#A42626', accent: '#FFE08A', soft: '#F6CFCF', text: '#FFFFFF',
      eyebrow: 'MERRY CHRISTMAS', art: star(290, 18, 10, '#FFE08A') + C(264, 34, 5, '#2F8F4E') + C(312, 36, 3, '#FFE08A') + C(280, 44, 3, '#FFE08A') + C(300, 46, 5, '#2F8F4E') },

    { id: 'season-opener', name: 'Season opener', group: 'Seasons', bg: '#1F5E3A', band: '#2A7348', accent: '#FFB7D0', soft: '#CDE8D4', text: '#FFFFFF',
      eyebrow: 'SEASON OPENER', art: [[262, 14], [290, 24], [306, 10], [276, 34], [314, 36]].map(function (p) { return C(p[0], p[1], 5, '#FFB7D0', 0.85); }).join('') },
    { id: 'spring', name: 'Spring (Daffodils)', group: 'Seasons', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#DCEBE3', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: '', scene: daffodils },
    { id: 'spring-blossom', name: 'Spring (Blossoms)', group: 'Seasons', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#DCEBE3', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: '', scene: sakura },
    { id: 'summer', name: 'Summer', group: 'Seasons', bg: '#0A8FA8', band: '#13A3BD', accent: '#FFE15C', soft: '#D9F6FB', text: '#FFFFFF',
      eyebrow: 'SUMMER SERIES', strip: 'sand', art: C(296, 26, 18, '#FFE15C') + waves(60, '#fff', 3) + waves(50, '#fff', 2, 0.6) },
    { id: 'autumn', name: 'Autumn', group: 'Seasons', bg: '#5A2E14', band: '#6E3A1C', accent: '#F2A93B', soft: '#F1DCCB', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: leaf(266, 22, 30, '#E8741C') + leaf(292, 14, -20, '#F2A93B') + leaf(310, 34, 60, '#C0392B') + leaf(282, 40, -50, '#D9A21B') },
    { id: 'winter', name: 'Winter', group: 'Seasons', bg: '#1C3550', band: '#264463', accent: '#BFE3FF', soft: '#CFDDEB', text: '#FFFFFF',
      eyebrow: 'WINTER SERIES', art: peaks('#3D5D80') + [[250, 12], [262, 30], [318, 8], [244, 40]].map(function (p) { return C(p[0], p[1], 2, '#fff', 0.8); }).join('') },
    { id: 'season-finale', name: 'Season finale', group: 'Seasons', bg: '#111111', band: '#222222', accent: '#FFC629', soft: '#CFCFCF', text: '#FFFFFF',
      eyebrow: 'SEASON FINALE', art: cheq(270, 8) },

    { id: 'club-champs', name: 'Club championships', group: 'Championships', bg: '#141414', band: '#222222', accent: '#D4AF37', soft: '#CFCFCF', text: '#FFFFFF',
      eyebrow: 'CLUB CHAMPIONSHIPS', art: laurel(292, 8, '#D4AF37') },
    { id: 'champs', name: 'Canterbury championships', group: 'Championships', bg: '#2B2B2B', band: '#3A3A3A', accent: '#E8443A', soft: '#D8D8D8', text: '#FFFFFF',
      eyebrow: 'CHAMPIONSHIPS', art: R(262, 0, 16, 152, '#E8443A') + R(284, 0, 8, 152, '#E8443A', 0.6) },
    { id: 'south-island', name: 'South Island championships', group: 'Championships', bg: '#183A4A', band: '#22495C', accent: '#7FD1C7', soft: '#CCE3EA', text: '#FFFFFF',
      eyebrow: 'SOUTH ISLAND CHAMPIONSHIPS', art: peaks('#2C5D72') },
    { id: 'national', name: 'National championships', group: 'Championships', bg: '#0A0A0A', band: '#1C1C1C', accent: '#C9CED6', soft: '#A9AEB6', text: '#FFFFFF',
      eyebrow: 'NATIONAL CHAMPIONSHIPS', art: R(262, 26, 16, 22, '#C9CED6') + R(282, 12, 16, 36, '#E5E7EA') + R(302, 32, 16, 16, '#9DA3AB') },
    { id: 'oceania', name: 'Oceania', group: 'Championships', bg: '#003B5C', band: '#0A4C72', accent: '#4FD1C5', soft: '#C6E3F0', text: '#FFFFFF',
      eyebrow: 'OCEANIA CHAMPIONSHIPS', art: waves(30, '#4FD1C5', 3) + waves(44, '#4FD1C5', 2, 0.6) },
    { id: 'international', name: 'International', group: 'Championships', bg: '#06142E', band: '#0D2247', accent: '#3DD6F5', soft: '#B5C8E8', text: '#FFFFFF',
      eyebrow: 'INTERNATIONAL MEET', art: [256, 276, 296, 316].map(function (x) { return C(x, 14, 3, '#fff'); }).join('') + R(250, 18, 72, 2, '#3DD6F5') },

    { id: 'colgate', name: 'Colgate Games', group: 'Special events', bg: '#E4002B', band: '#C70026', accent: '#FFFFFF', soft: '#FFD9DF', text: '#FFFFFF',
      eyebrow: 'COLGATE GAMES', art: '', badge: '/assets/img/colgate-games.png' },     // the event's logo, used with its organisers' OK
    { id: 'childrens', name: 'Children’s', group: 'Special events', bg: '#FFD84D', band: '#FFE57F', accent: '#1F3A93', soft: '#3B4A7A', text: '#14234F', light: true,
      eyebrow: 'GAME ON', art: '' },
    { id: 'teddy', name: 'Teddy', group: 'Special events', bg: '#D8F0FF', band: '#FFFFFF', accent: '#0E7A45', soft: '#2D5A45', text: '#0B3B2E', light: true,
      eyebrow: 'CONGRATULATIONS EVERYONE!', art: '', scene: teddySky, mascot: true },   // Teddy in the layouts in TEDDY_AT
    { id: 'combined', name: 'Combined events', group: 'Special events', bg: '#232A5C', band: '#2E3672', accent: '#FFB547', soft: '#CBD0F0', text: '#FFFFFF',
      eyebrow: 'COMBINED EVENTS', art: combined('#FFB547') },
    { id: 'everyone', name: 'Athletics for everyone', group: 'Special events', bg: '#00695C', band: '#0B7D6E', accent: '#FFE27A', soft: '#CDEDE7', text: '#FFFFFF',
      eyebrow: 'ATHLETICS FOR EVERYONE', art: ['#FF7AB6', '#FFE27A', '#7FD1FF', '#9BE57F', '#FFB547'].map(function (c, i) { return C(262 + i * 13, 26, 7, c); }).join('') },

    { id: 'interclub', name: 'Interclub', group: 'Event types', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#B8D4C8', text: '#FFFFFF',
      eyebrow: 'INTERCLUB', art: ['#FFC629', '#FFFFFF', '#0072B5', '#E8443A'].map(function (c, i) { return R(262 + i * 15, 0, 10, 52, c, 0.9); }).join('') },
    { id: 'twilight', name: 'Twilight', group: 'Event types', bg: '#1B1F4B', band: '#272C63', accent: '#FF9F43', soft: '#C6C9EE', text: '#FFFFFF',
      eyebrow: 'TWILIGHT MEET', art: P('308,0 330,0 258,94 230,94', '#fff', 'opacity=".07"') + P('275,0 292,0 198,94 176,94', '#fff', 'opacity=".05"') + C(316, 8, 4, '#fff') },
    { id: 'relays', name: 'Relays', group: 'Event types', bg: '#0E3F6E', band: '#174F85', accent: '#FF8A3D', soft: '#C9DCF0', text: '#FFFFFF',
      eyebrow: 'RELAYS', art: baton(268, 4, '#FF8A3D') + baton(292, 6, '#FFD34D') + baton(316, 8, '#fff') },
    { id: 'steeplechase', name: 'Steeplechase', group: 'Event types', bg: '#0D4B5C', band: '#165C6F', accent: '#7EE0F2', soft: '#CDE7EE', text: '#FFFFFF',
      eyebrow: 'STEEPLECHASE', art: R(258, 30, 60, 6, '#fff') + R(262, 36, 4, 16, '#fff') + R(310, 36, 4, 16, '#fff') + R(250, 52, 76, 6, '#7EE0F2') },
    { id: 'throws', name: 'Throws', group: 'Event types', bg: '#3A2A1E', band: '#4A372A', accent: '#F2B33D', soft: '#E5D6C6', text: '#FFFFFF',
      eyebrow: 'THROWS', art: L(270, 52, 318, 4, '#F2B33D', 1.5) + L(270, 52, 330, 30, '#F2B33D', 1.5) +
        '<path d="M300 22 A40 40 0 0 1 308 40" fill="none" stroke="#F2B33D" stroke-dasharray="3 3"/>' + C(270, 52, 4, '#F2B33D') },
    { id: 'indoor', name: 'Indoor', group: 'Event types', bg: '#2A1B3D', band: '#3A2853', accent: '#FF6B6B', soft: '#DCD0EC', text: '#FFFFFF',
      eyebrow: 'INDOOR', art: '<path d="M240 40 Q285 0 330 40" fill="none" stroke="#FF6B6B" stroke-width="2"/>' +
        [255, 270, 285, 300, 315].map(function (x) { return L(x, 40, x, 52, '#FF6B6B', 1); }).join('') },
    { id: 'masters', name: 'Masters', group: 'Event types', bg: '#4A1942', band: '#5C2453', accent: '#E3A869', soft: '#E5CFE0', text: '#FFFFFF',
      eyebrow: 'MASTERS', art: C(292, 26, 20, 'none', 1, 'stroke="#E3A869" stroke-width="3"') + C(292, 26, 12, '#E3A869', 0.5) },
    { id: 'schools', name: 'Schools', group: 'Event types', bg: '#13315C', band: '#1C4378', accent: '#F2C14E', soft: '#C8D6EA', text: '#FFFFFF',
      eyebrow: 'SCHOOLS ATHLETICS', art: [30, 60, 90, 120].map(function (y) { return L(0, y, 330, y, '#fff', 1, 0.06); }).join('') + star(300, 24, 9, '#F2C14E') },
    { id: 'cross-country', name: 'Cross country', group: 'Event types', bg: '#3B2F25', band: '#4A3B2E', accent: '#FF4FA3', soft: '#E2D6C8', text: '#FFFFFF',
      eyebrow: 'CROSS COUNTRY', art: [[262, 20], [286, 34], [310, 18]].map(function (p) { return C(p[0], p[1], 5, '#FF4FA3'); }).join('') },
    { id: 'road', name: 'Road', group: 'Event types', bg: '#25282B', band: '#33373B', accent: '#FFD34D', soft: '#C9CDD1', text: '#FFFFFF',
      eyebrow: 'ROAD RACE', art: L(250, 40, 330, 40, '#FFD34D', 3, 1, 'stroke-dasharray="14 9"') },
    { id: 'trail', name: 'Trail and hill', group: 'Event types', bg: '#35432A', band: '#435436', accent: '#E9C46A', soft: '#D6DEC9', text: '#FFFFFF',
      eyebrow: 'TRAIL RUN', art: [0, 1, 2, 3].map(function (i) {
        return '<ellipse cx="292" cy="30" rx="' + (14 + i * 11) + '" ry="' + (9 + i * 7) + '" fill="none" stroke="#E9C46A" opacity=".3"/>';
      }).join('') }
  ];
  var BY_ID = {};
  THEMES.forEach(function (t) { BY_ID[t.id] = t; });

  var LAYOUTS = [
    { id: 'classic', name: 'Classic' }, { id: 'big-number', name: 'Big number' }, { id: 'race-bib', name: 'Race bib' },
    { id: 'scoreboard', name: 'Scoreboard' }, { id: 'poster', name: 'Poster' }, { id: 'ticket', name: 'Ticket' },
    { id: 'podium', name: 'Podium' }
  ];
  var PATTERNS = [
    { id: 'none', name: 'None' }, { id: 'stripes', name: 'Stripes' }, { id: 'dots', name: 'Dots' }, { id: 'confetti', name: 'Confetti' },
    { id: 'lanes', name: 'Lanes' }, { id: 'chevrons', name: 'Chevrons' }, { id: 'hoops', name: 'Hoops' }
  ];
  var STICKERS = [
    { id: 'none', name: 'None' }, { id: 'pb', name: 'New PBs stamp' }, { id: 'burst', name: 'Starburst' }, { id: 'medal', name: 'Medal' },
    { id: 'trophy', name: 'Trophy' }, { id: 'star', name: 'Star' }, { id: 'bolt', name: 'Lightning' }, { id: 'flame', name: 'Flame' },
    { id: 'win', name: 'Race win stamp' }, { id: 'top10', name: 'Top 10 stamp' }, { id: 'finisher', name: 'Finisher medal' },
    { id: 'teddy', name: 'Teddy' }
  ];
  // the stickers a meeting offers: no New PBs stamp out of the stadium, and its own stamps there
  function stickersFor(out) {
    var skip = out ? ['pb'] : ['win', 'top10', 'finisher'];
    return STICKERS.filter(function (s) { return skip.indexOf(s.id) < 0; });
  }
  // how a sticker is drawn; saved as part of its name ("flame-realistic"), the default left off
  var STICKER_STYLES = [
    { id: 'gradient', name: 'Glossy' }, { id: 'clipart', name: 'Clipart' }, { id: 'translucent', name: 'Translucent' },
    { id: 'realistic', name: 'Realistic' }
  ];
  var STICKER_STYLE = 'gradient';
  function stickerOf(value) {
    var v = String(value || ''), m = /^(.*)-(gradient|clipart|translucent|realistic)$/.exec(v);
    var id = m ? m[1] : v;
    return find(STICKERS, id) ? { id: id, style: id === 'none' ? STICKER_STYLE : m ? m[2] : STICKER_STYLE } : null;
  }
  function stickerValue(id, style) {
    return !id || id === 'none' ? 'none' : style && style !== STICKER_STYLE ? id + '-' + style : id;
  }
  var FONTS = [
    { id: 'bold', name: 'Bold', weight: 800 }, { id: 'heavy', name: 'Heavy italic', weight: 900, italic: true },
    { id: 'condensed', name: 'Condensed', weight: 900, squeeze: 0.72, grow: 1.12 }, { id: 'light', name: 'Light', weight: 300 },
    { id: 'dots', name: 'Scoreboard lights', weight: 800, dots: true }
  ];
  var FEATURES = [{ id: 'pbs', name: 'PBs' }, { id: 'athletes', name: 'Athletes' }, { id: 'podiums', name: 'Podiums' },
                  { id: 'km', name: 'Kilometres raced' }, { id: 'wins', name: 'Race wins' }, { id: 'top10', name: 'Top 10s' }];
  // the counts a meeting can feature: out of the stadium there are no PBs, and the
  // kilometres raced, race wins and top 10s instead
  function featuresFor(out) {
    var ids = out ? ['athletes', 'km', 'podiums', 'wins', 'top10'] : ['pbs', 'athletes', 'podiums'];
    return FEATURES.filter(function (f) { return ids.indexOf(f.id) >= 0; }).map(function (f) {
      return out && f.id === 'athletes' ? { id: f.id, name: 'Runners' } : f;
    });
  }
  var HEADLINE_MAX = 28;
  function find(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }

  /* Dates ---------------------------------------------------------------------------- */
  function ymd(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? ymd(+m[1], +m[2], +m[3]) : null;
  }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function between(d, a, b) { return d.getTime() >= a.getTime() && d.getTime() <= b.getTime(); }
  // Easter Sunday (the Gregorian calendar's computus)
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }
  // the nth weekday (0 Sunday to 6 Saturday) of a month
  function nthWeekday(y, m, wd, n) {
    var first = ymd(y, m, 1), shift = (wd - first.getUTCDay() + 7) % 7;
    return addDays(first, shift + (n - 1) * 7);
  }
  // the Matariki public holiday, as set in law (Te Kāhui o Matariki Public Holiday Act 2022)
  var MATARIKI = { 2022: '06-24', 2023: '07-14', 2024: '06-28', 2025: '06-20', 2026: '07-10', 2027: '06-25', 2028: '07-14',
                   2029: '07-06', 2030: '06-21', 2031: '07-11', 2032: '07-02', 2033: '06-24', 2034: '07-07', 2035: '06-29' };
  var MATARIKI_DAYS = 14;       // the Matariki period: a fortnight either side of the holiday
  // Canterbury Anniversary (Show Day): the second Friday after the first Tuesday in November
  function showDay(y) { return addDays(nthWeekday(y, 11, 2, 1), 10); }

  // the holiday or occasion a date falls in, or null
  function occasion(d) {
    if (!d) { return null; }
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (m === 1 && day <= 7) { return 'new-year'; }
    if (between(d, ymd(y, 2, 3), ymd(y, 2, 9))) { return 'waitangi'; }
    var e = easter(y);
    if (between(d, addDays(e, -2), addDays(e, 1))) { return 'easter'; }
    if (between(d, ymd(y, 4, 22), ymd(y, 4, 28))) { return 'anzac'; }
    var kb = nthWeekday(y, 6, 1, 1);
    if (between(d, addDays(kb, -2), kb)) { return 'kings-birthday'; }
    if (MATARIKI[y]) {
      var mt = parse(y + '-' + MATARIKI[y]);
      if (between(d, addDays(mt, -MATARIKI_DAYS), addDays(mt, MATARIKI_DAYS))) { return 'matariki'; }
    }
    if (between(d, ymd(y, 10, 25), ymd(y, 10, 31))) { return 'halloween'; }
    if (between(d, ymd(y, 11, 2), ymd(y, 11, 8))) { return 'guy-fawkes'; }
    var sd = showDay(y);
    if (between(d, addDays(sd, -1), addDays(sd, 2))) { return 'canterbury-anniversary'; }
    if (m === 12 && day <= 24) { return 'christmas'; }
    return null;
  }
  function season(d) {
    if (!d) { return null; }
    var m = d.getUTCMonth() + 1;
    return m >= 9 && m <= 11 ? 'spring' : m === 12 || m <= 2 ? 'summer' : m <= 5 ? 'autumn' : 'winter';
  }

  /* The suggestion ---------------------------------------------------------------- */
  function courseOf(meeting) {
    var kind = meeting && meeting.track && meeting.track.kind;
    if (kind) { return kind; }
    var t = String((meeting && meeting.type) || '').toLowerCase();
    return t === 'cross country' ? 'cross-country' : t === 'road' ? 'road' : t === 'trail' ? 'trail' : 'track';
  }
  var WHY = {
    occasion: 'it’s during {0}', special: 'it’s a {0} meeting', level: 'it’s a {0} meeting', kind: 'it’s a {0} meeting',
    season: 'it’s in {0}', none: 'nothing more particular fits'
  };
  function because(how, theme) {
    var name = theme ? theme.name : '';
    return WHY[how].replace('{0}', how === 'season' ? name.toLowerCase() : name);
  }

  // { theme, why }: the theme a meeting suggests, and why
  function suggestTheme(meeting) {
    meeting = meeting || {};
    var name = String(meeting.name || ''), type = String(meeting.type || '').toLowerCase();
    var d = parse(meeting.first), pick = function (id, how) { return { theme: id, why: because(how, BY_ID[id]) }; };
    if (/christmas/i.test(name)) { return pick('christmas', 'occasion'); }
    var occ = occasion(d);
    if (occ) { return pick(occ, 'occasion'); }
    if (/colgate/i.test(name) || type === 'colgate games') { return pick('colgate', 'special'); }
    if (/opening day/i.test(name)) { return pick('season-opener', 'special'); }
    if (/club champ|ncan champ|north canterbury champ/i.test(name)) { return pick('club-champs', 'special'); }
    if (/\bncan\b|north canterbury a/i.test(name)) { return pick('singlet', 'special'); }     // the club's own meetings
    if (/international|sir graeme douglas|porritt/i.test(name)) { return pick('international', 'special'); }
    if (/oceania/i.test(name)) { return pick('oceania', 'special'); }
    if (/all abilities|halberg|for everyone|inclusi/i.test(name)) { return pick('everyone', 'special'); }
    if (/champ/i.test(name) || type === 'championships') {
      if (/children/i.test(name)) { return pick('childrens', 'level'); }
      if (/\bnz\b|new zealand|national|nzss/i.test(name)) { return pick('national', 'level'); }
      if (/south island|\bsi\b/i.test(name)) { return pick('south-island', 'level'); }
      if (/indoor/i.test(name)) { return pick('indoor', 'kind'); }
      return pick('champs', 'level');
    }
    if (/throw/i.test(name)) { return pick('throws', 'kind'); }
    if (/quadrathon|combined|heptathlon|decathlon|pentathlon|pentath/i.test(name) || type === 'quadrathon') { return pick('combined', 'kind'); }
    if (/steeple/i.test(name) && !/relay/i.test(name)) { return pick('steeplechase', 'kind'); }
    if (/relay/i.test(name) || type === 'relays') { return pick('relays', 'kind'); }
    if (/indoor/i.test(name)) { return pick('indoor', 'kind'); }
    var course = courseOf(meeting);
    if (course === 'cross-country') { return pick('cross-country', 'kind'); }
    if (course === 'road') { return pick('road', 'kind'); }
    if (course === 'trail') { return pick('trail', 'kind'); }
    if (/twilight|friday night lights/i.test(name) || type === 'twilight') { return pick('twilight', 'kind'); }
    if (/masters/i.test(name) || type === 'masters') { return pick('masters', 'kind'); }
    if (/school|aims/i.test(name) || type === 'school') { return pick('schools', 'kind'); }
    if (/children/i.test(name)) { return pick('childrens', 'kind'); }
    var sn = season(d);
    if (sn) { return pick(sn, 'season'); }
    return pick('club', 'none');
  }
  var LAYOUT_FOR = {
    twilight: 'scoreboard', international: 'scoreboard', indoor: 'scoreboard', 'guy-fawkes': 'scoreboard',
    'new-year': 'ticket', christmas: 'ticket', 'canterbury-anniversary': 'ticket',
    colgate: 'poster', childrens: 'poster', teddy: 'poster', 'season-opener': 'poster', 'season-finale': 'poster', summer: 'poster',
    halloween: 'big-number', combined: 'big-number', throws: 'big-number',
    'cross-country': 'race-bib', road: 'race-bib', trail: 'race-bib', relays: 'race-bib', steeplechase: 'race-bib',
    'club-champs': 'podium', champs: 'podium', 'south-island': 'podium', national: 'podium', oceania: 'podium'
  };
  function featureFor(counts) {
    counts = counts || {};
    if (counts.out) { return counts.km ? 'km' : counts.medals ? 'podiums' : 'athletes'; }
    return counts.pbs ? 'pbs' : counts.medals ? 'podiums' : 'athletes';
  }
  // the whole suggested look for a meeting (counts: the recap's, to pick what to feature)
  function suggest(meeting, counts) {
    var s = suggestTheme(meeting), layout = LAYOUT_FOR[s.theme] || 'classic';
    return { theme: s.theme, why: s.why, layout: layout, pattern: 'none', sticker: 'none',
             font: layout === 'scoreboard' ? 'dots' : layout === 'poster' ? 'condensed' : 'bold',
             feature: featureFor(counts), accent: '', headline: '', photo: '', focus: 50 };
  }
  // a saved look over the suggestion: anything unknown or left out is the suggestion's
  function resolve(look, meeting, counts) {
    look = look || {};
    var s = suggest(meeting, counts), out = {};
    [['theme', THEMES], ['layout', LAYOUTS], ['pattern', PATTERNS], ['font', FONTS], ['feature', FEATURES]]
      .forEach(function (k) { out[k[0]] = look[k[0]] && find(k[1], look[k[0]]) ? look[k[0]] : s[k[0]]; });
    out.sticker = look.sticker && stickerOf(look.sticker) ? look.sticker : s.sticker;
    out.accent = /^#[0-9a-f]{6}$/i.test(look.accent || '') ? look.accent.toLowerCase() : '';
    out.headline = String(look.headline || '').slice(0, HEADLINE_MAX);
    out.photo = /^https:\/\/photos\.ncan\.nz\//.test(look.photo || '') ? look.photo : '';
    out.focus = typeof look.focus === 'number' && look.focus >= 0 && look.focus <= 100 ? Math.round(look.focus) : 50;
    out.suggested = s;
    return out;
  }
  // what to save: only what differs from the suggestion (so a later, better suggestion still applies)
  function toSave(chosen, meeting, counts) {
    var s = suggest(meeting, counts), out = {};
    ['theme', 'layout', 'pattern', 'sticker', 'font', 'feature'].forEach(function (k) {
      if (chosen[k] && chosen[k] !== s[k]) { out[k] = chosen[k]; }
    });
    if (chosen.accent) { out.accent = chosen.accent; }
    var h = String(chosen.headline || '').replace(/\s+/g, ' ').trim();
    if (h) { out.headline = h.slice(0, HEADLINE_MAX); }
    if (chosen.photo) {
      out.photo = chosen.photo;
      if (chosen.focus != null && chosen.focus !== 50) { out.focus = chosen.focus; }
    }
    return out;
  }

  /* Colour checks ---------------------------------------------------------------- */
  function lum(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (s, c, i) { return s + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // dark or white words, whichever reads better on a colour
  function onColour(hex) { return contrast(hex, '#141414') >= contrast(hex, '#FFFFFF') ? '#141414' : '#FFFFFF'; }
  var ACCENT_MIN = 3;           // large, bold words need 3:1 to read (WCAG)
  function accentReads(accent, bg) { return contrast(accent, bg) >= ACCENT_MIN; }

  /* Laying out ------------------------------------------------------------------ */
  function wrap(words, width, lines) {
    var w = String(words || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var out = [], line = '';
    w.forEach(function (word) {
      if (out.length === lines - 1) { line = line ? line + ' ' + word : word; return; }
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else { line = line ? line + ' ' + word : word; }
    });
    if (line) { out.push(line); }
    return out;
  }
  function rot(cx, cy, dx, dy, deg) {
    var a = deg * Math.PI / 180;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  function pattern(id, colour) {
    var s = '';
    if (id === 'stripes') {
      s = '<defs><pattern id="pt" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">' +
        R(0, 0, 11, 22, colour, 0.06) + '</pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'dots') {
      s = '<defs><pattern id="pt" width="18" height="18" patternUnits="userSpaceOnUse">' + C(9, 9, 2.2, colour, 0.12) +
        '</pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'lanes') {
      for (var i = 0; i < 6; i++) {
        s += '<ellipse cx="0" cy="315" rx="' + (200 + i * 40) + '" ry="' + (140 + i * 30) + '" fill="none" stroke="' + colour + '" stroke-width="2" opacity=".08"/>';
      }
    } else if (id === 'confetti') {
      var seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      var cols = ['#FF4FA3', '#FFD34D', '#5BE0F0', '#7CF29C', '#FFFFFF'];
      for (var j = 0; j < 46; j++) {
        var x = Math.round(rnd() * W), y = Math.round(rnd() * 280), a = Math.round(rnd() * 180);
        s += R(x, y, 7, 3.5, cols[j % 5], 0.45, 'transform="rotate(' + a + ' ' + x + ' ' + y + ')"');
      }
    } else if (id === 'chevrons') {
      for (var k = 0; k < 9; k++) {
        s += '<polyline points="' + (-40 + k * 80) + ',0 ' + (k * 80) + ',40 ' + (-40 + k * 80) + ',80" fill="none" stroke="' + colour +
          '" stroke-width="14" opacity=".06" transform="translate(0 ' + 0 + ')"/>';
      }
      s = '<defs><pattern id="pt" width="80" height="80" patternUnits="userSpaceOnUse">' +
        '<polyline points="0,20 40,50 80,20" fill="none" stroke="' + colour + '" stroke-width="12" opacity=".07"/></pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'hoops') {
      for (var h = 0; h < 7; h++) { s += R(0, h * 48 + 12, W, 20, colour, 0.06); }
    }
    return s;
  }

  /* Stickers: each a few parts in a box about 100 across, centred on 0,0 (main parts
     filled, details drawn as they are), drawn in a style: glossy (a gradient, a shine and
     a soft shadow), clipart (flat, bold outline, a white die-cut border), translucent
     (see-through, a white rim) or realistic (shaded and lit, metal for medals and
     trophies, a drop shadow). */
  function mix(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      var v = Math.round(f < 1 ? c * f : c + (255 - c) * Math.min(1, f - 1));
      return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    }).join('');
  }
  function starPoints(r, n, q) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * q : r;
      pts.push(r1(Math.cos(a) * d) + ',' + r1(Math.sin(a) * d));
    }
    return pts.join(' ');
  }
  var GOLD = '#E2B23A';
  var SHAPES = {
    pb: function () {
      return [{ el: 'circle', a: { cx: 0, cy: 0, r: 46 }, c: '#E8443A' },
              { el: 'circle', a: { cx: 0, cy: 0, r: 39 }, detail: 'fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="4 3"' }];
    },
    burst: function () { return [{ el: 'polygon', a: { points: starPoints(54, 14, 0.78) }, c: '#FF4FA3' }]; },
    medal: function () {
      return [{ el: 'polygon', a: { points: '-22,-60 -4,-60 10,-14 -8,-14' }, c: '#1F6FD1' },
              { el: 'polygon', a: { points: '22,-60 4,-60 -10,-14 8,-14' }, c: '#E8443A' },
              { el: 'circle', a: { cx: 0, cy: 8, r: 31 }, c: GOLD, metal: true },
              { el: 'circle', a: { cx: 0, cy: 8, r: 24 }, detail: 'fill="none" stroke="#FFF3C4" stroke-width="2" opacity=".8"' }];
    },
    trophy: function () {
      return [{ el: 'path', a: { d: 'M-26 -40 C-50 -40 -50 0 -18 2 L-18 -6 C-38 -8 -38 -32 -26 -32 Z' }, c: GOLD, metal: true },
              { el: 'path', a: { d: 'M26 -40 C50 -40 50 0 18 2 L18 -6 C38 -8 38 -32 26 -32 Z' }, c: GOLD, metal: true },
              { el: 'path', a: { d: 'M-28 -46 H28 V-16 C28 6 14 18 0 20 C-14 18 -28 6 -28 -16 Z' }, c: GOLD, metal: true },
              { el: 'rect', a: { x: -6, y: 18, width: 12, height: 14 }, c: GOLD, metal: true },
              { el: 'rect', a: { x: -24, y: 30, width: 48, height: 16, rx: 3 }, c: '#5B3A1A' }];
    },
    star: function () { return [{ el: 'polygon', a: { points: starPoints(54, 5, 0.46) }, c: '#FFC629', metal: true }]; },
    win: function () {
      return [{ el: 'polygon', a: { points: starPoints(52, 16, 0.86) }, c: GOLD, metal: true },
              { el: 'circle', a: { cx: 0, cy: 0, r: 36 }, detail: 'fill="none" stroke="#FFF3C4" stroke-width="2" stroke-dasharray="4 3"' }];
    },
    top10: function () {
      return [{ el: 'path', a: { d: 'M0 -50 L42 -34 V4 C42 28 22 44 0 52 C-22 44 -42 28 -42 4 V-34 Z' }, c: '#2F8F4E' },
              { el: 'path', a: { d: 'M0 -40 L33 -27 V4 C33 22 18 35 0 42 C-18 35 -33 22 -33 4 V-27 Z' },
                detail: 'fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".8"' }];
    },
    finisher: function () {
      return [{ el: 'polygon', a: { points: '-22,-60 -4,-60 10,-14 -8,-14' }, c: '#2F8F4E' },
              { el: 'polygon', a: { points: '22,-60 4,-60 -10,-14 8,-14' }, c: '#FFC629' },
              { el: 'circle', a: { cx: 0, cy: 8, r: 32 }, c: '#C9D0D6', metal: true },
              { el: 'circle', a: { cx: 0, cy: 8, r: 25 }, detail: 'fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".8"' }];
    },
    bolt: function () { return [{ el: 'polygon', a: { points: '8,-56 -26,6 -2,6 -12,56 26,-10 2,-10 14,-56' }, c: '#FFD34D' }]; },
    flame: function () {
      return [{ el: 'path', a: { d: 'M0 50 C-34 40 -36 4 -14 -22 C-12 -6 -4 0 0 2 C2 -18 -2 -34 10 -52 C14 -30 36 -14 32 16 C30 38 16 48 0 50 Z' }, c: '#FF6A13' },
              { el: 'path', a: { d: 'M0 46 C-16 40 -16 20 -4 8 C-2 18 4 20 6 22 C8 12 8 2 14 -6 C22 10 24 24 18 34 C14 42 8 46 0 46 Z' }, c: '#FFD34D' }];
    }
  };
  var STICKER_R = 56;          // how far a sticker reaches from its centre, at full size
  function shapeEl(p, fill, extra) {
    return '<' + p.el + ' ' + Object.keys(p.a).map(function (k) { return k + '="' + p.a[k] + '"'; }).join(' ') +
      ' fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  }
  function stickerArt(value, cx, cy, k) {
    var st = stickerOf(value);
    if (!st || st.id === 'none') { return ''; }
    if (st.id === 'teddy') { return teddySticker(cx, cy, k); }     // his own look, whatever the style
    var parts = SHAPES[st.id](), style = st.style, defs = '', body = '', grads = {}, n = 0;
    var main = parts.filter(function (p) { return !p.detail; });
    var gradFor = function (c, metal) {
      var key = c + (metal ? 'm' : '');
      if (grads[key]) { return grads[key]; }
      var id = 'sg' + (n++);
      grads[key] = id;
      if (style === 'realistic') {
        defs += '<radialGradient id="' + id + '" cx=".34" cy=".28" r=".85">' + (metal
          ? '<stop offset="0" stop-color="' + mix(c, 1.85) + '"/><stop offset=".28" stop-color="' + mix(c, 1.25) + '"/>' +
            '<stop offset=".6" stop-color="' + c + '"/><stop offset=".86" stop-color="' + mix(c, 0.55) + '"/><stop offset="1" stop-color="' + mix(c, 0.8) + '"/>'
          : '<stop offset="0" stop-color="' + mix(c, 1.6) + '"/><stop offset=".5" stop-color="' + c + '"/><stop offset="1" stop-color="' + mix(c, 0.55) + '"/>') +
          '</radialGradient>';
      } else {
        defs += '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(c, 1.45) + '"/>' +
          '<stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + mix(c, 0.66) + '"/></linearGradient>';
      }
      return id;
    };
    var each = function (fn) { return main.map(fn).join(''); };
    var shine = function (top) {
      defs += '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="' + top + '"/>' +
        '<stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>';
      return each(function (p) { return shapeEl(p, 'url(#gl)'); });
    };
    var shadow = function (dy, blur, op) {
      defs += '<filter id="ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="' + dy + '" stdDeviation="' + blur +
        '" flood-color="#000000" flood-opacity="' + op + '"/></filter>';
    };
    if (style === 'clipart') {
      body += each(function (p) { return shapeEl(p, '#FFFFFF', 'stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round"'); });
      body += each(function (p) { return shapeEl(p, p.c, 'stroke="#141414" stroke-width="3.5" stroke-linejoin="round"'); });
    } else if (style === 'translucent') {
      body += each(function (p) { return shapeEl(p, p.c, 'fill-opacity=".5" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="2.5" stroke-linejoin="round"'); });
      body += shine(0.45);
    } else if (style === 'realistic') {
      shadow(5, 4, 0.5);
      body += '<g filter="url(#ds)">' + each(function (p) {
        return shapeEl(p, 'url(#' + gradFor(p.c, p.metal) + ')', 'stroke="' + mix(p.c, 0.5) + '" stroke-width="1.5" stroke-linejoin="round"');
      }) + '</g>';
      body += shine(0.35);
    } else {
      shadow(3, 3, 0.3);
      body += '<g filter="url(#ds)">' + each(function (p) { return shapeEl(p, 'url(#' + gradFor(p.c) + ')'); }) + '</g>';
      body += shine(0.6);
    }
    body += parts.filter(function (p) { return p.detail; }).map(function (p) {
      return '<' + p.el + ' ' + Object.keys(p.a).map(function (q) { return q + '="' + p.a[q] + '"'; }).join(' ') + ' ' + p.detail + '/>';
    }).join('');
    return '<defs>' + defs + '</defs><g transform="translate(' + r1(cx) + ' ' + r1(cy) + ') rotate(-12) scale(' + k + ')">' + body + '</g>';
  }
  function stickerWords(value, cx, cy, k, feat, items) {
    var st = stickerOf(value), id = st && st.id;
    var t = function (words, dy, size, weight, colour, spacing) {
      var p = rot(cx, cy, 0, dy * k, -12);
      items.push({ kind: 'text', words: words, x: r1(p.x), y: r1(p.y), size: r1(size * k), weight: weight, font: 'sans', colour: colour,
                   align: 'center', max: r1(80 * k), spacing: spacing || 0, rotate: -12, sticker: true });
    };
    if (id === 'pb') { t('NEW', -8, 13, 800, '#FFFFFF', 2); t('PBs!', 20, 28, 900, '#FFFFFF'); }
    else if (id === 'burst') { t(String(feat.n), 8, 34, 900, '#FFFFFF'); t(feat.words.toUpperCase(), 26, 12, 800, '#FFFFFF', 1); }
    else if (id === 'medal') { t('1', 20, 32, 900, '#5A4300'); }
    else if (id === 'trophy') { t(String(feat.n), -12, 24, 900, '#5A4300'); }
    else if (id === 'win') { t('RACE', -6, 13, 900, '#5A4300', 2); t('WIN!', 18, 24, 900, '#5A4300'); }
    else if (id === 'top10') { t('TOP', -10, 13, 900, '#FFFFFF', 2); t('10', 18, 30, 900, '#FFFFFF'); }
    else if (id === 'finisher') { t('FINISHER', 13, 10, 900, '#26303A', 1); }
  }

  /* Where a sticker goes: the layout's own spot, or the first of the others that's clear
     of every word and the crest; if none is, its own spot, smaller, with the words next
     to it narrowed to make room (the canvas squeezes words to their width). */
  var SPOTS = [[532, 62], [540, 150], [544, 236], [300, 46], [420, 250], [64, 252]];
  function textBox(i) {
    var k = i.font === 'display' ? 0.6 : 0.56;
    if (!/[a-z]/.test(i.words)) { k += 0.06; }                  // capitals are wider
    var w = Math.min(i.max, i.words.length * (i.size * k * (i.squeeze || 1) + (i.spacing || 0)));
    var x0 = i.align === 'center' ? i.x - w / 2 : i.align === 'right' ? i.x - w : i.x;
    var y0 = i.y - i.size * 0.8, y1 = i.y + i.size * 0.22;
    if (!i.rotate) { return { x: x0, y: y0, w: w, h: y1 - y0 }; }
    var xs = [], ys = [];
    [[x0, y0], [x0 + w, y0], [x0, y1], [x0 + w, y1]].forEach(function (c) {
      var p = rot(i.x, i.y, c[0] - i.x, c[1] - i.y, i.rotate);
      xs.push(p.x); ys.push(p.y);
    });
    var lx = Math.min.apply(null, xs), ly = Math.min.apply(null, ys);
    return { x: lx, y: ly, w: Math.max.apply(null, xs) - lx, h: Math.max.apply(null, ys) - ly };
  }
  function hitsCircle(b, cx, cy, r) {
    var nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r;
  }
  function placeSticker(items, own) {
    var blocks = items.filter(function (i) { return (i.kind === 'text' && !i.sticker) || i.kind === 'logo' || i.kind === 'badge' || i.block; });
    var boxOf = function (i) { return i.kind === 'text' ? textBox(i) : { x: i.x, y: i.y, w: i.w, h: i.h }; };
    var clear = function (cx, cy, r) { return blocks.every(function (i) { return !hitsCircle(boxOf(i), cx, cy, r); }); };
    var tries = [own].concat(SPOTS);
    var sizes = [1.3, 1.15, 1, 0.8];             // as big as there's room for
    for (var s = 0; s < sizes.length; s++) {
      var k = sizes[s];
      for (var j = 0; j < tries.length; j++) {
        if (clear(tries[j][0], tries[j][1], STICKER_R * k)) { return { x: tries[j][0], y: tries[j][1], k: k }; }
      }
    }
    // no clear spot: the first where narrowing the words to its left makes room (only
    // words that start well to its left can be narrowed; the crest can't move)
    var gap = 8;
    var fix = function (cx, cy, r, go) {
      var edge = cx - r - gap, ok = true;
      blocks.forEach(function (i) {
        if (!hitsCircle(boxOf(i), cx, cy, r)) { return; }
        var room = i.kind !== 'text' ? 0 : (!i.align || i.align === 'left') ? edge - i.x - (i.rotate ? 20 : 0)
          : i.align === 'center' ? 2 * (edge - i.x) : 0;
        if (room < 60) { ok = false; return; }
        if (go) { i.max = Math.min(i.max, room); }
      });
      return ok;
    };
    var last = [[W - 30, 30, 0.6]];
    var all = tries.map(function (t) { return [t[0], t[1], 0.85]; }).concat(last);
    for (var q = 0; q < all.length; q++) {
      var c = all[q], r = STICKER_R * c[2];
      if (fix(c[0], c[1], r, false) || q === all.length - 1) { fix(c[0], c[1], r, true); return { x: c[0], y: c[1], k: c[2] }; }
    }
  }

  /* The layouts: each adds its items to `it`. f: the card's facts; t: the colours;
     o: { headline, feature: { n, words }, featureId, sticker }. */
  // t.far: the colour for words that sit on a light part of a theme's picture (the
  // podium's right-hand column, on the singlet's sweep)
  function adder(items, font, t) {
    var add = function (words, x, y, size, o) {
      if (words === '' || words == null) { return; }
      o = o || {};
      if (t.far && o.far) { o.colour = t.far; }
      var disp = o.font === 'display';
      var it = { kind: 'text', words: String(words), x: r1(x), y: r1(y), size: size, weight: o.weight || 400,
                 font: o.font || 'sans', colour: o.colour, align: o.align || 'left', max: o.max || W - 72, spacing: o.spacing || 0 };
      if (disp) {
        it.weight = font.weight;
        if (font.italic) { it.italic = true; }
        if (font.squeeze) { it.squeeze = font.squeeze; it.size = r1(size * (font.grow || 1)); }
        if (font.dots) { it.dots = true; }
      }
      if (o.rotate) { it.rotate = o.rotate; }
      if (o.onBand) { it.onBand = true; }           // on a solid shape of its own, so the picture behind doesn't matter
      items.push(it);
    };
    return add;
  }
  function art(t) { return t.art ? '<g transform="scale(' + K + ')">' + t.art + '</g>' : ''; }
  function stripItem(items, t, f) {
    if (t.strip === 'none') { return; }
    if (t.strip === 'sand') {
      items.push({ kind: 'svg', svg: R(0, H - LANE, W, LANE, '#F2D7A0') +
        '<path d="M0 ' + (H - LANE) + ' q36 -10 72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0" fill="#fff" opacity=".85"/>' });
      return;
    }
    items.push({ kind: 'strip', x: 0, y: H - LANE, w: W, h: LANE, course: f.course || 'track', colour: f.lane || '#0072B5' });
  }
  function logoAt(items, t, x, y, h) {
    items.push({ kind: 'logo', x: x, y: y, h: h, w: r1(h * LOGO_RATIO), dark: !t.light });
  }
  function clubLine(items, add, t, y) {
    logoAt(items, t, 36, y, 36);
    add('North Canterbury', 36 + 36 * LOGO_RATIO + 10, y + 17, 13, { weight: 700, colour: t.text, max: 200 });
    add('Athletic Club', 36 + 36 * LOGO_RATIO + 10, y + 32, 13, { weight: 700, colour: t.text, max: 200 });
    add('ncan.nz', W - 36, y + 25, 14, { weight: 600, colour: t.soft, align: 'right', max: 120 });
  }
  function countsBand(items, add, t, f, x, y, w, h) {
    var cw = w / 3;
    items.push({ kind: 'rect', x: x, y: y, w: w, h: h, colour: t.band, round: 10 });
    f.counts.forEach(function (c, i) {
      var cx = x + cw * i + cw / 2;
      add(String(c.n), cx, y + h * 0.57, 34, { font: 'display', colour: t.accent, align: 'center', max: cw - 16 });
      add(c.words, cx, y + h * 0.86, 13, { weight: 600, colour: t.soft, align: 'center', max: cw - 16 });
    });
  }

  var LAYOUT = {
    classic: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      var room = W - 72;
      add(o.headline, 36, 50, 15, { weight: 800, colour: t.accent, spacing: 2, max: room });
      var lines = wrap(f.title, 30, 2), size = lines.length > 1 ? 30 : 36, y = lines.length > 1 ? 88 : 94;
      lines.forEach(function (l, i) { add(l, 36, y + i * (size + 4), size, { font: 'display', colour: t.text, max: room }); });
      y += (lines.length - 1) * (size + 4);
      add(f.line, 36, y + 26, 14, { colour: t.soft, max: room });
      countsBand(items, add, t, f, 36, 158, W - 72, 70);
      clubLine(items, add, t, H - LANE - 10 - 36);
      return { sticker: [520, 70] };
    },
    'big-number': function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      add(String(o.feature.n), 30, 206, 180, { font: 'display', colour: t.accent, max: 270 });
      add(o.feature.words.toUpperCase(), 36, 244, 22, { weight: 800, colour: t.text, spacing: 4, max: 250 });
      add(o.headline, 310, 70, 14, { weight: 800, colour: t.accent, spacing: 2, max: 254 });
      wrap(f.title, 18, 3).forEach(function (l, i) { add(l, 310, 106 + i * 33, 29, { font: 'display', colour: t.text, max: 254 }); });
      add(f.line, 310, 214, 13, { colour: t.soft, max: 254 });
      logoAt(items, t, 310, 226, 28);
      add('ncan.nz', W - 36, 246, 13, { weight: 600, colour: t.soft, align: 'right', max: 120 });
      return { sticker: [250, 64] };
    },
    'race-bib': function (items, add, t, f, o) {
      var band = t.accent, ink = '#141414';
      var from = items.length;
      items.push({ kind: 'rect', x: 60, y: 18, w: 480, h: 216, colour: '#FBFAF5', round: 14, drop: true });
      items.push({ kind: 'svg', svg: R(60, 18, 480, 56, band, 1, 'rx="14"') + R(60, 52, 480, 22, band) +
        [[78, 90], [522, 90], [78, 218], [522, 218]].map(function (p) {
          return C(p[0], p[1], 6.5, '#D9D9D9', 1, 'stroke="#8A8A8A" stroke-width="1.5"') + L(p[0] - 9, p[1], p[0] + 9, p[1], '#8A8A8A', 1.5);
        }).join('') });
      add(f.title, 84, 54, 22, { font: 'display', colour: onColour(band), max: 360 });
      add('NCAN', 516, 54, 18, { weight: 900, colour: onColour(band), align: 'right', max: 80 });
      add(String(o.feature.n), W / 2, 186, 116, { font: 'display', colour: ink, align: 'center', max: 360 });
      add(o.feature.words.toUpperCase() + (o.headline ? ' · ' + o.headline : ''), W / 2, 218, 14,
          { weight: 800, colour: ink, align: 'center', spacing: 3, max: 400 });
      // pinned on a little crooked, as bibs always are
      items.slice(from).forEach(function (i) { i.tilt = [W / 2, 126, -2.5]; });
      // the crest clear of the bib's lower corner, which the tilt brings down
      logoAt(items, t, 36, 274, 30);
      add(f.line, W - 36, 290, 13, { colour: t.soft, align: 'right', max: 400 });
      add('ncan.nz', W - 36, 305, 12, { weight: 600, colour: t.text, align: 'right', max: 120 });
      return { sticker: [548, 168], plain: true };
    },
    scoreboard: function (items, add, t, f, o) {
      items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: '#0B0B0B' });
      items.push({ kind: 'svg', svg: R(20, 20, 560, 275, '#121212', 1, 'rx="10" stroke="#2C2C2C" stroke-width="4"') +
        '<defs><pattern id="ld" width="6" height="6" patternUnits="userSpaceOnUse">' + C(3, 3, 1, '#FFFFFF', 0.05) + '</pattern></defs>' +
        R(20, 20, 560, 275, 'url(#ld)', 1, 'rx="10"') });
      add(o.headline, W / 2, 62, 22, { font: 'display', colour: t.soft, align: 'center', max: 480, spacing: 2 });
      add(f.title, W / 2, 106, 40, { font: 'display', colour: t.accent, align: 'center', max: 520 });
      f.counts.forEach(function (c, i) {
        var x = 120 + i * 180;
        add(String(c.n), x, 196, 76, { font: 'display', colour: c.id === o.featureId ? t.accent : '#FFFFFF', align: 'center', max: 160 });
        add(c.words, x, 228, 20, { font: 'display', colour: t.soft, align: 'center', max: 160 });
      });
      logoAt(items, { light: false }, 40, 248, 30);
      add('North Canterbury Athletic Club · ncan.nz', W / 2, 270, 15, { weight: 700, colour: t.soft, align: 'center', max: 360 });
      return { sticker: [530, 252], plain: true, ownBg: true };
    },
    poster: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) + P('0,212 600,132 600,196 0,276', t.accent) });
      var lines = wrap(f.title, 16, 2), up = lines.length === 1 ? 40 : 0;
      lines.forEach(function (l, i) {
        add(l.toUpperCase(), 36, 92 + i * 58 + up, 54, { font: 'display', colour: t.text, max: 470, rotate: -7.6 });
      });
      var c = f.counts;
      add([o.headline].concat(c.map(function (x) { return x.n + ' ' + x.words.toUpperCase(); })).filter(Boolean).join('  ·  '),
          36, 252, 16, { weight: 800, colour: onColour(t.accent), spacing: 2, max: 520, rotate: -7.6, onBand: true });
      add(f.line, 36, 302, 13, { colour: t.soft, max: 360 });
      logoAt(items, t, 446, 268, 34);
      add('ncan.nz', W - 36, 302, 14, { weight: 700, colour: t.text, align: 'right', max: 100 });
      return { sticker: [520, 60] };
    },
    ticket: function (items, add, t, f, o) {
      items.push({ kind: 'rect', x: 30, y: 30, w: 540, h: 236, colour: t.band, round: 14 });
      items.push({ kind: 'svg', svg: C(420, 30, 15, t.bg) + C(420, 266, 15, t.bg) +
        L(420, 50, 420, 246, t.soft, 2, 0.6, 'stroke-dasharray="6 6"') });
      add(o.headline, 60, 72, 14, { weight: 800, colour: t.accent, spacing: 3, max: 330 });
      var lines = wrap(f.title, 20, 2);
      lines.forEach(function (l, i) { add(l, 60, 110 + i * 36, 32, { font: 'display', colour: t.text, max: 340 }); });
      add(f.line, 60, 110 + (lines.length - 1) * 36 + 28, 13, { colour: t.soft, max: 340 });
      f.counts.forEach(function (c, i) { add(c.n + ' ' + c.words.toLowerCase(), 60 + i * 115, 236, 15, { weight: 700, colour: t.soft, max: 110 }); });
      add('ADMIT ALL', 495, 66, 12, { weight: 800, colour: t.soft, align: 'center', spacing: 3, max: 120 });
      add(String(o.feature.n), 495, 160, 76, { font: 'display', colour: t.accent, align: 'center', max: 120 });
      add(o.feature.words, 495, 188, 16, { weight: 700, colour: t.text, align: 'center', max: 120 });
      logoAt(items, t, r1(495 - 15 * LOGO_RATIO), 204, 30);
      add('North Canterbury Athletic Club', 36, 296, 13, { weight: 700, colour: t.text, max: 300 });
      add('ncan.nz', W - 36, 296, 13, { weight: 600, colour: t.soft, align: 'right', max: 120 });
      return { sticker: [580, 18] };
    },
    podium: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      var room = W - 72;
      add(o.headline, 36, 50, 15, { weight: 800, colour: t.accent, spacing: 2, max: room });
      add(f.title, 36, 88, 32, { font: 'display', colour: t.text, max: room });
      add(f.line, 36, 114, 14, { colour: t.soft, max: room });
      var rest = f.counts.filter(function (c) { return c.id !== o.featureId; });
      var order = [rest[0], o.feature, rest[1]], hs = [96, 128, 74], cs = [t.soft, t.accent, t.band];
      order.forEach(function (c, i) {
        var x = 56 + i * 128, h = hs[i], y = H - LANE - 4 - h, ink = onColour(cs[i]);
        items.push({ kind: 'rect', x: x, y: y, w: 120, h: h, colour: cs[i] });
        add(String(c.n), x + 60, y + 44, 36, { font: 'display', colour: ink, align: 'center', max: 108 });
        add(c.words, x + 60, y + 64, 13, { weight: 700, colour: ink, align: 'center', max: 108 });
      });
      // on the singlet, the club's column has a panel of its own, clear of the sweep
      if (t.sweep) { items.push({ kind: 'rect', x: 446, y: 150, w: 130, h: 114, colour: t.band, round: 10 }); }
      logoAt(items, t, 456, 160, 32);
      add('North Canterbury', 456, 214, 13, { weight: 700, colour: t.text, max: 110 });
      add('Athletic Club', 456, 230, 13, { weight: 700, colour: t.text, max: 110 });
      add('ncan.nz', 456, 252, 13, { weight: 600, colour: t.soft, max: 110 });
      return { sticker: [526, 66] };
    }
  };

  /* Keep words off the singlet's white sweep: narrowed to end before it, or moved left
     of it (words set from the right), or in the theme's dark ink when they have to start
     on it. Words on a solid shape of their own (a band or a podium block) are left be;
     a crest on it is the one for light backgrounds. */
  function clearSweep(items, t) {
    var solid = items.filter(function (i) { return i.kind === 'rect' && !(i.x === 0 && i.y === 0 && i.w === W && i.h === H); });
    var inside = function (b) {
      return solid.some(function (r) { return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; });
    };
    items.forEach(function (i) {
      if (i.kind !== 'text' && i.kind !== 'logo') { return; }
      var b = i.kind === 'logo' ? { x: i.x, y: i.y, w: i.w, h: i.h } : textBox(i);
      var bottom = b.y + b.h, up = SWEEP.upper(bottom);
      if (b.x + b.w <= up || b.x >= SWEEP.lower(b.y) || i.onBand || inside(b)) { return; }
      if (i.kind === 'logo') { i.dark = false; return; }
      var room = up - 8 - b.x;
      if ((!i.align || i.align === 'left') && room >= 70) { i.max = Math.min(i.max, room - (i.rotate ? 16 : 0)); return; }
      if (i.align === 'center' && 2 * (up - 8 - i.x) >= 70) { i.max = Math.min(i.max, 2 * (up - 8 - i.x)); return; }
      if (i.align === 'right' && up - 8 - b.w > 230) {
        // words already on that line, left-aligned, are narrowed to end before them (a little, at most)
        var moved = { x: up - 8 - b.w, y: b.y, w: b.w, h: b.h }, ok = true;
        items.forEach(function (o) {
          if (o === i || o.kind !== 'text') { return; }
          var ob = textBox(o);
          if (!(ob.x < moved.x + moved.w + 8 && moved.x < ob.x + ob.w + 8 && ob.y < moved.y + moved.h && moved.y < ob.y + ob.h)) { return; }
          var fit = moved.x - 12 - ob.x;
          if ((o.align && o.align !== 'left') || o.rotate || fit < ob.w * 0.75) { ok = false; return; }
          o.max = Math.min(o.max, fit);
        });
        if (ok) { i.x = r1(up - 8); return; }
      }
      if (t.far) { i.colour = t.far; }
    });
  }

  // where an event's logo goes in each layout that shows the theme's picture: [x, y, radius]
  var BADGE_AT = { classic: [522, 82, 58], 'big-number': [544, 58, 44], poster: [522, 72, 60], podium: [524, 76, 54] };
  // the layouts that show the theme's picture, and those with the track or course along the bottom
  var ART_LAYOUTS = ['classic', 'big-number', 'poster', 'podium'];
  var SCENE_DIM = ['big-number', 'podium'];      // layouts with words over the right of a theme's scene
  var STRIP_LAYOUTS = ['classic', 'big-number', 'podium'];
  // a theme that is only its plain twin plus the track, in a layout with no track: the twin
  function fitTheme(chosen) {
    var th = BY_ID[chosen.theme];
    if (th && th.plain && STRIP_LAYOUTS.indexOf(chosen.layout) < 0) { chosen.theme = th.plain; }
    // no Teddy sticker where the full-size Teddy already stands
    var st = stickerOf(chosen.sticker);
    if (st && st.id === 'teddy' && teddyShows(chosen)) { chosen.sticker = 'none'; }
    return chosen;
  }

  // facts: recap-data.js cardFacts (title, line, lane, course, counts [athletes, PBs, podiums]);
  // chosen: resolve()'s look
  function build(facts, chosen) {
    var layout = LAYOUT[chosen.layout] ? chosen.layout : 'classic';
    var theme = BY_ID[fitTheme({ theme: (BY_ID[chosen.theme] || BY_ID.club).id, layout: layout }).theme];
    var t = {};
    Object.keys(theme).forEach(function (k) { t[k] = theme[k]; });
    if (chosen.accent) { t.accent = chosen.accent; }
    if (ART_LAYOUTS.indexOf(layout) < 0) { delete t.far; }     // no picture in the corner, so no light edge
    var font = find(FONTS, chosen.font) || FONTS[0];
    var items = [], add = adder(items, font, t);
    // the three counts shown, each with its id; the featured one among them (in place of
    // the last if it isn't one of the three)
    var IDS = ['athletes', 'pbs', 'podiums'];
    var counts = (facts.counts || []).slice(0, 3).map(function (c, i) {
      return { id: c.id || IDS[i], n: c.n, words: c.words };
    });
    while (counts.length < 3) { counts.push({ id: IDS[counts.length], n: 0, words: ['Athletes', 'PBs', 'Podiums'][counts.length] }); }
    var all = facts.all || {}, fi = -1;
    counts.forEach(function (c, i) { if (c.id === chosen.feature) { fi = i; } });
    if (fi < 0 && all[chosen.feature]) { counts[2] = all[chosen.feature]; fi = 2; }
    if (fi < 0) { fi = 1; }
    var f = { title: facts.title || 'Meeting results', line: facts.line || '', lane: facts.lane, course: facts.course, counts: counts };
    var o = { headline: (chosen.headline || theme.eyebrow || '').toUpperCase(), feature: counts[fi], featureId: counts[fi].id,
              sticker: !!(stickerOf(chosen.sticker) && stickerOf(chosen.sticker).id !== 'none') &&
                       !(stickerOf(chosen.sticker).id === 'teddy' && teddyShows({ theme: theme.id, layout: layout })) };
    // the background, a photo faded into it, and a pattern
    var bg = [];
    if (layout !== 'scoreboard') {
      bg.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: t.bg });
      if (t.scene && !chosen.photo) {
        bg.push({ kind: 'svg', svg: t.scene() });
        // the scene keeps its left side dark for the words; where they sit right too, dim it all
        if (SCENE_DIM.indexOf(layout) >= 0) { bg.push({ kind: 'svg', svg: R(0, 0, W, H, t.bg, 0.55) }); }
      }
      if (chosen.photo) {
        bg.push({ kind: 'photo', url: chosen.photo, x: chosen.focusX == null ? 50 : chosen.focusX,
                  y: chosen.focus == null ? 50 : chosen.focus, zoom: chosen.zoom > 1 ? chosen.zoom : 1 });
        bg.push({ kind: 'shade', colour: t.bg, mode: layout === 'race-bib' || layout === 'ticket' ? 'all' : 'side' });
      }
      var pt = pattern(chosen.pattern, t.text);
      if (pt) { bg.push({ kind: 'svg', svg: pt }); }
    }
    var spot = LAYOUT[layout](items, add, t, f, o);
    if (t.sweep && ART_LAYOUTS.indexOf(layout) >= 0) { clearSweep(items, t); }
    // an event's logo in the top right, on a white disc; the words beside it narrowed to clear it
    if (t.badge && ART_LAYOUTS.indexOf(layout) >= 0) {
      var bd = BADGE_AT[layout], br = bd[2];
      items.forEach(function (i) {
        if (i.kind !== 'text' || !hitsCircle(textBox(i), bd[0], bd[1], br + 6)) { return; }
        var edge = bd[0] - br - 10;
        if (!i.align || i.align === 'left') { i.max = Math.max(60, Math.min(i.max, edge - i.x - (i.rotate ? 20 : 0))); }
        else if (i.align === 'center') { i.max = Math.max(60, Math.min(i.max, 2 * (edge - i.x))); }
      });
      items.push({ kind: 'badge', src: t.badge, x: bd[0] - br, y: bd[1] - br, w: 2 * br, h: 2 * br, drop: true });
    }
    // Teddy, with the words beside him narrowed to end before him
    if (t.mascot && TEDDY_AT[layout]) {
      var ta = TEDDY_AT[layout], tw = r1(ta[2] * TEDDY_RATIO), tb = { x: ta[0], y: ta[1], w: tw, h: ta[2] };
      items.forEach(function (i) {
        if (i.kind !== 'text') { return; }
        var b = textBox(i);
        if (b.x >= tb.x + tb.w || b.x + b.w <= tb.x - 8 || b.y >= tb.y + tb.h || b.y + b.h <= tb.y) { return; }
        if (!i.align || i.align === 'left') { i.max = Math.max(60, Math.min(i.max, tb.x - 10 - i.x - (i.rotate ? 24 : 0))); }
      });
      items.push({ kind: 'svg', svg: teddy(ta[0], ta[1], ta[2]), block: true, x: tb.x, y: tb.y, w: tb.w, h: tb.h });
    }
    var front = [], placed = null;
    if (o.sticker) {
      placed = placeSticker(items, spot.sticker);
      front.push({ kind: 'svg', svg: stickerArt(chosen.sticker, placed.x, placed.y, placed.k) });
      stickerWords(chosen.sticker, placed.x, placed.y, placed.k, o.feature, front);
    }
    return { w: W, h: H, scale: SCALE, theme: t, items: bg.concat(items, front),
             sticker: placed ? { x: placed.x, y: placed.y, r: STICKER_R * placed.k } : null };
  }

  return {
    W: W, H: H, SCALE: SCALE, GROUPS: GROUPS, THEMES: THEMES, LAYOUTS: LAYOUTS, PATTERNS: PATTERNS, STICKERS: STICKERS,
    STICKER_STYLES: STICKER_STYLES, stickerOf: stickerOf, stickerValue: stickerValue, textBox: textBox, hitsCircle: hitsCircle,
    FONTS: FONTS, FEATURES: FEATURES, featuresFor: featuresFor, stickersFor: stickersFor, HEADLINE_MAX: HEADLINE_MAX, ACCENT_MIN: ACCENT_MIN, MATARIKI: MATARIKI,
    theme: function (id) { return BY_ID[id] || null; }, find: find,
    easter: easter, showDay: showDay, occasion: occasion, season: season, suggestTheme: suggestTheme,
    STRIP_LAYOUTS: STRIP_LAYOUTS, fitTheme: fitTheme, TEDDY_AT: TEDDY_AT, teddyShows: teddyShows,
    suggest: suggest, resolve: resolve, toSave: toSave, contrast: contrast, onColour: onColour, accentReads: accentReads,
    wrap: wrap, build: build
  };
}));
