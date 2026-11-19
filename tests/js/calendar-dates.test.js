// Tests for assets/js/calendar-dates.js, the calendar page's date and
// repeat-event helpers. Run with Node's built-in test runner:
//
//     node --test "tests/js/*.test.js"
//
// The helpers never read the machine's own time zone, so these pass the same
// under TZ=UTC, TZ=Pacific/Auckland or anything else; CI runs them under both.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../assets/js/calendar-dates.js');

// a whole calendar file around some VEVENT lines
function ics(...lines) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
}

function event(...lines) {
  return ['BEGIN:VEVENT', 'SUMMARY:Club night', ...lines, 'END:VEVENT'];
}

// one event's occurrences up to the given NZ date
function expand(lines, until) {
  const events = D.parseEvents(ics(...event(...lines)));
  assert.equal(events.length, 1);
  return D.occurrences(events[0], until || D.wallDate(2028, 0, 1));
}

function label(date) {
  return D.isoDate(date) + ' ' + D.clockTime(date);
}

function labels(occ) {
  return occ.map((o) => label(o.start));
}

// the real instant an occurrence starts, as ISO text
function utc(o) {
  return D.instantFromNzWall(o.start).toISOString();
}

/* ------------------------------------------------------- daylight saving */

test('a weekly 5 pm event stays at 5 pm across the September NZ clock change', () => {
  // NZ moves to daylight time at 2 am on Sunday 27 September 2026
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20260915T170000',
    'DTEND;TZID=Pacific/Auckland:20260915T183000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3'
  ]);
  assert.deepEqual(labels(occ), ['2026-09-15 5pm', '2026-09-22 5pm', '2026-09-29 5pm']);
  // the real instant moves an hour earlier in UTC, as it should
  assert.equal(utc(occ[1]), '2026-09-22T05:00:00.000Z');
  assert.equal(utc(occ[2]), '2026-09-29T04:00:00.000Z');
  occ.forEach((o) => assert.equal(o.duration, 90 * 60000));
});

test('a weekly 5 pm event stays at 5 pm across the April NZ clock change', () => {
  // NZ leaves daylight time at 3 am on Sunday 4 April 2027
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20270323T170000',
    'RRULE:FREQ=WEEKLY;COUNT=3'
  ]);
  assert.deepEqual(labels(occ), ['2027-03-23 5pm', '2027-03-30 5pm', '2027-04-06 5pm']);
  assert.equal(utc(occ[1]), '2027-03-30T04:00:00.000Z');
  assert.equal(utc(occ[2]), '2027-04-06T05:00:00.000Z');
});

test('a daily early-morning event keeps its time through the change night', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20260926T063000',
    'RRULE:FREQ=DAILY;COUNT=3'
  ]);
  assert.deepEqual(labels(occ), ['2026-09-26 6:30am', '2026-09-27 6:30am', '2026-09-28 6:30am']);
});

/* --------------------------------------------------------- repeat rules */

test('COUNT limits the number of occurrences', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20261103T170000',
    'RRULE:FREQ=WEEKLY;COUNT=4'
  ]);
  assert.equal(occ.length, 4);
  assert.equal(label(occ[3].start), '2026-11-24 5pm');
});

test('UNTIL is inclusive, and a UTC UNTIL is read as NZ time', () => {
  // 04:00 UTC on 20 October is 5 pm NZ daylight time that day
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20261006T170000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261020T040000Z'
  ]);
  assert.deepEqual(labels(occ), ['2026-10-06 5pm', '2026-10-13 5pm', '2026-10-20 5pm']);
});

test('BYDAY with INTERVAL walks every other week on the named days', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20261102T180000',      // a Monday
    'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'
  ], D.wallDate(2026, 11, 1));
  assert.deepEqual(labels(occ), [
    '2026-11-02 6pm', '2026-11-04 6pm',
    '2026-11-16 6pm', '2026-11-18 6pm',
    '2026-11-30 6pm'
  ]);
});

test('BYDAY never yields a date before DTSTART', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20261104T180000',      // a Wednesday
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3'
  ]);
  assert.deepEqual(labels(occ), ['2026-11-04 6pm', '2026-11-09 6pm', '2026-11-11 6pm']);
});

test('occurrences stop at the end of the window', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20261103T170000',
    'RRULE:FREQ=WEEKLY'
  ], D.wallDate(2026, 10, 24, 17));
  assert.equal(occ.length, 4);
});

test('an event without a repeat rule occurs once, an hour long by default', () => {
  const occ = expand(['DTSTART;TZID=Pacific/Auckland:20261103T170000']);
  assert.equal(occ.length, 1);
  assert.equal(occ[0].duration, 3600000);
});

/* ---------------------------------------------------------------- EXDATE */

test('EXDATE removes a date, given in NZ time or in UTC', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20260901T170000',
    'RRULE:FREQ=WEEKLY;COUNT=5',
    'EXDATE;TZID=Pacific/Auckland:20260908T170000',
    // 05:00 UTC on 15 September is 5 pm NZ standard time
    'EXDATE:20260915T050000Z'
  ]);
  assert.deepEqual(labels(occ), ['2026-09-01 5pm', '2026-09-22 5pm', '2026-09-29 5pm']);
});

test('EXDATE accepts a comma-separated list', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20260901T170000',
    'RRULE:FREQ=WEEKLY;COUNT=4',
    'EXDATE;TZID=Pacific/Auckland:20260908T170000,20260922T170000'
  ]);
  assert.deepEqual(labels(occ), ['2026-09-01 5pm', '2026-09-15 5pm']);
});

/* ------------------------------------------------------- all-day events */

test('an all-day event spans whole days, and saves as dates', () => {
  const events = D.parseEvents(ics(...event(
    'DTSTART;VALUE=DATE:20261225',
    'DTEND;VALUE=DATE:20261227'
  )));
  assert.equal(events[0].start.allDay, true);
  const occ = D.occurrences(events[0], D.wallDate(2027, 0, 1));
  assert.equal(occ[0].duration, 2 * D.DAY_MS);

  const item = { start: occ[0].start, duration: occ[0].duration, allDay: true, summary: 'Break' };
  assert.equal(D.isoDate(D.finishOf(item)), '2026-12-27');
  const saved = D.buildIcs(item);
  assert.match(saved, /\r\nDTSTART;VALUE=DATE:20261225\r\n/);
  assert.match(saved, /\r\nDTEND;VALUE=DATE:20261227\r\n/);
});

test('an all-day event without DTEND lasts one day', () => {
  const occ = expand(['DTSTART;VALUE=DATE:20261225']);
  assert.equal(occ[0].duration, D.DAY_MS);
});

test('an all-day weekly event across the clock change stays on midnight', () => {
  const occ = expand(['DTSTART;VALUE=DATE:20260920', 'RRULE:FREQ=WEEKLY;COUNT=3']);
  assert.deepEqual(occ.map((o) => D.isoDate(o.start)), ['2026-09-20', '2026-09-27', '2026-10-04']);
  occ.forEach((o) => assert.equal(o.start.getUTCHours(), 0));
});

/* ------------------------------------------- 29 February and month ends */

test('a yearly event on 29 February falls on 28 February in other years', () => {
  const occ = expand([
    'DTSTART;VALUE=DATE:20280229',
    'RRULE:FREQ=YEARLY;COUNT=5'
  ], D.wallDate(2034, 0, 1));
  assert.deepEqual(occ.map((o) => D.isoDate(o.start)),
    ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('a monthly event on the 31st clamps to short months without drifting', () => {
  const occ = expand([
    'DTSTART;TZID=Pacific/Auckland:20270131T180000',
    'RRULE:FREQ=MONTHLY;COUNT=4'
  ]);
  assert.deepEqual(labels(occ),
    ['2027-01-31 6pm', '2027-02-28 6pm', '2027-03-31 6pm', '2027-04-30 6pm']);
});

test('addMonths clamps 31 January to the end of February', () => {
  assert.equal(D.isoDate(D.addMonths(D.wallDate(2028, 0, 31), 1)), '2028-02-29');
  assert.equal(D.isoDate(D.addMonths(D.wallDate(2027, 0, 31), 1)), '2027-02-28');
});

test('a daily repeat steps through 29 February', () => {
  const occ = expand(['DTSTART;VALUE=DATE:20280228', 'RRULE:FREQ=DAILY;COUNT=3'], D.wallDate(2029, 0, 1));
  assert.deepEqual(occ.map((o) => D.isoDate(o.start)), ['2028-02-28', '2028-02-29', '2028-03-01']);
});

/* -------------------------------------------------------- New Zealand time */

test('a UTC time is shown as the NZ time it names', () => {
  const events = D.parseEvents(ics(...event('DTSTART:20261110T040000Z')));
  assert.equal(label(events[0].start.date), '2026-11-10 5pm');
  const winter = D.parseEvents(ics(...event('DTSTART:20260610T050000Z')));
  assert.equal(label(winter[0].start.date), '2026-06-10 5pm');
});

test('a TZID or floating time is taken as written', () => {
  const tz = D.parseEvents(ics(...event('DTSTART;TZID=Pacific/Auckland:20261110T170000')));
  const floating = D.parseEvents(ics(...event('DTSTART:20261110T170000')));
  assert.equal(label(tz[0].start.date), '2026-11-10 5pm');
  assert.equal(label(floating[0].start.date), '2026-11-10 5pm');
});

test('today is the current date in New Zealand', () => {
  // 11 am UTC on 18 November is midnight on 19 November in NZ daylight time
  assert.equal(D.isoDate(D.nzToday(new Date('2026-11-18T10:59:59Z'))), '2026-11-18');
  assert.equal(D.isoDate(D.nzToday(new Date('2026-11-18T11:00:00Z'))), '2026-11-19');
  // and noon UTC on 30 June is midnight on 1 July in NZ standard time
  assert.equal(D.isoDate(D.nzToday(new Date('2026-06-30T11:59:59Z'))), '2026-06-30');
  assert.equal(D.isoDate(D.nzToday(new Date('2026-06-30T12:00:00Z'))), '2026-07-01');
  assert.equal(D.nzToday(new Date('2026-11-18T23:00:00Z')).getUTCHours(), 0);
});

test('NZ is 12 hours ahead of UTC in winter and 13 in summer', () => {
  assert.equal(D.nzOffsetMinutes(new Date('2026-07-01T00:00:00Z')), 720);
  assert.equal(D.nzOffsetMinutes(new Date('2027-01-01T00:00:00Z')), 780);
});

test('NZ wall-clock times convert to real instants and back', () => {
  [
    [D.wallDate(2026, 6, 1, 17), '2026-07-01T05:00:00.000Z'],
    [D.wallDate(2027, 0, 1, 17), '2027-01-01T04:00:00.000Z'],
    [D.wallDate(2026, 8, 27, 1, 59), '2026-09-26T13:59:00.000Z'],   // just before the change
    [D.wallDate(2026, 8, 27, 3, 0), '2026-09-26T14:00:00.000Z']     // just after it
  ].forEach(([wall, iso]) => {
    const instant = D.instantFromNzWall(wall);
    assert.equal(instant.toISOString(), iso);
    assert.equal(D.nzWallFromInstant(instant).getTime(), wall.getTime());
  });
});

test('the "NZ time" label shows only when the visitor is not on NZ time', () => {
  const summer = new Date('2026-11-19T00:00:00Z');
  const winter = new Date('2026-06-19T00:00:00Z');
  // getTimezoneOffset is minutes behind UTC, so NZ daylight time is -780
  assert.equal(D.visitorOnNzTime('Pacific/Auckland', -780, summer), true);
  assert.equal(D.visitorOnNzTime('Pacific/Auckland', -720, winter), true);
  assert.equal(D.visitorOnNzTime('Antarctica/McMurdo', -780, summer), true);
  assert.equal(D.visitorOnNzTime('Australia/Sydney', -660, summer), false);
  assert.equal(D.visitorOnNzTime('UTC', 0, summer), false);
  assert.equal(D.visitorOnNzTime('Pacific/Fiji', -720, winter), false);
  // the right zone name but a clock that disagrees with it
  assert.equal(D.visitorOnNzTime('Pacific/Auckland', -720, summer), false);
  assert.equal(D.visitorOnNzTime('', -780, summer), false);
});

/* ----------------------------------------------------------------- saving */

test('a saved timed event carries the right UTC time either side of a change', () => {
  const before = D.buildIcs({ start: D.wallDate(2026, 8, 22, 17), duration: 5400000, summary: 'Club night' });
  const after = D.buildIcs({ start: D.wallDate(2026, 8, 29, 17), duration: 5400000, summary: 'Club night' });
  assert.match(before, /\r\nDTSTART:20260922T050000Z\r\nDTEND:20260922T063000Z\r\n/);
  assert.match(after, /\r\nDTSTART:20260929T040000Z\r\nDTEND:20260929T053000Z\r\n/);
  assert.equal(D.fileNameFor({ start: D.wallDate(2026, 8, 29, 17), summary: 'Club night!' }),
    'club-night-2026-09-29.ics');
});

test('a repeating event gives each saved occurrence its own UID', () => {
  const saved = D.buildIcs({ start: D.wallDate(2026, 8, 29, 17), duration: 0, summary: 'x', uid: 'abc@example.org' });
  assert.match(saved, /\r\nUID:abc-20260929@ncan\.nz\r\n/);
});

/* ---------------------------------------------------------------- parsing */

test('folded lines and escaped text are read back', () => {
  const events = D.parseEvents(ics(...event(
    'DTSTART;TZID=Pacific/Auckland:20261110T170000',
    'LOCATION:Main Oval\\, Rangiora',
    'DESCRIPTION:First line\\nsecond',
    '  line'
  )));
  assert.equal(events[0].location, 'Main Oval, Rangiora');
  assert.equal(events[0].description, 'First line\nsecond line');
});

test('clock times read as a person would say them', () => {
  assert.equal(D.clockTime(D.wallDate(2026, 0, 1, 0, 0)), '12am');
  assert.equal(D.clockTime(D.wallDate(2026, 0, 1, 12, 0)), '12pm');
  assert.equal(D.clockTime(D.wallDate(2026, 0, 1, 17, 30)), '5:30pm');
  assert.equal(D.clockTime(D.wallDate(2026, 0, 1, 9, 5)), '9:05am');
});
