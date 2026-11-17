/*
  training.js - training plans on the Tuesday training page (/tuesday-training/),
  the junior club night.

  What each group of the children's 7-14 team does at a session, time slot by
  time slot. Plans live in the club's API (the private ncan-api project:
  GET /v1/training, GET|POST /v1/training/<date>[/release|draft|cancel|delete]).

  Everyone sees released plans, and sessions that have been cancelled (with
  why). A released or cancelled plan has a share link,
  /tuesday-training/#/plan/2026-12-01: that plan on its own, to read and print,
  with nothing to edit (and no coaches' notes, whoever opens it). If it has gone,
  the link says so: removed (and when), moved (it follows), or being changed. Club administrators, coaches and the committee, once signed in, also
  see drafts and can make, change, release, cancel and delete plans.

  Making a plan: drag a grade (7-14), Girls / Boys / Girls & Boys / All athletes, or
  an event from the palette onto a group in the table, or onto a time slot to
  start a new group there. On a phone, or with a keyboard: tap (or press) a
  chip, then tap the group it goes on. A group block moves (or, holding Ctrl or
  Alt, copies) by dragging its handle onto another block (it goes before it) or
  onto a time slot's "New group" (it goes at the end); or with its Move and Copy
  buttons, then a tap on where it goes. Groups carry an activity and a note; each
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
  // What's picked by tapping: chips, several at once ({kind: 'chips', items: [chip...],
  // label}), each applied to every group tapped; or a group block to move or copy
  // ({kind: 'group', ...}).
  var picked = null;

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
    if (g.parents) { return 'Parents & guardians'; }
    if (g.everyone) { return 'All athletes'; }      // "everyone" in the data: every athlete, not the parents
    if (!g.grades.length) { return g.sex === 'both' ? 'Group' : SEX[g.sex]; }
    return 'Grade ' + g.grades.join(', ') + ' ' + SEX[g.sex];
  }
  var STATUS = { draft: 'Draft', released: 'Released', cancelled: 'Cancelled' };

  // A group's activities: up to four in a time slot (starts, then sprints). Plans
  // saved before that have one ("event").
  var MAX_EVENTS = 4;
  function eventsOf(g) { return g.events || (g.event ? [g.event] : []); }
  // all of a group's activities, each with its icon
  function activities(cls, g) {
    var box = el('span', cls + 's');
    eventsOf(g).forEach(function (name) { box.appendChild(activity(cls, name)); });
    if (!box.firstChild) { box.appendChild(activity(cls, '')); }
    return box;
  }

  // an activity's name with its icon in front (assets/js/training-icons.js), if it has one
  function activity(cls, name) {
    var span = el('span', cls);
    var pic = window.NCANTrainingIcons && name && NCANTrainingIcons.icon(name);
    if (pic) { span.appendChild(pic); }
    span.appendChild(document.createTextNode(name || '—'));
    return span;
  }

  function apiError(res, fallback) {
    return (res && res.body && res.body.error) || fallback || 'Sorry, that didn’t work. Please try again.';
  }

  // ------------------------------------------------------------ the list of plans

  function load() {
    return NCAN.get('/training').then(function (data) {
      state.canEdit = !!data.can_edit;
      state.squad = data.squad;
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
    var printable = plan.status !== 'cancelled' && plan.slots && plan.slots.length;
    var shareable = !sharedView && (plan.status === 'released' || plan.status === 'cancelled');
    if (printable || shareable) {
      var row = printable ? printButtons(plan) : el('div', 'plan__print');
      if (shareable) {
        var share = shareParts(plan);
        row.insertBefore(share.button, row.firstChild);      // Share link first, on the left
        card.appendChild(row);
        card.appendChild(share.out);
      } else {
        card.appendChild(row);
      }
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
    var wrap = el('div', 'table-wrap plan__wrap');
    plan.slots.forEach(function (slot, si) {
      var tr = el('tr');
      var th = el('th', 'plan__time', timeRange(slot.start, slot.end));
      th.scope = 'row';
      tr.appendChild(th);
      var td = el('td');
      var groups = el('ul', 'plan__groups');
      slot.groups.forEach(function (g, gi) {
        var li = el('li', 'plan__group' + (g.everyone ? ' plan__group--everyone' : g.parents ? ' plan__group--parents' : ''));
        // tap (or Enter) to light up this group's whole session
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-pressed', 'false');
        li.setAttribute('data-slot', si);
        li.setAttribute('data-group', gi);
        li.addEventListener('click', function () { lightUp(wrap, plan, si, gi); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lightUp(wrap, plan, si, gi); }
        });
        li.appendChild(el('span', 'plan__who', groupLabel(g)));
        if (eventsOf(g).length) { li.appendChild(activities('plan__what', g)); }
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
    wrap.appendChild(table);
    var box = el('div', 'plan__body');
    box.appendChild(wrap);
    box.appendChild(activityStrip(wrap, plan));
    box.appendChild(el('p', 'plan__tip', 'Tap a group to light up its whole session, or activities to see who does them. ' +
      'Tap again to undo.'));
    return box;
  }

  // The plan's activities, in the order they first come, each with its icon: tapping
  // one lights up the groups doing it.
  function activityStrip(wrap, plan) {
    var names = [];
    plan.slots.forEach(function (s) {
      s.groups.forEach(function (g) {
        eventsOf(g).forEach(function (n) { if (names.indexOf(n) === -1) { names.push(n); } });
      });
    });
    var strip = el('div', 'plan__events');
    if (!names.length) { strip.hidden = true; return strip; }
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Activities in this plan');
    names.forEach(function (n) {
      var b = el('button', 'plan__event');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(activity('plan__event-name', n));
      b.addEventListener('click', function () { lightEvent(wrap, plan, n); });
      strip.appendChild(b);
    });
    return strip;
  }

  // The groups doing any of the tapped activities, lit up: each tap adds an activity or,
  // tapped again, takes it off; with none left the plan's back to normal.
  function lightEvent(wrap, plan, name) {
    var names = /^event:/.test(wrap.getAttribute('data-lit') || '') ? (wrap._events || []).slice() : [];
    var at = names.indexOf(name);
    if (at === -1) { names.push(name); } else { names.splice(at, 1); }
    var off = !names.length;
    wrap._events = names;
    if (off) { wrap.removeAttribute('data-lit'); } else { wrap.setAttribute('data-lit', 'event:' + names.join('|')); }
    wrap.classList.toggle('is-focused', !off);
    Array.prototype.forEach.call(wrap.querySelectorAll('.plan__group'), function (li) {
      var g = plan.slots[+li.getAttribute('data-slot')].groups[+li.getAttribute('data-group')];
      li.classList.toggle('is-lit', eventsOf(g).some(function (n) { return names.indexOf(n) !== -1; }));
      li.setAttribute('aria-pressed', 'false');
    });
    pressEvent(wrap, names);
    litFor(wrap, off ? null : names.join(', '));
  }

  // What's lit up, by name ("Grade 7 Girls", "Sprints"), for "Print selected": the button
  // shows only while something is lit
  function litFor(wrap, label) {
    if (label) { wrap.setAttribute('data-lit-label', label); } else { wrap.removeAttribute('data-lit-label'); }
    var card = wrap.closest('.plan');
    var b = card && card.querySelector('.plan__print-selected');
    if (b) { b.hidden = !label; }
  }
  // the activities pressed in the strip (`names`; none when null)
  function pressEvent(wrap, names) {
    if (!names) { wrap._events = []; }
    var strip = wrap.parentNode && wrap.parentNode.querySelector('.plan__events');
    if (!strip) { return; }
    Array.prototype.forEach.call(strip.querySelectorAll('.plan__event'), function (b) {
      b.setAttribute('aria-pressed', String(!!names && names.indexOf(b.textContent) !== -1));
    });
  }

  /* A group's whole session, lit up on the plan (the rest fades back): the blocks
     with any of the same athletes, and the All athletes blocks; for All athletes,
     every athlete's block (not the parents'); for the parents and guardians, the parents' blocks. The same again
     (or Escape) puts the plan back. */
  function lightUp(wrap, plan, si, gi) {
    var key = si + '-' + gi;
    var off = wrap.getAttribute('data-lit') === key;
    var chosen = plan.slots[si].groups[gi];
    var cells = (!chosen.everyone && !chosen.parents) ? cellsOf(chosen) : null;
    function includes(g) {
      if (chosen.everyone) { return !g.parents; }
      if (chosen.parents) { return !!g.parents; }
      if (g.parents) { return false; }
      if (g.everyone) { return true; }
      return cellsOf(g).some(function (c) { return cells.indexOf(c) !== -1; });
    }
    if (off) { wrap.removeAttribute('data-lit'); } else { wrap.setAttribute('data-lit', key); }
    wrap.classList.toggle('is-focused', !off);
    pressEvent(wrap, null);
    Array.prototype.forEach.call(wrap.querySelectorAll('.plan__group'), function (li) {
      var s = +li.getAttribute('data-slot'), g = +li.getAttribute('data-group');
      var lit = !off && ((s === si && g === gi) || includes(plan.slots[s].groups[g]));
      li.classList.toggle('is-lit', lit);
      li.setAttribute('aria-pressed', String(!off && s === si && g === gi));
    });
    litFor(wrap, off ? null : groupLabel(chosen));
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    Array.prototype.forEach.call(document.querySelectorAll('.plan__wrap.is-focused'), function (w) {
      w.classList.remove('is-focused');
      w.removeAttribute('data-lit');
      pressEvent(w, null);
      litFor(w, null);
      Array.prototype.forEach.call(w.querySelectorAll('.plan__group'), function (li) {
        li.classList.remove('is-lit');
        li.setAttribute('aria-pressed', 'false');
      });
    });
  });

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
      { start: '17:00', end: '17:15', note: '', groups: [
        { everyone: true, parents: false, grades: [], sex: 'both', events: ['Warm up'], note: '', coach_note: '' },
        { everyone: false, parents: true, grades: [], sex: 'both', events: ['Set up'], note: '', coach_note: '' }] },
      { start: '17:15', end: '17:30', note: '', groups: [] }
    ] };
  }

  function copySlots(slots) {
    return (slots || []).map(function (s) {
      return { start: s.start, end: s.end, note: s.note || '', coach_note: s.coach_note || '', groups: s.groups.map(function (g) {
        return { everyone: !!g.everyone, parents: !!g.parents, grades: g.grades.slice(), sex: g.sex || 'both', events: eventsOf(g).slice(),
                 note: g.note || '', coach_note: g.coach_note || '' };
      }) };
    });
  }

  function openEditor(plan, isNew) {
    editing = { date: plan.date, notes: plan.notes || '', coach_notes: plan.coach_notes || '',
                slots: copySlots(plan.slots), status: plan.status || 'draft',
                isNew: isNew, from: isNew ? null : plan.date };
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
    editorBox.appendChild(dateField(plan));      // a saved plan's too: saving moves it

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
    // A released plan: save it as it is (still public), or save it as a draft, which
    // takes it off the public page until it's released again.
    if (plan.status === 'released') {
      bar.appendChild(button('Save (stays released)', 'btn btn--accent btn--sm', function () { save(null, said); }));
      bar.appendChild(button('Save as a draft', 'btn btn--sm', function () { save('draft', said); }));
    } else {
      bar.appendChild(button('Save as a draft', 'btn btn--sm', function () { save(null, said); }));
      bar.appendChild(button('Save and release', 'btn btn--accent btn--sm', function () { save('release', said); }));
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
      if (taken(plan)) {
        said.appendChild(el('span', 'plan-date__warn', 'Already has a plan: saving replaces it'));
      } else if (plan.from && plan.date !== plan.from) {
        said.appendChild(el('span', 'plan-date__warn', 'Saving moves the plan from ' + longDate(plan.from)));
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
                  { kind: 'sex', value: 'both', label: 'Girls & Boys' }, { kind: 'everyone', value: true, label: 'All athletes' },
                  { kind: 'parents', value: true, label: 'Parents & guardians' }]);
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
    var b = c.kind === 'event' ? activity('plan-chip plan-chip--event', c.label) : el('span', 'plan-chip plan-chip--' + c.kind, c.label);
    b = (function (span) {         // the chip is a button holding the icon and name
      var btn = el('button', span.className);
      while (span.firstChild) { btn.appendChild(span.firstChild); }
      return btn;
    }(b));
    b.type = 'button';
    b.draggable = true;
    b.setAttribute('aria-pressed', String(inSelection(c)));
    b.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', JSON.stringify(inSelection(c) ? picked : c));
      e.dataTransfer.effectAllowed = 'copy';
      editorBox.classList.add('is-dragging');
    });
    b.addEventListener('dragend', function () { editorBox.classList.remove('is-dragging'); });
    // tapping adds the chip to the selection, or takes it out again
    b.addEventListener('click', function () {
      if (picked && picked.kind === 'group') { unpick(); }
      var items = picked && picked.kind === 'chips' ? picked.items : [];
      var was = inSelection(c);
      items = was ? items.filter(function (x) { return !(x.kind === c.kind && x.value === c.value); })
                  : items.concat([c]);
      picked = items.length ? { kind: 'chips', items: items,
                                label: items.map(function (x) { return x.label; }).join(', ') } : null;
      b.setAttribute('aria-pressed', String(!was));
      editorBox.classList.toggle('is-placing', !!picked);
      showHint();
    });
    return b;
  }
  function inSelection(c) {
    return !!picked && picked.kind === 'chips' && picked.items.some(function (x) { return x.kind === c.kind && x.value === c.value; });
  }

  function showHint() {
    var hint = document.getElementById('plan-hint');
    var bar = document.getElementById('plan-placing');
    if (!hint) { return; }
    hint.textContent = 'Drag a grade, Girls / Boys / All athletes or an event onto a group, or onto a time slot’s ' +
      '“New group” to start one. Or tap chips (several if you like: Grade 7, Grade 8, Girls), then each group ' +
      'they go on.';
    if (!bar) { return; }
    bar.hidden = !picked;
    var text = bar.querySelector('.plan-placing__text');
    text.textContent = '';
    if (picked && picked.kind === 'group') {
      text.appendChild(document.createTextNode(picked.mode === 'copy' ? 'Copying ' : 'Moving '));
      text.appendChild(el('strong', null, picked.label));
      text.appendChild(document.createTextNode(': tap a group to put it before that one, or a time slot’s ' +
        '“New group” to put it at the end.'));
    } else if (picked) {
      text.appendChild(document.createTextNode('Placing '));
      text.appendChild(el('strong', null, picked.label));
      text.appendChild(document.createTextNode(picked.items.length > 1
        ? ': tap each group they all go on, or a time slot’s “New group”. Tap a chip again to take it out.'
        : ': tap each group it goes on, or a time slot’s “New group”. Tap more chips to add them.'));
    }
  }

  // stop placing a tapped chip
  function unpick() {
    picked = null;
    editorBox.classList.remove('is-placing');
    Array.prototype.forEach.call(editorBox.querySelectorAll('.plan-chip, .plan-group__tool'), function (x) {
      x.setAttribute('aria-pressed', 'false');
    });
    Array.prototype.forEach.call(editorBox.querySelectorAll('.plan-group.is-picked'), function (x) {
      x.classList.remove('is-picked');
    });
    showHint();
  }

  // what a chip does to a group
  function apply(g, c) {
    if (c.kind === 'chips') { c.items.forEach(function (x) { apply(g, x); }); return; }
    if (c.kind === 'grade') {
      g.everyone = false;
      g.parents = false;
      if (g.grades.indexOf(c.value) === -1) { g.grades.push(c.value); g.grades.sort(function (a, b) { return a - b; }); }
    } else if (c.kind === 'sex') {
      g.everyone = false;
      g.parents = false;
      g.sex = c.value;
    } else if (c.kind === 'everyone' || c.kind === 'parents') {
      g.everyone = c.kind === 'everyone';     // everyone: all the athletes
      g.parents = c.kind === 'parents';       // the parents and guardians (setting up, packing down)
      g.grades = [];
      g.sex = 'both';
    } else if (c.kind === 'event') {
      g.events = eventsOf(g);
      if (g.events.indexOf(c.value) === -1 && g.events.length < MAX_EVENTS) { g.events.push(c.value); }
    }
    changed();
  }

  // A group block moved (or copied) to `toSlot`, before its group number `before`
  // (null: at the end). `c` says which: {kind: 'group', mode: 'move' | 'copy', s, g}.
  function placeGroup(c, toSlot, before) {
    var from = editing.slots[c.s];
    var src = from && from.groups[c.g];
    if (!src || !toSlot) { return; }
    var item = src;
    if (c.mode === 'copy') {
      item = JSON.parse(JSON.stringify(src));
    } else {
      from.groups.splice(c.g, 1);
      if (from === toSlot && before !== null && before > c.g) { before -= 1; }
    }
    if (before === null || before > toSlot.groups.length) { toSlot.groups.push(item); }
    else { toSlot.groups.splice(before, 0, item); }
    changed();
  }
  function groupPick(slot, g, gi, mode) {
    var events = eventsOf(g);
    return { kind: 'group', mode: mode, s: editing.slots.indexOf(slot), g: gi,
             label: groupLabel(g) + (events.length ? ' · ' + events.join(', ') : '') };
  }
  var draggingGroup = false;      // a group block, not a chip, is being dragged

  function newGroup(slot, c) {
    var g = { everyone: false, parents: false, grades: [], sex: 'both', events: [], note: '', coach_note: '' };
    if (c) { apply(g, c); }
    slot.groups.push(g);
    changed();
    return g;
  }

  // a drop target: something dragged, or a picked chip tapped onto it
  function target(node, onChip) {
    node.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = draggingGroup && !(e.ctrlKey || e.altKey) ? 'move' : 'copy';
      node.classList.add('is-over');
    });
    node.addEventListener('dragleave', function (e) { if (!node.contains(e.relatedTarget)) { node.classList.remove('is-over'); } });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('is-over');
      editorBox.classList.remove('is-dragging');
      var c;
      try { c = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (c && c.kind === 'group' && (e.ctrlKey || e.altKey)) { c.mode = 'copy'; }
      draggingGroup = false;
      if (c && c.kind) { onChip(c); renderEditor(); }
    });
    node.addEventListener('click', function (e) {
      if (!picked || e.target.closest('input, textarea, select, .plan-slot__times, button:not(.plan-slot__new)')) { return; }
      e.stopPropagation();          // a group inside a time slot: only the group gets it
      var placing = picked;
      if (placing.kind === 'group') { unpick(); }    // a group goes in one place
      onChip(placing);
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
    target(fresh, function (c) { if (c.kind === 'group') { placeGroup(c, slot, null); } else { newGroup(slot, c); } });
    groups.appendChild(fresh);
    target(groups, function (c) { if (c.kind === 'group') { placeGroup(c, slot, null); } else { newGroup(slot, c); } });
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
    var cell = el('div', 'plan-group' + (g.everyone ? ' plan-group--everyone' : g.parents ? ' plan-group--parents' : ''));
    cell.tabIndex = 0;
    cell.setAttribute('aria-label', groupLabel(g) + (eventsOf(g).length ? ', ' + eventsOf(g).join(', ') : '') + '. Drop or place a chip here.');
    var isPicked = picked && picked.kind === 'group' && picked.s === editing.slots.indexOf(slot) && picked.g === gi;
    if (isPicked) { cell.classList.add('is-picked'); }
    var who = el('div', 'plan-group__who');
    // the handle to drag the block by (to another slot, or before another block)
    var grip = el('span', 'plan-group__grip', '⠿');
    grip.draggable = true;
    grip.title = 'Drag to move (hold Ctrl or Alt to copy)';
    grip.setAttribute('aria-hidden', 'true');
    grip.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', JSON.stringify(groupPick(slot, g, gi, 'move')));
      e.dataTransfer.effectAllowed = 'copyMove';
      draggingGroup = true;
      editorBox.classList.add('is-dragging');
    });
    grip.addEventListener('dragend', function () { draggingGroup = false; editorBox.classList.remove('is-dragging'); });
    who.appendChild(grip);
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
    if (!g.everyone && !g.parents) {
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

    g.events = eventsOf(g);
    var acts = el('div', 'plan-group__acts');
    g.events.forEach(function (name, k) {
      var tag = el('span', 'plan-group__act');
      tag.appendChild(activity('plan-group__act-name', name));
      var off = button('×', 'plan-group__act-off', function (e) {
        e.stopPropagation();
        g.events.splice(k, 1);
        changed();
        renderEditor();
      });
      off.setAttribute('aria-label', 'Remove ' + name + ' from ' + groupLabel(g));
      tag.appendChild(off);
      acts.appendChild(tag);
    });
    cell.appendChild(acts);
    if (g.events.length < MAX_EVENTS) {
      var what = el('input', 'plan-group__event');
      what.maxLength = 60;
      what.placeholder = g.events.length ? 'Add another activity' : 'Activity';
      what.setAttribute('aria-label', (g.events.length ? 'Another activity for ' : 'Activity for ') + groupLabel(g));
      what.setAttribute('list', 'plan-events');
      // added when the typing is done: Enter, or leaving the box
      var add = function () {
        var v = what.value.trim();
        if (!v) { return; }
        if (g.events.indexOf(v) === -1) { g.events.push(v); changed(); }
        renderEditor();
      };
      what.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      what.addEventListener('change', add);
      cell.appendChild(what);
    }
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
    // move or copy by tapping (phones, keyboards): then tap where it goes
    var tools = el('div', 'plan-group__tools');
    ['move', 'copy'].forEach(function (mode) {
      var b = button(mode === 'move' ? 'Move' : 'Copy', 'plan-group__tool', function (e) {
        e.stopPropagation();
        var again = picked && picked.kind === 'group' && picked.mode === mode && isPicked;
        unpick();
        if (!again) {
          picked = groupPick(slot, g, gi, mode);
          editorBox.classList.add('is-placing');
        }
        renderEditor();
      });
      b.setAttribute('aria-pressed', String(!!(isPicked && picked.mode === mode)));
      b.setAttribute('aria-label', (mode === 'move' ? 'Move ' : 'Copy ') + groupLabel(g) +
        ' to another time slot or place');
      tools.appendChild(b);
    });
    cell.appendChild(tools);
    cell.appendChild(button('Remove group', 'plan-group__remove', function (e) {
      e.stopPropagation();
      slot.groups.splice(gi, 1);
      changed();
      renderEditor();
    }));
    var drop = function (c) { if (c.kind === 'group') { placeGroup(c, slot, gi); } else { apply(g, c); } };
    target(cell, drop);
    cell.addEventListener('keydown', function (e) {
      if (e.target === cell && picked && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        var placing = picked;
        if (placing.kind === 'group') { unpick(); }
        drop(placing);
        renderEditor();
      }
    });
    return cell;
  }

  // save the plan, then (`then`) release it or take it back to a draft
  // whether another plan already has the plan's date (not its own, when it's being moved)
  function taken(plan) {
    return [].concat(state.upcoming, state.past).some(function (p) { return p.date === plan.date && p.date !== plan.from; });
  }

  function save(then, said) {
    var plan = editing;
    if (!plan.date) { said.textContent = 'Choose the session’s date.'; return; }
    var replace = taken(plan);
    if (replace && !window.confirm('There is already a plan for ' + longDate(plan.date) + '. Replace it?')) { return; }
    var moving = !!plan.from && plan.date !== plan.from;
    var bad = plan.slots.filter(function (s) { return s.end <= s.start; })[0];
    if (bad) { said.textContent = 'A time slot ends before it starts (' + bad.start + '–' + bad.end + ').'; return; }
    said.textContent = 'Saving…';
    NCAN.send('/training/' + (moving ? plan.from : plan.date),
              { notes: plan.notes, coach_notes: plan.coach_notes, slots: plan.slots }).then(function (res) {
      if (res.status !== 200) { said.textContent = apiError(res); return null; }
      if (!moving) { return res; }
      // then to its new date, as it is
      return NCAN.send('/training/' + plan.from + '/move', { to: plan.date, replace: replace }).then(function (moved) {
        if (moved.status !== 200) { said.textContent = 'Saved, but not moved: ' + apiError(moved); dirty = false; return null; }
        plan.from = plan.date;
        return moved;
      });
    }).then(function (res) {
      if (!res) { return null; }
      if (!then) { return res; }
      return NCAN.send('/training/' + plan.date + '/' + then, {});
    }).then(function (res) {
      if (!res) { return; }
      if (res.status !== 200) {
        said.textContent = (then === 'release' ? 'Saved as a draft, but not released: '
                                                : 'Saved, but still released: ') + apiError(res);
        dirty = false;
        return;
      }
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

  // ------------------------------------------------------------ sharing

  var sharedView = false;      // showing one plan from a share link
  function shareUrl(date) { return location.origin + '/tuesday-training/#/plan/' + date; }

  // "Share link": the phone's share menu where there is one, else copied, and shown to copy
  // by hand. {button, out}: the button goes with the print buttons, `out` (what it says) under them.
  function shareParts(plan) {
    var row = el('div', 'plan-share');
    var said = el('span', 'plan-share__said');
    said.setAttribute('role', 'status');
    var url = shareUrl(plan.date);
    var shareButton = button('Share link', null, function () {
      var title = 'Training plan, ' + longDate(plan.date);
      var shown = function (text) {
        said.textContent = text;
        var box = row.querySelector('.plan-share__url') || el('input', 'plan-share__url');
        box.value = url;
        box.readOnly = true;
        box.setAttribute('aria-label', 'The link to share');
        box.addEventListener('focus', function () { box.select(); });
        row.appendChild(box);
      };
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        navigator.share({ title: title, url: url }).catch(function () { /* closed: nothing to do */ });
        return;
      }
      var copy = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url)
                                                                     : Promise.reject(new Error('no clipboard'));
      copy.then(function () { shown('Link copied. Anyone with it can see this plan, but not change it.'); },
                function () { shown('Copy this link. Anyone with it can see this plan, but not change it.'); });
    });
    row.appendChild(said);
    return { button: shareButton, out: row };
  }

  // "Wednesday 18 November 2026 at 9:12 am", from the API's "2026-11-18T09:12:00"
  function whenText(stamp) {
    if (!stamp || !/^\d{4}-\d{2}-\d{2}/.test(stamp)) { return 'recently'; }
    var t = stamp.slice(11, 16);
    if (!/^\d{2}:\d{2}$/.test(t)) { return longDate(stamp.slice(0, 10)); }
    var c = clock(t);
    return longDate(stamp.slice(0, 10)) + ' at ' + c.text + (c.pm ? ' pm' : ' am');
  }

  // One plan, from a share link: to read and print, nothing to edit, no coaches' notes.
  function showShared(date, movedFrom, hops) {
    sharedView = true;
    state.canEdit = false;
    tools.hidden = true;
    editorBox.hidden = true;
    signInBox.hidden = true;
    accountBox.hidden = true;
    listBox.textContent = '';
    listBox.appendChild(el('p', 'note', 'Loading the training plan…'));
    var all = el('a', null, 'See all the Tuesday training plans');
    all.href = '/tuesday-training/';
    function finish(nodes) {
      listBox.textContent = '';
      nodes.forEach(function (n) { listBox.appendChild(n); });
      var back = el('p', 'training-shared__all');
      back.appendChild(all);
      listBox.appendChild(back);
    }
    function message(text) { return el('p', 'training-shared__gone', text); }
    return NCAN.get('/training/' + date).then(function (plan) {
      var nodes = [];
      if (movedFrom) { nodes.push(el('p', 'training-shared__moved', 'This plan has moved here from ' + longDate(movedFrom) + '.')); }
      nodes.push(planCard(publicCopy(plan), true));
      finish(nodes);
    }, function (err) {
      var body = err.body || {};
      if (body.moved_to && (hops || 0) < 5) {
        if (window.history && history.replaceState) { history.replaceState(null, '', '#/plan/' + body.moved_to); }
        return showShared(body.moved_to, movedFrom || date, (hops || 0) + 1);
      }
      if (err.status === 410) {
        return finish([message('The training plan for ' + longDate(date) + ' was removed on ' + whenText(body.removed) + '.')]);
      }
      if (body.state === 'draft') {
        return finish([message('The training plan for ' + longDate(date) + ' is being changed. Please check back soon.')]);
      }
      if (err.status === 404) {
        return finish([message('There’s no training plan for ' + longDate(date) + '.')]);
      }
      finish([message('The training plan can’t be loaded just now. Please try again later.')]);
    });
  }

  // what a share link shows, whoever opens it: no coaches' notes, no who changed it
  function publicCopy(plan) {
    var p = JSON.parse(JSON.stringify(plan));
    delete p.coach_notes;
    delete p.updated_by;
    delete p.created_by;
    (p.slots || []).forEach(function (s) {
      delete s.coach_note;
      (s.groups || []).forEach(function (g) { delete g.coach_note; });
    });
    return p;
  }

  // ------------------------------------------------------------ printing

  // Print plan (everyone); staff also: with the coaches' notes, and strips to cut up
  function printButtons(plan) {
    var row = el('div', 'plan__print');
    row.appendChild(button('Print plan', null, function () { printPlan(plan, false); }));
    if (state.canEdit) {
      row.appendChild(button('Print with coaches’ notes', null, function () { printPlan(plan, true); }));
      row.appendChild(button('Print strips for each group', null, function () { printStrips(plan); }));
    }
    // only the lit-up blocks (a group's session, or who does an activity), shown while there are some
    var picked = button('Print selected', null, function () {
      var card = picked.closest('.plan');
      var wrap = card && card.querySelector('.plan__wrap');
      if (!wrap || !wrap.getAttribute('data-lit-label')) { return; }
      var lit = {};
      Array.prototype.forEach.call(wrap.querySelectorAll('.plan__group.is-lit'), function (li) {
        lit[li.getAttribute('data-slot') + '-' + li.getAttribute('data-group')] = true;
      });
      printPlan(plan, false, { label: wrap.getAttribute('data-lit-label'), has: function (s, g) { return lit[s + '-' + g]; } });
    });
    picked.classList.add('plan__print-selected');
    picked.hidden = true;
    row.appendChild(picked);
    return row;
  }

  // The sheet that's printed: built on demand, shown only in print (body.plan-printing)
  // the sheet, with the club's header (logo, title, date) unless `title` is null
  function sheet(title, plan) {
    var old = document.getElementById('plan-print');
    if (old) { old.remove(); }
    var box = el('div', 'plan-print');
    box.id = 'plan-print';
    if (title === null) { return box; }
    var head = el('div', 'plan-print__head');
    var logo = el('img', 'plan-print__logo');
    logo.src = '/assets/img/logo.svg';
    logo.alt = '';
    head.appendChild(logo);
    var words = el('div');
    words.appendChild(el('p', 'plan-print__club', 'North Canterbury Athletic Club · ' + (state.squad || 'Children’s 7–14 team')));
    words.appendChild(el('h1', 'plan-print__title', title));
    words.appendChild(el('p', 'plan-print__date', longDate(plan.date)));
    head.appendChild(words);
    box.appendChild(head);
    return box;
  }

  function go(box) {
    document.body.appendChild(box);
    document.body.classList.add('plan-printing');
    window.print();
  }
  window.addEventListener('afterprint', function () {
    document.body.classList.remove('plan-printing');
    var old = document.getElementById('plan-print');
    if (old) { old.remove(); }
  });

  function printNote(text, coach) {
    var n = el('span', coach ? 'plan-print__coach' : 'plan-print__note');
    if (coach) { n.appendChild(el('strong', null, 'Coaches: ')); }
    n.appendChild(document.createTextNode(text));
    return n;
  }

  // the whole plan: a row per time slot, each group's activity in it
  // `only` ({label, has(slot, group)}): just those blocks, and the time slots they're in
  function printPlan(plan, coaches, only) {
    var box = sheet(only ? 'Training plan: ' + only.label :
      coaches ? 'Training plan (with coaches’ notes)' : 'Training plan', plan);
    if (only) {
      box.appendChild(el('p', 'plan-print__part', 'This is part of the session’s plan: only the blocks for ' + only.label +
        '. The whole plan is at the address at the foot of the page.'));
    }
    if (plan.notes) { box.appendChild(el('p', 'plan-print__notes', plan.notes)); }
    if (coaches && plan.coach_notes) { box.appendChild(el('p', 'plan-print__notes', '')).appendChild(printNote(plan.coach_notes, true)); }
    var table = el('table', 'plan-print__table');
    var tbody = el('tbody');
    plan.slots.forEach(function (whole, si) {
      var slot = whole;
      if (only) {
        slot = Object.assign({}, whole, { groups: whole.groups.filter(function (g, gi) { return only.has(si, gi); }) });
        if (!slot.groups.length) { return; }
      }
      var tr = el('tr');
      // the start at the top of the cell and the end at the bottom ("5:15" ... "5:30"),
      // so the column is narrow and the groups have the room
      var when = el('th', 'plan-print__time plan-print__time--wrap');
      when.appendChild(el('span', null, clock(slot.start).text));
      when.appendChild(el('span', 'plan-print__until', clock(slot.end).text));
      tr.appendChild(when);
      var td = el('td');
      var list = el('div', 'plan-print__groups');
      slot.groups.forEach(function (g) {
        var cell = el('div', 'plan-print__group' + (g.everyone ? ' plan-print__group--everyone' : g.parents ? ' plan-print__group--parents' : ''));
        cell.appendChild(el('span', 'plan-print__who', groupLabel(g)));
        cell.appendChild(activities('plan-print__what', g));
        if (g.note) { cell.appendChild(printNote(g.note, false)); }
        if (coaches && g.coach_note) { cell.appendChild(printNote(g.coach_note, true)); }
        list.appendChild(cell);
      });
      td.appendChild(list);
      if (slot.note) { td.appendChild(printNote(slot.note, false)); }
      if (coaches && slot.coach_note) { td.appendChild(printNote(slot.coach_note, true)); }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    box.appendChild(wholePlanFoot(plan, !!only));
    go(box);
  }

  // the foot of a printed plan: where it is online, in words and as a QR code (for a
  // part of the plan, where the whole plan is)
  function wholePlanFoot(plan, part) {
    var url = shareUrl(plan.date);
    var foot = el('div', 'plan-print__foot');
    var words = el('div');
    words.appendChild(el('p', 'plan-print__foot-lead', (part ? 'The whole plan for ' : 'This plan online, for ') +
      longDate(plan.date) + (plan.status === 'draft' ? ' (once it’s released)' : '') + ':'));
    words.appendChild(el('p', 'plan-print__url', url.replace(/^https?:\/\//, '')));
    words.appendChild(el('p', null, 'Or scan the code with a phone’s camera.'));
    foot.appendChild(words);
    if (window.NCANQR) {
      try { foot.appendChild(NCANQR.svg(url, { size: '26mm' })); } catch (e) { /* the address in words is enough */ }
    }
    return foot;
  }

  /* Strips: the plan cut up by who does what. Each athlete is a grade and a sex
     ("girls 7"); their path through the session is which group they're in at each
     time slot (All athletes counts for every athlete). Athletes with the same path get one strip,
     so there are as few strips as the plan allows: e.g. grade 10-12 and 13-14 are
     split when they do different things at 5:15, even if they're together for
     relays later. Grades no group names don't get a strip. The parents and
     guardians get one of their own (All athletes means the athletes), last, with only
     the time slots they have something in. */
  var SEXES = ['girls', 'boys'];
  function cellsOf(g) {
    if (g.parents) { return ['parents']; }
    if (g.everyone) { return null; }                          // everyone: all the athletes
    var sexes = g.sex === 'both' ? SEXES : [g.sex];
    var grades = g.grades.length ? g.grades : (g.sex === 'both' ? [] : state.grades);   // "Girls": every grade
    var out = [];
    sexes.forEach(function (x) { grades.forEach(function (n) { out.push(x + ' ' + n); }); });
    return out;
  }

  function strips(plan) {
    var order = [];                                           // athletes, in the order the plan names them
    plan.slots.forEach(function (slot) {
      slot.groups.forEach(function (g) {
        (cellsOf(g) || []).forEach(function (c) { if (order.indexOf(c) === -1) { order.push(c); } });
      });
    });
    if (order.indexOf('parents') !== -1) { order.splice(order.indexOf('parents'), 1); order.push('parents'); }
    if (!order.length) { return [{ label: 'All athletes', path: plan.slots.map(function (s) { return s.groups; }) }]; }
    var bySignature = {};
    var out = [];
    order.forEach(function (c) {
      var path = plan.slots.map(function (slot) {
        return slot.groups.filter(function (g) {
          var cells = cellsOf(g);
          return cells ? cells.indexOf(c) !== -1 : c !== 'parents';
        });
      });
      var sig = path.map(function (gs, i) {
        return gs.map(function (g) { return plan.slots[i].groups.indexOf(g); }).join('+');
      }).join('|');
      if (!bySignature[sig]) { bySignature[sig] = { cells: [], path: path }; out.push(bySignature[sig]); }
      bySignature[sig].cells.push(c);
    });
    out.forEach(function (st) { st.label = stripLabel(st.cells); st.parents = st.cells[0] === 'parents'; });
    return out;
  }

  // "Grade 7, 8, 9 Girls", "Grade 10, 11, 12 Girls & Boys", "Grade 7 Girls and Grade 8 Boys"
  function stripLabel(cells) {
    if (cells[0] === 'parents') { return 'Parents & guardians'; }
    function grades(sex) {
      return cells.filter(function (c) { return c.indexOf(sex + ' ') === 0; })
        .map(function (c) { return +c.split(' ')[1]; }).sort(function (a, b) { return a - b; });
    }
    var girls = grades('girls'), boys = grades('boys');
    if (girls.length && girls.join() === boys.join()) { return 'Grade ' + girls.join(', ') + ' Girls & Boys'; }
    var parts = [];
    if (girls.length) { parts.push('Grade ' + girls.join(', ') + ' Girls'); }
    if (boys.length) { parts.push('Grade ' + boys.join(', ') + ' Boys'); }
    return parts.join(' and ');
  }

  function printStrips(plan) {
    // no page header: each strip carries its group and the date, and the page
    // starts with the first one (more strips to a page)
    var box = sheet(null, plan);
    box.classList.add('plan-print--strips');
    var list = strips(plan);
    list.forEach(function (st) {
      var strip = el('section', 'plan-strip');
      var head = el('div', 'plan-strip__head');
      head.appendChild(el('strong', 'plan-strip__who', st.label));
      head.appendChild(el('span', 'plan-strip__date', longDate(plan.date)));
      strip.appendChild(head);
      var table = el('table', 'plan-strip__table');
      var tbody = el('tbody');
      plan.slots.forEach(function (slot, i) {
        var tr = el('tr');
        tr.appendChild(el('th', 'plan-print__time', clock(slot.start).text));   // the start only: the next row's is the end
        var td = el('td');
        var gs = st.path[i];
        if (!gs.length && st.parents) { return; }             // the parents: only their own slots
        if (!gs.length) { td.appendChild(el('span', 'plan-print__note', '—')); }
        gs.forEach(function (g, k) {
          if (k) { td.appendChild(document.createTextNode(' / ')); }
          td.appendChild(activities('plan-print__what', g));
          if (g.note) { td.appendChild(printNote(g.note, false)); }
        });
        if (slot.note) { td.appendChild(printNote(slot.note, false)); }
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      strip.appendChild(table);
      box.appendChild(strip);
    });
    go(box);
  }

  // for checking the strips without printing (see the tests in the page's console)
  window.NCANTraining = { strips: strips, stripLabel: stripLabel };

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

  var shared = /^#\/plan\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
  window.addEventListener('hashchange', function () {
    var now = /^#\/plan\//.test(location.hash);
    if (now || sharedView) { location.reload(); }
  });
  if (shared) {
    showShared(shared[1]);
    return;
  }

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
