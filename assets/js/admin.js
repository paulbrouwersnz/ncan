/*
  admin.js - the club admin page (admin.html), for club administrators only.

  Everything comes from the club's API (see assets/js/ncan-account.js), which
  answers only an administrator; anyone else sees a sign-in box or a note.
    GET  /v1/admin/review              what the last collect found that needs a look,
                                       every correction, and the collect's state
    POST /v1/admin/corrections         same / not_same / opt_out / name_fixes / dismissed
    POST /v1/admin/corrections/undo
    GET/POST /v1/membership, POST /v1/membership/undo     membership changes
    GET /v1/access/blocks, POST /v1/access/block|unblock  site-wide blocks
    GET /v1/admin/members              every member, with all held about them but results
  No athlete data is in this file.
*/
(function () {
  'use strict';

  var $ = function (x) { return document.getElementById(x); };
  var members = [];        // names on the members list, for suggestions

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null) { e.textContent = words; }
    return e;
  }
  function button(words, onClick, cls) {
    var b = el('button', cls || 'btn btn--ghost btn--sm', words);
    b.type = 'button';
    b.addEventListener('click', function () { onClick(b); });
    return b;
  }
  function pageLink(id, words) {
    var a = el('a', null, words || 'number ' + id);
    a.href = 'athlete.html?id=' + id;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }
  function failed(where) {
    return function (r) { $(where).textContent = (r.body && r.body.error) || 'Sorry, that didn’t work.'; };
  }

  /* Suggestions under a name box -------------------------------------------
     Our own list, placed under the box (the browser's built-in one can pop up
     anywhere). Arrow keys move, Enter picks, Escape closes. */
  function suggest(input, list, onPick) {
    var picks = [], at = -1;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); at = -1; }
    function show() {
      var q = input.value.trim().toLowerCase();
      list.textContent = '';
      picks = !q ? [] : members.filter(function (n) {
        return n.toLowerCase().split(/\s+/).some(function (w) { return w.indexOf(q) === 0; }) ||
               n.toLowerCase().indexOf(q) === 0;
      }).slice(0, 8);
      if (!picks.length || (picks.length === 1 && picks[0].toLowerCase() === q)) { close(); return; }
      picks.forEach(function (n, i) {
        var o = el('span', 'suggest__item', n);
        o.setAttribute('role', 'option');
        o.id = list.id + '-' + i;
        o.addEventListener('mousedown', function (e) { e.preventDefault(); pick(i); });
        list.appendChild(o);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function mark() {
      Array.prototype.forEach.call(list.children, function (o, i) { o.classList.toggle('is-active', i === at); });
      if (at >= 0) { input.setAttribute('aria-activedescendant', list.id + '-' + at); }
    }
    function pick(i) {
      input.value = picks[i];
      close();
      input.dispatchEvent(new Event('change'));
      if (onPick) { onPick(picks[i]); }
    }
    input.addEventListener('input', show);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', function (e) {
      if (list.hidden) { return; }
      if (e.key === 'ArrowDown') { at = Math.min(at + 1, picks.length - 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { at = Math.max(at - 1, 0); mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && at >= 0) { pick(at); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
  }
  var boxes = 0;
  function nameBox(label, placeholder) {
    var p = el('p', 'records-field records-field--grow suggest');
    var id = 'nb-' + (++boxes);
    var l = el('label', null, label);
    l.htmlFor = id;
    var input = el('input');
    input.type = 'text'; input.id = id; input.placeholder = placeholder || 'start typing a name';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    var list = el('span', 'suggest__list');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.setAttribute('aria-controls', list.id);
    p.appendChild(l); p.appendChild(input); p.appendChild(list);
    suggest(input, list);
    return { field: p, input: input };
  }
  function field(label, type, attrs) {
    var p = el('p', 'records-field' + (type === 'text' ? ' records-field--grow' : ''));
    var id = 'f-' + (++boxes);
    var l = el('label', null, label);
    l.htmlFor = id;
    var input = el(type === 'select' ? 'select' : 'input');
    if (type !== 'select') { input.type = type; }
    input.id = id;
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'options') {
        attrs.options.forEach(function (o) { var x = el('option', null, o); x.value = o; input.appendChild(x); });
      } else { input[k] = attrs[k]; }
    });
    p.appendChild(l); p.appendChild(input);
    return { field: p, input: input };
  }

  /* The collect -------------------------------------------------------------- */
  function collectWords(c) {
    if (!c || !c.state) { return ''; }
    var at = function (t) { return t ? t.slice(0, 10) + ' at ' + t.slice(11, 16) : ''; };
    if (c.state === 'running') {
      return 'Collecting results now (started ' + (c.started || '').slice(11, 16) +
        '). This page updates when it’s done.';
    }
    if (c.state === 'done') { return 'Results last collected ' + at(c.finished) + '. ' + (c.message || ''); }
    return 'The last collect, ' + at(c.finished || c.started) + ', didn’t finish: ' + (c.message || '');
  }
  var watching = false;
  function watch(c) {
    $('collect-status').textContent = collectWords(c);
    // while a collect runs, or a change is waiting for one, look again shortly
    var waiting = (appliedKeys(c).keys || []).length;
    if (((c && c.state === 'running') || waiting) && !watching) {
      watching = true;
      setTimeout(function () { watching = false; loadAll(); }, 15000);
    }
  }

  // every change goes through here: say what happened, and show the new state.
  // item: the "needs a look" entry it settles, which fades out of its group.
  function change(path, body, where, done, item) {
    $(where).textContent = 'Saving…';
    var li = item && entryOf(item);
    if (li) { saving(li, true); }
    return NCAN.send(path, body).then(function (r) {
      if (r.status === 200 || r.status === 201) {
        $(where).textContent = typeof done === 'function' ? done(r.body) : done;
        // a dismissal is hidden by the server at once; anything else waits for its collect
        if (item) { settled(item, !!(r.body && r.body.collect)); return; }
      } else { failed(where)(r); }
      if (li) { saving(li, false); }
      loadAll();
    }, function (err) { $(where).textContent = err.message; if (li) { saving(li, false); } });
  }

  function entryOf(item) {
    return document.querySelector('.review-item[data-key="' + CSS.escape(item.key) + '"]');
  }
  // an entry whose change is on its way to the server: covered, with a spinner,
  // its buttons off, until the server answers (then it fades out)
  function saving(li, on) {
    li.classList.toggle('is-saving', on);
    li.setAttribute('aria-busy', on ? 'true' : 'false');
    Array.prototype.forEach.call(li.querySelectorAll('button, input, select'), function (b) { b.disabled = on; });
    var cover = li.querySelector('.review-item__cover');
    if (on && !cover) {
      cover = el('div', 'review-item__cover');
      cover.appendChild(el('span', 'review-pending__spin'));
      cover.appendChild(el('span', null, 'Saving…'));
      li.appendChild(cover);
    }
    if (!on && cover) { cover.remove(); }
  }

  // "Applying 2 changes: results are being collected now ..." until that collect is done
  function showPending(c) {
    var n = (appliedKeys(c).keys || []).length;
    var box = $('review-pending');
    box.hidden = !n;
    if (!n) { return; }
    box.textContent = '';
    box.appendChild(el('span', 'review-pending__spin'));
    box.appendChild(document.createTextNode('Applying ' + n + ' change' + (n === 1 ? '' : 's') + ': ' +
      (c && c.state === 'running' ? 'results are being collected now (started ' + (c.started || '').slice(11, 16) + ').'
                                  : 'results are about to be collected.') +
      ' This list updates when that finishes, in a few minutes.'));
  }

  /* Entries an admin has acted on. A fix takes effect at the collect it starts,
     so until that collect finishes the server still lists the entry: the page
     remembers it (on this device, through a reload) and leaves it out. */
  var APPLIED = 'ncan-admin-applied';
  function appliedKeys(collectState) {
    var kept = {};
    try { kept = JSON.parse(sessionStorage.getItem(APPLIED) || '{}'); } catch (e) { kept = {}; }
    // once a collect has finished since, the server's list is up to date again
    if (collectState && collectState.state !== 'running' && collectState.finished &&
        kept.since && collectState.finished > kept.since) { kept = {}; }
    return kept;
  }
  var lastCollect = null;
  // "2026-11-15 14:53:07", in this device's time, as the server writes a collect's times
  function localNow() {
    var d = new Date(), two = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
           two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }
  function settled(item, collecting) {
    if (collecting) {
      var kept = appliedKeys(lastCollect);
      kept.keys = kept.keys || [];
      kept.keys.push(item.key);
      kept.since = kept.since || localNow();
      try { sessionStorage.setItem(APPLIED, JSON.stringify(kept)); } catch (e) { /* this visit only */ }
      showPending(lastCollect);
    }
    var li = entryOf(item);
    if (!li) { loadAll(); return; }
    var group = li.closest('.review-group');
    li.style.height = li.offsetHeight + 'px';
    li.offsetHeight;                                   // start the fade from its full height
    li.classList.add('is-settled');
    setTimeout(function () {
      li.remove();
      var left = group.querySelectorAll('.review-item').length;
      group.querySelector('.review-group__count').textContent = String(left);
      if (!left) {
        group.remove();
        if (!document.querySelector('#review-out .review-group')) {
          $('review-out').insertBefore(el('p', 'mem-help', 'Nothing needs a look.'), $('review-out').firstChild);
        }
      }
      loadAll();
    }, 450);
  }
  var COLLECTING = ' Results are being collected again.';

  /* Needs a look ------------------------------------------------------------ */
  var openGroups = {};     // which "needs a look" groups the admin has opened
  var KINDS = {
    champs: 'Club championships to confirm again',
    not_member: 'Entered for the club, not a member',
    unmatched: 'Club results that couldn’t be matched',
    no_membership: 'Kept without a membership',
    pair: 'Two numbers, one athlete?'
  };

  // the results an item is about, newest first, each mark linking to the official result
  function resultsList(sample, heading) {
    var box = el('div', 'review-results');
    if (heading) { box.appendChild(el('p', 'review-results__head', heading)); }
    if (!sample || !sample.length) { box.appendChild(el('p', 'mem-help', 'No results kept.')); return box; }
    var ul = el('ul');
    sample.forEach(function (r) {
      var li = el('li');
      var p = r.date.split('-');
      li.appendChild(el('span', 'review-results__date', p[2] + '/' + p[1] + '/' + p[0]));
      li.appendChild(el('span', null, r.event + ' '));
      var a = el('a', 'records-source', r.mark || 'result');
      a.href = r.source; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Official result';
      li.appendChild(a);
      var bits = [];
      if (r.place) { bits.push(r.place + (r.of ? ' of ' + r.of : '')); }
      if (r.grade) { bits.push(typeof r.grade === 'number' ? 'grade ' + r.grade : r.grade); }
      bits.push(r.meeting);
      if (r.team) { bits.push(r.team); }
      li.appendChild(el('span', 'review-results__more', ' · ' + bits.join(' · ')));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function dismissButton(item) {
    return button('Dismiss', function () {
      var why = prompt('Dismiss this? It stays hidden unless it changes. Why (optional)?', 'fine as it is');
      if (why === null) { return; }
      change('/admin/corrections', { kind: 'dismissed', key: item.key, text: item.text, why: why },
             'review-said', 'Dismissed.', item);
    });
  }

  function membershipForm(item, member) {
    var form = el('form', 'mem-add review-form');
    var season = field('Season', 'select', { options: item.seasons || [] });
    season.input.value = (item.seasons || []).slice(-1)[0] || '';
    form.appendChild(season.field);
    var born = null;
    if (member && item.kind === 'not_member') {
      born = field('Birth year', 'number', { min: 1900, max: 2100, placeholder: 'e.g. 2014' });
      if (item.born && item.born.length) { born.input.value = item.born[item.born.length - 1]; }
      form.appendChild(born.field);
    }
    var why = field('Why', 'text', { maxLength: 200, placeholder: member ? 'e.g. paid in cash' : 'e.g. not a member' });
    form.appendChild(why.field);
    var go = el('button', 'btn btn--accent btn--sm', member ? 'Add as a member' : 'Not a member that season');
    go.type = 'submit';
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = { name: item.name, season: season.input.value, member: member, why: why.input.value };
      if (born) { body.born = born.input.value; }
      change('/membership', body, 'review-said', item.name + (member ? ' is a member for ' : ' isn’t a member for ') +
             season.input.value + '.' + COLLECTING, item);
    });
    return form;
  }

  function nameFixForm(item) {
    var form = el('form', 'mem-add review-form');
    var to = nameBox('On the members list as', 'their name on the members list');
    form.appendChild(to.field);
    var go = el('button', 'btn btn--accent btn--sm', 'Use that name');
    go.type = 'submit';
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = to.input.value.trim();
      if (!name) { $('review-said').textContent = 'Give their name on the members list.'; return; }
      change('/admin/corrections', { kind: 'name_fixes', from: item.name, to: name, why: 'on the members list as ' + name },
             'review-said', '“' + item.name + '” is now read as ' + name + '.' + COLLECTING, item);
    });
    return form;
  }

  function renderReview(data) {
    var out = $('review-out');
    out.textContent = '';
    lastCollect = data.collect;
    showPending(data.collect);
    var done = appliedKeys(data.collect).keys || [];
    var items = (data.items || []).filter(function (i) { return done.indexOf(i.key) === -1; });
    if (!items.length) {
      out.appendChild(el('p', 'mem-help', data.updated ? 'Nothing needs a look. ' : 'Nothing yet: the next collect fills this in. '));
    }
    Object.keys(KINDS).forEach(function (kind) {
      var mine = items.filter(function (i) { return i.kind === kind; });
      if (!mine.length) { return; }
      // each kind folded away until opened; one that's open stays open after a change
      var group = el('details', 'review-group');
      group.dataset.kind = kind;
      group.open = !!openGroups[kind];
      group.addEventListener('toggle', function () { openGroups[kind] = group.open; });
      var sum = el('summary', 'review-group__head');
      sum.appendChild(el('span', null, KINDS[kind]));
      sum.appendChild(el('span', 'review-group__count', String(mine.length)));
      group.appendChild(sum);
      var ul = el('ul', 'review-list');
      mine.forEach(function (item) {
        var li = el('li', 'review-item');
        li.dataset.key = item.key;
        li.appendChild(el('p', 'review-item__text', item.text));
        var acts = el('div', 'review-item__acts');
        if (kind === 'pair') {
          acts.appendChild(pageLink(item.ids[0], 'First page'));
          acts.appendChild(pageLink(item.ids[1], 'Second page'));
          acts.appendChild(button('The same athlete', function () {
            change('/admin/corrections', { kind: 'same', ids: item.ids, why: 'checked' }, 'review-said',
                   'Joined into one page.' + COLLECTING, item);
          }, 'btn btn--accent btn--sm'));
          acts.appendChild(button('Two athletes', function () {
            change('/admin/corrections', { kind: 'not_same', ids: item.ids, why: 'checked' }, 'review-said',
                   'Kept apart.' + COLLECTING, item);
          }));
        }
        if (kind === 'no_membership') {
          acts.appendChild(pageLink(item.id, 'Their page'));
        }
        if (kind === 'champs') {
          var go = el('a', 'btn btn--accent btn--sm', 'Review ' + item.date);
          go.href = 'club-champs.html?season=' + encodeURIComponent(item.season) + '#champs-review';
          acts.appendChild(go);
        }
        if (kind === 'not_member') {
          // they already have no page and their results count for nothing: this
          // records that they aren't a member, and takes the item off the list
          acts.appendChild(button('Not a member', function (b) {
            b.disabled = true;
            change('/admin/corrections', { kind: 'dismissed', key: item.key, text: item.text, why: 'not a club member' },
                   'review-said', item.name + ': not a member. They have no page, and their results stay left out.', item);
          }, 'btn btn--accent btn--sm'));
        } else {
          acts.appendChild(dismissButton(item));
        }
        if (kind === 'champs') {
          var ch = el('ul', 'upload-list');
          (item.changes || []).forEach(function (t) { ch.appendChild(el('li', null, t)); });
          li.appendChild(ch);
        } else if (kind === 'pair') {
          li.appendChild(resultsList((item.samples || [])[0], 'Under the first number'));
          li.appendChild(resultsList((item.samples || [])[1], 'Under the second number'));
        } else {
          li.appendChild(resultsList(item.sample, item.results > (item.sample || []).length
            ? 'Their latest ' + item.sample.length + ' of ' + item.results + ' results' : 'Their results'));
        }
        li.appendChild(acts);
        if (kind === 'not_member') {
          li.appendChild(el('p', 'mem-help', 'Not a member: nothing to delete, as they already have no page and ' +
                                             'their results are left out. A member paid some other way? Add them for ' +
                                             'the season. Or, if they’re on the list under another name, give it.'));
          li.appendChild(membershipForm(item, true));
          li.appendChild(nameFixForm(item));
        } else if (kind === 'unmatched') {
          li.appendChild(nameFixForm(item));
        } else if (kind === 'no_membership') {
          li.appendChild(el('p', 'mem-help', 'Leave as it is (dismiss), record them as a member that season, ' +
                                             'or say they weren’t, which leaves those results out.'));
          li.appendChild(membershipForm(item, true));
          li.appendChild(membershipForm(item, false));
        }
        ul.appendChild(li);
      });
      group.appendChild(ul);
      out.appendChild(group);
    });
    if (data.dismissed) {
      out.appendChild(el('p', 'records-note', data.dismissed + ' dismissed (listed under Corrections).'));
    }
    if (data.updated) { out.appendChild(el('p', 'records-note', 'From the collect of ' + data.updated + '.')); }
  }

  /* Merges ---------------------------------------------------------------------
     Every page made from more than one athletic.net number, from the last collect. */
  var WHY = { grades: 'grades matched', members: 'one member of that name', same: 'joined by a person' };
  var merges = [];

  function pageNumber(text) {
    var m = /(?:id=)?(\d{5,12})\b/.exec(text || '');
    return m ? +m[1] : null;
  }

  function renderMerges() {
    var out = $('merge-out');
    out.textContent = '';
    var q = $('merge-find').value.trim().toLowerCase();
    var why = $('merge-why').value;
    var shown = merges.filter(function (g) {
      if (why && !g.links.some(function (l) { return l.why === why; })) { return false; }
      if (!q) { return true; }
      return g.ids.some(function (x) { return x.name.toLowerCase().indexOf(q) !== -1 || String(x.id) === q; }) ||
             String(g.kept) === q;
    });
    $('merge-count').textContent = merges.length
      ? merges.length + ' athlete' + (merges.length === 1 ? ' has' : 's have') + ' more than one athletic.net number.'
      : 'No athlete has more than one athletic.net number.';
    $('merge-match').textContent = (q || why) ? shown.length + ' of ' + merges.length + ' athletes match.' : '';
    // the search and the list are hidden until the Show button asks for them; then every page, no limit
    $('merge-list').hidden = !mergesShown;
    $('merge-show').hidden = !merges.length;
    $('merge-show').textContent = mergesShown ? 'Hide the athletes' : 'Show the athletes';
    $('merge-show').setAttribute('aria-expanded', mergesShown ? 'true' : 'false');
    if (!mergesShown) { return; }
    var ul = el('ul', 'review-list');
    shown.forEach(function (g) {
      var li = el('li', 'review-item');
      var head = el('p', 'review-item__text');
      var kept = g.ids.filter(function (x) { return x.id === g.kept; })[0] || g.ids[0];
      head.appendChild(pageLink(g.kept, kept.name));
      head.appendChild(el('span', 'access-how', ' · ' + g.ids.length + ' numbers · ' +
        Array.from(new Set(g.links.map(function (l) { return WHY[l.why] || l.why; }))).join(', ')));
      li.appendChild(head);
      g.ids.forEach(function (x) {
        var box = resultsList(x.sample, 'Number ' + x.id + (x.id === g.kept ? ' (the page’s own)' : '') +
          ' · ' + x.results + ' result' + (x.results === 1 ? '' : 's') + (x.name !== kept.name ? ' as “' + x.name + '”' : ''));
        box.appendChild(button('Not the same athlete: take it out', function (b) {
          if (!confirm('Take number ' + x.id + ' out of ' + kept.name + '’s page? Its results get a page of ' +
                       'their own at the next collect (if they count for the club), and it won’t be joined again.')) { return; }
          b.disabled = true;
          change('/admin/merges/split', { id: x.id, others: g.ids.map(function (y) { return y.id; }) }, 'merge-status',
                 'Number ' + x.id + ' is kept apart.' + COLLECTING);
        }));
        li.appendChild(box);
      });
      ul.appendChild(li);
    });
    out.appendChild(ul);
  }
  var mergesShown = false;    // the Show button's state; the list starts hidden

  function setUpCorrections() {
    $('corr-show').addEventListener('click', function () {
      corrShown = !corrShown;
      renderCorrections(corrLast);
    });
  }

  function setUpMerges() {
    $('merge-show').addEventListener('click', function () {
      mergesShown = !mergesShown;
      renderMerges();
    });
    ['merge-find', 'merge-why'].forEach(function (x) {
      $(x).addEventListener('input', renderMerges);
      $(x).addEventListener('change', renderMerges);
    });
    $('link-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = pageNumber($('link-a').value), b = pageNumber($('link-b').value);
      if (!a || !b || a === b) { $('merge-status').textContent = 'Give two different athlete pages (address or number).'; return; }
      if (!confirm('Join pages ' + a + ' and ' + b + ' into one? The most recently used number keeps the page.')) { return; }
      change('/admin/corrections', { kind: 'same', ids: [a, b], why: 'joined on the admin page' }, 'merge-status', function () {
        $('link-a').value = ''; $('link-b').value = '';
        return 'Joined.' + COLLECTING;
      });
    });
  }

  /* Corrections -------------------------------------------------------------- */
  var CORR = [
    ['opt_out', 'Athletes removed', function (e) { return [pageLink(e.id, 'Athlete ' + e.id)]; }],
    ['same', 'Joined into one athlete', function (e) { return [pageLink(e.ids[0]), el('span', null, ' and '), pageLink(e.ids[1])]; }],
    ['not_same', 'Kept apart', function (e) { return [pageLink(e.ids[0]), el('span', null, ' and '), pageLink(e.ids[1])]; }],
    ['names', 'Names corrected', function (e) { return [pageLink(e.id, e.name)]; }],
    ['name_fixes', 'Names a meeting spells differently', function (e) { return [el('span', null, '“' + e.from + '” is ' + e.to)]; }],
    ['dismissed', 'Dismissed', function (e) { return [el('span', null, e.text || e.key)]; }]
  ];

  var corrShown = false;      // the Show button's state; the list starts hidden
  var corrLast = null;        // the corrections last loaded, to draw again on Show

  function renderCorrections(all) {
    corrLast = all;
    var out = $('corr-out');
    out.textContent = '';
    var total = CORR.reduce(function (n, c) { return n + ((all || {})[c[0]] || []).length; }, 0);
    $('corr-count').textContent = total
      ? total + ' correction' + (total === 1 ? '' : 's') + ' and dismissed item' + (total === 1 ? '' : 's') + ' in all.'
      : 'No corrections made on the website yet.';
    $('corr-show').hidden = !total;
    $('corr-show').textContent = corrShown ? 'Hide the corrections' : 'Show the corrections';
    $('corr-show').setAttribute('aria-expanded', corrShown ? 'true' : 'false');
    out.hidden = !corrShown || !total;
    if (out.hidden) { return; }
    var any = false;
    CORR.forEach(function (c) {
      var list = (all || {})[c[0]] || [];
      if (!list.length) { return; }
      any = true;
      out.appendChild(el('h3', 'access-sub', c[1]));
      var ul = el('ul', 'access-list');
      list.slice().reverse().forEach(function (e) {
        var li = el('li');
        var what = el('strong');
        c[2](e).forEach(function (n) { what.appendChild(n); });
        li.appendChild(what);
        li.appendChild(el('span', 'access-how', (e.why ? e.why + ' ' : '') + '(' + e.by + ', ' + e.at + ')'));
        li.appendChild(button(c[0] === 'dismissed' ? 'Show again' : 'Undo', function (b) {
          b.disabled = true;
          change('/admin/corrections/undo', { kind: c[0], number: e.number }, 'corr-status',
                 c[0] === 'dismissed' ? 'It’s back on the list.' : 'Undone.' + COLLECTING);
        }));
        ul.appendChild(li);
      });
      out.appendChild(ul);
    });
    if (!any) { out.appendChild(el('p', 'mem-help', 'No corrections made on the website yet.')); }
  }

  /* Membership changes ------------------------------------------------------- */
  function renderOverrides(list) {
    var out = $('mem-out');
    out.textContent = '';
    if (!list.length) {
      out.appendChild(el('p', 'mem-help', 'No changes yet: the members list is used as it is.'));
      return;
    }
    var ul = el('ul', 'access-list');
    list.slice().reverse().forEach(function (o) {
      var li = el('li');
      li.appendChild(el('strong', null, o.name + (o.born ? ' (born ' + o.born + ')' : '')));
      li.appendChild(el('span', null, o.words));
      li.appendChild(el('span', 'access-how', o.why + ' (' + o.by + ', ' + o.at + ')'));
      li.appendChild(button('Undo', function (b) {
        if (!confirm('Undo “' + o.name + ': ' + o.words + '”?')) { return; }
        b.disabled = true;
        change('/membership/undo', { number: o.number }, 'mem-status', 'Undone.' + COLLECTING);
      }));
      ul.appendChild(li);
    });
    out.appendChild(ul);
  }

  function onList(name) {
    var key = name.trim().toLowerCase().replace(/\s+/g, ' ');
    return members.some(function (n) { return n.toLowerCase() === key; });
  }
  var HELP = {
    left: 'Results from this date to the end of its season (31 March) don’t count for the club.',
    joined: 'Results in that season before this date don’t count for the club.',
    member: 'Their results that season count, e.g. paid in cash or a fee waived. Someone not on the ' +
            'members list needs their birth year.',
    not: 'None of their results that season count, e.g. a payment that shouldn’t have counted.'
  };
  function memFields() {
    var kind = $('mem-kind').value;
    var dated = kind === 'left' || kind === 'joined';
    $('mem-day-field').hidden = !dated;
    $('mem-season-field').hidden = dated;
    var name = $('mem-name').value.trim();
    $('mem-born-field').hidden = !(kind === 'member' && name && !onList(name));
    $('mem-help').textContent = HELP[kind];
  }
  function setUpMembership() {
    suggest($('mem-name'), $('mem-name-list'));
    ['mem-kind', 'mem-name'].forEach(function (x) {
      $(x).addEventListener('input', memFields);
      $(x).addEventListener('change', memFields);
    });
    memFields();
    $('mem-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var kind = $('mem-kind').value;
      var body = { name: $('mem-name').value.trim(), why: $('mem-why').value.trim() };
      if (!body.name) { $('mem-status').textContent = 'Choose the member first.'; return; }
      if (kind === 'left' || kind === 'joined') {
        if (!$('mem-day').value) { $('mem-status').textContent = 'Give the date.'; return; }
        body[kind] = $('mem-day').value;
      } else {
        body.season = $('mem-season').value.trim();
        body.member = kind === 'member';
        if (!$('mem-born-field').hidden && $('mem-born').value) { body.born = $('mem-born').value; }
      }
      change('/membership', body, 'mem-status', function (r) {
        ['mem-name', 'mem-day', 'mem-season', 'mem-born', 'mem-why'].forEach(function (x) { $(x).value = ''; });
        memFields();
        return 'Saved: ' + r.override.name + '.' + COLLECTING;
      });
    });
  }

  /* Members list from GameDay -------------------------------------------------
     Two steps. Check: both files go to the server, which reads them and changes
     nothing; the report says what's in them, how the list would change, and
     what looks wrong. Import: only from a checked upload, and with warnings
     only once someone ticks that they've checked them. */
  function listOf(names, max) {
    max = max || 40;
    return names.slice(0, max).join(', ') + (names.length > max ? ' and ' + (names.length - max) + ' more' : '');
  }

  function renderUpload(rep) {
    var out = $('upload-report');
    out.textContent = '';
    if (rep.problems && rep.problems.length) {
      out.appendChild(el('h3', 'access-sub upload-bad', 'These files can’t be imported'));
      var pl = el('ul', 'upload-list upload-list--bad');
      rep.problems.forEach(function (p) { pl.appendChild(el('li', null, p)); });
      out.appendChild(pl);
      return;
    }
    var f = rep.files, m = rep.members, c = rep.comparison;
    out.appendChild(el('h3', 'access-sub', 'What’s in the files'));
    var facts = el('ul', 'upload-list');
    [f.member_rows + ' people in the member report; ' + f.transaction_rows + ' transactions, ' +
       (f.first_order ? 'ordered ' + f.first_order + ' to ' + f.last_order : 'with no order dates') + '.',
     'Paid memberships by season: ' + (Object.keys(f.paid_by_season).map(function (s) {
       return s + ' (' + f.paid_by_season[s] + ')'; }).join(', ') || 'none') + '.',
     m.count + ' members would be listed (' + m.with_birth_date + ' with a date of birth, ' + m.with_gender +
       ' with a gender); ' + m.never_paid + ' in the member report never had a paid membership and are left off.',
     m.emails + ' contact emails would be able to sign in to see their member’s page (replacing the last import’s).'
    ].forEach(function (t) { facts.appendChild(el('li', null, t)); });
    out.appendChild(facts);

    out.appendChild(el('h3', 'access-sub', 'Compared with the list in use (' + c.in_use + ' members)'));
    var diff = el('ul', 'upload-list');
    diff.appendChild(el('li', null, 'New (' + c.added.length + '): ' + (listOf(c.added) || 'nobody')));
    diff.appendChild(el('li', null, 'No longer listed, so losing their page (' + c.gone.length + '): ' +
                                    (listOf(c.gone) || 'nobody')));
    var gained = c.changed.filter(function (x) { return x.added.length; });
    var lost = c.changed.filter(function (x) { return x.removed.length; });
    diff.appendChild(el('li', null, 'Gaining seasons (' + gained.length + '): ' + (listOf(gained.map(function (x) {
      return x.name + ' +' + x.added.join(', '); })) || 'nobody')));
    diff.appendChild(el('li', null, 'Losing seasons (' + lost.length + '): ' + (listOf(lost.map(function (x) {
      return x.name + ' −' + x.removed.join(', '); })) || 'nobody')));
    out.appendChild(diff);

    var form = el('form', 'upload-go');
    var tick = null;
    if (rep.warnings.length) {
      out.appendChild(el('h3', 'access-sub upload-bad', 'Check these first'));
      var wl = el('ul', 'upload-list upload-list--warn');
      rep.warnings.forEach(function (w) { wl.appendChild(el('li', null, w)); });
      out.appendChild(wl);
      var p = el('p', 'records-field ath-check');
      tick = el('input');
      tick.type = 'checkbox';
      tick.id = 'upload-checked';
      var lab = el('label', null, 'I’ve checked the warnings: import anyway');
      lab.htmlFor = 'upload-checked';
      p.appendChild(tick); p.appendChild(lab);
      form.appendChild(p);
    } else {
      out.appendChild(el('p', 'mem-help', 'Nothing looks wrong.'));
    }
    var go = el('button', 'btn btn--accent', 'Import: replace the members list');
    go.type = 'submit';
    form.appendChild(go);
    form.appendChild(button('Cancel', function () {
      NCAN.send('/admin/members/discard', { token: rep.token });
      out.textContent = '';
      $('upload-status').textContent = 'Cancelled: the uploaded files were deleted, and nothing changed.';
    }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (tick && !tick.checked) { $('upload-status').textContent = 'Tick that you’ve checked the warnings first.'; return; }
      go.disabled = true;
      $('upload-status').textContent = 'Importing…';
      NCAN.send('/admin/members/import', { token: rep.token, checked: !!(tick && tick.checked) }).then(function (r) {
        if (r.status !== 200) { failed('upload-status')(r); go.disabled = false; return; }
        out.textContent = '';
        $('upload-form').reset();
        $('upload-status').textContent = 'Imported: ' + r.body.members + ' members and ' + r.body.emails +
          ' contact emails. The uploaded files were deleted. Results are being collected again: athlete pages ' +
          'update when that finishes (a few minutes). If that changes a confirmed club championships Saturday, ' +
          'it appears under Needs a look, to review and confirm again. Delete your downloaded copies.';
        loadAll();
      }, function (err) { $('upload-status').textContent = err.message; go.disabled = false; });
    });
    out.appendChild(form);
  }

  function readFile(input) {
    var file = input.files && input.files[0];
    if (!file) { return Promise.resolve(null); }
    if (file.size > 15 * 1024 * 1024) { return Promise.reject(new Error(file.name + ' is too big.')); }
    return file.text();
  }

  function setUpUpload() {
    $('upload-form').addEventListener('submit', function (e) {
      e.preventDefault();
      $('upload-report').textContent = '';
      Promise.all([readFile($('upload-members')), readFile($('upload-tx'))]).then(function (texts) {
        if (!texts[0] || !texts[1]) { $('upload-status').textContent = 'Choose both files first.'; return; }
        $('upload-status').textContent = 'Checking…';
        $('upload-check').disabled = true;
        return NCAN.send('/admin/members/check', { member_csv: texts[0], transactions_csv: texts[1] }).then(function (r) {
          $('upload-check').disabled = false;
          if (r.status !== 200) { failed('upload-status')(r); return; }
          $('upload-status').textContent = r.body.problems.length ? '' :
            'Checked. Nothing has changed yet: read the report, then Import or Cancel.';
          renderUpload(r.body);
        });
      }).catch(function (err) { $('upload-check').disabled = false; $('upload-status').textContent = err.message; });
    });
  }

  /* Remove an athlete ------------------------------------------------------------ */
  function setUpOptOut() {
    $('optout-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var m = /(?:id=)?(\d{5,12})\b/.exec($('optout-page').value);
      if (!m) { $('corr-status').textContent = 'Paste their page’s address, or the number after id=.'; return; }
      if (!confirm('Remove athlete ' + m[1] + ' from the site? Their page disappears at the next collect, and can be put back.')) { return; }
      change('/admin/corrections', { kind: 'opt_out', id: +m[1], why: $('optout-why').value }, 'corr-status', function () {
        $('optout-page').value = ''; $('optout-why').value = '';
        return 'Athlete ' + m[1] + ' will be taken off the site.' + COLLECTING;
      });
    });
  }

  /* Blocks -------------------------------------------------------------------- */
  function renderBlocks(blocked) {
    var out = $('blocks-out');
    out.textContent = '';
    var ul = el('ul', 'access-list');
    blocked.forEach(function (b) {
      var li = el('li');
      li.appendChild(el('strong', null, b.email));
      li.appendChild(el('span', 'access-how', b.why + ' (' + b.by + ', ' + b.at + ')'));
      li.appendChild(button('Unblock', function (x) {
        x.disabled = true;
        change('/access/unblock', { email: b.email }, 'block-status', b.email + ' can sign in again.');
      }));
      ul.appendChild(li);
    });
    if (!blocked.length) { ul.appendChild(el('li', null, 'Nobody.')); }
    out.appendChild(ul);
  }
  function setUpBlocks() {
    $('block-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('block-email').value.trim(), why = $('block-why').value.trim();
      if (!email || !why) { $('block-status').textContent = 'Give the email address and why.'; return; }
      if (!confirm('Block ' + email + ' from the whole site? They’re signed out at once.')) { return; }
      change('/access/block', { email: email, why: why }, 'block-status', function () {
        $('block-email').value = ''; $('block-why').value = '';
        return email + ' is blocked from the site.';
      });
    });
  }

  /* Club members: everything held about each member except results ------------
     GET /v1/admin/members (admins only), written by each collect. */
  var roll = [];
  var ORIGIN = { 'membership export': 'from GameDay', 'by hand': 'added by an admin', 'family': 'added by family' };

  function seasonsOf(m) { return m.seasons || []; }

  function regWords(list) {
    return (list || []).map(function (k) {
      return typeof k === 'string' ? k : k.type + (k.ordered ? ' (' + k.ordered + ')' : '');
    }).join(', ') || '–';
  }

  function rollMember(m) {
    var block = el('details', 'champs-day src-meeting roll-member');
    var head = el('summary', 'champs-day__head');
    head.appendChild(el('h4', 'champs-day__title src-meeting__title', m.name));
    var latest = seasonsOf(m).length ? seasonsOf(m)[seasonsOf(m).length - 1] : 'no season';
    head.appendChild(el('span', 'champs-day__count',
      (m.dob || 'born ' + m.born) + ' · ' + latest + ' · ' +
      m.emails.length + ' sign-in email' + (m.emails.length === 1 ? '' : 's')));
    block.appendChild(head);

    var body = el('div', 'champs-day__body');
    var facts = el('dl', 'src-facts');
    var page = m.page ? pageLink(m.page, m.page_name === m.name ? 'Page ' + m.page : m.page_name + ' (page ' + m.page + ')')
      : 'No page yet';
    var seasons = seasonsOf(m).map(function (s) {
      return s + ((m.added || []).indexOf(s) !== -1 ? ' (added by an admin)' : '');
    }).join(', ');
    [['Date of birth', m.dob || 'Not held (born ' + m.born + ')'],
     ['Gender', m.gender ? (m.gender === 'girls' ? 'Female' : 'Male') : 'Not held'],
     m.grade ? ['Grade', 'Grade ' + m.grade] : null,
     ['Seasons', seasons || 'None'],
     (m.away || []).length ? ['Away', m.away.map(function (p) { return p[0] + ' to ' + p[1]; }).join('; ')] : null,
     ['Page', page]].filter(Boolean).forEach(function (f) {
      facts.appendChild(el('dt', null, f[0]));
      var dd = el('dd');
      if (typeof f[1] === 'string') { dd.textContent = f[1]; } else { dd.appendChild(f[1]); }
      facts.appendChild(dd);
    });
    body.appendChild(facts);

    if ((m.registrations || []).length) {
      var wrap = el('div', 'table-wrap');
      var table = el('table', 'schedule roll-table');
      table.appendChild(el('caption', 'visually-hidden', 'GameDay registrations, ' + m.name));
      var hr = el('tr');
      ['Season', 'Club', 'Athletics Canterbury', 'Athletics NZ'].forEach(function (h) {
        var th = el('th', null, h); th.setAttribute('scope', 'col'); hr.appendChild(th);
      });
      var thead = el('thead'); thead.appendChild(hr); table.appendChild(thead);
      var tbody = el('tbody');
      m.registrations.forEach(function (r) {
        var tr = el('tr');
        var th = el('th', null, r.season); th.setAttribute('scope', 'row'); tr.appendChild(th);
        [['Club', r.club], ['Athletics Canterbury', r.centre], ['Athletics NZ', r.national]].forEach(function (c) {
          var td = el('td', null, regWords(c[1])); td.setAttribute('data-label', c[0]); tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); wrap.appendChild(table); body.appendChild(wrap);
    } else {
      body.appendChild(el('p', 'records-note', 'No GameDay registrations kept for them yet.'));
    }

    body.appendChild(el('h5', 'roll__sub', 'Who can sign in to see their page'));
    if (m.emails.length) {
      var ul = el('ul', 'roll-emails');
      m.emails.forEach(function (e) {
        var li = el('li');
        var a = el('a', null, e.email); a.href = 'mailto:' + e.email; li.appendChild(a);
        var how = [ORIGIN[e.origin] || e.origin];
        if (e.origin === 'family' && e.added_by) { how[0] += ' (' + e.added_by + ')'; }
        if (e.role) { how.push(e.role); }
        if (e.blocked) { how.push('blocked'); }
        li.appendChild(el('span', 'roll-emails__how', ' · ' + how.join(' · ')));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    } else {
      body.appendChild(el('p', 'records-note', m.page ? 'No email is linked to their page.' : 'They have no page yet.'));
    }
    block.appendChild(body);
    return block;
  }

  function renderRoll() {
    var season = $('roll-season').value;
    var q = $('roll-text').value.replace(/\s+/g, ' ').trim().toLowerCase();
    var shown = roll.filter(function (m) {
      if (season && seasonsOf(m).indexOf(season) === -1) { return false; }
      if (!q) { return true; }
      var hay = (m.name + ' ' + m.emails.map(function (e) { return e.email; }).join(' ')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    $('roll-heading').textContent = 'Club members (' + roll.length + ')';
    $('roll-status').textContent = shown.length === roll.length ? roll.length + ' members.'
      : 'Showing ' + shown.length + ' of ' + roll.length + ' members.';
    var out = $('roll-out');
    out.textContent = '';
    shown.forEach(function (m) { out.appendChild(rollMember(m)); });
  }

  function loadRoll() {
    return NCAN.get('/admin/members').then(function (r) {
      roll = r.members || [];
      if (!roll.length) {
        $('roll-status').textContent = 'No members yet: the list appears after the next collect.';
        return;
      }
      var seasons = {};
      roll.forEach(function (m) { seasonsOf(m).forEach(function (s) { seasons[s] = 1; }); });
      Object.keys(seasons).sort().reverse().forEach(function (s) {
        var o = el('option', null, s); o.value = s; $('roll-season').appendChild(o);
      });
      $('roll-season').addEventListener('change', renderRoll);
      $('roll-text').addEventListener('input', renderRoll);
      renderRoll();
      if (r.updated) { $('roll-status').textContent += ' From the collect of ' + r.updated + '.'; }
    }, function () { $('roll-status').textContent = 'Sorry, the members could not be loaded.'; });
  }

  /* Loading ------------------------------------------------------------------- */
  function loadAll() {
    return Promise.all([NCAN.get('/admin/review'), NCAN.get('/membership'), NCAN.get('/access/blocks')])
      .then(function (r) {
        members = r[1].members || [];
        renderReview(r[0]);
        renderCorrections(r[0].corrections);
        merges = r[0].merges || [];
        renderMerges();
        renderOverrides(r[1].overrides || []);
        renderBlocks(r[2].blocked || []);
        watch(r[0].collect);
      });
  }

  NCAN.me().then(function (who) {
    NCAN.account($('account'), who);
    if (!who) {
      $('admin-status').textContent = '';
      $('admin-signin').hidden = false;
      NCAN.signIn($('admin-signin'), 'This page is for club administrators. Sign in with your email address.');
      return;
    }
    if (who.role !== 'admin') {
      $('admin-status').textContent = 'This page is for club administrators.';
      return;
    }
    loadAll().then(function () {
      $('admin-status').hidden = true;
      $('admin-jump').hidden = false;
      ['review', 'upload', 'members', 'merges', 'corrections', 'blocks'].forEach(function (x) { $(x).hidden = false; });
      setUpUpload();
      loadRoll();
      setUpMembership();
      setUpMerges();
      setUpCorrections();
      setUpOptOut();
      setUpBlocks();
    }, function (err) { $('admin-status').textContent = err.message || 'Sorry, this page could not be loaded.'; });
  }, function () { $('admin-status').textContent = 'The club’s results service could not be reached.'; });
}());
