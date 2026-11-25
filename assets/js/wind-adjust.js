/*
  Wind-adjusted estimates: what a sprint, hurdles or horizontal jump mark might
  have been with no wind. A guide only; PBs, records and results always use the
  mark as run. The athlete page shows them with its As run / Wind adjusted switch.

  Positive wind is a tailwind. The rules, by event:

  - 60m, 80m, 100m and 200m, winds to 4 m/s either way: Mureika's air-resistance
    model with the race distance, t0 = t[1 + D - D(1 - w t / d)^2], D = 0.027
    ("Back-of-the-envelope" wind correction, arXiv physics/0006057). A 200m
    is measured on the home straight only, so the correction is applied to the
    straight, taken as half the time over 100 metres.
  - Hurdles (60m, 80m, 100m, 110m), winds to 2 m/s: Moinat, Fabius and Emanuel
    (2018), t0 = t + 0.093w - 0.010w^2.
  - Long jump, winds to 4 m/s: Moinat, d0 = d - 0.029w; over 2 m/s the
    estimate is marked rough, as measured gains in strong winds fall short of it.
  - Triple jump, winds to 2 m/s: Moinat, d0 = d - 0.069w + 0.009w^2.

  Any other event, or a wind beyond its limit, gets no estimate. Estimates are
  rounded to the hundredth. Kept apart from athlete.js so the Node tests can
  check it (tests/js/wind-adjust.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANWind = api; }
}(this, function () {
  'use strict';

  var D = 0.027;          // Mureika: the share of a sprinter's effort spent against still air
  var SPRINTS = { 60: 1, 80: 1, 100: 1, 200: 1 };
  var HURDLES = { 60: 1, 80: 1, 100: 1, 110: 1 };

  function sprint(t, w, d) {
    if (d === 200) {
      var ts = t / 2;   // the straight: about half the time, over 100 metres
      return t + ts * (D - D * Math.pow(1 - w * ts / 100, 2));
    }
    return t * (1 + D - D * Math.pow(1 - w * t / d, 2));
  }

  // the rule for an event: its limit (m/s), the limit beyond which it is rough, and the formula
  function rule(event) {
    var e = String(event || '').trim(), m;
    if ((m = /^(\d+)m$/i.exec(e)) && SPRINTS[m[1]]) {
      var d = +m[1];
      return { limit: 4, rough: 4, est: function (t, w) { return sprint(t, w, d); } };
    }
    if ((m = /^(\d+)m Hurdles$/i.exec(e)) && HURDLES[m[1]]) {
      return { limit: 2, rough: 2, est: function (t, w) { return t + 0.093 * w - 0.010 * w * w; } };
    }
    if (/^long jump$/i.test(e)) {
      return { limit: 4, rough: 2, est: function (x, w) { return x - 0.029 * w; } };
    }
    if (/^triple jump$/i.test(e)) {
      return { limit: 2, rough: 2, est: function (x, w) { return x - 0.069 * w + 0.009 * w * w; } };
    }
    return null;
  }

  // does the event get estimates at all (whatever the wind)?
  function applies(event) { return !!rule(event); }

  // the event's limits in m/s: { limit, rough } (rough = limit when nothing is rough), or null
  function limits(event) {
    var r = rule(event);
    return r ? { limit: r.limit, rough: r.rough } : null;
  }

  /* The estimate for a mark (seconds, or metres for a jump) in a wind (m/s):
     { value, rough } or null when there is none: another event, no mark, no
     reading, or a wind beyond the event's limit. */
  function estimate(event, mark, wind) {
    var r = rule(event);
    if (!r || typeof mark !== 'number' || !isFinite(mark) || mark <= 0 ||
        typeof wind !== 'number' || !isFinite(wind)) { return null; }
    var w = Math.round(wind * 10) / 10;   // readings are to the tenth
    if (Math.abs(w) > r.limit) { return null; }
    return { value: Math.round(r.est(mark, w) * 100) / 100, rough: Math.abs(w) > r.rough };
  }

  return { estimate: estimate, applies: applies, limits: limits };
}));
