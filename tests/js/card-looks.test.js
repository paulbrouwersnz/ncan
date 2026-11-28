const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../assets/js/card-looks.js');

const at = (s) => new Date(s + 'T00:00:00Z');
const theme = (name, first, type) => L.suggestTheme({ name, first, type }).theme;

test('Easter and Show Day fall where they should', () => {
  assert.equal(L.easter(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(L.easter(2027).toISOString().slice(0, 10), '2027-03-28');
  assert.equal(L.showDay(2026).toISOString().slice(0, 10), '2026-11-13');
  assert.equal(L.showDay(2027).toISOString().slice(0, 10), '2027-11-12');
});

test('a date suggests the holiday it falls on', () => {
  assert.equal(L.occasion(at('2027-01-02')), 'new-year');
  assert.equal(L.occasion(at('2027-02-06')), 'waitangi');
  assert.equal(L.occasion(at('2026-04-04')), 'easter');             // Easter Saturday
  assert.equal(L.occasion(at('2026-04-25')), 'anzac');
  assert.equal(L.occasion(at('2026-05-30')), 'kings-birthday');     // the Saturday before the first Monday in June
  assert.equal(L.occasion(at('2026-07-04')), 'matariki');           // within a fortnight of 10 July 2026
  assert.equal(L.occasion(at('2026-08-01')), null);
  assert.equal(L.occasion(at('2026-10-31')), 'halloween');
  assert.equal(L.occasion(at('2026-11-05')), 'guy-fawkes');
  assert.equal(L.occasion(at('2026-11-12')), 'canterbury-anniversary');
  assert.equal(L.occasion(at('2026-11-15')), 'canterbury-anniversary');
  assert.equal(L.occasion(at('2026-11-16')), null);
  assert.equal(L.occasion(at('2026-12-19')), 'christmas');
  assert.equal(L.occasion(at('2026-12-27')), null);
});

test('meetings get the theme that suits them', () => {
  assert.equal(theme('AC Christmas Cracker Meet', '2025-12-29', 'Twilight'), 'christmas');
  assert.equal(theme('South Island Colgate Games', '2027-01-15', 'Colgate Games'), 'colgate');
  assert.equal(theme('AC Senior Interclub, Opening Day', '2026-10-17', 'Interclub'), 'season-opener');
  assert.equal(theme('NCAN Club Championships', '2027-03-20', 'Championships'), 'club-champs');
  assert.equal(theme('International Track Meet', '2027-02-21', 'Championships'), 'international');
  assert.equal(theme('NZ Track and Field Championships', '2027-03-11', 'Championships'), 'national');
  assert.equal(theme('South Island Secondary Schools Championships', '2026-03-14', 'School'), 'south-island');
  assert.equal(theme('Canterbury Children\'s Championships', '2027-03-06', 'Championships'), 'childrens');
  assert.equal(theme('AC Senior Championships', '2026-03-07', 'Championships'), 'champs');
  assert.equal(theme('Canterbury Children\'s Quadrathon', '2026-02-20', 'Quadrathon'), 'combined');
  assert.equal(theme('Athletics Otago Interclub & Masters Throws Pentathlon', '2026-03-01', 'Masters'), 'throws');
  assert.equal(theme('Kennett Cup Steeples', '2026-08-15', ''), 'steeplechase');
  assert.equal(theme('Canterbury Children\'s Relays and Steeplechase', '2026-02-27', 'Relays'), 'relays');
  assert.equal(theme('NZ Cross Country Championships', '2026-08-01', 'Cross country'), 'national');
  assert.equal(theme('Bottle Lake Hill Assault', '2026-05-09', 'Cross country'), 'cross-country');
  assert.equal(theme('AC Twilight Meet 3', '2026-11-19', 'Twilight'), 'twilight');
  assert.equal(theme('NZ Masters Games, Dunedin 2026', '2026-02-07', 'Masters'), 'waitangi');   // the holiday wins
  assert.equal(theme('NZ Masters Games, Dunedin 2026', '2026-02-12', 'Masters'), 'masters');
  assert.equal(theme('AC Senior Interclub 3', '2026-10-24', 'Interclub'), 'spring');
  assert.equal(theme('Canterbury Children\'s Interclub', '2027-02-20', 'Interclub'), 'childrens');
  assert.equal(theme('Something', null, ''), 'club');
  assert.ok(L.suggestTheme({ name: 'AC Twilight Meet 3', first: '2026-11-19', type: 'Twilight' }).why.includes('Twilight'));
});

test('the suggestion picks a layout, font and count to go with the theme', () => {
  const s = L.suggest({ name: 'AC Twilight Meet 3', first: '2026-11-19', type: 'Twilight' }, { athletes: 9, pbs: 0, medals: 2 });
  assert.equal(s.layout, 'scoreboard');
  assert.equal(s.font, 'dots');
  assert.equal(s.feature, 'podiums');
  assert.equal(L.suggest({}, { athletes: 3 }).feature, 'athletes');
  assert.equal(L.suggest({}, { pbs: 4 }).layout, 'classic');
});

test('a saved look goes over the suggestion; unknown parts are the suggestion', () => {
  const m = { name: 'AC Twilight Meet 3', first: '2026-11-19', type: 'Twilight' };
  const r = L.resolve({ theme: 'anzac', layout: 'nope', accent: '#ABCDEF', headline: 'x'.repeat(40), photo: 'https://example.com/a.jpg' }, m, {});
  assert.equal(r.theme, 'anzac');
  assert.equal(r.layout, 'scoreboard');
  assert.equal(r.accent, '#abcdef');
  assert.equal(r.headline.length, L.HEADLINE_MAX);
  assert.equal(r.photo, '');
  assert.equal(r.suggested.theme, 'twilight');
  // saved: only what differs from the suggestion
  assert.deepEqual(L.toSave(Object.assign({}, r, { headline: '  Big  night ' }), m, {}),
                   { theme: 'anzac', accent: '#abcdef', headline: 'Big night' });
  assert.deepEqual(L.toSave(L.resolve({}, m, {}), m, {}), {});
});

test('accent colours that won\'t read are caught', () => {
  assert.ok(L.accentReads('#FFC629', '#0B3B2E'));
  assert.ok(!L.accentReads('#123F30', '#0B3B2E'));
  assert.equal(L.onColour('#FFD84D'), '#141414');
  assert.equal(L.onColour('#0B3B2E'), '#FFFFFF');
});

test('every theme in every layout keeps the crest, the title and ncan.nz', () => {
  const facts = { title: 'Canterbury Cross Country Championships', line: 'Saturday 4 July 2026 · Halswell Quarry', lane: '#62A84C',
                  course: 'cross-country', counts: [{ n: 24, words: 'Athletes' }, { n: 15, words: 'PBs' }, { n: 11, words: 'Podiums' }] };
  const ids = new Set();
  L.THEMES.forEach((t) => {
    assert.ok(!ids.has(t.id), t.id);
    ids.add(t.id);
    assert.ok(L.GROUPS.includes(t.group), t.id);
    L.LAYOUTS.forEach((ly) => {
      L.STICKERS.slice(0, 3).forEach((st) => {
        const card = L.build(facts, L.resolve({ theme: t.id, layout: ly.id, sticker: st.id, pattern: 'confetti', font: 'condensed' }, {}, {}));
        const words = card.items.filter((i) => i.kind === 'text').map((i) => i.words).join(' | ');
        assert.ok(card.items.some((i) => i.kind === 'logo'), t.id + ' ' + ly.id);
        assert.ok(/ncan\.nz/.test(words), t.id + ' ' + ly.id);
        assert.ok(/Canterbury|CANTERBURY/.test(words), t.id + ' ' + ly.id);
        card.items.filter((i) => i.kind === 'text').forEach((i) => {
          assert.ok(i.colour, t.id + ' ' + ly.id + ' ' + i.words);
          assert.ok(i.x >= 0 && i.x <= 600 && i.y > 0 && i.y <= 315, t.id + ' ' + ly.id + ' ' + i.words + ' at ' + i.x + ',' + i.y);
        });
      });
    });
  });
  assert.ok(L.THEMES.length >= 40);
});

test('a photo goes under the theme\'s colour; the scoreboard has its own background', () => {
  const look = L.resolve({ theme: 'summer', photo: 'https://photos.ncan.nz/gallery/2024/a.jpg', focus: 30 }, {}, {});
  const items = L.build({ title: 'A', counts: [] }, look).items;
  const kinds = items.map((i) => i.kind);
  assert.ok(kinds.indexOf('photo') < kinds.indexOf('shade'));
  assert.deepEqual(items.find((i) => i.kind === 'photo'), { kind: 'photo', url: 'https://photos.ncan.nz/gallery/2024/a.jpg', x: 50, y: 30, zoom: 1 });
  // an uploaded photo, moved and zoomed
  const up = L.build({ title: 'A', counts: [] }, Object.assign(L.resolve({}, {}, {}), { photo: 'blob:x', focusX: 20, focus: 70, zoom: 1.8 }));
  assert.deepEqual(up.items.find((i) => i.kind === 'photo'), { kind: 'photo', url: 'blob:x', x: 20, y: 70, zoom: 1.8 });
  const board = L.build({ title: 'A', counts: [] }, L.resolve({ layout: 'scoreboard', photo: 'https://photos.ncan.nz/a.jpg' }, {}, {}));
  assert.ok(!board.items.some((i) => i.kind === 'photo'));
});
