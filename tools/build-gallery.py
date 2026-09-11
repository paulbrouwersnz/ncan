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
Albums are ordered newest year first, then by day. Empty folders are skipped.

Downloads from the old Sporty gallery arrive as pairs sharing a UUID: a
thumbnail with a size code (IMG_7481-<uuid>_539.jpg, Team photo-<uuid>_250.jpg)
and a full-size file (undefined-<uuid>_wo.jpg, IMG_7481-<uuid>_wo749.jpg). The
name can be anything the camera or export produced - IMG_####, DSC_####, a
descriptive title - or the "undefined" placeholder used when it was lost.
Before scanning, the script pairs them on the UUID, takes the name from
whichever file has one, and renames the full-size file to it (IMG_7481.jpg). Pass --no-rename to skip that
pass, or --dry-run to see what it would do without touching anything.

Once a full-size file is in place its `_539` thumbnail is redundant, so it is
deleted - but only when the full-size counterpart is confirmed present in the
same folder. Pass --keep-thumbs to leave them.

Anything still carrying a UUID in its name after those two passes, plus any
file still named undefined-*, is download debris and is deleted last. Files
that are the only copy of their photo are flagged in the log as they go.
Pass --keep-leftovers to skip that.
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
        words += [w for w in segment.replace('_', '-').split('-') if w]
    seen, unique = set(), []
    for w in words:                      # "2026/2026-day-one" should not repeat 2026
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(w if w.isdigit() else w.capitalize())
    return ' '.join(unique)


def sort_key(relpath):
    flat = relpath.replace(os.sep, '/').lower()
    year = re.search(r'(19|20)\d{2}', flat)
    year = int(year.group(0)) if year else 0
    day = 0
    m = re.search(r'day[-_ /]?(\w+)', flat)
    if m:
        token = m.group(1)
        day = int(token) if token.isdigit() else DAYS.get(token, 0)
    return (-year, flat.count('/'), day, flat)


def caption_for(filename):
    stem = os.path.splitext(filename)[0]
    pretty = re.sub(r'[-_]+', ' ', stem).strip()
    # camera filenames (IMG_1234, DSC0001) make poor captions
    if re.match(r'^(img|dsc|dscn|p)\s*\d+$', pretty, re.I):
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


def build(rename=True, drop_thumbs=True, drop_leftovers=True, dry_run=False):
    if not os.path.isdir(GALLERY_DIR):
        print('no gallery directory at %s' % GALLERY_DIR)
        return 1

    files = Files(dry_run=dry_run)
    if rename:
        rename_full_size(files)
    if drop_thumbs:
        remove_thumbnails(files)
    if drop_leftovers:
        remove_leftovers(files)

    # any folder holding images is an album, at any depth
    found = []
    for dirpath, dirnames, _ in os.walk(GALLERY_DIR):
        dirnames.sort()
        rel = os.path.relpath(dirpath, GALLERY_DIR)
        if rel == '.':
            continue
        photos = sorted(f for f in files.listdir(dirpath) if f.lower().endswith(EXTS))
        found.append((rel.replace(os.sep, '/'), photos))

    albums, empty = [], []
    for relpath, photos in sorted(found, key=lambda x: sort_key(x[0])):
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

    # jump links across the top
    nav = ['      <nav class="album-nav" aria-label="Albums">',
           '        <ul>']
    for folder, title, photos in albums:
        nav.append('          <li><a href="#album-%s">%s <span>%d</span></a></li>'
                   % (slug(folder), esc(title), len(photos)))
    nav += ['        </ul>', '      </nav>']

    blocks = []
    for folder, title, photos in albums:
        items = []
        for f in photos:
            src = 'assets/img/gallery/%s/%s' % (folder, quote(f))
            cap = caption_for(f)
            dims = dimensions(os.path.join(GALLERY_DIR, folder, f))
            size = ' width="%d" height="%d"' % dims if dims else ''
            alt = esc(cap) if cap else '%s photo' % esc(title)
            items.append(
                '          <li class="album__item">\n'
                '            <a href="%s" target="_blank" rel="noopener">\n'
                '              <img src="%s" alt="%s"%s loading="lazy">\n'
                '            </a>\n'
                '          </li>' % (src, src, alt, size))

        blocks.append(
            '      <section class="album" id="album-%s" aria-labelledby="album-%s-heading">\n'
            '        <div class="album__head">\n'
            '          <h2 id="album-%s-heading">%s</h2>\n'
            '          <p class="album__count">%d photo%s</p>\n'
            '        </div>\n'
            '        <ul class="album__grid">\n'
            '%s\n'
            '        </ul>\n'
            '      </section>'
            % (slug(folder), slug(folder), slug(folder), esc(title), len(photos),
               '' if len(photos) == 1 else 's', '\n'.join(items)))

    write('\n'.join(nav) + '\n\n' + '\n\n'.join(blocks))

    total = sum(len(p) for _, _, p in albums)
    print('gallery rebuilt: %d album(s), %d photo(s)' % (len(albums), total))
    for folder, title, photos in albums:
        print('   %-26s %-24s %d photo(s)' % (folder, title, len(photos)))
    if empty:
        print('empty (skipped): %s' % ', '.join(empty))
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
    ap.add_argument('--no-rename', action='store_true',
                    help='skip the undefined-<uuid>_wo -> IMG_####.jpg rename pass')
    ap.add_argument('--keep-thumbs', action='store_true',
                    help='keep the _539 thumbnails instead of deleting them')
    ap.add_argument('--keep-leftovers', action='store_true',
                    help='keep leftover files (UUID names and undefined-*)')
    ap.add_argument('--dry-run', action='store_true',
                    help='report the renames and deletions without performing them')
    args = ap.parse_args()
    sys.exit(build(rename=not args.no_rename,
                   drop_thumbs=not args.keep_thumbs,
                   drop_leftovers=not args.keep_leftovers,
                   dry_run=args.dry_run))
