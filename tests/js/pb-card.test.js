// PB share cards (assets/js/pb-card.js): the words and layout, without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../../assets/js/pb-card.js');

const run = (o) => Object.assign({ event: '100m', mark: '14.10', value: 14.10, date: '2026-11-01',
  meeting: 'Interclub 5', season: '2026/27' }, o);

test('improvement: times shorter, distances longer', () => {
  assert.equal(PB.improvement(run(), run({ value: 14.42 })), '−0.32s');
  assert.equal(PB.improvement(run({ value: 150.2 }), run({ value: 162.9 })), '−12.7s');
  assert.equal(PB.improvement(run({ field: true, value: 4.56 }), run({ field: true, value: 4.38 })), '+18cm');
  assert.equal(PB.improvement(run({ field: true, value: 31.2 }), run({ field: true, value: 30.15 })), '+1.05m');
  // no earlier PB, or not actually better: nothing said
  assert.equal(PB.improvement(run(), null), '');
  assert.equal(PB.improvement(run(), run({ value: 14.0 })), '');
});

test('place only for the podium; names; season count', () => {
  assert.equal(PB.placeWord(1), '1st');
  assert.equal(PB.placeWord(3), '3rd');
  assert.equal(PB.placeWord(6), '');
  assert.equal(PB.placeWord(undefined), '');
  assert.equal(PB.cardName('Sam Brown', false), 'Sam');
  assert.equal(PB.cardName('Sam Brown', true), 'Sam Brown');
  assert.equal(PB.surnameByDefault(run({ grade: 10 })), false);   // children: first name only
  assert.equal(PB.surnameByDefault(run({ age_group: 'U18' })), true);
  assert.equal(PB.seasonWords(1), '');
  assert.equal(PB.seasonWords(3), '3rd PB this season');
});

test('facts: what the card says', () => {
  const f = PB.facts({ name: 'Sam Brown', surname: false, result: run({ place: 2, wind: 1.2 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'Grade 12', pbsThisSeason: 2 });
  assert.equal(f.headline, 'NEW PERSONAL BEST');
  assert.equal(f.name, 'Sam');
  assert.equal(f.better, '−0.32s');
  assert.equal(f.was, '14.42');
  assert.equal(f.place, '2nd');
  assert.equal(f.wind, '+1.2 m/s');
  assert.equal(f.date, '1 Nov 2026');
  assert.equal(f.season, '2nd PB this season');
  // a relay's place isn't the athlete's own; a first mark is a PB but not a new one
  const g = PB.facts({ name: 'Sam', result: run({ place: 1, relay: {} }) });
  assert.equal(g.place, '');
  assert.equal(g.headline, 'PERSONAL BEST');
  assert.equal(g.better, '');
});

test('caption and file name', () => {
  const f = PB.facts({ name: 'Sam Brown', result: run() });
  assert.equal(PB.caption(f), 'New PB for Sam! 100m in 14.10 at Interclub 5 👏 #NCANathletics');
  assert.equal(PB.fileName(PB.facts({ name: 'Zoë Ngata', surname: true, result: run({ event: 'Shot Put' }), event: 'Shot Put (3kg)' })),
    'zoe-ngata-shot-put-3kg-pb.png');
});

test('headline fits the result: season best, podium place or just the result', () => {
  const prev = run({ value: 14.42, mark: '14.42' });
  const sb = PB.facts({ kind: 'sb', name: 'Sam', result: run({ place: 2 }), prev, pbsThisSeason: 2 });
  assert.equal(sb.headline, 'SEASON BEST');
  assert.equal(sb.better, '');          // no ribbon or "was" line: it isn't a PB
  assert.equal(sb.was, '');
  assert.equal(sb.season, '');
  assert.equal(sb.place, '2nd');
  assert.equal(PB.caption(sb), 'Season best for Sam! 100m in 14.10 at Interclub 5 👏 #NCANathletics');
  assert.equal(PB.fileName(sb), 'sam-100m-season-best.png');
  const podium = PB.facts({ kind: 'result', name: 'Sam', result: run({ place: 1 }) });
  assert.equal(podium.headline, '1ST PLACE');
  assert.equal(podium.place, '');        // said once, in the headline
  assert.equal(PB.caption(podium), '1st place for Sam! 100m in 14.10 at Interclub 5 👏 #NCANathletics');
  const plain = PB.facts({ kind: 'result', name: 'Sam', result: run({ place: 6 }) });
  assert.equal(plain.headline, 'RESULT');
  assert.equal(PB.caption(plain), 'Sam: 100m in 14.10 at Interclub 5 👏 #NCANathletics');
  assert.equal(PB.fileName(plain), 'sam-100m-result.png');
  // a relay place is the team's, so a relay result is just a result
  assert.equal(PB.facts({ kind: 'result', name: 'Sam', result: run({ place: 1, relay: {} }) }).headline, 'RESULT');
  // asked for a new PB with nothing before it: a PB
  assert.equal(PB.facts({ kind: 'newpb', name: 'Sam', result: run() }).headline, 'PERSONAL BEST');
});

test('layout: square and story sizes, mark in gold, nothing overlapping', () => {
  const full = PB.facts({ name: 'Sam Brown', surname: true, result: run({ place: 1, wind: 1.8 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'U16 women', pbsThisSeason: 3, event: '100m Hurdles (76cm)' });
  for (const shape of ['square', 'story']) {
    const L = PB.layout(full, shape);
    assert.deepEqual([L.w, L.h], shape === 'square' ? [540, 540] : [540, 960]);
    const mark = L.items.find((i) => i.kind === 'text' && i.words === '14.10');
    assert.equal(mark.colour, PB.COLOURS.gold);
    assert.ok(L.items.some((i) => i.kind === 'text' && i.words === 'PB −0.32s'));
    assert.ok(L.items.some((i) => i.kind === 'logo'));
    // every word inside the card
    L.items.filter((i) => i.kind === 'text').forEach((i) => {
      assert.ok(i.y > 0 && i.y < L.h, i.words);
      assert.ok(i.x >= 0 && i.x <= L.w, i.words);
    });
    assert.deepEqual(PB.overlaps(L), [], shape);
  }
  // no improvement: no ribbon
  const first = PB.layout(PB.facts({ name: 'Sam', result: run() }), 'square');
  assert.ok(!first.items.some((i) => i.kind === 'text' && /^PB /.test(i.words)));
});

test('Photo card: the photo fills the card, washes for the words, nothing overlapping', () => {
  const full = PB.facts({ name: 'Sam Brown', surname: true, result: run({ place: 1, wind: 1.8 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'U16 women', pbsThisSeason: 3, event: '100m Hurdles (76cm)' });
  for (const shape of ['square', 'story']) {
    const L = PB.layout(full, shape, 'photo');
    const photo = L.items.find((i) => i.kind === 'photo');
    assert.deepEqual([photo.x, photo.y, photo.w, photo.h], [0, 0, L.w, L.h]);
    assert.equal(L.items.filter((i) => i.kind === 'shade').length, 2);
    // the photo is drawn first (over the plain background), the words after the washes
    const order = L.items.map((i) => i.kind);
    assert.ok(order.indexOf('photo') < order.lastIndexOf('shade') && order.lastIndexOf('shade') < order.indexOf('text'));
    assert.equal(L.items.find((i) => i.words === '14.10').colour, PB.COLOURS.gold);
    assert.ok(L.items.some((i) => i.words === 'PB −0.32s'));
    assert.ok(L.items.some((i) => i.kind === 'logo'));
    L.items.filter((i) => i.kind === 'text').forEach((i) => {
      assert.ok(i.y > 0 && i.y < L.h, i.words);
      assert.ok(i.shadow, i.words);
    });
    assert.deepEqual(PB.overlaps(L), [], shape);
    // the words stay clear of the crest at the bottom
    const logo = L.items.find((i) => i.kind === 'logo');
    L.items.filter((i) => i.kind === 'text' && i.words !== 'ncan.nz').forEach((i) => assert.ok(i.y < logo.y - 4, shape + ': ' + i.words));
  }
  // without a style, still the club colours card
  assert.ok(!PB.layout(full, 'square').items.some((i) => i.kind === 'photo'));
});

test('Photo card crop keeps the focus point in view', () => {
  // a 2000x1000 landscape photo into a square: the full height, a slice of the width
  const mid = PB.cover(2000, 1000, 540, 540, '50% 50%');
  assert.deepEqual([mid.sw, mid.sh, mid.sx, mid.sy].map(Math.round), [1000, 1000, 500, 0]);
  assert.equal(PB.cover(2000, 1000, 540, 540, '0% 50%').sx, 0);
  assert.equal(Math.round(PB.cover(2000, 1000, 540, 540, '100% 50%').sx), 1000);
  // no focus: the middle; a tall card from a landscape photo takes a narrower slice
  assert.equal(Math.round(PB.cover(2000, 1000, 540, 540).sx), 500);
  const tall = PB.cover(2000, 1000, 540, 960, '25% 0%');
  assert.equal(Math.round(tall.sh), 1000);
  assert.ok(Math.abs(tall.sw - 562.5) < 0.01);
  assert.ok(Math.abs(tall.sx - (2000 - 562.5) * 0.25) < 0.01);
});
