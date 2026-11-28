/*
  recaps.js - meeting recaps (issue #300, phase 1): one meeting's club results as a
  public page that's easy to post to Facebook, Messenger and WhatsApp.

    /recaps/               the published recaps, newest first (GET /v1/recaps); club
                           staff signed in see the drafts too, marked Draft.
    /recaps/#/<id>         a recap (GET /v1/recaps/<id>): anyone, once it's public;
                           a draft only for staff. Taken down: 410.
    /recaps/#/<id>/edit    the recap maker, for coaches, the committee and
                           administrators: Headline, Highlights, Links, Names check,
                           then Preview and publish (POST /v1/recaps/<id>, and
                           /publish?confirm=1 with the 1200 x 630 card drawn here).

  A recap is started from Results sources (the Share results button on each meeting).
  The API decides every name (for the public, the style the recap's maker chose in
  the Names step: first names by default, or initial and surname, or full names;
  full names for staff signed in) and leaves out athletes whose families opted out;
  this page only shows what it gets. The pure parts are in recap-data.js (tests/js/recap-data.test.js).
  No athlete data is in this file.
*/
(function () {
  'use strict';

  var D = window.NCANRecapData, L = window.NCANMeetingLinks, S = window.NCANCourseStrip;
  var $ = function (id) { return document.getElementById(id); };
  var FONTS = { display: '"Archivo", "Inter", system-ui, sans-serif', sans: '"Inter", system-ui, sans-serif' };
  var SITE = 'North Canterbury Athletic Club';
  var UNREACHABLE = 'The club’s results service could not be reached. Please try again later.';

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null && words !== '') { e.textContent = words; }
    return e;
  }
  function link(words, href, outside, cls) {
    var a = el('a', cls || null, words);
    a.href = href;
    if (outside) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function button(words, cls) {
    var b = el('button', cls || 'btn btn--ghost btn--sm', words);
    b.type = 'button';
    return b;
  }
  function status(cls) {
    var p = el('p', cls || 'access-status');
    p.setAttribute('role', 'status');
    return p;
  }

  /* Club records from the site's own records file, once ----------------------- */
  var records = null;
  function loadRecords() {
    if (!records) {
      records = fetch('/assets/data/records.json').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.records) || []; }, function () { return []; });
    }
    return records;
  }

  /* The page head --------------------------------------------------------------- */
  function head(o) {
    $('recap-eyebrow').textContent = o.eyebrow || 'Meeting results';
    $('page-heading').textContent = o.title || 'Meeting recaps';
    $('recap-lede').textContent = o.lede || '';
    $('recap-lede').hidden = !o.lede;
    var crumb = $('recap-crumb'), here = $('recap-crumb-here');
    crumb.hidden = !o.crumb;
    here.textContent = o.crumb || 'Meeting recaps';
    var lane = $('recap-lane');
    lane.hidden = !o.meeting;
    if (o.meeting) { strip(lane, o.meeting); }
    document.title = (o.title && o.title !== 'Meeting recaps' ? o.title + ' — Meeting recaps' : 'Meeting recaps') + ' — ' + SITE;
  }
  function say(words, then) {
    var s = $('recap-status');
    s.textContent = words || '';
    if (then) { s.appendChild(document.createTextNode(' ')); s.appendChild(then); }
    s.hidden = !words;
  }
  // the recap maker's "are there unsaved changes?", while it's open
  var unsaved = null;
  window.addEventListener('beforeunload', function (e) {
    if (unsaved && unsaved()) { e.preventDefault(); e.returnValue = ''; }
  });

  function reset() {
    unsaved = null;
    ['recap-list', 'recap-view', 'recap-edit', 'recap-join'].forEach(function (id) { $(id).hidden = true; });
    $('recap-signin').hidden = true;
    $('recap-signin').textContent = '';
    $('recap-list-out').textContent = '';
    $('recap-view-out').textContent = '';
    $('recap-edit-out').textContent = '';
    say('Loading…');
  }

  /* Chips: Club record, 1st, PB, First time ------------------------------------ */
  function chips(r, keys, cls) {
    var why = D.reasons(r, keys);
    var box = el('span', cls || 'recap-chips');
    why.forEach(function (w) {
      var c = el('span', 'recap-chip recap-chip--' + (w === 'medal' ? 'medal' + r.medal : w), D.chipWords(w, r));
      box.appendChild(c);
    });
    return why.length ? box : null;
  }

  /* One recap, as the public sees it ---------------------------------------------
     opts: { preview (names as the public sees them, no staff notes), keys (club records) } */
  function nameOf(r, opts) { return opts.preview ? (r.public_name || r.athlete) : r.athlete; }

  function stats(counts) {
    var dl = el('dl', 'stats__grid recap-stats');
    [[counts.athletes, 'Athlete', 'Athletes'], [counts.pbs, 'PB', 'PBs'], [counts.medals, 'Podium', 'Podiums']].forEach(function (x) {
      var n = x[0] || 0, div = el('div', 'stat');
      div.appendChild(el('dt', null, String(n)));
      div.appendChild(el('dd', null, n === 1 ? x[1] : x[2]));
      dl.appendChild(div);
    });
    return dl;
  }

  function highlightCard(r, opts) {
    var why = D.reasons(r, opts.keys);
    var li = el('li', 'recap-hl recap-hl--' + D.cardTone(why.length ? why : ['pb']));
    var c = chips(r, opts.keys, 'recap-chips recap-hl__chips');
    if (c) { li.appendChild(c); }
    li.appendChild(el('p', 'recap-hl__name', nameOf(r, opts)));
    li.appendChild(el('p', 'recap-hl__event', [D.eventLabel(r), D.groupLabel(r)].filter(Boolean).join(' · ')));
    li.appendChild(el('p', 'recap-hl__mark', r.mark));
    var more = [r.pb === 'new' && r.prev ? 'Previous best ' + r.prev : '', D.placeWords(r),
                D.windWords(r) ? (r.windy ? 'Wind-assisted ' : 'Wind ') + D.windWords(r) : ''].filter(Boolean);
    if (more.length) { li.appendChild(el('p', 'recap-hl__more', more.join(' · '))); }
    return li;
  }

  function resultRow(r, opts) {
    var li = el('li', 'recap-row');
    var who = el('span', 'recap-row__who');
    who.appendChild(el('span', 'recap-row__name', nameOf(r, opts)));
    if (r.place >= 1) { who.appendChild(el('span', 'recap-row__place', D.placeWords(r))); }
    li.appendChild(who);
    var what = el('span', 'recap-row__what');
    what.appendChild(el('span', 'recap-row__mark', r.mark));
    var c = chips(r, opts.keys);
    if (c) { what.appendChild(c); }
    if (D.windWords(r)) {
      var w = el('span', 'recap-row__wind' + (r.windy ? ' recap-row__wind--over' : ''), D.windWords(r));
      if (r.windy) { w.title = 'Wind-assisted: over 2.0 m/s, so not a legal mark'; }
      what.appendChild(w);
    }
    li.appendChild(what);
    return li;
  }

  function block(id, title) {
    var s = el('section', 'recap-block');
    s.setAttribute('aria-labelledby', id);
    var h = el('h2', 'recap-block__head', title);
    h.id = id;
    s.appendChild(h);
    return s;
  }

  function linksList(meeting) {
    var ul = el('ul', 'recap-links');
    if (meeting.link) {
      var li = el('li');
      li.appendChild(link(meeting.from === 'AthleticLIVE' ? 'Full results on AthleticLIVE' : 'The published results',
        meeting.link, true));
      ul.appendChild(li);
    }
    (meeting.links || []).forEach(function (l) {
      if (!l || !l.url) { return; }
      var li2 = el('li');
      li2.appendChild(link(l.label || l.url, l.url, true));
      ul.appendChild(li2);
    });
    return ul;
  }

  function hero(data) {
    var box = el('div', 'recap-hero');
    box.appendChild(el('p', 'eyebrow eyebrow--light', 'Meeting results'));
    box.appendChild(el('h2', 'recap-hero__title', data.recap.title || data.meeting.name));
    box.appendChild(el('p', 'recap-hero__line', D.meetingLine(data.meeting)));
    var lane = el('div', 'recap-lane');
    lane.setAttribute('aria-hidden', 'true');
    box.appendChild(lane);
    strip(lane, data.meeting);
    return box;
  }

  /* The strip under a heading: the meeting's track or course (course-strip.js),
     drawn to the strip's own size, and again when that changes */
  var strips = [];
  function paintStrip(s) {
    var w = s.box.clientWidth, h = s.box.clientHeight;
    if (!w || !h || (w === s.w && h === s.h)) { return; }
    s.w = w; s.h = h;
    s.box.innerHTML = S.svg(D.courseKind(s.meeting), D.laneColour(s.meeting), w, h);
  }
  function strip(box, meeting) {
    var s = strips.filter(function (x) { return x.box === box; })[0];
    if (!s) { s = { box: box }; strips.push(s); }
    s.meeting = meeting; s.w = s.h = 0;
    requestAnimationFrame(function () { paintStrip(s); });
  }
  var resized;
  window.addEventListener('resize', function () {
    clearTimeout(resized);
    resized = setTimeout(function () {
      strips = strips.filter(function (s) { return document.body.contains(s.box); });
      strips.forEach(paintStrip);
    }, 150);
  });

  function drawRecap(box, data, opts) {
    var p = opts.preview ? 'pv-' : '';
    box.textContent = '';
    var recap = data.recap || {}, meeting = data.meeting || {};
    if (opts.preview) { box.appendChild(hero(data)); }
    box.appendChild(stats(data.counts || {}));
    var intro = D.paragraphs(recap.intro);
    if (intro.length) {
      var words = el('div', 'recap-intro');
      intro.forEach(function (lines) {
        var para = el('p');
        lines.forEach(function (l, i) { if (i) { para.appendChild(el('br')); } para.appendChild(document.createTextNode(l)); });
        words.appendChild(para);
      });
      box.appendChild(words);
    }
    var hl = data.highlights || [];
    if (hl.length) {
      var hs = block(p + 'recap-hl-head', 'Highlights');
      var ul = el('ul', 'recap-hls');
      hl.forEach(function (r) { ul.appendChild(highlightCard(r, opts)); });
      hs.appendChild(ul);
      box.appendChild(hs);
    }
    var groups = D.groupByEvent(data.results);
    var rs = block(p + 'recap-res-head', 'Results');
    if (!groups.length) { rs.appendChild(el('p', 'mem-help', 'No results to show.')); }
    groups.forEach(function (g) {
      var ev = el('div', 'recap-event');
      ev.appendChild(el('h3', 'recap-event__head', g.label));
      var list = el('ul', 'recap-results'), last = null;
      g.results.forEach(function (r) {
        var grp = D.groupLabel(r);
        if (grp !== last) { list.appendChild(el('li', 'recap-results__group', grp || 'Other')); last = grp; }
        list.appendChild(resultRow(r, opts));
      });
      ev.appendChild(list);
      rs.appendChild(ev);
    });
    box.appendChild(rs);
    var ls = block(p + 'recap-links-head', 'Links');
    ls.appendChild(linksList(meeting));
    box.appendChild(ls);
  }

  /* /recaps/#/<id> ------------------------------------------------------------------ */
  function gone(words) {
    head({ title: 'Meeting recap', crumb: 'Meeting recap' });
    say(words, link('See the other meeting recaps', '/recaps/'));
    $('recap-join').hidden = false;
  }
  function failed(err, what) {
    if (err && err.status === 410) { return gone('This recap is no longer available.'); }
    if (err && err.status === 404) { return gone('There’s no meeting recap at this address.'); }
    if (err && err.status === 0) { return say(UNREACHABLE); }
    say('Sorry, ' + what + ' couldn’t be loaded. Please try again later.');
  }

  function showRecap(id) {
    Promise.all([NCAN.get('/recaps/' + encodeURIComponent(id)), loadRecords()]).then(function (got) {
      var data = got[0], recap = data.recap || {}, meeting = data.meeting || {};
      var keys = D.recordKeys(got[1], meeting.meet);
      head({ eyebrow: recap.state === 'draft' ? 'Draft meeting recap' : 'Meeting results', title: recap.title || meeting.name,
             lede: D.meetingLine(meeting), crumb: recap.title || meeting.name, meeting: meeting });
      say('');
      var out = $('recap-view-out');
      if (data.can_edit || data.full_names) {
        var staff = el('div', 'recap-staff');
        if (recap.state === 'draft') {
          staff.appendChild(el('p', null, 'This recap is a draft: only club staff can see it.'));
        }
        if (data.full_names) {
          staff.appendChild(el('p', null, 'You’re signed in as club staff, so you see full names here. ' +
            'Everyone else sees ' + D.nameStyle(recap.names).words + '.'));
        }
        if (data.can_edit) {
          var p = el('p');
          p.appendChild(link(recap.state === 'draft' ? 'Carry on making this recap' : 'Change or take down this recap',
            D.pageHref(id, true), false, 'btn btn--ghost btn--sm'));
          staff.appendChild(p);
        }
        out.appendChild(staff);
      }
      var body = el('div', 'recap');
      out.appendChild(body);
      drawRecap(body, data, { keys: keys });
      $('recap-view').hidden = false;
      $('recap-join').hidden = false;
    }, function (err) { failed(err, 'this recap'); });
  }

  /* /recaps/ -------------------------------------------------------------------------- */
  function showList() {
    head({ title: 'Meeting recaps', lede: 'Our athletes’ results from recent meetings: personal bests, podiums and highlights.' });
    NCAN.get('/recaps').then(function (r) {
      say('');
      var list = (r && r.recaps) || [], out = $('recap-list-out');
      if (!list.length) {
        out.appendChild(el('p', 'mem-help', 'No meeting recaps yet. Check back after the next meeting.'));
      }
      var grid = el('div', 'cards recap-cards');
      list.forEach(function (s) {
        var m = s.meeting || {}, c = s.counts || {};
        var card = el('article', 'card recap-card');
        if (s.card_image) {
          var media = el('div', 'recap-card__media');
          var img = el('img');
          img.src = s.card_image; img.alt = ''; img.width = 1200; img.height = 630; img.loading = 'lazy';
          media.appendChild(img);
          card.appendChild(media);
        }
        var body = el('div', 'card__body');
        var h = el('h3');
        h.appendChild(link(s.title || m.name, D.pageHref(s.id), false, 'card__link'));
        if (s.state === 'draft') { h.appendChild(document.createTextNode(' ')); h.appendChild(el('span', 'champs-tag', 'Draft')); }
        body.appendChild(h);
        body.appendChild(el('p', 'recap-card__line', D.meetingLine(m)));
        body.appendChild(el('p', 'recap-card__counts', [D.plural(c.athletes || 0, 'athlete', 'athletes'),
          D.plural(c.pbs || 0, 'PB', 'PBs'), D.plural(c.medals || 0, 'podium', 'podiums')].join(' · ')));
        card.appendChild(body);
        grid.appendChild(card);
      });
      if (list.length) { out.appendChild(grid); }
      $('recap-list').hidden = false;
      $('recap-join').hidden = false;
    }, function (err) { failed(err, 'the recaps'); });
  }

  /* The preview card: drawn here, uploaded when publishing ------------------------- */
  function drawCard(data) {
    var Lay = D.cardLayout(D.cardFacts(data)), scale = Lay.scale;
    var css = function (i, size) { return i.weight + ' ' + size + 'px ' + (i.font === 'display' ? FONTS.display : FONTS.sans); };
    var wait = document.fonts && document.fonts.load ? Promise.all(Lay.items.filter(function (i) { return i.kind === 'text'; })
      .map(function (i) { return document.fonts.load(css(i, i.size), i.words).catch(function () {}); })) : Promise.resolve();
    var logo = new Promise(function (ok) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = '/assets/img/logo-dark.svg';
    });
    // the strip, drawn sharp at the card's scale, as a picture to put on the canvas
    var bands = Lay.items.filter(function (i) { return i.kind === 'strip'; }).map(function (i) {
      return new Promise(function (ok) {
        var img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = function () { ok(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.svg(i.course, i.colour, i.w, i.h, { scale: scale }));
      });
    });
    return Promise.all([wait, logo, Promise.all(bands)]).then(function (got) {
      var canvas = document.createElement('canvas');
      canvas.width = Lay.w * scale; canvas.height = Lay.h * scale;
      var c = canvas.getContext('2d');
      c.scale(scale, scale);
      c.textBaseline = 'alphabetic';
      Lay.items.forEach(function (i) {
        if (i.kind === 'rect') {
          c.fillStyle = i.colour;
          if (i.round && c.roundRect) { c.beginPath(); c.roundRect(i.x, i.y, i.w, i.h, i.round); c.fill(); }
          else { c.fillRect(i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'strip') {
          var pic = got[2].shift();
          c.fillStyle = i.colour;
          if (pic) { c.drawImage(pic, i.x, i.y, i.w, i.h); } else { c.fillRect(i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'logo') {
          if (got[1]) { c.drawImage(got[1], i.x, i.y, i.w, i.h); }
        } else if (i.kind === 'text') {
          // too wide: smaller, down to two-thirds, then squeezed
          var size = i.size;
          c.font = css(i, size);
          if ('letterSpacing' in c) { c.letterSpacing = i.spacing + 'px'; }
          while (c.measureText(i.words).width > i.max && size > i.size * 0.67) { size -= 1; c.font = css(i, size); }
          c.fillStyle = i.colour; c.textAlign = i.align;
          c.fillText(i.words, i.x, i.y, i.max);
          if ('letterSpacing' in c) { c.letterSpacing = '0px'; }
        }
      });
      return canvas;
    });
  }

  // copy a link: the clipboard, or select it in its box and copy from there
  function copy(input, b) {
    var done = function () {
      var was = b.textContent;
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = was; }, 1600);
    };
    var fallback = function () {
      input.focus();
      input.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) { done(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* /recaps/#/<id>/edit: the recap maker ------------------------------------------- */
  var STEPS = ['Headline', 'Highlights', 'Links', 'Names check', 'Preview and publish'];

  function startEdit(id) {
    head({ eyebrow: 'For coaches, the committee and administrators', title: 'Make a meeting recap', crumb: 'Make a recap' });
    NCAN.me().then(function (who) {
      NCAN.account($('account'), who);
      if (!who) {
        say('');
        NCAN.signIn($('recap-signin'), 'Making a meeting recap is for club coaches, the committee and administrators. ' +
          'Sign in with your email address.', location.href);
        return;
      }
      if (!NCAN.atLeast(who, 'coach')) {
        say('Making a meeting recap is for club coaches, the committee and administrators.', link('See the meeting recaps', '/recaps/'));
        return;
      }
      return Promise.all([NCAN.get('/recaps/' + encodeURIComponent(id)), loadRecords()]).then(function (got) {
        var data = got[0];
        if (!data.can_edit) {
          head({ title: data.recap.title, crumb: data.recap.title });
          say('You can’t change this recap.', link('See it', D.pageHref(id)));
          return;
        }
        say('');
        editor(id, data, got[1]);
      }, function (err) {
        if (err && err.status === 401) {
          say('');
          NCAN.signIn($('recap-signin'), 'Sign in again to carry on with this recap.', location.href);
        } else if (err && err.status === 403) {
          say('Making a meeting recap is for club coaches, the committee and administrators.');
        } else { failed(err, 'this recap'); }
      });
    }, function () { say(UNREACHABLE); });
  }

  function editor(id, data, recordList) {
    var out = $('recap-edit-out');
    var keys = D.recordKeys(recordList, (data.meeting || {}).meet);
    var S = { step: 0, picked: (data.recap.highlights || []).slice(), title: data.recap.title || '', intro: data.recap.intro || '',
              names: data.recap.names || 'first', include: (data.recap.include || []).slice() };
    var said = status('access-status recap-edit__said');
    var down = null;
    var stateLine = el('p', 'recap-edit__state');

    function heading() {
      head({ eyebrow: 'Meeting recap · ' + D.stateLabel(data.recap.state), title: data.recap.title || data.meeting.name,
             lede: D.meetingLine(data.meeting), crumb: 'Make a recap', meeting: data.meeting });
      stateLine.textContent = '';
      stateLine.appendChild(el('span', 'champs-tag' + (data.recap.state === 'public' ? ' champs-tag--next' : ''), D.stateLabel(data.recap.state)));
      var bits = [];
      if (data.recap.by) { bits.push('Made by ' + data.recap.by); }
      if (data.recap.published_at) { bits.push('Published ' + D.shortDate(data.recap.published_at) + ' ' + data.recap.published_at.slice(11, 16)); }
      stateLine.appendChild(document.createTextNode(' ' + bits.join(' · ')));
      stateLine.appendChild(document.createTextNode(' '));
      stateLine.appendChild(link('See the page', D.pageHref(id)));
      if (down) { drawDown(); }    // Take down or Discard, as the state now is
    }
    function dirty() {
      var h = D.checkHeadline(S.title, S.intro);
      return h.title !== (data.recap.title || '') || h.intro !== (data.recap.intro || '') ||
        S.picked.join('\n') !== (data.recap.highlights || []).join('\n') || S.names !== (data.recap.names || 'first') ||
        S.include.join(' ') !== (data.recap.include || []).join(' ');
    }
    // POST /v1/recaps/<id>: resolves true when saved (or nothing to save), false if not
    function save() {
      if (!dirty()) { return Promise.resolve(true); }
      var h = D.checkHeadline(S.title, S.intro);
      if (h.error) { said.textContent = h.error; return Promise.resolve(false); }
      FormLock.lock(out, true);
      said.textContent = 'Saving…';
      return NCAN.send('/recaps/' + encodeURIComponent(id), { title: h.title, intro: h.intro, highlights: S.picked, include: S.include, names: S.names,
                                                              since: data.recap.updated }).then(function (r) {
        FormLock.lock(out, false);
        if (r.status === 200) {
          data = r.body;
          S.title = data.recap.title || ''; S.intro = data.recap.intro || ''; S.picked = (data.recap.highlights || []).slice();
          S.names = data.recap.names || 'first'; S.include = (data.recap.include || []).slice();
          said.textContent = 'Saved.';
          heading();
          return true;
        }
        if (r.status === 409 && r.body && r.body.conflict) {
          said.textContent = 'Someone else' + (r.body.updated_by ? ' (' + r.body.updated_by + ')' : '') +
            ' saved this recap after you opened it. Reload to see their changes, then make yours again. ';
          var again = button('Reload');
          again.addEventListener('click', function () { location.reload(); });
          said.appendChild(again);
          return false;
        }
        if (r.status === 401) { said.textContent = 'You’ve been signed out. Sign in again, then make your changes again.'; return false; }
        said.textContent = (r.body && r.body.error) || 'Sorry, that didn’t work (' + r.status + ').';
        return false;
      }, function (err) { FormLock.lock(out, false); said.textContent = err.message || UNREACHABLE; return false; });
    }

    /* the steps */
    var nav = el('ol', 'recap-steps');
    var panes = [], tabs = [];
    STEPS.forEach(function (name, i) {
      var li = el('li');
      var b = button((i + 1) + '. ' + name, 'recap-steps__b');
      b.addEventListener('click', function () { go(i); });
      li.appendChild(b);
      nav.appendChild(li);
      tabs.push(b);
      var pane = el('section', 'recap-step');
      pane.setAttribute('aria-labelledby', 'recap-step-' + i);
      var h = el('h2', 'recap-step__head', name);
      h.id = 'recap-step-' + i;
      h.tabIndex = -1;
      pane.appendChild(h);
      panes.push(pane);
    });
    var back = button('Back'), next = button('Next', 'btn btn--accent btn--sm');
    var bar = el('div', 'recap-edit__bar');
    bar.appendChild(back); bar.appendChild(next);
    back.addEventListener('click', function () { go(S.step - 1); });
    next.addEventListener('click', function () { go(S.step + 1); });

    function go(n) {
      if (n < 0 || n >= STEPS.length || n === S.step) { return; }
      save().then(function (ok) {
        if (!ok) { return; }
        said.textContent = '';
        S.step = n;
        show();
        panes[n].querySelector('h2').focus();
      });
    }
    function show() {
      panes.forEach(function (p, i) { p.hidden = i !== S.step; });
      tabs.forEach(function (b, i) {
        if (i === S.step) { b.setAttribute('aria-current', 'step'); } else { b.removeAttribute('aria-current'); }
      });
      back.hidden = S.step === 0;
      next.hidden = S.step === STEPS.length - 1;
      var fill = [fillHighlights, null, null, fillNames, fillPreview][S.step];
      if (fill) { fill(); }
    }

    /* 1. Headline */
    (function () {
      var pane = panes[0];
      pane.appendChild(el('p', 'mem-help', 'The meeting’s name, dates and place come from Results sources. ' +
        'Give the recap a title (the meeting’s name to start with) and, if you like, a short intro.'));
      var m = data.meeting;
      var facts = el('dl', 'src-facts recap-facts');
      [['Meeting', m.name], ['Dates', D.dates(m.first, m.last)], ['Place', D.where(m)], ['Results from', m.from]]
        .forEach(function (f) {
          if (!f[1]) { return; }
          facts.appendChild(el('dt', null, f[0]));
          facts.appendChild(el('dd', null, f[1]));
        });
      pane.appendChild(facts);
      var tp = el('p', 'records-field recap-field');
      var tl = el('label', null, 'Title');
      tl.htmlFor = 'recap-title';
      var ti = el('input');
      ti.type = 'text'; ti.id = 'recap-title'; ti.maxLength = D.TITLE_MAX; ti.autocomplete = 'off'; ti.value = S.title;
      tp.appendChild(tl); tp.appendChild(ti);
      var ip = el('p', 'records-field recap-field');
      var il = el('label', null, 'Intro (optional)');
      il.htmlFor = 'recap-intro';
      var ii = el('textarea');
      ii.id = 'recap-intro'; ii.maxLength = D.INTRO_MAX; ii.rows = 5; ii.value = S.intro;
      ii.setAttribute('aria-describedby', 'recap-intro-help');
      var count = el('span', 'recap-count');
      var help = el('span', 'recap-help', 'Plain text. A blank line starts a new paragraph. ');
      help.id = 'recap-intro-help';
      help.appendChild(count);
      ip.appendChild(il); ip.appendChild(ii); ip.appendChild(help);
      var counted = function () { count.textContent = ii.value.length + ' of ' + D.INTRO_MAX + ' characters.'; };
      counted();
      ti.addEventListener('input', function () { S.title = ti.value; said.textContent = ''; });
      ii.addEventListener('input', function () { S.intro = ii.value; counted(); said.textContent = ''; });
      pane.appendChild(tp);
      pane.appendChild(ip);
    }());

    /* 2. Highlights: handpicked (up to 12), or one whole group: every personal best,
       first time competing, podium finish or first place. With a group, its results
       are ticked and the list can't be changed. The picks are kept while a group is
       shown, so going back to Handpicked finds them as they were. */
    var hlCount = el('p', 'recap-count');
    var hlList = el('ul', 'recap-picks');
    var allCounts = D.includeCounts(data.results);
    panes[1].appendChild(el('p', 'mem-help', 'Show the results that stand out: pick up to ' + D.HIGHLIGHTS_MAX +
      ' yourself, or show every result in one group. Every result is on the page either way.'));
    var hlPick = el('p', 'records-field recap-hl-mode');
    var hlSel = el('select');
    hlSel.id = 'recap-hl-mode';
    var hlLab = el('label', null, 'Highlights');
    hlLab.htmlFor = hlSel.id;
    var handOpt = el('option', null, 'Handpicked (up to ' + D.HIGHLIGHTS_MAX + ')');
    handOpt.value = '';
    hlSel.appendChild(handOpt);
    D.INCLUDE.forEach(function (k) {
      var o = el('option', null, k.label + ' (' + allCounts[k.id] + ')');
      o.value = k.id;
      o.disabled = !allCounts[k.id] && S.include[0] !== k.id;
      hlSel.appendChild(o);
    });
    hlSel.addEventListener('change', function () {
      S.include = hlSel.value ? [hlSel.value] : [];
      said.textContent = '';
      fillHighlights();
    });
    hlPick.appendChild(hlLab);
    hlPick.appendChild(hlSel);
    panes[1].appendChild(hlPick);
    panes[1].appendChild(hlCount);
    panes[1].appendChild(hlList);
    function fillHighlights() {
      var group = S.include[0] || '';
      hlSel.value = group;
      hlList.classList.toggle('recap-picks--locked', !!group);
      hlList.textContent = '';
      var sug = D.suggest(data.results, keys);
      var known = {};
      sug.forEach(function (s) { known[s.key] = true; });
      // anything picked that isn't suggested (picked before, say) still shows, so it can be unticked
      (data.results || []).forEach(function (r) {
        if (S.picked.indexOf(r.key) >= 0 && !known[r.key]) { sug.push({ key: r.key, result: r, reasons: D.reasons(r, keys) }); }
      });
      function counted() {
        if (group) {
          var n = sug.filter(function (s) { return D.included(s.result, S.include); }).length;
          hlCount.textContent = (n === 1 ? '1 result' : n + ' results') + ' shown, every one in the group.';
          return;
        }
        var full = S.picked.length >= D.HIGHLIGHTS_MAX;
        hlCount.textContent = S.picked.length + ' of ' + D.HIGHLIGHTS_MAX + ' picked.' + (full ? ' That’s the most a recap can have.' : '');
        Array.prototype.forEach.call(hlList.querySelectorAll('input'), function (box) {
          box.disabled = full && !box.checked;
        });
      }
      if (!sug.length) {
        hlList.appendChild(el('li', 'mem-help', 'Nothing stands out on its own at this meeting: no club records, podium finishes, ' +
          'new PBs or first-time events. The results are all still on the page.'));
      }
      sug.forEach(function (s, i) {
        var r = s.result;
        var li = el('li', 'recap-pick');
        var box = el('input');
        box.type = 'checkbox'; box.id = 'recap-pick-' + i;
        box.checked = group ? D.included(r, S.include) : S.picked.indexOf(s.key) >= 0;
        box.disabled = !!group;
        var lab = el('label');
        lab.htmlFor = box.id;
        var c = chips(r, keys);
        lab.appendChild(el('span', 'recap-pick__name', r.athlete));
        lab.appendChild(el('span', 'recap-pick__what', [D.eventLabel(r), D.groupLabel(r), r.mark,
          r.pb === 'new' && r.prev ? 'was ' + r.prev : ''].filter(Boolean).join(' · ')));
        if (c) { lab.appendChild(c); }
        box.addEventListener('change', function () {
          S.picked = D.toggle(S.picked, s.key, box.checked).picked;
          box.checked = S.picked.indexOf(s.key) >= 0;
          said.textContent = '';
          counted();
        });
        li.appendChild(box);
        li.appendChild(lab);
        hlList.appendChild(li);
      });
      counted();
    }

    /* 3. Links */
    (function () {
      var pane = panes[2], m = data.meeting;
      var always = el('p', 'recap-always');
      always.appendChild(document.createTextNode('Always shown: '));
      always.appendChild(link(m.from === 'AthleticLIVE' ? 'Full results on AthleticLIVE' : 'The published results', m.link, true));
      if (m.from !== 'AthleticLIVE' || !m.meet) {
        pane.appendChild(el('p', 'mem-help', 'Other links can be added only to meetings from AthleticLIVE.'));
        pane.appendChild(always);
        return;
      }
      pane.appendChild(el('p', 'mem-help', 'Up to ' + L.MAX + ' other links for people to follow, like the organiser’s PDF, ' +
        'a photo finish or a livestream. Saving updates the meeting, so they show on athlete pages too. ' +
        'Leave a label empty to name it from the address.'));
      pane.appendChild(always);
      var form = el('form', 'src-xlinks recap-links-form');
      form.noValidate = true;
      var rows = el('div', 'src-xlinks__rows');
      var add = button('Add a link');
      var go = el('button', 'btn btn--ghost', 'Save links');
      go.type = 'submit';
      var linkSaid = status('src-type-form__said');
      var count = 0;
      function typed() {
        return Array.prototype.map.call(rows.children, function (r) {
          return { label: r.querySelector('.src-xlinks__label').value, url: r.querySelector('.src-xlinks__url').value };
        });
      }
      function check() {
        var t = L.tidy(typed());
        go.disabled = !!t.error || L.same(m.links, t.links);
        add.hidden = rows.children.length >= L.MAX;
        return t;
      }
      function field(cls, words, value, type, max, holder) {
        var p = el('p', 'records-field ' + cls + '-field');
        var fid = 'recap-xl-' + count + cls.slice(-4);
        var lab = el('label', null, words);
        lab.htmlFor = fid;
        var box = el('input', cls);
        box.id = fid; box.type = type; box.maxLength = max; box.autocomplete = 'off'; box.value = value || '';
        if (holder) { box.placeholder = holder; }
        box.addEventListener('input', function () { linkSaid.textContent = ''; check(); });
        box.addEventListener('change', function () { linkSaid.textContent = check().error; });
        p.appendChild(lab); p.appendChild(box);
        return p;
      }
      function row(l) {
        count++;
        var r = el('div', 'src-xlinks__row');
        r.appendChild(field('src-xlinks__label', 'Label', l && l.label, 'text', 60, 'optional'));
        r.appendChild(field('src-xlinks__url', 'Address', l && l.url, 'url', 400, 'https://'));
        var rm = button('Remove', 'btn btn--ghost btn--sm src-xlinks__rm');
        rm.setAttribute('aria-label', 'Remove this link');
        rm.addEventListener('click', function () { r.remove(); linkSaid.textContent = ''; check(); add.focus(); });
        r.appendChild(rm);
        rows.appendChild(r);
        return r;
      }
      function fill() { rows.textContent = ''; (m.links || []).forEach(row); check(); }
      add.addEventListener('click', function () { row().querySelector('.src-xlinks__url').focus(); check(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = check();
        if (t.error) { linkSaid.textContent = t.error; return; }
        if (go.disabled) { return; }
        FormLock.lock(form, true);
        linkSaid.textContent = 'Saving…';
        NCAN.send('/sources/links', { url: m.link, links: t.links }).then(function (r) {
          FormLock.lock(form, false);
          if (r.status !== 200) { linkSaid.textContent = (r.body && r.body.error) || 'Sorry, that didn’t work.'; check(); return; }
          m.links = (r.body && r.body.meeting && r.body.meeting.extra_links) || t.links;
          fill();
          linkSaid.textContent = m.links.length ? 'Saved. They show on the recap and athlete pages now.' : 'Saved: no other links.';
        }, function (err) { FormLock.lock(form, false); linkSaid.textContent = err.message; check(); });
      });
      form.appendChild(rows);
      var lbar = el('div', 'src-xlinks__bar');
      lbar.appendChild(add); lbar.appendChild(go);
      form.appendChild(lbar);
      form.appendChild(linkSaid);
      pane.appendChild(form);
      fill();
    }());

    /* 4. Names check */
    var namesBox = el('div');
    panes[3].appendChild(el('p', 'mem-help', 'Choose how athletes are named on the public page. First names suit most ' +
      'meetings; where two athletes would read the same, more of the name is shown. Signed-in club staff always see full names.'));
    var styleSet = el('fieldset', 'recap-namestyle');
    styleSet.appendChild(el('legend', null, 'Names on the public page'));
    var styleSaid = status('recap-namestyle__said');
    D.NAME_STYLES.forEach(function (st) {
      var lab = el('label', 'recap-namestyle__opt');
      var r = el('input');
      r.type = 'radio'; r.name = 'recap-names'; r.value = st.id;
      r.checked = st.id === S.names;
      r.addEventListener('change', function () {
        if (!r.checked) { return; }
        S.names = st.id;
        styleSaid.textContent = '';
        save().then(function (ok) {
          if (ok) { styleSaid.textContent = 'Saved: the public sees ' + D.nameStyle(S.names).words + '.'; }
          else { S.names = data.recap.names || 'first'; }     // not saved: back to the style it has
          syncStyle();
          fillNames();
        });
      });
      lab.appendChild(r);
      lab.appendChild(document.createTextNode(' ' + st.label + ' '));
      lab.appendChild(el('span', 'recap-namestyle__eg', '(' + st.example + ')'));
      styleSet.appendChild(lab);
    });
    function syncStyle() {
      Array.prototype.forEach.call(styleSet.querySelectorAll('input'), function (r) { r.checked = r.value === S.names; });
    }
    panes[3].appendChild(styleSet);
    panes[3].appendChild(styleSaid);
    panes[3].appendChild(namesBox);
    function fillNames() {
      namesBox.textContent = '';
      var style = D.nameStyle(data.recap.names);
      var names = D.namesCheck(data.results, style.id);
      var left = D.excludedWords(data.excluded);
      if (left) { namesBox.appendChild(el('p', 'recap-left', left)); }
      if (!names.length) { namesBox.appendChild(el('p', 'mem-help', 'No athletes to show.')); return; }
      var wrap = el('div', 'table-wrap');
      var table = el('table', 'schedule recap-names');
      var cap = el('caption', 'visually-hidden', 'Each athlete’s name, and how it will be shown publicly');
      table.appendChild(cap);
      var th = el('thead'), tr = el('tr');
      ['Name', 'On the public page'].forEach(function (w) { var c = el('th', null, w); c.scope = 'col'; tr.appendChild(c); });
      th.appendChild(tr);
      table.appendChild(th);
      var tb = el('tbody');
      names.forEach(function (n) {
        var row = el('tr');
        row.appendChild(el('td', null, n.name));
        var td = el('td', null, n.shown);
        if (n.longer && style.longer) { td.appendChild(el('span', 'recap-names__why', ' (' + style.longer + ')')); }
        row.appendChild(td);
        tb.appendChild(row);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      namesBox.appendChild(el('p', 'recap-count', D.plural(names.length, 'athlete', 'athletes') + ' in this recap.'));
      namesBox.appendChild(wrap);
    }

    /* 5. Preview and publish */
    var pv = el('div', 'recap-preview');
    var cardBox = el('figure', 'recap-cardpv');
    var pubForm = el('div', 'recap-publish');
    var shareBox = el('div', 'recap-share');
    panes[4].appendChild(el('p', 'mem-help', 'The page as everyone will see it, with names as the public sees them, ' +
      'and the card that shows when the link is posted.'));
    panes[4].appendChild(pv);
    panes[4].appendChild(el('h3', 'recap-step__sub', 'The link’s preview card'));
    panes[4].appendChild(cardBox);
    panes[4].appendChild(shareBox);
    panes[4].appendChild(pubForm);
    var canvas = null;

    function fillPreview() {
      drawRecap(pv, data, { preview: true, keys: keys });
      cardBox.textContent = '';
      cardBox.appendChild(el('p', 'mem-help', 'Drawing the card…'));
      canvas = null;
      drawCard(data).then(function (cv) {
        canvas = cv;
        cardBox.textContent = '';
        cv.className = 'recap-cardpv__canvas';
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', 'The preview card: ' + (data.recap.title || '') + ', ' +
          D.cardFacts(data).counts.map(function (c) { return c.n + ' ' + c.words; }).join(', '));
        cardBox.appendChild(cv);
        cardBox.appendChild(el('figcaption', 'mem-help', '1200 × 630, for Facebook, Messenger and WhatsApp.'));
        drawPublish();
      });
      drawPublish();
      drawShare();
    }

    function drawPublish() {
      pubForm.textContent = '';
      if (data.paused) {
        pubForm.appendChild(el('p', 'recap-left', 'Sharing is paused by the club for now, so recaps can’t be published. ' +
          'Recaps already published keep working.'));
        return;
      }
      var p = el('p', 'ath-check recap-confirm');
      var box = el('input');
      box.type = 'checkbox'; box.id = 'recap-confirm';
      var lab = el('label', null, 'I’m allowed to share these results publicly for the club');
      lab.htmlFor = box.id;
      p.appendChild(box); p.appendChild(lab);
      var pub = el('button', 'btn btn--accent', data.recap.state === 'public' ? 'Publish again' : 'Publish');
      pub.type = 'button';
      pub.disabled = true;
      var pubSaid = status();
      box.addEventListener('change', function () { pub.disabled = !box.checked || !canvas; });
      if (data.recap.state === 'public') {
        pubForm.appendChild(el('p', 'mem-help', 'This recap is public. Publishing again replaces its card with this one; ' +
          'sites that already showed the link may keep the old card for a while.'));
      }
      pubForm.appendChild(p);
      pubForm.appendChild(pub);
      pubForm.appendChild(pubSaid);
      pub.addEventListener('click', function () {
        if (!box.checked || !canvas) { return; }
        FormLock.lock(pubForm, true);
        pubSaid.textContent = 'Publishing…';
        save().then(function (ok) {
          if (!ok) { FormLock.lock(pubForm, false); pubSaid.textContent = ''; return null; }
          return new Promise(function (done) { canvas.toBlob(done, 'image/png'); }).then(function (blob) {
            if (!blob) { throw new Error('Sorry, the card couldn’t be made in this browser.'); }
            return NCAN.sendFile('/recaps/' + encodeURIComponent(id) + '/publish?confirm=1', blob);
          }).then(function (r) {
            FormLock.lock(pubForm, false);
            if (r.status === 200) {
              data = r.body;
              heading();
              drawPublish();
              drawShare(true);
              return;
            }
            if (r.status === 403 && r.body && r.body.paused) { data.paused = r.body.paused; drawPublish(); return; }
            pubSaid.textContent = (r.body && r.body.error) || 'Sorry, it couldn’t be published (' + r.status + ').';
          });
        }).then(null, function (err) {
          FormLock.lock(pubForm, false);
          pubSaid.textContent = (err && err.message) || UNREACHABLE;
        });
      });
    }

    function drawShare(fresh) {
      shareBox.textContent = '';
      if (data.recap.state !== 'public') { return; }
      shareBox.appendChild(el('h3', 'recap-step__sub', fresh ? 'Published' : 'Share it'));
      shareBox.appendChild(el('p', 'mem-help', 'Post this link on Facebook, Messenger or WhatsApp: it shows the card ' +
        'and opens the recap.'));
      var row = el('p', 'recap-share__row');
      var lab = el('label', 'visually-hidden', 'Share link');
      lab.htmlFor = 'recap-share-url';
      var input = el('input', 'recap-share__url');
      input.type = 'text'; input.readOnly = true; input.id = 'recap-share-url'; input.value = data.recap.share_url || '';
      input.addEventListener('focus', function () { input.select(); });
      var cp = button('Copy link', 'btn btn--accent btn--sm');
      cp.addEventListener('click', function () { copy(input, cp); });
      row.appendChild(lab); row.appendChild(input); row.appendChild(cp);
      shareBox.appendChild(row);
      var pg = el('p');
      pg.appendChild(link('Open the recap page', D.pageHref(id)));
      shareBox.appendChild(pg);
      if (fresh) { cp.focus(); }
    }

    /* Take down (or discard a draft) */
    down = el('div', 'recap-down');
    var downHead = el('h2', 'recap-step__head recap-down__head', 'Take down');
    function drawDown() {
      down.textContent = '';
      var draft = data.recap.state === 'draft';
      downHead.textContent = draft ? 'Discard the draft' : 'Take down';
      var b = button(draft ? 'Discard this draft' : 'Take down');
      var form = el('form', 'share-row__why recap-down__why');
      form.hidden = true;
      form.noValidate = true;
      var need = data.recap.mine === false;    // an admin taking down someone else's: a reason is required
      var lab = el('label', null, need ? 'Why is the club taking it down?' : 'Why? (optional)');
      lab.htmlFor = 'recap-down-why';
      var input = el('input');
      input.type = 'text'; input.id = 'recap-down-why'; input.maxLength = 300; input.autocomplete = 'off';
      var yes = el('button', 'btn btn--accent btn--small', draft ? 'Discard' : 'Take it down');
      yes.type = 'submit';
      var no = button('Cancel', 'btn btn--ghost btn--small');
      var dsaid = status();
      [lab, input, yes, no].forEach(function (x) { form.appendChild(x); });
      down.appendChild(el('p', 'mem-help', draft
        ? 'Discarding a draft deletes it. A new recap can be started from Results sources.'
        : 'Taking it down stops the page and its link straight away: anyone who follows it is told the recap is no longer available. ' +
          'This can’t be undone.'));
      down.appendChild(b);
      down.appendChild(form);
      down.appendChild(dsaid);
      b.addEventListener('click', function () { form.hidden = false; b.hidden = true; input.focus(); });
      no.addEventListener('click', function () { form.hidden = true; b.hidden = false; dsaid.textContent = ''; b.focus(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var why = input.value.trim();
        if (need && !why) { dsaid.textContent = 'Say why the club is taking this recap down.'; input.focus(); return; }
        FormLock.lock(form, true);
        dsaid.textContent = draft ? 'Discarding…' : 'Taking it down…';
        NCAN.send('/recaps/' + encodeURIComponent(id) + '/remove', why ? { reason: why } : {}).then(function (r) {
          FormLock.lock(form, false);
          if (r.status === 200 || r.status === 410) {
            unsaved = null;
            out.textContent = '';
            head({ title: data.recap.title || data.meeting.name, crumb: 'Make a recap' });
            say(draft ? 'The draft was discarded.' : 'Taken down. Its link now says the recap is no longer available.',
              link('See the meeting recaps', '/recaps/'));
            return;
          }
          dsaid.textContent = (r.body && r.body.error) || 'Sorry, that didn’t work (' + r.status + ').';
        }, function (err) { FormLock.lock(form, false); dsaid.textContent = err.message || UNREACHABLE; });
      });
    }

    heading();
    drawDown();
    out.appendChild(stateLine);
    out.appendChild(nav);
    panes.forEach(function (p) { out.appendChild(p); });
    out.appendChild(bar);
    out.appendChild(said);
    var downBox = el('section', 'recap-down-box');
    downBox.appendChild(downHead);
    downBox.appendChild(down);
    out.appendChild(downBox);
    $('recap-edit').hidden = false;
    show();
    unsaved = dirty;
  }

  /* Which view ------------------------------------------------------------------------ */
  function route() {
    reset();
    var r = D.parseHash(location.hash);
    if (r.view === 'edit') { startEdit(r.id); }
    else if (r.view === 'recap') { showRecap(r.id); }
    else { showList(); }
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });
  route();
}());
