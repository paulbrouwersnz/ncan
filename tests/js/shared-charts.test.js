// Tests for assets/js/shared-charts.js: the wording of the shared charts lists.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../assets/js/shared-charts.js');

const share = (over) => Object.assign({
  id: 'abcdefgh12345678', event: '100m', from: '2024-10-05', to: '2026-11-21', view: 'by-season',
  title: 'Sam B. · 100m', at: '2026-11-23 19:05', by: 'jo@example.invalid', mine: false,
  views: 48, recent_views: 12, previews: 6, removed: null
}, over);

test('dates read as day month year, and months as month year', () => {
  assert.equal(S.day('2026-11-23 19:05'), '23 Nov 2026');
  assert.equal(S.day('2026-01-02'), '2 Jan 2026');
  assert.equal(S.month('2024-10-05'), 'Oct 2024');
  assert.equal(S.day(''), '');
});

test('what was shared: the event, the dates and the view', () => {
  assert.equal(S.what(share()), '100m · Oct 2024 to Nov 2026 · By season');
  assert.equal(S.what(share({ view: 'timeline' })), '100m · Oct 2024 to Nov 2026 · Timeline');
  assert.equal(S.what(share({ from: '2026-11-01', to: '2026-11-21' })), '100m · Nov 2026 · By season');
  assert.equal(S.what(share({ from: '2026-11-21', to: '2026-11-21' })), '100m · 21 Nov 2026 · By season');
  assert.equal(S.what(share({ from: '2026-11-21', to: '2026-11-21', view: 'pb-card' })), '100m · 21 Nov 2026 · PB card');
});

test('views count people once a day, with link previews apart', () => {
  assert.equal(S.views(share()), '48 views (12 in the last 7 days) · 6 link previews');
  assert.equal(S.views(share({ views: 1, recent_views: 0, previews: 1 })), '1 view · 1 link preview');
  assert.equal(S.views(share({ views: 0, recent_views: 0, previews: 0 })), 'No views yet');
});

test('families see who shared it only as "you" or someone else; admins see the email', () => {
  assert.equal(S.made(share({ mine: true })), 'Shared 23 Nov 2026 by you');
  assert.equal(S.made(share()), 'Shared 23 Nov 2026 by someone else who manages this page');
  assert.equal(S.made(share(), true), 'Shared 23 Nov 2026 by jo@example.invalid');
});

test('a share the club removed says only that to families, and why to admins', () => {
  const club = { at: '2026-11-24 08:00', by_club: true, by: 'admin@example.invalid', why: 'Wrong athlete' };
  assert.equal(S.removed(share({ removed: { at: club.at, by_club: true, by: null } })),
               'Removed by the club on 24 Nov 2026');
  assert.equal(S.removed(share({ removed: club }), true),
               'Removed by the club on 24 Nov 2026 (admin@example.invalid): Wrong athlete');
  assert.equal(S.removed(share({ mine: true, removed: { at: club.at, by_club: false, by: 'jo@example.invalid' } })),
               'Removed on 24 Nov 2026 by you');
  assert.equal(S.removed(share()), '');
});

test('the admin list shows live, removed or all, and finds by athlete, event or who shared it', () => {
  const list = [share({ id: 'a', athlete: 'Sam Brown' }),
                share({ id: 'b', athlete: 'Ava Lee', event: 'Long jump', removed: { at: '2026-11-24', by_club: true } }),
                share({ id: 'c', athlete: 'Ava Lee', by: 'kim@example.invalid' })];
  const ids = (x) => x.map((s) => s.id).join('');
  assert.equal(ids(S.pick(list, 'live', '')), 'ac');
  assert.equal(ids(S.pick(list, 'removed', '')), 'b');
  assert.equal(ids(S.pick(list, 'all', 'ava')), 'bc');
  assert.equal(ids(S.pick(list, 'all', 'LONG')), 'b');
  assert.equal(ids(S.pick(list, 'live', 'kim@')), 'c');
});
