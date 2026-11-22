// Tests for assets/js/athlete-seasons.js: seasons on the athlete charts, and the
// zoomed chart's date ranges. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../assets/js/athlete-seasons.js');

test('a season runs 1 April to 31 March', () => {
  assert.equal(S.seasonOf('2026-04-01'), '2026/27');
  assert.equal(S.seasonOf('2026-03-31'), '2025/26');
  assert.equal(S.seasonOf('2026-11-07'), '2026/27');
  assert.equal(S.seasonOf('2000-01-15'), '1999/00');
  assert.deepEqual(S.bounds('2025/26'), { from: '2025-04-01', to: '2026-03-31' });
});

test('a chart inside one season crosses one season and its halves, cut to the chart', () => {
  const s = S.spans('2026-10-12', '2027-02-20');
  assert.deepEqual(s.seasons, [{ season: '2026/27', from: '2026-10-12', to: '2027-02-20', whole: false }]);
  assert.deepEqual(s.halves, [{ kind: 'summer', season: '2026/27', from: '2026-10-12', to: '2027-02-20' }]);
  assert.deepEqual(S.boundaries('2026-10-12', '2027-02-20'), []);
});

test('a chart over two summers has a winter between them and one boundary', () => {
  const s = S.spans('2025-11-01', '2027-01-10');
  assert.deepEqual(s.seasons.map((x) => x.season), ['2025/26', '2026/27']);
  assert.deepEqual(s.halves.map((h) => h.kind + ' ' + h.from + ' ' + h.to), [
    'summer 2025-11-01 2026-03-31',
    'winter 2026-04-01 2026-09-30',
    'summer 2026-10-01 2027-01-10',
  ]);
  assert.deepEqual(S.boundaries('2025-11-01', '2027-01-10'), ['2026-04-01']);
});

test('a chart starting on 1 April has no boundary at its edge', () => {
  assert.deepEqual(S.boundaries('2026-04-01', '2026-12-01'), []);
  assert.equal(S.spans('2026-04-01', '2027-03-31').seasons[0].whole, true);
});

test('the current season is labelled "so far"; narrow screens get the short form', () => {
  assert.equal(S.label('2026/27', '2026-11-22'), '2026/27 (so far)');
  assert.equal(S.label('2025/26', '2026-11-22'), '2025/26');
  assert.equal(S.label('2026/27', '2026-11-22', true), '26/27');
});

test('season bests are per key and season, skipping results without a number', () => {
  const faster = (a, b) => a.value < b.value;
  const rs = [
    { event: '100m', date: '2025-12-01', season: '2025/26', value: 12.9 },
    { event: '100m', date: '2026-02-01', season: '2025/26', value: 12.6 },
    { event: '100m', date: '2026-11-01', season: '2026/27', value: 12.8 },
    { event: '100m', date: '2026-11-08', season: '2026/27', value: 'DNF' },
  ];
  const b = S.bests(rs, (r) => r.event, faster);
  assert.equal(b['100m|2025/26'], rs[1]);
  assert.equal(b['100m|2026/27'], rs[2]);
});

test('season bests for a throw are per weight', () => {
  const further = (a, b) => a.value > b.value;
  const rs = [
    { event: 'Shot Put', implement: '3kg', season: '2026/27', value: 9.1 },
    { event: 'Shot Put', implement: '4kg', season: '2026/27', value: 8.2 },
  ];
  const b = S.bests(rs, (r) => r.event + ' ' + r.implement, further);
  assert.equal(b['Shot Put 3kg|2026/27'], rs[0]);
  assert.equal(b['Shot Put 4kg|2026/27'], rs[1]);
});

test('zoom ranges: this season, last season, last 12 months, all', () => {
  assert.deepEqual(S.range('this', '2026-11-22'), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(S.range('last', '2026-11-22'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(S.range('this', '2026-02-10'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(S.range('year', '2026-11-22'), { from: '2025-11-23', to: '2026-11-22' });
  assert.deepEqual(S.range('year', '2028-02-29'), { from: '2027-03-01', to: '2028-02-29' });
  assert.deepEqual(S.range('all', '2026-11-22'), { from: '', to: '' });
});

test('picked dates may be half empty or the wrong way round', () => {
  assert.deepEqual(S.range('pick', '2026-11-22', { from: '2026-01-01', to: '' }), { from: '2026-01-01', to: '' });
  assert.deepEqual(S.range('pick', '2026-11-22', { from: '2026-05-01', to: '2026-01-01' }), { from: '2026-01-01', to: '2026-05-01' });
  const r = S.range('pick', '2026-11-22', { from: '2030-01-01', to: '2030-02-01' });
  assert.equal(['2026-11-01'].filter((d) => S.inRange(d, r)).length, 0);   // picked dates with no results
  assert.equal(S.inRange('2026-11-01', S.range('all', '2026-11-22')), true);
});

test('an event in the address, and stepping between results', () => {
  assert.equal(S.slug('100m Hurdles'), '100m-hurdles');
  assert.equal(S.slug('Shot Put 3kg'), 'shot-put-3kg');
  assert.equal(S.slug('4 x 100m Relay '), '4-x-100m-relay');
  assert.equal(S.step(5, -1, 1), 0);
  assert.equal(S.step(5, -1, -1), 4);
  assert.equal(S.step(5, 4, 1), 4);
  assert.equal(S.step(5, 2, -1), 1);
  assert.equal(S.step(0, -1, 1), -1);
});

test('the day after crosses months and leap days', () => {
  assert.equal(S.nextDay('2028-02-28'), '2028-02-29');
  assert.equal(S.nextDay('2027-02-28'), '2027-03-01');
  assert.equal(S.nextDay('2026-12-31'), '2027-01-01');
});
