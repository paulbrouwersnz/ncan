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
  the link says so: removed (and when), moved (it follows), or being changed. A
  link with no plan at all goes to the list of plans, which says nothing matched
  (training-links.js). Club administrators, coaches and the committee, once signed in, also
  see drafts and can make, change, release, cancel and delete plans.

  Making a plan (training-editor.js): drag a grade (7-14), Girls / Boys / Girls & Boys / All athletes, or
  an event from the palette onto a group in the table, or onto a time slot to
  start a new group there. On a phone, or with a keyboard: tap (or press) a
  chip, then tap the group it goes on. A group block moves (or, holding Ctrl or
  Alt, copies) by dragging its handle onto another block (it goes before it) or
  onto a time slot's "New group" (it goes at the end); or with its Move and Copy
  buttons, then a tap on where it goes. Groups carry an activity and a note; each
  time slot and the plan as a whole can have a note too. Each note has a
  coaches-only twin: the API gives those only to admins, coaches and the
  committee, so they never reach the public page.

  The page loads it in three files, in this order (each a <script src> in
  junior-athletics/index.html, after training-icons.js):
    training.js         this one: what they share (window.NCANTraining), loading
                        the plans, the list and the public view, share links
    training-print.js   printing: Print plan, with coaches' notes, strips, selected
    training-editor.js  the coaches' buttons on a plan, and the planner
  This one starts the page once the document has loaded, so the other two are
  in place by then.

  The planner's help, "How to use the planner" (#planner-help in
  junior-athletics/index.html), is written by hand and describes the buttons,
  chips and behaviour of these files by name: when a label or what it does
  changes, update the help to match. (The "New training plan" and "Start from the
  latest plan" buttons are in that page too.)
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

  var state = { canEdit: false, events: [], grades: [7, 8, 9, 10, 11, 12, 13, 14], upcoming: [], past: [], scheduled: [],
                open: {} };          // later upcoming plans opened with "Show the plan", by date
  var T = window.NCANTraining = {};      // shared with training-print.js and training-editor.js

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
    tools.hidden = !state.canEdit || T.isEditing();
    var help = document.getElementById('planner-help');      // how to use the planner (staff)
    if (help) { help.hidden = !state.canEdit || sharedView; }
    if (T.isEditing()) { listBox.hidden = true; return; }
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
      // only the soonest plan in full: the later ones behind "Show the plan" until tapped
      var soonest = true;
      coming.forEach(function (c) {
        if (c.plan) { listBox.appendChild(planCard(c.plan, true, !soonest)); soonest = false; return; }
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

  // `later`: an upcoming plan after the soonest, its plan shown only when tapped open
  // (or opened before: state.open)
  function planCard(plan, upcoming, later) {
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
    if (plan.status !== 'cancelled' && later) {
      card.appendChild(showToggle(plan, body, 'Show the plan', true));
      card.appendChild(body);
    } else if (plan.status !== 'cancelled') {
      card.appendChild(body);
    } else if (plan.slots && plan.slots.length && (state.canEdit || wasReleased(plan))) {
      card.appendChild(showToggle(plan, body, wasReleased(plan) ? 'Show the plan'
        : 'Show the plan (never released: families can’t see it)', false));
      card.appendChild(body);
    }
    var printable = plan.status !== 'cancelled' && plan.slots && plan.slots.length;
    var shareable = !sharedView && (plan.status === 'released' || plan.status === 'cancelled');
    if (printable || shareable) {
      var row = printable ? T.printButtons(plan) : el('div', 'plan__print');
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
      card.appendChild(T.staffActions(plan));
    }
    return card;
  }

  // The button that shows or hides a plan's content (`body`): "Show the plan" (`label`),
  // then "Hide the plan". `remember`: kept open when the list is drawn again (after
  // Release, say) while the page is open (state.open), and open now if it was.
  function showToggle(plan, body, label, remember) {
    var open = remember && !!state.open[plan.date];
    body.hidden = !open;
    body.id = 'plan-content-' + plan.date;
    var toggle = button(open ? 'Hide the plan' : label, 'btn btn--ghost btn--sm plan__show', function () {
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? label : 'Hide the plan';
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      if (remember) { if (body.hidden) { delete state.open[plan.date]; } else { state.open[plan.date] = true; } }
    });
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', body.id);
    return toggle;
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

  // ------------------------------------------------------------ shared with the planner and printing

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

  // Each athlete is a grade and a sex ("girls 7"): the athletes in group `g` (the
  // strips, in training-print.js, explain how they're used)
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
    var today = iso(new Date());
    var links = window.NCANTrainingLinks;
    return NCAN.get('/training/' + date).then(function (plan) {
      var nodes = [];
      if (movedFrom) { nodes.push(el('p', 'training-shared__moved', 'This plan has moved here from ' + longDate(movedFrom) + '.')); }
      nodes.push(planCard(publicCopy(plan), true));
      finish(nodes);
    }, function (err) {
      var body = err.body || {};
      var follow = links ? links.followMove(date, body.moved_to, today) : !!body.moved_to;
      if (follow && (hops || 0) < 5) {
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
      // nothing on that date (or not a date at all): the list of all the plans, which says so
      if (err.status === 404 || err.status === 400) { return noPlan(date); }
      finish([message('The training plan can’t be loaded just now. Please try again later.')]);
    });
  }

  // A link with no plan behind it: go to the list of all the plans (a fresh page load, so
  // the list starts as normal), which says nothing matched. Replaces the link in the
  // history, so Back doesn't bounce through it again.
  function noPlan(date) {
    var links = window.NCANTrainingLinks;
    location.replace(links ? links.notFoundUrl(date) : '/junior-athletics/');
  }

  // Sent to the list from a link with no plan: say so above the list, and tidy the
  // address back to the plain page.
  function noPlanNotice() {
    var links = window.NCANTrainingLinks;
    var asked = links && links.noPlanAsked(location.search);
    if (!asked) { return; }
    if (window.history && history.replaceState) { history.replaceState(null, '', location.pathname + location.hash); }
    var note = el('p', 'training-shared__gone training-notice', links.noPlanText(asked, iso(new Date()), longDate));
    note.setAttribute('role', 'status');
    listBox.parentNode.insertBefore(note, listBox);
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

  // ------------------------------------------------------------ start

  // what training-print.js and training-editor.js use (NCANTraining.stripLabel and
  // .strips are also for checking the strips without printing: see the tests in the
  // page's console)
  T.ACTIVITY_GROUPS = ACTIVITY_GROUPS;
  T.MAX_EVENTS = MAX_EVENTS;
  T.SEXES = SEXES;
  T.STATUS = STATUS;
  T.activities = activities;
  T.activity = activity;
  T.addMinutes = addMinutes;
  T.apiError = apiError;
  T.button = button;
  T.cellsOf = cellsOf;
  T.clock = clock;
  T.editorBox = editorBox;
  T.el = el;
  T.eventNotes = eventNotes;
  T.eventsOf = eventsOf;
  T.groupLabel = groupLabel;
  T.groupOf = groupOf;
  T.iso = iso;
  T.load = load;
  T.longDate = longDate;
  T.minutes = minutes;
  T.parseDate = parseDate;
  T.planEvents = planEvents;
  T.shareUrl = shareUrl;
  T.showList = showList;
  T.state = state;
  T.stripLabel = stripLabel;
  T.timeRange = timeRange;
  T.whenText = whenText;

  function start() {
    // the event names, offered while typing an activity
    var list = el('datalist');
    list.id = 'plan-events';
    root.appendChild(list);

    var shared = /^#\/plan\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
    window.addEventListener('hashchange', function () {
      var now = /^#\/plan\//.test(location.hash);
      if (now || sharedView) { location.reload(); }
    });
    if (shared) {
      showShared(shared[1]);
      return;
    }
    if (/^#\/plan\//.test(location.hash)) { noPlan(''); return; }   // "#/plan/…" that isn't a date
    noPlanNotice();

    NCAN.me().then(function (who) {
      var staff = who && /^(admin|coach|committee)$/.test(who.role);
      NCAN.account(accountBox, staff ? who : null);
      if (!who) { offerSignIn(); }
    }).catch(function () { /* the plans still show */ }).then(function () {
      list.textContent = '';
      // "#plan-2026-12-01" (e.g. back from signing in on a shared plan): that plan, shown in full
      if (/^#plan-\d{4}-\d{2}-\d{2}$/.test(location.hash)) { state.open[location.hash.slice(6)] = true; }
      return load().then(function () {
        state.events.forEach(function (e) { var o = el('option'); o.value = e; list.appendChild(o); });
        // "#plan-2026-12-01" (e.g. back from signing in on a shared plan): that plan
        var at = /^#plan-\d{4}-\d{2}-\d{2}$/.test(location.hash) && document.getElementById(location.hash.slice(1));
        if (at) { at.scrollIntoView({ block: 'start' }); }
      });
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
}());
