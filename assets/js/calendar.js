/* Club calendar -------------------------------------------------------------
   Reads every iCalendar (.ics) file in a folder and renders one merged
   agenda. No dependencies.

   The calendars are edited on /admin/calendars/ and kept by the club's API,
   so the page reads them from there first (GET /v1/calendars and each
   calendar's .ics), and an edit shows here within a minute. If the API doesn't
   answer in time, it falls back to the published copies in this folder,
   which the Publish site workflow refreshes from the API every half hour
   (tools/fetch-calendars.py): assets/calendar/calendars.json if it exists,
   otherwise the folder's directory listing - which works on a dev server but
   not on most static hosts, so ship the manifest. Either way the addresses
   shown for subscribing are this site's, which phones already use.

   A manifest entry may also carry a "url" for a calendar published elsewhere.
   The local mirror is tried first because it always works; the url is only
   used if there is no mirror, and then only if that host sends CORS headers.
   Most providers do not - Google Calendar included - which is why
   build-calendar-list.py --fetch mirrors them here instead.

   Reading the .ics text, expanding repeating events and New Zealand time
   live in calendar-dates.js, which the page loads first. Every time is
   shown as New Zealand wall-clock time, whatever the visitor's own time
   zone: a 5 pm club night reads 5 pm in Sydney or London too, with a small
   "NZ time" label beside it there.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var root = document.getElementById('agenda-list');
  if (!root) { return; }

  var DIR = root.getAttribute('data-ics-dir') || '/assets/calendar/';
  if (DIR.charAt(DIR.length - 1) !== '/') { DIR += '/'; }
  var MONTHS_AHEAD = parseInt(root.getAttribute('data-months'), 10) || 12;
  var MONTHS_BACK = parseInt(root.getAttribute('data-months-past'), 10) || 0;
  // events beyond this many months are folded away, as the past ones are
  var MONTHS_NEAR = parseInt(root.getAttribute('data-months-near'), 10) || 0;

  // the calendars edited on /admin/calendars/; on this computer, the API run
  // locally (as in ncan-account.js)
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? 'http://' + location.hostname + ':8765/v1/calendars'
    : 'https://api.ncan.nz/v1/calendars';
  var API_WAIT = 2500;   // ms before giving up on the API and using the published files

  // used only when the manifest does not name a colour for a calendar
  var PALETTE = ['#12684D', '#B4531A', '#2A5DA8', '#7A3E9D', '#A8123F', '#4B6157'];

  // the date and parsing helpers live in calendar-dates.js
  var D = window.CalendarDates;
  var DAY_MS = D.DAY_MS;
  var nzWallFromInstant = D.nzWallFromInstant;
  var nzToday = D.nzToday;
  var visitorOnNzTime = D.visitorOnNzTime;
  var calendarName = D.calendarName;
  var parseEvents = D.parseEvents;
  var addMonths = D.addMonths;
  var occurrences = D.occurrences;
  var clockTime = D.clockTime;
  var isoDate = D.isoDate;
  var buildIcs = D.buildIcs;
  var fileNameFor = D.fileNameFor;

  /* --------------------------------------------------------------- rendering */

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                     'August', 'September', 'October', 'November', 'December'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function saveEvent(item) {
    var blob = new Blob([buildIcs(item)], { type: 'text/calendar;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = href;
    link.download = fileNameFor(item);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
  }

  var SAVE_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>' +
    '</svg>';

  // http(s) links and bare email addresses. Nothing else is turned into a
  // link, so an address from a feed cannot become javascript: or data:.
  // http(s) links and bare email addresses. Nothing else becomes a link,
  // so an address out of a feed can never be javascript: or data:.
  var LINK_PATTERN = /https?:\/\/[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+/g;

  function linkify(text) {
    var fragment = document.createDocumentFragment();
    var index = 0;

    String(text).replace(LINK_PATTERN, function (match, offset) {
      if (offset > index) {
        fragment.appendChild(document.createTextNode(text.slice(index, offset)));
      }

      // a full stop or bracket after a link is sentence punctuation, not part
      // of the address
      var address = match.replace(/[.,;:!?)\]]+$/, '');
      var trailing = match.slice(address.length);
      var isEmail = address.indexOf('@') > -1 && address.indexOf('://') < 0;

      var link = document.createElement('a');
      link.href = isEmail ? 'mailto:' + address : address;
      link.textContent = address;
      if (!isEmail) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      fragment.appendChild(link);

      if (trailing) { fragment.appendChild(document.createTextNode(trailing)); }
      index = offset + match.length;
      return match;
    });

    if (index < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(index)));
    }
    return fragment;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null && text !== '') { node.textContent = text; }
    return node;
  }

  function disclosure(labelText, metaText) {
    var box = el('details', 'agenda-past');
    var summary = document.createElement('summary');
    summary.appendChild(el('span', 'agenda-past__label', labelText));
    summary.appendChild(el('span', 'agenda-past__meta', metaText));
    var chev = el('span', 'agenda-past__chev');
    chev.setAttribute('aria-hidden', 'true');
    summary.appendChild(chev);
    box.appendChild(summary);
    var body = el('div', 'agenda-past__body');
    box.appendChild(body);
    return { box: box, body: body };
  }

  function render(items, showSource, startOfToday) {
    root.innerHTML = '';
    root.setAttribute('aria-busy', 'false');

    if (!items.length) {
      root.appendChild(el('p', 'agenda__state',
        'Nothing on the calendar just yet. Check our Facebook pages for the latest.'));
      return;
    }

    var past = items.filter(function (i) { return i.start < startOfToday; });
    var upcoming = items.filter(function (i) { return i.start >= startOfToday; });
    var totals = countByMonth(items);

    // anything past the horizon is folded away too, so the agenda opens on the
    // months a reader can actually plan around
    var horizon = MONTHS_NEAR ? addMonths(startOfToday, MONTHS_NEAR) : null;
    var near = upcoming;
    var far = [];
    if (horizon) {
      near = upcoming.filter(function (i) { return i.start < horizon; });
      far = upcoming.filter(function (i) { return i.start >= horizon; });
    }

    // what the open agenda shows - the yardstick for a split month's label
    var shownCounts = countByMonth(near);

    // A search counts matches wherever they fall, so a hit folded away in
    // "already held" or "further ahead" would be reported but not shown.
    // While searching, those sections open and say how many they hold.
    var searching = !!searchText;

    // Events that have already happened are folded away, oldest first inside,
    // so the list still reads as one timeline running into today.
    if (past.length) {
      var earlier = disclosure(
        searching ? 'Matches already held' : 'Show events already held',
        searching ? plural(past.length) + ' already held'
                  : plural(past.length) + ' in the last ' + MONTHS_BACK + ' months');
      appendMonths(earlier.body, past, showSource, totals, shownCounts, 'past');
      // Only fall back to the past when the search turns up nothing ahead:
      // what someone searches for is almost always still to come, and
      // opening both buries the upcoming matches under months of history.
      if (searching && !upcoming.length) { earlier.box.open = true; }
      root.appendChild(earlier.box);
    }

    if (!upcoming.length) {
      root.appendChild(el('p', 'agenda__state',
        'Nothing further on the calendar just yet. Check our Facebook pages for the latest.'));
      return;
    }

    appendMonths(root, near, showSource, totals, shownCounts, 'shown');

    if (far.length) {
      var later = disclosure(
        searching ? 'Matches further ahead' : 'Show events further ahead',
        searching ? plural(far.length) + ' further ahead'
                  : plural(far.length) + ' more than ' + MONTHS_NEAR + ' months away');
      appendMonths(later.body, far, showSource, totals, shownCounts, 'later');
      later.box.className = 'agenda-past agenda-later';
      if (searching) { later.box.open = true; }
      root.appendChild(later.box);
    }
  }

  function sameEventKey(summary, start) {
    // title and start time identify a fixture across calendars; UIDs do not,
    // because each publisher mints its own
    return String(summary || '').toLowerCase().replace(/\s+/g, ' ').trim() +
           '@' + start.getTime();
  }

  function monthKey(date) {
    return date.getUTCFullYear() + '-' + date.getUTCMonth();
  }

  function countByMonth(items) {
    var counts = {};
    items.forEach(function (item) {
      var key = monthKey(item.start);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function plural(n) { return n + ' event' + (n === 1 ? '' : 's'); }

  function appendMonths(container, items, showSource, totals, shownCounts, mode) {
    // group by month first, so each heading can state its own count
    var months = [];
    var byKey = {};
    items.forEach(function (item) {
      var key = monthKey(item.start);
      if (!byKey[key]) {
        byKey[key] = { key: key, first: item.start, items: [] };
        months.push(byKey[key]);
      }
      byKey[key].items.push(item);
    });

    months.forEach(function (month) {
      var heading = el('h3', 'agenda__month');
      heading.appendChild(el('span', 'agenda__month-name',
        MONTH_NAMES[month.first.getUTCMonth()] + ' ' + month.first.getUTCFullYear()));
      // A folded block counts only what it holds - saying "17 events, 11
      // displayed" above six past events describes the agenda, not the block
      // the reader has just opened. The open agenda is the one place where
      // mentioning the hidden remainder is useful.
      var here = month.items.length;
      var label;
      if (mode === 'past') {
        label = here + ' past event' + (here === 1 ? '' : 's');
      } else if (mode === 'later') {
        label = here + ' future event' + (here === 1 ? '' : 's');
      } else {
        var total = totals ? totals[month.key] : here;
        label = plural(total);
        if (total !== here) {
          label += ', ' + ((shownCounts && shownCounts[month.key]) || 0) + ' displayed';
        }
      }
      heading.appendChild(el('span', 'agenda__month-count', label));
      container.appendChild(heading);

      var list = el('ol', 'agenda__list');
      container.appendChild(list);
      month.items.forEach(function (item) { list.appendChild(buildRow(item, showSource)); });
    });
  }

  function buildRow(item, showSource) {
      var row = el('li', 'agenda__item');
      var first = item.sources && item.sources[0];
      if (first && first.colour) { row.style.setProperty('--cal-colour', first.colour); }

      var when = el('div', 'agenda__when');
      var time = el('time', 'agenda__date');
      time.setAttribute('datetime', isoDate(item.start));
      time.appendChild(el('span', 'agenda__weekday', DAY_NAMES[item.start.getUTCDay()].slice(0, 3)));
      time.appendChild(el('span', 'agenda__day', item.start.getUTCDate()));
      when.appendChild(time);
      row.appendChild(when);

      var body = el('div', 'agenda__body');
      var title = el('h4', 'agenda__title');
      if (item.url) {
        var link = el('a', null, item.summary || 'Club event');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener';
        title.appendChild(link);
      } else {
        title.textContent = item.summary || 'Club event';
      }
      body.appendChild(title);

      var facts = [];
      if (item.allDay) {
        var days = Math.round(item.duration / DAY_MS);
        facts.push(days > 1 ? days + ' days' : 'All day');
      } else {
        var finish = new Date(item.start.getTime() + item.duration);
        facts.push(clockTime(item.start) +
                   (item.duration ? '\u2013' + clockTime(finish) : ''));
      }
      if (item.location) { facts.push(item.location); }
      var meta = el('p', 'agenda__meta');
      facts.forEach(function (fact, i) {
        if (i) { meta.appendChild(document.createTextNode(' \u00b7 ')); }
        meta.appendChild(document.createTextNode(fact));
        // outside New Zealand, say whose clock the time is on
        if (i === 0 && !item.allDay && !onNzTime) {
          meta.appendChild(document.createTextNode(' '));
          meta.appendChild(el('span', 'agenda__tz', 'NZ time'));
        }
      });
      body.appendChild(meta);

      if (showSource && item.sources) {
        item.sources.forEach(function (src) {
          var badge = el('span', 'agenda__source', src.name);
          // each badge wears its own calendar's colour, so a shared fixture
          // shows at a glance which calendars carry it
          if (src.colour) { badge.style.setProperty('--cal-colour', src.colour); }
          body.appendChild(badge);
        });
      }

      if (item.description) {
        var note = el('p', 'agenda__note');
        note.appendChild(linkify(item.description));
        body.appendChild(note);
      }

      row.appendChild(body);

      var save = el('button', 'agenda__save');
      save.type = 'button';
      save.title = 'Download this event as a calendar file';
      save.setAttribute('aria-label',
        'Download “' + (item.summary || 'Club event') + '” as a calendar file');
      save.innerHTML = SAVE_ICON;
      save.addEventListener('click', function () { saveEvent(item); });
      row.appendChild(save);

      return row;
  }

  // calendars, when known, are listed under "Our calendars" so the reader
  // can still subscribe; the folder itself cannot be browsed on the live site
  function fail(message, detail, calendars) {
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '';
    var p = el('p', 'agenda__state', message);
    if (calendars && calendars.length) {
      listCalendars(calendars);
      p.appendChild(document.createTextNode(' You can still open '));
      var a = el('a', null, 'our calendars');
      a.href = '#calendar-files';
      p.appendChild(a);
      p.appendChild(document.createTextNode(' in your own calendar app.'));
    } else {
      p.appendChild(document.createTextNode(' Please try again later.'));
    }
    root.appendChild(p);
    if (detail) { console.warn('calendar:', detail); }
  }

  /* --------------------------------------------------------------- discovery */

  // the API's list of calendars, or null if it doesn't answer in time
  function fromApi() {
    var live = fetch(API, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { return D.fromApiList(data, API); })
      .catch(function () { return null; });
    var late = new Promise(function (done) { setTimeout(function () { done(null); }, API_WAIT); });
    return Promise.race([live, late]);
  }

  function fromManifest() {
    return fetch(DIR + 'calendars.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.calendars || !data.calendars.length) { return null; }
        return data.calendars
          .filter(function (c) { return c && (c.file || c.url); })
          .filter(function (c) { return c.file || c.url; })
          .map(function (c) {
            return {
              file: c.file,
              url: c.url,
              name: c.name || c.file || c.url,
              colour: c.colour || c.color
            };
          });
      })
      .catch(function () { return null; });
  }

  function fromDirectoryListing() {
    // a dev server or a host with autoindex on returns a page of links
    return fetch(DIR, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        var found = [];
        var seen = {};
        var re = /href="([^"?#]+\.ics)"/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
          var file = decodeURIComponent(m[1].split('/').pop());
          if (file && !seen[file]) { seen[file] = true; found.push({ file: file, name: file }); }
        }
        found.sort(function (a, b) { return a.file.localeCompare(b.file); });
        return found;
      })
      .catch(function () { return []; });
  }

  function discover() {
    return fromApi().then(function (list) {
      return list || fromManifest();
    }).then(function (list) {
      return list && list.length ? list : fromDirectoryListing();
    }).then(function (list) {
      // a calendar without a colour of its own takes the next palette slot
      list.forEach(function (cal, i) {
        if (!cal.colour) { cal.colour = PALETTE[i % PALETTE.length]; }
      });
      return list;
    });
  }

  function listCalendars(calendars) {
    var box = document.getElementById('calendar-files');
    if (!box) { return; }
    box.innerHTML = '';
    calendars.forEach(function (cal) {
      // a published url is the better thing to subscribe to: it updates at the
      // source, where the mirror only updates when the site is rebuilt
      var address = cal.url || new URL(DIR + cal.file, window.location.href).href;
      var li = el('li', 'doc');
      if (cal.colour) { li.style.setProperty('--cal-colour', cal.colour); }
      var body = el('div', 'doc__body');
      var title = el('h4', 'doc__title');
      var link = el('a', null, cal.name);
      link.href = cal.file ? DIR + cal.file : cal.url;
      title.appendChild(link);
      body.appendChild(title);
      var meta = el('p', 'doc__meta');
      var code = el('code', null, address);
      meta.appendChild(code);
      body.appendChild(meta);
      li.appendChild(body);
      li.appendChild(el('span', 'doc__type', 'ICS'));
      box.appendChild(li);
    });
  }

  /* ----------------------------------------------------------- filtering */

  var STORAGE_KEY = 'ncan-calendar-filter';
  var allItems = [];          // everything in the window, before filtering
  var hiddenNames = {};       // calendar name -> true when switched off
  var showSources = false;
  var todayStart = null;
  var calendarCount = 0;
  var searchText = '';        // lower-cased; '' means no search
  var onNzTime = visitorOnNzTime();
  var TIME_NOTE = onNzTime ? ' Times shown in New Zealand time.'
                           : ' Times shown in New Zealand time, not your local time.';

  function loadHidden() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) { hiddenNames = JSON.parse(saved) || {}; }
    } catch (err) {
      hiddenNames = {};       // private browsing, or storage disabled
    }
  }

  function saveHidden() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenNames));
    } catch (err) {
      /* nothing to do - the filter still works for this visit */
    }
  }

  /* Everything a reader might reasonably type: what it is called, where
     it is, what the entry says, and the calendar it came from. */
  function haystack(item) {
    if (item._hay === undefined) {
      item._hay = [
        item.summary || '',
        item.location || '',
        item.description || '',
        (item.sources || []).map(function (s) { return s.name; }).join(' ')
      ].join(' ').toLowerCase();
    }
    return item._hay;
  }

  function matchesSearch(item) {
    if (!searchText) { return true; }
    // every word must appear somewhere, so "walk rangiora" narrows rather
    // than widens
    var hay = haystack(item);
    return searchText.split(/\s+/).every(function (word) {
      return !word || hay.indexOf(word) !== -1;
    });
  }

  function visibleItems() {
    return allItems.filter(function (item) {
      // a shared fixture stays while any of its calendars is still on
      var onCalendar = (item.sources || []).some(function (src) {
        return !hiddenNames[src.name];
      });
      return onCalendar && matchesSearch(item);
    });
  }

  function updateMeta(items) {
    var meta = document.getElementById('agenda-meta');
    if (!meta) { return; }
    var ahead = items.filter(function (i) { return i.start >= todayStart; }).length;
    var on = calendarCount - Object.keys(hiddenNames).filter(function (n) {
      return hiddenNames[n];
    }).length;
    if (!items.length) {
      meta.textContent = searchText
        ? 'No events match that search.'
        : 'No events to show - every calendar is switched off.';
    } else if (searchText) {
      meta.textContent = plural(ahead) + ' matching \u201c'
        + searchInput.value.trim() + '\u201d, from ' + on + ' calendar'
        + (on === 1 ? '' : 's') + '.' + TIME_NOTE;
    } else {
      meta.textContent = plural(ahead) + ' from ' + on + ' calendar'
        + (on === 1 ? '' : 's') + ' over the next ' + MONTHS_AHEAD
        + ' months.' + TIME_NOTE;
    }
    meta.hidden = false;
  }

  function refresh() {
    var items = visibleItems();
    if (!items.length) {
      root.innerHTML = '';
      root.setAttribute('aria-busy', 'false');
      // say which control is hiding everything, rather than a generic blank
      root.appendChild(el('p', 'agenda__state', searchText
        ? 'Nothing matches \u201c' + searchInput.value.trim() + '\u201d. '
          + 'Try fewer words, or clear the search.'
        : 'Nothing to show. Switch a calendar back on above.'));
    } else {
      render(items, showSources, todayStart);
    }
    updateMeta(items);
  }

  var searchInput = document.getElementById('calendar-search-input');
  var searchClear = document.getElementById('calendar-search-clear');

  function applySearch() {
    searchText = searchInput.value.trim().toLowerCase();
    searchClear.hidden = !searchText;
    refresh();
  }

  function buildSearch() {
    var box = document.getElementById('calendar-search');
    if (!box || !searchInput) { return; }
    box.hidden = false;

    searchInput.addEventListener('input', applySearch);
    // Esc clears, which is what a search field is expected to do
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault();
        searchInput.value = '';
        applySearch();
      }
    });
    searchClear.addEventListener('click', function () {
      searchInput.value = '';
      applySearch();
      searchInput.focus();
    });
  }

  function buildFilter(calendars) {
    var box = document.getElementById('calendar-filter');
    if (!box || calendars.length < 2) { return; }
    var chips = box.querySelector('.cal-filter__chips');
    chips.innerHTML = '';
    var painters = [];

    calendars.forEach(function (cal) {
      var counted = allItems.filter(function (item) {
        return (item.sources || []).some(function (src) { return src.name === cal.name; });
      }).length;

      var chip = el('button', 'cal-filter__chip');
      chip.type = 'button';
      if (cal.colour) { chip.style.setProperty('--cal-colour', cal.colour); }
      chip.appendChild(el('span', 'cal-filter__dot'));
      chip.lastChild.setAttribute('aria-hidden', 'true');
      chip.appendChild(el('span', 'cal-filter__name', cal.name));
      chip.appendChild(el('span', 'cal-filter__count', counted));

      function paint() {
        var on = !hiddenNames[cal.name];
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        chip.title = (on ? 'Hide ' : 'Show ') + cal.name;
      }
      painters.push(paint);
      paint();

      chip.addEventListener('click', function () {
        if (hiddenNames[cal.name]) { delete hiddenNames[cal.name]; }
        else { hiddenNames[cal.name] = true; }
        paint();
        saveHidden();
        paintBulk();
        refresh();
      });

      chips.appendChild(chip);
    });

    function hiddenCount() {
      return calendars.filter(function (cal) { return hiddenNames[cal.name]; }).length;
    }

    function applyAll(hide) {
      hiddenNames = {};
      if (hide) {
        calendars.forEach(function (cal) { hiddenNames[cal.name] = true; });
      }
      saveHidden();
      painters.forEach(function (repaint) { repaint(); });
      paintBulk();
      refresh();
    }

    var showAll = el('button', 'cal-filter__reset', 'Show all');
    showAll.type = 'button';
    showAll.addEventListener('click', function () { applyAll(false); });

    var hideAll = el('button', 'cal-filter__reset', 'Hide all');
    hideAll.type = 'button';
    hideAll.addEventListener('click', function () { applyAll(true); });

    // a button that would change nothing is disabled, so the current state of
    // the whole set is readable without counting chips
    function paintBulk() {
      var hidden = hiddenCount();
      showAll.disabled = hidden === 0;
      hideAll.disabled = hidden === calendars.length;
    }
    paintBulk();

    chips.appendChild(showAll);
    chips.appendChild(hideAll);

    box.hidden = false;
  }

  /* ------------------------------------------------------------------- load */

  discover().then(function (calendars) {
    if (!calendars.length) {
      fail('No calendar files were found.');
      return;
    }

    return Promise.all(calendars.map(function (cal) {
      // the API's copy first, then the published file; a remote url last, as it
      // only works if that host sends CORS
      var addresses = [];
      if (cal.api) { addresses.push(cal.api); }
      if (cal.file) { addresses.push(DIR + cal.file); }
      if (cal.url) { addresses.push(cal.url); }

      function attempt(i) {
        if (i >= addresses.length) {
          throw new Error((cal.name || 'calendar') + ': no source could be read');
        }
        return fetch(addresses[i], { cache: 'no-cache' })
          .then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.text();
          })
          .catch(function (err) {
            if (i + 1 < addresses.length) {
              console.warn('calendar: ' + addresses[i] + ' failed (' + err.message +
                           '), trying the next source');
              return attempt(i + 1);
            }
            throw new Error(addresses[i] + ': ' + err.message);
          });
      }

      return attempt(0)
        .then(function (text) { return { cal: cal, text: text }; })
        .catch(function (err) { console.warn('calendar:', err.message); return null; });
    })).then(function (loaded) {
      loaded = loaded.filter(Boolean);
      if (!loaded.length) { fail('The calendars could not be loaded.', null, calendars); return; }

      // "today" is today in New Zealand, wherever the visitor is
      var now = new Date();
      var windowEnd = addMonths(nzWallFromInstant(now), MONTHS_AHEAD);
      var startOfToday = nzToday(now);
      var windowStart = MONTHS_BACK ? addMonths(startOfToday, -MONTHS_BACK) : startOfToday;

      var items = [];
      var byKey = {};
      var sources = [];

      loaded.forEach(function (entry) {
        var name = calendarName(entry.text, entry.cal.name);
        entry.cal.name = name;
        if (sources.indexOf(name) < 0) { sources.push(name); }

        parseEvents(entry.text).forEach(function (ev) {
          occurrences(ev, windowEnd).forEach(function (o) {
            if (o.start < windowStart || o.start > windowEnd) { return; }

            var key = sameEventKey(ev.summary, o.start);
            var already = byKey[key];
            if (already) {
              // one card, badged with every calendar that carries it
              var listed = already.sources.some(function (src) { return src.name === name; });
              if (!listed) {
                already.sources.push({ name: name, colour: entry.cal.colour });
              }
              // a thinner copy should not lose detail the other one had
              if (!already.location && ev.location) { already.location = ev.location; }
              if (!already.description && ev.description) { already.description = ev.description; }
              if (!already.url && ev.url) { already.url = ev.url; }
              return;
            }

            var item = {
              start: o.start,
              duration: o.duration,
              allDay: ev.start.allDay,
              summary: ev.summary,
              location: ev.location,
              description: ev.description,
              url: ev.url,
              uid: ev.uid,
              sources: [{ name: name, colour: entry.cal.colour }]
            };
            byKey[key] = item;
            items.push(item);
          });
        });
      });

      items.sort(function (a, b) { return a.start - b.start; });

      allItems = items;
      showSources = sources.length > 1;
      todayStart = startOfToday;
      calendarCount = loaded.length;

      loadHidden();
      // a calendar that has gone away should not stay switched off for ever
      Object.keys(hiddenNames).forEach(function (name) {
        if (!sources.some(function (s) { return s === name; })) { delete hiddenNames[name]; }
      });

      buildFilter(loaded.map(function (entry) { return entry.cal; }));
      buildSearch();
      refresh();
      listCalendars(calendars);
    });
  }).catch(function (err) {
    fail('The calendar could not be loaded.', err && err.message);
  });

}());
