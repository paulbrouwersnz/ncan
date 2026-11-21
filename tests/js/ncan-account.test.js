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
