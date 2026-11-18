/*
  training-icons.js - an icon for each training activity, for the Junior Athletics
  page (assets/js/training.js): on the plan, the planner's chips and groups, and
  printed plans and strips.

  Every icon is an athlete pictogram drawn for the club, as one family, on a
  24 x 24 grid: a 2.2 head, limbs 2 wide with round ends, and the ground or
  equipment shaded (class "d": a quarter of the colour; "dl" for shaded lines
  that mustn't be filled). They draw in currentColor, so they follow the text's
  colour: the club green on screen (a lighter green in dark mode), black in print.

  NCANTrainingIcons.icon(activity) -> an <svg> element, or null when there's no
  activity. An activity typed in gets an event's icon when its name contains one
  ("Hurdles drills", "Shot put technique"); any other gets the coach with a
  clipboard ("Agility ladder", "Stretching").
*/
(function () {
  'use strict';

  var HEAD = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="currentColor" stroke="none"/>'; };
  var LIMBS = function (d) { return '<path d="' + d + '"/>'; };
  var GROUND = '<path class="d" d="M2.5 21.4h19" stroke-width="1.6"/>';

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
    // warm up: arm circles, a loop with an arrow round each hand
    'warm up':
      '<path class="d" d="M3 21.4h18" stroke-width="1.6"/>' +
      '<path class="dl" d="M5.6 5.4A2.8 2.8 0 1 0 8.4 8.2l-1.3-.9M8.4 8.2l.9-1.2M18.4 5.4a2.8 2.8 0 1 1-2.8 2.8l1.3-.9M15.6 8.2l-.9-1.2" stroke-width="1.5"/>' +
      LIMBS('M12 6.4v7M12 8.2H5.6M12 8.2h6.8M12 13.4l-2.6 7M12 13.4l2.6 7') +
      HEAD(12, 4),
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
      HEAD(8.6, 5.6),
    // set up: putting out a cone
    'set up':
      GROUND + '<path d="M17.6 14.4 15.2 20.8h4.8z" fill="currentColor" stroke-width="1.2"/>' +
      '<path class="d" d="M14.2 21.2h6.8" stroke-width="2"/>' +
      LIMBS('M12.8 9.2 8.6 13M12.4 9.6l3.8 4M12.4 9.6l-1.6 3.2M8.6 13l-1.6 7.6M8.6 13l2.8 7.4') +
      HEAD(14.6, 7.4),
    // starts: the "set" position, the back foot on a block
    starts:
      GROUND + '<path class="d" d="M3 21 5.8 18l1.1 3z" stroke="none"/>' +
      LIMBS('M10.6 11.6 16 14.2M16 14.2l.6 6.6M10.6 11.6l2.2 5-2.4 4.2M10.6 11.6 8 16.2l-2.4 4.4') +
      HEAD(18.4, 13.6),
    // middle distance: an upright runner on the track's lanes
    'middle distance':
      '<path class="dl" d="M2 19.6Q12 16.6 22 19.6M2 22.6Q12 19.6 22 22.6" stroke-width="1.4"/>' +
      LIMBS('M12.2 6.2l-1 5.6M12 7.8l2.6 1.8 1.6-1.6M12 7.8l-2.6 1.4-1 2M11.2 11.8l3 2.4-.4 3.6M11.2 11.8l-2.6 2.8-2.4.2') +
      HEAD(12.6, 3.8),
    // long run: a runner on a track bend, the lane sweeping round and back along
    // the far side, narrowing as it goes
    'long run':
      '<path class="d" d="M1 22.6H15.4C20.6 22.6 23 20.4 23 18.2 23 15.8 20.4 14.6 16.4 14.4L4 14.6 16 15.4' +
      'C19 15.8 20 17 20 18 20 19 18.6 19.4 15.4 19.4H1z" stroke="none"/>' +
      '<g transform="translate(-4.8 3.4) scale(.86)">' +
      '<path d="M12.2 6.2l-1 5.6M12 7.8l2.6 1.8 1.6-1.6M12 7.8l-2.6 1.4-1 2M11.2 11.8l3 2.4-.4 3.6M11.2 11.8l-2.6 2.8-2.4.2" ' +
      'stroke-width="2.33"/><circle cx="12.6" cy="3.8" r="2.56" fill="currentColor" stroke="none"/></g>',
    // games: kicking a ball
    games:
      GROUND + '<circle cx="19" cy="16.6" r="2.4" fill="currentColor" stroke="none"/>' +
      LIMBS('M9.2 6.4l.6 5.6M9.4 8l-3.4 1.6M9.4 8l3.4-.4M9.8 12l-1.4 8.6M9.8 12l4.6 3.6 1.6-1') +
      HEAD(9, 4),
    // cool down: a standing quad stretch
    'cool down':
      GROUND + LIMBS('M11 6.2l.4 6.2M11.4 12.4 11 20.8M11.4 12.4l1.2 4.6 2.2-4.4M11.2 8l3.4 4.2M11.2 8l-4.8.8') +
      HEAD(11, 3.8),
    // any other activity: a coach with a clipboard of ticked-off plans
    other:
      GROUND + '<rect x="13.2" y="7.4" width="6" height="7.6" rx=".8" stroke-width="1.5"/>' +
      '<path d="M14.9 7.4V6.4h2.6v1" stroke-width="1.4"/>' +
      '<path class="dl" d="M14.6 10.2l.7.7 1.3-1.4M14.6 12.8l.7.7 1.3-1.4" stroke-width="1.1"/>' +
      LIMBS('M9.6 6.4v6.8M9.6 8.2l3.6 2.6M9.6 8.2 7 12M9.6 13.2l-2.4 7.2M9.6 13.2l2.4 7.2') +
      HEAD(9.6, 4),
    // pack down: carrying the gear away in a box
    'pack down':
      GROUND + '<rect x="13.2" y="8.6" width="6.4" height="5.4" rx=".6" fill="currentColor" stroke="none"/>' +
      '<path class="d" d="M13.2 10.6h6.4" stroke-width="1"/>' +
      LIMBS('M10 6.4V13M10 8.2l3.6 2.4M10 8.2l3 3.8M10 13l-2.4 7.6M10 13l2.8 7.4') +
      HEAD(10, 4)
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
    return 'other';
  }

  function icon(activity) {
    var k = key(activity);
    var inner = k && DRAWN[k];
    if (!inner) { return null; }
    var box = document.createElement('span');
    box.innerHTML = '<svg class="plan-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    return box.firstChild;
  }

  window.NCANTrainingIcons = { icon: icon, key: key, drawn: Object.keys(DRAWN) };
}());
