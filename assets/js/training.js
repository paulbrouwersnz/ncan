/*
  training.js - training plans on the Junior Athletics page (/junior-athletics/),
  the Tuesday junior club night. (It was /tuesday-training/ until November 2026:
  assets/js/moved.js sends old addresses, share links included, here.)

  What each group of the children's 7-14 team does at a session, time slot by
  time slot. Plans live in the club's API (the private ncan-api project:
  GET /v1/training, GET|POST /v1/training/<date>[/release|draft|cancel|delete]).

  Everyone sees released plans, and sessions that have been cancelled (with
  why). A released or cancelled plan has a share link,
  /junior-athletics/#/plan/2026-12-01: that plan on its own, to read and print,
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

  The planner's help, "How to use the planner" (#planner-help in
  junior-athletics/index.html), is written by hand and describes this file's
  buttons, chips and behaviour by name: when a label or what it does changes,
  update the help to match. (The "New training plan" and "Start from the latest
  plan" buttons are in that page too.)
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

  var state = { canEdit: false, events: [], grades: [7, 8, 9, 10, 11, 12, 13, 14], upcoming: [], past: [], scheduled: [] };
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
  // the plan's activities, in the order they first come
  function planEvents(slots) {
    var names = [];
    (slots || []).forEach(function (s) {
      s.groups.forEach(function (g) {
        eventsOf(g).forEach(function (n) { if (names.indexOf(n) === -1) { names.push(n); } });
      });
    });
    return names;
  }
  // the plan's notes for its activities ({event, note, coach_note}), in the plan's order;
  // `coaches`: those with a coaches' note count too
  function eventNotes(plan, coaches, only) {
    var by = {};
    (plan.event_notes || []).forEach(function (n) { by[n.event] = n; });
    return planEvents(plan.slots).filter(function (name) {
      var n = by[name];
      return n && (n.note || (coaches && n.coach_note)) && (!only || only.indexOf(name) !== -1);
    }).map(function (name) { return by[name]; });
  }
  // Punctuation between pieces the layout already sets apart ("Grade 7 Boys: Sprints,
  // Starts — Coach: Sam"): unseen on the page, but there for reader modes (which drop
  // the styles) and screen readers, so the words don't run together.
  function sep(text) { return el('span', 'visually-hidden', text); }

  // all of a group's activities, each with its icon
  function activities(cls, g) {
    var box = el('span', cls + 's');
    eventsOf(g).forEach(function (name, i) {
      if (i) { box.appendChild(sep(', ')); }
      box.appendChild(activity(cls, name));
    });
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
      state.events = orderEvents(data.events || []);
      state.grades = data.grades || state.grades;
      state.upcoming = data.upcoming || [];
      state.past = data.past || [];
      state.scheduled = data.scheduled || [];
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
    var help = document.getElementById('planner-help');      // how to use the planner (staff)
    if (help) { help.hidden = !state.canEdit || sharedView; }
    if (editing) { listBox.hidden = true; return; }
    listBox.hidden = false;
    // plans due to be released at a set time: when (staff see the drafts themselves)
    var due = state.canEdit ? [] : state.scheduled.map(function (s) {
      return 'The plan for ' + longDate(s.date) + ' will be released on ' + whenText(s.release_at) + '.';
    });
    if (!state.upcoming.length && !state.past.length) {
      listBox.appendChild(el('p', 'note plan-due', state.canEdit
        ? 'No training plans yet. Start one with “New training plan”.'
        : due.length ? due.join(' ') : 'The next session’s plan will appear here once the coaches have released it.'));
      return;
    }
    if (state.upcoming.length) {
      // in date order with the plans: a session whose plan is due later, as a small card saying when
      var coming = state.upcoming.map(function (p) { return { date: p.date, plan: p }; });
      if (!state.canEdit) {
        state.scheduled.forEach(function (s) { coming.push({ date: s.date, due: s }); });
        coming.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      }
      coming.forEach(function (c) {
        if (c.plan) { listBox.appendChild(planCard(c.plan, true)); return; }
        var box = el('article', 'plan plan--due');
        box.appendChild(el('h3', 'plan__title', 'Training plan, ' + longDate(c.date)));
        box.appendChild(el('p', 'plan-due', 'This plan will be released on ' + whenText(c.due.release_at) + '.'));
        listBox.appendChild(box);
      });
    } else {
      listBox.appendChild(el('p', 'note plan-due', (due.length ? due.join(' ') : 'The next session’s plan hasn’t been released yet.') +
        (state.past.length ? ' The latest is below.' : '')));
    }
    if (state.past.length) {
      var older = el('details', 'training-past');
      older.appendChild(el('summary', null, 'Earlier sessions (' + state.past.length + ')'));
      state.past.forEach(function (p) { older.appendChild(planCard(p, false)); });
      // closed while a plan for today or later is released; open otherwise (only a draft
      // or a cancelled session coming up), so the latest plan shows
      older.open = !state.upcoming.some(function (p) { return p.status === 'released'; });
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
      // in the past tense once the day has gone (shared links included)
      why.appendChild(el('strong', null, plan.date < iso(new Date()) ? 'The session was cancelled. ' : 'This session is cancelled. '));
      why.appendChild(document.createTextNode(plan.cancelled_why || ''));
      card.appendChild(why);
    }
    if (plan.status === 'draft' && plan.release_at) {
      card.appendChild(el('p', 'plan__scheduled', 'A draft until ' + whenText(plan.release_at) +
        ', when it will be released. Families see only when.'));
    }
    // the plan: its notes and table. A cancelled session shows only why; its plan sits
    // behind "Show the plan" if it had been released (for staff, whatever it was).
    var body = el('div', 'plan__content');
    if (plan.notes) { body.appendChild(el('p', 'plan__notes', plan.notes)); }
    if (plan.coach_notes) { body.appendChild(coachNote(plan.coach_notes, 'p')); }
    if (plan.slots && plan.slots.length) { body.appendChild(planTable(plan)); }
    else if (plan.status !== 'cancelled') { body.appendChild(el('p', 'note', 'No time slots yet.')); }
    if (plan.status !== 'cancelled') {
      card.appendChild(body);
    } else if (plan.slots && plan.slots.length && (state.canEdit || wasReleased(plan))) {
      body.hidden = true;
      body.id = 'plan-content-' + plan.date;
      var label = wasReleased(plan) ? 'Show the plan' : 'Show the plan (never released: families can’t see it)';
      var toggle = button(label, 'btn btn--ghost btn--sm plan__show', function () {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? label : 'Hide the plan';
        toggle.setAttribute('aria-expanded', String(!body.hidden));
      });
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', body.id);
      card.appendChild(toggle);
      card.appendChild(body);
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

  // whether a cancelled session's plan had been released when it was cancelled (the API
  // says so to the public; staff get what it was)
  function wasReleased(plan) { return plan.was_released === true || plan.cancelled_from === 'released'; }

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
        hintOn(li, wrap, plan, function () { return inSession(g); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lightUp(wrap, plan, si, gi); }
        });
        li.appendChild(el('span', 'plan__who', groupLabel(g)));
        if (eventsOf(g).length) { li.appendChild(sep(': ')); li.appendChild(activities('plan__what', g)); }
        if (g.note) { li.appendChild(sep(' — ')); li.appendChild(el('span', 'plan__note', g.note)); }
        if (g.coach_note) { li.appendChild(sep(' — ')); li.appendChild(coachNote(g.coach_note, 'span')); }
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
    // the notes for the plan's activities (the coaches' ones only come to staff)
    var notes = eventNotes(plan, true);
    if (notes.length) {
      var head = el('h4', 'plan__event-notes-head', 'Activity notes');
      head.id = 'plan-acts-' + plan.date;
      box.appendChild(head);
      var list = el('ul', 'plan__event-notes');
      list.setAttribute('aria-labelledby', head.id);
      notes.forEach(function (n) {
        var li = el('li', 'plan__event-note');
        li.appendChild(activity('plan__event-note-name', n.event));
        li.appendChild(sep(': '));
        if (n.note) { li.appendChild(el('span', 'plan__event-note-text', n.note)); }
        if (n.coach_note) { if (n.note) { li.appendChild(sep(' — ')); } li.appendChild(coachNote(n.coach_note, 'span')); }
        list.appendChild(li);
      });
      box.appendChild(list);
    }
    return box;
  }

  // The plan's activities, in the order they first come, each with its icon: tapping
  // one lights up the groups doing it.
  function activityStrip(wrap, plan) {
    var names = planEvents(plan.slots);
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
      hintOn(b, wrap, plan, function () { return function (g) { return eventsOf(g).indexOf(n) !== -1; }; });
      strip.appendChild(b);
    });
    return strip;
  }

  // The groups doing any of the tapped activities, lit up: each tap adds an activity or,
  // tapped again, takes it off; with none left the plan's back to normal.
  function lightEvent(wrap, plan, name) {
    unhint(wrap);
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
  // whether group `g` is part of the session of the group `chosen` (see lightUp)
  function inSession(chosen) {
    var cells = (!chosen.everyone && !chosen.parents) ? cellsOf(chosen) : null;
    return function (g) {
      if (g === chosen) { return true; }
      if (chosen.everyone) { return !g.parents; }
      if (chosen.parents) { return !!g.parents; }
      if (g.parents) { return false; }
      if (g.everyone) { return true; }
      return cellsOf(g).some(function (c) { return cells.indexOf(c) !== -1; });
    };
  }

  /* A milder preview of what pressing would light up: hovering over a group (or an
     activity in the strip), or moving to it with the keyboard. Not while something
     is already lit up; a press clears it. */
  function hint(wrap, plan, test) {
    if (wrap.classList.contains('is-focused')) { return; }
    wrap.classList.add('is-hinting');
    Array.prototype.forEach.call(wrap.querySelectorAll('.plan__group'), function (li) {
      li.classList.toggle('is-hint', test(plan.slots[+li.getAttribute('data-slot')].groups[+li.getAttribute('data-group')]));
    });
  }
  function unhint(wrap) {
    wrap.classList.remove('is-hinting');
    Array.prototype.forEach.call(wrap.querySelectorAll('.plan__group.is-hint'), function (li) { li.classList.remove('is-hint'); });
  }
  // hint on hover with a mouse (not a tap) and on keyboard focus
  function hintOn(node, wrap, plan, test) {
    node.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { hint(wrap, plan, test()); } });
    node.addEventListener('pointerleave', function () { unhint(wrap); });
    node.addEventListener('focus', function () { if (node.matches(':focus-visible')) { hint(wrap, plan, test()); } });
    node.addEventListener('blur', function () { unhint(wrap); });
  }

  function lightUp(wrap, plan, si, gi) {
    unhint(wrap);
    var key = si + '-' + gi;
    var off = wrap.getAttribute('data-lit') === key;
    var chosen = plan.slots[si].groups[gi];
    var includes = inSession(chosen);
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

  /* The activities in families, in the order of a club night: the planner's chips
     show a labelled row for each, and the activity boxes' suggestions follow the
     same order. An activity in none of them (Games, or one typed in) goes under Other. */
  var ACTIVITY_GROUPS = [
    ['Start', ['Set up', 'Warm up']],
    ['Sprints & hurdles', ['Starts', 'Sprints', 'Hurdles', 'Relays']],
    ['Distance & walking', ['Middle distance', 'Long run', 'Race walk']],
    ['Jumps', ['Long jump', 'Triple jump', 'High jump']],
    ['Throws', ['Shot put', 'Discus', 'Javelin', 'Vortex']],
    ['Finish', ['Cool down', 'Pack down']]
  ];
  function groupOf(name) {
    return ACTIVITY_GROUPS.filter(function (g) { return g[1].indexOf(name) !== -1; })[0] || null;
  }
  // the families' order first, then any others as they came
  function orderEvents(names) {
    var known = [];
    ACTIVITY_GROUPS.forEach(function (g) {
      g[1].forEach(function (n) { if (names.indexOf(n) !== -1) { known.push(n); } });
    });
    return known.concat(names.filter(function (n) { return !groupOf(n); }));
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

  // ------------------------------------------------------------ sharing

  var sharedView = false;      // showing one plan from a share link
  function shareUrl(date) { return location.origin + '/junior-athletics/#/plan/' + date; }

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
    var all = el('a', null, 'See all the training plans');
    all.href = '/junior-athletics/';
    function finish(nodes) {
      listBox.textContent = '';
      nodes.forEach(function (n) { listBox.appendChild(n); });
      var back = el('p', 'training-shared__all');
      back.appendChild(all);
      listBox.appendChild(back);
      // staff: the plan in the planner (with the coaches' notes, to change); anyone else:
      // a sign-in that comes back to it there
      var inPlanner = '/junior-athletics/#plan-' + date;
      NCAN.me().then(function (who) {
        if (who && /^(admin|coach|committee)$/.test(who.role)) {
          var open = el('a', 'btn btn--ghost btn--sm', 'Open in the planner (with coaches’ notes)');
          open.href = inPlanner;
          signInBox.textContent = '';
          signInBox.appendChild(open);
          signInBox.hidden = false;
        } else if (!who) {
          offerSignIn(location.origin + inPlanner);
        }
      }).catch(function () { /* the plan still shows */ });
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
      if (body.state === 'draft' && body.release_at) {
        return finish([message('The training plan for ' + longDate(date) + ' will be released on ' +
          whenText(body.release_at) + '. Please check back then.')]);
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
    (p.event_notes || []).forEach(function (n) { delete n.coach_note; });
    // cancelled before it was released: only why, as the public sees it
    if (p.status === 'cancelled') {
      p.was_released = wasReleased(p);
      if (!p.was_released) { p.slots = []; p.notes = ''; p.event_notes = []; }
    }
    delete p.cancelled_from;
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
  // (described in the planner's help, #planner-help in junior-athletics/index.html: keep it in step)
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
    var shown = [];                                           // the slots printed (a part: only theirs)
    plan.slots.forEach(function (whole, si) {
      var slot = whole;
      if (only) {
        slot = Object.assign({}, whole, { groups: whole.groups.filter(function (g, gi) { return only.has(si, gi); }) });
        if (!slot.groups.length) { return; }
      }
      shown.push(slot);
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
    // the notes for the activities printed
    var notes = eventNotes(plan, coaches, planEvents(shown));
    if (notes.length) {
      var acts = el('div', 'plan-print__acts');
      acts.appendChild(el('p', 'plan-print__acts-head', 'Activity notes'));
      notes.forEach(function (n) {
        var row = el('div', 'plan-print__act');
        row.appendChild(activity('plan-print__act-name', n.event));
        if (n.note) { row.appendChild(printNote(n.note, false)); }
        if (coaches && n.coach_note) { row.appendChild(printNote(n.coach_note, true)); }
        acts.appendChild(row);
      });
      box.appendChild(acts);
    }
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
                 event_notes: latest.event_notes, status: 'draft' }, true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && picked) { unpick(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (editing && dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // "Coaches and committee: sign in to plan sessions", which opens the sign-in form; the
  // emailed link comes back to `next` (by default, this page as it is)
  function offerSignIn(next) {
    signInBox.textContent = '';
    var open = button('Coaches and committee: sign in to plan sessions', 'btn btn--ghost btn--sm', function () {
      open.remove();
      NCAN.signIn(signInBox, 'Coaches, the committee and club administrators make the training plans. Enter the ' +
        'email address the club has for you, and we’ll email you a link to sign in. There is no password.', next);
      var h = signInBox.querySelector('h3');
      if (h) { h.textContent = 'Sign in to plan training'; }
    });
    signInBox.appendChild(open);
    signInBox.hidden = false;
  }

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
    if (!who) { offerSignIn(); }
  }).catch(function () { /* the plans still show */ }).then(function () {
    list.textContent = '';
    return load().then(function () {
      state.events.forEach(function (e) { var o = el('option'); o.value = e; list.appendChild(o); });
      // "#plan-2026-12-01" (e.g. back from signing in on a shared plan): that plan
      var at = /^#plan-\d{4}-\d{2}-\d{2}$/.test(location.hash) && document.getElementById(location.hash.slice(1));
      if (at) { at.scrollIntoView({ block: 'start' }); }
    });
  });
}());
