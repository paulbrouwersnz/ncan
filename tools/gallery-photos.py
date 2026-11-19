# -*- coding: utf-8 -*-
"""Make the gallery's thumbnails and WebP copies in the local copy of the photo host.

The gallery's photos are hosted at https://photos.ncan.nz/, not in this
repository. The local copy of the host (by default the folder ncan-gallery next
to this repository; set NCAN_PHOTOS_DIR or --photos-dir for another) is laid out
as the host is:

    gallery/<album>/<photo>.jpg      the full-size originals, as uploaded
    gallery/<album>.zip              an album's zip (not touched here)
    thumbs/<album>/<photo>.jpg       the thumbnails the gallery pages show

This script fills in what's missing, and changes nothing that's already there:

1. A thumbnail for every original that has none: the longest side cut to
   --max-edge pixels (500), as JPEG (or PNG for a PNG), same name.
2. A WebP copy beside every original and every thumbnail (<photo>.webp), made
   again when the JPEG is newer than its WebP. The JPEGs are kept: browsers
   without WebP, the "open in a new tab" link and the zips use them. The photo
   viewer opens the original's WebP; --webp-max-edge 2560 makes those half the
   size again (camera photos are larger than any screen), leaving the JPEG
   full size. To change it later, delete the .webp files and run again.

Phone photos carry an EXIF orientation flag; it is baked into the pixels, so a
WebP or thumbnail never comes out on its side. Colour profiles are kept.

Then rebuild the pages with tools/build-gallery.py and upload thumbs/ and the
new .webp files to the host.

    python tools/gallery-photos.py --dry-run          # report what it would make
    python tools/gallery-photos.py                    # make it
    python tools/gallery-photos.py --album "2026/Colgate Games"
    python tools/gallery-photos.py --only webp        # or --only thumbs

Needs Pillow (pip install Pillow).
"""
import argparse
import os
import sys
from concurrent.futures import ProcessPoolExecutor

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Needs Pillow: pip install Pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PHOTOS = os.environ.get('NCAN_PHOTOS_DIR') or os.path.join(os.path.dirname(ROOT), 'ncan-gallery')
SOURCES = ('.jpg', '.jpeg', '.png')
WEBP_MAX = 16383                       # WebP's largest side, in pixels


def sources(top, album=''):
    """(album folder, file name) of every JPEG/PNG under top, sorted."""
    found = []
    if not os.path.isdir(top):
        return found
    for dirpath, dirnames, files in os.walk(top):
        dirnames.sort()
        rel = os.path.relpath(dirpath, top).replace(os.sep, '/')
        rel = '' if rel == '.' else rel
        if album and not (rel == album or rel.startswith(album.rstrip('/') + '/')):
            continue
        found += [(rel, f) for f in sorted(files)
                  if f.lower().endswith(SOURCES) and not f.startswith('.')]
    return found


def clashes(items):
    """Names that would share a WebP (IMG_1.jpg and IMG_1.png in one folder)."""
    seen, bad = {}, set()
    for rel, f in items:
        key = (rel, os.path.splitext(f)[0].lower())
        if key in seen:
            bad.add((rel, f))
            bad.add(seen[key])
        seen[key] = (rel, f)
    return bad


def opened(path):
    """The image upright (EXIF orientation applied), and its colour profile."""
    im = Image.open(path)
    icc = im.info.get('icc_profile')
    im = ImageOps.exif_transpose(im)
    return im, icc


def write(path, save):
    """Write through a temporary file, so a stopped run leaves no half file."""
    tmp = path + '.part'
    try:
        save(tmp)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def make_thumb(job):
    src, dst, max_edge, quality = job
    try:
        im, icc = opened(src)
        im.thumbnail((max_edge, max_edge), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if dst.lower().endswith('.png'):
            write(dst, lambda p: im.save(p, 'PNG', optimize=True))
        else:
            if im.mode not in ('RGB', 'L'):
                im = im.convert('RGB')
            write(dst, lambda p: im.save(p, 'JPEG', quality=quality, optimize=True,
                                         progressive=True, icc_profile=icc))
        return dst, None
    except Exception as exc:              # a damaged or half-copied file
        return dst, str(exc)


def make_webp(job):
    src, dst, quality, max_edge = job
    try:
        im, icc = opened(src)
        edge = min(max_edge or WEBP_MAX, WEBP_MAX)
        if max(im.size) > edge:
            im.thumbnail((edge, edge), Image.LANCZOS)
        if im.mode not in ('RGB', 'RGBA', 'L', 'LA'):
            im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
        write(dst, lambda p: im.save(p, 'WEBP', quality=quality, method=4, icc_profile=icc))
        return dst, None
    except Exception as exc:
        return dst, str(exc)


def webp_of(path):
    return os.path.splitext(path)[0] + '.webp'


def stale(src, dst):
    return not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src)


def run(jobs, fn, workers, label):
    if not jobs:
        return 0, 0
    made = failed = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for n, (dst, err) in enumerate(pool.map(fn, jobs, chunksize=4), 1):
            if err:
                failed += 1
                print('   ! %s: %s' % (dst, err))
            else:
                made += 1
            if n % 1000 == 0:
                print('   %s: %d of %d' % (label, n, len(jobs)))
    return made, failed


def main():
    ap = argparse.ArgumentParser(description='Make the gallery thumbnails and WebP copies.')
    ap.add_argument('--photos-dir', default=DEFAULT_PHOTOS,
                    help='the local copy of the photo host (default: %(default)s)')
    ap.add_argument('--album', default='', help='only this album folder (and below)')
    ap.add_argument('--only', choices=('thumbs', 'webp'), help='do just one of the two steps')
    ap.add_argument('--max-edge', type=int, default=500, help='thumbnail size (default 500)')
    ap.add_argument('--thumb-quality', type=int, default=82, help='thumbnail JPEG quality (default 82)')
    ap.add_argument('--webp-quality', type=int, default=80, help='WebP quality (default 80)')
    ap.add_argument('--webp-max-edge', type=int, default=0,
                    help="cap the originals' WebP copies at this many pixels on the longest "
                         'side (default 0: full size). The JPEG stays full size.')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2,
                    help='photos converted at once (default: one per CPU, %(default)s here)')
    ap.add_argument('--dry-run', action='store_true', help='report what would be made, make nothing')
    args = ap.parse_args()

    photos = os.path.abspath(args.photos_dir)
    originals, thumbs = os.path.join(photos, 'gallery'), os.path.join(photos, 'thumbs')
    if not os.path.isdir(originals) and not os.path.isdir(thumbs):
        sys.exit('No gallery/ or thumbs/ in %s - set --photos-dir' % photos)
    album = args.album.strip('/').replace('\\', '/')

    full = sources(originals, album)
    bad = clashes(full)
    for rel, f in sorted(bad):
        print('   ? gallery/%s/%s shares its name with another photo there: skipped' % (rel, f))
    full = [x for x in full if x not in bad]
    print('%d original(s) in %s' % (len(full), originals))

    # 1. thumbnails for originals without one
    if args.only != 'webp':
        jobs = []
        for rel, f in full:
            dst = os.path.join(thumbs, rel, f)
            if not os.path.exists(dst):
                jobs.append((os.path.join(originals, rel, f), dst, args.max_edge, args.thumb_quality))
        print('thumbnails to make: %d' % len(jobs))
        if not args.dry_run:
            made, failed = run(jobs, make_thumb, args.jobs, 'thumbnails')
            print('   made %d, failed %d' % (made, failed))

    # 2. WebP beside every original and thumbnail
    if args.only != 'thumbs':
        small = sources(thumbs, album)
        small = [x for x in small if x not in clashes(small)]
        jobs = []
        for top, items, edge in ((originals, full, args.webp_max_edge), (thumbs, small, 0)):
            for rel, f in items:
                src = os.path.join(top, rel, f)
                if stale(src, webp_of(src)):
                    jobs.append((src, webp_of(src), args.webp_quality, edge))
        print('WebP copies to make: %d (%d originals and %d thumbnails checked)'
              % (len(jobs), len(full), len(small)))
        if not args.dry_run:
            made, failed = run(jobs, make_webp, args.jobs, 'WebP')
            print('   made %d, failed %d' % (made, failed))

        # thumbnails left without an original are shown but open nothing
        have = set(full)
        lone = [x for x in small if x not in have]
        if lone and os.path.isdir(originals):
            print('   ? %d thumbnail(s) have no original in gallery/, e.g. thumbs/%s/%s'
                  % (len(lone), lone[0][0], lone[0][1]))
    if args.dry_run:
        print('dry run: nothing written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
