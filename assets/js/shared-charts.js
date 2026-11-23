/*
  shared-charts.js - the lists of charts shared publicly (step 4 of "Sharing
  athlete charts publicly"). A share is made from the enlarged chart on an
  athlete page (athlete.js); this file only lists and removes them.

  - Athlete page (#ath-shares): "Shared charts" for that athlete, for the people
    who may share for them (the athlete's contacts from GameDay, and admins):
    GET /v1/athletes/<address>/shares. Anyone else gets 403 and sees nothing.
    A new share made on the page appears at once (the 'ncan:shared' event).
  - /athletes/ (#my-shares): "Your shared charts", every share of the athletes
    this person manages and any they made (GET /v1/me/shares); shown only when
    there is at least one.
  - /admin/shared-charts/ (#shares-admin): every share in the club, for admins
    (GET /v1/admin/shares), with Remove (a reason is required and logged; the
    makers see only "Removed by the club") and Pause sharing.

  A share is never changed after it's made: to show something different, share
  a new one and remove the old. Remove stops the link at once and can't be undone.

  The wording helpers are kept apart from the page so the Node tests can check
  them (tests/js/shared-charts.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANSharedCharts = api; }
}(this, function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function day(iso) {        // "23 Nov 2026"
    var p = parts(iso);
    return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '';
  }
  function month(iso) {      // "Nov 2026"
    var p = parts(iso);
    return p ? MONTHS[p.m - 1] + ' ' + p.y : '';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // "100m · Oct 2024 to Nov 2026 · By season"; a PB card: "100m · 21 Nov 2026 · PB card"
  function what(s) {
    var out = [s.event || 'Chart'];
    if (s.from && s.to) {
      out.push(s.from === s.to ? day(s.from)
        : month(s.from) === month(s.to) ? month(s.from)
        : month(s.from) + ' to ' + month(s.to));
    }
    out.push(s.view === 'pb-card' ? 'PB card' : s.view === 'by-season' ? 'By season' : 'Timeline');
    return out.join(' · ');
  }

  // "48 views (12 in the last 7 days) · 6 previews"
  function views(s) {
    var n = s.views || 0, recent = s.recent_views || 0, p = s.previews || 0;
    var out = n ? plural(n, 'view', 'views') + (recent ? ' (' + recent + ' in the last 7 days)' : '')
                : 'No views yet';
    if (p) { out += ' · ' + plural(p, 'link preview', 'link previews'); }
    return out;
  }

  // Families see "by you" or "by someone else"; admins (full) see the email.
  function made(s, full) {
    var by = s.mine ? ' by you' : full && s.by ? ' by ' + s.by : ' by someone else who manages this page';
    return 'Shared ' + day(s.at) + by;
  }

  function removed(s, full) {
    var r = s.removed;
    if (!r) { return ''; }
    if (r.by_club) {
      var out = 'Removed by the club on ' + day(r.at);
      if (full) {
        if (r.by) { out += ' (' + r.by + ')'; }
        if (r.why) { out += ': ' + r.why; }
      }
      return out;
    }
    return 'Removed on ' + day(r.at) + (s.mine ? ' by you' : full && r.by ? ' by ' + r.by : '');
  }

  // Admin page filter: 'live', 'removed' or 'all', and words to find (athlete, event, who made it).
  function pick(list, show, words) {
    var q = String(words || '').trim().toLowerCase();
    return (list || []).filter(function (s) {
      if (show === 'live' && s.removed) { return false; }
      if (show === 'removed' && !s.removed) { return false; }
      if (!q) { return true; }
      return [s.athlete, s.event, s.by, s.title].some(function (x) {
        return x && String(x).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  var helpers = { day: day, month: month, what: what, views: views, made: made, removed: removed, pick: pick };
  if (typeof document === 'undefined') { return helpers; }

  /* The page ------------------------------------------------------------------ */

  var $ = function (x) { return document.getElementById(x); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  function copyLink(url, button) {
    var done = function () {
      var was = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = was; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  /* One share in a list. opts: {full (admin), athlete (show its name), remove(s, row, why)} */
  function row(s, opts) {
    var li = el('li', 'share-row' + (s.removed ? ' share-row--gone' : ''));
    if (s.image && s.url) {
      var thumb = el('a', 'share-row__thumb');
      thumb.href = s.url;
      thumb.target = '_blank';
      thumb.rel = 'noopener';
      var img = el('img');
      img.src = s.image;
      img.alt = 'The shared chart: ' + (s.title || what(s));
      img.loading = 'lazy';
      img.width = 120;
      img.height = s.width && s.height ? Math.round(120 * s.height / s.width) : 80;
      thumb.appendChild(img);
      li.appendChild(thumb);
    } else {
      li.appendChild(el('span', 'share-row__thumb share-row__thumb--gone', 'Removed'));
    }
    var body = el('div', 'share-row__body');
    var head = el('p', 'share-row__what');
    if (opts.athlete && s.athlete) {
      if (s.address) {
        var a = el('a', null, s.athlete);
        a.href = '/athlete/#/' + s.address;
        head.appendChild(a);
      } else {
        head.appendChild(el('span', null, s.athlete));
      }
      head.appendChild(document.createTextNode(' · '));
    }
    head.appendChild(el('strong', null, what(s)));
    body.appendChild(head);
    if (s.title) { body.appendChild(el('p', 'share-row__meta', 'Shown as “' + s.title + '”')); }
    body.appendChild(el('p', 'share-row__meta', made(s, opts.full)));
    if (s.removed) {
      body.appendChild(el('p', 'share-row__meta share-row__gone', removed(s, opts.full)));
    } else {
      body.appendChild(el('p', 'share-row__meta', views(s)));
      if (opts.full && s.consent) { body.appendChild(el('p', 'share-row__meta', 'Permission confirmed ' + day(s.consent))); }
      var acts = el('p', 'share-row__acts');
      var copy = el('button', 'btn btn--ghost btn--small', 'Copy link');
      copy.type = 'button';
      copy.addEventListener('click', function () { copyLink(s.url, copy); });
      var open = el('a', 'btn btn--ghost btn--small', 'Open');
      open.href = s.url;
      open.target = '_blank';
      open.rel = 'noopener';
      var rm = el('button', 'btn btn--ghost btn--small', 'Remove');
      rm.type = 'button';
      acts.appendChild(copy);
      acts.appendChild(open);
      acts.appendChild(rm);
      body.appendChild(acts);
      var said = el('p', 'access-status');
      said.setAttribute('role', 'status');
      if (opts.full) {
        // admins: a reason, kept with the removal; the makers see only "Removed by the club"
        var form = el('form', 'share-row__why');
        form.hidden = true;
        form.noValidate = true;
        var label = el('label', null, 'Why is the club removing it?');
        var id = 'share-why-' + s.id;
        label.htmlFor = id;
        var input = el('input');
        input.type = 'text';
        input.id = id;
        input.maxLength = 300;
        input.autocomplete = 'off';
        var go = el('button', 'btn btn--accent btn--small', 'Remove the link');
        go.type = 'submit';
        var no = el('button', 'btn btn--ghost btn--small', 'Cancel');
        no.type = 'button';
        form.appendChild(label);
        form.appendChild(input);
        form.appendChild(go);
        form.appendChild(no);
        body.appendChild(form);
        rm.addEventListener('click', function () { form.hidden = false; rm.hidden = true; input.focus(); });
        no.addEventListener('click', function () { form.hidden = true; rm.hidden = false; said.textContent = ''; rm.focus(); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var why = input.value.trim();
          if (!why) { said.textContent = 'Say why the club is removing this share.'; input.focus(); return; }
          go.disabled = no.disabled = true;
          opts.remove(s, said, why).then(null, function () { go.disabled = no.disabled = false; });
        });
      } else {
        rm.addEventListener('click', function () {
          if (!window.confirm('Remove this shared chart? Its link stops working straight away, for everyone ' +
                              'it was sent to. This can’t be undone: sharing again makes a new link.')) { return; }
          rm.disabled = true;
          opts.remove(s, said, '').then(null, function () { rm.disabled = false; });
        });
      }
      body.appendChild(said);
    }
    li.appendChild(body);
    return li;
  }

  function list(out, shares, opts) {
    out.textContent = '';
    if (!shares.length) {
      out.appendChild(el('p', 'mem-help', opts.empty || 'Nothing shared yet.'));
      return;
    }
    var ul = el('ul', 'share-list');
    shares.forEach(function (s) { ul.appendChild(row(s, opts)); });
    out.appendChild(ul);
  }

  // POST /v1/shares/<id>/remove; resolves when the list has been drawn again, rejects if refused.
  function removeShare(s, said, why, again) {
    said.textContent = 'Removing…';
    return NCAN.send('/shares/' + encodeURIComponent(s.id) + '/remove', why ? { reason: why } : {})
      .then(function (r) {
        if (r.status === 200 || r.status === 410) { return again(); }
        said.textContent = (r.body && r.body.error) || 'Sorry, it could not be removed (' + r.status + ').';
        throw new Error('refused');
      }, function (e) {
        said.textContent = (e && e.message) || 'The club’s results service could not be reached.';
        throw e;
      });
  }

  /* Athlete page --------------------------------------------------------------- */

  function startAthlete() {
    var section = $('ath-shares');
    var slug = null;
    function load() {
      if (!slug) { return Promise.resolve(); }
      return NCAN.get('/athletes/' + encodeURIComponent(slug) + '/shares').then(function (r) {
        section.hidden = false;
        var live = (r.shares || []).filter(function (s) { return !s.removed; }).length;
        var limits = r.limits || {};
        var note = [];
        if (r.paused) { note.push('Sharing is paused by the club for now. Links already shared keep working.'); }
        if (limits.live && live >= limits.live) {
          note.push('This athlete has ' + live + ' shared charts, the most there can be: remove one to share another.');
        }
        $('ath-shares-note').textContent = note.join(' ');
        list($('ath-shares-out'), r.shares || [], {
          empty: 'Nothing shared yet. To share a chart, open it with the enlarge button and choose Share.',
          remove: function (s, said, why) { return removeShare(s, said, why, load); }
        });
      }, function () { section.hidden = true; });   // not theirs to share (or signed out): nothing shown
    }
    document.addEventListener('ncan:athlete', function (e) {
      slug = e.detail && e.detail.slug;
      load();
    });
    document.addEventListener('ncan:shared', function () { load(); });
    if (window.NCAN && NCAN.athlete) { slug = NCAN.athlete.slug; load(); }
  }

  /* /athletes/: Your shared charts --------------------------------------------- */

  function startMine() {
    var section = $('my-shares');
    function load() {
      return NCAN.get('/me/shares').then(function (r) {
        var shares = r.shares || [];
        section.hidden = !shares.length;
        list($('my-shares-out'), shares, {
          athlete: true,
          remove: function (s, said, why) { return removeShare(s, said, why, load); }
        });
      }, function () { section.hidden = true; });
    }
    NCAN.me().then(function (who) { if (who) { load(); } }, function () { /* the list stays hidden */ });
  }

  /* /admin/shared-charts/ (started by admin.js once it knows this is an admin) ------ */

  function startAdmin() {
    var section = $('shares-admin');
    if (!section) { return; }
    var data = { shares: [] };
    function draw() {
      var shown = pick(data.shares, $('shares-show').value, $('shares-find').value);
      $('shares-sum').textContent = plural(data.live || 0, 'live share', 'live shares') + ', ' +
        plural(data.made_this_week || 0, 'made', 'made') + ' in the last 7 days.' +
        (shown.length !== data.shares.length ? ' Showing ' + shown.length + ' of ' + data.shares.length + '.' : '');
      list($('shares-out'), shown, {
        full: true, athlete: true,
        empty: data.shares.length ? 'No shares match.' : 'Nobody has shared a chart yet.',
        remove: function (s, said, why) { return removeShare(s, said, why, load); }
      });
    }
    function drawPause() {
      var p = data.paused, b = $('shares-pause');
      b.textContent = p ? 'Start sharing again' : 'Pause sharing';
      b.setAttribute('aria-pressed', p ? 'true' : 'false');
      $('shares-paused').textContent = p
        ? 'Sharing is paused' + (p.by ? ' by ' + p.by : '') + (p.at ? ' since ' + day(p.at) + ' ' + p.at.slice(11, 16) : '') +
          '. Nobody can share a new chart; links already shared keep working.'
        : 'Sharing is on. Pausing stops new shares across the club; links already shared keep working.';
    }
    function load() {
      return NCAN.get('/admin/shares').then(function (r) {
        data = r;
        section.hidden = false;
        drawPause();
        draw();
      }, function (e) { $('shares-status').textContent = (e && e.message) || 'Sorry, the shares could not be loaded.'; });
    }
    $('shares-show').addEventListener('change', draw);
    $('shares-find').addEventListener('input', draw);
    $('shares-pause').addEventListener('click', function () {
      var b = $('shares-pause'), on = !data.paused;
      b.disabled = true;
      $('shares-status').textContent = on ? 'Pausing…' : 'Starting again…';
      NCAN.send('/admin/shares/pause', { paused: on }).then(function (r) {
        $('shares-status').textContent = r.status === 200 ? ''
          : (r.body && r.body.error) || 'Sorry, that didn’t work (' + r.status + ').';
        return load();
      }, function () { $('shares-status').textContent = 'The club’s results service could not be reached.'; })
        .then(function () { b.disabled = false; });
    });
    return load();
  }

  if ($('ath-shares')) { startAthlete(); }
  if ($('my-shares')) { startMine(); }
  helpers.startAdmin = startAdmin;
  return helpers;
}));
