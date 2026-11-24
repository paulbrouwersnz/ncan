/* Season collector cards ---------------------------------------------------
   A trading card of one athlete's season, made on this device from the athlete
   page (assets/js/athlete.js: the Season card button on each season's band).

   Two sides, each saved on its own:
   - the photo side: the athlete's photo in a metallic frame (chrome, gold,
     rainbow holo, club green or onyx), the club crest, the season badge, a
     Rookie Card badge in their first season, and their name on a slanted
     nameplate. The photo can be given a look: chrome, cartoon, comic book, pop
     art, pencil sketch, vintage, noir, neon, heat map or 8-bit.
   - the stats side: the season in numbers, as on the back of a baseball card:
     each event's starts, season best, personal best, wins and top-three
     places, with a totals row; cross country, road and relay races; a few
     highlights; and a "Did you know?" fact.
   With no photo, there is only the stats side.

   Nothing leaves the device: the photo is read here, and the card is saved or
   shared from here. The words and the photo looks are plain functions, so
   tests/js/season-card.test.js runs them without a browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.NCANSeasonCard = api; }
}(this, function () {
  'use strict';

  var W = 750, H = 1050, SCALE = 2;    // a 5:7 card, drawn at 1500 x 2100
  var C = { ink: '#062A20', green: '#0B3B2E', green2: '#0F4C39', leaf: '#1E7A4F', gold: '#FFC629',
            goldSoft: '#FFD75E', cream: '#FFF6DA', paper: '#F6ECD2', soft: '#B8D4C8', red: '#C8102E' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MINUS = '−';

  /* The frame's metal. stops: the brushed metal, light and dark in turn; holo: how
     much rainbow is laid over it; line: the frame's inner edge; badge: the
     colour inside the season badge. */
  var FINISHES = [
    { id: 'chrome', name: 'Chrome', stops: ['#F7F9FB', '#8F9BA7', '#FFFFFF', '#66727E', '#DDE3EA', '#87939F', '#F2F5F8'],
      holo: 0.42, line: '#3E4A55', badge: '#0B3B2E', swatch: 'linear-gradient(135deg,#f7f9fb,#8f9ba7 40%,#fff 55%,#66727e)' },
    { id: 'gold', name: 'Gold', stops: ['#FFF3C4', '#C9970F', '#FFE680', '#8F6A0C', '#F7D55A', '#A87B0B', '#FFEFB0'],
      holo: 0.16, line: '#5E4506', badge: '#0B3B2E', swatch: 'linear-gradient(135deg,#fff3c4,#c9970f 40%,#ffe680 55%,#8f6a0c)' },
    { id: 'holo', name: 'Rainbow holo', stops: ['#F4F6FA', '#A5AEBA', '#FFFFFF', '#7C8794', '#E6EBF1', '#9AA4B0', '#F4F6FA'],
      holo: 0.95, line: '#3E4A55', badge: '#1B1F4A', swatch: 'linear-gradient(135deg,#ff6b9d,#ffd36b 25%,#7dffb0 50%,#6bc6ff 75%,#c58bff)' },
    { id: 'emerald', name: 'Club green', stops: ['#3DBA7C', '#0B3B2E', '#5BD293', '#0F4C39', '#2A9A63', '#062A20', '#3DBA7C'],
      holo: 0.2, line: '#FFC629', badge: '#062A20', swatch: 'linear-gradient(135deg,#3dba7c,#0b3b2e 40%,#5bd293 55%,#062a20)' },
    { id: 'onyx', name: 'Onyx', stops: ['#4A5056', '#0C0D0E', '#6A7177', '#141516', '#33383C', '#050505', '#4A5056'],
      holo: 0.3, line: '#FFC629', badge: '#000000', swatch: 'linear-gradient(135deg,#4a5056,#0c0d0e 40%,#6a7177 55%,#050505)' }
  ];
  function finishOf(id) { return FINISHES.filter(function (f) { return f.id === id; })[0] || FINISHES[0]; }

  // the photo's looks, in the order they're offered
  var FILTERS = [
    { id: 'natural', name: 'Natural' }, { id: 'chrome', name: 'Chrome' }, { id: 'gold', name: 'Gold rush' },
    { id: 'cartoon', name: 'Cartoon' }, { id: 'comic', name: 'Comic book' }, { id: 'pop', name: 'Pop art' },
    { id: 'sketch', name: 'Pencil sketch' }, { id: 'vintage', name: 'Vintage' }, { id: 'noir', name: 'Noir' },
    { id: 'neon', name: 'Neon' }, { id: 'thermal', name: 'Heat map' }, { id: 'pixel', name: '8-bit' }
  ];
  function lookName(id) { return (FILTERS.filter(function (x) { return x.id === id; })[0] || FILTERS[0]).name; }

  /* The words --------------------------------------------------------------- */

  function ordinal(n) {
    if (10 <= n % 100 && n % 100 <= 20) { return n + 'th'; }
    return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  }
  function day(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? +p[2] + ' ' + MONTHS[+p[1] - 1] : '';
  }
  function plural(n, one, more) { return n + ' ' + (n === 1 ? one : (more || one + 's')); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // a run's distance in metres from its name: '100m', '80m Hurdles', '1500m Walk', 'Cross country 3 km'
  function metresOf(event) {
    var s = String(event || '');
    var km = /(\d+(?:\.\d+)?)\s*km\b/i.exec(s);
    if (km) { return Math.round(+km[1] * 1000); }
    var m = /(\d+)\s*m\b/i.exec(s);
    if (m) { return +m[1]; }
    return /\bmile\b/i.test(s) ? 1609 : 0;
  }
  // the kind of event: the photo side's position tag, and the Did you know? fact
  function groupOf(event) {
    var s = String(event || '');
    if (/shot|discus|javelin|hammer|vortex|weight/i.test(s)) { return 'Throws'; }
    if (/jump|vault/i.test(s)) { return 'Jumps'; }
    if (/hurdle|steeple/i.test(s)) { return 'Hurdles'; }
    if (/walk/i.test(s)) { return 'Walks'; }
    if (/cross country/i.test(s)) { return 'Cross country'; }
    if (/road/i.test(s)) { return 'Road'; }
    if (/relay/i.test(s)) { return 'Relays'; }
    var m = metresOf(s);
    if (!m) { return 'Athletics'; }
    return m <= 400 ? 'Sprints' : m <= 1500 ? 'Middle distance' : 'Distance';
  }

  // a mark's change for the better: '−0.42s' for a time, '+35cm' or '+1.20m' for a distance
  function gain(now, was, field) {
    if (typeof now !== 'number' || typeof was !== 'number') { return ''; }
    var d = field ? now - was : was - now;
    if (!(d > 0.0001)) { return ''; }
    if (field) { return d < 1 ? '+' + Math.round(d * 100) + 'cm' : '+' + d.toFixed(2) + 'm'; }
    return MINUS + (d < 10 ? d.toFixed(2) : d.toFixed(1)) + 's';
  }

  /* The card's facts, from the season as athlete.js gives it:
       { name, surname, season, cardNo, rookie, grade, meetings, upTo,
         events: [{ event, field, starts, sb: { mark, value } | null, pb: { mark } | null,
                    pbBefore: { mark, value } | null, newPbs, wins, podiums,
                    points: [{ value, date, pb }] }],
         races: [{ date, race, kind, mark, place, of, team }] }
     events in a meeting's running order; races newest first. */
  /* Which parts of a season ('2025/26': 1 April 2025 to 31 March 2026) have
     finished by today, an ISO day: cross country, road and relays run through
     the winter, so their card opens on 1 October; track and field runs through
     the summer, so its card (and Both) opens on 1 April, when the season ends.
     { oos, track, oosFrom, trackFrom } */
  var FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // '2026-04-01' → '1 April 2026'
  function dayText(day) {
    var p = String(day || '').split('-');
    return p.length === 3 ? +p[2] + ' ' + FULL_MONTHS[+p[1] - 1] + ' ' + p[0] : '';
  }
  function ready(season, today) {
    var s = parseInt(String(season || ''), 10);
    if (!s) { return { oos: true, track: true, oosFrom: '', trackFrom: '' }; }
    var oosFrom = s + '-10-01', trackFrom = (s + 1) + '-04-01';
    return { oos: !today || today >= oosFrom, track: !today || today >= trackFrom, oosFrom: oosFrom, trackFrom: trackFrom };
  }
  /* Whether a season's card can be made yet: a finished part with results in it. */
  function canMake(season, today, hasTrack, hasOos) {
    var r = ready(season, today);
    return (r.track && !!hasTrack) || (r.oos && !!hasOos);
  }
  /* The events to choose a signature event from: most starts first, then most
     new PBs, then running order (the sort keeps it). The first is the default. */
  function signatureChoices(events) {
    return (events || []).slice().sort(function (x, y) {
      return (y.starts || 0) - (x.starts || 0) || (y.newPbs || 0) - (x.newPbs || 0);
    });
  }
  function facts(a) {
    a = a || {};
    var names = String(a.name || '').trim().split(/\s+/);
    var first = names[0] || 'Athlete', last = names.slice(1).join(' ');
    var events = (a.events || []).slice(), races = (a.races || []).slice();
    var sum = function (list, k) { return list.reduce(function (t, e) { return t + (e[k] || 0); }, 0); };
    var solo = races.filter(function (r) { return !r.team; });
    var totals = {
      starts: sum(events, 'starts') + races.length,
      wins: sum(events, 'wins') + solo.filter(function (r) { return r.place === 1; }).length,
      podiums: sum(events, 'podiums') + solo.filter(function (r) { return r.place >= 1 && r.place <= 3; }).length,
      newPbs: sum(events, 'newPbs'),
      events: events.length,
      races: races.length,
      meetings: a.meetings || 0
    };
    // the signature event: the one chosen, or by default the first by starts
    var byStarts = signatureChoices(events);
    var sig = byStarts.filter(function (e) { return e.event === a.signature; })[0] || byStarts[0] || null;
    return {
      first: first, last: last, name: a.surname && last ? first + ' ' + last : first,
      season: a.season || '', cardNo: pad2(+a.cardNo || 1), rookie: !!a.rookie, grade: a.grade || '',
      upTo: a.upTo || '', events: events, races: races, totals: totals, signature: sig,
      position: sig ? groupOf(sig.event) : races.length ? groupOf(races[0].kind || races[0].race) : 'Athletics',
      highlights: highlights(a, events, races, totals),
      fact: funFact(events, races)
    };
  }

  // two or three lines about the season, the biggest news first
  function highlights(a, events, races, totals) {
    var out = [];
    // the biggest PB gain, as a share of the old PB
    var big = null;
    events.forEach(function (e) {
      if (!e.newPbs || !e.sb || !e.pbBefore) { return; }
      var g = gain(e.sb.value, e.pbBefore.value, e.field);
      if (!g) { return; }
      var share = Math.abs(e.sb.value - e.pbBefore.value) / Math.abs(e.pbBefore.value || 1);
      if (!big || share > big.share) { big = { e: e, g: g, share: share }; }
    });
    if (big) {
      out.push((big.e.field ? 'Added ' + big.g.slice(1) + ' to the ' : 'Took ' + big.g.slice(1) + ' off the ') +
               big.e.event + ' PB: ' + big.e.pbBefore.mark + ' to ' + big.e.sb.mark + '.');
    }
    var pbEvents = events.filter(function (e) { return e.newPbs; }).length;
    if (totals.newPbs) {
      out.push('Set ' + plural(totals.newPbs, 'personal best') + (pbEvents > 1 ? ' in ' + pbEvents + ' events' : '') + '.');
    }
    if (totals.wins) {
      out.push(plural(totals.wins, 'win') + (totals.podiums > totals.wins ? ' and ' + plural(totals.podiums, 'top-three finish', 'top-three finishes') : '') + '.');
    } else if (totals.podiums) {
      out.push(plural(totals.podiums, 'top-three finish', 'top-three finishes') + '.');
    }
    var bestRace = races.filter(function (r) { return r.place >= 1 && !r.team; })
      .sort(function (x, y) { return x.place - y.place; })[0];
    if (bestRace && out.length < 3) {
      out.push('Best ' + String(bestRace.kind || 'race').toLowerCase() + ' finish: ' + ordinal(bestRace.place) +
               (bestRace.of ? ' of ' + bestRace.of : '') + ', ' + bestRace.race + '.');
    }
    if (a.rookie && out.length < 3) { out.push('A first season of published results: the first card of the collection.'); }
    if (out.length < 2 && totals.starts) {
      var busy = events.slice().sort(function (x, y) { return (y.starts || 0) - (x.starts || 0); })[0];
      if (busy && busy.starts > 1) { out.push('Busiest event: the ' + busy.event + ', with ' + plural(busy.starts, 'start') + '.'); }
      else { out.push(plural(totals.starts, 'start') + (totals.meetings ? ' over ' + plural(totals.meetings, 'meeting') : '') + '.'); }
    }
    return out.slice(0, 3);
  }

  /* "Did you know?": how far they ran, threw or jumped this season, in all, in
     something a child can picture. { icon: 'run' | 'throw' | 'jump' | 'star', words } */
  function funFact(events, races) {
    var ran = 0, thrown = 0, jumped = 0, throws = 0;
    events.forEach(function (e) {
      var g = groupOf(e.event);
      if (g === 'Throws') {
        (e.points || []).forEach(function (p) { if (typeof p.value === 'number') { thrown += p.value; throws++; } });
      } else if (g === 'Jumps') {
        if (!/high|vault/i.test(e.event)) { (e.points || []).forEach(function (p) { if (typeof p.value === 'number') { jumped += p.value; } }); }
      } else {
        ran += metresOf(e.event) * (e.starts || 0);
      }
    });
    races.forEach(function (r) { ran += metresOf(r.race); });
    if (ran >= 400) {
      var laps = ran / 400;
      return { icon: 'run', words: 'Raced ' + (ran >= 1000 ? (ran / 1000).toFixed(1).replace(/\.0$/, '') + ' km' : ran + ' m') +
        ' in competition this season: ' + (laps >= 2 ? 'that’s ' + Math.round(laps) + ' laps of a track.' : 'more than a lap of a track.') };
    }
    if (thrown >= 10) {
      var fields = thrown / 100;
      return { icon: 'throw', words: 'Threw a combined ' + Math.round(thrown) + ' m in ' + plural(throws, 'throw') + ': ' +
        (fields >= 1 ? 'about ' + (Math.round(fields * 10) / 10) + ' rugby fields, try line to try line.' : 'a long way to fetch them all back.') };
    }
    if (jumped >= 5) {
      return { icon: 'jump', words: 'Jumped a combined ' + jumped.toFixed(1) + ' m: longer than ' +
        (jumped >= 12 ? plural(Math.floor(jumped / 12), 'city bus', 'city buses') + ' end to end.' : 'a family car.') };
    }
    if (ran > 0) { return { icon: 'run', words: 'Raced ' + ran + ' m in competition this season, flat out.' }; }
    return { icon: 'star', words: 'Every collection starts somewhere. This card is a first edition.' };
  }

  function caption(f) {
    var t = f.totals, bits = [];
    if (t.newPbs) { bits.push(plural(t.newPbs, 'PB')); }
    if (t.wins) { bits.push(plural(t.wins, 'win')); }
    if (t.podiums) { bits.push(t.podiums + ' top-three'); }
    if (!bits.length) { bits.push(plural(t.starts, 'start')); }
    return f.name + '’s ' + f.season + ' season card' + (f.rookie ? ' (rookie card!)' : '') + ': ' + bits.join(', ') +
      '. North Canterbury Athletic Club #NCAN';
  }

  // 'sam-2026-27-season-card-photo.png', '...-stats.png'
  function fileName(f, side) {
    var s = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
    return [s(f.name), s(f.season), 'season-card', side === 'front' ? 'photo' : 'stats'].filter(Boolean).join('-') + '.png';
  }

  /* The photo's looks --------------------------------------------------------
     Each takes and gives { data, width, height } (RGBA, as canvas ImageData),
     so they run in a test without a canvas. */

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lumAt(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
  function copy(img) { return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }; }
  // a repeatable random number generator, so a card saves just as it shows
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 16777619); }
    return h >>> 0;
  }

  // contrast, saturation and brightness, around the middle grey
  function adjust(img, o) {
    var d = img.data, k = o.contrast || 1, s = o.saturation === undefined ? 1 : o.saturation, b = o.brightness || 0;
    for (var i = 0; i < d.length; i += 4) {
      var l = lumAt(d, i);
      for (var c = 0; c < 3; c++) { d[i + c] = clamp255((l + (d[i + c] - l) * s - 128) * k + 128 + b); }
    }
    return img;
  }
  // a box blur of radius r, across then down, `passes` times (three is close to a Gaussian): a new image
  function blur(img, r, passes) {
    var w = img.width, h = img.height, a = new Float32Array(img.data), t = new Float32Array(a.length);
    var run = function (from, to, len, lines, at) {
      var n = 2 * r + 1;
      for (var line = 0; line < lines; line++) {
        for (var c = 0; c < 4; c++) {
          var acc = 0, k;
          for (k = -r; k <= r; k++) { acc += from[at(line, Math.min(len - 1, Math.max(0, k))) + c]; }
          for (var x = 0; x < len; x++) {
            to[at(line, x) + c] = acc / n;
            acc += from[at(line, Math.min(len - 1, x + r + 1)) + c] - from[at(line, Math.max(0, x - r)) + c];
          }
        }
      }
    };
    var across = function (line, x) { return (line * w + x) * 4; }, down = function (line, y) { return (y * w + line) * 4; };
    for (var p = 0; p < (passes || 1); p++) { run(a, t, w, h, across); run(t, a, h, w, down); }
    return { data: new Uint8ClampedArray(a), width: w, height: h };
  }
  // edge strength, 0 to 255, from the luminance (Sobel)
  function edges(img) {
    var w = img.width, h = img.height, d = img.data, L = new Float32Array(w * h), out = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) { L[i] = lumAt(d, i * 4); }
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        var gx = -L[p - w - 1] - 2 * L[p - 1] - L[p + w - 1] + L[p - w + 1] + 2 * L[p + 1] + L[p + w + 1];
        var gy = -L[p - w - 1] - 2 * L[p - w] - L[p - w + 1] + L[p + w - 1] + 2 * L[p + w] + L[p + w + 1];
        out[p] = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
      }
    }
    return out;
  }
  // the luminance mapped along colours, dark to light
  function gradientMap(img, colours) {
    var d = img.data, stops = colours.map(hex), n = stops.length - 1;
    for (var i = 0; i < d.length; i += 4) {
      var t = lumAt(d, i) / 255 * n, k = Math.min(n - 1, Math.floor(t)), f = t - k;
      for (var c = 0; c < 3; c++) { d[i + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f; }
    }
    return img;
  }
  // darker towards the corners
  function vignette(img, amount) {
    var w = img.width, h = img.height, d = img.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2, k = 1 - amount * Math.max(0, (dx * dx + dy * dy) / 2 - 0.1), i = (y * w + x) * 4;
        d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    }
    return img;
  }
  function grain(img, amount, seed) {
    var d = img.data, r = rng(seed);
    for (var i = 0; i < d.length; i += 4) {
      var n = (r() - 0.5) * amount;
      d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n);
    }
    return img;
  }
  function nearest(rgb, palette) {
    var best = palette[0], bd = Infinity;
    for (var p = 0; p < palette.length; p++) {
      var q = palette[p], dr = rgb[0] - q[0], dg = rgb[1] - q[1], db = rgb[2] - q[2], dd = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
      if (dd < bd) { bd = dd; best = q; }
    }
    return best;
  }
  // a square's average colour, size x size pixels from (x0, y0)
  function cellAverage(img, x0, y0, size) {
    var w = img.width, h = img.height, d = img.data, t = [0, 0, 0], n = 0;
    for (var y = y0; y < Math.min(h, y0 + size); y++) {
      for (var x = x0; x < Math.min(w, x0 + size); x++) { var i = (y * w + x) * 4; t[0] += d[i]; t[1] += d[i + 1]; t[2] += d[i + 2]; n++; }
    }
    return n ? [t[0] / n, t[1] / n, t[2] / n] : [0, 0, 0];
  }
  // sizes are given for a photo 1000 pixels across; this scales them
  function unit(img) { return Math.max(0.2, Math.max(img.width, img.height) / 1000); }
  function px(img, n) { return Math.max(1, Math.round(n * unit(img))); }
  function inkOf(e, lo, span) { return Math.max(0, Math.min(1, (e - lo) / span)); }

  var LOOKS = {
    natural: function (img) { return adjust(img, { contrast: 1.06, saturation: 1.12 }); },
    // steely blue-silver and crisp, as if printed on chrome
    chrome: function (img) {
      var s = blur(img, px(img, 2), 2).data, d = img.data;
      for (var i = 0; i < d.length; i += 4) { for (var c = 0; c < 3; c++) { d[i + c] = clamp255(d[i + c] + (d[i + c] - s[i + c]) * 1.4); } }
      adjust(img, { contrast: 1.3, saturation: 0.45 });
      for (var j = 0; j < d.length; j += 4) {
        var l = lumAt(d, j) / 255;
        d[j] = clamp255(d[j] * 0.9 + 8); d[j + 1] = clamp255(d[j + 1] * 0.96 + 10); d[j + 2] = clamp255(d[j + 2] + 18 + 20 * l);
      }
      return img;
    },
    gold: function (img) {
      return gradientMap(adjust(img, { contrast: 1.15 }), ['#140C00', '#4A2E00', '#A8740E', '#F2C94C', '#FFF4C8']);
    },
    // flat colour, smoothed, with ink round the shapes
    cartoon: function (img) {
      var soft = adjust(blur(img, px(img, 2), 3), { saturation: 1.45, contrast: 1.12 });
      var e = edges(blur(img, px(img, 1), 1)), d = soft.data, step = 255 / 5;
      for (var i = 0, p = 0; i < d.length; i += 4, p++) {
        var ink = inkOf(e[p], 22, 26);
        for (var c = 0; c < 3; c++) { d[i + c] = (Math.round(d[i + c] / step) * step) * (1 - ink) + 18 * ink; }
      }
      return soft;
    },
    // bold printed dots on newsprint, with ink lines
    comic: function (img) {
      var cell = Math.max(4, px(img, 9)), w = img.width, h = img.height, out = new Uint8ClampedArray(img.data.length);
      var paper = hex('#FFF5DC'), palette = ['#E63946', '#FFD23F', '#1D6FD8', '#F4A97F', '#2A9D5C', '#14110F', '#FFF5DC'].map(hex);
      var e = edges(blur(img, px(img, 1), 2));
      for (var cy = 0; cy < h; cy += cell) {
        for (var cx = 0; cx < w; cx += cell) {
          var avg = cellAverage(img, cx, cy, cell), l = (0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]) / 255;
          var col = nearest(avg.map(function (v) { return clamp255(l * 255 + (v - l * 255) * 1.8); }), palette);
          var rad = cell * 0.75 * Math.sqrt(Math.max(0.08, 1 - l * 0.85)), mx = cx + cell / 2, my = cy + cell / 2;
          for (var y = cy; y < Math.min(h, cy + cell); y++) {
            for (var x = cx; x < Math.min(w, cx + cell); x++) {
              var dist = Math.sqrt((x + 0.5 - mx) * (x + 0.5 - mx) + (y + 0.5 - my) * (y + 0.5 - my));
              var a = Math.max(0, Math.min(1, rad - dist + 0.5)), i = (y * w + x) * 4, ink = inkOf(e[y * w + x], 26, 22);
              for (var c = 0; c < 3; c++) { out[i + c] = (paper[c] * (1 - a) + col[c] * a) * (1 - ink) + 20 * ink; }
              out[i + 3] = 255;
            }
          }
        }
      }
      return { data: out, width: w, height: h };
    },
    // four flat inks, screen printed: deep green, hot pink, gold, cream
    pop: function (img) {
      var soft = adjust(blur(img, px(img, 1), 2), { contrast: 1.35 }), d = soft.data;
      var inks = ['#062A20', '#E8327C', '#FFC629', '#FFF6DA'].map(hex);
      for (var i = 0; i < d.length; i += 4) {
        var l = lumAt(d, i), k = l < 70 ? 0 : l < 125 ? 1 : l < 185 ? 2 : 3;
        d[i] = inks[k][0]; d[i + 1] = inks[k][1]; d[i + 2] = inks[k][2];
      }
      return soft;
    },
    // the grey photo dodged with its own blurred negative: pencil on paper
    sketch: function (img) {
      var d = img.data, neg = { data: new Uint8ClampedArray(d.length), width: img.width, height: img.height };
      for (var i = 0; i < d.length; i += 4) { neg.data[i] = neg.data[i + 1] = neg.data[i + 2] = 255 - lumAt(d, i); neg.data[i + 3] = 255; }
      var b = blur(neg, Math.max(2, px(img, 6)), 2).data, paper = hex('#F7F1E3');
      for (var j = 0; j < d.length; j += 4) {
        var v = b[j] >= 255 ? 255 : Math.min(255, lumAt(d, j) * 255 / (255 - b[j]));
        v = Math.pow(v / 255, 1.8);
        d[j] = paper[0] * v; d[j + 1] = paper[1] * v; d[j + 2] = paper[2] * v + (1 - v) * 16;
      }
      return grain(img, 10, 3);
    },
    vintage: function (img) {
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2];
        var sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
        d[i] = 34 + (r * 0.35 + sr * 0.65) * 0.78; d[i + 1] = 30 + (g * 0.35 + sg * 0.65) * 0.76; d[i + 2] = 26 + (b * 0.35 + sb * 0.65) * 0.7;
      }
      return grain(vignette(img, 0.55), 26, 11);
    },
    noir: function (img) {
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var l = lumAt(d, i) / 255, s = l * l * (3 - 2 * l);
        d[i] = d[i + 1] = d[i + 2] = clamp255((s * 1.15 - 0.07) * 255);
      }
      return grain(vignette(img, 0.8), 14, 5);
    },
    // glowing outlines in the dark, pink to cyan to lime
    neon: function (img) {
      var w = img.width, h = img.height, d = img.data, e = edges(blur(img, px(img, 1.5), 2));
      var lines = { data: new Uint8ClampedArray(d.length), width: w, height: h };
      var A = [[255, 46, 160], [40, 220, 255], [170, 255, 60]];
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var p = y * w + x, i = p * 4, s = inkOf(e[p], 14, 40), t = (x / w + y / h) / 2, k = t < 0.5 ? 0 : 1, f = (t - k * 0.5) * 2;
          for (var c = 0; c < 3; c++) { lines.data[i + c] = (A[k][c] + (A[k + 1][c] - A[k][c]) * f) * s; }
          lines.data[i + 3] = 255;
        }
      }
      var glow = blur(lines, Math.max(2, px(img, 4)), 2).data, line = lines.data;
      for (var j = 0; j < d.length; j += 4) {
        var l = lumAt(d, j) * 0.16;
        for (var q = 0; q < 3; q++) { d[j + q] = clamp255(l * (q === 2 ? 1.4 : 0.8) + glow[j + q] * 1.9 + line[j + q]); }
      }
      return img;
    },
    thermal: function (img) {
      return gradientMap(blur(img, px(img, 1), 1), ['#05001A', '#2A0A8C', '#9B0FA3', '#F0306A', '#FF8A00', '#FFE14D', '#FFFFF2']);
    },
    // chunky pixels in a 16-colour games palette
    pixel: function (img) {
      var w = img.width, h = img.height, size = Math.max(3, Math.round(Math.max(w, h) / 64)), d = img.data;
      var palette = ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
                     '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'].map(hex);
      for (var cy = 0; cy < h; cy += size) {
        for (var cx = 0; cx < w; cx += size) {
          var col = nearest(cellAverage(img, cx, cy, size), palette);
          for (var y = cy; y < Math.min(h, cy + size); y++) {
            for (var x = cx; x < Math.min(w, cx + size); x++) {
              var i = (y * w + x) * 4, k = (x === cx || y === cy) ? 0.88 : 1;
              d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k;
            }
          }
        }
      }
      return img;
    }
  };
  // the photo with a look: a new { data, width, height }, the one given left as it was
  function look(img, id) { return (LOOKS[id] || LOOKS.natural)(copy(img)); }

  /* Drawing (browser only) --------------------------------------------------- */

  function loadImage(src) {
    return new Promise(function (ok) {
      if (!src) { ok(null); return; }
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = src;
    });
  }
  // the photo at no more than `max` pixels on its longer side, on a canvas the looks can read
  function photoCanvas(img, max) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(iw, ih));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(iw * k)); cv.height = Math.max(1, Math.round(ih * k));
    var x = cv.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }
  // a canvas with a look: a new canvas
  function filtered(src, id) {
    var got = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    var out = look({ data: got.data, width: got.width, height: got.height }, id);
    var cv = document.createElement('canvas');
    cv.width = out.width; cv.height = out.height;
    var x = cv.getContext('2d'), data = x.createImageData(out.width, out.height);
    data.data.set(out.data);
    x.putImageData(data, 0, 0);
    return cv;
  }

  function rounded(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  // brushed metal: the finish's stops across the box, corner to corner
  function metal(c, fin, x, y, w, h) {
    var g = c.createLinearGradient(x, y, x + w, y + h);
    fin.stops.forEach(function (s, i) { g.addColorStop(i / (fin.stops.length - 1), s); });
    return g;
  }
  // a refractor's rainbow over what's drawn, and light catching the foil in streaks
  function holo(c, x, y, w, h, strength, seed) {
    if (!(strength > 0)) { return; }
    c.save();
    var g = c.createLinearGradient(x, y + h * 0.1, x + w, y + h * 0.9);
    var cols = ['#FF5FA2', '#FFD36B', '#7DFFB0', '#6BC6FF', '#C58BFF', '#FF5FA2', '#FFD36B', '#7DFFB0'];
    cols.forEach(function (col, i) { g.addColorStop(i / (cols.length - 1), col); });
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = Math.min(1, strength);
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.globalCompositeOperation = 'soft-light';
    var r = rng(seed);
    for (var k = 0; k < 5; k++) {
      var at = x + r() * (w + h), wide = 30 + r() * 90;
      var s = c.createLinearGradient(at - wide, y, at + wide, y + wide * 0.4);
      s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,.9)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s;
      c.beginPath(); c.moveTo(at - wide, y); c.lineTo(at + wide, y); c.lineTo(at + wide - h, y + h); c.lineTo(at - wide - h, y + h); c.closePath(); c.fill();
    }
    c.restore();
  }
  function sparkle(c, x, y, size, alpha) {
    c.save();
    c.globalAlpha = alpha; c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.moveTo(x, y - size); c.quadraticCurveTo(x, y, x + size, y); c.quadraticCurveTo(x, y, x, y + size);
    c.quadraticCurveTo(x, y, x - size, y); c.quadraticCurveTo(x, y, x, y - size);
    c.fill();
    c.restore();
  }
  function setFont(c, weight, size, family, italic) { c.font = (italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + family; }
  function spaced(c, n) { if ('letterSpacing' in c) { c.letterSpacing = n + 'px'; } }
  /* Words no wider than maxW: smaller, down to o.min, then squeezed. o: { size, min,
     weight, family, italic, colour, align, rotate, spacing, shadow, dy } */
  function fit(c, words, x, y, maxW, o) {
    var size = o.size, min = o.min || Math.round(size * 0.6);
    c.save();
    spaced(c, o.spacing || 0);
    setFont(c, o.weight, size, o.family, o.italic);
    while (c.measureText(words).width > maxW && size > min) { size -= 1; setFont(c, o.weight, size, o.family, o.italic); }
    var wd = c.measureText(words).width;
    c.translate(x, y);
    if (o.rotate) { c.rotate(o.rotate); }
    if (wd > maxW) { c.scale(maxW / wd, 1); }
    c.textAlign = o.align || 'left';
    if (o.shadow) { c.shadowColor = o.shadow; c.shadowOffsetY = o.dy || 3; c.shadowBlur = o.blur || 0; }
    c.fillStyle = o.colour;
    c.fillText(words, 0, 0);
    c.restore();
  }
  function wrap(c, words, maxW) {
    var lines = [], line = '';
    String(words).split(/\s+/).forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else { line = t; }
    });
    if (line) { lines.push(line); }
    return lines;
  }
  // the card's fonts, loaded before drawing so the first card isn't in a fallback
  function fontsReady(fonts) {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) { return Promise.resolve(); }
    return Promise.all([['italic 900 40px', fonts.display], ['900 40px', fonts.display], ['800 20px', fonts.sans],
                        ['700 20px', fonts.sans], ['600 20px', fonts.sans]].map(function (f) {
      return document.fonts.load(f[0] + ' ' + f[1]).catch(function () {});
    }));
  }
  function start() {
    var canvas = document.createElement('canvas');
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    var c = canvas.getContext('2d');
    c.scale(SCALE, SCALE);
    return { canvas: canvas, c: c };
  }

  /* The photo side. opts: { photo (a canvas, with its look), focus ('30% 40%'), zoom,
     finish, fonts: { display, sans }, logo (an Image), cover (NCANPbCard.cover) }.
     The canvas it gives carries .photo { iw, ih, w, h }, for dragging the photo. */
  var WIN = { x: 34, y: 34, w: W - 68, h: H - 68 };
  function front(f, opts) {
    var fin = finishOf(opts.finish), seed = seedOf(f.name + f.season + fin.id);
    return fontsReady(opts.fonts).then(function () {
      var s = start(), c = s.c, D = opts.fonts.display, S = opts.fonts.sans;
      c.save();
      rounded(c, 0, 0, W, H, 30); c.clip();
      // the frame, brushed
      c.fillStyle = metal(c, fin, 0, 0, W, H); c.fillRect(0, 0, W, H);
      c.save(); c.globalAlpha = 0.07; c.strokeStyle = '#FFFFFF'; c.lineWidth = 1;
      for (var b = -H; b < W; b += 5) { c.beginPath(); c.moveTo(b, 0); c.lineTo(b + H, H); c.stroke(); }
      c.restore();
      holo(c, 0, 0, W, H, fin.holo, seed);

      // the photo window
      c.save();
      rounded(c, WIN.x, WIN.y, WIN.w, WIN.h, 20); c.clip();
      c.fillStyle = C.green; c.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
      var ph = opts.photo;
      if (ph) {
        var r = opts.cover(ph.width, ph.height, WIN.w, WIN.h, opts.focus, opts.zoom);
        c.drawImage(ph, r.sx, r.sy, r.sw, r.sh, WIN.x, WIN.y, WIN.w, WIN.h);
        s.canvas.photo = { iw: ph.width, ih: ph.height, w: WIN.w, h: WIN.h };
      }
      // a refractor's sheen over the photo too, gently
      if (fin.holo > 0.3) { holo(c, WIN.x, WIN.y, WIN.w, WIN.h, fin.holo * 0.22, seed + 1); }
      // shade at the top for the badges, and at the foot for the nameplate
      var top = c.createLinearGradient(0, WIN.y, 0, WIN.y + 220);
      top.addColorStop(0, 'rgba(3,20,15,.45)'); top.addColorStop(1, 'rgba(3,20,15,0)');
      c.fillStyle = top; c.fillRect(WIN.x, WIN.y, WIN.w, 220);
      var foot = c.createLinearGradient(0, H - 420, 0, H - 34);
      foot.addColorStop(0, 'rgba(3,20,15,0)'); foot.addColorStop(1, 'rgba(3,20,15,.6)');
      c.fillStyle = foot; c.fillRect(WIN.x, H - 420, WIN.w, 386);
      c.restore();
      // the window's bevel: a dark line inside, a light one outside
      c.lineWidth = 4; c.strokeStyle = fin.line; rounded(c, WIN.x, WIN.y, WIN.w, WIN.h, 20); c.stroke();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.75)'; rounded(c, WIN.x - 4, WIN.y - 4, WIN.w + 8, WIN.h + 8, 23); c.stroke();

      // the club crest, on a metal-rimmed medallion
      var mx = 118, my = 116;
      c.save();
      c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16; c.shadowOffsetY = 5;
      c.beginPath(); c.arc(mx, my, 66, 0, Math.PI * 2); c.fillStyle = metal(c, fin, mx - 66, my - 66, 132, 132); c.fill();
      c.restore();
      c.beginPath(); c.arc(mx, my, 56, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill();
      c.lineWidth = 2; c.strokeStyle = fin.line; c.stroke();
      if (opts.logo) { c.drawImage(opts.logo, mx - 47, my - 27, 94, 54); }

      // the season badge: a shield in the top right, with the card's number
      var bx = W - 128, by = 70;
      var shield = function (n) {
        var x0 = bx - 62 + n, x1 = bx + 62 - n, y0 = by + n, y1 = by + 112 - n, tip = by + 146 - n * 1.4;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1); c.quadraticCurveTo(x1, y1 + 18, bx, tip);
        c.quadraticCurveTo(x0, y1 + 18, x0, y1); c.closePath();
      };
      c.save();
      c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16; c.shadowOffsetY = 5;
      shield(0); c.fillStyle = metal(c, fin, bx - 62, by, 124, 150); c.fill();
      c.restore();
      shield(7); c.fillStyle = fin.badge; c.fill();
      fit(c, 'SEASON', bx, by + 40, 100, { size: 15, weight: 800, family: S, colour: C.goldSoft, align: 'center', spacing: 3 });
      fit(c, f.season, bx, by + 82, 96, { size: 38, weight: 900, family: D, colour: '#FFFFFF', align: 'center', italic: true });
      fit(c, 'NO. ' + f.cardNo, bx, by + 110, 90, { size: 13, weight: 700, family: S, colour: C.soft, align: 'center', spacing: 2 });

      // a rookie card's starburst, under the season
      if (f.rookie) {
        c.save();
        c.translate(W - 128, 270); c.rotate(-0.12);
        c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
        c.beginPath();
        for (var k = 0; k < 16; k++) { var a = k / 16 * Math.PI * 2, rr = k % 2 ? 50 : 60; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fillStyle = C.red; c.fill();
        c.shadowColor = 'transparent';
        c.lineWidth = 3; c.strokeStyle = C.gold; c.stroke();
        c.restore();
        c.save(); c.translate(W - 128, 270); c.rotate(-0.12);
        fit(c, 'RC', 0, 12, 80, { size: 42, weight: 900, family: D, colour: '#FFFFFF', align: 'center', italic: true });
        fit(c, 'ROOKIE', 0, 32, 70, { size: 11, weight: 800, family: S, colour: C.gold, align: 'center', spacing: 2 });
        c.restore();
      }

      // the nameplate: a slanted band across the foot of the photo
      var tilt = -0.055, ny = H - 196;
      c.save();
      c.translate(W / 2, ny); c.rotate(tilt);
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 22; c.shadowOffsetY = 8;
      c.fillStyle = C.green; c.fillRect(-W, -54, W * 2, 118);
      c.shadowColor = 'transparent';
      c.fillStyle = metal(c, fin, -W / 2, -66, W, 12); c.fillRect(-W, -66, W * 2, 12);
      c.fillStyle = C.gold; c.fillRect(-W, 64, W * 2, 8);
      c.globalAlpha = 0.1; c.fillStyle = '#FFFFFF';
      for (var p = -W; p < W; p += 14) { c.fillRect(p, -54, 3, 118); }
      c.restore();
      // the name follows the band's slant
      var along = function (x, dy) { return { x: x, y: ny + dy + Math.tan(tilt) * (x - W / 2) }; };
      var big = { weight: 900, family: D, colour: '#FFFFFF', rotate: tilt, italic: true, shadow: 'rgba(0,0,0,.55)', dy: 3 };
      if (f.last && f.name !== f.first) {
        var n1 = along(62, -14), n2 = along(62, 46);
        fit(c, f.first.toUpperCase(), n1.x, n1.y, W - 220, { size: 30, weight: 800, family: D, colour: C.gold, rotate: tilt, spacing: 4, italic: true });
        fit(c, f.last.toUpperCase(), n2.x, n2.y, W - 124, Object.assign({ size: 70, min: 34 }, big));
      } else {
        var n0 = along(62, 34);
        fit(c, f.first.toUpperCase(), n0.x, n0.y, W - 124, Object.assign({ size: 84, min: 40 }, big));
      }
      // the position tag under the band: what they do, and their grade
      var tag = [f.position, f.grade].filter(Boolean).join(' · ').toUpperCase();
      c.save();
      spaced(c, 2.5); setFont(c, 800, 17, S);
      var tw = c.measureText(tag).width + 40, t0 = along(W - 52 - tw, 84);
      c.translate(t0.x, t0.y); c.rotate(tilt);
      c.fillStyle = metal(c, fin, 0, 0, tw, 40); rounded(c, 0, 0, tw, 40, 8); c.fill();
      c.fillStyle = fin.badge; rounded(c, 4, 4, tw - 8, 32, 6); c.fill();
      c.fillStyle = '#FFFFFF'; c.textAlign = 'left'; c.fillText(tag, 20, 27);
      c.restore();
      // the club's name, small, along the foot of the photo
      fit(c, 'NORTH CANTERBURY ATHLETIC CLUB', 60, H - 56, 380, { size: 12, weight: 700, family: S, colour: 'rgba(255,255,255,.92)', spacing: 3 });

      // glints on the frame
      var r2 = rng(seed + 9), many = fin.holo > 0.5 ? 26 : fin.holo > 0.3 ? 14 : 8;
      for (var gl = 0; gl < many; gl++) {
        var gx, gy;
        if (r2() < 0.5) { gx = r2() * W; gy = r2() < 0.5 ? r2() * 30 : H - r2() * 30; }
        else { gy = r2() * H; gx = r2() < 0.5 ? r2() * 30 : W - r2() * 30; }
        sparkle(c, gx, gy, 3 + r2() * 9, 0.5 + r2() * 0.5);
      }
      // a soft gloss over the whole card
      c.save();
      c.globalCompositeOperation = 'soft-light';
      var gloss = c.createLinearGradient(0, 0, W, H);
      gloss.addColorStop(0, 'rgba(255,255,255,.55)'); gloss.addColorStop(0.45, 'rgba(255,255,255,0)'); gloss.addColorStop(1, 'rgba(0,0,0,.25)');
      c.fillStyle = gloss; c.fillRect(0, 0, W, H);
      c.restore();
      c.restore();
      return s.canvas;
    });
  }

  // a small drawing for the Did you know? box: a stopwatch, a shot, a hop, or a star
  function icon(c, kind, x, y, r) {
    c.save();
    c.translate(x, y);
    c.lineWidth = r * 0.12; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = C.ink;
    if (kind === 'run') {
      c.fillStyle = '#FFFFFF';
      c.beginPath(); c.arc(0, r * 0.12, r * 0.78, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = C.ink; c.fillRect(-r * 0.16, -r * 0.92, r * 0.32, r * 0.2);
      c.beginPath(); c.moveTo(r * 0.55, -r * 0.5); c.lineTo(r * 0.72, -r * 0.68); c.stroke();
      c.strokeStyle = C.red; c.beginPath(); c.moveTo(0, r * 0.12); c.lineTo(r * 0.38, -r * 0.24); c.stroke();
      c.fillStyle = C.ink; c.beginPath(); c.arc(0, r * 0.12, r * 0.1, 0, Math.PI * 2); c.fill();
    } else if (kind === 'throw') {
      var g = c.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r * 0.7);
      g.addColorStop(0, '#E8EDF2'); g.addColorStop(1, '#5D6872');
      c.fillStyle = g; c.beginPath(); c.arc(r * 0.15, -r * 0.1, r * 0.6, 0, Math.PI * 2); c.fill(); c.stroke();
    } else if (kind === 'jump') {
      c.strokeStyle = C.red; c.beginPath(); c.moveTo(-r * 0.85, r * 0.6); c.quadraticCurveTo(0, -r * 1.2, r * 0.85, r * 0.6); c.stroke();
      c.fillStyle = C.ink; c.fillRect(-r, r * 0.62, r * 2, r * 0.18);
    } else {
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      for (var s = 0; s < 10; s++) { var a = -Math.PI / 2 + s * Math.PI / 5, rr = s % 2 ? r * 0.42 : r * 0.9; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  }

  // a season's marks in one event as a little line, better always up; the PBs gold
  function sparkline(c, pts, field, x, y, w, h) {
    pts = (pts || []).filter(function (p) { return typeof p.value === 'number'; });
    if (pts.length < 2 || w < 40) { return; }
    var vs = pts.map(function (p) { return p.value; }), lo = Math.min.apply(null, vs), span = (Math.max.apply(null, vs) - lo) || 1;
    var at = function (p, i) { return [x + i / (pts.length - 1) * w, field ? y + h - (p.value - lo) / span * h : y + (p.value - lo) / span * h]; };
    c.strokeStyle = C.goldSoft; c.lineWidth = 2.5; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(function (p, i) { var q = at(p, i); if (i) { c.lineTo(q[0], q[1]); } else { c.moveTo(q[0], q[1]); } }); c.stroke();
    pts.forEach(function (p, i) {
      var q = at(p, i);
      c.beginPath(); c.arc(q[0], q[1], p.pb ? 6 : 3.5, 0, Math.PI * 2);
      c.fillStyle = p.pb ? C.gold : '#FFFFFF'; c.fill();
      if (p.pb) { c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke(); }
    });
  }

  /* The stats side. opts: { finish, fonts, logo (the crest for a dark background) } */
  function back(f, opts) {
    var fin = finishOf(opts.finish);
    return fontsReady(opts.fonts).then(function () {
      var s = start(), c = s.c, D = opts.fonts.display, S = opts.fonts.sans;
      var X0 = 40, X1 = W - 40, IW = X1 - X0;
      var text = function (words, x, y, o) {
        fit(c, String(words), x, y, o.max || 999, { size: o.size || 16, min: o.min, weight: o.weight || 600, family: o.display ? D : S,
          italic: o.italic, colour: o.colour || C.ink, align: o.align || 'center', spacing: o.spacing });
      };
      c.save();
      rounded(c, 0, 0, W, H, 30); c.clip();
      c.fillStyle = metal(c, fin, 0, 0, W, H); c.fillRect(0, 0, W, H);
      holo(c, 0, 0, W, H, fin.holo * 0.7, seedOf(f.name + f.season) + 3);
      // the card inside the frame, pinstriped
      c.save();
      rounded(c, 20, 20, W - 40, H - 40, 18); c.clip();
      c.fillStyle = fin.id === 'onyx' ? '#111416' : C.green; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.06; c.strokeStyle = '#FFFFFF'; c.lineWidth = 2;
      for (var b = -H; b < W; b += 16) { c.beginPath(); c.moveTo(b, 0); c.lineTo(b + H, H); c.stroke(); }
      c.restore();
      c.lineWidth = 2; c.strokeStyle = fin.line === '#FFC629' ? C.gold : 'rgba(255,255,255,.6)';
      rounded(c, 20, 20, W - 40, H - 40, 18); c.stroke();

      // the header: the card's number, the name, the club, the crest
      var nx = 92, ny = 104;
      c.beginPath(); c.arc(nx, ny, 48, 0, Math.PI * 2); c.fillStyle = metal(c, fin, nx - 48, ny - 48, 96, 96); c.fill();
      c.beginPath(); c.arc(nx, ny, 39, 0, Math.PI * 2); c.fillStyle = C.cream; c.fill();
      text('NO.', nx, ny - 12, { size: 12, weight: 800, colour: C.leaf, spacing: 2 });
      text(f.cardNo, nx - 1, ny + 24, { size: 36, weight: 900, display: true, italic: true, max: 70 });
      var hx = 160, crestW = 112;
      text((f.last && f.name !== f.first ? f.name : f.first).toUpperCase(), hx, 104,
        { size: 48, min: 26, weight: 900, display: true, italic: true, colour: '#FFFFFF', align: 'left', max: X1 - hx - crestW - 14 });
      text('NORTH CANTERBURY ATHLETIC CLUB', hx, 132, { size: 13, weight: 700, colour: C.soft, align: 'left', spacing: 2.5, max: X1 - hx - crestW - 14 });
      if (opts.logo) { c.drawImage(opts.logo, X1 - crestW, 58, crestW, crestW * 508 / 888); }
      // chips: the season, the grade, what they do, Rookie
      var cx = hx;
      var chip = function (words, bg, fg) {
        c.save(); spaced(c, 1.5); setFont(c, 800, 13, S);
        var w = c.measureText(words).width + 24;
        if (cx + w > X1) { c.restore(); return; }
        c.fillStyle = bg; rounded(c, cx, 146, w, 28, 14); c.fill();
        c.fillStyle = fg; c.textAlign = 'left'; c.fillText(words, cx + 12, 165);
        c.restore();
        cx += w + 8;
      };
      chip(f.season + ' SEASON', C.gold, C.ink);
      if (f.rookie) { chip('ROOKIE', C.red, '#FFFFFF'); }
      if (f.grade) { chip(String(f.grade).toUpperCase(), 'rgba(255,255,255,.16)', '#FFFFFF'); }
      chip(f.position.toUpperCase(), 'rgba(255,255,255,.16)', '#FFFFFF');

      // the season in four numbers
      var t = f.totals;
      var boxes = [[t.starts, t.starts === 1 ? 'START' : 'STARTS'], [t.meetings, t.meetings === 1 ? 'MEETING' : 'MEETINGS'],
                   [t.wins, t.wins === 1 ? 'WIN' : 'WINS'], [t.newPbs, t.newPbs === 1 ? 'NEW PB' : 'NEW PBS']];
      var by = 192, bh = 78, gap = 10, bw = (IW - gap * 3) / 4;
      boxes.forEach(function (x, i) {
        var bx = X0 + i * (bw + gap);
        c.fillStyle = C.cream; rounded(c, bx, by, bw, bh, 12); c.fill();
        c.fillStyle = i === 3 && x[0] ? C.gold : metal(c, fin, bx, by, bw, 7); rounded(c, bx, by, bw, 7, 3); c.fill();
        text(x[0], bx + bw / 2, by + 50, { size: 38, weight: 900, display: true });
        text(x[1], bx + bw / 2, by + 68, { size: 11, weight: 800, colour: C.leaf, spacing: 2, max: bw - 10 });
      });

      var y = by + bh + 18, FOOT = H - 92, PANELS = 196, ROW = 33, RROW = 30;
      var head = function (words, note) {
        c.fillStyle = C.gold; rounded(c, X0, y, IW, 34, 8); c.fill();
        text(words, X0 + 14, y + 23, { size: 15, weight: 900, align: 'left', spacing: 2.5 });
        if (note) { text(note, X1 - 14, y + 22, { size: 12, weight: 600, align: 'right', colour: 'rgba(6,42,32,.75)' }); }
        y += 34;
      };
      // the rows that fit above the bottom panels, shared by the two tables
      var room = FOOT - PANELS - 12 - y - (f.events.length ? 34 + 30 + 36 + 10 : 0) - (f.races.length ? 34 + 10 : 0);
      var eventRows = Math.min(f.events.length, f.races.length ? Math.max(2, Math.floor((room - Math.min(3, f.races.length) * RROW) / ROW)) : Math.floor(room / ROW));
      var raceRows = Math.min(f.races.length, Math.max(1, Math.floor((room - eventRows * ROW) / RROW)));

      if (f.events.length) {
        head('TRACK & FIELD', 'SB season best · PB personal best');
        // EVENT | ST | SB | PB | WINS | TOP 3
        var cols = [X0 + 14, X0 + 262, X0 + 352, X0 + 466, X0 + 562, X0 + 630];
        c.fillStyle = C.ink; c.fillRect(X0, y, IW, 30);
        ['EVENT', 'ST', 'SB', 'PB', 'WINS', 'TOP 3'].forEach(function (h, i) {
          text(h, cols[i], y + 20, { size: 12, weight: 800, colour: C.goldSoft, align: i ? 'center' : 'left', spacing: 1.5 });
        });
        y += 30;
        f.events.slice(0, eventRows).forEach(function (e, i) {
          c.fillStyle = i % 2 ? C.paper : C.cream; c.fillRect(X0, y, IW, ROW);
          var yy = y + 22, newPb = e.newPbs > 0 && e.sb;
          text(e.event, cols[0], yy, { weight: 700, align: 'left', max: 232 });
          text(e.starts || 0, cols[1], yy, {});
          if (newPb) { c.fillStyle = C.gold; rounded(c, cols[2] - 52, y + 4, 104, ROW - 8, 6); c.fill(); }
          text(e.sb ? e.sb.mark + (newPb ? ' ★' : '') : '–', cols[2], yy, { weight: newPb ? 800 : 600, max: 98 });
          text(e.pb ? e.pb.mark : '–', cols[3], yy, { max: 90 });
          text(e.wins || 0, cols[4], yy, {});
          text(e.podiums || 0, cols[5], yy, {});
          y += ROW;
        });
        // the totals row, as on the back of every baseball card
        c.fillStyle = C.leaf; c.fillRect(X0, y, IW, 36);
        var add = function (k) { return f.events.reduce(function (n, e) { return n + (e[k] || 0); }, 0); };
        var more = f.events.length - eventRows;
        text(more > 0 ? 'TOTALS (+' + more + ' MORE EVENTS)' : 'SEASON TOTALS', cols[0], y + 24, { size: 14, weight: 900, colour: '#FFFFFF', align: 'left', spacing: 1, max: 240 });
        text(add('starts'), cols[1], y + 24, { weight: 900, colour: '#FFFFFF' });
        if (t.newPbs) { text(t.newPbs + ' ★', cols[2], y + 24, { weight: 900, colour: C.gold }); }
        text(add('wins'), cols[4], y + 24, { weight: 900, colour: '#FFFFFF' });
        text(add('podiums'), cols[5], y + 24, { weight: 900, colour: '#FFFFFF' });
        y += 36 + 10;
      }
      if (f.races.length) {
        head('CROSS COUNTRY, ROAD & RELAYS', f.races.length > raceRows ? '+' + (f.races.length - raceRows) + ' more' : '');
        var rc = [X0 + 14, X0 + 92, X0 + 486, X0 + 610];
        f.races.slice(0, raceRows).forEach(function (r, i) {
          c.fillStyle = i % 2 ? C.paper : C.cream; c.fillRect(X0, y, IW, RROW);
          var yy = y + 21, podium = r.place >= 1 && r.place <= 3 && !r.team;
          text(day(r.date), rc[0], yy, { size: 14, weight: 700, colour: C.leaf, align: 'left', max: 72 });
          text(r.race, rc[1], yy, { size: 15, align: 'left', max: 380 });
          text(r.mark || '–', rc[2], yy, { weight: 700, max: 100 });
          if (podium) { c.fillStyle = C.gold; rounded(c, rc[3] - 52, y + 4, 104, RROW - 8, 6); c.fill(); }
          text(r.place ? ordinal(r.place) + (r.of ? ' of ' + r.of : '') + (r.team ? ' (team)' : '') : '–', rc[3], yy, { size: 14, weight: 700, max: 100 });
          y += RROW;
        });
        y += 10;
      }
      if (!f.events.length && !f.races.length) {
        text('No published results this season yet.', X0, y + 30, { size: 18, colour: '#FFFFFF', align: 'left' });
        y += 60;
      }

      // the bottom panels: the highlights, and Did you know?
      var py = Math.max(y + 2, FOOT - PANELS), ph = FOOT - py, lw = Math.round(IW * 0.58), rw = IW - lw - 12;
      c.fillStyle = C.cream; rounded(c, X0, py, lw, ph, 14); c.fill();
      text('SEASON HIGHLIGHTS', X0 + 16, py + 28, { size: 14, weight: 900, colour: C.leaf, align: 'left', spacing: 2.5 });
      var ly = py + 54;
      c.save();
      setFont(c, 600, 15, S); c.textAlign = 'left';
      f.highlights.forEach(function (h) {
        var lines = wrap(c, h, lw - 50);
        if (ly + (lines.length - 1) * 20 > py + ph - 10) { return; }
        c.fillStyle = C.gold; c.beginPath(); c.arc(X0 + 22, ly - 5, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = C.ink;
        lines.forEach(function (l) { c.fillText(l, X0 + 34, ly); ly += 20; });
        ly += 6;
      });
      c.restore();
      var fx = X0 + lw + 12;
      c.fillStyle = C.gold; rounded(c, fx, py, rw, ph, 14); c.fill();
      // a comic burst behind the drawing
      c.save();
      c.translate(fx + rw - 50, py + 46);
      c.fillStyle = '#FFFFFF'; c.beginPath();
      for (var k = 0; k < 20; k++) { var a = k / 20 * Math.PI * 2, rr = k % 2 ? 27 : 40; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.lineWidth = 2.5; c.strokeStyle = C.ink; c.stroke();
      c.restore();
      icon(c, f.fact.icon, fx + rw - 50, py + 46, 19);
      text('DID YOU', fx + 16, py + 34, { size: 19, weight: 900, display: true, italic: true, align: 'left' });
      text('KNOW?', fx + 16, py + 57, { size: 19, weight: 900, display: true, italic: true, align: 'left' });
      c.save();
      setFont(c, 600, 14, S); c.textAlign = 'left'; c.fillStyle = C.ink;
      var fy = py + 96;
      wrap(c, f.fact.words, rw - 30).forEach(function (l) { if (fy <= py + ph - 8) { c.fillText(l, fx + 16, fy); } fy += 19; });
      c.restore();

      // the footer band: the signature event's season as a line, and the club's address
      var sig = f.signature, fy0 = FOOT + 8, label = sig ? (sig.event + ' this season').toUpperCase() : 'NCAN · COLLECTOR SERIES';
      c.fillStyle = 'rgba(255,255,255,.08)'; rounded(c, X0, fy0, IW, 46, 10); c.fill();
      text(label, X0 + 14, fy0 + 28, { size: 12, weight: 800, colour: C.goldSoft, align: 'left', spacing: 2, max: 260 });
      c.save(); spaced(c, 2); setFont(c, 800, 12, S);
      var lx = X0 + 30 + Math.min(260, c.measureText(label).width);
      c.restore();
      if (sig) { sparkline(c, sig.points, sig.field, lx, fy0 + 11, X1 - 96 - lx, 24); }
      text('ncan.nz', X1 - 14, fy0 + 28, { size: 13, weight: 800, colour: '#FFFFFF', align: 'right' });
      text('From results published by meetings' + (f.upTo ? ', to ' + f.upTo : '') + '. ★ a new personal best that season.',
        W / 2, H - 29, { size: 10.5, weight: 500, colour: 'rgba(255,255,255,.72)', max: W - 90 });
      c.restore();
      return s.canvas;
    });
  }

  /* The dialog (browser only) -------------------------------------------------
     open(input, from, hooks): input as facts() takes it, plus surnameByDefault;
     hooks.headerPhoto() resolves the athlete's header photo { url, focus }, or null.
     The dialog's markup is in athlete/index.html (#sc); it's set up on first use. */
  var ui = null;
  function el(id) { return document.getElementById(id); }
  function fontsOf() {
    var root = window.getComputedStyle(document.documentElement);
    return { display: root.getPropertyValue('--font-display').trim() || 'sans-serif',
             sans: root.getPropertyValue('--font-sans').trim() || 'sans-serif' };
  }
  function say(words) { el('sc-said').textContent = words || ''; }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function setUp() {
    if (ui) { return ui; }
    var d = el('sc');
    if (!d || !d.showModal || !window.NCANPbCard) { return null; }
    ui = { d: d, input: null, f: null, source: null, thumbSource: null, picked: null, header: null, usePhoto: true,
           look: 'natural', finish: 'chrome', pos: { x: 50, y: 50, zoom: 1 }, looks: {}, front: null, back: null,
           flipped: false, seq: 0, surname: false, from: null, hooks: {}, logo: null, logoLight: null, busy: false, again: false };
    loadImage('/assets/img/logo.svg').then(function (i) { ui.logo = i; });
    loadImage('/assets/img/logo-dark.svg').then(function (i) { ui.logoLight = i; });
    Array.prototype.forEach.call(d.querySelectorAll('[data-sc-close]'), function (b) { b.addEventListener('click', function () { d.close(); }); });
    d.addEventListener('close', function () {
      if (d.open) { return; }
      ui.seq++;
      if (ui.from && document.contains(ui.from)) { ui.from.focus(); }
    });
    // the finishes, as metal swatches
    var fins = el('sc-finishes');
    FINISHES.forEach(function (fin) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sc__swatch'; b.dataset.finish = fin.id;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', fin.name); b.title = fin.name;
      b.style.background = fin.swatch;
      b.addEventListener('click', function () { pickFinish(fin.id); });
      fins.appendChild(b);
    });
    radioKeys(fins);
    // the looks, each with a little preview of the photo in it
    var looks = el('sc-looks');
    FILTERS.forEach(function (fl) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sc__look'; b.dataset.look = fl.id; b.setAttribute('role', 'radio');
      var thumb = document.createElement('canvas');
      thumb.width = 96; thumb.height = 128; thumb.className = 'sc__thumb'; thumb.setAttribute('aria-hidden', 'true');
      var words = document.createElement('span'); words.textContent = fl.name;
      b.appendChild(thumb); b.appendChild(words);
      b.addEventListener('click', function () { pickLook(fl.id); });
      looks.appendChild(b);
    });
    radioKeys(looks);
    el('sc-flip').addEventListener('click', function () { flip(!ui.flipped); });
    el('sc-surname').addEventListener('change', function () { ui.surname = this.checked; refacts(); drawAll(); });
    el('sc-seasons').addEventListener('change', function (e) {
      if (e.target.name !== 'sc-part') { return; }
      ui.part = e.target.value; refacts(); drawAll();
    });
    el('sc-signature').addEventListener('change', function () { ui.signature = this.value; refacts(); drawAll(); });
    el('sc-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) { return; }
      if (!/^image\//.test(file.type)) { el('sc-photo-said').textContent = 'That isn’t a photo: choose a JPEG, PNG or WebP.'; return; }
      if (ui.picked) { URL.revokeObjectURL(ui.picked.url); }
      ui.picked = { url: URL.createObjectURL(file), focus: null };
      ui.usePhoto = true;
      usePhoto();
    });
    el('sc-use-header').addEventListener('click', function () {
      if (ui.picked) { URL.revokeObjectURL(ui.picked.url); ui.picked = null; }
      el('sc-file').value = '';
      ui.usePhoto = true;
      usePhoto();
    });
    el('sc-nophoto').addEventListener('click', function () { ui.usePhoto = false; usePhoto(); });
    el('sc-zoom').addEventListener('input', function () { ui.pos.zoom = (+this.value || 100) / 100; drawFront(true); });
    el('sc-reset').addEventListener('click', function () { resetPos(); drawFront(true); });
    el('sc-save-front').addEventListener('click', function () { save('front'); });
    el('sc-save-back').addEventListener('click', function () { save('back'); });
    el('sc-copy').addEventListener('click', function () {
      var b = this, v = el('sc-caption').value;
      var said = function (w) { b.textContent = w; setTimeout(function () { b.textContent = 'Copy caption'; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(function () { said('Copied'); }, function () { said('Press Ctrl+C to copy'); });
      } else { said('Press Ctrl+C to copy'); }
    });
    handSetUp();
    return ui;
  }
  // arrow keys move along a row of radio buttons, choosing as they go
  function radioKeys(group) {
    group.addEventListener('keydown', function (e) {
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) { return; }
      var all = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
      var at = all.indexOf(document.activeElement);
      if (at < 0) { return; }
      e.preventDefault();
      var next = all[(at + step + all.length) % all.length];
      next.focus(); next.click();
    });
  }
  function checked(group, attr, value) {
    Array.prototype.forEach.call(el(group).querySelectorAll('[role="radio"]'), function (b) {
      var on = b.dataset[attr] === value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  function pickFinish(id) {
    ui.finish = id;
    checked('sc-finishes', 'finish', id);
    el('sc-stage').dataset.finish = id;
    el('sc-finish-name').textContent = finishOf(id).name;
    try { localStorage.setItem('ncan-season-card-finish', id); } catch (e) { /* not kept */ }
    drawAll();
  }
  function pickLook(id) {
    ui.look = id;
    checked('sc-looks', 'look', id);
    drawFront();
  }
  /* A season holds two: the track and field season and the out-of-stadia one
     (cross country, road and relays). With results in both, the card can show
     either or both; meetings counts only the part shown. */
  function partOf(input, part) {
    var events = input.events || [], races = input.races || [];
    if (part === 'track') { return { events: events, races: [], meetings: input.trackMeetings || input.meetings }; }
    if (part === 'oos') { return { events: [], races: races, meetings: input.oosMeetings || input.meetings }; }
    return { events: events, races: races, meetings: input.meetings };
  }
  /* The Signature event dropdown: the shown part's events, most starts first.
     A choice that's no longer there (another part shown) falls back to the first. */
  function fillSignature() {
    var list = signatureChoices(partOf(ui.input, ui.part).events), sel = el('sc-signature');
    if (!list.some(function (e) { return e.event === ui.signature; })) { ui.signature = list.length ? list[0].event : ''; }
    sel.textContent = '';
    list.forEach(function (e) {
      var o = document.createElement('option');
      o.value = e.event;
      o.textContent = e.event + ' (' + plural(e.starts || 0, 'start') + ')';
      o.selected = e.event === ui.signature;
      sel.appendChild(o);
    });
    el('sc-signature-field').hidden = list.length < 2;
  }
  function refacts() {
    fillSignature();
    ui.f = facts(Object.assign({}, ui.input, partOf(ui.input, ui.part), { surname: ui.surname, signature: ui.signature }));
    el('sc-caption').value = caption(ui.f);
  }
  function photoChoice() { return ui.usePhoto ? (ui.picked || ui.header) : null; }
  function resetPos() {
    var ph = photoChoice(), p = window.NCANPbCard.parseFocus(ph && ph.focus);
    ui.pos = { x: p.x, y: p.y, zoom: 1 };
    el('sc-zoom').value = 100;
  }
  // the photo chosen, or none: read it, preview its looks, draw both sides
  function usePhoto() {
    var ph = photoChoice(), n = ++ui.seq;
    ui.looks = {}; ui.source = ui.thumbSource = null; ui.front = null;
    resetPos();
    photoWords();
    if (!ph) { sides(); drawAll(); return; }
    say('Reading the photo…');
    loadImage(ph.url).then(function (img) {
      if (n !== ui.seq) { return; }
      if (!img) { say('Sorry, that photo could not be read.'); ui.usePhoto = false; photoWords(); sides(); drawAll(); return; }
      ui.source = photoCanvas(img, 1400);
      ui.thumbSource = photoCanvas(img, 200);
      photoWords();
      sides();
      drawAll();
      setTimeout(function () { thumbs(n); }, 400);
    });
  }
  function photoWords() {
    var has = !!ui.header, on = !!photoChoice();
    el('sc-use-header').hidden = !(has && (ui.picked || !ui.usePhoto));
    el('sc-nophoto').hidden = !on;
    el('sc-pick-words').textContent = on ? 'Use a different photo' : 'Add a photo';
    el('sc-photo-said').textContent = !on
      ? 'No photo: the card is the stats side alone. Add one for a photo side; it stays on this device.'
      : ui.picked ? 'Using the photo you chose. It stays on this device.' : 'Using the header photo.';
    el('sc-looks-field').hidden = !on;
    el('sc-adjust').hidden = !on;
    el('sc-save-front').hidden = !on;
  }
  // each look's preview, one at a time, so the page stays responsive
  function thumbs(n) {
    var list = FILTERS.slice();
    var next = function () {
      if (n !== ui.seq || !list.length || !ui.thumbSource) { return; }
      var fl = list.shift(), b = el('sc-looks').querySelector('[data-look="' + fl.id + '"] canvas');
      var src = filtered(ui.thumbSource, fl.id), r = window.NCANPbCard.cover(src.width, src.height, b.width, b.height, ui.pos.x + '% ' + ui.pos.y + '%', 1);
      var x = b.getContext('2d');
      x.clearRect(0, 0, b.width, b.height);
      x.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, b.width, b.height);
      setTimeout(next, 16);
    };
    next();
  }
  // with a photo, a card with two sides to turn; without one, the stats side alone
  function sides() {
    var two = !!(photoChoice() && ui.source);
    el('sc-stage').classList.toggle('is-single', !two);
    el('sc-flip').hidden = !two;
    flip(!two);
  }
  function flip(toBack) {
    ui.flipped = toBack;
    el('sc-stage').classList.toggle('is-flipped', toBack);
    el('sc-flip-words').textContent = toBack ? 'Turn to the photo side' : 'Turn to the stats side';
    el('sc-front').setAttribute('aria-hidden', toBack ? 'true' : 'false');
    el('sc-back').setAttribute('aria-hidden', toBack ? 'false' : 'true');
    el('sc-card').classList.toggle('is-placeable', !toBack && !!ui.source);
  }
  function lookOf() {
    if (!ui.looks[ui.look]) { ui.looks[ui.look] = filtered(ui.source, ui.look); }
    return ui.looks[ui.look];
  }
  function buttons() {
    el('sc-save-front').disabled = !ui.front;
    el('sc-save-back').disabled = !ui.back;
  }
  function drawAll() { drawBack(); drawFront(); }
  function drawBack() {
    var f = ui.f;
    ui.back = null; buttons();
    back(f, { finish: ui.finish, fonts: fontsOf(), logo: ui.logoLight }).then(function (cv) {
      if (f !== ui.f || !ui.d.open) { return; }
      ui.back = cv;
      var img = el('sc-back');
      img.src = cv.toDataURL('image/png');
      img.alt = 'The stats side of ' + f.name + '’s ' + f.season + ' season card: ' + plural(f.totals.starts, 'start') + ', ' +
        plural(f.totals.wins, 'win') + ', ' + plural(f.totals.newPbs, 'new personal best') + '. ' + f.highlights.join(' ');
      buttons();
      if (!photoChoice()) { say(''); }
    }).catch(function () { say('Sorry, the card could not be made.'); });
  }
  // quiet: placing the photo; one drawing at a time, and the latest position wins
  function drawFront(quiet) {
    if (!photoChoice() || !ui.source) { return; }
    if (ui.busy) { ui.again = true; return; }
    if (!quiet) { say(lookName(ui.look) + ': working on the photo…'); ui.front = null; buttons(); }
    ui.busy = true; ui.again = false;
    // a moment for the words to show before a slow look is worked out
    setTimeout(function () {
      var f = ui.f, ph;
      try { ph = lookOf(); } catch (e) { ph = ui.source; }
      front(f, { photo: ph, focus: ui.pos.x + '% ' + ui.pos.y + '%', zoom: ui.pos.zoom, finish: ui.finish, fonts: fontsOf(),
                 logo: ui.logo, cover: window.NCANPbCard.cover }).then(function (cv) {
        if (!ui.d.open || !ui.source) { return; }
        ui.front = cv;
        var img = el('sc-front');
        img.src = cv.toDataURL('image/png');
        img.alt = 'The photo side of ' + f.name + '’s ' + f.season + ' season card: ' + finishOf(ui.finish).name.toLowerCase() +
          ' frame, the photo in the ' + lookName(ui.look).toLowerCase() + ' look' + (f.rookie ? ', with a rookie card badge' : '') + '.';
        say('');
      }).catch(function () { say('Sorry, the photo side could not be made.'); }).then(function () {
        ui.busy = false; buttons();
        if (ui.again && ui.d.open) { drawFront(true); }
      });
    }, quiet ? 0 : 40);
  }
  function save(side) {
    var cv = side === 'front' ? ui.front : ui.back;
    if (!cv || !window.NCANChartImage) { return; }
    window.NCANChartImage.save(cv, fileName(ui.f, side)).then(function (how) {
      say(how === 'saved' ? (side === 'front' ? 'Photo side saved.' : 'Stats side saved.') : how === 'shared' ? 'Shared.' : '');
    }).catch(function () { say('Sorry, the card could not be saved.'); });
  }

  /* The card in the hand: it tilts towards the pointer, with light moving over the
     foil (none for reduced motion), and on the photo side the photo is dragged, or
     moved with the arrow keys, into place. */
  function handSetUp() {
    var stage = el('sc-stage'), card = el('sc-card'), img = el('sc-front'), drag = null;
    var rest = function () {
      stage.style.setProperty('--rx', '0deg'); stage.style.setProperty('--ry', '0deg');
      stage.classList.remove('is-tilting');
    };
    stage.addEventListener('pointermove', function (e) {
      if (drag || reduced() || e.pointerType !== 'mouse') { return; }
      var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
      stage.style.setProperty('--rx', ((0.5 - y) * 14).toFixed(2) + 'deg');
      stage.style.setProperty('--ry', ((x - 0.5) * 18).toFixed(2) + 'deg');
      stage.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      stage.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      stage.classList.add('is-tilting');
    });
    stage.addEventListener('pointerleave', rest);
    img.draggable = false;
    img.addEventListener('pointerdown', function (e) {
      if (ui.flipped || !ui.front || !ui.front.photo) { return; }
      e.preventDefault();
      rest();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, k: W / (img.clientWidth || 1) };
      img.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });
    img.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) { return; }
      var p = ui.front.photo, dx = (e.clientX - drag.x) * drag.k, dy = (e.clientY - drag.y) * drag.k;
      drag.x = e.clientX; drag.y = e.clientY;
      ui.pos = window.NCANPbCard.move(ui.pos, dx, dy, p.iw, p.ih, p.w, p.h);
      drawFront(true);
    });
    var end = function (e) { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove('is-dragging'); } };
    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', end);
    card.addEventListener('keydown', function (e) {
      if (ui.flipped || !ui.front || !ui.front.photo) { return; }
      var step = e.shiftKey ? 60 : 15, p = ui.front.photo;
      var mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      var zoom = e.key === '+' || e.key === '=' ? 0.1 : e.key === '-' || e.key === '_' ? -0.1 : 0;
      if (mv) { ui.pos = window.NCANPbCard.move(ui.pos, mv[0], mv[1], p.iw, p.ih, p.w, p.h); }
      else if (zoom) { ui.pos.zoom = Math.min(4, Math.max(1, ui.pos.zoom + zoom)); el('sc-zoom').value = Math.round(ui.pos.zoom * 100); }
      else { return; }
      e.preventDefault();
      drawFront(true);
    });
  }

  function open(input, from, hooks) {
    if (!setUp()) { return; }
    ui.input = input; ui.from = from || null; ui.hooks = hooks || {};
    ui.surname = !!input.surnameByDefault;
    el('sc-surname').checked = ui.surname;
    var both = (input.events || []).length > 0 && (input.races || []).length > 0;
    // until the season ends in April, only the finished winter part can be shown
    var done = ready(input.season, input.today);
    ui.part = done.track ? 'both' : 'oos'; ui.signature = '';
    el('sc-seasons').hidden = !both;
    var parts = document.querySelectorAll('input[name="sc-part"]');
    Array.prototype.forEach.call(parts, function (r) {
      r.disabled = !done.track && r.value !== 'oos';
      r.checked = r.value === ui.part;
    });
    var wait = el('sc-seasons-said');
    wait.hidden = done.track || !both;
    wait.textContent = done.track ? '' : 'Track and field, and Both, open on ' + dayText(done.trackFrom) + ', when the season ends.';
    refacts();
    el('sc-title').textContent = 'The ' + input.season + ' season card';
    var stored = null;
    try { stored = localStorage.getItem('ncan-season-card-finish'); } catch (e) { /* default */ }
    ui.finish = FINISHES.some(function (x) { return x.id === stored; }) ? stored : 'chrome';
    checked('sc-finishes', 'finish', ui.finish);
    el('sc-stage').dataset.finish = ui.finish;
    el('sc-finish-name').textContent = finishOf(ui.finish).name;
    ui.look = 'natural';
    checked('sc-looks', 'look', ui.look);
    Array.prototype.forEach.call(el('sc-looks').querySelectorAll('canvas'), function (cv) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); });
    if (ui.picked) { URL.revokeObjectURL(ui.picked.url); ui.picked = null; }
    el('sc-file').value = '';
    ui.header = null; ui.usePhoto = true; ui.front = ui.back = null; ui.source = null;
    el('sc-front').removeAttribute('src'); el('sc-back').removeAttribute('src');
    buttons();
    say('Making the card…');
    ui.d.showModal();
    el('sc-title').focus();
    var n = ++ui.seq;
    (ui.hooks.headerPhoto ? ui.hooks.headerPhoto() : Promise.resolve(null)).then(function (h) {
      if (n !== ui.seq) { return; }
      ui.header = h && h.url ? h : null;
      usePhoto();
    }, function () { if (n === ui.seq) { usePhoto(); } });
  }

  return { W: W, H: H, FINISHES: FINISHES, FILTERS: FILTERS, facts: facts, signatureChoices: signatureChoices, ready: ready, canMake: canMake, partOf: partOf, highlights: highlights, funFact: funFact,
           caption: caption, fileName: fileName, metresOf: metresOf, groupOf: groupOf, gain: gain,
           look: look, LOOKS: LOOKS, blur: blur, edges: edges, rng: rng,
           front: front, back: back, filtered: filtered, open: open };
}));
