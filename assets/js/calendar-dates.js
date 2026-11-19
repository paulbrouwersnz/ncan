/* Calendar dates ------------------------------------------------------------
   The calendar page's pure helpers: reading .ics text, expanding repeating
   events, New Zealand time, and writing one event back out as .ics. Nothing
   here touches the page, so the same file runs in the browser (as
   window.CalendarDates, loaded before assets/js/calendar.js) and in Node for
   the tests in tests/js/ (see tools/README.md).

   Supports the parts a club calendar actually uses: VEVENT, folded lines,
   escaped text, all-day and timed events, and repeating events using
   RRULE (FREQ, INTERVAL, COUNT, UNTIL, BYDAY) with EXDATE exclusions.

   Every time is handled as New Zealand wall-clock time, whatever the
   visitor's own time zone. Times carrying a TZID (the club's files all say
   Pacific/Auckland) or none are taken as written; times ending in Z are true
   UTC and are converted to New Zealand time.

   A wall-clock time is held in a Date's UTC fields (a "wall date"): 5 pm on
   3 March is stored as Date.UTC(y, 2, 3, 17, 0). UTC has no daylight saving,
   so stepping a repeat by whole days or months never moves the time of day,
   and nothing depends on the machine's own time zone. Only "now" and the
   saved .ics file need the real instant, and Intl converts those.
--------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  var DAY_MS = 86400000;
  var WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var MAX_OCCURRENCES = 400;          // guard against a runaway RRULE

  /* ------------------------------------------------------- New Zealand time */

  var NZ_ZONE = 'Pacific/Auckland';
  var nzFormat = null;

  function wallDate(y, mo, d, hh, mi, ss) {
    return new Date(Date.UTC(y, mo, d, hh || 0, mi || 0, ss || 0));
  }

  // the New Zealand wall-clock time at a real instant, as a wall date
  function nzWallFromInstant(instant) {
    if (!nzFormat) {
      nzFormat = new Intl.DateTimeFormat('en-NZ', {
        timeZone: NZ_ZONE, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
    }
    var p = {};
    nzFormat.formatToParts(instant).forEach(function (part) { p[part.type] = +part.value; });
    // some engines say 24 for midnight even with h23
    return wallDate(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  }

  // minutes New Zealand is ahead of UTC at a real instant (720 or 780)
  function nzOffsetMinutes(instant) {
    return Math.round((nzWallFromInstant(instant).getTime() - instant.getTime()) / 60000);
  }

  // the real instant a New Zealand wall-clock time names
  function instantFromNzWall(wall) {
    var guess = new Date(wall.getTime() - nzOffsetMinutes(wall) * 60000);
    return new Date(wall.getTime() - nzOffsetMinutes(guess) * 60000);
  }

  // midnight at the start of today in New Zealand, as a wall date
  function nzToday(now) {
    var wall = nzWallFromInstant(now || new Date());
    return wallDate(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  }

  // true when the visitor's own clock already reads New Zealand time, so the
  // "NZ time" label would only be noise. zone and offset default to the
  // browser's; offset is Date#getTimezoneOffset (minutes behind UTC).
  function visitorOnNzTime(zone, offset, now) {
    now = now || new Date();
    if (zone === undefined) {
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (err) { zone = ''; }
    }
    if (offset === undefined) { offset = now.getTimezoneOffset(); }
    var nzZones = ['Pacific/Auckland', 'NZ', 'Antarctica/McMurdo', 'Antarctica/South_Pole'];
    return nzZones.indexOf(zone) > -1 && -offset === nzOffsetMinutes(now);
  }

  /* ---------------------------------------------------------------- parsing */

  function unfold(text) {
    // RFC 5545: a CRLF followed by a space or tab continues the previous line
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  }

  function parseLine(line) {
    var i = 0, quoted = false;
    for (; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') { quoted = !quoted; }
      else if (c === ':' && !quoted) { break; }
    }
    var head = line.slice(0, i);
    var bits = head.split(';');
    var params = {};
    bits.slice(1).forEach(function (bit) {
      var eq = bit.indexOf('=');
      if (eq > 0) {
        params[bit.slice(0, eq).toUpperCase()] = bit.slice(eq + 1).replace(/^"|"$/g, '');
      }
    });
    return { name: bits[0].toUpperCase(), params: params, value: line.slice(i + 1) };
  }

  function unescapeText(value) {
    return value.replace(/\\n/gi, '\n')
                .replace(/\\,/g, ',')
                .replace(/\\;/g, ';')
                .replace(/\\\\/g, '\\');
  }

  function parseDate(value, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
    if (!m) { return null; }
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var allDay = !m[4] || (params && params.VALUE === 'DATE');
    if (allDay) { return { date: wallDate(y, mo, d), allDay: true }; }
    var hh = +m[4], mi = +m[5], ss = +m[6];
    if (m[7]) {
      return { date: nzWallFromInstant(new Date(Date.UTC(y, mo, d, hh, mi, ss))), allDay: false };
    }
    // floating, or carrying a TZID - New Zealand wall-clock time as written
    return { date: wallDate(y, mo, d, hh, mi, ss), allDay: false };
  }

  function calendarName(text, fallback) {
    var m = /^X-WR-CALNAME:(.*)$/im.exec(unfold(text));
    return m ? unescapeText(m[1].trim()) : fallback;
  }

  function parseEvents(text) {
    var lines = unfold(text).split('\n');
    var events = [];
    var current = null;

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { return; }
      if (line === 'BEGIN:VEVENT') { current = { exdates: [] }; return; }
      if (line === 'END:VEVENT') {
        if (current && current.start) { events.push(current); }
        current = null;
        return;
      }
      if (!current) { return; }

      var f = parseLine(line);
      switch (f.name) {
        case 'DTSTART':
          current.start = parseDate(f.value, f.params);
          break;
        case 'DTEND':
          current.end = parseDate(f.value, f.params);
          break;
        case 'SUMMARY':
          current.summary = unescapeText(f.value);
          break;
        case 'LOCATION':
          current.location = unescapeText(f.value);
          break;
        case 'DESCRIPTION':
          current.description = unescapeText(f.value);
          break;
        case 'URL':
          current.url = f.value;
          break;
        case 'UID':
          current.uid = f.value;
          break;
        case 'RRULE':
          current.rrule = parseRule(f.value);
          break;
        case 'EXDATE':
          f.value.split(',').forEach(function (v) {
            var parsed = parseDate(v, f.params);
            if (parsed) { current.exdates.push(parsed.date.getTime()); }
          });
          break;
      }
    });

    return events;
  }

  function parseRule(value) {
    var rule = {};
    value.split(';').forEach(function (part) {
      var eq = part.indexOf('=');
      if (eq < 0) { return; }
      var key = part.slice(0, eq).toUpperCase();
      var val = part.slice(eq + 1);
      if (key === 'INTERVAL' || key === 'COUNT') { rule[key] = parseInt(val, 10); }
      else if (key === 'UNTIL') { var u = parseDate(val); rule.UNTIL = u && u.date; }
      else if (key === 'BYDAY') { rule.BYDAY = val.toUpperCase().split(','); }
      else { rule[key] = val.toUpperCase(); }
    });
    return rule;
  }

  /* ------------------------------------------------------------- recurrence */

  // whole calendar days, not 24-hour steps: a day across a daylight-saving
  // change is 23 or 25 hours long, and the wall-clock time must stay put
  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }

  // where an occurrence finishes; an all-day event's span is whole days
  function finishOf(item) {
    return item.allDay ? addDays(item.start, Math.round(item.duration / DAY_MS))
                       : new Date(item.start.getTime() + item.duration);
  }

  function addMonths(date, n) {
    var d = new Date(date.getTime());
    var day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    // clamp, so 31 Jan + 1 month lands on 28/29 Feb rather than overflowing
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
    return d;
  }

  function occurrences(ev, windowEnd) {
    var first = ev.start.date;
    var duration = ev.end ? ev.end.date.getTime() - first.getTime()
                          : (ev.start.allDay ? DAY_MS : 3600000);
    var rule = ev.rrule;
    if (!rule || !rule.FREQ) { return [{ start: first, duration: duration }]; }

    var interval = rule.INTERVAL > 0 ? rule.INTERVAL : 1;
    var stopAt = rule.UNTIL && rule.UNTIL < windowEnd ? rule.UNTIL : windowEnd;
    var days = rule.BYDAY ? rule.BYDAY.map(function (d) {
      return WEEKDAYS[d.replace(/^[-+]?\d+/, '')];
    }).filter(function (d) { return d !== undefined; }) : null;

    var out = [];
    var cursor = new Date(first.getTime());
    var step = 0;
    var guard = 0;

    while (cursor <= stopAt && out.length < MAX_OCCURRENCES && guard++ < 2000) {
      if (rule.FREQ === 'WEEKLY' && days && days.length) {
        // walk the week the cursor starts, emitting each named weekday
        var weekStart = addDays(cursor, -cursor.getUTCDay());
        for (var i = 0; i < 7; i++) {
          var candidate = addDays(weekStart, i);
          candidate.setUTCHours(first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), 0);
          if (days.indexOf(candidate.getUTCDay()) < 0) { continue; }
          if (candidate < first || candidate > stopAt) { continue; }
          out.push({ start: candidate, duration: duration });
        }
        cursor = addDays(cursor, 7 * interval);
      } else {
        out.push({ start: new Date(cursor.getTime()), duration: duration });
        if (rule.FREQ === 'DAILY') { cursor = addDays(cursor, interval); }
        else if (rule.FREQ === 'WEEKLY') { cursor = addDays(cursor, 7 * interval); }
        // months and years count from the first date, not the last one, so
        // a clamped 28 Feb does not drag every later 31st or 29th with it
        else if (rule.FREQ === 'MONTHLY') { cursor = addMonths(first, ++step * interval); }
        else if (rule.FREQ === 'YEARLY') { cursor = addMonths(first, ++step * 12 * interval); }
        else { break; }
      }
      if (rule.COUNT && out.length >= rule.COUNT) { break; }
    }

    out.sort(function (a, b) { return a.start - b.start; });
    if (rule.COUNT) { out = out.slice(0, rule.COUNT); }
    return out.filter(function (o) {
      return ev.exdates.indexOf(o.start.getTime()) < 0;
    });
  }

  /* ---------------------------------------------------------------- output */

  function clockTime(date) {
    var h = date.getUTCHours(), m = date.getUTCMinutes();
    var suffix = h < 12 ? 'am' : 'pm';
    var hour = h % 12; if (hour === 0) { hour = 12; }
    return hour + (m ? ':' + (m < 10 ? '0' + m : m) : '') + suffix;
  }

  function isoDate(date) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  /* Saving one event ------------------------------------------------ */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function utcStamp(date) {
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
           'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) +
           pad(date.getUTCSeconds()) + 'Z';
  }

  function dateStamp(date) {
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate());
  }

  // iCalendar's escaping and line endings are all backslash and control
  // characters; naming them by code keeps this readable and unambiguous
  var BACKSLASH = String.fromCharCode(92);
  var CR = String.fromCharCode(13);
  var LF = String.fromCharCode(10);
  var CRLF = CR + LF;

  function icsEscape(text) {
    return String(text)
      .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
      .split(';').join(BACKSLASH + ';')
      .split(',').join(BACKSLASH + ',')
      .split(CRLF).join(BACKSLASH + 'n')
      .split(LF).join(BACKSLASH + 'n')
      .split(CR).join(BACKSLASH + 'n');
  }

  function icsFold(line) {
    if (line.length <= 75) { return line; }
    // the continuation's leading space is the fold marker, so a space in the
    // content survives as the first character after it
    var out = [line.slice(0, 74)];
    var rest = line.slice(74);
    while (rest) {
      out.push(' ' + rest.slice(0, 73));
      rest = rest.slice(73);
    }
    return out.join(CRLF);
  }

  function buildIcs(item) {
    var finish = finishOf(item);
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//North Canterbury Athletic Club//Club Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      // one occurrence of a repeating event needs a uid of its own, or a
      // calendar app will treat the whole series as already added
      'UID:' + (item.uid ? item.uid.split('@')[0] + '-' + dateStamp(item.start) + '@ncan.nz'
                         : 'ncan-' + item.start.getTime() + '@ncan.nz'),
      'DTSTAMP:' + utcStamp(new Date())
    ];

    if (item.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + dateStamp(item.start));
      lines.push('DTEND;VALUE=DATE:' + dateStamp(finish));
    } else {
      // absolute UTC, so no VTIMEZONE is needed and the time is unambiguous
      lines.push('DTSTART:' + utcStamp(instantFromNzWall(item.start)));
      lines.push('DTEND:' + utcStamp(instantFromNzWall(finish)));
    }

    lines.push('SUMMARY:' + icsEscape(item.summary || 'Club event'));
    if (item.location) { lines.push('LOCATION:' + icsEscape(item.location)); }
    if (item.description) { lines.push('DESCRIPTION:' + icsEscape(item.description)); }
    if (item.url) { lines.push('URL:' + item.url); }
    lines.push('END:VEVENT', 'END:VCALENDAR');

    return lines.map(icsFold).join(CRLF) + CRLF;
  }

  function fileNameFor(item) {
    var stem = (item.summary || 'club-event').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return (stem || 'club-event') + '-' + isoDate(item.start) + '.ics';
  }

  var CalendarDates = {
    DAY_MS: DAY_MS,
    WEEKDAYS: WEEKDAYS,
    MAX_OCCURRENCES: MAX_OCCURRENCES,
    NZ_ZONE: NZ_ZONE,
    wallDate: wallDate,
    nzWallFromInstant: nzWallFromInstant,
    nzOffsetMinutes: nzOffsetMinutes,
    instantFromNzWall: instantFromNzWall,
    nzToday: nzToday,
    visitorOnNzTime: visitorOnNzTime,
    unfold: unfold,
    parseLine: parseLine,
    unescapeText: unescapeText,
    parseDate: parseDate,
    calendarName: calendarName,
    parseEvents: parseEvents,
    parseRule: parseRule,
    addDays: addDays,
    finishOf: finishOf,
    addMonths: addMonths,
    occurrences: occurrences,
    clockTime: clockTime,
    isoDate: isoDate,
    utcStamp: utcStamp,
    dateStamp: dateStamp,
    icsEscape: icsEscape,
    icsFold: icsFold,
    buildIcs: buildIcs,
    fileNameFor: fileNameFor
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = CalendarDates; }
  else { global.CalendarDates = CalendarDates; }
}(typeof window !== 'undefined' ? window : this));
