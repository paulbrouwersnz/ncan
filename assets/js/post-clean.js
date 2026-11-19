/* Cleans the Facebook posts (assets/facebook/posts.html) before the home page shows them.

   An allowlist: only the elements and attributes below are kept, and everything else
   is taken out. The posts are built by actions/update-facebook-posts/build-html.py,
   which already escapes the text, so normally nothing is taken out; this is the
   second line of defence if that file ever holds something it shouldn't.

   To allow something new (say build-html.py starts writing <p>):
     1. add it to TAGS (and any attributes it needs to ATTRS) below;
     2. run `python tools/check-facebook-posts.py`, which reads these same lists;
     3. open the home page and check the browser console (see tools/README.md).

   Elements not in TAGS are unwrapped (their text is kept) unless they're in DROP,
   which removes them with everything inside. */
(function (root) {
  'use strict';

  var TAGS = ['article', 'div', 'span', 'a', 'img', 'br'];
  var ATTRS = {
    '*': ['class'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'loading']
  };
  var DROP = ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'template', 'noscript',
              'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'];
  // links go to web pages; pictures are the copies the updater saved on this site
  var URLS = {
    href: /^https?:\/\//i,
    src: /^\/assets\/facebook\/images\/[\w.-]+$/
  };

  function allowedAttr(tag, name, value) {
    if ((ATTRS['*'].indexOf(name) < 0) && ((ATTRS[tag] || []).indexOf(name) < 0)) { return false; }
    if (URLS[name]) { return URLS[name].test(value.trim()); }
    if (name === 'target') { return value === '_blank'; }
    return true;
  }

  // Cleans `container` (a detached element) in place. Returns what was taken out,
  // e.g. ['<iframe>', 'div onclick', 'a href="javascript:..."'], empty when nothing was.
  function clean(container) {
    var removed = [];
    function walk(parent) {
      var child = parent.firstElementChild;
      while (child) {
        var next = child.nextElementSibling;
        var tag = child.tagName.toLowerCase();
        if (DROP.indexOf(tag) >= 0) {
          removed.push('<' + tag + '>');
          parent.removeChild(child);
        } else if (TAGS.indexOf(tag) < 0) {
          removed.push('<' + tag + '> (text kept)');
          walk(child);
          while (child.firstChild) { parent.insertBefore(child.firstChild, child); }
          parent.removeChild(child);
        } else {
          [].slice.call(child.attributes).forEach(function (attr) {
            var name = attr.name.toLowerCase();
            if (!allowedAttr(tag, name, attr.value)) {
              removed.push(tag + ' ' + name + (URLS[name] ? '="' + attr.value.slice(0, 40) + '"' : ''));
              child.removeAttribute(attr.name);
            }
          });
          if (tag === 'a' && child.getAttribute('target') === '_blank') {
            child.setAttribute('rel', 'noopener');
          }
          walk(child);
        }
        child = next;
      }
    }
    walk(container);
    return removed;
  }

  var api = { clean: clean, TAGS: TAGS, ATTRS: ATTRS, DROP: DROP, URLS: URLS };
  root.ncanPostClean = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : this);
