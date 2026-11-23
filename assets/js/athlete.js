(function () {
  'use strict';

  /* Athlete page ------------------------------------------------------
     Reads the athlete from the club's API (GET /v1/athletes/<id>; see
     assets/js/ncan-account.js), only for someone signed in who may see
     them: their family, a coach or an administrator. Anyone else gets
     "not found". The athlete is in the address after #/: a URL-safe version
     of their name (/athlete/#/sam-brown), given by the API, never a number
     (Privacy Act IPP 13), and the part after # never reaches the web server.
     A section of the page follows it (/athlete/#/sam-brown/out-of-stadia); an
     in-page link (#out-of-stadia) is kept in that form. An old link's number
     (#/24222905) still works and is swapped for the name.

     The filters (season, team, wind, events) feed every section: the
     personal bests, the charts and the table all describe the same set
     of results. */

  var SVG = 'http://www.w3.org/2000/svg';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var WIND_LIMIT = 2.0;   // over this a mark is wind-assisted
  // events that change implement or height between grades
  var SPEC_CHANGES = /shot|discus|javelin|hammer|hurdle|vortex|weight/i;
  // a meeting's running order: sprints, distance, hurdles, walks, throws, jumps
  var FIELD_ORDER = ['Shot Put', 'Discus', 'Javelin', 'Hammer', 'Vortex',
                     'Long Jump', 'Triple Jump', 'High Jump', 'Pole Vault'];

  var $ = function (id) { return document.getElementById(id); };
  var athlete = null;
  // seasons on the charts (assets/js/athlete-seasons.js); the page still works without it
  var SEASONS = window.NCANSeasons || null;
  var SEASONS_ON = true;     // "Show seasons": winter bands and season names; kept on the device
  try { SEASONS_ON = localStorage.getItem('ncan-athlete-seasons') !== '0'; } catch (e) { /* default */ }
  var BY_SEASON = false;     // the charts' view: Timeline (false) or By season; kept on the device
  try { BY_SEASON = localStorage.getItem('ncan-athlete-chart-view') === 'season'; } catch (e) { /* default */ }
  var HIDE_EMPTY = false;    // "Hide empty months": off by default; kept on the device
  try { HIDE_EMPTY = localStorage.getItem('ncan-athlete-hide-months') === '1'; } catch (e) { /* default */ }
  // the downloaded image's shape: what's picked beside Download, which starts as last time's pick
  function storedShape() {
    try { return localStorage.getItem('ncan-chart-shape') || 'auto'; } catch (e) { return 'auto'; }
  }
  function shapeChoice() {
    var sel = document.getElementById('ath-zoom-shape');
    return sel && sel.value ? sel.value : storedShape();
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  var TODAY = isoOf(new Date());
  // what the last drawing of the charts used, for the enlarged chart
  var CHART = { groups: [], pbOf: {}, sbOf: {} };
  var eventsOff = {};    // events switched off with the chips

  function text(tag, cls, value) {
    var el = document.createElement(tag);
    if (cls) { el.className = cls; }
    if (value !== undefined && value !== null) { el.textContent = value; }
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function parseDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  // a Date's wall-clock time as a day number, the same count as NCANSeasons.dayNum()
  function dayNumOf(d) {
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 864e5;
  }
  function longDate(iso) { var d = parseDate(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function shortDate(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
  function ordinal(n) {
    if (10 <= n % 100 && n % 100 <= 20) { return n + 'th'; }
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  }

  /* Marks --------------------------------------------------------------- */

  function better(r) { return r.field ? 'higher' : 'lower'; }
  function isBetter(a, b) { return a.field ? a.value > b.value : a.value < b.value; }
  // only a timed mark can be wind-assisted: not a false start (FS), DNF or DQ
  function windy(r) { return !r.field && typeof r.value === 'number' && typeof r.wind === 'number' && r.wind > WIND_LIMIT; }
  // a wind-assisted mark is written with a w after it, as results lists do: 32.27w
  // Marks in words, not results-sheet shorthand: 'FS' is a false start, '15.87q'
  // is 15.87 (qualified for the next round, shown as its own tag). A wind-assisted
  // mark is said in words beside it rather than with a 'w'.
  var NO_MARK_WORDS = {
    FS: 'False start', DNF: 'Did not finish', DQ: 'Disqualified', DNS: 'Did not start',
    NM: 'No mark', ND: 'No distance', NH: 'No height', NT: 'No time',
    FOUL: 'Foul', F: 'Foul', UNTIMED: 'Untimed', UNMEASURED: 'Not measured'
  };
  // Marks as the official results show them (12.47, 2:44.87, 4.56m): the event
  // says whether it's a time or a distance. Field marks always end in m.
  function markText(r) {
    var m = (r.mark || '').trim();
    if (NO_MARK_WORDS[m.toUpperCase()]) { return NO_MARK_WORDS[m.toUpperCase()]; }
    m = m.replace(/\s*[qQ]$/, '');
    if (!m) { return '–'; }
    if (r.field && typeof r.value === 'number') { return m.replace(/\s*m$/i, '') + 'm'; }
    return m;
  }
  // The same mark in words, for chart descriptions read on their own or aloud:
  // 12.47 seconds, 2 minutes 44.87 seconds, 4.56 metres.
  function markSpoken(r) {
    if (typeof r.value !== 'number') { return markText(r); }
    var m = markText(r);
    if (r.field) { return m.replace(/m$/, '') + ' metres'; }
    var p = m.split(':');
    if (p.length === 1) { return m + ' seconds'; }
    if (p.length === 2) { return +p[0] + ' minute' + (+p[0] === 1 ? ' ' : 's ') + p[1] + ' seconds'; }
    return +p[0] + ' hour' + (+p[0] === 1 ? ' ' : 's ') + +p[1] + ' minutes ' + p[2] + ' seconds';
  }
  function qualified(r) { return typeof r.value === 'number' && /[qQ]$/.test((r.mark || '').trim()); }
  function windText(w) { return (w > 0 ? '+' : '') + w.toFixed(1); }

  // A result's age group: the grade the meeting recorded, or else the one worked
  // out from the member's birth year (U16-U20, Senior, Masters, or a grade).
  function groupOf(r) { return r.grade ? 'Grade ' + r.grade : r.age_group || ''; }
  function groupShort(r) { return r.grade ? String(r.grade) : (r.age_group || '').replace(/^Grade /, ''); }
  // for sorting: the age in years each group stands for
  function groupAge(r) {
    var g = groupOf(r), m = /(\d+)/.exec(g);
    if (!g) { return null; }
    if (g === 'Senior') { return 20; }
    if (g === 'Masters') { return 35; }
    return /^U/.test(g) ? +m[1] - 1 : +m[1];
  }

  // Throws: the implement's weight, as the meeting published it, or - with "Infer
  // unrecorded throw weights" ticked - the usual one for the grade or age group
  // (ncan-api's config/implements.json). Personal bests for throws are per weight.
  var INFER = false, PER_WEIGHT = false;
  try {
    INFER = localStorage.getItem('ncan-athlete-infer') === '1';
    PER_WEIGHT = localStorage.getItem('ncan-athlete-perweight') === '1';
  } catch (e) { /* defaults */ }
  function isThrow(r) { return THROWS.test(r.event); }
  function weightOf(r) { return r.implement || (INFER && r.implement_usual) || ''; }
  function weightGuessed(r) { return !r.implement && INFER && !!r.implement_usual; }
  function weightWords(r) {
    var w = weightOf(r);
    return w ? w + (weightGuessed(r) ? ' (usual for the grade)' : '') : 'weight not recorded';
  }
  // what a personal best is counted within: the event, and for a throw its weight
  function pbKey(r) { return isThrow(r) ? r.event + ' ' + (weightOf(r) || '(weight not recorded)') : r.event; }
  // lightest first; an unknown weight last
  function weightOrder(w) {
    var m = /([\d.]+)\s*(kg|g|lb)/.exec(w || '');
    if (!m) { return 1e9; }
    return m[2] === 'g' ? +m[1] / 1000 : m[2] === 'lb' ? +m[1] * 0.4536 : +m[1];
  }

  // Results that set a new personal best when they happened: in date order, each
  // wind-legal mark better than every earlier one in that event (and, for a throw,
  // at that weight; a first mark doesn't count). Worked out once over all results,
  // whatever is filtered.
  var newPb = [];
  function findNewPbs(all) {
    var bestSoFar = {};
    all.filter(function (r) { return typeof r.value === 'number' && !windy(r); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .forEach(function (r) {
        var k = pbKey(r), b = bestSoFar[k];
        if (b && isBetter(r, b)) { newPb.push(r); }
        if (!b || isBetter(r, b)) { bestSoFar[k] = r; }
      });
  }
  function isNewPb(r) { return newPb.indexOf(r) !== -1; }

  // seconds as 12.34 or 1:02.34; metres as 4.56m
  function formatValue(v, field, axis) {
    if (field) { return v.toFixed(2) + ' m'; }
    if (v >= 60 && axis) {
      // short enough for a chart's scale: 1:02 min, 1:02.5 min
      var am = Math.floor(v / 60), as = v - am * 60;
      var st = Math.abs(as - Math.round(as)) < 0.005 ? String(Math.round(as)) : as.toFixed(1);
      return am + ':' + (as < 10 ? '0' : '') + st + ' min';
    }
    if (v >= 60) {
      var m = Math.floor(v / 60), s = v - m * 60;
      return m + ' min ' + (s < 10 ? '0' : '') + s.toFixed(2) + ' s';
    }
    return v.toFixed(2) + ' s';
  }
  function difference(first, last, field) {
    var d = last - first;
    if (Math.abs(d) < 0.005) { return 'level'; }
    var good = field ? d > 0 : d < 0;
    var amount = field ? Math.abs(d).toFixed(2) + ' m' : Math.abs(d).toFixed(2) + ' s';
    return (good ? 'better by ' : 'down by ') + amount;
  }

  function eventRank(name) {
    var fi = FIELD_ORDER.indexOf(name);
    if (fi !== -1) { return 10000 + fi; }
    var m = /^(\d+)m/.exec(name);
    var dist = m ? +m[1] : 9000;
    if (/hurdle/i.test(name)) { return 5000 + dist; }
    if (/walk/i.test(name)) { return 7000 + dist; }
    return dist;
  }

  /* Filtering ----------------------------------------------------------- */

  function filters() {
    return { season: $('ath-season').value, team: $('ath-team').value, wind: $('ath-wind').checked };
  }
  function isFiltered(f) {
    return !!f.season || !!f.team || f.wind || Object.keys(eventsOff).some(function (k) { return eventsOff[k]; });
  }
  // what the page describes: results passing season, team and the event chips
  function shown() {
    var f = filters();
    return athlete.results.filter(function (r) {
      if (f.season && r.season !== f.season) { return false; }
      if (f.team === 'club' && !r.club) { return false; }
      if (f.team === 'rep' && r.club) { return false; }
      if (eventsOff[r.event]) { return false; }
      return true;
    });
  }
  // marks that can count as a best: numeric, and wind-legal when asked
  function countable(rs) {
    var f = filters();
    return rs.filter(function (r) { return typeof r.value === 'number' && !(f.wind && windy(r)); });
  }

  function byEvent(rs) {
    var out = {};
    rs.forEach(function (r) { (out[r.event] = out[r.event] || []).push(r); });
    return Object.keys(out).sort(function (a, b) { return eventRank(a) - eventRank(b) || a.localeCompare(b); })
      .map(function (name) { return { name: name, results: out[name] }; });
  }

  // as byEvent, but a throw is split by weight: "Shot Put 3kg", "Shot Put 4kg"
  function byWeight(rs) {
    var out = {}, first = {};
    rs.forEach(function (r) {
      var k = pbKey(r);
      (out[k] = out[k] || []).push(r);
      first[k] = first[k] || r;
    });
    return Object.keys(out).sort(function (a, b) {
      var ra = first[a], rb = first[b];
      return eventRank(ra.event) - eventRank(rb.event) || ra.event.localeCompare(rb.event) ||
             weightOrder(weightOf(ra)) - weightOrder(weightOf(rb));
    }).map(function (k) { return { name: k, results: out[k] }; });
  }

  function best(rs) {
    return rs.reduce(function (b, r) { return !b || isBetter(r, b) ? r : b; }, null);
  }

  /* Summary ------------------------------------------------------------- */

  // Totals for every result the season and team filters show - track and field
  // (the event chips too), and cross country, road and relay legs. A finished race
  // counts at its length (timed or "Untimed"), jumps and throws their marks.
  // Empty ones are left out.
  var JUMPS = /^(long jump|triple jump|high jump|pole vault)/i;
  var THROWS = /^(shot put|discus|javelin|hammer|vortex|weight throw|turbo jav)/i;
  function offTrackShown() {
    var f = filters();
    return (athlete.offTrack || []).filter(function (r) {
      if (f.season && r.season !== f.season) { return false; }
      if (f.team === 'club' && !r.club) { return false; }
      if (f.team === 'rep' && r.club) { return false; }
      return true;
    });
  }
  // 1st, 2nd and 3rd places, each in a block of its own with its medal; all three
  // once there's any podium, so the row reads the same from athlete to athlete
  var MEDALS = [['🥇', '1st place', '1st places'], ['🥈', '2nd place', '2nd places'], ['🥉', '3rd place', '3rd places']];
  // the medal row, emptied, made if needed; or none, taken away if it was there
  function medalRow(dl, wanted) {
    var row = document.getElementById(dl.id + '-medals');
    if (!wanted) {
      if (row) { row.parentNode.removeChild(row); }
      return null;
    }
    if (!row) {
      row = text('dl', 'stats__grid ath-stats ath-medals');
      row.id = dl.id + '-medals';
      row.setAttribute('aria-label', 'Podium places');
      dl.parentNode.insertBefore(row, dl.nextSibling);
    }
    row.textContent = '';
    return row;
  }
  function statBlock(dl, value, label, medal) {
    var div = text('div', medal ? 'stat stat--medal' : 'stat');
    var dt = text('dt');
    if (medal) {
      var icon = text('span', 'stat__medal', medal);
      icon.setAttribute('aria-hidden', 'true');
      dt.appendChild(icon);
    }
    dt.appendChild(document.createTextNode(value));
    div.appendChild(dt);
    div.appendChild(text('dd', null, label));
    dl.appendChild(div);
  }

  function renderStats(track) {
    var dl = $('ath-stats');
    dl.textContent = '';
    var away = offTrackShown();
    var rs = track.concat(away);
    $('glance').hidden = !rs.length && !(athlete.offTrack || []).length && !athlete.results.length;
    $('glance-note').textContent = away.length
      ? 'Track and field, with ' + away.length + ' cross country, road and relay result' +
        (away.length === 1 ? '' : 's') + '. The filters below narrow these too.'
      : (athlete.offTrack || []).length ? 'The filters below narrow these too.' : '';
    var t = { run: 0, walked: 0, jumped: 0, thrown: 0 }, meets = {}, seasons = {}, relays = {};
    var places = [0, 0, 0];
    rs.forEach(function (r) {
      meets[r.date + r.meeting] = 1;
      seasons[r.season] = 1;
      if (r.place >= 1 && r.place <= 3) {
        // a relay team's podium counts once, however many legs this athlete ran for it
        if (r.relay) { relays[[r.date, r.meeting, r.event, r.division || '', r.place, r.relay.team_mark || ''].join('|')] = r.place; }
        else { places[r.place - 1]++; }
      }
      // "800m", or "Cross country 3000m" / "Road relay 2000m" (a relay leg's length)
      var len = (r.oos ? /(\d+)m(?![a-z])/i : /^(\d+)m(?![a-z])/i).exec(r.event);
      var race = /walk/i.test(r.event) ? 'walked' : 'run';
      if (r.value === undefined || r.value === null) {
        if (len && /^untimed$/i.test(r.mark || '')) { t[race] += +len[1]; }
      } else if (JUMPS.test(r.event)) { t.jumped += r.value; }
      else if (THROWS.test(r.event)) { t.thrown += r.value; }
      else if (len) { t[race] += +len[1]; }
    });
    Object.keys(relays).forEach(function (k) { places[relays[k] - 1]++; });
    var podiums = places[0] + places[1] + places[2];
    var n = function (v, dp) { return v.toLocaleString('en-NZ', { maximumFractionDigits: dp || 0 }); };
    // metres, until 10,000 m reads better as km
    var dist = function (m) { return m >= 10000 ? n(m / 1000, 1) + ' km' : n(m, 1) + ' m'; };
    var many = function (k, one, more) { return [n(k), k === 1 ? one : more]; };
    [many(rs.length, 'Result', 'Results'), many(Object.keys(meets).length, 'Meeting', 'Meetings'),
     many(byEvent(rs).length, 'Event', 'Events'), many(Object.keys(seasons).length, 'Season', 'Seasons'),
     t.run ? [n(t.run / 1000, 1) + ' km', 'Run'] : null,
     t.walked ? [n(t.walked / 1000, 1) + ' km', 'Race walked'] : null,
     t.jumped ? [dist(t.jumped), 'Jumped'] : null,
     t.thrown ? [dist(t.thrown), 'Thrown'] : null].filter(Boolean).forEach(function (x) {
      statBlock(dl, x[0], x[1]);
    });
    // the medals: a row of their own, under the rest, only when there's a podium
    var row = medalRow(dl, podiums > 0);
    if (row) {
      MEDALS.forEach(function (m, i) { statBlock(row, n(places[i]), places[i] === 1 ? m[1] : m[2], m[0]); });
    }
    dl.hidden = false;
  }

  function renderPbs(groups) {
    var out = $('ath-pbs');
    out.textContent = '';
    var list = text('ul', 'ath-pbs__list');
    groups.forEach(function (g) {
      var marks = countable(g.results);
      var li = text('li', 'ath-pb');
      li.appendChild(text('h3', 'ath-pb__event', g.name));
      var pb = best(marks);
      if (!pb) {
        li.appendChild(text('p', 'ath-pb__mark ath-pb__mark--none', 'No mark'));
        li.appendChild(text('p', 'ath-pb__meta', g.results.length + ' result' + (g.results.length === 1 ? '' : 's') + ', none measured'));
      } else {
        var mark = text('p', 'ath-pb__mark');
        var a = text('a', 'records-source', markText(pb));
        a.href = pb.source; a.target = '_blank'; a.rel = 'noopener';
        a.title = 'Official result';
        mark.appendChild(a);
        li.appendChild(mark);
        li.appendChild(text('p', 'ath-pb__meta', longDate(pb.date) + (groupOf(pb) ? ' · ' + groupOf(pb) : '')));
        // a weight filled in from the grade, not published by the meeting: say so
        if (isThrow(pb) && g.results.some(weightGuessed)) {
          li.appendChild(text('p', 'ath-pb__meta ath-pb__guess', g.results.every(weightGuessed)
            ? 'Weight inferred from the grade: the meetings didn’t publish it.'
            : 'Includes results whose weight was inferred from the grade.'));
        }
        if (windy(pb)) {
          // a wind-assisted best doesn't count officially, so give the legal one too
          li.classList.add('ath-pb--wind');
          li.appendChild(text('p', 'ath-pb__wind', 'Wind-assisted ' + windText(pb.wind) + ' m/s'));
          var legal = best(marks.filter(function (r) { return !windy(r); }));
          var lp = text('p', 'ath-pb__legal');
          if (legal) {
            lp.appendChild(document.createTextNode('Best wind-legal: '));
            var la = text('a', 'records-source', markText(legal));
            la.href = legal.source; la.target = '_blank'; la.rel = 'noopener'; la.title = 'Official result';
            lp.appendChild(la);
            lp.appendChild(document.createTextNode(' · ' + longDate(legal.date)));
          } else {
            lp.textContent = 'No wind-legal mark yet';
          }
          li.appendChild(lp);
        }
        var sorted = marks.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
        if (sorted.length > 1) {
          li.appendChild(text('p', 'ath-pb__trend',
            sorted.length + ' marks · first to latest ' +
            difference(sorted[0].value, sorted[sorted.length - 1].value, pb.field)));
        } else {
          li.appendChild(text('p', 'ath-pb__trend', 'One mark so far'));
        }
      }
      list.appendChild(li);
    });
    out.appendChild(list);
  }

  /* Charts --------------------------------------------------------------
     Small multiples, one per event, all sharing the time axis of the
     results shown so they line up by date. Up is always better. */

  function niceStep(span, target) {
    var raw = span / target, pow = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / pow;
    return pow * (n < 1.5 ? 1 : n < 3 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10);
  }

  /* opts (all optional): W and H, the size; yTicks, about how many value labels;
     dateTicks, the span in days under which every result date is a tick; sbOf,
     each season's best (key|season -> result); zoom, drawn in the enlarged view
     (no maximise button, points select rather than open); select(i), called
     with the point picked; hide, the calendar months (1-12) to take out of the date
     axis (Hide empty months), each run of them drawn as a narrow // break.
     The By season view (BY_SEASON, for an event with results in more than one
     season) draws every season on one April-to-March axis instead, one line per
     season in its own colour, with the season names as the key. */
  function chart(group, t0, t1, pbOf, opts) {
    opts = opts || {};
    var W = opts.W || 600, H = opts.H || 250, L = 62, R = 18, T = 18, B = 40;
    var sbOf = opts.sbOf || {};
    var span = (t1 - t0) / 864e5;
    var field = group.results[0].field;
    // Same-day results (heats, semi, final) are spread a little sideways so each
    // can be seen and hovered: qualifying rounds first, then the rest in order.
    var pts = countable(group.results).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (qualified(b) ? 1 : 0) - (qualified(a) ? 1 : 0);
    });
    var SPREAD = $('ath-spread').checked ? 9 : 0;
    var sameDay = {};
    pts.forEach(function (p) { (sameDay[p.date] = sameDay[p.date] || []).push(p); });
    Object.keys(sameDay).forEach(function (d) {
      var day = sameDay[d];
      day.forEach(function (p, i) { p.dx = (i - (day.length - 1) / 2) * SPREAD; });
    });
    var px = function (p) { return x(p.date) + (p.dx || 0); };
    // the seasons charted, oldest first; By season needs at least two to compare
    var seasonOf = function (p) { return p.season || (SEASONS ? SEASONS.seasonOf(p.date) : ''); };
    var seasonsIn = [];
    pts.forEach(function (p) { var se = seasonOf(p); if (se && seasonsIn.indexOf(se) === -1) { seasonsIn.push(se); } });
    seasonsIn.sort();
    var canSwitch = !!SEASONS && seasonsIn.length > 1;
    var bySeason = canSwitch && BY_SEASON;
    // season bands and names: over 60 days only, as one season adds nothing
    var bands = !!SEASONS && SEASONS_ON && span > 60 && !bySeason;
    if (bands) { T = 34; }   // season names sit just above the chart area
    var card = text('figure', 'ath-chart' + (bySeason ? ' ath-chart--seasons' : ''));
    var cap = text('figcaption', 'ath-chart__title');
    cap.appendChild(text('span', 'ath-chart__name', group.name));
    var end = text('span', 'ath-chart__end');
    if (canSwitch) { end.appendChild(viewToggle(group, bySeason, opts.zoom)); }
    end.appendChild(text('span', 'ath-chart__dir', field ? '↑ further' : '↑ faster'));
    if (!opts.zoom && SEASONS) { end.appendChild(zoomButton(group)); }
    cap.appendChild(end);
    card.appendChild(cap);
    if (bySeason) {
      // the key: each season's name in its line's colour
      var key = text('ul', 'ath-chart__key');
      key.setAttribute('aria-label', 'Seasons');
      seasonsIn.forEach(function (se) {
        var li = text('li', SEASONS.seasonOf(TODAY) === se ? 'is-current' : null);
        li.setAttribute('style', '--season: ' + SEASONS.seasonColour(se));
        var sw = text('span', 'ath-key__swatch');
        sw.setAttribute('aria-hidden', 'true');
        li.appendChild(sw);
        li.appendChild(document.createTextNode(SEASONS.label(se, TODAY, false)));
        key.appendChild(li);
      });
      card.appendChild(key);
    }
    if (!pts.length) {
      card.appendChild(text('p', 'ath-chart__empty', 'No measured marks to chart.'));
      return card;
    }

    var lo = Math.min.apply(null, pts.map(function (p) { return p.value; }));
    var hi = Math.max.apply(null, pts.map(function (p) { return p.value; }));
    // at least 3% of the mark either side, so marks a hundredth apart still get a readable scale
    var pad = Math.max((hi - lo) * 0.15, hi * 0.03);
    lo = Math.max(0, lo - pad); hi += pad;
    var step = niceStep(hi - lo, opts.yTicks || 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

    // one date only: put it in the middle (dates compare by value, not as objects)
    var oneDay = +t1 === +t0;
    var x = bySeason
      ? function (d) { return L + SEASONS.dayOfSeason(d) / (SEASONS.SEASON_DAYS - 1) * (W - L - R); }
      : function (d) { return L + (oneDay ? (W - L - R) / 2 : (parseDate(d) - t0) / (t1 - t0) * (W - L - R)); };
    // Hide empty months: the axis without them, each run of them a break GAP wide
    var GAP = 14, EDGE = 8, sq = null;
    if (SEASONS && opts.hide && opts.hide.length && (bySeason || !oneDay)) {
      sq = bySeason ? SEASONS.squash(SEASONS.REF_SEASON, SEASONS.REF_SEASON + SEASONS.SEASON_DAYS, opts.hide)
                    : SEASONS.squash(dayNumOf(t0), dayNumOf(t1), opts.hide);
    }
    var sqX = function (n) { return L + EDGE + SEASONS.place(sq, n, W - L - R - 2 * EDGE, GAP); };
    var dayN = function (d) { return bySeason ? SEASONS.REF_SEASON + SEASONS.dayOfSeason(d) : SEASONS.dayNum(d); };
    if (sq) { x = function (d) { return sqX(dayN(d)); }; }
    // times: smaller is better, so smaller goes higher
    var y = function (v) { var f = (v - lo) / (hi - lo); return field ? T + (1 - f) * (H - T - B) : T + f * (H - T - B); };

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
                         'aria-label': group.name + ' progression, ' + pts.length + ' marks' +
                                       (bySeason ? '; by season, one line per season on an April to March axis' +
                                                   (SEASONS_ON ? ', winter months shaded grey' : '')
                                                 : bands ? '; grey bands mark winter months' : '') +
                                       (sq ? '; months with no results in any season left out' : '') });
    s.classList.add('ath-chart__svg');

    // seasons, behind everything: winter (April to September) shaded, a dashed line
    // at each 1 April, the season's name above, a faint "Winter" or "Summer" in each band
    if (bands) {
      var from = isoOf(t0), to = isoOf(t1), sp = SEASONS.spans(from, to);
      var xd = function (day) {
        return Math.max(L, Math.min(W - R, sq ? sqX(SEASONS.dayNum(day)) : L + (parseDate(day) - t0) / (t1 - t0) * (W - L - R)));
      };
      var short = !opts.zoom && window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
      sp.halves.forEach(function (h) {
        var a = xd(h.from), b = xd(SEASONS.nextDay(h.to));
        if (h.kind === 'winter') {
          s.appendChild(svg('rect', { x: a, y: T, width: Math.max(0, b - a), height: H - T - B, class: 'ath-winter' }));
        }
        if (b - a > 60) {
          var w = svg('text', { x: (a + b) / 2, y: H - B - 7, class: 'ath-band-word', 'aria-hidden': 'true' });
          w.textContent = h.kind === 'winter' ? 'Winter' : 'Summer';
          s.appendChild(w);
        }
      });
      SEASONS.boundaries(from, to).forEach(function (day) {
        if (sq && SEASONS.isHidden(sq, SEASONS.dayNum(day))) { return; }   // in a break
        var bx = xd(day);
        s.appendChild(svg('line', { x1: bx, x2: bx, y1: T - 4, y2: H - B, class: 'ath-season-line' }));
      });
      sp.seasons.forEach(function (se) {
        var a = xd(se.from), b = xd(SEASONS.nextDay(se.to));
        var words = SEASONS.label(se.season, TODAY, short);
        if (b - a < words.length * 6.6 + 8) { return; }   // too narrow: its name is in each point's label
        var sl = svg('text', { x: (a + b) / 2, y: T - 10, class: 'ath-season-label', 'aria-hidden': 'true' });
        sl.textContent = words;
        s.appendChild(sl);
      });
    }

    // By season: winter (April to September) shaded across the one season's axis
    if (bySeason && SEASONS_ON) {
      var oct = x('2000-10-01');
      s.appendChild(svg('rect', { x: L, y: T, width: oct - L, height: H - T - B, class: 'ath-winter' }));
      [['Winter', L, oct], ['Summer', oct, W - R]].forEach(function (h) {
        if (h[2] - h[1] < 60) { return; }   // too narrow, e.g. winter's months hidden
        var bw = svg('text', { x: (h[1] + h[2]) / 2, y: H - B - 7, class: 'ath-band-word', 'aria-hidden': 'true' });
        bw.textContent = h[0];
        s.appendChild(bw);
      });
    }

    // value grid
    for (var v = lo; v <= hi + step / 2; v += step) {
      var gy = y(v);
      s.appendChild(svg('line', { x1: L, x2: W - R, y1: gy, y2: gy, class: 'ath-grid' }));
      var lab = svg('text', { x: L - 8, y: gy + 4, class: 'ath-axis ath-axis--y' });
      lab.textContent = formatValue(v, field, true);
      s.appendChild(lab);
    }
    // date axis: each result date when close together, else month starts
    var ticks = [], dateTicks = opts.dateTicks || 60;
    if (bySeason) {
      // month starts, April to March
      var lastM = -Infinity;
      SEASONS.seasonMonths().forEach(function (m) {
        if (sq && SEASONS.isHidden(sq, SEASONS.REF_SEASON + m.day)) { return; }
        var mx = sq ? sqX(SEASONS.REF_SEASON + m.day) : L + m.day / (SEASONS.SEASON_DAYS - 1) * (W - L - R);
        s.appendChild(svg('line', { x1: mx, x2: mx, y1: H - B, y2: H - B + 5, class: 'ath-tick' }));
        if (mx - lastM < 34) { return; }
        lastM = mx;
        var ml = svg('text', { x: mx, y: H - B + 20, class: 'ath-axis ath-axis--x' });
        ml.textContent = m.month;
        s.appendChild(ml);
      });
    } else if (span <= dateTicks) {
      pts.forEach(function (p) { if (ticks.indexOf(p.date) === -1) { ticks.push(p.date); } });
      ticks = ticks.map(parseDate);
    } else {
      var d = new Date(t0.getFullYear(), t0.getMonth() + 1, 1);
      var wide = W > 700;   // the enlarged chart has room for more month starts
      var shownDays = sq ? sq.shown : span;   // with months hidden, fewer to fit
      var every = shownDays > (wide ? 1460 : 730) ? 6 : shownDays > (wide ? 730 : 365) ? 3 : 1;
      for (; d <= t1; d = new Date(d.getFullYear(), d.getMonth() + every, 1)) {
        if (!sq || !SEASONS.isHidden(sq, dayNumOf(d))) { ticks.push(d); }
      }
    }
    var lastTick = -Infinity;
    ticks.forEach(function (d) {
      var tx = sq ? sqX(dayNumOf(d)) : oneDay ? (W - L - R) / 2 + L : L + (d - t0) / (t1 - t0) * (W - L - R);
      s.appendChild(svg('line', { x1: tx, x2: tx, y1: H - B, y2: H - B + 5, class: 'ath-tick' }));
      if (tx - lastTick < 44) { return; }   // a tick, but no label on top of the last one
      lastTick = tx;
      var lab = svg('text', { x: tx, y: H - B + 20, class: 'ath-axis ath-axis--x' });
      lab.textContent = span <= dateTicks ? shortDate(d) : MONTHS[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear()).slice(2);
      s.appendChild(lab);
    });
    s.appendChild(svg('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'ath-baseline' }));
    // a // on the date axis where each run of hidden months was
    if (sq) {
      SEASONS.breaks(sq, W - L - R - 2 * EDGE, GAP).forEach(function (b) {
        var bx = L + EDGE + b, by = H - B;
        s.appendChild(svg('rect', { x: bx - 6, y: by - 4, width: 12, height: 8, class: 'ath-break-mask' }));
        [-3, 3].forEach(function (o) {
          s.appendChild(svg('line', { x1: bx + o - 2.5, y1: by + 6, x2: bx + o + 2.5, y2: by - 6, class: 'ath-break' }));
        });
      });
    }

    // The line breaks where the implement changes: for a throw where its weight
    // changes (labelled with the weight), for hurdles where the grade changes. A
    // chart for one weight has nothing to break.
    var throwChart = isThrow(group.results[0]);
    var breaks = throwChart ? !PER_WEIGHT : SPEC_CHANGES.test(group.name);
    var stage = throwChart ? weightOf : groupOf;
    // A result with no weight or grade recorded (school meetings give neither)
    // carries on from the one before, joining that line rather than starting one.
    var runs = [], run = [], known = null;
    pts.forEach(function (p) {
      var g = stage(p) || known;
      // By season: each season is its own line (results are in date order, so each season's are together)
      if (run.length && bySeason && seasonOf(p) !== seasonOf(run[0])) { runs.push(run); run = []; known = null; g = stage(p); }
      if (run.length && breaks && g && known && g !== known) { runs.push(run); run = []; }
      if (g) { known = g; }
      p.lineGrade = g;
      run.push(p);
    });
    runs.push(run);
    var lastLabel = -Infinity;
    runs.forEach(function (r) {
      if (r.length > 1) {
        var line = { 'class': 'ath-line',
          points: r.map(function (p) { return px(p) + ',' + y(p.value); }).join(' ') };
        if (bySeason) {
          var rse = seasonOf(r[0]);
          line['class'] += ' ath-line--season' + (rse === SEASONS.seasonOf(TODAY) ? ' ath-line--current' : '');
          line.style = '--season: ' + SEASONS.seasonColour(rse);
        }
        s.appendChild(svg('polyline', line));
      }
      // a label where each grade's (or weight's) line starts, unless it would overlap
      // the last one; a line starting with unrecorded results takes the first it has
      var named = null;
      for (var i = 0; i < r.length && !named; i++) { named = r[i].lineGrade; }
      if (!bySeason && breaks && runs.length > 1 && named && x(r[0].date) - lastLabel > 40) {
        var gl = svg('text', { x: x(r[0].date), y: T + 2, class: 'ath-axis ath-axis--grade' });
        gl.textContent = named;
        s.appendChild(gl);
        lastLabel = x(r[0].date);
      }
    });

    // points, each focusable with its details
    var links = [];
    pts.forEach(function (p, i) {
      var isPb = p === pbOf[pbKey(p)];
      var isSb = sbOf[pbKey(p) + '|' + p.season] === p;
      var cls = 'ath-point' + (isPb ? ' ath-point--pb' : isNewPb(p) ? ' ath-point--newpb' : '') +
                (p.club ? '' : ' ath-point--rep') +
                (windy(p) ? (isPb ? ' ath-point--pb-wind' : ' ath-point--wind') : '');
      var g = svg('a', { href: p.source, target: '_blank', rel: 'noopener', class: 'ath-point-link' });
      // which chart key entries this point belongs to, so the enlarged chart's key can light them up
      g.setAttribute('data-key', [isPb ? 'pb' : isNewPb(p) ? 'newpb' : '', isSb ? 'sb' : '', p.club ? '' : 'rep',
        windy(p) ? (isPb ? 'pbwind' : 'wind') : '', !isPb && !isNewPb(p) && p.club && !windy(p) ? 'result' : '']
        .filter(Boolean).join(' '));
      if (bySeason) { g.setAttribute('style', '--season: ' + SEASONS.seasonColour(seasonOf(p))); }
      var label = markSpoken(p) + (windy(p) ? ' (wind-assisted)' : '') + ', ' + longDate(p.date) + ', ' + p.meeting +
                  (p.combined ? ', part of a ' + p.combined.toLowerCase() : '') +
                  (isThrow(p) ? ', ' + weightWords(p) : '') +
                  (groupOf(p) ? ', ' + groupOf(p) : '') +
                  (typeof p.wind === 'number' ? ', wind ' + (p.wind > 0 ? '+' : '') + p.wind.toFixed(1) : '') +
                  (p.unattached ? ', entered Unattached' : p.club ? '' : ', representing ' + p.team) + (isPb ? ', personal best' : isNewPb(p) ? ', a new personal best at the time' : '') +
                  (p.season ? ', ' + p.season + ' season' : '') + (isSb ? ', season best' : '');
      g.setAttribute('aria-label', label);
      var cx = px(p), cy = y(p.value);
      var shape = p.club
        ? svg('circle', { cx: cx, cy: cy, r: isPb ? 8 : 5.5, class: cls })
        : svg('rect', { x: cx - 6, y: cy - 6, width: 12, height: 12, transform: 'rotate(45 ' + cx + ' ' + cy + ')', class: cls });
      var title = svg('title'); title.textContent = label;
      shape.appendChild(title);
      // a season's best gets a light green surround behind the point, like the new PB's yellow one; it shows round PB and new PB markers too
      if (isSb) { g.appendChild(svg('circle', { cx: cx, cy: cy, r: (isPb ? 8 : 5.5) + 4.5, class: 'ath-sb' })); }
      g.appendChild(shape);
      links.push(g);
      if (opts.select) {
        // in the enlarged chart a point selects its result; the details panel links to it
        g.addEventListener('click', function (e) {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) { return; }
          e.preventDefault();
          opts.select(i);
        });
        g.addEventListener('focus', function () { opts.select(i); });
      }
      g.addEventListener('mouseenter', function () { tip(card, label, cx / W, cy / H); });
      g.addEventListener('focus', function () { tip(card, label, cx / W, cy / H); });
      g.addEventListener('mouseleave', function () { tip(card); });
      g.addEventListener('blur', function () { tip(card); });
      s.appendChild(g);
    });

    card.appendChild(s);
    card.ncanPoints = pts;
    card.ncanLinks = links;
    var notes = [];
    if (breaks && !bySeason && runs.length > 1) {
      notes.push(throwChart ? 'The line breaks where the implement weight changes; the personal best is marked at each weight.'
                            : 'The line breaks where the grade changes, as the hurdles get higher.');
    }
    if (throwChart && pts.some(function (p) { return !weightOf(p); })) {
      notes.push('Results without a recorded weight join the line before them.');
    }
    var unmeasured = group.results.length - pts.length;
    if (unmeasured > 0) { notes.push(unmeasured + ' result' + (unmeasured === 1 ? '' : 's') + ' without a counted mark not charted.'); }
    if (notes.length) { card.appendChild(text('p', 'ath-chart__note', notes.join(' '))); }
    return card;
  }

  // a floating label over the chart for the point under the pointer
  function tip(card, label, fx, fy) {
    var t = card.querySelector('.ath-tip');
    if (!label) { if (t) { t.hidden = true; } return; }
    if (!t) { t = text('div', 'ath-tip'); t.setAttribute('aria-hidden', 'true'); card.appendChild(t); }
    t.textContent = label;
    t.hidden = false;
    t.style.left = Math.min(Math.max(fx * 100, 18), 82) + '%';
    t.style.top = (fy * 100) + '%';
  }

  function renderCharts(groups) {
    var out = $('ath-charts');
    out.textContent = '';
    var all = [];
    groups.forEach(function (g) { all = all.concat(countable(g.results)); });
    if (!all.length) { out.appendChild(text('p', 'records-status', 'No measured marks to chart for these filters.')); return; }
    var dates = all.map(function (r) { return parseDate(r.date); });
    var t0 = new Date(Math.min.apply(null, dates)), t1 = new Date(Math.max.apply(null, dates));
    if (t1 - t0 > 0) {   // a little room either side
      var padMs = (t1 - t0) * 0.06;
      t0 = new Date(t0 - padMs); t1 = new Date(+t1 + padMs);
    }
    // the personal best for each event, and for a throw each weight
    var pbOf = {}, rs = [];
    groups.forEach(function (g) { rs = rs.concat(g.results); });
    byWeight(rs).forEach(function (g) { pbOf[g.name] = best(countable(g.results)); });
    // and each season's best, the same as the table's "Season best" badge
    var sbOf = SEASONS ? SEASONS.bests(countable(rs), pbKey, isBetter) : {};
    CHART = { groups: groups, pbOf: pbOf, sbOf: sbOf };
    // Hide empty months: only months with no result for any event shown, so the charts still line up
    var hide = HIDE_EMPTY && SEASONS ? SEASONS.emptyMonths(all.map(function (r) { return r.date; })) : null;
    groups.forEach(function (g) { out.appendChild(chart(g, t0, t1, pbOf, { sbOf: sbOf, hide: hide })); });
  }

  /* The enlarged chart ---------------------------------------------------
     A maximise button on each chart opens it in a dialog, redrawn larger by
     chart() with more labels, its own date range (the chips) and a details
     panel for the result picked. The page's filters carry in; the range picked
     stays inside, so closing returns the page as it was. Opening adds
     #/<athlete>/chart/<event> to the address, so Back closes it and the link
     opens straight on that chart. */

  var zoom = { slug: '', group: null, kind: 'all', card: null, at: -1, pushed: false, key: '' };

  /* Timeline / By season, on each chart with more than one season. The choice
     applies to every chart on the page and the enlarged one, and is kept on the
     device. */
  function viewToggle(group, bySeason, inZoom) {
    var w = text('span', 'ath-view');
    w.setAttribute('role', 'group');
    w.setAttribute('aria-label', 'Chart view for ' + group.name);
    [['timeline', 'Timeline'], ['season', 'By season']].forEach(function (o) {
      var b = text('button', 'ath-view__btn', o[1]);
      b.type = 'button';
      b.dataset.view = o[0];
      b.dataset.chart = SEASONS.slug(group.name);
      b.setAttribute('aria-pressed', (o[0] === 'season') === bySeason ? 'true' : 'false');
      b.addEventListener('click', function () {
        var next = o[0] === 'season';
        if (next === BY_SEASON) { return; }
        BY_SEASON = next;
        try { localStorage.setItem('ncan-athlete-chart-view', next ? 'season' : 'timeline'); } catch (e) { /* not kept */ }
        render();
        var dlg = $('ath-zoom');
        if (dlg && dlg.open && zoom.group) { zoomDraw(); }
        // back to the same switch, now redrawn
        var again = document.querySelector((inZoom ? '#ath-zoom-chart' : '#ath-charts') +
          ' .ath-view__btn[data-chart="' + b.dataset.chart + '"][data-view="' + o[0] + '"]');
        if (again) { again.focus(); }
      });
      w.appendChild(b);
    });
    return w;
  }

  function zoomButton(group) {
    var b = text('button', 'ath-chart__zoom');
    b.type = 'button';
    b.dataset.chart = SEASONS.slug(group.name);
    b.setAttribute('aria-label', 'Enlarge the ' + group.name + ' chart');
    b.title = 'Enlarge';
    var icon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    icon.appendChild(svg('path', { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }));
    b.appendChild(icon);
    b.addEventListener('click', function () {
      if (window.history && history.pushState) {
        history.pushState(null, '', '#/' + current + '/chart/' + b.dataset.chart);
        zoom.pushed = true;
      }
      zoomOpen(b.dataset.chart);
    });
    return b;
  }

  // open the chart for this event (as in the address); false if the page has none
  function zoomOpen(slug) {
    var dlg = $('ath-zoom');
    var g = CHART.groups.filter(function (x) { return SEASONS.slug(x.name) === slug; })[0];
    if (!g || !dlg || !dlg.showModal) { return false; }
    zoom.slug = slug; zoom.group = g; zoom.kind = 'all';
    $('ath-zoom-from').value = ''; $('ath-zoom-to').value = '';
    $('ath-zoom-title').textContent = g.name;
    var sb = $('ath-zoom-share');
    if (sb) { sb.hidden = !shareCan(); }
    zoomChips();
    if (!dlg.open) { dlg.showModal(); }
    zoomDraw();
    $('ath-zoom-title').focus();
    return true;
  }

  // closing: back to where the address was before, and to the button that opened it
  function zoomClose(byAddress) {
    var dlg = $('ath-zoom');
    if (dlg.open) { dlg.close(); }
    zoom.key = '';
    keyCounts();
    if (!byAddress) {
      if (zoom.pushed) { history.back(); }
      else if (window.history && history.replaceState) { history.replaceState(null, '', '#/' + current); }
    }
    zoom.pushed = false;
    var b = document.querySelector('.ath-chart__zoom[data-chart="' + zoom.slug + '"]');
    if (b) { b.focus(); }
  }

  function zoomChips() {
    Array.prototype.forEach.call(document.querySelectorAll('#ath-zoom-ranges [data-range]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.range === zoom.kind ? 'true' : 'false');
    });
    $('ath-zoom-pick').hidden = zoom.kind !== 'pick';
  }

  function zoomDraw() {
    var r = SEASONS.range(zoom.kind, TODAY, { from: $('ath-zoom-from').value, to: $('ath-zoom-to').value });
    var rs = zoom.group.results.filter(function (x) { return SEASONS.inRange(x.date, r); });
    var pts = countable(rs);
    var out = $('ath-zoom-chart');
    out.textContent = '';
    zoom.card = null; zoom.at = -1;
    zoomDetails(null);
    if (!pts.length) {
      out.appendChild(text('p', 'records-status', 'No measured marks in these dates.'));
      keyCounts();
      return;
    }
    var dates = pts.map(function (x) { return parseDate(x.date); });
    var t0 = new Date(Math.min.apply(null, dates)), t1 = new Date(Math.max.apply(null, dates));
    if (t1 - t0 > 0) { var padMs = (t1 - t0) * 0.04; t0 = new Date(t0 - padMs); t1 = new Date(+t1 + padMs); }
    // drawn at the size it shows, so its labels stay the page's size: not a scaled-up copy
    var W = Math.max(320, Math.round(out.clientWidth || 1100));
    // wide screens: the chart fills the height left in the dialog, so there's no gap above the key.
    // Phones stack the details under the chart, so they keep a shape set by the width.
    var room = window.matchMedia('(max-width: 760px)').matches ? 0 : Math.round(out.clientHeight);
    var H = room > 320 ? room - 52 : Math.max(260, Math.min(560, Math.round(W * 0.5), window.innerHeight - 240));
    // Hide empty months here goes by this event's results in every season, whatever the dates picked
    var hide = HIDE_EMPTY ? SEASONS.emptyMonths(countable(zoom.group.results).map(function (x) { return x.date; })) : null;
    zoom.drawn = { rs: rs, t0: t0, t1: t1, hide: hide };
    zoom.card = chart({ name: zoom.group.name, results: rs }, t0, t1, CHART.pbOf,
      { W: W, H: H, yTicks: H > 380 ? 8 : 6, dateTicks: 90, zoom: true, sbOf: CHART.sbOf, select: zoomSelect, hide: hide });
    out.appendChild(zoom.card);
    // the row above the chart (switch, "↑ faster") may be taller or shorter than allowed for:
    // drawn once more at the height that fits exactly
    var over = room > 320 ? zoom.card.offsetHeight - room : 0;
    if (over > 2 || over < -2) {
      out.textContent = '';
      zoom.card = chart({ name: zoom.group.name, results: rs }, t0, t1, CHART.pbOf,
        { W: W, H: Math.max(260, H - over), yTicks: H - over > 380 ? 8 : 6, dateTicks: 90, zoom: true, sbOf: CHART.sbOf, select: zoomSelect, hide: hide });
      out.appendChild(zoom.card);
    }
    keyCounts();
    keyShow(zoom.key);
  }

  // the enlarged chart's key: which entry is kept lit, and how many marks each has here
  function keyMatch(g, key) { return (' ' + (g.getAttribute('data-key') || '') + ' ').indexOf(' ' + key + ' ') !== -1; }
  function keyShow(key) {
    var links = zoom.card ? zoom.card.ncanLinks : [];
    if (links.length && links[0].ownerSVGElement) { links[0].ownerSVGElement.classList.toggle('is-keying', !!key); }
    links.forEach(function (g) { g.classList.toggle('is-lit', !!key && keyMatch(g, key)); });
  }
  function keyPin(key) {
    zoom.key = zoom.key === key ? '' : key;
    keyCounts();
    keyShow(zoom.key);
  }
  function keyCounts() {
    var links = zoom.card ? zoom.card.ncanLinks : [];
    Array.prototype.forEach.call(document.querySelectorAll('#ath-zoom .ath-key li[data-key]'), function (li) {
      var n = links.filter(function (g) { return keyMatch(g, li.dataset.key); }).length;
      li.classList.toggle('is-none', n === 0);
      li.setAttribute('aria-pressed', zoom.key === li.dataset.key ? 'true' : 'false');
      li.setAttribute('aria-label', li.dataset.words + ': ' + (n === 1 ? '1 mark' : n + ' marks') + ' on this chart. Highlight them');
    });
  }

  function zoomSelect(i) {
    if (!zoom.card) { return; }
    zoom.at = i;
    zoom.card.ncanLinks.forEach(function (g, n) { g.classList.toggle('is-selected', n === i); });
    zoomDetails(zoom.card.ncanPoints[i]);
  }

  /* The enlarged chart saved as a PNG (assets/js/chart-image.js): exactly as shown, with
     the athlete, event and dates above it, the key for the marks it has, and ncan.nz.
     Made on the device; phones that can share files open the share sheet. */
  function zoomDownload() {
    var b = $('ath-zoom-download'), said = $('ath-zoom-said'), sel = $('ath-zoom-shape');
    var chartSvg = zoom.card && zoom.card.querySelector('svg.ath-chart__svg');
    if (!chartSvg || b.disabled) {
      said.textContent = 'There are no marks in these dates to save.';
      return;
    }
    var who = (window.NCAN && NCAN.athlete && NCAN.athlete.name) || '';
    var name = window.NCANChartImage.fileName(who, zoom.group.name);
    b.disabled = true;
    b.classList.add('is-busy');
    if (sel) { sel.disabled = true; }
    said.textContent = 'Making the image…';
    zoomImage(who).then(function (canvas) { return window.NCANChartImage.save(canvas, name); }).then(function (how) {
      said.textContent = how === 'shared' ? 'Chart shared.' : how === 'cancelled' ? '' : 'Chart saved as ' + name + '.';
    }).catch(function () {
      said.textContent = 'Sorry, the chart could not be saved as an image.';
      var words = b.querySelector('.ath-zoom__download-words');
      if (words) { words.textContent = 'Couldn’t save'; setTimeout(function () { words.textContent = 'Download'; }, 3000); }
    }).then(function () {
      b.disabled = false;
      b.classList.remove('is-busy');
      if (sel) { sel.disabled = false; }
    });
  }

  // what the enlarged chart shows: its event, first and last dates, range and view
  function zoomFacts() {
    var dlg = $('ath-zoom');
    var pts = (zoom.card && zoom.card.ncanPoints) || [];
    var dates = pts.map(function (p) { return p.date; }).sort();
    var chip = dlg.querySelector('#ath-zoom-ranges [aria-pressed="true"]');
    return { event: zoom.group.name, from: dates[0] || '', to: dates[dates.length - 1] || '',
             range: chip ? chip.textContent.trim() : '',
             view: zoom.card && zoom.card.classList.contains('ath-chart--seasons') ? 'by-season' : 'timeline' };
  }

  // the enlarged chart as an image (a canvas), with this name above it
  function zoomImage(title, scale) {
    var IMG = window.NCANChartImage;
    var dlg = $('ath-zoom'), cs = window.getComputedStyle(dlg);
    var css = function (sel, prop, dflt) {
      var el = dlg.querySelector(sel);
      return el ? window.getComputedStyle(el)[prop] : dflt;
    };
    // the key: each season's line (By season), then the marks this chart has
    var key = [];
    Array.prototype.forEach.call(zoom.card.querySelectorAll('.ath-chart__key li'), function (li) {
      var sw = li.querySelector('.ath-key__swatch');
      if (sw) { key.push({ swatch: sw, words: li.textContent.trim() }); }
    });
    Array.prototype.forEach.call(dlg.querySelectorAll('.ath-zoom__key li[data-key]'), function (li) {
      var sw = li.querySelector('.ath-key__mark');
      if (sw && !li.classList.contains('is-none')) { key.push({ swatch: sw, words: li.dataset.words || li.textContent.trim() }); }
    });
    var f = zoomFacts();
    // the chart drawn again at the size the image's shape leaves for it, out of sight on the
    // page so the stylesheet reaches it, with the same result selected and key entry lit
    var holder = null;
    var draw = function (w, h) {
      var d = zoom.drawn;
      holder = document.createElement('div');
      holder.setAttribute('aria-hidden', 'true');
      // off screen, not hidden: its styles are copied into the image, visibility included
      holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + w + 'px;pointer-events:none';
      var card = chart({ name: zoom.group.name, results: d.rs }, d.t0, d.t1, CHART.pbOf,
        { W: w, H: h, yTicks: h > 380 ? 8 : 6, dateTicks: 90, zoom: true, sbOf: CHART.sbOf, select: function () {}, hide: d.hide });
      holder.appendChild(card);
      $('ath-zoom-chart').appendChild(holder);
      var links = card.ncanLinks || [];
      if (zoom.at >= 0 && links[zoom.at]) { links[zoom.at].classList.add('is-selected'); }
      var s = card.querySelector('svg.ath-chart__svg');
      if (zoom.key && s) {
        s.classList.add('is-keying');
        links.forEach(function (g) { g.classList.toggle('is-lit', keyMatch(g, zoom.key)); });
      }
      return s;
    };
    var done = function () { if (holder) { holder.remove(); holder = null; } };
    var dark = (function () {
      var m = String(cs.backgroundColor).match(/\d+(\.\d+)?/g);
      return m ? (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000 < 128 : false;
    }());
    return IMG.render({
      scale: scale,
      shape: IMG.pick(shapeChoice(), window.innerWidth, window.innerHeight),
      draw: draw,
      done: done,
      dark: dark,
      title: title,
      subtitle: IMG.subtitle(f.event, f.range, f.from, f.to),
      key: key,
      colours: { bg: cs.backgroundColor, heading: css('.ath-zoom__title', 'color', cs.color),
                 text: cs.color, soft: css('.ath-zoom__prompt', 'color', cs.color) },
      fonts: { display: css('.ath-zoom__title', 'fontFamily', cs.fontFamily), sans: cs.fontFamily }
    });
  }

  /* Sharing the enlarged chart publicly (POST /v1/athletes/<address>/shares). The image is
     made here with the name as chosen and shown before anything leaves the device; then it's
     uploaded and the API gives back a public link. A share is never changed afterwards. */
  var share = { canvas: null, style: 'full', busy: false, seq: 0, url: '' };

  // only the athlete's GameDay contacts and admins, and not while the club has paused sharing
  function shareCan() {
    return !!(window.NCANChartImage && window.NCAN && NCAN.sendFile && NCAN.athlete && NCAN.athlete.can_share);
  }

  function shareOpen() {
    var d = $('ath-share');
    if (!d || !d.showModal || !shareCan()) { return; }
    if (!zoom.card || !zoom.card.querySelector('svg.ath-chart__svg')) {
      $('ath-zoom-said').textContent = 'There are no marks in these dates to share.';
      return;
    }
    var IMG = window.NCANChartImage, who = NCAN.athlete.name || '';
    share.style = 'full';
    share.url = '';
    $('ath-share-name-full').checked = true;
    $('ath-share-eg-full').textContent = IMG.shownName(who, 'full');
    $('ath-share-eg-first').textContent = IMG.shownName(who, 'first');
    $('ath-share-ok').checked = false;
    $('ath-share-form').hidden = false;
    $('ath-share-done').hidden = true;
    $('ath-share-said').textContent = '';
    d.showModal();
    $('ath-share-title').focus();
    shareDraw();
  }

  // the preview, made again whenever the name changes
  function shareDraw() {
    var IMG = window.NCANChartImage, n = ++share.seq;
    var img = $('ath-share-preview'), box = $('ath-share-box'), said = $('ath-share-said');
    var who = IMG.shownName(NCAN.athlete.name, share.style);
    share.canvas = null;
    img.hidden = true;
    box.classList.add('is-busy');
    said.textContent = 'Making the image…';
    shareButtons();
    zoomImage(who).then(function (canvas) {
      if (n !== share.seq) { return; }
      share.canvas = canvas;
      img.src = canvas.toDataURL('image/png');
      img.alt = 'The image that will be shared: ' + who + ', ' + IMG.subtitle(zoomFacts().event, zoomFacts().range,
        zoomFacts().from, zoomFacts().to) + '.';
      img.hidden = false;
      said.textContent = '';
    }).catch(function () {
      if (n === share.seq) { said.textContent = 'Sorry, the image could not be made.'; }
    }).then(function () {
      if (n === share.seq) { box.classList.remove('is-busy'); shareButtons(); }
    });
  }

  function shareButtons() {
    var go = $('ath-share-go');
    go.disabled = share.busy || !share.canvas || !$('ath-share-ok').checked || !shareCan();
    Array.prototype.forEach.call(document.querySelectorAll('#ath-share-names input'), function (r) {
      r.disabled = share.busy;
    });
    $('ath-share-ok').disabled = share.busy;
  }

  function blobOf(canvas) {
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); });
  }

  function shareCreate() {
    var go = $('ath-share-go'), said = $('ath-share-said');
    if (go.disabled) { return; }
    var IMG = window.NCANChartImage, f = zoomFacts(), style = share.style;
    var too = new Error('That chart makes too big an image to share. Try fewer dates.');
    share.busy = true;
    go.classList.add('is-busy');
    shareButtons();
    said.textContent = 'Making the public link…';
    blobOf(share.canvas).then(function (blob) {
      // a very busy chart: made again a little smaller, to fit the API's limit
      if (blob && blob.size > IMG.SHARE_MAX) {
        return zoomImage(IMG.shownName(NCAN.athlete.name, style), 1.25).then(blobOf);
      }
      return blob;
    }).then(function (blob) {
      if (!blob) { throw new Error('Sorry, the image could not be made.'); }
      if (blob.size > IMG.SHARE_MAX) { throw too; }
      return NCAN.sendFile('/athletes/' + encodeURIComponent(NCAN.athlete.slug) + '/shares?' +
        IMG.shareQuery({ event: f.event, from: f.from, to: f.to, view: f.view, name: style }), blob);
    }).then(function (r) {
      if (r.status === 201 && r.body && r.body.share && r.body.share.url) { shareDone(r.body.share); return; }
      if (r.status === 413) { throw too; }
      said.textContent = (r.body && r.body.error) || 'Sorry, the chart could not be shared (' + r.status + ').';
      // refused (sharing paused, or no longer theirs to share): no Share until the page reloads
      if (r.status === 403) {
        NCAN.athlete.can_share = false;
        $('ath-zoom-share').hidden = true;
      }
    }).catch(function (e) {
      said.textContent = (e && e.message) || 'Sorry, the chart could not be shared.';
    }).then(function () {
      share.busy = false;
      go.classList.remove('is-busy');
      shareButtons();
    });
  }

  function shareDone(s) {
    share.url = s.url;
    $('ath-share-form').hidden = true;
    $('ath-share-done').hidden = false;
    var link = $('ath-share-link');
    link.value = s.url;
    $('ath-share-open').href = s.url;
    $('ath-share-send').hidden = !navigator.share;
    $('ath-share-said').textContent = 'Your public link is ready.';
    document.dispatchEvent(new CustomEvent('ncan:shared', { detail: s }));   // the Shared charts list (shared-charts.js)
    link.focus();
    link.select();
  }

  function shareCopy() {
    var b = $('ath-share-copy'), link = $('ath-share-link');
    var said = function (w) {
      b.textContent = w;
      setTimeout(function () { b.textContent = 'Copy link'; }, 2500);
    };
    var old = function () {
      link.focus(); link.select();
      try { said(document.execCommand('copy') ? 'Copied' : 'Press Ctrl+C to copy'); } catch (e) { said('Press Ctrl+C to copy'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(share.url).then(function () { said('Copied'); }, old);
    } else { old(); }
  }

  function shareSetUp() {
    var d = $('ath-share'), b = $('ath-zoom-share');
    if (!d || !b) { return; }
    b.addEventListener('click', shareOpen);
    Array.prototype.forEach.call(d.querySelectorAll('[data-share-close]'), function (c) {
      c.addEventListener('click', function () { d.close(); });
    });
    // closing (a button or Esc): anything still being made is dropped, and back to Share
    d.addEventListener('close', function () {
      share.seq++;
      share.canvas = null;
      if (!share.busy) { (b.hidden ? $('ath-zoom-close') : b).focus(); }
    });
    Array.prototype.forEach.call(d.querySelectorAll('#ath-share-names input'), function (r) {
      r.addEventListener('change', function () { if (r.checked) { share.style = r.value; shareDraw(); } });
    });
    $('ath-share-ok').addEventListener('change', shareButtons);
    $('ath-share-go').addEventListener('click', shareCreate);
    $('ath-share-copy').addEventListener('click', shareCopy);
    $('ath-share-send').addEventListener('click', function () {
      navigator.share({ title: 'Chart from North Canterbury Athletic Club', url: share.url }).catch(function () { /* closed */ });
    });
  }

  // the result picked: mark, date, meeting, wind, grade or weight, PB or season best
  function zoomDetails(p) {
    var out = $('ath-zoom-details');
    out.textContent = '';
    if (!p) {
      out.appendChild(text('p', 'ath-zoom__prompt', 'Select a result to see its details, or use the ← and → keys.'));
      return;
    }
    out.appendChild(text('p', 'ath-zoom__mark', markText(p) + (windy(p) ? ' (wind-assisted)' : '')));
    var tags = text('p', 'ath-zoom__tags');
    if (p === CHART.pbOf[pbKey(p)]) { tags.appendChild(text('span', 'champs-tag ath-badge', 'Personal best')); }
    else if (isNewPb(p)) { tags.appendChild(text('span', 'champs-tag ath-badge ath-badge--newpb', 'New personal best at the time')); }
    if (CHART.sbOf[pbKey(p) + '|' + p.season] === p) { tags.appendChild(text('span', 'champs-tag ath-badge', 'Season best')); }
    if (tags.children.length) { out.appendChild(tags); }
    var dl = text('dl', 'ath-zoom__facts');
    var add = function (k, v) { if (v) { dl.appendChild(text('dt', null, k)); dl.appendChild(text('dd', null, v)); } };
    add('Date', longDate(p.date) + (p.season ? ' (' + p.season + ' season)' : ''));
    add('Meeting', p.meeting);
    if (typeof p.wind === 'number') { add('Wind', windText(p.wind) + ' m/s'); }
    if (isThrow(p)) { add('Weight', weightWords(p)); }
    add(p.grade ? 'Grade' : 'Age group', groupOf(p));
    if (p.place) { add('Place', ordinal(p.place) + (p.of ? ' of ' + p.of : '')); }
    if (p.unattached) { add('Entered', 'Unattached'); } else if (!p.club) { add('Representing', p.team); }
    if (p.combined) { add('Part of', p.combined); }
    out.appendChild(dl);
    if (p.source) {
      var a = text('a', 'records-source', 'Official result');
      a.href = p.source; a.target = '_blank'; a.rel = 'noopener';
      var lp = text('p', 'ath-zoom__link'); lp.appendChild(a);
      out.appendChild(lp);
    }
  }

  function zoomSetUp() {
    var dlg = $('ath-zoom');
    if (!dlg || !SEASONS) { return; }
    // the chart key (personal best, result, wind...) under the enlarged chart too: a copy
    // of the page's, so the two never differ
    var pageKey = document.querySelector('main .ath-key');
    var body = dlg.querySelector('.ath-zoom__body');
    if (pageKey && body && !dlg.querySelector('.ath-key')) {
      var k = pageKey.cloneNode(true);
      k.removeAttribute('id');
      k.classList.add('ath-zoom__key');
      body.parentNode.insertBefore(k, body.nextSibling);
      // pointing at (or tabbing to) a key entry lights up its marks; a click or tap keeps it lit
      Array.prototype.forEach.call(k.querySelectorAll('li[data-key]'), function (li) {
        li.setAttribute('tabindex', '0');
        li.setAttribute('role', 'button');
        li.setAttribute('aria-pressed', 'false');
        li.dataset.words = li.textContent.trim();
        var show = function () { keyShow(li.dataset.key); };
        var back = function () { keyShow(zoom.key); };
        li.addEventListener('mouseenter', show);
        li.addEventListener('focus', show);
        li.addEventListener('mouseleave', back);
        li.addEventListener('blur', back);
        li.addEventListener('click', function () { keyPin(li.dataset.key); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keyPin(li.dataset.key); }
        });
      });
    }
    $('ath-zoom-close').addEventListener('click', function () { zoomClose(); });
    var dl = $('ath-zoom-download'), shapeSel = $('ath-zoom-shape');
    if (dl) { if (window.NCANChartImage) { dl.addEventListener('click', zoomDownload); } else { dl.hidden = true; } }
    shareSetUp();
    if (shapeSel) {
      if (!window.NCANChartImage) { shapeSel.hidden = true; }
      shapeSel.value = storedShape();
      if (!shapeSel.value) { shapeSel.value = 'auto'; }
      shapeSel.addEventListener('change', function () {
        try { localStorage.setItem('ncan-chart-shape', shapeSel.value); } catch (e) { /* this visit only */ }
      });
    }
    // Esc: close the same way as the button, so the address goes back too
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); zoomClose(); });
    Array.prototype.forEach.call(document.querySelectorAll('#ath-zoom-ranges [data-range]'), function (b) {
      b.addEventListener('click', function () {
        zoom.kind = b.dataset.range;
        zoomChips();
        zoomDraw();
        if (zoom.kind === 'pick') { $('ath-zoom-from').focus(); }
      });
    });
    ['ath-zoom-from', 'ath-zoom-to'].forEach(function (id) { $(id).addEventListener('change', zoomDraw); });
    // a window resized or a phone turned: drawn again at the new size, keeping the result picked
    var resizing = null;
    window.addEventListener('resize', function () {
      if (!dlg.open) { return; }
      clearTimeout(resizing);
      resizing = setTimeout(function () {
        var at = zoom.at;
        zoomDraw();
        if (at >= 0 && zoom.card && at < zoom.card.ncanLinks.length) { zoomSelect(at); }
      }, 150);
    });
    // Left and Right move between results in date order
    dlg.addEventListener('keydown', function (e) {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !zoom.card || /INPUT|SELECT/.test(e.target.tagName)) { return; }
      var n = SEASONS.step(zoom.card.ncanLinks.length, zoom.at, e.key === 'ArrowRight' ? 1 : -1);
      if (n < 0) { return; }
      e.preventDefault();
      zoom.card.ncanLinks[n].focus();
      zoomSelect(n);
    });
  }

  /* Table ---------------------------------------------------------------- */

  // Table order: up to three columns, each with a direction (1 = ascending).
  // Clicking a heading puts it first and keeps the earlier ones as tie-breakers,
  // so event, then wind, then date is: click Date, then Wind, then Event.
  // Date starts newest first; Mark starts best first (for times, the smallest).
  var DEFAULT_SORT = [{ key: 'Date', dir: -1 }];
  var sorts = DEFAULT_SORT.slice();
  var SORT_FIRST = { Date: -1, Mark: 1 };
  var MAX_SORTS = 3;
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function missingLast(a, b, dir) {
    var na = a === null || a === undefined || a === '', nb = b === null || b === undefined || b === '';
    if (na || nb) { return na === nb ? 0 : na ? 1 : -1; }
    return dir * cmp(a, b);
  }
  function teamOf(r) { return r.unattached ? 'Unattached' : r.club ? 'North Canterbury' : r.team; }
  function byColumn(k, d, a, b) {
    if (k === 'Date') { return d * cmp(a.date, b.date); }
    if (k === 'Event') { return d * (eventRank(a.event) - eventRank(b.event)); }
    if (k === 'Mark') {
      // marks only compare within an event: events in running order, then best first
      var c = eventRank(a.event) - eventRank(b.event);
      if (c) { return c; }
      var va = typeof a.value === 'number' ? (a.field ? -a.value : a.value) : null;
      var vb = typeof b.value === 'number' ? (b.field ? -b.value : b.value) : null;
      return missingLast(va, vb, d);
    }
    if (k === 'Wind') { return missingLast(typeof a.wind === 'number' ? a.wind : null, typeof b.wind === 'number' ? b.wind : null, d); }
    if (k === 'Place') { return missingLast(a.place, b.place, d); }
    if (k === 'Age group') { return missingLast(groupAge(a), groupAge(b), d); }
    if (k === 'Meeting') { return d * cmp(a.meeting.toLowerCase(), b.meeting.toLowerCase()); }
    if (k === 'Representing') { return d * cmp(teamOf(a).toLowerCase(), teamOf(b).toLowerCase()); }
    return 0;
  }
  function order(a, b) {
    for (var i = 0; i < sorts.length; i++) {
      var c = byColumn(sorts[i].key, sorts[i].dir, a, b);
      if (c) { return c; }
    }
    // still level: newest first, then running order
    return cmp(b.date, a.date) || eventRank(a.event) - eventRank(b.event);
  }
  function sortWords(x) {
    var words = {
      Date: ['oldest first', 'newest first'], Event: ['running order', 'reverse running order'],
      Mark: ['best first', 'best last'], Wind: ['lowest first', 'highest first'],
      Place: ['1st first', 'last first'], 'Age group': ['youngest first', 'oldest first'],
      Meeting: ['A–Z', 'Z–A'], Representing: ['A–Z', 'Z–A']
    }[x.key];
    return x.key + ' (' + words[x.dir > 0 ? 0 : 1] + ')';
  }

  function renderTable(rs, groups) {
    var out = $('ath-table');
    out.textContent = '';
    if (!rs.length) { out.appendChild(text('p', 'records-status', 'No results for these filters.')); return; }
    // personal and season bests per event, and for a throw per weight
    var pbs = {}, sbs = {};
    byWeight(rs).forEach(function (g) {
      var c = countable(g.results);
      pbs[g.name] = best(c);
      var seasons = {};
      c.forEach(function (r) { (seasons[r.season] = seasons[r.season] || []).push(r); });
      Object.keys(seasons).forEach(function (s) { sbs[g.name + '|' + s] = best(seasons[s]); });
    });

    var how = text('p', 'ath-sorted', 'Sorted by ' + sorts.map(sortWords).join(', then ') + '. ');
    if (sorts.length > 1 || sorts[0].key !== 'Date' || sorts[0].dir !== -1) {
      var reset = text('button', 'ath-sorted__reset', 'Reset sort');
      reset.type = 'button';
      reset.addEventListener('click', function () { sorts = DEFAULT_SORT.slice(); render(); });
      how.appendChild(reset);
    }
    out.appendChild(how);
    var wrap = text('div', 'table-wrap');
    var table = text('table', 'schedule ath-table');
    table.appendChild(text('caption', 'visually-hidden', 'All results for ' + athlete.name));
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    // each heading sorts the table; the arrow shows the column and direction in use
    ['Date', 'Event', 'Mark', 'Wind', 'Place', 'Age group', 'Meeting', 'Representing'].forEach(function (h) {
      var th = text('th');
      th.setAttribute('scope', 'col');
      var at = -1;
      sorts.forEach(function (x, i) { if (x.key === h) { at = i; } });
      var on = at !== -1, dir = on ? sorts[at].dir : 0;
      if (at === 0) { th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); }
      var b = text('button', 'ath-sort' + (on ? ' is-active' : ''), h);
      b.type = 'button';
      b.appendChild(text('span', 'ath-sort__arrow', on ? (dir > 0 ? '▲' : '▼') : '↕'));
      if (on && sorts.length > 1) { b.appendChild(text('span', 'ath-sort__n', String(at + 1))); }
      b.title = at === 0 ? 'Reverse the ' + h.toLowerCase() + ' order' : 'Sort by ' + h.toLowerCase() + ' first';
      b.addEventListener('click', function () {
        if (at === 0) { sorts[0] = { key: h, dir: -dir }; }
        else {
          sorts = sorts.filter(function (x) { return x.key !== h; });
          sorts.unshift({ key: h, dir: SORT_FIRST[h] || 1 });
          sorts = sorts.slice(0, MAX_SORTS);
        }
        render();
      });
      th.appendChild(b);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    var newestFirst = function (a, b) { return order(a, b); };
    if ($('ath-group').value === 'event') {
      // a band per event, in a meeting's running order, its results newest first
      groups.forEach(function (g) {
        var band = text('tr', 'schedule__band');
        // a throw has a personal best at each weight: "3kg 8.45m, 4kg 7.10m"
        var bests = byWeight(g.results).map(function (w) { return pbs[w.name]; }).filter(Boolean);
        var pbWords = !bests.length ? '' : isThrow(bests[0])
          ? ' · personal best' + (bests.length > 1 ? 's ' : ' ') + bests.map(function (b) {
              return (weightOf(b) || 'weight not recorded') + ' ' + markText(b);
            }).join(', ')
          : ' · personal best ' + markText(bests[0]);
        var bth = text('th', null, g.name + ' · ' + g.results.length + ' result' +
                                   (g.results.length === 1 ? '' : 's') + pbWords);
        bth.setAttribute('scope', 'colgroup');
        bth.colSpan = 8;
        band.appendChild(bth);
        tbody.appendChild(band);
        g.results.slice().sort(newestFirst).forEach(function (r) { tbody.appendChild(row(r, pbs, sbs)); });
      });
    } else {
      rs.slice().sort(newestFirst).forEach(function (r) { tbody.appendChild(row(r, pbs, sbs)); });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    out.appendChild(wrap);
  }

  function row(r, pbs, sbs) {
      var tr = document.createElement('tr');
      // dd/mm/yyyy in the table; the full date is kept for screen readers and on hover
      var p = r.date.split('-');
      var when = text('th', 'records-date', p[2] + '/' + p[1] + '/' + p[0]);
      when.title = longDate(r.date);
      when.setAttribute('scope', 'row');
      tr.appendChild(when);
      var cells = [
        ['Event', r.event, null],   // with its multi-event, if any, added below
        ['Mark', null, 'records-perf'],
        ['Wind', typeof r.wind === 'number' ? (r.wind > 0 ? '+' : '') + r.wind.toFixed(1) : '–', 'champs-num'],
        ['Place', r.place ? ordinal(r.place) + (r.of ? ' of ' + r.of : '') : '–', 'champs-num'],
        ['Age group', groupShort(r) || '–', 'champs-num'],
        ['Meeting', r.meeting, null],
        ['Representing', r.unattached ? 'Unattached' : r.club ? 'North Canterbury' : r.team, null]
      ];
      cells.forEach(function (c) {
        var td = text('td', c[2], c[1]);
        td.setAttribute('data-label', c[0]);
        if (c[0] === 'Event' && isThrow(r)) {
          // the implement: as published, inferred from the grade, or not recorded
          var wt = text('span', 'ath-combined ath-implement' + (weightOf(r) ? '' : ' ath-implement--none'),
                        weightOf(r) ? weightOf(r) + (weightGuessed(r) ? ' (usual)' : '') : 'Weight not recorded');
          if (weightGuessed(r)) { wt.title = 'Not published by the meeting: the usual weight for the grade'; }
          td.appendChild(wt);
        }
        if (c[0] === 'Event' && r.combined) {
          // a pentathlon's 200m is still a 200m; say which multi-event it was part of
          td.appendChild(text('span', 'ath-combined', r.combined));
        }
        if (c[0] === 'Mark') {
          var a = text('a', 'records-source', markText(r));
          a.href = r.source; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Official result';
          td.appendChild(a);
          if (pbs[pbKey(r)] === r) { td.appendChild(text('span', 'champs-tag champs-tag--next ath-badge', 'Personal best')); }
          else if (isNewPb(r)) { td.appendChild(text('span', 'champs-tag champs-tag--next ath-badge ath-badge--newpb', 'New personal best')); }
          else if (sbs[pbKey(r) + '|' + r.season] === r) { td.appendChild(text('span', 'champs-tag ath-badge', 'Season best')); }
          if (qualified(r)) { td.appendChild(text('span', 'champs-tag ath-badge', 'Qualified')); }
        }
        // every wind reading is a tag; one over +2.0 m/s is outlined, like the
        // wind-assisted points on the charts
        if (c[0] === 'Wind' && typeof r.wind === 'number') {
          td.textContent = '';
          var assisted = windy(r);
          var w = text('span', 'champs-tag ath-badge ath-wind' + (assisted ? ' ath-wind--assisted' : ''), windText(r.wind));
          w.title = assisted ? 'Wind-assisted: over +2.0 m/s, so not a legal mark' : 'Wind-legal';
          td.appendChild(w);
        }
        tr.appendChild(td);
      });
      return tr;
  }

  /* Cross country, road and relays ------------------------------------------
     Newest first, in a table of their own. No PBs or charts: courses differ.
     The grade is the out-of-stadia one (U10-U20 in two-year grades, then
     Senior and Masters by age on the day), with the race's own division. */
  // cross country and road distances in km: '3000m' -> '3 km', '2500m' -> '2.5 km'
  function inKm(name) {
    return name.replace(/(\d+)m\b/g, function (_, m) { return String(+(m / 1000).toFixed(3)) + ' km'; });
  }
  function renderOffTrack(list) {
    var body = $('offtrack-body');
    body.textContent = '';
    $('out-of-stadia').hidden = !list.length;
    list.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; })
      .forEach(function (r) {
        var tr = document.createElement('tr');
        var p = r.date.split('-');
        var when = text('th', 'records-date', p[2] + '/' + p[1] + '/' + p[0]);
        when.title = longDate(r.date);
        when.setAttribute('scope', 'row');
        tr.appendChild(when);
        var leg = r.relay;
        var race = leg ? 'Relay, leg ' + leg.leg + (leg.legs ? ' of ' + leg.legs : '') +
                         (/\d+m$/.test(r.event) ? ' (' + inKm(r.event.match(/(\d+m)$/)[1]) + ')' : '')
                       : inKm(r.event.replace(/^(Cross country|Road) /, ''));
        var cells = [
          ['Race', null, null],
          ['Time', null, 'records-perf'],
          ['Place', r.place ? ordinal(r.place) + (r.of ? ' of ' + r.of : '') + (leg ? ' (team)' : '') : '–', 'champs-num'],
          ['Grade', r.oos_grade || '–', 'champs-num'],
          ['Meeting', r.meeting, null],
          ['Representing', r.unattached ? 'Unattached' : r.club ? 'North Canterbury' : r.team, null]
        ];
        cells.forEach(function (c) {
          var td = text('td', c[2], c[1]);
          td.setAttribute('data-label', c[0]);
          if (c[0] === 'Race') {
            td.appendChild(text('span', null, race));
            td.appendChild(text('span', 'ath-combined', r.oos + (r.division ? ' · ' + r.division : '')));
          }
          if (c[0] === 'Time') {
            var a = text('a', 'records-source', r.mark || '–');
            a.href = r.source; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Official result';
            td.appendChild(a);
            if (leg && leg.team_mark) { td.appendChild(text('span', 'ath-combined', 'Team ' + leg.team_mark)); }
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
  }

  /* Everything ----------------------------------------------------------- */

  // the table's Event list says which events the chips leave on
  function syncEventSelect() {
    var sel = $('ath-event-2');
    var names = byEvent(athlete.results).map(function (g) { return g.name; });
    var on = names.filter(function (n) { return !eventsOff[n]; });
    var some = sel.querySelector('option[value="__some"]');
    if (on.length === names.length) {
      sel.value = '';
    } else if (on.length === 1) {
      sel.value = on[0];
    } else {
      if (!some) {
        some = text('option', null, '');
        some.value = '__some';
        some.disabled = true;
        sel.appendChild(some);
      }
      some.textContent = on.length + ' events';
      sel.value = '__some';
    }
    if (some && sel.value !== '__some') { some.remove(); }
  }

  function render() {
    var rs = shown();
    var groups = byEvent(rs);
    var f = filters();
    $('ath-clear').disabled = $('ath-clear-2').disabled = !isFiltered(f);
    $('ath-status').textContent = $('ath-status-2').textContent = rs.length === athlete.results.length
      ? ''
      : 'Showing ' + rs.length + ' of ' + athlete.results.length + ' results.';
    $('ath-season-2').value = $('ath-season').value;
    $('ath-team-2').value = $('ath-team').value;
    $('ath-wind-2').checked = $('ath-wind').checked;
    syncEventSelect();
    renderStats(rs);
    // personal bests per event, and for a throw per weight; the charts the same
    // when "a separate chart for each throwing weight" is ticked
    renderPbs(byWeight(rs));
    renderCharts(PER_WEIGHT ? byWeight(rs) : groups);
    renderTable(rs, groups);
  }

  function setUp() {
    var seasons = {};
    athlete.results.forEach(function (r) { seasons[r.season] = 1; });
    Object.keys(seasons).sort().reverse().forEach(function (s) {
      ['ath-season', 'ath-season-2'].forEach(function (id) {
        var o = text('option', null, s); o.value = s; $(id).appendChild(o);
      });
    });
    if (!athlete.results.some(function (r) { return !r.club; })) {
      $('ath-team').disabled = $('ath-team-2').disabled = true;
    }
    byEvent(athlete.results).forEach(function (g) {
      var o = text('option', null, g.name); o.value = g.name; $('ath-event-2').appendChild(o);
    });

    var chips = $('ath-events');
    byEvent(athlete.results).forEach(function (g) {
      var b = text('button', 'cal-filter__chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      b.appendChild(text('span', 'cal-filter__dot'));
      b.appendChild(document.createTextNode(g.name));
      b.addEventListener('click', function () {
        eventsOff[g.name] = !eventsOff[g.name];
        b.setAttribute('aria-pressed', eventsOff[g.name] ? 'false' : 'true');
        render();
      });
      chips.appendChild(b);
    });

    // the top bar holds the filters; the table's bar copies its changes across
    ['ath-season', 'ath-team', 'ath-wind'].forEach(function (id) { $(id).addEventListener('change', render); });
    [['ath-season-2', 'ath-season'], ['ath-team-2', 'ath-team']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function () { $(pair[1]).value = $(pair[0]).value; render(); });
    });
    $('ath-wind-2').addEventListener('change', function () { $('ath-wind').checked = $('ath-wind-2').checked; render(); });

    function setChips() {
      Array.prototype.forEach.call(chips.children, function (b) {
        b.setAttribute('aria-pressed', eventsOff[b.textContent] ? 'false' : 'true');
      });
    }
    // one event from the list switches every other chip off; All events turns them all on
    $('ath-event-2').addEventListener('change', function () {
      var pick = $('ath-event-2').value;
      eventsOff = {};
      if (pick) {
        byEvent(athlete.results).forEach(function (g) { if (g.name !== pick) { eventsOff[g.name] = true; } });
      }
      setChips();
      render();
    });

    function clearAll() {
      $('ath-season').value = ''; $('ath-team').value = ''; $('ath-wind').checked = false;
      eventsOff = {};
      setChips();
      render();
    }
    $('ath-clear').addEventListener('click', clearAll);
    $('ath-clear-2').addEventListener('click', clearAll);

    // "Show seasons": the winter bands and season names (season-best rings always show)
    if (SEASONS) {
      $('ath-seasons-field').hidden = false;
      $('ath-seasons').checked = SEASONS_ON;
      $('ath-seasons').addEventListener('change', function () {
        SEASONS_ON = this.checked;
        try { localStorage.setItem('ncan-athlete-seasons', SEASONS_ON ? '1' : '0'); } catch (e) { /* not kept */ }
        render();
      });
      // "Hide empty months", on the page and in the enlarged chart: one setting, off by default
      $('ath-hidemonths-field').hidden = false;
      var hideBoxes = [$('ath-hidemonths'), $('ath-zoom-hidemonths')].filter(Boolean);
      hideBoxes.forEach(function (box) {
        box.checked = HIDE_EMPTY;
        box.addEventListener('change', function () {
          HIDE_EMPTY = this.checked;
          hideBoxes.forEach(function (b) { b.checked = HIDE_EMPTY; });
          try { localStorage.setItem('ncan-athlete-hide-months', HIDE_EMPTY ? '1' : '0'); } catch (e) { /* not kept */ }
          render();
          if ($('ath-zoom') && $('ath-zoom').open && zoom.group) { zoomDraw(); }
        });
      });
    }
    // help tips: shown on hover and focus by the stylesheet; a tap or click keeps one open
    Array.prototype.forEach.call(document.querySelectorAll('.help-tip__btn'), function (b) {
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        b.parentNode.classList.toggle('is-open', open);
      });
      b.addEventListener('blur', function () {
        b.setAttribute('aria-expanded', 'false');
        b.parentNode.classList.remove('is-open');
      });
    });

    // grouping is a viewing preference, kept on this device when it can be
    try {
      var saved = localStorage.getItem('ncan-athlete-group');
      if (saved === 'event' || saved === 'date') { $('ath-group').value = saved; }
    } catch (e) { /* private mode or blocked storage: start from the default */ }
    $('ath-group').addEventListener('change', function () {
      try { localStorage.setItem('ncan-athlete-group', $('ath-group').value); } catch (e) { /* not kept */ }
      render();
    });
  }

  // The meetings this athlete's results come from, like results-sources.html but
  // for one athlete: every result, whatever the filters above show.
  function renderSources() {
    var meets = {}, order = [];
    (athlete.everything || []).concat(athlete.offTrack || []).forEach(function (r) {
      var m = /^(https?:\/\/[^/]+\/meets\/\d+)\//.exec(r.source || '');
      var key = m ? m[1] : 'hand:' + r.meeting;
      if (!meets[key]) {
        meets[key] = { name: r.meeting, type: r.type, link: m ? m[1] : r.source, live: !!m, results: [] };
        order.push(key);
      }
      meets[key].results.push(r);
    });
    var list = order.map(function (k) {
      var m = meets[k];
      m.results.sort(function (a, b) { return cmp(a.date, b.date) || eventRank(a.event) - eventRank(b.event); });
      m.first = m.results[0].date; m.last = m.results[m.results.length - 1].date;
      m.season = m.results[0].season;
      return m;
    }).sort(function (a, b) { return cmp(b.first, a.first) || cmp(a.name, b.name); });
    var out = $('ath-sources-list');
    out.textContent = '';
    var seasons = [];
    list.forEach(function (m) { if (seasons.indexOf(m.season) === -1) { seasons.push(m.season); } });
    seasons.forEach(function (season) {
      var group = text('div', 'records-grade');
      group.appendChild(text('h3', 'records-grade__head', season + ' season'));
      list.filter(function (m) { return m.season === season; }).forEach(function (m) {
        var block = text('details', 'champs-day src-meeting');
        var head = text('summary', 'champs-day__head');
        var title = text('h4', 'champs-day__title src-meeting__title', m.name);
        if (!m.live) {
          // a meeting entered manually from its published results, not from AthleticLIVE
          var hand = text('span', 'ath-manual', '✍️');
          hand.title = 'Entered manually from the published results';
          hand.setAttribute('role', 'img');
          hand.setAttribute('aria-label', 'Entered manually');
          title.appendChild(hand);
        }
        head.appendChild(title);
        var when = m.first === m.last ? longDate(m.first) : longDate(m.first) + ' – ' + longDate(m.last);
        head.appendChild(text('span', 'champs-day__count', when + (m.type ? ' · ' + m.type : '')));
        head.appendChild(text('span', 'champs-tag champs-tag--next ath-badge',
          m.results.length + ' result' + (m.results.length === 1 ? '' : 's')));
        block.appendChild(head);
        var body = text('div', 'champs-day__body src-meeting__body');
        var link = text('a', 'records-source', m.live ? 'Meeting on AthleticLIVE' : 'Published results');
        link.href = m.link; link.target = '_blank'; link.rel = 'noopener';
        var p = text('p', 'src-meeting__link'); p.appendChild(link);
        // the meeting's other links (an organiser's PDF, a photo finish, a livestream), if any
        var also = window.NCANMeetingLinks ? NCANMeetingLinks.forMeeting(athlete.meeting_links, m.link) : [];
        also.forEach(function (l, i) {
          p.appendChild(document.createTextNode(i ? ' · ' : ' · Also: '));
          var x = text('a', 'records-source', l.label);
          x.href = l.url; x.target = '_blank'; x.rel = 'noopener';
          p.appendChild(x);
        });
        body.appendChild(p);
        var ul = text('ul', 'src-results');
        m.results.forEach(function (r) {
          var li = text('li');
          li.appendChild(text('span', 'src-results__event', r.event));
          var a = text('a', 'records-source', markText(r));
          a.href = r.source; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Official result';
          li.appendChild(a);
          var bits = [];
          if (r.place) { bits.push(ordinal(r.place) + (r.of ? ' of ' + r.of : '')); }
          if (!r.club) { bits.push(r.team); } else if (r.unattached) { bits.push('Unattached'); }
          if (bits.length) { li.appendChild(text('span', 'src-results__meta', ' · ' + bits.join(' · '))); }
          if (isNewPb(r)) { li.appendChild(text('span', 'champs-tag champs-tag--next ath-badge ath-badge--newpb', 'New personal best')); }
          ul.appendChild(li);
        });
        body.appendChild(ul);
        block.appendChild(body);
        group.appendChild(block);
      });
      out.appendChild(group);
    });
    $('ath-sources').hidden = !list.length;
  }

  // a button in the page heading that jumps to a section: shown or not
  function jump(href, on) {
    var a = document.querySelector('.page-head a[href="' + href + '"]');
    if (a) { a.style.display = on ? '' : 'none'; }
  }

  function describe() {
    var name = athlete.name;
    document.title = name + ' — North Canterbury Athletic Club';
    $('page-heading').textContent = name;
    $('crumb-name').textContent = name;
    var bits = [];
    var group = athlete.group || (athlete.grade ? 'Grade ' + athlete.grade : '');
    if (group) { bits.push(group + ' in ' + athlete.season); }
    var adult = group && !/^Grade /.test(group);   // women and men from U16
    bits.push(athlete.gender === 'girls' ? (adult ? 'Women' : 'Girls')
      : athlete.gender === 'boys' ? (adult ? 'Men' : 'Boys') : 'North Canterbury');
    $('ath-eyebrow').textContent = bits.join(' · ');
    var events = byEvent(athlete.results).length;
    var total = athlete.everything.length;
    events = byEvent(athlete.everything).length;
    $('ath-lede').textContent = total + ' result' + (total === 1 ? '' : 's') +
      ' in ' + events + ' event' + (events === 1 ? '' : 's') +
      ', from published track and field results, for North Canterbury and any team ' + name.split(' ')[0] + ' represented while a member of NCAN.';
    if (athlete.updated) { $('ath-updated').textContent = 'Last updated ' + longDate(athlete.updated) + '.'; }
  }

  function missing(message) {
    $('ath-status').textContent = message;
    $('page-heading').textContent = 'Athlete not found';
    $('ath-lede').textContent = 'There is no page for this athlete that you can see. They may not have a result yet, ' +
      'their family may have asked for it to be removed, or it isn’t linked to your email address.';
    ['progress', 'all-results'].forEach(function (id) { $(id).hidden = true; });
    document.querySelector('.ath-filters').hidden = true;
  }

  // Not signed in: a sign-in box, which brings them back to this page.
  function signedOut() {
    $('ath-status').textContent = '';
    ['progress', 'all-results'].forEach(function (id) { $(id).hidden = true; });
    document.querySelector('.ath-filters').hidden = true;
    NCAN.signIn($('ath-signin'));
  }

  NCAN.me().then(function (who) { NCAN.account($('account'), who); }, function () { /* shown below */ });

  // The address: /athlete/#/sam-brown, or /athlete/#/sam-brown/out-of-stadia for a section.
  // (An old link, athlete.html?a=sam-brown#out-of-stadia, is turned into this before it
  // gets here: by athlete.html, or by 404.html; the same is done for one on this page.)
  // A section renamed: links made before keep working (off-track was renamed out-of-stadia in Nov 2026).
  var RENAMED = { 'off-track': 'out-of-stadia' };
  function route() {
    var plain = RENAMED[location.hash.slice(1)];
    if (plain) { history.replaceState(null, '', '#' + plain); }
    // an enlarged chart: /athlete/#/sam-brown/chart/100m-hurdles
    var c = /^#\/([a-z0-9]+(?:-[a-z0-9]+)*)\/chart\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location.hash);
    if (c) { return { id: c[1], section: '', chart: c[2] }; }
    var m = /^#\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/([A-Za-z][\w-]*))?$/.exec(location.hash);
    if (m && RENAMED[m[2]]) {
      history.replaceState(null, '', '#/' + m[1] + '/' + RENAMED[m[2]]);
      return { id: m[1], section: RENAMED[m[2]] };
    }
    return m ? { id: m[1], section: m[2] || '' } : null;
  }
  var here = route();
  if (!here) {
    var old = new URLSearchParams(location.search);
    var was = old.get('a') || old.get('id');
    if (was) {
      location.replace('/athlete/#/' + was + (location.hash.length > 1 ? '/' + location.hash.slice(1) : ''));
      return;
    }
    missing('No athlete given. Find one on the athletes page.');
    return;
  }
  var id = here.id;
  var current = id;           // the athlete in the address once loaded: their name, not a number

  // arriving: straight there, as a link to a section does; within the page: smoothly
  function goTo(section, arriving) {
    var el = section && document.getElementById(section);
    if (el && !el.hidden) { el.scrollIntoView(arriving ? { behavior: 'instant' } : undefined); }
  }
  // another athlete: load the page afresh; another section: scroll there. A plain
  // in-page link (#out-of-stadia, the skip link's #main) keeps the athlete in the address.
  window.addEventListener('hashchange', function () {
    var now = route();
    if (!now) {
      var section = location.hash.slice(1);
      if (window.history && history.replaceState) {
        history.replaceState(null, '', '#/' + current + (section ? '/' + section : ''));
      }
      goTo(section);
      return;
    }
    if (now.id !== current && now.id !== id) { location.reload(); return; }
    // Back (or Forward) into or out of an enlarged chart
    var dlg = $('ath-zoom');
    if (now.chart) {
      if (!(dlg && dlg.open && zoom.slug === now.chart) && !zoomOpen(now.chart)) {
        history.replaceState(null, '', '#/' + current);
      }
      return;
    }
    if (dlg && dlg.open) { zoomClose(true); return; }
    goTo(now.section);
  });

  NCAN.get('/athletes/' + id)
    .then(function (json) {
      // an address that has moved (a corrected name, two numbers joined) or an old
      // number: go to the page's address now, keeping the section
      if (json.same_as) {
        current = json.slug || String(json.same_as);
        location.replace('/athlete/#/' + current + (here.section ? '/' + here.section : ''));
        location.reload();
        return;
      }
      // an old link by number: show the page's own address instead
      if (json.slug && json.slug !== id && window.history && history.replaceState) {
        history.replaceState(null, '', '#/' + json.slug + (here.section ? '/' + here.section : ''));
      }
      current = json.slug || id;
      athlete = json;
      // the header photo (athlete-photo.js): the athlete's own, and who may change it
      NCAN.athlete = { slug: current, name: json.name, photo: json.photo || null,
        can_change_photo: !!json.can_change_photo, can_remove_photo: !!json.can_remove_photo,
        can_share: !!json.can_share };
      document.dispatchEvent(new CustomEvent('ncan:athlete', { detail: NCAN.athlete }));
      // cross country, road and relay legs have a section of their own: the
      // track sections (PBs, charts, filters, the results table) never see them
      var offTrack = json.results.filter(function (r) { return r.oos; });
      json.results = json.results.filter(function (r) { return !r.oos; });
      athlete.offTrack = offTrack;
      renderOffTrack(offTrack);
      // the heading's buttons go only to sections that have results
      jump('#out-of-stadia', offTrack.length > 0);
      // Odd distances run only at October's opening meetings (145m, 600m...) are
      // hidden unless asked for; the choice is kept on this device.
      athlete.everything = json.results;
      findNewPbs(json.results);
      // the spread switch, only for an athlete with more than one mark in an event on a day
      var days = {};
      var sameDay = json.results.some(function (r) {
        if (typeof r.value !== 'number') { return false; }
        var k = r.event + '|' + r.date;
        if (days[k]) { return true; }
        days[k] = 1;
        return false;
      });
      if (sameDay) {
        $('ath-spread-field').hidden = false;
        try { $('ath-spread').checked = localStorage.getItem('ncan-athlete-spread') === '1'; } catch (e) { /* default */ }
        $('ath-spread').addEventListener('change', function () {
          try { localStorage.setItem('ncan-athlete-spread', $('ath-spread').checked ? '1' : '0'); } catch (e) { /* not kept */ }
          render();
        });
      }
      // "Infer unrecorded throw weights", only if some throw has no published weight
      // but a usual one; it changes which results are personal bests, so the page
      // starts again. The choice is kept on this device.
      if (json.results.some(function (r) { return isThrow(r) && !r.implement && r.implement_usual; })) {
        $('ath-infer-field').hidden = false;
        $('ath-infer').checked = INFER;
        $('ath-infer').addEventListener('change', function () {
          try { localStorage.setItem('ncan-athlete-infer', this.checked ? '1' : '0'); } catch (e) { /* not kept */ }
          location.reload();
        });
      }
      // "A separate chart for each throwing weight", only if an event has two weights
      var weights = {};
      json.results.filter(isThrow).forEach(function (r) {
        (weights[r.event] = weights[r.event] || {})[weightOf(r) || '?'] = 1;
      });
      if (Object.keys(weights).some(function (e) { return Object.keys(weights[e]).length > 1; })) {
        $('ath-perweight-field').hidden = false;
        $('ath-perweight').checked = PER_WEIGHT;
        $('ath-perweight').addEventListener('change', function () {
          PER_WEIGHT = this.checked;
          try { localStorage.setItem('ncan-athlete-perweight', PER_WEIGHT ? '1' : '0'); } catch (e) { /* not kept */ }
          render();
        });
      }
      var early = false;
      try { early = localStorage.getItem('ncan-athlete-early') === '1'; } catch (e) { /* default */ }
      // an athlete with only early-season results sees them all, with no switch
      var onlyEarly = json.results.length && json.results.every(function (r) { return r.early; });
      if (onlyEarly) { early = true; }
      if (!onlyEarly && json.results.some(function (r) { return r.early; })) {
        ['', '-2'].forEach(function (n) {
          $('ath-early-field' + n).hidden = false;
          $('ath-early' + n).checked = early;
          $('ath-early' + n).addEventListener('change', function () {
            try { localStorage.setItem('ncan-athlete-early', this.checked ? '1' : '0'); } catch (e) { /* not kept */ }
            location.reload();
          });
        });
      }
      if (!early) { athlete.results = json.results.filter(function (r) { return !r.early; }); }
      // the wind-legal filter only means something if there is a wind-assisted mark
      if (!athlete.results.some(windy)) {
        ['ath-wind', 'ath-wind-2'].forEach(function (id) { $(id).parentNode.hidden = true; });
      }
      describe();
      var first = json.name.split(' ')[0];
      var oosWords = offTrack.length + ' cross country, road and relay result' + (offTrack.length === 1 ? '' : 's');
      // no track and field results: a member with no results yet, or one who only
      // runs cross country and road
      if (!json.results.length) {
        $('ath-lede').textContent = offTrack.length
          ? oosWords + ' from published meetings, for North Canterbury and any team ' + first +
            ' represented while a member of NCAN. No track and field results yet.'
          : first + ' is registered with the club for ' + json.season + ', with no published ' +
            'results yet. Results appear here a few days after a meeting publishes them.';
        ['track', 'summary', 'progress', 'all-results'].forEach(function (x) { $(x).hidden = true; });
        jump('#track', false);
        if (offTrack.length) {
          athlete.everything = [];
          renderSources();
          renderStats([]);
          $('glance-note').textContent = 'Cross country, road and relay results.';
          setTimeout(function () { goTo(here.section, true); }, 0);
        }
        return;
      }
      if (offTrack.length) {
        $('ath-lede').textContent += ' Also ' + oosWords + ': see below.';
      }
      renderSources();
      setUp();
      zoomSetUp();
      render();
      // a section in the address: there once the page is drawn; a chart: opened
      if (here.chart) {
        if (!zoomOpen(here.chart) && window.history && history.replaceState) { history.replaceState(null, '', '#/' + current); }
        return;
      }
      setTimeout(function () { goTo(here.section, true); }, 0);
    })
    .catch(function (err) {
      if (err.status === 401) { signedOut(); }
      else if (err.status === 404) { missing('There is no page for athlete ' + id + ' that you can see.'); }
      else { $('ath-status').textContent = 'Sorry, this page could not be loaded. Please try again later.'; }
    });
}());
