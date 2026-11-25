/*
  me.js - "My athletes" (/me/), where families land after signing in.

  A card for each athlete this person is family for (GET /v1/auth/me, `own`),
  styled like the Club admin page's cards: a small round photo (their athlete
  page's photo, GET /v1/athletes/<address>, centred on its focus point, or their
  initials when it has none), Results and progression, Membership (coming
  soon), and, when any of their cards or charts are shared publicly
  (GET /v1/me/shares), Shared links with a count badge, linking to
  where they are managed on /athletes/.

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

  // photo: {url, focus} from the athlete's page (GET /v1/athletes/<address>), shown
  // round and centred on the same focus point as the page's heading
  function avatar(doc, letters, photo) {
    var box = el(doc, 'span', 'avatar');
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(el(doc, 'span', 'avatar__text', letters));
    if (photo) { setPhoto(doc, box, photo); }
    return box;
  }

  function setPhoto(doc, box, photo) {
    if (!photo || !photo.url) { return; }
    var img = el(doc, 'img', 'avatar__img');
    img.alt = '';
    img.decoding = 'async';
    img.style.objectPosition = photo.focus || '50% 50%';
    img.addEventListener('load', function () { box.classList.add('avatar--photo'); });
    img.addEventListener('error', function () { img.remove(); });
    img.src = photo.url;
    box.appendChild(img);
  }

  // one row of a card, as on the Club admin page: a title (a link, or plain when
  // not there yet), a count badge, and a line saying what it is
  function row(doc, title, href, about, count) {
    var li = el(doc, 'li', 'me-card__row');
    var h = el(doc, 'h4', 'me-card__title');
    if (href) {
      var a = el(doc, 'a', null, title);
      a.href = href;
      h.appendChild(a);
    } else {
      h.appendChild(el(doc, 'span', 'me-card__soon', title));
    }
    if (count) {
      var badge = el(doc, 'span', 'admin-count', String(count));
      badge.title = sharesText(count);
      h.appendChild(doc.createTextNode(' '));
      h.appendChild(badge);
    }
    li.appendChild(h);
    li.appendChild(el(doc, 'p', null, about));
    return li;
  }

  function card(doc, c) {
    var li = el(doc, 'li', 'me-card');
    var head = el(doc, 'div', 'me-card__head');
    var pic = avatar(doc, c.initials);
    head.appendChild(pic);
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
    list.appendChild(c.href
      ? row(doc, 'Results and progression', c.href, 'Every result, with charts of their progression and personal bests.')
      : row(doc, 'No athlete page yet', null, 'It appears once they have a result or are registered with the club.'));
    list.appendChild(row(doc, 'Membership', null, 'Their seasons and registrations with the club. Coming soon.'));
    if (c.shares) {
      list.appendChild(row(doc, 'Shared links', c.slug ? '/my/shares/#/athlete/' + c.slug : '/my/shares/',
        'Public links to their charts and cards: open, copy, download or remove them.', c.shares));
    }
    li.appendChild(list);
    li.ncanAvatar = pic;
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
      var drawn = [];
      var draw = function (shares) {
        out.textContent = '';
        drawn = cards(own, shares).map(function (c) {
          var li = card(doc, c);
          out.appendChild(li);
          return { c: c, li: li };
        });
      };
      draw([]);
      // each athlete's photo and its focus point, from their page (a family has a few)
      var photos = {};
      var addPhotos = function () {
        drawn.forEach(function (d) {
          if (photos[d.c.slug]) { setPhoto(doc, d.li.ncanAvatar, photos[d.c.slug]); }
        });
      };
      own.forEach(function (a) {
        if (!a.slug) { return; }
        N.get('/athletes/' + encodeURIComponent(a.slug)).then(function (page) {
          if (page && page.photo && page.photo.url) {
            photos[a.slug] = page.photo;
            drawn.forEach(function (d) {
              if (d.c.slug === a.slug) { setPhoto(doc, d.li.ncanAvatar, page.photo); }
            });
          }
        }, function () { /* initials stay */ });
      });
      N.get('/me/shares').then(function (r) { draw(r && r.shares); addPhotos(); }, function () { /* no counts */ });
    }, function (err) {
      status.hidden = false;
      status.textContent = err.status === 0 ? err.message
        : 'Sorry, your athletes couldn’t be loaded. Please try again later.';
    });
  }

  return { initials: initials, emailInitial: emailInitial, shareCounts: shareCounts, cards: cards,
    sharesText: sharesText, start: start };
}));
