/* Season collector cards ---------------------------------------------------
   A trading card of one athlete's season, made on this device from the athlete
   page (assets/js/athlete.js: the Season card button on each season's band).

   Two sides, each saved on its own:
   - the photo side: the athlete's photo in a metallic frame (chrome, gold,
     rainbow holo, club green or onyx), the club crest, the season badge, a
     Rookie Card badge in their first season, and their name on a slanted
     nameplate. The photo can be given a look: chrome, gold rush, pencil sketch,
     vintage, noir, heat map, club duotone, film, soft glow, bold contrast or infrared.
   - the stats side: the season in numbers, as on the back of a baseball card:
     each event's starts, season best, personal best, wins and top-three
     places, with a totals row; cross country, road and relay races; a few
     highlights; and a "Did you know?" fact, picked at random from the ones that
     suit the athlete (a sprinter's speed, a thrower's best against a tennis court,
     the runners a cross country runner beat, their signature event's season).
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
  // 1st, 2nd and 3rd places: gold, silver and bronze
  var MEDALS = { 1: '#FFC629', 2: '#C9D1D9', 3: '#D9965B' };
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
    { id: 'sketch', name: 'Pencil sketch' }, { id: 'vintage', name: 'Vintage' }, { id: 'noir', name: 'Noir' },
    { id: 'thermal', name: 'Heat map' }, { id: 'duotone', name: 'Club duotone' }, { id: 'film', name: 'Film' },
    { id: 'glow', name: 'Soft glow' }, { id: 'bold', name: 'Bold contrast' }, { id: 'infrared', name: 'Infrared' }
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
  function signatureChoices(events, races) {
    return (events || []).concat(raceKinds(races)).sort(function (x, y) {
      return (y.starts || 0) - (x.starts || 0) || (y.newPbs || 0) - (x.newPbs || 0) || (y.podiums || 0) - (x.podiums || 0);
    });
  }
  /* Cross country, road and relay races as signature choices: one per kind, all
     distances together (a cross country course changes with grade and venue).
     The season line plots each finishing place, first at the top; podiums in gold. */
  var RACE_KINDS = [['Cross country', 'Cross country'], ['Road', 'Road'], ['Relay', 'Relays']];
  function raceKinds(races) {
    var out = [];
    RACE_KINDS.forEach(function (k) {
      var list = (races || []).filter(function (r) { return (r.team ? 'Relay' : r.kind) === k[0]; })
        .sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0; });
      if (!list.length) { return; }
      var placed = list.filter(function (r) { return r.place >= 1; });
      out.push({
        event: k[1], race: true, kind: k[0], starts: list.length,
        wins: placed.filter(function (r) { return r.place === 1; }).length,
        podiums: placed.filter(function (r) { return r.place <= 3; }).length,
        points: placed.map(function (r) { return { value: r.place, date: r.date, medal: r.place <= 3 ? r.place : 0 }; })
      });
    });
    return out;
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
    /* the fourth number: new PBs on a card with track and field, unless there are
       none and there are podiums; podiums (relay teams' too) on a card of cross
       country, road and relays alone, where a course isn't a PB */
    var podiums = totals.podiums + races.filter(function (r) { return r.team && r.place >= 1 && r.place <= 3; }).length;
    var tile = events.length && (totals.newPbs || !podiums)
      ? { kind: 'pbs', value: totals.newPbs, label: totals.newPbs === 1 ? 'NEW PB' : 'NEW PBS' }
      : { kind: 'podiums', value: podiums, label: podiums === 1 ? 'PODIUM' : 'PODIUMS' };
    // the signature event: the one chosen, or by default the first by starts
    var byStarts = signatureChoices(events, races);
    var sig = byStarts.filter(function (e) { return e.event === a.signature; })[0] || byStarts[0] || null;
    return {
      first: first, last: last, name: a.surname && last ? first + ' ' + last : first,
      season: a.season || '', cardNo: pad2(+a.cardNo || 1), rookie: !!a.rookie, grade: a.grade || '',
      upTo: a.upTo || '', events: events, races: races, totals: totals, tile: tile, signature: sig,
      position: sig ? groupOf(sig.event) : races.length ? groupOf(races[0].kind || races[0].race) : 'Athletics',
      highlights: highlights(a, events, races, totals),
      fact: funFact(events, races, sig, seedOf(String(a.name || '') + '|' + (a.season || '') + '|' + (+a.factTurn || 0)))
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
    // relay teams' top-three places count too, as the podiums number does
    var team = races.filter(function (r) { return r.team && r.place >= 1 && r.place <= 3; }).length;
    var teamText = team ? (totals.podiums ? ', and ' + team + ' more with relay teams' : ' with relay teams') : '';
    if (totals.wins) {
      out.push(plural(totals.wins, 'win') + (totals.podiums > totals.wins ? ' and ' + plural(totals.podiums, 'top-three finish', 'top-three finishes') : '') + teamText + '.');
    } else if (totals.podiums || team) {
      out.push(totals.podiums ? plural(totals.podiums, 'top-three finish', 'top-three finishes') + teamText + '.'
        : plural(team, 'top-three finish', 'top-three finishes') + teamText + '.');
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

  /* "Did you know?": one fact about the season, in something a child can picture.
     Every fact that fits the season is worked out, each tagged with the kind of
     athlete it suits (sprint, hurdles, distance, walk, throw, jump, cross country,
     road, relay), plus facts about the signature event. The card picks one at
     random from the kinds that make up most of their starts (any kind with at
     least half the starts of their busiest kind), and the signature event's.
     The pick is seeded, so a card keeps its fact until "Another fact" is asked for.
     { icon: 'run' | 'throw' | 'jump' | 'star', words, choices } */
  var KIND = { Sprints: 'sprint', Hurdles: 'hurdles', 'Middle distance': 'distance', Distance: 'distance', Walks: 'walk',
    Throws: 'throw', Jumps: 'jump', 'Cross country': 'xc', Road: 'road', Relays: 'relay' };
  var ICON = { sprint: 'run', hurdles: 'run', distance: 'run', walk: 'run', xc: 'run', road: 'run', relay: 'run', throw: 'throw', jump: 'jump' };
  // how many hurdles there are in a race, where every grade runs the same number
  var HURDLES = { 60: 5, 80: 8, 100: 10, 110: 10, 400: 10 };
  // things to measure a throw or a jump against: the biggest one beaten is named
  var LONG_THINGS = [
    [2.03, 'a king-size bed (about 2 m)'], [4.5, 'a family car (about 4.5 m)'], [5.5, 'a giraffe is tall (about 5.5 m)'],
    [12, 'a city bus (about 12 m)'], [20.12, 'a cricket pitch (20.12 m)'], [23.77, 'a tennis court (23.77 m)'],
    [30.5, 'a netball court (30.5 m)'], [50, 'an Olympic swimming pool (50 m)'], [100, 'a rugby field, try line to try line']
  ];
  var HIGH_THINGS = [
    [0.9, 'a kitchen bench (about 90 cm)'], [1.07, 'a Shetland pony at the shoulder (up to 1.07 m)'], [2, 'a front door (about 2 m)'],
    [3.05, 'a netball goal ring (3.05 m)'], [4.4, 'a double-decker bus (about 4.4 m)']
  ];
  function kindOf(name) { return KIND[groupOf(name)] || 'any'; }
  function isHigh(event) { return /high|vault/i.test(event); }
  function nums(e) { return (e.points || []).map(function (p) { return p.value; }).filter(function (v) { return typeof v === 'number' && v > 0; }); }
  function km(m) { return (m / 1000).toFixed(m >= 100000 ? 0 : 1).replace(/\.0$/, '') + ' km'; }
  function oneDp(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  // seconds as a race time: 12.47, or 1:05.30
  function clock(v) {
    if (v < 60) { return v.toFixed(2); }
    var m = Math.floor(v / 60), s = v - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  // seconds as a length of time: 48 seconds, 3 min 12 s, 1 h 4 min
  function span(v) {
    v = Math.round(v);
    if (v < 60) { return plural(v, 'second'); }
    if (v < 3600) { return Math.floor(v / 60) + ' min' + (v % 60 ? ' ' + v % 60 + ' s' : ''); }
    return Math.floor(v / 3600) + ' h ' + Math.floor(v % 3600 / 60) + ' min';
  }
  function biggest(list, value) {
    var hit = null;
    list.forEach(function (t) { if (value > t[0]) { hit = t[1]; } });
    return hit;
  }
  function random(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // the facts about one event: how it went from first to best, how steady, how
  // fast or how far; 'sig' facts name the event, as the signature event's
  function eventFacts(e, add, kind) {
    var v = nums(e), field = !!e.field, m = metresOf(e.event), ev = e.event;
    if (!v.length) { return; }
    var best = field ? Math.max.apply(null, v) : Math.min.apply(null, v), firstV = v[0];
    var bestMark = e.sb && e.sb.mark ? e.sb.mark : field ? best.toFixed(2) + 'm' : clock(best);
    // from the first of the season to the best
    if (v.length >= 2 && best !== firstV) {
      if (field) {
        var g = gain(best, firstV, true);
        if (g) { add(kind, 'The best ' + ev + ' of the season (' + bestMark + ') went ' + g.slice(1) + (isHigh(ev) ? ' higher' : ' further') + ' than the first one.'); }
      } else if (m) {
        var ahead = (firstV - best) * m / best;
        if (ahead >= 1) {
          add(kind, 'The season’s best ' + ev + ' (' + bestMark + ') would have finished about ' + Math.round(ahead) + ' m ahead of the first one (' + clock(firstV) + ').');
        }
      }
    }
    // steady: most marks close to the best
    if (v.length >= 4) {
      var near = v.filter(function (x) { return field ? x >= best * 0.95 : x <= best * 1.03; }).length;
      if (near >= 3 && near / v.length >= 0.6) {
        add(kind, near + ' of ' + v.length + ' ' + ev + ' marks were within ' + (field ? '5%' : '3%') + ' of the season best (' + bestMark + '): rock steady all season.');
      }
    }
    // a run of new bests
    if ((e.newPbs || 0) >= 2) { add(kind, 'Set a new ' + ev + ' PB ' + e.newPbs + ' times this season: the bar kept moving.'); }
    // the most raced
    if ((e.starts || 0) >= 4) {
      add(kind, 'Lined up for the ' + ev + ' ' + e.starts + ' times' + (m && !field ? ': ' + (m * e.starts >= 1000 ? km(m * e.starts) : m * e.starts + ' m') + ' of ' + ev + ' racing.' : ' this season.'));
    }
    // how fast, or how far
    if (!field && m && m <= 400 && !/relay/i.test(ev)) {
      var mps = m / best;
      if (mps > 3 && mps < 12) {
        add(kind, 'Averaged ' + oneDp(mps * 3.6) + ' km/h over the ' + ev + ' (' + bestMark + '): about ' + oneDp(mps / 4.5) + ' family-car lengths every second.');
        add(kind, 'In the blink of an eye (about a third of a second), the best ' + ev + ' covered ' + oneDp(mps / 3) + ' m of track.');
      }
    }
    if (field && !isHigh(ev)) {
      var thing = biggest(LONG_THINGS, best);
      if (thing) { add(kind, 'The best ' + ev + ' (' + bestMark + ') went further than ' + thing + '.'); }
    }
    if (field && isHigh(ev)) {
      var up = biggest(HIGH_THINGS, best);
      if (up) { add(kind, 'Cleared ' + bestMark + ' in the ' + ev + ': higher than ' + up + '.'); }
    }
    if (/walk/i.test(ev) && m) {
      var kmh = m / best * 3.6;
      if (kmh > 5.5 && kmh < 18) { add(kind, 'Race walked the ' + ev + ' at ' + oneDp(kmh) + ' km/h, with a foot always on the ground: ' + oneDp(kmh / 5) + ' times the pace of an everyday walk.'); }
    }
    var hurdles = /hurdle/i.test(ev) ? HURDLES[m] : 0;
    if (hurdles && e.starts) { add(kind, 'Cleared ' + hurdles * e.starts + ' hurdles in ' + plural(e.starts, 'race') + ' of the ' + ev + ' this season.'); }
  }

  function funFact(events, races, sig, seed) {
    var facts = [], weight = {};
    var add = function (kind, words) { if (words && words.length <= 170) { facts.push({ kind: kind, words: words }); } };
    events.forEach(function (e) { var k = kindOf(e.event); weight[k] = (weight[k] || 0) + (e.starts || 0); });
    races.forEach(function (r) { var k = r.team ? 'relay' : kindOf(r.kind || r.race); weight[k] = (weight[k] || 0) + 1; });

    // the signature event's own facts; a race kind as signature has its kind's facts count as its own
    var sigKind = sig && sig.race ? kindOf(sig.event) : '';
    if (sig && !sig.race) { eventFacts(sig, add, 'sig'); }
    // the busiest event of each kind, for that kind
    var seen = {};
    signatureChoices(events).forEach(function (e) {
      var k = kindOf(e.event);
      if (seen[k] || e === sig) { seen[k] = true; return; }
      seen[k] = true;
      eventFacts(e, add, k);
    });

    // running on the track, in all
    var clockTime = 0, runs = 0, ran = 0;
    events.forEach(function (e) {
      var k = kindOf(e.event);
      if (e.field || k === 'throw' || k === 'jump') { return; }
      ran += metresOf(e.event) * (e.starts || 0);
      if (k !== 'relay') { nums(e).forEach(function (x) { clockTime += x; runs++; }); }
    });
    if (runs >= 3) {
      var song = clockTime < 240 ? 'less time than most pop songs.' : clockTime < 900 ? 'less than a morning tea break.' :
        clockTime < 2400 ? 'shorter than a half of rugby.' : 'longer than a half of rugby.';
      var main = ['sprint', 'hurdles', 'distance', 'walk'].sort(function (x, y) { return (weight[y] || 0) - (weight[x] || 0); })[0];
      add(main, 'All ' + runs + ' track races added up to just ' + span(clockTime) + ' on the clock: ' + song);
    }
    // the ground covered, on the track and off it
    var off = 0, offKind = 'xc';
    races.forEach(function (r) { off += metresOf(r.race); });
    if (races.length) { offKind = sigKind === 'xc' || sigKind === 'road' ? sigKind : (weight.road || 0) > (weight.xc || 0) ? 'road' : 'xc'; }
    var all = ran + off, distKind = off > ran ? offKind : 'distance';
    if (all >= 800) {
      add(distKind, 'Raced ' + (all >= 1000 ? km(all) : all + ' m') + ' in competition this season: that’s ' + Math.round(all / 400) + ' laps of a track.');
    }
    if (all >= 10000) {
      add(distKind, 'Raced ' + km(all) + ' in competition this season: ' +
        (all >= 42195 ? 'further than a full marathon (42.2 km).' : all >= 21098 ? 'further than a half marathon (21.1 km).' : 'that’s ' + Math.round(all / 421.95) + '% of a marathon.'));
    }

    // throws and jumps, in all
    var thrown = 0, throws = 0, jumped = 0, jumps = 0;
    events.forEach(function (e) {
      var k = kindOf(e.event);
      if (k === 'throw') { nums(e).forEach(function (x) { thrown += x; throws++; }); }
      if (k === 'jump' && !isHigh(e.event)) { nums(e).forEach(function (x) { jumped += x; jumps++; }); }
    });
    if (thrown >= 10) {
      add('throw', 'Threw a combined ' + Math.round(thrown) + ' m in ' + plural(throws, 'throw') + ': ' +
        (thrown >= 100 ? 'about ' + oneDp(thrown / 100) + ' rugby fields, try line to try line.' : 'a long way to fetch them all back.'));
    }
    if (jumped >= 5) {
      add('jump', 'Jumped a combined ' + jumped.toFixed(1) + ' m in ' + plural(jumps, 'jump') + ': longer than ' +
        (jumped >= 12 ? plural(Math.floor(jumped / 12), 'city bus', 'city buses') + ' end to end.' : 'a family car.'));
    }

    // cross country and road: the runners beaten, and the best finish
    var solo = races.filter(function (r) { return !r.team && r.place >= 1 && r.of >= r.place; });
    var beaten = solo.reduce(function (t, r) { return t + r.of - r.place; }, 0);
    if (beaten >= 5) { add(offKind, 'Finished ahead of ' + beaten + ' runners across ' + plural(solo.length, 'race') + '.'); }
    var top = solo.filter(function (r) { return r.of >= 10; }).sort(function (x, y) { return x.place / x.of - y.place / y.of; })[0];
    if (top && top.place === 1) {
      add(offKind, 'Won the ' + top.race + ', ahead of ' + plural(top.of - 1, 'other runner') + '.');
    } else if (top && top.place / top.of <= 0.5) {
      add(offKind, 'Finished in the top ' + Math.max(1, Math.ceil(top.place / top.of * 100)) + '% of the field at the ' + top.race + ' (' + ordinal(top.place) + ' of ' + top.of + ').');
    }
    // relays
    var legs = races.filter(function (r) { return r.team; });
    var batons = legs.length + events.filter(function (e) { return /relay/i.test(e.event); }).reduce(function (t, e) { return t + (e.starts || 0); }, 0);
    if (batons >= 2) {
      var teamPods = legs.filter(function (r) { return r.place >= 1 && r.place <= 3; }).length;
      add('relay', 'Ran ' + plural(batons, 'relay leg') + ' this season' + (teamPods ? ', with ' + plural(teamPods, 'team podium') : '') + ': teamwork makes the dream work.');
    }

    // cross country, road and relays: time, pace, strides, fields and climbs
    var secs = function (mark) {
      var p = String(mark || '').split(':'), v = 0;
      if (p.length < 2 || p.length > 3) { return 0; }
      for (var i = 0; i < p.length; i++) { if (!/^\d+(\.\d+)?$/.test(p[i])) { return 0; } v = v * 60 + +p[i]; }
      return v;
    };
    var perKm = function (s, m) { var v = Math.round(s / (m / 1000)); return Math.floor(v / 60) + ':' + (v % 60 < 10 ? '0' : '') + v % 60; };
    var timed = races.map(function (r) { return { r: r, m: metresOf(r.race), s: secs(r.mark) }; })
      .filter(function (t) { return t.m >= 1000 && t.s > 0 && t.s / (t.m / 1000) >= 120 && t.s / (t.m / 1000) <= 900; });
    var kindFor = function (r) { return r.team ? 'relay' : offKind; };
    if (timed.length >= 3) {
      var onClock = timed.reduce(function (t, x) { return t + x.s; }, 0);
      var like = onClock >= 7200 ? 'longer than most movies.' : onClock >= 4800 ? 'longer than a whole game of rugby.' :
        onClock >= 3600 ? 'longer than a game of netball.' : onClock >= 1800 ? 'longer than a TV episode.' : 'quicker than cooking a roast.';
      add(offKind, 'Spent ' + span(onClock) + ' racing off the track this season: ' + like);
      var fast = timed.slice().sort(function (x, y) { return x.s / x.m - y.s / y.m; })[0];
      add(kindFor(fast.r), 'Fastest pace of the season: ' + perKm(fast.s, fast.m) + ' per km, in the ' + fast.r.race + '. At that pace, a 10 km takes ' +
        span(fast.s / fast.m * 10000) + '.');
    }
    if (off >= 3000) {
      add(offKind, 'Raced ' + km(off) + ' off the track: about ' + (Math.round(off / 1.2 / 100) * 100).toLocaleString('en-NZ') + ' running strides.');
    }
    if (off >= 8849) {
      add(offKind, 'Raced ' + km(off) + ' off the track this season: ' +
        (off >= 17698 ? oneDp(off / 8849) + ' times' : 'further than') + ' the height of Mt Everest (8.8 km).');
    }
    if (off >= 22000) {
      add(offKind, 'Raced ' + km(off) + ' off the track: ' + (off >= 44000 ? oneDp(off / 22000) + ' times' : 'further than') + ' the width of Cook Strait (22 km).');
    }
    var fields = solo.filter(function (r) { return r.of >= 2; });
    var rivals = fields.reduce(function (t, r) { return t + r.of - 1; }, 0);
    if (fields.length >= 3 && rivals >= 20) {
      var biggestField = fields.slice().sort(function (x, y) { return y.of - x.of; })[0];
      add(offKind, 'Lined up against ' + rivals + ' runners across ' + plural(fields.length, 'race') + '. The biggest field: ' +
        biggestField.of + ' at the ' + biggestField.race + '.');
    }
    var longest = races.filter(function (r) { return !r.team && metresOf(r.race) >= 3000 && r.mark; })
      .sort(function (x, y) { return metresOf(y.race) - metresOf(x.race); })[0];
    if (longest) { add(offKind, 'Longest race of the season: the ' + longest.race + ', done in ' + longest.mark + '.'); }
    var relayM = legs.reduce(function (t, r) { return t + metresOf(r.race); }, 0);
    if (legs.length && relayM >= 2000) {
      add('relay', 'Carried the baton ' + km(relayM) + ' for the team this season' + (legs.length > 1 ? ', over ' + plural(legs.length, 'leg') : '') + '.');
    }
    var finishes = solo.length + legs.filter(function (r) { return r.place >= 1; }).length;
    if (finishes >= 6) { add(offKind, 'Crossed ' + finishes + ' finish lines off the track this season' + (offKind === 'xc' ? ': mud, hills and all.' : '.')); }

    // any athlete: how many different events, and the busiest month
    if (events.length >= 5) { add('any', 'Tried ' + events.length + ' different events this season: a true all-rounder.'); }
    var months = {};
    events.forEach(function (e) { (e.points || []).forEach(function (p) { if (p.date) { var k = p.date.slice(0, 7); months[k] = (months[k] || 0) + 1; } }); });
    races.forEach(function (r) { if (r.date) { var k = r.date.slice(0, 7); months[k] = (months[k] || 0) + 1; } });
    var busy = Object.keys(months).sort(function (x, y) { return months[y] - months[x] || (x < y ? -1 : 1); })[0];
    if (busy && months[busy] >= 4) { add('any', 'The busiest month was ' + FULL_MONTHS[+busy.slice(5, 7) - 1] + ', with ' + months[busy] + ' starts.'); }

    // the kinds that suit them: half the starts of their busiest kind, or more
    var top1 = Math.max.apply(null, [0].concat(Object.keys(weight).map(function (k) { return weight[k]; })));
    var suits = function (f) { return f.kind === 'sig' || (sigKind && f.kind === sigKind) || (f.kind !== 'any' && top1 && (weight[f.kind] || 0) >= top1 / 2); };
    var pool = facts.filter(suits);
    if (pool.length < 2) { pool = pool.concat(facts.filter(function (f) { return !suits(f); })); }
    if (!pool.length) { return { icon: 'star', words: 'Every collection starts somewhere. This card is a first edition.', choices: 1 }; }
    var pick = pool[Math.floor(random(seed || 1)() * pool.length)];
    var iconKind = pick.kind === 'sig' ? kindOf(sig.event) : pick.kind;
    return { icon: ICON[iconKind] || 'star', words: pick.words, choices: pool.length };
  }

  function caption(f) {
    var t = f.totals, bits = [];
    if (t.newPbs) { bits.push(plural(t.newPbs, 'PB')); }
    if (t.wins) { bits.push(plural(t.wins, 'win')); }
    var top3 = f.tile.kind === 'podiums' ? f.tile.value : t.podiums;
    if (top3) { bits.push(top3 + ' top-three'); }
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
  // sizes are given for a photo 1000 pixels across; this scales them
  function unit(img) { return Math.max(0.2, Math.max(img.width, img.height) / 1000); }
  function px(img, n) { return Math.max(1, Math.round(n * unit(img))); }

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
    thermal: function (img) {
      return gradientMap(blur(img, px(img, 1), 1), ['#05001A', '#2A0A8C', '#9B0FA3', '#F0306A', '#FF8A00', '#FFE14D', '#FFFFF2']);
    },
    // the club's colours: deep green shadows to gold highlights, like a team poster
    duotone: function (img) {
      return gradientMap(adjust(img, { contrast: 1.2 }), [C.ink, C.green2, C.leaf, C.gold, C.cream]);
    },
    // warm, a little faded, lifted blacks and soft grain: an old trading card print
    film: function (img) {
      var d = img.data;
      adjust(img, { contrast: 0.92, saturation: 0.85 });
      for (var i = 0; i < d.length; i += 4) {
        var l = lumAt(d, i) / 255;
        d[i] = clamp255(d[i] * 0.9 + 24 + 10 * l);          // warm highlights
        d[i + 1] = clamp255(d[i + 1] * 0.88 + 22);
        d[i + 2] = clamp255(d[i + 2] * 0.8 + 30 - 14 * l);  // cool, faded shadows
      }
      return grain(vignette(img, 0.3), 16, 7);
    },
    // the bright parts bloom softly over the photo: flattering for a portrait
    glow: function (img) {
      var d = img.data, b = blur(img, px(img, 14), 3).data;
      for (var i = 0; i < d.length; i += 4) {
        for (var c = 0; c < 3; c++) {
          var a = d[i + c] / 255, s = b[i + c] / 255;
          var screen = 1 - (1 - a) * (1 - s * s);              // only the highlights glow
          d[i + c] = clamp255((a * 0.45 + screen * 0.55) * 255 + 6);
        }
      }
      return adjust(img, { contrast: 0.96, saturation: 1.08 });
    },
    // punchy colour, crisp edges and deep blacks: a sports magazine cover
    bold: function (img) {
      var s = blur(img, px(img, 3), 2).data, d = img.data;
      for (var i = 0; i < d.length; i += 4) { for (var c = 0; c < 3; c++) { d[i + c] = clamp255(d[i + c] + (d[i + c] - s[i + c]) * 0.9); } }
      for (var j = 0; j < d.length; j += 4) {
        for (var k = 0; k < 3; k++) { var v = d[j + k] / 255; d[j + k] = clamp255(v * v * (3 - 2 * v) * 255); }   // an S curve
      }
      return vignette(adjust(img, { contrast: 1.12, saturation: 1.35, brightness: -4 }), 0.35);
    },
    // infrared film: leaves and grass glow white-pink, skies go deep and dark, skin turns pale and smooth
    infrared: function (img) {
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2];
        var sky = Math.max(0, b - (r + g) / 2) / 255;                                          // blue that isn't leaf or skin
        var ir = clamp255(0.3 * r + 1.3 * g - 0.6 * b + 0.4 * Math.max(0, g - r) - 420 * sky);  // what infrared film "sees"
        d[i] = clamp255(ir * 1.05 + 14);
        d[i + 1] = clamp255(ir * 0.82 + 6);
        d[i + 2] = clamp255(ir * 0.9 + 30 * (1 - ir / 255) + 60 * sky);
      }
      return vignette(glowSoft(adjust(img, { contrast: 1.15, saturation: 0.9 })), 0.3);
    }
  };
  // a light bloom over the brightest parts, the halo infrared film is known for
  function glowSoft(img) {
    var d = img.data, b = blur(img, px(img, 6), 2).data;
    for (var i = 0; i < d.length; i += 4) {
      for (var c = 0; c < 3; c++) { var s = b[i + c] / 255; d[i + c] = clamp255(d[i + c] + s * s * s * 35); }
    }
    return img;
  }
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
  /* A mark split at its decimal point: '21:31.6' -> ['21:31', '.6'], '5.42m' -> ['5', '.42m'],
     '17:27' -> ['17:27', ''], so a column of marks can line up on the point */
  function markParts(mark) {
    var m = String(mark == null || mark === '' ? '\u2013' : mark), dot = m.search(/\.\d+\D*$/);
    return dot < 0 ? [m, ''] : [m.slice(0, dot), m.slice(dot)];
  }
  /* Draws a mark with its decimal point at x and every digit in a cell of the same width
     (canvas has no tabular figures), so times in a column line up digit for digit.
     o: { size, weight, family, colour, max (the widest the whole mark may be) } */
  function figures(c, mark, x, y, o) {
    var parts = markParts(mark), size = o.size || 16, cell, widths;
    var measure = function () {
      setFont(c, o.weight || 600, size, o.family);
      cell = Math.max.apply(null, '0123456789'.split('').map(function (d) { return c.measureText(d).width; }));
      widths = function (s) { return s.split('').map(function (ch) { return /\d/.test(ch) ? cell : c.measureText(ch).width; }); };
    };
    var total = function () { return widths(parts[0]).concat(widths(parts[1])).reduce(function (t, w) { return t + w; }, 0); };
    c.save();
    spaced(c, 0);
    measure();
    while (o.max && total() > o.max && size > 10) { size -= 1; measure(); }
    c.fillStyle = o.colour; c.textAlign = 'center';
    var at = x, ws = widths(parts[0]);
    for (var i = parts[0].length - 1; i >= 0; i--) { at -= ws[i]; c.fillText(parts[0][i], at + ws[i] / 2, y); }
    at = x; ws = widths(parts[1]);
    for (var j = 0; j < parts[1].length; j++) { c.fillText(parts[1][j], at + ws[j] / 2, y); at += ws[j]; }
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
      } else if (opts.placeholder) {
        // no photo yet: the club's crest where it will go, to show what the side looks like
        var glow = c.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, WIN.h * 0.62);
        glow.addColorStop(0, C.green2); glow.addColorStop(1, C.ink);
        c.fillStyle = glow; c.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
        c.save(); c.globalAlpha = 0.06; c.strokeStyle = '#FFFFFF'; c.lineWidth = 2;
        for (var d = -H; d < W; d += 26) { c.beginPath(); c.moveTo(d, WIN.y); c.lineTo(d + WIN.h, WIN.y + WIN.h); c.stroke(); }
        c.restore();
        var lw = 600, lh = lw * 508 / 888;
        c.drawImage(opts.placeholder, (W - lw) / 2, H * 0.42 - lh / 2 - 40, lw, lh);
        c.save();
        c.setLineDash([18, 14]); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.35)';
        rounded(c, WIN.x + 40, WIN.y + 230, WIN.w - 80, 600, 24); c.stroke();
        c.restore();
        c.font = '900 40px ' + D; c.fillStyle = C.goldSoft; c.textAlign = 'center';
        if (c.letterSpacing !== undefined) { c.letterSpacing = '6px'; }
        c.fillText('YOUR PHOTO HERE', W / 2, H * 0.42 + lh / 2 + 40);
        if (c.letterSpacing !== undefined) { c.letterSpacing = '0px'; }
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
      var big = p.pb || p.medal;
      c.beginPath(); c.arc(q[0], q[1], big ? 6 : 3.5, 0, Math.PI * 2);
      c.fillStyle = p.medal ? MEDALS[p.medal] : p.pb ? C.gold : '#FFFFFF'; c.fill();
      if (big) { c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke(); }
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
                   [t.wins, t.wins === 1 ? 'WIN' : 'WINS'], [f.tile.value, f.tile.label]];
      var by = 192, bh = 78, gap = 10, bw = (IW - gap * 3) / 4;
      boxes.forEach(function (x, i) {
        var bx = X0 + i * (bw + gap);
        c.fillStyle = C.cream; rounded(c, bx, by, bw, bh, 12); c.fill();
        c.fillStyle = metal(c, fin, bx, by, bw, 7); rounded(c, bx, by, bw, 7, 3); c.fill();
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
          // SB and PB line up on the decimal point, digit for digit
          figures(c, e.sb ? e.sb.mark : '–', cols[2] + 6, yy, { weight: newPb ? 800 : 600, family: S, colour: C.ink, max: newPb ? 78 : 96 });
          if (newPb) { text('★', cols[2] + 50, yy, { weight: 800, align: 'right' }); }
          figures(c, e.pb ? e.pb.mark : '–', cols[3] + 6, yy, { family: S, colour: C.ink, max: 88 });
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
          var yy = y + 21, podium = r.place >= 1 && r.place <= 3;
          text(day(r.date), rc[0], yy, { size: 14, weight: 700, colour: C.leaf, align: 'left', max: 72 });
          text(r.race, rc[1], yy, { size: 15, align: 'left', max: 380 });
          // times line up on the decimal point, digit for digit: whole seconds end at one line, tenths or hundredths after it
          figures(c, r.mark || '–', rc[2] + 14, yy, { weight: 700, family: S, colour: C.ink, max: 120 });
          if (podium) { c.fillStyle = MEDALS[r.place]; rounded(c, rc[3] - 58, y + 4, 116, RROW - 8, 6); c.fill(); }
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
      if (sig) { sparkline(c, sig.points, !sig.race && sig.field, lx, fy0 + 11, X1 - 96 - lx, 24); }
      text('ncan.nz', X1 - 14, fy0 + 28, { size: 13, weight: 800, colour: '#FFFFFF', align: 'right' });
      // the key: PB stars only where there are track and field results to have them
      text('From results published by meetings' + (f.upTo ? ', to ' + f.upTo : '') + '.' +
        (f.events.length ? ' ★ a new personal best that season.' : '') +
        (f.races.length ? ' Gold, silver and bronze: 1st, 2nd and 3rd places.' : ''),
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
    el('sc-fact').addEventListener('click', function () { anotherFact(); refacts(); drawAll(); });
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
    el('sc-ok').addEventListener('change', linkButton);
    el('sc-go').addEventListener('click', makeLink);
    el('sc-link-copy').addEventListener('click', function () { copy2(this, el('sc-link').value, 'Copy link'); });
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
    var shown = partOf(ui.input, ui.part), list = signatureChoices(shown.events, shown.races), sel = el('sc-signature');
    if (!list.some(function (e) { return e.event === ui.signature; })) { ui.signature = list.length ? list[0].event : ''; }
    sel.textContent = '';
    list.forEach(function (e) {
      var o = document.createElement('option');
      o.value = e.event;
      o.textContent = e.event + ' (' + plural(e.starts || 0, e.race ? 'race' : 'start') + ')';
      o.selected = e.event === ui.signature;
      sel.appendChild(o);
    });
    el('sc-signature-field').hidden = list.length < 2;
  }
  function refacts() {
    fillSignature();
    ui.f = facts(Object.assign({}, ui.input, partOf(ui.input, ui.part), { surname: ui.surname, signature: ui.signature, factTurn: ui.factTurn }));
    el('sc-caption').value = caption(ui.f);
    el('sc-fact-field').hidden = ui.f.fact.choices < 2;
  }
  // another fact: turn the seed on until the words change (two seeds can pick the same one)
  function anotherFact() {
    var base = Object.assign({}, ui.input, partOf(ui.input, ui.part), { signature: ui.signature }), was = ui.f && ui.f.fact.words;
    for (var i = 0; i < 12; i++) {
      ui.factTurn = (ui.factTurn || 0) + 1;
      if (facts(Object.assign({}, base, { factTurn: ui.factTurn })).fact.words !== was) { return; }
    }
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
      ? 'No photo yet: the club crest shows where it will go. Without one, only the stats side is saved or shared. A photo you add stays on this device.'
      : ui.picked ? 'Using the photo you chose: drag it on the card to move it into place. It stays on this device unless you make a public link.'
      : 'Using the header photo: drag it on the card to move it into place.';
    el('sc-looks-field').hidden = !on;
    el('sc-adjust').hidden = !on;
    if (el('sc-adjust-hint')) { el('sc-adjust-hint').hidden = !on; }   // missing from a page cached before it
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
  /* Always a card with two sides to turn: with no photo, the photo side shows the
     club's crest where the photo will go, as a preview. It isn't saved or shared:
     without a photo, the card saved and linked is the stats side alone. */
  function sides() {
    el('sc-stage').classList.remove('is-single');
    el('sc-flip').hidden = false;
    flip(false, true);
    stale(); publicShow(); linkButton();
  }
  /* The card's spin, in degrees: the turn button adds half a turn side to side, and
     dragging the card spins it any way, settling on the nearest side (upside down after
     an end-over-end turn, as a real card). */
  var spin = { x: 0, y: 0 };
  function spinShow() {
    var s = el('sc-stage');
    s.style.setProperty('--sx', spin.x + 'deg'); s.style.setProperty('--sy', spin.y + 'deg');
  }
  function flip(toBack, reset) {
    if (reset) { spin.x = 0; spin.y = 0; }
    else if (toBack !== ui.flipped) {
      /* the turn button lands the other side the right way up, in one half turn:
         upside down, it turns end over end; upright, side to side */
      var up = Math.round(spin.x / 360) * 360;
      if (Math.abs(up - spin.x) % 360 !== 180) { spin.y = Math.round(spin.y / 180) * 180 + 180; }
      spin.x = up;
    }
    spinShow();
    side(toBack);
  }
  function side(toBack) {
    ui.flipped = toBack;
    el('sc-stage').classList.toggle('is-flipped', toBack);
    el('sc-flip-words').textContent = toBack ? 'Turn to the photo side' : 'Turn to the stats side';
    el('sc-front').setAttribute('aria-hidden', toBack ? 'true' : 'false');
    el('sc-back').setAttribute('aria-hidden', toBack ? 'false' : 'true');
    el('sc-card').classList.toggle('is-placeable', !toBack && !!(photoChoice() && ui.source));
  }
  function lookOf() {
    if (!ui.looks[ui.look]) { ui.looks[ui.look] = filtered(ui.source, ui.look); }
    return ui.looks[ui.look];
  }
  function buttons() {
    el('sc-save-front').disabled = !ui.front;
    el('sc-save-back').disabled = !ui.back;
    linkButton();
  }

  /* The public link: one image of the card as it is now, the photo side and the
     stats side next to each other (each 1000 x 1400), or the stats side alone,
     made into a page by the API where the card turns over. A JPEG with a photo,
     else a PNG. A change to the card after a link is made asks for a new one. */
  var SIDE = { w: 1000, h: 1400 };
  function twoSided() { return !!(photoChoice() && ui.source); }
  function ready2() { return !!ui.back && (!twoSided() || (!!ui.front && !ui.busy)); }
  function linkButton() {
    if (!ui) { return; }
    el('sc-go').disabled = ui.sharing || !el('sc-ok').checked || !ready2();
  }
  function publicShow() {
    var can = !!(ui.hooks.share && ui.hooks.canShare && ui.hooks.canShare());
    el('sc-public').hidden = !can || !el('sc-done').hidden;
    el('sc-public-note').textContent = twoSided()
      ? 'Anyone with the link will see this card as it is now, both sides, with the photo. It never changes, and you can remove it on your Shared links page.'
      : 'Anyone with the link will see this card as it is now. It never changes, and you can remove it on your Shared links page.';
  }
  // the card changed: a link made already is of the card as it was
  function stale() {
    if (!ui || el('sc-done').hidden) { return; }
    el('sc-done').hidden = true;
    el('sc-link').value = '';
    publicShow();
  }
  // with two sides, a gap between them for the download (the API allows up to 40 px)
  var GAP = 40;
  function sheet() {
    var two = twoSided();
    var cv = document.createElement('canvas');
    cv.width = two ? SIDE.w * 2 + GAP : SIDE.w; cv.height = SIDE.h;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    // a PNG: the gap and the rounded corners stay clear
    if (two) { c.drawImage(ui.front, 0, 0, SIDE.w, SIDE.h); }
    c.drawImage(ui.back, two ? SIDE.w + GAP : 0, 0, SIDE.w, SIDE.h);
    return { canvas: cv, sides: two ? 2 : 1, type: 'image/png' };
  }
  function makeLink() {
    if (el('sc-go').disabled || !ready2()) { return; }
    var s = sheet(), f = ui.f, go = el('sc-go');
    ui.sharing = true; go.classList.add('is-busy'); linkButton();
    say('Making the public link…');
    ui.hooks.share(s.canvas, { type: s.type, sides: s.sides, season: ui.input.season, surname: ui.surname,
                               from: ui.input.firstDay, to: ui.input.lastDay }).then(function (share) {
      if (f !== ui.f || !ui.d.open) { return; }
      el('sc-public').hidden = true;
      el('sc-done').hidden = false;
      el('sc-link').value = share.url;
      el('sc-open').href = share.url;
      say('Your public link is ready.');
      var link = el('sc-link');
      link.focus(); link.select();
      copy2(el('sc-link-copy'), share.url, 'Copy link').then(function (ok) {
        if (ok && el('sc-link').value === share.url) { say('Your public link is ready, and copied.'); }
      });
    }).catch(function (e) {
      say((e && e.message) || 'Sorry, the card could not be shared.');
      if (e && e.refused) { el('sc-public').hidden = true; }
    }).then(function () {
      ui.sharing = false; go.classList.remove('is-busy'); linkButton();
    });
  }
  function copy2(button, value, words) {
    var said = function (w) { button.textContent = w; setTimeout(function () { button.textContent = words; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () { said('Copied'); return true; },
                                                       function () { said('Press Ctrl+C to copy'); return false; });
    }
    said('Press Ctrl+C to copy');
    return Promise.resolve(false);
  }

  function drawAll() { drawBack(); drawFront(); }
  function drawBack() {
    var f = ui.f;
    stale();
    ui.back = null; buttons();
    back(f, { finish: ui.finish, fonts: fontsOf(), logo: ui.logoLight }).then(function (cv) {
      if (f !== ui.f || !ui.d.open) { return; }
      ui.back = cv;
      var img = el('sc-back');
      img.src = cv.toDataURL('image/png');
      img.alt = 'The stats side of ' + f.name + '’s ' + f.season + ' season card: ' + plural(f.totals.starts, 'start') + ', ' +
        plural(f.totals.wins, 'win') + ', ' + (f.tile.kind === 'pbs' ? plural(f.tile.value, 'new personal best')
          : plural(f.tile.value, 'podium finish', 'podium finishes')) + '. ' + f.highlights.join(' ');
      buttons();
      if (!photoChoice()) { say(''); }
    }).catch(function () { say('Sorry, the card could not be made.'); });
  }
  // quiet: placing the photo; one drawing at a time, and the latest position wins
  function drawPlaceholder() {
    var f = ui.f;
    ui.front = null;
    (ui.crest || (ui.crest = loadImage('/assets/img/logo-dark.svg'))).then(function (crest) {
      if (f !== ui.f || !ui.d.open || photoChoice()) { return; }
      return front(f, { photo: null, placeholder: crest, finish: ui.finish, fonts: fontsOf(), logo: ui.logo }).then(function (cv) {
        if (f !== ui.f || !ui.d.open || photoChoice()) { return; }
        var img = el('sc-front');
        img.src = cv.toDataURL('image/png');
        img.alt = 'A preview of the photo side, with the club crest where a photo will go.';
      });
    }).catch(function () {});
  }
  function drawFront(quiet) {
    if (!photoChoice()) { drawPlaceholder(); return; }
    if (!ui.source) { return; }
    stale();
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
      if (drag || turn || reduced() || e.pointerType !== 'mouse') { return; }
      var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
      stage.style.setProperty('--rx', ((0.5 - y) * 14).toFixed(2) + 'deg');
      stage.style.setProperty('--ry', ((x - 0.5) * 18).toFixed(2) + 'deg');
      stage.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      stage.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      stage.classList.add('is-tilting');
    });
    stage.addEventListener('pointerleave', rest);
    // drag the card to spin it (not the photo while it is being placed)
    var turn = null;
    stage.addEventListener('pointerdown', function (e) {
      if (drag || e.button !== 0 || stage.classList.contains('is-single')) { return; }
      if (card.classList.contains('is-placeable') && e.target === img) { return; }
      if (!card.contains(e.target)) { return; }
      turn = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: spin.x, sy: spin.y, t: e.timeStamp, vx: 0, vy: 0, moved: false,
        touch: e.pointerType !== 'mouse' };
    });
    stage.addEventListener('pointermove', function (e) {
      if (!turn || e.pointerId !== turn.id) { return; }
      var dx = e.clientX - turn.x, dy = turn.touch ? 0 : e.clientY - turn.y;
      if (!turn.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 6) { return; }
        turn.moved = true; stage.classList.add('is-spinning');
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      }
      var dt = Math.max(1, e.timeStamp - turn.t);
      turn.vx = (e.clientX - (turn.lx || turn.x)) / dt; turn.vy = turn.touch ? 0 : (e.clientY - (turn.ly || turn.y)) / dt;
      turn.lx = e.clientX; turn.ly = e.clientY; turn.t = e.timeStamp;
      spin.y = turn.sy + dx * 0.6; spin.x = turn.sx - dy * 0.6;
      spinShow();
      rest();
    });
    var settle = function (e) {
      if (!turn || e.pointerId !== turn.id) { return; }
      var t = turn; turn = null;
      if (!t.moved) { return; }
      stage.classList.remove('is-spinning');
      // a flick carries on; a drag that stopped before letting go doesn't
      var fl = function (v) { return e.timeStamp - t.t > 80 ? 0 : Math.max(-2, Math.min(2, v)) * 180; };
      spin.y = Math.round((spin.y + fl(t.vx)) / 180) * 180;
      spin.x = Math.round((spin.x - fl(t.vy)) / 180) * 180;
      spinShow();
      side(((Math.abs(spin.y / 180) + Math.abs(spin.x / 180)) % 2) === 1);
    };
    stage.addEventListener('pointerup', settle);
    stage.addEventListener('pointercancel', settle);
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
    ui.part = done.track ? 'both' : 'oos'; ui.signature = ''; ui.factTurn = 0;
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
    el('sc-ok').checked = false; ui.sharing = false;
    el('sc-done').hidden = true; el('sc-link').value = '';
    publicShow();
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

  return { W: W, H: H, markParts: markParts, FINISHES: FINISHES, FILTERS: FILTERS, facts: facts, signatureChoices: signatureChoices, ready: ready, canMake: canMake, partOf: partOf, highlights: highlights, funFact: funFact,
           caption: caption, fileName: fileName, metresOf: metresOf, groupOf: groupOf, gain: gain,
           look: look, LOOKS: LOOKS, blur: blur, edges: edges, rng: rng,
           front: front, back: back, filtered: filtered, open: open };
}));
