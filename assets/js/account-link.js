/*
  account-link.js - the header's "Sign in" / "My pages" link, on every page
  (loaded deferred from partials/head.html).

  The link always works as it is written: /sign-in/, which signs people in
  and then, or straight away when they already are, sends them on to their
  own page (admin /admin/, committee /committee-tools/, coach
  /coaches-tools/, family /athletes/). Pages that need signing in have their
  own sign-in box, which brings people back to that page instead.

  Only the words change. Most visitors never sign in, so the club's API is
  asked only when this device has signed in before (a hint ncan-account.js
  keeps in localStorage): then GET /auth/me says whether the person still is.
  Nothing on the page waits for it, and if the API can't be reached the link
  just says "Sign in".

  On /sign-in/ itself the link is left alone.
*/
(function () {
  'use strict';

  var links = document.querySelectorAll('[data-account-link]');
  if (!links.length || /^\/sign-in\/?/.test(location.pathname)) { return; }

  var hinted = false;
  try { hinted = localStorage.getItem('ncan-signed-in') === '1'; } catch (e) { /* blocked */ }
  if (!hinted) { return; }

  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var api = local ? 'http://' + location.hostname + ':8765/v1' : 'https://api.ncan.nz/v1';
  fetch(api + '/auth/me', { credentials: 'include', cache: 'no-store' }).then(function (res) {
    if (res.status === 401) {
      try { localStorage.removeItem('ncan-signed-in'); } catch (e) { /* blocked */ }
      return;
    }
    if (!res.ok) { return; }
    [].forEach.call(links, function (a) {
      a.textContent = 'My pages';
    });
  }).catch(function () { /* API unreachable: leave "Sign in" */ });
}());
