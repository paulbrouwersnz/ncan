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
    var a = el('a', null, words || 'page ' + id);
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
    if (c && c.state === 'running' && !watching) {
      watching = true;
      setTimeout(function () { watching = false; loadAll(); }, 15000);
    }
  }

  // every change goes through here: say what happened, and show the new state
  function change(path, body, where, done) {
    $(where).textContent = 'Saving…';
    return NCAN.send(path, body).then(function (r) {
      if (r.status === 200 || r.status === 201) {
        $(where).textContent = typeof done === 'function' ? done(r.body) : done;
      } else { failed(where)(r); }
      loadAll();
    }, function (err) { $(where).textContent = err.message; });
  }
  var COLLECTING = ' Results are being collected again.';

  /* Needs a look ------------------------------------------------------------ */
  var KINDS = {
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
             'review-said', 'Dismissed.');
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
             season.input.value + '.' + COLLECTING);
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
             'review-said', '“' + item.name + '” is now read as ' + name + '.' + COLLECTING);
    });
    return form;
  }

  function renderReview(data) {
    var out = $('review-out');
    out.textContent = '';
    var items = data.items || [];
    if (!items.length) {
      out.appendChild(el('p', 'mem-help', data.updated ? 'Nothing needs a look. ' : 'Nothing yet: the next collect fills this in. '));
    }
    Object.keys(KINDS).forEach(function (kind) {
      var mine = items.filter(function (i) { return i.kind === kind; });
      if (!mine.length) { return; }
      out.appendChild(el('h3', 'access-sub', KINDS[kind] + ' (' + mine.length + ')'));
      var ul = el('ul', 'review-list');
      mine.forEach(function (item) {
        var li = el('li', 'review-item');
        li.appendChild(el('p', 'review-item__text', item.text));
        var acts = el('div', 'review-item__acts');
        if (kind === 'pair') {
          acts.appendChild(pageLink(item.ids[0], 'First page'));
          acts.appendChild(pageLink(item.ids[1], 'Second page'));
          acts.appendChild(button('The same athlete', function () {
            change('/admin/corrections', { kind: 'same', ids: item.ids, why: 'checked' }, 'review-said',
                   'Joined into one page.' + COLLECTING);
          }, 'btn btn--accent btn--sm'));
          acts.appendChild(button('Two athletes', function () {
            change('/admin/corrections', { kind: 'not_same', ids: item.ids, why: 'checked' }, 'review-said',
                   'Kept apart.' + COLLECTING);
          }));
        }
        if (kind === 'no_membership') {
          acts.appendChild(pageLink(item.id, 'Their page'));
        }
        if (kind === 'not_member') {
          // they already have no page and their results count for nothing: this
          // records that they aren't a member, and takes the item off the list
          acts.appendChild(button('Not a member', function (b) {
            b.disabled = true;
            change('/admin/corrections', { kind: 'dismissed', key: item.key, text: item.text, why: 'not a club member' },
                   'review-said', item.name + ': not a member. They have no page, and their results stay left out.');
          }, 'btn btn--accent btn--sm'));
        } else {
          acts.appendChild(dismissButton(item));
        }
        if (kind === 'pair') {
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
      out.appendChild(ul);
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
    $('merge-count').textContent = shown.length === merges.length
      ? merges.length + ' pages made from more than one number.'
      : 'Showing ' + shown.length + ' of ' + merges.length + '.';
    var ul = el('ul', 'review-list');
    shown.slice(0, 60).forEach(function (g) {
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
    if (shown.length > 60) { out.appendChild(el('p', 'records-note', 'The first 60: find a name to narrow it down.')); }
  }

  function setUpMerges() {
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
    ['opt_out', 'Pages removed', function (e) { return [pageLink(e.id, 'Page ' + e.id)]; }],
    ['same', 'Joined into one athlete', function (e) { return [pageLink(e.ids[0]), el('span', null, ' and '), pageLink(e.ids[1])]; }],
    ['not_same', 'Kept apart', function (e) { return [pageLink(e.ids[0]), el('span', null, ' and '), pageLink(e.ids[1])]; }],
    ['names', 'Names corrected', function (e) { return [pageLink(e.id, e.name)]; }],
    ['name_fixes', 'Names a meeting spells differently', function (e) { return [el('span', null, '“' + e.from + '” is ' + e.to)]; }],
    ['dismissed', 'Dismissed', function (e) { return [el('span', null, e.text || e.key)]; }]
  ];

  function renderCorrections(all) {
    var out = $('corr-out');
    out.textContent = '';
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

  /* Remove a page ------------------------------------------------------------ */
  function setUpOptOut() {
    $('optout-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var m = /(?:id=)?(\d{5,12})\b/.exec($('optout-page').value);
      if (!m) { $('corr-status').textContent = 'Paste the page’s address, or the number after id=.'; return; }
      if (!confirm('Remove page ' + m[1] + '? It disappears at the next collect, and can be put back.')) { return; }
      change('/admin/corrections', { kind: 'opt_out', id: +m[1], why: $('optout-why').value }, 'corr-status', function () {
        $('optout-page').value = ''; $('optout-why').value = '';
        return 'Page ' + m[1] + ' will be removed.' + COLLECTING;
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
      ['review', 'members', 'merges', 'corrections', 'blocks'].forEach(function (x) { $(x).hidden = false; });
      setUpMembership();
      setUpMerges();
      setUpOptOut();
      setUpBlocks();
    }, function (err) { $('admin-status').textContent = err.message || 'Sorry, this page could not be loaded.'; });
  }, function () { $('admin-status').textContent = 'The club’s results service could not be reached.'; });
}());
