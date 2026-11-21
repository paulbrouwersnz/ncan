// Tests for assets/js/meeting-links.js: a meeting's extra links, for people to follow
// only. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../assets/js/meeting-links.js');

test('a meeting number from its address or a result in it', () => {
  assert.equal(L.meetNumber('https://canterbury.anet.live/meets/54617'), 54617);
  assert.equal(L.meetNumber('https://canterbury.anet.live/meets/54617/events/individual/3'), 54617);
  assert.equal(L.meetNumber('https://example.org/results.pdf'), null);
  assert.equal(L.meetNumber(''), null);
});

test('an athlete page finds the links for each meeting it lists', () => {
  const links = { 54617: [{ url: 'https://x.example/a.pdf', label: 'Organiser PDF' }] };
  assert.deepEqual(L.forMeeting(links, 'https://canterbury.anet.live/meets/54617'), links[54617]);
  assert.deepEqual(L.forMeeting(links, 'https://canterbury.anet.live/meets/1'), []);
  assert.deepEqual(L.forMeeting(links, 'https://example.org/hand.pdf'), []);
  assert.deepEqual(L.forMeeting(undefined, 'https://canterbury.anet.live/meets/54617'), []);
});

test('rows are tidied: empty rows dropped, spaces in labels tidied', () => {
  const out = L.tidy([{ url: ' https://x.example/a.pdf ', label: '  Photo   finish ' }, { url: '', label: ' ' }]);
  assert.deepEqual(out, { links: [{ url: 'https://x.example/a.pdf', label: 'Photo finish' }], error: '' });
});

test('bad rows are refused, saying which', () => {
  assert.match(L.tidy([{ url: 'http://x.example' }]).error, /Link 1.*https:\/\//);
  assert.match(L.tidy([{ url: 'javascript:alert(1)' }]).error, /https:\/\//);
  assert.match(L.tidy([{ url: '', label: 'No address' }]).error, /Link 1/);
  assert.match(L.tidy([{ url: 'https://x.example', label: 'x'.repeat(61) }]).error, /60/);
  assert.match(L.tidy([{ url: 'https://x.example/' }, { url: 'https://X.example' }]).error, /Link 2 is the same/);
  const six = Array.from({ length: 6 }, (_, i) => ({ url: 'https://x.example/' + i }));
  assert.match(L.tidy(six).error, /up to 5/);
});

test('unchanged rows are spotted, so Save stays off', () => {
  const saved = [{ url: 'https://x.example/a.pdf', label: 'A' }];
  assert.equal(L.same(saved, [{ url: 'https://x.example/a.pdf', label: 'A' }]), true);
  assert.equal(L.same(saved, [{ url: 'https://x.example/a.pdf', label: '' }]), true);
  assert.equal(L.same(saved, [{ url: 'https://x.example/a.pdf', label: 'B' }]), false);
  assert.equal(L.same(saved, []), false);
  assert.equal(L.same(undefined, []), true);
});
