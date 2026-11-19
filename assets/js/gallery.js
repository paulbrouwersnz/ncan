/*
  gallery.js - the gallery front page (gallery/index.html).

  The gallery used to be one long page with an anchor per album
  (/gallery/#album-2024-colgate-games). Each album has its own page now,
  so an old link is sent on to it. Only a hash naming an album on this
  page is followed; anything else stays put.
*/
(function () {
  'use strict';
  function follow() {
    var id = decodeURIComponent(window.location.hash.slice(1));
    if (!/^[a-z0-9-]+$/.test(id)) { return; }
    var card = document.getElementById(id.indexOf('album-') === 0 ? id : 'album-' + id);
    var link = card && card.querySelector('a.card__link');
    if (link) { window.location.replace(link.getAttribute('href')); }
  }
  window.addEventListener('hashchange', follow);
  follow();
}());
