/*
  staff-tools.js - the staff tools pages (/coaches-tools/, /committee-tools/).

  <main data-roles="coach admin" data-who="coaches">: who may see the tools.
  Not signed in: a sign-in box (it brings them back here). Signed in with
  another role: a note saying where their own page is. Allowed: the tool
  cards, and "Signed in as ... Sign out".

  The cards are only links: each tool's own page, and the club's API behind
  it, still decide what the person may do there.
*/
(function () {
  'use strict';

  var main = document.getElementById('main');
  var roles = (main.getAttribute('data-roles') || '').split(/\s+/);
  var who = main.getAttribute('data-who') || 'staff';
  var gate = document.getElementById('st-gate');
  var tools = document.getElementById('st-tools');

  NCAN.me().then(function (me) {
    if (!me) {
      gate.hidden = true;
      NCAN.signIn(document.getElementById('st-signin'),
        'This page is for ' + who + '. Sign in with the email address the club has for you, and ' +
        'we’ll email you a link. There is no password.', null, 'Sign in');
      return;
    }
    NCAN.account(document.getElementById('account'), me);
    if (roles.indexOf(me.role) < 0) {
      gate.textContent = 'This page is for ' + who + '. ';
      var mine = document.createElement('a');
      mine.href = NCAN.home(me);
      mine.textContent = 'Go to your own page';
      gate.appendChild(mine);
      gate.appendChild(document.createTextNode('.'));
      return;
    }
    gate.hidden = true;
    tools.hidden = false;
  }, function (err) {
    gate.textContent = err.message || 'The club’s sign-in service can’t be reached just now.';
  });
}());
