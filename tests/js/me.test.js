// Tests for the wording helpers of /me/ (assets/js/me.js), My athletes.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../assets/js/me.js');

test('initials: first and second name, upper case', () => {
  assert.equal(M.initials('Sam Brown'), 'SB');
  assert.equal(M.initials('aroha te whare-smith'), 'AT');
  assert.equal(M.initials('Sam'), 'S');
  assert.equal(M.initials('  '), '?');
  assert.equal(M.initials(null), '?');
});

test('the signed-in person: the first letter of their email address', () => {
  assert.equal(M.emailInitial('paul@example.nz'), 'P');
  assert.equal(M.emailInitial(''), '?');
  assert.equal(M.emailInitial('_x@example.nz'), '?');
});

test('shared cards are counted per athlete, removed ones left out', () => {
  const counts = M.shareCounts([
    { address: 'sam-brown' }, { address: 'sam-brown' }, { address: 'sam-brown', removed: { at: '2026-11-20' } },
    { athlete: 'Kim Lee' }, null,
  ]);
  assert.deepEqual(counts, { 'sam-brown': 2, 'Kim Lee': 1 });
});

test('a card per athlete, linked to their page, with their share count', () => {
  const own = [{ id: 1, name: 'Sam Brown', slug: 'sam-brown' }, { id: 2, name: 'Kim Lee', slug: null }, { id: 3 }];
  const cards = M.cards(own, [{ address: 'sam-brown' }, { athlete: 'Kim Lee' }]);
  assert.deepEqual(cards, [
    { name: 'Sam Brown', slug: 'sam-brown', href: '/athlete/#/sam-brown', initials: 'SB', shares: 1 },
    { name: 'Kim Lee', slug: null, href: null, initials: 'KL', shares: 1 },
  ]);
  assert.deepEqual(M.cards(null, null), []);
});

test('share counts read naturally', () => {
  assert.equal(M.sharesText(1), '1 card or chart shared publicly');
  assert.equal(M.sharesText(3), '3 cards and charts shared publicly');
});
