# -*- coding: utf-8 -*-
"""One-off: copy the gallery thumbnails out of this repository into the photo host's folder.

Until November 2026 the gallery's thumbnails were kept in this repository, in
assets/img/gallery/<album>/, and the originals on ncan.brouwers.nz. Now both are
hosted at https://photos.ncan.nz/, with the thumbnails in thumbs/<album>/.

This copies each thumbnail, exactly as it is, from the repository's history (so
it works after the files have been removed from the working copy) into
<photos dir>/thumbs/<album>/<photo>. A thumbnail already there with the same
contents is skipped; one that differs is reported and left alone unless
--overwrite is given.

    python tools/gallery-move-thumbs.py                # report only
    python tools/gallery-move-thumbs.py --apply        # copy
    python tools/gallery-move-thumbs.py --rev <commit> # take them from another commit

The default commit is the last one on origin/main that still has them
(found automatically). Then run tools/gallery-photos.py for the WebP copies.
"""
import argparse
import hashlib
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PHOTOS = os.environ.get('NCAN_PHOTOS_DIR') or os.path.join(os.path.dirname(ROOT), 'ncan-gallery')
PREFIX = 'assets/img/gallery/'
IMAGES = ('.jpg', '.jpeg', '.png', '.webp')


def git(*args, data=None):
    return subprocess.run(('git',) + args, cwd=ROOT, input=data, capture_output=True,
                          check=True).stdout


def last_with_thumbs():
    """The newest commit on origin/main (or HEAD) whose tree has the thumbnails."""
    for ref in ('origin/main', 'HEAD'):
        try:
            out = git('log', '-1', '--format=%H', ref, '--', PREFIX)
        except subprocess.CalledProcessError:
            continue
        commit = out.decode().strip()
        if not commit:
            continue
        # that commit may be the one that removed them: then take its parent
        if git('ls-tree', '-r', '--name-only', commit, PREFIX).strip():
            return commit
        return commit + '^'
    sys.exit('No commit with %s found' % PREFIX)


def listing(rev):
    """(path in the repo, blob id, size) of every thumbnail at rev."""
    out = git('ls-tree', '-r', '-l', '-z', rev, PREFIX)
    found = []
    for entry in out.split(b'\0'):
        if not entry:
            continue
        meta, path = entry.split(b'\t', 1)
        _mode, kind, blob, size = meta.split()
        path = path.decode('utf-8')
        if kind == b'blob' and path.lower().endswith(IMAGES):
            found.append((path, blob.decode(), int(size)))
    return found


def git_blob_id(path):
    """The id git would give the file's contents (to compare without reading git)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def main():
    ap = argparse.ArgumentParser(description='Copy the gallery thumbnails into the photo host folder.')
    ap.add_argument('--photos-dir', default=DEFAULT_PHOTOS,
                    help='the local copy of the photo host (default: %(default)s)')
    ap.add_argument('--rev', help='the commit to take the thumbnails from')
    ap.add_argument('--apply', action='store_true', help='copy (without it: report only)')
    ap.add_argument('--overwrite', action='store_true',
                    help='replace a thumbnail already there with different contents')
    args = ap.parse_args()

    rev = args.rev or last_with_thumbs()
    thumbs = os.path.join(os.path.abspath(args.photos_dir), 'thumbs')
    items = listing(rev)
    print('%d thumbnail(s) in %s at %s -> %s' % (len(items), PREFIX, rev[:12], thumbs))

    todo, same, differ = [], 0, []
    for path, blob, size in items:
        dst = os.path.join(thumbs, *path[len(PREFIX):].split('/'))
        if os.path.exists(dst):
            if git_blob_id(dst) == blob:
                same += 1
                continue
            differ.append(dst)
            if not args.overwrite:
                continue
        todo.append((blob, dst, size))

    print('already there: %d; to copy: %d; different and %s: %d'
          % (same, len(todo), 'replaced' if args.overwrite else 'left alone', len(differ)))
    for dst in differ[:10]:
        print('   ? differs: %s' % dst)
    if not args.apply:
        print('report only - run with --apply to copy')
        return 0

    # one git process streams every blob
    proc = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    copied = 0
    try:
        for blob, dst, size in todo:
            proc.stdin.write(blob.encode() + b'\n')
            proc.stdin.flush()
            header = proc.stdout.readline().split()
            data = proc.stdout.read(int(header[2]))
            proc.stdout.read(1)                 # the newline after each object
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst + '.part', 'wb') as fh:
                fh.write(data)
            os.replace(dst + '.part', dst)
            copied += 1
            if copied % 500 == 0:
                print('   copied %d of %d' % (copied, len(todo)))
    finally:
        proc.stdin.close()
        proc.wait()
    print('copied %d thumbnail(s)' % copied)
    return 0


if __name__ == '__main__':
    sys.exit(main())
