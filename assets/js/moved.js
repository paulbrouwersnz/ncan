/*
  moved.js - the site's pages moved into folders in November 2026
  (calendar.html -> /calendar/). This sends anyone with an old address to the
  new one, keeping what came after it:

    calendar.html#june                       -> /calendar/#june
    athlete.html?a=sam-brown#out-of-stadia   -> /athlete/#/sam-brown/out-of-stadia
    athlete.html?id=24222905                 -> /athlete/#/24222905
    club-champs.html?season=2026-27#res-...  -> /club-champs/#/season/2026-27/res-...
    index.html#join                          -> /#join

  Used by the old .html pages (each a small page that only sends you on, to be
  deleted a few months after the move) and by 404.html, which keeps doing it for
  good: GitHub Pages shows 404.html for any address that doesn't exist.
*/
(function () {
  'use strict';

  // every page as it was named before the move
  var PAGES = ['index', 'admin', 'athlete', 'athletes', 'athletics-nz-library-inventory', 'calendar',
               'club-champs', 'coaches-officials-volunteers', 'committee', 'gallery', 'history',
               'monday-training', 'open-day', 'privacy', 'records', 'resources', 'results-sources',
               'safeguarding'];

  // the new address for an old one, or null if it isn't one of the old pages
  function newAddress(path, search, hash) {
    var m = /^\/([a-z0-9-]+)\.html$/.exec(path);
    if (!m || PAGES.indexOf(m[1]) === -1) { return null; }
    var page = m[1];
    var query = new URLSearchParams(search);
    var part = hash.length > 1 ? hash.slice(1) : '';
    if (page === 'athlete') {
      var who = query.get('a') || query.get('id');
      return '/athlete/' + (who ? '#/' + who + (part ? '/' + part : '') : '');
    }
    if (page === 'club-champs') {
      var season = query.get('season');
      return '/club-champs/' + (season ? '#/season/' + season + (part ? '/' + part : '') : hash);
    }
    return (page === 'index' ? '/' : '/' + page + '/') + search + hash;
  }

  var to = newAddress(location.pathname, location.search, location.hash);
  if (to) { location.replace(to); }
  window.NCANMoved = { newAddress: newAddress };
}());
