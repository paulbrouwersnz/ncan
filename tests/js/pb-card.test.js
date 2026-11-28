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
  for (const style of ['podium', 'photo', 'event', 'bib']) {
    for (const shape of ['square', 'story']) {
      const L = PB.layout(full, shape, style, 'blue');
      const line = L.items.find((i) => i.kind === 'text' && i.words.endsWith('Ngā Puna Wai · Christchurch'));   // the bib: after the date
      assert.ok(line, style + ' ' + shape);
      assert.ok(line.y < L.h, style + ' ' + shape);
      assert.deepEqual(PB.overlaps(L), [], style + ' ' + shape);
    }
  }
});

test('the club’s own track colours replace the built-in ones, keeping blue', () => {
  const fresh = require('../../assets/js/pb-card.js');
  fresh.setTracks([{ id: 'red', name: 'Red', hex: '#B4472F' }, { id: 'sky', name: 'Sky', hex: '#4AA3DF' },
                   { id: 'bad', name: 'Bad', hex: 'blue' }]);
  assert.deepEqual(fresh.SURFACES, ['red', 'sky', 'blue']);
  const L = fresh.layout({ name: 'Amy', event: '100m', mark: '13.2' }, 'square', 'event', 'sky');
  assert.equal(L.items.filter((i) => i.kind === 'scene')[0].surface, 'sky');
  fresh.setTracks([]);                                            // nothing sent: kept as it was
  assert.deepEqual(fresh.SURFACES, ['red', 'sky', 'blue']);
});

test('a PB card can leave out "Personal best" at the top', () => {
  const prev = run({ value: 14.42, mark: '14.42' });
  const f = PB.facts({ name: 'Sam', result: run(), prev, pbTitle: false });
  assert.equal(f.headline, '');
  assert.equal(f.better, '−0.32s');                    // the rest of the card is the same
  assert.equal(PB.caption(f), 'Sam: 100m in 14.10 at Interclub 5 👏 #NCANathletics');
  assert.ok(!PB.layout(f, 'square').items.some((i) => i.words === 'PERSONAL BEST' || i.words === 'NEW PERSONAL BEST'));
  // a podium place takes its spot, said once
  const g = PB.facts({ name: 'Sam', result: run({ place: 1 }), prev, pbTitle: false });
  assert.equal(g.headline, '1ST PLACE');
  assert.equal(g.place, '');
  // only PB cards: a season best keeps its headline
  assert.equal(PB.facts({ kind: 'sb', name: 'Sam', result: run(), prev, pbTitle: false }).headline, 'SEASON BEST');
});

test('Then and now: the earlier mark, the gap, both dates', () => {
  const prev = run({ value: 14.42, mark: '14.42' });
  const f = PB.facts({ name: 'Sam', result: run(), prev,
    then: { value: 15.6, mark: '15.60', date: '2025-01-18', label: 'First mark' } });
  assert.deepEqual(f.then, { mark: '15.60', date: '18 Jan 2025', label: 'First mark' });
  assert.equal(f.gap, '−1.50s');
  assert.equal(f.better, '−0.32s');
  for (const shape of ['square', 'story']) {
    const L = PB.layout(f, shape, 'thennow');
    const words = L.items.filter((i) => i.kind === 'text').map((i) => i.words);
    for (const w of ['FIRST MARK', 'NOW', '15.60', '14.10', '18 Jan 2025', '1 Nov 2026', '−1.50s']) { assert.ok(words.includes(w), w + ' on ' + shape); }
    assert.ok(L.items.some((i) => i.kind === 'arrow'));
    assert.deepEqual(PB.overlaps(L), [], shape);
  }
  // no earlier mark: the club-colour card
  assert.equal(PB.layout(PB.facts({ name: 'Sam', result: run(), prev }), 'square', 'thennow').items.some((i) => i.kind === 'arrow'), false);
});

test('Progress line: up is better, this mark last', () => {
  const pts = [{ value: 15.2, date: '2026-10-04', mark: '15.20' }, { value: 14.8, date: '2026-10-18' }, { value: 14.10, date: '2026-11-01' }];
  const f = PB.facts({ name: 'Sam', result: run(), prev: run({ value: 14.8, mark: '14.80' }), progress: { points: pts, span: '2026/27 season' } });
  assert.equal(f.progress.note, 'Up is faster');
  for (const shape of ['square', 'story']) {
    const L = PB.layout(f, shape, 'progress');
    const chart = L.items.find((i) => i.kind === 'chart');
    assert.equal(chart.points.length, 3);
    // faster times are higher up the card; the line runs left to right by date
    assert.ok(chart.points[2].y < chart.points[1].y && chart.points[1].y < chart.points[0].y);
    assert.ok(chart.points[0].x < chart.points[1].x && chart.points[1].x < chart.points[2].x);
    chart.points.forEach((p) => { assert.ok(p.y >= chart.y && p.y <= chart.y + chart.h && p.x >= chart.x && p.x <= chart.x + chart.w); });
    const words = L.items.filter((i) => i.kind === 'text').map((i) => i.words);
    for (const w of ['Up is faster', '2026/27 season', '15.20 · 4 Oct 2026', '1 Nov 2026', '14.10']) { assert.ok(words.includes(w), w + ' on ' + shape); }
    assert.deepEqual(PB.overlaps(L), [], shape);
  }
  // distances: further is higher; a high jump says higher
  const jump = PB.facts({ name: 'Sam', result: run({ field: true, event: 'High Jump', value: 1.5 }),
    progress: { points: [{ value: 1.3, date: '2026-10-04' }, { value: 1.5, date: '2026-11-01' }] } });
  assert.equal(jump.progress.note, 'Up is higher');
  const c = PB.chartPoints([{ value: 1.3, date: '2026-10-04' }, { value: 1.5, date: '2026-11-01' }], true, 0, 100, 0, 100);
  assert.ok(c[1].y < c[0].y);
  // one mark is no line
  assert.equal(PB.facts({ name: 'Sam', result: run(), progress: { points: [pts[2]] } }).progress, null);
});

test('the Progress line leaves out empty months quietly, as the progress chart does', () => {
  // March and October, with nothing in April to September (winter): those months are left out
  const pts = [{ value: 15, date: '2026-03-01' }, { value: 14.8, date: '2026-03-31' }, { value: 14.5, date: '2026-10-01' }];
  const winter = [4, 5, 6, 7, 8, 9];
  const plain = PB.chartPoints(pts, false, 0, 100, 0, 100);
  const quiet = PB.chartPoints(pts, false, 0, 100, 0, 100, winter);
  assert.ok(plain[1].x < 20, 'the empty months take most of the axis');
  assert.ok(quiet[1].x > 90, 'with them left out, 31 March sits next to 1 October');
  assert.deepEqual([quiet[0].x, quiet[2].x], [0, 100]);
  // carried from the facts; all twelve hidden (nonsense) hides none
  const r = { event: '100m', field: false, value: 14.5, date: '2026-10-01', mark: '14.50' };
  assert.deepEqual(PB.facts({ name: 'Sam', result: r, progress: { points: pts, hide: winter } }).progress.hide, winter);
  assert.deepEqual(PB.facts({ name: 'Sam', result: r, progress: { points: pts, hide: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } }).progress.hide, []);
});

test('race bib: the mark on a bib pinned to the club singlet, the crest and ncan.nz kept', () => {
  const f = PB.facts({ name: 'Sam Brown', surname: true, result: run({ place: 1, wind: 1.8 }),
    prev: run({ value: 14.42, mark: '14.42' }), group: 'U16 women', pbsThisSeason: 3, kind: 'newpb', showPlace: true,
    where: { location: 'Ngā Puna Wai', city: 'Christchurch, New Zealand' } });
  for (const shape of ['square', 'story']) {
    const L = PB.layout(f, shape, 'bib');
    const words = L.items.filter((i) => i.kind === 'text').map((i) => i.words);
    assert.ok(L.items.some((i) => i.kind === 'singlet') && L.items.some((i) => i.kind === 'pins'), shape);
    assert.ok(L.items.some((i) => i.kind === 'logo') && words.includes('ncan.nz'), shape);
    for (const w of ['14.10', '100m', 'PB −0.32s', 'Interclub 5', 'Previous best 14.42 · +1.8 m/s', '3rd PB this season']) {
      assert.ok(words.includes(w), shape + ': ' + w);
    }
    assert.ok(L.items.some((i) => i.kind === 'medal'), shape);
    assert.deepEqual(PB.overlaps(L), [], shape);
    L.items.filter((i) => i.kind === 'text').forEach((i) => assert.ok(i.y > 0 && i.y < L.h, shape + ' ' + i.words));
  }
  // a plain result: no ribbon, still a bib
  const r = PB.layout(PB.facts({ kind: 'result', name: 'Sam', result: run() }), 'square', 'bib');
  assert.ok(!r.items.some((i) => i.kind === 'text' && /^PB /.test(i.words)));
  assert.ok(PB.STYLES.includes('bib'));
});

test('out of the stadium: race win, pace on the bib, last year beaten, km this season', () => {
  const xc = (o) => Object.assign({ event: 'Cross country 3000m', mark: '11:30', value: 690, date: '2026-07-04', season: '2026',
    meeting: 'Canterbury XC Champs 2026' }, o);
  const history = [
    xc({ date: '2025-07-05', season: '2025', mark: '12:00', value: 720, meeting: 'Canterbury XC Champs 2025' }),
    xc({ date: '2026-05-09', event: 'Cross country 4000m', mark: '16:00', value: 960, meeting: 'Bottle Lake Hill Assault' }),
    xc({ place: 1, of: 40 })];
  const r = history[2];
  assert.deepEqual(PB.lastYear(r, history), { by: 'time', faster: 30, mark: '12:00' });
  // moved up a distance: a faster pace counts
  const up = xc({ event: 'Cross country 4000m', value: 920, mark: '15:20' });
  assert.deepEqual(PB.lastYear(up, [history[0], up]), { by: 'pace', pace: 230, was: 240 });
  assert.equal(PB.lastYear(xc({ event: 'Cross country 4000m', value: 1000 }), [history[0]]), null);   // a slower pace: nothing
  assert.equal(PB.lastYear(xc({ value: 730 }), history), null);                 // slower: nothing
  assert.equal(PB.kmThisSeason(r, history), 7);
  const f = PB.facts({ kind: 'result', name: 'Sam', result: r, out: true, pace: 230, lastYear: PB.lastYear(r, history), km: 7 });
  assert.equal(f.headline, 'RACE WIN');
  assert.equal(f.pace, '3:50 /km');
  assert.equal(f.season, '30s faster than last year (12:00)');
  assert.equal(f.km, '7 km raced this season');
  // a top 10 finish is said only with Show place
  const eighth = xc({ place: 8, of: 64 });
  assert.equal(PB.facts({ kind: 'result', name: 'Sam', result: eighth, out: true }).headline, 'RESULT');
  assert.equal(PB.facts({ kind: 'result', name: 'Sam', result: eighth, out: true, showPlace: true }).headline, 'TOP 10 FINISH');
  for (const shape of ['square', 'story']) {
    const L = PB.layout(f, shape, 'bib');
    const words = L.items.filter((i) => i.kind === 'text').map((i) => i.words);
    assert.ok(words.includes('3:50 /km') && !words.some((w) => /^PB /.test(w)), shape);
    assert.ok(words.includes('7 km raced this season'), shape);
    assert.deepEqual(PB.overlaps(L), [], shape);
  }
});
