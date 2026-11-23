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
  function layout(f, shape, style, surface) {
    if (style === 'photo') { return photoLayout(f, shape); }
    if (style === 'event') {
      return photoLayout(f, shape, { kind: 'scene', scene: sceneFor(f.event), surface: SURFACES[surface] ? surface : 'blue', event: f.event });
    }
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
  function photoLayout(f, shape, back) {
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
    var under = back || { kind: 'photo' };
    under.x = 0; under.y = 0; under.w = W; under.h = H;
    items.push(under);
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
    return back ? { w: W, h: H, items: items, scene: under.scene } : { w: W, h: H, items: items, photo: true };
  }

  /* The Event card: the Photo card's layout over a scene of the event, drawn here.
     Track scenes are on the Ngā Puna Wai blue track unless the sharer picks red or grass. */
  var SURFACES = { blue: { track: '#2E63AC', line: 'rgba(255,255,255,.92)' },
                   red: { track: '#B4472F', line: 'rgba(255,255,255,.92)' },
                   grass: { track: '#62A84C', line: 'rgba(255,255,255,.95)' } };
  // which scene an event gets, from its name ("100m Hurdles", "Shot put (3kg)", "Cross country 3 km")
  function sceneFor(event) {
    var e = String(event || '').toLowerCase().replace(/,/g, '');
    if (/steeple/.test(e)) { return 'steeple'; }
    if (/hurdle/.test(e)) { return 'hurdles'; }
    if (/cross ?country|\bxc\b/.test(e)) { return 'xc'; }
    if (/walk/.test(e)) { return /road|km\b|\d{5}m|marathon/.test(e) ? 'roadwalk' : 'oval'; }
    if (/road|marathon|\d\s*km\b|fun run/.test(e)) { return 'road'; }
    if (/triple/.test(e)) { return 'triple'; }
    if (/long jump/.test(e)) { return 'long'; }
    if (/high jump/.test(e)) { return 'high'; }
    if (/pole/.test(e)) { return 'pole'; }
    if (/shot/.test(e)) { return 'shot'; }
    if (/discus/.test(e)) { return 'discus'; }
    if (/hammer/.test(e)) { return 'hammer'; }
    if (/jav|vortex|turbo/.test(e)) { return 'javelin'; }
    var m = /(\d+)\s*m\b/.exec(e);
    return m && +m[1] < 400 ? 'sprint' : 'oval';
  }
  // whether the track colour shows in a scene (not on grass hills, roads or throwing circles)
  function sceneHasTrack(scene) { return ['xc', 'road', 'roadwalk', 'shot', 'discus', 'hammer'].indexOf(scene) < 0; }

  function drawScene(c, i) {
    var W = i.w, H = i.h, S = SURFACES[i.surface] || SURFACES.blue, s = i.scene, LINE = S.line;
    var GRASS = '#3E8A3A', GRASS2 = '#4C9A45';
    c.save(); c.translate(i.x, i.y);
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    var path = function (pts) { c.beginPath(); pts.forEach(function (p, k) { if (k) { c.lineTo(p[0], p[1]); } else { c.moveTo(p[0], p[1]); } }); };
    var fill = function (col, pts) { c.fillStyle = col; path(pts); c.closePath(); c.fill(); };
    var line = function (col, wd, pts) { c.strokeStyle = col; c.lineWidth = wd; path(pts); c.stroke(); };
    var dot = function (col, x, y, r) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    // the ground ahead, as a runner sees it: u across (a lane is 0.5), v ahead
    // the horizon is high so what matters sits between the name and the mark, clear of the words
    var hy = H * 0.3, Z = 0.9;
    var P = function (u, v) { var z = 1 + v * Z; return [W / 2 + u * W * 0.5 / z, hy + (H - hy) * 1.05 / z]; };
    var quad = function (col, u0, u1, v0, v1) { fill(col, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]); };
    var unit = function (v) { return W * 0.5 / (1 + v * Z); };   // one u across, in card points, at v
    var sky = function (top, bottom) {
      var g = c.createLinearGradient(0, 0, 0, hy);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      c.fillStyle = g; c.fillRect(0, 0, W, hy + 1);
    };
    var stadium = function () {
      sky('#0C2F3C', '#4D8C9A');
      c.fillStyle = '#123A33'; c.fillRect(0, hy - H * 0.06, W, H * 0.06);          // the stand
      for (var k = 0; k < 9; k++) { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(W * (k + 0.3) / 9, hy - H * 0.05, W / 30, H * 0.012); }
      c.fillStyle = GRASS; c.fillRect(0, hy, W, H - hy);
    };
    // stripes mown into a field, seen from above
    var field = function () {
      c.fillStyle = GRASS; c.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 60) { c.fillStyle = GRASS2; c.fillRect(0, y, W, 30); }
    };
    var hurdle = function (u0, u1, v, tall) {
      var a = P(u0 + 0.04, v), b = P(u1 - 0.04, v), h = unit(v) * (tall || 0.34), t = Math.max(1.5, h * 0.2);
      line('#2A2A2A', Math.max(1, t * 0.4), [a, [a[0], a[1] - h]]);
      line('#2A2A2A', Math.max(1, t * 0.4), [b, [b[0], b[1] - h]]);
      c.fillStyle = '#FFFFFF'; c.fillRect(a[0], a[1] - h - t, b[0] - a[0], t);
      c.fillStyle = '#1A1A1A';
      for (var k = 1; k < 4; k += 2) { c.fillRect(a[0] + (b[0] - a[0]) * k / 4, a[1] - h - t, (b[0] - a[0]) / 4, t); }
    };

    if (s === 'sprint' || s === 'hurdles' || s === 'steeple') {
      stadium();
      quad(S.track, -2.3, 2.3, 0, 60);
      for (var k = -4; k <= 4; k++) { quad(LINE, k * 0.5 - 0.02, k * 0.5 + 0.02, 0, 60); }
      if (s === 'sprint' || s === 'hurdles') { quad(LINE, -2, 2, 3.2, 3.4); }
      if (s === 'hurdles') {
        [12, 8, 5, 3.2].forEach(function (v) { for (var l = -4; l < 4; l++) { hurdle(l * 0.5, l * 0.5 + 0.5, v); } });
      }
      if (s === 'steeple') {
        quad('#3E9BD1', -2, 2, 2.22, 4.2);
        for (var w = 2.5; w < 4.2; w += 0.4) { quad('rgba(255,255,255,.35)', -1.8, 1.8, w, w + 0.05); }
        hurdle(-2, 2, 9, 0.45);
        hurdle(-2, 2, 2.2, 0.45);
      }
    } else if (s === 'long' || s === 'triple') {
      stadium();
      quad(S.track, -0.4, 0.4, 0, 1.6);
      quad(LINE, -0.42, -0.38, 0, 1.6); quad(LINE, 0.38, 0.42, 0, 1.6);
      if (s === 'triple') { [0.5, 0.9, 1.3].forEach(function (v) { quad(LINE, -0.38, 0.38, v, v + 0.04); }); }
      else { quad('#FFFFFF', -0.38, 0.38, 1.35, 1.45); }
      quad('#B89A5E', -0.85, 0.85, 1.6, 5);
      quad('#E3CC92', -0.8, 0.8, 1.68, 4.8);
      [[-0.25, 2.4], [0.2, 2.9], [-0.05, 3.6]].forEach(function (d) {
        var p = P(d[0], d[1]); c.fillStyle = 'rgba(150,120,70,.5)';
        c.beginPath(); c.ellipse(p[0], p[1], unit(d[1]) * 0.08, unit(d[1]) * 0.03, 0, 0, Math.PI * 2); c.fill();
      });
    } else if (s === 'high' || s === 'pole') {
      stadium();
      quad(S.track, -3, 3, 0, 4);
      var top = s === 'pole' ? H * 0.24 : H * 0.31, mx0 = W * 0.2, mx1 = W * 0.8, my = H * 0.42, mh = H * 0.09;
      fill('#2F5FA8', [[mx0 + W * 0.04, my - mh * 0.45], [mx1 - W * 0.04, my - mh * 0.45], [mx1, my], [mx0, my]]);   // the mat's top
      c.fillStyle = '#1B3F7A'; c.fillRect(mx0, my, mx1 - mx0, mh);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(mx0, my + mh * 0.15, mx1 - mx0, 2);
      if (s === 'pole') { fill('#333333', [[W * 0.46, my + mh + 6], [W * 0.54, my + mh + 6], [W * 0.52, my + mh + 22], [W * 0.48, my + mh + 22]]); }
      [W * 0.17, W * 0.83].forEach(function (x) {
        line('#D8D8D8', 4, [[x, my + mh * 0.6], [x, top - H * 0.04]]);
        c.fillStyle = '#333333'; c.fillRect(x - 14, my + mh * 0.6, 28, 5);
      });
      for (var b = 0; b < 8; b++) {
        c.fillStyle = b % 2 ? '#FFFFFF' : '#E0393E';
        c.fillRect(W * 0.17 + (W * 0.66) * b / 8, top, W * 0.66 / 8 + 0.5, 5);
      }
    } else if (s === 'shot' || s === 'discus' || s === 'hammer' || s === 'javelin') {
      field();
      var ox = W / 2, oy = H * 0.8, half = (s === 'javelin' ? 14.48 : 17.46) * Math.PI / 180;
      [-half, half].forEach(function (a) { line(LINE, 3, [[ox, oy], [ox + Math.sin(a) * H * 2, oy - Math.cos(a) * H * 2]]); });
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5;
      for (var r = H * 0.22; r < H; r += H * 0.16) { c.beginPath(); c.arc(ox, oy, r, -Math.PI / 2 - half, -Math.PI / 2 + half); c.stroke(); }
      if (s === 'javelin') {
        c.fillStyle = S.track; c.fillRect(ox - W * 0.07, oy, W * 0.14, H - oy);
        c.strokeStyle = LINE; c.lineWidth = 3; c.beginPath(); c.arc(ox, oy + W * 0.1, W * 0.1, -Math.PI * 0.82, -Math.PI * 0.18); c.stroke();
      } else {
        var cr = W * (s === 'discus' || s === 'hammer' ? 0.055 : 0.045);
        dot('#FFFFFF', ox, oy, cr + 3); dot('#BDBDB6', ox, oy, cr);
        if (s === 'shot') { c.fillStyle = '#FFFFFF'; c.fillRect(ox - cr * 0.9, oy - cr - 8, cr * 1.8, 6); }   // the stop board
        else {
          c.strokeStyle = 'rgba(20,20,20,.75)'; c.lineWidth = 3; c.setLineDash([4, 3]);
          c.beginPath(); c.arc(ox, oy, cr * 2.3, -Math.PI / 2 + half * 1.4, Math.PI * 1.5 - half * 1.4); c.stroke(); c.setLineDash([]);
        }
      }
      var ix = W * 0.55, iy = H * 0.42;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(ix + 6, iy + 10, W * 0.04, W * 0.015, 0, 0, Math.PI * 2); c.fill();
      if (s === 'shot') { dot('#55585C', ix, iy, W * 0.032); dot('rgba(255,255,255,.45)', ix - W * 0.01, iy - W * 0.012, W * 0.009); }
      if (s === 'discus') {
        c.fillStyle = '#2B2B2B'; c.beginPath(); c.ellipse(ix, iy, W * 0.05, W * 0.02, -0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#C9C9C9'; c.beginPath(); c.ellipse(ix, iy, W * 0.018, W * 0.007, -0.3, 0, Math.PI * 2); c.fill();
      }
      if (s === 'hammer') {
        line('#DDDDDD', 1.5, [[ix, iy], [ix - W * 0.14, iy + H * 0.08]]);
        line('#DDDDDD', 3, [[ix - W * 0.16, iy + H * 0.07], [ix - W * 0.13, iy + H * 0.1]]);
        dot('#55585C', ix, iy, W * 0.028); dot('rgba(255,255,255,.45)', ix - W * 0.008, iy - W * 0.01, W * 0.008);
      }
      if (s === 'javelin') {
        var j0 = [W * 0.3, H * 0.52], j1 = [W * 0.72, H * 0.3];
        var at = function (t) { return [j0[0] + (j1[0] - j0[0]) * t, j0[1] + (j1[1] - j0[1]) * t]; };
        line('#F2F2F2', 4, [j0, j1]);
        line('#1A1A1A', 4, [at(0.92), j1]);
        line('#7A4A2A', 6, [at(0.45), at(0.55)]);
      }
    } else if (s === 'xc') {
      sky('#5E9CB8', '#CFE6E8');
      var hill = function (col, y, a) {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
        c.lineTo(0, y); c.bezierCurveTo(W * 0.3, y - a, W * 0.6, y + a * 0.6, W, y - a * 0.4);
        c.lineTo(W, H); c.closePath(); c.fill();
      };
      hill('#7DB860', H * 0.38, H * 0.08); hill('#5FA04A', H * 0.5, H * 0.1); hill('#3F8536', H * 0.66, H * 0.12);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(W * 0.1, H); c.bezierCurveTo(W * 0.2, H * 0.7, W * 0.85, H * 0.72, W * 0.7, H * 0.52);
      c.bezierCurveTo(W * 0.6, H * 0.42, W * 0.3, H * 0.46, W * 0.35, H * 0.38); c.stroke(); c.setLineDash([]);
      [[0.2, 0.86, 1], [0.62, 0.66, 0.8], [0.66, 0.5, 0.6], [0.38, 0.43, 0.5]].forEach(function (f, k) {
        var x = W * f[0], y = H * f[1], h = H * 0.07 * f[2];
        line('#2A2A2A', 2, [[x, y], [x, y - h]]);
        fill(k % 2 ? '#FFC629' : '#E0393E', [[x, y - h], [x + h * 0.6, y - h * 0.8], [x, y - h * 0.6]]);
      });
    } else if (s === 'road' || s === 'roadwalk') {
      sky('#4F8FB0', '#D6E8EA');
      fill('#6FA9C0', [[0, hy], [W * 0.2, hy - H * 0.05], [W * 0.45, hy - H * 0.02], [W * 0.7, hy - H * 0.07], [W, hy - H * 0.02], [W, hy]]);
      c.fillStyle = GRASS; c.fillRect(0, hy, W, H - hy);
      quad('#4A4F55', -1.25, 1.25, 0, 80);
      quad('#FFFFFF', -1.17, -1.13, 0, 80); quad('#FFFFFF', 1.13, 1.17, 0, 80);
      for (var v = 0; v < 30; v += 1.2) { quad('#FFFFFF', -0.03, 0.03, v, v + 0.55); }
      if (s === 'roadwalk') {
        fill('#FFFFFF', [P(0.45, 0.4), P(0.65, 0.4), P(0.65, 1.3), P(0.8, 1.3), P(0.55, 2.1), P(0.3, 1.3), P(0.45, 1.3)]);
      }
      // the kilometre marker
      var km = (/(\d+(?:\.\d+)?)\s*km/i.exec(i.event || '') || [])[1], base = P(1.8, 1.4), u = unit(1.4);
      line('#DDDDDD', Math.max(2, u * 0.04), [base, [base[0], base[1] - u * 0.6]]);
      var sw = u * 0.5, sh = u * 0.28, sx = base[0] - sw / 2, sy = base[1] - u * 0.6 - sh;
      c.fillStyle = '#FFFFFF'; c.fillRect(sx, sy, sw, sh);
      c.fillStyle = '#0B3B2E'; c.fillRect(sx + 3, sy + 3, sw - 6, sh - 6);
      c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.font = '800 ' + Math.round(sh * 0.5) + 'px sans-serif';
      c.fillText(km ? km + ' km' : 'km', base[0], sy + sh * 0.68, sw - 8);
    } else {
      // the whole track from overhead: 400m and longer
      field();
      var vert = H > W * 1.2, cx = W / 2, cy = H / 2;
      var R = vert ? W * 0.38 : W * 0.27, a = vert ? H * 0.16 : W * 0.2;
      var oval = function (r) {
        c.beginPath();
        if (vert) { c.moveTo(cx + r, cy - a); c.lineTo(cx + r, cy + a); c.arc(cx, cy + a, r, 0, Math.PI); c.lineTo(cx - r, cy - a); c.arc(cx, cy - a, r, Math.PI, Math.PI * 2); }
        else { c.moveTo(cx - a, cy - r); c.lineTo(cx + a, cy - r); c.arc(cx + a, cy, r, -Math.PI / 2, Math.PI / 2); c.lineTo(cx - a, cy + r); c.arc(cx - a, cy, r, Math.PI / 2, Math.PI * 1.5); }
        c.closePath();
      };
      var inner = R * 0.64;
      c.fillStyle = S.track; oval(R + 6); c.fill();
      c.fillStyle = GRASS2; oval(inner); c.fill();
      c.strokeStyle = LINE; c.lineWidth = 1.5;
      for (var n = 0; n <= 8; n++) { oval(inner + (R - inner) * n / 8); c.stroke(); }
      if (vert) { line(LINE, 4, [[cx + inner, cy + a * 0.6], [cx + R, cy + a * 0.6]]); }
      else { line(LINE, 4, [[cx + a * 0.6, cy + inner], [cx + a * 0.6, cy + R]]); }
    }
    c.restore();
  }

  var ZOOM_MAX = 4;
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  // "30% 40%" as { x: 30, y: 40 }; anything else is the middle
  function parseFocus(focus) {
    var m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(focus || '') || [0, 50, 50];
    return { x: clamp(+m[1], 0, 100), y: clamp(+m[2], 0, 100) };
  }

  /* Where a photo goes to cover a w x h box, keeping the focus point ("30% 40%") in
     view, zoomed in by zoom (1 = just covering, up to ZOOM_MAX): the source rectangle
     to draw from. */
  function cover(iw, ih, w, h, focus, zoom) {
    var f = parseFocus(focus), z = clamp(+zoom || 1, 1, ZOOM_MAX);
    var scale = Math.max(w / iw, h / ih) * z, sw = w / scale, sh = h / scale;
    return { sx: (iw - sw) * f.x / 100, sy: (ih - sh) * f.y / 100, sw: sw, sh: sh };
  }

  /* Dragging the photo by dx, dy card pixels: the new position { x, y, zoom }. The photo
     follows the finger, and stops at its edges (the card is always covered). */
  function move(pos, dx, dy, iw, ih, w, h) {
    var z = clamp(+pos.zoom || 1, 1, ZOOM_MAX), scale = Math.max(w / iw, h / ih) * z;
    var spareX = iw - w / scale, spareY = ih - h / scale;
    var x = spareX > 0.5 ? clamp(pos.x - dx / scale / spareX * 100, 0, 100) : pos.x;
    var y = spareY > 0.5 ? clamp(pos.y - dy / scale / spareY * 100, 0, 100) : pos.y;
    return { x: x, y: y, zoom: z };
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
    var style = opts.style === 'photo' && opts.photo ? 'photo' : opts.style === 'event' ? 'event' : 'podium';
    var L = layout(f, shape, style, opts.surface), scale = 2;
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
          if (ph) {
            var r = cover(ph.naturalWidth, ph.naturalHeight, i.w, i.h, opts.focus, opts.zoom);
            c.drawImage(ph, r.sx, r.sy, r.sw, r.sh, i.x, i.y, i.w, i.h);
            canvas.photo = { iw: ph.naturalWidth, ih: ph.naturalHeight, w: i.w, h: i.h };   // for dragging it
          }
        } else if (i.kind === 'scene') {
          drawScene(c, i);
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
           caption: caption, fileName: fileName, headlineFor: headlineFor, cover: cover, parseFocus: parseFocus, move: move, ZOOM_MAX: ZOOM_MAX, STYLES: ['podium', 'photo', 'event'],
           SURFACES: Object.keys(SURFACES), sceneFor: sceneFor, sceneHasTrack: sceneHasTrack, layout: layout, overlaps: overlaps, render: render };
}));
