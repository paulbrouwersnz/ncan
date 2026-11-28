// Tests for assets/js/course-strip.js: the strip under a meeting recap's heading
// (a track, a cross country course, a road or a trail, in the venue's colour).
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../assets/js/course-strip.js');
const R = require('../../assets/js/recap-data.js');

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('each kind draws an SVG of the size asked for, in its colour', () => {
  for (const kind of C.KINDS) {
    for (const [w, h] of [[1200, 64], [380, 40], [600, 40]]) {
      const s = C.svg(kind, '#123456', w, h);
      assert.match(s, new RegExp('^<svg [^>]*viewBox="0 0 ' + w + ' ' + h + '"'), kind);
      assert.ok(s.includes('#123456'), kind + ' uses the colour');
      assert.ok(!/NaN|undefined|Infinity/.test(s), kind + ' has only numbers');
      assert.ok(s.endsWith('</svg>'));
    }
  }
  // drawn larger for a card, the same shapes
  assert.match(C.svg('road', '#3A3D40', 600, 40, { scale: 2 }), /width="1200" height="80" viewBox="0 0 600 40"/);
  // an unknown kind is a track; a colour that isn't one is the track's blue
  assert.equal(C.svg('hill', '#123456', 300, 40), C.svg('track', '#123456', 300, 40));
  assert.ok(C.svg('track', 'red', 300, 40).includes('#0072B5'));
});

test('cross country: the markers sit exactly on the course edges, all before the finish', () => {
  for (const [w, h] of [[1200, 64], [380, 40], [600, 40]]) {
    const c = C.xcCourse(w, h);
    assert.ok(c.markers.length >= 6, 'markers along the course at ' + w);
    c.markers.forEach((m) => {
      // on an edge: the course's half-width from the centre line, square to it
      const near = c.centre.reduce((best, p) => (dist(p, m) < dist(best, m) ? p : best));
      assert.ok(Math.abs(dist(near, m) - c.half) < 0.6, 'on the edge: ' + dist(near, m) + ' vs ' + c.half);
      assert.ok(c.upper.includes(m) || c.lower.includes(m), 'one of the edge points');
      assert.ok(m[0] < c.finish, 'before the finish');
    });
    // in pairs, one on each side
    assert.equal(c.markers.length % 2, 0);
    // the course stays on the strip
    c.centre.filter((p) => p[0] >= 0 && p[0] <= w).forEach((p) => assert.ok(p[1] - c.half > 0 && p[1] + c.half < h));
  }
  // drawn: every marker in the picture is a pink circle at one of those points
  const s = C.svg('cross-country', '#62A84C', 600, 40), c = C.xcCourse(600, 40);
  assert.equal((s.match(new RegExp('fill="' + C.MARKER + '"', 'g')) || []).length, c.markers.length);
});

test('trail: sharp turns up and down, level into the finish', () => {
  const t = C.trailPath(1200, 64);
  const turns = t.points.slice(1, -2);
  turns.forEach((p, i) => {
    if (i) { assert.ok(Math.abs(p[1] - turns[i - 1][1]) >= 64 * 0.25 - 1e-9, 'a climb or drop each leg'); }
  });
  const last = t.points.slice(-2);
  assert.equal(last[0][1], last[1][1]);
  assert.ok(last[1][0] > 1200 && last[0][0] < t.finish);
  // the same each time
  assert.deepEqual(C.trailPath(1200, 64), t);
});

test('the recap draws the meeting kind, in the venue colour or the kind default', () => {
  assert.equal(R.courseKind({ type: 'Interclub' }), 'track');
  assert.equal(R.courseKind({ type: 'Cross country' }), 'cross-country');
  assert.equal(R.courseKind({ type: 'Road' }), 'road');
  assert.equal(R.courseKind({ type: 'Trail' }), 'trail');
  assert.equal(R.courseKind({ type: 'Interclub', track: { hex: '#111111', kind: 'road' } }), 'road');   // the API's word wins
  assert.equal(R.laneColour({ type: 'Trail' }), '#C9A46A');
  assert.equal(R.laneColour({ type: 'Cross country', track: { hex: '#ab0000', kind: 'cross-country' } }), '#AB0000');
  assert.equal(R.laneColour({}), '#0072B5');
  const f = R.cardFacts({ recap: { title: 'XC' }, meeting: { type: 'Cross country' }, counts: {} });
  assert.deepEqual([f.course, f.lane], ['cross-country', '#62A84C']);
  assert.equal(R.cardLayout(f).items.find((i) => i.kind === 'strip').course, 'cross-country');
});
