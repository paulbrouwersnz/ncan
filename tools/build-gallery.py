# -*- coding: utf-8 -*-
"""Rebuild the photo gallery in gallery.html from assets/img/gallery/.

One folder per album. Folders may be nested to any depth - any folder that
directly contains images becomes an album:

    assets/img/gallery/2026-day-one/*.jpg          -> "2026 Day One"
    assets/img/gallery/2026/day-one/*.jpg          -> "2026 Day One"
    assets/img/gallery/2026/colgate-games/*.jpg    -> "2026 Colgate Games"

A folder that holds both images and subfolders becomes an album in its own
right, alongside its children.

Then run:

    python tools/build-gallery.py

Folder names become album titles, joining nested segments ("2026/day-one" ->
"2026 Day One"). To use a different title, put it on the first line of a
`title.txt` inside the folder.

A `README.md` inside an album folder is rendered as an intro block under that
album's heading, above its photos. A useful subset of Markdown is supported:
paragraphs, # headings, - and 1. lists, > quotes, **bold**, *italic*, `code`
and [links](https://example.com). Everything is escaped first, so the file
cannot inject markup of its own.
Albums are ordered newest year first, then by day. Empty folders are skipped.
To order them by hand, list album folders one per line in
assets/img/gallery/order.txt; a line holding just `*` marks where albums that
are not listed go (without one they go last). Start from the current order
with `--write-order`, then rearrange the lines.

The three passes described next are COMMENTED OUT - the migration from the
old Sporty site is complete, so a build no longer renames or deletes anything.
They are kept for reference, along with their flags. Read on only if you need
to turn them back on.

Downloads from the old Sporty gallery arrive as pairs sharing a UUID: a
thumbnail with a size code (IMG_7481-<uuid>_539.jpg, Team photo-<uuid>_250.jpg)
and a full-size file (undefined-<uuid>_wo.jpg, IMG_7481-<uuid>_wo749.jpg). The
name can be anything the camera or export produced - IMG_####, DSC_####, a
descriptive title - or the "undefined" placeholder used when it was lost.
Before scanning, the script pairs them on the UUID, takes the name from
whichever file has one, and renames the full-size file to it (IMG_7481.jpg).

Once a full-size file is in place its `_539` thumbnail is redundant, so it is
deleted - but only when the full-size counterpart is confirmed present in the
same folder.

Anything still carrying a UUID in its name after those two passes, plus any
file still named undefined-*, is download debris and is deleted last. Files
that are the only copy of their photo are flagged in the log as they go.

Image dimensions are read from the files so the grid does not jump while
loading. The markup between the markers is regenerated - do not hand-edit.

    <!-- @generated:gallery -->  ...  <!-- /@generated:gallery -->
"""
import io, os, re, sys
from urllib.parse import quote

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GALLERY_DIR = os.path.join(ROOT, 'assets', 'img', 'gallery')
PAGE = os.path.join(ROOT, 'gallery.html')
OPEN, CLOSE = '<!-- @generated:gallery -->', '<!-- /@generated:gallery -->'

EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.avif')
ORDER_FILE = 'order.txt'
DAYS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5}

UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)
# Every download carries a UUID, with the original name (if the export kept
# one) before it and a size marker after it:
#
#     IMG_7481-<uuid>_539.jpg     Team photo-<uuid>_250.jpg
#     undefined-<uuid>_wo.jpg     PART_1704828035007-<uuid>_1008.jpg
#
# The name may be anything - IMG_####, DSC_####, "NCAN Colgate Team 2024" - or
# the "undefined" placeholder the export writes when the name was lost.
ARTIFACT_RE = re.compile(
    r'^(?P<name>.*?)[-_]?(?P<uuid>' + UUID_RE.pattern + r')(?P<variant>.*?)\.(?P<ext>\w+)$',
    re.I)
THUMB_VARIANT = re.compile(r'^_\d+$')        # _539, _250, _1008 - any size code
FULL_VARIANT = re.compile(r'^_wo', re.I)     # _wo, _wo749, _wo-order


def artifact(filename):
    """Split a downloaded file into (name, uuid, kind, ext), or None.

    kind is 'thumb', 'full' or 'other'. `name` is None when the export did not
    preserve one (empty, or the "undefined" placeholder).
    """
    m = ARTIFACT_RE.match(filename)
    if not m:
        return None
    name = (m.group('name') or '').strip(' -_')
    if not name or name.lower().startswith('undefined'):
        name = None
    variant = m.group('variant') or ''
    if THUMB_VARIANT.match(variant):
        kind = 'thumb'
    elif FULL_VARIANT.match(variant):
        kind = 'full'
    else:
        kind = 'other'
    return name, m.group('uuid').lower(), kind, m.group('ext').lower()


def title_for(relpath):
    custom = os.path.join(GALLERY_DIR, relpath, 'title.txt')
    if os.path.exists(custom):
        first = io.open(custom, encoding='utf-8').readline().strip()
        if first:
            return first
    words = []
    for segment in relpath.replace(os.sep, '/').split('/'):
        words += [w for w in re.split(r'[-_\s]+', segment) if w]
    seen, unique = set(), []
    for w in words:                      # "2026/2026-day-one" should not repeat 2026
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        # a folder named "NCAN Colgate Games" keeps its capitals; only an
        # all-lowercase word ("cross-country") gets a capital added
        unique.append(w[:1].upper() + w[1:] if w.islower() else w)
    return ' '.join(unique)


INLINE_CODE = re.compile(r'`([^`]+)`')
BOLD = re.compile(r'\*\*(\S(?:[^*]*\S)?)\*\*')
ITALIC = re.compile(r'(?<![*\w])[*_](\S(?:[^*_]*\S)?)[*_](?![*\w])')
LINK = re.compile(r'\[([^\]]+)\]\(([^)\s]+)\)')
HEADING = re.compile(r'^(#{1,6})\s+(.*)$')
BULLET = re.compile(r'^[-*+]\s+(.*)$')
NUMBER = re.compile(r'^\d+[.)]\s+(.*)$')
QUOTE = re.compile(r'^>\s?(.*)$')


def inline(text):
    """Escape, then apply the inline Markdown the club is likely to use."""
    out = esc(text)
    out = INLINE_CODE.sub(lambda m: '<code>%s</code>' % m.group(1), out)
    out = BOLD.sub(lambda m: '<strong>%s</strong>' % m.group(1), out)
    out = ITALIC.sub(lambda m: '<em>%s</em>' % m.group(1), out)
    out = LINK.sub(lambda m: '<a href="%s">%s</a>' % (m.group(2), m.group(1)), out)
    return out


def markdown(text):
    """A small Markdown subset - enough for an album note, nothing more."""
    html = []
    para = []
    items = []
    quote = []
    list_tag = 'ul'

    def flush():
        if para:
            html.append('<p>%s</p>' % inline(' '.join(para)))
            del para[:]
        if items:
            html.append('<%s>%s</%s>'
                        % (list_tag,
                           ''.join('<li>%s</li>' % inline(i) for i in items),
                           list_tag))
            del items[:]
        if quote:
            html.append('<blockquote><p>%s</p></blockquote>' % inline(' '.join(quote)))
            del quote[:]

    for raw in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        line = raw.strip()
        if not line:
            flush()
            continue

        head = HEADING.match(line)
        if head:
            flush()
            # the album title is an h2, so a README's "#" starts at h3
            level = min(len(head.group(1)) + 2, 6)
            html.append('<h%d>%s</h%d>' % (level, inline(head.group(2)), level))
            continue

        bullet = BULLET.match(line)
        number = NUMBER.match(line)
        if bullet or number:
            tag = 'ul' if bullet else 'ol'
            if items and tag != list_tag:
                flush()
            list_tag = tag
            items.append((bullet or number).group(1))
            continue

        block = QUOTE.match(line)
        if block:
            if para or items:
                flush()
            quote.append(block.group(1))
            continue

        if items or quote:
            flush()
        para.append(line)

    flush()
    return html


def intro_for(relpath):
    """The album folder's README.md, rendered, or an empty list."""
    readme = os.path.join(GALLERY_DIR, relpath, 'README.md')
    if not os.path.exists(readme):
        return []
    return markdown(io.open(readme, encoding='utf-8').read())


def album_key(relpath):
    """Folder path in the one shape order.txt is matched on."""
    return relpath.replace('\\', '/').strip().strip('/').lower()


def read_order():
    """Parse order.txt into (ranks, fallback_rank, entries).

    Listed albums sort by their position in the file. Everything else sorts at
    `fallback_rank` - the position of the lone `*` line, or last when there is
    no `*` - and keeps the automatic order among themselves.
    """
    path = os.path.join(GALLERY_DIR, ORDER_FILE)
    ranks, entries, fallback = {}, [], None
    if not os.path.exists(path):
        return ranks, 0, entries

    rank = 0
    for lineno, raw in enumerate(io.open(path, encoding='utf-8'), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line == '*':
            if fallback is None:
                fallback = rank
                rank += 1
            else:
                print('   ? %s line %d: ignoring a second *' % (ORDER_FILE, lineno))
            continue
        key = album_key(line)
        if key in ranks:
            print('   ? %s line %d: "%s" is listed twice, keeping the first'
                  % (ORDER_FILE, lineno, line))
            continue
        ranks[key] = rank
        entries.append((lineno, line, key))
        rank += 1

    if fallback is None:
        fallback = rank                  # no * - unlisted albums go last
    return ranks, fallback, entries


def sort_key(relpath, ranks=None, fallback=0):
    flat = relpath.replace(os.sep, '/').lower()
    year = re.search(r'(19|20)\d{2}', flat)
    year = int(year.group(0)) if year else 0
    day = 0
    m = re.search(r'day[-_ /]?(\w+)', flat)
    if m:
        token = m.group(1)
        day = int(token) if token.isdigit() else DAYS.get(token, 0)
    rank = ranks.get(album_key(relpath), fallback) if ranks else 0
    return (rank, -year, flat.count('/'), day, flat)


# IMG_1234, DSC0001, PXL_20240101_093000, PART_1704828035007, IMG_0960a
CAMERA_NAME = re.compile(r'^(img|dsc|dscn|dji|gopr|mvi|part|pxl|p)[\s\d]*[a-z]?$', re.I)


def caption_for(filename):
    stem = os.path.splitext(filename)[0]
    # a file still carrying its download uuid has no caption worth showing
    if UUID_RE.search(stem) or stem.lower().startswith('undefined'):
        return ''
    pretty = re.sub(r'[-_]+', ' ', stem).strip()
    # camera filenames make poor captions - the viewer shows the counter instead
    if CAMERA_NAME.match(pretty) or re.match(r'^[\d\s]+$', pretty):
        return ''
    return pretty[:1].upper() + pretty[1:]


def slug(relpath):
    return re.sub(r'[^a-z0-9]+', '-', relpath.lower()).strip('-')


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def dimensions(path):
    if Image is None:
        return None
    try:
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


class Files(object):
    """Folder contents, tracked across passes.

    In a dry run nothing touches the disk, but the recorded state still moves,
    so each pass sees what the previous one would have left behind and the
    report matches a real run.
    """

    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        self._cache = {}

    def listdir(self, dirpath):
        if dirpath not in self._cache:
            self._cache[dirpath] = set(os.listdir(dirpath))
        return self._cache[dirpath]

    def exists(self, dirpath, name):
        return name in self.listdir(dirpath)

    def rename(self, dirpath, src, dst):
        if not self.dry_run:
            os.rename(os.path.join(dirpath, src), os.path.join(dirpath, dst))
        names = self.listdir(dirpath)
        names.discard(src)
        names.add(dst)

    def remove(self, dirpath, name):
        if not self.dry_run:
            os.remove(os.path.join(dirpath, name))
        self.listdir(dirpath).discard(name)


def rename_full_size(files):
    """Give the 'undefined' full-size downloads their real names.

    Each folder is matched independently: thumbnails supply uuid -> name, and
    any full-size file carrying the same uuid is renamed. Nothing is
    overwritten, and unmatched files are reported rather than touched.
    """
    renamed = skipped = unmatched = 0
    for dirpath, dirnames, _ in os.walk(GALLERY_DIR):
        dirnames.sort()
        # a name found on any file of a uuid applies to every file of that uuid
        names = {}
        for f in files.listdir(dirpath):
            a = artifact(f)
            if a and a[0]:
                names.setdefault(a[1], a[0])

        for f in sorted(files.listdir(dirpath)):
            a = artifact(f)
            if not a or a[2] != 'full':
                continue
            name, uuid, _kind, ext = a
            name = name or names.get(uuid)
            if not name:
                unmatched += 1
                print('   ? no name found for %s' % os.path.join(
                    os.path.relpath(dirpath, GALLERY_DIR), f))
                continue

            target = '%s.%s' % (name, ext)
            if files.exists(dirpath, target):
                skipped += 1
                print('   ! %s already exists, left %s alone' % (target, f))
                continue
            if files.dry_run:
                print('   would rename %s -> %s' % (f, target))
            files.rename(dirpath, f, target)
            renamed += 1

    if renamed or skipped or unmatched:
        print('renamed %d full-size file(s)%s%s%s'
              % (renamed,
                 ' (dry run)' if files.dry_run else '',
                 ', %d skipped' % skipped if skipped else '',
                 ', %d unmatched' % unmatched if unmatched else ''))
    return renamed


def remove_thumbnails(files):
    """Delete `_539` thumbnails whose full-size file is present.

    A thumbnail is only removed once its counterpart exists in the same folder,
    so a photo can never be left without a copy.
    """
    removed = kept = 0
    for dirpath, dirnames, _ in os.walk(GALLERY_DIR):
        dirnames.sort()
        for f in sorted(files.listdir(dirpath)):
            a = artifact(f)
            if not a or a[2] != 'thumb' or not a[0]:
                continue
            full = '%s.%s' % (a[0], a[3])
            if not files.exists(dirpath, full):
                kept += 1
                print('   ! keeping %s - no full-size %s beside it' % (f, full))
                continue
            if files.dry_run:
                print('   would delete %s (full-size %s present)' % (f, full))
            files.remove(dirpath, f)
            removed += 1

    if removed or kept:
        print('removed %d thumbnail(s)%s%s'
              % (removed,
                 ' (dry run)' if files.dry_run else '',
                 ', %d kept (no full-size file)' % kept if kept else ''))
    return removed


def remove_leftovers(files):
    """Delete download debris left after renaming and thumbnail cleanup.

    Two kinds: anything still carrying a UUID, and anything still named
    undefined-* (which the rename pass could not match to a thumbnail).
    Files that are the only copy of their photo are flagged in the log.
    """
    removed = 0
    for dirpath, dirnames, _ in os.walk(GALLERY_DIR):
        dirnames.sort()
        for f in sorted(files.listdir(dirpath)):
            if not (UUID_RE.search(f) or f.lower().startswith('undefined')):
                continue
            path = os.path.join(dirpath, f)
            size_kb = os.path.getsize(path) / 1024.0 if os.path.exists(path) else 0
            where = os.path.join(os.path.relpath(dirpath, GALLERY_DIR), f)
            # does any non-UUID file in this folder represent the same photo?
            a = artifact(f)
            base = a[0] if a else None
            has_other_copy = bool(base) and any(
                other == '%s.%s' % (base, ext)
                for ext in ('jpg', 'jpeg', 'png', 'webp', 'avif')
                for other in [o for o in files.listdir(dirpath) if not UUID_RE.search(o)])
            flag = '' if has_other_copy else ' !! only copy of this photo'
            print('   %s %s (%.0f KB)%s'
                  % ('would delete' if files.dry_run else 'deleted', where, size_kb, flag))
            files.remove(dirpath, f)
            removed += 1

    if removed:
        print('removed %d leftover file(s) (UUID names or undefined-*)%s'
              % (removed, ' (dry run)' if files.dry_run else ''))
    return removed


VIEWER = """      <dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
        <button type="button" class="lightbox__btn lightbox__close" data-viewer="close" aria-label="Close photo (Esc)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <button type="button" class="lightbox__btn lightbox__prev" data-viewer="prev" aria-label="Previous photo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <figure class="lightbox__figure">
          <img class="lightbox__img" id="lightbox-img" alt="" decoding="async">
          <figcaption class="lightbox__caption">
            <span class="lightbox__text"></span>
            <span class="lightbox__count" id="lightbox-count"></span>
          </figcaption>
        </figure>
        <button type="button" class="lightbox__btn lightbox__next" data-viewer="next" aria-label="Next photo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </dialog>

      <script>
      (function () {
        'use strict';

        // A link to #album-<slug> lands on an album that is collapsed; open it
        // so the browser has something to scroll to.
        function openTarget() {
          var id = decodeURIComponent(window.location.hash.slice(1));
          var album = id && document.getElementById(id);
          if (album && album.tagName === 'DETAILS' && !album.open) {
            album.open = true;
            album.scrollIntoView();
          }
        }
        window.addEventListener('hashchange', openTarget);
        openTarget();

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
      </script>"""


def build(order=False):
    if not os.path.isdir(GALLERY_DIR):
        print('no gallery directory at %s' % GALLERY_DIR)
        return 1

    # The Sporty migration is finished, so the three passes that renamed and
    # deleted UUID-named downloads are switched off, along with the flags that
    # used to control them: a build now only reads the folders and rewrites
    # gallery.html. Their functions are kept for reference - to bring them back,
    # swap the two Files(...) lines and uncomment the three calls.
    files = Files(dry_run=True)          # nothing is written to the folders now
    # files = Files(dry_run=False)
    # rename_full_size(files)
    # remove_thumbnails(files)
    # remove_leftovers(files)

    # any folder holding images is an album, at any depth
    found = []
    for dirpath, dirnames, _ in os.walk(GALLERY_DIR):
        dirnames.sort()
        rel = os.path.relpath(dirpath, GALLERY_DIR)
        if rel == '.':
            continue
        photos = sorted(f for f in files.listdir(dirpath) if f.lower().endswith(EXTS))
        found.append((rel.replace(os.sep, '/'), photos))

    ranks, fallback, entries = read_order()
    albums, empty = [], []
    for relpath, photos in sorted(found,
                                  key=lambda x: sort_key(x[0], ranks, fallback)):
        if not photos:
            # only report leaves - a parent whose children hold the photos is fine
            if not any(other.startswith(relpath + '/') and p
                       for other, p in found):
                empty.append(relpath)
            continue
        albums.append((relpath, title_for(relpath), photos))

    if not albums:
        markup = ('      <p class="note">No photos yet. Drop images into '
                  '<code>assets/img/gallery/&lt;album&gt;/</code> and run '
                  '<code>python tools/build-gallery.py</code>.</p>')
        write(markup)
        print('no photos found - wrote the empty state')
        print('empty albums: %s' % ', '.join(empty))
        return 0

    if order:
        return write_order(albums)

    blocks = []
    intros = 0
    for folder, title, photos in albums:
        intro = intro_for(folder)
        if intro:
            intros += 1
            intro = ('        <div class="album__intro">\n'
                     + '\n'.join('          ' + line for line in intro)
                     + '\n        </div>\n')
        else:
            intro = ''

        items = []
        for f in photos:
            src = 'assets/img/gallery/%s/%s' % (folder, quote(f))
            cap = caption_for(f)
            dims = dimensions(os.path.join(GALLERY_DIR, folder, f))
            size = ' width="%d" height="%d"' % dims if dims else ''
            alt = esc(cap) if cap else '%s photo' % esc(title)
            data_cap = ' data-caption="%s"' % esc(cap) if cap else ''
            items.append(
                '          <li class="album__item">\n'
                '            <a href="%s"%s target="_blank" rel="noopener">\n'
                '              <img src="%s" alt="%s"%s loading="lazy" decoding="async">\n'
                '            </a>\n'
                '          </li>' % (src, data_cap, src, alt, size))

        # Every album starts collapsed. A closed <details> is not rendered, so
        # the browser lays out none of its grid and - because every photo is
        # loading="lazy" - requests none of its images until it is opened.
        blocks.append(
            '      <details class="album" id="album-%s">\n'
            '        <summary class="album__head">\n'
            '          <h2 id="album-%s-heading">%s</h2>\n'
            '          <span class="album__count">%d photo%s</span>\n'
            '        </summary>\n'
            '%s'
            '        <ul class="album__grid" aria-labelledby="album-%s-heading">\n'
            '%s\n'
            '        </ul>\n'
            '      </details>'
            % (slug(folder), slug(folder), esc(title), len(photos),
               '' if len(photos) == 1 else 's', intro, slug(folder),
               '\n'.join(items)))

    write('\n\n'.join(blocks) + '\n\n' + VIEWER)

    total = sum(len(p) for _, _, p in albums)
    print('gallery rebuilt: %d album(s), %d photo(s)' % (len(albums), total))
    for folder, title, photos in albums:
        print('   %-26s %-24s %d photo(s)' % (folder, title, len(photos)))
    listed = set(album_key(folder) for folder, _, _ in albums)
    for lineno, line, key in entries:
        if key not in listed:
            print('   ? %s line %d: no album at "%s"' % (ORDER_FILE, lineno, line))
    if entries:
        print('   %d of %d album(s) placed by %s'
              % (len(listed & set(ranks)), len(albums), ORDER_FILE))
    if intros:
        print('   %d album(s) have a README.md intro' % intros)
    if empty:
        print('empty (skipped): %s' % ', '.join(empty))
    return 0


ORDER_HEADER = """# Album order for gallery.html - one album folder per line, top to bottom.
# Lines starting with # are ignored.
#
# The single * marks where albums that are NOT listed here go, keeping the
# automatic order (newest year first) among themselves. It sits at the top so
# a newly added folder shows up first; move it lower, or delete it, to send
# new albums further down. With no * at all they go last.
#
# Rewrite this file from the current order with:
#     python tools/build-gallery.py --write-order
"""


def write_order(albums):
    """Write the current album order to order.txt as a starting point."""
    path = os.path.join(GALLERY_DIR, ORDER_FILE)
    if os.path.exists(path):
        backup = path + '.bak'
        io.open(backup, 'w', encoding='utf-8', newline='').write(
            io.open(path, encoding='utf-8').read())
        print('kept the previous %s as %s.bak' % (ORDER_FILE, ORDER_FILE))

    body = [ORDER_HEADER, '*', '']
    body += [folder for folder, _, _ in albums]
    io.open(path, 'w', encoding='utf-8', newline='').write('\n'.join(body) + '\n')
    print('wrote %s with %d album(s) - rearrange the lines to taste'
          % (os.path.relpath(path, ROOT), len(albums)))
    return 0


def write(markup):
    html = io.open(PAGE, encoding='utf-8').read()
    if OPEN not in html or CLOSE not in html:
        raise SystemExit('markers not found in gallery.html:\n  %s\n  %s' % (OPEN, CLOSE))
    start, end = html.index(OPEN) + len(OPEN), html.index(CLOSE)
    io.open(PAGE, 'w', encoding='utf-8', newline='').write(
        html[:start] + '\n' + markup + '\n    ' + html[end:])


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Rebuild the gallery from assets/img/gallery/.')
    ap.add_argument('--write-order', action='store_true',
                    help='write the current album order to assets/img/gallery/'
                         'order.txt and stop, changing nothing else')
    args = ap.parse_args()
    sys.exit(build(order=args.write_order))
