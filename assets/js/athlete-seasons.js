/*
  Seasons on the athlete page's event charts. A season runs 1 April to 31 March,
  written "2026/27", the same rule as the API's season_of() (ncan-api collect.py),
  so the chart's bands always agree with the season filter and the "Season best"
  badges. Within a season, winter (April to September) is shaded light grey and
  summer (October to March) left white.

  Also the maths for hiding empty months (months with no result in any season),
  the By season view's maths (each date's day within its season, and each
  season's colour), and the maths for the zoomed chart: its date range chips (All results, This
  season, Last season, Last 12 months, Pick dates) and its #/<athlete>/chart/<event>
  address.

  Dates are 'YYYY-MM-DD' text, compared as text, so time zones never matter.
  Kept apart from athlete.js so the Node tests can check it
  (tests/js/athlete-seasons.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANSeasons = api; }
}(this, function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function startYear(day) {
    var y = +day.slice(0, 4), m = +day.slice(5, 7);
    return m >= 4 ? y : y - 1;
  }
  function name(start) { return start + '/' + pad((start + 1) % 100); }

  // '2026-11-07' -> '2026/27'
  function seasonOf(day) { return name(startYear(day)); }

  // the first and last day of a season, from its name or start year
  function bounds(season) {
    var s = typeof season === 'number' ? season : +String(season).slice(0, 4);
    return { from: iso(s, 4, 1), to: iso(s + 1, 3, 31) };
  }

  // The day after (dates as text).
  function nextDay(day) {
    var d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  /* The seasons and their winter and summer halves that a chart from `from` to
     `to` crosses, each cut to the chart: { season, from, to } for the seasons,
     and { kind: 'winter' | 'summer', season, from, to } for the halves.
     `to` is the last day shown (inclusive). */
  function spans(from, to) {
    var seasons = [], halves = [];
    if (!from || !to || from > to) { return { seasons: seasons, halves: halves }; }
    for (var s = startYear(from); s <= startYear(to); s++) {
      var b = bounds(s);
      seasons.push({ season: name(s), from: b.from < from ? from : b.from, to: b.to > to ? to : b.to,
                     whole: b.from >= from && b.to <= to });
      [['winter', iso(s, 4, 1), iso(s, 9, 30)], ['summer', iso(s, 10, 1), iso(s + 1, 3, 31)]].forEach(function (h) {
        if (h[2] < from || h[1] > to) { return; }
        halves.push({ kind: h[0], season: name(s), from: h[1] < from ? from : h[1], to: h[2] > to ? to : h[2] });
      });
    }
    return { seasons: seasons, halves: halves };
  }

  // Each 1 April strictly inside the chart: where one season ends and the next begins.
  function boundaries(from, to) {
    var out = [];
    if (!from || !to) { return out; }
    for (var y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
      var d = iso(y, 4, 1);
      if (d > from && d <= to) { out.push(d); }
    }
    return out;
  }

  /* A season's label: "2025/26", or "2026/27 (so far)" while it is under way; short
     ("25/26") on a narrow screen, where "(so far)" is dropped too. */
  function label(season, today, short) {
    var current = today && seasonOf(today) === season;
    if (short) { return season.slice(2); }
    return season + (current ? ' (so far)' : '');
  }

  /* The best mark in each season, per key: { 'key|2025/26': result }. `keyOf` gives
     a result's key (the event, or for a throw the event and weight), `better(a, b)`
     whether a beats b. Results without a number are skipped. */
  function bests(results, keyOf, better) {
    var out = {};
    results.forEach(function (r) {
      if (typeof r.value !== 'number') { return; }
      var k = keyOf(r) + '|' + (r.season || seasonOf(r.date));
      if (!out[k] || better(r, out[k])) { out[k] = r; }
    });
    return out;
  }

  /* The zoomed chart's range chips. `today` is 'YYYY-MM-DD'; `picked` is
     { from, to } for Pick dates (either may be empty). Returns { from, to }, either
     of which may be '' for no limit. */
  var RANGES = ['all', 'this', 'last', 'year', 'pick'];
  function range(kind, today, picked) {
    var s = startYear(today);
    if (kind === 'this') { return bounds(s); }
    if (kind === 'last') { return bounds(s - 1); }
    if (kind === 'year') {
      // the day after the same date a year ago (29 February a year ago is 28 February)
      var y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
      var last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
      return { from: nextDay(iso(y - 1, m, Math.min(d, last))), to: today };
    }
    if (kind === 'pick') {
      var f = (picked && picked.from) || '', t = (picked && picked.to) || '';
      if (f && t && f > t) { var x = f; f = t; t = x; }
      return { from: f, to: t };
    }
    return { from: '', to: '' };
  }
  function inRange(day, r) {
    return (!r.from || day >= r.from) && (!r.to || day <= r.to);
  }

  // An event's name in the address: "100m Hurdles" -> "100m-hurdles", "Shot Put 3kg" -> "shot-put-3kg"
  function slug(event) {
    return String(event).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // The next result to select with the arrow keys: stops at the ends.
  function step(count, at, dir) {
    if (!count) { return -1; }
    if (at < 0) { return dir > 0 ? 0 : count - 1; }
    return Math.max(0, Math.min(count - 1, at + dir));
  }

  /* The By season view: every season drawn on one April-to-March axis.
     dayOfSeason('2026-04-01') is 0 and '2027-03-31' is 365. Days are counted on a
     leap year's calendar, so 29 February is day 334 and 1 March is always day 335:
     the same date lines up in every season. */
  var SEASON_DAYS = 366;
  var MONTH_START = [0, 30, 61, 91, 122, 153, 183, 214, 244, 275, 306, 335];   // 1 April .. 1 March
  function dayOfSeason(day) {
    var m = +day.slice(5, 7), d = +day.slice(8, 10);
    return MONTH_START[(m + 8) % 12] + d - 1;
  }
  // each month's first day on that axis, for its labels: [{ day, month: 'Apr' }, ...]
  var MONTH_NAMES = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  function seasonMonths() {
    return MONTH_START.map(function (day, i) { return { day: day, month: MONTH_NAMES[i] }; });
  }

  /* Each season's colour, from the calendar's rainbow. A season keeps its colour
     whatever the filters (it goes by the season's start year), and colours repeat
     every seven seasons, so the key names every season. Ordered so seasons
     side by side never get look-alike colours. */
  var SEASON_COLOURS = ['#da404e', '#36892f', '#4385e4', '#ea6f2f', '#008f9f', '#aa4ba9', '#b16f23'];
  function seasonColour(season) {
    var y = +String(season).slice(0, 4);
    return SEASON_COLOURS[((y % 7) + 7) % 7];
  }

  /* Hide empty months. emptyMonths(days) gives the calendar months (1-12) with no
     result in any season: with no July result ever, July is empty. Only those are
     hidden, so a month with a result in any year always shows.
     squash(from, to, hide) lays out a date axis from `from` to `to` (day numbers,
     dayNum(), and may be fractional) with the hidden months taken out: the result's
     parts are the shown and hidden stretches in order, hidden ones at either end
     dropped. place(sq, n, inner, gap) is day number n's distance along an axis
     `inner` wide, where each run of hidden months is a break `gap` wide. */
  function dayNum(day) { return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5; }
  // the By season axis on day numbers: a season with a 29 February, so dayOfSeason() lines up
  var REF_SEASON = dayNum('2003-04-01');
  function emptyMonths(days) {
    var seen = {}, out = [];
    days.forEach(function (d) { if (d) { seen[+d.slice(5, 7)] = true; } });
    if (!Object.keys(seen).length) { return out; }
    for (var m = 1; m <= 12; m++) { if (!seen[m]) { out.push(m); } }
    return out;
  }
  function squash(from, to, hide) {
    var off = {}, parts = [];
    (hide || []).forEach(function (m) { off[m] = true; });
    if (!(to > from)) { return null; }
    var d = new Date(Math.floor(from) * 864e5);
    var y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (;;) {
      var a = Date.UTC(y, m, 1) / 864e5, b = Date.UTC(y, m + 1, 1) / 864e5;
      if (a >= to) { break; }
      a = Math.max(a, from); b = Math.min(b, to);
      var hid = !!off[m + 1], last = parts[parts.length - 1];
      if (last && last.hidden === hid) { last.b = b; } else { parts.push({ a: a, b: b, hidden: hid }); }
      if (++m > 11) { m = 0; y++; }
    }
    var whole = parts.length;
    while (parts.length && parts[0].hidden) { parts.shift(); }
    while (parts.length && parts[parts.length - 1].hidden) { parts.pop(); }
    var gaps = parts.filter(function (p) { return p.hidden; });
    // nothing hidden (or everything): the plain axis
    if (!parts.length || (!gaps.length && parts.length === whole)) { return null; }
    var shown = 0;
    parts.forEach(function (p) { if (!p.hidden) { shown += p.b - p.a; } });
    return { parts: parts, gaps: gaps.length, shown: shown, from: parts[0].a, to: parts[parts.length - 1].b };
  }
  function place(sq, n, inner, gap) {
    var room = inner - sq.gaps * gap, pos = 0;
    for (var i = 0; i < sq.parts.length; i++) {
      var p = sq.parts[i];
      if (p.hidden) {
        if (n <= p.a) { return pos; }            // the edge of the break
        if (n < p.b) { return pos + gap / 2; }   // inside a hidden month: the break's middle
      } else if (n <= p.b || i === sq.parts.length - 1) {
        return pos + (Math.max(p.a, Math.min(p.b, n)) - p.a) / sq.shown * room;
      }
      pos += p.hidden ? gap : (p.b - p.a) / sq.shown * room;
    }
    return pos;
  }
  // whether day number n falls in a hidden month (or off the squashed axis)
  function isHidden(sq, n) {
    if (n < sq.from || n > sq.to) { return true; }
    return sq.parts.some(function (p) { return p.hidden && n >= p.a && n < p.b; });
  }
  // the middle of each break, as a distance along the axis
  function breaks(sq, inner, gap) {
    var out = [];
    sq.parts.forEach(function (p) { if (p.hidden) { out.push(place(sq, (p.a + p.b) / 2, inner, gap)); } });
    return out;
  }

  return { seasonOf: seasonOf, bounds: bounds, spans: spans, boundaries: boundaries, label: label,
           bests: bests, RANGES: RANGES, range: range, inRange: inRange, slug: slug, step: step,
           nextDay: nextDay, SEASON_DAYS: SEASON_DAYS, dayOfSeason: dayOfSeason, seasonMonths: seasonMonths,
           SEASON_COLOURS: SEASON_COLOURS, seasonColour: seasonColour,
           dayNum: dayNum, REF_SEASON: REF_SEASON, emptyMonths: emptyMonths, squash: squash, place: place,
           isHidden: isHidden, breaks: breaks };
}));
