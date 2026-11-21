// Tests for the sign-in box in assets/js/ncan-account.js, with a small stand-in
// for the page (no browser needed). Run with: node --test "tests/js/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../assets/js/ncan-account.js'), 'utf8');

// Just enough of an element for signIn(): children, text, attributes, events.
function makeEl(tag) {
  const handlers = {};
  const e = {
    tag, children: [], className: '', hidden: false, disabled: false, value: '',
    attrs: {}, classList: { add() {} },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    fire(type) { (handlers[type] || []).forEach((fn) => fn({ preventDefault() {} })); },
  };
  let text = '';
  Object.defineProperty(e, 'textContent', {
    get() { return text; },
    set(v) { text = v; if (v === '') { e.children = []; } },
  });
  return e;
}

function find(root, test) {
  if (test(root)) { return root; }
  for (const c of root.children) { const f = find(c, test); if (f) { return f; } }
  return null;
}

function setUp(replies) {
  const requests = [];
  const sandbox = {
    location: { hostname: 'ncan.nz', href: 'https://ncan.nz/admin/' },
    document: { createElement: makeEl, createTextNode: (t) => ({ text: t, children: [] }) },
    fetch(url, opts) {
      requests.push(JSON.parse(opts.body));
      const r = replies.shift();
      return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.body || {}) });
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox);
  const box = makeEl('div');
  sandbox.NCAN.signIn(box, 'Admins only.');
  return {
    requests,
    input: find(box, (e) => e.tag === 'input'),
    button: find(box, (e) => e.tag === 'button'),
    form: find(box, (e) => e.tag === 'form'),
    status: find(box, (e) => e.className === 'signin__status'),
  };
}

const settle = () => new Promise((r) => setImmediate(r));
const SENT = { status: 202, body: { message: 'If that address is one the club has, a sign-in link is on its way.' } };

test('a mistyped address can be corrected and sent again', async () => {
  const p = setUp([SENT, SENT]);
  p.input.value = 'paul@brouwers.nz';
  p.form.fire('submit');
  await settle();
  assert.equal(p.button.disabled, true, 'button stays off after a send');
  assert.match(p.status.textContent, /on its way/);
  assert.match(p.status.textContent, /Change it above and send again/);

  p.input.value = 'paul@ncan.nz';
  p.input.fire('input');
  assert.equal(p.button.disabled, false, 'a new address can be sent');
  assert.equal(p.status.textContent, '');

  p.form.fire('submit');
  await settle();
  assert.deepEqual(p.requests.map((r) => r.email), ['paul@brouwers.nz', 'paul@ncan.nz']);
});

test('the same address does not turn the button back on', async () => {
  const p = setUp([SENT]);
  p.input.value = 'paul@ncan.nz';
  p.form.fire('submit');
  await settle();
  p.input.value = ' paul@ncan.nz ';   // only spaces added
  p.input.fire('input');
  assert.equal(p.button.disabled, true);
});

test('a refused address can be fixed straight away', async () => {
  const p = setUp([{ status: 400, body: {} }, SENT]);
  p.input.value = 'paul@';
  p.form.fire('submit');
  await settle();
  assert.equal(p.button.disabled, false);
  assert.match(p.status.textContent, /doesn’t look like an email address/);
});

// --- where people go after signing in -------------------------------------

function account(replies, store) {
  const sandbox = {
    location: { hostname: 'ncan.nz', protocol: 'https:', host: 'ncan.nz', href: 'https://ncan.nz/sign-in/' },
    document: { createElement: makeEl, createTextNode: (t) => ({ text: t, children: [] }) },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    fetch() {
      const r = replies.shift();
      return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body || {}) });
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox);
  return sandbox.NCAN;
}

test('each role has its own page to land on', () => {
  const N = account([], {});
  assert.equal(N.home({ role: 'admin' }), '/admin/');
  assert.equal(N.home({ role: 'committee' }), '/committee-tools/');
  assert.equal(N.home({ role: 'coach' }), '/coaches-tools/');
  assert.equal(N.home({ role: 'family' }), '/athletes/');
  assert.equal(N.home(null), '/athletes/');
});

test('each role can do everything the roles below it can', () => {
  const N = account([], {});
  assert.deepEqual(Array.from(N.RANK), ['family', 'coach', 'committee', 'admin']);
  const rows = [['family', false, false, false], ['coach', true, false, false],
    ['committee', true, true, false], ['admin', true, true, true], [undefined, false, false, false]];
  for (const [role, coach, committee, admin] of rows) {
    const who = role ? { role } : null;
    assert.deepEqual([N.atLeast(who, 'coach'), N.atLeast(who, 'committee'), N.atLeast(who, 'admin')],
      [coach, committee, admin], String(role));
  }
  assert.equal(N.atLeast('committee', 'coach'), true);       // a role name works too
  assert.equal(N.atLeast({ role: 'nobody' }, 'family'), false);
});

test('the coaches note shows for the committee only', () => {
  const N = account([], {});
  for (const role of ['family', 'coach', 'committee', 'admin']) {
    const parent = makeEl('div');
    const list = parent.appendChild(makeEl('div'));
    parent.insertBefore = (n, ref) => { parent.children.splice(parent.children.indexOf(ref), 0, n); return n; };
    list.parentNode = parent;
    const note = N.coachesNote(list, { role });
    assert.equal(!!note, role === 'committee', role);
    if (note) {
      assert.equal(parent.children[0], note);
      assert.match(note.textContent, /Coaches usually make changes here/);
    }
  }
});

test('staff who are also family see their own athletes in the account line', () => {
  const N = account([], {});
  const box = makeEl('p');
  N.account(box, { email: 'pat@club.example', role: 'coach', athletes: 'all',
    own: [{ id: 1, name: 'Sam Brown', slug: 'sam-brown' }, { id: 2, name: 'Amy Brown', slug: 'amy-brown' }] });
  const links = box.children.filter((c) => c.className === 'account-line__own');
  assert.deepEqual(links.map((a) => [a.textContent, a.href]),
    [['Sam Brown', '/athlete/#/sam-brown'], ['Amy Brown', '/athlete/#/amy-brown']]);
  // a family's own pages are their whole athletes list: nothing extra
  const fam = makeEl('p');
  N.account(fam, { email: 'p@home.example', role: 'family', athletes: [], own: [{ id: 1, name: 'Sam Brown', slug: 'sam-brown' }] });
  assert.equal(fam.children.filter((c) => c.className === 'account-line__own').length, 0);
});

test('#/next/ addresses read and write the page to go on to', () => {
  const N = account([], {});
  assert.equal(N.nextFromHash('#/next/athlete/%23/sam-brown'), '/athlete/#/sam-brown');
  assert.equal(N.nextFromHash('#/next/athlete/#/sam-brown'), '/athlete/#/sam-brown');
  assert.equal(N.nextFromHash('#/next/junior-athletics/%23/plan/2026-11-24'), '/junior-athletics/#/plan/2026-11-24');
  assert.equal(N.nextFromHash('#/next/admin/'), '/admin/');
  for (const bad of ['', '#', '#/next', '#/next/', '#/next//evil.example/x', '#/next/%2F%2Fevil.example',
    '#/next/sign-in/', '#/next/%E0%A4%A', '#/other/admin/', null, undefined]) {
    const got = N.nextFromHash(bad);
    assert.ok(got === null || got === '/', String(bad) + ' -> ' + got);
  }
  assert.equal(N.signInLink('/athlete/#/sam-brown'), '/sign-in/#/next/athlete/%23/sam-brown');
  assert.equal(N.signInLink('/admin/'), '/sign-in/#/next/admin/');
  assert.equal(N.signInLink('https://evil.example/'), '/sign-in/');
  for (const path of ['/athlete/#/sam-brown', '/junior-athletics/#/plan/2026-11-24', '/admin/#page-photos', '/a%20b/']) {
    assert.equal(N.nextFromHash(N.signInLink(path).slice('/sign-in/'.length)), path, path);
  }
});

test('next only ever points to a page of this website', () => {
  const N = account([], {});
  assert.equal(N.safeNext('/athletes/'), '/athletes/');
  assert.equal(N.safeNext('/athlete/#/sam-brown'), '/athlete/#/sam-brown');
  assert.equal(N.safeNext('/junior-athletics/#/plan/2026-11-24'), '/junior-athletics/#/plan/2026-11-24');
  assert.equal(N.safeNext('https://ncan.nz/admin/#page-photos'), '/admin/#page-photos');
  for (const bad of ['https://evil.example/', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)',
    'athletes/', '/a b/', '', null, 42, 'https://ncan.nz.evil.example/', '/sign-in/', '/sign-in/?next=/x',
    '/sign-in', '/sign-in/index.html']) {
    assert.equal(N.safeNext(bad), null, String(bad));
  }
});

test('me() remembers whether someone is signed in, for the header link', async () => {
  const store = {};
  const N = account([{ status: 200, body: { email: 'c@club.example', role: 'coach' } }, { status: 401 }], store);
  await N.me();
  assert.equal(store['ncan-signed-in'], '1');
  assert.equal(await N.me(), null);
  assert.equal('ncan-signed-in' in store, false);
});
