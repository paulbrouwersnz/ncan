/* Page photos ----------------------------------------------------------------
   A photo behind a page's green heading band (.page-head--photo in
   styles.css), chosen from assets/data/page-photos.json. Loaded on every page
   from partials/head.html; see tools/README.md ("Header photos").

   The file holds pools of approved photos and which pages use them:

     "pools": {
       "sprints": ["https://photos.ncan.nz/.../a.webp", ...],
       "junior":  { "include": ["sprints", "jumps"], "photos": [...],
                    "exclude": ["https://photos.ncan.nz/.../b.webp"] }
     },
     "pages": {
       "/junior-athletics/":                  { "pool": "junior" },
       "/junior-athletics/#/plan/*":          { "pool": "junior" },
       "/junior-athletics/#/plan/2026-11-24": { "photos": [...], "focus": "50% 30%" }
     }

   A photo is an address, or { "src": jpg, "webp": webp, "tags": [...],
   "focus": "x% y%" }. A pool can include other pools; its photos are merged
   (each once), and "exclude" is applied last. "pick": "by-pool" picks a pool
   first, then a photo from it, so a small pool is not drowned out.

   Which entry wins for an address, first match used:
     1. the exact address with its #/... part ("#plan-2026-11-24", the
        planner's list link, counts as "#/plan/2026-11-24");
     2. a pattern ending in * ("#/plan/*"), the longest that matches;
     3. the page itself.
   An entry gives "pool", "photos", or "photo": "none" for the plain band.

   tools/make-head-photo.py writes each page's first photo into the page, so
   it shows with no flash, and marks a page data-page-photos when this script
   has more to do (a pool to pick from, or #/... entries). Unmarked pages are
   left as written and the file is never fetched for them.

   The helpers are pure, so the same file runs in Node for the tests in
   tests/js/page-photos.test.js. tools/page_photos.py resolves pools the same
   way, for the pre-rendered photo and the checks.
--------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  var DATA_URL = '/assets/data/page-photos.json';
  var MAX_DEPTH = 4;
  var STORE_KEY = 'ncan-page-photo:';
  // older link spellings that mean the same #/... address
  var ALIASES = [[/^#plan-(\d{4}-\d{2}-\d{2})$/, '#/plan/$1']];

  /* ------------------------------------------------------------ the data */

  function photoOf(p, pool) {
    if (typeof p === 'string') { return { src: p, webp: p, tags: [], focus: '', pool: pool }; }
    return {
      src: p.src,
      webp: p.webp || p.src,
      tags: p.tags || [],
      focus: p.focus || '',
      pool: pool
    };
  }

  function poolSpec(data, name) {
    var spec = (data.pools || {})[name];
    if (spec === undefined) { throw new Error('no pool "' + name + '"'); }
    return Array.isArray(spec) ? { photos: spec } : spec;
  }

  // [[photo, ...], ...]: one group per included pool (flattened) and one for
  // the pool's own photos, in the order written; each photo once, the first
  // time it appears, excluded photos dropped
  function poolGroups(data, name, depth, stack) {
    depth = depth || 1;
    stack = stack || [];
    if (stack.indexOf(name) >= 0) { throw new Error('pool "' + name + '" includes itself'); }
    if (depth > MAX_DEPTH) { throw new Error('pools nested more than ' + MAX_DEPTH + ' deep at "' + name + '"'); }
    var spec = poolSpec(data, name);
    var groups = [];
    (spec.include || []).forEach(function (child) {
      var flat = [];
      poolGroups(data, child, depth + 1, stack.concat(name)).forEach(function (g) { flat = flat.concat(g); });
      groups.push(flat);
    });
    groups.push((spec.photos || []).map(function (p) { return photoOf(p, name); }));
    var seen = {};
    var gone = {};
    (spec.exclude || []).forEach(function (src) { gone[src] = true; });
    return groups.map(function (g) {
      return g.filter(function (p) {
        if (seen[p.src] || gone[p.src]) { return false; }
        seen[p.src] = true;
        return true;
      });
    }).filter(function (g) { return g.length; });
  }

  function poolPhotos(data, name) {
    var all = [];
    poolGroups(data, name).forEach(function (g) { all = all.concat(g); });
    return all;
  }

  // the groups an entry picks from: [] for "photo": "none"
  function entryGroups(data, entry) {
    if (entry.photo === 'none') { return []; }
    if (entry.pool) {
      var groups = poolGroups(data, entry.pool);
      if (poolSpec(data, entry.pool).pick === 'by-pool') { return groups; }
      var all = [];
      groups.forEach(function (g) { all = all.concat(g); });
      return all.length ? [all] : [];
    }
    var own = (entry.photos || []).map(function (p) { return photoOf(p, ''); });
    return own.length ? [own] : [];
  }

  /* ------------------------------------------------------- which entry */

  function normalHash(hash) {
    hash = hash || '';
    for (var i = 0; i < ALIASES.length; i++) {
      if (ALIASES[i][0].test(hash)) { return hash.replace(ALIASES[i][0], ALIASES[i][1]); }
    }
    return hash;
  }

  function normalPath(path) {
    path = path || '/';
    path = path.replace(/index\.html$/, '');
    return path.charAt(path.length - 1) === '/' ? path : path + '/';
  }

  // { key, entry } for a page address and its #... part, or null. Only a
  // #/... part looks for an entry of its own; an in-page anchor (#contact)
  // is the page itself.
  function findEntry(data, path, hash) {
    var pages = data.pages || {};
    path = normalPath(path);
    hash = normalHash(hash);
    if (hash.indexOf('#/') === 0) {
      var exact = path + hash;
      if (pages[exact]) { return { key: exact, entry: pages[exact] }; }
      var best = null;
      Object.keys(pages).forEach(function (key) {
        if (key.charAt(key.length - 1) !== '*') { return; }
        var prefix = key.slice(0, -1);
        if (exact.indexOf(prefix) === 0 && (!best || key.length > best.length)) { best = key; }
      });
      if (best) { return { key: best, entry: pages[best] }; }
    }
    return pages[path] ? { key: path, entry: pages[path] } : null;
  }

  /* ---------------------------------------------------------- the pick */

  // one photo from the groups: a random group, then a random photo in it,
  // preferring photos carrying one of the tags, and not the one shown last
  // time when there is another
  function pick(groups, opts) {
    opts = opts || {};
    var random = opts.random || Math.random;
    if (!groups.length) { return null; }
    var tags = opts.tags || [];
    if (tags.length) {
      var tagged = groups.map(function (g) {
        return g.filter(function (p) { return p.tags.some(function (t) { return tags.indexOf(t) >= 0; }); });
      }).filter(function (g) { return g.length; });
      if (tagged.length) { groups = tagged; }
    }
    var group = groups[Math.floor(random() * groups.length)];
    var choices = group;
    if (opts.last && group.length > 1) {
      choices = group.filter(function (p) { return p.src !== opts.last; });
    }
    return choices[Math.floor(random() * choices.length)];
  }

  /* ---------------------------------------------------------- the page */

  function cssUrl(u) { return "url('" + String(u).replace(/'/g, '%27') + "')"; }

  function show(head, photo, focus) {
    if (!photo) {
      head.classList.remove('page-head--photo');
      ['--photo', '--photo-webp', '--photo-focus'].forEach(function (n) { head.style.removeProperty(n); });
      return;
    }
    head.classList.add('page-head--photo');
    head.style.setProperty('--photo', cssUrl(photo.src));
    head.style.setProperty('--photo-webp', cssUrl(photo.webp));
    focus = focus || photo.focus;
    if (focus) { head.style.setProperty('--photo-focus', focus); } else { head.style.removeProperty('--photo-focus'); }
  }

  function remember(key, src) {
    try {
      if (src === undefined) { return global.localStorage.getItem(STORE_KEY + key); }
      global.localStorage.setItem(STORE_KEY + key, src);
    } catch (e) { /* storage off: repeats are allowed */ }
    return null;
  }

  var dataPromise = null;
  var lastKey = null;
  var lastTags = '';

  function loadData() {
    if (!dataPromise) {
      dataPromise = global.fetch(DATA_URL).then(function (r) {
        if (!r.ok) { throw new Error('page photos: ' + r.status); }
        return r.json();
      });
    }
    return dataPromise;
  }

  // choose and show the photo for the current address. opts.tags prefers
  // photos with those tags (a training plan's events, say); opts.photo shows
  // that photo outright (a coach's choice saved with the plan).
  function apply(opts) {
    opts = opts || {};
    var doc = global.document;
    var head = doc.querySelector('.page-head');
    if (!head || !head.hasAttribute('data-page-photos')) { return Promise.resolve(null); }
    return loadData().then(function (data) {
      var found = findEntry(data, global.location.pathname, global.location.hash);
      var tagKey = (opts.tags || []).join(',');
      if (opts.photo) {
        show(head, photoOf(opts.photo, ''), opts.focus);
        lastKey = null;
        return opts.photo;
      }
      if (!found) { show(head, null); lastKey = null; return null; }
      // the same entry as last time: leave the photo alone
      if (found.key === lastKey && tagKey === lastTags) { return null; }
      lastKey = found.key;
      lastTags = tagKey;
      var groups = entryGroups(data, found.entry);
      var photo = pick(groups, { tags: opts.tags, last: remember(found.key) });
      show(head, photo, found.entry.focus);
      if (photo) { remember(found.key, photo.src); }
      return photo;
    }).catch(function () { return null; /* keep the photo the page was written with */ });
  }

  var api = {
    poolGroups: poolGroups,
    poolPhotos: poolPhotos,
    entryGroups: entryGroups,
    findEntry: findEntry,
    normalHash: normalHash,
    normalPath: normalPath,
    pick: pick,
    apply: apply
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  global.PagePhotos = api;
  // NCAN.pageHead.photo(opts): ncan-account.js sets window.NCAN on the pages
  // that sign in; this script is deferred, so it runs after that
  global.NCAN = global.NCAN || {};
  global.NCAN.pageHead = { photo: apply };

  function start() {
    apply();
    global.addEventListener('hashchange', function () { apply(); });
  }
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
