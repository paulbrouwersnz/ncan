(function () {
  'use strict';

  /* Club championships ------------------------------------------------
     Everything is read from the club's API, without signing in:
     /v1/club-champs lists the seasons, newest first, and
     /v1/club-champs/<season> holds a season's programme, points scale and
     confirmed results. Results are proposed from the meetings' results and
     confirmed by a club administrator or coach (see
     assets/js/club-champs-review.js); the programme is kept in the private
     ncan-api project (config/club-champs/).

     The page opens on the season named in the address
     (/club-champs/#/season/2026-27), or else the newest season whose
     programme has been entered, so a season set up early with no programme
     yet does not greet visitors with an empty page. A Saturday or a result
     follows the season (#/season/2026-27/res-2026-10-31-girls-...); an
     in-page link (#standings, #res-...) is kept in that form. An old
     address (club-champs.html?season=2026-27#res-...) is turned into it.

     Points are never stored. Each result carries the athlete's place
     among North Canterbury athletes in their grade, and the page turns
     that into points with the file's "points" list, so changing the
     scale re-scores the whole season. */

  var API = NCAN.api + '/club-champs';
  var seasons = [];   // from index.json, newest first
  var GROUPS = ['7-9', '10-14'];
  var COLUMNS = [
    { gender: 'girls', group: '7-9', label: 'Girls 7–9' },
    { gender: 'boys', group: '7-9', label: 'Boys 7–9' },
    { gender: 'girls', group: '10-14', label: 'Girls 10–14' },
    { gender: 'boys', group: '10-14', label: 'Boys 10–14' }
  ];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var status = document.getElementById('champs-status');
  var updated = document.getElementById('champs-updated');
  var standingsOut = document.getElementById('standings-out');
  var programmeOut = document.getElementById('programme-out');
  var resultsOut = document.getElementById('results-out');
  var pointsOut = document.getElementById('points-out');
  var gradeSel = document.getElementById('filter-grade');
  var genderSel = document.getElementById('filter-gender');
  var textInput = document.getElementById('filter-text');
  // every control in either filter bar, grouped by what it sets
  function controls(kind) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-filter="' + kind + '"]'));
  }
  var resultsStatus = document.getElementById('results-status');

  var data = null;
  var results = [];
  var names = [];   // entered names that do not look like full names
  var unlinked = 0; // results with no link to the official results
  // Saturdays opened or closed by hand, by date; forgotten when the filters change.
  // Otherwise the newest Saturday is open, or every Saturday when filtering.
  var dayOpen = {};

  function text(tag, cls, value) {
    var el = document.createElement(tag);
    if (cls) { el.className = cls; }
    if (value !== undefined && value !== null) { el.textContent = value; }
    return el;
  }

  function parseDate(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function longDate(iso) {
    var d = parseDate(iso);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function shortDate(iso) {
    var d = parseDate(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // e.g. res-2026-10-31-girls-11-800m-maci-jayne-martin
  function rowId(r) {
    return 'res-' + [r.date, r.gender, r.grade, slug(r.event), slug(r.athlete)].join('-');
  }

  function groupOf(grade) {
    return grade <= 9 ? '7-9' : '10-14';
  }

  function title(gender) {
    return gender === 'girls' ? 'Girls' : 'Boys';
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function pointsFor(place) {
    var scale = data.points;
    if (!place || place < 1) { return scale[scale.length - 1]; }
    return scale[Math.min(place, scale.length) - 1];
  }

  function eventsAt(meeting, gender, group) {
    return ((meeting[gender] || {})[group]) || [];
  }

  function todayIso() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* Results ----------------------------------------------------------- */

  // Cleans each row and checks it against the programme, so a typo in the
  // event or date is reported rather than silently scoring.
  function prepare() {
    var problems = [];
    results = [];
    names = [];
    unlinked = 0;
    (data.results || []).forEach(function (raw, i) {
      var r = {
        date: String(raw.date || '').trim(),
        gender: String(raw.gender || '').trim().toLowerCase(),
        grade: parseInt(raw.grade, 10),
        event: String(raw.event || '').trim(),
        place: parseInt(raw.place, 10) || 0,
        // runs of spaces collapse, so a stray double space does not split an athlete
        athlete: String(raw.athlete || '').replace(/\s+/g, ' ').trim(),
        mark: raw.mark ? String(raw.mark).trim() : '',
        source: raw.source ? String(raw.source).trim() : ''
      };
      var label = 'Result ' + (i + 1) + (r.athlete ? ' (' + r.athlete + ')' : '');
      if (!r.athlete) { problems.push(label + ' has no athlete'); return; }
      if (r.gender !== 'girls' && r.gender !== 'boys') {
        problems.push(label + ': gender should be girls or boys'); return;
      }
      if (!(r.grade >= 7 && r.grade <= 14)) {
        problems.push(label + ': grade should be 7 to 14'); return;
      }
      var meeting = data.meetings.filter(function (m) { return m.date === r.date; })[0];
      if (!meeting) {
        problems.push(label + ': no championship meeting on ' + r.date); return;
      }
      var allowed = eventsAt(meeting, r.gender, groupOf(r.grade));
      if (allowed.indexOf(r.event) === -1) {
        problems.push(label + ': ' + r.event + ' is not a ' + title(r.gender).toLowerCase() +
                      ' ' + groupOf(r.grade) + ' championship event on ' + shortDate(r.date));
        return;
      }
      r.points = pointsFor(r.place);
      results.push(r);
      if (!r.source) { unlinked++; }
      // full names are the rule; an initial or a single word is probably a slip
      // that would score this athlete under two names, so say so (it still counts).
      // Only with full names (signed in): the public sees initials ("S Brown") anyway.
      var parts = r.athlete.split(' ');
      if (data.full_names !== false && (parts.length < 2 || parts[0].replace(/\./g, '').length < 2)) {
        names.push(r.athlete);
      }
    });
    return problems;
  }

  /* Filters --------------------------------------------------------------
     The bar above the standings filters the results too. Search looks in
     athlete names only, ignoring capitals; events have their own filter. */

  var eventNames = [];   // every event on the programme, filled once the data loads

  /* The event box takes a full event name, in any capitals, or part of one:
     "discus" is the Discus, "jump" is every jumping event. */
  function eventFilter() {
    var typed = document.getElementById('filter-event').value.replace(/\s+/g, ' ').trim();
    if (!typed) { return { event: '', part: '' }; }
    var exact = eventNames.filter(function (n) { return n.toLowerCase() === typed.toLowerCase(); })[0];
    return exact ? { event: exact, part: '' } : { event: '', part: typed.toLowerCase() };
  }

  function eventMatches(name, f) {
    if (f.event) { return name === f.event; }
    if (f.eventPart) { return name.toLowerCase().indexOf(f.eventPart) !== -1; }
    return true;
  }

  // The grade select holds a single grade ("9") or an age group ("7-9").
  function currentFilters() {
    var g = gradeSel.value;
    var isGroup = g.indexOf('-') !== -1;
    return {
      grade: g && !isGroup ? parseInt(g, 10) : null,
      group: isGroup ? g : null,
      gender: genderSel.value,
      event: eventFilter().event,
      eventPart: eventFilter().part,
      needle: textInput.value.replace(/\s+/g, ' ').trim().toLowerCase()
    };
  }

  function isFiltered(f) {
    return f.grade !== null || !!f.group || !!f.gender || !!f.event || !!f.eventPart || !!f.needle;
  }

  function resultMatches(r, f) {
    if (f.grade !== null && r.grade !== f.grade) { return false; }
    if (f.group && groupOf(r.grade) !== f.group) { return false; }
    if (f.gender && r.gender !== f.gender) { return false; }
    if (!eventMatches(r.event, f)) { return false; }
    if (f.needle && r.athlete.toLowerCase().indexOf(f.needle) === -1) { return false; }
    return true;
  }

  /* Standings ---------------------------------------------------------- */

  function standingsFor(gender, grade) {
    var byAthlete = {};
    results.forEach(function (r) {
      if (r.gender !== gender || r.grade !== grade) { return; }
      var key = r.athlete.toLowerCase();
      if (!byAthlete[key]) { byAthlete[key] = { athlete: r.athlete, points: 0, events: [] }; }
      byAthlete[key].points += r.points;
      byAthlete[key].events.push(r);
    });
    var rows = Object.keys(byAthlete).map(function (k) { return byAthlete[k]; });
    rows.sort(function (a, b) {
      return b.points - a.points || a.athlete.localeCompare(b.athlete);
    });
    // equal points share a rank: 1, 2, 2, 4
    rows.forEach(function (row, i) {
      row.rank = (i > 0 && row.points === rows[i - 1].points) ? rows[i - 1].rank : i + 1;
    });
    return rows;
  }

  function standingsTable(gender, grade, rows) {
    var wrap = text('div', 'table-wrap');
    var table = text('table', 'schedule champs-table');
    table.appendChild(text('caption', null, title(gender) + ' · grade ' + grade));

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['Athlete', 'Place', 'Events', 'Points'].forEach(function (label) {
      var th = text('th', null, label);
      th.setAttribute('scope', 'col');
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var who = text('th', null, row.athlete);
      who.setAttribute('scope', 'row');
      tr.appendChild(who);

      var place = text('td', 'champs-num', ordinal(row.rank));
      place.setAttribute('data-label', 'Place');
      tr.appendChild(place);

      var events = text('td', 'champs-events');
      row.events.forEach(function (r, i) {
        if (i) { events.appendChild(document.createTextNode(', ')); }
        var a = text('a', 'champs-event', r.event + ' (' + r.points + ')');
        a.href = '#' + rowId(r);
        a.title = r.athlete + ', ' + r.event + ' on ' + shortDate(r.date) + ': see the result';
        events.appendChild(a);
      });
      events.setAttribute('data-label', 'Events');
      tr.appendChild(events);

      var pts = text('td', 'champs-num champs-points', row.points);
      pts.setAttribute('data-label', 'Points');
      tr.appendChild(pts);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderStandings() {
    var f = currentFilters();
    var gradeWanted = f.grade;
    var genderWanted = f.gender;
    standingsOut.textContent = '';

    if (!results.length) {
      status.textContent = 'No results have been entered yet. Points will appear here once ' +
                           'the first championship results are in.';
      return;
    }

    var shown = 0;
    for (var grade = 7; grade <= 14; grade++) {
      if (gradeWanted !== null && grade !== gradeWanted) { continue; }
      if (f.group && groupOf(grade) !== f.group) { continue; }
      var block = text('div', 'records-grade');
      var grid = text('div', 'champs-grid');
      ['girls', 'boys'].forEach(function (gender) {
        if (genderWanted && gender !== genderWanted) { return; }
        // filtered after ranking, so a search never changes anyone's place
        var rows = standingsFor(gender, grade).filter(function (row) {
          if (!row.events.some(function (r) { return eventMatches(r.event, f); })) {
            return false;
          }
          return !f.needle || row.athlete.toLowerCase().indexOf(f.needle) !== -1;
        });
        if (!rows.length) { return; }
        grid.appendChild(standingsTable(gender, grade, rows));
        shown += rows.length;
      });
      if (grid.childNodes.length) {
        block.appendChild(text('h3', 'records-grade__head', 'Grade ' + grade));
        block.appendChild(grid);
        standingsOut.appendChild(block);
      }
    }
    status.textContent = shown
      ? shown + ' athlete' + (shown === 1 ? '' : 's') + ' on the board.'
      : (isFiltered(f) ? 'No athletes match those filters.' : 'No points yet for that selection.');
  }

  /* Programme ---------------------------------------------------------- */

  function renderProgramme() {
    var today = todayIso();
    var nextFound = false;
    var wrap = text('div', 'table-wrap');
    var table = text('table', 'schedule champs-programme');
    table.appendChild(text('caption', null, 'Championship events by Saturday'));

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['Date'].concat(COLUMNS.map(function (c) { return c.label; })).forEach(function (label) {
      var th = text('th', null, label);
      th.setAttribute('scope', 'col');
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    data.meetings.forEach(function (m) {
      var tr = document.createElement('tr');
      var when = text('th', null, longDate(m.date));
      when.setAttribute('scope', 'row');

      var tag = null;
      var hasResults = results.some(function (r) { return r.date === m.date; });
      if (m.date >= today && !nextFound) {
        nextFound = true;
        tag = text('span', 'champs-tag champs-tag--next', m.date === today ? 'Today' : 'Next');
      } else if (m.date < today) {
        tag = text('span', 'champs-tag', hasResults ? 'Results in' : 'Results to come');
      }
      if (hasResults) {
        // the date and its "Results in" label take you to that Saturday's results
        when.textContent = '';
        var go = text('a', 'champs-date-link', longDate(m.date));
        go.href = '#results-' + m.date;
        go.setAttribute('data-date', m.date);
        go.title = 'See the results from ' + longDate(m.date);
        if (tag) { go.appendChild(document.createTextNode(' ')); go.appendChild(tag); }
        when.appendChild(go);
      } else if (tag) {
        when.appendChild(document.createTextNode(' '));
        when.appendChild(tag);
      }
      if (m.note) { when.appendChild(text('span', 'champs-note', m.note)); }
      tr.appendChild(when);

      COLUMNS.forEach(function (c) {
        var list = eventsAt(m, c.gender, c.group);
        var td = text('td', list.length ? null : 'champs-none', list.length ? null : 'None');
        list.forEach(function (ev, i) {
          if (i) { td.appendChild(document.createTextNode(', ')); }
          var a = text('a', 'champs-event', ev);
          a.href = '#results';
          a.setAttribute('data-event', ev);
          a.setAttribute('data-gender', c.gender);
          a.setAttribute('data-group', c.group);
          a.title = 'Show the results for ' + c.label + ' ' + ev;
          td.appendChild(a);
        });
        td.setAttribute('data-label', c.label);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    programmeOut.textContent = '';
    programmeOut.appendChild(wrap);
  }

  /* Results by meeting -------------------------------------------------- */

  function renderResults() {
    var f = currentFilters();
    resultsOut.textContent = '';
    resultsStatus.textContent = '';
    if (!results.length) {
      resultsStatus.textContent = 'No results have been entered yet.';
      return;
    }
    var matching = results.filter(function (r) { return resultMatches(r, f); });
    if (isFiltered(f)) {
      resultsStatus.textContent = matching.length
        ? 'Showing ' + matching.length + ' of ' + results.length + ' results.'
        : (f.event && !f.needle ? 'No results yet for that event.' : 'No results match those filters.');
    }
    var meetingsWithResults = data.meetings.filter(function (m) {
      return matching.some(function (r) { return r.date === m.date; });
    });

    var filtered = isFiltered(f);
    var newest = meetingsWithResults.length ? meetingsWithResults[meetingsWithResults.length - 1].date : '';

    // newest first: the latest round is what people come looking for
    meetingsWithResults.slice().reverse().forEach(function (m) {
      var rows = matching.filter(function (r) { return r.date === m.date; });
      rows.sort(function (a, b) {
        // by grade, girls then boys within it, as in the standings; then by event,
        // in the programme's order; an athlete with no place (no mark) comes last
        return a.grade - b.grade || b.gender.localeCompare(a.gender) ||
               eventRank(a.event) - eventRank(b.event) || a.event.localeCompare(b.event) ||
               (a.place || 999) - (b.place || 999) || a.athlete.localeCompare(b.athlete);
      });

      var wrap = text('div', 'table-wrap');
      var table = text('table', 'schedule champs-table champs-results');
      // the heading row above says which Saturday; the caption is for screen readers
      table.appendChild(text('caption', 'visually-hidden', 'Results, ' + longDate(m.date)));

      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      ['Athlete', 'Grade', 'Event', 'Place', 'Mark', 'Points'].forEach(function (label) {
        var th = text('th', null, label);
        th.setAttribute('scope', 'col');
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      // nested bands: the grade ("Girls · grade 9"), then each event within it
      var lastBand = null, lastEvent = null;
      var bandRow = function (label, cls) {
        var btr = text('tr', cls);
        var bth = text('th', null, label);
        bth.setAttribute('scope', 'colgroup');
        bth.colSpan = 6;
        btr.appendChild(bth);
        tbody.appendChild(btr);
      };
      rows.forEach(function (r) {
        var band = title(r.gender) + ' · grade ' + r.grade;
        if (band !== lastBand) {
          bandRow(band, 'schedule__band');
          lastBand = band;
          lastEvent = null;
        }
        if (r.event !== lastEvent) {
          bandRow(r.event, 'schedule__band schedule__band--sub');
          lastEvent = r.event;
        }
        var tr = document.createElement('tr');
        tr.id = rowId(r);
        var who = text('th', null, r.athlete);
        who.setAttribute('scope', 'row');
        tr.appendChild(who);
        [['Grade', band, null],
         ['Event', r.event, null],
         ['Place', r.place ? ordinal(r.place) : '–', 'champs-num'],
         ['Mark', r.mark || '–', 'champs-num'],
         ['Points', r.points, 'champs-num champs-points']].forEach(function (cell) {
          var td = text('td', cell[2], cell[0] === 'Mark' && r.source ? null : cell[1]);
          td.setAttribute('data-label', cell[0]);
          if (cell[0] === 'Mark' && r.source) {
            var a = text('a', 'records-source', cell[1]);
            a.href = r.source;
            a.target = '_blank';
            a.rel = 'noopener';
            a.title = 'Official results for this event';
            td.appendChild(a);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);

      var block = text('details', 'champs-day');
      block.id = 'results-' + m.date;
      block.open = m.date in dayOpen ? dayOpen[m.date] : (filtered || m.date === newest);
      var head = text('summary', 'champs-day__head');
      head.appendChild(text('h3', 'champs-day__title', longDate(m.date)));
      head.appendChild(text('span', 'champs-day__count',
                            rows.length + ' result' + (rows.length === 1 ? '' : 's')));
      if (m.results) {
        var all = text('a', 'records-source champs-day__all', 'All results');
        all.href = m.results;
        all.target = '_blank';
        all.rel = 'noopener';
        all.title = 'The full meeting on AthleticLIVE';
        head.appendChild(all);
      }
      if (m.ncan) {
        // every North Canterbury result that day, championship events or not
        var ours = text('a', 'records-source champs-day__all', 'NCAN results');
        ours.href = m.ncan;
        ours.target = '_blank';
        ours.rel = 'noopener';
        ours.title = 'All of North Canterbury’s results at this meeting, on AthleticLIVE. Places there are overall, not among NCAN athletes.';
        head.appendChild(ours);
      }
      // a sheet of the day's event winners, for reading out at Tuesday training
      var print = text('button', 'btn btn--ghost champs-day__print', 'Print winners');
      print.type = 'button';
      print.title = 'Print the winners of each championship event on ' + longDate(m.date);
      print.addEventListener('click', function (e) {
        e.preventDefault();      // a button in the summary would otherwise fold the day
        e.stopPropagation();
        printWinners(m.date);
      });
      head.appendChild(print);
      block.appendChild(head);
      var body = text('div', 'champs-day__body');
      body.appendChild(wrap);
      block.appendChild(body);
      block.addEventListener('toggle', function () { dayOpen[m.date] = block.open; });
      resultsOut.appendChild(block);
    });
  }

  /* Winners sheet, to print ---------------------------------------------- */

  // Every winner (1st, ties included) of each championship event that Saturday,
  // by grade and then event, whatever the filters show. Printed on its own: the
  // page's print styles hide everything else while body has .champs-printing.
  function printWinners(date) {
    var rows = results.filter(function (r) { return r.date === date && r.place === 1; });
    rows.sort(function (a, b) {
      return a.grade - b.grade || b.gender.localeCompare(a.gender) ||
             eventRank(a.event) - eventRank(b.event) || a.event.localeCompare(b.event) ||
             a.athlete.localeCompare(b.athlete);
    });
    var sheet = document.getElementById('champs-print');
    if (!sheet) {
      sheet = text('div', 'champs-print');
      sheet.id = 'champs-print';
      document.body.appendChild(sheet);
    }
    sheet.textContent = '';
    var head = text('div', 'champs-print__head');
    var logo = document.createElement('img');
    logo.src = '/assets/img/logo.svg';
    logo.alt = 'North Canterbury Athletic Club';
    logo.className = 'champs-print__logo';
    head.appendChild(logo);
    var words = text('div');
    words.appendChild(text('h1', 'champs-print__title', 'Children’s Club Championships'));
    words.appendChild(text('p', 'champs-print__date',
      'Event winners · ' + longDate(date) + ' ' + date.slice(0, 4)));
    head.appendChild(words);
    sheet.appendChild(head);

    if (!rows.length) {
      sheet.appendChild(text('p', null, 'No winners have been entered for this day yet.'));
    } else {
      var table = text('table', 'champs-print__table');
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      ['Event', 'Winner', 'Mark'].forEach(function (label) {
        var th = text('th', null, label);
        th.setAttribute('scope', 'col');
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      var lastBand = null;
      rows.forEach(function (r) {
        var band = title(r.gender) + ' · grade ' + r.grade;
        if (band !== lastBand) {
          var btr = text('tr', 'champs-print__band');
          var bth = text('th', null, band);
          bth.setAttribute('scope', 'colgroup');
          bth.colSpan = 3;
          btr.appendChild(bth);
          tbody.appendChild(btr);
          lastBand = band;
        }
        var tr = document.createElement('tr');
        tr.appendChild(text('td', null, r.event));
        tr.appendChild(text('td', 'champs-print__who', r.athlete));
        tr.appendChild(text('td', null, r.mark || '–'));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      sheet.appendChild(table);
    }
    // back to this season's page: the address in words and as a QR code to scan
    var seasonId = (controls('season')[0] || {}).value || '';
    var url = 'https://ncan.nz/club-champs/' + (seasonId ? '#/season/' + encodeURIComponent(seasonId) : '');
    var foot = text('div', 'champs-print__foot');
    var words2 = text('div', 'champs-print__foot-words');
    words2.appendChild(text('p', 'champs-print__foot-lead',
      'Every result and the standings' + (data && data.season ? ' for ' + data.season : '') + ':'));
    words2.appendChild(text('p', 'champs-print__url', url.replace(/^https:\/\//, '')));
    words2.appendChild(text('p', null, 'Placings count North Canterbury athletes only, within each grade.'));
    foot.appendChild(words2);
    if (window.NCANQR) {
      try { foot.appendChild(NCANQR.svg(url, { size: '28mm' })); } catch (e) { /* the address in words is enough */ }
    }
    sheet.appendChild(foot);

    document.body.classList.add('champs-printing');
    window.print();
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('champs-printing'); });

  /* Points explainer ---------------------------------------------------- */

  function renderPoints() {
    var scale = data.points;
    var items = scale.map(function (p, i) {
      var place = i === scale.length - 1 ? ordinal(i + 1) + ' or beyond' : ordinal(i + 1);
      return place + ': ' + p + ' point' + (p === 1 ? '' : 's');
    });
    var cards = [
      ['Points per placing', items.join(' · ')],
      ['Event champions', 'The winner of each championship event in each grade is recognised at ' +
                          'Tuesday training night.'],
      ['Club champions', 'Points add up over the season. The athlete with the most in each grade ' +
                         'is club champion, celebrated at prize-giving.']
    ];
    pointsOut.textContent = '';
    cards.forEach(function (c) {
      var li = text('li', 'honour');
      li.appendChild(text('h3', null, c[0]));
      li.appendChild(text('p', null, c[1]));
      pointsOut.appendChild(li);
    });
  }

  /* Start --------------------------------------------------------------- */

  controls('grade').forEach(function (sel) {
    var groups = text('optgroup');
    groups.label = 'Age groups';
    [['7-9', 'Grades 7–9'], ['10-14', 'Grades 10–14']].forEach(function (pair) {
      var opt = text('option', null, pair[1]);
      opt.value = pair[0];
      groups.appendChild(opt);
    });
    sel.appendChild(groups);
    var grades = text('optgroup');
    grades.label = 'Grades';
    for (var g = 7; g <= 14; g++) {
      var opt = text('option', null, 'Grade ' + g);
      opt.value = String(g);
      grades.appendChild(opt);
    }
    sel.appendChild(grades);
  });

  /* The event list comes from the programme, sprints first and field
     events last, so it reads in the same order as a meeting. */
  var EVENT_ORDER = ['60m', '100m', '200m', '400m', '600m', '800m', '1000m', '1500m',
                     'Hurdles', 'Race Walk', 'Shot Put', 'Discus', 'Javelin',
                     'Long Jump', 'High Jump', 'Triple Jump'];
  // an event's place in that order: '80m Hurdles' goes with Hurdles; unknown events last
  function eventRank(ev) {
    var i = EVENT_ORDER.indexOf(ev);
    if (i === -1) {
      EVENT_ORDER.some(function (o, j) { if (ev.indexOf(o) !== -1) { i = j; return true; } return false; });
    }
    return i === -1 ? 999 : i;
  }
  function fillEvents() {
    var seen = {};
    data.meetings.forEach(function (m) {
      ['girls', 'boys'].forEach(function (gender) {
        GROUPS.forEach(function (group) {
          eventsAt(m, gender, group).forEach(function (ev) { seen[ev] = true; });
        });
      });
    });
    var list = Object.keys(seen).sort(function (a, b) {
      var ia = EVENT_ORDER.indexOf(a), ib = EVENT_ORDER.indexOf(b);
      if (ia === -1) { ia = 999; }
      if (ib === -1) { ib = 999; }
      return ia - ib || a.localeCompare(b);
    });
    eventNames = list;
  }
  function renderFiltered() {
    dayOpen = {};
    var off = !isFiltered(currentFilters());
    controls('clear').forEach(function (btn) { btn.disabled = off; });
    if (!data) { return; }
    renderStandings();
    renderResults();
  }

  // The standings bar holds the filters; the results bar mirrors it.
  function setFilter(kind, value) {
    controls(kind).forEach(function (el) {
      if (el.value !== value) { el.value = value; }
    });
  }

  ['grade', 'gender', 'event', 'text'].forEach(function (kind) {
    controls(kind).forEach(function (el) {
      el.addEventListener(kind === 'text' || kind === 'event' ? 'input' : 'change', function () {
        setFilter(kind, el.value);
        renderFiltered();
      });
    });
  });

  function clearFilters() {
    setFilter('grade', '');
    setFilter('gender', '');
    setFilter('event', '');
    setFilter('text', '');
    renderFiltered();
  }

  controls('clear').forEach(function (btn) {
    btn.addEventListener('click', function () {
      clearFilters();
      // back to the search box in the bar that was used
      btn.closest('.records-bar').querySelector('[data-filter="text"]').focus();
    });
  });
  renderFiltered();

  // A standings link to a result the filters are hiding clears them first,
  // so the link always lands on its row.
  // res-2026-10-31-girls-... and results-2026-10-31 both carry the Saturday's date
  function dateIn(id) {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(id);
    return m ? m[1] : '';
  }

  // open the Saturday holding this id, and (unless told not to) scroll to it
  function reveal(id, noScroll) {
    var el = document.getElementById(id);
    var day = el && (el.matches('details.champs-day') ? el : el.closest('details.champs-day'));
    if (day && !day.open) { day.open = true; dayOpen[dateIn(id)] = true; }
    if (el && !noScroll) { el.scrollIntoView(); }
    return el;
  }

  // a result row jumped to stands out for a moment (the CSS's .is-target)
  function flash(row) {
    Array.prototype.forEach.call(document.querySelectorAll('.champs-results tr.is-target'), function (r) {
      r.classList.remove('is-target');
    });
    if (!row || row.tagName !== 'TR') { return; }
    row.classList.add('is-target');
    Array.prototype.forEach.call(row.children, function (cell) {
      cell.style.animation = 'none';
      void cell.offsetWidth;
      cell.style.animation = '';
    });
  }

  /* The address: #/season/2026-27, then optionally a part of the page:
     #/season/2026-27/standings, .../results-2026-10-31, .../res-2026-10-31-... */
  var seasonId = '';
  function route() {
    var m = /^#\/season\/(\d{4}-\d{2})(?:\/([A-Za-z][\w-]*))?$/.exec(location.hash);
    return m ? { season: m[1], part: m[2] || '' } : null;
  }
  // arriving: straight there, as a link to a part of the page does; within the page: smoothly
  function goTo(part, arriving) {
    if (!part) { return; }
    var how = arriving ? { behavior: 'instant' } : undefined;
    if (/^res(ults)?-/.test(part)) {
      var row = reveal(part, true);
      if (row) { row.scrollIntoView(how); }
      flash(row);
      return;
    }
    var el = document.getElementById(part);
    if (el) { el.scrollIntoView(how); }
  }
  function setAddress(part) {
    if (window.history && history.replaceState) {
      history.replaceState(null, '', location.pathname + '#/season/' + seasonId + (part ? '/' + part : ''));
    }
  }
  window.addEventListener('hashchange', function () {
    var now = route();
    if (!now) {
      // a plain in-page link (#standings, #res-..., the skip link's #main): keep the season
      var part = location.hash.slice(1);
      setAddress(part);
      goTo(part);
      return;
    }
    if (now.season !== seasonId) {
      var known = seasons.some(function (x) { return x.id === now.season; });
      if (known) { loadSeason(now.season, true).catch(failed); }
      return;
    }
    goTo(now.part);
  });

  standingsOut.addEventListener('click', function (event) {
    var link = event.target.closest('a.champs-event');
    if (!link) { return; }
    event.preventDefault();
    var id = link.getAttribute('href').slice(1);
    if (!document.getElementById(id)) { clearFilters(); }
    var row = reveal(id, true);   // unfold its Saturday before jumping
    if (!row) { return; }
    var now = route();
    if (!now || now.part !== id) {
      location.hash = id;         // a jump: kept as #/season/.../<row>, scrolls and highlights it
    } else {
      // the same link again: the address doesn't change, so replay it by hand
      row.scrollIntoView();
      flash(row);
    }
  });

  /* Event dropdown ----------------------------------------------------
     A text box with its own list underneath: click or arrow down to see
     every event, type to narrow it, Enter or a click to choose. (The
     browser's built-in suggestion list can't be positioned, and some
     browsers open it well away from the box.) */
  function combobox(input) {
    var list = document.getElementById(input.getAttribute('aria-controls'));
    var active = -1;

    function options() { return Array.prototype.slice.call(list.children); }

    function highlight(i) {
      var opts = options();
      active = opts.length ? (i + opts.length) % opts.length : -1;
      opts.forEach(function (li, n) { li.setAttribute('aria-selected', n === active ? 'true' : 'false'); });
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', opts[active].id);
        opts[active].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function open(showAll) {
      var typed = showAll ? '' : input.value.trim().toLowerCase();
      var exact = eventNames.some(function (n) { return n.toLowerCase() === typed; });
      list.textContent = '';
      eventNames.forEach(function (name, i) {
        // once a whole event is chosen, the list offers every event again
        if (typed && !exact && name.toLowerCase().indexOf(typed) === -1) { return; }
        var li = text('li', 'champs-combo__option', name);
        li.id = list.id + '-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        if (name.toLowerCase() === typed) { li.classList.add('is-current'); }
        list.appendChild(li);
      });
      list.hidden = !list.children.length;
      input.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function choose(name) {
      input.value = name;
      setFilter('event', name);
      renderFiltered();
      close();
    }

    input.addEventListener('focus', function () { open(true); });
    input.addEventListener('click', function () { if (list.hidden) { open(true); } });
    input.addEventListener('input', function () { open(false); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) { open(true); }
        highlight(e.key === 'ArrowDown' ? active + 1 : (active < 0 ? -1 : active - 1));
      } else if (e.key === 'Enter') {
        if (!list.hidden && active >= 0) {
          e.preventDefault();
          choose(options()[active].textContent);
        }
      } else if (e.key === 'Escape' && !list.hidden) {
        e.preventDefault();
        close();
      }
    });
    // mousedown, so the choice lands before the box loses focus
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li');
      if (!li) { return; }
      e.preventDefault();
      choose(li.textContent);
    });
  }

  programmeOut.addEventListener('click', function (event) {
    var day = event.target.closest('a[data-date]');
    if (day) {
      event.preventDefault();
      var id = 'results-' + day.getAttribute('data-date');
      if (!document.getElementById(id)) { clearFilters(); }
      reveal(id);
      return;
    }
    var link = event.target.closest('a[data-event]');
    if (!link) { return; }
    event.preventDefault();
    setFilter('text', '');
    setFilter('event', link.getAttribute('data-event'));
    setFilter('gender', link.getAttribute('data-gender'));
    setFilter('grade', link.getAttribute('data-group'));
    renderFiltered();
    document.getElementById('results').scrollIntoView();
  });

  controls('event').forEach(combobox);

  function getJson(url) {
    // with the sign-in cookie: signed in, the names are full; otherwise initial and surname
    return fetch(url, { cache: 'no-cache', credentials: 'include' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
  }

  // switching season starts the filters afresh: last year's grade 9 is not this year's
  function resetFilters() {
    ['grade', 'gender', 'event', 'text'].forEach(function (kind) { setFilter(kind, ''); });
  }

  // opening: the first load, when a #result in the address should be honoured
  function loadSeason(id, opening) {
    var season = seasons.filter(function (x) { return x.id === id; })[0] || seasons[0];
    setFilter('season', season.id);
    resetFilters();
    data = null;
    renderFiltered();
    status.textContent = 'Loading the ' + season.label + ' championships…';
    standingsOut.textContent = '';
    resultsOut.textContent = '';
    resultsStatus.textContent = '';
    updated.textContent = '';
    document.getElementById('champs-season').textContent = season.label;

    // The address always names the season, newest included, so any link copied
    // from it keeps pointing at that season after a newer one is added.
    // Switching season drops a #result, which belonged to the season left behind.
    var asked = route();
    seasonId = season.id;
    setAddress(opening && asked && asked.season === season.id ? asked.part : '');

    if (window.ChampsReview) { ChampsReview.season(season.id); }
    // Switching quickly, an earlier season's reply can arrive after a later one's:
    // only the season still chosen is shown (a late reply, or its error, is dropped)
    var stale = function () { return seasonId !== season.id; };
    return getJson(API + '/' + season.id).then(function (json) {
      if (stale()) { return; }
      data = json;
      document.getElementById('champs-names').hidden = json.full_names !== false;
      data.meetings = (data.meetings || []).slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
      if (data.season) {
        document.getElementById('champs-season').textContent = data.season;
      }
      var problems = prepare();
      fillEvents();
      renderStandings();
      renderProgramme();
      renderResults();
      renderPoints();
      // a link to a result, a Saturday or a part of the page opens it on arrival
      var arrived = route();
      if (opening && arrived && arrived.part) { goTo(arrived.part, true); }

      var note = data.updated ? 'Last updated ' + shortDate(data.updated) + ' ' +
                                parseDate(data.updated).getFullYear() + '.' : '';
      if (problems.length) {
        if (window.console) { problems.forEach(function (p) { console.warn(season.id + ': ' + p); }); }
        note += ' ' + problems.length + ' result' + (problems.length === 1 ? ' was' : 's were') +
                ' left out because ' + (problems.length === 1 ? 'it does' : 'they do') +
                ' not match the programme.';
      }
      if (unlinked) {
        note += ' ' + unlinked + ' result' + (unlinked === 1 ? ' has' : 's have') +
                ' no link to the official results yet.';
      }
      var odd = names.filter(function (n, i) { return names.indexOf(n) === i; });
      if (odd.length) {
        if (window.console) { console.warn(season.id + ': not full names: ' + odd.join(', ')); }
        note += ' Check ' + (odd.length === 1 ? 'this name, which does' : 'these names, which do') +
                ' not look like a full name: ' + odd.join(', ') + '.';
      }
      updated.textContent = note;
    }, function (err) {
      if (stale()) { return; }
      throw err;
    });
  }


  // the newest season with a programme; if none has one yet, the newest of all
  function defaultSeason(i) {
    if (i >= seasons.length) { return Promise.resolve(seasons[0].id); }
    return Promise.resolve(seasons[i].programme ? seasons[i].id : defaultSeason(i + 1));
  }

  function failed() {
    status.textContent = 'Sorry, the championships could not be loaded. Please try again later.';
    programmeOut.textContent = '';
    resultsOut.textContent = '';
  }

  controls('season').forEach(function (sel) {
    sel.addEventListener('change', function () {
      loadSeason(sel.value).catch(failed);
    });
  });

  getJson(API)
    .then(function (index) {
      seasons = (index.seasons || []).filter(function (x) { return x && x.id; });
      if (!seasons.length) { throw new Error('no seasons'); }
      controls('season').forEach(function (sel) {
        seasons.forEach(function (x) {
          var opt = text('option', null, x.label || x.id);
          opt.value = x.id;
          sel.appendChild(opt);
        });
      });
      // #/season/2026-27; an old address's ?season=2026-27 (and its #part) becomes that;
      // a plain #part with no season is the newest season's
      var r = route();
      var asked = r ? r.season : new URLSearchParams(location.search).get('season');
      if (!r && window.history && history.replaceState) {
        var part = location.hash.slice(1);
        history.replaceState(null, '', location.pathname + (asked ? '#/season/' + asked + (part ? '/' + part : '')
                                                                   : (part ? '#' + part : '')));
      }
      var known = seasons.some(function (x) { return x.id === asked; });
      return (known ? Promise.resolve(asked) : defaultSeason(0)).then(function (id) {
        return loadSeason(id, true);
      });
    })
    .catch(failed);
}());
