/*
  athletes-admin.js - "Membership changes" on athletes.html, for club administrators.

  The club's API decides who sees it (GET /v1/membership answers only an
  administrator); for everyone else the section stays hidden.

  - Membership overrides (GET/POST /v1/membership, POST /v1/membership/undo):
    left or joined on a date, or a member / not a member for a season. They sit
    on top of the GameDay members list, so an import never undoes them, and
    each one starts a collect.
  - Emails blocked from the whole site (GET /v1/access/blocks, POST
    /v1/access/block and /v1/access/unblock).
  No athlete data is in this file: names come from the API, for admins only.
*/
(function () {
  'use strict';

  var $ = function (x) { return document.getElementById(x); };
  var members = [];

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function button(words, onClick) {
    var b = el('button', 'btn btn--ghost btn--sm', words);
    b.type = 'button';
    b.addEventListener('click', function () { b.disabled = true; onClick(b); });
    return b;
  }
  function failed(where) {
    return function (r) { $(where).textContent = (r.body && r.body.error) || 'Sorry, that didn’t work.'; };
  }

  /* Collect status --------------------------------------------------------- */
  function collectWords(c) {
    if (!c || !c.state) { return ''; }
    var at = function (t) { return t ? t.slice(0, 10) + ' at ' + t.slice(11, 16) : ''; };
    if (c.state === 'running') {
      return 'Collecting results now (started ' + (c.started || '').slice(11, 16) +
        '). Changes show on the athletes’ pages when it’s done.';
    }
    if (c.state === 'done') { return 'Results last collected ' + at(c.finished) + '. ' + (c.message || ''); }
    return 'The last collect, ' + at(c.finished || c.started) + ', didn’t finish: ' + (c.message || '');
  }
  var watching = false;
  function watch(c) {
    $('mem-collect').textContent = collectWords(c);
    if (c && c.state === 'running' && !watching) {
      watching = true;
      setTimeout(function () { watching = false; loadMembership(); }, 15000);
    }
  }

  /* Membership overrides ---------------------------------------------------- */
  function renderOverrides(list) {
    var out = $('mem-out');
    out.textContent = '';
    if (!list.length) {
      out.appendChild(el('p', 'mem-help', 'No changes yet: the members list is used as it is.'));
      return;
    }
    var ul = el('ul', 'access-list');
    list.slice().reverse().forEach(function (o) {
      var li = el('li');
      li.appendChild(el('strong', null, o.name + (o.born ? ' (born ' + o.born + ')' : '')));
      li.appendChild(el('span', null, o.words));
      li.appendChild(el('span', 'access-how', o.why + ' (' + o.by + ', ' + o.at + ')'));
      li.appendChild(button('Undo', function () {
        if (!confirm('Undo “' + o.name + ': ' + o.words + '”? Results are collected again.')) {
          loadMembership(); return;
        }
        NCAN.send('/membership/undo', { number: o.number }).then(function (r) {
          if (r.status === 200) { $('mem-status').textContent = 'Undone. Results are being collected again.'; }
          else { failed('mem-status')(r); }
          loadMembership();
        }, function (err) { $('mem-status').textContent = err.message; loadMembership(); });
      }));
      ul.appendChild(li);
    });
    out.appendChild(ul);
  }

  function loadMembership() {
    return NCAN.get('/membership').then(function (data) {
      $('admin-members').hidden = false;
      members = data.members || [];
      var dl = $('mem-names');
      if (!dl.children.length) {
        members.forEach(function (n) { var o = el('option'); o.value = n; dl.appendChild(o); });
      }
      renderOverrides(data.overrides || []);
      watch(data.collect);
      return true;
    });
  }

  function onList(name) {
    var key = name.trim().toLowerCase().replace(/\s+/g, ' ');
    return members.some(function (n) { return n.toLowerCase() === key; });
  }

  var HELP = {
    left: 'Results from this date to the end of its season (31 March) don’t count for the club.',
    joined: 'Results in that season before this date don’t count for the club.',
    member: 'Their results that season count, e.g. paid in cash or a fee waived. Someone not on the ' +
            'members list needs their birth year.',
    not: 'None of their results that season count, e.g. a payment that shouldn’t have counted.'
  };
  function fields() {
    var kind = $('mem-kind').value;
    var dated = kind === 'left' || kind === 'joined';
    $('mem-day-field').hidden = !dated;
    $('mem-season-field').hidden = dated;
    var name = $('mem-name').value.trim();
    $('mem-born-field').hidden = !(kind === 'member' && name && !onList(name));
    $('mem-help').textContent = HELP[kind];
  }

  function setUpForm() {
    ['mem-kind', 'mem-name'].forEach(function (x) {
      $(x).addEventListener('input', fields);
      $(x).addEventListener('change', fields);
    });
    fields();
    $('mem-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var kind = $('mem-kind').value;
      var body = { name: $('mem-name').value.trim(), why: $('mem-why').value.trim() };
      if (!body.name) { $('mem-status').textContent = 'Choose the member first.'; return; }
      if (kind === 'left' || kind === 'joined') {
        if (!$('mem-day').value) { $('mem-status').textContent = 'Give the date.'; return; }
        body[kind] = $('mem-day').value;
      } else {
        body.season = $('mem-season').value.trim();
        body.member = kind === 'member';
        if (!$('mem-born-field').hidden && $('mem-born').value) { body.born = $('mem-born').value; }
      }
      $('mem-status').textContent = 'Saving…';
      NCAN.send('/membership', body).then(function (r) {
        if (r.status === 201) {
          $('mem-status').textContent = r.body.override.name + ': ' + describe(r.body.override) +
            '. Results are being collected again.';
          ['mem-name', 'mem-day', 'mem-season', 'mem-born', 'mem-why'].forEach(function (x) { $(x).value = ''; });
          fields();
        } else { failed('mem-status')(r); }
        loadMembership();
      }, function (err) { $('mem-status').textContent = err.message; });
    });
  }

  // the API's own words come with the list; this covers the reply to a change
  function describe(o) {
    var season = o.season + '/' + String((o.season + 1) % 100).padStart(2, '0');
    if (o.member) { return 'a member ' + season; }
    if (o.from) { return 'left on ' + o.from; }
    if (o.until) {
      var d = new Date(o.until + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return 'joined on ' + d.toISOString().slice(0, 10);
    }
    return 'not a member ' + season;
  }

  /* Site-wide blocks --------------------------------------------------------- */
  function loadBlocks() {
    NCAN.get('/access/blocks').then(function (data) {
      var out = $('blocks-out');
      out.textContent = '';
      var ul = el('ul', 'access-list');
      data.blocked.forEach(function (b) {
        var li = el('li');
        li.appendChild(el('strong', null, b.email));
        li.appendChild(el('span', 'access-how', b.why + ' (' + b.by + ', ' + b.at + ')'));
        li.appendChild(button('Unblock', function () {
          NCAN.send('/access/unblock', { email: b.email }).then(function (r) {
            if (r.status === 200) { $('block-status').textContent = b.email + ' can sign in again.'; }
            else { failed('block-status')(r); }
            loadBlocks();
          }, function (err) { $('block-status').textContent = err.message; loadBlocks(); });
        }));
        ul.appendChild(li);
      });
      if (!data.blocked.length) { ul.appendChild(el('li', null, 'Nobody.')); }
      out.appendChild(ul);
    }, function () { /* shown only to admins */ });
  }

  function setUpBlocks() {
    $('block-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('block-email').value.trim(), why = $('block-why').value.trim();
      if (!email || !why) { $('block-status').textContent = 'Give the email address and why.'; return; }
      if (!confirm('Block ' + email + ' from the whole site? They’re signed out at once.')) { return; }
      NCAN.send('/access/block', { email: email, why: why }).then(function (r) {
        if (r.status === 200) {
          $('block-status').textContent = email + ' is blocked from the site.';
          $('block-email').value = ''; $('block-why').value = '';
        } else { failed('block-status')(r); }
        loadBlocks();
      }, function (err) { $('block-status').textContent = err.message; });
    });
  }

  NCAN.me().then(function (who) {
    if (!who || who.role !== 'admin') { return; }
    loadMembership().then(function () { setUpForm(); setUpBlocks(); loadBlocks(); },
                          function () { /* not an admin after all */ });
  }, function () { /* not signed in */ });
}());
