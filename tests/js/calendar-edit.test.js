// Tests for the calendar editor's helpers (calendar-edit.js): form <-> event, checks and words.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../assets/js/calendar-edit.js');

const timed = {
  id: 'e-abc@ncan.nz', calendars: ['events-senior', 'events-childrens'], title: 'Interclub 5',
  location: 'Ngā Puna Wai', description: 'Line one\nLine two', link: 'https://example.org/x',
  all_day: false, start: '2026-12-05T13:30', end: '2026-12-05T16:30', repeat: null, skip: [], status: 'CONFIRMED'
};

test('a timed event goes into the form and comes back unchanged', () => {
  const f = C.fromEvent(timed);
  assert.strictEqual(f.startDate, '2026-12-05');
  assert.strictEqual(f.startTime, '13:30');
  assert.strictEqual(f.endTime, '16:30');
  assert.deepStrictEqual(f.calendars, ['events-senior', 'events-childrens']);
  const back = C.toEvent(f);
  for (const k of ['id', 'calendars', 'title', 'location', 'description', 'link', 'all_day', 'start', 'end', 'repeat', 'status']) {
    assert.deepStrictEqual(back[k], timed[k], k);
  }
});

test('an all-day event shows its last day, and sends the day after', () => {
  const e = { calendars: ['events-road-xc'], title: 'Champs', all_day: true, start: '2027-03-06', end: '2027-03-08' };
  const f = C.fromEvent(e);
  assert.strictEqual(f.endDate, '2027-03-07');
  assert.strictEqual(C.toEvent(f).end, '2027-03-08');
  // a one-day event across a month end
  const one = C.fromEvent({ calendars: ['x'], title: 'y', all_day: true, start: '2027-02-28', end: '2027-03-01' });
  assert.strictEqual(one.endDate, '2027-02-28');
  assert.strictEqual(C.toEvent(one).end, '2027-03-01');
});

test('repeats go into the form and back: until, count and none', () => {
  const weekly = { ...timed, repeat: { freq: 'weekly', days: ['TU', 'TH'], until: '2027-03-30T23:59' }, skip: ['2026-12-29T13:30'] };
  const f = C.fromEvent(weekly);
  assert.strictEqual(f.freq, 'weekly');
  assert.strictEqual(f.ends, 'until');
  assert.strictEqual(f.until, '2027-03-30');
  assert.deepStrictEqual(C.toEvent(f).repeat, { freq: 'weekly', days: ['TU', 'TH'], until: '2027-03-30' });
  assert.deepStrictEqual(C.toEvent(f).skip, ['2026-12-29T13:30']);

  const counted = C.fromEvent({ ...timed, repeat: { freq: 'fortnightly', days: ['MO'], count: 6 } });
  assert.strictEqual(counted.ends, 'count');
  assert.deepStrictEqual(C.toEvent(counted).repeat, { freq: 'fortnightly', days: ['MO'], count: 6 });

  const monthly = C.toEvent({ ...C.fromEvent(timed), freq: 'monthly', days: ['MO'], ends: 'never' });
  assert.deepStrictEqual(monthly.repeat, { freq: 'monthly' });

  // turning repeats off drops the cancelled dates too
  const off = C.toEvent({ ...f, freq: '' });
  assert.strictEqual(off.repeat, null);
  assert.deepStrictEqual(off.skip, []);
});

test('days go out in calendar order, whatever order they were ticked', () => {
  const f = { ...C.fromEvent(timed), freq: 'weekly', days: ['FR', 'MO', 'WE'], ends: 'never' };
  assert.deepStrictEqual(C.toEvent(f).repeat.days, ['MO', 'WE', 'FR']);
});

test('the checks catch the common slips', () => {
  const ok = C.fromEvent(timed);
  assert.deepStrictEqual(C.check(ok), []);
  assert.match(C.check({ ...ok, title: '  ' }).join(' '), /needs a title/);
  assert.match(C.check({ ...ok, calendars: [] }).join(' '), /at least one calendar/);
  assert.match(C.check({ ...ok, endTime: '13:00' }).join(' '), /end after it starts/);
  assert.match(C.check({ ...ok, startTime: '' }).join(' '), /start and end time/);
  assert.match(C.check({ ...ok, startDate: '2026-02-30' }).join(' '), /date it starts/);
  assert.match(C.check({ ...ok, link: 'http://example.org' }).join(' '), /https/);
  assert.match(C.check({ ...ok, freq: 'weekly', days: [], ends: 'never' }).join(' '), /days it repeats/);
  assert.match(C.check({ ...ok, freq: 'weekly', days: ['SA'], ends: 'until', until: '2026-11-01' }).join(' '), /before the first/);
  assert.match(C.check({ ...ok, freq: 'weekly', days: ['SA'], ends: 'count', count: '0' }).join(' '), /between 1 and 500/);
  assert.match(C.check({ ...ok, description: 'x'.repeat(2001) }).join(' '), /at most 2000/);
  // an all-day event's last day may be its first
  const day = C.fromEvent({ calendars: ['x'], title: 'y', all_day: true, start: '2027-01-01', end: '2027-01-02' });
  assert.deepStrictEqual(C.check(day), []);
  assert.match(C.check({ ...day, endDate: '2026-12-31' }).join(' '), /last day/);
});

test('the words for when an event is', () => {
  assert.strictEqual(C.whenText(timed), 'Sat 5 Dec 2026, 1:30–4:30 pm');
  assert.strictEqual(C.whenText({ start: '2026-12-05T09:00', end: '2026-12-05T13:00' }), 'Sat 5 Dec 2026, 9 am–1 pm');
  assert.strictEqual(C.whenText({ start: '2026-12-05T18:00', end: '2026-12-05T19:00' }), 'Sat 5 Dec 2026, 6–7 pm');
  assert.strictEqual(C.whenText({ all_day: true, start: '2027-03-06', end: '2027-03-07' }), 'Sat 6 Mar 2027, all day');
  assert.strictEqual(C.whenText({ all_day: true, start: '2027-03-06', end: '2027-03-08' }), 'Sat 6 Mar 2027 – Sun 7 Mar 2027');
  assert.strictEqual(C.whenText({ start: '2027-01-01T22:00', end: '2027-01-02T02:00' }),
    'Fri 1 Jan 2027, 10 pm – Sat 2 Jan 2027, 2 am');
  assert.strictEqual(C.timeText('12:00'), '12 pm');
  assert.strictEqual(C.timeText('00:15'), '12:15 am');
});

test('the words for how an event repeats', () => {
  assert.strictEqual(C.repeatText({ freq: 'weekly', days: ['TU'], until: '2027-03-30T23:59' }), 'Every Tuesday until Tue 30 Mar 2027');
  assert.strictEqual(C.repeatText({ freq: 'fortnightly', days: ['MO', 'WE'], count: 10 }), 'Every second Monday and Wednesday, 10 times');
  assert.strictEqual(C.repeatText({ freq: 'monthly', count: 1 }, '2026-12-03T18:00'), 'Every month on the 3rd, 1 time');
  assert.strictEqual(C.repeatText({ freq: 'weekly', days: ['MO', 'TU', 'TH'] }), 'Every Monday, Tuesday and Thursday, with no end date');
  assert.strictEqual(C.repeatText(null), '');
});

test('listing: upcoming soonest first, past latest first, and search', () => {
  const evs = [
    { title: 'Old', start: '2026-10-01T10:00', end: '2026-10-01T11:00' },
    { title: 'Soon', start: '2026-12-01T10:00', end: '2026-12-01T11:00', location: 'Rangiora' },
    { title: 'Later', start: '2027-01-01T10:00', end: '2027-01-01T11:00' },
    { title: 'Older', start: '2026-09-01T10:00', end: '2026-09-01T11:00' },
    { title: 'Training', start: '2026-09-01T18:00', end: '2026-09-01T19:00', repeat: { freq: 'weekly', days: ['TU'], until: '2027-03-30T23:59' } },
    { title: 'Weekend', all_day: true, start: '2026-11-20', end: '2026-11-22' }
  ];
  const today = '2026-11-21';
  assert.deepStrictEqual(C.pick(evs, 'upcoming', today).map(e => e.title), ['Training', 'Weekend', 'Soon', 'Later']);
  assert.deepStrictEqual(C.pick(evs, 'past', today).map(e => e.title), ['Old', 'Older']);
  assert.strictEqual(C.pick(evs, 'all', today).length, 6);
  assert.deepStrictEqual(C.pick(evs, 'all', today, 'rangi').map(e => e.title), ['Soon']);
  // an all-day event's last day is the day before its end
  assert.strictEqual(C.lastDate(evs[5]), '2026-11-21');
  assert.ok(!C.upcoming(evs[5], '2026-11-22'));
});

test('changes are noticed, and not-changes are not', () => {
  const f = C.fromEvent(timed);
  assert.ok(C.same(f, C.fromEvent(timed)));
  assert.ok(!C.same(f, { ...f, title: 'Interclub 6' }));
  assert.ok(C.same(f, { ...f, title: 'Interclub 5  ' }));     // spaces at the end don't count
});

test('a new calendar’s address is checked', () => {
  assert.strictEqual(C.slugProblem('events-masters'), '');
  assert.match(C.slugProblem('Events Masters'), /lower-case/);
  assert.match(C.slugProblem('-x'), /lower-case/);
  assert.match(C.slugProblem('settings'), /kept for the editor/);
});

test('dates step and name their weekdays without the machine’s time zone', () => {
  assert.strictEqual(C.addDays('2027-04-04', 1), '2027-04-05');     // the clocks go back that night
  assert.strictEqual(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(C.dayCode('2026-11-24'), 'TU');
  assert.ok(C.realDate('2028-02-29'));
  assert.ok(!C.realDate('2027-02-29'));
});
