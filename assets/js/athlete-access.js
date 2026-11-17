/*
  athlete-access.js - "Who can see this page" on the athlete page (/athlete/).

  Shown only to someone who may change it: the athlete's contacts from the
  club's membership system (GameDay), and club administrators. The club's API
  decides (GET /v1/athletes/<id>/access); everyone else gets nothing back and
  the section stays hidden.

  - A contact can add an email, which can then sign in and see this page (but
    not add anyone else), and remove the ones they added.
  - An administrator can add and remove anyone. Removing someone whose access
    comes from the membership system blocks them from this page, with a reason,
    so the next import doesn't give it back; blocks can be lifted.
  Nobody is emailed when they're added.
*/
(function () {
  'use strict';

  // the athlete in the page's address: /athlete/#/sam-brown (or a number, from an old link)
  var route = /^#\/([a-z0-9]+(?:-[a-z0-9]+)*)/.exec(location.hash);
  var id = route ? route[1] : '';
  var $ = function (x) { return document.getElementById(x); };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id || '')) { return; }

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
  function say(words) { $('access-status').textContent = words || ''; }

  function how(p) {
    if (p.origin === 'membership export') { return 'A contact in the club’s membership system'; }
    if (p.origin === 'family') { return 'Added by ' + p.added_by + ' on ' + p.added; }
    return 'Added by a club administrator' + (p.added ? ' on ' + p.added : '');
  }

  function change(path, body, done) {
    return NCAN.send('/athletes/' + id + '/access' + path, body).then(function (r) {
      if (r.status === 200 || r.status === 201) { done(r.body); }
      else { say(r.body.error || 'Sorry, that didn’t work.'); }
      load();
    }, function (err) { say(err.message); load(); });
  }

  function render(data) {
    var out = $('access-out');
    out.textContent = '';
    if (data.admin) {
      $('access-lede').textContent = 'Everyone below can sign in and see this page, as well as coaches and club ' +
        'administrators. As an administrator you can add or remove anyone. Removing a contact from the membership ' +
        'system blocks them from this page, so the next import doesn’t give it back.';
    }
    var list = el('ul', 'access-list');
    data.people.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('strong', null, p.email));
      li.appendChild(el('span', 'access-how', how(p)));
      if (p.can_remove) {
        li.appendChild(button('Remove', function () {
          var body = { email: p.email };
          if (p.origin === 'membership export') {
            var why = prompt('Remove ' + p.email + '? Their access comes from the membership system, so they’ll ' +
                             'be blocked from this page. Why? (kept with the block)', '');
            if (!why) { load(); return; }
            body.why = why;
          } else if (!confirm('Stop ' + p.email + ' seeing this page?')) { load(); return; }
          change('/remove', body, function (r) {
            say(r.blocked ? p.email + ' is blocked from this page.' :
                r.still_has_access ? 'Removed, but ' + p.email + ' can still see the page through the membership system.' :
                p.email + ' can no longer see this page.');
          });
        }));
      }
      list.appendChild(li);
    });
    if (!data.people.length) { list.appendChild(el('li', null, 'Only coaches and club administrators.')); }
    out.appendChild(list);

    if (data.blocked && data.blocked.length) {
      out.appendChild(el('h3', 'access-sub', 'Blocked'));
      var bl = el('ul', 'access-list');
      data.blocked.forEach(function (b) {
        var li = el('li');
        li.appendChild(el('strong', null, b.email));
        li.appendChild(el('span', 'access-how', (b.athlete_id ? 'From this page' : 'From the whole site') +
          ': ' + b.why + ' (' + b.by + ', ' + b.at + ')'));
        if (b.athlete_id) {
          li.appendChild(button('Unblock', function () {
            change('/unblock', { email: b.email }, function () { say(b.email + ' is no longer blocked from this page.'); });
          }));
        }
        bl.appendChild(li);
      });
      out.appendChild(bl);
    }
  }

  function load() {
    NCAN.get('/athletes/' + id + '/access').then(function (data) {
      render(data);
      $('ath-access').hidden = false;
    }, function () { $('ath-access').hidden = true; });
  }

  $('access-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('access-email').value.trim();
    if (!email) { say('Type their email address first.'); return; }
    say('Adding…');
    change('', { email: email }, function () {
      say(email + ' can now sign in and see this page. They haven’t been emailed: let them know.');
      $('access-email').value = '';
    });
  });

  NCAN.me().then(function (who) { if (who) { load(); } }, function () { /* not signed in */ });
}());
