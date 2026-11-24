// Tests for assets/js/chart-image.js: the enlarged chart saved as an image.
// Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../assets/js/chart-image.js');

test('the file is named after the athlete and the event', () => {
  assert.equal(I.fileName('Sam Brown', '60m'), 'sam-brown-60m.png');
  assert.equal(I.fileName('Aroha Te Whāiti', 'Shot put (3kg)'), 'aroha-te-whaiti-shot-put-3kg.png');
  assert.equal(I.fileName('Sam Brown', '100m Hurdles - 76.2cm'), 'sam-brown-100m-hurdles-76-2cm.png');
  assert.equal(I.fileName('', ''), 'chart.png');
  assert.equal(I.fileName('  ', '!!'), 'chart.png');
});

test('the dates line shows one date or a range, earliest first', () => {
  assert.equal(I.day('2026-03-09'), '9 Mar 2026');
  assert.equal(I.dateRange('2024-10-12', '2026-03-09'), '12 Oct 2024 – 9 Mar 2026');
  assert.equal(I.dateRange('2026-03-09', '2024-10-12'), '12 Oct 2024 – 9 Mar 2026');
  assert.equal(I.dateRange('2026-03-09', '2026-03-09'), '9 Mar 2026');
  assert.equal(I.dateRange('2026-03-09'), '9 Mar 2026');
  assert.equal(I.dateRange(''), '');
});

test('a shared image shows the full name, or the first name only', () => {
  assert.equal(I.shownName('Sam Brown', 'full'), 'Sam Brown');
  assert.equal(I.shownName('  Aroha   Te Whāiti ', 'full'), 'Aroha Te Whāiti');
  assert.equal(I.shownName('Aroha Te Whāiti', 'first'), 'Aroha');
  assert.equal(I.shownName('Sam', 'first'), 'Sam');
  assert.equal(I.shownName('', 'full'), '');
});

test('a share is sent with its details, and the consent tick', () => {
  assert.equal(I.shareQuery({ event: '100m Hurdles - 76.2cm', from: '2024-10-05', to: '2026-11-21', view: 'by-season', name: 'first' }),
    'event=100m%20Hurdles%20-%2076.2cm&from=2024-10-05&to=2026-11-21&view=by-season&name=first&confirm=1');
  assert.equal(I.shareQuery({ event: '100m', from: '2026-11-21', to: '2026-11-21', view: 'pb-card', name: 'first', kind: 'result' }),
    'event=100m&from=2026-11-21&to=2026-11-21&view=pb-card&name=first&kind=result&confirm=1');
  assert.equal(I.shareQuery({ event: '100m', from: '2026-11-21', to: '2026-11-21', view: 'pb-card', name: 'first', kind: 'pb',
                              source: 'https://x.anet.live/meets/1/events/individual/2' }),
    'event=100m&from=2026-11-21&to=2026-11-21&view=pb-card&name=first&kind=pb' +
    '&source=https%3A%2F%2Fx.anet.live%2Fmeets%2F1%2Fevents%2Findividual%2F2&confirm=1');
  assert.equal(I.SHARE_MAX, 8 * 1024 * 1024);
});

test('an image too big to share says its size in MB', () => {
  assert.equal(I.mb(I.SHARE_MAX), '8 MB');
  assert.equal(I.mb(5.2 * 1048576), '5.2 MB');
  assert.equal(I.mb(I.SHARE_MAX + 1), '8.1 MB');   // just over: never shown as the limit itself
});

test('the subtitle names the range picked, but not All results', () => {
  assert.equal(I.subtitle('60m', 'All results', '2024-10-12', '2026-03-09'), '60m · 12 Oct 2024 – 9 Mar 2026');
  assert.equal(I.subtitle('60m', 'This season', '2026-10-12', '2026-11-20'), '60m · This season · 12 Oct 2026 – 20 Nov 2026');
  assert.equal(I.subtitle('60m', '', '', ''), '60m');
});

test('key entries wrap into rows no wider than the image', () => {
  assert.deepEqual(I.keyRows([100, 100, 100], 400, 20), [[{ i: 0, x: 0 }, { i: 1, x: 120 }, { i: 2, x: 240 }]]);
  assert.deepEqual(I.keyRows([100, 100, 100], 300, 20), [[{ i: 0, x: 0 }, { i: 1, x: 120 }], [{ i: 2, x: 0 }]]);
  // an entry wider than the row still gets a row of its own
  assert.deepEqual(I.keyRows([500, 50], 300, 20), [[{ i: 0, x: 0 }], [{ i: 1, x: 0 }]]);
  assert.deepEqual(I.keyRows([], 300), []);
});

test('a swatch ring is read from its CSS shadow', () => {
  assert.deepEqual(I.shadow('rgb(159, 216, 184) 0px 0px 0px 3px'), { colour: 'rgb(159, 216, 184)', spread: 3 });
  assert.deepEqual(I.shadow('0px 0px 0px 2px rgb(20, 38, 31)'), { colour: 'rgb(20, 38, 31)', spread: 2 });
  assert.deepEqual(I.shadow('rgba(0, 0, 0, 0.5) 0px 0px 0px 1px, rgb(1, 2, 3) 0px 0px 0px 4px'), { colour: 'rgba(0, 0, 0, 0.5)', spread: 1 });
  assert.equal(I.shadow('none'), null);
  assert.equal(I.shadow(''), null);
  // a soft drop shadow (no spread) isn't a ring
  assert.equal(I.shadow('rgba(0, 0, 0, 0.2) 0px 4px 12px 0px'), null);
});

test('the image is portrait on phones and tall windows, landscape otherwise', () => {
  assert.equal(I.shapeFor(1440, 900), 'landscape');
  assert.equal(I.shapeFor(1024, 768), 'landscape');
  assert.equal(I.shapeFor(375, 812), 'portrait');
  assert.equal(I.shapeFor(760, 500), 'portrait');
  assert.equal(I.shapeFor(900, 1200), 'portrait');
});

test('the image sizes are 3:2 landscape, 4:5 portrait and 1:1 square', () => {
  assert.equal(I.SIZES.landscape.w / I.SIZES.landscape.h, 1.5);
  assert.equal(I.SIZES.portrait.w / I.SIZES.portrait.h, 0.8);
  assert.equal(I.SIZES.square.w, I.SIZES.square.h);
});

test('a picked shape wins; Auto, or anything unknown, goes by the window', () => {
  assert.equal(I.pick('square', 1440, 900), 'square');
  assert.equal(I.pick('portrait', 1440, 900), 'portrait');
  assert.equal(I.pick('landscape', 375, 812), 'landscape');
  assert.equal(I.pick('auto', 1440, 900), 'landscape');
  assert.equal(I.pick('auto', 375, 812), 'portrait');
  assert.equal(I.pick('nonsense', 375, 812), 'portrait');
  assert.equal(I.pick(null, 1440, 900), 'landscape');
  assert.equal(I.pick('hasOwnProperty', 1440, 900), 'landscape');
});

test('the chart gets the room the title, key and footer leave, and they never overlap', () => {
  for (const shape of ['landscape', 'portrait', 'square']) {
    for (const rows of [0, 1, 2, 3]) {
      const L = I.layout(shape, rows);
      assert.equal(L.w, I.SIZES[shape].w);
      assert.equal(L.h, I.SIZES[shape].h);
      assert.equal(L.chartW, L.w - 2 * L.pad);
      assert.ok(L.chartH >= 300, shape + ' ' + rows + ' rows: chart ' + L.chartH);
      assert.ok(L.chartY + L.chartH < L.keyY, 'key below the chart');
      assert.ok(L.keyY + rows * 26 <= L.footY + 13, 'key above the footer');
      assert.ok(L.footY < L.h);
    }
  }
  assert.ok(I.layout('landscape', 2).chartH < I.layout('landscape', 1).chartH);
  assert.deepEqual(I.layout('nonsense', 0), I.layout('landscape', 0));
});
