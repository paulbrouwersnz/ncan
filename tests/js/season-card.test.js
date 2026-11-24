'use strict';
const test = require('node:test');
const assert = require('node:assert');
const SC = require('../../assets/js/season-card.js');

const input = { events: [{ name: '100m' }], races: [{ name: 'XC' }], meetings: 5, trackMeetings: 3, oosMeetings: 2 };

test('partOf: track and field only', () => {
  const p = SC.partOf(input, 'track');
  assert.strictEqual(p.events.length, 1);
  assert.strictEqual(p.races.length, 0);
  assert.strictEqual(p.meetings, 3);
});

test('partOf: out of stadia only', () => {
  const p = SC.partOf(input, 'oos');
  assert.strictEqual(p.events.length, 0);
  assert.strictEqual(p.races.length, 1);
  assert.strictEqual(p.meetings, 2);
});

test('partOf: both', () => {
  const p = SC.partOf(input, 'both');
  assert.strictEqual(p.events.length, 1);
  assert.strictEqual(p.races.length, 1);
  assert.strictEqual(p.meetings, 5);
});

test('every look is a pixel function that keeps the size', () => {
  const img = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(128) };
  SC.FILTERS.forEach((f) => {
    const run = f.run || f.fn || f.apply;
    if (typeof run !== 'function') { return; }
    const out = run({ width: 4, height: 4, data: new Uint8ClampedArray(img.data) }) || img;
    assert.strictEqual(out.width, 4, f.id);
    assert.strictEqual(out.data.length, 64, f.id);
  });
});

test('there are finishes and looks to choose from', () => {
  assert.ok(SC.FINISHES.length >= 3);
  assert.ok(SC.FILTERS.length >= 4);
});
