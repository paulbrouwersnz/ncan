/*
  my-profile.js - Your profile (/my/profile/): the signed-in person's own name,
  "Is this you?" for athletes already linked to their email, and leaving an
  athlete's family (GET/POST /v1/me/profile in the API).

  A name never links anyone to an athlete. Only athletes the club has already
  linked to the email are asked about, so answering grants nothing: it records
  whether the athlete is them or they're family (a parent, a guardian).

  Leaving is for someone linked by the club's records who isn't the athlete's
  family, such as a committee member who registered another family's child.
  The next membership import doesn't add them back, and they can undo it here.

  The wording helpers are kept apart from the page so the Node tests can check
  them (tests/js/my-profile.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.NCANProfile = api;
  if (root.document) { root.document.addEventListener('DOMContentLoaded', function () { api.start(root); }); }
}(this, function () {
  'use strict';

  function possessive(name) {
    name = String(name || '');
    return name + (/s$/i.test(name) ? '’' : '’s');
  }

  // The tag beside one linked athlete
  function tag(a) {
    return a.me === true ? 'You' : a.me === false ? 'Family' : '';
  }

  function askText(a) {
    return 'Are you ' + a.name + ', the athlete?';
  }

  function leaveText(a, staff) {
    return 'Leave ' + possessive(a.name) + ' family?\n\n' +
      'You’ll stop seeing ' + a.name + ' under My athletes, and you won’t be listed among the people ' +
      'who can see their page. ' +
      (staff ? 'As staff, you can still open their page from the athletes list. ' : '') +
      'The club’s next membership import won’t add you back. You can undo this on Your profile.';
  }

  // The hint under the name box: a suggestion from GameDay is only filled in, never saved
  function nameHint(p) {
    if (p && !p.name && p.suggested) {
      return 'Filled in from the club’s membership records. Check it, then save.';
    }
    return '';
  }

  // ------------------------------------------------------------ the page

  function el(doc, tagName, cls, text) {
    var e = doc.createElement(tagName);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  function start(win) {
    var doc = win.document;
    var N = win.NCAN;
    var $ = function (id) { return doc.getElementById(id); };
    var nameBox = $('profile-name-box');
    if (!N || !nameBox) { return; }
    var staff = false;
    var busy = false;

    function show(p) {
      nameBox.hidden = false;
      var input = $('profile-name');
      if (doc.activeElement !== input) { input.value = p.name || p.suggested || ''; }
      var hint = nameHint(p);
      $('profile-name-hint').textContent = hint;
      $('profile-name-hint').hidden = !hint;

      var box = $('profile-athletes-box');
      var athletes = p.athletes || [];
      var left = p.left || [];
      box.hidden = !athletes.length && !left.length;

      var ask = $('profile-ask');
      ask.textContent = '';
      athletes.filter(function (a) { return a.ask; }).forEach(function (a) {
        var card = el(doc, 'div', 'profile-ask');
        card.appendChild(el(doc, 'p', 'profile-ask__q', askText(a)));
        card.appendChild(el(doc, 'p', 'mem-help',
          'Your name is like theirs. Saying yes only notes that this page is yours: it changes nothing about who can see it.'));
        var row = el(doc, 'div', 'btn-row');
        var yes = el(doc, 'button', 'btn btn--accent btn--sm', 'Yes, that’s me');
        var no = el(doc, 'button', 'btn btn--ghost btn--sm', 'No, I’m family');
        yes.type = no.type = 'button';
        yes.addEventListener('click', function () { answer(a, true); });
        no.addEventListener('click', function () { answer(a, false); });
        row.appendChild(yes);
        row.appendChild(no);
        card.appendChild(row);
        ask.appendChild(card);
      });

      var list = $('profile-athletes');
      list.textContent = '';
      athletes.forEach(function (a) {
        var li = el(doc, 'li', 'profile-athlete');
        var head = el(doc, 'p', 'profile-athlete__name');
        if (a.slug) {
          var link = el(doc, 'a', null, a.name);
          link.href = '/athlete/#/' + a.slug;
          head.appendChild(link);
        } else {
          head.appendChild(doc.createTextNode(a.name));
        }
        if (tag(a)) { head.appendChild(el(doc, 'span', 'profile-athlete__tag', tag(a))); }
        li.appendChild(head);
        var row = el(doc, 'div', 'profile-athlete__actions');
        function button(text, fn) {
          var b = el(doc, 'button', 'profile-athlete__btn', text);
          b.type = 'button';
          b.addEventListener('click', fn);
          row.appendChild(b);
        }
        if (a.me !== true) { button('This is me', function () { answer(a, true); }); }
        if (a.me !== false) { button(a.me === true ? 'This isn’t me' : 'I’m family', function () { answer(a, false); }); }
        button('Leave this family', function () {
          if (win.confirm(leaveText(a, staff))) { change('/me/profile/leave', { athlete: a.id }, 'profile-athletes-status',
            'You’ve left ' + possessive(a.name) + ' family.'); }
        });
        li.appendChild(row);
        list.appendChild(li);
      });
      $('profile-athletes-none').hidden = athletes.length > 0;

      var gone = $('profile-left');
      gone.textContent = '';
      $('profile-left-box').hidden = !left.length;
      left.forEach(function (a) {
        var li = el(doc, 'li', 'profile-athlete');
        li.appendChild(el(doc, 'p', 'profile-athlete__name', a.name));
        var row = el(doc, 'div', 'profile-athlete__actions');
        var b = el(doc, 'button', 'profile-athlete__btn', 'Rejoin');
        b.type = 'button';
        b.addEventListener('click', function () {
          change('/me/profile/rejoin', { athlete: a.id }, 'profile-athletes-status',
            'You can see ' + possessive(a.name) + ' page again.');
        });
        row.appendChild(b);
        li.appendChild(row);
        gone.appendChild(li);
      });
    }

    function change(path, body, statusId, done) {
      if (busy) { return Promise.resolve(); }
      busy = true;
      var status = $(statusId);
      status.textContent = 'Saving…';
      return N.send(path, body).then(function (r) {
        busy = false;
        if (r.status !== 200) {
          status.textContent = (r.body && r.body.error) || 'Sorry, that couldn’t be saved. Please try again.';
          return;
        }
        status.textContent = done;
        show(r.body);
        // the round photo's letters follow a new name
        var letters = doc.querySelector('#me-avatar .avatar__text');
        if (path === '/me/profile' && r.body.name && letters && win.NCANMe) {
          letters.textContent = win.NCANMe.initials(r.body.name);
        }
      }, function (err) {
        busy = false;
        status.textContent = err.message;
      });
    }

    function answer(a, me) {
      change('/me/profile/me', { athlete: a.id, me: me }, 'profile-athletes-status',
        me ? 'Noted: ' + a.name + ' is you.' : 'Noted: you’re ' + possessive(a.name) + ' family.');
    }

    $('profile-name-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('profile-name').value.replace(/\s+/g, ' ').trim();
      $('profile-name').value = name;
      change('/me/profile', { name: name }, 'profile-name-status', name ? 'Saved.' : 'Your name is cleared.');
    });

    N.me().then(function (who) {
      if (!who) { return; }
      staff = N.atLeast(who, 'coach');
      $('profile-staff-note').hidden = !staff;
      return N.get('/me/profile').then(show);
    }).catch(function (err) {
      nameBox.hidden = false;
      $('profile-name-status').textContent = err.status === 0 ? err.message
        : 'Sorry, your name and athletes couldn’t be loaded. Please try again later.';
    });
  }

  return { possessive: possessive, tag: tag, askText: askText, leaveText: leaveText, nameHint: nameHint,
    start: start };
}));
