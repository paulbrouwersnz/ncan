/* Header photo picker, written into pages by tools/make-head-photo.py.

   On a page whose heading band picks from several photos (marked
   data-page-photos), make-head-photo.py writes this function into a small
   script straight after the band's opening tag, called with the script itself
   and the page's choices:

     <section class="page-head ..." data-page-photos><script data-head-pick>
       (function (s, d) {...})(document.currentScript, {"p": [...], "e": {...}})
     </script>

   It runs as the page is read, before the page is first drawn, so the photo
   chosen for this visit is the first one shown: no jump. assets/js/page-photos.js
   then keeps it unless the live settings no longer allow it, and fades in any
   later change (another #/... address, a page's own photo).

   d.p: the photos, each [src] or [src, webp] or [src, webp, focus].
   d.e: the entries for this page and its #/... addresses, by key as in
        page-photos.json, each {"g": [[photo index, ...], ...], "f": focus};
        "g" is [] for "photo": "none".

   Which entry, as findEntry() in page-photos.js: the exact #/... address
   ("#plan-2026-11-24" counts as "#/plan/2026-11-24"), else the longest
   pattern ending in *, else the page. Then a random group, and a random
   photo in it that isn't the one shown last time (the same remembered photo
   page-photos.js uses, "ncan-page-photo:" + key).

   make-head-photo.py squeezes this onto one line: each line is trimmed and
   joined, and lines starting with // are dropped, so end every statement with
   a semicolon and keep comments on lines of their own. Tested in
   tests/js/head-photo-pick.test.js.
*/
function (s, d) {
  var h = s.parentNode, p, a, e, n, g, c, last, f, k = 'ncan-page-photo:';
  var u = function (x) { return "url('" + String(x).replace(/'/g, '%27') + "')"; };
  p = location.pathname.replace(/index\.html$/, '');
  if (p.slice(-1) !== '/') { p += '/'; }
  a = location.hash.replace(/^#plan-(\d{4}-\d{2}-\d{2})$/, '#/plan/$1');
  if (a.indexOf('#/') === 0) {
    a = p + a;
    if (d.e[a]) { e = a; } else {
      for (n in d.e) {
        if (n.slice(-1) === '*' && a.indexOf(n.slice(0, -1)) === 0 && (!e || n.length > e.length)) { e = n; }
      }
    }
  }
  if (!e && d.e[p]) { e = p; }
  // no entry for this address: page-photos.js sorts it out
  if (!e) { return; }
  g = d.e[e].g;
  if (!g.length) {
    h.classList.remove('page-head--photo');
    h.style.removeProperty('--photo');
    h.style.removeProperty('--photo-webp');
    h.style.removeProperty('--photo-focus');
    return;
  }
  g = g[Math.floor(Math.random() * g.length)];
  try { last = localStorage.getItem(k + e); } catch (x) { last = null; }
  c = g.length > 1 ? g.filter(function (i) { return d.p[i][0] !== last; }) : g;
  c = d.p[c[Math.floor(Math.random() * c.length)]];
  h.classList.add('page-head--photo');
  h.style.setProperty('--photo', u(c[0]));
  h.style.setProperty('--photo-webp', u(c[1] || c[0]));
  f = d.e[e].f || c[2];
  if (f) { h.style.setProperty('--photo-focus', f); } else { h.style.removeProperty('--photo-focus'); }
  try { localStorage.setItem(k + e, c[0]); } catch (x) { last = null; }
}
