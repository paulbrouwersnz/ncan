/* Locking a form while the club's API works on what it sent ----------------
   FormLock.lock(root, on, selector) disables every control under `root` (or
   only those matching `selector`) and marks `root` with .is-locked and
   aria-busy, so the stylesheet can shade it and show a spinner. Unlocking
   re-enables only the controls this locked: a button that was already off
   (say "Change type" before a new type is picked) stays off.

   FormLock.running(collect) says whether a results collect is still going,
   from the `collect` part of GET /v1/sources.

   Used by results-sources/index.html (Add a meeting), the members upload on
   admin/members-list/ and the header photos editor on admin/header-photos/;
   tests in tests/js/form-lock.test.js. */
(function (root) {
  'use strict';

  var CONTROLS = 'input, select, textarea, button';

  function lock(box, on, selector) {
    if (!box) { return; }
    var els = box.querySelectorAll(selector || CONTROLS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (on) {
        if (!el.disabled) { el.disabled = true; el.setAttribute('data-locked', ''); }
      } else if (el.hasAttribute('data-locked')) {
        el.disabled = false;
        el.removeAttribute('data-locked');
      }
    }
    if (!selector) {
      box.classList.toggle('is-locked', !!on);
      if (on) { box.setAttribute('aria-busy', 'true'); } else { box.removeAttribute('aria-busy'); }
    }
  }

  function running(collect) {
    return !!(collect && collect.state === 'running');
  }

  var api = { lock: lock, running: running };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.FormLock = api; }
})(this);
