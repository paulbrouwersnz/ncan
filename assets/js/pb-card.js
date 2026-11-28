/*
  PB share cards (Plan: PB share cards, extending Plan: Sharing athlete charts publicly).

  When an athlete sets a personal best, anyone who can see their page can make a
  club-branded image of it from the athlete page (assets/js/athlete.js): the event,
  the new mark, the improvement, the meeting and date, in the club's green and gold.
  It's made here in the browser from the page's own data, so nothing private leaves
  the device until the family chooses: the phone's share sheet or a download, or -
  for the athlete's GameDay contacts and admins - a public link through the same
  share API as charts (POST /v1/athletes/<address>/shares, view=pb-card).

  Race bib: the mark as the number on a white race bib, the event across its gold top,
  pinned to the club singlet (bottle green, its white panel and sweep, gold pinstripes).

  The first design is the Podium card: square (1080 x 1080, for Instagram and
  Facebook) or a 9:16 story (1080 x 1920). The card is laid out as a list of plain
  shapes and words (layout()), which the Node tests check without a browser
  (tests/js/pb-card.test.js), then drawn onto a canvas with the site's own fonts.
  (A picture made from SVG can't use the page's fonts, so it's drawn directly.)

  Privacy: no date of birth, no link to the private page; for children (a result
  with a grade, ages 7-14) the surname is off unless the sharer turns it on; the
  place is in the words only when it's 1st, 2nd or 3rd, and any other place only on
  the medal, when the sharer chooses Show place.

  Out of the stadium (cross country, road, trail: a.out), no PBs: the heading is the
  race win (or, with Show place, a top 10 finish), the race bib's ribbon gives the
  pace per km, and the card can say the athlete beat last year's race on the same
  course (the same distance, faster, or a faster pace; lastYear) and how many km
  they've raced this season.
*/
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./event-names.js') : root.NCANEventNames);
  if (node) { module.exports = api; }
  else { root.NCANPbCard = api; }
}(this, function (E) {
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
  // out of the stadium: a race win; with Show place, a top 10 finish too (the place is on
  // the medal); otherwise as any result
  function outHeadline(r, showPlace, place) {
    if (!r.relay && r.place === 1) { return 'RACE WIN'; }
    if (showPlace && r.place >= 4 && r.place <= 10) { return 'TOP 10 FINISH'; }
    return headlineFor('result', place);
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
  /* Progress line: p { points: [{ value, date }] oldest first, this mark last; span
     ("2026/27 season", "Since 2024/25") }. Two marks at least, or there's no line. */
  function progressFacts(p, r) {
    var pts = p && (p.points || []).filter(function (q) { return q && typeof q.value === 'number' && q.date; })
      .map(function (q) { return { value: q.value, date: q.date, mark: q.mark || '' }; });
    if (!pts || pts.length < 2) { return null; }
    var e = String(r.event || '').toLowerCase();
    var note = !r.field ? 'Up is faster' : /high jump|pole/.test(e) ? 'Up is higher' : 'Up is further';
    var hide = (p.hide || []).filter(function (m) { return m >= 1 && m <= 12; });
    return { points: pts, field: !!r.field, span: p.span || '', note: note, hide: hide.length < 12 ? hide : [] };
  }
  /* Last year's edition of the same race (its name without the year, 300 to 430 days
     before) beaten: { by: 'time', faster, mark } over the same distance, or { by: 'pace',
     pace, was } at another distance; null if not faster or not run. history: the
     athlete's results out of the stadium. */
  function edition(meeting) {
    var s = String(meeting || '').toLowerCase().replace(/\b(19|20)\d\d\b|\bno\.?\s*\d+\b|\bday\s*\d+\b/g, ' ');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function daysBetween(a, b) {
    var d = function (iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; };
    return d(a) - d(b);
  }
  function lastYear(r, history) {
    if (!r || typeof r.value !== 'number' || !r.date) { return null; }
    var same = edition(r.meeting);
    var before = (history || []).filter(function (p) {
      var gap = p && p.date ? daysBetween(r.date, p.date) : 0;
      return p !== r && typeof p.value === 'number' && gap >= 300 && gap <= 430 && edition(p.meeting) === same;
    });
    if (!before.length) { return null; }
    var match = before.filter(function (p) { return p.event === r.event; });
    if (match.length) {
      var best = match.reduce(function (a, b) { return b.value < a.value ? b : a; });
      return r.value < best.value ? { by: 'time', faster: Math.round((best.value - r.value) * 10) / 10, mark: best.mark || '' } : null;
    }
    var d = E.distance(r.event);
    var sized = before.filter(function (p) { return E.distance(p.event); });
    if (!d || !sized.length) { return null; }
    var paceOf = function (p) { return p.value / (E.distance(p.event) / 1000); };
    var was = Math.min.apply(null, sized.map(paceOf)), now = r.value / (d / 1000);
    return now < was ? { by: 'pace', pace: Math.round(now * 10) / 10, was: Math.round(was * 10) / 10 } : null;
  }
  // km raced this season, up to and including this race
  function kmThisSeason(r, history) {
    var m = 0;
    (history || []).forEach(function (p) {
      if (p && p.season === r.season && p.date <= r.date && p.mark) { m += E.distance(p.event) || 0; }
    });
    return m / 1000;
  }

  function facts(a) {
    var r = a.result || {}, kind = kindOf(a), place = r.relay ? '' : placeWord(r.place);
    var newpb = kind === 'newpb';
    var out = !!a.out;
    // showPlace: the place on a medal in the corner, any place (a relay's: the team's place)
    var medal = a.showPlace ? medalFor(r.place) : null;
    if (medal) { place = ''; }     // said on the medal, so not in the words too
    // pbTitle false: a PB card without "Personal best" at the top (the sharer's choice);
    // it says the podium place there instead, or nothing
    var untitled = a.pbTitle === false && (kind === 'pb' || kind === 'newpb');
    var then = newpb && a.then && typeof a.then.value === 'number' ? a.then : null;
    return {
      kind: kind,
      medal: medal,
      untitled: untitled,
      headline: untitled ? (place ? place.toUpperCase() + ' PLACE' : '') : out ? outHeadline(r, a.showPlace, place) : headlineFor(kind, place),
      // Then and now: the earlier mark it's set against, what it was, and the gap
      then: then ? { mark: then.mark || '', date: day(then.date), label: then.label || 'Previous best' } : null,
      gap: then ? improvement(r, then) : '',
      progress: progressFacts(a.progress, r),
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
      place: kind === 'result' || untitled ? '' : place,
      group: a.group || '',
      // out of the stadium: beating last year in the gold line, the pace, km this season
      season: newpb ? seasonWords(a.pbsThisSeason || 0) : out && a.lastYear ? E.lastYearWords(a.lastYear) : '',
      out: out,
      pace: out && a.pace > 0 ? E.pace(a.pace) : '',
      km: out && a.km > 0 ? E.km(a.km * 1000) + ' km raced this season' : ''
    };
  }

  // "New PB for Sam! 100m in 14.10 at Interclub 5 👏 #NCANathletics"
  function caption(f) {
    var who = f.name || 'our athlete', at = (f.meeting ? ' at ' + f.meeting : '') + ' 👏 #NCANathletics';
    if (f.kind === 'sb') { return 'Season best for ' + who + '! ' + f.event + ' in ' + f.mark + at; }
    if (f.kind === 'result' || f.untitled) {
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
    if (style === 'thennow' && f.then) { return thenNowLayout(f, shape); }
    if (style === 'progress' && f.progress) { return progressLayout(f, shape); }
    if (style === 'bib') { return bibLayout(f, shape); }
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
    t(f.headline || (f.untitled ? '' : 'PERSONAL BEST'), pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2, max: narrow });
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

  /* What the club-colour designs share: the green card, the headline, name and group at
     the top (the medal beside them), and the crest at the bottom. band: [y, h] of the
     lighter band the design puts its marks in. */
  function clubFrame(f, shape, band) {
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
    items.push({ kind: 'rect', x: 0, y: band[0], w: W, h: band[1], colour: COLOURS.bg2 });
    var P = story ? { head: 84, headSize: 22, name: 140, nameSize: 44, group: 174 }
                  : { head: 70, headSize: 18, name: 106, nameSize: 32, group: 130 };
    var md = f.medal ? medalItem(f.medal, W, pad, story) : null, narrow = W - 2 * pad - (md ? 2 * md.r + 16 : 0);
    t(f.headline || (f.untitled ? '' : 'PERSONAL BEST'), pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2, max: narrow });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display', max: narrow });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.soft, max: narrow });
    if (md) { items.push(md); }
    var crest = function () {
      var lh = story ? 60 : 46;
      items.push({ kind: 'logo', x: pad, y: H - pad - lh, h: lh, w: lh * 888 / 508 });
      t('North Canterbury', pad + lh * 888 / 508 + 10, H - pad - lh * 0.52, 14, { weight: 700, font: 'display' });
      t('Athletic Club', pad + lh * 888 / 508 + 10, H - pad - lh * 0.12, 14, { weight: 700, font: 'display' });
      t('ncan.nz', W - pad, H - pad - lh * 0.3, 15, { weight: 600, colour: COLOURS.soft, align: 'right', max: 120 });
      return { w: W, h: H, items: items };
    };
    return { W: W, H: H, pad: pad, story: story, items: items, t: t, crest: crest };
  }

  /* Race bib: the club singlet behind, the headline, name and group at the top, then a
     white bib pinned on: the event on its gold top, the mark as its number, the gap on a
     gold ribbon, the meeting and date. The other lines under it, the crest at the foot. */
  var BIB_TILT = -2.5;          // degrees
  var SINGLET = { green: '#0E4634', white: '#F7F7F2', gold: '#E2BD2F', ink: '#141414', inkSoft: '#4A4A4A' };
  function bibLayout(f, shape) {
    var S = SIZES[shape] || SIZES.square, W = S.w, H = S.h, pad = 40, story = shape === 'story';
    var items = [];
    var t = function (words, x, y, size, o) {
      if (!words) { return; }
      o = o || {};
      items.push({ kind: 'text', words: words, x: x, y: y, size: size, weight: o.weight || 400,
                   font: o.font || 'sans', colour: o.colour || COLOURS.text, align: o.align || 'left',
                   max: o.max || W - 2 * pad, spacing: o.spacing || 0 });
    };
    var P = story
      ? { head: 84, headSize: 22, name: 140, nameSize: 44, group: 174, bib: [50, 256, 440, 452], top: 78, event: 307, eventSize: 32,
          ncan: 20, mark: 506, markSize: 144, rib: [540, 240, 56, 29], meet: 650, meetSize: 20, date: 682, dateSize: 17,
          pins: [[78, 362], [462, 362], [78, 682], [462, 682]], lines: 768, step: 34, size: 20, logo: 60 }
      : { head: 70, headSize: 18, name: 106, nameSize: 32, group: 130, bib: [60, 146, 420, 258], top: 48, event: 178, eventSize: 22,
          ncan: 16, mark: 282, markSize: 88, rib: [298, 176, 32, 18], meet: 356, meetSize: 14, date: 377, dateSize: 13,
          pins: [[78, 212], [462, 212], [78, 386], [462, 386]], lines: 428, step: 19, size: 14, logo: 46 };
    items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: SINGLET.green });
    items.push({ kind: 'singlet', w: W, h: H });
    var md = f.medal ? medalItem(f.medal, W, pad, story) : null, narrow = W - 2 * pad - (md ? 2 * md.r + 16 : 0);
    t(f.headline || (f.untitled ? '' : 'PERSONAL BEST'), pad, P.head, P.headSize, { weight: 800, font: 'display', colour: SINGLET.gold, spacing: 2, max: narrow });
    t(f.name, pad, P.name, P.nameSize, { weight: 800, font: 'display', max: narrow });
    t(f.group, pad, P.group, P.headSize - 3, { colour: COLOURS.soft, max: narrow });
    if (md) { items.push(md); }

    // the bib
    var bx = P.bib[0], by = P.bib[1], bw = P.bib[2], bh = P.bib[3], cx = bx + bw / 2, from = items.length;
    items.push({ kind: 'rect', x: bx, y: by, w: bw, h: bh, colour: '#FBFAF5', round: 14, drop: true });
    items.push({ kind: 'rect', x: bx, y: by, w: bw, h: P.top, colour: SINGLET.gold, round: 14 });
    items.push({ kind: 'rect', x: bx, y: by + P.top - 16, w: bw, h: 16, colour: SINGLET.gold });
    items.push({ kind: 'pins', pts: P.pins, r: story ? 8 : 6.5 });
    t(f.event, bx + 24, P.event, P.eventSize, { weight: 800, font: 'display', colour: SINGLET.ink, max: bw - 60 - P.ncan * 4.2 });
    t('ncan.nz', bx + bw - 24, P.event, P.ncan, { weight: 800, font: 'display', colour: SINGLET.ink, align: 'right', max: P.ncan * 4.2 });
    t(f.mark, cx, P.mark, P.markSize, { weight: 800, font: 'display', colour: SINGLET.ink, align: 'center', max: bw - 60 });
    if (f.better || f.pace) {
      var rw = P.rib[1], rh = P.rib[2];
      items.push({ kind: 'rect', x: cx - rw / 2, y: P.rib[0], w: rw, h: rh, colour: SINGLET.gold, round: rh / 2 });
      t(f.better ? 'PB ' + f.better : f.pace, cx, P.rib[0] + rh * 0.7, P.rib[3], { weight: 800, font: 'display', colour: SINGLET.ink, align: 'center' });
    }
    t(f.meeting, cx, P.meet, P.meetSize, { weight: 700, colour: SINGLET.ink, align: 'center', max: bw - 120 });
    t([f.date, f.where].filter(Boolean).join(' · '), cx, P.date, P.dateSize, { colour: SINGLET.inkSoft, align: 'center', max: bw - 120 });
    // the bib pinned on a little crooked, as they always are
    items.slice(from).forEach(function (i) { i.tilt = [cx, by + bh / 2, BIB_TILT]; });

    // under the bib, left of the singlet's sweep: the earlier best, place and wind, the season
    var y = P.lines;
    [[[f.was ? 'Previous best ' + f.was : '', f.place, f.wind].filter(Boolean).join(' · '), { weight: 600 }],
     [f.season, { colour: COLOURS.goldSoft, weight: 600 }],
     [f.km, { colour: COLOURS.soft, weight: 600 }]].forEach(function (l) {
      if (l[0] && y < H - pad - P.logo - 4) { t(l[0], pad, y, P.size, { weight: l[1].weight, colour: l[1].colour, max: W * 0.5 }); y += P.step; }
    });

    // the club's crest and name (ncan.nz is on the bib)
    var lh = P.logo;
    items.push({ kind: 'logo', x: pad, y: H - pad - lh, h: lh, w: lh * 888 / 508 });
    t('North Canterbury', pad + lh * 888 / 508 + 10, H - pad - lh * 0.52, 14, { weight: 700, font: 'display', max: 150 });
    t('Athletic Club', pad + lh * 888 / 508 + 10, H - pad - lh * 0.12, 14, { weight: 700, font: 'display', max: 150 });
    return { w: W, h: H, items: items };
  }

  // the club singlet, filling the card: the white panel down the right, its sweep up
  // across the chest edged with gold pinstripes, white hatching above, gold trim at the top
  function drawSinglet(c, i) {
    var W = i.w, H = i.h;
    var poly = function (col, pts) {
      c.fillStyle = col; c.beginPath();
      pts.forEach(function (p, k) { if (k) { c.lineTo(p[0], p[1]); } else { c.moveTo(p[0], p[1]); } });
      c.closePath(); c.fill();
    };
    var line = function (col, wd, a, b, dash) {
      c.save(); c.strokeStyle = col; c.lineWidth = wd; if (dash) { c.setLineDash(dash); }
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.restore();
    };
    poly(SINGLET.white, [[W * 0.9, 0], [W, 0], [W, H], [W * 0.87, H]]);
    poly(SINGLET.white, [[W * 0.56, H], [W * 0.74, H], [W, H * 0.5], [W, H * 0.22]]);
    line('rgba(255,255,255,.85)', 10, [W * 0.52, H], [W, H * 0.14], [3, 5]);
    line(SINGLET.gold, 4, [W * 0.545, H], [W, H * 0.19]);
    line(SINGLET.gold, 4, [W * 0.765, H], [W, H * 0.53]);
    line(SINGLET.gold, 2, [W * 0.785, H], [W, H * 0.565]);
    c.fillStyle = SINGLET.gold; c.fillRect(0, 0, W, 5);
  }
  // safety pins at the bib's corners
  function drawPins(c, i) {
    i.pts.forEach(function (p) {
      c.fillStyle = '#D9D9D9'; c.strokeStyle = '#8A8A8A'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(p[0], p[1], i.r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(p[0] - i.r * 1.4, p[1]); c.lineTo(p[0] + i.r * 1.4, p[1]); c.stroke();
    });
  }

  /* Then and now: the earlier mark (faded) and the new one (bold, gold) side by side, an
     arrow between, each with its date, and the gap on a gold ribbon. */
  function thenNowLayout(f, shape) {
    var story = shape === 'story';
    var P = story
      ? { band: [240, 360], event: 296, eventSize: 30, label: 360, labelSize: 17, mark: 436, thenSize: 50, nowSize: 66,
          date: 480, dateSize: 19, rib: [526, 54, 30], lines: 664, step: 36, size: 22 }
      : { band: [148, 182], event: 182, eventSize: 24, label: 210, labelSize: 12, mark: 258, thenSize: 42, nowSize: 56,
          date: 282, dateSize: 14, rib: [296, 26, 17], lines: 356, step: 22, size: 15 };
    var C = clubFrame(f, shape, P.band), W = C.W, t = C.t, items = C.items;
    var aw = story ? 36 : 26;
    // Each mark is centred in its half and shrinks to keep clear of the arrow in the middle.
    var left = W * (story ? 0.24 : 0.27), right = W - left, half = 2 * (W / 2 - left) - aw - (story ? 28 : 20);
    t(f.event, W / 2, P.event, P.eventSize, { weight: 700, font: 'display', align: 'center' });
    t(f.then.label.toUpperCase(), left, P.label, P.labelSize, { weight: 700, colour: COLOURS.soft, align: 'center', spacing: 1, max: half });
    t('NOW', right, P.label, P.labelSize, { weight: 700, colour: COLOURS.gold, align: 'center', spacing: 1, max: half });
    t(f.then.mark, left, P.mark, P.thenSize, { weight: 700, font: 'display', colour: COLOURS.soft, align: 'center', max: half });
    t(f.mark, right, P.mark, P.nowSize, { weight: 800, font: 'display', colour: COLOURS.gold, align: 'center', max: half });
    t(f.then.date, left, P.date, P.dateSize, { colour: COLOURS.soft, align: 'center', max: half });
    t(f.date, right, P.date, P.dateSize, { align: 'center', max: half });
    items.push({ kind: 'arrow', x1: W / 2 - aw / 2, x2: W / 2 + aw / 2, y: P.mark - P.nowSize * 0.32, size: story ? 12 : 9, colour: COLOURS.gold });
    if (f.gap) {
      var rh = P.rib[1], rw = story ? 200 : 130, ry = P.rib[0];
      items.push({ kind: 'rect', x: (W - rw) / 2, y: ry, w: rw, h: rh, colour: COLOURS.gold, round: rh / 2 });
      t(f.gap, W / 2, ry + rh * 0.7, P.rib[2], { weight: 800, font: 'display', colour: COLOURS.ink, align: 'center', max: rw - 16 });
    }
    var y = P.lines;
    [[[f.place, f.wind].filter(Boolean).join(' · '), { weight: 600 }],
     [f.meeting, { weight: 600 }],
     [f.where, { colour: COLOURS.soft }],
     [f.season, { colour: COLOURS.goldSoft, weight: 600 }]].forEach(function (l) {
      if (l[0]) { t(l[0], W / 2, y, P.size, Object.assign({ align: 'center' }, l[1])); y += P.step; }
    });
    return C.crest();
  }

  /* Progress line: every mark in the event (and weight) from the chosen season up to
     this one, as a line that climbs as the athlete improves (times are turned upside
     down, so up is always better), this mark circled in gold, with the first and last
     dates under it (the first with its mark). f.progress: { points: [{ value, date, mark }], field, span, note }, oldest
     first, this mark last. */
  function progressLayout(f, shape) {
    var story = shape === 'story', pr = f.progress;
    var P = story
      ? { band: [230, 410], event: 280, eventSize: 30, note: 312, noteSize: 17, plot: [340, 236], dates: 614, dateSize: 17,
          mark: 724, markSize: 80, lines: 778, step: 34, size: 21 }
      : { band: [148, 198], event: 176, eventSize: 22, note: 198, noteSize: 12, plot: [206, 112], dates: 334, dateSize: 12,
          mark: 384, markSize: 42, lines: 410, step: 20, size: 15 };
    var C = clubFrame(f, shape, P.band), W = C.W, pad = C.pad, t = C.t, items = C.items;
    t(f.event, W / 2, P.event, P.eventSize, { weight: 700, font: 'display', align: 'center' });
    t(pr.note, pad, P.note, P.noteSize, { colour: COLOURS.soft, max: W / 2 - pad });
    t(pr.span, W - pad, P.note, P.noteSize, { colour: COLOURS.soft, align: 'right', max: W / 2 - pad });
    var x0 = pad + 14, x1 = W - pad - 14, y0 = P.plot[0] + 14, h = P.plot[1] - 28;
    items.push({ kind: 'chart', x: pad, y: P.plot[0], w: W - 2 * pad, h: P.plot[1], story: story,
                 points: chartPoints(pr.points, pr.field, x0, x1, y0, h, pr.hide) });
    var pts = pr.points;
    t([pts[0].mark, day(pts[0].date)].filter(Boolean).join(' · '), pad, P.dates, P.dateSize, { colour: COLOURS.soft, max: W / 2 - pad });
    t(day(pts[pts.length - 1].date), W - pad, P.dates, P.dateSize, { colour: COLOURS.soft, align: 'right', max: W / 2 - pad });
    t(f.mark, W / 2, P.mark, P.markSize, { weight: 800, font: 'display', colour: COLOURS.gold, align: 'center' });
    var y = P.lines;
    [[[f.better ? 'PB ' + f.better : '', f.place, f.wind].filter(Boolean).join(' · '), { weight: 700, colour: COLOURS.goldSoft }],
     [[f.meeting, f.date].filter(Boolean).join(' · '), { weight: 600 }],
     [f.where, { colour: COLOURS.soft }]].forEach(function (l) {
      if (l[0]) { t(l[0], W / 2, y, P.size, Object.assign({ align: 'center' }, l[1])); y += P.step; }
    });
    return C.crest();
  }
  /* Where each mark sits in the plot (x from x0 to x1 by date, y within y0..y0+h, better
     higher); evenly spaced when every mark is on the same day. hide: the calendar months
     (1-12) with no result for the event in any season, as the progress chart's Hide empty
     months finds them: taken out of the date axis quietly, with no break drawn. */
  function chartPoints(points, field, x0, x1, y0, h, hide) {
    var dn = function (iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; };
    var ds = points.map(function (p) { return dn(p.date); }), vs = points.map(function (p) { return p.value; });
    if (hide && hide.length) { ds = shownDays(ds, hide); }
    var dMin = Math.min.apply(null, ds), dMax = Math.max.apply(null, ds);
    var vMin = Math.min.apply(null, vs), vMax = Math.max.apply(null, vs), n = points.length;
    return points.map(function (p, i) {
      var fx = dMax > dMin ? (ds[i] - dMin) / (dMax - dMin) : n > 1 ? i / (n - 1) : 0.5;
      var fy = vMax > vMin ? (p.value - vMin) / (vMax - vMin) : 0.5;
      if (!field) { fy = 1 - fy; }   // a faster time is higher
      return { x: Math.round((x0 + fx * (x1 - x0)) * 10) / 10, y: Math.round((y0 + (1 - fy) * h) * 10) / 10 };
    });
  }
  // day numbers (sorted, oldest first) as days counted from the first, leaving out
  // the days of hidden months
  function shownDays(ds, hide) {
    var off = {};
    hide.forEach(function (m) { off[m] = true; });
    var start = Math.min.apply(null, ds);
    var upTo = function (to) {
      var d = new Date(start * 864e5), y = d.getUTCFullYear(), m = d.getUTCMonth(), n = 0;
      for (;;) {
        var a = Math.max(start, Date.UTC(y, m, 1) / 864e5), b = Math.min(to, Date.UTC(y, m + 1, 1) / 864e5);
        if (a >= to) { return n; }
        if (!off[m + 1]) { n += b - a; }
        if (++m > 11) { m = 0; y++; }
      }
    };
    return ds.map(upTo);
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
    t(f.headline || (f.untitled ? '' : 'PERSONAL BEST'), pad, P.head, P.headSize, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2, max: narrow });
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
  var SURFACES = { blue: { track: '#0072B5', line: 'rgba(255,255,255,.92)' },
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
      // the mat sits where the surfaced fan meets the grass, the uprights just in front of it, and the bar
      // well above the mat's leading edge, resting on a peg on each upright
      stadium();
      var lift = function (u, v, h) { var p = P(u, v); return [p[0], p[1] - unit(v) * h]; };
      var MF = 3, MB = 5.6, MU = 1.3, MH = 0.42;
      quad(S.track, -8, 8, 0, MF + 0.5);                                        // the fan, ending under the mat
      fill('#1B3F7A', [P(-MU, MF), P(MU, MF), lift(MU, MF, MH), lift(-MU, MF, MH)]);            // the mat's front
      fill('#2F5FA8', [lift(-MU, MF, MH), lift(MU, MF, MH), lift(MU, MB, MH), lift(-MU, MB, MH)]);  // its top
      line('rgba(255,255,255,.75)', 2, [lift(-MU, MF, MH * 0.7), lift(MU, MF, MH * 0.7)]);
      var bar = (MH + 0.14) * 2, ux = MU + 0.15, uv = MF - 0.12;
      [-ux, ux].forEach(function (u) {
        var foot = P(u, uv), w = unit(uv) * 0.16;
        c.fillStyle = '#333333'; c.fillRect(foot[0] - w, foot[1] - 3, w * 2, 6);
        line('#D8D8D8', Math.max(3, unit(uv) * 0.035), [foot, lift(u, uv, bar + 0.3)]);
        line('#333333', Math.max(3, unit(uv) * 0.03), [lift(u, uv, bar - 0.04), lift(u * 0.94, uv, bar - 0.04)]);   // the peg
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

  // Then and now's arrow: a short gold line with a head, pointing to the new mark
  function drawArrow(c, i) {
    c.save();
    c.strokeStyle = i.colour; c.fillStyle = i.colour; c.lineWidth = i.size * 0.45; c.lineCap = 'round';
    c.beginPath(); c.moveTo(i.x1, i.y); c.lineTo(i.x2 - i.size * 0.6, i.y); c.stroke();
    c.beginPath(); c.moveTo(i.x2, i.y); c.lineTo(i.x2 - i.size, i.y - i.size * 0.7);
    c.lineTo(i.x2 - i.size, i.y + i.size * 0.7); c.closePath(); c.fill();
    c.restore();
  }
  /* Progress line: a faint floor and ceiling, the line through every mark (small white
     dots), and the last mark - this one - as a big gold dot in a gold ring. */
  function drawChart(c, i) {
    var p = i.points, big = i.story ? 1.5 : 1;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1;
    [i.y + 0.5, i.y + i.h - 0.5].forEach(function (y) { c.beginPath(); c.moveTo(i.x, y); c.lineTo(i.x + i.w, y); c.stroke(); });
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2.5 * big; c.lineJoin = 'round';
    c.beginPath();
    p.forEach(function (q, n) { if (n) { c.lineTo(q.x, q.y); } else { c.moveTo(q.x, q.y); } });
    c.stroke();
    c.fillStyle = COLOURS.text;
    var dot = p.length > 40 ? 2 : 3.5;
    p.slice(0, -1).forEach(function (q) { c.beginPath(); c.arc(q.x, q.y, dot * big, 0, Math.PI * 2); c.fill(); });
    var last = p[p.length - 1];
    c.strokeStyle = COLOURS.gold; c.lineWidth = 3 * big;
    c.beginPath(); c.arc(last.x, last.y, 11 * big, 0, Math.PI * 2); c.stroke();
    c.fillStyle = COLOURS.gold;
    c.beginPath(); c.arc(last.x, last.y, 5.5 * big, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* Browser only: the card as a canvas. fonts { display, sans } are CSS font-family
     lists; waits for them so the first card isn't drawn in a fallback font. */
  function render(f, shape, fonts, opts) {
    opts = opts || {};
    var style = opts.style === 'photo' && opts.photo ? 'photo'
      : ['event', 'thennow', 'progress', 'bib'].indexOf(opts.style) >= 0 ? opts.style : 'podium';
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
        // tilted (the race bib): turned about [x, y] by its angle; drop: a soft shadow under it
        if (i.tilt) { c.save(); c.translate(i.tilt[0], i.tilt[1]); c.rotate(i.tilt[2] * Math.PI / 180); c.translate(-i.tilt[0], -i.tilt[1]); }
        if (i.drop) { c.save(); c.shadowColor = 'rgba(0,0,0,.42)'; c.shadowBlur = 22; c.shadowOffsetX = 5; c.shadowOffsetY = 10; }
        draw(i);
        if (i.drop) { c.restore(); }
        if (i.tilt) { c.restore(); }
      });
      function draw(i) {
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
        } else if (i.kind === 'singlet') {
          drawSinglet(c, i);
        } else if (i.kind === 'pins') {
          drawPins(c, i);
        } else if (i.kind === 'medal') {
          drawMedal(c, i, i.font || fonts.display);
        } else if (i.kind === 'arrow') {
          drawArrow(c, i);
        } else if (i.kind === 'chart') {
          drawChart(c, i);
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
      }
      return canvas;
    });
  }

  var api = { SIZES: SIZES, COLOURS: COLOURS, day: day, placeWord: placeWord, medalFor: medalFor, improvement: improvement,
           cardName: cardName, surnameByDefault: surnameByDefault, seasonWords: seasonWords, facts: facts, whereWords: whereWords,
           caption: caption, fileName: fileName, headlineFor: headlineFor, lastYear: lastYear, kmThisSeason: kmThisSeason, cover: cover, parseFocus: parseFocus, move: move, ZOOM_MAX: ZOOM_MAX, STYLES: ['podium', 'photo', 'event', 'thennow', 'progress', 'bib'], chartPoints: chartPoints,
           SURFACES: Object.keys(SURFACES), setTracks: setTracks, sceneFor: sceneFor, sceneHasTrack: sceneHasTrack, layout: layout, overlaps: overlaps, render: render };
  return api;
}));
