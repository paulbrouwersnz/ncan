/*
  recaps-admin.js - /admin/recaps/: every meeting recap, for club administrators
  (GET /v1/admin/recaps), with who made it, its state (Draft, Public or Taken down),
  when it was published, its links, and Take down with a reason, which is required
  and kept (POST /v1/recaps/<id>/remove). Nothing comes down on its own: a public
  recap three seasons old (since published, or last kept) needs a look, and is
  kept up (POST /v1/recaps/<id>/keep) or taken down here. Modelled on Shared cards and
  charts (shared-charts.js). admin.js starts it once it knows this is an administrator.
  Recaps are made on /recaps/ (assets/js/recaps.js); the pure parts are in
  recap-data.js. No athlete data is in this file.
*/
(function () {
  'use strict';

  var D = window.NCANRecapData;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words !== undefined && words !== null && words !== '') { e.textContent = words; }
    return e;
  }
  function when(at) { return at ? D.shortDate(at) + (at.length > 10 ? ' ' + at.slice(11, 16) : '') : ''; }

  function copyLink(url, b) {
    var done = function () {
      var was = b.textContent;
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = was; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  function row(s, again) {
    var live = s.state === 'draft' || s.state === 'public';
    var li = el('li', 'share-row' + (live ? '' : ' share-row--gone'));
    if (s.card_image && live) {
      var thumb = el('a', 'share-row__thumb');
      thumb.href = D.pageHref(s.id);
      var img = el('img');
      img.src = s.card_image; img.alt = 'The recap’s card: ' + (s.title || ''); img.loading = 'lazy';
      img.width = 120; img.height = 63;
      thumb.appendChild(img);
      li.appendChild(thumb);
    } else {
      li.appendChild(el('span', 'share-row__thumb share-row__thumb--gone', live ? 'No card yet' : D.stateLabel(s.state)));
    }
    var body = el('div', 'share-row__body');
    var head = el('p', 'share-row__what');
    if (live) {
      var a = el('a', null, s.title || (s.meeting && s.meeting.name) || 'Recap');
      a.href = D.pageHref(s.id);
      head.appendChild(a);
    } else {
      head.appendChild(el('strong', null, s.title || (s.meeting && s.meeting.name) || 'Recap'));
    }
    head.appendChild(document.createTextNode(' '));
    head.appendChild(el('span', 'champs-tag' + (s.state === 'public' ? ' champs-tag--next' : ''), D.stateLabel(s.state)));
    if (s.needs_review) {
      head.appendChild(document.createTextNode(' '));
      head.appendChild(el('span', 'champs-tag recap-review-tag', 'Needs a look'));
    }
    body.appendChild(head);
    var m = s.meeting || {};
    body.appendChild(el('p', 'share-row__meta', [m.name !== s.title ? m.name : '', D.meetingLine(m)].filter(Boolean).join(' · ')));
    var made = ['Made by ' + (s.by || 'someone')];
    if (s.published_at) { made.push('published ' + when(s.published_at)); }
    if (s.reviewed) { made.push('kept up ' + when(s.reviewed.at) + (s.reviewed.by ? ' (' + s.reviewed.by + ')' : '')); }
    body.appendChild(el('p', 'share-row__meta', made.join(', ')));
    var c = s.counts || {};
    body.appendChild(el('p', 'share-row__meta', [D.plural(c.athletes || 0, 'athlete', 'athletes'),
      D.plural(c.pbs || 0, 'PB', 'PBs'), D.plural(c.medals || 0, 'medal', 'medals')].join(' · ')));
    if (s.removed) {
      var r = s.removed;
      body.appendChild(el('p', 'share-row__meta share-row__gone', (r.by_club ? 'Taken down by the club' : 'Taken down') +
        ' on ' + when(r.at) + (r.by ? ' (' + r.by + ')' : '') + (r.reason ? ': ' + r.reason : '')));
    }
    if (live) {
      var acts = el('p', 'share-row__acts');
      var open = el('a', 'btn btn--ghost btn--small', 'Open');
      open.href = D.pageHref(s.id);
      acts.appendChild(open);
      if (s.state === 'public' && s.share_url) {
        var cp = el('button', 'btn btn--ghost btn--small', 'Copy link');
        cp.type = 'button';
        cp.addEventListener('click', function () { copyLink(s.share_url, cp); });
        acts.appendChild(cp);
      }
      var said = el('p', 'access-status');
      said.setAttribute('role', 'status');
      if (s.needs_review) {
        var keep = el('button', 'btn btn--accent btn--small', 'Keep it up');
        keep.type = 'button';
        keep.addEventListener('click', function () {
          keep.disabled = true;
          said.textContent = 'Keeping it up…';
          NCAN.send('/recaps/' + encodeURIComponent(s.id) + '/keep', {}).then(function (r) {
            if (r.status === 200) { return again(); }
            keep.disabled = false;
            said.textContent = (r.body && r.body.error) || 'Sorry, that didn’t work (' + r.status + ').';
          }, function (err) {
            keep.disabled = false;
            said.textContent = (err && err.message) || 'The club’s results service could not be reached.';
          });
        });
        acts.appendChild(keep);
      }
      var rm = el('button', 'btn btn--ghost btn--small', 'Take down');
      rm.type = 'button';
      acts.appendChild(rm);
      body.appendChild(acts);
      if (s.needs_review) {
        body.appendChild(el('p', 'share-row__meta', 'Published three seasons ago' + (s.reviewed ? ' (or since it was last kept up)' : '') +
          '. Keep it up if it’s still right to show, and it’s asked about again in three seasons; or take it down.'));
      }
      var form = el('form', 'share-row__why');
      form.hidden = true;
      form.noValidate = true;
      var id = 'recap-why-' + s.id;
      var label = el('label', null, 'Why is the club taking it down?');
      label.htmlFor = id;
      var input = el('input');
      input.type = 'text'; input.id = id; input.maxLength = 300; input.autocomplete = 'off';
      var go = el('button', 'btn btn--accent btn--small', 'Take it down');
      go.type = 'submit';
      var no = el('button', 'btn btn--ghost btn--small', 'Cancel');
      no.type = 'button';
      [label, input, go, no].forEach(function (x) { form.appendChild(x); });
      body.appendChild(form);
      body.appendChild(said);
      rm.addEventListener('click', function () { form.hidden = false; rm.hidden = true; input.focus(); });
      no.addEventListener('click', function () { form.hidden = true; rm.hidden = false; said.textContent = ''; rm.focus(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var why = input.value.trim();
        if (!why) { said.textContent = 'Say why the club is taking this recap down.'; input.focus(); return; }
        go.disabled = no.disabled = true;
        said.textContent = 'Taking it down…';
        NCAN.send('/recaps/' + encodeURIComponent(s.id) + '/remove', { reason: why }).then(function (r) {
          if (r.status === 200 || r.status === 410) { return again(); }
          go.disabled = no.disabled = false;
          said.textContent = (r.body && r.body.error) || 'Sorry, it couldn’t be taken down (' + r.status + ').';
        }, function (err) {
          go.disabled = no.disabled = false;
          said.textContent = (err && err.message) || 'The club’s results service could not be reached.';
        });
      });
    }
    li.appendChild(body);
    return li;
  }

  function start() {
    var section = $('recaps-admin');
    if (!section) { return; }
    var data = { recaps: [] };
    function draw() {
      var all = data.recaps || [];
      var shown = D.adminPick(all, $('recaps-show').value, $('recaps-find').value);
      var pub = all.filter(function (s) { return s.state === 'public'; }).length;
      var drafts = all.filter(function (s) { return s.state === 'draft'; }).length;
      var review = all.filter(function (s) { return s.needs_review; }).length;
      var rn = $('recaps-review');
      rn.hidden = !review;
      rn.textContent = review ? D.plural(review, 'public recap is', 'public recaps are') +
        ' three seasons old and need' + (review === 1 ? 's' : '') + ' a look: keep each up, or take it down. ' +
        'Nothing comes down on its own.' : '';
      $('recaps-sum').textContent = D.plural(pub, 'public recap', 'public recaps') + ', ' + D.plural(drafts, 'draft', 'drafts') + '.' +
        (shown.length !== all.length ? ' Showing ' + shown.length + ' of ' + all.length + '.' : '');
      var out = $('recaps-out');
      out.textContent = '';
      if (!shown.length) {
        out.appendChild(el('p', 'mem-help', all.length ? 'No recaps match.'
          : 'Nobody has made a recap yet. They’re started with Share results on Results sources.'));
        return;
      }
      var ul = el('ul', 'share-list');
      shown.forEach(function (s) { ul.appendChild(row(s, load)); });
      out.appendChild(ul);
    }
    function load() {
      return NCAN.get('/admin/recaps').then(function (r) {
        data = r || { recaps: [] };
        section.hidden = false;
        var p = data.paused, note = $('recaps-paused');
        note.hidden = !p;
        note.textContent = p ? 'Sharing is paused' + (p.by ? ' by ' + p.by : '') + (p.at ? ' since ' + when(p.at) : '') +
          ', so no recap can be published. Recaps already published keep working. Pause and start sharing on Shared cards and charts.' : '';
        draw();
      }, function (e) {
        $('recaps-status').textContent = (e && e.message) || 'Sorry, the recaps could not be loaded.';
      });
    }
    $('recaps-show').addEventListener('change', draw);
    $('recaps-find').addEventListener('input', draw);
    return load();
  }

  window.NCANRecapsAdmin = { start: start };
}());
