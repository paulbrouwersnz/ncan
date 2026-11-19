/*
  training-editor.js - the coaches' side of the training plans on the Junior
  Athletics page (/junior-athletics/): the buttons on a plan (Edit, Release,
  Schedule release, Cancel the session, Copy to a new date, Delete...) and the
  planner that makes and changes a plan. Loaded after training.js, which it
  shares with through window.NCANTraining; training.js has the whole story.

  The planner's help, "How to use the planner" (#planner-help in
  junior-athletics/index.html), is written by hand and describes this file's
  buttons, chips and behaviour by name: when a label or what it does changes,
  update the help to match.
*/
(function () {
  'use strict';

  var T = window.NCANTraining;
  if (!T) { return; }

  var ACTIVITY_GROUPS = T.ACTIVITY_GROUPS, MAX_EVENTS = T.MAX_EVENTS, SEXES = T.SEXES, STATUS = T.STATUS,
      activities = T.activities, activity = T.activity, addMinutes = T.addMinutes, apiError = T.apiError,
      button = T.button, cellsOf = T.cellsOf, editorBox = T.editorBox, el = T.el, eventNotes = T.eventNotes,
      eventsOf = T.eventsOf, groupLabel = T.groupLabel, groupOf = T.groupOf, iso = T.iso, load = T.load,
      longDate = T.longDate, minutes = T.minutes, parseDate = T.parseDate, planEvents = T.planEvents,
      showList = T.showList, state = T.state, stripLabel = T.stripLabel, timeRange = T.timeRange,
      whenText = T.whenText;

  var editing = null;        // the plan in the editor: {date, notes, slots, status, isNew}
  var dirty = false;
  // What's picked by tapping: chips, several at once ({kind: 'chips', items: [chip...],
  // label}), each applied to every group tapped; or a group block to move or copy
  // ({kind: 'group', ...}).
  var picked = null;

  // the staff's buttons on a plan (described in the planner's help, #planner-help in
  // junior-athletics/index.html: keep it in step)
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
    // a cancelled session's plan can be changed too (saving keeps it cancelled)
    bar.appendChild(button('Edit', 'btn btn--sm', function () { openEditor(plan, false); }));
    if (plan.status === 'draft') {
      bar.appendChild(button(plan.release_at ? 'Release now' : 'Release', 'btn btn--accent btn--sm', function () { act('release'); }));
      // released by itself at a set time: until then a draft, and the public is told when
      bar.appendChild(button(plan.release_at ? 'Change release time' : 'Schedule release', null, function () {
        bar.hidden = true;
        bar.parentNode.insertBefore(scheduleForm(plan, function (at) {
          return act('schedule', { at: at });
        }, function () { bar.hidden = false; }), bar);
      }));
      if (plan.release_at) {
        bar.appendChild(button('Unschedule', null, function () { act('draft'); }));
      }
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
                   event_notes: plan.event_notes, status: 'draft' }, true);
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

  // "Release the plan at" a date and time (the club's time, as the browser has it);
  // by default the evening before the session, at 6pm, or an hour from now if that's passed
  function localStamp(d) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return iso(d) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes());
  }
  function scheduleForm(plan, onSchedule, onBack) {
    var form = el('form', 'plan__cancel-form plan__schedule-form');
    var field = el('p', 'records-field');
    var label = el('label', null, 'Release the plan at');
    var input = el('input');
    input.type = 'datetime-local';
    input.id = 'schedule-at-' + plan.date;
    label.htmlFor = input.id;
    input.required = true;
    var now = new Date();
    input.min = localStamp(now);
    var eve = parseDate(plan.date);
    eve.setDate(eve.getDate() - 1);
    eve.setHours(18, 0, 0, 0);
    if (eve <= now) { eve = new Date(now.getTime() + 60 * 60 * 1000); eve.setMinutes(0, 0, 0); }
    input.value = plan.release_at || localStamp(eve);
    field.appendChild(label);
    field.appendChild(input);
    form.appendChild(field);
    form.appendChild(el('p', 'plan__schedule-help', 'Until then it stays a draft, and families see when it will be released.'));
    var row = el('div', 'plan__actions');
    var go = el('button', 'btn btn--accent btn--sm', plan.release_at ? 'Change release time' : 'Schedule release');
    go.type = 'submit';
    row.appendChild(go);
    row.appendChild(button('Keep it as it is', null, function () { form.remove(); onBack(); }));
    form.appendChild(row);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value) { input.focus(); return; }
      go.disabled = true;
      onSchedule(input.value.slice(0, 16));
    });
    setTimeout(function () { input.focus(); }, 0);
    return form;
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

  // A new plan: the club night's usual frame (warm up and set up at 5:00, the long run
  // or race walk and pack down at 6:00, three empty slots between), with the usual
  // word to parents. Only the date changes.
  function blankPlan() {
    function g(who, events, note) {
      return { everyone: who === 'everyone', parents: who === 'parents', grades: [], sex: 'both', events: events,
               note: note || '', coach_note: '' };
    }
    function slot(start, end, groups) { return { start: start, end: end, note: '', coach_note: '', groups: groups || [] }; }
    return {
      notes: 'Parents and guardians are encouraged to either:\n' +
             '· adopt an activity station and help the coach during the session.\n' +
             '· chaperone a group and assist the children and/or coach.',
      slots: [
        slot('17:00', '17:15', [g('everyone', ['Warm up']),
          g('parents', ['Set up'], 'Take equipment from the container to the stations and setup as required.')]),
        slot('17:15', '17:30'),
        slot('17:30', '17:45'),
        slot('17:45', '18:00'),
        slot('18:00', '18:15', [g('everyone', ['Long run', 'Race walk']),
          g('parents', ['Pack down'], 'Check in with station to see if you can help return equipment to the container.')])
      ]
    };
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
                releaseAt: isNew ? null : plan.release_at || null,   // saving keeps a scheduled release
                cancelledWhy: isNew ? '' : plan.cancelled_why || '',
                since: isNew ? null : plan.updated || null,      // to tell if someone saves meanwhile
                // by activity, {note, coach_note}: kept while an activity's off the plan, in case it comes back
                eventNotes: (plan.event_notes || []).reduce(function (by, n) {
                  by[n.event] = { note: n.note || '', coach_note: n.coach_note || '' };
                  return by;
                }, {}),
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
    if (plan.status === 'cancelled' && !plan.isNew) {
      editorBox.appendChild(el('p', 'plan-editor__cancelled', 'This session is cancelled' +
        (plan.cancelledWhy ? ' (' + plan.cancelledWhy + ')' : '') +
        '. Saving keeps it cancelled: families see the reason, not the plan.'));
    }

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

    // notes for each of the plan's activities, for the whole session
    var names = planEvents(plan.slots);
    if (names.length) {
      var acts = el('fieldset', 'plan-editor__acts');
      acts.appendChild(el('legend', null, 'Notes for each activity (optional)'));
      names.forEach(function (name, k) {
        var n = plan.eventNotes[name] || (plan.eventNotes[name] = { note: '', coach_note: '' });
        var row = el('div', 'plan-act-note');
        row.appendChild(activity('plan-act-note__name', name));
        var pub = el('input', 'plan-act-note__note');
        pub.id = 'plan-act-note-' + k;
        pub.maxLength = 300;
        pub.value = n.note;
        pub.placeholder = k ? 'Note (shown with the plan)' : 'Shown with the plan, e.g. Bring your own spikes';
        pub.setAttribute('aria-label', 'Note for ' + name + ', shown with the plan');
        pub.addEventListener('input', function () { n.note = pub.value; changed(); });
        var coach = el('input', 'plan-act-note__coach');
        coach.maxLength = 300;
        coach.value = n.coach_note;
        coach.placeholder = k ? 'Coaches-only note' : 'Coaches only, e.g. Equipment is in the blue bin';
        coach.setAttribute('aria-label', 'Coaches-only note for ' + name);
        coach.addEventListener('input', function () { n.coach_note = coach.value; changed(); });
        row.appendChild(pub);
        row.appendChild(coach);
        acts.appendChild(row);
      });
      editorBox.appendChild(acts);
    }

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

    // what to check before saving (the slots say what): it can still be saved
    var checks = plan.slots.reduce(function (n, s) { return n + slotClashes(s).messages.length; }, 0);
    if (checks) {
      editorBox.appendChild(el('p', 'plan-editor__checks', (checks === 1 ? 'One thing' : checks + ' things') +
        ' to check in the time slots above: groups sharing a station, or athletes in two groups at once. ' +
        'You can still save the plan.'));
    }

    // save (the planner's help, #planner-help in junior-athletics/index.html, describes
    // these buttons: keep it in step)
    var bar = el('div', 'plan__actions plan-editor__save');
    var said = el('p', 'plan__said');
    said.setAttribute('role', 'status');
    // A released plan: save it as it is (still public), or save it as a draft, which
    // takes it off the public page until it's released again.
    if (plan.status === 'cancelled') {
      // saved as it is: still cancelled, with its reason ("Reinstate as a draft" on the card undoes that)
      bar.appendChild(button('Save (stays cancelled)', 'btn btn--accent btn--sm', function () { save(null, said); }));
    } else if (plan.status === 'released') {
      bar.appendChild(button('Save (stays released)', 'btn btn--accent btn--sm', function () { save(null, said); }));
      bar.appendChild(button('Save as a draft', 'btn btn--sm', function () { save('draft', said); }));
    } else if (plan.releaseAt) {
      // a draft to be released at a set time: saving keeps that time
      bar.appendChild(button('Save (keeps the release time)', 'btn btn--sm', function () { save(null, said); }));
      bar.appendChild(button('Save and release now', 'btn btn--accent btn--sm', function () { save('release', said); }));
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
  // (the planner's help, #planner-help in junior-athletics/index.html, names these: keep it in step)
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
    // the activities, a labelled row for each family (ACTIVITY_GROUPS); any others under Other
    var acts = el('div', 'plan-palette__group plan-palette__group--acts');
    acts.appendChild(el('p', 'plan-palette__title', 'Activities'));
    var sets = el('div', 'plan-palette__sets');
    function set(label, names) {
      var row = el('div', 'plan-palette__set');
      row.appendChild(el('span', 'plan-palette__set-name', label));
      var chips = el('div', 'plan-palette__chips');
      names.forEach(function (e) { chips.appendChild(chip({ kind: 'event', value: e, label: e })); });
      row.appendChild(chips);
      row.hidden = !names.length;
      sets.appendChild(row);
      return { row: row, chips: chips };
    }
    ACTIVITY_GROUPS.forEach(function (gr) {
      set(gr[0], gr[1].filter(function (e) { return state.events.indexOf(e) !== -1; }));
    });
    var other = set('Other', state.events.filter(function (e) { return !groupOf(e); }));
    acts.appendChild(sets);
    box.appendChild(acts);
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
      if (state.events.indexOf(v) === -1) {         // new: under Other, and offered in the activity boxes
        state.events.push(v);
        other.chips.appendChild(chip({ kind: 'event', value: v, label: v }));
        other.row.hidden = false;
        var list = document.getElementById('plan-events');
        if (list) { var o = el('option'); o.value = v; list.appendChild(o); }
      }
      oi.value = '';
    });
    box.appendChild(own);
    var hint = el('p', 'plan-editor__hint');
    hint.id = 'plan-hint';
    hint.setAttribute('role', 'status');
    box.appendChild(hint);
    return box;
  }

  /* Girls & Boys and All athletes are shortcuts when tapped: Girls & Boys picks Girls
     and Boys; All athletes picks every grade, Girls and Boys. Each shows as pressed
     while all it stands for is picked. (Dragged on their own, they do the same.) */
  var SEXES_PICKED = [{ kind: 'sex', value: 'girls', label: 'Girls' }, { kind: 'sex', value: 'boys', label: 'Boys' }];
  function standsFor(c) {
    if (c.kind === 'sex' && c.value === 'both') { return SEXES_PICKED; }
    if (c.kind === 'everyone') {
      return state.grades.map(function (n) { return { kind: 'grade', value: n, label: 'Grade ' + n }; }).concat(SEXES_PICKED);
    }
    return null;
  }
  function same(a, b) { return a.kind === b.kind && a.value === b.value; }
  function chipPressed(c) {
    var parts = standsFor(c);
    return parts ? parts.every(inSelection) : inSelection(c);
  }
  function pressChips() {
    Array.prototype.forEach.call(editorBox.querySelectorAll('.plan-chip'), function (b) {
      if (b._chip) { b.setAttribute('aria-pressed', String(chipPressed(b._chip))); }
    });
  }
  // what the picked chips say, e.g. "Grade 9, Grade 10, Girls & Boys" or "All athletes, Sprints"
  function pickedLabel(items) {
    var grades = items.filter(function (x) { return x.kind === 'grade'; });
    var sexes = items.filter(function (x) { return x.kind === 'sex'; });
    var all = grades.length === state.grades.length && sexes.length === 2;
    var words = all ? ['All athletes'] : grades.map(function (x) { return x.label; })
      .concat(sexes.length === 2 ? ['Girls & Boys'] : sexes.map(function (x) { return x.label; }));
    return words.concat(items.filter(function (x) { return x.kind !== 'grade' && x.kind !== 'sex'; })
      .map(function (x) { return x.label; })).join(', ');
  }

  function chip(c) {
    var shortcut = !!standsFor(c);
    var b = c.kind === 'event' ? activity('plan-chip plan-chip--event', c.label)
      : el('span', 'plan-chip plan-chip--' + c.kind + (shortcut ? ' plan-chip--shortcut' : ''), c.label);
    b = (function (span) {         // the chip is a button holding the icon and name
      var btn = el('button', span.className);
      while (span.firstChild) { btn.appendChild(span.firstChild); }
      return btn;
    }(b));
    b.type = 'button';
    b.draggable = true;
    b._chip = c;
    if (shortcut) { b.title = c.kind === 'everyone' ? 'Picks every grade, Girls and Boys' : 'Picks Girls and Boys'; }
    b.setAttribute('aria-pressed', String(chipPressed(c)));
    b.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', JSON.stringify(chipPressed(c) && picked ? picked : c));
      e.dataTransfer.effectAllowed = 'copy';
      editorBox.classList.add('is-dragging');
    });
    b.addEventListener('dragend', function () { editorBox.classList.remove('is-dragging'); });
    // tapping adds the chip to the selection, or takes it out again
    b.addEventListener('click', function () {
      if (picked && picked.kind === 'group') { unpick(); }
      var items = picked && picked.kind === 'chips' ? picked.items : [];
      var was = chipPressed(c);
      var parts = standsFor(c) || [c];
      // a shortcut pressed again takes out all it stands for; otherwise in it all goes
      items = was ? items.filter(function (x) { return !parts.some(function (p) { return same(p, x); }); })
                  : items.concat(parts.filter(function (p) { return !inSelection(p); }));
      // the parents and guardians aren't athletes: picking one side takes out the other
      if (!was && c.kind === 'parents') {
        items = items.filter(function (x) { return x.kind !== 'grade' && x.kind !== 'sex'; });
      } else if (!was && (c.kind === 'grade' || c.kind === 'sex' || c.kind === 'everyone')) {
        items = items.filter(function (x) { return x.kind !== 'parents'; });
      }
      picked = items.length ? { kind: 'chips', items: items, label: pickedLabel(items) } : null;
      pressChips();
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
    hint.textContent = 'Drag a grade, Girls / Boys / All athletes or an activity onto a group, or onto a time slot’s ' +
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
    if (c.kind === 'chips') {
      // who, taken together: Girls and Boys are both; every grade and both are All athletes
      var grades = c.items.filter(function (x) { return x.kind === 'grade'; });
      var sexes = c.items.filter(function (x) { return x.kind === 'sex'; });
      var rest = c.items.filter(function (x) { return x.kind !== 'grade' && x.kind !== 'sex'; });
      if (grades.length === state.grades.length && sexes.length === 2) {
        apply(g, { kind: 'everyone', value: true });
      } else {
        grades.forEach(function (x) { apply(g, x); });
        if (sexes.length) { apply(g, { kind: 'sex', value: sexes.length === 2 ? 'both' : sexes[0].value }); }
      }
      rest.forEach(function (x) { apply(g, x); });
      return;
    }
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

  /* What to check in a time slot (warnings: it can still be saved):
     - two groups at one station: the same activity, other than those done anywhere
       (NOT_STATIONS: warm up, cool down, the long run, games, set up, pack down);
     - athletes in two places at once: the same grade and sex in two groups (All
       athletes is every grade; "Girls" with no grade, every girls' grade).
     {messages: [...], groups: [indexes of the groups involved]} */
  var NOT_STATIONS = ['Warm up', 'Cool down', 'Long run', 'Games', 'Set up', 'Pack down'];
  var COUNT = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  function athleteCells(g) {
    if (g.parents) { return []; }
    if (g.everyone) {
      var all = [];
      SEXES.forEach(function (x) { state.grades.forEach(function (n) { all.push(x + ' ' + n); }); });
      return all;
    }
    return cellsOf(g) || [];
  }
  function slotClashes(slot) {
    var out = { messages: [], groups: [] };
    function involve(list) { list.forEach(function (gi) { if (out.groups.indexOf(gi) === -1) { out.groups.push(gi); } }); }
    function names(list) {
      var words = list.map(function (gi) { return groupLabel(slot.groups[gi]); });
      return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words[0];
    }
    // stations
    var at = {};
    slot.groups.forEach(function (g, gi) {
      eventsOf(g).forEach(function (e) {
        if (NOT_STATIONS.indexOf(e) !== -1) { return; }
        (at[e] = at[e] || []).push(gi);
      });
    });
    Object.keys(at).forEach(function (e) {
      if (at[e].length < 2) { return; }
      out.messages.push((COUNT[at[e].length] || at[e].length) + ' groups at the ' + e + ' station: ' + names(at[e]) + '.');
      involve(at[e]);
    });
    // athletes in two groups
    var cells = slot.groups.map(athleteCells);
    for (var a = 0; a < cells.length; a += 1) {
      for (var b = a + 1; b < cells.length; b += 1) {
        var both = cells[a].filter(function (c) { return cells[b].indexOf(c) !== -1; });
        if (!both.length) { continue; }
        var who = both.length === SEXES.length * state.grades.length ? 'All athletes' : stripLabel(both);
        out.messages.push(who + ' are in two groups at once: ' + names([a, b]) + '.');
        involve([a, b]);
      }
    }
    return out;
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
    var clash = slotClashes(slot);
    slot.groups.forEach(function (g, gi) {
      var cell = groupCell(slot, g, gi);
      if (clash.groups.indexOf(gi) !== -1) { cell.classList.add('has-clash'); }
      groups.appendChild(cell);
    });
    var fresh = button('New group', 'plan-slot__new', function () {
      if (picked) { return; }       // handled by target()
      newGroup(slot);
      renderEditor();
    });
    target(fresh, function (c) { if (c.kind === 'group') { placeGroup(c, slot, null); } else { newGroup(slot, c); } });
    groups.appendChild(fresh);
    target(groups, function (c) { if (c.kind === 'group') { placeGroup(c, slot, null); } else { newGroup(slot, c); } });
    row.appendChild(groups);
    if (clash.messages.length) {
      var warn = el('div', 'plan-slot__clash');
      warn.setAttribute('role', 'status');
      var ul = el('ul');
      clash.messages.forEach(function (m) { ul.appendChild(el('li', null, m)); });
      warn.appendChild(ul);
      row.appendChild(warn);
    }

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

  // `anyway`: save over a change someone else made since the editor opened (see below)
  function save(then, said, anyway) {
    var plan = editing;
    if (!plan.date) { said.textContent = 'Choose the session’s date.'; return; }
    var replace = taken(plan);
    if (replace && !window.confirm('There is already a plan for ' + longDate(plan.date) + '. Replace it?')) { return; }
    var moving = !!plan.from && plan.date !== plan.from;
    var bad = plan.slots.filter(function (s) { return s.end <= s.start; })[0];
    if (bad) { said.textContent = 'A time slot ends before it starts (' + bad.start + '–' + bad.end + ').'; return; }
    said.textContent = 'Saving…';
    NCAN.send('/training/' + (moving ? plan.from : plan.date),
              { notes: plan.notes, coach_notes: plan.coach_notes, slots: plan.slots,
                event_notes: planEvents(plan.slots).map(function (name) {
                  var n = plan.eventNotes[name] || {};
                  return { event: name, note: n.note || '', coach_note: n.coach_note || '' };
                }),
                // the plan as the editor opened it: the API refuses (409) if someone has saved since
                since: anyway ? null : plan.since }).then(function (res) {
      if (res.status === 409 && res.body && res.body.conflict) { changedMeanwhile(res.body, then, said); return null; }
      if (res.status !== 200) { said.textContent = apiError(res); return null; }
      plan.since = res.body.updated;          // saved: this is now the version the editor has
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
      state.open[res.body.date] = true;       // the plan just saved, shown in full
      return load().then(function () {
        var card = document.getElementById('plan-' + res.body.date);
        if (card) { card.scrollIntoView({ block: 'start' }); }
      });
    }).catch(function (err) { said.textContent = err.message; });
  }

  /* Someone else saved this plan after the editor opened it. Nothing has been
     written over; say who and when, and offer to save over it anyway or to close
     and look at theirs (the editor's changes are lost then, so it asks first). */
  function changedMeanwhile(body, then, said) {
    said.textContent = '';
    var box = el('div', 'plan-editor__conflict');
    box.setAttribute('role', 'alert');
    box.appendChild(el('p', null, 'Someone else saved this plan after you opened it' +
      (body.updated_by ? ' (' + body.updated_by + ', ' + whenText(body.updated) + ')' : ', ' + whenText(body.updated)) +
      '. Your changes haven’t been saved.'));
    var row = el('div', 'plan__actions');
    row.appendChild(button('Save mine anyway', 'btn btn--accent btn--sm', function () {
      box.remove();
      save(then, said, true);
    }));
    row.appendChild(button('Close and see theirs', null, function () {
      if (!window.confirm('Close the editor? Your changes will be lost.')) { return; }
      dirty = false;
      editing = null;
      editorBox.hidden = true;
      editorBox.textContent = '';
      load();
    }));
    box.appendChild(row);
    said.parentNode.insertBefore(box, said);
  }

  document.getElementById('training-new').addEventListener('click', function () {
    openEditor(Object.assign({ date: nextDate(), status: 'draft' }, blankPlan()), true);
  });
  document.getElementById('training-copy').addEventListener('click', function () {
    var latest = [].concat(state.upcoming, state.past).filter(function (p) { return p.slots && p.slots.length; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    if (!latest) { openEditor(Object.assign({ date: nextDate(), status: 'draft' }, blankPlan()), true); return; }
    openEditor({ date: nextDate(), notes: latest.notes, coach_notes: latest.coach_notes, slots: latest.slots,
                 event_notes: latest.event_notes, status: 'draft' }, true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && picked) { unpick(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (editing && dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // what training.js uses
  T.staffActions = staffActions;
  T.isEditing = function () { return !!editing; };
}());
