/*
  Seasons on the athlete page's event charts. A season runs 1 April to 31 March,
  written "2026/27", the same rule as the API's season_of() (ncan-api collect.py),
  so the chart's bands always agree with the season filter and the "Season best"
  badges. Within a season, winter (April to September) is shaded light grey and
  summer (October to March) left white.

  Also the maths for the zoomed chart: its date range chips (All results, This
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

  return { seasonOf: seasonOf, bounds: bounds, spans: spans, boundaries: boundaries, label: label,
           bests: bests, RANGES: RANGES, range: range, inRange: inRange, slug: slug, step: step,
           nextDay: nextDay };
}));
