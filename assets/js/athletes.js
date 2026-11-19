(function () {
  'use strict';

  /* Athlete index -------------------------------------------------------
     Reads the athletes list from the club's API (GET /v1/athletes; see
     assets/js/ncan-account.js), only for someone signed in: a family gets
     their own children, coaches and administrators everyone. Each name
     links to its page address, /athlete/#/<their name> (a.slug). */

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var $ = function (id) { return document.getElementById(id); };
  var all = [];

  function text(tag, cls, value) {
    var el = document.createElement(tag);
    if (cls) { el.className = cls; }
    if (value !== undefined && value !== null) { el.textContent = value; }
    return el;
  }
  function longDate(iso) {
    var p = iso.split('-');
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }

  // girls and boys to grade 14; women and men from U16, as the competition rules name them
  function sex(a) {
    var adult = a.group && !/^Grade /.test(a.group);
    return a.gender === 'girls' ? (adult ? 'women' : 'girls') : a.gender === 'boys' ? (adult ? 'men' : 'boys') : '';
  }

  var BANDS = [
    { key: '7-10', label: 'Grades 7–10', test: function (g) { var m = /^Grade (\d+)$/.exec(g); return !!m && +m[1] <= 10; } },
    { key: '11-14', label: 'Grades 11–14', test: function (g) { var m = /^Grade (\d+)$/.exec(g); return !!m && +m[1] >= 11; } },
    { key: 'youth', label: 'Youth (U16–U20)', test: function (g) { return /^U\d+$/.test(g); } },
    { key: 'adults', label: 'Adults (Seniors & Masters)', test: function (g) { return g === 'Senior' || g === 'Masters'; } }
  ];

  // Totals for the athletes shown, added up from each athlete's totals in the list
  // (worked out by ncan-api's collector). A meeting several of them went to counts once.
  // 1st, 2nd and 3rd places, each in a block of its own with its medal; all three
  // once there's any podium, so the row reads the same from athlete to athlete
  var MEDALS = [['🥇', '1st place', '1st places'], ['🥈', '2nd place', '2nd places'], ['🥉', '3rd place', '3rd places']];
  // the medal row, emptied, made if needed; or none, taken away if it was there
  function medalRow(dl, wanted) {
    var row = document.getElementById(dl.id + '-medals');
    if (!wanted) {
      if (row) { row.parentNode.removeChild(row); }
      return null;
    }
    if (!row) {
      row = text('dl', 'stats__grid ath-stats ath-medals');
      row.id = dl.id + '-medals';
      row.setAttribute('aria-label', 'Podium places');
      dl.parentNode.insertBefore(row, dl.nextSibling);
    }
    row.textContent = '';
    return row;
  }
  function statBlock(dl, value, label, medal) {
    var div = text('div', medal ? 'stat stat--medal' : 'stat');
    var dt = text('dt');
    if (medal) {
      var icon = text('span', 'stat__medal', medal);
      icon.setAttribute('aria-hidden', 'true');
      dt.appendChild(icon);
    }
    dt.appendChild(document.createTextNode(value));
    div.appendChild(dt);
    div.appendChild(text('dd', null, label));
    dl.appendChild(div);
  }

  function renderStats(rows) {
    var dl = $('ix-stats');
    dl.textContent = '';
    if (!rows.length || !rows[0].totals) { dl.hidden = true; return; }
    var t = { results: 0, first: 0, second: 0, third: 0, run: 0, walked: 0, jumped: 0, thrown: 0 }, meets = {}, events = {};
    var relays = {};       // a relay team on the podium counts once, however many of its runners are shown
    var medallists = 0;    // athletes shown with at least one podium place, individual or relay
    rows.forEach(function (a) {
      Object.keys(t).forEach(function (k) { t[k] += a.totals[k] || 0; });
      a.totals.meetings.forEach(function (m) { meets[m] = 1; });
      var rp = a.totals.relay_places || {};
      (a.totals.relay_podiums || []).forEach(function (k) { relays[k] = rp[k] || 0; });
      a.events.forEach(function (e) { events[e] = 1; });
      if (a.totals.podiums || (a.totals.relay_podiums || []).length) { medallists++; }
    });
    var places = [t.first, t.second, t.third];
    Object.keys(relays).forEach(function (k) { if (relays[k]) { places[relays[k] - 1]++; } });
    var podiums = places[0] + places[1] + places[2];
    var n = function (v) { return Math.round(v).toLocaleString('en-NZ'); };
    // metres, until 10,000 m reads better as km
    var len = function (m) {
      return m >= 10000 ? (m / 1000).toLocaleString('en-NZ', { maximumFractionDigits: 1 }) + ' km' : n(m) + ' m';
    };
    [[n(rows.length), rows.length === 1 ? 'Athlete' : 'Athletes'],
     [n(Object.keys(meets).length), 'Meetings'], [n(t.results), 'Results'],
     [n(Object.keys(events).length), 'Events'],
     medallists ? [n(medallists), medallists === 1 ? 'Athlete on the podium' : 'Athletes on the podium'] : null,
     t.run ? [n(t.run / 1000) + ' km', 'Run'] : null,
     t.walked ? [n(t.walked / 1000) + ' km', 'Race walked'] : null,
     t.jumped ? [len(t.jumped), 'Jumped'] : null, t.thrown ? [len(t.thrown), 'Thrown'] : null].filter(Boolean).forEach(function (x) {
      statBlock(dl, x[0], x[1]);
    });
    // the medals: a row of their own, under the rest, only when there's a podium
    var row = medalRow(dl, podiums > 0);
    if (row) {
      MEDALS.forEach(function (m, i) { statBlock(row, n(places[i]), places[i] === 1 ? m[1] : m[2], m[0]); });
    }
    dl.hidden = false;
  }

  /* Sorting -------------------------------------------------------------
     Within each season. A column heading sorts by that column (again to
     reverse it); the Sort by menu does the same, and is the way to sort by
     surname, and on a phone, where the headings aren't shown. */
  var SORT = { key: 'name', dir: 1 };
  // the way each column sorts first: names and age groups A-Z, the rest most first
  var FIRST_DIR = { name: 1, surname: 1, group: 1, results: -1, events: -1, last: -1 };
  var PARTICLES = /^(van|von|der|den|de|del|della|di|da|du|la|le|st\.?|mac|o')$/i;

  // "Mila Joy van den Heuvel" -> "van den Heuvel": the last word, with any
  // lower-case particles before it
  function surname(name) {
    var w = name.trim().split(/\s+/);
    var i = w.length - 1;
    while (i > 1 && PARTICLES.test(w[i - 1])) { i--; }
    return w.slice(i).join(' ');
  }
  function surnameKey(name) { return surname(name).toLowerCase(); }

  // Grade 7-14, then U16-U20, Senior, Masters
  function groupRank(g) {
    if (!g) { return 999; }
    var m = /(\d+)/.exec(g);
    return g === 'Senior' ? 100 : g === 'Masters' ? 101 : (/^U/.test(g) ? 50 : 0) + (m ? +m[1] : 0);
  }

  function compare(a, b) {
    var byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    var d = 0;
    switch (SORT.key) {
      case 'surname':
        d = surnameKey(a.name).localeCompare(surnameKey(b.name), 'en', { sensitivity: 'base' }); break;
      case 'group':
        d = groupRank(a.group) - groupRank(b.group) || (a.gender || 'z').localeCompare(b.gender || 'z'); break;
      case 'results': d = a.results - b.results; break;
      case 'events': d = a.events.length - b.events.length; break;
      case 'last':
        // no result yet: always at the end
        if (!a.last || !b.last) { return a.last ? -1 : b.last ? 1 : byName; }
        d = a.last < b.last ? -1 : a.last > b.last ? 1 : 0; break;
      default: d = byName;
    }
    return SORT.dir * d || byName;
  }

  function sortBy(key) {
    SORT = SORT.key === key ? { key: key, dir: -SORT.dir } : { key: key, dir: FIRST_DIR[key] };
    $('ix-sort').value = key;
    render();
  }

  // a column heading that sorts; the Athlete column keeps to first name or surname
  function heading(label, key) {
    var th = text('th');
    th.setAttribute('scope', 'col');
    var on = SORT.key === key || (key === 'name' && SORT.key === 'surname');
    var b = text('button', 'th-sort', label);
    b.type = 'button';
    b.title = 'Sort by ' + label.toLowerCase() + (on ? ' (again to reverse)' : '');
    if (on) {
      var up = SORT.dir === 1;
      th.setAttribute('aria-sort', up ? 'ascending' : 'descending');
      b.appendChild(text('span', 'th-sort__arrow', up ? ' ▲' : ' ▼'));
    }
    b.addEventListener('click', function () { sortBy(key === 'name' && SORT.key === 'surname' ? 'surname' : key); });
    th.appendChild(b);
    return th;
  }

  function filters() {
    return {
      grade: $('ix-grade').value,
      gender: $('ix-gender').value,
      event: $('ix-event').value,
      needle: $('ix-text').value.replace(/\s+/g, ' ').trim().toLowerCase()
    };
  }

  function render() {
    var f = filters();
    $('ix-clear').disabled = !(f.grade || f.gender || f.event || f.needle);
    var rows = all.filter(function (a) {
      if (f.grade) {
        var band = f.grade.indexOf('band:') === 0 && BANDS.filter(function (x) { return 'band:' + x.key === f.grade; })[0];
        if (band ? !(a.group && band.test(a.group)) : a.group !== f.grade) { return false; }
      }
      if (f.gender && a.gender !== f.gender) { return false; }
      if (f.event && a.events.indexOf(f.event) === -1) { return false; }
      if (f.needle && a.name.toLowerCase().indexOf(f.needle) === -1) { return false; }
      return true;
    });
    renderStats(rows);
    var out = $('ix-out');
    out.textContent = '';
    $('ix-status').textContent = rows.length === all.length
      ? all.length + ' athletes.'
      : 'Showing ' + rows.length + ' of ' + all.length + ' athletes.';
    if (!rows.length) { return; }

    // grouped by each athlete's most recent season (registered, or with results), newest first
    var seasons = [];
    rows.forEach(function (a) { if (seasons.indexOf(a.season) === -1) { seasons.push(a.season); } });
    seasons.sort().reverse();
    seasons.forEach(function (season) {
    var group = rows.filter(function (a) { return a.season === season; }).sort(compare);
    var block = text('div', 'records-grade');
    block.appendChild(text('h3', 'records-grade__head', season + ' season'));
    var wrap = text('div', 'table-wrap');
    var table = text('table', 'schedule ath-index');
    table.appendChild(text('caption', 'visually-hidden', 'North Canterbury athletes most recently registered or competing in ' + season));
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    [['Athlete', 'name'], ['Age group', 'group'], ['Results', 'results'], ['Events', 'events'],
     ['Last result', 'last']].forEach(function (h) { hr.appendChild(heading(h[0], h[1])); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    group.forEach(function (a) {
      var tr = document.createElement('tr');
      var who = text('th');
      who.setAttribute('scope', 'row');
      var link = text('a', null, a.name);
      link.href = '/athlete/#/' + (a.slug || a.id);
      who.appendChild(link);
      tr.appendChild(who);
      [['Age group', a.group ? (a.group.replace(/^Grade /, '') + ' ' + sex(a)).trim() : '–', 'champs-num'],
       ['Results', a.results, 'champs-num'],
       ['Events', a.events.length ? a.events.join(', ') : 'No results yet', 'champs-events'],
       ['Last result', a.last ? longDate(a.last) : '–', 'records-date']].forEach(function (c) {
        var td = text('td', c[2], c[1]);
        td.setAttribute('data-label', c[0]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    block.appendChild(wrap);
    out.appendChild(block);
    });
  }

  // Not signed in: a sign-in box instead of the list and its filters.
  function signedOut() {
    document.querySelector('#athletes .records-bar').hidden = true;
    $('ix-status').textContent = '';
    NCAN.signIn($('ix-signin'));
  }

  NCAN.me()
    .then(function (who) {
      NCAN.account($('account'), who);
      // the results sources page is for staff only: its link shows for them alone
      $('sources-link').hidden = !(who && ['admin', 'coach', 'committee'].indexOf(who.role) >= 0);
      if (!who) { signedOut(); return null; }
      return NCAN.get('/athletes');
    })
    .then(function (json) {
      if (!json) { return; }
      all = json.athletes || [];
      if (!all.length) {
        document.querySelector('#athletes .records-bar').hidden = true;
        $('ix-status').textContent = 'There are no athlete pages linked to your email address yet. ' +
          'If you think there should be, please contact the club.';
        return;
      }
      var grades = {}, events = {};
      all.forEach(function (a) {
        if (a.group) { grades[a.group] = 1; }
        a.events.forEach(function (e) { events[e] = 1; });
      });
      // each band is a heading in the list, with an option for the whole band first
      var order = Object.keys(grades).sort(function (a, b) { return groupRank(a) - groupRank(b); });
      BANDS.forEach(function (band) {
        var inBand = order.filter(function (g) { return band.test(g); });
        if (!inBand.length) { return; }
        var og = document.createElement('optgroup');
        og.label = band.label;
        var all = text('option', null, 'All ' + band.label.replace(/^Grades/, 'grades').replace(/^Youth/, 'youth').replace(/^Adults/, 'adults'));
        all.value = 'band:' + band.key;
        og.appendChild(all);
        inBand.forEach(function (g) { var o = text('option', null, g); o.value = g; og.appendChild(o); });
        $('ix-grade').appendChild(og);
      });
      // track by distance, then field; cross country, road and trail last, under a heading
      var OOS = ['Cross country', 'Road', 'Trail'];
      var away = function (e) { return OOS.indexOf(e) >= 0; };
      Object.keys(events).filter(function (e) { return !away(e); }).sort(function (a, b) {
        var na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) { return na - nb || a.localeCompare(b); }
        if (!isNaN(na)) { return -1; }
        if (!isNaN(nb)) { return 1; }
        return a.localeCompare(b);
      }).forEach(function (e) {
        var o = text('option', null, e); o.value = e; $('ix-event').appendChild(o);
      });
      var outside = OOS.filter(function (e) { return events[e]; });
      if (outside.length) {
        var og = document.createElement('optgroup');
        og.label = 'Out of stadia';
        outside.forEach(function (e) { var o = text('option', null, e); o.value = e; og.appendChild(o); });
        $('ix-event').appendChild(og);
      }
      if (json.updated) { $('ix-updated').textContent = 'Last updated ' + longDate(json.updated) + '.'; }
      ['ix-grade', 'ix-gender', 'ix-event'].forEach(function (id) { $(id).addEventListener('change', render); });
      $('ix-text').addEventListener('input', render);
      $('ix-sort').addEventListener('change', function () {
        SORT = { key: this.value, dir: FIRST_DIR[this.value] };
        render();
      });
      $('ix-clear').addEventListener('click', function () {
        ['ix-grade', 'ix-gender', 'ix-event', 'ix-text'].forEach(function (id) { $(id).value = ''; });
        render();
      });
      render();
    })
    .catch(function (err) {
      if (err.status === 401) { signedOut(); return; }
      $('ix-status').textContent = 'Sorry, the athletes could not be loaded. Please try again later.';
    });
}());
