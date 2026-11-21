/*
  gallery-viewer.js - the photo viewer on the gallery's album pages
  (gallery/<album>/index.html, written by tools/build-gallery.py).

  Each thumbnail links to its full-size photo on the photo host
  (photos.ncan.nz). Selecting one opens it in the <dialog id="lightbox"> on the
  page instead, with the arrow keys and buttons stepping through the album.
  Without <dialog> the links keep their plain behaviour and open the JPEG in a
  new tab.

  A link may also carry data-webp, the same photo as WebP. The viewer opens
  that when the browser shows WebP, so a browser without it gets the JPEG.

  The download button always gets the full-size JPEG, the file people can
  open anywhere. The photo host is another site, so browsers ignore the
  download attribute on a plain link. Two things get round that, both set up
  in the host's .htaccess (tools/photo-host.htaccess):
  - When the host lets ncan.nz fetch photos (Access-Control-Allow-Origin),
    the viewer fetches the JPEG and saves it straight to the device. One small
    HEAD request, the first time the viewer opens, checks whether it may.
  - Otherwise the link opens the JPEG in a new tab, with ?download=1, which
    the host answers with Content-Disposition: attachment, so it's saved
    anyway. On a host without that rule, the photo just shows, ready to save.
*/
(function () {
  'use strict';

  /* Saving the full-size photo -------------------------------------- */

  // the JPEG's address with download=1 added
  function downloadHref(jpeg) {
    var hash = jpeg.indexOf('#');
    var base = hash < 0 ? jpeg : jpeg.slice(0, hash);
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 'download=1';
  }

  // the file name to save as: the last part of the address, decoded
  function saveName(jpeg) {
    var name = jpeg.split('#')[0].split('?')[0].split('/').pop();
    try { name = decodeURIComponent(name); } catch (e) { /* keep it as is */ }
    return name || 'photo.jpg';
  }

  // Fetch-and-save, for a host that allows it. env holds fetch, URL and
  // document, so the tests can stand in for the browser.
  function makeSaver(env) {
    var state = 'unknown';            // unknown, checking, yes or no
    var usable = !!(env.fetch && env.URL && env.URL.createObjectURL);

    return {
      // may this page fetch photos from the host? Asked once.
      check: function (url) {
        if (!usable || state !== 'unknown') { return Promise.resolve(state === 'yes'); }
        state = 'checking';
        return env.fetch(url, { method: 'HEAD', mode: 'cors', cache: 'no-store' })
          .then(function (r) { state = r.ok ? 'yes' : 'no'; },
                function () { state = 'no'; })
          .then(function () { return state === 'yes'; });
      },
      ready: function () { return state === 'yes'; },
      // fetch the photo and hand it to the browser as a download; resolves
      // true once saved, false if it couldn't be fetched
      save: function (url, name) {
        return env.fetch(url, { mode: 'cors' })
          .then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.blob();
          })
          .then(function (blob) {
            var a = env.document.createElement('a');
            a.href = env.URL.createObjectURL(blob);
            a.download = name;
            a.hidden = true;
            env.document.body.appendChild(a);
            a.click();
            a.remove();
            var t = setTimeout(function () { env.URL.revokeObjectURL(a.href); }, 30000);
            if (t && t.unref) { t.unref(); }    // Node (the tests) needn't wait
            return true;
          }, function () { state = 'no'; return false; });
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { downloadHref: downloadHref, saveName: saveName,
                       makeSaver: makeSaver };
  }
  if (typeof document === 'undefined') { return; }

  /* Photo viewer --------------------------------------------------- */
  var dialog = document.getElementById('lightbox');

  // Without <dialog> the thumbnails keep their plain behaviour: the link
  // opens the full-size photo in a new tab.
  if (!dialog || typeof dialog.showModal !== 'function') { return; }

  var img = dialog.querySelector('.lightbox__img');
  var text = dialog.querySelector('.lightbox__text');
  var count = dialog.querySelector('.lightbox__count');
  var download = dialog.querySelector('.lightbox__download');
  var links = [];
  var index = 0;
  var saver = makeSaver({
    fetch: window.fetch && window.fetch.bind(window),
    URL: window.URL,
    document: document
  });

  // Does this browser show WebP? A 1x1 WebP decides, in the background; until
  // it has, a thumbnail the <picture> already showed as WebP also says yes.
  var webpOK = false;
  var probe = new Image();
  probe.onload = function () { webpOK = probe.width === 1; };
  probe.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

  // the WebP original if this browser shows WebP, otherwise the JPEG
  function full(link) {
    var webp = link.getAttribute('data-webp');
    var thumb = link.querySelector('img');
    var shown = thumb && /\.webp(\?|$)/i.test(thumb.currentSrc || '');
    return webp && (webpOK || shown) ? webp : link.getAttribute('href');
  }

  function preload(i) {
    var link = links[i];
    if (link) { new Image().src = full(link); }
  }

  function show() {
    var link = links[index];
    var caption = link.getAttribute('data-caption') || '';
    img.src = full(link);
    img.alt = link.querySelector('img').alt;
    text.textContent = caption;
    text.hidden = !caption;
    count.textContent = (index + 1) + ' of ' + links.length;
    if (download) {
      var jpeg = link.getAttribute('href');
      download.href = downloadHref(jpeg);
      download.setAttribute('download', saveName(jpeg));
      download.setAttribute('data-jpeg', jpeg);
      saver.check(jpeg);
    }
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
    // the download button: saved straight to the device when the host
    // allows it, otherwise the link opens it in a new tab. The viewer stays
    // open either way.
    var dl = event.target.closest('.lightbox__download');
    if (dl) {
      if (!saver.ready() || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (dl.classList.contains('is-busy')) { return; }
      dl.classList.add('is-busy');
      dl.setAttribute('aria-busy', 'true');
      saver.save(dl.getAttribute('data-jpeg'), dl.getAttribute('download'))
        .then(function (saved) {
          dl.classList.remove('is-busy');
          dl.removeAttribute('aria-busy');
          // couldn't fetch it after all: open it the plain way. A browser
          // may block this as a pop-up, so the next click uses the link.
          if (!saved) { window.open(dl.href, '_blank', 'noopener'); }
        });
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
