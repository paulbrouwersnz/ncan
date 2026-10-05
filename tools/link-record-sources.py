#!/usr/bin/env python3
"""
link-record-sources.py

Fills in the "source" link on records in assets/data/records.json, using the
Canterbury Children's Athletics results index:

    https://www.sporty.co.nz/cantychildrensathletics/Results-1/tab1

That page lists every CCAA meeting back to October 2018, each with a date and
a link to the results file. A record is matched to a meeting BY DATE.

    ---------------------------------------------------------------
    WHAT THIS DOES AND DOES NOT PROVE

    Matching on date links a record to the meeting it was set at. It
    does NOT confirm the mark: nobody has opened the file and found
    the athlete's name against that time or distance.

    So a link added here means "the results for that day are here,
    go and check" - which is what the page promises the reader. It
    is not a substitute for someone verifying the performance.
    ---------------------------------------------------------------

Records before October 2018 cannot be matched: the index does not go back
that far. Records set at meetings CCAA does not run - Colgate Games outside
Canterbury, inter-provincial meets, club nights at Rawhiti Domain - will not
match either, even when the date is inside the span.

Usage:
    python tools/link-record-sources.py --report
        Show what would be matched, and what would not. Writes nothing.

    python tools/link-record-sources.py --apply
        Write the matched links into records.json. Existing sources are
        kept unless --overwrite is given.

Options:
    --overwrite   replace a source that is already set
    --cache FILE  read the index from a saved HTML file instead of the web
"""

import argparse
import collections
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDS = os.path.join(ROOT, 'assets', 'data', 'records.json')
INDEX_URL = 'https://www.sporty.co.nz/cantychildrensathletics/Results-1/tab1'
UA = 'Mozilla/5.0 (compatible; ncan-site-tools/1.0)'

MONTHS = {'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5,
          'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10,
          'november': 11, 'december': 12}

ROW_RE = re.compile(r'<tr\b.*?</tr>', re.S | re.I)
LINK_RE = re.compile(
    r'<a\b[^>]*href="([^"]*downloadasset[^"]*)"[^>]*>(.*?)</a>', re.S | re.I)
DATE_RE = re.compile(
    r'(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?\s*([A-Za-z]+)\s+(\d{4})')
TAG_RE = re.compile(r'<[^>]+>')
# a championship day also lists points tables; the results file is the one
# that is not a points or teams summary
SUMMARY_RE = re.compile(r'points|teams', re.I)


def say(text):
    """Print safely on a Windows console that cannot encode macrons."""
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


def clean(html):
    text = TAG_RE.sub(' ', html)
    text = (text.replace('&nbsp;', ' ').replace('&amp;', '&')
                .replace('&#39;', "'").replace('&quot;', '"'))
    return re.sub(r'\s+', ' ', text).strip()


def fetch_index(cache=None):
    if cache:
        return io.open(cache, encoding='utf-8', errors='replace').read()
    req = urllib.request.Request(INDEX_URL, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode('utf-8', 'replace')


def parse_index(html):
    """[{dates: [iso], label, href}] - one entry per results file."""
    out = []
    for row in ROW_RE.findall(html):
        links = LINK_RE.findall(row)
        if not links:
            continue
        # the date lives in the row's first cell
        cells = re.findall(r'<t[dh]\b.*?</t[dh]>', row, re.S | re.I)
        head = clean(cells[0]) if cells else clean(row)
        m = DATE_RE.search(head)
        if not m:
            continue
        month = MONTHS.get(m.group(3).lower())
        if not month:
            continue
        first = int(m.group(1))
        last = int(m.group(2)) if m.group(2) else first
        if last < first:
            last = first
        dates = ['%s-%02d-%02d' % (m.group(4), month, day)
                 for day in range(first, last + 1)]
        for href, label in links:
            out.append({'dates': dates, 'label': clean(label),
                        'href': href.replace('&amp;', '&')})
    return out


def best_for(entries):
    """The results file for a date, preferring it over a points summary."""
    main = [e for e in entries if not SUMMARY_RE.search(e['label'])]
    return (main or entries)[0]


def main():
    ap = argparse.ArgumentParser(
        description='Link records to CCAA results files by date.')
    ap.add_argument('--apply', action='store_true', help='write the links')
    ap.add_argument('--report', action='store_true', help='report only')
    ap.add_argument('--overwrite', action='store_true',
                    help='replace a source that is already set')
    ap.add_argument('--cache', help='parse a saved copy of the index page')
    args = ap.parse_args()

    if not args.apply and not args.report:
        args.report = True

    index = parse_index(fetch_index(args.cache))
    if not index:
        print('no results links found on the index page', file=sys.stderr)
        return 1

    by_date = collections.defaultdict(list)
    for entry in index:
        for d in entry['dates']:
            by_date[d].append(entry)

    low, high = min(by_date), max(by_date)
    print('CCAA index: %d file(s) over %d date(s), %s to %s'
          % (len(index), len(by_date), low, high))

    data = json.load(io.open(RECORDS, encoding='utf-8'))
    records = data['records']

    matched, already, outside, unmatched = [], [], [], []
    for r in records:
        date = r.get('date') or ''
        if r.get('source') and not args.overwrite:
            already.append(r)
        elif date in by_date:
            matched.append(r)
        elif not date or date < low or date > high:
            outside.append(r)
        else:
            unmatched.append(r)

    print('records: %d' % len(records))
    print('   matched to a results file : %d' % len(matched))
    print('   already had a source      : %d' % len(already))
    print('   dated outside the index   : %d' % len(outside))
    print('   inside the span, no match : %d' % len(unmatched))

    if unmatched:
        print('\nno CCAA file for these dates (another meet, or a date to check):')
        seen = collections.Counter()
        for r in unmatched:
            seen[(r['date'], r['venue'][:44])] += 1
        for (d, v), n in sorted(seen.items()):
            say('   %s  x%-2d %s' % (d, n, v))

    if args.report:
        print('\nreport only - nothing written. Re-run with --apply to save.')
        return 0

    for r in matched:
        r['source'] = best_for(by_date[r['date']])['href']

    tmp = RECORDS + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    os.replace(tmp, RECORDS)
    have = sum(1 for r in records if r.get('source'))
    print('\nwrote %s - %d of %d record(s) now carry a source link'
          % (os.path.relpath(RECORDS, ROOT), have, len(records)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
