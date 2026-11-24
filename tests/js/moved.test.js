// Tests for assets/js/moved.js: old addresses sent on to the new ones.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// moved.js runs in a page: give it a location at a new address, so it sends nowhere
const code = fs.readFileSync(path.join(__dirname, '../../assets/js/moved.js'), 'utf8');
const box = { location: { pathname: '/', search: '', hash: '', replace() { throw new Error('sent on'); } },
              URLSearchParams };
box.window = box;
vm.runInNewContext(code, box);
const to = box.NCANMoved.newAddress;

test('the shared cards and charts page moved to /admin/shared/', () => {
  assert.equal(to('/admin/shared-charts/', '', ''), '/admin/shared/');
  assert.equal(to('/admin/shared-charts', '', ''), '/admin/shared/');
  assert.equal(to('/admin/shared-charts/index.html', '', ''), '/admin/shared/');
  assert.equal(to('/admin/shared-charts/', '?x=1', '#shares-admin'), '/admin/shared/?x=1#shares-admin');
});

test('renamed folders and old pages still go where they did', () => {
  assert.equal(to('/tuesday-training/', '', '#/plan/2026-12-01'), '/junior-athletics/#/plan/2026-12-01');
  assert.equal(to('/calendar.html', '', '#june'), '/calendar/#june');
  assert.equal(to('/athlete.html', '?a=sam-brown', '#out-of-stadia'), '/athlete/#/sam-brown/out-of-stadia');
});

test('pages at their own address are left alone', () => {
  assert.equal(to('/admin/shared/', '', ''), null);
  assert.equal(to('/admin/', '', ''), null);
  assert.equal(to('/gallery/2024-colgate-games/', '', ''), null);
  assert.equal(to('/', '', ''), null);
});
