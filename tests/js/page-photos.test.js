// Tests for assets/js/page-photos.js, the header photo helpers. Run with
//
//     node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../assets/js/page-photos.js');

const H = 'https://photos.ncan.nz/';
const data = {
  pools: {
    sprints: [H + 'a.webp', H + 'b.webp'],
    jumps: [{ src: H + 'c.jpg', webp: H + 'c.webp', tags: ['jumps'] }],
    junior: { include: ['sprints', 'jumps'], photos: [H + 'd.webp', H + 'a.webp'] },
    club: { include: ['junior'], exclude: [H + 'b.webp'] },
    fair: { include: ['sprints', 'jumps'], pick: 'by-pool' },
    loop: { include: ['loop2'] },
    loop2: { include: ['loop'] }
  },
  pages: {
    '/junior-athletics/': { pool: 'junior' },
    '/junior-athletics/#/plan/*': { pool: 'jumps' },
    '/junior-athletics/#/plan/2026-11-*': { pool: 'sprints' },
    '/junior-athletics/#/plan/2026-11-24': { photos: [H + 'relay.webp'], focus: '50% 30%' },
    '/history/': { photo: 'none' }
  }
};

const srcs = (list) => list.map((p) => p.src.replace(H, ''));

test('pools merge included pools, each photo once, in order', () => {
  assert.deepEqual(srcs(P.poolPhotos(data, 'junior')), ['a.webp', 'b.webp', 'c.jpg', 'd.webp']);
});

test('exclude is applied after merging', () => {
  assert.deepEqual(srcs(P.poolPhotos(data, 'club')), ['a.webp', 'c.jpg', 'd.webp']);
});

test('a photo object keeps its webp and tags; a plain address is both', () => {
  const [c] = P.poolPhotos(data, 'jumps');
  assert.equal(c.webp, H + 'c.webp');
  assert.deepEqual(c.tags, ['jumps']);
  assert.equal(P.poolPhotos(data, 'sprints')[0].webp, H + 'a.webp');
});

test('a pool including itself, or a missing pool, is an error', () => {
  assert.throws(() => P.poolPhotos(data, 'loop'), /includes itself/);
  assert.throws(() => P.poolPhotos(data, 'nope'), /no pool/);
});

test('nesting deeper than four is an error', () => {
  const deep = { pools: { a: { include: ['b'] }, b: { include: ['c'] }, c: { include: ['d'] }, d: { include: ['e'] }, e: ['x'] } };
  assert.throws(() => P.poolPhotos(deep, 'a'), /nested/);
  assert.equal(P.poolPhotos(deep, 'b').length, 1);
});

test('by-pool keeps one group per pool; otherwise one group', () => {
  assert.equal(P.entryGroups(data, { pool: 'fair' }).length, 2);
  assert.equal(P.entryGroups(data, { pool: 'junior' }).length, 1);
  assert.deepEqual(P.entryGroups(data, { photo: 'none' }), []);
});

test('the exact #/ address wins, then the longest pattern, then the page', () => {
  const key = (hash) => (P.findEntry(data, '/junior-athletics/', hash) || {}).key;
  assert.equal(key('#/plan/2026-11-24'), '/junior-athletics/#/plan/2026-11-24');
  assert.equal(key('#/plan/2026-11-17'), '/junior-athletics/#/plan/2026-11-*');
  assert.equal(key('#/plan/2026-12-01'), '/junior-athletics/#/plan/*');
  assert.equal(key(''), '/junior-athletics/');
  assert.equal(key('#contact'), '/junior-athletics/');
});

test('the planner list link counts as the shared plan address', () => {
  assert.equal(P.normalHash('#plan-2026-11-24'), '#/plan/2026-11-24');
  assert.equal(P.findEntry(data, '/junior-athletics/', '#plan-2026-11-24').key,
    '/junior-athletics/#/plan/2026-11-24');
});

test('paths are matched as folders', () => {
  assert.equal(P.findEntry(data, '/junior-athletics', '').key, '/junior-athletics/');
  assert.equal(P.findEntry(data, '/junior-athletics/index.html', '').key, '/junior-athletics/');
  assert.equal(P.findEntry(data, '/calendar/', ''), null);
});

test('pick avoids the photo shown last time when there is another', () => {
  const groups = P.entryGroups(data, { pool: 'sprints' });
  for (let i = 0; i < 20; i++) {
    assert.equal(P.pick(groups, { last: H + 'a.webp', random: Math.random }).src, H + 'b.webp');
  }
  const one = P.entryGroups(data, { photos: [H + 'x.webp'] });
  assert.equal(P.pick(one, { last: H + 'x.webp' }).src, H + 'x.webp');
});

test('pick prefers tagged photos, and falls back when none match', () => {
  const groups = P.entryGroups(data, { pool: 'junior' });
  assert.equal(P.pick(groups, { tags: ['jumps'] }).src, H + 'c.jpg');
  assert.ok(P.pick(groups, { tags: ['hurdles'] }));
  assert.equal(P.pick([], {}), null);
});

test('by-pool picks the pool first', () => {
  const groups = P.entryGroups(data, { pool: 'fair' });
  // random 0.99 picks the last group (jumps, one photo)
  assert.equal(P.pick(groups, { random: () => 0.99 }).src, H + 'c.jpg');
  assert.equal(P.pick(groups, { random: () => 0 }).src, H + 'a.webp');
});

test('the API settings are laid over the file, entry by entry', () => {
  const file = {
    pools: { a: [H + 'a.webp'], b: [H + 'b.webp'] },
    pages: { '/gallery/x/': { photos: [H + 'g.webp'] }, '/': { pool: 'a' } }
  };
  const live = { pools: { b: [H + 'new.webp'] }, pages: { '/': { pool: 'b' } } };
  const out = P.overlay(file, live);
  assert.deepEqual(out.pools.a, [H + 'a.webp']);
  assert.deepEqual(out.pools.b, [H + 'new.webp']);
  assert.deepEqual(out.pages['/'], { pool: 'b' });
  assert.ok(out.pages['/gallery/x/']);
  // the file is left as it was
  assert.deepEqual(file.pages['/'], { pool: 'a' });
});

test('without the API, the file\'s copy of its settings is used', () => {
  const file = { pools: {}, pages: { '/': { photo: 'none' } },
    api: { version: 3, pools: {}, pages: { '/': { photos: [H + 'api.webp'] } } } };
  assert.deepEqual(P.settings(file, null).pages['/'], { photos: [H + 'api.webp'] });
  const live = { version: 4, pools: {}, pages: {} };
  // the API's own settings win over the copy, even when it has dropped an entry
  assert.deepEqual(P.settings(file, live).pages['/'], { photo: 'none' });
  assert.equal(P.settings({ pools: {}, pages: {} }, null).pages['/'], undefined);
});
