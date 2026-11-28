// Tests for assets/js/admin-tracks.js: the wording when a location is edited or removed.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../../assets/js/admin-tracks.js'), 'utf8');
const box = {};
box.window = box;
vm.runInNewContext(code, box);
const T = box.AdminTracks;
T._state.colours = [{ id: 'blue', name: 'Blue', hex: '#0072B5' }, { id: 'red', name: 'Red', hex: '#B4472F' }];

test('removing a location says what comes off and that its colour goes', () => {
  assert.equal(T.removeWords({ location: 'QEII', meetings: 3, colour: 'red' }),
    'Remove “QEII”? It comes off 3 meetings and its colour (Red) goes. Share cards from those meetings won’t show a location.');
  assert.equal(T.removeWords({ location: 'QEII', meetings: 1, colour: null }),
    'Remove “QEII”? It comes off 1 meeting. Share cards from that meeting won’t show a location.');
  assert.equal(T.removeWords({ location: 'Old', meetings: 0, colour: 'red' }), 'Remove “Old”? Its colour (Red) goes.');
  assert.equal(T.removeWords({ location: 'Park', meetings: 0, colour: null, courses: { 'cross-country': 'blue', road: 'red' } }),
    'Remove “Park”? Its colours (Blue, Red) go.');
});

test('a rename says where it went and the colour it kept', () => {
  assert.equal(T.changedWords({ location: 'Ngā Puna Wia' }, { location: 'Ngā Puna Wai', meetings: 2, colour: 'red' }),
    '“Ngā Puna Wia” is now “Ngā Puna Wai” on 2 meetings, starting on Red.');
  assert.equal(T.changedWords({ location: 'QEII' }, { location: 'QEII', meetings: 1, colour: null }),
    '“QEII” saved on 1 meeting.');
});
