// Tests for assets/js/wind-adjust.js: wind-adjusted estimates for sprints,
// hurdles and horizontal jumps. Made-up marks only. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../assets/js/wind-adjust.js');

const value = (e, m, w) => { const r = W.estimate(e, m, w); return r && r.value; };

test('sprints follow the air-resistance model for the race distance', () => {
  assert.equal(value('100m', 11.00, 2.0), 11.12);
  assert.equal(value('100m', 15.00, 2.0), 15.21);
  assert.equal(value('100m', 15.00, -2.0), 14.72);
  assert.equal(value('100m', 18.00, 4.0), 18.45);
  assert.equal(value('60m', 9.50, 2.0), 9.64);
  assert.equal(value('80m', 12.00, 0), 12.00);
});

test('a 200m is corrected on the home straight only', () => {
  assert.equal(value('200m', 23.00, 2.0), 23.13);
  assert.equal(value('200m', 30.00, 2.0), 30.21);
});

test('hurdles, long jump and triple jump use Moinat (2018)', () => {
  assert.equal(value('100m Hurdles', 14.00, 2.0), 14.15);
  assert.equal(value('80m Hurdles', 14.00, -1.0), 13.90);
  assert.equal(value('Long Jump', 6.00, 2.0), 5.94);
  assert.equal(value('Long Jump', 3.50, -2.0), 3.56);
  assert.equal(value('Triple Jump', 9.00, 2.0), 8.90);
});

test('each event has its own wind limit, inclusive', () => {
  assert.ok(W.estimate('100m', 15, 4.0));
  assert.ok(W.estimate('100m', 15, -4.0));
  assert.equal(W.estimate('100m', 15, 4.1), null);
  assert.equal(W.estimate('200m', 30, -6.1), null);
  assert.ok(W.estimate('100m Hurdles', 14, 2.0));
  assert.equal(W.estimate('100m Hurdles', 14, 2.1), null);
  assert.equal(W.estimate('Triple Jump', 9, -2.1), null);
  assert.ok(W.estimate('Long Jump', 3.5, 4.0));
  assert.equal(W.estimate('Long Jump', 3.5, 4.1), null);
});

test('each event says its limits, for the chart note', () => {
  assert.deepEqual(W.limits('60m'), { limit: 4, rough: 4 });
  assert.deepEqual(W.limits('200m'), { limit: 4, rough: 4 });
  assert.deepEqual(W.limits('80m Hurdles'), { limit: 2, rough: 2 });
  assert.deepEqual(W.limits('Triple Jump'), { limit: 2, rough: 2 });
  assert.deepEqual(W.limits('Long Jump'), { limit: 4, rough: 2 });
  assert.equal(W.limits('400m'), null);
});

test('long jump over 2 m/s is marked rough; other estimates are not', () => {
  assert.deepEqual(W.estimate('Long Jump', 3.50, 4.0), { value: 3.38, rough: true });
  assert.equal(W.estimate('Long Jump', 3.50, 2.0).rough, false);
  assert.equal(W.estimate('100m', 15, 3.9).rough, false);
});

test('a reading is taken to the tenth, as gauges give it', () => {
  assert.ok(W.estimate('100m Hurdles', 14, 2.04));
  assert.equal(W.estimate('100m Hurdles', 14, 2.06), null);
});

test('no estimate for other events, no mark or no reading', () => {
  ['145m', '400m', '200m Hurdles', 'High Jump', 'Discus', ''].forEach((e) => {
    assert.equal(W.estimate(e, 20, 1.0), null, e);
    assert.equal(W.applies(e), false, e);
  });
  ['60m', '100m', '200m', '80m Hurdles', 'Long Jump', 'Triple Jump'].forEach((e) => assert.equal(W.applies(e), true, e));
  assert.equal(W.estimate('100m', null, 1.0), null);
  assert.equal(W.estimate('100m', 15, null), null);
  assert.equal(W.estimate('100m', 0, 1.0), null);
});
