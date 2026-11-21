/*
  admin-photos.js - "Header photos" on the Club admin page (/admin/#page-photos).

  The photos behind the green heading band at the top of the site's pages:
  pools of approved photos, and which pages (and #/... addresses, such as one
  training plan) use them. The layout and the rules are those of the website's
  assets/data/page-photos.json, described in assets/js/page-photos.js and
  tools/README.md ("Header photos"). The club's API keeps what is saved here
  (GET/POST /v1/admin/page-photos), checks it the same way, and keeps the last
  50 versions for undo. These settings are laid over the website's file: a pool
  or page here replaces the file's of the same name (the gallery's album pages
  take their cover photo from the file).

  A page that already has header photos picks them as it loads, so it shows a
  change within 5 minutes (the API's reply is cached for up to 300 seconds). A
  page getting photos for the first time gets them at the next automatic publish
  (pages.yml, at 11 and 41 past each hour), usually within 30 minutes.

  Also here: the athletes' own photos most recently uploaded, each with Remove.

  Only for administrators: admin.js calls AdminPhotos.start() once it knows.
*/
(function () {
  'use strict';

  var $ = function (x) { return document.getElementById(x); };
  var P = null;              // window.PagePhotos (page-photos.js is deferred: set in start())

  var version = 0;           // the version the editor opened
  var draft = { pools: {}, pages: {} };
  var file = { pools: {}, pages: {} };   // the website's own file (gallery entries)
  var dirty = false;

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function button(words, onClick, cls) {
    var b = el('button', 'btn ' + (cls || 'btn--ghost btn--sm'), words);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function input(value, attrs) {
    var i = el('input');
    i.type = 'text';
    i.value = value || '';
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    return i;
  }
  function labelled(words, control, cls, hint) {
    var p = el('p', 'records-field ' + (cls || ''));
    var id = 'pp-' + Math.random().toString(36).slice(2, 9);
    control.id = id;
    var l = el('label', null, words);
    l.htmlFor = id;
    if (control.type === 'checkbox') { p.className += ' ath-check'; p.appendChild(control); p.appendChild(l); } else { p.appendChild(l); p.appendChild(control); }
    if (hint) {
      var h = el('small', 'pp-hint', hint);
      h.id = id + '-hint';
      control.setAttribute('aria-describedby', h.id);
      p.appendChild(h);
    }
    return p;
  }
  // what the two numbers in a "Keep in view" field mean
  var FOCUS_HINT = 'Across, then down: 0% left/top, 100% right/bottom. Empty keeps the middle.';
  function checkbox(on) { var c = el('input'); c.type = 'checkbox'; c.checked = !!on; return c; }
  function say(words) { $('pp-status').textContent = words || ''; }
  function when(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function changed() {
    dirty = true;
    $('pp-save').disabled = false;
    $('pp-dirty').hidden = false;
    test();
    showText();
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* Photos: one row each -------------------------------------------------------- */

  // a photo as the editor holds it: {src, webp, tags, focus, note}
  function editable(p) {
    if (typeof p === 'string') { return { src: p }; }
    return clone(p);
  }
  // back to the file's layout: a plain address when there's nothing else
  function stored(p) {
    var out = { src: (p.src || '').trim() };
    if (p.webp && p.webp.trim() && p.webp.trim() !== out.src) { out.webp = p.webp.trim(); }
    if (p.tags && p.tags.length) { out.tags = p.tags; }
    if (p.focus && p.focus.trim()) { out.focus = p.focus.trim(); }
    if (p.note) { out.note = p.note; }
    return Object.keys(out).length === 1 ? out.src : out;
  }

  function thumb(src) {
    var img = el('img', 'pp-thumb');
    img.alt = '';
    img.loading = 'lazy';
    if (src) { img.src = src; }
    img.onerror = function () { img.classList.add('pp-thumb--broken'); };
    return img;
  }

  // the rows for a list of photos; onChange(list) with the photos as stored
  function photoRows(list, onChange) {
    var box = el('div', 'pp-photos');
    var rows = (list || []).map(editable);
    function emit() { onChange(rows.filter(function (p) { return p.src && p.src.trim(); }).map(stored)); }
    function draw() {
      box.textContent = '';
      rows.forEach(function (p, i) {
        var row = el('div', 'pp-photo');
        var img = thumb(p.webp || p.src);
        row.appendChild(img);
        var fields = el('div', 'pp-photo__fields');
        var src = input(p.src, { placeholder: 'https://photos.ncan.nz/…/photo.jpg', spellcheck: 'false' });
        src.addEventListener('change', function () { p.src = src.value.trim(); img.src = p.webp || p.src; img.classList.remove('pp-thumb--broken'); emit(); });
        fields.appendChild(labelled('Photo address', src, 'records-field--grow'));
        var webp = input(p.webp, { placeholder: 'optional: the same photo as WebP', spellcheck: 'false' });
        webp.addEventListener('change', function () { p.webp = webp.value.trim(); img.src = p.webp || p.src; emit(); });
        fields.appendChild(labelled('WebP address', webp, 'records-field--grow'));
        var tags = input((p.tags || []).join(', '), { placeholder: 'e.g. hurdles, relays' });
        tags.addEventListener('change', function () {
          p.tags = tags.value.split(/[\s,]+/).map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
          emit();
        });
        fields.appendChild(labelled('Tags', tags));
        var focus = input(p.focus, { placeholder: '50% 30%', size: '8' });
        focus.addEventListener('change', function () { p.focus = focus.value.trim(); emit(); });
        fields.appendChild(labelled('Keep in view', focus, 'pp-focus', FOCUS_HINT));
        row.appendChild(fields);
        row.appendChild(button('Remove', function () { rows.splice(i, 1); draw(); emit(); }));
        box.appendChild(row);
      });
      box.appendChild(button('Add a photo', function () { rows.push({ src: '' }); draw(); }));
    }
    draw();
    return box;
  }

  /* Pools ------------------------------------------------------------------------ */

  function usedBy(name) {
    var out = [];
    Object.keys(draft.pools).forEach(function (n) {
      var s = draft.pools[n];
      if (!Array.isArray(s) && (s.include || []).indexOf(name) >= 0) { out.push('pool "' + n + '"'); }
    });
    Object.keys(draft.pages).forEach(function (k) { if (draft.pages[k].pool === name) { out.push(k); } });
    return out;
  }

  function poolCard(name) {
    var spec = draft.pools[name];
    if (Array.isArray(spec)) { spec = draft.pools[name] = { photos: spec }; }
    var card = el('details', 'pp-card');
    var sum = el('summary', 'pp-card__head');
    sum.appendChild(el('strong', null, name));
    var meta = sum.appendChild(el('span', 'pp-card__meta'));
    function describe() {
      var count = 0;
      try { count = P.poolPhotos(P.overlay(file, draft), name).length; } catch (e) { count = 0; }
      meta.textContent = count + ' photo' + (count === 1 ? '' : 's') +
        (spec.public === false ? ' · not for public pages' : '') +
        ((spec.include || []).length ? ' · includes ' + spec.include.join(', ') : '');
    }
    describe();
    card.addEventListener('change', describe);
    card.appendChild(sum);
    var body = el('div', 'pp-card__body');

    var pub = checkbox(spec.public !== false);
    pub.addEventListener('change', function () {
      if (pub.checked) { delete spec.public; } else { spec.public = false; }
      changed();
    });
    body.appendChild(labelled('Can be shown on public pages (the club has consent to publish these photos)', pub));

    var others = Object.keys(draft.pools).filter(function (n) { return n !== name; }).sort();
    if (others.length) {
      var inc = el('fieldset', 'pp-include');
      inc.appendChild(el('legend', null, 'Also take the photos of'));
      others.forEach(function (n) {
        var c = checkbox((spec.include || []).indexOf(n) >= 0);
        c.addEventListener('change', function () {
          var list = (spec.include || []).filter(function (x) { return x !== n; });
          if (c.checked) { list.push(n); }
          if (list.length) { spec.include = list; } else { delete spec.include; delete spec.pick; }
          changed();
          drawPools(name);
        });
        inc.appendChild(labelled(n, c));
      });
      body.appendChild(inc);
    }
    if ((spec.include || []).length) {
      var fair = checkbox(spec.pick === 'by-pool');
      fair.addEventListener('change', function () {
        if (fair.checked) { spec.pick = 'by-pool'; } else { delete spec.pick; }
        changed();
      });
      body.appendChild(labelled('Give each pool a fair share (pick a pool first, then a photo from it)', fair));
      var ex = el('textarea');
      ex.rows = 2;
      ex.value = (spec.exclude || []).join('\n');
      ex.placeholder = 'one photo address a line';
      ex.addEventListener('change', function () {
        var list = ex.value.split(/\s+/).filter(Boolean);
        if (list.length) { spec.exclude = list; } else { delete spec.exclude; }
        changed();
      });
      body.appendChild(labelled('Leave out these photos (from the pools it takes)', ex, 'records-field--grow'));
    }

    body.appendChild(el('h4', 'pp-sub', 'Its own photos'));
    body.appendChild(photoRows(spec.photos, function (list) {
      if (list.length) { spec.photos = list; } else { delete spec.photos; }
      changed();
    }));

    var note = input(spec.note, { maxlength: '300', placeholder: 'e.g. consent checked by the committee, Nov 2026' });
    note.addEventListener('change', function () { if (note.value.trim()) { spec.note = note.value.trim(); } else { delete spec.note; } changed(); });
    body.appendChild(labelled('Note', note, 'records-field--grow'));

    body.appendChild(button('Delete this pool', function () {
      var users = usedBy(name);
      if (users.length) { say('“' + name + '” is used by ' + users.join(', ') + ': change those first.'); return; }
      if (!window.confirm('Delete the pool “' + name + '”?')) { return; }
      delete draft.pools[name];
      changed();
      drawPools();
      drawPages();
    }));
    card.appendChild(body);
    return card;
  }

  function drawPools(open) {
    var out = $('pp-pools');
    out.textContent = '';
    var names = Object.keys(draft.pools).sort();
    if (!names.length) { out.appendChild(el('p', 'records-note', 'No pools yet.')); }
    names.forEach(function (n) {
      var card = poolCard(n);
      if (n === open) { card.open = true; }
      out.appendChild(card);
    });
  }

  /* Pages -------------------------------------------------------------------------- */

  function kindOf(entry) { return entry.photo === 'none' ? 'none' : entry.pool !== undefined ? 'pool' : 'photos'; }

  function pageCard(key) {
    var entry = draft.pages[key];
    var card = el('details', 'pp-card');
    var sum = el('summary', 'pp-card__head');
    sum.appendChild(el('strong', null, key));
    var kind = kindOf(entry);
    sum.appendChild(el('span', 'pp-card__meta', kind === 'none' ? 'the plain green band'
      : kind === 'pool' ? 'pool ' + entry.pool : (entry.photos || []).length + ' photo(s) of its own'));
    card.appendChild(sum);
    var body = el('div', 'pp-card__body');

    var how = el('select');
    [['pool', 'Photos from a pool'], ['photos', 'Photos of its own'], ['none', 'The plain green band']].forEach(function (o) {
      var opt = el('option', null, o[1]);
      opt.value = o[0];
      how.appendChild(opt);
    });
    how.value = kind;
    how.addEventListener('change', function () {
      delete entry.pool; delete entry.photos; delete entry.photo;
      if (how.value === 'none') { entry.photo = 'none'; }
      if (how.value === 'pool') { entry.pool = Object.keys(draft.pools).sort()[0] || ''; }
      if (how.value === 'photos') { entry.photos = []; }
      changed();
      drawPages(key);
    });
    body.appendChild(labelled('Shows', how));

    if (kind === 'pool') {
      var pool = el('select');
      Object.keys(draft.pools).sort().forEach(function (n) {
        var opt = el('option', null, n);
        opt.value = n;
        pool.appendChild(opt);
      });
      pool.value = entry.pool;
      pool.addEventListener('change', function () { entry.pool = pool.value; changed(); });
      body.appendChild(labelled('Pool', pool));
    }
    if (kind === 'photos') {
      body.appendChild(photoRows(entry.photos, function (list) { entry.photos = list; changed(); }));
    }
    if (kind !== 'none') {
      var focus = input(entry.focus, { placeholder: '50% 30%', size: '8' });
      focus.addEventListener('change', function () { if (focus.value.trim()) { entry.focus = focus.value.trim(); } else { delete entry.focus; } changed(); });
      body.appendChild(labelled('Keep in view (every photo here)', focus, 'pp-focus', FOCUS_HINT));
    }
    var priv = checkbox(entry.public === false);
    priv.addEventListener('change', function () { if (priv.checked) { entry.public = false; } else { delete entry.public; } changed(); });
    body.appendChild(labelled('Only signed-in people see this page (it may use pools not for public pages)', priv));
    var note = input(entry.note, { maxlength: '300' });
    note.addEventListener('change', function () { if (note.value.trim()) { entry.note = note.value.trim(); } else { delete entry.note; } changed(); });
    body.appendChild(labelled('Note', note, 'records-field--grow'));
    body.appendChild(button('Delete this entry', function () {
      if (!window.confirm('Delete the entry for ' + key + '?')) { return; }
      delete draft.pages[key];
      changed();
      drawPages();
    }));
    card.appendChild(body);
    return card;
  }

  function drawPages(open) {
    var out = $('pp-pages');
    out.textContent = '';
    var keys = Object.keys(draft.pages).sort();
    if (!keys.length) { out.appendChild(el('p', 'records-note', 'No pages yet.')); }
    keys.forEach(function (k) {
      var card = pageCard(k);
      if (k === open) { card.open = true; }
      out.appendChild(card);
    });
    var gallery = Object.keys(file.pages).filter(function (k) { return !draft.pages[k]; }).length;
    $('pp-file-note').textContent = gallery
      ? gallery + ' more page' + (gallery === 1 ? '' : 's') + ' (the gallery’s albums) take their photo from the website’s own file; an entry here for one of them replaces it.'
      : '';
  }

  /* Which photo shows here? ------------------------------------------------------- */

  function test() {
    var out = $('pp-test-out');
    out.textContent = '';
    var raw = $('pp-test').value.trim();
    if (!raw) { return; }
    var m = /^(?:https?:\/\/[^/]+)?(\/[^#?]*)?(?:\?[^#]*)?(#.*)?$/.exec(raw);
    if (!m) { out.appendChild(el('p', 'records-note', 'Type an address on the site, like /junior-athletics/#/plan/2026-11-24.')); return; }
    var data = P.overlay(file, draft);
    var found = P.findEntry(data, m[1] || '/', m[2] || '');
    if (!found) { out.appendChild(el('p', 'records-note', 'No entry: the plain green band.')); return; }
    var groups;
    try { groups = P.entryGroups(data, found.entry); } catch (e) { out.appendChild(el('p', 'records-note', e.message)); return; }
    var photos = [];
    groups.forEach(function (g) { photos = photos.concat(g); });
    out.appendChild(el('p', 'records-note', 'Uses the entry for ' + found.key +
      (draft.pages[found.key] ? '' : ' (from the website’s file)') + ': ' +
      (photos.length ? photos.length + ' photo' + (photos.length === 1 ? '' : 's') + ', one picked at random on each visit.' : 'the plain green band.')));
    var strip = el('div', 'pp-strip');
    photos.slice(0, 24).forEach(function (p) { strip.appendChild(thumb(p.webp || p.src)); });
    out.appendChild(strip);
  }

  /* Saving, history, undo ------------------------------------------------------- */

  function problemsList(list) {
    var ul = el('ul', 'pp-problems');
    list.forEach(function (p) { ul.appendChild(el('li', null, p)); });
    $('pp-problems').textContent = '';
    $('pp-problems').appendChild(ul);
  }

  function loaded(r) {
    version = r.version || 0;
    draft = clone(r.settings || { pools: {}, pages: {} });
    draft.pools = draft.pools || {};
    draft.pages = draft.pages || {};
    dirty = false;
    $('pp-save').disabled = true;
    $('pp-dirty').hidden = true;
    $('pp-problems').textContent = '';
    $('pp-version').textContent = version
      ? 'Version ' + version + ', saved by ' + (r.saved_by || 'someone') + ' ' + when(r.saved_at) + (r.note ? ': “' + r.note + '”' : '') + '.'
      : 'Nothing saved here yet: the site uses only its own file.';
    drawPools();
    drawPages();
    drawHistory(r.history || []);
    test();
    showText();
  }

  function load() {
    return NCAN.get('/admin/page-photos').then(loaded);
  }

  function save() {
    say('Saving…');
    $('pp-save').disabled = true;
    NCAN.send('/admin/page-photos', { settings: draft, since: version, note: $('pp-note').value.trim() }).then(function (r) {
      if (r.status === 200) {
        $('pp-note').value = '';
        say('Saved as version ' + r.body.version + '. Pages that already have header photos update within 5 minutes. Pages getting photos for the first time update at the next automatic publish, usually within 30 minutes.');
        return load();
      }
      $('pp-save').disabled = false;
      if (r.status === 409) {
        say('');
        problemsList(['Someone (' + (r.body.saved_by || 'another admin') + ') saved the header photos ' + when(r.body.saved_at) +
          ', after you opened them. Copy anything you need from “Edit as text”, then Load the latest.']);
        return;
      }
      say(r.status === 400 ? 'Not saved: fix these first.' : (r.body && r.body.error) || 'Sorry, that didn’t save.');
      if (r.body && r.body.problems) { problemsList(r.body.problems); }
    }, function (err) { $('pp-save').disabled = false; say(err.message); });
  }

  function undo(to) {
    if (dirty && !window.confirm('Your changes here aren’t saved; going back loses them. Go back anyway?')) { return; }
    say('Going back…');
    NCAN.send('/admin/page-photos/undo', { version: to, since: version }).then(function (r) {
      if (r.status === 200) { say('Back to version ' + to + ', saved as version ' + r.body.version + '.'); return load(); }
      say((r.body && r.body.error) || 'Sorry, that didn’t work.');
    }, function (err) { say(err.message); });
  }

  function drawHistory(list) {
    var out = $('pp-history');
    out.textContent = '';
    if (!list.length) { out.appendChild(el('p', 'records-note', 'No versions yet.')); return; }
    var ul = el('ul', 'review-list');
    list.forEach(function (h, i) {
      var li = el('li', 'pp-history__item');
      li.appendChild(el('strong', null, 'Version ' + h.version));
      li.appendChild(el('span', 'access-how', when(h.saved_at) + ' · ' + (h.saved_by || '') + ' · ' +
        h.pools + ' pool' + (h.pools === 1 ? '' : 's') + ', ' + h.pages + ' page' + (h.pages === 1 ? '' : 's') +
        (h.note ? ' · “' + h.note + '”' : '')));
      if (i === 0) { li.appendChild(el('span', 'pp-now', 'now')); } else { li.appendChild(button('Go back to this', function () { undo(h.version); })); }
      ul.appendChild(li);
    });
    if (list.length && list[list.length - 1].version === 1) {
      var li0 = el('li', 'pp-history__item');
      li0.appendChild(el('strong', null, 'Version 0'));
      li0.appendChild(el('span', 'access-how', 'nothing here: only the website’s own file'));
      li0.appendChild(button('Go back to this', function () { undo(0); }));
      ul.appendChild(li0);
    }
    out.appendChild(ul);
  }

  /* Edit as text ----------------------------------------------------------------- */

  // The text box follows the settings while it's open: after every change above,
  // and after Save, Load the latest or Go back. Text someone has typed but not
  // used yet is left alone, with a note, so a change elsewhere never wipes it.
  var textTyped = false;

  function showText() {
    var wrap = $('pp-text-wrap');
    if (!wrap || !wrap.open) { return; }
    if (textTyped) {
      if ($('pp-text').value !== JSON.stringify(draft, null, 2)) { $('pp-text-note').hidden = false; }
      return;
    }
    $('pp-text').value = JSON.stringify(draft, null, 2);
    $('pp-text-note').hidden = true;
  }

  function resetText() {
    textTyped = false;
    showText();
  }

  function setUpText() {
    var box = $('pp-text');
    $('pp-text-wrap').addEventListener('toggle', function () {
      if (this.open) { resetText(); }
    });
    box.addEventListener('input', function () { textTyped = true; });
    $('pp-text-reset').addEventListener('click', resetText);
    $('pp-text-apply').addEventListener('click', function () {
      try {
        var d = JSON.parse(box.value);
        if (!d || typeof d !== 'object' || Array.isArray(d)) { throw new Error('should be {"pools": …, "pages": …}'); }
        draft = { pools: d.pools || {}, pages: d.pages || {} };
        textTyped = false;
        changed();
        drawPools();
        drawPages();
        say('Taken from the text: Save to keep it.');
      } catch (e) { say('That text isn’t right: ' + e.message); }
    });
  }

  /* Adding ----------------------------------------------------------------------- */

  function setUpAdding() {
    $('pp-pool-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('pp-pool-name').value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) { say('A pool’s name is lower case letters, digits and -, like junior or sprints.'); return; }
      if (draft.pools[name]) { say('There is a pool “' + name + '” already.'); return; }
      draft.pools[name] = { photos: [] };
      $('pp-pool-name').value = '';
      changed();
      drawPools(name);
      drawPages();
    });
    $('pp-page-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = $('pp-page-key').value.trim();
      var m = /^(?:https?:\/\/(?:www\.)?ncan\.nz)?(\/[^#?]*)(#.*)?$/.exec(raw);
      if (!m) { say('Type a page’s address, like /junior-athletics/ or /junior-athletics/#/plan/*.'); return; }
      var key = P.normalPath(m[1]) + (m[2] ? P.normalHash(m[2]) : '');
      if (draft.pages[key]) { say('There is an entry for ' + key + ' already.'); drawPages(key); return; }
      var pools = Object.keys(draft.pools).sort();
      draft.pages[key] = pools.length ? { pool: pools[0] } : { photos: [] };
      $('pp-page-key').value = '';
      changed();
      drawPages(key);
    });
  }

  /* Athletes' own photos ----------------------------------------------------------- */

  function loadUploads() {
    return NCAN.get('/admin/photos').then(function (r) {
      var out = $('pp-uploads');
      out.textContent = '';
      var events = r.events || [];
      if (!events.length) { out.appendChild(el('p', 'records-note', 'No athletes’ photos yet.')); return; }
      var ul = el('ul', 'review-list');
      events.slice(0, 50).forEach(function (ev) {
        var li = el('li', 'pp-history__item');
        var a = el('a', null, ev.name || 'Page ' + ev.page);
        a.href = '/athlete/#/' + (ev.address || ev.page);
        li.appendChild(a);
        li.appendChild(el('span', 'access-how', (ev.action === 'removed' ? 'Removed' : 'Uploaded') + ' by ' + (ev.by || '') +
          ' ' + when(ev.at) + (ev.why ? ' · “' + ev.why + '”' : '')));
        if (ev.current) {
          li.appendChild(button('Remove', function (e) {
            var why = window.prompt('Remove ' + (ev.name || 'this athlete') + '’s photo. Why? (kept in the log)', '');
            if (why === null) { return; }
            e.target.disabled = true;
            NCAN.send('/athletes/' + (ev.address || ev.page) + '/photo/remove', { why: why }).then(function (res) {
              $('pp-uploads-status').textContent = res.status === 200 ? 'Removed.' : (res.body && res.body.error) || 'Sorry, that didn’t work.';
              loadUploads();
            }, function (err) { $('pp-uploads-status').textContent = err.message; });
          }));
        }
        ul.appendChild(li);
      });
      out.appendChild(ul);
    }, function (err) { $('pp-uploads').textContent = err.message; });
  }

  /* Starting ------------------------------------------------------------------- */

  function start() {
    P = window.PagePhotos;
    if (!P || !$('page-photos')) { return; }
    $('page-photos').hidden = false;
    $('pp-save').addEventListener('click', save);
    $('pp-reload').addEventListener('click', function () {
      if (dirty && !window.confirm('Your changes here aren’t saved. Load the latest anyway?')) { return; }
      say('');
      load();
    });
    $('pp-test').addEventListener('input', test);
    setUpAdding();
    setUpText();
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    fetch('/assets/data/page-photos.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (f) { file = { pools: f.pools || {}, pages: f.pages || {} }; }, function () { /* the tester shows less */ })
      .then(load)
      .catch(function (err) { say(err.message || 'The header photos couldn’t be loaded.'); });
    loadUploads();
  }

  window.AdminPhotos = { start: start };
}());
