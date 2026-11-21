// Tests for the gallery viewer's save-to-device helpers (gallery-viewer.js).
const test = require('node:test');
const assert = require('node:assert');
const { downloadHref, saveName, makeSaver } = require('../../assets/js/gallery-viewer.js');

const PHOTO = 'https://photos.ncan.nz/gallery/2017/Canterbury%20Champs%20Timaru/IMG_0002.jpg';

test('downloadHref adds download=1', () => {
  assert.strictEqual(downloadHref(PHOTO), PHOTO + '?download=1');
  assert.strictEqual(downloadHref(PHOTO + '?v=2'), PHOTO + '?v=2&download=1');
  assert.strictEqual(downloadHref(PHOTO + '#x'), PHOTO + '?download=1');
});

test('saveName is the decoded file name', () => {
  assert.strictEqual(saveName(PHOTO), 'IMG_0002.jpg');
  assert.strictEqual(saveName('https://photos.ncan.nz/a/My%20photo.jpg?v=1'), 'My photo.jpg');
  assert.strictEqual(saveName('https://photos.ncan.nz/a/bad%E0.jpg'), 'bad%E0.jpg');
  assert.strictEqual(saveName('https://photos.ncan.nz/'), 'photo.jpg');
});

// a stand-in browser: fetch answers from `answers`, clicks are recorded
function fakeEnv(answers) {
  const calls = [], clicked = [], revoked = [];
  const env = {
    calls, clicked, revoked,
    fetch(url, opts) {
      calls.push({ url, opts });
      const a = answers.shift();
      if (a instanceof Error) { return Promise.reject(a); }
      return Promise.resolve({ ok: a < 400, status: a, blob: () => Promise.resolve('BLOB') });
    },
    URL: { createObjectURL: (b) => 'blob:' + b, revokeObjectURL: (u) => revoked.push(u) },
    document: {
      body: { appendChild() {} },
      createElement() {
        return { click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} };
      },
    },
  };
  return env;
}

test('host that allows fetching: checked once with HEAD, then saved', async () => {
  const env = fakeEnv([200, 200]);
  const saver = makeSaver(env);
  assert.strictEqual(saver.ready(), false);
  assert.strictEqual(await saver.check(PHOTO), true);
  assert.strictEqual(await saver.check(PHOTO), true);   // no second request
  assert.strictEqual(env.calls.length, 1);
  assert.deepStrictEqual(env.calls[0].opts, { method: 'HEAD', mode: 'cors', cache: 'no-store' });
  assert.strictEqual(saver.ready(), true);
  assert.strictEqual(await saver.save(PHOTO, 'IMG_0002.jpg'), true);
  assert.deepStrictEqual(env.clicked, [{ href: 'blob:BLOB', download: 'IMG_0002.jpg' }]);
});

test('host without the header: not ready, so the plain link is used', async () => {
  const env = fakeEnv([new TypeError('Failed to fetch')]);
  const saver = makeSaver(env);
  assert.strictEqual(await saver.check(PHOTO), false);
  assert.strictEqual(saver.ready(), false);
  assert.strictEqual(env.calls.length, 1);
});

test('a failed save says so and stops trying', async () => {
  const env = fakeEnv([200, 404]);
  const saver = makeSaver(env);
  await saver.check(PHOTO);
  assert.strictEqual(await saver.save(PHOTO, 'x.jpg'), false);
  assert.strictEqual(saver.ready(), false);
  assert.deepStrictEqual(env.clicked, []);
});

test('no fetch in this browser: never ready, nothing requested', async () => {
  const saver = makeSaver({ fetch: undefined, URL: undefined, document: {} });
  assert.strictEqual(await saver.check(PHOTO), false);
  assert.strictEqual(saver.ready(), false);
});
