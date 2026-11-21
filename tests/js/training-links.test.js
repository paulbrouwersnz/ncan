// Tests for assets/js/training-links.js: what a shared training-plan link does when
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

// a stand-in for training.js's longDate
const longDate = (d) => ({ '2026-11-24': 'Tuesday 24 November 2026', '2026-11-10': 'Tuesday 10 November 2026' })[d];

test('a link with no plan goes to the list of all the plans', () => {
  assert.equal(L.notFoundUrl('2026-11-24'), '/junior-athletics/?no-plan=2026-11-24');
  assert.equal(L.notFoundUrl('2026-02-30'), '/junior-athletics/?no-plan=link');   // not a real date
  assert.equal(L.notFoundUrl(''), '/junior-athletics/?no-plan=link');
});

test('the list knows which date was asked for', () => {
  assert.equal(L.noPlanAsked('?no-plan=2026-11-24'), '2026-11-24');
  assert.equal(L.noPlanAsked('?x=1&no-plan=2026-11-24'), '2026-11-24');
  assert.equal(L.noPlanAsked('?no-plan=link'), 'link');
  assert.equal(L.noPlanAsked('?no-plan=<script>'), 'link');   // anything else is never shown
  assert.equal(L.noPlanAsked(''), null);
  assert.equal(L.noPlanAsked('?other=1'), null);
});

test('the list says nothing matched', () => {
  assert.equal(L.noPlanText('2026-11-24', TODAY, longDate),
    'No training plan was found for Tuesday 24 November 2026. It may not have been released yet. All the training plans are listed below.');
  assert.equal(L.noPlanText('2026-11-10', TODAY, longDate),
    'No training plan was found for Tuesday 10 November 2026. All the training plans are listed below.');
  assert.equal(L.noPlanText('link', TODAY, longDate),
    'No training plan was found for that link. All the training plans are listed below.');
});
