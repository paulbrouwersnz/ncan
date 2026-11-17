/*
  ncan-account.js - signing in, for the pages that read from the club's API
  (/athletes/, /athlete/, /results-sources/).

  Athlete results are not part of this website: they come from the API at
  https://api.ncan.nz/v1/ (the private ncan-api project), and only to someone
  signed in. Families see their own children; coaches and administrators see
  everyone. Sign-in is by an emailed link, so there is no password; the API
  keeps a cookie for the signed-in person, which this page never sees.

  window.NCAN:
    get(path)              -> Promise of the JSON. A failed request rejects with
                              err.status (401 = not signed in, 403 = not allowed,
                              404 = not found, or not one you can see), and
                              err.body, the API's reply (its "error", and more).
    send(path, data)       -> Promise of {status, body}: a POST of JSON.
    me()                   -> Promise of {email, role, athletes}, or null.
    signIn(el, intro, next) -> fills el with a sign-in form; the emailed link comes
                              back to `next` (by default, this page as it is).
    account(el, who)       -> fills el with "Signed in as ... Sign out".

  On this computer (http://localhost:8123), pages call an API run locally on
  port 8765: see the ncan-api project's docs/API.md.
*/
(function () {
  'use strict';

  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = local ? 'http://' + location.hostname + ':8765/v1' : 'https://api.ncan.nz/v1';

  function failure(status, text) {
    var err = new Error(text || 'HTTP ' + status);
    err.status = status;
    return err;
  }

  function get(path) {
    return fetch(API + path, { credentials: 'include', cache: 'no-store' })
      .catch(function () { throw failure(0, 'The results service could not be reached.'); })
      .then(function (res) {
        if (res.ok) { return res.json(); }
        // the API's own words about why (err.body), e.g. a training plan that was removed
        return res.json().catch(function () { return {}; }).then(function (body) {
          var err = failure(res.status, body && body.error);
          err.body = body || {};
          throw err;
        });
      });
  }

  function post(path, data) {
    return fetch(API + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    }).catch(function () { throw failure(0, 'The results service could not be reached.'); });
  }

  // A change (e.g. adding a meeting): resolves to {status, body} whatever the
  // status, so the page can show the API's own error message.
  function send(path, data) {
    return post(path, data).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, body: body };
      });
    });
  }

  function me() {
    return get('/auth/me').catch(function (err) {
      if (err.status === 401) { return null; }
      throw err;
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text) { e.textContent = text; }
    return e;
  }

  // A sign-in box: email address -> the API emails a link that brings them back here.
  function signIn(box, intro, next) {
    box.textContent = '';
    box.hidden = false;
    box.classList.add('signin');
    box.appendChild(el('h3', 'signin__head', 'Sign in to see results'));
    box.appendChild(el('p', null, intro ||
      'Athlete results are for club families, coaches and the committee. Enter the email address ' +
      'the club has for you, and we’ll email you a link to sign in. There is no password.'));
    var form = el('form', 'signin__form');
    form.noValidate = false;
    var field = el('p', 'records-field records-field--grow');
    var label = el('label', null, 'Email address');
    label.htmlFor = 'signin-email';
    var input = el('input');
    input.type = 'email';
    input.id = 'signin-email';
    input.autocomplete = 'email';
    input.required = true;
    field.appendChild(label);
    field.appendChild(input);
    var button = el('button', 'btn btn--accent', 'Email me a sign-in link');
    button.type = 'submit';
    form.appendChild(field);
    form.appendChild(button);
    box.appendChild(form);
    var said = el('p', 'signin__status');
    said.setAttribute('role', 'status');
    box.appendChild(said);
    // what the email is used for (Privacy Act IPP 3): sign-in links, nothing else
    var note = el('p', 'signin__privacy', 'We use your email address only to send sign-in links. ');
    var more = el('a', null, 'How the club handles your information');
    more.href = '/privacy/';
    note.appendChild(more);
    note.appendChild(document.createTextNode('.'));
    box.appendChild(note);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      button.disabled = true;
      said.textContent = 'Sending…';
      post('/auth/request-link', { email: input.value, next: next || location.href })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (res.status === 202) { said.textContent = data.message || 'Check your email for a sign-in link.'; return; }
            if (res.status === 429) { said.textContent = 'Too many requests. Please try again in 15 minutes.'; }
            else if (res.status === 400) { said.textContent = 'That doesn’t look like an email address.'; }
            else { said.textContent = 'Sorry, that didn’t work. Please try again later.'; }
            button.disabled = false;
          });
        })
        .catch(function (err) {
          said.textContent = err.message;
          button.disabled = false;
        });
    });
  }

  var ROLES = { admin: 'club administrator', coach: 'coach', committee: 'committee', family: 'family' };

  // "Signed in as paul@example.nz (coach). Sign out"
  function account(box, who) {
    box.textContent = '';
    if (!who) { box.hidden = true; return; }
    box.hidden = false;
    box.classList.add('account-line');
    box.appendChild(document.createTextNode('Signed in as ' + who.email +
      (ROLES[who.role] ? ' (' + ROLES[who.role] + ')' : '') + '. '));
    if (who.role === 'admin' && !/\/admin\/?(index\.html)?$/.test(location.pathname)) {
      var adm = el('a', 'account-line__admin', 'Club admin');
      adm.href = '/admin/';
      box.appendChild(adm);
      box.appendChild(document.createTextNode(' · '));
    }
    var out = el('button', 'account-line__out', 'Sign out');
    out.type = 'button';
    out.addEventListener('click', function () {
      out.disabled = true;
      post('/auth/sign-out').then(function () { location.reload(); }, function () { location.reload(); });
    });
    box.appendChild(out);
  }

  window.NCAN = { api: API, get: get, send: send, me: me, signIn: signIn, account: account };
}());
