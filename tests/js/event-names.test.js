// event-names.js: events out of the stadium in km, pace and "faster than last year".
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../assets/js/event-names.js');

test('out of the stadium: distances in km; track events as they are', () => {
  assert.equal(E.label('Cross country 4000m'), '4 km cross country');
  assert.equal(E.label('Cross country 4500m'), '4.5 km cross country');
  assert.equal(E.label('Road 10000m Race Walk'), '10 km road race walk');
  assert.equal(E.label('Trail relay 2500m'), '2.5 km trail relay');
  assert.equal(E.label('Cross country 6900m'), '6.9 km cross country');
  assert.equal(E.label('Road 1 Mile'), 'Road 1 Mile');
  assert.equal(E.label('Road Marathon'), 'Road Marathon');
  assert.equal(E.label('Road relay Loburn 39 leg 1'), 'Road relay Loburn 39 leg 1');
  assert.equal(E.label('1500m'), '1500m');
  assert.equal(E.label('3000m Steeplechase'), '3000m Steeplechase');
  assert.ok(E.isOut('Trail relay 2000m'));
  assert.ok(!E.isOut('4x100m relay'));
});

test('distances, pace and time gained', () => {
  assert.equal(E.distance('Cross country 4000m'), 4000);
  assert.equal(E.distance('Road 1 Mile'), 1609.344);
  assert.equal(E.distance('Road Marathon'), 42195);
  assert.equal(E.distance('Road relay Loburn 39 leg 1'), null);
  assert.equal(E.pace(250), '4:10 /km');
  assert.equal(E.clock(3725), '1:02:05');
  assert.equal(E.gained(30), '30s');
  assert.equal(E.gained(4.5), '4.5s');
  assert.equal(E.gained(75), '1:15');
  assert.equal(E.lastYearWords({ by: 'time', faster: 30, mark: '12:00' }), '30s faster than last year (12:00)');
  assert.equal(E.lastYearWords({ by: 'pace', pace: 250, was: 260 }), 'Faster pace than last year: 4:10 /km (was 4:20 /km)');
  assert.equal(E.lastYearWords(null), '');
});
