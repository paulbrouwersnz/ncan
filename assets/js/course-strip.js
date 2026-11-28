/*
  course-strip.js - the strip under a meeting recap's heading, and along the foot of
  its preview card: the meeting's track or course seen from above, as an SVG drawn
  to the size it's shown at. Four kinds (recap-data.js, courseKind):

    track          eight lanes, the straight running on past the bend (where the
                   100m starts), the bend's lane lines curving off it, a finish line
    cross-country  a winding course mown through the grass, its edges marked with
                   round pink markers set exactly on them, a finish between posts
    road           asphalt, edge lines, a dashed centre line, a finish line
    trail          a path with sharp turns through the trees, a finish between posts

  The colour (the venue's, for that kind of event, or the kind's default: set at
  /admin/track-colours/) is the track's surface, the mown course, the road or the
  path. Everything is worked out from the width and height, with a fixed seed, so
  a strip looks the same each time it's drawn at the same size.

  Plain functions, no page: the Node tests check the shapes
  (tests/js/course-strip.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANCourseStrip = api; }
}(this, function () {
  'use strict';

  var KINDS = ['track', 'cross-country', 'road', 'trail'];
  var INFIELD = '#2F6B3A', VERGE = '#5E6E5A', FOREST = '#3E5F36', TREE = '#24442A', LEAF = '#2E5A33',
      ROCK = '#7D8A80', MARKER = '#E8489A', POST = '#FFC629', LINE = '#FFFFFF';

  function r1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // a colour darker (f < 1) or lighter (f > 1), as #RRGGBB
  function shade(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      var v = Math.round(f < 1 ? c * f : c + (255 - c) * (f - 1));
      return ('0' + clamp(v, 0, 255).toString(16)).slice(-2);
    }).join('').toUpperCase();
  }

  // the same numbers every time
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rect(x, y, w, h, fill) {
    return '<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="' + fill + '"/>';
  }
  function circle(x, y, r, fill, stroke, sw) {
    return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '" fill="' + fill + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + r1(sw) + '"' : '') + '/>';
  }
  function points(list) { return list.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join(' '); }

  // a finish line: a chequered column from y0 to y1, `cw` wide, its left edge at x
  function chequer(x, y0, y1, cw) {
    var sq = cw / 2, out = rect(x, y0, cw, y1 - y0, LINE);
    for (var y = y0, row = 0; y < y1 - 0.01; y += sq, row++) {
      out += rect(x + (row % 2 ? sq : 0), y, sq, Math.min(sq, y1 - y), '#111111');
    }
    return out;
  }
  function finishX(w, h) { return w - Math.max(h * 0.9, w * 0.08); }

  /* The track ---------------------------------------------------------------- */
  function track(w, h, hex) {
    var y0 = Math.round(h * 0.12), y1 = h - Math.round(h * 0.06), lh = (y1 - y0) / 8;
    var bx = clamp(w * 0.2, h * 1.6, 300), r0 = h * 0.5, cy = y0 - r0, R = r0 + 8 * lh;
    var lw = Math.max(1, h / 90), out = rect(0, 0, w, h, INFIELD) + rect(0, y0, w, y1 - y0, hex);
    // the bend, curving away from the straight into the infield
    out += '<path d="M' + r1(bx) + ',' + r1(y0) + ' A' + r1(r0) + ',' + r1(r0) + ' 0 0,1 ' + r1(bx - r0) + ',' + r1(cy) +
      ' L' + r1(bx - R) + ',' + r1(cy) + ' A' + r1(R) + ',' + r1(R) + ' 0 0,0 ' + r1(bx) + ',' + r1(y1) + ' Z" fill="' + hex + '"/>';
    var lines = '';
    for (var k = 0; k <= 8; k++) {
      var r = r0 + k * lh, y = y0 + k * lh;
      lines += 'M' + r1(bx) + ',' + r1(y) + ' A' + r1(r) + ',' + r1(r) + ' 0 0,1 ' + r1(bx - r) + ',' + r1(cy) + ' ';
      lines += 'M0,' + r1(y) + ' H' + r1(w) + ' ';
    }
    out += '<path d="' + lines.trim() + '" fill="none" stroke="' + LINE + '" stroke-width="' + r1(lw) + '"/>';
    var fx = finishX(w, h), cw = Math.max(6, h / 12);
    out += chequer(fx, y0, y1, cw);
    if (lh >= 11) {                       // lane numbers, where there's room to read them
      for (var n = 1; n <= 8; n++) {
        out += '<text x="' + r1(fx + cw + lh * 0.9) + '" y="' + r1(y0 + (n - 0.5) * lh + lh * 0.32) + '" fill="' + LINE +
          '" font-family="Inter, Segoe UI, sans-serif" font-size="' + r1(lh * 0.8) + '" text-anchor="middle">' + n + '</text>';
      }
    }
    return out;
  }

  /* Cross country ------------------------------------------------------------ */

  // the course: its centre line, both edges (offset square to the line, so the
  // markers sit exactly on them), and where the markers and the finish go
  function xcCourse(w, h) {
    var a1 = h * 0.22, a2 = h * 0.06, p1 = Math.max(h * 4.2, 320), p2 = p1 * 0.43, hw = h * 0.15;
    var y = function (x) { return h * 0.55 + a1 * Math.sin(2 * Math.PI * x / p1 + 0.8) + a2 * Math.sin(2 * Math.PI * x / p2 + 2.1); };
    var dy = function (x) {
      return a1 * 2 * Math.PI / p1 * Math.cos(2 * Math.PI * x / p1 + 0.8) + a2 * 2 * Math.PI / p2 * Math.cos(2 * Math.PI * x / p2 + 2.1);
    };
    // the finish where the course runs flattest, near the right
    var fx = finishX(w, h), best = Infinity;
    for (var x = w * 0.8; x <= w * 0.94; x += 1) {
      if (Math.abs(dy(x)) < best) { best = Math.abs(dy(x)); fx = x; }
    }
    var centre = [], upper = [], lower = [], step = 2;
    for (x = -h; x <= w + h; x += step) {
      var c = [x, y(x)], d = dy(x), len = Math.sqrt(1 + d * d);
      centre.push(c);
      upper.push([x + d * hw / len, c[1] - hw / len]);
      lower.push([x - d * hw / len, c[1] + hw / len]);
    }
    // markers along both edges, evenly by distance along the course, up to the finish
    var gap = Math.max(h * 0.55, 26), markers = [], run = gap / 2;
    for (var i = 1; i < centre.length; i++) {
      run += Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]);
      if (run >= gap) {
        run -= gap;
        if (centre[i][0] > -h * 0.1 && centre[i][0] < fx - gap * 0.6) { markers.push(upper[i], lower[i]); }
      }
    }
    return { centre: centre, upper: upper, lower: lower, markers: markers, half: hw, finish: fx, y: y };
  }

  function crossCountry(w, h, hex) {
    var out = rect(0, 0, w, h, shade(hex, 0.74));
    var band = h * 0.33, every = h * 0.83, lean = h * 0.5, mown = shade(hex, 0.82);
    for (var x = -h; x < w + h; x += every) {           // the mower's stripes
      out += '<polygon points="' + points([[x, 0], [x + band, 0], [x + band - lean, h], [x - lean, h]]) + '" fill="' + mown + '"/>';
    }
    var c = xcCourse(w, h);
    out += '<polygon points="' + points(c.upper.concat(c.lower.slice().reverse())) + '" fill="' + hex + '"/>';
    var mr = Math.max(2.2, h * 0.038), sw = Math.max(0.8, mr * 0.33);
    c.markers.forEach(function (m) { out += circle(m[0], m[1], mr, MARKER, LINE, sw); });
    var fy = c.y(c.finish), cw = Math.max(6, h / 12), pw = Math.max(2, cw * 0.4);
    out += chequer(c.finish, fy - c.half, fy + c.half, cw);
    out += rect(c.finish - pw, fy - c.half - h * 0.07, pw, c.half * 2 + h * 0.14, POST);
    out += rect(c.finish + cw, fy - c.half - h * 0.07, pw, c.half * 2 + h * 0.14, POST);
    return out;
  }

  /* Road --------------------------------------------------------------------- */
  function road(w, h, hex) {
    var top = h * 0.2, bottom = h * 0.8, inset = h * 0.06, lw = Math.max(1, h / 60);
    var fx = finishX(w, h), cw = Math.max(6, h / 12);
    var out = rect(0, 0, w, h, VERGE) + rect(0, top, w, bottom - top, hex);
    out += rect(0, top + inset, w, lw, LINE) + rect(0, bottom - inset - lw, w, lw, LINE);
    var dash = h * 0.18, gap = h * 0.13, dw = Math.max(1.2, h / 48), mid = (top + bottom) / 2;
    for (var x = 0; x + dash < fx - gap; x += dash + gap) { out += rect(x, mid - dw / 2, dash, dw, LINE); }
    out += chequer(fx, top + inset, bottom - inset, cw);
    return out;
  }

  /* Trail -------------------------------------------------------------------- */

  // the path's corners: sharp turns up and down the hill, level into the finish
  function trailPath(w, h) {
    var rand = seeded(7), fx = finishX(w, h), pts = [[-h * 0.2, h * 0.7]], x = pts[0][0], y = pts[0][1];
    while (x < fx - h * 0.6) {
      x += h * (0.5 + rand() * 0.45);
      var ny;
      do { ny = h * (0.22 + rand() * 0.58); } while (Math.abs(ny - y) < h * 0.25);
      y = ny;
      pts.push([x, y]);
    }
    pts.push([fx - h * 0.25, h * 0.5], [w + h * 0.2, h * 0.5]);
    return { points: pts, finish: fx, width: h * 0.13 };
  }

  function distanceToPath(p, pts) {
    var best = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
      var t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return best;
  }

  function trail(w, h, hex) {
    var t = trailPath(w, h), rand = seeded(11), out = rect(0, 0, w, h, FOREST);
    out += '<polyline points="' + points(t.points) + '" fill="none" stroke="' + hex + '" stroke-width="' + r1(t.width) +
      '" stroke-linejoin="miter" stroke-miterlimit="4"/>';
    var trees = '', rocks = '', gap = h * 0.42;
    for (var gx = 0; gx < w; gx += gap) {
      for (var gy = h * 0.1; gy < h; gy += gap) {
        var r = h * (0.1 + rand() * 0.07), p = [gx + rand() * gap, gy + rand() * gap * 0.8];
        var room = distanceToPath(p, t.points) - t.width / 2;
        if (rand() < 0.55 && room > r + 2 && Math.abs(p[0] - t.finish) > h * 0.35) {
          trees += circle(p[0], p[1], r, TREE) + circle(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.45, LEAF);
        } else if (rand() < 0.05 && room > 1 && room < h * 0.1) {
          rocks += '<ellipse cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" rx="' + r1(h * 0.04) + '" ry="' + r1(h * 0.025) + '" fill="' + ROCK + '"/>';
        }
      }
    }
    var fy = h * 0.5, half = t.width / 2, cw = Math.max(6, h / 12), pw = Math.max(2, cw * 0.4);
    out += rocks + trees + chequer(t.finish, fy - half, fy + half, cw);
    out += rect(t.finish - pw, fy - half - h * 0.08, pw, t.width + h * 0.16, POST);
    out += rect(t.finish + cw, fy - half - h * 0.08, pw, t.width + h * 0.16, POST);
    return out;
  }

  var DRAW = { track: track, 'cross-country': crossCountry, road: road, trail: trail };

  /* The strip as an SVG document, `w` x `h` (opts.scale: drawn that many times larger,
     for a sharp picture on a card). */
  function svg(kind, hex, w, h, opts) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var s = (opts && opts.scale) || 1;
    hex = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.toUpperCase() : '#0072B5';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * s + '" height="' + h * s + '" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + (DRAW[kind] || track)(w, h, hex) + '</svg>';
  }

  return { KINDS: KINDS, svg: svg, shade: shade, xcCourse: xcCourse, trailPath: trailPath, MARKER: MARKER };
}));
