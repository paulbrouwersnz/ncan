/*
  training.js - training plans on the Tuesday training page (/tuesday-training/),
  the junior club night.

  What each group of the children's 7-14 team does at a session, time slot by
  time slot. Plans live in the club's API (the private ncan-api project:
  GET /v1/training, GET|POST /v1/training/<date>[/release|draft|cancel|delete]).

  Everyone sees released plans, and sessions that have been cancelled (with
  why). Club administrators, coaches and the committee, once signed in, also
  see drafts and can make, change, release, cancel and delete plans.

  Making a plan: drag a grade (7-14), Girls / Boys / Girls & Boys / Everyone, or
  an event from the palette onto a group in the table, or onto a time slot to
  start a new group there. On a phone, or with a keyboard: tap (or press) a
  chip, then tap the group it goes on. Groups carry an activity and a note; each
  time slot and the plan as a whole can have a note too. Each note has a
  coaches-only twin: the API gives those only to admins, coaches and the
  committee, so they never reach the public page.
*/
(function () {
  'use strict';

  var root = document.getElementById('training');
  if (!root || !window.NCAN) { return; }
  var listBox = document.getElementById('training-list');
  var tools = document.getElementById('training-tools');
  var editorBox = document.getElementById('training-editor');
  var accountBox = document.getElementById('training-account');
  var signInBox = document.getElementById('training-signin');

  var state = { canEdit: false, events: [], grades: [7, 8, 9, 10, 11, 12, 13, 14], upcoming: [], past: [] };
  var editing = null;        // the plan in the editor: {date, notes, slots, status, isNew}
  var dirty = false;
  var picked = null;         // a chip picked by tapping: {kind, value, label}

  // ------------------------------------------------------------ small helpers

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }
  function button(text, cls, onClick) {
    var b = el('button', cls || 'btn btn--ghost btn--sm', text);
    b.type = 'button';
    if (onClick) { b.addEventListener('click', onClick); }
    return b;
  }

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                'October', 'November', 'December'];
  function parseDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function longDate(isoDate) {
    var d = parseDate(isoDate);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  // "17:00", "17:15" -> "5:00–5:15 pm"
  function clock(t) { var h = +t.slice(0, 2); return { text: ((h + 11) % 12 + 1) + ':' + t.slice(3), pm: h >= 12 }; }
  function timeRange(start, end) {
    var a = clock(start), b = clock(end);
    return a.pm === b.pm ? a.text + '–' + b.text + (b.pm ? ' pm' : ' am')
                         : a.text + (a.pm ? ' pm' : ' am') + '–' + b.text + (b.pm ? ' pm' : ' am');
  }
  function addMinutes(t, mins) {
    var m = Math.min(23 * 60 + 59, +t.slice(0, 2) * 60 + +t.slice(3) + mins);
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2);
  }
  function minutes(t) { return +t.slice(0, 2) * 60 + +t.slice(3); }

  var SEX = { girls: 'Girls', boys: 'Boys', both: 'Girls & Boys' };
  function groupLabel(g) {
    if (g.everyone) { return 'Everyone'; }
    if (!g.grades.length) { return g.sex === 'both' ? 'Group' : SEX[g.sex]; }
    return 'Grade ' + g.grades.join(', ') + ' ' + SEX[g.sex];
  }
  var STATUS = { draft: 'Draft', released: 'Released', cancelled: 'Cancelled' };

  function apiError(res, fallback) {
    return (res && res.body && res.body.error) || fallback || 'Sorry, that didn’t work. Please try again.';
  }

  // ------------------------------------------------------------ the list of plans

  function load() {
    return NCAN.get('/training').then(function (data) {
      state.canEdit = !!data.can_edit;
      state.events = data.events || [];
      state.grades = data.grades || state.grades;
      state.upcoming = data.upcoming || [];
      state.past = data.past || [];
      showList();
    }).catch(function (err) {
      listBox.textContent = '';
      listBox.appendChild(el('p', 'note', err.status === 0
        ? 'Training plans can’t be loaded just now. Please try again later.'
        : 'Training plans can’t be loaded just now (' + err.message + ').'));
    });
  }

  function showList() {
    listBox.textContent = '';
    tools.hidden = !state.canEdit || !!editing;
    if (editing) { listBox.hidden = true; return; }
    listBox.hidden = false;
    if (!state.upcoming.length && !state.past.length) {
      listBox.appendChild(el('p', 'note', state.canEdit
        ? 'No training plans yet. Start one with “New training plan”.'
        : 'The next session’s plan will appear here once the coaches have released it.'));
      return;
    }
    if (state.upcoming.length) {
      state.upcoming.forEach(function (p) { listBox.appendChild(planCard(p, true)); });
    } else {
      listBox.appendChild(el('p', 'note', 'The next session’s plan hasn’t been released yet. The latest is below.'));
    }
    if (state.past.length) {
      var older = el('details', 'training-past');
      older.appendChild(el('summary', null, 'Earlier sessions (' + state.past.length + ')'));
      state.past.forEach(function (p) { older.appendChild(planCard(p, false)); });
      if (!state.upcoming.length) { older.open = true; }
      listBox.appendChild(older);
    }
  }

  function planCard(plan, upcoming) {
    var card = el('article', 'plan plan--' + plan.status);
    card.id = 'plan-' + plan.date;
    var head = el('header', 'plan__head');
    head.appendChild(el('h3', 'plan__title', 'Training plan, ' + longDate(plan.date)));
    if (state.canEdit || plan.status === 'cancelled') {
      head.appendChild(el('span', 'plan__status plan__status--' + plan.status, STATUS[plan.status]));
    }
    card.appendChild(head);
    if (plan.status === 'cancelled') {
      var why = el('p', 'plan__cancelled');
      why.appendChild(el('strong', null, 'This session is cancelled. '));
      why.appendChild(document.createTextNode(plan.cancelled_why || ''));
      card.appendChild(why);
    }
    if (plan.notes) { card.appendChild(el('p', 'plan__notes', plan.notes)); }
    if (plan.coach_notes) { card.appendChild(coachNote(plan.coach_notes, 'p')); }
    if (plan.status !== 'cancelled' || state.canEdit) {
      if (plan.slots && plan.slots.length) { card.appendChild(planTable(plan)); }
      else if (plan.status !== 'cancelled') { card.appendChild(el('p', 'note', 'No time slots yet.')); }
    }
    if (state.canEdit) {
      if (plan.updated_by) {
        card.appendChild(el('p', 'plan__by', 'Last changed by ' + plan.updated_by + ', ' +
          plan.updated.replace('T', ' at ').slice(0, 19) + '.'));
      }
      card.appendChild(staffActions(plan));
    }
    return card;
  }

  // a coaches-only note (the API sends these to staff only), marked as such
  function coachNote(text, tag) {
    var n = el(tag, 'plan__coach');
    n.appendChild(el('strong', null, 'Coaches only: '));
    n.appendChild(document.createTextNode(text));
    return n;
  }

  // The plan as a table: a row per time slot, its groups side by side (wrapping on a phone).
  function planTable(plan) {
    var table = el('table', 'plan__table');
    var cap = el('caption', 'visually-hidden', 'Training plan for ' + longDate(plan.date));
    table.appendChild(cap);
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', null, 'Time'));
    hr.appendChild(el('th', null, 'Groups and activities'));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    plan.slots.forEach(function (slot) {
      var tr = el('tr');
      var th = el('th', 'plan__time', timeRange(slot.start, slot.end));
      th.scope = 'row';
      tr.appendChild(th);
      var td = el('td');
      var groups = el('ul', 'plan__groups');
      slot.groups.forEach(function (g) {
        var li = el('li', 'plan__group' + (g.everyone ? ' plan__group--everyone' : ''));
        li.appendChild(el('span', 'plan__who', groupLabel(g)));
        if (g.event) { li.appendChild(el('span', 'plan__what', g.event)); }
        if (g.note) { li.appendChild(el('span', 'plan__note', g.note)); }
        if (g.coach_note) { li.appendChild(coachNote(g.coach_note, 'span')); }
        groups.appendChild(li);
      });
      td.appendChild(groups);
      if (slot.note) { td.appendChild(el('p', 'plan__slot-note', slot.note)); }
      if (slot.coach_note) { td.appendChild(coachNote(slot.coach_note, 'p')); }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var wrap = el('div', 'table-wrap plan__wrap');
    wrap.appendChild(table);
    return wrap;
  }

  function staffActions(plan) {
    var bar = el('div', 'plan__actions');
    var said = el('p', 'plan__said');
    said.setAttribute('role', 'status');
    function act(action, data, done) {
      said.textContent = 'Saving…';
      return NCAN.send('/training/' + plan.date + '/' + action, data || {}).then(function (res) {
        if (res.status !== 200) { said.textContent = apiError(res); return; }
        said.textContent = '';
        if (done) { done(res.body); }
        return load();
      }).catch(function (err) { said.textContent = err.message; });
    }
    if (plan.status !== 'cancelled') {
      bar.appendChild(button('Edit', 'btn btn--sm', function () { openEditor(plan, false); }));
    }
    if (plan.status === 'draft') {
      bar.appendChild(button('Release', 'btn btn--accent btn--sm', function () { act('release'); }));
    }
    if (plan.status === 'released') {
      bar.appendChild(button('Back to draft', null, function () { act('draft'); }));
    }
    if (plan.status === 'cancelled') {
      bar.appendChild(button('Reinstate as a draft', null, function () { act('draft'); }));
    } else {
      bar.appendChild(button('Cancel the session', null, function () {
        bar.hidden = true;
        bar.parentNode.insertBefore(cancelForm(plan, function (why) {
          return act('cancel', { why: why });
        }, function () { bar.hidden = false; }), bar);
      }));
    }
    bar.appendChild(button('Copy to a new date', null, function () {
      openEditor({ date: nextDate(plan.date), notes: plan.notes, coach_notes: plan.coach_notes, slots: plan.slots,
                   status: 'draft' }, true);
    }));
    bar.appendChild(button('Delete', 'btn btn--ghost btn--sm plan__delete', function () {
      if (window.confirm('Delete the training plan for ' + longDate(plan.date) + '? This can’t be undone.')) {
        act('delete');
      }
    }));
    var box = el('div');
    box.appendChild(bar);
    box.appendChild(said);
    return box;
  }

  // "Why is it cancelled?" -> the reason families will see
  function cancelForm(plan, onCancel, onBack) {
    var form = el('form', 'plan__cancel-form');
    var field = el('p', 'records-field records-field--grow');
    var label = el('label', null, 'Why is the session cancelled? Families will see this.');
    var input = el('input');
    input.id = 'cancel-why-' + plan.date;
    label.htmlFor = input.id;
    input.maxLength = 300;
    input.required = true;
    input.placeholder = 'e.g. The ground is flooded';
    field.appendChild(label);
    field.appendChild(input);
    form.appendChild(field);
    var row = el('div', 'plan__actions');
    var go = el('button', 'btn btn--sm', 'Cancel the session');
    go.type = 'submit';
    row.appendChild(go);
    row.appendChild(button('Keep the session', null, function () { form.remove(); onBack(); }));
    form.appendChild(row);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      go.disabled = true;
      onCancel(input.value.trim());
    });
    setTimeout(function () { input.focus(); }, 0);
    return form;
  }

  // ------------------------------------------------------------ making and changing a plan

  // the session after `after` (or after the latest plan), a week on; with no plans, the next
  // Tuesday (today, on a Tuesday). Never in the past.
  function nextDate(after) {
    var latest = after || [].concat(state.upcoming, state.past).map(function (p) { return p.date; }).sort().pop();
    var d = latest ? parseDate(latest) : new Date();
    if (latest) { d.setDate(d.getDate() + 7); } else { d.setDate(d.getDate() + (9 - d.getDay()) % 7); }
    var today = iso(new Date());
    while (iso(d) < today) { d.setDate(d.getDate() + 7); }
    return iso(d);
  }

  function blankPlan() {
    return { notes: '', slots: [
      { start: '17:00', end: '17:15', note: '', groups: [{ everyone: true, grades: [], sex: 'both', event: 'Warm up', note: '', coach_note: '' }] },
      { start: '17:15', end: '17:30', note: '', groups: [] }
    ] };
  }

  function copySlots(slots) {
    return (slots || []).map(function (s) {
      return { start: s.start, end: s.end, note: s.note || '', coach_note: s.coach_note || '', groups: s.groups.map(function (g) {
        return { everyone: !!g.everyone, grades: g.grades.slice(), sex: g.sex || 'both', event: g.event || '',
                 note: g.note || '', coach_note: g.coach_note || '' };
      }) };
    });
  }

  function openEditor(plan, isNew) {
    editing = { date: plan.date, notes: plan.notes || '', coach_notes: plan.coach_notes || '',
                slots: copySlots(plan.slots), status: plan.status || 'draft',
                isNew: isNew };
    dirty = isNew;
    picked = null;
    showList();
    renderEditor();
    editorBox.hidden = false;
    editorBox.scrollIntoView({ block: 'start' });
  }

  function closeEditor() {
    if (dirty && !window.confirm('Leave without saving your changes?')) { return; }
    editing = null;
    dirty = false;
    editorBox.hidden = true;
    editorBox.textContent = '';
    showList();
  }

  function changed() { dirty = true; }

  function renderEditor() {
    editorBox.textContent = '';
    var plan = editing;
    var head = el('div', 'plan-editor__head');
    head.appendChild(el('h3', null, plan.isNew ? 'New training plan' : 'Training plan, ' + longDate(plan.date)));
    if (!plan.isNew) {
      head.appendChild(el('span', 'plan__status plan__status--' + plan.status, STATUS[plan.status]));
    }
    editorBox.appendChild(head);

    // the date (a new plan only: a saved plan's date is its name)
    if (plan.isNew) { editorBox.appendChild(dateField(plan)); }

    // the chips, with how to use them; while one is picked by tapping, a slim bar
    // stays in view (pinned under the site header) saying which, until Done
    editorBox.appendChild(palette());
    var placing = el('div', 'plan-placing');
    placing.id = 'plan-placing';
    placing.appendChild(el('p', 'plan-placing__text'));
    placing.appendChild(button('Done', 'btn btn--accent btn--sm', function () { unpick(); }));
    editorBox.appendChild(placing);
    editorBox.classList.toggle('is-placing', !!picked);
    showHint();

    // the table
    var table = el('div', 'plan-editor__slots');
    plan.slots.forEach(function (slot, i) { table.appendChild(slotRow(slot, i)); });
    editorBox.appendChild(table);
    var add = button('Add a time slot', 'btn btn--ghost btn--sm', function () {
      var last = plan.slots[plan.slots.length - 1];
      var length = last ? Math.max(5, minutes(last.end) - minutes(last.start)) : 15;
      var start = last ? last.end : '17:00';
      plan.slots.push({ start: start, end: addMinutes(start, length), note: '', groups: [] });
      changed();
      renderEditor();
      var rows = editorBox.querySelectorAll('.plan-slot');
      if (rows.length) { rows[rows.length - 1].querySelector('input').focus(); }
    });
    editorBox.appendChild(add);

    // the plan's own notes
    var notes = el('p', 'records-field records-field--grow plan-editor__notes');
    var nl = el('label', null, 'Notes for the whole session (shown with the plan)');
    var nt = el('textarea');
    nt.id = 'plan-notes';
    nt.rows = 3;
    nt.maxLength = 2000;
    nt.value = plan.notes;
    nt.placeholder = 'e.g. Bring a drink bottle and a warm top.';
    nl.htmlFor = nt.id;
    nt.addEventListener('input', function () { plan.notes = nt.value; changed(); });
    notes.appendChild(nl);
    notes.appendChild(nt);
    editorBox.appendChild(notes);
    var cnotes = el('p', 'records-field records-field--grow plan-editor__notes plan-editor__coach');
    var cl = el('label', null, 'Coaches-only notes for the session (not shown to the public)');
    var ct = el('textarea');
    ct.id = 'plan-coach-notes';
    ct.rows = 2;
    ct.maxLength = 2000;
    ct.value = plan.coach_notes;
    ct.placeholder = 'e.g. Sam is away; Alex takes the hurdles group.';
    cl.htmlFor = ct.id;
    ct.addEventListener('input', function () { plan.coach_notes = ct.value; changed(); });
    cnotes.appendChild(cl);
    cnotes.appendChild(ct);
    editorBox.appendChild(cnotes);

    // save
    var bar = el('div', 'plan__actions plan-editor__save');
    var said = el('p', 'plan__said');
    said.setAttribute('role', 'status');
    var saveLabel = plan.status === 'released' ? 'Save (stays released)' : 'Save as a draft';
    bar.appendChild(button(saveLabel, 'btn btn--sm', function () { save(false, said); }));
    if (plan.status !== 'released') {
      bar.appendChild(button('Save and release', 'btn btn--accent btn--sm', function () { save(true, said); }));
    }
    bar.appendChild(button('Close without saving', null, closeEditor));
    editorBox.appendChild(bar);
    editorBox.appendChild(said);
  }

  // The session's date: a week back or on with the arrows (sessions are weekly), or
  // any date from the calendar, which opens from anywhere on the box. Under it, the
  // date in words, and a word if it isn't a Tuesday or already has a plan.
  function dateField(plan) {
    var box = el('div', 'plan-date');
    var label = el('label', 'plan-date__label', 'Session date');
    var input = el('input', 'plan-date__input');
    input.type = 'date';
    input.id = 'plan-date';
    input.value = plan.date;
    input.required = true;
    label.htmlFor = input.id;
    var said = el('p', 'plan-date__said');
    said.setAttribute('aria-live', 'polite');

    function show() {
      said.textContent = '';
      if (!plan.date) { said.appendChild(el('span', 'plan-date__warn', 'Choose a date.')); return; }
      said.appendChild(el('strong', null, longDate(plan.date)));
      if (parseDate(plan.date).getDay() !== 2) {
        said.appendChild(el('span', 'plan-date__warn', 'Not a Tuesday'));
      }
      if ([].concat(state.upcoming, state.past).some(function (p) { return p.date === plan.date; })) {
        said.appendChild(el('span', 'plan-date__warn', 'Already has a plan: saving replaces it'));
      }
    }
    function set(value) {
      plan.date = value;
      input.value = value;
      changed();
      show();
    }
    function step(days) {
      var d = parseDate(plan.date || iso(new Date()));
      d.setDate(d.getDate() + days);
      set(iso(d));
    }
    input.addEventListener('change', function () { set(input.value); });
    // the whole box opens the calendar, not just its icon (where the browser can)
    input.addEventListener('click', function () {
      try { if (input.showPicker) { input.showPicker(); } } catch (e) { /* not allowed here: typing still works */ }
    });

    var row = el('div', 'plan-date__row');
    var back = button('‹', 'plan-date__step', function () { step(-7); });
    back.setAttribute('aria-label', 'A week earlier');
    back.title = 'A week earlier';
    var on = button('›', 'plan-date__step', function () { step(7); });
    on.setAttribute('aria-label', 'A week later');
    on.title = 'A week later';
    row.appendChild(back);
    row.appendChild(input);
    row.appendChild(on);
    box.appendChild(label);
    box.appendChild(row);
    box.appendChild(said);
    show();
    return box;
  }

  // the chips to drag (or tap) onto the table
  function palette() {
    var box = el('div', 'plan-palette');
    function group(title, chips) {
      var g = el('div', 'plan-palette__group');
      g.appendChild(el('p', 'plan-palette__title', title));
      var row = el('div', 'plan-palette__chips');
      chips.forEach(function (c) { row.appendChild(chip(c)); });
      g.appendChild(row);
      box.appendChild(g);
      return row;
    }
    group('Grades', state.grades.map(function (n) { return { kind: 'grade', value: n, label: 'Grade ' + n }; }));
    group('Who', [{ kind: 'sex', value: 'girls', label: 'Girls' }, { kind: 'sex', value: 'boys', label: 'Boys' },
                  { kind: 'sex', value: 'both', label: 'Girls & Boys' }, { kind: 'everyone', value: true, label: 'Everyone' }]);
    var events = group('Events', state.events.map(function (e) { return { kind: 'event', value: e, label: e }; }));
    // an event of their own
    var own = el('form', 'plan-palette__own');
    var oi = el('input');
    oi.id = 'plan-own-event';
    oi.maxLength = 60;
    oi.placeholder = 'Another activity';
    oi.setAttribute('aria-label', 'Another activity, to add to the events');
    var ob = el('button', 'btn btn--ghost btn--sm', 'Add');
    ob.type = 'submit';
    own.appendChild(oi);
    own.appendChild(ob);
    own.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = oi.value.trim();
      if (!v) { return; }
      if (state.events.indexOf(v) === -1) { state.events.push(v); }
      events.appendChild(chip({ kind: 'event', value: v, label: v }));
      oi.value = '';
    });
    box.appendChild(own);
    var hint = el('p', 'plan-editor__hint');
    hint.id = 'plan-hint';
    hint.setAttribute('role', 'status');
    box.appendChild(hint);
    return box;
  }

  function chip(c) {
    var b = el('button', 'plan-chip plan-chip--' + c.kind, c.label);
    b.type = 'button';
    b.draggable = true;
    b.setAttribute('aria-pressed', String(!!picked && picked.kind === c.kind && picked.value === c.value));
    b.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', JSON.stringify(c));
      e.dataTransfer.effectAllowed = 'copy';
      editorBox.classList.add('is-dragging');
    });
    b.addEventListener('dragend', function () { editorBox.classList.remove('is-dragging'); });
    b.addEventListener('click', function () {
      var same = picked && picked.kind === c.kind && picked.value === c.value;
      picked = same ? null : c;
      Array.prototype.forEach.call(editorBox.querySelectorAll('.plan-chip'), function (x) {
        x.setAttribute('aria-pressed', String(!same && x === b));
      });
      editorBox.classList.toggle('is-placing', !!picked);
      showHint();
    });
    return b;
  }

  function showHint() {
    var hint = document.getElementById('plan-hint');
    var bar = document.getElementById('plan-placing');
    if (!hint) { return; }
    hint.textContent = 'Drag a grade, Girls / Boys / Everyone or an event onto a group, or onto a time slot’s ' +
      '“New group” to start one. On a phone, tap a chip, then each group it goes on.';
    if (!bar) { return; }
    bar.hidden = !picked;
    var text = bar.querySelector('.plan-placing__text');
    text.textContent = '';
    if (picked) {
      text.appendChild(document.createTextNode('Placing '));
      text.appendChild(el('strong', null, picked.label));
      text.appendChild(document.createTextNode(': tap each group it goes on, or a time slot’s “New group”.'));
    }
  }

  // stop placing a tapped chip
  function unpick() {
    picked = null;
    editorBox.classList.remove('is-placing');
    Array.prototype.forEach.call(editorBox.querySelectorAll('.plan-chip'), function (x) { x.setAttribute('aria-pressed', 'false'); });
    showHint();
  }

  // what a chip does to a group
  function apply(g, c) {
    if (c.kind === 'grade') {
      g.everyone = false;
      if (g.grades.indexOf(c.value) === -1) { g.grades.push(c.value); g.grades.sort(function (a, b) { return a - b; }); }
    } else if (c.kind === 'sex') {
      g.everyone = false;
      g.sex = c.value;
    } else if (c.kind === 'everyone') {
      g.everyone = true;
      g.grades = [];
      g.sex = 'both';
    } else if (c.kind === 'event') {
      g.event = c.value;
    }
    changed();
  }

  function newGroup(slot, c) {
    var g = { everyone: false, grades: [], sex: 'both', event: '', note: '', coach_note: '' };
    if (c) { apply(g, c); }
    slot.groups.push(g);
    changed();
    return g;
  }

  // a drop target: something dragged, or a picked chip tapped onto it
  function target(node, onChip) {
    node.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; node.classList.add('is-over'); });
    node.addEventListener('dragleave', function (e) { if (!node.contains(e.relatedTarget)) { node.classList.remove('is-over'); } });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('is-over');
      editorBox.classList.remove('is-dragging');
      var c;
      try { c = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (c && c.kind) { onChip(c); renderEditor(); }
    });
    node.addEventListener('click', function (e) {
      if (!picked || e.target.closest('input, textarea, select, .plan-slot__times, button:not(.plan-slot__new)')) { return; }
      e.stopPropagation();          // a group inside a time slot: only the group gets it
      onChip(picked);
      renderEditor();
    });
  }

  function slotRow(slot, i) {
    var plan = editing;
    var row = el('div', 'plan-slot');
    // The slot's times, on one slim line above its groups: start – end, and how
    // long the slot is. Moving the start moves the end with it, so the slot
    // keeps its length; the end can then be changed on its own.
    var times = el('div', 'plan-slot__times');
    times.appendChild(el('span', 'plan-date__label', 'Time'));
    var box = el('div', 'plan-time');
    var length = el('p', 'plan-time__length');
    function showLength() {
      var mins = minutes(slot.end) - minutes(slot.start);
      length.textContent = mins > 0 ? mins + ' minutes' : 'Ends before it starts';
      length.classList.toggle('plan-date__warn', mins <= 0);
    }
    function timeInput(which, label) {
      var t = el('input', 'plan-time__input');
      t.type = 'time';
      t.step = 300;
      t.id = 'slot-' + i + '-' + which;
      t.value = slot[which];
      var l = el('label', 'visually-hidden', label + ', ' + timeRange(slot.start, slot.end) + ' slot');
      l.htmlFor = t.id;
      t.addEventListener('change', function () {
        if (!t.value) { t.value = slot[which]; return; }
        if (which === 'start') {
          var keep = minutes(slot.end) - minutes(slot.start);
          slot.end = addMinutes(t.value, keep > 0 ? keep : 15);
          endInput.value = slot.end;
        }
        slot[which] = t.value;
        changed();
        showLength();
      });
      t.addEventListener('click', function () {
        try { if (t.showPicker) { t.showPicker(); } } catch (e) { /* typing still works */ }
      });
      box.appendChild(l);
      box.appendChild(t);
      return t;
    }
    timeInput('start', 'Starts');
    box.appendChild(el('span', 'plan-time__dash', '–'));
    var endInput = timeInput('end', 'Ends');
    times.appendChild(box);
    times.appendChild(length);
    showLength();
    row.appendChild(times);

    var groups = el('div', 'plan-slot__groups');
    slot.groups.forEach(function (g, gi) { groups.appendChild(groupCell(slot, g, gi)); });
    var fresh = button('New group', 'plan-slot__new', function () {
      if (picked) { return; }       // handled by target()
      newGroup(slot);
      renderEditor();
    });
    target(fresh, function (c) { newGroup(slot, c); });
    groups.appendChild(fresh);
    target(groups, function (c) { newGroup(slot, c); });
    row.appendChild(groups);

    var foot = el('div', 'plan-slot__foot');
    var np = el('p', 'records-field records-field--grow');
    var nl = el('label', null, 'Note for this time slot');
    var ni = el('input');
    ni.id = 'slot-' + i + '-note';
    ni.maxLength = 300;
    ni.value = slot.note;
    nl.htmlFor = ni.id;
    ni.addEventListener('input', function () { slot.note = ni.value; changed(); });
    np.appendChild(nl);
    np.appendChild(ni);
    foot.appendChild(np);
    var cp = el('p', 'records-field records-field--grow plan-editor__coach');
    var cl = el('label', null, 'Coaches-only note');
    var ci = el('input');
    ci.id = 'slot-' + i + '-coach-note';
    ci.maxLength = 300;
    ci.value = slot.coach_note || '';
    cl.htmlFor = ci.id;
    ci.addEventListener('input', function () { slot.coach_note = ci.value; changed(); });
    cp.appendChild(cl);
    cp.appendChild(ci);
    foot.appendChild(cp);
    var moves = el('div', 'plan-slot__moves');
    moves.appendChild(button('Copy slot', null, function () {
      var length = minutes(slot.end) - minutes(slot.start);
      var copy = copySlots([slot])[0];
      copy.start = slot.end;
      copy.end = addMinutes(slot.end, length);
      plan.slots.splice(i + 1, 0, copy);
      changed();
      renderEditor();
    }));
    moves.appendChild(button('Remove slot', 'btn btn--ghost btn--sm plan__delete', function () {
      if (slot.groups.length && !window.confirm('Remove the ' + timeRange(slot.start, slot.end) + ' slot and its groups?')) { return; }
      plan.slots.splice(i, 1);
      changed();
      renderEditor();
    }));
    foot.appendChild(moves);
    row.appendChild(foot);
    return row;
  }

  function groupCell(slot, g, gi) {
    var cell = el('div', 'plan-group' + (g.everyone ? ' plan-group--everyone' : ''));
    cell.tabIndex = 0;
    cell.setAttribute('aria-label', groupLabel(g) + (g.event ? ', ' + g.event : '') + '. Drop or place a chip here.');
    var who = el('div', 'plan-group__who');
    who.appendChild(el('strong', null, groupLabel(g)));
    // take a grade off again
    var tokens = el('div', 'plan-group__tokens');
    g.grades.forEach(function (n) {
      tokens.appendChild(button('Grade ' + n + ' ×', 'plan-group__token', function (e) {
        e.stopPropagation();
        g.grades = g.grades.filter(function (x) { return x !== n; });
        changed();
        renderEditor();
      }));
    });
    if (!g.everyone) {
      var sex = el('select', 'plan-group__sex');
      sex.setAttribute('aria-label', 'Girls, boys or both');
      [['both', 'Girls & Boys'], ['girls', 'Girls'], ['boys', 'Boys']].forEach(function (o) {
        var op = el('option', null, o[1]);
        op.value = o[0];
        sex.appendChild(op);
      });
      sex.value = g.sex;
      sex.addEventListener('change', function () { g.sex = sex.value; changed(); renderEditor(); });
      tokens.appendChild(sex);
    }
    who.appendChild(tokens);
    cell.appendChild(who);

    var what = el('input', 'plan-group__event');
    what.value = g.event;
    what.maxLength = 60;
    what.placeholder = 'Activity';
    what.setAttribute('aria-label', 'Activity for ' + groupLabel(g));
    what.setAttribute('list', 'plan-events');
    what.addEventListener('input', function () { g.event = what.value; changed(); });
    cell.appendChild(what);
    var note = el('input', 'plan-group__note');
    note.value = g.note;
    note.maxLength = 300;
    note.placeholder = 'Note (e.g. coach, equipment)';
    note.setAttribute('aria-label', 'Note for ' + groupLabel(g));
    note.addEventListener('input', function () { g.note = note.value; changed(); });
    cell.appendChild(note);
    var coach = el('input', 'plan-group__note plan-group__coach');
    coach.value = g.coach_note || '';
    coach.maxLength = 300;
    coach.placeholder = 'Coaches-only note';
    coach.setAttribute('aria-label', 'Coaches-only note for ' + groupLabel(g) + ', not shown to the public');
    coach.addEventListener('input', function () { g.coach_note = coach.value; changed(); });
    cell.appendChild(coach);
    cell.appendChild(button('Remove group', 'plan-group__remove', function (e) {
      e.stopPropagation();
      slot.groups.splice(gi, 1);
      changed();
      renderEditor();
    }));
    target(cell, function (c) { apply(g, c); });
    cell.addEventListener('keydown', function (e) {
      if (e.target === cell && picked && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        apply(g, picked);
        renderEditor();
      }
    });
    return cell;
  }

  function save(release, said) {
    var plan = editing;
    if (!plan.date) { said.textContent = 'Choose the session’s date.'; return; }
    if (plan.isNew && [].concat(state.upcoming, state.past).some(function (p) { return p.date === plan.date; }) &&
        !window.confirm('There is already a plan for ' + longDate(plan.date) + '. Replace it?')) { return; }
    var bad = plan.slots.filter(function (s) { return s.end <= s.start; })[0];
    if (bad) { said.textContent = 'A time slot ends before it starts (' + bad.start + '–' + bad.end + ').'; return; }
    said.textContent = 'Saving…';
    NCAN.send('/training/' + plan.date, { notes: plan.notes, coach_notes: plan.coach_notes, slots: plan.slots }).then(function (res) {
      if (res.status !== 200) { said.textContent = apiError(res); return null; }
      if (!release) { return res; }
      return NCAN.send('/training/' + plan.date + '/release', {});
    }).then(function (res) {
      if (!res) { return; }
      if (res.status !== 200) { said.textContent = 'Saved as a draft, but not released: ' + apiError(res); dirty = false; return; }
      dirty = false;
      editing = null;
      editorBox.hidden = true;
      editorBox.textContent = '';
      return load().then(function () {
        var card = document.getElementById('plan-' + res.body.date);
        if (card) { card.scrollIntoView({ block: 'start' }); }
      });
    }).catch(function (err) { said.textContent = err.message; });
  }

  // ------------------------------------------------------------ start

  // the event names, offered while typing an activity
  var list = el('datalist');
  list.id = 'plan-events';
  root.appendChild(list);

  document.getElementById('training-new').addEventListener('click', function () {
    openEditor(Object.assign({ date: nextDate(), status: 'draft' }, blankPlan()), true);
  });
  document.getElementById('training-copy').addEventListener('click', function () {
    var latest = [].concat(state.upcoming, state.past).filter(function (p) { return p.slots && p.slots.length; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    if (!latest) { openEditor(Object.assign({ date: nextDate(), status: 'draft' }, blankPlan()), true); return; }
    openEditor({ date: nextDate(), notes: latest.notes, coach_notes: latest.coach_notes, slots: latest.slots,
                 status: 'draft' }, true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && picked) { unpick(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (editing && dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  NCAN.me().then(function (who) {
    var staff = who && /^(admin|coach|committee)$/.test(who.role);
    NCAN.account(accountBox, staff ? who : null);
    if (!who) {
      var open = button('Coaches and committee: sign in to plan sessions', 'btn btn--ghost btn--sm', function () {
        open.remove();
        NCAN.signIn(signInBox, 'Coaches, the committee and club administrators make the training plans. Enter the ' +
          'email address the club has for you, and we’ll email you a link to sign in. There is no password.');
        var h = signInBox.querySelector('h3');
        if (h) { h.textContent = 'Sign in to plan training'; }
      });
      signInBox.appendChild(open);
      signInBox.hidden = false;
    }
  }).catch(function () { /* the plans still show */ }).then(function () {
    list.textContent = '';
    return load().then(function () {
      state.events.forEach(function (e) { var o = el('option'); o.value = e; list.appendChild(o); });
    });
  });
}());
