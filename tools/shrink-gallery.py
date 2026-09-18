#!/usr/bin/env python3
"""
shrink-gallery.py

Resizes the photos in assets/img/gallery IN PLACE down to thumbnail size.

The gallery grid shows every photo in a 180px-wide square tile, so the
2000px originals in the repo are perhaps twenty times larger than anything
the page actually displays. This shrinks them to a long edge of 500px -
comfortably sharp on a high-DPI screen, where a tile asks for about 380px -
and leaves the filenames untouched, so gallery.html keeps working.

The full-size originals are NOT stored here afterwards. They are served from

    https://ncan.brouwers.nz/gallery/...

which mirrors this folder's layout exactly, and build-gallery.py points each
thumbnail's link at that copy, so clicking a photo still opens it full size.

    ------------------------------------------------------------------
    THIS OVERWRITES THE ORIGINALS. There is no undo beyond `git restore`.
    Do not run it against photos that are not already on the mirror.
    ------------------------------------------------------------------

Before writing anything, --apply samples a handful of local photos against
the mirror and refuses to continue if any of them are missing, so a folder
that has not been uploaded yet cannot be destroyed by accident.

Usage:
    python tools/shrink-gallery.py
        Dry run (the default): report what would change and the space saved.

    python tools/shrink-gallery.py --apply
        Do it, after checking the mirror.

    python tools/shrink-gallery.py --album "2026/Colgate Games" --apply
        Limit the run to one album (matched as a path prefix).

Options:
    --max-edge N     longest side in pixels (default 500)
    --quality N      JPEG quality, 1-95 (default 82)
    --jobs N         parallel workers (default: one per CPU, capped at 8)
    --album PREFIX   only photos whose path starts with this
    --sample N       how many photos to check against the mirror (default 12)
    --skip-remote-check   bypass the mirror check (not advised)
"""

import argparse
import io
import os
import random
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('shrink-gallery.py needs Pillow:  python -m pip install Pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GALLERY_DIR = os.path.join(ROOT, 'assets', 'img', 'gallery')
FULL_BASE = 'https://ncan.brouwers.nz/gallery/'
EXTS = ('.jpg', '.jpeg', '.png', '.webp')

# Pillow needs a format name, not an extension, and .jpg is not one of them.
FORMATS = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP'}


def human(n):
    """Bytes as something readable."""
    for unit in ('B', 'KB', 'MB', 'GB'):
        if abs(n) < 1024 or unit == 'GB':
            return '%.1f %s' % (n, unit) if unit != 'B' else '%d B' % n
        n /= 1024.0


def photos(album=None):
    """Every gallery image, as paths relative to GALLERY_DIR."""
    found = []
    for dirpath, dirnames, filenames in os.walk(GALLERY_DIR):
        dirnames.sort()
        for name in sorted(filenames):
            if not name.lower().endswith(EXTS):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), GALLERY_DIR)
            posix = rel.replace(os.sep, '/')
            if album and not posix.startswith(album.rstrip('/') + '/') \
                    and posix != album:
                continue
            found.append(rel)
    return found


def check_mirror(rels, sample, quiet=False):
    """Confirm a sample of the photos really is on the mirror already.

    Shrinking is destructive, so this is the difference between "the full
    size lives somewhere else now" and "the full size is gone".
    """
    if not rels:
        return True
    random.seed()
    picks = random.sample(rels, min(sample, len(rels)))
    missing = []
    for rel in picks:
        url = FULL_BASE + urllib.parse.quote(rel.replace(os.sep, '/'))
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(url, method='HEAD'), timeout=30)
            if resp.status != 200:
                missing.append((rel, resp.status))
        except Exception as exc:
            missing.append((rel, getattr(exc, 'code', exc)))

    if missing:
        print('the mirror is missing %d of %d sampled photo(s):'
              % (len(missing), len(picks)), file=sys.stderr)
        for rel, why in missing:
            print('   %s  (%s)' % (rel, why), file=sys.stderr)
        print('refusing to shrink - upload these to %s first.' % FULL_BASE,
              file=sys.stderr)
        return False

    if not quiet:
        print('mirror check: %d of %d sampled photo(s) present at %s'
              % (len(picks), len(picks), FULL_BASE))
    return True


def shrink_one(rel, max_edge, quality, apply_changes):
    """Resize one photo. Returns (rel, before, after, note)."""
    path = os.path.join(GALLERY_DIR, rel)
    before = os.path.getsize(path)
    ext = os.path.splitext(rel)[1].lower()

    try:
        with Image.open(path) as im:
            # Honour the EXIF orientation flag and bake it into the pixels.
            # The flag is dropped along with the rest of the metadata below,
            # so without this a phone photo would come out on its side.
            im = ImageOps.exif_transpose(im)
            width, height = im.size

            if max(width, height) <= max_edge:
                return (rel, before, before, 'already small enough')

            im.thumbnail((max_edge, max_edge), Image.LANCZOS)

            buf = io.BytesIO()
            fmt = FORMATS[ext]
            if fmt == 'JPEG':
                if im.mode not in ('RGB', 'L'):
                    im = im.convert('RGB')
                im.save(buf, 'JPEG', quality=quality, optimize=True,
                        progressive=True)
            elif fmt == 'PNG':
                im.save(buf, 'PNG', optimize=True)
            else:
                im.save(buf, 'WEBP', quality=quality, method=6)
            data = buf.getvalue()
    except Exception as exc:
        return (rel, before, before, 'ERROR: %s' % exc)

    # A "smaller" image that encodes larger is not worth the quality loss.
    if len(data) >= before:
        return (rel, before, before, 'left alone, re-encode was no smaller')

    note = '%dx%d -> %dx%d' % (width, height, im.size[0], im.size[1])
    if apply_changes:
        # Write beside the original and swap it in, so an interrupted run
        # cannot leave a half-written photo behind.
        tmp = path + '.tmp'
        try:
            with open(tmp, 'wb') as f:
                f.write(data)
            os.replace(tmp, path)
        except Exception as exc:
            if os.path.exists(tmp):
                os.remove(tmp)
            return (rel, before, before, 'ERROR writing: %s' % exc)

    return (rel, before, len(data), note)


def main():
    ap = argparse.ArgumentParser(
        description='Resize the gallery photos in place for thumbnail use.')
    ap.add_argument('--apply', action='store_true',
                    help='actually overwrite the photos (default: dry run)')
    ap.add_argument('--max-edge', type=int, default=500,
                    help='longest side in pixels (default 500)')
    ap.add_argument('--quality', type=int, default=82,
                    help='JPEG/WebP quality 1-95 (default 82)')
    ap.add_argument('--jobs', type=int, default=min(8, (os.cpu_count() or 4)),
                    help='parallel workers')
    ap.add_argument('--album', help='only photos under this path prefix')
    ap.add_argument('--sample', type=int, default=12,
                    help='photos to check against the mirror (default 12)')
    ap.add_argument('--skip-remote-check', action='store_true',
                    help='do not verify the mirror first (not advised)')
    args = ap.parse_args()

    if not os.path.isdir(GALLERY_DIR):
        print('no gallery directory at %s' % GALLERY_DIR, file=sys.stderr)
        return 1

    rels = photos(args.album)
    if not rels:
        print('no photos found%s'
              % (' under %s' % args.album if args.album else ''))
        return 1

    print('%d photo(s)%s, longest side %dpx, quality %d'
          % (len(rels), ' under %s' % args.album if args.album else '',
             args.max_edge, args.quality))

    if args.apply and not args.skip_remote_check:
        if not check_mirror(rels, args.sample):
            return 1

    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        results = list(pool.map(
            lambda r: shrink_one(r, args.max_edge, args.quality, args.apply),
            rels))

    before = sum(r[1] for r in results)
    after = sum(r[2] for r in results)
    errors = [r for r in results if r[3].startswith('ERROR')]
    skipped = [r for r in results if r[3].startswith(('already', 'left'))]
    changed = [r for r in results if r not in errors and r not in skipped]

    for rel, b, a, note in errors:
        print('   ! %s  %s' % (rel, note), file=sys.stderr)

    verb = 'resized' if args.apply else 'would resize'
    print('%s %d photo(s), %d already small enough, %d error(s)'
          % (verb, len(changed), len(skipped), len(errors)))
    print('%s  ->  %s   (%s saved, %.0f%% smaller)'
          % (human(before), human(after), human(before - after),
             100.0 * (before - after) / before if before else 0))

    if not args.apply:
        print('dry run - nothing was written. Re-run with --apply to do it.')

    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
