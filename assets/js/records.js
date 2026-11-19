(function () {
  'use strict';

  /* The record book ---------------------------------------------------
     Everything is read from assets/data/records.json, which is the only
     place the records live. Edit that file to change what appears here;
     nothing is duplicated into this page. */

  var DATA_URL = '/assets/data/records.json';
  var out = document.getElementById('records-out');
  var status = document.getElementById('records-status');
  var updated = document.getElementById('records-updated');
  var gradeSel = document.getElementById('filter-grade');
  var genderSel = document.getElementById('filter-gender');
  var textInput = document.getElementById('filter-text');
  var exportBtn = document.getElementById('export-csv');

  var all = [];
  var shown = [];

  /* Event order -------------------------------------------------------
     Events are grouped, and the groups run in a fixed sequence, so every
     grade reads the same way. Within a group, running events sort by
     distance and field events by discipline then implement weight -
     numerically, so 800m comes before 1500m and Shot Put 1 kg before
     1.5 kg, which alphabetical sorting gets wrong.

     To change the running order, reorder GROUPS. To change the order of
     disciplines inside Throws or Jumps, reorder SUB_ORDER. */
  var GROUPS = ['Sprints', 'Hurdles', 'Relays', 'Distance', 'Walks',
                'Throws', 'Jumps', 'Other'];

  var SUB_ORDER = {
    Throws: ['discus', 'shot put', 'javelin', 'hammer'],
    Jumps: ['long jump', 'high jump', 'triple jump', 'pole vault']
  };

  // the longest sprint; anything further is a distance event
  var SPRINT_LIMIT = 400;

  function groupOf(event) {
    var e = event.toLowerCase();
    // order matters: "1200m Walk" and "80m Hurdle" both start with a
    // distance, so they have to be claimed before the numeric test
    if (e.indexOf('relay') !== -1) { return 'Relays'; }
    if (e.indexOf('hurdle') !== -1) { return 'Hurdles'; }
    if (e.indexOf('walk') !== -1) { return 'Walks'; }
    if (e.indexOf('steeple') !== -1) { return 'Distance'; }
    if (/jump|vault/.test(e)) { return 'Jumps'; }
    if (/discus|shot put|javelin|hammer/.test(e)) { return 'Throws'; }
    var m = /^(\d+(?:\.\d+)?)\s*m\b/.exec(e);
    if (m) { return Number(m[1]) <= SPRINT_LIMIT ? 'Sprints' : 'Distance'; }
    return 'Other';
  }

  function distanceOf(event) {
    var m = /(\d+(?:\.\d+)?)\s*m\b/.exec(event.toLowerCase());
    return m ? Number(m[1]) : 0;
  }

  /* "Shot Put 1.5 kg" -> 1500, "Discus 500 g" -> 500, so the implements
     sort lightest first instead of by the text of the number. */
  function weightOf(event) {
    var m = /(\d+(?:\.\d+)?)\s*(kg|g)\b/i.exec(event);
    if (!m) { return 0; }
    return Number(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1);
  }

  function subIndex(group, event) {
    var list = SUB_ORDER[group];
    if (!list) { return 0; }
    var e = event.toLowerCase();
    for (var i = 0; i < list.length; i += 1) {
      if (e.indexOf(list[i]) !== -1) { return i; }
    }
    return list.length;
  }

  function compareEvents(a, b) {
    var ga = groupOf(a), gb = groupOf(b);
    if (ga !== gb) { return GROUPS.indexOf(ga) - GROUPS.indexOf(gb); }
    var sa = subIndex(ga, a), sb = subIndex(gb, b);
    if (sa !== sb) { return sa - sb; }
    var da = distanceOf(a), db = distanceOf(b);
    if (da !== db) { return da - db; }
    var wa = weightOf(a), wb = weightOf(b);
    if (wa !== wb) { return wa - wb; }
    return a.localeCompare(b);
  }

  /* Two athletes sharing a record stay together, oldest mark first. */
  function compareRecords(a, b) {
    return compareEvents(a.event, b.event)
        || (a.date || '').localeCompare(b.date || '');
  }

  function text(tag, cls, value) {
    var el = document.createElement(tag);
    if (cls) { el.className = cls; }
    if (value !== undefined && value !== null) { el.textContent = value; }
    return el;
  }

  /* 2025-03-02 -> 2 March 2025. Built from the parts rather than parsed
     as a Date, so a browser cannot shift it by a timezone. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  function prettyDate(iso) {
    if (!iso) { return ''; }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) { return iso; }
    return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
  }

  function athleteText(record) {
    var names = record.athletes || [];
    if (names.length <= 1) { return names[0] || ''; }
    return names.join(', ');
  }

  function matches(record, grade, gender, needle) {
    if (grade && String(record.grade) !== grade) { return false; }
    if (gender && record.gender !== gender) { return false; }
    if (!needle) { return true; }
    var hay = [record.event, athleteText(record), record.venue,
               record.performance, prettyDate(record.date)]
              .join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  function buildRow(record) {
    var tr = document.createElement('tr');

    var th = text('th', 'records-event', record.event);
    th.setAttribute('scope', 'row');
    tr.appendChild(th);

    var who = text('td', null, athleteText(record));
    who.setAttribute('data-label', 'Athlete');
    if ((record.athletes || []).length > 1) { who.className = 'records-team'; }
    tr.appendChild(who);

    var perf = text('td', 'records-perf', record.performance);
    perf.setAttribute('data-label', 'Result');
    tr.appendChild(perf);

    // the date carries the link to the official results, when we have one
    var when = text('td', 'records-date');
    when.setAttribute('data-label', 'Date');
    if (record.source) {
      var a = document.createElement('a');
      a.className = 'records-source';
      a.href = record.source;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = prettyDate(record.date);
      a.title = 'Official results for this record';
      when.appendChild(a);
    } else {
      when.textContent = prettyDate(record.date);
    }
    tr.appendChild(when);

    var where = text('td', null, record.venue);
    where.setAttribute('data-label', 'Meeting');
    tr.appendChild(where);

    return tr;
  }

  function buildTable(caption, rows) {
    var wrap = text('div', 'table-wrap');
    var table = text('table', 'schedule records-table');

    var cap = text('caption', null, caption);
    table.appendChild(cap);

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['Event', 'Athlete', 'Result', 'Date', 'Meeting'].forEach(function (label) {
      var th = text('th', null, label);
      th.setAttribute('scope', 'col');
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var lastGroup = null;
    rows.forEach(function (r) {
      var group = groupOf(r.event);
      if (group !== lastGroup) {
        // reuses the banding the training table already uses
        var band = text('tr', 'schedule__band');
        var bth = text('th', null, group);
        bth.setAttribute('scope', 'colgroup');
        bth.colSpan = 5;
        band.appendChild(bth);
        tbody.appendChild(band);
        lastGroup = group;
      }
      tbody.appendChild(buildRow(r));
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    return wrap;
  }

  /* The button says what will come out, because the export follows the
     filter rather than always writing the whole book. */
  function updateExportLabel() {
    if (!shown.length) {
      exportBtn.textContent = 'Nothing to download';
      exportBtn.disabled = true;
      return;
    }
    exportBtn.disabled = false;
    exportBtn.textContent = shown.length === all.length
      ? 'Download all ' + all.length + ' records'
      : 'Download these ' + shown.length + ' records';
  }

  function render() {
    var grade = gradeSel.value;
    var gender = genderSel.value;
    var needle = textInput.value.trim().toLowerCase();

    shown = all.filter(function (r) { return matches(r, grade, gender, needle); });

    out.textContent = '';
    updateExportLabel();

    if (!shown.length) {
      status.textContent = 'No records match that. Try a different grade or search.';
      return;
    }

    var grades = [];
    shown.forEach(function (r) {
      if (grades.indexOf(r.grade) === -1) { grades.push(r.grade); }
    });
    grades.sort(function (a, b) { return a - b; });

    grades.forEach(function (g) {
      var block = text('div', 'records-grade');
      var heading = text('h3', 'records-grade__head', 'Grade ' + g);
      block.appendChild(heading);

      ['girls', 'boys'].forEach(function (gen) {
        var rows = shown.filter(function (r) {
          return r.grade === g && r.gender === gen;
        });
        if (!rows.length) { return; }
        rows.sort(compareRecords);
        var label = gen === 'girls' ? 'Girls' : 'Boys';
        block.appendChild(buildTable(label + ' — grade ' + g, rows));
      });

      out.appendChild(block);
    });

    status.textContent = shown.length === all.length
      ? 'Showing all ' + all.length + ' records.'
      : 'Showing ' + shown.length + ' of ' + all.length + ' records.';
  }

  /* Spreadsheet export ------------------------------------------------
     CSV rather than .xlsx: it opens in Excel, Numbers and Sheets alike,
     and needs no library. The leading BOM is what makes Excel read it as
     UTF-8 - without it, Ngā Puna Wai arrives mangled. */
  function csvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(s)) { return '"' + s.replace(/"/g, '""') + '"'; }
    return s;
  }

  function exportCsv() {
    var rows = [['Grade', 'Girls/Boys', 'Group', 'Event', 'Athlete', 'Result',
                 'Date', 'Meeting', 'Results link']];

    // same order as the page, so the spreadsheet reads the same way
    shown.slice().sort(function (a, b) {
      return a.grade - b.grade
          || b.gender.localeCompare(a.gender)   // girls before boys
          || compareRecords(a, b);
    }).forEach(function (r) {
      rows.push([r.grade, r.gender === 'girls' ? 'Girls' : 'Boys',
                 groupOf(r.event), r.event,
                 athleteText(r), r.performance, r.date || '', r.venue || '',
                 r.source || '']);
    });

    var csv = rows.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');

    // The local date (toISOString gives UTC: yesterday before midday in NZ).
    var now = new Date();
    var stamp = now.getFullYear() + '-' +
                ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
                ('0' + now.getDate()).slice(-2);
    var bits = ['ncan-childrens-records'];
    if (gradeSel.value) { bits.push('grade-' + gradeSel.value); }
    if (genderSel.value) { bits.push(genderSel.value); }
    var needle = textInput.value.trim().toLowerCase()
                   .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (needle) { bits.push(needle.slice(0, 24)); }
    bits.push(stamp);
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = bits.join('-') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  if (!window.fetch) {
    status.textContent = 'This browser cannot load the records. '
      + 'The data is at ' + DATA_URL + '.';
    return;
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    })
    .then(function (data) {
      all = data.records || [];
      if (!all.length) { throw new Error('no records in the file'); }

      (data.grades || []).forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = String(g);
        opt.textContent = 'Grade ' + g;
        gradeSel.appendChild(opt);
      });

      if (data.updated) {
        updated.textContent = 'Records last updated ' + prettyDate(data.updated) + '.';
      }

      [gradeSel, genderSel].forEach(function (el) {
        el.addEventListener('change', render);
      });
      textInput.addEventListener('input', render);
      exportBtn.addEventListener('click', exportCsv);

      render();
    })
    .catch(function (err) {
      status.textContent = 'Sorry, the records could not be loaded (' + err.message
        + '). Please try again, or contact the club.';
      exportBtn.disabled = true;
    });
}());
