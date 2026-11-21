// Tests for assets/js/anchor-grid.js: the 3 x 3 "Keep in view" grid and the
// focus points it stands for. Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../assets/js/anchor-grid.js');

test('nine positions, top left first, row by row', () => {
  assert.equal(A.POSITIONS.length, 9);
  assert.deepEqual(A.POSITIONS.map((p) => p.focus), [
    '0% 0%', '50% 0%', '100% 0%',
    '0% 50%', '50% 50%', '100% 50%',
    '0% 100%', '50% 100%', '100% 100%']);
  assert.deepEqual(A.POSITIONS.map((p) => p.label), [
    'Top left', 'Top centre', 'Top right',
    'Middle left', 'Centre', 'Middle right',
    'Bottom left', 'Bottom centre', 'Bottom right']);
});

test('a saved focus finds its grid position, or is Custom', () => {
  assert.equal(A.keyOf('0% 0%'), 'top-left');
  assert.equal(A.keyOf('50% 100%'), 'bottom-center');
  assert.equal(A.keyOf('100% 50%'), 'center-right');
  assert.equal(A.keyOf(' 50% 50% '), 'center-center');
  assert.equal(A.keyOf(''), 'center-center');           // none saved: the middle
  assert.equal(A.keyOf(null), 'center-center');
  assert.equal(A.keyOf('45% 30%'), 'custom');
  assert.equal(A.keyOf('50%  50%'), 'custom');          // not the stored form
  assert.equal(A.keyOf('120% 0%'), 'custom');
  assert.equal(A.keyOf('top'), 'custom');
});

test('each position gives its focus back', () => {
  A.POSITIONS.forEach((p) => {
    assert.equal(A.focusOf(p.key), p.focus);
    assert.equal(A.keyOf(A.focusOf(p.key)), p.key);
  });
  assert.equal(A.focusOf('custom'), null);
  assert.equal(A.focusOf('nowhere'), null);
});

test('a focus is read as two percentages, or not at all', () => {
  assert.deepEqual(A.parse('30% 40%'), [30, 40]);
  assert.equal(A.parse('101% 0%'), null);
  assert.equal(A.parse('30%'), null);
  assert.equal(A.parse(7), null);
});
