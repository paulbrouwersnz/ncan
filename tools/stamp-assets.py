# -*- coding: utf-8 -*-
"""Stamp the stylesheet and script links with a content hash, so browsers pick up changes.

A browser that has already fetched assets/css/styles.css will happily keep
using its copy for as long as the host's caching rules allow, which is why an
edited stylesheet can look "broken" until a hard refresh. Adding a marker that
changes with the file makes the URL new, so the browser fetches it:

    <link rel="stylesheet" href="assets/css/styles.css?v=8f3c1a2b">

A content hash rather than a date, for two reasons: the query only changes when
the file actually changes, so unchanged visits still hit the cache; and there is
nothing to remember to bump.

    python tools/stamp-assets.py            # stamp every page
    python tools/stamp-assets.py --check    # report only, change nothing
    python tools/stamp-assets.py --clear    # strip the stamps again

Every script in assets/js/ is stamped the same way (<script src="assets/js/
admin.js?v=...">): a page running an old script against the club's API, which
has moved on, can show nonsense until a hard refresh.

The publish workflow (.github/workflows/pages.yml) runs it after sync-partials.py.
The stamps are not committed: run it with --clear before committing if you
stamped locally (the pull request checks fail on a committed stamp).

The <link> lives in partials/head.html, which is generated into every page, so
this stamps the partial as well as the pages. If it only stamped the pages, the
next sync-partials.py run would copy the partial's stale hash back over them.
"""
import argparse
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (path on disk, how it is written in the pages: from the site root, as pages live in folders)
ASSETS = [
    (os.path.join('assets', 'css', 'styles.css'), '/assets/css/styles.css'),
] + [(os.path.join('assets', 'js', f), '/assets/js/' + f)
     for f in sorted(os.listdir(os.path.join(ROOT, 'assets', 'js'))) if f.endswith('.js')]

HASH_LENGTH = 8


def read(path):
    return io.open(path, encoding='utf-8').read()


def write_atomic(path, text):
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)
    os.replace(tmp, path)


def content_hash(path):
    """The file's hash, the same on every computer: line endings count as \\n, so a
    Windows checkout (git turns \\n into \\r\\n there) stamps what the site serves."""
    with open(path, 'rb') as fh:
        data = fh.read().replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()[:HASH_LENGTH]


def targets():
    """Every file that references a stamped asset.

    The pages, plus the head partial they are generated from: both have to
    carry the same stamp or they will fight each other.
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pages import page_files
    found = page_files(ROOT)
    partial = os.path.join(ROOT, 'partials', 'head.html')
    if os.path.exists(partial):
        found.append((os.path.join('partials', 'head.html'), partial))
    return found


def main():
    ap = argparse.ArgumentParser(description='Stamp asset links with a content hash.')
    ap.add_argument('--check', action='store_true',
                    help='report what would change, without writing')
    ap.add_argument('--clear', action='store_true',
                    help='remove the stamps, restoring plain asset links')
    args = ap.parse_args()

    stamps = []
    for relative, reference in ASSETS:
        path = os.path.join(ROOT, relative)
        if not os.path.exists(path):
            print('   ! %s is missing - skipped' % reference)
            continue
        stamps.append((reference, None if args.clear else content_hash(path)))

    if not stamps:
        print('nothing to stamp')
        return 1

    for reference, digest in stamps:
        print('%s -> %s' % (reference, digest if digest else '(no stamp)'))

    changed = []
    for page, path in targets():
        before = read(path)
        after = before

        for reference, digest in stamps:
            # match the asset with or without an existing ?v=... stamp
            pattern = re.compile(r'(["\'])' + re.escape(reference) + r'(\?v=[0-9a-f]+)?\1')
            wanted = '%s%s' % (reference, '?v=' + digest if digest else '')
            after = pattern.sub(lambda m: m.group(1) + wanted + m.group(1), after)

        if after != before:
            changed.append(page)
            if not args.check:
                write_atomic(path, after)

    if args.check:
        print('%d page(s) would change: %s'
              % (len(changed), ', '.join(changed) if changed else 'none'))
        return 1 if changed else 0

    if changed:
        print('stamped %d page(s): %s' % (len(changed), ', '.join(changed)))
    else:
        print('every page was already up to date')
    return 0


if __name__ == '__main__':
    sys.exit(main())
