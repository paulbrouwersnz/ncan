// Tests for the wording helpers of /my/membership/ (assets/js/my-membership.js).
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../assets/js/my-membership.js');

test('dates, seasons and grades read naturally', () => {
  assert.equal(M.dateText('2018-03-04'), '4 March 2018');
  assert.equal(M.dateText('2026-11-20T10:00'), '20 November 2026');
  assert.equal(M.dateText(null), '');
  assert.equal(M.seasonText('2026/27'), '2026–27');
  assert.equal(M.gradeText(8), 'Grade 8');
  assert.equal(M.gradeText('U16'), 'U16');
  assert.equal(M.gradeText(null), '');
});

test('a season of registrations with one body', () => {
  assert.equal(M.regText([{ type: 'Junior', ordered: '2025-09-01' }]), 'Junior, ordered 1 September 2025');
  assert.equal(M.regText([{ type: 'Junior', ordered: null }, 'Volunteer']), 'Junior; Volunteer');
  assert.equal(M.regText([]), '');
  assert.equal(M.regText(null), '');
});

test('registered this season, not yet, or not a member', () => {
  assert.equal(M.statusText({ member: true, current: true }, '2026/27'), 'Registered for 2026–27.');
  assert.equal(M.statusText({ member: true, current: false }, '2026/27'), 'Not registered for 2026–27 yet.');
  assert.match(M.statusText({ member: false }, '2026/27'), /^Not on the club’s members list/);
});

test('the athlete a link picks', () => {
  assert.equal(M.hashAthlete('#/athlete/sam-brown'), 'sam-brown');
  assert.equal(M.hashAthlete('#/athlete/Sam-Brown/'), 'sam-brown');
  assert.equal(M.hashAthlete('#/other'), null);
  assert.equal(M.hashAthlete(''), null);
});
