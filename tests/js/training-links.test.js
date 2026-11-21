// Tests for assets/js/training-links.js: what a shared training-plan link shows when
// there's no plan on its date. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../assets/js/training-links.js');

const TODAY = '2026-11-21';

test('a link for next week is not sent back to a session already gone', () => {
  // the real case: a plan made for 24 November was moved to 13 October
  assert.equal(L.followMove('2026-11-24', '2026-10-13', TODAY), false);
  assert.equal(L.followMove(TODAY, '2026-11-17', TODAY), false);
});

test('other moves are followed', () => {
  assert.equal(L.followMove('2026-11-24', '2026-12-01', TODAY), true);   // moved later
  assert.equal(L.followMove('2026-11-24', TODAY, TODAY), true);          // moved to today
  assert.equal(L.followMove('2026-11-10', '2026-11-03', TODAY), true);   // an old link, moved
  assert.equal(L.followMove('2026-11-10', '2026-12-01', TODAY), true);
});

test('no move, nothing to follow', () => {
  assert.equal(L.followMove('2026-11-24', undefined, TODAY), false);
  assert.equal(L.followMove('2026-11-24', '', TODAY), false);
});

const PAST = [   // as the API lists them: newest first, but not relied on
  { date: '2026-10-13', status: 'released' },
  { date: '2026-11-17', status: 'released' },
  { date: '2026-11-10', status: 'cancelled' },
  { date: '2026-11-03', status: 'released' },
];

test('the latest plan is the most recent before today, not the last changed', () => {
  assert.equal(L.latestPast(PAST, TODAY).date, '2026-11-17');
});

test('a released plan wins over a more recent cancelled session', () => {
  const plans = [{ date: '2026-11-17', status: 'cancelled' }, { date: '2026-11-10', status: 'released' }];
  assert.equal(L.latestPast(plans, TODAY).date, '2026-11-10');
});

test('only cancelled sessions: the most recent of those', () => {
  const plans = [{ date: '2026-11-03', status: 'cancelled' }, { date: '2026-11-17', status: 'cancelled' }];
  assert.equal(L.latestPast(plans, TODAY).date, '2026-11-17');
});

test('today and later, drafts and nothing at all are left out', () => {
  assert.equal(L.latestPast([{ date: TODAY, status: 'released' }], TODAY), null);
  assert.equal(L.latestPast([{ date: '2026-11-17', status: 'draft' }], TODAY), null);
  assert.equal(L.latestPast([], TODAY), null);
  assert.equal(L.latestPast(undefined, TODAY), null);
});
