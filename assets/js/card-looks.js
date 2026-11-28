/*
  card-looks.js - how a meeting recap's preview card looks: its theme (colours and a
  picture in the corner), layout, pattern, sticker, font, the count it features, its
  headline and a photo from the club's gallery.

  Each meeting gets a suggested look (suggest): a holiday it falls on, a special
  meeting, the level of a championship, the kind of meeting, then the season. Staff
  can change any part of it in the recap editor; what they choose is saved with the
  recap (the API's "look"), and anything they leave is the suggestion.

  build() lays the card out as shapes and words in points (600 x 315, drawn at 2x),
  for recaps.js to draw on a canvas:
    rect   { x, y, w, h, colour, round }
    svg    { svg }                    SVG drawn over the whole card (viewBox 0 0 600 315)
    strip  { x, y, w, h, course, colour }   the meeting's track or course (course-strip.js)
    photo  { url, x, y, zoom }        a photo covering the card: x and y (0 to 100) where it's cut, zoom 1 or more
    shade  { colour, mode }           the theme's colour over the photo: 'side' or 'all'
    logo   { x, y, w, h, dark }       the club's crest (dark: the one for dark backgrounds)
    badge  { src, x, y, w, h }        an event's own logo, on a white disc (the Colgate Games')
    text   { words, x, y, size, weight, font ('display' or 'sans'), colour, align, max,
             spacing, italic, squeeze (narrower, 0 to 1), dots (as lit dots), rotate }

  Plain functions, no page: the Node tests check them (tests/js/card-looks.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANCardLooks = api; }
}(this, function () {
  'use strict';

  var W = 600, H = 315, SCALE = 2, LANE = 40;
  var LOGO_RATIO = 888 / 508;
  var K = 600 / 330;            // the corner pictures are drawn on a 330 x 173 grid

  function r1(n) { return Math.round(n * 10) / 10; }

  /* SVG pieces ------------------------------------------------------------------- */
  function C(x, y, r, f, o, s) {
    return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '" fill="' + f + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (s ? ' ' + s : '') + '/>';
  }
  function R(x, y, w, h, f, o, t) {
    return '<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="' + f + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (t ? ' ' + t : '') + '/>';
  }
  function L(a, b, c, d, s, w, o, x) {
    return '<line x1="' + r1(a) + '" y1="' + r1(b) + '" x2="' + r1(c) + '" y2="' + r1(d) + '" stroke="' + s + '" stroke-width="' + (w || 1) + '"' +
      (o != null && o !== 1 ? ' opacity="' + o + '"' : '') + (x ? ' ' + x : '') + '/>';
  }
  function P(points, f, x) { return '<polygon points="' + points + '" fill="' + f + '"' + (x ? ' ' + x : '') + '/>'; }
  function star(x, y, r, c, n, q, extra) {
    n = n || 5; q = q || 0.45;
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * q : r;
      pts.push(r1(x + Math.cos(a) * d) + ',' + r1(y + Math.sin(a) * d));
    }
    return P(pts.join(' '), c, extra);
  }
  function burst(x, y, r, c) {
    var s = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      s += L(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, x + Math.cos(a) * r, y + Math.sin(a) * r, c, 1.6);
    }
    return s;
  }
  function poppy(x, y, s) {
    return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (p) {
      return C(x + p[0] * s * 0.55, y + p[1] * s * 0.55, s * 0.75, '#D7262B');
    }).join('') + C(x, y, s * 0.38, '#141414');
  }
  function leaf(x, y, a, c) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="9" ry="4.5" fill="' + c + '" transform="rotate(' + a + ' ' + x + ' ' + y + ')"/>';
  }
  function egg(x, y, c) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="8" ry="10.5" fill="' + c + '"/>' + L(x - 7.5, y, x + 7.5, y, '#fff', 1.6); }
  function pumpkin(x, y, s) {
    return '<ellipse cx="' + r1(x - s * 0.45) + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.8) + '" fill="#E8741C"/>' +
      '<ellipse cx="' + r1(x + s * 0.45) + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.8) + '" fill="#E8741C"/>' +
      '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r1(s * 0.6) + '" ry="' + r1(s * 0.85) + '" fill="#F28C28"/>' + R(x - 1.5, y - s * 1.15, 3, s * 0.4, '#3C5A1E');
  }
  function laurel(x, y, c) {
    var s = '';
    [-1, 1].forEach(function (sd) {
      for (var i = 0; i < 5; i++) {
        var cx = x + sd * (18 - i * 1.5), cy = y + 28 - i * 9;
        s += '<ellipse cx="' + r1(cx) + '" cy="' + cy + '" rx="3" ry="6.5" fill="' + c + '" transform="rotate(' + sd * (30 - i * 10) + ' ' + r1(cx) + ' ' + cy + ')"/>';
      }
    });
    return s;
  }
  function peaks(c) {
    return P('220,62 250,22 268,40 288,10 312,44 330,30 330,62', c) + P('282,18 288,10 294,18', '#fff');
  }
  function baton(x, y, c) { return R(x, y, 7, 30, c, 1, 'rx="3" transform="rotate(30 ' + x + ' ' + y + ')"'); }
  function ring(x, y, c, inner) { return C(x, y, 13, 'none', 1, 'stroke="' + c + '" stroke-width="1.5"') + inner; }
  function waves(y, c, w, o) {
    return '<path d="M240 ' + y + ' q15 -12 30 0 t30 0 t30 0" fill="none" stroke="' + c + '" stroke-width="' + w + '"' +
      (o ? ' opacity="' + o + '"' : '') + '/>';
  }
  function pohutukawa(x, y, r) {
    var s = '';
    for (var i = 0; i < 14; i++) {
      var a = i * Math.PI / 7, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
      s += L(x, y, ex, ey, '#D7263D', 1.6) + C(ex, ey, 1.4, '#FFD34D');
    }
    return s;
  }
  function southernCross() {
    var s = '';
    [[300, 58, 9], [316, 30, 8], [286, 22, 7], [298, 10, 6]].forEach(function (p) {
      s += star(p[0], p[1], p[2], '#C8102E', 5, 0.42, 'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"');
    });
    return s;
  }
  function rosette() {
    var s = '<g transform="translate(283 46)">' + P('-10,10 -20,52 -12,46 -6,56 0,14', '#C8102E') + P('10,10 20,52 12,46 6,56 0,14', '#111');
    for (var i = 0; i < 16; i++) {
      var a = i * Math.PI / 8;
      s += C(Math.cos(a) * 19, Math.sin(a) * 19, 8, i % 2 ? '#C8102E' : '#111');
    }
    return s + C(0, 0, 16, '#fff') + C(0, 0, 13, '#C8102E') + '</g>';
  }
  function combined(c) {
    return ring(252, 22, c, R(244, 24, 16, 2, c) + L(246, 24, 246, 32, c, 1.5) + L(258, 24, 258, 32, c, 1.5)) +
      ring(284, 22, c, C(284, 22, 6, c)) + ring(316, 22, c, L(306, 30, 326, 14, c, 2)) +
      ring(268, 48, c, L(259, 44, 277, 44, c, 1.5) + L(260, 44, 260, 56, c, 1.5) + L(276, 44, 276, 56, c, 1.5)) +
      ring(300, 48, c, '<path d="M292 54 q8 -14 16 0" fill="none" stroke="' + c + '" stroke-width="1.8"/>');
  }
  function cheq(x, y) {
    var s = '';
    for (var r = 0; r < 4; r++) { for (var c = 0; c < 6; c++) { if ((r + c) % 2) { s += R(x + c * 9, y + r * 9, 9, 9, '#fff'); } } }
    return s;
  }
  function confettiBits(spots) {
    return spots.map(function (p) { return R(p[0], p[1], 9, 9, p[2], 1, 'rx="2" transform="rotate(20 ' + p[0] + ' ' + p[1] + ')"'); }).join('');
  }

  // the club singlet: bottle green, the white sweep up across the chest to the bottom
  // right, edged in gold pinstripes, with a band of white hatching above it
  var SINGLET = R(0, 0, 330, 1.7, '#E2BD2F') +
    P('220,173 258.5,173 330,99 330,52.25', '#F7F7F2') +
    L(207.9, 173, 330, 39, '#FFFFFF', 5.5, 0.85, 'stroke-dasharray="1.6 2.75"') +
    L(215.6, 173, 330, 47.3, '#E2BD2F', 2.2) + L(265.1, 173, 330, 105.6, '#E2BD2F', 2.2) + L(271.7, 173, 330, 112.2, '#E2BD2F', 1.1);
  // where the sweep is on the card (600 x 315), hatching and pinstripes included: words
  // go left of its upper edge, or right of its lower one
  var SWEEP = {
    upper: function (y) { return 370 + (315 - y) * (230 / 253); },
    lower: function (y) { return 500 + (315 - y) * (100 / 105); }
  };

  /* Themes: colours (bg the background, band the counts' band, accent, soft for quieter
     words, text), the line across the top, and the picture in the top right corner. */
  var GROUPS = ['Club', 'Occasions', 'Seasons', 'Championships', 'Special events', 'Event types'];
  var THEMES = [
    { id: 'club', name: 'Club', group: 'Club', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#B8D4C8', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: '' },
    { id: 'singlet', name: 'Club singlet', group: 'Club', bg: '#0E4634', band: '#0A3727', accent: '#E2BD2F', soft: '#CFE3D8', text: '#FFFFFF',
      eyebrow: 'NORTH CANTERBURY', strip: 'none', far: '#0E4634', sweep: true, art: SINGLET },
    { id: 'singlet-track', name: 'Club singlet, with the track', group: 'Club', bg: '#0E4634', band: '#0A3727', accent: '#E2BD2F', soft: '#CFE3D8',
      text: '#FFFFFF', eyebrow: 'NORTH CANTERBURY', far: '#0E4634', sweep: true, art: SINGLET },

    { id: 'new-year', name: 'New Year', group: 'Occasions', bg: '#0D0B2E', band: '#1A1747', accent: '#FFD34D', soft: '#C9C6F2', text: '#FFFFFF',
      eyebrow: 'HAPPY NEW YEAR', art: burst(268, 22, 16, '#FFD34D') + burst(306, 36, 13, '#FF6FB5') + burst(296, 10, 8, '#5BE0F0') },
    { id: 'waitangi', name: 'Waitangi Day', group: 'Occasions', bg: '#012169', band: '#0B2E80', accent: '#FFFFFF', soft: '#C9D3EE', text: '#FFFFFF',
      eyebrow: 'WAITANGI DAY', art: southernCross() + pohutukawa(252, 24, 11) + pohutukawa(262, 52, 8) },
    { id: 'easter', name: 'Easter', group: 'Occasions', bg: '#5B4B8A', band: '#6C5C9E', accent: '#FFE27A', soft: '#E4DDF7', text: '#FFFFFF',
      eyebrow: 'HAPPY EASTER', art: egg(266, 28, '#FFB3C7') + egg(288, 20, '#9FE3C5') + egg(310, 30, '#FFE27A') },
    { id: 'anzac', name: 'Anzac', group: 'Occasions', bg: '#1E2326', band: '#2B3135', accent: '#E8463E', soft: '#D3D6D8', text: '#FFFFFF',
      eyebrow: 'ANZAC', art: poppy(268, 24, 10) + poppy(298, 16, 8) + poppy(312, 40, 9) },
    { id: 'kings-birthday', name: 'King’s Birthday weekend', group: 'Occasions', bg: '#3B1F6B', band: '#4A2A82', accent: '#E9C46A', soft: '#DCD0F0', text: '#FFFFFF',
      eyebrow: 'KING’S BIRTHDAY WEEKEND', art: P('268,50 264,26 278,38 290,20 302,38 316,26 312,50', '#E9C46A') + R(268, 50, 44, 6, '#E9C46A') +
        C(290, 20, 3, '#E9C46A') + C(264, 26, 2.5, '#E9C46A') + C(316, 26, 2.5, '#E9C46A') + C(290, 44, 3, '#C8102E') },
    { id: 'matariki', name: 'Matariki', group: 'Occasions', bg: '#0A1633', band: '#13234A', accent: '#F5D67A', soft: '#C3CEE8', text: '#FFFFFF',
      eyebrow: 'MATARIKI', art: [[262, 14], [276, 22], [290, 12], [284, 34], [300, 28], [270, 40], [312, 16], [302, 44], [256, 30]]
        .map(function (p) { return C(p[0], p[1], 2.6, '#F5D67A'); }).join('') },
    { id: 'halloween', name: 'Halloween', group: 'Occasions', bg: '#1E1430', band: '#2C1F45', accent: '#FF8C1A', soft: '#D7CDEB', text: '#FFFFFF',
      eyebrow: 'SPOOKY RESULTS', art: pumpkin(278, 34, 11) + pumpkin(308, 40, 8) + C(306, 14, 9, '#F4E9C1') },
    { id: 'guy-fawkes', name: 'Guy Fawkes', group: 'Occasions', bg: '#141B3D', band: '#1F2856', accent: '#FF5E5E', soft: '#C8CEEE', text: '#FFFFFF',
      eyebrow: 'FIREWORKS', art: burst(270, 30, 15, '#FF5E5E') + burst(305, 18, 12, '#FFD34D') + burst(312, 46, 7, '#7CF29C') },
    { id: 'canterbury-anniversary', name: 'Canterbury Anniversary', group: 'Occasions', bg: '#111111', band: '#232323', accent: '#E4002B', soft: '#D6D6D6', text: '#FFFFFF',
      eyebrow: 'CANTERBURY ANNIVERSARY', art: [0, 1, 2, 3, 4, 5, 6].map(function (i) { return R(236, i * 24 - 6, 94, 12, '#C8102E'); }).join('') +
        R(236, 0, 94, 152, '#000', 0.25) + rosette() },
    { id: 'christmas', name: 'Christmas', group: 'Occasions', bg: '#8E1B1B', band: '#A42626', accent: '#FFE08A', soft: '#F6CFCF', text: '#FFFFFF',
      eyebrow: 'MERRY CHRISTMAS', art: star(290, 18, 10, '#FFE08A') + C(264, 34, 5, '#2F8F4E') + C(312, 36, 3, '#FFE08A') + C(280, 44, 3, '#FFE08A') + C(300, 46, 5, '#2F8F4E') },

    { id: 'season-opener', name: 'Season opener', group: 'Seasons', bg: '#1F5E3A', band: '#2A7348', accent: '#FFB7D0', soft: '#CDE8D4', text: '#FFFFFF',
      eyebrow: 'SEASON OPENER', art: [[262, 14], [290, 24], [306, 10], [276, 34], [314, 36]].map(function (p) { return C(p[0], p[1], 5, '#FFB7D0', 0.85); }).join('') },
    { id: 'spring', name: 'Spring', group: 'Seasons', bg: '#2F6B4F', band: '#3B7E5E', accent: '#FFE27A', soft: '#D4EBDD', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: [0, 1, 2].map(function (i) { return C(270 + i * 20, 26 - i * 4, 6, '#FFE27A') + C(270 + i * 20, 26 - i * 4, 2.5, '#E8A317'); }).join('') },
    { id: 'summer', name: 'Summer', group: 'Seasons', bg: '#0A8FA8', band: '#13A3BD', accent: '#FFE15C', soft: '#D9F6FB', text: '#FFFFFF',
      eyebrow: 'SUMMER SERIES', strip: 'sand', art: C(296, 26, 18, '#FFE15C') + waves(60, '#fff', 3) + waves(50, '#fff', 2, 0.6) },
    { id: 'autumn', name: 'Autumn', group: 'Seasons', bg: '#5A2E14', band: '#6E3A1C', accent: '#F2A93B', soft: '#F1DCCB', text: '#FFFFFF',
      eyebrow: 'MEETING RESULTS', art: leaf(266, 22, 30, '#E8741C') + leaf(292, 14, -20, '#F2A93B') + leaf(310, 34, 60, '#C0392B') + leaf(282, 40, -50, '#D9A21B') },
    { id: 'winter', name: 'Winter', group: 'Seasons', bg: '#1C3550', band: '#264463', accent: '#BFE3FF', soft: '#CFDDEB', text: '#FFFFFF',
      eyebrow: 'WINTER SERIES', art: peaks('#3D5D80') + [[250, 12], [262, 30], [318, 8], [244, 40]].map(function (p) { return C(p[0], p[1], 2, '#fff', 0.8); }).join('') },
    { id: 'season-finale', name: 'Season finale', group: 'Seasons', bg: '#111111', band: '#222222', accent: '#FFC629', soft: '#CFCFCF', text: '#FFFFFF',
      eyebrow: 'SEASON FINALE', art: cheq(270, 8) },

    { id: 'club-champs', name: 'Club championships', group: 'Championships', bg: '#141414', band: '#222222', accent: '#D4AF37', soft: '#CFCFCF', text: '#FFFFFF',
      eyebrow: 'CLUB CHAMPIONSHIPS', art: laurel(292, 8, '#D4AF37') },
    { id: 'champs', name: 'Canterbury championships', group: 'Championships', bg: '#2B2B2B', band: '#3A3A3A', accent: '#E8443A', soft: '#D8D8D8', text: '#FFFFFF',
      eyebrow: 'CHAMPIONSHIPS', art: R(262, 0, 16, 152, '#E8443A') + R(284, 0, 8, 152, '#E8443A', 0.6) },
    { id: 'south-island', name: 'South Island championships', group: 'Championships', bg: '#183A4A', band: '#22495C', accent: '#7FD1C7', soft: '#CCE3EA', text: '#FFFFFF',
      eyebrow: 'SOUTH ISLAND CHAMPIONSHIPS', art: peaks('#2C5D72') },
    { id: 'national', name: 'National championships', group: 'Championships', bg: '#0A0A0A', band: '#1C1C1C', accent: '#C9CED6', soft: '#A9AEB6', text: '#FFFFFF',
      eyebrow: 'NATIONAL CHAMPIONSHIPS', art: R(262, 26, 16, 22, '#C9CED6') + R(282, 12, 16, 36, '#E5E7EA') + R(302, 32, 16, 16, '#9DA3AB') },
    { id: 'oceania', name: 'Oceania', group: 'Championships', bg: '#003B5C', band: '#0A4C72', accent: '#4FD1C5', soft: '#C6E3F0', text: '#FFFFFF',
      eyebrow: 'OCEANIA CHAMPIONSHIPS', art: waves(30, '#4FD1C5', 3) + waves(44, '#4FD1C5', 2, 0.6) },
    { id: 'international', name: 'International', group: 'Championships', bg: '#06142E', band: '#0D2247', accent: '#3DD6F5', soft: '#B5C8E8', text: '#FFFFFF',
      eyebrow: 'INTERNATIONAL MEET', art: [256, 276, 296, 316].map(function (x) { return C(x, 14, 3, '#fff'); }).join('') + R(250, 18, 72, 2, '#3DD6F5') },

    { id: 'colgate', name: 'Colgate Games', group: 'Special events', bg: '#E4002B', band: '#C70026', accent: '#FFFFFF', soft: '#FFD9DF', text: '#FFFFFF',
      eyebrow: 'COLGATE GAMES', art: '', badge: '/assets/img/colgate-games.png' },     // the event's logo, used with its organisers' OK
    { id: 'childrens', name: 'Children’s', group: 'Special events', bg: '#FFD84D', band: '#FFE57F', accent: '#1F3A93', soft: '#3B4A7A', text: '#14234F', light: true,
      eyebrow: 'GAME ON', art: confettiBits([[256, 12, '#E8443A'], [282, 30, '#1F3A93'], [308, 14, '#2F8F4E'], [266, 40, '#FF7AB6'], [300, 44, '#E8443A']]) },
    { id: 'combined', name: 'Combined events', group: 'Special events', bg: '#232A5C', band: '#2E3672', accent: '#FFB547', soft: '#CBD0F0', text: '#FFFFFF',
      eyebrow: 'COMBINED EVENTS', art: combined('#FFB547') },
    { id: 'everyone', name: 'Athletics for everyone', group: 'Special events', bg: '#00695C', band: '#0B7D6E', accent: '#FFE27A', soft: '#CDEDE7', text: '#FFFFFF',
      eyebrow: 'ATHLETICS FOR EVERYONE', art: ['#FF7AB6', '#FFE27A', '#7FD1FF', '#9BE57F', '#FFB547'].map(function (c, i) { return C(262 + i * 13, 26, 7, c); }).join('') },

    { id: 'interclub', name: 'Interclub', group: 'Event types', bg: '#0B3B2E', band: '#0F4C39', accent: '#FFC629', soft: '#B8D4C8', text: '#FFFFFF',
      eyebrow: 'INTERCLUB', art: ['#FFC629', '#FFFFFF', '#0072B5', '#E8443A'].map(function (c, i) { return R(262 + i * 15, 0, 10, 52, c, 0.9); }).join('') },
    { id: 'twilight', name: 'Twilight', group: 'Event types', bg: '#1B1F4B', band: '#272C63', accent: '#FF9F43', soft: '#C6C9EE', text: '#FFFFFF',
      eyebrow: 'TWILIGHT MEET', art: P('308,0 330,0 258,94 230,94', '#fff', 'opacity=".07"') + P('275,0 292,0 198,94 176,94', '#fff', 'opacity=".05"') + C(316, 8, 4, '#fff') },
    { id: 'relays', name: 'Relays', group: 'Event types', bg: '#0E3F6E', band: '#174F85', accent: '#FF8A3D', soft: '#C9DCF0', text: '#FFFFFF',
      eyebrow: 'RELAYS', art: baton(268, 4, '#FF8A3D') + baton(292, 6, '#FFD34D') + baton(316, 8, '#fff') },
    { id: 'steeplechase', name: 'Steeplechase', group: 'Event types', bg: '#0D4B5C', band: '#165C6F', accent: '#7EE0F2', soft: '#CDE7EE', text: '#FFFFFF',
      eyebrow: 'STEEPLECHASE', art: R(258, 30, 60, 6, '#fff') + R(262, 36, 4, 16, '#fff') + R(310, 36, 4, 16, '#fff') + R(250, 52, 76, 6, '#7EE0F2') },
    { id: 'throws', name: 'Throws', group: 'Event types', bg: '#3A2A1E', band: '#4A372A', accent: '#F2B33D', soft: '#E5D6C6', text: '#FFFFFF',
      eyebrow: 'THROWS', art: L(270, 52, 318, 4, '#F2B33D', 1.5) + L(270, 52, 330, 30, '#F2B33D', 1.5) +
        '<path d="M300 22 A40 40 0 0 1 308 40" fill="none" stroke="#F2B33D" stroke-dasharray="3 3"/>' + C(270, 52, 4, '#F2B33D') },
    { id: 'indoor', name: 'Indoor', group: 'Event types', bg: '#2A1B3D', band: '#3A2853', accent: '#FF6B6B', soft: '#DCD0EC', text: '#FFFFFF',
      eyebrow: 'INDOOR', art: '<path d="M240 40 Q285 0 330 40" fill="none" stroke="#FF6B6B" stroke-width="2"/>' +
        [255, 270, 285, 300, 315].map(function (x) { return L(x, 40, x, 52, '#FF6B6B', 1); }).join('') },
    { id: 'masters', name: 'Masters', group: 'Event types', bg: '#4A1942', band: '#5C2453', accent: '#E3A869', soft: '#E5CFE0', text: '#FFFFFF',
      eyebrow: 'MASTERS', art: C(292, 26, 20, 'none', 1, 'stroke="#E3A869" stroke-width="3"') + C(292, 26, 12, '#E3A869', 0.5) },
    { id: 'schools', name: 'Schools', group: 'Event types', bg: '#13315C', band: '#1C4378', accent: '#F2C14E', soft: '#C8D6EA', text: '#FFFFFF',
      eyebrow: 'SCHOOLS ATHLETICS', art: [30, 60, 90, 120].map(function (y) { return L(0, y, 330, y, '#fff', 1, 0.06); }).join('') + star(300, 24, 9, '#F2C14E') },
    { id: 'cross-country', name: 'Cross country', group: 'Event types', bg: '#3B2F25', band: '#4A3B2E', accent: '#FF4FA3', soft: '#E2D6C8', text: '#FFFFFF',
      eyebrow: 'CROSS COUNTRY', art: [[262, 20], [286, 34], [310, 18]].map(function (p) { return C(p[0], p[1], 5, '#FF4FA3'); }).join('') },
    { id: 'road', name: 'Road', group: 'Event types', bg: '#25282B', band: '#33373B', accent: '#FFD34D', soft: '#C9CDD1', text: '#FFFFFF',
      eyebrow: 'ROAD RACE', art: L(250, 40, 330, 40, '#FFD34D', 3, 1, 'stroke-dasharray="14 9"') },
    { id: 'trail', name: 'Trail and hill', group: 'Event types', bg: '#35432A', band: '#435436', accent: '#E9C46A', soft: '#D6DEC9', text: '#FFFFFF',
      eyebrow: 'TRAIL RUN', art: [0, 1, 2, 3].map(function (i) {
        return '<ellipse cx="292" cy="30" rx="' + (14 + i * 11) + '" ry="' + (9 + i * 7) + '" fill="none" stroke="#E9C46A" opacity=".3"/>';
      }).join('') }
  ];
  var BY_ID = {};
  THEMES.forEach(function (t) { BY_ID[t.id] = t; });

  var LAYOUTS = [
    { id: 'classic', name: 'Classic' }, { id: 'big-number', name: 'Big number' }, { id: 'race-bib', name: 'Race bib' },
    { id: 'scoreboard', name: 'Scoreboard' }, { id: 'poster', name: 'Poster' }, { id: 'ticket', name: 'Ticket' },
    { id: 'podium', name: 'Podium' }
  ];
  var PATTERNS = [
    { id: 'none', name: 'None' }, { id: 'stripes', name: 'Stripes' }, { id: 'dots', name: 'Dots' }, { id: 'confetti', name: 'Confetti' },
    { id: 'lanes', name: 'Lanes' }, { id: 'chevrons', name: 'Chevrons' }, { id: 'hoops', name: 'Hoops' }
  ];
  var STICKERS = [
    { id: 'none', name: 'None' }, { id: 'pb', name: 'New PBs stamp' }, { id: 'burst', name: 'Starburst' }, { id: 'medal', name: 'Medal' },
    { id: 'trophy', name: 'Trophy' }, { id: 'star', name: 'Star' }, { id: 'bolt', name: 'Lightning' }, { id: 'flame', name: 'Flame' }
  ];
  // how a sticker is drawn; saved as part of its name ("flame-realistic"), the default left off
  var STICKER_STYLES = [
    { id: 'gradient', name: 'Glossy' }, { id: 'clipart', name: 'Clipart' }, { id: 'translucent', name: 'Translucent' },
    { id: 'realistic', name: 'Realistic' }
  ];
  var STICKER_STYLE = 'gradient';
  function stickerOf(value) {
    var v = String(value || ''), m = /^(.*)-(gradient|clipart|translucent|realistic)$/.exec(v);
    var id = m ? m[1] : v;
    return find(STICKERS, id) ? { id: id, style: id === 'none' ? STICKER_STYLE : m ? m[2] : STICKER_STYLE } : null;
  }
  function stickerValue(id, style) {
    return !id || id === 'none' ? 'none' : style && style !== STICKER_STYLE ? id + '-' + style : id;
  }
  var FONTS = [
    { id: 'bold', name: 'Bold', weight: 800 }, { id: 'heavy', name: 'Heavy italic', weight: 900, italic: true },
    { id: 'condensed', name: 'Condensed', weight: 900, squeeze: 0.72, grow: 1.12 }, { id: 'light', name: 'Light', weight: 300 },
    { id: 'dots', name: 'Scoreboard lights', weight: 800, dots: true }
  ];
  var FEATURES = [{ id: 'pbs', name: 'PBs' }, { id: 'athletes', name: 'Athletes' }, { id: 'podiums', name: 'Podiums' }];
  var HEADLINE_MAX = 28;
  function find(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }

  /* Dates ---------------------------------------------------------------------------- */
  function ymd(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? ymd(+m[1], +m[2], +m[3]) : null;
  }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function between(d, a, b) { return d.getTime() >= a.getTime() && d.getTime() <= b.getTime(); }
  // Easter Sunday (the Gregorian calendar's computus)
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }
  // the nth weekday (0 Sunday to 6 Saturday) of a month
  function nthWeekday(y, m, wd, n) {
    var first = ymd(y, m, 1), shift = (wd - first.getUTCDay() + 7) % 7;
    return addDays(first, shift + (n - 1) * 7);
  }
  // the Matariki public holiday, as set in law (Te Kāhui o Matariki Public Holiday Act 2022)
  var MATARIKI = { 2022: '06-24', 2023: '07-14', 2024: '06-28', 2025: '06-20', 2026: '07-10', 2027: '06-25', 2028: '07-14',
                   2029: '07-06', 2030: '06-21', 2031: '07-11', 2032: '07-02', 2033: '06-24', 2034: '07-07', 2035: '06-29' };
  var MATARIKI_DAYS = 14;       // the Matariki period: a fortnight either side of the holiday
  // Canterbury Anniversary (Show Day): the second Friday after the first Tuesday in November
  function showDay(y) { return addDays(nthWeekday(y, 11, 2, 1), 10); }

  // the holiday or occasion a date falls in, or null
  function occasion(d) {
    if (!d) { return null; }
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (m === 1 && day <= 7) { return 'new-year'; }
    if (between(d, ymd(y, 2, 3), ymd(y, 2, 9))) { return 'waitangi'; }
    var e = easter(y);
    if (between(d, addDays(e, -2), addDays(e, 1))) { return 'easter'; }
    if (between(d, ymd(y, 4, 22), ymd(y, 4, 28))) { return 'anzac'; }
    var kb = nthWeekday(y, 6, 1, 1);
    if (between(d, addDays(kb, -2), kb)) { return 'kings-birthday'; }
    if (MATARIKI[y]) {
      var mt = parse(y + '-' + MATARIKI[y]);
      if (between(d, addDays(mt, -MATARIKI_DAYS), addDays(mt, MATARIKI_DAYS))) { return 'matariki'; }
    }
    if (between(d, ymd(y, 10, 25), ymd(y, 10, 31))) { return 'halloween'; }
    if (between(d, ymd(y, 11, 2), ymd(y, 11, 8))) { return 'guy-fawkes'; }
    var sd = showDay(y);
    if (between(d, addDays(sd, -1), addDays(sd, 2))) { return 'canterbury-anniversary'; }
    if (m === 12 && day <= 24) { return 'christmas'; }
    return null;
  }
  function season(d) {
    if (!d) { return null; }
    var m = d.getUTCMonth() + 1;
    return m >= 9 && m <= 11 ? 'spring' : m === 12 || m <= 2 ? 'summer' : m <= 5 ? 'autumn' : 'winter';
  }

  /* The suggestion ---------------------------------------------------------------- */
  function courseOf(meeting) {
    var kind = meeting && meeting.track && meeting.track.kind;
    if (kind) { return kind; }
    var t = String((meeting && meeting.type) || '').toLowerCase();
    return t === 'cross country' ? 'cross-country' : t === 'road' ? 'road' : t === 'trail' ? 'trail' : 'track';
  }
  var WHY = {
    occasion: 'it’s during {0}', special: 'it’s a {0} meeting', level: 'it’s a {0} meeting', kind: 'it’s a {0} meeting',
    season: 'it’s in {0}', none: 'nothing more particular fits'
  };
  function because(how, theme) {
    var name = theme ? theme.name : '';
    return WHY[how].replace('{0}', how === 'season' ? name.toLowerCase() : name);
  }

  // { theme, why }: the theme a meeting suggests, and why
  function suggestTheme(meeting) {
    meeting = meeting || {};
    var name = String(meeting.name || ''), type = String(meeting.type || '').toLowerCase();
    var d = parse(meeting.first), pick = function (id, how) { return { theme: id, why: because(how, BY_ID[id]) }; };
    if (/christmas/i.test(name)) { return pick('christmas', 'occasion'); }
    var occ = occasion(d);
    if (occ) { return pick(occ, 'occasion'); }
    if (/colgate/i.test(name) || type === 'colgate games') { return pick('colgate', 'special'); }
    if (/opening day/i.test(name)) { return pick('season-opener', 'special'); }
    if (/club champ|ncan champ|north canterbury champ/i.test(name)) { return pick('club-champs', 'special'); }
    if (/\bncan\b|north canterbury a/i.test(name)) { return pick('singlet', 'special'); }     // the club's own meetings
    if (/international|sir graeme douglas|porritt/i.test(name)) { return pick('international', 'special'); }
    if (/oceania/i.test(name)) { return pick('oceania', 'special'); }
    if (/all abilities|halberg|for everyone|inclusi/i.test(name)) { return pick('everyone', 'special'); }
    if (/champ/i.test(name) || type === 'championships') {
      if (/children/i.test(name)) { return pick('childrens', 'level'); }
      if (/\bnz\b|new zealand|national|nzss/i.test(name)) { return pick('national', 'level'); }
      if (/south island|\bsi\b/i.test(name)) { return pick('south-island', 'level'); }
      if (/indoor/i.test(name)) { return pick('indoor', 'kind'); }
      return pick('champs', 'level');
    }
    if (/throw/i.test(name)) { return pick('throws', 'kind'); }
    if (/quadrathon|combined|heptathlon|decathlon|pentathlon|pentath/i.test(name) || type === 'quadrathon') { return pick('combined', 'kind'); }
    if (/steeple/i.test(name) && !/relay/i.test(name)) { return pick('steeplechase', 'kind'); }
    if (/relay/i.test(name) || type === 'relays') { return pick('relays', 'kind'); }
    if (/indoor/i.test(name)) { return pick('indoor', 'kind'); }
    var course = courseOf(meeting);
    if (course === 'cross-country') { return pick('cross-country', 'kind'); }
    if (course === 'road') { return pick('road', 'kind'); }
    if (course === 'trail') { return pick('trail', 'kind'); }
    if (/twilight|friday night lights/i.test(name) || type === 'twilight') { return pick('twilight', 'kind'); }
    if (/masters/i.test(name) || type === 'masters') { return pick('masters', 'kind'); }
    if (/school|aims/i.test(name) || type === 'school') { return pick('schools', 'kind'); }
    if (/children/i.test(name)) { return pick('childrens', 'kind'); }
    var sn = season(d);
    if (sn) { return pick(sn, 'season'); }
    return pick('club', 'none');
  }
  var LAYOUT_FOR = {
    twilight: 'scoreboard', international: 'scoreboard', indoor: 'scoreboard', 'guy-fawkes': 'scoreboard',
    'new-year': 'ticket', christmas: 'ticket', 'canterbury-anniversary': 'ticket',
    colgate: 'poster', childrens: 'poster', 'season-opener': 'poster', 'season-finale': 'poster', summer: 'poster',
    halloween: 'big-number', combined: 'big-number', throws: 'big-number',
    'cross-country': 'race-bib', road: 'race-bib', trail: 'race-bib', relays: 'race-bib', steeplechase: 'race-bib',
    'club-champs': 'podium', champs: 'podium', 'south-island': 'podium', national: 'podium', oceania: 'podium'
  };
  function featureFor(counts) {
    counts = counts || {};
    return counts.pbs ? 'pbs' : counts.medals ? 'podiums' : 'athletes';
  }
  // the whole suggested look for a meeting (counts: the recap's, to pick what to feature)
  function suggest(meeting, counts) {
    var s = suggestTheme(meeting), layout = LAYOUT_FOR[s.theme] || 'classic';
    return { theme: s.theme, why: s.why, layout: layout, pattern: 'none', sticker: 'none',
             font: layout === 'scoreboard' ? 'dots' : layout === 'poster' ? 'condensed' : 'bold',
             feature: featureFor(counts), accent: '', headline: '', photo: '', focus: 50 };
  }
  // a saved look over the suggestion: anything unknown or left out is the suggestion's
  function resolve(look, meeting, counts) {
    look = look || {};
    var s = suggest(meeting, counts), out = {};
    [['theme', THEMES], ['layout', LAYOUTS], ['pattern', PATTERNS], ['font', FONTS], ['feature', FEATURES]]
      .forEach(function (k) { out[k[0]] = look[k[0]] && find(k[1], look[k[0]]) ? look[k[0]] : s[k[0]]; });
    out.sticker = look.sticker && stickerOf(look.sticker) ? look.sticker : s.sticker;
    out.accent = /^#[0-9a-f]{6}$/i.test(look.accent || '') ? look.accent.toLowerCase() : '';
    out.headline = String(look.headline || '').slice(0, HEADLINE_MAX);
    out.photo = /^https:\/\/photos\.ncan\.nz\//.test(look.photo || '') ? look.photo : '';
    out.focus = typeof look.focus === 'number' && look.focus >= 0 && look.focus <= 100 ? Math.round(look.focus) : 50;
    out.suggested = s;
    return out;
  }
  // what to save: only what differs from the suggestion (so a later, better suggestion still applies)
  function toSave(chosen, meeting, counts) {
    var s = suggest(meeting, counts), out = {};
    ['theme', 'layout', 'pattern', 'sticker', 'font', 'feature'].forEach(function (k) {
      if (chosen[k] && chosen[k] !== s[k]) { out[k] = chosen[k]; }
    });
    if (chosen.accent) { out.accent = chosen.accent; }
    var h = String(chosen.headline || '').replace(/\s+/g, ' ').trim();
    if (h) { out.headline = h.slice(0, HEADLINE_MAX); }
    if (chosen.photo) {
      out.photo = chosen.photo;
      if (chosen.focus != null && chosen.focus !== 50) { out.focus = chosen.focus; }
    }
    return out;
  }

  /* Colour checks ---------------------------------------------------------------- */
  function lum(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (s, c, i) { return s + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // dark or white words, whichever reads better on a colour
  function onColour(hex) { return contrast(hex, '#141414') >= contrast(hex, '#FFFFFF') ? '#141414' : '#FFFFFF'; }
  var ACCENT_MIN = 3;           // large, bold words need 3:1 to read (WCAG)
  function accentReads(accent, bg) { return contrast(accent, bg) >= ACCENT_MIN; }

  /* Laying out ------------------------------------------------------------------ */
  function wrap(words, width, lines) {
    var w = String(words || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var out = [], line = '';
    w.forEach(function (word) {
      if (out.length === lines - 1) { line = line ? line + ' ' + word : word; return; }
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else { line = line ? line + ' ' + word : word; }
    });
    if (line) { out.push(line); }
    return out;
  }
  function rot(cx, cy, dx, dy, deg) {
    var a = deg * Math.PI / 180;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  function pattern(id, colour) {
    var s = '';
    if (id === 'stripes') {
      s = '<defs><pattern id="pt" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">' +
        R(0, 0, 11, 22, colour, 0.06) + '</pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'dots') {
      s = '<defs><pattern id="pt" width="18" height="18" patternUnits="userSpaceOnUse">' + C(9, 9, 2.2, colour, 0.12) +
        '</pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'lanes') {
      for (var i = 0; i < 6; i++) {
        s += '<ellipse cx="0" cy="315" rx="' + (200 + i * 40) + '" ry="' + (140 + i * 30) + '" fill="none" stroke="' + colour + '" stroke-width="2" opacity=".08"/>';
      }
    } else if (id === 'confetti') {
      var seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      var cols = ['#FF4FA3', '#FFD34D', '#5BE0F0', '#7CF29C', '#FFFFFF'];
      for (var j = 0; j < 46; j++) {
        var x = Math.round(rnd() * W), y = Math.round(rnd() * 280), a = Math.round(rnd() * 180);
        s += R(x, y, 7, 3.5, cols[j % 5], 0.45, 'transform="rotate(' + a + ' ' + x + ' ' + y + ')"');
      }
    } else if (id === 'chevrons') {
      for (var k = 0; k < 9; k++) {
        s += '<polyline points="' + (-40 + k * 80) + ',0 ' + (k * 80) + ',40 ' + (-40 + k * 80) + ',80" fill="none" stroke="' + colour +
          '" stroke-width="14" opacity=".06" transform="translate(0 ' + 0 + ')"/>';
      }
      s = '<defs><pattern id="pt" width="80" height="80" patternUnits="userSpaceOnUse">' +
        '<polyline points="0,20 40,50 80,20" fill="none" stroke="' + colour + '" stroke-width="12" opacity=".07"/></pattern></defs>' + R(0, 0, W, H, 'url(#pt)');
    } else if (id === 'hoops') {
      for (var h = 0; h < 7; h++) { s += R(0, h * 48 + 12, W, 20, colour, 0.06); }
    }
    return s;
  }

  /* Stickers: each a few parts in a box about 100 across, centred on 0,0 (main parts
     filled, details drawn as they are), drawn in a style: glossy (a gradient, a shine and
     a soft shadow), clipart (flat, bold outline, a white die-cut border), translucent
     (see-through, a white rim) or realistic (shaded and lit, metal for medals and
     trophies, a drop shadow). */
  function mix(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
      var v = Math.round(f < 1 ? c * f : c + (255 - c) * Math.min(1, f - 1));
      return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    }).join('');
  }
  function starPoints(r, n, q) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r * q : r;
      pts.push(r1(Math.cos(a) * d) + ',' + r1(Math.sin(a) * d));
    }
    return pts.join(' ');
  }
  var GOLD = '#E2B23A';
  var SHAPES = {
    pb: function () {
      return [{ el: 'circle', a: { cx: 0, cy: 0, r: 46 }, c: '#E8443A' },
              { el: 'circle', a: { cx: 0, cy: 0, r: 39 }, detail: 'fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="4 3"' }];
    },
    burst: function () { return [{ el: 'polygon', a: { points: starPoints(54, 14, 0.78) }, c: '#FF4FA3' }]; },
    medal: function () {
      return [{ el: 'polygon', a: { points: '-22,-60 -4,-60 10,-14 -8,-14' }, c: '#1F6FD1' },
              { el: 'polygon', a: { points: '22,-60 4,-60 -10,-14 8,-14' }, c: '#E8443A' },
              { el: 'circle', a: { cx: 0, cy: 8, r: 31 }, c: GOLD, metal: true },
              { el: 'circle', a: { cx: 0, cy: 8, r: 24 }, detail: 'fill="none" stroke="#FFF3C4" stroke-width="2" opacity=".8"' }];
    },
    trophy: function () {
      return [{ el: 'path', a: { d: 'M-26 -40 C-50 -40 -50 0 -18 2 L-18 -6 C-38 -8 -38 -32 -26 -32 Z' }, c: GOLD, metal: true },
              { el: 'path', a: { d: 'M26 -40 C50 -40 50 0 18 2 L18 -6 C38 -8 38 -32 26 -32 Z' }, c: GOLD, metal: true },
              { el: 'path', a: { d: 'M-28 -46 H28 V-16 C28 6 14 18 0 20 C-14 18 -28 6 -28 -16 Z' }, c: GOLD, metal: true },
              { el: 'rect', a: { x: -6, y: 18, width: 12, height: 14 }, c: GOLD, metal: true },
              { el: 'rect', a: { x: -24, y: 30, width: 48, height: 16, rx: 3 }, c: '#5B3A1A' }];
    },
    star: function () { return [{ el: 'polygon', a: { points: starPoints(54, 5, 0.46) }, c: '#FFC629', metal: true }]; },
    bolt: function () { return [{ el: 'polygon', a: { points: '8,-56 -26,6 -2,6 -12,56 26,-10 2,-10 14,-56' }, c: '#FFD34D' }]; },
    flame: function () {
      return [{ el: 'path', a: { d: 'M0 50 C-34 40 -36 4 -14 -22 C-12 -6 -4 0 0 2 C2 -18 -2 -34 10 -52 C14 -30 36 -14 32 16 C30 38 16 48 0 50 Z' }, c: '#FF6A13' },
              { el: 'path', a: { d: 'M0 46 C-16 40 -16 20 -4 8 C-2 18 4 20 6 22 C8 12 8 2 14 -6 C22 10 24 24 18 34 C14 42 8 46 0 46 Z' }, c: '#FFD34D' }];
    }
  };
  var STICKER_R = 56;          // how far a sticker reaches from its centre, at full size
  function shapeEl(p, fill, extra) {
    return '<' + p.el + ' ' + Object.keys(p.a).map(function (k) { return k + '="' + p.a[k] + '"'; }).join(' ') +
      ' fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  }
  function stickerArt(value, cx, cy, k) {
    var st = stickerOf(value);
    if (!st || st.id === 'none') { return ''; }
    var parts = SHAPES[st.id](), style = st.style, defs = '', body = '', grads = {}, n = 0;
    var main = parts.filter(function (p) { return !p.detail; });
    var gradFor = function (c, metal) {
      var key = c + (metal ? 'm' : '');
      if (grads[key]) { return grads[key]; }
      var id = 'sg' + (n++);
      grads[key] = id;
      if (style === 'realistic') {
        defs += '<radialGradient id="' + id + '" cx=".34" cy=".28" r=".85">' + (metal
          ? '<stop offset="0" stop-color="' + mix(c, 1.85) + '"/><stop offset=".28" stop-color="' + mix(c, 1.25) + '"/>' +
            '<stop offset=".6" stop-color="' + c + '"/><stop offset=".86" stop-color="' + mix(c, 0.55) + '"/><stop offset="1" stop-color="' + mix(c, 0.8) + '"/>'
          : '<stop offset="0" stop-color="' + mix(c, 1.6) + '"/><stop offset=".5" stop-color="' + c + '"/><stop offset="1" stop-color="' + mix(c, 0.55) + '"/>') +
          '</radialGradient>';
      } else {
        defs += '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(c, 1.45) + '"/>' +
          '<stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + mix(c, 0.66) + '"/></linearGradient>';
      }
      return id;
    };
    var each = function (fn) { return main.map(fn).join(''); };
    var shine = function (top) {
      defs += '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="' + top + '"/>' +
        '<stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>';
      return each(function (p) { return shapeEl(p, 'url(#gl)'); });
    };
    var shadow = function (dy, blur, op) {
      defs += '<filter id="ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="' + dy + '" stdDeviation="' + blur +
        '" flood-color="#000000" flood-opacity="' + op + '"/></filter>';
    };
    if (style === 'clipart') {
      body += each(function (p) { return shapeEl(p, '#FFFFFF', 'stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round"'); });
      body += each(function (p) { return shapeEl(p, p.c, 'stroke="#141414" stroke-width="3.5" stroke-linejoin="round"'); });
    } else if (style === 'translucent') {
      body += each(function (p) { return shapeEl(p, p.c, 'fill-opacity=".5" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="2.5" stroke-linejoin="round"'); });
      body += shine(0.45);
    } else if (style === 'realistic') {
      shadow(5, 4, 0.5);
      body += '<g filter="url(#ds)">' + each(function (p) {
        return shapeEl(p, 'url(#' + gradFor(p.c, p.metal) + ')', 'stroke="' + mix(p.c, 0.5) + '" stroke-width="1.5" stroke-linejoin="round"');
      }) + '</g>';
      body += shine(0.35);
    } else {
      shadow(3, 3, 0.3);
      body += '<g filter="url(#ds)">' + each(function (p) { return shapeEl(p, 'url(#' + gradFor(p.c) + ')'); }) + '</g>';
      body += shine(0.6);
    }
    body += parts.filter(function (p) { return p.detail; }).map(function (p) {
      return '<' + p.el + ' ' + Object.keys(p.a).map(function (q) { return q + '="' + p.a[q] + '"'; }).join(' ') + ' ' + p.detail + '/>';
    }).join('');
    return '<defs>' + defs + '</defs><g transform="translate(' + r1(cx) + ' ' + r1(cy) + ') rotate(-12) scale(' + k + ')">' + body + '</g>';
  }
  function stickerWords(value, cx, cy, k, feat, items) {
    var st = stickerOf(value), id = st && st.id;
    var t = function (words, dy, size, weight, colour, spacing) {
      var p = rot(cx, cy, 0, dy * k, -12);
      items.push({ kind: 'text', words: words, x: r1(p.x), y: r1(p.y), size: r1(size * k), weight: weight, font: 'sans', colour: colour,
                   align: 'center', max: r1(80 * k), spacing: spacing || 0, rotate: -12, sticker: true });
    };
    if (id === 'pb') { t('NEW', -8, 13, 800, '#FFFFFF', 2); t('PBs!', 20, 28, 900, '#FFFFFF'); }
    else if (id === 'burst') { t(String(feat.n), 8, 34, 900, '#FFFFFF'); t(feat.words.toUpperCase(), 26, 12, 800, '#FFFFFF', 1); }
    else if (id === 'medal') { t('1', 20, 32, 900, '#5A4300'); }
    else if (id === 'trophy') { t(String(feat.n), -12, 24, 900, '#5A4300'); }
  }

  /* Where a sticker goes: the layout's own spot, or the first of the others that's clear
     of every word and the crest; if none is, its own spot, smaller, with the words next
     to it narrowed to make room (the canvas squeezes words to their width). */
  var SPOTS = [[532, 62], [540, 150], [544, 236], [300, 46], [420, 250], [64, 252]];
  function textBox(i) {
    var k = i.font === 'display' ? 0.6 : 0.56;
    if (!/[a-z]/.test(i.words)) { k += 0.06; }                  // capitals are wider
    var w = Math.min(i.max, i.words.length * (i.size * k * (i.squeeze || 1) + (i.spacing || 0)));
    var x0 = i.align === 'center' ? i.x - w / 2 : i.align === 'right' ? i.x - w : i.x;
    var y0 = i.y - i.size * 0.8, y1 = i.y + i.size * 0.22;
    if (!i.rotate) { return { x: x0, y: y0, w: w, h: y1 - y0 }; }
    var xs = [], ys = [];
    [[x0, y0], [x0 + w, y0], [x0, y1], [x0 + w, y1]].forEach(function (c) {
      var p = rot(i.x, i.y, c[0] - i.x, c[1] - i.y, i.rotate);
      xs.push(p.x); ys.push(p.y);
    });
    var lx = Math.min.apply(null, xs), ly = Math.min.apply(null, ys);
    return { x: lx, y: ly, w: Math.max.apply(null, xs) - lx, h: Math.max.apply(null, ys) - ly };
  }
  function hitsCircle(b, cx, cy, r) {
    var nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r;
  }
  function placeSticker(items, own) {
    var blocks = items.filter(function (i) { return (i.kind === 'text' && !i.sticker) || i.kind === 'logo' || i.kind === 'badge'; });
    var boxOf = function (i) { return i.kind === 'text' ? textBox(i) : { x: i.x, y: i.y, w: i.w, h: i.h }; };
    var clear = function (cx, cy, r) { return blocks.every(function (i) { return !hitsCircle(boxOf(i), cx, cy, r); }); };
    var tries = [own].concat(SPOTS);
    var sizes = [1.3, 1.15, 1, 0.8];             // as big as there's room for
    for (var s = 0; s < sizes.length; s++) {
      var k = sizes[s];
      for (var j = 0; j < tries.length; j++) {
        if (clear(tries[j][0], tries[j][1], STICKER_R * k)) { return { x: tries[j][0], y: tries[j][1], k: k }; }
      }
    }
    // no clear spot: the first where narrowing the words to its left makes room (only
    // words that start well to its left can be narrowed; the crest can't move)
    var gap = 8;
    var fix = function (cx, cy, r, go) {
      var edge = cx - r - gap, ok = true;
      blocks.forEach(function (i) {
        if (!hitsCircle(boxOf(i), cx, cy, r)) { return; }
        var room = i.kind !== 'text' ? 0 : (!i.align || i.align === 'left') ? edge - i.x - (i.rotate ? 20 : 0)
          : i.align === 'center' ? 2 * (edge - i.x) : 0;
        if (room < 60) { ok = false; return; }
        if (go) { i.max = Math.min(i.max, room); }
      });
      return ok;
    };
    var last = [[W - 30, 30, 0.6]];
    var all = tries.map(function (t) { return [t[0], t[1], 0.85]; }).concat(last);
    for (var q = 0; q < all.length; q++) {
      var c = all[q], r = STICKER_R * c[2];
      if (fix(c[0], c[1], r, false) || q === all.length - 1) { fix(c[0], c[1], r, true); return { x: c[0], y: c[1], k: c[2] }; }
    }
  }

  /* The layouts: each adds its items to `it`. f: the card's facts; t: the colours;
     o: { headline, feature: { n, words }, featureId, sticker }. */
  // t.far: the colour for words that sit on a light part of a theme's picture (the
  // podium's right-hand column, on the singlet's sweep)
  function adder(items, font, t) {
    var add = function (words, x, y, size, o) {
      if (words === '' || words == null) { return; }
      o = o || {};
      if (t.far && o.far) { o.colour = t.far; }
      var disp = o.font === 'display';
      var it = { kind: 'text', words: String(words), x: r1(x), y: r1(y), size: size, weight: o.weight || 400,
                 font: o.font || 'sans', colour: o.colour, align: o.align || 'left', max: o.max || W - 72, spacing: o.spacing || 0 };
      if (disp) {
        it.weight = font.weight;
        if (font.italic) { it.italic = true; }
        if (font.squeeze) { it.squeeze = font.squeeze; it.size = r1(size * (font.grow || 1)); }
        if (font.dots) { it.dots = true; }
      }
      if (o.rotate) { it.rotate = o.rotate; }
      if (o.onBand) { it.onBand = true; }           // on a solid shape of its own, so the picture behind doesn't matter
      items.push(it);
    };
    return add;
  }
  function art(t) { return t.art ? '<g transform="scale(' + K + ')">' + t.art + '</g>' : ''; }
  function stripItem(items, t, f) {
    if (t.strip === 'none') { return; }
    if (t.strip === 'sand') {
      items.push({ kind: 'svg', svg: R(0, H - LANE, W, LANE, '#F2D7A0') +
        '<path d="M0 ' + (H - LANE) + ' q36 -10 72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0 t72 0" fill="#fff" opacity=".85"/>' });
      return;
    }
    items.push({ kind: 'strip', x: 0, y: H - LANE, w: W, h: LANE, course: f.course || 'track', colour: f.lane || '#0072B5' });
  }
  function logoAt(items, t, x, y, h) {
    items.push({ kind: 'logo', x: x, y: y, h: h, w: r1(h * LOGO_RATIO), dark: !t.light });
  }
  function clubLine(items, add, t, y) {
    logoAt(items, t, 36, y, 36);
    add('North Canterbury', 36 + 36 * LOGO_RATIO + 10, y + 17, 13, { weight: 700, colour: t.text, max: 200 });
    add('Athletic Club', 36 + 36 * LOGO_RATIO + 10, y + 32, 13, { weight: 700, colour: t.text, max: 200 });
    add('ncan.nz', W - 36, y + 25, 14, { weight: 600, colour: t.soft, align: 'right', max: 120 });
  }
  function countsBand(items, add, t, f, x, y, w, h) {
    var cw = w / 3;
    items.push({ kind: 'rect', x: x, y: y, w: w, h: h, colour: t.band, round: 10 });
    f.counts.forEach(function (c, i) {
      var cx = x + cw * i + cw / 2;
      add(String(c.n), cx, y + h * 0.57, 34, { font: 'display', colour: t.accent, align: 'center', max: cw - 16 });
      add(c.words, cx, y + h * 0.86, 13, { weight: 600, colour: t.soft, align: 'center', max: cw - 16 });
    });
  }

  var LAYOUT = {
    classic: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      var room = W - 72;
      add(o.headline, 36, 50, 15, { weight: 800, colour: t.accent, spacing: 2, max: room });
      var lines = wrap(f.title, 30, 2), size = lines.length > 1 ? 30 : 36, y = lines.length > 1 ? 88 : 94;
      lines.forEach(function (l, i) { add(l, 36, y + i * (size + 4), size, { font: 'display', colour: t.text, max: room }); });
      y += (lines.length - 1) * (size + 4);
      add(f.line, 36, y + 26, 14, { colour: t.soft, max: room });
      countsBand(items, add, t, f, 36, 158, W - 72, 70);
      clubLine(items, add, t, H - LANE - 10 - 36);
      return { sticker: [520, 70] };
    },
    'big-number': function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      add(String(o.feature.n), 30, 206, 180, { font: 'display', colour: t.accent, max: 270 });
      add(o.feature.words.toUpperCase(), 36, 244, 22, { weight: 800, colour: t.text, spacing: 4, max: 250 });
      add(o.headline, 310, 70, 14, { weight: 800, colour: t.accent, spacing: 2, max: 254 });
      wrap(f.title, 18, 3).forEach(function (l, i) { add(l, 310, 106 + i * 33, 29, { font: 'display', colour: t.text, max: 254 }); });
      add(f.line, 310, 214, 13, { colour: t.soft, max: 254 });
      logoAt(items, t, 310, 226, 28);
      add('ncan.nz', W - 36, 246, 13, { weight: 600, colour: t.soft, align: 'right', max: 120 });
      return { sticker: [250, 64] };
    },
    'race-bib': function (items, add, t, f, o) {
      var band = t.accent, ink = '#141414';
      var from = items.length;
      items.push({ kind: 'rect', x: 60, y: 18, w: 480, h: 216, colour: '#FBFAF5', round: 14, drop: true });
      items.push({ kind: 'svg', svg: R(60, 18, 480, 56, band, 1, 'rx="14"') + R(60, 52, 480, 22, band) +
        [[78, 90], [522, 90], [78, 218], [522, 218]].map(function (p) {
          return C(p[0], p[1], 6.5, '#D9D9D9', 1, 'stroke="#8A8A8A" stroke-width="1.5"') + L(p[0] - 9, p[1], p[0] + 9, p[1], '#8A8A8A', 1.5);
        }).join('') });
      add(f.title, 84, 54, 22, { font: 'display', colour: onColour(band), max: 360 });
      add('NCAN', 516, 54, 18, { weight: 900, colour: onColour(band), align: 'right', max: 80 });
      add(String(o.feature.n), W / 2, 186, 116, { font: 'display', colour: ink, align: 'center', max: 360 });
      add(o.feature.words.toUpperCase() + (o.headline ? ' · ' + o.headline : ''), W / 2, 218, 14,
          { weight: 800, colour: ink, align: 'center', spacing: 3, max: 400 });
      // pinned on a little crooked, as bibs always are
      items.slice(from).forEach(function (i) { i.tilt = [W / 2, 126, -2.5]; });
      // the crest clear of the bib's lower corner, which the tilt brings down
      logoAt(items, t, 36, 274, 30);
      add(f.line, W - 36, 290, 13, { colour: t.soft, align: 'right', max: 400 });
      add('ncan.nz', W - 36, 305, 12, { weight: 600, colour: t.text, align: 'right', max: 120 });
      return { sticker: [548, 168], plain: true };
    },
    scoreboard: function (items, add, t, f, o) {
      items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: '#0B0B0B' });
      items.push({ kind: 'svg', svg: R(20, 20, 560, 275, '#121212', 1, 'rx="10" stroke="#2C2C2C" stroke-width="4"') +
        '<defs><pattern id="ld" width="6" height="6" patternUnits="userSpaceOnUse">' + C(3, 3, 1, '#FFFFFF', 0.05) + '</pattern></defs>' +
        R(20, 20, 560, 275, 'url(#ld)', 1, 'rx="10"') });
      add(o.headline, W / 2, 62, 22, { font: 'display', colour: t.soft, align: 'center', max: 480, spacing: 2 });
      add(f.title, W / 2, 106, 40, { font: 'display', colour: t.accent, align: 'center', max: 520 });
      ['athletes', 'pbs', 'podiums'].forEach(function (k, i) {
        var c = f.counts[i], x = 120 + i * 180;
        add(String(c.n), x, 196, 76, { font: 'display', colour: k === o.featureId ? t.accent : '#FFFFFF', align: 'center', max: 160 });
        add(c.words, x, 228, 20, { font: 'display', colour: t.soft, align: 'center', max: 160 });
      });
      logoAt(items, { light: false }, 40, 248, 30);
      add('North Canterbury Athletic Club · ncan.nz', W / 2, 270, 15, { weight: 700, colour: t.soft, align: 'center', max: 360 });
      return { sticker: [530, 252], plain: true, ownBg: true };
    },
    poster: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) + P('0,212 600,132 600,196 0,276', t.accent) });
      var lines = wrap(f.title, 16, 2), up = lines.length === 1 ? 40 : 0;
      lines.forEach(function (l, i) {
        add(l.toUpperCase(), 36, 92 + i * 58 + up, 54, { font: 'display', colour: t.text, max: 470, rotate: -7.6 });
      });
      var c = f.counts;
      add([o.headline].concat(c.map(function (x) { return x.n + ' ' + x.words.toUpperCase(); })).filter(Boolean).join('  ·  '),
          36, 252, 16, { weight: 800, colour: onColour(t.accent), spacing: 2, max: 520, rotate: -7.6, onBand: true });
      add(f.line, 36, 302, 13, { colour: t.soft, max: 360 });
      logoAt(items, t, 446, 268, 34);
      add('ncan.nz', W - 36, 302, 14, { weight: 700, colour: t.text, align: 'right', max: 100 });
      return { sticker: [520, 60] };
    },
    ticket: function (items, add, t, f, o) {
      items.push({ kind: 'rect', x: 30, y: 30, w: 540, h: 236, colour: t.band, round: 14 });
      items.push({ kind: 'svg', svg: C(420, 30, 15, t.bg) + C(420, 266, 15, t.bg) +
        L(420, 50, 420, 246, t.soft, 2, 0.6, 'stroke-dasharray="6 6"') });
      add(o.headline, 60, 72, 14, { weight: 800, colour: t.accent, spacing: 3, max: 330 });
      var lines = wrap(f.title, 20, 2);
      lines.forEach(function (l, i) { add(l, 60, 110 + i * 36, 32, { font: 'display', colour: t.text, max: 340 }); });
      add(f.line, 60, 110 + (lines.length - 1) * 36 + 28, 13, { colour: t.soft, max: 340 });
      f.counts.forEach(function (c, i) { add(c.n + ' ' + c.words.toLowerCase(), 60 + i * 115, 236, 15, { weight: 700, colour: t.soft, max: 110 }); });
      add('ADMIT ALL', 495, 66, 12, { weight: 800, colour: t.soft, align: 'center', spacing: 3, max: 120 });
      add(String(o.feature.n), 495, 160, 76, { font: 'display', colour: t.accent, align: 'center', max: 120 });
      add(o.feature.words, 495, 188, 16, { weight: 700, colour: t.text, align: 'center', max: 120 });
      logoAt(items, t, r1(495 - 15 * LOGO_RATIO), 204, 30);
      add('North Canterbury Athletic Club', 36, 296, 13, { weight: 700, colour: t.text, max: 300 });
      add('ncan.nz', W - 36, 296, 13, { weight: 600, colour: t.soft, align: 'right', max: 120 });
      return { sticker: [580, 18] };
    },
    podium: function (items, add, t, f, o) {
      items.push({ kind: 'svg', svg: art(t) });
      stripItem(items, t, f);
      var room = W - 72;
      add(o.headline, 36, 50, 15, { weight: 800, colour: t.accent, spacing: 2, max: room });
      add(f.title, 36, 88, 32, { font: 'display', colour: t.text, max: room });
      add(f.line, 36, 114, 14, { colour: t.soft, max: room });
      var ids = ['athletes', 'pbs', 'podiums'], rest = ids.filter(function (k) { return k !== o.featureId; });
      var order = [rest[0], o.featureId, rest[1]], hs = [96, 128, 74], cs = [t.soft, t.accent, t.band];
      order.forEach(function (k, i) {
        var c = f.counts[ids.indexOf(k)], x = 56 + i * 128, h = hs[i], y = H - LANE - 4 - h, ink = onColour(cs[i]);
        items.push({ kind: 'rect', x: x, y: y, w: 120, h: h, colour: cs[i] });
        add(String(c.n), x + 60, y + 44, 36, { font: 'display', colour: ink, align: 'center', max: 108 });
        add(c.words, x + 60, y + 64, 13, { weight: 700, colour: ink, align: 'center', max: 108 });
      });
      // on the singlet, the club's column has a panel of its own, clear of the sweep
      if (t.sweep) { items.push({ kind: 'rect', x: 446, y: 150, w: 130, h: 114, colour: t.band, round: 10 }); }
      logoAt(items, t, 456, 160, 32);
      add('North Canterbury', 456, 214, 13, { weight: 700, colour: t.text, max: 110 });
      add('Athletic Club', 456, 230, 13, { weight: 700, colour: t.text, max: 110 });
      add('ncan.nz', 456, 252, 13, { weight: 600, colour: t.soft, max: 110 });
      return { sticker: [526, 66] };
    }
  };

  /* Keep words off the singlet's white sweep: narrowed to end before it, or moved left
     of it (words set from the right), or in the theme's dark ink when they have to start
     on it. Words on a solid shape of their own (a band or a podium block) are left be;
     a crest on it is the one for light backgrounds. */
  function clearSweep(items, t) {
    var solid = items.filter(function (i) { return i.kind === 'rect' && !(i.x === 0 && i.y === 0 && i.w === W && i.h === H); });
    var inside = function (b) {
      return solid.some(function (r) { return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; });
    };
    items.forEach(function (i) {
      if (i.kind !== 'text' && i.kind !== 'logo') { return; }
      var b = i.kind === 'logo' ? { x: i.x, y: i.y, w: i.w, h: i.h } : textBox(i);
      var bottom = b.y + b.h, up = SWEEP.upper(bottom);
      if (b.x + b.w <= up || b.x >= SWEEP.lower(b.y) || i.onBand || inside(b)) { return; }
      if (i.kind === 'logo') { i.dark = false; return; }
      var room = up - 8 - b.x;
      if ((!i.align || i.align === 'left') && room >= 70) { i.max = Math.min(i.max, room - (i.rotate ? 16 : 0)); return; }
      if (i.align === 'center' && 2 * (up - 8 - i.x) >= 70) { i.max = Math.min(i.max, 2 * (up - 8 - i.x)); return; }
      if (i.align === 'right' && up - 8 - b.w > 230) { i.x = r1(up - 8); return; }
      if (t.far) { i.colour = t.far; }
    });
  }

  // where an event's logo goes in each layout that shows the theme's picture: [x, y, radius]
  var BADGE_AT = { classic: [522, 82, 58], 'big-number': [544, 58, 44], poster: [522, 72, 60], podium: [524, 76, 54] };
  // the layouts that show the theme's picture
  var ART_LAYOUTS = ['classic', 'big-number', 'poster', 'podium'];

  // facts: recap-data.js cardFacts (title, line, lane, course, counts [athletes, PBs, podiums]);
  // chosen: resolve()'s look
  function build(facts, chosen) {
    var theme = BY_ID[chosen.theme] || BY_ID.club;
    var t = {};
    Object.keys(theme).forEach(function (k) { t[k] = theme[k]; });
    if (chosen.accent) { t.accent = chosen.accent; }
    var layout = LAYOUT[chosen.layout] ? chosen.layout : 'classic';
    if (ART_LAYOUTS.indexOf(layout) < 0) { delete t.far; }     // no picture in the corner, so no light edge
    var font = find(FONTS, chosen.font) || FONTS[0];
    var items = [], add = adder(items, font, t);
    var ids = ['athletes', 'pbs', 'podiums'], fi = Math.max(0, ids.indexOf(chosen.feature === 'pbs' ? 'pbs' : chosen.feature));
    var counts = (facts.counts || []).slice(0, 3);
    while (counts.length < 3) { counts.push({ n: 0, words: ['Athletes', 'PBs', 'Podiums'][counts.length] }); }
    var f = { title: facts.title || 'Meeting results', line: facts.line || '', lane: facts.lane, course: facts.course, counts: counts };
    var o = { headline: (chosen.headline || theme.eyebrow || '').toUpperCase(), feature: counts[fi], featureId: ids[fi],
              sticker: !!(stickerOf(chosen.sticker) && stickerOf(chosen.sticker).id !== 'none') };
    // the background, a photo faded into it, and a pattern
    var bg = [];
    if (layout !== 'scoreboard') {
      bg.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: t.bg });
      if (chosen.photo) {
        bg.push({ kind: 'photo', url: chosen.photo, x: chosen.focusX == null ? 50 : chosen.focusX,
                  y: chosen.focus == null ? 50 : chosen.focus, zoom: chosen.zoom > 1 ? chosen.zoom : 1 });
        bg.push({ kind: 'shade', colour: t.bg, mode: layout === 'race-bib' || layout === 'ticket' ? 'all' : 'side' });
      }
      var pt = pattern(chosen.pattern, t.text);
      if (pt) { bg.push({ kind: 'svg', svg: pt }); }
    }
    var spot = LAYOUT[layout](items, add, t, f, o);
    if (t.sweep && ART_LAYOUTS.indexOf(layout) >= 0) { clearSweep(items, t); }
    // an event's logo in the top right, on a white disc; the words beside it narrowed to clear it
    if (t.badge && ART_LAYOUTS.indexOf(layout) >= 0) {
      var bd = BADGE_AT[layout], br = bd[2];
      items.forEach(function (i) {
        if (i.kind !== 'text' || !hitsCircle(textBox(i), bd[0], bd[1], br + 6)) { return; }
        var edge = bd[0] - br - 10;
        if (!i.align || i.align === 'left') { i.max = Math.max(60, Math.min(i.max, edge - i.x - (i.rotate ? 20 : 0))); }
        else if (i.align === 'center') { i.max = Math.max(60, Math.min(i.max, 2 * (edge - i.x))); }
      });
      items.push({ kind: 'badge', src: t.badge, x: bd[0] - br, y: bd[1] - br, w: 2 * br, h: 2 * br, drop: true });
    }
    var front = [], placed = null;
    if (o.sticker) {
      placed = placeSticker(items, spot.sticker);
      front.push({ kind: 'svg', svg: stickerArt(chosen.sticker, placed.x, placed.y, placed.k) });
      stickerWords(chosen.sticker, placed.x, placed.y, placed.k, o.feature, front);
    }
    return { w: W, h: H, scale: SCALE, theme: t, items: bg.concat(items, front),
             sticker: placed ? { x: placed.x, y: placed.y, r: STICKER_R * placed.k } : null };
  }

  return {
    W: W, H: H, SCALE: SCALE, GROUPS: GROUPS, THEMES: THEMES, LAYOUTS: LAYOUTS, PATTERNS: PATTERNS, STICKERS: STICKERS,
    STICKER_STYLES: STICKER_STYLES, stickerOf: stickerOf, stickerValue: stickerValue, textBox: textBox, hitsCircle: hitsCircle,
    FONTS: FONTS, FEATURES: FEATURES, HEADLINE_MAX: HEADLINE_MAX, ACCENT_MIN: ACCENT_MIN, MATARIKI: MATARIKI,
    theme: function (id) { return BY_ID[id] || null; }, find: find,
    easter: easter, showDay: showDay, occasion: occasion, season: season, suggestTheme: suggestTheme,
    suggest: suggest, resolve: resolve, toSave: toSave, contrast: contrast, onColour: onColour, accentReads: accentReads,
    wrap: wrap, build: build
  };
}));
