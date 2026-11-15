/*
  athlete-manage.js - "Manage this athlete" on athlete.html, for club
  administrators only. Everyone else never sees it: the club's API answers only
  an administrator (GET /v1/athletes/<id>/manage), and the section stays hidden.

  - Every athletic.net number that makes up this page, with links to its track
    and field and cross country bios on athletic.net, why it's part of the page,
    and its latest results.
  - Add a number (POST .../manage/add): joined to the page; on a member's page
    with no athletic.net number yet, that number's results become the member's.
  - Take a number out (POST .../manage/remove): kept apart from the page's other
    numbers from then on.
  Changes are kept with the club's corrections (undo on the Club admin page),
  and the results are collected again.
*/
(function () {
  'use strict';

  var id = new URLSearchParams(location.search).get('id');
  var $ = function (x) { return document.getElementById(x); };
  if (!/^\d+$/.test(id || '')) { return; }

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function link(href, words) {
    var a = el('a', null, words);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  function say(words) { $('manage-status').textContent = words || ''; }

  var WHY = { grades: 'their grades matched', members: 'one member has that name', same: 'joined by a person' };
  var COLLECTING = ' Results are being collected again: this page shows the change in a few minutes.';

  function change(path, body, done) {
    say('Saving…');
    return NCAN.send('/athletes/' + id + '/manage' + path, body).then(function (r) {
      if (r.status === 200) { say(done(r.body)); } else { say((r.body && r.body.error) || 'Sorry, that didn’t work.'); }
      load();
    }, function (err) { say(err.message); });
  }

  function render(data) {
    var out = $('manage-out');
    out.textContent = '';
    var numbers = data.numbers || [];
    var real = numbers.filter(function (n) { return n.athletic_net; });
    var ul = el('ul', 'review-list manage-list');
    numbers.forEach(function (n) {
      var li = el('li', 'review-item');
      var head = el('p', 'review-item__text');
      if (n.athletic_net) {
        head.appendChild(el('strong', null, 'athletic.net ' + n.id));
      } else {
        head.appendChild(el('strong', null, n.kind === 'member'
          ? (n.page ? 'Member page ' + n.id + ' (no athletic.net number yet)'
                    : 'Member page number ' + n.id + ' (from before they had results: it leads here)')
          : 'Number ' + n.id + ', given by hand (no athletic.net bio)'));
      }
      var bits = [];
      if (n.page) { bits.push('the page’s own number'); }
      if (n.joined_by && n.joined_by.length) {
        bits.push('joined because ' + n.joined_by.map(function (w) { return WHY[w] || w; }).join(' and '));
      }
      if (n.results) { bits.push(n.results + ' result' + (n.results === 1 ? '' : 's') + (n.last ? ', the latest ' + n.last : '')); }
      if (n.name && n.name !== data.athlete.name) { bits.push('as “' + n.name + '”'); }
      if (bits.length) { head.appendChild(el('span', 'access-how', ' · ' + bits.join(' · '))); }
      li.appendChild(head);
      var acts = el('div', 'review-item__acts');
      if (n.athletic_net) {
        acts.appendChild(link('https://www.athletic.net/athlete/' + n.id + '/track-and-field/all', 'Track and field bio'));
        acts.appendChild(link('https://www.athletic.net/athlete/' + n.id + '/cross-country/all', 'Cross country bio'));
        if (real.length > 1) {
          var b = el('button', 'btn btn--ghost btn--sm', 'Not this athlete: take it out');
          b.type = 'button';
          b.addEventListener('click', function () {
            var why = prompt('Take athletic.net ' + n.id + ' out of ' + data.athlete.name + '’s page? Its results ' +
                             'leave this page, and it won’t be joined again. Why (optional)?', 'not the same athlete');
            if (why === null) { return; }
            b.disabled = true;
            change('/remove', { number: String(n.id), why: why }, function () {
              return 'athletic.net ' + n.id + ' is taken out of this page.' + COLLECTING;
            });
          });
          acts.appendChild(b);
        }
      }
      li.appendChild(acts);
      ul.appendChild(li);
    });
    out.appendChild(ul);
    $('manage-add-help').textContent = data.member_only
      ? 'This member has no athletic.net number yet. Adding one makes that number’s results theirs.'
      : 'Adding a number joins its results to this page. The most recently used number keeps the page.';
  }

  function load() {
    NCAN.get('/athletes/' + id + '/manage').then(function (data) {
      render(data);
      $('ath-manage').hidden = false;
    }, function () { $('ath-manage').hidden = true; });
  }

  $('manage-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = /(?:\/athlete\/)?(\d{1,12})/.exec($('manage-number').value);
    if (!m) { say('Give an athletic.net number, or paste the address of their athletic.net bio.'); return; }
    var number = m[1];
    change('/add', { number: number, why: $('manage-why').value }, function () {
      $('manage-number').value = ''; $('manage-why').value = '';
      return 'athletic.net ' + number + ' is added to this page.' + COLLECTING;
    });
  });

  // administrators only: for anyone else, nothing is asked for and nothing shows
  NCAN.me().then(function (who) { if (who && who.role === 'admin') { load(); } }, function () { /* not signed in */ });
}());
