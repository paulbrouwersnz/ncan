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

test('Photo card zoom and dragging the photo', () => {
  // zoomed 2x: half the slice, still placed by the focus point; zoom kept within 1 to 4
  const z2 = PB.cover(2000, 1000, 540, 540, '50% 50%', 2);
  assert.deepEqual([z2.sw, z2.sh, z2.sx, z2.sy].map(Math.round), [500, 500, 750, 250]);
  assert.equal(Math.round(PB.cover(2000, 1000, 540, 540, '50% 50%', 0.2).sw), 1000);
  assert.equal(Math.round(PB.cover(2000, 1000, 540, 540, '50% 50%', 9).sw), 250);
  assert.deepEqual(PB.parseFocus('30% 140%'), { x: 30, y: 100 });
  assert.deepEqual(PB.parseFocus(null), { x: 50, y: 50 });
  // dragging right shows more of the left: the focus moves left, by the right amount
  const start = { x: 50, y: 50, zoom: 1 };
  const right = PB.move(start, 54, 0, 2000, 1000, 540, 540);   // 54 card px = 100 photo px of 1000 spare
  assert.ok(Math.abs(right.x - 40) < 1e-9);
  assert.equal(right.y, 50);   // no spare height at zoom 1: up and down do nothing
  assert.equal(PB.move(start, 0, 300, 2000, 1000, 540, 540).y, 50);
  // it stops at the photo's edge
  assert.equal(PB.move(start, 5000, 0, 2000, 1000, 540, 540).x, 0);
  assert.equal(PB.move(start, -5000, 0, 2000, 1000, 540, 540).x, 100);
  // zoomed in, it can move up and down too
  assert.ok(PB.move({ x: 50, y: 50, zoom: 2 }, 0, -54, 2000, 1000, 540, 540).y > 50);
});

test('Event card: each event gets its scene', () => {
  const want = {
    '100m': 'sprint', '60m': 'sprint', '200m': 'sprint', '4x100m Relay': 'sprint', '400m': 'oval', '1500m': 'oval',
    '10,000m': 'oval', '1 Mile': 'oval', '1500m Race Walk': 'oval', '100m Hurdles (76cm)': 'hurdles',
    '2000m Steeplechase': 'steeple', 'Long Jump': 'long', 'Triple jump': 'triple', 'High Jump': 'high',
    'Pole vault': 'pole', 'Shot Put (3kg)': 'shot', 'Discus (750g)': 'discus', 'Hammer (4kg)': 'hammer',
    'Javelin (500g)': 'javelin', 'Vortex': 'javelin', 'Cross country 3 km': 'xc', 'Cross country relay 2 km': 'xc',
    'Road 5 km': 'road', 'Road relay': 'road', 'Road 10 km Walk': 'walk', '10km Race Walk': 'walk', '10,000m Race Walk': 'oval', '3000m Walk': 'oval', 'Trail run 8 km': 'trail', 'Mountain run': 'trail', '': 'oval'
  };
  for (const [event, scene] of Object.entries(want)) { assert.equal(PB.sceneFor(event), scene, event); }
  assert.ok(PB.sceneHasTrack('sprint') && PB.sceneHasTrack('javelin') && PB.sceneHasTrack('oval'));
  assert.ok(!PB.sceneHasTrack('xc') && !PB.sceneHasTrack('road') && !PB.sceneHasTrack('walk') && !PB.sceneHasTrack('shot'));
  assert.deepEqual(PB.SURFACES, ['blue', 'red', 'grass']);
});

test('Event card: the scene fills the card under the washes, nothing overlapping', () => {
  const full = PB.facts({ name: 'Sam Brown', surname: true, result: run({ place: 1, wind: 1.8 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'U16 women', pbsThisSeason: 3, event: '100m Hurdles (76cm)' });
  for (const shape of ['square', 'story']) {
    const L = PB.layout(full, shape, 'event', 'red');
    const scene = L.items.find((i) => i.kind === 'scene');
    assert.deepEqual([scene.x, scene.y, scene.w, scene.h], [0, 0, L.w, L.h]);
    assert.equal(scene.scene, 'hurdles');
    assert.equal(scene.surface, 'red');
    assert.equal(L.scene, 'hurdles');
    assert.ok(!L.items.some((i) => i.kind === 'photo'));
    const order = L.items.map((i) => i.kind);
    assert.ok(order.indexOf('scene') < order.lastIndexOf('shade') && order.lastIndexOf('shade') < order.indexOf('text'));
    assert.deepEqual(PB.overlaps(L), [], shape);
  }
  // an unknown track colour is the blue track
  assert.equal(PB.layout(full, 'square', 'event', 'pink').items.find((i) => i.kind === 'scene').surface, 'blue');
});

test('Show place puts any place on a medal: gold, silver, bronze, then copper', () => {
  assert.deepEqual(PB.medalFor(1), { words: '1st', metal: 'gold' });
  assert.deepEqual(PB.medalFor(2), { words: '2nd', metal: 'silver' });
  assert.deepEqual(PB.medalFor(3), { words: '3rd', metal: 'bronze' });
  assert.deepEqual(PB.medalFor(4), { words: '4th', metal: 'copper' });
  assert.deepEqual(PB.medalFor(12), { words: '12th', metal: 'copper' });
  assert.equal(PB.medalFor(0), null);
  const r = { event: '800m', mark: '2:10.00', date: '2026-11-21', meeting: 'Interclub 5', place: 5 };
  // off: no medal, and 5th isn't in the words
  let f = PB.facts({ kind: 'result', name: 'Sam Brown', result: r });
  assert.equal(f.medal, null);
  assert.equal(f.headline, 'RESULT');
  // on: the medal says it, and the caption too
  f = PB.facts({ kind: 'result', name: 'Sam Brown', result: r, showPlace: true });
  assert.deepEqual(f.medal, { words: '5th', metal: 'copper' });
  assert.match(PB.caption(f), /^5th place for Sam!/);
  // a podium place on the medal isn't said again in the headline or the lines
  f = PB.facts({ kind: 'result', name: 'Sam Brown', result: Object.assign({}, r, { place: 1 }), showPlace: true });
  assert.equal(f.headline, 'RESULT');
  assert.equal(f.place, '');
  const L = PB.layout(f, 'square', 'podium');
  const m = L.items.find(i => i.kind === 'medal');
  assert.equal(m.metal, 'gold');
  assert.ok(m.cx + m.r <= L.w - 30);
  // a relay's place is the team's, and goes on the medal too
  f = PB.facts({ kind: 'result', name: 'Sam', result: Object.assign({}, r, { place: 2, relay: { team_mark: '50.1' } }), showPlace: true });
  assert.deepEqual(f.medal, { words: '2nd', metal: 'silver' });
  // and without Show place, no medal
  f = PB.facts({ kind: 'result', name: 'Sam', result: Object.assign({}, r, { place: 2 }) });
  assert.equal(f.medal, null);
});

test('where the meeting was: under the meeting and date, New Zealand left off', () => {
  assert.equal(PB.whereWords({ location: 'Ngā Puna Wai', city: 'Christchurch, New Zealand' }), 'Ngā Puna Wai · Christchurch');
  assert.equal(PB.whereWords({ location: 'Olympic Park', city: 'Sydney, Australia' }), 'Olympic Park · Sydney, Australia');
  assert.equal(PB.whereWords({ city: '  Timaru,  new zealand ' }), 'Timaru');
  assert.equal(PB.whereWords({ location: 'Foster Park' }), 'Foster Park');
  assert.equal(PB.whereWords(null), '');
  assert.equal(PB.facts({ name: 'Sam', result: run() }).where, '');
  // every style and shape: the line is there and nothing overlaps, with every other line too
  const full = PB.facts({ name: 'Sam Brown', surname: true, result: run({ place: 1, wind: 1.8 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'U16 women', pbsThisSeason: 3, kind: 'newpb',
    where: { location: 'Ngā Puna Wai', city: 'Christchurch, New Zealand' } });
  for (const style of ['podium', 'photo', 'event']) {
    for (const shape of ['square', 'story']) {
      const L = PB.layout(full, shape, style, 'blue');
      const line = L.items.find((i) => i.kind === 'text' && i.words === 'Ngā Puna Wai · Christchurch');
      assert.ok(line, style + ' ' + shape);
      assert.ok(line.y < L.h, style + ' ' + shape);
      assert.deepEqual(PB.overlaps(L), [], style + ' ' + shape);
    }
  }
});
