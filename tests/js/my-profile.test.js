'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../../assets/js/my-profile.js');

test('possessive', () => {
  assert.strictEqual(P.possessive('Lily Smith'), 'Lily Smith’s');
  assert.strictEqual(P.possessive('Ben Jones'), 'Ben Jones’');
});

test('tag beside a linked athlete', () => {
  assert.strictEqual(P.tag({ me: true }), 'You');
  assert.strictEqual(P.tag({ me: false }), 'Family');
  assert.strictEqual(P.tag({ me: null }), '');
});

test('asking and leaving', () => {
  assert.strictEqual(P.askText({ name: 'Ben Baker' }), 'Are you Ben Baker, the athlete?');
  const family = P.leaveText({ name: 'Cara Cole' }, false);
  assert.match(family, /^Leave Cara Cole’s family\?/);
  assert.match(family, /next membership import won’t add you back/);
  assert.doesNotMatch(family, /As staff/);
  assert.match(P.leaveText({ name: 'Cara Cole' }, true), /As staff, you can still open their page/);
});

test('a GameDay suggestion is only a hint until saved', () => {
  assert.match(P.nameHint({ name: null, suggested: 'Dale Wilhelm' }), /Check it, then save/);
  assert.strictEqual(P.nameHint({ name: 'Dale', suggested: null }), '');
  assert.strictEqual(P.nameHint({ name: null, suggested: null }), '');
});
