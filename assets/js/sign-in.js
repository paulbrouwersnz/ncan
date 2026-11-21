/*
  sign-in.js - the /sign-in/ page.

  /sign-in/#/next/athlete/%23/sam-brown   (next: a page of this website, optional;
                                          the page's own # is written %23)

  Signed in already: straight on to `next`, or with no `next`, to the
  person's own page (NCAN.home: admin /admin/, committee /committee-tools/,
  coach /coaches-tools/, family /athletes/). The header's "My pages" link
  comes here for that.

  Not signed in: the sign-in form (NCAN.signIn). The emailed link brings the
  person back to `next`, or to this page, which then sends them on as above.
  The API checks the address again (safe_next) before sending anyone there.

  The pages that need signing in keep their own sign-in box, so nobody loses
  their place; this page is the one address to give people, and the header's
  link.
*/
(function () {
  'use strict';

  var status = document.getElementById('si-status');
  var box = document.getElementById('si-box');

  var next = NCAN.nextFromHash(location.hash);

  function show(note) {
    status.textContent = note || '';
    status.hidden = !note;
    var back = location.protocol + '//' + location.host + (next || '/sign-in/');
    NCAN.signIn(box,
      'Enter the email address the club has for you, and we’ll email you a link to sign in. ' +
      'There is no password. ' + (next ? 'The link brings you back to the page you were on.'
        : 'The link takes you to your own page: your athletes’ results, or your tools.'),
      back, 'Sign in with your email');
    var input = document.getElementById('signin-email');
    if (input) { input.focus(); }
  }

  NCAN.me().then(function (who) {
    if (!who) { return show(''); }
    var to = next || NCAN.home(who);
    status.textContent = 'You’re signed in. Taking you to your page…';
    location.replace(to);
  }, function () {
    show('The club’s sign-in service can’t be reached just now. You can still ask for a link, ' +
         'or try again in a few minutes.');
  });
}());
