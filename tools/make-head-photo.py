# -*- coding: utf-8 -*-
"""Write each page's header photo into the page, from assets/data/page-photos.json.

    python tools/make-head-photo.py            check the file, then update the pages
    python tools/make-head-photo.py --check    check only; exit 1 if the file has a
                                               problem or a page is out of step

For every page with an entry, the green heading band (<section class="page-head">)
gets the first photo its entry would pick from, written in as .page-head--photo
and the --photo, --photo-webp (and --photo-focus) properties, so the photo is
there before any script runs. When the page has more to choose from - a pool of
several photos, or entries for its #/... addresses - the section is also marked
data-page-photos, and assets/js/page-photos.js picks a photo when the page loads
and again as the #/... part changes. A page with no entry, or "photo": "none",
has the plain band.

The checks (the same run, and Checks on every pull request):

    photos on https://photos.ncan.nz/ or a file under /assets/
    pools that exist, include no pool that includes them back, are nested at
      most four deep and end up with photos in them
    no pool marked "public": false reaching a page not marked "public": false
    page addresses that are pages on the site, and #/... parts that are lower
      case, with any * only at the end
    focus written "x% y%"; one of "pool", "photos" or "photo": "none" per entry
    a warning for entries for training plans more than a year old

Standard library only. See tools/README.md ("Header photos").
"""
import argparse
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import page_photos as P  # noqa: E402
from pages import pages as site_pages  # noqa: E402

HEAD = re.compile(r'<section class="page-head[ "][^>]*>')


def rewrite_tag(tag, data, address, entry):
    """The page head's opening tag for the page's entry."""
    t = re.sub(r'\s+style="[^"]*"', '', tag)
    t = re.sub(r'\s+data-page-photos(="[^"]*")?', '', t)
    t = t.replace(' page-head--photo', '')
    photo = P.first_photo(data, entry) if entry else None
    if photo:
        t = t.replace('class="page-head', 'class="page-head page-head--photo', 1)
        extra = ' style="%s"' % P.head_style(photo, entry.get('focus', ''))
    else:
        extra = ''
    if P.needs_script(data, address, entry):
        extra += ' data-page-photos'
    return t[:-1] + extra + '>'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true',
                    help='change nothing; exit 1 on a problem or a page out of step')
    args = ap.parse_args()

    data = P.load()
    found = site_pages()
    addresses = {address for _, address, _ in found}
    problems, warnings = P.check(data, addresses)
    for w in warnings:
        print('warning: ' + w)
    if problems:
        for p in problems:
            print('::error::' + p if os.environ.get('GITHUB_ACTIONS') else 'problem: ' + p)
        print('%d problem(s) in %s' % (len(problems), os.path.relpath(P.DATA, P.ROOT)))
        return 1

    pages = data.get('pages', {})
    stale, written, missing = [], 0, []
    for _, address, path in found:
        entry = pages.get(address)
        with io.open(path, encoding='utf-8') as f:
            html = f.read()
        m = HEAD.search(html)
        if not m:
            if entry or any(k.startswith(address + '#') for k in pages):
                missing.append(address)
            continue
        new = rewrite_tag(m.group(0), data, address, entry)
        if new == m.group(0):
            continue
        rel = os.path.relpath(path, P.ROOT)
        if args.check:
            stale.append(rel)
            continue
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(html[:m.start()] + new + html[m.end():])
        written += 1
        print('   wrote %s' % rel)

    for address in missing:
        print('problem: %s has an entry but no <section class="page-head">' % address)
    if stale:
        for rel in stale:
            print('::error::%s is out of step with page-photos.json' % rel
                  if os.environ.get('GITHUB_ACTIONS') else 'out of step: ' + rel)
        print('Run python tools/make-head-photo.py and commit.')
        return 1
    if missing:
        return 1
    print('header photos: %d page entr%s, %d pool(s), %d page(s) updated'
          % (len(pages), 'y' if len(pages) == 1 else 'ies', len(data.get('pools', {})), written))
    return 0


if __name__ == '__main__':
    sys.exit(main())
