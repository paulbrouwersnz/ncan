/*
  anchor-grid.js - "Keep in view": which part of a photo stays in view as a
  heading gets narrower or wider, chosen from a 3 x 3 grid of radio buttons
  (top left ... bottom right), or Custom for a point picked on the photo.

  The value is a CSS focus point, as the API stores it: "0% 0%" (top left),
  "50% 0%" (top centre) ... "100% 100%" (bottom right). A saved focus that isn't
  one of the nine shows as Custom until a grid position is chosen.

  Used by the athlete page's Header photo (athlete-photo.js); kept on its own so
  the admin Header photos editor can use it later, and so the Node tests can
  check it (tests/js/anchor-grid.test.js).

  window.NCANAnchor:
    POSITIONS                    -> [{key, label, focus}], top left first, row by row
    keyOf(focus)                 -> 'top-left' ... 'bottom-right', or 'custom'
                                    (an empty focus is the middle: 'center-center')
    focusOf(key)                 -> '0% 0%' ..., or null for 'custom'/unknown
    parse(focus)                 -> [x, y] in percent, or null
    build(fieldset, name, onPick) -> fills a <fieldset> (with its <legend>) with
                                    the nine radios and Custom; onPick(focus) when
                                    one is chosen. Returns {set(focus), get()}.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANAnchor = api; }
}(this, function () {
  'use strict';

  var ROWS = [['top', 'Top', 0], ['center', 'Middle', 50], ['bottom', 'Bottom', 100]];
  var COLS = [['left', 'left', 0], ['center', 'centre', 50], ['right', 'right', 100]];
  var POSITIONS = [];
  ROWS.forEach(function (r) {
    COLS.forEach(function (c) {
      var label = r[0] === 'center' && c[0] === 'center' ? 'Centre' : r[1] + ' ' + c[1];
      POSITIONS.push({ key: r[0] + '-' + c[0], label: label, focus: c[2] + '% ' + r[2] + '%' });
    });
  });

  var FOCUS = /^(\d{1,3})% (\d{1,3})%$/;

  function parse(focus) {
    var m = FOCUS.exec(typeof focus === 'string' ? focus.trim() : '');
    if (!m) { return null; }
    var x = Number(m[1]), y = Number(m[2]);
    return x <= 100 && y <= 100 ? [x, y] : null;
  }

  function keyOf(focus) {
    if (!focus) { return 'center-center'; }
    var p = parse(focus);
    if (!p) { return 'custom'; }
    for (var i = 0; i < POSITIONS.length; i++) {
      if (POSITIONS[i].focus === p[0] + '% ' + p[1] + '%') { return POSITIONS[i].key; }
    }
    return 'custom';
  }

  function focusOf(key) {
    for (var i = 0; i < POSITIONS.length; i++) {
      if (POSITIONS[i].key === key) { return POSITIONS[i].focus; }
    }
    return null;
  }

  function build(fieldset, name, onPick) {
    var doc = fieldset.ownerDocument;
    var grid = doc.createElement('div');
    grid.className = 'anchor-grid__cells';
    var radios = {};
    var current = '50% 50%';

    function radio(key, label, cls) {
      var wrap = doc.createElement('label');
      wrap.className = cls;
      wrap.title = label;
      var input = doc.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = key;
      var text = doc.createElement('span');
      text.className = cls === 'anchor-grid__cell' ? 'visually-hidden' : '';
      text.textContent = label;
      wrap.appendChild(input);
      if (cls === 'anchor-grid__cell') { wrap.appendChild(doc.createElement('i')); }
      wrap.appendChild(text);
      input.addEventListener('change', function () {
        if (!input.checked || key === 'custom') { return; }
        current = focusOf(key);
        if (onPick) { onPick(current); }
      });
      radios[key] = input;
      return wrap;
    }

    POSITIONS.forEach(function (p) { grid.appendChild(radio(p.key, p.label, 'anchor-grid__cell')); });
    fieldset.appendChild(grid);
    var custom = radio('custom', 'Custom (a point picked on the photo)', 'anchor-grid__custom');
    fieldset.appendChild(custom);

    function set(focus) {
      current = parse(focus) ? focus : '50% 50%';
      var key = keyOf(focus);
      radios.custom.disabled = key !== 'custom';
      custom.hidden = key !== 'custom';
      radios[key].checked = true;
    }
    set(current);
    return { set: set, get: function () { return current; } };
  }

  /* The position ("62% 50%") that puts a photo's focus point in the middle of a
     box it covers (background-size: cover, or object-fit: cover), as near as the
     photo's edges allow. A plain percentage lines the photo's 70% up with the
     box's 70%, which is right for the wide heading but leaves a small round
     profile photo off centre. aspect and box are width / height. */
  function centred(focus, aspect, box) {
    var p = parse(focus) || [50, 50];
    if (!(aspect > 0)) { return p[0] + '% ' + p[1] + '%'; }
    box = box > 0 ? box : 1;
    function one(f, over) {   // over: the photo's size against the box's, along this side
      if (over <= 1.0001) { return 50; }
      var v = (f / 100 * over - 0.5) / (over - 1);
      return Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10;
    }
    return aspect >= box
      ? one(p[0], aspect / box) + '% ' + 50 + '%'
      : 50 + '% ' + one(p[1], box / aspect) + '%';
  }

  return { POSITIONS: POSITIONS, keyOf: keyOf, focusOf: focusOf, parse: parse, build: build, centred: centred };
}));
