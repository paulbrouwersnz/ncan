/*
  my-membership.js - Membership (/my/membership/), reached from My NCAN (/me/).

  For each athlete this person is family for, what the club's membership system
  (GameDay) holds that a family may see (agreed November 2026), from
  GET /v1/me/membership: whether they're registered for this season (with a link
  to register if not), their Athletics NZ National ID, date of birth, grade, the
  seasons they've been a member, and a table of each season's registrations with
  the club, Athletics Canterbury and Athletics NZ. Never their emails, gender,
  contact, medical or payment details: those stay in GameDay.

  #/athlete/<address> shows one athlete (My NCAN's cards link there). The wording
  helpers are kept apart from the page so the Node tests can check them
  (tests/js/my-membership.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.NCANMembership = api;
  if (root.document) { root.document.addEventListener('DOMContentLoaded', function () { api.start(root); }); }
}(this, function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  var BODIES = [['club', 'Club'], ['centre', 'Athletics Canterbury'], ['national', 'Athletics NZ']];

  // "2018-03-04" -> "4 March 2018"; anything else as it is
  function dateText(iso) {
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || ''));
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1] : (iso || '');
  }

  // "2026/27" -> "2026–27", as the rest of the site writes seasons
  function seasonText(s) {
    return String(s || '').replace('/', '–');
  }

  // 8 -> "Grade 8"; an age group ("U16", "Senior") as it is
  function gradeText(g) {
    if (g === null || g === undefined || g === '') { return ''; }
    return /^\d+$/.test(String(g)) ? 'Grade ' + g : String(g);
  }

  // one body's registrations in a season: "Junior, ordered 1 September 2025"
  function regText(list) {
    return (list || []).map(function (k) {
      if (!k) { return ''; }
      var type = typeof k === 'string' ? k : k.type;
      var ordered = typeof k === 'string' ? null : k.ordered;
      return ordered ? type + ', ordered ' + dateText(ordered) : type;
    }).filter(Boolean).join('; ');
  }

  // the line at the top of an athlete's section
  function statusText(a, season) {
    if (!a.member) {
      return 'Not on the club’s members list. Once they’re registered, their membership shows here ' +
        'after the club’s next update from GameDay.';
    }
    return a.current ? 'Registered for ' + seasonText(season) + '.'
      : 'Not registered for ' + seasonText(season) + ' yet.';
  }

  // the athlete a hash picks: "#/athlete/lily-smith" -> "lily-smith"
  function hashAthlete(hash) {
    var m = /^#\/athlete\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(hash || '');
    return m ? m[1].toLowerCase() : null;
  }

  // ------------------------------------------------------------ the page

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (text) { e.textContent = text; }
    return e;
  }

  function fact(doc, dl, term, value) {
    if (!value || (Array.isArray(value) && !value.length)) { return; }
    var pair = el(doc, 'div', 'mship-fact');           // a dl may group each term with its value
    pair.appendChild(el(doc, 'dt', null, term));
    var dd = el(doc, 'dd', null, Array.isArray(value) ? '' : value);
    if (Array.isArray(value)) {                        // seasons: each kept on one line
      value.forEach(function (v, i) {
        if (i) { dd.appendChild(doc.createTextNode(', ')); }
        dd.appendChild(el(doc, 'span', 'mship-nowrap', v));
      });
    }
    pair.appendChild(dd);
    dl.appendChild(pair);
  }

  function table(doc, regs) {
    var wrap = el(doc, 'div', 'table-wrap');
    var t = el(doc, 'table', 'schedule mship-table');
    t.appendChild(el(doc, 'caption', null, 'Registrations by season'));
    var head = el(doc, 'thead');
    var tr = el(doc, 'tr');
    ['Season'].concat(BODIES.map(function (b) { return b[1]; })).forEach(function (h) {
      var th = el(doc, 'th', null, h);
      th.scope = 'col';
      tr.appendChild(th);
    });
    head.appendChild(tr);
    t.appendChild(head);
    var body = el(doc, 'tbody');
    regs.slice().reverse().forEach(function (r) {            // newest first
      var row = el(doc, 'tr');
      var th = el(doc, 'th', null, seasonText(r.season));
      th.scope = 'row';
      row.appendChild(th);
      BODIES.forEach(function (b) {
        var td = el(doc, 'td', null, regText(r[b[0]]) || '—');
        td.setAttribute('data-label', b[1]);
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    t.appendChild(body);
    wrap.appendChild(t);
    return wrap;
  }

  function section(doc, a, season) {
    var box = el(doc, 'section', 'mship-athlete');
    var h = el(doc, 'h2', 'shares-group__name');
    if (a.slug) {
      var link = el(doc, 'a', null, a.name);
      link.href = '/athlete/#/' + a.slug;
      h.appendChild(link);
    } else {
      h.textContent = a.name;
    }
    box.appendChild(h);
    var st = el(doc, 'p', 'mship-status' + (!a.member ? ' mship-status--none' : !a.current ? ' mship-status--due' : ''), statusText(a, season));
    if (a.member && !a.current) {
      st.appendChild(doc.createTextNode(' '));
      var join = el(doc, 'a', null, 'Register for ' + seasonText(season));
      join.href = '/#join';
      st.appendChild(join);
    }
    box.appendChild(st);
    if (!a.member) { return box; }
    var dl = el(doc, 'dl', 'mship-facts');
    fact(doc, dl, 'Athletics NZ National ID', a.national_id || 'Not recorded yet');
    fact(doc, dl, 'Date of birth', dateText(a.dob));
    fact(doc, dl, 'Grade', gradeText(a.grade));
    fact(doc, dl, 'Member', (a.seasons || []).map(seasonText));
    box.appendChild(dl);
    if (a.registrations && a.registrations.length) { box.appendChild(table(doc, a.registrations)); }
    return box;
  }

  function start(win) {
    var doc = win.document;
    var N = win.NCAN;
    var $ = function (id) { return doc.getElementById(id); };
    var status = $('mship-status'), out = $('mship-out'), pickEl = $('mship-pick'), sel = $('mship-athlete');
    if (!N || !out) { return; }
    var failed = 'Sorry, membership couldn’t be loaded. Please try again later.';
    var data = null;

    function draw() {
      var all = data.athletes || [];
      var want = hashAthlete(win.location.hash);
      if (want && !all.some(function (a) { return a.slug === want; })) { want = null; }
      var picks = all.filter(function (a) { return a.slug; });
      pickEl.hidden = picks.length < 2;
      sel.textContent = '';
      sel.appendChild(new win.Option('All athletes', ''));
      picks.forEach(function (a) { sel.appendChild(new win.Option(a.name, a.slug)); });
      sel.value = want || '';
      $('mship-empty').hidden = all.length > 0;
      out.textContent = '';
      if (data.updated) {
        out.appendChild(el(doc, 'p', 'mship-updated', 'From the club’s membership records, as at ' +
          dateText(data.updated) + '.'));
      }
      all.filter(function (a) { return !want || a.slug === want; }).forEach(function (a) {
        out.appendChild(section(doc, a, data.season));
      });
    }

    sel.addEventListener('change', function () {
      var v = sel.value;
      win.history.replaceState(null, '', v ? '#/athlete/' + v : win.location.pathname);
      draw();
    });
    win.addEventListener('hashchange', function () { if (data) { draw(); } });

    N.me().then(function (who) {
      if (!who) {
        status.hidden = true;
        N.signIn($('mship-signin'), null, null, 'Sign in to see your athletes’ membership');
        return;
      }
      return N.get('/me/membership').then(function (r) {
        data = r || { athletes: [] };
        status.hidden = true;
        $('mship-body').hidden = false;
        draw();
      });
    }).then(null, function (e) {
      status.hidden = false;
      status.textContent = (e && e.status === 0 && e.message) || failed;
    });
  }

  return { dateText: dateText, seasonText: seasonText, gradeText: gradeText, regText: regText,
    statusText: statusText, hashAthlete: hashAthlete, section: section, start: start };
}));
