/*
  admin-calendars.js - the calendar editor at /admin/calendars/, for coaches, the
  committee and administrators (calendar plan, step 3).

  Everything comes from the club's API (assets/js/ncan-account.js; the ncan-api
  project's docs/API.md, "Calendars"):
    GET  /v1/admin/calendars                      every calendar, the versions kept for undo,
                                                  and what this person may change (`may`)
    GET  /v1/admin/calendars/<slug>               every event of one calendar, past ones too
    POST /v1/admin/calendars/<slug>/events        add an event, or change one (with its id)
    POST /v1/admin/calendars/<slug>/events/<id>/delete   take it out of this calendar, or
                                                  {everywhere: true} delete it from all of them
    POST /v1/admin/calendars/undo                 back to an earlier version
    administrators only:
    POST /v1/admin/calendars                      make a calendar
    POST /v1/admin/calendars/<slug>[/delete]      change or delete one
    POST /v1/admin/calendars/settings             how many years of past events feeds keep
  Each change sends `since`, the version this page loaded: the API refuses (409)
  only if that event changed since, so two people editing different events don't
  clash. After every change the page loads the latest again.

  The address says which calendar is open, and which event: #/events-senior, or
  #/events-senior/<event id>, so a link can open one event's editor.

  The pure parts (form <-> event, the checks, the words for dates and repeats)
  are in assets/js/calendar-edit.js, with tests in tests/js/calendar-edit.test.js.
*/
(function () {
  'use strict';

  var $ = function (x) { return document.getElementById(x); };
  var C = window.CalendarEdit;

  var may = {};              // {events, calendars}: what this person may change
  var cals = [];             // every calendar, in order (from GET /v1/admin/calendars)
  var versions = [];         // the versions kept for undo, newest first
  var settings = {};
  var version = 0;           // the version this page last loaded
  var slug = null;           // the calendar open
  var cal = null;
  var events = [];
  var form = null;           // the event being edited (calendar-edit.js's form values)
  var orig = null;           // as it was when opened
  var tried = false;         // Save pressed: show the checks as they change
  var copiedFrom = null;     // a new event made with Duplicate: the event it was copied from
  var busy = false;

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function say(id, words, working) {
    var p = $(id);
    p.textContent = words || '';
    p.classList.toggle('is-busy', !!working);
  }
  function why(r) {
    return (r && r.body && r.body.error) || 'Sorry, that didn’t work. Please try again.';
  }
  function today() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function calOf(s) {
    for (var i = 0; i < cals.length; i++) { if (cals[i].slug === s) { return cals[i]; } }
    return null;
  }
  function stamp(t) {               // "2026-11-22 09:38" -> "22 Nov 2026 at 9:38 am"
    if (!t || !C.realDate(t.slice(0, 10))) { return t || ''; }
    var d = C.dayText(t.slice(0, 10)).replace(/^\w+ /, '');
    return t.length >= 16 ? d + ' at ' + C.timeText(t.slice(11, 16)) : d;
  }

  /* The address ---------------------------------------------------------------- */
  function fromHash() {
    var m = location.hash.match(/^#\/([a-z0-9][a-z0-9-]*)(?:\/([A-Za-z0-9@._%-]+))?$/);
    return m ? { slug: m[1], id: m[2] ? decodeURIComponent(m[2]) : null } : {};
  }
  function setHash(id) {
    if (!slug) { return; }
    var h = '#/' + slug + (id ? '/' + id : '');
    if (location.hash !== h) { replaceHash(h); }
  }
  function replaceHash(h) {
    try { window.history.replaceState(null, '', h); } catch (e) { location.hash = h; }
  }

  /* Loading ---------------------------------------------------------------------- */
  function loadList() {
    return NCAN.get('/admin/calendars').then(function (r) {
      cals = r.calendars || [];
      versions = r.history || [];
      settings = r.settings || {};
      may = r.may || {};
      version = r.version || 0;
      renderCals();
      renderHistory();
      $('cal-admin').hidden = !may.calendars;
      $('cs-years').value = settings.past_years || 3;
    });
  }
  function loadCal(s) {
    return NCAN.get('/admin/calendars/' + s).then(function (r) {
      slug = s;
      cal = r.calendar;
      events = r.events || [];
      version = Math.max(version, r.version || 0);
      renderCals();
      renderCal();
    });
  }
  function reload() {
    return loadList().then(function () {
      if (!calOf(slug)) { slug = cals.length ? cals[0].slug : null; }
      return slug ? loadCal(slug) : null;
    });
  }

  /* The calendars ------------------------------------------------------------------ */
  function renderCals() {
    var ul = $('cal-list');
    ul.textContent = '';
    cals.forEach(function (c) {
      var li = el('li');
      var b = el('button', 'cal-list__item');
      b.type = 'button';
      if (c.slug === slug) { b.setAttribute('aria-current', 'true'); }
      var dot = el('span', 'cal-dot');
      dot.style.background = c.colour || '#888';
      dot.setAttribute('aria-hidden', 'true');
      b.appendChild(dot);
      var words = el('span', 'cal-list__name', c.name);
      b.appendChild(words);
      var meta = el('span', 'cal-list__meta', c.events + (c.events === 1 ? ' event' : ' events') +
        (c.public ? '' : ' · staff only'));
      b.appendChild(meta);
      b.addEventListener('click', function () { choose(c.slug); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function choose(s) {
    if (s === slug) { return; }
    say('cal-list-status', 'Loading…', true);
    loadCal(s).then(function () { say('cal-list-status', ''); setHash(); },
      function (err) { say('cal-list-status', err.message || 'That calendar could not be loaded.'); });
  }

  /* One calendar's events ------------------------------------------------------------ */
  function renderCal() {
    if (!cal) { return; }
    $('cal-name').textContent = cal.name;
    var about = [cal.kind === 'training' ? 'Training' : 'Events',
                 cal.public ? 'public' : 'staff only'].join(', ');
    $('cal-about').textContent = about + (cal.description ? '. ' + cal.description : '.');
    renderEvents();
    fillCalendarForm();
  }

  function renderEvents() {
    var which = $('cal-which').value, q = $('cal-search').value;
    var shown = C.pick(events, which, today(), q);
    var ul = $('cal-events');
    ul.textContent = '';
    var colour = (calOf(slug) || {}).colour || '#888';
    shown.forEach(function (e) {
      var li = el('li');
      var b = el('button', 'cal-ev');
      b.type = 'button';
      b.style.setProperty('--cal-colour', colour);
      b.appendChild(el('span', 'cal-ev__when', C.whenText(e)));
      var title = el('span', 'cal-ev__title', e.title);
      if (e.status === 'CANCELLED') { title.appendChild(el('span', 'cal-tag cal-tag--off', 'Cancelled')); }
      if (e.status === 'TENTATIVE') { title.appendChild(el('span', 'cal-tag', 'To be confirmed')); }
      b.appendChild(title);
      var meta = [];
      if (e.repeat) { meta.push(C.repeatText(e.repeat, e.start)); }
      if (e.skip && e.skip.length) { meta.push(e.skip.length + (e.skip.length === 1 ? ' date cancelled' : ' dates cancelled')); }
      if (e.location) { meta.push(e.location); }
      var others = (e.calendars || []).filter(function (s) { return s !== slug; })
        .map(function (s) { return (calOf(s) || { name: s }).name; });
      if (others.length) { meta.push('Also in ' + others.join(', ')); }
      if (meta.length) { b.appendChild(el('span', 'cal-ev__meta', meta.join(' · '))); }
      b.addEventListener('click', function () { openEvent(e); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    if (!shown.length) {
      var none = { upcoming: 'No upcoming events', past: 'No past events', all: 'No events yet' }[which];
      ul.appendChild(el('li', 'cal-events__none', q.trim() ? 'Nothing matches “' + q.trim() + '”.' : none + '.'));
    }
  }

  /* One event ---------------------------------------------------------------------- */
  var dialog = $('cal-dialog');

  function openEvent(e) {
    form = e ? C.fromEvent(e) : C.blank(slug, today());
    orig = JSON.parse(JSON.stringify(form));
    tried = false;
    copiedFrom = null;
    $('ce-heading').textContent = e ? 'Change an event' : 'Add an event';
    var meta = '';
    if (e && e.updated) { meta = 'Last changed ' + stamp(e.updated) + (e.updated_by ? ' by ' + e.updated_by : '') + '.'; }
    $('ce-meta').textContent = meta;
    $('ce-meta').hidden = !meta;
    fill();
    renderProblems([]);
    say('ce-status-line', '');
    if (!dialog.open) {
      if (dialog.showModal) { dialog.showModal(); } else { dialog.setAttribute('open', ''); }
    }
    setHash(e && e.id);
    $('ce-title').focus();
  }

  function box(type, name, value, words, checked, id) {
    var p = el('p', 'ath-check');
    var i = el('input');
    i.type = type; i.name = name; i.value = value; i.id = id; i.checked = !!checked;
    var l = el('label', null, words);
    l.htmlFor = id;
    p.appendChild(i); p.appendChild(l);
    return p;
  }

  function fill() {
    $('ce-title').value = form.title;
    $('ce-allday').checked = form.all_day;
    $('ce-start-date').value = form.startDate;
    $('ce-start-time').value = form.startTime;
    $('ce-end-date').value = form.endDate;
    $('ce-end-time').value = form.endTime;
    $('ce-location').value = form.location;
    $('ce-description').value = form.description;
    $('ce-link').value = form.link;
    $('ce-freq').value = form.freq;
    $('ce-status').value = form.status;
    $('ce-until').value = form.until;
    $('ce-count').value = form.count;
    $('ce-ends-' + (form.ends || 'until')).checked = true;

    var cs = $('ce-calendars');
    cs.textContent = '';
    cals.forEach(function (c, i) {
      var p = box('checkbox', 'ce-cal', c.slug, c.name + (c.public ? '' : ' (staff only)'),
                  form.calendars.indexOf(c.slug) !== -1, 'ce-cal-' + i);
      var dot = el('span', 'cal-dot');
      dot.style.background = c.colour || '#888';
      dot.setAttribute('aria-hidden', 'true');
      p.insertBefore(dot, p.lastChild);
      cs.appendChild(p);
    });
    var ds = $('ce-days');
    ds.textContent = '';
    C.DAYS.forEach(function (d) {
      ds.appendChild(box('checkbox', 'ce-day', d, C.DAY_NAMES[d].slice(0, 3), form.days.indexOf(d) !== -1, 'ce-day-' + d));
    });
    var existing = !!form.id;
    $('ce-remove').hidden = !existing || form.calendars.length < 2 || orig.calendars.indexOf(slug) === -1;
    $('ce-delete').hidden = !existing;
    $('ce-delete').textContent = existing && orig.calendars.length > 1 ? 'Delete everywhere' : 'Delete';
    $('ce-duplicate').hidden = !existing;
    remember();
    update();
  }

  function checked(name) {
    return Array.prototype.filter.call(document.getElementsByName(name), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  }

  function read() {
    form.title = $('ce-title').value;
    form.all_day = $('ce-allday').checked;
    form.startDate = $('ce-start-date').value;
    form.startTime = $('ce-start-time').value;
    form.endDate = $('ce-end-date').value;
    form.endTime = $('ce-end-time').value;
    form.location = $('ce-location').value;
    form.description = $('ce-description').value;
    form.link = $('ce-link').value;
    form.calendars = checked('ce-cal');
    form.freq = $('ce-freq').value;
    form.days = checked('ce-day');
    form.ends = (checked('ce-ends')[0]) || 'until';
    form.until = $('ce-until').value;
    form.count = $('ce-count').value;
    form.status = $('ce-status').value;
  }

  function update() {
    var all = form.all_day, rep = !!form.freq;
    ['ce-start-time', 'ce-end-time'].forEach(function (x) { $(x).closest('p').hidden = all; });
    $('ce-start-label').textContent = all ? 'First day' : 'Starts';
    $('ce-end-label').textContent = all ? 'Last day' : 'Ends';
    $('ce-days').hidden = !rep || form.freq === 'monthly';
    $('ce-ends').hidden = !rep;
    $('ce-skips').hidden = !rep;
    $('ce-until').disabled = form.ends !== 'until' || busy;
    $('ce-count').disabled = form.ends !== 'count' || busy;
    renderSkips();

    var n = form.description.length;
    $('ce-description-count').textContent = n > 1500 ? n + ' of ' + C.LIMITS.description + ' characters' : '';

    var e = C.toEvent(form), words = '';
    if (C.check(form).length === 0) {
      words = C.whenText(e) + (e.repeat ? ' · ' + C.repeatText(e.repeat, e.start) : '');
      if (e.status === 'CANCELLED') { words += ' · cancelled'; }
    }
    $('ce-preview').textContent = words;
    $('ce-save').disabled = busy || (!!form.id && C.same(form, orig));
    if (tried) { renderProblems(C.check(form)); }
  }

  function renderSkips() {
    var ul = $('ce-skip-list');
    ul.textContent = '';
    form.skip.slice().sort().forEach(function (d) {
      var li = el('li', null, C.dayText(d.slice(0, 10)) + ' ');
      var b = el('button', 'btn btn--ghost btn--sm', 'Bring it back');
      b.type = 'button';
      b.disabled = busy;
      b.addEventListener('click', function () {
        form.skip = form.skip.filter(function (x) { return x !== d; });
        update();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    if (!form.skip.length) { ul.appendChild(el('li', 'cal-skips__none', 'None.')); }
  }

  function renderProblems(list, more) {
    var ul = $('ce-problems');
    ul.textContent = '';
    list.forEach(function (p) { ul.appendChild(el('li', null, p)); });
    if (more) { var li = el('li'); li.appendChild(more); ul.appendChild(li); }
    if ((list.length || more) && ul.scrollIntoView) { ul.scrollIntoView({ block: 'nearest' }); }
  }

  // moving the start keeps the event's length, so the end never ends up before it
  var was = null;
  function startMoved() {
    var before = was;
    read();
    if (before && C.realDate(before.date) && C.realDate(form.startDate)) {
      if (form.all_day) {
        if (C.realDate(form.endDate)) {
          var len = dayDiff(before.date, form.endDate);
          form.endDate = C.addDays(form.startDate, Math.max(0, len));
        }
      } else if (/^\d\d:\d\d$/.test(before.time) && /^\d\d:\d\d$/.test(form.startTime) &&
                 C.realDate(form.endDate) && /^\d\d:\d\d$/.test(form.endTime)) {
        var mins = minutes(form.endDate, form.endTime) - minutes(before.date, before.time);
        var end = minutes(form.startDate, form.startTime) + Math.max(mins, 0);
        form.endDate = C.addDays(form.startDate, Math.floor(end / 1440) - Math.floor(minutes(form.startDate, '00:00') / 1440));
        var m = end % 1440;
        form.endTime = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
      }
      $('ce-end-date').value = form.endDate;
      $('ce-end-time').value = form.endTime;
    }
    remember();
    update();
  }
  function remember() { was = { date: $('ce-start-date').value, time: $('ce-start-time').value }; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00Z') - Date.parse(a + 'T00:00Z')) / 86400000); }
  function minutes(d, t) { return Date.parse(d + 'T00:00Z') / 60000 + (+t.slice(0, 2)) * 60 + (+t.slice(3, 5)); }

  function lock(on) {
    busy = on;
    FormLock.lock($('cal-form'), on);
    if (!on) { update(); }
  }

  function closeEvent(force) {
    if (busy) { return false; }
    if (!force && form && !C.same(form, orig) && !window.confirm('Close without saving your changes?')) { return false; }
    form = null;
    if (dialog.open) { if (dialog.close) { dialog.close(); } else { dialog.removeAttribute('open'); } }
    setHash();
    return true;
  }

  function saved(words) {
    closeEvent(true);
    say('cal-list-status', 'Loading the latest…', true);
    return reload().then(function () { say('cal-list-status', words); },
      function () { say('cal-list-status', words + ' The list could not be refreshed: reload the page to see it.'); });
  }

  // 409: someone changed this event since the page loaded it
  function clash(r, id) {
    var b = el('button', 'btn btn--ghost btn--sm', 'Load the latest');
    b.type = 'button';
    b.addEventListener('click', function () {
      closeEvent(true);
      reload().then(function () {
        var fresh = events.filter(function (e) { return e.id === id; })[0];
        if (fresh) { openEvent(fresh); } else { say('cal-list-status', 'That event isn’t in this calendar any more.'); }
      });
    });
    renderProblems([why(r) + ' What you typed here will be lost.'], b);
  }

  // Duplicate: the same form, as a new event. The original is left as it was saved.
  function duplicate() {
    if (busy || !form || !form.id) { return; }
    read();
    var title = orig.title;
    if (!C.same(form, orig) &&
        !window.confirm('Your changes to “' + title + '” haven’t been saved. Copy them into a new event, ' +
                        'and leave “' + title + '” as it was?')) { return; }
    var source = JSON.parse(JSON.stringify(form));
    form = C.duplicate(form, today());
    orig = C.blank(slug, today());     // nothing saved yet, so Save is on
    copiedFrom = source;
    tried = false;
    $('ce-heading').textContent = 'Add an event';
    var moved = form.startDate !== source.startDate;
    $('ce-meta').textContent = 'A copy of “' + title + '”' +
      (moved ? ', moved to ' + C.dayText(form.startDate) + '.' : '.') +
      ' Change what’s different, then Save.';
    $('ce-meta').hidden = false;
    fill();
    renderProblems([]);
    say('ce-status-line', '');
    setHash();
    $('ce-start-date').focus();
  }

  function save() {
    read();
    tried = true;
    var p = C.check(form);
    if (!form.id && C.sameAsCopied(form, copiedFrom)) {
      p.push('This copy is the same as the event it came from. Change the date, time or details first.');
    }
    renderProblems(p);
    if (p.length) { return; }
    var body = C.toEvent(form);
    body.since = version;
    var id = form.id, title = body.title;
    lock(true);
    say('ce-status-line', 'Saving…', true);
    NCAN.send('/admin/calendars/' + slug + '/events', body).then(function (r) {
      lock(false);
      if (r.status === 200) {
        say('ce-status-line', '');
        var where = r.body.event && r.body.event.calendars && r.body.event.calendars.indexOf(slug) === -1
          ? ' It’s no longer in this calendar.' : '';
        return saved('Saved “' + title + '”.' + where);
      }
      say('ce-status-line', '');
      if (r.status === 409) { return clash(r, id); }
      renderProblems((r.body && r.body.problems) || [why(r)]);
    }, function (err) {
      lock(false);
      say('ce-status-line', err.message || 'The club’s results service could not be reached.');
    });
  }

  function remove(everywhere) {
    var e = orig, title = e.title;
    var words = everywhere || e.calendars.length < 2
      ? 'Delete “' + title + '”' + (e.calendars.length > 1 ? ' from every calendar it’s in' : '') +
        '? It can be brought back from Versions.'
      : 'Take “' + title + '” out of ' + cal.name + '? It stays in its other calendars.';
    if (!window.confirm(words)) { return; }
    if (!/^[A-Za-z0-9@._-]{1,200}$/.test(e.id)) { say('ce-status-line', 'This event can’t be removed here.'); return; }
    lock(true);
    say('ce-status-line', everywhere ? 'Deleting…' : 'Taking it out…', true);
    NCAN.send('/admin/calendars/' + slug + '/events/' + e.id + '/delete', { since: version, everywhere: !!everywhere })
      .then(function (r) {
        lock(false);
        if (r.status === 200) {
          return saved(r.body.event ? '“' + title + '” is out of ' + cal.name + '.' : 'Deleted “' + title + '”.');
        }
        say('ce-status-line', '');
        if (r.status === 409) { return clash(r, e.id); }
        renderProblems((r.body && r.body.problems) || [why(r)]);
      }, function (err) {
        lock(false);
        say('ce-status-line', err.message || 'The club’s results service could not be reached.');
      });
  }

  function addSkip() {
    var d = $('ce-skip-date').value;
    read();
    if (!C.realDate(d)) { renderProblems(['Choose the date to cancel.']); return; }
    if (d < form.startDate) { renderProblems(['That’s before the first one.']); return; }
    var v = form.all_day ? d : d + 'T' + form.startTime;
    if (form.skip.indexOf(v) === -1) { form.skip.push(v); }
    $('ce-skip-date').value = '';
    renderProblems([]);
    update();
  }

  function wireEvent() {
    var f = $('cal-form');
    f.addEventListener('input', function (ev) {
      if (ev.target.id === 'ce-start-date' || ev.target.id === 'ce-start-time') { return; }
      read(); update();
    });
    f.addEventListener('change', function (ev) {
      if (ev.target.id === 'ce-start-date' || ev.target.id === 'ce-start-time') { startMoved(); return; }
      read();
      if (ev.target.id === 'ce-freq' && form.freq && form.freq !== 'monthly' && !form.days.length &&
          C.realDate(form.startDate)) {
        form.days = [C.dayCode(form.startDate)];
        $('ce-day-' + form.days[0]).checked = true;
      }
      update();
    });
    $('ce-start-date').addEventListener('focus', remember);
    $('ce-start-time').addEventListener('focus', remember);
    f.addEventListener('submit', function (ev) { ev.preventDefault(); save(); });
    $('ce-close').addEventListener('click', function () { closeEvent(); });
    $('ce-cancel').addEventListener('click', function () { closeEvent(); });
    $('ce-remove').addEventListener('click', function () { remove(false); });
    $('ce-delete').addEventListener('click', function () { remove(true); });
    $('ce-duplicate').addEventListener('click', duplicate);
    $('ce-skip-add').addEventListener('click', addSkip);
    dialog.addEventListener('cancel', function (ev) {      // Escape
      ev.preventDefault();
      closeEvent();
    });
  }

  /* Calendars themselves (administrators) ------------------------------------------- */
  function fillCalendarForm() {
    if (!may.calendars || !cal) { return; }
    $('cal-cal-heading').textContent = cal.name;
    $('cc-name').value = cal.name || '';
    $('cc-colour').value = cal.colour || '#888888';
    $('cc-kind').value = cal.kind || 'events';
    $('cc-order').value = cal.order || 0;
    $('cc-public').checked = !!cal.public;
    $('cc-description').value = cal.description || '';
    $('cc-slug').textContent = 'Subscription address: https://ncan.nz/assets/calendar/' + slug +
      '.ics (it can’t change: phones that subscribe keep using it).';
    say('cc-status', '');
  }

  function adminSend(path, body, status, done) {
    body.since = version;
    say(status, 'Saving…', true);
    return NCAN.send(path, body).then(function (r) {
      if (r.status === 200) { return done(r); }
      say(status, r.status === 409 ? why(r) : ((r.body && r.body.problems) || [why(r)]).join(' '));
    }, function (err) { say(status, err.message || 'The club’s results service could not be reached.'); });
  }

  function wireAdmin() {
    $('cal-cal-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var change = {};
      var now = { name: $('cc-name').value.trim(), colour: $('cc-colour').value, kind: $('cc-kind').value,
                  order: Number($('cc-order').value) || 0, public: $('cc-public').checked,
                  description: $('cc-description').value.trim() };
      Object.keys(now).forEach(function (k) { if (now[k] !== (cal[k] === undefined ? '' : cal[k])) { change[k] = now[k]; } });
      if (!Object.keys(change).length) { say('cc-status', 'Nothing has changed.'); return; }
      if (change.public === false && !window.confirm('Make ' + cal.name + ' staff only? It leaves the calendar page, and phones that subscribe stop getting it.')) { return; }
      FormLock.lock($('cal-cal-form'), true);
      adminSend('/admin/calendars/' + slug, change, 'cc-status', function () {
        return reload().then(function () { say('cc-status', 'Saved.'); });
      }).then(function () { FormLock.lock($('cal-cal-form'), false); });
    });
    $('cc-delete').addEventListener('click', function () {
      var typed = window.prompt('This deletes ' + cal.name + ' and the events that are only in it (shared events stay in their other calendars). ' +
        'Phones that subscribe to it stop getting it. It can be brought back from Versions for a while.\n\nType the calendar’s name to delete it:');
      if (typed === null) { return; }
      if (typed.trim() !== cal.name) { say('cc-status', 'The name didn’t match, so nothing was deleted.'); return; }
      var gone = cal.name;
      FormLock.lock($('cal-cal-form'), true);
      adminSend('/admin/calendars/' + slug + '/delete', {}, 'cc-status', function () {
        slug = null;
        return reload().then(function () { say('cal-list-status', 'Deleted ' + gone + '.'); setHash(); });
      }).then(function () { FormLock.lock($('cal-cal-form'), false); });
    });

    var typedSlug = false;
    $('cn-slug').addEventListener('input', function () {
      typedSlug = !!$('cn-slug').value;
      $('cn-file').textContent = $('cn-slug').value || 'name';
    });
    $('cn-name').addEventListener('input', function () {
      if (typedSlug) { return; }
      var s = $('cn-name').value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      s = s ? ($('cn-kind').value === 'training' ? 'training-' : 'events-') + s.replace(/^(events|training)-/, '') : '';
      $('cn-slug').value = s;
      $('cn-file').textContent = s || 'name';
    });
    $('cal-new-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var s = $('cn-slug').value.trim(), name = $('cn-name').value.trim();
      var problem = !name ? 'Give the calendar a name.' : C.slugProblem(s) ||
        (calOf(s) ? 'There’s already a calendar called ' + s + '.' : '');
      if (problem) { say('cn-status', problem); return; }
      FormLock.lock($('cal-new-form'), true);
      adminSend('/admin/calendars', { slug: s, name: name, colour: $('cn-colour').value, kind: $('cn-kind').value,
                                      public: $('cn-public').checked }, 'cn-status', function (r) {
        $('cal-new-form').reset();
        typedSlug = false;
        $('cn-file').textContent = 'name';
        slug = r.body.slug || s;
        return reload().then(function () { say('cn-status', 'Made ' + name + '.'); setHash(); });
      }).then(function () { FormLock.lock($('cal-new-form'), false); });
    });
    $('cal-set-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = Number($('cs-years').value);
      if (!(n >= 1 && n <= 20 && Math.floor(n) === n)) { say('cs-status', 'Between 1 and 20 years.'); return; }
      FormLock.lock($('cal-set-form'), true);
      adminSend('/admin/calendars/settings', { past_years: n }, 'cs-status', function () {
        return reload().then(function () { say('cs-status', 'Saved.'); });
      }).then(function () { FormLock.lock($('cal-set-form'), false); });
    });
  }

  /* Versions ------------------------------------------------------------------------ */
  function renderHistory() {
    var ul = $('cal-history');
    ul.textContent = '';
    versions.forEach(function (h, i) {
      var li = el('li', 'cal-history__item');
      var words = 'Version ' + h.version + ' · ' + stamp(h.saved_at) + (h.saved_by ? ' · ' + h.saved_by : '');
      li.appendChild(el('span', 'cal-history__when', words));
      if (h.note) { li.appendChild(el('span', 'cal-history__note', h.note)); }
      if (i === 0) {
        li.appendChild(el('span', 'cal-tag', 'Now'));
      } else {
        var b = el('button', 'btn btn--ghost btn--sm', 'Go back to this');
        b.type = 'button';
        b.addEventListener('click', function () { goBack(h, b); });
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
    if (!versions.length) { ul.appendChild(el('li', 'cal-events__none', 'No versions yet.')); }
  }
  function goBack(h, b) {
    if (!window.confirm('Go back to version ' + h.version + ' (' + stamp(h.saved_at) + ')? Every calendar goes back, ' +
      'and this is saved as a new version, so it can be undone too.')) { return; }
    b.disabled = true;
    say('cal-history-status', 'Going back…', true);
    NCAN.send('/admin/calendars/undo', { version: h.version, since: version }).then(function (r) {
      if (r.status !== 200) { b.disabled = false; say('cal-history-status', why(r)); return; }
      return reload().then(function () { say('cal-history-status', 'Back to version ' + h.version + ', saved as version ' + r.body.version + '.'); });
    }, function (err) { b.disabled = false; say('cal-history-status', err.message || 'The club’s results service could not be reached.'); });
  }

  /* Starting ------------------------------------------------------------------------ */
  $('cal-which').addEventListener('change', renderEvents);
  $('cal-search').addEventListener('input', renderEvents);
  $('cal-add').addEventListener('click', function () { openEvent(null); });
  wireEvent();
  wireAdmin();

  NCAN.me().then(function (who) {
    NCAN.account($('account'), who);
    if (!who) {
      $('cal-status').textContent = '';
      $('cal-signin').hidden = false;
      NCAN.signIn($('cal-signin'), 'This page is for club staff: coaches, the committee and administrators. Sign in with your email address.');
      return;
    }
    if (!NCAN.atLeast(who, 'coach')) {
      $('cal-status').textContent = 'This page is for club staff. ';
      var mine = el('a', null, 'Go to your own page');
      mine.href = NCAN.home(who);
      $('cal-status').appendChild(mine);
      $('cal-status').appendChild(document.createTextNode('.'));
      return;
    }
    var asked = fromHash();
    loadList().then(function () {
      if (!cals.length) { throw new Error('There are no calendars yet.'); }
      return loadCal(calOf(asked.slug) ? asked.slug : cals[0].slug);
    }).then(function () {
      $('cal-status').hidden = true;
      $('cal-editor').hidden = false;
      setHash();
      if (asked.id && asked.slug === slug) {
        var e = events.filter(function (x) { return x.id === asked.id; })[0];
        if (e) { openEvent(e); }
      }
    }, function (err) { $('cal-status').textContent = err.message || 'Sorry, the calendars could not be loaded.'; });
  }, function () { $('cal-status').textContent = 'The club’s results service could not be reached.'; });
}());
