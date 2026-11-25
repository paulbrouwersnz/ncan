/*
  athlete-photo.js - the athlete's own photo behind the athlete page's heading
  (/athlete/), and "Profile and header photo" for the people who may change it.
  The same photo is the athlete's round profile photo on My athletes (/me/),
  centred on the same focus point; the editor shows that circle too.

  The photo is private, like the page: the club's API gives it only to someone
  who can see the page (GET /v1/athletes/<address>/photo), so it is fetched
  signed in and shown with NCAN.pageHead.photo (page-photos.js), which keeps it
  over any photo the header photo settings give /athlete/. With no photo of
  their own, the page shows those (or the plain green band).

  The section is shown only when the API says this person may change the photo
  (can_change_photo: the athlete's contacts from GameDay, and admins) or remove
  it (can_remove_photo: they, and coaches). Choosing a photo:

  - the photo is cropped here, in this browser, to the heading's shape (2:1),
    by dragging the frame and zooming; a click in the frame marks what should
    stay in view when a narrow screen shows less of it (the focus point);
  - it is made 1600 pixels across (less if the crop is smaller, never under
    640) and saved as WebP (JPEG where the browser can't), under 600 KB. Drawing
    it afresh leaves out everything else in the file: where and when it was
    taken, the camera. The API checks it again and takes out anything left.
  - the person confirms they have the right to share it and that it shows the
    athlete suitably; it's shown at once (POST .../photo), and the club can see
    who uploaded it and remove it.

  With a photo already there, "Choose a photo" becomes Replace photo: the new one
  takes the old one's place in one step (the heading never goes blank), starting
  from the current "Keep in view". Edit photo changes only what stays in view (a
  3 x 3 grid, anchor-grid.js, or a point clicked on the photo: Custom) and saves
  just that (POST .../photo/settings), with no new upload.

  The same editor, with the same element ids, is the signed-in person's own photo
  on Your profile (/my/profile/, #me-photo): behind the heading of their own pages and
  in the circle beside Your account, seen only by them (GET/POST /v1/me/photo).
  me.js starts it (the ncan:me event) and redraws its circle on ncan:own-photo.
*/
(function () {
  'use strict';

  var section = document.getElementById('ath-photo') || document.getElementById('me-photo');
  var route = /^#\/([a-z0-9]+(?:-[a-z0-9]+)*)/.exec(location.hash);
  if (!section || (section.id === 'ath-photo' && !route)) { return; }
  var own = section.id === 'me-photo';     // the signed-in person's own photo (/me/)
  var $ = function (x) { return document.getElementById(x); };

  var ASPECT = 2;            // width : height of the crop
  var OUT_WIDTH = 1600;      // pixels across, at most
  var MIN_WIDTH = 640;       // the API's least
  var MAX_BYTES = 600 * 1024;

  var who = null;            // NCAN.athlete: slug, name, photo, can_change_photo, can_remove_photo
  var shownUrl = '';         // object URL of the photo shown now
  var crop = null;           // the photo being cropped: {img, w, h, x, y, cw, fx, fy}
  var cropGrid = null;       // "Keep in view" while cropping
  var edit = null;           // Edit photo: {grid, focus}

  function say(words) { $('photo-status').textContent = words || ''; }
  function first() { return (who.name || 'the athlete').split(' ')[0]; }
  function base() { return own ? '/me/photo' : '/athletes/' + who.slug + '/photo'; }
  // /me/: the circle beside Your account follows the photo (me.js)
  function tell(photo) {
    if (own) { document.dispatchEvent(new CustomEvent('ncan:own-photo', { detail: photo })); }
  }

  /* The photo in the heading ------------------------------------------------- */

  function showOwn() {
    if (!who.photo || !who.photo.url) {
      if (shownUrl) { URL.revokeObjectURL(shownUrl); shownUrl = ''; }
      NCAN.pageHead.photo({ release: true });
      tell(null);
      return Promise.resolve();
    }
    return fetch(who.photo.url, { credentials: 'include' })
      .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.blob(); })
      .then(function (blob) {
        if (shownUrl) { URL.revokeObjectURL(shownUrl); }
        shownUrl = URL.createObjectURL(blob);
        NCAN.pageHead.photo({ photo: { src: shownUrl, webp: shownUrl }, focus: who.photo.focus });
        avatarShow($('photo-now-avatar'), shownUrl, who.photo.focus);   // beside Edit photo
        tell({ url: shownUrl, focus: who.photo.focus });
      })
      .catch(function () { /* keep the band as it is */ });
  }

  /* Cropping ------------------------------------------------------------------ */

  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (done, fail) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { done(img); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('not a photo')); };
      img.src = url;
    });
  }

  function largest() { return Math.min(crop.w, crop.h * ASPECT); }
  function clamp() {
    crop.cw = Math.max(Math.min(crop.cw, largest()), Math.min(MIN_WIDTH, largest()));
    crop.x = Math.max(0, Math.min(crop.x, crop.w - crop.cw));
    crop.y = Math.max(0, Math.min(crop.y, crop.h - crop.cw / ASPECT));
  }

  function draw() {
    var cv = $('photo-canvas');
    var box = cv.parentNode.clientWidth || 600;
    var scale = Math.min(box / crop.w, 420 / crop.h);
    var dpr = window.devicePixelRatio || 1;
    cv.style.width = Math.round(crop.w * scale) + 'px';
    cv.style.height = Math.round(crop.h * scale) + 'px';
    cv.width = Math.round(crop.w * scale * dpr);
    cv.height = Math.round(crop.h * scale * dpr);
    crop.scale = scale;
    var s = scale * dpr;
    var g = cv.getContext('2d');
    g.drawImage(crop.img, 0, 0, cv.width, cv.height);
    var fx = crop.x * s, fy = crop.y * s, fw = crop.cw * s, fh = crop.cw / ASPECT * s;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.beginPath();
    g.rect(0, 0, cv.width, cv.height);
    g.rect(fx, fy, fw, fh);
    g.fill('evenodd');
    g.strokeStyle = '#fff';
    g.lineWidth = 2 * dpr;
    g.strokeRect(fx, fy, fw, fh);
    // the focus point
    var px = fx + fw * crop.fx / 100, py = fy + fh * crop.fy / 100;
    g.beginPath();
    g.arc(px, py, 7 * dpr, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fill();
    g.strokeStyle = '#0B3B2E';
    g.stroke();
  }

  function focus() { return Math.round(crop.fx) + '% ' + Math.round(crop.fy) + '%'; }

  // the crop drawn at width w
  function render(w) {
    var c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(w / ASPECT);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(crop.img, crop.x, crop.y, crop.cw, crop.cw / ASPECT, 0, 0, c.width, c.height);
    return c;
  }

  // the heading shows the crop as it will look
  var previewTimer = 0;
  function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var url = render(Math.min(900, crop.cw)).toDataURL('image/jpeg', 0.7);
      NCAN.pageHead.photo({ photo: { src: url, webp: url }, focus: focus() });
      avatarShow($('photo-crop-avatar'), url, focus());
    }, 120);
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (done) { canvas.toBlob(done, type, quality); });
  }

  // WebP (JPEG where the browser can't make WebP), under MAX_BYTES
  function encode() {
    var width = Math.max(MIN_WIDTH, Math.min(OUT_WIDTH, Math.floor(crop.cw)));
    var quality = 0.82;
    function attempt() {
      var canvas = render(width);
      return toBlob(canvas, 'image/webp', quality).then(function (blob) {
        if (!blob || blob.type !== 'image/webp') { return toBlob(canvas, 'image/jpeg', quality); }
        return blob;
      }).then(function (blob) {
        if (!blob) { throw new Error('This browser couldn’t make the photo.'); }
        if (blob.size <= MAX_BYTES) { return blob; }
        if (quality > 0.55) { quality -= 0.1; return attempt(); }
        if (width * 0.8 >= MIN_WIDTH) { width = Math.floor(width * 0.8); quality = 0.75; return attempt(); }
        throw new Error('That photo couldn’t be made small enough; try another.');
      });
    }
    return attempt();
  }

  function startCrop(file) {
    say('Opening the photo…');
    loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (Math.min(w, h * ASPECT) < MIN_WIDTH) {
        say('That photo is too small: choose one at least ' + MIN_WIDTH + ' pixels across (and ' +
          (MIN_WIDTH / ASPECT) + ' high).');
        return;
      }
      // a replacement starts from the current photo's "Keep in view"
      var was = window.NCANAnchor && who.photo ? NCANAnchor.parse(who.photo.focus) : null;
      crop = { img: img, w: w, h: h, fx: was ? was[0] : 50, fy: was ? was[1] : 50 };
      if (cropGrid) { cropGrid.set(focus()); }
      crop.cw = largest();
      crop.x = (w - crop.cw) / 2;
      crop.y = (h - crop.cw / ASPECT) / 2;
      var zoom = $('photo-zoom');
      zoom.min = String(Math.round(MIN_WIDTH));
      zoom.max = String(Math.round(largest()));
      zoom.value = zoom.max;
      zoom.disabled = largest() <= MIN_WIDTH;
      $('photo-crop').hidden = false;
      $('photo-confirm').checked = false;
      $('photo-save').disabled = true;
      say('');
      draw();
      preview();
    }, function () { say('That file couldn’t be opened as a photo. Choose a JPEG, PNG, WebP or HEIC photo.'); });
  }

  function stopCrop() {
    crop = null;
    $('photo-crop').hidden = true;
    $('photo-file').value = '';
    showOwn();
  }

  function setUpCropping() {
    var cv = $('photo-canvas');
    var drag = null;
    cv.addEventListener('pointerdown', function (e) {
      if (!crop) { return; }
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y, moved: false };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) { return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; }
      if (!drag.moved) { return; }
      crop.x = drag.cx + dx / crop.scale;
      crop.y = drag.cy + dy / crop.scale;
      clamp();
      draw();
    });
    cv.addEventListener('pointerup', function (e) {
      if (!drag) { return; }
      if (!drag.moved) {
        // a click: the focus point, if it's in the frame
        var r = cv.getBoundingClientRect();
        var sx = (e.clientX - r.left) / crop.scale, sy = (e.clientY - r.top) / crop.scale;
        var ch = crop.cw / ASPECT;
        if (sx >= crop.x && sx <= crop.x + crop.cw && sy >= crop.y && sy <= crop.y + ch) {
          crop.fx = (sx - crop.x) / crop.cw * 100;
          crop.fy = (sy - crop.y) / ch * 100;
          if (cropGrid) { cropGrid.set(focus()); }
        }
      }
      drag = null;
      draw();
      preview();
    });
    cv.addEventListener('pointercancel', function () { drag = null; });
    // arrow keys move the frame, for those not using a pointer
    cv.addEventListener('keydown', function (e) {
      if (!crop) { return; }
      var step = crop.w / 50;
      var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!moves[e.key]) { return; }
      e.preventDefault();
      crop.x += moves[e.key][0];
      crop.y += moves[e.key][1];
      clamp();
      draw();
      preview();
    });
    $('photo-zoom').addEventListener('input', function () {
      if (!crop) { return; }
      var cx = crop.x + crop.cw / 2, cy = crop.y + crop.cw / ASPECT / 2;
      crop.cw = Number(this.value);
      crop.x = cx - crop.cw / 2;
      crop.y = cy - crop.cw / ASPECT / 2;
      clamp();
      draw();
      preview();
    });
    window.addEventListener('resize', function () { if (crop) { draw(); } });
    if (window.NCANAnchor) {
      cropGrid = NCANAnchor.build($('photo-crop-anchor'), 'photo-crop-anchor', function (f) {
        if (!crop) { return; }
        var p = NCANAnchor.parse(f);
        crop.fx = p[0];
        crop.fy = p[1];
        draw();
        preview();
      });
    } else {
      $('photo-crop-anchor').hidden = true;
    }
  }

  /* Edit photo: only what stays in view --------------------------------------- */

  // the round profile photo (as on /me/): the photo, cropped round and centred on its focus point
  function avatarShow(box, url, focusValue) {
    if (!box) { return; }
    box.style.backgroundImage = 'url("' + url + '")';
    box.style.backgroundPosition = window.NCANAnchor ? NCANAnchor.centred(focusValue, ASPECT, 1) : focusValue || '50% 50%';
  }

  function editShow(focusValue) {
    edit.focus = focusValue;
    var p = NCANAnchor.parse(focusValue) || [50, 50];
    var dot = $('photo-edit-dot');
    dot.style.left = p[0] + '%';
    dot.style.top = p[1] + '%';
    $('photo-edit-phone').style.backgroundPosition = focusValue;
    avatarShow($('photo-edit-avatar'), shownUrl, focusValue);
    // the same photo: only its focus point moves (no fade)
    var head = document.querySelector('.page-head');
    if (head) { head.style.setProperty('--photo-focus', focusValue); }
    $('photo-edit-save').disabled = focusValue === who.photo.focus;
    $('photo-edit-status').textContent = '';
  }

  function openEdit() {
    if (!who.photo || !shownUrl || !window.NCANAnchor) { return; }
    $('photo-edit').hidden = false;
    $('photo-actions').hidden = true;
    $('photo-choose').hidden = true;
    $('photo-edit-img').src = shownUrl;
    $('photo-edit-phone').style.backgroundImage = 'url("' + shownUrl + '")';
    if (!edit) {
      edit = { grid: NCANAnchor.build($('photo-edit-anchor'), 'photo-edit-anchor', editShow) };
      $('photo-edit-full').addEventListener('click', function (e) {
        var r = this.getBoundingClientRect();
        var x = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
        var y = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)));
        var f = x + '% ' + y + '%';
        edit.grid.set(f);
        editShow(f);
      });
      $('photo-edit-save').addEventListener('click', saveEdit);
      $('photo-edit-cancel').addEventListener('click', closeEdit);
    }
    edit.grid.set(who.photo.focus);
    editShow(who.photo.focus || '50% 50%');
    $('photo-edit-save').disabled = true;
  }

  function closeEdit() {
    $('photo-edit').hidden = true;
    showOwn();
    render0();
  }

  function saveEdit() {
    var box = $('photo-edit');
    var said = $('photo-edit-status');
    if (window.FormLock) { FormLock.lock(box, true, 'button, input'); }
    said.classList.add('is-busy', 'lock-keep');
    said.textContent = 'Saving…';
    function done() {
      if (window.FormLock) { FormLock.lock(box, false, 'button, input'); }
      said.classList.remove('is-busy');
    }
    NCAN.send(base() + '/settings', { focus: edit.focus }).then(function (r) {
      done();
      if (r.status === 200 && r.body.photo) {
        who.photo = r.body.photo;
        closeEdit();
        say('Saved: the heading keeps ' + (NCANAnchor.keyOf(who.photo.focus) === 'custom' ? 'the point you picked'
          : 'the ' + labelOf(who.photo.focus).toLowerCase() + ' of the photo') + ' in view.');
      } else {
        said.textContent = (r.body && r.body.error) || 'Sorry, that couldn’t be saved.';
        $('photo-edit-save').disabled = false;
      }
    }, function (err) {
      done();
      said.textContent = err.message || 'Sorry, that couldn’t be saved.';
    });
  }

  function labelOf(focusValue) {
    var key = NCANAnchor.keyOf(focusValue);
    for (var i = 0; i < NCANAnchor.POSITIONS.length; i++) {
      if (NCANAnchor.POSITIONS[i].key === key) { return NCANAnchor.POSITIONS[i].label; }
    }
    return 'Custom';
  }

  /* Saving and removing -------------------------------------------------------- */

  function save() {
    if (!crop || !$('photo-confirm').checked) { return; }
    var btn = $('photo-save');
    btn.disabled = true;
    say('Making the photo…');
    encode().then(function (blob) {
      say('Uploading (' + Math.round(blob.size / 1024) + ' KB)…');
      return NCAN.sendFile(base() + '?confirm=1&focus=' + encodeURIComponent(focus()), blob);
    }).then(function (r) {
      if (r.status === 201 && r.body.photo) {
        who.photo = r.body.photo;
        who.can_remove_photo = who.can_remove_photo || who.can_change_photo;
        crop = null;
        $('photo-crop').hidden = true;
        $('photo-file').value = '';
        showOwn();
        render0();
        say(own ? 'Saved: your photo shows now.' : 'Saved: ' + first() + '’s page shows this photo now.');
      } else {
        btn.disabled = false;
        say((r.body && r.body.error) || 'Sorry, the photo couldn’t be saved.');
      }
    }, function (err) {
      btn.disabled = false;
      say(err.message || 'Sorry, the photo couldn’t be saved.');
    });
  }

  function remove() {
    if (!window.confirm(own ? 'Remove your photo?' : 'Take the photo off ' + first() + '’s page?')) { return; }
    var why = $('photo-why') ? $('photo-why').value.trim() : '';
    say('Removing…');
    NCAN.send(base() + '/remove', why ? { why: why } : {}).then(function (r) {
      if (r.status === 200 || r.status === 404) {
        who.photo = null;
        showOwn();
        render0();
        say('Removed.');
      } else {
        say((r.body && r.body.error) || 'Sorry, that didn’t work.');
      }
    }, function (err) { say(err.message); });
  }

  // the section's state: what's shown now, and what this person can do
  function render0() {
    section.hidden = !(who.can_change_photo || (who.photo && who.can_remove_photo));
    if (section.hidden) { return; }
    $('photo-now').textContent = own
      ? (who.photo ? 'Your photo is behind the heading at the top of this page, and beside Your account.'
        : 'No photo yet: choose one below.')
      : who.photo ? first() + '’s page shows a photo of their own.'
        : 'No photo of ' + first() + '’s own yet' + (who.can_change_photo ? ': choose one below.' : '.');
    $('photo-choose').hidden = !who.can_change_photo;
    $('photo-file-label').textContent = who.photo ? 'Replace photo' : 'Choose a photo';
    $('photo-actions').hidden = !(who.photo && who.can_change_photo && window.NCANAnchor);
    $('photo-remove-row').hidden = !(who.photo && who.can_remove_photo);
    if ($('photo-confirm-name')) { $('photo-confirm-name').textContent = who.name || 'the athlete'; }
  }

  function start(detail) {
    if (who) { return; }
    who = detail;
    showOwn();
    render0();
    $('photo-file').addEventListener('change', function () {
      if (this.files && this.files[0]) { startCrop(this.files[0]); }
    });
    $('photo-confirm').addEventListener('change', function () { $('photo-save').disabled = !this.checked || !crop; });
    $('photo-save').addEventListener('click', save);
    $('photo-cancel').addEventListener('click', function () { say(''); stopCrop(); });
    $('photo-remove').addEventListener('click', remove);
    $('photo-edit-open').addEventListener('click', openEdit);
    setUpCropping();
  }

  if (own) {
    // signed in on /me/: always theirs to change (me.js sends who is signed in)
    document.addEventListener('ncan:me', function (e) {
      start({ photo: e.detail && e.detail.photo, can_change_photo: true, can_remove_photo: true });
    });
    return;
  }
  if (window.NCAN && NCAN.athlete) { start(NCAN.athlete); }
  document.addEventListener('ncan:athlete', function (e) { start(e.detail); });
}());
