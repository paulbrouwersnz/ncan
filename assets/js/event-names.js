/*
  event-names.js - how events out of the stadium are written: cross country, road,
  trail and mountain running have their distances in kilometres ("4 km cross country",
  not "Cross country 4000m"), a pace per kilometre, and no PBs (courses differ). Track
  events are left as they are.

  Used by recap-data.js (meeting recaps) and pb-card.js (an athlete's share card).
  Plain functions; tests/js/event-names.test.js checks them.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANEventNames = api; }
}(this, function () {
  'use strict';

  var OUT = /cross.?country|road|trail|mountain|\bxc\b|marathon/i;
  function isOut(event) { return OUT.test(String(event || '')); }

  // an event's distance in metres, from its name, or null
  function distance(event) {
    var e = String(event || ''), m;
    if (/half.?marathon/i.test(e)) { return 21097.5; }
    if (/marathon/i.test(e)) { return 42195; }
    if ((m = /(\d+(?:\.\d+)?)\s*(?:km|k)\b/i.exec(e))) { return parseFloat(m[1]) * 1000; }
    if ((m = /(\d+(?:\.\d+)?)\s*miles?\b/i.exec(e))) { return parseFloat(m[1]) * 1609.344; }
    if ((m = /(\d+(?:\.\d+)?)\s*m\b/i.exec(e))) { return parseFloat(m[1]); }
    return null;
  }

  // 4000 -> "4", 4500 -> "4.5", 21097.5 -> "21.1"
  function km(metres) {
    var k = Math.round(metres / 100) / 10;
    return String(k % 1 ? k.toFixed(1) : k);
  }

  /* "Cross country 4000m" -> "4 km cross country"; "Road 10000m Race Walk" ->
     "10 km road race walk"; "Trail relay 2500m" -> "2.5 km trail relay". Distances
     under a kilometre, miles and marathons, and track events, as they are. */
  function label(event) {
    var e = String(event || '').trim(), m = /(\d+(?:\.\d+)?)\s*m\b/i.exec(e);
    if (!isOut(e) || !m || parseFloat(m[1]) < 1000) { return e; }
    var rest = (e.slice(0, m.index) + ' ' + e.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim().toLowerCase();
    return km(parseFloat(m[1])) + ' km' + (rest ? ' ' + rest : '');
  }

  // seconds as m:ss (or h:mm:ss): 250 -> "4:10"
  function clock(s) {
    s = Math.round(s);
    var h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? h + ':' + pad(mi) + ':' + pad(se) : mi + ':' + pad(se);
  }
  // a pace per km: 250 -> "4:10 /km"
  function pace(secPerKm) { return secPerKm > 0 ? clock(secPerKm) + ' /km' : ''; }
  // time gained: 30 -> "30s", 75 -> "1:15"
  function gained(s) { return s < 60 ? (Math.round(s * 10) / 10).toString().replace(/\.0$/, '') + 's' : clock(s); }

  /* "Faster than last year" in words, from the API's lastyear:
     { by: 'time', faster, mark } -> "30s faster than last year (12:00)"
     { by: 'pace', pace, was }    -> "Faster pace than last year: 4:10 /km (was 4:20 /km)" */
  function lastYearWords(ly) {
    if (!ly) { return ''; }
    if (ly.by === 'time') { return gained(ly.faster) + ' faster than last year' + (ly.mark ? ' (' + ly.mark + ')' : ''); }
    if (ly.by === 'pace') { return 'Faster pace than last year: ' + pace(ly.pace) + ' (was ' + pace(ly.was) + ')'; }
    return '';
  }

  return { isOut: isOut, distance: distance, km: km, label: label, clock: clock, pace: pace, gained: gained,
           lastYearWords: lastYearWords };
}));
