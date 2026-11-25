/*
  me.js - "My athletes" (/me/), where families land after signing in.

  A card for each athlete this person is family for (GET /v1/auth/me, `own`):
  a small round photo (their athlete page's photo, or their initials when it has
  none), a link to their athlete page, their membership (coming soon), and,
  when any of their cards or charts are shared publicly (GET /v1/me/shares),
  how many, with a link to manage them on /athletes/.

  Below the cards: who is signed in, with a round initial, Sign out, and links
  to privacy and contacting the club. Someone not signed in gets the sign-in
  box, which brings them back here.

  The wording helpers are kept apart from the page so the Node tests can check
  them (tests/js/me.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.NCANMe = api;
  if (root.document) { root.document.addEventListener('DOMContentLoaded', function () { api.start(root); }); }
}(this, function () {
  'use strict';

  // "Sam Brown" -> "SB", "Aroha Te Whare-Smith" -> "AT", "sam" -> "S"
  function initials(name) {
    var words = String(name || '').trim().split(/[\s@._-]+/).filter(Boolean);
    if (!words.length) { return '?'; }
    var first = words[0].charAt(0);
    var second = words.length > 1 && !/@/.test(name) ? words[1].charAt(0) : '';
    return (first + second).toUpperCase();
  }

  // The signed-in person's circle: the first letter of their email address
  function emailInitial(email) {
    var c = String(email || '').trim().charAt(0);
    return c && /[a-z0-9]/i.test(c) ? c.toUpperCase() : '?';
  }

  // {address or name: how many live shares}, from GET /v1/me/shares
  function shareCounts(shares) {
    var out = {};
    (shares || []).forEach(function (s) {
      if (!s || s.removed) { return; }
      var key = s.address || s.athlete;
      if (key) { out[key] = (out[key] || 0) + 1; }
    });
    return out;
  }

  // One card per athlete, in the order the API gives (by name)
  function cards(own, shares) {
    var counts = shareCounts(shares);
    return (own || []).filter(function (a) { return a && a.name; }).map(function (a) {
      return {
        name: a.name,
        slug: a.slug || null,
        href: a.slug ? '/athlete/#/' + a.slug : null,
        initials: initials(a.name),
        shares: counts[a.slug] || counts[a.name] || 0
      };
    });
  }

  function sharesText(n) {
    return n === 1 ? '1 card or chart shared publicly' : n + ' cards and charts shared publicly';
  }

  // ------------------------------------------------------------ the page

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (text) { e.textContent = text; }
    return e;
  }

  function avatar(doc, letters, photo) {
    var box = el(doc, 'span', 'avatar');
    box.setAttribute('aria-hidden', 'true');
    var text = el(doc, 'span', 'avatar__text', letters);
    box.appendChild(text);
    if (photo) {
      // the athlete page's own photo (only for someone who may see the page);
      // none set, or it can't load: the initials stay
      var img = el(doc, 'img', 'avatar__img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('load', function () { box.classList.add('avatar--photo'); });
      img.addEventListener('error', function () { img.remove(); });
      img.src = photo;
      box.appendChild(img);
    }
    return box;
  }

  function card(doc, api, c) {
    var li = el(doc, 'li', 'me-card');
    var head = el(doc, 'div', 'me-card__head');
    head.appendChild(avatar(doc, c.initials, c.slug ? api + '/athletes/' + encodeURIComponent(c.slug) + '/photo' : null));
    var h = el(doc, 'h3', 'me-card__name');
    if (c.href) {
      var a = el(doc, 'a', null, c.name);
      a.href = c.href;
      h.appendChild(a);
    } else {
      h.textContent = c.name;
    }
    head.appendChild(h);
    li.appendChild(head);

    var list = el(doc, 'ul', 'me-card__links');
    function item(text, href, note) {
      var row = el(doc, 'li');
      if (href) {
        var link = el(doc, 'a', null, text);
        link.href = href;
        row.appendChild(link);
      } else {
        row.appendChild(el(doc, 'span', 'me-card__soon', text));
      }
      if (note) { row.appendChild(el(doc, 'span', 'me-card__note', ' ' + note)); }
      list.appendChild(row);
    }
    if (c.href) { item('Results and progression', c.href); }
    else { item('No athlete page yet', null, '(it appears once they have a result or are registered)'); }
    item('Membership', null, '(coming soon)');
    if (c.shares) { item('Manage shared cards and charts', '/athletes/#my-shares', '(' + sharesText(c.shares) + ')'); }
    li.appendChild(list);
    return li;
  }

  function start(win) {
    var doc = win.document;
    var N = win.NCAN;
    var $ = function (id) { return doc.getElementById(id); };
    var status = $('me-status'), out = $('me-out'), signin = $('me-signin');
    var acct = $('me-account'), who_el = $('me-who'), empty = $('me-empty');
    if (!N || !out) { return; }

    N.me().then(function (who) {
      status.hidden = true;
      if (!who) {
        N.signIn(signin, null, null, 'Sign in to see your athletes');
        return;
      }
      // who is signed in
      acct.hidden = false;
      var me = $('me-avatar');
      me.textContent = '';
      me.appendChild(avatar(doc, emailInitial(who.email)));
      N.account(who_el, who);
      if (N.atLeast(who, 'coach')) { $('me-staff').hidden = false; }

      var own = Array.isArray(who.own) ? who.own : [];
      if (!own.length) {
        empty.hidden = false;
        return;
      }
      var draw = function (shares) {
        out.textContent = '';
        cards(own, shares).forEach(function (c) { out.appendChild(card(doc, N.api, c)); });
      };
      draw([]);
      N.get('/me/shares').then(function (r) { draw(r && r.shares); }, function () { /* no counts */ });
    }, function (err) {
      status.hidden = false;
      status.textContent = err.status === 0 ? err.message
        : 'Sorry, your athletes couldn’t be loaded. Please try again later.';
    });
  }

  return { initials: initials, emailInitial: emailInitial, shareCounts: shareCounts, cards: cards,
    sharesText: sharesText, start: start };
}));
