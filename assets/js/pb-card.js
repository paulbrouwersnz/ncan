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
  place is in the words only when it's 1st, 2nd or 3rd, and any other place only on
  the medal, when the sharer chooses Show place.
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

  /* The finisher's medal in the top right, when the sharer shows the place: gold, silver
     or bronze for 1st to 3rd, copper for any other place, with the place on it ("4th").
     [face, rim, words] */
  var METALS = { gold: ['#F2C230', '#D9A514', '#3D2C00'], silver: ['#C9D0D6', '#A9B3BC', '#26303A'],
                 bronze: ['#C58A4B', '#A86F34', '#2E1C08'], copper: ['#C86B3C', '#A9542A', '#FFFFFF'] };
  function medalFor(place) {
    if (!(place >= 1)) { return null; }
    return { words: ordinal(place), metal: ['gold', 'silver', 'bronze'][place - 1] || 'copper' };
  }
  // the medal's item (centre cx, cy; radius r), hanging from a ribbon at the top edge
  function medalItem(m, W, pad, story) {
    var r = story ? 46 : 36;
    return { kind: 'medal', cx: W - pad - r, cy: story ? 112 : 86, r: r, words: m.words, metal: m.metal };
  }

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
  // where the meeting was, as the card says it: "Ngā Puna Wai · Christchurch". A
  // trailing ", New Zealand" is left off, so only overseas meetings name a country.
  function whereWords(w) {
    w = w || {};
    var tidy = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
    var city = tidy(w.city).replace(/,\s*new zealand$/i, '');
    return [tidy(w.location), city].filter(Boolean).join(' · ');
  }
  function facts(a) {
    var r = a.result || {}, kind = kindOf(a), place = r.relay ? '' : placeWord(r.place);
    var newpb = kind === 'newpb';
    // showPlace: the place on a medal in the corner, any place (a relay's: the team's place)
    var medal = a.showPlace ? medalFor(r.place) : null;
    if (medal) { place = ''; }     // said on the medal, so not in the words too
    return {
      kind: kind,
      medal: medal,
      headline: headlineFor(kind, place),
      name: cardName(a.name, a.surname),
      event: a.event || r.event || '',
      mark: a.mark || r.mark || '',
      wind: !r.field && typeof r.wind === 'number' ? (r.wind > 0 ? '+' : '') + r.wind.toFixed(1) + ' m/s' : '',
      better: newpb ? improvement(r, a.prev) : '',
      was: newpb ? (a.prevMark || a.prev.mark || '') : '',
      meeting: r.meeting || '',
      where: whereWords(a.where),
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
      var pl = f.medal ? f.medal.words : m ? m[1].toLowerCase() : '';
      return (pl ? pl + ' place for ' + who + '! ' + f.event + ' in ' + f.mark
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
          mark: 470, markSize: 130, rib: [500, 230, 54, 28], lines: 664, step: 36, sizes: [20, 22, 24, 20, 18, 20] }
      : { head: 70, headSize: 18, name: 106, nameSize: 32, group: 130, band: [148, 172], event: 182, eventSize: 24,
          mark: 264, markSize: 86, rib: [278, 180, 36, 20], lines: 348, step: 22, sizes: [15, 16, 17, 15, 14, 15] };
    items.push({ kind: 'rect', x: 0, y: P.band[0], w: W, h: P.band[1], colour: COLOURS.bg2 });
    var md = f.medal ? medalItem(f.medal, W, pad, story) : null, narrow = W - 2 * pad - (md ? 2 * md.r + 16 : 0);
    t(f.headline || 'PERSONAL BEST', pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2, max: narrow });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display', max: narrow });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.soft, max: narrow });
    if (md) { items.push(md); }

    t(f.event, W / 2, P.event, P.eventSize, { weight: 700, font: 'display', align: 'center' });
    t(f.mark, W / 2, P.mark, P.markSize, { weight: 800, font: 'display', colour: COLOURS.gold, align: 'center' });
    // the ribbon: "PB −0.32s", dark on gold
    if (f.better) {
      var ry = P.rib[0], rw = P.rib[1], rh = P.rib[2];
      items.push({ kind: 'rect', x: (W - rw) / 2, y: ry, w: rw, h: rh, colour: COLOURS.gold, round: rh / 2 });
      t('PB ' + f.better, W / 2, ry + rh * 0.7, P.rib[3], { weight: 800, font: 'display', colour: COLOURS.ink, align: 'center' });
    }

    // six lines at most: closer together on a square when all six are there, clear of the crest
    var y = P.lines, n = 0, step = P.step;
    if (!story && [f.was, f.place || f.wind, f.meeting, f.date, f.where, f.season].filter(Boolean).length > 5) { step = 19; }
    var line = function (words, o) {
      var size = P.sizes[n++];
      if (words) { t(words, W / 2, y, size, o); y += step; }
    };
    line(f.was ? 'Previous best ' + f.was : '', { colour: COLOURS.soft, align: 'center' });
    line([f.place, f.wind].filter(Boolean).join(' · '), { weight: 600, align: 'center' });
    line(f.meeting, { weight: 600, align: 'center' });
    line(f.date, { colour: COLOURS.soft, align: 'center' });
    line(f.where, { colour: COLOURS.soft, align: 'center' });
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
    var md = f.medal ? medalItem(f.medal, W, pad, story) : null, narrow = W - 2 * pad - (md ? 2 * md.r + 16 : 0);
    t(f.headline || 'PERSONAL BEST', pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2, max: narrow });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display', max: narrow });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.text, max: narrow });
    if (md) { items.push(md); }

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
    line(f.where, { weight: 400 });
    if (story) { line(f.season, { colour: COLOURS.goldSoft, weight: 600 }); }

    var lh = story ? 60 : 40;
    items.push({ kind: 'logo', x: pad, y: H - pad - lh + (story ? 0 : 12), h: lh, w: lh * 888 / 508 });
    t('ncan.nz', W - pad, H - pad - lh * 0.3 + (story ? 0 : 12), 15, { weight: 600, align: 'right', max: 120 });
    return back ? { w: W, h: H, items: items, scene: under.scene } : { w: W, h: H, items: items, photo: true };
  }

  /* The Event card: the Photo card's layout over a scene of the event, drawn here.
     Track scenes start on blue, or on the colour an admin set for the meeting's location; the sharer can pick another. */
  var SURFACES = { blue: { track: '#2E63AC', line: 'rgba(255,255,255,.92)' },
                   red: { track: '#B4472F', line: 'rgba(255,255,255,.92)' },
                   grass: { track: '#62A84C', line: 'rgba(255,255,255,.95)' } };
  // the club's own track colours (admins set them: /admin/track-colours/), from the athlete page:
  // [{id, name, hex}]. Blue stays as the fallback, so a card always has a track.
  function setTracks(list) {
    var got = {};
    (list || []).forEach(function (c) {
      if (c && c.id && /^#[0-9a-f]{6}$/i.test(c.hex || '')) { got[c.id] = { track: c.hex, line: 'rgba(255,255,255,.92)' }; }
    });
    if (!Object.keys(got).length) { return; }
    if (!got.blue) { got.blue = SURFACES.blue; }
    SURFACES = got;
    api.SURFACES = Object.keys(SURFACES);
  }
  // which scene an event gets, from its name ("100m Hurdles", "Shot put (3kg)", "Cross country 3 km")
  function sceneFor(event) {
    var e = String(event || '').toLowerCase().replace(/,/g, '');
    if (/steeple/.test(e)) { return 'steeple'; }
    if (/hurdle/.test(e)) { return 'hurdles'; }
    if (/cross ?country|\bxc\b/.test(e)) { return 'xc'; }
    if (/trail|mountain|hill|off.?road/.test(e)) { return 'trail'; }
    // race walks: on the track at athletics meetings (any "...m" walk, even 10,000m); out of stadia on a
    // road circuit of 1 to 2 km, which an out-of-stadia result names in km
    if (/walk/.test(e)) { return /road|\d\s*km\b/.test(e) ? 'walk' : 'oval'; }
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
  function sceneHasTrack(scene) { return ['xc', 'trail', 'road', 'walk', 'shot', 'discus', 'hammer'].indexOf(scene) < 0; }

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

    if (s === 'sprint' || s === 'hurdles') {
      stadium();
      quad(S.track, -2.3, 2.3, 0, 60);
      for (var k = -4; k <= 4; k++) { quad(LINE, k * 0.5 - 0.02, k * 0.5 + 0.02, 0, 60); }
      quad(LINE, -2, 2, 3.2, 3.4);
      if (s === 'hurdles') {
        [12, 8, 5, 3.2].forEach(function (v) { for (var l = -4; l < 4; l++) { hurdle(l * 0.5, l * 0.5 + 0.5, v); } });
      }
    } else if (s === 'steeple') {
      // the water jump from the infield: its lane runs across in front of the main track. Runners come from the
      // right, clear the striped barrier into the deep end of the water and run out of the shallow end on the left
      stadium();
      var up = function (u, v, h) { var p = P(u, v); return [p[0], p[1] - unit(v) * h]; };
      quad(S.track, -30, 30, 4.4, 9.5);                                       // the main track
      for (var t = 0; t <= 6; t++) { var tv = 4.4 + t * 0.85; quad(LINE, -30, 30, tv, tv + 0.03); }
      quad(S.track, -30, 30, 1.9, 3.9);                                       // the water jump lane
      quad(LINE, -30, 30, 1.9, 1.95); quad(LINE, -30, 30, 3.85, 3.9);
      quad('#3E9BD1', -1.3, 0.7, 2.0, 3.8);
      quad('#2C7FB8', -0.1, 0.7, 2.0, 3.8);                                   // deep, right after the barrier
      quad('rgba(255,255,255,.75)', -1.33, -1.27, 2.0, 3.8);                   // where the pit runs out
      [[0.2, 2.4], [0.7, 3.1], [0.45, 2.8], [-0.3, 3.3], [1.0, 2.3]].forEach(function (r) { quad('rgba(255,255,255,.35)', -r[0] - 0.25, -r[0], r[1], r[1] + 0.04); });
      [2.1, 2.9, 3.7].forEach(function (v) { line('#2A2A2A', Math.max(2, unit(v) * 0.04), [P(0.7, v), up(0.7, v, 0.3)]); });
      for (var bv = 1.85; bv < 3.95; bv += 0.3) {
        var v1 = Math.min(bv + 0.3, 3.95);
        fill(Math.round((bv - 1.85) / 0.3) % 2 ? '#1A1A1A' : '#FFFFFF', [up(0.7, bv, 0.4), up(0.7, v1, 0.4), up(0.7, v1, 0.3), up(0.7, bv, 0.3)]);
      }
      fill('#D9D9D9', [up(0.7, 1.85, 0.4), up(0.7, 3.95, 0.4), up(0.76, 3.95, 0.4), up(0.76, 1.85, 0.4)]);   // the top of the barrier
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
    } else if (s === 'pole') {
      // the pit from the runway: a deep mat with a white centre, two front pads either side of the V that
      // slopes down to the box, tall standards at the back and the bar high above
      stadium();
      var X = function (f) { return W * f; }, Y = function (f) { return H * f; };
      fill(S.track, [[X(0.485), Y(0.565)], [X(0.515), Y(0.565)], [X(0.62), H], [X(0.38), H]]);          // the runway
      line(LINE, 2, [[X(0.485), Y(0.565)], [X(0.38), H]]); line(LINE, 2, [[X(0.515), Y(0.565)], [X(0.62), H]]);
      [0.2, 0.8].forEach(function (f) { line('#8E959C', 5, [[X(f), Y(0.4)], [X(f), Y(0.13)]]); });       // the standards
      fill('#2F6FC0', [[X(0.16), Y(0.34)], [X(0.84), Y(0.34)], [X(0.92), Y(0.46)], [X(0.08), Y(0.46)]]);  // the pit's top
      c.fillStyle = '#1B4E94'; c.fillRect(X(0.08), Y(0.46), X(0.84), Y(0.035));
      fill('#EDEFF2', [[X(0.37), Y(0.355)], [X(0.63), Y(0.355)], [X(0.65), Y(0.425)], [X(0.35), Y(0.425)]]);  // the white centre
      [[0.14, 0.43, 0.41, 0.08], [0.57, 0.86, 0.92, 0.59]].forEach(function (p) {                     // the front pads
        fill('#3A80D2', [[X(p[0]), Y(0.445)], [X(p[1]), Y(0.445)], [X(p[2]), Y(0.52)], [X(p[3]), Y(0.52)]]);
        c.fillStyle = '#1E5AA6'; c.fillRect(X(Math.min(p[2], p[3])), Y(0.52), X(Math.abs(p[2] - p[3])), Y(0.03));
      });
      fill('#D9DDE2', [[X(0.43), Y(0.445)], [X(0.57), Y(0.445)], [X(0.515), Y(0.535)], [X(0.485), Y(0.535)]]);  // the V
      fill('#3C3C3C', [[X(0.483), Y(0.535)], [X(0.517), Y(0.535)], [X(0.515), Y(0.565)], [X(0.485), Y(0.565)]]);  // the box
      [[0.2, 0.235], [0.8, 0.765]].forEach(function (p) {                                             // the yellow arms
        line('#F2D33A', 4, [[X(p[1]), Y(0.13)], [X(p[1]), Y(0.2)]]);
        line('#F2D33A', 3, [[X(p[0]), Y(0.165)], [X(p[1]), Y(0.165)]]); line('#F2D33A', 3, [[X(p[0]), Y(0.2)], [X(p[1]), Y(0.2)]]);
      });
      line('#F2D33A', 4, [[X(0.235), Y(0.13)], [X(0.765), Y(0.13)]]);                                   // the bar
    } else if (s === 'high') {
      // the mat sits where the surfaced fan meets the grass, the uprights just in front of it,
      // the bar a little above the mat's leading edge
      stadium();
      var lift = function (u, v, h) { var p = P(u, v); return [p[0], p[1] - unit(v) * h]; };
      var MF = 3, MB = 5.6, MU = 2, MH = 0.42;
      quad(S.track, -8, 8, 0, MF + 0.5);                                        // the fan, ending under the mat
      fill('#1B3F7A', [P(-MU, MF), P(MU, MF), lift(MU, MF, MH), lift(-MU, MF, MH)]);            // the mat's front
      fill('#2F5FA8', [lift(-MU, MF, MH), lift(MU, MF, MH), lift(MU, MB, MH), lift(-MU, MB, MH)]);  // its top
      line('rgba(255,255,255,.75)', 2, [lift(-MU, MF, MH * 0.7), lift(MU, MF, MH * 0.7)]);
      var bar = MH + 0.14, ux = MU + 0.15, uv = MF - 0.12;
      [-ux, ux].forEach(function (u) {
        var foot = P(u, uv), w = unit(uv) * 0.16;
        c.fillStyle = '#333333'; c.fillRect(foot[0] - w, foot[1] - 3, w * 2, 6);
        line('#D8D8D8', Math.max(3, unit(uv) * 0.035), [foot, lift(u, uv, bar + 0.3)]);
      });
      var b0 = lift(-ux, uv, bar), b1 = lift(ux, uv, bar), bt = Math.max(4, unit(uv) * 0.035);
      for (var b = 0; b < 8; b++) {
        c.fillStyle = b % 2 ? '#FFFFFF' : '#E0393E';
        c.fillRect(b0[0] + (b1[0] - b0[0]) * b / 8, b0[1] - bt / 2, (b1[0] - b0[0]) / 8 + 0.5, bt);
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
      var shadow = function (x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
      if (s === 'shot') {
        shadow(ix + 6, iy + 10, W * 0.04, W * 0.015);
        dot('#55585C', ix, iy, W * 0.032); dot('rgba(255,255,255,.45)', ix - W * 0.01, iy - W * 0.012, W * 0.009);
      }
      if (s === 'discus') {
        // lying flat and tilted: a silver rim with its thickness showing, coloured side plates, a silver hub
        var dr = W * 0.055, ds = 0.42, dt = W * 0.012, ell = function (col, x, y, rx, ry) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, -0.25, 0, Math.PI * 2); c.fill(); };
        shadow(ix + 8, iy + dt + 8, dr * 1.05, dr * ds);
        ell('#7E858C', ix, iy + dt, dr, dr * ds);                  // the rim's edge
        ell('#D7DBDF', ix, iy, dr, dr * ds);                       // the rim
        ell('#E2702A', ix, iy, dr * 0.8, dr * ds * 0.8);           // the side plate
        ell('rgba(255,255,255,.28)', ix - dr * 0.18, iy - dr * ds * 0.25, dr * 0.45, dr * ds * 0.3);   // the shine
        ell('#C2C7CC', ix, iy, dr * 0.3, dr * ds * 0.3);           // the hub
        ell('#EEF0F2', ix - dr * 0.06, iy - dr * ds * 0.06, dr * 0.14, dr * ds * 0.14);
      }
      if (s === 'hammer') {
        // the ball, a slack wire lying in a curve on the grass, and the triangular handle
        var hb = [ix, iy], hh = [ix - W * 0.16, iy + W * 0.1], hc = [ix - W * 0.02, iy + W * 0.13];
        var qb = function (t, k) { var u = 1 - t; return u * u * hb[k] + 2 * u * t * hc[k] + t * t * hh[k]; };
        shadow(ix + 6, iy + 10, W * 0.036, W * 0.014);
        c.strokeStyle = '#D6D6D6'; c.lineWidth = 2; c.beginPath(); c.moveTo(hb[0], hb[1]);
        c.quadraticCurveTo(hc[0], hc[1], hh[0], hh[1]); c.stroke();
        for (var t = 0.08; t < 0.96; t += 0.07) {                // links along the wire
          var lx = qb(t, 0), ly = qb(t, 1), ang = Math.atan2(qb(t + 0.01, 1) - ly, qb(t + 0.01, 0) - lx);
          c.save(); c.translate(lx, ly); c.rotate(ang); c.strokeStyle = '#EDEDED'; c.lineWidth = 1.5;
          c.beginPath(); c.ellipse(0, 0, W * 0.009, W * 0.004, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        }
        var ha = Math.atan2(hh[1] - hc[1], hh[0] - hc[0]), hl = W * 0.035;
        c.strokeStyle = '#EDEDED'; c.lineWidth = 3; c.beginPath(); c.moveTo(hh[0], hh[1]);
        c.lineTo(hh[0] + Math.cos(ha - 0.5) * hl, hh[1] + Math.sin(ha - 0.5) * hl);
        c.lineTo(hh[0] + Math.cos(ha + 0.5) * hl, hh[1] + Math.sin(ha + 0.5) * hl); c.closePath(); c.stroke();
        dot('#55585C', ix, iy, W * 0.028); dot('rgba(255,255,255,.45)', ix - W * 0.008, iy - W * 0.01, W * 0.008);
      }
      if (s === 'javelin') {
        // stuck point first into the grass inside the sector, the tail up in the air towards the thrower
        var jg = [W * 0.52, H * 0.44], jt = [W * 0.42, H * 0.2];
        var at = function (t) { return [jg[0] + (jt[0] - jg[0]) * t, jg[1] + (jt[1] - jg[1]) * t]; };
        line('rgba(0,0,0,.25)', 4, [jg, [jg[0] + W * 0.2, jg[1] + H * 0.05]]);   // its shadow on the grass
        c.fillStyle = '#6B4A2A'; c.beginPath(); c.ellipse(jg[0], jg[1], W * 0.018, W * 0.006, 0, 0, Math.PI * 2); c.fill();   // the divot
        line('#F2F2F2', 4, [at(0.04), jt]);
        line('#1A1A1A', 4, [jg, at(0.1)]);                         // the metal head, half buried
        line('#7A4A2A', 6, [at(0.45), at(0.57)]);                  // the grip
      }
    } else if (s === 'xc') {
      sky('#5E9CB8', '#CFE6E8');
      var hill = function (col, y, a) {
        c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
        c.lineTo(0, y); c.bezierCurveTo(W * 0.3, y - a, W * 0.6, y + a * 0.6, W, y - a * 0.4);
        c.lineTo(W, H); c.closePath(); c.fill();
      };
      hill('#7DB860', H * 0.38, H * 0.08); hill('#5FA04A', H * 0.5, H * 0.1); hill('#3F8536', H * 0.66, H * 0.12);
      // the course line, two curves
      var segs = [[[0.1, 1], [0.2, 0.7], [0.85, 0.72], [0.7, 0.52]], [[0.7, 0.52], [0.6, 0.42], [0.3, 0.46], [0.35, 0.38]]];
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(W * 0.1, H);
      segs.forEach(function (g) { c.bezierCurveTo(W * g[1][0], H * g[1][1], W * g[2][0], H * g[2][1], W * g[3][0], H * g[3][1]); });
      c.stroke(); c.setLineDash([]);
      // gates: two bright pink round markers either side of the line, about 5 m apart, smaller further off
      var bez = function (g, t, k) {
        var u = 1 - t;
        return u * u * u * g[0][k] + 3 * u * u * t * g[1][k] + 3 * u * t * t * g[2][k] + t * t * t * g[3][k];
      };
      var tan = function (g, t, k) {
        var u = 1 - t;
        return 3 * u * u * (g[1][k] - g[0][k]) + 6 * u * t * (g[2][k] - g[1][k]) + 3 * t * t * (g[3][k] - g[2][k]);
      };
      // (clear of the words and the logo)
      [[0, H > W * 1.2 ? 0.35 : 0.64, 0.85], [1, 0.3, 0.6], [1, 0.85, 0.42]].forEach(function (q) {
        var g = segs[q[0]], t = q[1], s = q[2], FLAT = 0.35;
        // square to the course on the ground (the ground is squashed by FLAT on screen)
        var dx = W * tan(g, t, 0), dy = H * tan(g, t, 1) / FLAT;
        var len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len * FLAT;
        var x = W * bez(g, t, 0), y = H * bez(g, t, 1);
        var half = Math.min(W, H) * 0.075 * s, r = Math.min(W, H) * 0.024 * s, post = r * 2.4;
        [-1, 1].forEach(function (side) {
          var px = x + side * half * nx, py = y + side * half * ny;
          line('#2A2A2A', Math.max(1.5, r * 0.18), [[px, py], [px, py - post]]);
          c.fillStyle = '#FF2E93'; c.beginPath(); c.arc(px, py - post, r, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#FFFFFF'; c.lineWidth = Math.max(1.5, r * 0.15); c.stroke();
        });
      });
    } else if (s === 'trail') {
      // a dirt trail winding up through bush-covered hills to a ridge, ranges behind
      sky('#3F7FA6', '#DDEBEA');
      var ridge = function (col, pts) { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); pts.forEach(function (p) { c.lineTo(W * p[0], H * p[1]); }); c.lineTo(W, H); c.closePath(); c.fill(); };
      ridge('#8FA9B8', [[0, 0.3], [0.14, 0.2], [0.3, 0.27], [0.5, 0.14], [0.66, 0.24], [0.84, 0.17], [1, 0.26]]);
      fill('#F2F5F6', [[W * 0.43, H * 0.17], [W * 0.5, H * 0.14], [W * 0.56, H * 0.17], [W * 0.5, H * 0.165]]);   // snow on the top
      ridge('#5E8A5C', [[0, 0.36], [0.2, 0.3], [0.42, 0.35], [0.62, 0.28], [0.8, 0.33], [1, 0.3]]);
      ridge('#46784A', [[0, 0.47], [0.25, 0.4], [0.5, 0.45], [0.75, 0.38], [1, 0.44]]);
      ridge('#356A3B', [[0, 0.6], [0.3, 0.55], [0.55, 0.6], [0.8, 0.53], [1, 0.57]]);
      ridge('#2B5A31', [[0, 0.78], [0.35, 0.72], [0.7, 0.77], [1, 0.7]]);
      // the trail: wide at the front, narrowing as it zigzags up to the ridge
      var trail = [[0.5, 1, 0.16], [0.62, 0.86, 0.11], [0.36, 0.74, 0.07], [0.6, 0.62, 0.045], [0.42, 0.53, 0.03], [0.6, 0.44, 0.02], [0.75, 0.38, 0.012]];
      var left = trail.map(function (p) { return [W * (p[0] - p[2]), H * p[1]]; }), right = trail.map(function (p) { return [W * (p[0] + p[2]), H * p[1]]; });
      fill('#B08A5A', left.concat(right.reverse()));
      // bush and trees beside it
      [[0.12, 0.84, 1], [0.86, 0.8, 0.9], [0.2, 0.66, 0.6], [0.82, 0.6, 0.55], [0.3, 0.5, 0.4], [0.88, 0.47, 0.35]].forEach(function (t) {
        var x = W * t[0], y = H * t[1], h = H * 0.12 * t[2];
        c.fillStyle = '#5A3A22'; c.fillRect(x - h * 0.05, y - h * 0.25, h * 0.1, h * 0.25);
        fill('#1F4A27', [[x, y - h], [x + h * 0.3, y - h * 0.2], [x - h * 0.3, y - h * 0.2]]);
      });
    } else if (s === 'walk') {
      // a road walk: a wide, flat path round a short circuit. Cones down the middle split the way out from
      // the way back and end at the turn post
      sky('#4F8FB0', '#D6E8EA');
      fill('#7FB3C4', [[0, hy], [0, hy - H * 0.012], [W * 0.4, hy - H * 0.018], [W, hy - H * 0.01], [W, hy]]);
      c.fillStyle = GRASS; c.fillRect(0, hy, W, H - hy);
      // the camera stands left of the cone line, so the row runs off at an angle and every cone shows
      var X = 1.4;
      quad('#8C8F93', X - 2.6, X + 2.6, 0, 80);
      quad('#B9BBBE', X - 2.6, X - 2.45, 0, 80); quad('#B9BBBE', X + 2.45, X + 2.6, 0, 80);
      // far to near, so nearer cones stand in front; the row runs on towards the horizon and the first
      // sits clear of the words
      for (var cv = 2.4 + 2.8 * 24; cv >= 2.4; cv -= 2.8) {
        var cb = P(X, cv), ch = unit(cv) * 0.8;
        fill('#F26B1D', [[cb[0] - ch * 0.18, cb[1]], [cb[0] + ch * 0.18, cb[1]], [cb[0] + ch * 0.03, cb[1] - ch], [cb[0] - ch * 0.03, cb[1] - ch]]);
        c.fillStyle = '#FFFFFF'; c.fillRect(cb[0] - ch * 0.1, cb[1] - ch * 0.6, ch * 0.2, ch * 0.1);
        c.fillRect(cb[0] - ch * 0.07, cb[1] - ch * 0.82, ch * 0.14, ch * 0.08);
      }
    } else if (s === 'road') {
      sky('#4F8FB0', '#D6E8EA');
      fill('#6FA9C0', [[0, hy], [W * 0.2, hy - H * 0.05], [W * 0.45, hy - H * 0.02], [W * 0.7, hy - H * 0.07], [W, hy - H * 0.02], [W, hy]]);
      c.fillStyle = GRASS; c.fillRect(0, hy, W, H - hy);
      quad('#4A4F55', -1.25, 1.25, 0, 80);
      quad('#FFFFFF', -1.17, -1.13, 0, 80); quad('#FFFFFF', 1.13, 1.17, 0, 80);
      for (var v = 0; v < 3.4; v += 1.2) { quad('#FFFFFF', -0.03, 0.03, v, v + 0.55); }
      // the finish: a chequered line across the road under a gantry
      var fv = 3.6, fd = 0.24;
      quad('#FFFFFF', -1.25, 1.25, fv, fv + fd);
      for (var q = 0; q < 20; q++) {
        var qu = -1.25 + q * 0.125;
        quad('#1A1A1A', qu, qu + 0.125, fv + (q % 2 ? 0 : fd / 2), fv + (q % 2 ? fd / 2 : fd));
      }
      var gl = P(-1.45, fv + fd / 2), gr = P(1.45, fv + fd / 2), gu = unit(fv + fd / 2);
      var gh = gu * 1.5, bh = gu * 0.4, lw = Math.max(3, gu * 0.09);
      c.fillStyle = '#E8E8E8';
      c.fillRect(gl[0] - lw / 2, gl[1] - gh, lw, gh); c.fillRect(gr[0] - lw / 2, gr[1] - gh, lw, gh);
      var bx = gl[0] - lw / 2, bw = gr[0] - gl[0] + lw, by = gl[1] - gh - bh * 0.15;
      c.fillStyle = '#0B3B2E'; c.fillRect(bx, by, bw, bh);
      c.fillStyle = COLOURS.gold; c.fillRect(bx, by, bw, Math.max(2, bh * 0.1)); c.fillRect(bx, by + bh * 0.9, bw, Math.max(2, bh * 0.1));
      c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.font = '800 ' + Math.round(bh * 0.55) + 'px sans-serif';
      c.fillText('FINISH', bx + bw / 2, by + bh * 0.7, bw - 8);
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

  /* A finisher's medal, flat: two straps in the club's yellow from the top edge of the
     card down to a plain disc of the metal, a thin darker ring inside its edge, and the
     place on it. No shading or shadows. */
  function drawMedal(c, i, family) {
    var M = METALS[i.metal] || METALS.copper, r = i.r, cx = i.cx, cy = i.cy, top = cy - r * 0.6;
    c.save();
    // the straps: a V meeting just above the disc
    c.fillStyle = COLOURS.gold;
    [-1, 1].forEach(function (s) {
      var x0 = cx + s * r * 0.9, x1 = cx + s * r * 0.2;
      c.beginPath(); c.moveTo(x0 - r * 0.3, 0); c.lineTo(x0 + r * 0.3, 0);
      c.lineTo(x1 + r * 0.28, top); c.lineTo(x1 - r * 0.28, top); c.closePath(); c.fill();
    });
    // the disc and its ring
    c.fillStyle = M[0];
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = M[1]; c.lineWidth = Math.max(2, r * 0.1);
    c.beginPath(); c.arc(cx, cy, r * 0.78, 0, Math.PI * 2); c.stroke();
    // the place, sized to sit well inside the ring
    var size = Math.round(r * 0.58);
    c.fillStyle = M[2]; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 ' + size + 'px ' + family;
    while (c.measureText(i.words).width > r * 1.2 && size > 8) { size -= 1; c.font = '800 ' + size + 'px ' + family; }
    c.fillText(i.words, cx, cy + size * 0.06);
    c.restore();
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
        } else if (i.kind === 'medal') {
          drawMedal(c, i, i.font || fonts.display);
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

  var api = { SIZES: SIZES, COLOURS: COLOURS, day: day, placeWord: placeWord, medalFor: medalFor, improvement: improvement,
           cardName: cardName, surnameByDefault: surnameByDefault, seasonWords: seasonWords, facts: facts, whereWords: whereWords,
           caption: caption, fileName: fileName, headlineFor: headlineFor, cover: cover, parseFocus: parseFocus, move: move, ZOOM_MAX: ZOOM_MAX, STYLES: ['podium', 'photo', 'event'],
           SURFACES: Object.keys(SURFACES), setTracks: setTracks, sceneFor: sceneFor, sceneHasTrack: sceneHasTrack, layout: layout, overlaps: overlaps, render: render };
  return api;
}));
