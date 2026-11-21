/*
  account-link.js - the header's "Sign in" / "My pages" link, on every page
  (loaded deferred from partials/head.html), and the banner an admin sees on
  every page while acting as another role.

  The link always works as it is written: /sign-in/, which signs people in
  and then, or straight away when they already are, sends them on to their
  own page (staff /admin/, family /athletes/). Pages that need signing in have their
  own sign-in box, which brings people back to that page instead.

  Only the words change. Most visitors never sign in, so the club's API is
  asked only when this device has signed in before (a hint ncan-account.js
  keeps in localStorage): then GET /auth/me says whether the person still is.
  Nothing on the page waits for it, and if the API can't be reached the link
  just says "Sign in".

  Acting as another role: an admin can choose on /admin/ to act as a coach, the
  committee or one family (POST /auth/act-as in the API). The API then answers
  them as that role everywhere, and records every change as the admin. While
  that lasts, every page shows a banner saying so, with Back to admin.

  On /sign-in/ itself the link is left alone.

  Kept testable in Node (tests/js/account-link.test.js): the words of the banner.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.NCANActing = api;
  api.start(root);
}(this, function () {
  'use strict';

  var AS = { coach: 'a coach', committee: 'the committee', family: 'a family' };

  // "13:24", in New Zealand time, from the API's "2026-11-22T00:24:00Z"
  function untilText(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) { return ''; }
    try {
      return d.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  // The banner's words, for {role, email, until} and the admin's own email
  function bannerText(acting, admin) {
    if (!acting || !AS[acting.role]) { return ''; }
    var who = acting.role === 'family' && acting.email ? 'the family of ' + acting.email : AS[acting.role];
    var until = untilText(acting.until);
    return 'You’re acting as ' + who + ': pages and tools show what they see. ' +
      'Any change you make is recorded as you' + (admin ? ' (' + admin + ')' : '') + '.' +
      (until ? ' Ends at ' + until + '.' : '');
  }

  function banner(doc, api, who) {
    var box = doc.createElement('div');
    box.className = 'acting-banner';
    box.setAttribute('role', 'status');
    var wrap = doc.createElement('div');
    wrap.className = 'wrap acting-banner__wrap';
    var p = doc.createElement('p');
    p.textContent = bannerText(who.acting, who.email);
    var back = doc.createElement('button');
    back.type = 'button';
    back.className = 'acting-banner__back';
    back.textContent = 'Back to admin';
    back.addEventListener('click', function () {
      back.disabled = true;
      fetch(api + '/auth/act-as/stop', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}'
      }).then(function () { location.href = '/admin/'; }, function () { back.disabled = false; });
    });
    wrap.appendChild(p);
    wrap.appendChild(back);
    box.appendChild(wrap);
    var header = doc.querySelector('.site-header');
    if (header && header.parentNode) { header.parentNode.insertBefore(box, header.nextSibling); }
    else { doc.body.insertBefore(box, doc.body.firstChild); }
  }

  function start(win) {
    var doc = win.document;
    var links = doc.querySelectorAll('[data-account-link]');
    if (/^\/sign-in\/?/.test(win.location.pathname)) { return; }

    var hinted = false;
    try { hinted = win.localStorage.getItem('ncan-signed-in') === '1'; } catch (e) { /* blocked */ }
    if (!hinted) { return; }

    var local = /^(localhost|127\.0\.0\.1)$/.test(win.location.hostname);
    var api = local ? 'http://' + win.location.hostname + ':8765/v1' : 'https://api.ncan.nz/v1';
    win.fetch(api + '/auth/me', { credentials: 'include', cache: 'no-store' }).then(function (res) {
      if (res.status === 401) {
        try { win.localStorage.removeItem('ncan-signed-in'); } catch (e) { /* blocked */ }
        return;
      }
      if (!res.ok) { return; }
      [].forEach.call(links, function (a) {
        a.textContent = 'My pages';
      });
      return res.json().then(function (who) {
        if (who && who.acting) { banner(doc, api, who); }
      });
    }).catch(function () { /* API unreachable: leave "Sign in" */ });
  }

  return { AS: AS, untilText: untilText, bannerText: bannerText, start: start };
}));
