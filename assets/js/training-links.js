/*
  What a shared training-plan link (/junior-athletics/#/plan/<date>) shows when there's no
  plan on that date. Kept apart from training.js so the Node tests can check it
  (tests/js/training-links.test.js). Dates are "YYYY-MM-DD" text throughout, so the
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
  // next week's link wants. They get "not released yet" and the latest plan instead.
  function followMove(date, movedTo, today) {
    if (!movedTo) { return false; }
    return !(date >= today && movedTo < today);
  }

  // The most recent session before today that families can see: a released plan, or
  // failing that a cancelled one (newest first). Null when there's none.
  function latestPast(plans, today) {
    var past = (plans || []).filter(function (p) { return p && p.date < today; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return past.filter(function (p) { return p.status === 'released'; })[0] ||
           past.filter(function (p) { return p.status === 'cancelled'; })[0] || null;
  }

  return { followMove: followMove, latestPast: latestPast };
}));
