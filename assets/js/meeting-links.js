/*
  A meeting's extra links (an organiser's PDF, a photo finish, a livestream): for people
  to follow only, never collected. Edited by administrators on /results-sources/ and
  shown with the meeting there and on athlete pages (POST /v1/sources/links in the API).
  Kept apart from the pages so the Node tests can check it (tests/js/meeting-links.test.js).
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANMeetingLinks = api; }
}(this, function () {
  'use strict';

  var MAX = 5, LABEL = 60, URL_MAX = 400;

  // An AthleticLIVE meeting's number, from its address or one of its results' (".../meets/54617/...")
  function meetNumber(url) {
    var m = /\/meets\/(\d+)(?:[/?#]|$)/.exec(url || '');
    return m ? +m[1] : null;
  }

  // The extra links for the meeting at `link`, from an athlete page's meeting_links
  function forMeeting(meetingLinks, link) {
    var n = meetNumber(link);
    return (n && meetingLinks && meetingLinks[String(n)]) || [];
  }

  var tidyText = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };

  // The rows typed in ([{url, label}]) ready to send: empty rows dropped, spaces tidied.
  // {links, error}: error says what's wrong with the first bad row (the API checks again).
  function tidy(rows) {
    var links = [], seen = {}, error = '';
    (rows || []).forEach(function (row, i) {
      if (error) { return; }
      var url = String(row.url || '').trim(), label = tidyText(row.label);
      if (!url && !label) { return; }
      var n = links.length + 1;
      if (!/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/.test(url) || url.length > URL_MAX) {
        error = 'Link ' + n + ': give a full web address starting https://';
        return;
      }
      if (label.length > LABEL) { error = 'Link ' + n + ': the label can be up to ' + LABEL + ' characters.'; return; }
      var key = url.toLowerCase().replace(/\/+$/, '');
      if (seen[key]) { error = 'Link ' + n + ' is the same address as another link.'; return; }
      seen[key] = true;
      links.push({ url: url, label: label });
    });
    if (!error && links.length > MAX) { error = 'A meeting can have up to ' + MAX + ' extra links.'; }
    return { links: links, error: error };
  }

  // Are the rows typed in the same as the saved links? (an empty label keeps the saved one's)
  function same(saved, links) {
    saved = saved || [];
    if (saved.length !== links.length) { return false; }
    return links.every(function (l, i) {
      return l.url === saved[i].url && (l.label === '' || l.label === saved[i].label);
    });
  }

  return { MAX: MAX, meetNumber: meetNumber, forMeeting: forMeeting, tidy: tidy, same: same };
}));
