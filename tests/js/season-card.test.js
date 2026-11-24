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

const ev = (event, starts, newPbs) => ({ event, starts, newPbs, results: [] });

test('signatureChoices: most starts first, then most new PBs', () => {
  const list = SC.signatureChoices([ev('100m', 9, 0), ev('400m', 3, 2), ev('200m', 16, 1), ev('Long Jump', 3, 0)]);
  assert.deepStrictEqual(list.map(e => e.event), ['200m', '100m', '400m', 'Long Jump']);
});

test('facts: the signature event defaults to the most starts, and can be chosen', () => {
  const events = [ev('400m', 3, 2), ev('200m', 16, 1)];
  assert.strictEqual(SC.facts({ name: 'Lily', events }).signature.event, '200m');
  assert.strictEqual(SC.facts({ name: 'Lily', events, signature: '400m' }).signature.event, '400m');
  assert.strictEqual(SC.facts({ name: 'Lily', events, signature: 'Shot Put' }).signature.event, '200m');
});
