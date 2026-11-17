/*
  training-icons.js - an icon for each training activity, for the Tuesday training
  page (assets/js/training.js): on the plan, the planner's chips and groups, and
  printed plans and strips.

  The athlete pictograms (sprints, hurdles, relays, race walking, the jumps and
  throws, vortex) were drawn for the club, on a 24 x 24 grid: a 2.2 head, limbs 2 wide with round
  ends, and the ground or equipment shaded (class "d": a quarter of the colour).
  They draw in currentColor, so they follow the text's colour (green on screen,
  black in print, and in dark mode).

  NCANTrainingIcons.icon(activity) -> an <svg> element, or null when there's no
  icon for it. An activity typed in gets one when its name contains a known
  event ("Hurdles drills", "Shot put technique").
*/
(function () {
  'use strict';

  var HEAD = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="currentColor" stroke="none"/>'; };
  var LIMBS = function (d) { return '<path d="' + d + '"/>'; };

  // the drawings: what goes inside <svg viewBox="0 0 24 24">, limbs stroked
  var DRAWN = {
    sprints:
      '<path class="d" d="M1.5 9h3.5M1 12.5h3.5" stroke-width="1.6"/>' +
      LIMBS('M14 7.2 10.8 12.8M13.4 8.6l3.2 1.4 2-1.8M13.4 8.6 10 8.4 7.6 10.4M10.8 12.8l3.4 2.4-1 4.6M10.8 12.8l-3 3H4.2') +
      HEAD(15.5, 4.5),
    hurdles:
      '<path d="M11.5 16.5h9M19.5 16.5V21M12.5 16.5V21" stroke-width="1.6"/>' +
      LIMBS('M14.3 6.4 11 11M11 11h8.5M11 11 7.4 12.4l1.4 3M13.6 7.8l4.8.2M13.6 7.8l-4-1') +
      HEAD(15.5, 3.8),
    relays:
      LIMBS('M6.4 7.6 5 12.4M6.2 9l3.8 1.4M6.2 9 3.2 8.6M5 12.4l2.8 2.8-.8 4.4M5 12.4l-2.4 3' +
            'M17.2 7.2 15.6 12.2M16.9 8.8 13.2 10.3M16.9 8.8l3.1-1.2 1.4 1.6M15.6 12.2l3 2.6-.6 4.6M15.6 12.2l-2.2 3.2-2.4.6') +
      '<path d="M10.4 10.3h2.4" stroke-width="3"/>' + HEAD(6.8, 5.2) + HEAD(18, 4.8),
    'long jump':
      '<path class="d" d="M2 20.5Q12 16.5 22 20.5V22H2z" stroke="none"/>' +
      LIMBS('M8.6 7.2l2 4.6M9.4 8.8l5-1.6M9.4 8.8l-3.2 1.8M10.6 11.8l5 .8 2 3M10.6 11.8l2.8 3 1.4 2.2') +
      HEAD(8, 4.8),
    'triple jump':
      '<path class="d" d="M14.5 20Q18.5 18.6 22.5 20V22h-8z" stroke="none"/>' +
      '<path d="M1.5 20.6h3" stroke-width="2.4"/>' +
      '<path d="M3.5 19.4q2-7 4 0M8.3 19.4q2.4-9 4.8 0M13.9 19.4q2.8-12 6.4-1.6"/>' +
      '<path class="d" d="M7.5 21.2h1.2M12.7 21.2h1.2" stroke-width="1.6"/>',
    'high jump':
      '<path class="d" d="M6 19h12v3H6z" stroke="none"/>' +
      '<path d="M2.5 15.5h19" stroke-width="1.6"/>' +
      LIMBS('M8.6 11.6Q13 6.2 18.2 9.6l2.8 3.2M9.4 10.8 6.2 13.6') +
      HEAD(7.4, 10.2),
    'shot put':
      '<ellipse class="d" cx="11" cy="20.8" rx="7.5" ry="1.5" stroke="none"/>' +
      LIMBS('M11.2 6.8 10.8 13.4M11.2 8.6l3.2-1.2M11.2 8.6l-3.6 2M10.8 13.4l-3 6.4M10.8 13.4l4 5.8') +
      HEAD(11.2, 4.4) + '<circle cx="15.8" cy="5.8" r="2.3" fill="currentColor" stroke="none"/>',
    discus:
      '<ellipse class="d" cx="11.5" cy="20.8" rx="7.5" ry="1.5" stroke="none"/>' +
      LIMBS('M11.8 6.6 11.4 13M11.8 8.4l7.2 1M11.8 8.4l-4.4 2M11.4 13l-3 6.6M11.4 13l4 5.8') +
      HEAD(11.8, 4.2) + '<ellipse cx="20.8" cy="9.6" rx="2" ry="1.2" fill="currentColor" stroke="none"/>',
    // race walking: upright, the front leg straight from the heel landing (toe up),
    // the back leg pushing off its toes (one foot always down), arms bent at 90 degrees
    'race walk':
      '<path class="d" d="M2.5 21.4h19" stroke-width="1.6"/>' +
      LIMBS('M12 6.4 11.6 12.4M11.6 12.4l4 7.9 2-1M11.6 12.4l-4 7.3-2 .9M11.9 8l1.9 2.6 2.6-1.9M11.9 8 9.6 10.4l-1.2 2.4') +
      HEAD(12.2, 4),
    // vortex: a thrower following through, the howler (a finned foam dart) in flight
    vortex:
      '<ellipse class="d" cx="9" cy="20.8" rx="6.5" ry="1.4" stroke="none"/>' +
      LIMBS('M7 8.6 8 14M7.2 10l3.8-2.6M7.2 10 3.8 12M8 14l-2.8 6M8 14l3.8 5') +
      HEAD(6.8, 6.2) +
      // the howler: a rounded nose, a thin tail, fins at its end
      '<ellipse cx="20.2" cy="3.9" rx="2.5" ry="1.5" transform="rotate(-30 20.2 3.9)" fill="currentColor" stroke="none"/>' +
      '<path d="M18.2 5.1 14.6 7.2" stroke-width="1.2"/>' +
      '<path d="M15.8 6.5 13.2 5.6l.9 1.6-.5 1.8z" fill="currentColor" stroke-width="1"/>',
    javelin:
      '<path d="M2.5 14 22 3" stroke-width="1.6"/>' +
      LIMBS('M8.8 8l1 5.6M9 9.6l-3.8 2.8M9 9.6l4-1.4M9.8 13.6l-3 6.2M9.8 13.6l4 5.2') +
      HEAD(8.6, 5.6)
  };

  // which icon an activity gets: its name, or a known event inside a name typed in
  var MATCH = [
    ['set up', /\bset ?up\b/], ['pack down', /\bpack ?(down|up)\b/],
    ['warm up', /\bwarm/], ['cool down', /\bcool/],
    ['hurdles', /hurdle/], ['relays', /relay|baton/],
    ['triple jump', /triple/], ['long jump', /long jump/], ['high jump', /high jump/],
    ['shot put', /\bshot\b/], ['discus', /discus/], ['javelin', /javelin/], ['vortex', /vortex|howler/],
    ['race walk', /walk/],      // "Long run / race walk" too: the walk is the technique to show
    ['middle distance', /middle|distance/], ['long run', /long run|\brun\b|jog|cross country/],
    ['sprints', /sprint|dash/], ['starts', /\bstarts?\b|blocks/], ['games', /game|play/]
  ];

  function key(activity) {
    var name = String(activity || '').trim().toLowerCase();
    if (!name) { return null; }
    for (var i = 0; i < MATCH.length; i++) {
      if (MATCH[i][1].test(name)) { return MATCH[i][0]; }
    }
    return null;
  }

  // icons from a library (Phosphor, MIT licence), added to OTHER when they're in the project
  var OTHER = window.NCANTrainingIconsMore || {};

  function icon(activity) {
    var k = key(activity);
    var inner = k && (DRAWN[k] || OTHER[k]);
    if (!inner) { return null; }
    var box = document.createElement('span');
    var other = !DRAWN[k];
    box.innerHTML = other
      ? '<svg class="plan-icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false" fill="currentColor">' + inner + '</svg>'
      : '<svg class="plan-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    return box.firstChild;
  }

  window.NCANTrainingIcons = { icon: icon, key: key, drawn: Object.keys(DRAWN) };
}());
