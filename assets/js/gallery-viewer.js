/*
  gallery-viewer.js - the photo viewer on the gallery's album pages
  (gallery/<album>/index.html, written by tools/build-gallery.py).

  Each thumbnail links to its full-size photo on the mirror. Selecting one
  opens it in the <dialog id="lightbox"> on the page instead, with the arrow
  keys and buttons stepping through the album. Without <dialog> the links keep
  their plain behaviour and open the photo in a new tab.
*/
(function () {
  'use strict';

  /* Photo viewer --------------------------------------------------- */
  var dialog = document.getElementById('lightbox');

  // Without <dialog> the thumbnails keep their plain behaviour: the link
  // opens the full-size photo in a new tab.
  if (!dialog || typeof dialog.showModal !== 'function') { return; }

  var img = dialog.querySelector('.lightbox__img');
  var text = dialog.querySelector('.lightbox__text');
  var count = dialog.querySelector('.lightbox__count');
  var links = [];
  var index = 0;

  function preload(i) {
    var link = links[i];
    if (link) { new Image().src = link.getAttribute('href'); }
  }

  function show() {
    var link = links[index];
    var caption = link.getAttribute('data-caption') || '';
    img.src = link.getAttribute('href');
    img.alt = link.querySelector('img').alt;
    text.textContent = caption;
    text.hidden = !caption;
    count.textContent = (index + 1) + ' of ' + links.length;
    // the neighbours are almost always where the reader goes next
    preload(index + 1);
    preload(index - 1);
  }

  function step(delta) {
    if (links.length < 2) { return; }
    index = (index + delta + links.length) % links.length;
    show();
  }

  function close() {
    dialog.close();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('.album__grid a');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey ||
        event.button !== 0) {
      return;                       // let modified clicks open a new tab
    }
    event.preventDefault();
    links = Array.prototype.slice.call(
      link.closest('.album__grid').querySelectorAll('a'));
    index = links.indexOf(link);
    show();
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  });

  dialog.addEventListener('click', function (event) {
    var action = event.target.closest('[data-viewer]');
    if (action) {
      var what = action.getAttribute('data-viewer');
      if (what === 'close') { close(); }
      if (what === 'prev') { step(-1); }
      if (what === 'next') { step(1); }
      return;
    }
    // a click on the backdrop - anywhere but the photo itself - closes
    if (!event.target.closest('.lightbox__figure')) { close(); }
  });

  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });

  // Escape closes natively, so undo the scroll lock wherever it came from
  dialog.addEventListener('close', function () {
    document.body.style.overflow = '';
    img.removeAttribute('src');
  });
}());
