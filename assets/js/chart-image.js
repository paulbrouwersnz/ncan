/*
  An athlete chart as a PNG image: the Download button in the enlarged chart
  (assets/js/athlete.js). Made in the browser from the chart's SVG, so there's
  no API call and the image never leaves the device; the Share plan's public
  links will reuse it.

  The image explains itself: a title strip (athlete, event, dates shown), the
  chart as shown (date range, Timeline or By season, hidden months, the
  selected result, a lit key entry), the key for the marks it has, and a footer
  with the club's share image (the crest and name) and "ncan.nz". It's a
  photo-friendly shape the viewer picks beside Download: Auto (landscape 3:2
  on wide screens, portrait 4:5 on phones), Landscape, Portrait or Square 1:1,
  remembered on the device. The chart is drawn again at the size that shape
  leaves for it, so nothing is stretched, and the image is made at twice the
  size so it's sharp on phones.

  The SVG is styled by the site's stylesheet, which a picture can't see, so each
  element's computed style is copied onto a copy of it first. Phones that can
  share files open the share sheet (Photos, Messages); everything else saves
  the file, named like sam-brown-60m.png.

  The maths (file names, the dates line, key rows, reading CSS shadows) is kept
  apart so the Node tests can check it (tests/js/chart-image.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANChartImage = api; }
}(this, function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // "Sam Brown", "60m" -> "sam-brown-60m.png"; accents dropped, anything else a dash
  function slug(s) {
    s = String(s || '');
    if (s.normalize) { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function fileName(athlete, event) {
    var name = [slug(athlete), slug(event)].filter(Boolean).join('-');
    return (name || 'chart') + '.png';
  }

  // '2026-03-09' -> '9 Mar 2026'
  function day(iso) {
    return (+iso.slice(8, 10)) + ' ' + MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
  }
  // the dates of the first and last result shown: one date, a range, or nothing
  function dateRange(first, last) {
    if (!first) { return ''; }
    if (!last || last === first) { return day(first); }
    if (first > last) { var t = first; first = last; last = t; }
    return day(first) + ' – ' + day(last);
  }
  // the line under the athlete's name: event, the range picked (not "All results"), the dates
  function subtitle(event, rangeName, first, last) {
    var parts = [event];
    if (rangeName && rangeName !== 'All results') { parts.push(rangeName); }
    var d = dateRange(first, last);
    if (d) { parts.push(d); }
    return parts.filter(Boolean).join(' · ');
  }

  /* Sharing (POST /v1/athletes/<address>/shares). The name on a shared image, as the API
     words it in the share page's title: 'full' ("Sam Brown") or 'first' ("Sam"). */
  function shownName(name, style) {
    var parts = String(name || '').split(/\s+/).filter(Boolean);
    if (!parts.length) { return ''; }
    return style === 'full' ? parts.join(' ') : parts[0];
  }
  // the share's details as the query the API takes; confirm=1 is the consent tick
  function shareQuery(f) {
    // kind (a card's: 'pb', 'newpb', 'sb' or 'result') and source (its official result's link) only when given
    return ['event', 'from', 'to', 'view', 'name', 'kind', 'source'].filter(function (k) {
      return (k !== 'kind' && k !== 'source') || f[k];
    }).map(function (k) {
      return k + '=' + encodeURIComponent(f[k] || '');
    }).join('&') + '&confirm=1';
  }
  var SHARE_MAX = 8 * 1024 * 1024;   // the API's limit on a shared image (8 MB)
  // a size in MB, for the warning when an image is over the limit: "5.2 MB"
  function mb(bytes) { return (Math.ceil(bytes / 104857.6) / 10).toFixed(1).replace(/\.0$/, '') + ' MB'; }

  // key entries of these widths, laid out in rows no wider than max
  function keyRows(widths, max, gap) {
    gap = gap == null ? 20 : gap;
    var rows = [], row = [], x = 0;
    widths.forEach(function (w, i) {
      if (row.length && x + w > max) { rows.push(row); row = []; x = 0; }
      row.push({ i: i, x: x });
      x += w + gap;
    });
    if (row.length) { rows.push(row); }
    return rows;
  }

  // the image's shape: portrait on phones and tall windows, landscape otherwise
  function shapeFor(width, height) {
    return width <= 760 || height > width ? 'portrait' : 'landscape';
  }
  var SIZES = { landscape: { w: 1080, h: 720 }, portrait: { w: 720, h: 900 }, square: { w: 900, h: 900 } };
  // the viewer's choice ('auto', or one of SIZES) as the shape to make
  function pick(choice, width, height) {
    return SIZES.hasOwnProperty(choice) ? choice : shapeFor(width, height);
  }
  var PAD = 28, TITLE = 76, KEY_ROW = 26, FOOT = 72;
  // where everything goes in an image of this shape with this many key rows
  function layout(shape, keyRows) {
    var size = SIZES[shape] || SIZES.landscape;
    var key = keyRows ? keyRows * KEY_ROW + 14 : 0;
    var chartH = size.h - TITLE - 12 - key - FOOT;
    return { w: size.w, h: size.h, pad: PAD, chartX: PAD, chartY: TITLE, chartW: size.w - PAD * 2,
             chartH: chartH, keyY: TITLE + chartH + 12 + 13, footY: size.h - FOOT };
  }

  // the club's lockup in share.png (1200 x 630, white around it): the part with the crest and name
  var SHARE = { src: '/assets/img/share.png', x: 88, y: 198, w: 1024, h: 234 };

  // a computed box-shadow ("rgb(1, 2, 3) 0px 0px 0px 3px"): the first one's colour and spread
  function shadow(css) {
    if (!css || css === 'none') { return null; }
    var first = css.split(/,(?![^(]*\))/)[0].trim();
    var px = (first.match(/-?[\d.]+px(?![\w(])/g) || []).map(parseFloat);
    // what's left once the lengths are taken out is the colour, before or after them
    var colour = first.replace(/(^|\s)-?[\d.]+px(?=\s|$)/g, ' ').replace(/\binset\b/, '').trim();
    var spread = px.length >= 4 ? px[3] : 0;
    if (!colour || colour === 'none' || spread <= 0) { return null; }
    return { colour: colour, spread: spread };
  }

  // the SVG style properties copied onto the picture's copy of the chart
  var PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
               'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
               'font-variant-numeric', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'display',
               'visibility'];

  /* ---------- in the browser only ---------- */

  function copyStyles(from, to) {
    var cs = window.getComputedStyle(from);
    var style = PROPS.map(function (p) { return p + ':' + cs.getPropertyValue(p); }).join(';');
    to.setAttribute('style', style);
    to.removeAttribute('class');
    for (var i = 0; i < from.children.length; i++) {
      if (to.children[i]) { copyStyles(from.children[i], to.children[i]); }
    }
  }

  // the chart's SVG as a picture, its own size
  function svgImage(svgEl) {
    var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    var w = vb && vb.width ? vb.width : svgEl.clientWidth, h = vb && vb.height ? vb.height : svgEl.clientHeight;
    var copy = svgEl.cloneNode(true);
    copyStyles(svgEl, copy);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', w);
    copy.setAttribute('height', h);
    copy.style.overflow = 'visible';
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok({ img: img, w: w, h: h }); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('The chart could not be drawn.')); };
      img.src = url;
    });
  }

  // a key entry's mark, drawn like its CSS swatch: dot, ring, diamond, dashed edge or season line
  function drawSwatch(c, el, x, y) {
    var cs = window.getComputedStyle(el);
    var w = parseFloat(cs.width) || 12, h = parseFloat(cs.height) || 12;
    var cx = x + 8, cy = y;
    c.save();
    if (h < w / 2) {   // a season's line in the By season key
      c.fillStyle = cs.backgroundColor;
      c.fillRect(x, cy - h / 2, w, h);
      c.restore();
      return 16;
    }
    var r = Math.min(w, h) / 2;
    var diamond = cs.transform && cs.transform !== 'none';
    var round = parseFloat(cs.borderTopLeftRadius) >= r;
    var path = function (rad) {
      c.beginPath();
      if (diamond) { c.moveTo(cx, cy - rad * 1.3); c.lineTo(cx + rad * 1.3, cy); c.lineTo(cx, cy + rad * 1.3); c.lineTo(cx - rad * 1.3, cy); c.closePath(); }
      else if (round) { c.arc(cx, cy, rad, 0, Math.PI * 2); }
      else { c.rect(cx - rad, cy - rad, rad * 2, rad * 2); }
    };
    var sh = shadow(cs.boxShadow);
    if (sh) { c.fillStyle = sh.colour; path(r + sh.spread); c.fill(); }
    var bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw) { c.fillStyle = cs.borderTopColor; path(r); c.fill(); }
    c.fillStyle = cs.backgroundColor;
    path(r - bw); c.fill();
    if (cs.outlineStyle === 'dashed') {
      c.setLineDash([3, 2.5]); c.lineWidth = parseFloat(cs.outlineWidth) || 2; c.strokeStyle = cs.outlineColor;
      path(r + (parseFloat(cs.outlineOffset) || 0) + c.lineWidth / 2); c.stroke();
    }
    c.restore();
    return 16;
  }

  function loadImage(src) {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };   // no logo is better than no image
      img.src = src;
    });
  }

  /* The footer's club lockup. On a light background it's the share image itself (its
     white surround matches); on a dark one the white would show as a box, so it's the
     dark crest with the club's name beside it, set like the share image. */
  function drawLockup(c, logo, x, y, h, dark, col, font) {
    if (!logo) { return; }
    if (!dark) {
      c.drawImage(logo, SHARE.x, SHARE.y, SHARE.w, SHARE.h, x, y, h * SHARE.w / SHARE.h, h);
      return;
    }
    var cw = h * 888 / 508;   // logo-dark.svg's shape
    c.drawImage(logo, x, y, cw, h);
    c.fillStyle = col.heading; c.font = '700 ' + Math.round(h * 0.36) + 'px ' + font.display;
    c.textBaseline = 'alphabetic';
    c.fillText('North Canterbury', x + cw + 12, y + h * 0.46);
    c.fillText('Athletic Club', x + cw + 12, y + h * 0.9);
  }

  /* opts: shape ('landscape', 'portrait' or 'square'); draw(w, h), which puts the chart's SVG at
     that size on the page (so it's styled) and returns it; done(), called after;
     title, the athlete; subtitle; key, a list of { swatch: element, words: text };
     colours { bg, heading, text, soft }; dark; fonts { display, sans }; scale (default 2:
     pixels per point, so it's sharp on phones).
     Resolves with a canvas. */
  function render(opts) {
    var S = opts.scale || 2, col = opts.colours, font = opts.fonts;
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = '14px ' + font.sans;
    var widths = (opts.key || []).map(function (k) { return 24 + measure.measureText(k.words).width; });
    var rows = keyRows(widths, layout(opts.shape, 0).chartW, 22);
    var L = layout(opts.shape, rows.length);
    var svgEl;
    try { svgEl = opts.draw(L.chartW, L.chartH); } catch (e) { if (opts.done) { opts.done(); } return Promise.reject(e); }
    var finish = function () { if (opts.done) { opts.done(); } };
    return Promise.all([svgImage(svgEl), loadImage(opts.dark ? '/assets/img/logo-dark.svg' : SHARE.src)])
      .then(function (got) {
        finish();
        var s = got[0], logo = got[1];
        var canvas = document.createElement('canvas');
        canvas.width = L.w * S; canvas.height = L.h * S;
        var c = canvas.getContext('2d');
        c.scale(S, S);
        c.fillStyle = col.bg; c.fillRect(0, 0, L.w, L.h);
        c.textBaseline = 'alphabetic';
        c.fillStyle = col.heading; c.font = '700 24px ' + font.display;
        c.fillText(opts.title || '', L.pad, L.pad + 20);
        c.fillStyle = col.text; c.font = '15px ' + font.sans;
        c.fillText(opts.subtitle || '', L.pad, L.pad + 44);
        // the chart was drawn at the size it gets, so it fits as it is
        var scale = Math.min(1, L.chartW / s.w, L.chartH / s.h);
        c.drawImage(s.img, L.chartX + (L.chartW - s.w * scale) / 2, L.chartY, s.w * scale, s.h * scale);
        var y = L.keyY;
        c.font = '14px ' + font.sans; c.textBaseline = 'middle';
        rows.forEach(function (row) {
          row.forEach(function (it) {
            var k = opts.key[it.i], x = L.pad + it.x;
            drawSwatch(c, k.swatch, x, y);
            c.fillStyle = col.text;
            c.fillText(k.words, x + 24, y + 1);
          });
          y += KEY_ROW;
        });
        // the footer: a hairline, the club's lockup, ncan.nz
        c.strokeStyle = col.soft; c.globalAlpha = 0.35; c.lineWidth = 1;
        c.beginPath(); c.moveTo(L.pad, L.footY + 0.5); c.lineTo(L.w - L.pad, L.footY + 0.5); c.stroke();
        c.globalAlpha = 1;
        drawLockup(c, logo, L.pad, L.footY + 14, 44, opts.dark, col, font);
        c.textBaseline = 'middle';
        c.fillStyle = col.soft; c.font = '600 14px ' + font.sans;
        c.textAlign = 'right';
        c.fillText('ncan.nz', L.w - L.pad, L.footY + 36);
        return canvas;
      }, function (e) { finish(); throw e; });
  }

  // the image saved: the share sheet on phones that can share files, else a download.
  // Resolves 'shared', 'saved' or 'cancelled'.
  function save(canvas, name) {
    return new Promise(function (ok, fail) {
      canvas.toBlob(function (blob) {
        if (!blob) { fail(new Error('The image could not be made.')); return; }
        var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
        var phone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (phone && file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name.replace(/\.png$/, '') })
            .then(function () { ok('shared'); })
            .catch(function (e) { if (e && e.name === 'AbortError') { ok('cancelled'); } else { download(blob); } });
          return;
        }
        download(blob);
        function download(b) {
          var url = URL.createObjectURL(b);
          var a = document.createElement('a');
          a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          ok('saved');
        }
      }, 'image/png');
    });
  }

  return { slug: slug, fileName: fileName, day: day, dateRange: dateRange, subtitle: subtitle,
           keyRows: keyRows, shadow: shadow, shapeFor: shapeFor, pick: pick, layout: layout, SIZES: SIZES,
           PROPS: PROPS, render: render, save: save,
           shownName: shownName, shareQuery: shareQuery, SHARE_MAX: SHARE_MAX, mb: mb };
}));
