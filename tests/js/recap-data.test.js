// Tests for assets/js/recap-data.js: meeting recaps (grouping results, suggested
// highlights, club records, the names check and the preview card). Made-up data only.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../assets/js/recap-data.js');

let n = 0;
const res = (o) => Object.assign({
  key: 'k' + (++n), athlete: 'S Brown', public_name: 'S Brown', gender: 'girls', grade: 11, age_group: null,
  event: '60m', implement: null, field: false, mark: '8.10', value: 8.1, wind: null, windy: false,
  place: null, of: null, date: '2026-11-07', pb: null, prev: null, medal: null,
  source: 'https://example.anet.live/meets/80271/events/individual/1'
}, o);

test('the page address: list, recap or recap maker', () => {
  assert.deepEqual(R.parseHash(''), { view: 'list' });
  assert.deepEqual(R.parseHash('#/'), { view: 'list' });
  assert.deepEqual(R.parseHash('#/12'), { view: 'recap', id: '12' });
  assert.deepEqual(R.parseHash('#/ab-3/edit'), { view: 'edit', id: 'ab-3' });
  assert.deepEqual(R.parseHash('#/ab-3/edit/'), { view: 'edit', id: 'ab-3' });
  assert.deepEqual(R.parseHash('#/a b'), { view: 'list' });
  assert.deepEqual(R.parseHash('#top'), { view: 'list' });
  assert.equal(R.pageHref('12', true), '/recaps/#/12/edit');
});

test('dates, place and wind in words', () => {
  assert.equal(R.dates('2026-11-07', '2026-11-07'), '7 November 2026');
  assert.equal(R.dates('2026-11-07', '2026-11-08'), '7–8 November 2026');
  assert.equal(R.dates('2026-10-31', '2026-11-01'), '31 October – 1 November 2026');
  assert.equal(R.dates('2026-12-31', '2027-01-01'), '31 December 2026 – 1 January 2027');
  assert.equal(R.dates(null, null), '');
  assert.equal(R.where({ location: 'Ngā Puna Wai', city: 'Christchurch, New Zealand' }), 'Ngā Puna Wai, Christchurch');
  assert.equal(R.where({ city: 'Sydney, Australia' }), 'Sydney, Australia');
  assert.equal(R.meetingLine({ first: '2026-11-07', last: '2026-11-07', location: 'Rangiora' }), '7 November 2026 · Rangiora');
  assert.equal(R.windWords(res({ wind: 1.2 })), '+1.2 m/s');
  assert.equal(R.windWords(res({ wind: -0.4 })), '−0.4 m/s');
  assert.equal(R.windWords(res({ wind: 0 })), '0.0 m/s');
  assert.equal(R.windWords(res({ wind: null })), '');
  assert.equal(R.windWords(res({ field: true, wind: 1.1 })), '');
  assert.equal(R.placeWords(res({ place: 2, of: 8 })), '2nd of 8');
  assert.equal(R.placeWords(res({ place: 11 })), '11th');
  assert.equal(R.placeWords(res()), '');
  assert.equal(R.groupLabel(res()), 'Grade 11 girls');
  assert.equal(R.groupLabel(res({ grade: null, age_group: 'U18', gender: 'boys' })), 'U18 boys');
  assert.equal(R.eventLabel(res({ event: 'Shot Put', implement: '3kg' })), 'Shot Put (3kg)');
  assert.equal(R.eventLabel(res({ event: 'Shot Put 3kg', implement: '3kg' })), 'Shot Put 3kg');
  assert.equal(R.stateLabel('removed'), 'Taken down');
  assert.equal(R.stateLabel('public'), 'Public');
});

test('results grouped by event in running order, then grade, gender and place', () => {
  const list = [
    res({ event: '60m', grade: 12, gender: 'boys', place: 1, athlete: 'A' }),
    res({ event: '60m', grade: 11, gender: 'boys', place: 2, athlete: 'B' }),
    res({ event: 'Shot Put', implement: '3kg', field: true, athlete: 'C' }),
    res({ event: '60m', grade: 11, gender: 'girls', place: 3, athlete: 'D' }),
    res({ event: '60m', grade: 11, gender: 'girls', place: 1, athlete: 'E' }),
    res({ event: 'Shot Put', implement: '4kg', field: true, athlete: 'F' }),
    res({ event: '60m', grade: null, age_group: 'U18', gender: 'girls', athlete: 'G' })
  ];
  const g = R.groupByEvent(list);
  assert.deepEqual(g.map((x) => x.label), ['60m', 'Shot Put (3kg)', 'Shot Put (4kg)']);
  assert.deepEqual(g[0].results.map((r) => r.athlete), ['E', 'D', 'B', 'A', 'G']);
  assert.deepEqual(R.groupByEvent(null), []);
});

test('club records: same meeting, event, grade, gender and performance', () => {
  const records = { records: [
    { grade: 11, gender: 'girls', event: '60m', performance: '8.10', source: 'https://example.anet.live/meets/80271' },
    { grade: 11, gender: 'girls', event: 'Shot Put 3 kg', performance: '9.50', source: 'https://example.anet.live/meets/80271/events/individual/5' },
    { grade: 12, gender: 'boys', event: '80m Hurdles', performance: '13.2', source: 'https://example.anet.live/meets/80271' },
    { grade: 11, gender: 'boys', event: '60m', performance: '7.90', source: 'https://example.anet.live/meets/111' }
  ] };
  const keys = R.recordKeys(records, 80271);
  assert.equal(R.isClubRecord(res(), keys), true);
  assert.equal(R.isClubRecord(res({ mark: '8.11' }), keys), false);           // a different mark
  assert.equal(R.isClubRecord(res({ gender: 'boys' }), keys), false);          // a different gender
  assert.equal(R.isClubRecord(res({ grade: 12 }), keys), false);               // a different grade
  assert.equal(R.isClubRecord(res({ event: 'Shot Put', implement: '3kg', field: true, mark: '9.50m' }), keys), true);
  assert.equal(R.isClubRecord(res({ event: '80m Hurdle', grade: 12, gender: 'boys', mark: '13.20' }), keys), true);
  // set at another meeting: not this meeting's record
  assert.equal(R.isClubRecord(res({ gender: 'boys', mark: '7.90' }), keys), false);
  assert.equal(R.isClubRecord(res({ gender: 'boys', mark: '7.90' }), R.recordKeys(records, 111)), true);
  // no grade (an adult): never a children's record
  assert.equal(R.isClubRecord(res({ grade: null }), keys), false);
  assert.deepEqual(R.recordKeys(records, null), {});
});

test('suggested highlights: records, then medals, new PBs and first times', () => {
  const keys = R.recordKeys([{ grade: 11, gender: 'girls', event: '60m', performance: '8.10',
    source: 'https://example.anet.live/meets/80271' }], 80271);
  const list = [
    res({ key: 'pb', pb: 'new', prev: '8.40', mark: '8.30' }),
    res({ key: 'none', mark: '8.90' }),
    res({ key: 'bronze', medal: 3, place: 3, mark: '8.50' }),
    res({ key: 'first', pb: 'first', event: '200m', mark: '29.0' }),
    res({ key: 'gold', medal: 1, place: 1, pb: 'new', mark: '8.20' }),
    res({ key: 'record', medal: 1, place: 1, pb: 'new', mark: '8.10' })
  ];
  const s = R.suggest(list, keys);
  assert.deepEqual(s.map((x) => x.key), ['record', 'gold', 'bronze', 'pb', 'first']);
  assert.deepEqual(s[0].reasons, ['record', 'medal', 'pb']);
  assert.deepEqual(s.map((x) => R.chipWords(x.reasons[0], x.result)), ['Club record', '1st', '3rd', 'PB', 'First time']);
  assert.equal(R.cardTone(s[0].reasons), 'yellow');
  assert.equal(R.cardTone(['pb']), 'green');
  assert.deepEqual(R.suggest([], keys), []);
});

test('ticking highlights keeps the order they were picked, up to 12', () => {
  let t = R.toggle([], 'a', true);
  t = R.toggle(t.picked, 'b', true);
  t = R.toggle(t.picked, 'a', false);
  t = R.toggle(t.picked, 'a', true);
  assert.deepEqual(t.picked, ['b', 'a']);
  const twelve = Array.from({ length: 12 }, (_, i) => 'x' + i);
  t = R.toggle(twelve, 'y', true);
  assert.equal(t.picked.length, 12);
  assert.equal(t.full, true);
  assert.equal(t.picked.indexOf('y'), -1);
  assert.equal(R.toggle(twelve, 'x3', false).full, false);
});

test('names check: each athlete once, and who was left out', () => {
  const list = [
    res({ athlete: 'Sam Brown', public_name: 'Sa Brown' }),
    res({ athlete: 'Sara Brown', public_name: 'Sar Brown' }),
    res({ athlete: 'Sam Brown', public_name: 'Sa Brown', event: '200m' }),
    res({ athlete: 'Jo Smith', public_name: 'J Smith' }),
    res({ athlete: 'Alex Allan', public_name: 'A Allan' })
  ];
  const names = R.namesCheck(list, 'initial');
  assert.deepEqual(names.map((x) => x.shown), ['A Allan', 'Sa Brown', 'Sar Brown', 'J Smith']);
  assert.equal(names[1].name, 'Sam Brown');
  assert.equal(names[1].longer, true);
  assert.equal(names[3].longer, false);
  // first names (the default): more than the first name only where two share it
  const firsts = R.namesCheck([
    res({ athlete: 'Sam Brown', public_name: 'Sam B' }),
    res({ athlete: 'Sam Tait', public_name: 'Sam T' }),
    res({ athlete: 'Alex Allan', public_name: 'Alex' })
  ]);
  assert.deepEqual(firsts.map((x) => [x.shown, x.longer]), [['Alex', false], ['Sam B', true], ['Sam T', true]]);
  assert.equal(R.namesCheck([res({ athlete: 'Jo Smith', public_name: 'Jo Smith' })], 'full')[0].longer, false);
  assert.equal(R.nameStyle().id, 'first');
  assert.equal(R.nameStyle('initial').words, 'an initial and surname');
  assert.deepEqual(R.NAME_STYLES.map((x) => x.id), ['first', 'initial', 'full']);
  assert.equal(R.excludedWords(0), '');
  assert.equal(R.excludedWords(1), '1 athlete isn’t shown because their family opted out.');
  assert.equal(R.excludedWords(3), '3 athletes aren’t shown because their families opted out.');
});

test('Results sources: which recap a meeting has, and how one is started', () => {
  const recaps = [
    { id: '1', state: 'public', meeting: { meet: 80271, hand: null, name: 'AC Twilight 1, 2026' } },
    { id: '2', state: 'draft', meeting: { meet: null, hand: 'School Sports 2026', name: 'School Sports 2026' } }
  ];
  const live = { from: 'AthleticLIVE', link: 'https://example.anet.live/meets/80271', name: 'AC Twilight 1, 2026' };
  const hand = { from: 'By hand', link: 'https://example.org/results.pdf', name: 'School Sports 2026' };
  assert.equal(R.recapFor(recaps, live).id, '1');
  assert.equal(R.recapFor(recaps, hand).id, '2');
  assert.equal(R.recapFor(recaps, { from: 'AthleticLIVE', link: 'https://example.anet.live/meets/9', name: 'x' }), null);
  // a recap that was taken down doesn't count
  assert.equal(R.recapFor([{ id: '3', state: 'removed', meeting: { meet: 80271 } }], live), null);
  assert.deepEqual(R.startBody(live), { meet: 80271 });
  assert.deepEqual(R.startBody(hand), { meeting: 'School Sports 2026' });
});

test('headline: tidied, and too long is refused', () => {
  assert.deepEqual(R.checkHeadline('  Twilight   1 ', 'Great night.\r\n\r\nWell done all.  \n'),
    { title: 'Twilight 1', intro: 'Great night.\n\nWell done all.', error: '' });
  assert.equal(R.checkHeadline('', '').error, 'Give the recap a title.');
  assert.match(R.checkHeadline('x'.repeat(101), '').error, /100 characters/);
  assert.match(R.checkHeadline('x', 'y'.repeat(601)).error, /600 characters/);
  assert.deepEqual(R.paragraphs('One\nline two\n\n\nThree'), [['One', 'line two'], ['Three']]);
  assert.deepEqual(R.paragraphs(''), []);
});

test('admin filter', () => {
  const list = [
    { title: 'Twilight 1', state: 'public', meeting: { name: 'AC Twilight 1' }, by: 'coach@example.nz' },
    { title: 'Old one', state: 'public', needs_review: true, meeting: { name: 'Old one' } },
    { title: 'Champs', state: 'removed', meeting: { name: 'Champs' }, by: 'other@example.nz' },
    { title: 'Relays', state: 'removed', meeting: { name: 'Relays' } },
    { title: 'Draft one', state: 'draft', meeting: { name: 'Interclub 2' } }
  ];
  assert.deepEqual(R.adminPick(list, 'live').map((s) => s.title), ['Twilight 1', 'Old one', 'Draft one']);
  assert.deepEqual(R.adminPick(list, 'review').map((s) => s.title), ['Old one']);
  assert.deepEqual(R.adminPick(list, 'gone').map((s) => s.title), ['Champs', 'Relays']);
  assert.deepEqual(R.adminPick(list, 'all', 'OTHER@').map((s) => s.title), ['Champs']);
  assert.deepEqual(R.adminPick(list, 'all', 'interclub').map((s) => s.title), ['Draft one']);
});

test('preview card: 1200 x 630, counts, the track strip in its colour, all on the card', () => {
  const data = { recap: { title: 'Canterbury Children’s Interclub, Programme 4' },
    meeting: { first: '2026-11-07', last: '2026-11-07', location: 'Ngā Puna Wai', city: 'Christchurch, New Zealand',
               track: { name: 'Blue', hex: '#1f5fa8' } },
    counts: { athletes: 23, results: 61, pbs: 1, medals: 9 } };
  const f = R.cardFacts(data);
  assert.equal(f.lane, '#1F5FA8');
  assert.equal(f.course, 'track');
  assert.deepEqual(f.counts.map((c) => c.n + ' ' + c.words), ['23 Athletes', '1 PB', '9 Podiums']);
  const L = R.cardLayout(f);
  assert.equal(L.w * L.scale, 1200);
  assert.equal(L.h * L.scale, 630);
  const texts = L.items.filter((i) => i.kind === 'text').map((i) => i.words);
  assert.ok(texts.includes('MEETING RESULTS'));
  assert.ok(texts.includes('7 November 2026 · Ngā Puna Wai, Christchurch'));
  assert.ok(texts.includes('23') && texts.includes('Athletes'));
  assert.deepEqual(texts.filter((w) => /Canterbury Children|Programme/.test(w)), ['Canterbury Children’s', 'Interclub, Programme 4']);   // a long name: two lines
  assert.ok(L.items.some((i) => i.kind === 'logo'));
  assert.ok(L.items.some((i) => i.kind === 'strip' && i.colour === '#1F5FA8' && i.course === 'track'));
  // everything inside the card, and nothing written over (or laid on) the strip
  const lane = L.items.find((i) => i.kind === 'strip');
  L.items.forEach((i) => {
    if (i.kind === 'text') {
      assert.ok(i.y > i.size * 0.7 && i.y < lane.y, i.words + ' sits on the card above the stripe');
      const left = i.align === 'center' ? i.x - i.max / 2 : i.align === 'right' ? i.x - i.max : i.x;
      assert.ok(left >= 0 && left + i.max <= L.w + 0.01, i.words + ' fits across');
    } else {
      assert.ok(i.x >= 0 && i.y >= 0 && i.x + i.w <= L.w + 0.01 && i.y + i.h <= L.h + 0.01, i.kind + ' fits');
      if (i.kind === 'logo') { assert.ok(i.y + i.h <= lane.y, 'the logo sits above the strip'); }
    }
  });
  // no track colour: the default stripe; a short name: one line
  const g = R.cardFacts({ recap: { title: 'Twilight 1' }, meeting: {}, counts: {} });
  assert.match(g.lane, /^#[0-9A-F]{6}$/);
  assert.deepEqual(g.counts.map((c) => c.n), [0, 0, 0]);
  assert.equal(R.cardLayout(g).items.filter((i) => i.words === 'Twilight 1').length, 1);
  assert.deepEqual(R.wrap('one two three four', 9, 2), ['one two', 'three four']);
  assert.deepEqual(R.wrap('', 9, 2), []);
});
