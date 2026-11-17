/*
  theme.js - the "Switch to dark mode" / "Switch to light mode" button in the footer.

  The site follows the device's light or dark setting. The button picks the other
  one, remembered in this browser (localStorage 'ncan-theme'), by setting
  data-theme="light" or "dark" on <html>; an inline script in partials/head.html
  does that again on every page before it draws, so it doesn't flash. Picking the
  same as the device's setting forgets the choice, so the site follows the device
  again. The colours themselves are in styles.css ("Dark mode").

  Browsers too old for the dark colours (CSS light-dark()) don't get the button.
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var button = document.getElementById('theme-switch');
  if (!button || !window.CSS || !CSS.supports('color', 'light-dark(#000, #fff)') || !window.matchMedia) { return; }
  var device = window.matchMedia('(prefers-color-scheme: dark)');

  function shown() { return root.getAttribute('data-theme') || (device.matches ? 'dark' : 'light'); }
  function label() { button.textContent = shown() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; }
  function remember(choice) {
    try {
      if (choice) { localStorage.setItem('ncan-theme', choice); } else { localStorage.removeItem('ncan-theme'); }
    } catch (e) { /* private browsing: works for this page only */ }
  }

  button.addEventListener('click', function () {
    var next = shown() === 'dark' ? 'light' : 'dark';
    if (next === (device.matches ? 'dark' : 'light')) {
      root.removeAttribute('data-theme');
      remember(null);
    } else {
      root.setAttribute('data-theme', next);
      remember(next);
    }
    label();
  });
  // the device switching (e.g. at sunset) changes the page, and so the button's words
  if (device.addEventListener) { device.addEventListener('change', label); }

  label();
  button.hidden = false;
}());
