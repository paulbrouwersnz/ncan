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

test('ready: the winter part opens in October, track and field in April', () => {
  const at = day => { const r = SC.ready('2025/26', day); return [r.oos, r.track]; };
  assert.deepStrictEqual(at('2025-09-30'), [false, false]);
  assert.deepStrictEqual(at('2025-10-01'), [true, false]);
  assert.deepStrictEqual(at('2026-03-31'), [true, false]);
  assert.deepStrictEqual(at('2026-04-01'), [true, true]);
  assert.strictEqual(SC.ready('2025/26', '2025-12-01').trackFrom, '2026-04-01');
});

test('canMake: only once a part with results has finished', () => {
  assert.strictEqual(SC.canMake('2025/26', '2025-08-01', true, true), false);
  assert.strictEqual(SC.canMake('2025/26', '2025-12-01', true, true), true);
  assert.strictEqual(SC.canMake('2025/26', '2025-12-01', true, false), false);
  assert.strictEqual(SC.canMake('2025/26', '2026-04-01', true, false), true);
  assert.strictEqual(SC.canMake('2024/25', '2025-12-01', false, true), true);
});

test('the looks: the removed ones are gone, and each one left works and keeps the size', () => {
  assert.deepStrictEqual(SC.FILTERS.map(f => f.id), ['natural', 'chrome', 'gold', 'sketch', 'vintage', 'noir', 'thermal', 'duotone', 'film', 'glow', 'bold']);
  SC.FILTERS.forEach((f) => {
    assert.strictEqual(typeof SC.LOOKS[f.id], 'function', f.id);
    const out = SC.look({ width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4).fill(128) }, f.id);
    assert.strictEqual(out.width, 8, f.id);
    assert.strictEqual(out.data.length, 8 * 6 * 4, f.id);
  });
});

test('the fourth number: new PBs with track and field, else podiums', () => {
  const ev = (newPbs, podiums) => ({ event: '100m', starts: 3, newPbs, wins: 0, podiums, sb: null, pb: null, pbBefore: null, points: [] });
  const race = (place, team) => ({ date: '2025-06-01', kind: team ? 'Relay' : 'Cross country', race: 'x', place, of: 9, team: !!team });
  const tile = a => { const t = SC.facts(Object.assign({ name: 'Lily Test', season: '2025/26' }, a)).tile; return [t.kind, t.value, t.label]; };
  assert.deepStrictEqual(tile({ events: [ev(2, 1)] }), ['pbs', 2, 'NEW PBS']);
  assert.deepStrictEqual(tile({ events: [ev(1, 0)] }), ['pbs', 1, 'NEW PB']);
  assert.deepStrictEqual(tile({ events: [ev(0, 2)] }), ['podiums', 2, 'PODIUMS']);              // no PBs, but podiums
  assert.deepStrictEqual(tile({ events: [ev(0, 0)] }), ['pbs', 0, 'NEW PBS']);                  // neither
  // cross country, road and relays alone: podiums, relay teams' included
  assert.deepStrictEqual(tile({ events: [], races: [race(2), race(3, true), race(5)] }), ['podiums', 2, 'PODIUMS']);
  assert.deepStrictEqual(tile({ events: [], races: [race(1, true)] }), ['podiums', 1, 'PODIUM']);
  assert.deepStrictEqual(tile({ events: [], races: [race(6)] }), ['podiums', 0, 'PODIUMS']);
  // both parts, no PBs: every podium counts
  assert.deepStrictEqual(tile({ events: [ev(0, 1)], races: [race(2, true)] }), ['podiums', 2, 'PODIUMS']);
});
