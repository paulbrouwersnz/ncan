/*
  athlete-manage.js - "Manage this athlete" on athlete.html, for club
  administrators only. Everyone else never sees it: the club's API answers only
  an administrator (GET /v1/athletes/<id>/manage), and the section stays hidden.

  - Every athletic.net number that makes up this page, with links to its track
    and field and cross country bios on athletic.net, why it's part of the page,
    and its latest results.
  - Add a number (POST .../manage/add): joined to the page; on a member's page
    with no athletic.net number yet, that number's results become the member's.
    A page number given by hand (900000001 up, from results typed in) can be
    added too: its results move to this page, and its old link leads here.
  - Take a number out (POST .../manage/remove): kept apart from the page's other
    numbers from then on.
  - Club memberships: each season's paid GameDay registrations (the club
    membership type, and whether they also registered with Athletics Canterbury
    and Athletics NZ), with an admin's membership changes noted.
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
      if (n.kind === 'house' && !n.page) {
        var hb = el('button', 'btn btn--ghost btn--sm', 'Not this athlete: take it out');
        hb.type = 'button';
        hb.addEventListener('click', function () {
          var why = prompt('Take page ' + n.id + ' out of ' + data.athlete.name + '’s page? Its results go back to a ' +
                           'page of their own. Why (optional)?', 'not the same athlete');
          if (why === null) { return; }
          hb.disabled = true;
          change('/remove', { number: String(n.id), why: why }, function () {
            return 'Page ' + n.id + ' is taken out of this page.' + COLLECTING;
          });
        });
        acts.appendChild(hb);
      }
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
      : 'Adding an athletic.net number joins its results to this page (the most recently used number keeps ' +
        'the page). Adding a page number given by hand (900000001 up, for results typed in before the athlete ' +
        'had an athletic.net number) moves its results here and sends its old link here.';
  }

  function cell(row, label, words, note) {
    var td = el('td', null, words);
    td.setAttribute('data-label', label);
    if (note) { td.appendChild(el('span', 'manage-mem-note', note)); }
    row.appendChild(td);
    return td;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) {
    var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || '');
    return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '';
  }
  // a registration: {type, ordered}, or (from an older import) just the type
  function item(k) { return typeof k === 'string' ? { type: k, ordered: null } : k; }
  // each registration: its type, and its order date under it
  function registered(td, list) {
    list.map(item).forEach(function (k) {
      var one = el('span', 'manage-mem-item', k.type);
      if (k.ordered) { one.appendChild(el('span', 'manage-mem-note', 'Ordered ' + day(k.ordered))); }
      td.appendChild(one);
    });
  }
  function memberships(m) {
    var out = $('manage-membership');
    out.textContent = '';
    if (!m) {
      out.appendChild(el('p', 'mem-help', 'Not on the club’s members list: no memberships to show.'));
      return;
    }
    var regs = {};
    (m.registrations || []).forEach(function (r) { regs[r.season] = r; });
    var counted = {}, added = {};
    (m.seasons || []).forEach(function (s) { counted[s] = true; });
    (m.added || []).forEach(function (s) { added[s] = true; });
    if (m.recorded === false) {
      out.appendChild(el('p', 'mem-help', 'No GameDay registrations are kept yet: import the members list from ' +
                                          'GameDay again (Club admin page) and they show here after the collect.'));
    }
    var seasons = Object.keys(regs).concat((m.seasons || []).filter(function (s) { return !regs[s]; }));
    seasons.sort().reverse();
    if (!seasons.length) {
      out.appendChild(el('p', 'mem-help', 'No registrations in GameDay.'));
      return;
    }
    var wrap = el('div', 'table-wrap');
    var table = el('table', 'schedule manage-mem');
    table.appendChild(el('caption', 'visually-hidden', 'Club memberships by season, newest first'));
    var head = el('thead'); var hr = el('tr');
    ['Season', 'Club membership', 'Athletics Canterbury', 'Athletics NZ'].forEach(function (h) {
      var th = el('th', null, h); th.scope = 'col'; hr.appendChild(th);
    });
    head.appendChild(hr); table.appendChild(head);
    var body = el('tbody');
    seasons.forEach(function (s) {
      var r = regs[s] || { club: [], centre: [], national: [] };
      var tr = el('tr');
      var th = el('th', null, s); th.scope = 'row'; tr.appendChild(th);
      var club = r.club.length ? '' : regs[s] ? 'None' : m.recorded === false ? 'A member' : 'Not in GameDay';
      var note = !counted[s] ? 'Not counted as a club season' + (regs[s] ? ' (an admin’s change, or not an athlete membership)' : '')
               : added[s] ? 'Added by an admin' : '';
      var td = cell(tr, 'Club', club);
      registered(td, r.club);
      if (note) { td.appendChild(el('span', 'manage-mem-note', note)); }
      var unknown = m.recorded === false ? '–' : 'No';
      registered(cell(tr, 'Athletics Canterbury', r.centre.length ? '' : unknown), r.centre);
      registered(cell(tr, 'Athletics NZ', r.national.length ? '' : unknown), r.national);
      body.appendChild(tr);
    });
    table.appendChild(body); wrap.appendChild(table); out.appendChild(wrap);
    (m.away || []).forEach(function (p) {
      out.appendChild(el('p', 'mem-help', 'Away from the club ' + (p[0] ? 'from ' + p[0] + ' ' : '') +
                                           (p[1] ? 'until ' + p[1] : '') + ': results then don’t count for the club.'));
    });
  }

  function load() {
    NCAN.get('/athletes/' + id + '/manage').then(function (data) {
      render(data);
      memberships(data.membership);
      $('ath-manage').hidden = false;
    }, function () { $('ath-manage').hidden = true; });
  }

  $('manage-add').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = /(?:\/athlete\/)?(\d{1,12})/.exec($('manage-number').value);
    if (!m) { say('Give an athletic.net number, the address of their athletic.net bio, or a page number given by hand.'); return; }
    var number = m[1];
    change('/add', { number: number, why: $('manage-why').value }, function () {
      $('manage-number').value = ''; $('manage-why').value = '';
      return (+number >= 900000000 ? 'Page ' + number + '’s results are moving to this page.'
                                   : 'athletic.net ' + number + ' is added to this page.') + COLLECTING;
    });
  });

  // administrators only: for anyone else, nothing is asked for and nothing shows
  NCAN.me().then(function (who) { if (who && who.role === 'admin') { load(); } }, function () { /* not signed in */ });
}());
