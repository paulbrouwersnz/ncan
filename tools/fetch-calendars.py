# -*- coding: utf-8 -*-
"""Bring the calendars edited on the calendar editor into the site, at publish time.

    python tools/fetch-calendars.py                   fetch them into assets/calendar/
    python tools/fetch-calendars.py --compare-live    print "true" when the API's
                                                      calendars differ from the live site's

Coaches, the committee and admins edit the club calendars on /admin/calendars/;
the club's API keeps them (GET /v1/calendars, GET /v1/calendars/<slug>.ics). The
Publish site workflow (.github/workflows/pages.yml) runs this before
tools/build-calendar-list.py --page-only, so the published assets/calendar/
carries the API's calendars.json and one .ics per calendar, at the same
addresses phones already subscribe to (https://ncan.nz/assets/calendar/<slug>.ics).
Nothing is committed: the repository's copy stays as the fallback.

On the site, assets/js/calendar.js reads the API's calendars as the page loads,
so an edit shows on /calendar/ within a minute; the published files are what it
falls back on when the API can't be reached. Subscribers get a change at the next
publish, which the workflow runs every half hour when the calendars have changed
(--compare-live), plus their own calendar app's refresh time.

It never stops a publish and never publishes half a set: if the API can't be
reached, or its list or any calendar's .ics doesn't look right, every file is
left as it is. A calendar still in the folder but no longer in the API (deleted
on the editor) keeps its file, so a subscriber's link still answers, but is no
longer listed on the page.

Standard library only. See tools/README.md ("Calendars").
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAL_DIR = os.path.join(ROOT, 'assets', 'calendar')
MANIFEST = os.path.join(CAL_DIR, 'calendars.json')
API = os.environ.get('CALENDARS_API', 'https://api.ncan.nz/v1/calendars').rstrip('/')
LIVE = os.environ.get('CALENDARS_LIVE', 'https://ncan.nz/assets/calendar/calendars.json')
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]{0,60}$')
COLOUR = re.compile(r'^#[0-9a-fA-F]{6}$')


def warn(words):
    print('::warning::' + words if os.environ.get('GITHUB_ACTIONS') else 'warning: ' + words)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ncan-site-publish',
                                               'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read().decode('utf-8')


def manifest_entries(listing):
    """The calendars.json entries for the API's public calendars, in its order.
    Raises ValueError when the listing doesn't look right."""
    cals = listing.get('calendars') if isinstance(listing, dict) else None
    if not isinstance(cals, list) or not cals:
        raise ValueError('the API listed no calendars')
    out, seen = [], set()
    for c in cals:
        if not isinstance(c, dict) or c.get('public') is False:
            continue
        slug = c.get('slug') or ''
        if not SLUG.match(slug):
            raise ValueError('a calendar has a bad name: %r' % slug)
        if c.get('file') != slug + '.ics':
            raise ValueError('calendar %s: file %r is not %s.ics' % (slug, c.get('file'), slug))
        if slug in seen:
            raise ValueError('calendar %s is listed twice' % slug)
        seen.add(slug)
        name = (c.get('name') or '').strip()
        if not name:
            raise ValueError('calendar %s has no name' % slug)
        entry = {'file': c['file'], 'name': name}
        if COLOUR.match(c.get('colour') or ''):
            entry['colour'] = c['colour']
        out.append(entry)
    if not out:
        raise ValueError('the API listed no public calendars')
    return out


def check_ics(slug, text):
    """Raises ValueError unless text looks like a whole calendar."""
    body = text.strip()
    if not body.startswith('BEGIN:VCALENDAR') or not body.endswith('END:VCALENDAR'):
        raise ValueError('calendar %s: the API did not send a whole .ics' % slug)


def write(path, text):
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--compare-live', action='store_true',
                    help='print "true" if the API\'s calendars differ from the live site\'s')
    args = ap.parse_args()

    try:
        listing = json.loads(fetch(API))
        entries = manifest_entries(listing)
    except Exception as e:  # noqa: BLE001 - any failure: publish the files as they are
        warn('calendars could not be read from %s (%s); the published files are left as they are'
             % (API, e))
        if args.compare_live:
            print('false')
        return 0
    version = listing.get('version')

    if args.compare_live:
        try:
            live = json.loads(fetch(LIVE)).get('version')
        except Exception:  # noqa: BLE001 - the live file missing or unreadable
            live = None
        print('true' if live != version else 'false')
        return 0

    feeds = {}
    try:
        for e in entries:
            slug = e['file'][:-4]
            text = fetch(API + '/' + e['file'])
            check_ics(slug, text)
            feeds[e['file']] = text
    except Exception as e:  # noqa: BLE001 - all or nothing
        warn('calendars: %s; the published files are left as they are' % e)
        return 0

    listed = set(feeds)
    for name in sorted(os.listdir(CAL_DIR)):
        if name.endswith('.ics') and name not in listed:
            warn('calendars: %s is no longer in the API; its file stays but is not listed' % name)

    changed = 0
    for name, text in feeds.items():
        path = os.path.join(CAL_DIR, name)
        old = None
        if os.path.exists(path):
            with io.open(path, encoding='utf-8', newline='') as f:
                old = f.read()
        if old != text:
            write(path, text)
            changed += 1
    manifest = {'version': version, 'updated': listing.get('updated') or '',
                'source': 'api', 'calendars': entries}
    write(MANIFEST, json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('calendars: version %s from the API, %d calendar(s), %d file(s) changed'
          % (version, len(entries), changed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
