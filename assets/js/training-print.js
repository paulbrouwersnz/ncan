/*
  training-print.js - printing the training plans on the Junior Athletics page
  (/junior-athletics/): Print plan, Print with coaches' notes, Print strips for
  each group, and Print selected. Loaded after training.js, which it shares with
  through window.NCANTraining; training.js has the whole story.

  The planner's help (#planner-help in junior-athletics/index.html) names these
  buttons: keep it in step.
*/
(function () {
  'use strict';

  var T = window.NCANTraining;
  if (!T) { return; }

  var activities = T.activities, activity = T.activity, button = T.button, cellsOf = T.cellsOf, clock = T.clock,
      el = T.el, eventNotes = T.eventNotes, groupLabel = T.groupLabel, longDate = T.longDate,
      planEvents = T.planEvents, shareUrl = T.shareUrl, state = T.state, stripLabel = T.stripLabel;

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
     ("girls 7", cellsOf in training.js); their path through the session is which group they're in at each
     time slot (All athletes counts for every athlete). Athletes with the same path get one strip,
     so there are as few strips as the plan allows: e.g. grade 10-12 and 13-14 are
     split when they do different things at 5:15, even if they're together for
     relays later. Grades no group names don't get a strip. The parents and
     guardians get one of their own (All athletes means the athletes), last, with only
     the time slots they have something in. */
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

  // what training.js uses, and for checking the strips without printing (see the tests
  // in the page's console)
  T.printButtons = printButtons;
  T.strips = strips;
}());
