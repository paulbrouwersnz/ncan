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
    so a fresh clone does not report everything as changed today. Note that
    tools/stamp-assets.py rewrites every page whenever the stylesheet
    changes, so these dates tend to move together.
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
SKIP = set()

# index.html is the site root, not a page of its own
HOME = 'index.html'


def say(text):
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


def pages():
    found = sorted(f for f in os.listdir(ROOT)
                   if f.lower().endswith('.html') and f not in SKIP)
    return found


def last_changed(name):
    """The date of the last commit touching this file, or today if untracked."""
    try:
        out = subprocess.check_output(
            ['git', 'log', '-1', '--format=%cs', '--', name],
            cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
        if out:
            return out
    except Exception:
        pass
    stamp = os.path.getmtime(os.path.join(ROOT, name))
    return datetime.date.fromtimestamp(stamp).isoformat()


def loc_for(name):
    return SITE + '/' if name == HOME else SITE + '/' + name


def build_sitemap(names):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name in names:
        lines.append('  <url>')
        lines.append('    <loc>%s</loc>' % loc_for(name))
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
        say('no .html pages found at %s' % ROOT)
        return 1

    say('%d page(s):' % len(names))
    for name in names:
        say('   %-40s %s  %s' % (loc_for(name), last_changed(name), name))
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
