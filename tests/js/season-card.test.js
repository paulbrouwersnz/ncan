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

const race = (kind, place, date, team) => ({ kind: team ? 'Relay' : kind, race: kind + ' 3 km', place, of: 20, date, team: !!team });

test('signatureChoices: race kinds count all their races, most races first, then podiums', () => {
  const races = [race('Cross country', 5, '2025-06-01'), race('Cross country', 2, '2025-05-01'),
    race('Road', 1, '2025-07-01'), race('Road', 2, '2025-08-01'), race('Cross country', 1, '2025-06-08', true)];
  const list = SC.signatureChoices([], races);
  assert.deepStrictEqual(list.map(e => e.event), ['Road', 'Cross country', 'Relays']);
  const xc = list[1];
  assert.ok(xc.race);
  assert.deepStrictEqual(xc.points.map(p => p.value), [2, 5]);
  assert.deepStrictEqual(xc.points.map(p => p.medal), [2, 0]);
});

test('facts: a cross country runner gets a race kind as signature', () => {
  const races = [race('Cross country', 4, '2025-05-01'), race('Cross country', 3, '2025-06-01'), race('Road', 1, '2025-07-01')];
  const f = SC.facts({ name: 'Dale', races });
  assert.strictEqual(f.signature.event, 'Cross country');
  assert.strictEqual(f.position, 'Cross country');
  assert.strictEqual(SC.facts({ name: 'Dale', races, signature: 'Road' }).signature.event, 'Road');
  // with track events too, the most starts still wins
  assert.strictEqual(SC.facts({ name: 'Dale', races, events: [ev('1500m', 5, 0)] }).signature.event, '1500m');
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
  assert.deepStrictEqual(SC.FILTERS.map(f => f.id), ['natural', 'chrome', 'gold', 'sketch', 'vintage', 'noir', 'thermal', 'duotone', 'film', 'glow', 'bold', 'infrared']);
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

// Did you know?: a fact that suits the athlete, the same until another is asked for
const pts = vals => vals.map((v, i) => ({ value: v, date: '2026-0' + (1 + i % 3) + '-1' + (i % 10), pb: false }));
const sprinter = { name: 'Lily Test', season: '2025/26', events: [
  { event: '200m', field: false, starts: 6, sb: { mark: '26.10', value: 26.1 }, newPbs: 1, points: pts([27.4, 27.0, 26.6, 26.1, 26.3, 26.2]) },
  { event: '100m', field: false, starts: 4, sb: { mark: '12.47', value: 12.47 }, newPbs: 2, points: pts([12.9, 12.7, 12.47, 12.6]) }], races: [] };
const thrower = { name: 'Sam Shot', season: '2025/26', events: [
  { event: 'Shot Put', field: true, starts: 5, sb: { mark: '11.20m', value: 11.2 }, newPbs: 3, points: pts([9.8, 10.4, 11.2, 10.9, 11.0]) }], races: [] };
const roadie = { name: 'Dale W', season: '2026/27', events: [], races: [
  { date: '2026-09-12', race: 'Road 10 km', kind: 'Road', place: 10, of: 10 },
  { date: '2026-06-01', race: 'Cross country 8 km', kind: 'Cross country', place: 1, of: 12 },
  { date: '2026-05-01', race: 'Road 8 km', kind: 'Road', place: 5, of: 30 }] };
const allFacts = a => { const s = new Set(); for (let t = 0; t < 60; t++) { s.add(SC.facts(Object.assign({ factTurn: t }, a)).fact.words); } return [...s]; };

test('funFact: the same card keeps the same fact', () => {
  assert.strictEqual(SC.facts(sprinter).fact.words, SC.facts(sprinter).fact.words);
});

test('funFact: sprinters get sprint and signature event facts, not distance', () => {
  const all = allFacts(sprinter);
  assert.ok(all.length >= 3);
  assert.ok(all.some(w => /km\/h over the 200m/.test(w)));
  assert.ok(all.some(w => /200m \(26\.10\) would have finished about 10 m ahead of the first one \(27\.40\)/.test(w)));
  assert.ok(all.every(w => !/marathon|rugby/.test(w)));
  assert.strictEqual(SC.facts(sprinter).fact.icon, 'run');
});

test('funFact: throwers get throwing facts', () => {
  const all = allFacts(thrower);
  assert.ok(all.some(w => /further than a giraffe is tall/.test(w)));
  assert.ok(all.some(w => /Set a new Shot Put PB 3 times/.test(w)));
  assert.ok(all.every(w => !/km\/h|laps/.test(w)));
  assert.strictEqual(SC.facts(thrower).fact.icon, 'throw');
});

test('funFact: cross country and road runners get race facts', () => {
  const all = allFacts(roadie);
  assert.ok(all.includes('Finished ahead of 36 runners across 3 races.'));
  assert.ok(all.includes('Won the Cross country 8 km, ahead of 11 other runners.'));
  assert.ok(all.includes('Raced 26 km in competition this season: that’s 65 laps of a track.'));
});

test('funFact: every fact fits the box, and no results is a first edition', () => {
  [sprinter, thrower, roadie].forEach(a => allFacts(a).forEach(w => assert.ok(w.length <= 170, w)));
  const none = SC.facts({ name: 'New Kid', season: '2025/26', events: [], races: [] }).fact;
  assert.strictEqual(none.icon, 'star');
  assert.strictEqual(none.choices, 1);
});

test('highlights count relay team podiums, as the podiums number does', () => {
  const r = (place, team) => ({ kind: team ? 'Relay' : 'Road', race: 'Road 5 km', place, of: 9, date: '2025-08-01', team: !!team });
  const f = SC.facts({ name: 'Dale', events: [], races: [r(2), r(3, true), r(2, true), r(6)] });
  assert.strictEqual(f.tile.value, 3);
  assert.ok(f.highlights.some(h => h === '1 top-three finish, and 2 more with relay teams.'), f.highlights.join(' | '));
});

test('funFact: cross country, road and relay runners get time, pace, field and relay facts', () => {
  const r = (kind, race, mark, place, of, team) => ({ kind: team ? 'Relay' : kind, race, mark, place, of, date: '2025-06-01', team: !!team });
  const races = [r('Cross country', 'Cross country 4 km', '16:20', 10, 11), r('Cross country', 'Cross country 8 km', '36:12.74', 55, 60),
    r('Cross country', 'Cross country 6.9 km', '30:57.0', 6, 7), r('Road', 'Road 5 km', '20:00', 2, 3),
    r('Cross country', 'Trail relay, leg 4 (5 km)', '21:37', 2, 10, true), r('Road', 'Road relay, leg 2 (5.2 km)', '21:38.51', 3, 4, true)];
  const seen = new Set();
  for (let i = 0; i < 300; i++) { seen.add(SC.facts({ name: 'Dale', season: '2025/26', events: [], races, factTurn: i }).fact.words); }
  const all = [...seen].join('\n');
  assert.match(all, /racing off the track this season/);
  assert.match(all, /Fastest pace of the season: 4:00 per km, in the Road 5 km\. At that pace, a 10 km takes 40 min\./);
  assert.match(all, /The biggest field: 60 at the Cross country 8 km/);
  assert.match(all, /Carried the baton 10\.2 km for the team this season, over 2 legs\./);
  assert.match(all, /Longest race of the season: the Cross country 8 km, done in 36:12\.74\./);
  for (const w of seen) { assert.ok(w.length <= 170, w); }
});

test('markParts splits a mark at its decimal point', function () {
  var SC = require('../../assets/js/season-card.js');
  assert.deepStrictEqual(SC.markParts('21:31.6'), ['21:31', '.6']);
  assert.deepStrictEqual(SC.markParts('17:27'), ['17:27', '']);
  assert.deepStrictEqual(SC.markParts('5.42m'), ['5', '.42m']);
  assert.deepStrictEqual(SC.markParts('1:02.45'), ['1:02', '.45']);
  assert.deepStrictEqual(SC.markParts(''), ['–', '']);
});
