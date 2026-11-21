// Tests for locking the Add a meeting form while results are collected (form-lock.js).
const test = require('node:test');
const assert = require('node:assert');
const { lock, running } = require('../../assets/js/form-lock.js');

// a stand-in element with just what lock() uses
function el(tag, disabled) {
  const attrs = {};
  return {
    tag, disabled: !!disabled,
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    attrs,
  };
}
function box(controls) {
  const classes = new Set();
  const b = el('form');
  b.classList = { toggle(c, on) { if (on) { classes.add(c); } else { classes.delete(c); } } };
  b.classes = classes;
  b.querySelectorAll = (sel) => controls.filter((c) => !sel.includes('.only') || c.only);
  return b;
}

test('lock disables every control and marks the form busy', () => {
  const url = el('input'), go = el('button');
  const form = box([url, go]);
  lock(form, true);
  assert.ok(url.disabled && go.disabled);
  assert.ok(form.classes.has('is-locked'));
  assert.strictEqual(form.attrs['aria-busy'], 'true');
});

test('unlock re-enables only what lock disabled', () => {
  const url = el('input'), off = el('button', true);
  const form = box([url, off]);
  lock(form, true);
  lock(form, false);
  assert.strictEqual(url.disabled, false);
  assert.strictEqual(off.disabled, true, 'a button already off stays off');
  assert.ok(!form.classes.has('is-locked'));
  assert.ok(!('aria-busy' in form.attrs));
});

test('locking twice then unlocking once leaves everything usable', () => {
  const url = el('input');
  const form = box([url]);
  lock(form, true);
  lock(form, true);
  lock(form, false);
  assert.strictEqual(url.disabled, false);
});

test('a selector locks just those controls and leaves the box unmarked', () => {
  const type = el('select'), other = el('input');
  type.only = true;
  const list = box([type, other]);
  lock(list, true, '.only');
  assert.ok(type.disabled);
  assert.strictEqual(other.disabled, false);
  assert.ok(!list.classes.has('is-locked'));
});

test('a missing box is ignored', () => {
  assert.doesNotThrow(() => lock(null, true));
});

test('running is true only while a collect is going', () => {
  assert.strictEqual(running({ state: 'running', started: '2026-11-21T10:00:00' }), true);
  assert.strictEqual(running({ state: 'done' }), false);
  assert.strictEqual(running({ state: 'failed' }), false);
  assert.strictEqual(running(null), false);
  assert.strictEqual(running(undefined), false);
});

// the members upload and header photos editor unlock on every way out, even when
// nothing was locked (a file that can't be read fails before the lock)
test('unlocking a form that was never locked changes nothing', () => {
  const on = el('input'), off = el('button', true);
  const form = box([on, off]);
  lock(form, false);
  assert.strictEqual(on.disabled, false);
  assert.strictEqual(off.disabled, true);
  assert.ok(!form.classes.has('is-locked'));
});
