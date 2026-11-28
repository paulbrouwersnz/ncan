/*
  recap-data.js - the pure parts of meeting recaps (issue #300, phase 1): reading the
  page's address, grouping a meeting's results by event, the highlights suggested to
  the maker (new PBs, medals, club records and first-time events), matching club
  records from assets/data/records.json, the names check, and the 1200 x 630 preview
  card laid out as plain shapes and words (as pb-card.js does), so the Node tests can
  check all of it without a browser (tests/js/recap-data.test.js).

  The pages are recaps/index.html (assets/js/recaps.js), the Share results button on
  results-sources/index.html and admin/recaps/index.html. Everything about who may
  see what (public names, families who opted out) is decided by the API; this file
  only lays out what it's given. No athlete data is in this file.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANRecapData = api; }
}(this, function () {
  'use strict';

  var TITLE_MAX = 100, INTRO_MAX = 600, HIGHLIGHTS_MAX = 12;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MINUS = '−';
  var LANE = '#B5452B';    // the lane stripe when the venue has no track colour: a red-brown track

  /* The page's address ------------------------------------------------------ */

  // "" -> list; "#/12" -> the recap; "#/12/edit" -> the recap maker
  function parseHash(hash) {
    var m = /^#\/([A-Za-z0-9_-]{1,64})(\/edit)?\/?$/.exec(hash || '');
    if (!m) { return { view: 'list' }; }
    return { view: m[2] ? 'edit' : 'recap', id: m[1] };
  }
  function pageHref(id, edit) { return '/recaps/#/' + encodeURIComponent(id) + (edit ? '/edit' : ''); }

  /* Words --------------------------------------------------------------------- */

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function ordinal(n) {
    if (10 <= n % 100 && n % 100 <= 20) { return n + 'th'; }
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  }
  function parts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function longDate(iso) {
    var p = parts(iso);
    return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '';
  }
  function shortDate(iso) {
    var p = parts(iso);
    return p ? p.d + ' ' + SHORT[p.m - 1] + ' ' + p.y : '';
  }
  // "7 November 2026", "7–8 November 2026", "31 October – 1 November 2026"
  function dates(first, last) {
    var a = parts(first), b = parts(last || first);
    if (!a) { return ''; }
    if (!b || first === last || !last) { return longDate(first); }
    if (a.y === b.y && a.m === b.m) { return a.d + '–' + longDate(last); }
    if (a.y === b.y) { return a.d + ' ' + MONTHS[a.m - 1] + ' – ' + longDate(last); }
    return longDate(first) + ' – ' + longDate(last);
  }
  // "Ngā Puna Wai, Christchurch": a trailing ", New Zealand" is left off, as on share cards
  function where(meeting) {
    meeting = meeting || {};
    var tidy = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
    return [tidy(meeting.location), tidy(meeting.city).replace(/,?\s*new zealand$/i, '')]
      .filter(Boolean).join(', ');
  }
  // the line under the title: "7–8 November 2026 · Ngā Puna Wai, Christchurch"
  function meetingLine(meeting) {
    meeting = meeting || {};
    return [dates(meeting.first, meeting.last), where(meeting)].filter(Boolean).join(' · ');
  }
  // "+1.2 m/s", "−0.4 m/s"; '' for no reading, or a field event
  function windWords(r) {
    if (!r || r.field || typeof r.wind !== 'number') { return ''; }
    var w = Math.abs(r.wind) < 0.05 ? 0 : r.wind;
    return (w > 0 ? '+' : w < 0 ? MINUS : '') + Math.abs(w).toFixed(1) + ' m/s';
  }
  // "60m", "Shot Put (3kg)": the implement unless the event already names it
  function eventLabel(r) {
    var e = String((r && r.event) || '').trim(), imp = String((r && r.implement) || '').trim();
    if (imp && squash(e).indexOf(squash(imp)) === -1) { return e + ' (' + imp + ')'; }
    return e;
  }
  // "Grade 11 girls", "U18 boys", "Grade 8"
  function groupLabel(r) {
    if (!r) { return ''; }
    var g = r.grade ? 'Grade ' + r.grade : r.age_group || '';
    return [g, r.gender || ''].filter(Boolean).join(' ');
  }
  function placeWords(r) {
    if (!r || !(r.place >= 1)) { return ''; }
    return ordinal(r.place) + (r.of ? ' of ' + r.of : '');
  }
  var STATES = { draft: 'Draft', 'public': 'Public', removed: 'Taken down' };
  function stateLabel(state) { return STATES[state] || 'Draft'; }

  /* Results by event ----------------------------------------------------------- */

  function squash(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function eventKey(r) { return squash(eventLabel(r).replace(/[()]/g, '')); }

  // within an event: grade (youngest first; age groups after), then girls, boys, then place
  function compareInEvent(a, b) {
    var ga = a.grade || 99, gb = b.grade || 99;
    if (ga !== gb) { return ga - gb; }
    var aa = String(a.age_group || ''), ab = String(b.age_group || '');
    if (aa !== ab) { return aa.localeCompare(ab); }
    var sex = { girls: 0, boys: 1 };
    var sa = a.gender in sex ? sex[a.gender] : 2, sb = b.gender in sex ? sex[b.gender] : 2;
    if (sa !== sb) { return sa - sb; }
    var pa = a.place >= 1 ? a.place : 1e6, pb = b.place >= 1 ? b.place : 1e6;
    if (pa !== pb) { return pa - pb; }
    return String(a.athlete || '').localeCompare(String(b.athlete || ''));
  }

  /* The results grouped by event, in the order the API sent them (the meeting's
     running order): [{ key, label, results }]. Inside each event, sorted by grade,
     gender and place (the API's order too, but checked here). */
  function groupByEvent(results) {
    var out = [], by = {};
    (results || []).forEach(function (r, i) {
      if (!r) { return; }
      var k = eventKey(r);
      if (!by[k]) { by[k] = { key: k, label: eventLabel(r), results: [] }; out.push(by[k]); }
      by[k].results.push({ r: r, i: i });
    });
    out.forEach(function (g) {
      g.results.sort(function (a, b) { return compareInEvent(a.r, b.r) || a.i - b.i; });
      g.results = g.results.map(function (x) { return x.r; });
    });
    return out;
  }

  /* Club records ----------------------------------------------------------------
     A result is a club record when assets/data/records.json has a record set at
     this meeting (its source is this meeting's AthleticLIVE address, ".../meets/N"
     or a result in it) for the same event, grade and gender, with the same
     performance as the result's mark. */
  function meetOf(url) {
    var m = /\/meets\/(\d+)(?:[/?#]|$)/.exec(url || '');
    return m ? +m[1] : null;
  }
  // "Shot Put 3 kg" and "Shot Put" with implement "3kg" are one event
  function recordEvent(e) { return squash(e).replace(/[()]/g, '').replace(/hurdles/g, 'hurdle'); }
  function markKey(s) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '').replace(/(m|s|w)$/, '');
    return /^\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s;
  }
  function recordKey(grade, gender, event, mark) {
    return [grade, String(gender || '').toLowerCase(), recordEvent(event), markKey(mark)].join('|');
  }
  // the records set at meeting `meet`, as keys for isClubRecord
  function recordKeys(records, meet) {
    var keys = {};
    if (!meet) { return keys; }
    var list = records && records.records ? records.records : records;
    (list || []).forEach(function (rec) {
      if (rec && rec.source && meetOf(rec.source) === +meet && rec.grade) {
        keys[recordKey(rec.grade, rec.gender, rec.event, rec.performance)] = true;
      }
    });
    return keys;
  }
  function isClubRecord(r, keys) {
    if (!r || !r.grade || !keys) { return false; }
    return !!keys[recordKey(r.grade, r.gender, eventLabel(r), r.mark)];
  }

  /* Highlights ------------------------------------------------------------------ */

  // why a result stands out, most important first: ['record', 'medal', 'pb', 'first']
  function reasons(r, keys) {
    var out = [];
    if (isClubRecord(r, keys)) { out.push('record'); }
    if (r.medal >= 1 && r.medal <= 3) { out.push('medal'); }
    if (r.pb === 'new') { out.push('pb'); }
    if (r.pb === 'first') { out.push('first'); }
    return out;
  }
  // the words on a chip: "Club record", "1st", "PB", "First time"
  function chipWords(reason, r) {
    if (reason === 'record') { return 'Club record'; }
    if (reason === 'medal') { return ordinal(r.medal); }
    if (reason === 'pb') { return 'PB'; }
    if (reason === 'first') { return 'First time'; }
    return '';
  }
  var RANK = { record: 0, medal: 1, pb: 2, first: 3 };

  /* The results worth a highlight, best first: club records, then medals (gold
     first), then new PBs, then first times; otherwise in the API's order.
     [{ key, result, reasons }]. keys: from recordKeys. */
  function suggest(results, keys) {
    var out = [];
    (results || []).forEach(function (r, i) {
      if (!r || !r.key) { return; }
      var why = reasons(r, keys);
      if (why.length) { out.push({ key: r.key, result: r, reasons: why, i: i }); }
    });
    out.sort(function (a, b) {
      var ra = RANK[a.reasons[0]], rb = RANK[b.reasons[0]];
      if (ra !== rb) { return ra - rb; }
      if (a.reasons[0] === 'medal' && a.result.medal !== b.result.medal) { return a.result.medal - b.result.medal; }
      return a.i - b.i;
    });
    return out.map(function (x) { return { key: x.key, result: x.result, reasons: x.reasons }; });
  }

  /* Ticking a highlight: the picks in the order they were ticked, up to 12.
     { picked, full } - full: the most there can be, so others can't be ticked. */
  function toggle(picked, key, on) {
    var out = (picked || []).filter(function (k) { return k !== key; });
    if (on && out.length < HIGHLIGHTS_MAX) { out.push(key); }
    return { picked: out, full: out.length >= HIGHLIGHTS_MAX };
  }

  // a highlight card is yellow for a club record or a medal, green for a PB or first time
  function cardTone(why) { return why[0] === 'record' || why[0] === 'medal' ? 'yellow' : 'green'; }

  /* Names check -------------------------------------------------------------------
     How the public sees athletes' names, as the recap's maker chooses (the API
     applies it): first names (the default), initial and surname, or full names. */
  var NAME_STYLES = [
    { id: 'first', label: 'First name', example: 'Sam', words: 'their first name',
      longer: 'with the surname’s initial or full name, to tell two athletes apart' },
    { id: 'initial', label: 'Initial and surname', example: 'S Brown', words: 'an initial and surname',
      longer: 'more of the first name, to tell two athletes apart' },
    { id: 'full', label: 'Full name', example: 'Sam Brown', words: 'full names', longer: '' }
  ];
  function nameStyle(id) {
    for (var i = 0; i < NAME_STYLES.length; i++) { if (NAME_STYLES[i].id === id) { return NAME_STYLES[i]; } }
    return NAME_STYLES[0];
  }
  /* Each athlete in the recap once: { name (full, as staff see it), shown (what the
     public will see), longer (more is shown than the style usually shows, because
     two athletes in the recap would otherwise read the same) }, sorted by the name
     shown. style: the recap's names ('first' when not given). */
  function namesCheck(results, style) {
    style = nameStyle(style).id;
    var out = [], seen = {};
    (results || []).forEach(function (r) {
      if (!r) { return; }
      var name = String(r.athlete || '').trim(), shown = String(r.public_name || r.athlete || '').trim();
      var k = name + '|' + shown;
      if (!name || seen[k]) { return; }
      seen[k] = true;
      var words = shown.split(/\s+/);
      var longer = style === 'first' ? words.length > 1
        : style === 'initial' ? (words[0] || '').length > 1 && shown !== name : false;
      out.push({ name: name, shown: shown, longer: longer });
    });
    out.sort(function (a, b) {
      if (style !== 'initial') { return a.shown.localeCompare(b.shown) || a.name.localeCompare(b.name); }
      var sa = a.shown.split(/\s+/), sb = b.shown.split(/\s+/);
      var la = sa.slice(1).join(' '), lb = sb.slice(1).join(' ');
      return la.localeCompare(lb) || a.shown.localeCompare(b.shown) || a.name.localeCompare(b.name);
    });
    return out;
  }
  function excludedWords(n) {
    if (!(n > 0)) { return ''; }
    return n === 1 ? '1 athlete isn’t shown because their family opted out.'
      : n + ' athletes aren’t shown because their families opted out.';
  }

  /* Results sources: which recap a meeting has --------------------------------------
     recaps: GET /v1/recaps (staff get drafts too). A meeting from AthleticLIVE matches
     on its number, one entered by hand on its name. */
  function recapFor(recaps, m) {
    if (!m) { return null; }
    var meet = m.from === 'AthleticLIVE' ? meetOf(m.link) : null;
    var hit = null;
    (recaps || []).forEach(function (s) {
      var sm = (s && s.meeting) || {};
      if (hit || (s.state !== 'draft' && s.state !== 'public')) { return; }
      if (meet ? sm.meet === meet : (!sm.meet && sm.hand && sm.hand === m.name)) { hit = s; }
    });
    return hit;
  }
  // what POST /v1/recaps is sent for a meeting on Results sources
  function startBody(m) {
    var meet = m && m.from === 'AthleticLIVE' ? meetOf(m.link) : null;
    return meet ? { meet: meet } : { meeting: m ? m.name : '' };
  }

  /* The intro as paragraphs: a blank line starts a new one, a single newline is kept
     as a line break. [[line, line], [line]] */
  function paragraphs(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(function (p) {
      return p.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    }).filter(function (p) { return p.length; });
  }

  // the title and intro as they'll be sent, and what's wrong with them
  function checkHeadline(title, intro) {
    var t = String(title || '').replace(/\s+/g, ' ').trim();
    var i = String(intro || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
    var error = !t ? 'Give the recap a title.'
      : t.length > TITLE_MAX ? 'The title can be up to ' + TITLE_MAX + ' characters.'
      : i.length > INTRO_MAX ? 'The intro can be up to ' + INTRO_MAX + ' characters.' : '';
    return { title: t, intro: i, error: error };
  }

  // a track colour as #RRGGBB, or the default
  function laneColour(meeting) {
    var hex = meeting && meeting.track && meeting.track.hex;
    return /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.toUpperCase() : LANE;
  }

  /* Admin page filter: 'live' (drafts and public), 'review' (public, three seasons
     old: needs a look), 'gone' (taken down) or 'all', and words to find (title,
     meeting, who made it). */
  function adminPick(list, show, words) {
    var q = String(words || '').trim().toLowerCase();
    return (list || []).filter(function (s) {
      var live = s.state === 'draft' || s.state === 'public';
      if (show === 'live' && !live) { return false; }
      if (show === 'gone' && live) { return false; }
      if (show === 'review' && !s.needs_review) { return false; }
      if (!q) { return true; }
      return [s.title, s.meeting && s.meeting.name, s.by].some(function (x) {
        return x && String(x).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  /* The preview card ------------------------------------------------------------------
     1200 x 630 (drawn at 2x from 600 x 315 points): the crest, the meeting's name,
     where and when, three counts and the lane stripe in the track colour. */
  var CARD = { w: 600, h: 315, scale: 2 };
  var COLOURS = { bg: '#0B3B2E', bg2: '#0F4C39', gold: '#FFC629', text: '#FFFFFF', soft: '#B8D4C8', line: '#FFFFFF' };

  // split words over at most `lines` lines of about `width` characters; the last one
  // takes what's left (the canvas squeezes it to fit)
  function wrap(words, width, lines) {
    var w = String(words || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var out = [], line = '';
    w.forEach(function (word) {
      if (out.length === lines - 1) { line = line ? line + ' ' + word : word; return; }
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else { line = line ? line + ' ' + word : word; }
    });
    if (line) { out.push(line); }
    return out;
  }

  function cardFacts(data) {
    data = data || {};
    var recap = data.recap || {}, meeting = data.meeting || {}, c = data.counts || {};
    return {
      title: recap.title || meeting.name || 'Meeting results',
      line: meetingLine(meeting),
      lane: laneColour(meeting),
      counts: [
        { n: c.pbs || 0, words: c.pbs === 1 ? 'PB' : 'PBs' },
        { n: c.medals || 0, words: c.medals === 1 ? 'Medal' : 'Medals' },
        { n: c.athletes || 0, words: c.athletes === 1 ? 'Athlete' : 'Athletes' }
      ]
    };
  }

  /* The card as shapes and words, in points: { w, h, scale, items }. Text items have
     x, y (the baseline), size, weight, font ('display' or 'sans'), colour, align and
     max (the widest it may be). */
  function cardLayout(f) {
    var W = CARD.w, H = CARD.h, pad = 36, lane = 30, items = [];
    var t = function (words, x, y, size, o) {
      if (words === '' || words == null) { return; }
      o = o || {};
      items.push({ kind: 'text', words: String(words), x: x, y: y, size: size, weight: o.weight || 400,
                   font: o.font || 'sans', colour: o.colour || COLOURS.text, align: o.align || 'left',
                   max: o.max || W - 2 * pad, spacing: o.spacing || 0 });
    };
    items.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, colour: COLOURS.bg });
    // the lane stripe along the bottom, in the venue's track colour, with its lane lines
    var ly = H - lane;
    items.push({ kind: 'rect', x: 0, y: ly, w: W, h: lane, colour: f.lane || LANE });
    [0, lane / 2, lane - 1.5].forEach(function (y) {
      items.push({ kind: 'rect', x: 0, y: ly + y, w: W, h: 1.5, colour: COLOURS.line });
    });

    t('MEETING RESULTS', pad, 50, 15, { weight: 800, font: 'display', colour: COLOURS.gold, spacing: 2 });
    var lines = wrap(f.title, 30, 2), size = lines.length > 1 ? 30 : 36, y = lines.length > 1 ? 88 : 94;
    lines.forEach(function (l, i) { t(l, pad, y + i * (size + 4), size, { weight: 800, font: 'display' }); });
    y += (lines.length - 1) * (size + 4);
    t(f.line, pad, y + 26, 14, { colour: COLOURS.soft });

    // the three counts, in a lighter band
    var by = 158, bh = 70, cw = (W - 2 * pad) / 3;
    items.push({ kind: 'rect', x: pad, y: by, w: W - 2 * pad, h: bh, colour: COLOURS.bg2, round: 10 });
    (f.counts || []).slice(0, 3).forEach(function (c, i) {
      var cx = pad + cw * i + cw / 2;
      t(String(c.n), cx, by + 40, 34, { weight: 800, font: 'display', colour: COLOURS.gold, align: 'center', max: cw - 16 });
      t(c.words, cx, by + 60, 13, { weight: 600, colour: COLOURS.soft, align: 'center', max: cw - 16 });
    });

    // the club's crest and name, and ncan.nz
    var lh = 36, cy = ly - 14 - lh;
    items.push({ kind: 'logo', x: pad, y: cy, h: lh, w: lh * 888 / 508 });
    t('North Canterbury', pad + lh * 888 / 508 + 10, cy + lh * 0.48, 13, { weight: 700, font: 'display', max: 200 });
    t('Athletic Club', pad + lh * 888 / 508 + 10, cy + lh * 0.88, 13, { weight: 700, font: 'display', max: 200 });
    t('ncan.nz', W - pad, cy + lh * 0.7, 14, { weight: 600, colour: COLOURS.soft, align: 'right', max: 120 });
    return { w: W, h: H, scale: CARD.scale, items: items };
  }

  return {
    TITLE_MAX: TITLE_MAX, INTRO_MAX: INTRO_MAX, HIGHLIGHTS_MAX: HIGHLIGHTS_MAX, CARD: CARD, COLOURS: COLOURS,
    parseHash: parseHash, pageHref: pageHref, plural: plural, ordinal: ordinal, longDate: longDate,
    shortDate: shortDate, dates: dates, where: where, meetingLine: meetingLine, windWords: windWords,
    eventLabel: eventLabel, groupLabel: groupLabel, placeWords: placeWords, stateLabel: stateLabel,
    groupByEvent: groupByEvent, meetOf: meetOf, recordKeys: recordKeys, isClubRecord: isClubRecord,
    reasons: reasons, chipWords: chipWords, suggest: suggest, toggle: toggle, cardTone: cardTone,
    namesCheck: namesCheck, NAME_STYLES: NAME_STYLES, nameStyle: nameStyle, excludedWords: excludedWords, recapFor: recapFor, startBody: startBody,
    paragraphs: paragraphs, checkHeadline: checkHeadline, laneColour: laneColour, adminPick: adminPick,
    wrap: wrap, cardFacts: cardFacts, cardLayout: cardLayout
  };
}));
