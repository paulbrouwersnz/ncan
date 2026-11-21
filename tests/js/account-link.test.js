// Tests for assets/js/account-link.js: the banner an admin sees while acting as
// another role. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../assets/js/account-link.js');

test('the end time is shown in New Zealand time, whatever the computer’s zone', () => {
  assert.equal(A.untilText('2026-11-22T00:24:00Z').replace(/\s/g, ' '), '1:24 pm');
  assert.equal(A.untilText(''), '');
  assert.equal(A.untilText('not a time'), '');
});

test('the banner says who they act as, and that changes are still theirs', () => {
  const coach = A.bannerText({ role: 'coach', email: null, until: '2026-11-22T00:24:00Z' }, 'admin@club.example');
  assert.match(coach, /^You’re acting as a coach: /);
  assert.match(coach, /recorded as you \(admin@club\.example\)\./);
  assert.match(coach, /Ends at 1:24\spm\.$/);
  assert.match(A.bannerText({ role: 'committee' }, ''), /^You’re acting as the committee: .*recorded as you\.$/);
  assert.match(A.bannerText({ role: 'family', email: 'parent@home.example' }, 'a@b.nz'),
    /^You’re acting as the family of parent@home\.example: /);
});

test('no banner for anything else', () => {
  assert.equal(A.bannerText(null, 'a@b.nz'), '');
  assert.equal(A.bannerText({ role: 'admin' }, 'a@b.nz'), '');
});
