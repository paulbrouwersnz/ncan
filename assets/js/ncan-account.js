/*
  ncan-account.js - signing in, for the pages that read from the club's API
  (/sign-in/, /athletes/, /athlete/, /results-sources/, /admin/ and the
  staff tools pages).

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
    sendFile(path, blob)   -> the same, for a POST of a file's bytes (a photo),
                              sent with the blob's own type.
    me()                   -> Promise of {email, role, athletes, own, acting,
                              may_act}, or null (`role` is the role answered as:
                              an admin acting as a coach gets "coach"). Also
                              remembers on this device whether someone is signed
                              in, so the header's Sign in / My NCAN link
                              (account-link.js) only asks the API when it might
                              be "My NCAN".
    signIn(el, intro, next, head) -> fills el with a sign-in form; the emailed link
                              comes back to `next` (by default, this page as it is).
    account(el, who)       -> fills el with "Signed in as ... Sign out".
    home(who)              -> where someone lands after signing in with nowhere
                              else to go: staff (coach and above) /admin/,
                              family /me/ (My athletes).
    safeNext(value)        -> value as a path on this website ("/athlete/#/x"),
                              or null if it points anywhere else (or back to
                              /sign-in/ itself).
    nextFromHash(hash)     -> the page asked for in a /sign-in/ address,
                              "#/next/athlete/%23/sam-brown" ->
                              "/athlete/#/sam-brown" (a plain # works too),
                              checked with safeNext; null if none.
    signInLink(path)       -> "/sign-in/#/next/athlete/%23/sam-brown" for a page
                              of this site, or "/sign-in/" if it isn't one.

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

  // A file's bytes (an athlete's photo): {status, body} as for send().
  function sendFile(path, blob) {
    return fetch(API + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob
    }).catch(function () { throw failure(0, 'The results service could not be reached.'); })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      });
  }

  // "Someone signed in here recently", for the header link (account-link.js).
  // Only a hint: the API's cookie decides, and this is cleared on a 401.
  var HINT = 'ncan-signed-in';
  function remember(who) {
    try {
      if (who) { localStorage.setItem(HINT, '1'); } else { localStorage.removeItem(HINT); }
    } catch (e) { /* storage blocked: the header link just says Sign in */ }
  }

  function me() {
    return get('/auth/me').then(function (who) {
      remember(who);
      return who;
    }, function (err) {
      if (err.status === 401) { remember(null); return null; }
      throw err;
    });
  }

  // Roles, lowest first: each can do everything the ones before it can (the API
  // decides; this only picks what to show). Check with atLeast(who, 'coach'),
  // never by listing role names. Staff keep their own family links: who.own.
  var RANK = ['family', 'coach', 'committee', 'admin'];
  function atLeast(who, lowest) {
    var role = who && typeof who === 'object' ? who.role : who;
    return RANK.indexOf(role) >= 0 && RANK.indexOf(role) >= RANK.indexOf(lowest);
  }

  // Training plans and the club champs review: the committee can change them,
  // but coaches usually do. A note above them, for the committee only.
  function coachesNote(before, who) {
    if (!before || !who || who.role !== 'committee') { return null; }
    var note = el('p', 'note committee-note',
      'Coaches usually make changes here. Please check with the coaching team before editing.');
    before.parentNode.insertBefore(note, before);
    return note;
  }

  var HOMES = { admin: '/admin/', committee: '/admin/', coach: '/admin/', family: '/me/' };
  function home(who) {
    return (who && HOMES[who.role]) || '/me/';
  }

  // Only ever send people on to a page of this website: a path ("/athletes/",
  // "/athlete/#/sam-brown") or a full address on this site. Anything else, or
  // /sign-in/ itself (a loop), is null.
  function safeNext(value) {
    if (typeof value !== 'string') { return null; }
    value = value.trim();
    if (!value || value.length > 500 || /[\\\s]/.test(value)) { return null; }
    var here = location.protocol + '//' + location.host;
    if (value.indexOf(here + '/') === 0) { value = value.slice(here.length); }
    if (value.charAt(0) !== '/' || value.charAt(1) === '/') { return null; }
    if (/^\/sign-in\/?([?#].*)?$/.test(value) || /^\/sign-in\/index\.html/.test(value)) { return null; }
    return value;
  }

  // The page to go on to is kept after the # (#/next/...), like the site's other
  // #/ addresses, so it never reaches a server or its logs. The page's own # is
  // written %23; a plain # typed by hand is read the same way.
  function nextFromHash(hash) {
    var m = /^#\/next(\/.*)$/.exec(typeof hash === 'string' ? hash : '');
    if (!m) { return null; }
    var path;
    try { path = decodeURIComponent(m[1]); } catch (e) { return null; }
    return safeNext(path);
  }

  function signInLink(path) {
    var next = safeNext(path);
    return next ? '/sign-in/#/next' + next.replace(/%/g, '%25').replace(/#/g, '%23') : '/sign-in/';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text) { e.textContent = text; }
    return e;
  }

  var CONTACT = 'ncanathletics@gmail.com';

  // A sign-in box: email address -> the API emails a link that brings them back here.
  function signIn(box, intro, next, head) {
    box.textContent = '';
    box.hidden = false;
    box.classList.add('signin');
    box.appendChild(el('h3', 'signin__head', head || 'Sign in to see results'));
    box.appendChild(el('p', null, intro ||
      'Athlete results are for club families, coaches, the committee and club administrators. ' +
      'Enter the email address the club has for you, and we’ll email you a link to sign in. ' +
      'There is no password.'));
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
    // the API never says whether it knows an address, so say what to do if no link comes
    var help = el('p', 'signin__help', 'No link after a few minutes? Check your spam folder. ' +
      'The club may have a different address for you: email ');
    var mailto = el('a', null, CONTACT);
    mailto.href = 'mailto:' + CONTACT;
    help.appendChild(mailto);
    help.appendChild(document.createTextNode('.'));
    box.appendChild(help);
    // what the email is used for (Privacy Act IPP 3): sign-in links, nothing else
    var note = el('p', 'signin__privacy', 'We use your email address only to send sign-in links. ');
    var more = el('a', null, 'How the club handles your information');
    more.href = '/privacy/';
    note.appendChild(more);
    note.appendChild(document.createTextNode('.'));
    box.appendChild(note);

    // The API gives the same reply for addresses it doesn't know (so it never says
    // who is a member), so after a send the button stays off only until the address
    // is changed: a mistyped address can be corrected and sent again.
    var sent = null;
    input.addEventListener('input', function () {
      if (sent !== null && input.value.trim() !== sent) {
        sent = null;
        button.disabled = false;
        said.textContent = '';
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      button.disabled = true;
      said.textContent = 'Sending…';
      var email = input.value.trim();
      post('/auth/request-link', { email: email, next: next || location.href })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (res.status === 202) {
              sent = email;
              said.textContent = (data.message || 'Check your email for a sign-in link.') +
                ' Wrong address? Change it above and send again.';
              return;
            }
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
  var ACTING = { coach: 'a coach', committee: 'the committee', family: 'a family' };

  // "Signed in as paul@example.nz (coach). Sign out"; an admin acting as another
  // role: "Signed in as paul@example.nz (club administrator), acting as a coach."
  function account(box, who) {
    box.textContent = '';
    if (!who) { box.hidden = true; return; }
    box.hidden = false;
    box.classList.add('account-line');
    var acting = who.acting && ACTING[who.acting.role];
    box.appendChild(document.createTextNode('Signed in as ' + who.email + (acting
      ? ' (club administrator), acting as ' + acting + '. '
      : (ROLES[who.role] ? ' (' + ROLES[who.role] + ')' : '') + '. ')));
    // staff who are also family: their own athletes, one step away (My athletes)
    var own = atLeast(who, 'coach') && Array.isArray(who.own) ? who.own : [];
    if (own.length && !/^\/me\/?(index\.html)?$/.test(location.pathname)) {
      var mine = el('a', 'account-line__own', own.length > 1 ? 'My athletes' : 'My athlete');
      mine.href = '/me/';
      box.appendChild(mine);
      box.appendChild(document.createTextNode(' · '));
    }
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
      remember(null);
      post('/auth/sign-out').then(function () { location.reload(); }, function () { location.reload(); });
    });
    box.appendChild(out);
  }

  window.NCAN = { api: API, get: get, send: send, sendFile: sendFile, me: me, signIn: signIn, account: account,
    home: home, safeNext: safeNext, nextFromHash: nextFromHash, signInLink: signInLink,
    RANK: RANK, atLeast: atLeast, coachesNote: coachesNote };
}());
