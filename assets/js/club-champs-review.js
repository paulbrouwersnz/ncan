/*
  club-champs-review.js - reviewing and confirming the club championships, on
  club-champs.html, for club administrators and coaches signed in.

  The club's API proposes each Saturday's results from the meeting's results
  (GET /v1/club-champs/<season>/review): North Canterbury athletes in the
  programme's events, in their grade from the members list, with their place
  among North Canterbury athletes. Anything a person should look at is listed
  with what can be done about it (a fix, POST .../fix), and the Saturday is
  then confirmed (POST .../confirm). Only confirmed results are public.

  Everyone else sees nothing of this: the section stays hidden.
*/
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var season = null, staff = false, review = null;
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function longDate(iso) {
    var p = iso.split('-');
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function button(words, cls, onClick) {
    var b = el('button', 'btn btn--sm ' + (cls || 'btn--ghost'), words);
    b.type = 'button';
    b.addEventListener('click', function () { b.disabled = true; onClick(b); });
    return b;
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // the API's answer to a change: a refreshed Saturday, or an error to show
  function change(path, body, day, onDone) {
    return NCAN.send('/club-champs/' + season + '/' + path, body).then(function (r) {
      if (r.status === 200) { onDone(r.body); return; }
      if (r.status === 409 && confirm(r.body.error + '\n\nConfirm anyway?')) {
        body.anyway = true;
        return change(path, body, day, onDone);
      }
      if (r.status !== 409) { alert(r.body.error || 'Sorry, that didn’t work.'); }
      load();
    }, function (err) { alert(err.message); load(); });
  }

  // ---------------------------------------------------------------- one Saturday

  function fixButtons(day, issue) {
    var row = el('div', 'review-fix');
    var fix = function (f) { return function () { change('fix', { date: day.date, key: issue.key, fix: f }, day, load); }; };
    var existing = day.fixes[issue.key];
    if (existing) {
      row.appendChild(button('Undo this fix', null, fix(null)));
      return row;
    }
    if (issue.kind === 'grade' || issue.kind === 'other team') {
      row.appendChild(button('Count in this race', null, fix({ count: true })));
    }
    if (issue.kind === 'unmatched') {
      // a temporary athletic.net number: say which member it really is
      var pick = el('select', 'review-pick');
      pick.appendChild(el('option', null, 'Same athlete as…'));
      pick.firstChild.value = '';
      review.athletes.forEach(function (a) {
        var o = el('option', null, a.name);
        o.value = a.id;
        pick.appendChild(o);
      });
      pick.addEventListener('change', function () {
        if (pick.value) { fix({ page: +pick.value, why: 'temporary number' })(); }
      });
      row.appendChild(pick);
    }
    if (issue.kind !== 'excluded' && issue.kind !== 'other team') {
      row.appendChild(button('Leave out', null, function () {
        var why = prompt('Leave out of this Saturday – why? (for the record)', '');
        if (why === null) { load(); return; }
        fix({ exclude: true, why: why || 'left out by hand' })();
      }));
    }
    return row;
  }

  function saturday(day) {
    var box = el('details', 'champs-day review-day');
    var head = el('summary', 'champs-day__head');
    head.appendChild(el('h3', 'champs-day__title', longDate(day.date)));
    var need = day.issues.filter(function (i) { return i.kind === 'grade' || i.kind === 'unmatched'; });
    var state, tag = 'champs-tag ath-badge';
    if (day.confirmed && day.differences.length) { state = 'Confirmed, but the results have changed'; }
    else if (day.confirmed) { state = 'Confirmed'; tag += ' champs-tag--next'; }
    else if (!day.entrants) { state = 'No results yet'; }
    else if (need.length) { state = need.length + ' to look at'; }
    else { state = 'Ready to confirm'; tag += ' champs-tag--next'; }
    head.appendChild(el('span', tag, state));
    box.appendChild(head);
    var body = el('div', 'champs-day__body');

    if (!day.entrants) {
      body.appendChild(el('p', null, 'No results from this Saturday yet. Once its interclub’s results are complete, ' +
        'add the meeting on the results sources page; the results are proposed here when they’ve been collected.'));
      box.appendChild(body);
      return box;
    }
    body.appendChild(el('p', 'records-note', 'From ' + day.meetings.map(function (m) { return m.name; }).join(', ') +
      (day.confirmed ? '. Confirmed by ' + day.confirmed.by + ' on ' + day.confirmed.at + '.' : '.')));
    if (day.differences.length) {
      body.appendChild(el('p', null, 'Since it was confirmed, the proposal has changed:'));
      var ul = el('ul', 'review-list');
      day.differences.forEach(function (d) { ul.appendChild(el('li', null, d)); });
      body.appendChild(ul);
    }
    var info = day.issues.filter(function (i) { return need.indexOf(i) === -1; });
    [[need, 'Needs a look'], [info, 'Also at this meeting']].forEach(function (pair) {
      if (!pair[0].length) { return; }
      body.appendChild(el('h4', 'review-sub', pair[1]));
      var list = el('ul', 'review-list');
      pair[0].forEach(function (i) {
        var li = el('li', null, i.text);
        li.appendChild(fixButtons(day, i));
        list.appendChild(li);
      });
      body.appendChild(list);
    });

    body.appendChild(el('h4', 'review-sub', 'Proposed results'));
    var wrap = el('div', 'table-wrap');
    var table = el('table', 'schedule review-table');
    var tr = el('tr');
    ['Event', 'Grade', 'Place', 'Athlete', 'Mark'].forEach(function (h) { var th = el('th', null, h); th.scope = 'col'; tr.appendChild(th); });
    var thead = el('thead'); thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    day.proposed.forEach(function (r) {
      var row = el('tr');
      [(r.gender === 'girls' ? 'Girls ' : 'Boys ') + r.event, String(r.grade), ordinal(r.place),
       r.athlete + (r.withheld ? ' (name withheld on the public page)' : ''), r.mark || '–'].forEach(function (v, i) {
        var td = el('td', null, v);
        if (i === 4 && r.source) {
          td.textContent = '';
          var a = el('a', 'records-source', v); a.href = r.source; a.target = '_blank'; a.rel = 'noopener';
          td.appendChild(a);
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody); wrap.appendChild(table); body.appendChild(wrap);

    var actions = el('div', 'review-actions');
    if (!day.confirmed || day.differences.length) {
      actions.appendChild(button(day.confirmed ? 'Confirm the changes' : 'Confirm ' + longDate(day.date), 'btn--accent', function () {
        change('confirm', { date: day.date }, day, function () { location.reload(); });
      }));
    }
    if (day.confirmed) {
      actions.appendChild(button('Unconfirm', null, function () {
        if (!confirm('Take ' + longDate(day.date) + '’s results off the public page until confirmed again?')) { load(); return; }
        change('unconfirm', { date: day.date }, day, function () { location.reload(); });
      }));
    }
    body.appendChild(actions);
    box.appendChild(body);
    // open the Saturdays that need someone
    box.open = !day.confirmed && !!day.entrants || day.differences.length > 0;
    return box;
  }

  // ---------------------------------------------------------------- the season

  function load() {
    if (!staff || !season) { return; }
    var out = $('review-out');
    NCAN.get('/club-champs/' + season + '/review').then(function (data) {
      review = data;
      out.textContent = '';
      data.saturdays.forEach(function (day) { out.appendChild(saturday(day)); });
      $('champs-review').hidden = false;
    }, function (err) {
      out.textContent = err.status === 403 ? '' : 'The review could not be loaded: ' + err.message;
      if (err.status === 403) { $('champs-review').hidden = true; }
    });
  }

  window.ChampsReview = {
    season: function (id) { season = id; load(); }
  };

  NCAN.me().then(function (who) {
    NCAN.account($('account'), who);
    staff = !!who && (who.role === 'admin' || who.role === 'coach');
    load();
  }, function () { /* not signed in: the public page only */ });
}());
