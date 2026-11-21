// Tests for tools/head-photo-pick.js, the header photo picker that
// tools/make-head-photo.py writes into pages. Run with
//
//     node --test "tests/js/*.test.js"
//
// The picker is run as make-head-photo.py writes it: squeezed onto one line.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'head-photo-pick.js'), 'utf8');
// as picker_code() in make-head-photo.py
const code = file.slice(file.indexOf('\nfunction') + 1).split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('');

const H = 'https://photos.ncan.nz/';
const choices = {
  p: [[H + 'a.jpg', H + 'a.webp'], [H + 'b.webp'], [H + 'c.webp', H + 'c.webp', '10% 20%'], [H + "it's.webp"]],
  e: {
    '/junior-athletics/': { g: [[0, 1]] },
    '/junior-athletics/#/plan/*': { g: [[2]] },
    '/junior-athletics/#/plan/2026-11-24': { g: [[3]], f: '50% 30%' },
    '/junior-athletics/#/plan/2026-12-01': { g: [] }
  }
};

function fakeHead() {
  const props = { '--photo': "url('" + H + "a.jpg')" };
  const classes = new Set(['page-head', 'page-head--photo']);
  return {
    props,
    classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    style: {
      setProperty: (k, v) => { props[k] = v; },
      removeProperty: (k) => { delete props[k]; }
    }
  };
}

function run(where, opts = {}) {
  const head = fakeHead();
  const store = opts.store || {};
  const ctx = {
    location: { pathname: where.split('#')[0], hash: where.includes('#') ? '#' + where.split('#')[1] : '' },
    localStorage: opts.noStorage ? null : {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }
    },
    Math: Object.create(Math, { random: { value: opts.random || (() => 0) } }),
    head
  };
  vm.runInNewContext('(' + code + ')({ parentNode: head }, ' + JSON.stringify(choices) + ')', ctx);
  return { head, store };
}

test('squeezed onto one line it still parses', () => {
  assert.ok(!code.includes('\n'));
  assert.doesNotThrow(() => new vm.Script('(' + code + ')'));
});

test('the page picks from its pool and remembers the photo', () => {
  const { head, store } = run('/junior-athletics/', { random: () => 0.99 });
  assert.equal(head.props['--photo'], "url('" + H + "b.webp')");
  assert.equal(head.props['--photo-webp'], "url('" + H + "b.webp')");
  assert.equal(store['ncan-page-photo:/junior-athletics/'], H + 'b.webp');
});

test('a JPEG and a WebP are both set', () => {
  const { head } = run('/junior-athletics/index.html');
  assert.equal(head.props['--photo'], "url('" + H + "a.jpg')");
  assert.equal(head.props['--photo-webp'], "url('" + H + "a.webp')");
});

test('the photo shown last time is not picked again', () => {
  const store = { 'ncan-page-photo:/junior-athletics/': H + 'a.jpg' };
  const { head } = run('/junior-athletics/', { store });
  assert.equal(head.props['--photo'], "url('" + H + "b.webp')");
});

test('no storage: still picks', () => {
  const { head } = run('/junior-athletics/', { noStorage: true });
  assert.equal(head.props['--photo'], "url('" + H + "a.jpg')");
});

test('an exact #/... entry wins, with its focus; the list link counts', () => {
  for (const where of ['/junior-athletics/#/plan/2026-11-24', '/junior-athletics/#plan-2026-11-24']) {
    const { head } = run(where);
    assert.equal(head.props['--photo'], "url('" + H + "it%27s.webp')");
    assert.equal(head.props['--photo-focus'], '50% 30%');
  }
});

test('a pattern matches other plans, with the photo\'s own focus', () => {
  const { head } = run('/junior-athletics/#/plan/2026-10-13');
  assert.equal(head.props['--photo'], "url('" + H + "c.webp')");
  assert.equal(head.props['--photo-focus'], '10% 20%');
});

test('"photo": "none" gives the plain band', () => {
  const { head } = run('/junior-athletics/#/plan/2026-12-01');
  assert.ok(!head.classes.has('page-head--photo'));
  assert.equal(head.props['--photo'], undefined);
});

test('an in-page anchor is the page itself', () => {
  const { head } = run('/junior-athletics/#contact', { random: () => 0.99 });
  assert.equal(head.props['--photo'], "url('" + H + "b.webp')");
});

test('no entry for the address: left as written', () => {
  const { head } = run('/history/');
  assert.equal(head.props['--photo'], "url('" + H + "a.jpg')");
  assert.ok(head.classes.has('page-head--photo'));
});
