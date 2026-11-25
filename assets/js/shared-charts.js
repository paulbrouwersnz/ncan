/*
  shared-charts.js - the lists of charts shared publicly (step 4 of "Sharing
  athlete charts publicly"). A share is made from the enlarged chart on an
  athlete page (athlete.js); this file only lists and removes them.

  - Athlete page (#ath-shares): "Shared charts" for that athlete, for the people
    who may share for them (the athlete's contacts from GameDay, and admins):
    GET /v1/athletes/<address>/shares. Anyone else gets 403 and sees nothing.
    A new share made on the page appears at once (the 'ncan:shared' event).
    The athlete page shows only how many links there are, with Manage: making a
    link stays there, but its list and Remove live on Shared links.
  - /my/shares/ (#shares-page): Shared links, every share of the athletes this
    person manages and any they made (GET /v1/me/shares), grouped by athlete,
    newest first, with open, copy, download and remove. #/athlete/<address>
    shows one athlete.
  - /admin/shared/ (#shares-admin): every share in the club, for admins
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

  // what a card is: only a personal best is a "PB card" (a card from before the API
  // said what it was of is called one, as it was)
  var CARDS = { pb: 'PB card', newpb: 'PB card', sb: 'Season’s best card', result: 'Result card' };
  // "100m · Oct 2024 to Nov 2026 · By season"; a card: "100m · 21 Nov 2026 · PB card"
  // "2025/26": the season (1 April to 31 March) a day is in, as the API names it
  function seasonOf(d) {
    var m = /^(\d{4})-(\d{2})/.exec(d || '');
    if (!m) { return ''; }
    var y = Number(m[1]) - (m[2] < '04' ? 1 : 0);
    return y + '/' + String((y + 1) % 100).padStart(2, '0');
  }

  function what(s) {
    if (s.view === 'season-card') { return ['Season card', seasonOf(s.from) && seasonOf(s.from) + ' season'].filter(Boolean).join(' · '); }
    var out = [s.event || 'Chart'];
    if (s.from && s.to) {
      out.push(s.from === s.to ? day(s.from)
        : month(s.from) === month(s.to) ? month(s.from)
        : month(s.from) + ' to ' + month(s.to));
    }
    out.push(s.view === 'season-card' ? 'Season card' : s.view === 'pb-card' ? CARDS[s.kind] || 'PB card'
      : s.view === 'by-season' ? 'By season' : 'Timeline');
    return out.join(' · ');
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

  /* How much of the share limits is used (the API's usage: {today, per_day, live,
     live_max}): two badges, "Today 1 / 20" and "Live 15 / 100", a sentence for
     screen readers, and whether either limit is reached. null without usage. */
  function usage(u) {
    if (!u || !u.per_day || !u.live_max) { return null; }
    var today = { label: 'Today', used: u.today || 0, max: u.per_day }, live = { label: 'Live', used: u.live || 0, max: u.live_max };
    today.full = today.used >= today.max; live.full = live.used >= live.max;
    var said = 'You\u2019ve shared ' + today.used + ' of ' + today.max + ' today. This athlete has ' +
      live.used + ' of ' + live.max + ' live shares.';
    if (today.full) { said += ' You can share again tomorrow.'; }
    else if (live.full) { said += ' Remove one on your Shared links page to share another.'; }
    return { badges: [today, live], said: said, full: today.full || live.full };
  }

  /* Shared links page ------------------------------------------------------- */

  // the athlete a hash picks: "#/athlete/lily-smith" -> "lily-smith"
  function hashAthlete(hash) {
    var m = /^#\/athlete\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(hash || '');
    return m ? m[1].toLowerCase() : null;
  }
  function manageHref(address) {
    return '/my/shares/' + (address ? '#/athlete/' + address : '');
  }
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'This athlete'; }
  function links(n) { return n === 1 ? '1 public link' : (n || 'no') + ' public links'; }
  // the athlete page's one line: "Lily has 3 public links"
  function summary(name, n) { return firstName(name) + ' has ' + links(n); }

  /* The athletes on the page, each with their links, live ones first, newest
     first: own is who the person manages ({name, slug}, by name), shares is
     GET /v1/me/shares. An athlete with a link but not in own (a share this
     person made as an administrator) comes after. */
  function groups(own, shares) {
    var out = [], by = {};
    function add(name, address) {
      var key = address || name;
      if (!by[key]) { by[key] = { name: name, address: address || null, shares: [], live: 0 }; out.push(by[key]); }
      return by[key];
    }
    (own || []).forEach(function (a) { if (a && a.name) { add(a.name, a.slug); } });
    (shares || []).forEach(function (s) {
      if (!s) { return; }
      var g = by[s.address] || by[s.athlete] || add(s.athlete || 'Athlete', s.address);
      g.shares.push(s);
      if (!s.removed) { g.live++; }
    });
    out.forEach(function (g) {
      g.shares.sort(function (a, b) {
        if (!a.removed !== !b.removed) { return a.removed ? 1 : -1; }
        return String(b.at || '').localeCompare(String(a.at || ''));
      });
    });
    return out;
  }

  // "ncan-lily-smith-100m.png", for Download image
  function fileName(s) {
    var ext = /\.jpe?g(\?|$)/i.test(s.image || '') ? 'jpg' : 'png';
    var bits = ['ncan', s.address || s.athlete, s.event || (s.view === 'season-card' ? 'season-card' : 'chart')];
    return bits.filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + ext;
  }

  var helpers = { day: day, month: month, what: what, made: made, removed: removed, pick: pick, usage: usage,
    hashAthlete: hashAthlete, manageHref: manageHref, summary: summary, groups: groups, fileName: fileName };
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

  // the share's image saved as a file; where the browser can't fetch it, opened instead
  function download(s, button) {
    var was = button.textContent;
    button.disabled = true;
    button.textContent = 'Downloading…';
    var done = function () { button.disabled = false; button.textContent = was; };
    fetch(s.image).then(function (r) {
      if (!r.ok) { throw new Error(r.status); }
      return r.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName(s);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      done();
    }).then(null, function () { done(); window.open(s.image, '_blank', 'noopener'); });
  }

  /* One share in a list. opts: {full (admin), athlete (show its name), download, remove(s, row, why)} */
  function row(s, opts) {
    var li = el('li', 'share-row' + (s.removed ? ' share-row--gone' : ''));
    if (s.image && s.url) {
      var thumb = el('a', 'share-row__thumb');
      thumb.href = s.url;
      thumb.target = '_blank';
      thumb.rel = 'noopener';
      var img = el('img');
      img.src = s.image;
      img.alt = (/-card$/.test(s.view) ? 'The shared card: ' : 'The shared chart: ') + (s.title || what(s));
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
      acts.appendChild(open);
      acts.appendChild(copy);
      if (opts.download && s.image) {
        var dl = el('button', 'btn btn--ghost btn--small', 'Download image');
        dl.type = 'button';
        dl.addEventListener('click', function () { download(s, dl); });
        acts.appendChild(dl);
      }
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
          if (!window.confirm('Remove this public link to ' + (s.athlete ? s.athlete + '’s ' : 'this ') +
                              (/-card$/.test(s.view) ? 'card' : 'chart') + '? The link stops working straight away, for everyone ' +
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

  /* Athlete page: how many links, and Manage ---------------------------------- */

  function startAthlete() {
    var section = $('ath-shares');
    var who = null;
    function manage() {
      var href = manageHref(who && who.slug);
      document.querySelectorAll('[data-share-manage]').forEach(function (a) { a.href = href; });
    }
    function load() {
      if (!who || !who.slug) { return Promise.resolve(); }
      return NCAN.get('/athletes/' + encodeURIComponent(who.slug) + '/shares').then(function (r) {
        section.hidden = false;
        var live = (r.shares || []).filter(function (s) { return !s.removed; }).length;
        // the usage badges (athlete.js draws them, beside Share too)
        if (r.usage && window.NCAN && NCAN.athlete) {
          NCAN.athlete.share_usage = r.usage;
          document.dispatchEvent(new CustomEvent('ncan:share-usage', { detail: r.usage }));
        }
        var limits = r.limits || {};
        var note = [];
        if (r.paused) { note.push('Sharing is paused by the club for now. Links already shared keep working.'); }
        if (limits.live && live >= limits.live) {
          note.push('This athlete has ' + live + ' public links, the most there can be: remove one to share another.');
        }
        $('ath-shares-note').textContent = note.join(' ');
        $('ath-shares-count').textContent = summary(who.name, live);
      }, function () { section.hidden = true; });   // not theirs to share (or signed out): nothing shown
    }
    document.addEventListener('ncan:athlete', function (e) {
      who = e.detail || null;
      manage();
      load();
    });
    document.addEventListener('ncan:shared', function () { load(); });
    if (window.NCAN && NCAN.athlete) { who = NCAN.athlete; manage(); load(); }
  }

  /* /my/shares/: Shared links -------------------------------------------------- */

  function startPage() {
    var status = $('shares-page-status'), out = $('shares-page-out'), pickEl = $('shares-page-pick');
    var sel = $('shares-page-athlete');
    var own = [], shares = [];
    var failed = 'Sorry, your shared links couldn’t be loaded. Please try again later.';
    function draw() {
      var all = groups(own, shares);
      var want = hashAthlete(location.hash);
      if (want && !all.some(function (g) { return g.address === want; })) { want = null; }
      var picks = all.filter(function (g) { return g.address; });
      pickEl.hidden = picks.length < 2;
      sel.textContent = '';
      sel.appendChild(new Option('All athletes', ''));
      picks.forEach(function (g) { sel.appendChild(new Option(g.name, g.address)); });
      sel.value = want || '';
      out.textContent = '';
      var shown = want ? all.filter(function (g) { return g.address === want; }) : all;
      var any = shown.some(function (g) { return g.shares.length; });
      $('shares-page-empty').hidden = any || !!want;
      shown.forEach(function (g) {
        if (!g.shares.length && !want) { return; }   // athletes with no links show only when picked
        var box = el('section', 'shares-group');
        var h = el('h2', 'shares-group__name');
        if (g.address) {
          var a = el('a', null, g.name);
          a.href = '/athlete/#/' + g.address;
          h.appendChild(a);
        } else {
          h.textContent = g.name;
        }
        box.appendChild(h);
        box.appendChild(el('p', 'shares-group__count', summary(g.name, g.live)));
        var holder = el('div');
        box.appendChild(holder);
        list(holder, g.shares, {
          download: true,
          empty: 'To make one, open ' + firstName(g.name) + '’s page and choose Share on a chart, ' +
                 'or the share button beside a personal best or a season.',
          remove: function (s, said, why) { return removeShare(s, said, why, load); }
        });
        out.appendChild(box);
      });
    }
    function load() {
      return NCAN.get('/me/shares').then(function (r) {
        shares = (r && r.shares) || [];
        status.hidden = true;
        draw();
      }, function (e) {
        status.hidden = false;
        status.textContent = (e && e.status === 0 && e.message) || failed;
      });
    }
    sel.addEventListener('change', function () {
      var v = sel.value;
      history.replaceState(null, '', v ? '#/athlete/' + v : location.pathname);
      draw();
    });
    window.addEventListener('hashchange', draw);
    NCAN.me().then(function (who) {
      if (!who) {
        status.hidden = true;
        NCAN.signIn($('shares-page-signin'), null, null, 'Sign in to see your shared links');
        return;
      }
      own = Array.isArray(who.own) ? who.own : [];
      $('shares-page-body').hidden = false;
      return load();
    }, function (e) {
      status.textContent = (e && e.status === 0 && e.message) || failed;
    });
  }

  /* /admin/shared/ (started by admin.js once it knows this is an admin) ------ */

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
  if ($('shares-page')) { startPage(); }
  helpers.startAdmin = startAdmin;
  return helpers;
}));
