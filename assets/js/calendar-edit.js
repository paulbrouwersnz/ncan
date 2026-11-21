/* Calendar editor helpers ----------------------------------------------------
   The pure parts of the calendar editor (/admin/calendars/, assets/js/admin-calendars.js):
   turning an event from the club's API into the editor's form and back, the
   checks the form makes before sending, and the words for when an event is
   and how it repeats. Nothing here touches the page, so the same file runs in
   the browser (as window.CalendarEdit) and in Node for tests/js/calendar-edit.test.js.

   An event as the API keeps it (GET /v1/admin/calendars/<slug>; see the
   ncan-api project's docs/API.md):
     {id, calendars: ["events-senior"], title, location, description, link,
      all_day, start, end, repeat, skip, status}
   Times are New Zealand wall-clock text, compared as text: "2026-10-17T13:30",
   or dates "2026-10-17" when all_day. An all-day event's end is the day after
   its last day (as in .ics files); the form shows the last day instead.
   repeat: null, or {freq: weekly | fortnightly | monthly, days: ["TU"],
   until: "YYYY-MM-DD[THH:MM]" or count: N}. skip: the cancelled dates.
--------------------------------------------------------------------------- */
(function (root) {
  'use strict';

  var DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  var DAY_NAMES = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday',
                    FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
  var SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LIMITS = { title: 120, location: 200, description: 2000, link: 400, count: 500 };
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME = /^\d{2}:\d{2}$/;

  // dates as "YYYY-MM-DD" text, stepped in UTC so the machine's time zone never matters
  function parts(d) { return d.split('-').map(Number); }
  function realDate(d) {
    if (!DATE.test(d || '')) { return false; }
    var p = parts(d), x = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return x.getUTCFullYear() === p[0] && x.getUTCMonth() === p[1] - 1 && x.getUTCDate() === p[2];
  }
  function addDays(d, n) {
    var p = parts(d), x = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return x.toISOString().slice(0, 10);
  }
  function weekday(d) { var p = parts(d); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
  function dayCode(d) { return DAYS[(weekday(d) + 6) % 7]; }
  function realTime(t) {
    if (!TIME.test(t || '')) { return false; }
    var h = +t.slice(0, 2), m = +t.slice(3);
    return h < 24 && m < 60;
  }

  /* ----------------------------------------------------------- form <-> event */

  function blank(slug, date) {
    return { id: null, title: '', location: '', description: '', link: '',
             calendars: slug ? [slug] : [], all_day: false,
             startDate: date || '', startTime: '18:00', endDate: date || '', endTime: '19:00',
             freq: '', days: [], ends: 'until', until: '', count: '', skip: [], status: '' };
  }

  function fromEvent(e) {
    var f = blank();
    f.id = e.id || null;
    ['title', 'location', 'description', 'link'].forEach(function (k) { f[k] = e[k] || ''; });
    f.calendars = (e.calendars || []).slice();
    f.all_day = !!e.all_day;
    var s = e.start || '', en = e.end || '';
    f.startDate = s.slice(0, 10);
    f.startTime = f.all_day ? '' : s.slice(11, 16);
    if (f.all_day) {
      f.endDate = en ? addDays(en.slice(0, 10), -1) : f.startDate;    // the last day, not the day after
      f.endTime = '';
    } else {
      f.endDate = (en || s).slice(0, 10);
      f.endTime = en.slice(11, 16);
    }
    var r = e.repeat;
    if (r) {
      f.freq = r.freq;
      f.days = (r.days || []).slice();
      if (r.count) { f.ends = 'count'; f.count = String(r.count); }
      else if (r.until) { f.ends = 'until'; f.until = r.until.slice(0, 10); }
      else { f.ends = 'never'; }
    }
    f.skip = (e.skip || []).slice();
    // "On (confirmed)" is the blank choice: CONFIRMED and no status mean the same,
    // so an untouched confirmed event doesn't count as changed
    f.status = e.status === 'CONFIRMED' ? '' : (e.status || '');
    return f;
  }

  // the body for POST /v1/admin/calendars/<slug>/events (without since)
  function toEvent(f) {
    var e = { calendars: f.calendars.slice(), title: f.title.trim(), location: f.location.trim(),
              description: f.description.replace(/\s+$/, ''), link: f.link.trim(),
              all_day: !!f.all_day, status: f.status || null, skip: f.skip.slice() };
    if (f.id) { e.id = f.id; }
    if (f.all_day) {
      e.start = f.startDate;
      e.end = realDate(f.endDate || f.startDate) ? addDays(f.endDate || f.startDate, 1) : f.endDate;
    } else {
      e.start = f.startDate + 'T' + f.startTime;
      e.end = (f.endDate || f.startDate) + 'T' + f.endTime;
    }
    if (f.freq) {
      var r = { freq: f.freq };
      if (f.freq !== 'monthly') { r.days = DAYS.filter(function (d) { return f.days.indexOf(d) !== -1; }); }
      if (f.ends === 'until' && f.until) { r.until = f.until; }
      if (f.ends === 'count' && f.count !== '') { r.count = Number(f.count); }
      e.repeat = r;
    } else {
      e.repeat = null;
      e.skip = [];
    }
    return e;
  }

  // what the form would send, for "not saved yet"
  function same(a, b) { return JSON.stringify(toEvent(a)) === JSON.stringify(toEvent(b)); }

  /* A new event copied from another (the Duplicate button). Everything is kept
     except what belongs to the original: its id, its cancelled dates and a
     "Cancelled" status. A copy of a past event moves forward by whole weeks to
     the first same weekday on or after today, so it keeps its day of the week,
     its times and its length; an "until" date moves with it. A copy of an event
     still to come keeps its dates, for the person to change. */
  function duplicate(f, today) {
    var c = JSON.parse(JSON.stringify(f));
    c.id = null;
    c.skip = [];
    if (c.status === 'CANCELLED') { c.status = ''; }
    if (realDate(today) && realDate(c.startDate) && c.startDate < today) {
      var gap = Math.round((Date.parse(today + 'T00:00Z') - Date.parse(c.startDate + 'T00:00Z')) / 86400000);
      var shift = Math.ceil(gap / 7) * 7;
      c.startDate = addDays(c.startDate, shift);
      if (realDate(c.endDate)) { c.endDate = addDays(c.endDate, shift); }
      if (c.freq && c.ends === 'until' && realDate(c.until)) { c.until = addDays(c.until, shift); }
    }
    return c;
  }

  // a copy that would add the same event again: same details, same dates
  function sameAsCopied(f, from) {
    if (!from) { return false; }
    var a = toEvent(f), b = toEvent(from);
    delete a.id; delete b.id;
    a.calendars.sort(); b.calendars.sort();
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /* -------------------------------------------------------------------- checks
     The API checks everything again; these catch the common slips before
     sending, in the same words where they overlap. */
  function check(f) {
    var p = [];
    if (!f.title.trim()) { p.push('The event needs a title.'); }
    if (f.title.trim().length > LIMITS.title) { p.push('The title can be at most ' + LIMITS.title + ' characters.'); }
    if (f.location.trim().length > LIMITS.location) { p.push('The location can be at most ' + LIMITS.location + ' characters.'); }
    if (f.description.length > LIMITS.description) {
      p.push('The description can be at most ' + LIMITS.description + ' characters (this is ' + f.description.length + ').');
    }
    var link = f.link.trim();
    if (link && (!/^https:\/\/\S{5,}$/.test(link) || link.length > LIMITS.link)) {
      p.push('The link needs to be a full address starting https://');
    }
    if (!f.calendars.length) { p.push('Choose at least one calendar to show it in.'); }
    if (!realDate(f.startDate)) { p.push('Choose the date it starts.'); }
    else if (f.endDate && !realDate(f.endDate)) { p.push('The end date isn’t a real date.'); }
    else if (f.all_day) {
      if ((f.endDate || f.startDate) < f.startDate) { p.push('The last day can’t be before the first.'); }
    } else if (!realTime(f.startTime) || !realTime(f.endTime)) {
      p.push('Give a start and end time, or tick All day.');
    } else if ((f.endDate || f.startDate) + f.endTime <= f.startDate + f.startTime) {
      p.push('It needs to end after it starts.');
    }
    if (f.freq) {
      if (f.freq !== 'monthly' && !f.days.length) { p.push('Choose the days it repeats on.'); }
      if (f.ends === 'until') {
        if (!realDate(f.until)) { p.push('Choose the date the repeats end, or another way to end them.'); }
        else if (realDate(f.startDate) && f.until < f.startDate) { p.push('The repeats end before the first one.'); }
      }
      if (f.ends === 'count') {
        var n = Number(f.count);
        if (!(n >= 1 && n <= LIMITS.count && Math.floor(n) === n)) {
          p.push('Repeat between 1 and ' + LIMITS.count + ' times.');
        }
      }
    }
    return p;
  }

  /* -------------------------------------------------------------------- words */

  function dayText(d) {
    d = d.slice(0, 10);
    var p = parts(d);
    return SHORT[weekday(d)] + ' ' + p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
  }
  function timeText(t) {
    var h = +t.slice(0, 2), m = t.slice(3, 5);
    var ap = h < 12 ? 'am' : 'pm';
    h = h % 12 || 12;
    return h + (m === '00' ? '' : ':' + m) + ' ' + ap;
  }

  // "Sat 17 Oct 2026, 1:30–4:30 pm", "Sat 17 – Sun 18 Oct 2026", "Sat 17 Oct 2026, all day"
  function whenText(e) {
    var s = e.start || '';
    if (!realDate(s.slice(0, 10))) { return ''; }
    if (e.all_day) {
      var last = e.end ? addDays(e.end.slice(0, 10), -1) : s;
      if (last <= s) { return dayText(s) + ', all day'; }
      return dayText(s) + ' – ' + dayText(last);
    }
    var en = e.end || '';
    var from = timeText(s.slice(11, 16)), to = en ? timeText(en.slice(11, 16)) : '';
    if (en && en.slice(0, 10) !== s.slice(0, 10)) {
      return dayText(s) + ', ' + from + ' – ' + dayText(en) + ', ' + to;
    }
    if (!to) { return dayText(s) + ', ' + from; }
    if (from.slice(-2) === to.slice(-2)) { from = from.slice(0, -3); }    // "1:30–4:30 pm"
    return dayText(s) + ', ' + from + '–' + to;
  }

  function list(words) {
    return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function nth(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // "Every Tuesday until Tue 30 Mar 2027", "Every second Monday and Wednesday, 10 times"
  function repeatText(rep, start) {
    if (!rep) { return ''; }
    var out;
    if (rep.freq === 'monthly') {
      out = 'Every month' + (start && realDate(start.slice(0, 10)) ? ' on the ' + nth(parts(start.slice(0, 10))[2]) : '');
    } else {
      var names = (rep.days || []).map(function (d) { return DAY_NAMES[d]; }).filter(Boolean);
      out = (rep.freq === 'fortnightly' ? 'Every second ' : 'Every ') + (list(names) || 'week');
    }
    if (rep.count) { return out + ', ' + rep.count + (rep.count === 1 ? ' time' : ' times'); }
    if (rep.until) { return out + ' until ' + dayText(rep.until.slice(0, 10)); }
    return out + ', with no end date';
  }

  /* ------------------------------------------------------------ listing events */

  // the last date an event happens on: a repeat's end, or the event's own end
  function lastDate(e) {
    var r = e.repeat;
    if (r && r.until) { return r.until.slice(0, 10); }
    if (r) { return '9999-12-31'; }           // counted or open repeats: treat as still to come
    var end = (e.end || e.start || '').slice(0, 10);
    return e.all_day && e.end ? addDays(end, -1) : end;
  }
  function upcoming(e, today) { return lastDate(e) >= today; }

  // which: 'upcoming' (soonest first), 'past' (latest first) or 'all' (by start)
  function pick(events, which, today, q) {
    var words = (q || '').trim().toLowerCase();
    var out = events.filter(function (e) {
      if (which === 'upcoming' && !upcoming(e, today)) { return false; }
      if (which === 'past' && upcoming(e, today)) { return false; }
      if (!words) { return true; }
      return ((e.title || '') + ' ' + (e.location || '')).toLowerCase().indexOf(words) !== -1;
    });
    out.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    if (which === 'past') { out.reverse(); }
    return out;
  }

  // a new calendar's slug: the subscription address, so it never changes once made
  function slugProblem(slug) {
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug || '')) {
      return 'Use lower-case letters, numbers and dashes, such as events-masters.';
    }
    if (['settings', 'undo', 'new'].indexOf(slug) !== -1) { return '“' + slug + '” is kept for the editor.'; }
    return '';
  }

  var api = { DAYS: DAYS, DAY_NAMES: DAY_NAMES, LIMITS: LIMITS, blank: blank, fromEvent: fromEvent,
              toEvent: toEvent, same: same, duplicate: duplicate, sameAsCopied: sameAsCopied, check: check, whenText: whenText, repeatText: repeatText,
              dayText: dayText, timeText: timeText, lastDate: lastDate, upcoming: upcoming, pick: pick,
              addDays: addDays, dayCode: dayCode, realDate: realDate, slugProblem: slugProblem };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.CalendarEdit = api; }
})(this);
