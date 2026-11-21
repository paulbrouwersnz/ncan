# -*- coding: utf-8 -*-
"""Add the header photo settings changed on the Club admin page to the site, at publish time.

    python tools/fetch-page-photos.py                   fetch them into the file
    python tools/fetch-page-photos.py --compare-live    print "true" when they differ
                                                        from those on the live site

Admins change header photos on the Club admin header photos page (/admin/header-photos/); the
club's API keeps them (GET /v1/page-photos). The Publish site workflow
(.github/workflows/pages.yml) runs this before tools/make-head-photo.py, so the
published assets/data/page-photos.json carries them as an "api" part, laid over
the file's own settings (page_photos.load), and every page they name gets its
photo written in. Nothing is committed: the repository's file keeps only what is
written by hand and the gallery album entries.

On the site, assets/js/page-photos.js reads the API's settings again on the
pages that pick a photo as they load, so a change shows there within minutes;
the "api" part is what they fall back on when the API can't be reached. A page
that had no photo before gets one at the next publish, which the workflow runs
every half hour when the settings have changed (--compare-live).

It never stops a publish: if the API can't be reached, the file is left as it
is; an entry for a page that isn't on the site, or has no heading band, is left
out with a warning; and if the settings still have a problem (tools/page_photos.py
checks), they are all left out.

Standard library only. See tools/README.md ("Header photos").
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import page_photos as P  # noqa: E402
from pages import pages as site_pages  # noqa: E402

API = os.environ.get('PAGE_PHOTOS_API', 'https://api.ncan.nz/v1/page-photos')
LIVE = os.environ.get('PAGE_PHOTOS_LIVE', 'https://ncan.nz/assets/data/page-photos.json')
HEAD = re.compile(r'<section class="page-head[ "]')


def warn(words):
    print('::warning::' + words if os.environ.get('GITHUB_ACTIONS') else 'warning: ' + words)


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ncan-site-publish',
                                               'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode('utf-8'))


def usable(settings, base, root=P.ROOT):
    """(layer, notes): the API's settings less entries the site can't take,
    and what was left out."""
    found = site_pages()
    addresses = {address for _, address, _ in found}
    with_head = set()
    for _, address, path in found:
        with io.open(path, encoding='utf-8') as f:
            if HEAD.search(f.read()):
                with_head.add(address)
    notes = []
    pages = {}
    for key, entry in (settings.get('pages') or {}).items():
        path = key.partition('#')[0]
        if path not in addresses:
            notes.append('page "%s": %s is not a page on the site; left out' % (key, path))
        elif path not in with_head:
            notes.append('page "%s": %s has no heading band for a photo; left out' % (key, path))
        else:
            pages[key] = entry
    layer = {'pools': settings.get('pools') or {}, 'pages': pages}
    problems, _ = P.check(P.overlay(base, layer), addresses, root=root)
    if problems:
        notes.extend(problems)
        notes.append('the Club admin page\'s header photo settings have a problem; '
                     'all of them are left out of this publish')
        return None, notes
    return layer, notes


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--compare-live', action='store_true',
                    help='print "true" if the API\'s settings differ from the live site\'s')
    args = ap.parse_args()

    try:
        settings = fetch_json(API)
    except Exception as e:  # noqa: BLE001 - any failure: publish without them
        warn('header photo settings could not be fetched from %s (%s)' % (API, e))
        if args.compare_live:
            print('false')
        return 0

    if args.compare_live:
        try:
            live = (fetch_json(LIVE).get('api') or {}).get('version')
        except Exception:  # noqa: BLE001 - the live file missing or unreadable
            live = None
        print('true' if live != settings.get('version') else 'false')
        return 0

    base = P.load(raw=True)
    base.pop('api', None)
    layer, notes = usable(settings, base)
    for n in notes:
        warn(n)
    if layer is None:
        return 0
    base['api'] = {'version': settings.get('version', 0), 'updated': settings.get('updated', ''),
                   'pools': layer['pools'], 'pages': layer['pages']}
    with io.open(P.DATA, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(base, indent=2, ensure_ascii=False) + '\n')
    print('header photos: version %s from the Club admin page, %d pool(s), %d page entr%s'
          % (base['api']['version'], len(layer['pools']), len(layer['pages']),
             'y' if len(layer['pages']) == 1 else 'ies'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
