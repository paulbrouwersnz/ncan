/*
  PB share cards (Plan: PB share cards, extending Plan: Sharing athlete charts publicly).

  When an athlete sets a personal best, anyone who can see their page can make a
  club-branded image of it from the athlete page (assets/js/athlete.js): the event,
  the new mark, the improvement, the meeting and date, in the club's green and gold.
  It's made here in the browser from the page's own data, so nothing private leaves
  the device until the family chooses: the phone's share sheet or a download, or -
  for the athlete's GameDay contacts and admins - a public link through the same
  share API as charts (POST /v1/athletes/<address>/shares, view=pb-card).

  The first design is the Podium card: square (1080 x 1080, for Instagram and
  Facebook) or a 9:16 story (1080 x 1920). The card is laid out as a list of plain
  shapes and words (layout()), which the Node tests check without a browser
  (tests/js/pb-card.test.js), then drawn onto a canvas with the site's own fonts.
  (A picture made from SVG can't use the page's fonts, so it's drawn directly.)

  Privacy: no date of birth, no link to the private page; for children (a result
  with a grade, ages 7-14) the surname is off unless the sharer turns it on; the
  place only shows when it's 1st, 2nd or 3rd.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANPbCard = api; }
}(this, function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SIZES = { square: { w: 540, h: 540 }, story: { w: 540, h: 960 } };   // drawn at 2x
  var COLOURS = { bg: '#0B3B2E', bg2: '#0F4C39', gold: '#FFC629', goldSoft: '#FFD75E',
                  text: '#FFFFFF', soft: '#B8D4C8', ink: '#062A20' };
  var MINUS = '−';

  function day(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) { return ''; }
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }

  function ordinal(n) {
    if (10 <= n % 100 && n % 100 <= 20) { return n + 'th'; }
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  }
  // only a podium place is worth a card: a card never says "6th of 8"
  function placeWord(place) { return place >= 1 && place <= 3 ? ordinal(place) : ''; }

  /* How much better than the PB before it: "−0.32s" for a time, "+18cm" or "+1.05m" for
     a distance or height. '' when there was no earlier PB (a first mark isn't a PB). */
  function improvement(r, prev) {
    if (!r || !prev || typeof r.value !== 'number' || typeof prev.value !== 'number') { return ''; }
    if (r.field) {
      var m = r.value - prev.value;
      if (!(m > 0)) { return ''; }
      var cm = Math.round(m * 100);
      return cm < 100 ? '+' + cm + 'cm' : '+' + m.toFixed(2) + 'm';
    }
    var s = prev.value - r.value;
    if (!(s > 0)) { return ''; }
    return MINUS + (s < 10 ? s.toFixed(2) : s.toFixed(1)) + 's';
  }

  // the name on the card: "Sam" or, with the surname on, "Sam Brown"
  function cardName(name, surname) {
    var parts = String(name || '').split(/\s+/).filter(Boolean);
    if (!parts.length) { return ''; }
    return surname ? parts.join(' ') : parts[0];
  }
  // children (a result recorded with a grade) default to first name only
  function surnameByDefault(r) { return !(r && r.grade); }

  // "3rd PB this season" (only from the second one on)
  function seasonWords(n) { return n >= 2 ? ordinal(n) + ' PB this season' : ''; }

  /* Everything the card says, from the result and the PB before it.
     a: { name, surname (bool), result, prev, mark (as the page writes it), event (with any
     weight), group ("Grade 10"), pbsThisSeason (count up to and including this one) } */
  /* What kind of card: 'newpb' (better than the PB before it), 'pb' (the PB), 'sb' (the
     season's best) or 'result' (anything else). Left out, a card is a PB card. */
  function kindOf(a) {
    var k = a.kind || (a.prev ? 'newpb' : 'pb');
    return k === 'newpb' && !a.prev ? 'pb' : k;
  }
  function headlineFor(kind, place) {
    if (kind === 'newpb') { return 'NEW PERSONAL BEST'; }
    if (kind === 'pb') { return 'PERSONAL BEST'; }
    if (kind === 'sb') { return 'SEASON BEST'; }
    return place ? place.toUpperCase() + ' PLACE' : 'RESULT';
  }
  function facts(a) {
    var r = a.result || {}, kind = kindOf(a), place = r.relay ? '' : placeWord(r.place);
    var newpb = kind === 'newpb';
    return {
      kind: kind,
      headline: headlineFor(kind, place),
      name: cardName(a.name, a.surname),
      event: a.event || r.event || '',
      mark: a.mark || r.mark || '',
      wind: !r.field && typeof r.wind === 'number' ? (r.wind > 0 ? '+' : '') + r.wind.toFixed(1) + ' m/s' : '',
      better: newpb ? improvement(r, a.prev) : '',
      was: newpb ? (a.prevMark || a.prev.mark || '') : '',
      meeting: r.meeting || '',
      date: day(r.date),
      iso: r.date || '',
      // a podium place already in the headline isn't said twice
      place: kind === 'result' ? '' : place,
      group: a.group || '',
      season: newpb ? seasonWords(a.pbsThisSeason || 0) : ''
    };
  }

  // "New PB for Sam! 100m in 14.10 at Interclub 5 👏 #NCANathletics"
  function caption(f) {
    var who = f.name || 'our athlete', at = (f.meeting ? ' at ' + f.meeting : '') + ' 👏 #NCANathletics';
    if (f.kind === 'sb') { return 'Season best for ' + who + '! ' + f.event + ' in ' + f.mark + at; }
    if (f.kind === 'result') {
      var m = /^(\S+) PLACE$/.exec(f.headline || '');
      return (m ? m[1].charAt(0) + m[1].slice(1).toLowerCase() + ' place for ' + who + '! ' + f.event + ' in ' + f.mark
                : who + ': ' + f.event + ' in ' + f.mark) + at;
    }
    return 'New PB for ' + who + '! ' + f.event + ' in ' + f.mark + at;
  }

  // "sam-100m-pb.png"
  function fileName(f) {
    var s = function (t) {
      return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    };
    var end = { sb: 'season-best', result: 'result' }[f.kind] || 'pb';
    return [s(f.name), s(f.event), end].filter(Boolean).join('-') + '.png';
  }

  /* The Podium card as shapes and words, in points (the canvas is drawn at 2x):
     { w, h, items: [{ kind: 'rect'|'text'|'logo', ... }] }. Text items have x, y (baseline),
     size, weight, font ('display' or 'sans'), colour, align, max (the widest it may be). */
  function layout(f, shape, style) {
    if (style === 'photo') { return photoLayout(f, shape); }
    var S = SIZES[shape] || SIZES.square, W = S.w, H = S.h, pad = 40, story = shape === 'story';
    var items = [];
    var t = function (words, x, y, size, o) {
      if (!words) { return; }
      o = o || {};
      items.push({ kind: 'text', words: words, x: x, y: y, size: size, weight: o.weight || 400,
                   font: o.font || 'sans', colour: o.colour || COLOURS.text, align: o.align || 'left',
                   max: o.max || W - 2 * pad, spacing: o.spacing || 0 });
    };
    items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: COLOURS.bg });
    // where things go: [square, story]
    var P = story
      ? { head: 84, headSize: 22, name: 140, nameSize: 44, group: 174, band: [260, 340], event: 330, eventSize: 32,
          mark: 470, markSize: 130, rib: [500, 230, 54, 28], lines: 664, step: 36, sizes: [20, 22, 24, 20, 20] }
      : { head: 70, headSize: 18, name: 106, nameSize: 32, group: 130, band: [148, 172], event: 182, eventSize: 24,
          mark: 264, markSize: 86, rib: [278, 180, 36, 20], lines: 348, step: 22, sizes: [15, 16, 17, 15, 15] };
    items.push({ kind: 'rect', x: 0, y: P.band[0], w: W, h: P.band[1], colour: COLOURS.bg2 });
    t(f.headline || 'PERSONAL BEST', pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2 });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display' });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.soft });

    t(f.event, W / 2, P.event, P.eventSize, { weight: 700, font: 'display', align: 'center' });
    t(f.mark, W / 2, P.mark, P.markSize, { weight: 800, font: 'display', colour: COLOURS.gold, align: 'center' });
    // the ribbon: "PB −0.32s", dark on gold
    if (f.better) {
      var ry = P.rib[0], rw = P.rib[1], rh = P.rib[2];
      items.push({ kind: 'rect', x: (W - rw) / 2, y: ry, w: rw, h: rh, colour: COLOURS.gold, round: rh / 2 });
      t('PB ' + f.better, W / 2, ry + rh * 0.7, P.rib[3], { weight: 800, font: 'display', colour: COLOURS.ink, align: 'center' });
    }

    var y = P.lines, n = 0;
    var line = function (words, o) {
      var size = P.sizes[n++];
      if (words) { t(words, W / 2, y, size, o); y += P.step; }
    };
    line(f.was ? 'Previous best ' + f.was : '', { colour: COLOURS.soft, align: 'center' });
    line([f.place, f.wind].filter(Boolean).join(' · '), { weight: 600, align: 'center' });
    line(f.meeting, { weight: 600, align: 'center' });
    line(f.date, { colour: COLOURS.soft, align: 'center' });
    line(f.season, { colour: COLOURS.goldSoft, weight: 600, align: 'center' });

    // the club's crest and name, and ncan.nz
    var lh = story ? 60 : 46;
    items.push({ kind: 'logo', x: pad, y: H - pad - lh, h: lh, w: lh * 888 / 508 });
    t('North Canterbury', pad + lh * 888 / 508 + 10, H - pad - lh * 0.52, 14, { weight: 700, font: 'display' });
    t('Athletic Club', pad + lh * 888 / 508 + 10, H - pad - lh * 0.12, 14, { weight: 700, font: 'display' });
    t('ncan.nz', W - pad, H - pad - lh * 0.3, 15, { weight: 600, colour: COLOURS.soft, align: 'right', max: 120 });
    return { w: W, h: H, items: items };
  }

  /* The Photo hero card: the photo fills the card (cropped to cover it, keeping the focus
     point in view), a dark wash at the top for the headline and name and a deeper one at
     the bottom for the event, mark and meeting. Text is white and gold, as on Podium. */
  function photoLayout(f, shape) {
    var S = SIZES[shape] || SIZES.square, W = S.w, H = S.h, pad = 40, story = shape === 'story';
    var items = [];
    var t = function (words, x, y, size, o) {
      if (!words) { return; }
      o = o || {};
      items.push({ kind: 'text', words: words, x: x, y: y, size: size, weight: o.weight || 400,
                   font: o.font || 'sans', colour: o.colour || COLOURS.text, align: o.align || 'left',
                   max: o.max || W - 2 * pad, spacing: o.spacing || 0, shadow: true });
    };
    items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: COLOURS.bg });
    items.push({ kind: 'photo', x: 0, y: 0, w: W, h: H });
    var P = story
      ? { top: 260, bottom: 560, head: 84, headSize: 22, name: 140, nameSize: 44, group: 174,
          event: 500, eventSize: 30, mark: 620, markSize: 120, rib: 648, ribH: 50, ribSize: 26, lines: 748, step: 34, size: 22 }
      : { top: 170, bottom: 330, head: 66, headSize: 18, name: 102, nameSize: 32, group: 126,
          event: 300, eventSize: 22, mark: 376, markSize: 80, rib: 0, ribH: 0, ribSize: 18, lines: 410, step: 22, size: 15 };
    items.push({ kind: 'shade', x: 0, y: 0, w: W, h: P.top, from: 0.7, to: 0 });
    items.push({ kind: 'shade', x: 0, y: H - P.bottom, w: W, h: P.bottom, from: 0, to: 0.88 });
    t(f.headline || 'PERSONAL BEST', pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2 });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display' });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.text });

    t(f.event, pad, P.event, P.eventSize, { weight: 700, font: 'display' });
    t(f.mark, pad, P.mark, P.markSize, { weight: 800, font: 'display', colour: COLOURS.gold, max: W - 2 * pad - (story ? 0 : 130) });
    if (f.better) {
      // the ribbon: under the mark on a story, beside it on a square
      var rw = story ? 230 : 120, rh = story ? P.ribH : 32;
      var rx = story ? pad : W - pad - rw, ry = story ? P.rib : P.mark - rh + 4;
      items.push({ kind: 'rect', x: rx, y: ry, w: rw, h: rh, colour: COLOURS.gold, round: rh / 2 });
      t('PB ' + f.better, rx + rw / 2, ry + rh * 0.7, P.ribSize, { weight: 800, font: 'display', colour: COLOURS.ink, align: 'center', max: rw - 16 });
    }
    var y = story ? P.lines + (f.better ? 0 : -60) : P.lines;
    var line = function (words, o) { if (words) { t(words, pad, y, P.size, o); y += P.step; } };
    line([f.place, f.wind, f.was ? 'previous best ' + f.was : ''].filter(Boolean).join(' · '), { weight: 600 });
    line([f.meeting, f.date].filter(Boolean).join(' · '), { weight: 600 });
    if (story) { line(f.season, { colour: COLOURS.goldSoft, weight: 600 }); }

    var lh = story ? 60 : 40;
    items.push({ kind: 'logo', x: pad, y: H - pad - lh + (story ? 0 : 12), h: lh, w: lh * 888 / 508 });
    t('ncan.nz', W - pad, H - pad - lh * 0.3 + (story ? 0 : 12), 15, { weight: 600, align: 'right', max: 120 });
    return { w: W, h: H, items: items, photo: true };
  }

  /* Where a photo goes to cover a w x h box, keeping the focus point ("30% 40%") in
     view: the source rectangle to draw from. */
  function cover(iw, ih, w, h, focus) {
    var m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(focus || '') || [0, 50, 50];
    var fx = Math.min(100, Math.max(0, +m[1])) / 100, fy = Math.min(100, Math.max(0, +m[2])) / 100;
    var scale = Math.max(w / iw, h / ih), sw = w / scale, sh = h / scale;
    return { sx: (iw - sw) * fx, sy: (ih - sh) * fy, sw: sw, sh: sh };
  }

  // anything that would overlap: text boxes (roughly) that cross, for the tests
  function overlaps(L, measure) {
    var boxes = L.items.filter(function (i) { return i.kind === 'text'; }).map(function (i) {
      var w = Math.min(i.max, measure ? measure(i) : i.words.length * i.size * 0.55);
      var x = i.align === 'center' ? i.x - w / 2 : i.align === 'right' ? i.x - w : i.x;
      return { words: i.words, x: x, y: i.y - i.size * 0.8, w: w, h: i.size };
    });
    var out = [];
    for (var a = 0; a < boxes.length; a++) {
      for (var b = a + 1; b < boxes.length; b++) {
        var p = boxes[a], q = boxes[b];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) { out.push([p.words, q.words]); }
      }
    }
    return out;
  }

  /* Browser only: the card as a canvas. fonts { display, sans } are CSS font-family
     lists; waits for them so the first card isn't drawn in a fallback font. */
  function render(f, shape, fonts, opts) {
    opts = opts || {};
    var style = opts.style === 'photo' && opts.photo ? 'photo' : 'podium';
    var L = layout(f, shape, style), scale = 2;
    var family = function (i) { return i.font === 'display' ? fonts.display : fonts.sans; };
    var css = function (i, size) { return i.weight + ' ' + size + 'px ' + family(i); };
    var wait = document.fonts && document.fonts.load ? Promise.all(L.items.filter(function (i) { return i.kind === 'text'; })
      .map(function (i) { return document.fonts.load(css(i, i.size), i.words).catch(function () {}); })) : Promise.resolve();
    var logo = new Promise(function (ok) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = '/assets/img/logo-dark.svg';
    });
    var photo = style !== 'photo' ? Promise.resolve(null) : new Promise(function (ok) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = opts.photo;
    });
    return Promise.all([wait, logo, photo]).then(function (got) {
      var canvas = document.createElement('canvas');
      canvas.width = L.w * scale; canvas.height = L.h * scale;
      var c = canvas.getContext('2d');
      c.scale(scale, scale);
      c.textBaseline = 'alphabetic';
      L.items.forEach(function (i) {
        if (i.kind === 'rect') {
          c.fillStyle = i.colour;
          if (i.round && c.roundRect) { c.beginPath(); c.roundRect(i.x, i.y, i.w, i.h, i.round); c.fill(); }
          else { c.fillRect(i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'logo') {
          if (got[1]) { c.drawImage(got[1], i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'photo') {
          var ph = got[2];
          if (ph) { var r = cover(ph.naturalWidth, ph.naturalHeight, i.w, i.h, opts.focus); c.drawImage(ph, r.sx, r.sy, r.sw, r.sh, i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'shade') {
          var g = c.createLinearGradient(0, i.y, 0, i.y + i.h);
          g.addColorStop(0, 'rgba(6,30,23,' + i.from + ')');
          g.addColorStop(1, 'rgba(6,30,23,' + i.to + ')');
          c.fillStyle = g; c.fillRect(i.x, i.y, i.w, i.h);
        } else {
          // too wide: smaller, down to two-thirds, then squeezed
          var size = i.size;
          c.font = css(i, size);
          if ('letterSpacing' in c) { c.letterSpacing = i.spacing + 'px'; }
          while (c.measureText(i.words).width > i.max && size > i.size * 0.67) { size -= 1; c.font = css(i, size); }
          c.fillStyle = i.colour; c.textAlign = i.align;
          // over a photo, a soft shadow keeps words readable on light patches
          if (i.shadow) { c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 8; c.shadowOffsetY = 1; }
          c.fillText(i.words, i.x, i.y, i.max);
          c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
          if ('letterSpacing' in c) { c.letterSpacing = '0px'; }
        }
      });
      return canvas;
    });
  }

  return { SIZES: SIZES, COLOURS: COLOURS, day: day, placeWord: placeWord, improvement: improvement,
           cardName: cardName, surnameByDefault: surnameByDefault, seasonWords: seasonWords, facts: facts,
           caption: caption, fileName: fileName, headlineFor: headlineFor, cover: cover, STYLES: ['podium', 'photo'], layout: layout, overlaps: overlaps, render: render };
}));
