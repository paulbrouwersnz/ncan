# -*- coding: utf-8 -*-
"""Maintain assets/calendar/calendars.json, the list calendar.html reads.

calendar.html shows every calendar named in the manifest. A calendar is either

  local   a .ics sitting in assets/calendar/
  remote  a .ics published elsewhere, mirrored into assets/calendar/ by this
          tool, with the source recorded as "url"

Why remote calendars are mirrored rather than fetched by the page: a browser
will not read a .ics from another site unless that site sends CORS headers, and
the big providers do not. Google Calendar, for one, serves its public .ics with
no Access-Control-Allow-Origin header, so fetching it from the page fails while
fetching it from here succeeds. Mirroring also means the page keeps working if
the provider is slow or down.

Usage
-----
    python tools/build-calendar-list.py
        Rescan the folder and rewrite the manifest. Colours, names and source
        URLs already recorded are kept.

    python tools/build-calendar-list.py --fetch
        Re-download every remote calendar into its local mirror, then rescan.
        Run this before publishing, and on a schedule if you want the site to
        track a Google Calendar.

    python tools/build-calendar-list.py --add <url> [--name NAME] [--file NAME.ics]
        Register a remote calendar, download it, and add it to the manifest.

Each calendar carries a colour, used on the agenda to show which calendar an
event came from. A colour set by hand in calendars.json is kept; new calendars
take the next unused colour from the palette below.
"""
import argparse
import io
import json
import os
import re
import sys

try:                                  # stdlib only - no install needed
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError
except ImportError:                   # Python 2
    from urllib2 import Request, urlopen, URLError, HTTPError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAL_DIR = os.path.join(ROOT, 'assets', 'calendar')
MANIFEST = os.path.join(CAL_DIR, 'calendars.json')

# Distinct against the page's white cards, and legible as text and as a rule.
# Club yellow is deliberately absent - too pale to read at this size.
PALETTE = [
    '#12684D',   # club green
    '#B4531A',   # burnt orange
    '#2A5DA8',   # blue
    '#7A3E9D',   # purple
    '#A8123F',   # crimson
    '#4B6157',   # slate
    '#0E7490',   # teal
    '#854D0E',   # bronze
    '#9D174D',   # deep pink
    '#3F6212',   # olive
    '#1E3A8A',   # navy
    '#7C2D12',   # rust
]


def unfold(text):
    """RFC 5545: a newline followed by one space or tab continues the line."""
    return re.sub(r'\n[ \t]', '', text.replace('\r\n', '\n').replace('\r', '\n'))


def calendar_name(text, fallback=None):
    """The X-WR-CALNAME the file declares, or the fallback."""
    m = re.search(r'^X-WR-CALNAME:(.*)$', unfold(text), re.I | re.M)
    if not m:
        return fallback
    return m.group(1).strip().replace('\\,', ',').replace('\\;', ';')


def read(path):
    try:
        return io.open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return ''


def write_atomic(path, text):
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)
    os.replace(tmp, path)


def slug(text):
    s = re.sub(r'[^a-z0-9]+', '-', (text or '').lower()).strip('-')
    return s or 'calendar'


def download(url):
    """Fetch a remote .ics. Returns its text, or raises."""
    request = Request(url, headers={'User-Agent': 'ncan-calendar-sync/1.0'})
    body = urlopen(request, timeout=30).read()
    text = body.decode('utf-8', 'replace')
    if 'BEGIN:VCALENDAR' not in text:
        raise ValueError('the response is not an iCalendar file')
    return text


def load_manifest():
    """Existing entries by filename, so hand-set values survive a rescan."""
    if not os.path.exists(MANIFEST):
        return {}
    try:
        data = json.loads(read(MANIFEST))
    except ValueError:
        print('   ! %s is not valid JSON - starting a fresh one' % os.path.basename(MANIFEST))
        return {}
    return dict((c['file'], c) for c in data.get('calendars', []) if c.get('file'))


def fetch_remotes(known):
    """Re-download every entry that has a source url. Returns a failure count."""
    remotes = [c for c in known.values() if c.get('url')]
    if not remotes:
        print('no remote calendars registered - nothing to fetch')
        return 0

    failed = 0
    for entry in sorted(remotes, key=lambda c: c['file']):
        path = os.path.join(CAL_DIR, entry['file'])
        try:
            text = download(entry['url'])
        except (URLError, HTTPError, ValueError) as err:
            failed += 1
            # the existing mirror is left alone, so the site keeps working
            print('   ! %-24s %s' % (entry['file'], err))
            continue
        before = read(path)
        write_atomic(path, text)
        events = text.count('BEGIN:VEVENT')
        print('   %-24s %d event(s)%s' % (entry['file'], events,
                                          '' if before != text else ' (unchanged)'))
    return failed


def add_remote(url, name=None, filename=None):
    """Download a remote calendar and register it."""
    try:
        text = download(url)
    except (URLError, HTTPError, ValueError) as err:
        print('could not fetch %s: %s' % (url, err))
        return None

    title = name or calendar_name(text) or url
    filename = filename or (slug(title) + '.ics')
    if not filename.lower().endswith('.ics'):
        filename += '.ics'

    write_atomic(os.path.join(CAL_DIR, filename), text)
    print('downloaded %s -> %s (%d event(s))'
          % (title, filename, text.count('BEGIN:VEVENT')))
    return {'file': filename, 'name': title, 'url': url}


def rebuild(known):
    files = sorted(f for f in os.listdir(CAL_DIR) if f.lower().endswith('.ics'))
    if not files:
        print('no .ics files in %s' % os.path.relpath(CAL_DIR, ROOT))

    # Colours still claimed by a calendar that is present. A colour recorded
    # against a file that has since gone is released back to the palette.
    taken = set(known[f].get('colour') for f in files
                if f in known and known[f].get('colour'))
    used = set()
    reassigned = []

    entries = []
    for f in files:
        prior = known.get(f, {})
        colour = prior.get('colour')
        # a kept colour is only kept while it is still unique: an earlier
        # palette was shorter than the number of calendars and wrapped, and
        # without this the clash it caused would be preserved for ever
        if colour and colour in used:
            reassigned.append((f, colour))
            colour = None
        if not colour:
            spare = [c for c in PALETTE if c not in taken and c not in used]
            if not spare:
                spare = [c for c in PALETTE if c not in used]
            colour = spare[0] if spare else PALETTE[len(entries) % len(PALETTE)]
            taken.add(colour)
        used.add(colour)
        entry = {
            'file': f,
            'name': calendar_name(read(os.path.join(CAL_DIR, f)), prior.get('name') or f),
            'colour': colour,
        }
        if prior.get('url'):
            entry['url'] = prior['url']
        entries.append(entry)

    # The subscribe list on the page renders in manifest order, so order the
    # manifest by the name a reader actually sees rather than by filename -
    # otherwise the list sorts on prefixes like "athletics-canterbury-".
    # This must happen before the file is written, not after.
    entries.sort(key=lambda e: (e['name'] or e['file']).lower())

    write_atomic(MANIFEST, json.dumps({'calendars': entries}, indent=2,
                                      ensure_ascii=False) + '\n')

    for f, clash in reassigned:
        print('   ~ %s had %s, already used by another calendar - reassigned' % (f, clash))

    colours = [e['colour'] for e in entries]
    if len(set(colours)) != len(colours):
        print('   ! some calendars still share a colour - the palette is too short')

    print('wrote %s with %d calendar(s):' % (os.path.relpath(MANIFEST, ROOT), len(entries)))
    for e in entries:
        print('   %-30s %-8s %-34s %s'
              % (e['file'], e['colour'], e['name'][:34], 'remote' if e.get('url') else 'local'))
    return 0


def main():
    ap = argparse.ArgumentParser(description='Maintain the calendar manifest.')
    ap.add_argument('--fetch', action='store_true',
                    help='re-download every registered remote calendar')
    ap.add_argument('--add', metavar='URL',
                    help='register a remote .ics, download it, and add it')
    ap.add_argument('--name', help='name for --add (default: the calendar says)')
    ap.add_argument('--file', help='local filename for --add (default: from the name)')
    args = ap.parse_args()

    if not os.path.isdir(CAL_DIR):
        print('no calendar directory at %s' % CAL_DIR)
        return 1

    known = load_manifest()

    if args.add:
        entry = add_remote(args.add, args.name, args.file)
        if not entry:
            return 1
        prior = known.get(entry['file'], {})
        prior.update(entry)
        known[entry['file']] = prior

    if args.fetch:
        print('fetching remote calendars:')
        if fetch_remotes(known):
            rebuild(known)
            print('one or more calendars could not be fetched - '
                  'the existing copies were left in place')
            return 1

    return rebuild(known)


if __name__ == '__main__':
    sys.exit(main())
