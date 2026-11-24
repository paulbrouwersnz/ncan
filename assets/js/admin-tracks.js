/*
  admin-tracks.js - /admin/track-colours/ (club administrators only): the track colours
  Event share cards can be drawn in, and the colour each meeting location's cards start
  on. The sharer can still pick another colour in the card dialog.
    GET  /v1/admin/track-colours                 colours, the default, each location
    POST /v1/admin/track-colours/colour          {name, hex} adds; {id, name, hex} changes
    POST /v1/admin/track-colours/colour/remove   {id}
    POST /v1/admin/track-colours/location        {location, colour} (colour '' clears)
    POST /v1/admin/locations/change              {location, new_location, city}: renames it on
                                                 every meeting at it; new_location '' removes it
  admin.js signs the admin in, then calls AdminTracks.start().
*/
(function () {
  'use strict';

  var $ = function (x) { return document.getElementById(x); };
  var state = { colours: [], locations: [], dflt: 'blue' };

  function el(tag, cls, words) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (words != null) { e.textContent = words; }
    return e;
  }
  function say(id, words) { $(id).textContent = words; }
  function why(r) { return (r.body && r.body.error) || 'Sorry, that didn’t work (' + r.status + ').'; }
  function nameOf(id) {
    var c = state.colours.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : id;
  }

  function load() {
    return NCAN.get('/admin/track-colours').then(function (r) {
      state.colours = r.colours || [];
      state.locations = r.locations || [];
      state.dflt = r['default'] || 'blue';
      drawColours();
      drawLocations();
    });
  }

  function send(path, body, where, done) {
    say(where, 'Saving…');
    return NCAN.send(path, body).then(function (r) {
      if (r.status === 200 || r.status === 201) {
        say(where, typeof done === 'function' ? done(r.body) : done);
        return load();
      }
      say(where, why(r));
    }, function (err) { say(where, err.message); });
  }

  function swatch(hex) {
    var s = el('span', 'track-swatch');
    s.style.background = hex;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  // ---------------------------------------------------------------- the colours
  function drawColours() {
    var ul = $('tracks-colours');
    ul.textContent = '';
    state.colours.forEach(function (c) {
      var li = el('li', 'track-colour');
      var pick = el('input');
      pick.type = 'color'; pick.value = c.hex.toLowerCase();
      pick.setAttribute('aria-label', c.name + ': colour');
      var name = el('input');
      name.type = 'text'; name.value = c.name; name.maxLength = 30;
      name.setAttribute('aria-label', 'Name');
      var save = el('button', 'btn btn--ghost btn--sm', 'Save');
      save.type = 'button'; save.disabled = true;
      function dirty() { save.disabled = name.value.trim() === c.name && pick.value.toUpperCase() === c.hex; }
      name.addEventListener('input', dirty);
      pick.addEventListener('input', dirty);
      save.addEventListener('click', function () {
        save.disabled = true;
        send('/admin/track-colours/colour', { id: c.id, name: name.value, hex: pick.value }, 'tracks-colour-said',
             '“' + name.value.trim() + '” saved.');
      });
      li.appendChild(pick);
      li.appendChild(name);
      li.appendChild(save);
      if (c.id === state.dflt) {
        li.appendChild(el('span', 'access-how', 'Cards start on this when their location has no colour.'));
      } else {
        var used = state.locations.filter(function (l) { return l.colour === c.id; }).length;
        var rm = el('button', 'btn btn--ghost btn--sm', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () {
          var sure = used ? 'Remove “' + c.name + '”? ' + used + (used === 1 ? ' location goes' : ' locations go') +
            ' back to ' + nameOf(state.dflt) + '.' : 'Remove “' + c.name + '”?';
          if (!window.confirm(sure)) { return; }
          rm.disabled = true;
          send('/admin/track-colours/colour/remove', { id: c.id }, 'tracks-colour-said', '“' + c.name + '” removed.');
        });
        li.appendChild(rm);
        if (used) { li.appendChild(el('span', 'access-how', used === 1 ? 'Set for 1 location.' : 'Set for ' + used + ' locations.')); }
      }
      ul.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- the locations
  function drawLocations() {
    var ul = $('tracks-locations');
    ul.textContent = '';
    var shown = state.locations.filter(function (l) { return !$('tracks-unset').checked || !l.colour; });
    if (!state.locations.length) {
      ul.appendChild(el('li', null, 'No meeting has a location yet. Add them on the results sources page.'));
      return;
    }
    if (!shown.length) { ul.appendChild(el('li', null, 'Every location has a colour.')); }
    shown.forEach(function (l, n) {
      var li = el('li', 'track-location');
      var what = el('div', 'track-location__what');
      var id = 'tracks-loc-' + n;
      var label = el('label', null, l.location);
      label.htmlFor = id;
      what.appendChild(label);
      what.appendChild(el('span', 'access-how', [l.city, l.meetings ? (l.meetings === 1 ? '1 meeting' : l.meetings + ' meetings')
        : 'No meeting has this location now'].filter(Boolean).join(' · ')));
      var sel = el('select');
      sel.id = id;
      var none = el('option', null, 'No colour set (' + nameOf(state.dflt) + ')');
      none.value = '';
      sel.appendChild(none);
      state.colours.forEach(function (c) {
        var o = el('option', null, c.name);
        o.value = c.id;
        sel.appendChild(o);
      });
      sel.value = l.colour || '';
      var sw = swatch(colourHex(l.colour));
      sel.addEventListener('change', function () {
        sel.disabled = true;
        sw.style.background = colourHex(sel.value);
        send('/admin/track-colours/location', { location: l.location, colour: sel.value }, 'tracks-location-said',
             sel.value ? l.location + ' starts on ' + nameOf(sel.value) + '.' : l.location + ' has no colour now.')
          .then(function () { sel.disabled = false; });
      });
      var edit = el('button', 'btn btn--ghost btn--sm', 'Edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Edit ' + l.location);
      edit.addEventListener('click', function () { li.replaceWith(editRow(l)); });
      var rm = el('button', 'btn btn--ghost btn--sm', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + l.location);
      rm.addEventListener('click', function () {
        if (!window.confirm(removeWords(l))) { return; }
        rm.disabled = true;
        send('/admin/locations/change', { location: l.location, new_location: '' }, 'tracks-location-said',
             function (b) { return removedWords(l, b); });
      });
      li.appendChild(sw);
      li.appendChild(what);
      li.appendChild(sel);
      li.appendChild(edit);
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }

  // "Remove “QEII”? It comes off 3 meetings and its colour (Red) goes. This can't be undone."
  function removeWords(l) {
    var on = l.meetings ? 'It comes off ' + (l.meetings === 1 ? '1 meeting' : l.meetings + ' meetings') : '';
    var col = l.colour ? 'its colour (' + nameOf(l.colour) + ') goes' : '';
    var what = on && col ? on + ' and ' + col : on || (col && col.charAt(0).toUpperCase() + col.slice(1));
    return 'Remove “' + l.location + '”? ' + (what ? what + '.' : '') + (l.meetings
      ? ' Share cards from ' + (l.meetings === 1 ? 'that meeting' : 'those meetings') + ' won’t show a location.' : '');
  }
  function removedWords(l, b) {
    var n = b.meetings || 0;
    return '“' + l.location + '” removed' + (n ? ' from ' + (n === 1 ? '1 meeting' : n + ' meetings') : '') + '.';
  }
  function changedWords(l, b) {
    var n = b.meetings || 0;
    return (b.location === l.location ? '“' + b.location + '” saved' : '“' + l.location + '” is now “' + b.location + '”') +
      (n ? ' on ' + (n === 1 ? '1 meeting' : n + ' meetings') : '') +
      (b.colour ? ', starting on ' + nameOf(b.colour) : '') + '.';
  }

  // The location's name and city, changed on every meeting at it.
  function editRow(l) {
    var li = el('li', 'track-location track-location--edit');
    var form = el('form', 'access-add');
    form.noValidate = true;
    form.autocomplete = 'off';
    function field(label, value, grow) {
      var p = el('p', 'records-field' + (grow ? ' records-field--grow' : ''));
      var input = el('input');
      input.type = 'text'; input.value = value || ''; input.maxLength = 80;
      input.id = 'tracks-edit-' + label.replace(/\W+/g, '-').toLowerCase();
      var lab = el('label', null, label);
      lab.htmlFor = input.id;
      p.appendChild(lab);
      p.appendChild(input);
      form.appendChild(p);
      return input;
    }
    var name = field('Location', l.location, true);
    var city = field('City and country', l.city, true);
    var save = el('button', 'btn btn--sm', 'Save');
    save.type = 'submit';
    var cancel = el('button', 'btn btn--ghost btn--sm', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', drawLocations);
    form.appendChild(save);
    form.appendChild(cancel);
    li.appendChild(form);
    li.appendChild(el('span', 'access-how', l.meetings
      ? 'Changes ' + (l.meetings === 1 ? 'the 1 meeting' : 'all ' + l.meetings + ' meetings') + ' at “' + l.location + '”.' +
        (l.colour ? ' Its colour moves with it.' : '')
      : 'No meeting has this location now: only its colour moves.'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!name.value.trim()) { say('tracks-location-said', 'Give the location a name, or use Remove.'); return; }
      save.disabled = true;
      send('/admin/locations/change', { location: l.location, new_location: name.value, city: city.value },
           'tracks-location-said', function (b) { return changedWords(l, b); })
        .then(function () { save.disabled = false; });
    });
    setTimeout(function () { name.focus(); }, 0);
    return li;
  }
  function colourHex(id) {
    var c = state.colours.filter(function (x) { return x.id === (id || state.dflt); })[0];
    return c ? c.hex : 'transparent';
  }

  function start() {
    $('tracks').hidden = false;
    $('tracks-unset').addEventListener('change', drawLocations);
    $('tracks-add').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('tracks-add-name').value;
      send('/admin/track-colours/colour', { name: name, hex: $('tracks-add-hex').value }, 'tracks-colour-said', function (b) {
        $('tracks-add-name').value = '';
        return '“' + b.colour.name + '” added.';
      });
    });
    load().catch(function (err) { $('tracks').hidden = true; $('admin-status').hidden = false;
      say('admin-status', err.message || 'Sorry, the track colours could not be loaded.'); });
  }

  window.AdminTracks = { start: start, removeWords: removeWords, changedWords: changedWords,
                         _state: state };
}());
