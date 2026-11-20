# -*- coding: utf-8 -*-
"""Rebuild the photo gallery from the photos at photos.ncan.nz.

The photos are not in this repository. They live on the photo host,
https://photos.ncan.nz/, and in a local copy of it (by default the folder
ncan-gallery next to this repository; set NCAN_PHOTOS_DIR or --photos-dir to
use another):

    gallery/<album>/<photo>.jpg      the full-size originals (and a .zip per album)
    gallery/<album>/<photo>.webp     the same photo as WebP
    thumbs/<album>/<photo>.jpg       the thumbnails shown in the gallery
    thumbs/<album>/<photo>.webp      the same thumbnail as WebP

tools/gallery-photos.py makes the thumbnails and the WebP copies. This script
reads the local thumbs/ folder (which albums, which photos, their sizes) and
writes the pages, linking to the photo host. Each thumbnail is a <picture>
offering the WebP with the JPEG as the fallback, and the photo viewer opens
the WebP original when the browser took the WebP thumbnail.

The album order, the zip index and any album titles or intros are kept in this
repository, in tools/gallery/ (see below).

The gallery is a front page, gallery/index.html, with one card per album
(cover photo, title, photo count), and a page per album at
gallery/<slug>/index.html with that album's photos, intro, zip download and
photo viewer. Every photo's alt text says which album it is from and which
photo it is ("2024 Colgate Games, photo 5 of 1036"), so a screen reader does
not read the same sentence a thousand times.

Old links to an album on the single-page gallery (/gallery/#album-<slug>)
still work: the front page sends them on to the album's page.

One folder per album. Folders may be nested to any depth - any folder that
directly contains images becomes an album:

    thumbs/2026-day-one/*.jpg          -> "2026 Day One"
    thumbs/2026/day-one/*.jpg          -> "2026 Day One"
    thumbs/2026/colgate-games/*.jpg    -> "2026 Colgate Games"

A folder that holds both images and subfolders becomes an album in its own
right, alongside its children.

Then run:

    python tools/build-gallery.py

Folder names become album titles, joining nested segments ("2026/day-one" ->
"2026 Day One"). To use a different title, put it on the first line of
tools/gallery/<album>/title.txt (the album's folder path under tools/gallery/).

A tools/gallery/<album>/README.md is rendered as an intro block under that
album's heading, above its photos. A useful subset of Markdown is supported:
paragraphs, # headings, - and 1. lists, > quotes, **bold**, *italic*, `code`
and [links](https://example.com). Everything is escaped first, so the file
cannot inject markup of its own.
Albums are ordered newest year first, then by day. Empty folders are skipped.
To order them by hand, list album folders one per line in
tools/gallery/order.txt; a line holding just `*` marks where albums that
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
loading. On the front page, the markup between the markers is regenerated -
do not hand-edit it. The rest of the front page (its heading, intro and
note) is hand-edited, and is also the template for the album pages: their
head, header, footer and closing script are copied from it, so they carry
the same partials (tools/sync-partials.py keeps them all in step).

    <!-- @generated:gallery -->  ...  <!-- /@generated:gallery -->

The album pages are written whole, every build, and carry the marker
<!-- @generated:album -->. An album page whose album has gone (renamed or
removed) is deleted - only pages carrying that marker, never anything else.
"""
import io, json, os, re, sys
from urllib.parse import quote
from urllib.request import Request, urlopen

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The photo host, and the local copy of it the pages are built from.
# (NCAN_PHOTOS_URL overrides it, only to preview against a local server)
PHOTOS_URL = os.environ.get('NCAN_PHOTOS_URL') or 'https://photos.ncan.nz/'
PHOTOS_DIR = os.environ.get('NCAN_PHOTOS_DIR') or os.path.join(os.path.dirname(ROOT), 'ncan-gallery')
# The thumbnails decide the albums and photos; the originals of the same names
# are in gallery/. A thumbnail links to its original - both for the lightbox,
# which reads the link's href (or data-webp), and for the plain new-tab
# fallback without <dialog>.
GALLERY_DIR = os.path.join(PHOTOS_DIR, 'thumbs')
ORIGINALS_DIR = os.path.join(PHOTOS_DIR, 'gallery')
FULL_BASE = PHOTOS_URL + 'gallery/'
THUMB_BASE = PHOTOS_URL + 'thumbs/'
# order.txt, zips.json and any album's title.txt or README.md
META_DIR = os.path.join(ROOT, 'tools', 'gallery')
# Each album is also published as a single zip, at the album's own path with
# .zip on the end. Which albums actually have one - and how big it is - is
# recorded by --check-zips, because not every album has been zipped and a
# link to a missing file is worse than no link.
ZIP_INDEX = os.path.join(META_DIR, 'zips.json')
PAGE = os.path.join(ROOT, 'gallery', 'index.html')
PAGE_DIR = os.path.dirname(PAGE)
OPEN, CLOSE = '<!-- @generated:gallery -->', '<!-- /@generated:gallery -->'
ALBUM_MARK = '<!-- @generated:album -->'
SITE = 'https://ncan.nz'
CLUB = 'North Canterbury Athletic Club'
# how many cover photos on the front page load straight away; the rest wait
# until they are scrolled near (loading="lazy")
EAGER_COVERS = 4

# the photos themselves; a .webp beside one is its WebP copy, not another photo
EXTS = ('.jpg', '.jpeg', '.png')
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
    custom = os.path.join(META_DIR, relpath, 'title.txt')
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
    readme = os.path.join(META_DIR, relpath, 'README.md')
    if not os.path.exists(readme):
        return []
    return markdown(io.open(readme, encoding='utf-8').read())


def album_key(relpath):
    """Folder path in the one shape order.txt is matched on."""
    return relpath.replace('\\', '/').strip().strip('/').lower()


def zip_url(folder):
    return FULL_BASE + quote(folder) + '.zip'


def human_size(n):
    """Bytes as something a reader can judge a download by."""
    if n >= 1024 ** 3:
        return '%.1f GB' % (n / float(1024 ** 3))
    if n >= 1024 ** 2:
        return '%d MB' % round(n / float(1024 ** 2))
    return '%d KB' % max(1, round(n / 1024.0))


def check_zips(albums):
    """Ask the photo host which albums have a zip, and record the sizes."""
    found = {}
    print('checking %d album zip(s) on %s' % (len(albums), FULL_BASE))
    for folder in albums:
        url = zip_url(folder)
        try:
            resp = urlopen(Request(url, method='HEAD'), timeout=40)
            size = int(resp.headers.get('Content-Length') or 0)
            found[folder] = {'bytes': size}
            print('   %-42s %s' % (folder[:42], human_size(size)))
        except Exception as exc:
            print('   %-42s no zip (%s)' % (folder[:42], getattr(exc, 'code', exc)))

    with io.open(ZIP_INDEX, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(found, indent=2, sort_keys=True,
                            ensure_ascii=False) + '\n')
    missing = len(albums) - len(found)
    print('%d zip(s) found, %d album(s) without one -> %s'
          % (len(found), missing, os.path.relpath(ZIP_INDEX, ROOT)))
    return found


def read_zips():
    """The recorded zip index, or None when --check-zips has never run."""
    if not os.path.exists(ZIP_INDEX):
        return None
    try:
        with io.open(ZIP_INDEX, encoding='utf-8') as fh:
            return json.load(fh)
    except ValueError:
        print('   ! %s is not valid JSON - ignoring it'
              % os.path.relpath(ZIP_INDEX, ROOT))
        return None


def download_link(folder, zips):
    """The album's zip link, or '' when the album has no zip."""
    local = os.path.join(ORIGINALS_DIR, *(folder + '.zip').split('/'))
    if os.path.isdir(ORIGINALS_DIR) and not os.path.exists(local):
        print('   ! no %s.zip in the local copy: no download link' % folder)
        return ''                       # not uploaded, so the link would fail
    if zips is None:
        size = ''                       # never probed: link, but no size
    elif folder in zips:
        size = ' <span class="album__dl-size">%s</span>' % human_size(
            zips[folder].get('bytes') or 0)
    else:
        return ''                       # probed, and this album has no zip

    return ('        <p class="album__dl">\n'
            '          <a class="btn btn--ghost album__dl-link" href="%s" download>\n'
            '            Download all photos%s\n'
            '          </a>\n'
            '        </p>\n' % (zip_url(folder), size))


def read_order():
    """Parse order.txt into (ranks, fallback_rank, entries).

    Listed albums sort by their position in the file. Everything else sorts at
    `fallback_rank` - the position of the lone `*` line, or last when there is
    no `*` - and keeps the automatic order among themselves.
    """
    path = os.path.join(META_DIR, ORDER_FILE)
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

      <script src="/assets/js/gallery-viewer.js"></script>"""


# the front page's script (assets/js/gallery.js): sends old links to an album
# on the single-page gallery (/gallery/#album-<slug>) on to the album's page.
# Both links are written plain; publishing adds the ?v= stamps
# (tools/stamp-assets.py), as for every page.
REDIRECT = """      <script src="/assets/js/gallery.js"></script>"""


def plural(n, word='photo'):
    return '%d %s%s' % (n, word, '' if n == 1 else 's')


def year_of(folder):
    m = re.search(r'(19|20)\d{2}', folder)
    return m.group(0) if m else ''


def thumb_src(folder, f):
    return THUMB_BASE + '%s/%s' % (quote(folder), quote(f))


def webp_name(f):
    return os.path.splitext(f)[0] + '.webp'


def webp_url(base, local_dir, folder, f):
    """The photo's WebP copy on the host, or None when there isn't one locally
    (tools/gallery-photos.py hasn't made it yet): the page then offers only
    the JPEG, rather than a WebP that would not load."""
    w = webp_name(f)
    if os.path.exists(os.path.join(local_dir, folder, w)):
        return base + '%s/%s' % (quote(folder), quote(w))
    return None


def picture(folder, f, img_attrs):
    """A thumbnail: the WebP where the browser takes it, the JPEG otherwise."""
    img = '<img src="%s"%s>' % (thumb_src(folder, f), img_attrs)
    webp = webp_url(THUMB_BASE, GALLERY_DIR, folder, f)
    if not webp:
        return img
    return ('<picture><source srcset="%s" type="image/webp">%s</picture>'
            % (webp, img))


def size_attrs(folder, f):
    dims = dimensions(os.path.join(GALLERY_DIR, folder, f))
    return ' width="%d" height="%d"' % dims if dims else ''


def front_page(albums):
    """The front page's cards, one per album, under a heading per year.

    Albums keep the order of order.txt (or the automatic order). A new year
    heading starts whenever the year changes, so a hand-made order that mixes
    years still reads top to bottom as written. Each card carries the id the
    album had on the old single-page gallery (album-<slug>), which REDIRECT
    uses to send old links on.
    """
    out, group, n = [], None, 0
    for folder, title, photos in albums:
        year = year_of(folder) or 'More photos'
        if year != group:
            if group is not None:
                out.append('      </div>\n')
            group = year
            out.append('      <h2 class="gallery-year" id="year-%s">%s</h2>\n'
                       '      <div class="cards gallery-cards">'
                       % (slug(year), esc(year)))
        s = slug(folder)
        cover = photos[0]                # the album's first photo, in its order
        out.append(
            '        <article class="card album-card" id="album-%s">\n'
            '          <div class="card__media">\n'
            '            %s\n'
            '          </div>\n'
            '          <div class="card__body">\n'
            '            <h3><a class="card__link" href="/gallery/%s/">%s</a></h3>\n'
            '            <p class="card__meta">%s</p>\n'
            '          </div>\n'
            '        </article>'
            % (s, picture(folder, cover, ' alt=""%s%s decoding="async"'
                          % (size_attrs(folder, cover),
                             '' if n < EAGER_COVERS else ' loading="lazy"')),
               s, esc(title), plural(len(photos))))
        n += 1
    if group is not None:
        out.append('      </div>\n')
    return '\n'.join(out) + '\n' + REDIRECT


def read_template():
    """The front page, split into the parts an album page shares with it:
    (the top of the head, from </head> to <main>, from </main> to the end).

    The nav's aria-current="page" marks the front page; an album page is a
    different page, so it is taken out, as tools/sync-partials.py would.
    """
    html = io.open(PAGE, encoding='utf-8').read()
    head_end = '<!-- /@partial:head -->'
    for marker in (head_end, '</head>', '<main id="main">', '</main>'):
        if marker not in html:
            raise SystemExit('%s not found in gallery/index.html' % marker)
    top = html[:html.index(head_end) + len(head_end)]
    middle = html[html.index('</head>'):html.index('<main id="main">')]
    bottom = html[html.index('</main>') + len('</main>'):]

    def unmark(text):
        return re.sub(r'\s+aria-current="page"', '', text)
    return top, unmark(middle), unmark(bottom)


def write_album(template, folder, title, photos, intro, download):
    """Write gallery/<slug>/index.html for one album."""
    s = slug(folder)
    total = len(photos)
    items = []
    for n, f in enumerate(photos, 1):
        full = FULL_BASE + '%s/%s' % (quote(folder), quote(f))
        cap = caption_for(f)
        # which album and which photo, so no two photos read the same
        alt = '%s, photo %d of %d' % (title, n, total)
        if cap:
            alt += ': ' + cap
        data_cap = ' data-caption="%s"' % esc(cap) if cap else ''
        full_webp = webp_url(FULL_BASE, ORIGINALS_DIR, folder, f)
        data_webp = ' data-webp="%s"' % full_webp if full_webp else ''
        items.append(
            '          <li class="album__item">\n'
            '            <a href="%s"%s%s target="_blank" rel="noopener">\n'
            '              %s\n'
            '            </a>\n'
            '          </li>' % (full, data_webp, data_cap,
                                 picture(folder, f, ' alt="%s"%s loading="lazy" decoding="async"'
                                         % (esc(alt), size_attrs(folder, f)))))

    intro_html = ''
    if intro:
        intro_html = ('        <div class="album__intro">\n'
                      + '\n'.join('          ' + line for line in intro)
                      + '\n        </div>\n')

    page_title = '%s photos — %s' % (title, CLUB)
    description = '%s from %s, in the %s photo gallery.' % (plural(total), title, CLUB)
    head = ('\n\n<link rel="canonical" href="%s/gallery/%s/">\n\n'
            '<title>%s</title>\n'
            '<meta name="description" content="%s">\n'
            '<meta property="og:title" content="%s">\n'
            '<meta property="og:description" content="%s">\n'
            % (SITE, s, esc(page_title), esc(description), esc(page_title),
               esc(description)))

    main = ('<main id="main">\n'
            '  <span id="top"></span>\n'
            '  %s\n'
            '  <!-- Generated by tools/build-gallery.py from the photos in thumbs/%s/ - do not hand-edit -->\n\n'
            '  <!-- ================= Page head ================= -->\n'
            '  <section class="page-head" aria-labelledby="page-heading">\n'
            '    <div class="wrap">\n'
            '      <nav class="breadcrumb" aria-label="Breadcrumb">\n'
            '        <a href="/">Home</a> <span aria-hidden="true">/</span> '
            '<a href="/gallery/">Photo gallery</a> <span aria-hidden="true">/</span> <span>%s</span>\n'
            '      </nav>\n'
            '      <p class="eyebrow eyebrow--light">Photo gallery</p>\n'
            '      <h1 id="page-heading">%s</h1>\n'
            '      <p class="lede">%s. Select any photo to open it full size.</p>\n'
            '      <div class="btn-row">\n'
            '        <a class="btn btn--ghost-light" href="/gallery/">All photo albums</a>\n'
            '      </div>\n'
            '    </div>\n'
            '  </section>\n\n'
            '  <!-- ================= Photos ================= -->\n'
            '  <section class="section" aria-labelledby="photos-heading">\n'
            '    <div class="wrap">\n'
            '      <div class="album">\n'
            '        <h2 class="visually-hidden" id="photos-heading">Photos</h2>\n'
            '%s%s'
            '        <ul class="album__grid" aria-labelledby="photos-heading">\n'
            '%s\n'
            '        </ul>\n'
            '      </div>\n\n'
            '%s\n\n'
            '      <p class="album__back"><a class="btn btn--ghost" href="/gallery/">All photo albums</a></p>\n\n'
            '      <p class="note">\n'
            '        Photos are shared for club members and whānau. If you would like a photo of you or your\n'
            '        child removed, contact the club and we will take it down.\n'
            '      </p>\n'
            '    </div>\n'
            '  </section>\n'
            '</main>'
            % (ALBUM_MARK, folder, esc(title), esc(title), plural(total),
               intro_html, download, '\n'.join(items), VIEWER))

    top, middle, bottom = template
    html = top + head + middle + main + bottom
    path = os.path.join(PAGE_DIR, s, 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    before = io.open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if before != html:
        io.open(path, 'w', encoding='utf-8', newline='').write(html)


def remove_stale(slugs):
    """Delete album pages whose album is gone. Only a page this script wrote
    (it carries ALBUM_MARK) is removed, and only its index.html."""
    for name in sorted(os.listdir(PAGE_DIR)):
        path = os.path.join(PAGE_DIR, name, 'index.html')
        if name in slugs or not os.path.isfile(path):
            continue
        if ALBUM_MARK not in io.open(path, encoding='utf-8').read():
            continue
        os.remove(path)
        try:
            os.rmdir(os.path.dirname(path))
        except OSError:
            pass                       # something else lives there; leave it
        print('   removed gallery/%s/ - its album is gone' % name)


def build(order=False, check=False):
    if not os.path.isdir(GALLERY_DIR):
        print('no thumbnails at %s - set NCAN_PHOTOS_DIR or --photos-dir to the '
              'local copy of the photo host' % GALLERY_DIR)
        return 1

    # The Sporty migration is finished, so the three passes that renamed and
    # deleted UUID-named downloads are switched off, along with the flags that
    # used to control them: a build now only reads the folders and rewrites
    # the gallery pages. Their functions are kept for reference - to bring them back,
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
        markup = ('      <p class="note">No photos yet. Put the originals in '
                  '<code>gallery/&lt;album&gt;/</code> on the photo host, run '
                  '<code>python tools/gallery-photos.py</code>, then '
                  '<code>python tools/build-gallery.py</code>.</p>')
        write(markup)
        remove_stale(set())
        print('no photos found - wrote the empty state')
        print('empty albums: %s' % ', '.join(empty))
        return 0

    if order:
        return write_order(albums)

    if check:
        check_zips([folder for folder, _, _ in albums])

    zips = read_zips()
    if zips is None:
        print('   ! no zips.json - run with --check-zips to size the links '
              'and drop albums that have no zip')

    template = read_template()
    slugs = set()
    intros = 0
    downloads = 0
    for folder, title, photos in albums:
        intro = intro_for(folder)
        if intro:
            intros += 1
        download = download_link(folder, zips)
        if download:
            downloads += 1
        if slug(folder) in slugs:
            raise SystemExit('two albums would share the page gallery/%s/ - '
                             'rename one of the folders' % slug(folder))
        slugs.add(slug(folder))
        write_album(template, folder, title, photos, intro, download)

    write(front_page(albums))
    remove_stale(slugs)

    total = sum(len(p) for _, _, p in albums)
    print('gallery rebuilt: %d album page(s), %d photo(s), %d zip link(s)'
          % (len(albums), total, downloads))
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
    path = os.path.join(META_DIR, ORDER_FILE)
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
        raise SystemExit('markers not found in gallery/index.html:\n  %s\n  %s' % (OPEN, CLOSE))
    start, end = html.index(OPEN) + len(OPEN), html.index(CLOSE)
    io.open(PAGE, 'w', encoding='utf-8', newline='').write(
        html[:start] + '\n' + markup + '\n    ' + html[end:])


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Rebuild the gallery from the photos at photos.ncan.nz.')
    ap.add_argument('--photos-dir', metavar='DIR',
                    help='the local copy of the photo host (default: NCAN_PHOTOS_DIR, '
                         'or ncan-gallery next to this repository)')
    ap.add_argument('--write-order', action='store_true',
                    help='write the current album order to tools/gallery/'
                         'order.txt and stop, changing nothing else')
    ap.add_argument('--check-zips', action='store_true',
                    help='ask the photo host which albums have a zip and how big '
                         'it is, refresh tools/gallery/zips.json, then '
                         'rebuild the page')
    args = ap.parse_args()
    if args.photos_dir:
        PHOTOS_DIR = os.path.abspath(args.photos_dir)
        GALLERY_DIR = os.path.join(PHOTOS_DIR, 'thumbs')
        ORIGINALS_DIR = os.path.join(PHOTOS_DIR, 'gallery')
    sys.exit(build(order=args.write_order, check=args.check_zips))
