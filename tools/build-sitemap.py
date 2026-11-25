#!/usr/bin/env python3
"""
build-sitemap.py

Writes sitemap.xml and robots.txt for ncan.nz, listing every page at the site
root so Google Search Console has something to read.

    python tools/build-sitemap.py            # write both files
    python tools/build-sitemap.py --check    # report only, change nothing

Submit the sitemap once, at

    https://search.google.com/search-console

under Sitemaps, entering:  sitemap.xml

Google re-reads it on its own after that; there is nothing to resubmit when a
page changes.

WHAT GOES IN
    Every .html at the repository root, because that is what GitHub Pages
    serves at ncan.nz. index.html is listed as the bare domain rather than
    /index.html, so the two do not compete as duplicates.

    Add a filename to SKIP to keep it out - a page that should exist but not
    be advertised. Leaving a page out of the sitemap does not hide it: it is
    still public and Google may index it anyway. Only a robots rule or a
    noindex tag does that.

<lastmod>
    Taken from the last commit that touched the file, not the filesystem,
    so a fresh clone does not report everything as changed today.
"""

import argparse
import datetime
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://ncan.nz'
SITEMAP = os.path.join(ROOT, 'sitemap.xml')
ROBOTS = os.path.join(ROOT, 'robots.txt')

# pages to leave out of the sitemap
# The athlete pages show results only to someone signed in (they read from the
# club's API, api.ncan.nz), so search engines have nothing to index there; the
# pages also carry a noindex tag. admin/ is the staff tools (coaches, the
# committee and administrators) and results-sources/ is for staff, signed in
# (both noindex too). sign-in/ is for signing in, and me/ (My athletes) and my/
# (Shared links) for families signed in (all noindex).
# junior-athletics: left out while the coaches and committee review it (November 2026)
SKIP = {'admin', 'athlete', 'athletes', 'junior-athletics',
        'me', 'my', 'results-sources', 'sign-in'}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pages import pages as site_pages  # noqa: E402


def say(text):
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


def pages():
    """[(address, file)] of every page in the sitemap: index.html is the bare domain,
    calendar/index.html is /calendar/ (see tools/pages.py)."""
    return [(address, os.path.relpath(path, ROOT).replace(os.sep, '/'))
            for name, address, path in site_pages(ROOT) if name.split('/')[0] not in SKIP]


def last_changed(name):
    """The date of the last commit touching this file (following a move), or today if untracked."""
    try:
        out = subprocess.check_output(
            ['git', 'log', '-1', '--follow', '--format=%cs', '--', name],
            cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
        if out:
            return out
    except Exception:
        pass
    stamp = os.path.getmtime(os.path.join(ROOT, name))
    return datetime.date.fromtimestamp(stamp).isoformat()


def loc_for(address):
    return SITE + address


def build_sitemap(names):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for address, name in names:
        lines.append('  <url>')
        lines.append('    <loc>%s</loc>' % loc_for(address))
        lines.append('    <lastmod>%s</lastmod>' % last_changed(name))
        lines.append('  </url>')
    lines.append('</urlset>')
    return '\n'.join(lines) + '\n'


def build_robots():
    return '\n'.join([
        '# https://ncan.nz',
        'User-agent: *',
        'Allow: /',
        '',
        'Sitemap: %s/sitemap.xml' % SITE,
    ]) + '\n'


def write(path, text, check):
    before = None
    if os.path.exists(path):
        before = io.open(path, encoding='utf-8').read()
    rel = os.path.relpath(path, ROOT)
    if before == text:
        say('   %-14s unchanged' % rel)
        return False
    if check:
        say('   %-14s would be %s' % (rel, 'updated' if before else 'created'))
        return True
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    os.replace(tmp, path)
    say('   %-14s %s' % (rel, 'updated' if before else 'created'))
    return True


def main():
    ap = argparse.ArgumentParser(description='Write sitemap.xml and robots.txt.')
    ap.add_argument('--check', action='store_true',
                    help='report what would change and write nothing')
    args = ap.parse_args()

    names = pages()
    if not names:
        say('no pages found at %s' % ROOT)
        return 1

    say('%d page(s):' % len(names))
    for address, name in names:
        say('   %-40s %s  %s' % (loc_for(address), last_changed(name), name))
    if SKIP:
        say('skipped: %s' % ', '.join(sorted(SKIP)))

    say('')
    changed = write(SITEMAP, build_sitemap(names), args.check)
    changed |= write(ROBOTS, build_robots(), args.check)

    if args.check:
        say('\ncheck only - nothing written.')
        return 1 if changed else 0

    say('\nSubmit once in Search Console (Sitemaps): sitemap.xml')
    return 0


if __name__ == '__main__':
    sys.exit(main())
