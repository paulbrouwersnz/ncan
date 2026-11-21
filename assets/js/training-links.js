/*
  What a shared training-plan link (/junior-athletics/#/plan/<date>) does when there's no
  plan to show: a draft says why (scheduled, not released yet, or being changed), and no
  plan at all goes to the list of all the plans, which says nothing matched.
  Kept apart from training.js so the Node tests can check it (tests/js/training-links.test.js). Dates are "YYYY-MM-DD" text throughout, so the
  machine's time zone never matters.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANTrainingLinks = api; }
}(this, function () {
  'use strict';

  // Follow "this plan moved to `movedTo`"? Not when a link for today or later would land
  // on a session that has already been: a plan made on the wrong date and moved back
  // (say a new plan for 24 November changed to 13 October) is not what someone opening
  // next week's link wants. They go to the list of all the plans instead.
  function followMove(date, movedTo, today) {
    if (!movedTo) { return false; }
    return !(date >= today && movedTo < today);
  }

  // No plan to show for a link: it goes to the list of all the plans instead
  // (/junior-athletics/?no-plan=<date>), which says nothing matched. `date` is left off
  // when the link didn't name a real date.
  var LIST = '/junior-athletics/';
  function realDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
    if (!m) { return false; }
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function notFoundUrl(date) {
    return LIST + '?no-plan=' + (realDate(date) ? date : 'link');
  }

  // The list page: the date asked for, from "?no-plan=…" ('link' when it wasn't a real
  // date), or null when the page wasn't sent here from a link.
  function noPlanAsked(search) {
    var m = /[?&]no-plan=([^&#]*)/.exec(search || '');
    if (!m) { return null; }
    return realDate(m[1]) ? m[1] : 'link';
  }

  // What the list says at the top. `longDate` turns "2026-11-24" into
  // "Tuesday 24 November 2026" (training.js has it).
  function noPlanText(asked, today, longDate) {
    var said = asked && asked !== 'link'
      ? 'No training plan was found for ' + longDate(asked) + '.' + (asked >= today ? ' It may not have been released yet.' : '')
      : 'No training plan was found for that link.';
    return said + ' All the training plans are listed below.';
  }

  // A link to a plan that's still a draft (the API's 404 with "state": "draft"): what it
  // says, or null if it isn't a draft. Scheduled: when it will be released. Never released
  // ("released_before": false): not released yet. Taken back after release: being changed.
  // An API too old to send "released_before" gets "being changed", as it always did.
  function draftText(body, date, longDate, whenText) {
    if (!body || body.state !== 'draft') { return null; }
    var plan = 'The training plan for ' + longDate(date);
    if (body.release_at) { return plan + ' will be released on ' + whenText(body.release_at) + '. Please check back then.'; }
    if (body.released_before === false) { return plan + ' hasn’t been released yet. Please check back later.'; }
    return plan + ' is being changed. Please check back soon.';
  }

  return { followMove: followMove, notFoundUrl: notFoundUrl, noPlanAsked: noPlanAsked, noPlanText: noPlanText,
           draftText: draftText };
}));
