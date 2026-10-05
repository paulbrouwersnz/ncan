#!/usr/bin/env python3
"""
verify-records.py

Checks records in assets/data/records.json against the official Canterbury
Children's Athletics results, and only then writes the "source" link.

The CCAA results index

    https://www.sporty.co.nz/cantychildrensathletics/Results-1/tab1

lists a PDF of results for every meeting back to October 2018. This finds the
file for a record's date, reads it, and looks for the athlete's surname with
the recorded mark on the same line. A record is only linked when both are
found - so a link on the page means somebody (or this) actually saw the mark
in the official results, not merely that a meeting happened that day.

Each record ends up in one of these states, written to "verified":

    "found"      the surname and the mark appear together - linked
    "mark-differs"  the athlete is in the results, but with another mark.
                    Worth a human look: usually a typo in the record book.
                    NOT linked.
    "namesake-only" somebody of that surname is in the results, but not this
                    athlete - a sibling, almost always. This says nothing
                    about the record, so it is not a discrepancy. NOT linked.
    "no-athlete" the results were read, but the surname is not in them.
                 NOT linked.
    "supplied"   no CCAA file, but assets/data/record-sources.json gives a
                 whole-meeting results page for that date, so the record is
                 linked to it. The mark has NOT been checked against it - the
                 link says "the results are here", nothing more.

    A "by-record" entry in that same file beats both: it points at the page
    for that one event, and when it is marked "checked" the record counts as
    verified, because somebody read the athlete and the mark off that page.
    "no-results" no CCAA file for that date (another meet, or before 2018).
    "unreadable" the results file is a scan with no text in it, so nothing
                 could be checked. NOT linked, and not evidence of anything.

Matching notes
    Names: records hold "J. Forrester", the results hold "Jack Forrester",
    so only the surname is compared. Eleven surnames in the record book
    belong to more than one athlete - Alexander and Miriama Jonathan, three
    Musesengwas - so when the mark is not found, the initial is used to tell
    whether the person in the results is even the right one.
    Marks: 3.3 and "3.30m" are the same jump, and 2.40.05, 2:40.05 and
    "2:40.05" are the same time, so marks are parsed to a number of seconds
    or metres rather than compared as text. Wind readings are ignored.

Usage:
    python tools/verify-records.py --report
        Download, read and report. Writes nothing to records.json.

    python tools/verify-records.py --apply
        As above, then write "verified" and the source links.

Options:
    --cache DIR    where to keep downloaded PDFs (default: a temp folder)
    --limit N      only look at the first N datable records (for a quick try)
    --refetch      ignore cached PDFs and download again
"""

import argparse
import collections
import io
import json
import os
import re
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDS = os.path.join(ROOT, 'assets', 'data', 'records.json')
# Meetings the CCAA index does not carry, with a results page supplied by
# hand. See the note inside the file.
SUPPLIED = os.path.join(ROOT, 'assets', 'data', 'record-sources.json')
INDEX_URL = 'https://www.sporty.co.nz/cantychildrensathletics/Results-1/tab1'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ncan-site-tools/1.0'

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit('verify-records.py needs pypdf:  python -m pip install pypdf')

MONTHS = {'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5,
          'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10,
          'november': 11, 'december': 12}

ROW_RE = re.compile(r'<tr\b.*?</tr>', re.S | re.I)
LINK_RE = re.compile(
    r'<a\b[^>]*href="([^"]*downloadasset[^"]*)"[^>]*>(.*?)</a>', re.S | re.I)
DATE_RE = re.compile(
    r'(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?\s*([A-Za-z]+)\s+(\d{4})')
TAG_RE = re.compile(r'<[^>]+>')
SUMMARY_RE = re.compile(r'points|teams', re.I)
WIND_RE = re.compile(r'\s*\([^)]*\)')
# Surnames are not unique across clubs - a "V McDonald" of another club was
# matching our "M McDonald" - so a line only counts when it also names us.
CLUB_RE = re.compile(r'north\s*cant|ncan|nth\s*cant', re.I)
NUM_RE = re.compile(r'\d+(?:[:.]\d+)*')


def say(text):
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


def clean(html):
    text = TAG_RE.sub(' ', html)
    for a, b in (('&nbsp;', ' '), ('&amp;', '&'), ('&#39;', "'"),
                 ('&quot;', '"')):
        text = text.replace(a, b)
    return re.sub(r'\s+', ' ', text).strip()


def get(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_index(html):
    out = []
    for row in ROW_RE.findall(html):
        links = LINK_RE.findall(row)
        if not links:
            continue
        cells = re.findall(r'<t[dh]\b.*?</t[dh]>', row, re.S | re.I)
        head = clean(cells[0]) if cells else clean(row)
        m = DATE_RE.search(head)
        if not m:
            continue
        month = MONTHS.get(m.group(3).lower())
        if not month:
            continue
        first = int(m.group(1))
        last = int(m.group(2)) if m.group(2) and int(m.group(2)) >= first else first
        dates = ['%s-%02d-%02d' % (m.group(4), month, d)
                 for d in range(first, last + 1)]
        for href, label in links:
            out.append({'dates': dates, 'label': clean(label),
                        'href': href.replace('&amp;', '&')})
    return out


def as_number(token):
    """'8.72' -> 8.72, '1:06.65' -> 66.65, '2.40.05' -> 160.05 seconds.

    A mark written 2.40.05 is a time with a full stop where a colon belongs,
    which is common in the record book. Two separators means minutes.
    """
    token = token.strip().rstrip('.')
    if not token:
        return None
    parts = re.split(r'[:.]', token)
    try:
        if len(parts) >= 3:                       # m . s . hundredths
            return int(parts[0]) * 60 + int(parts[1]) + float('0.' + parts[2])
        if ':' in token and len(parts) == 2:      # m : s
            return int(parts[0]) * 60 + float(parts[1])
        return float(token)
    except (ValueError, IndexError):
        return None


def record_value(performance):
    """The number a record claims, ignoring wind and a trailing m."""
    text = WIND_RE.sub('', performance or '').strip()
    text = text.replace('?', '').strip()
    text = re.sub(r'\s*m$', '', text, flags=re.I)
    return as_number(text)


def normalise(word):
    """Fold the spelling differences that are not different people.

    The record book writes "M McDonald" where the results write
    "Molly Macdonald", so Mac- and Mc- are folded together, as are
    apostrophes and hyphens ("Ma'u", "Brandts-Giesen").
    """
    word = re.sub(r"[^a-z]", '', (word or '').lower())
    return re.sub(r'^mac', 'mc', word)


def surname(name):
    parts = re.sub(r'[.]', ' ', name or '').split()
    if not parts:
        return ''
    # "Siniva Ma'u" and "M MacDonald" both end in the surname
    return normalise(parts[-1])


def line_numbers(line):
    out = []
    for token in NUM_RE.findall(line):
        value = as_number(token)
        if value is not None:
            out.append((token, value))
    return out


def first_name_agrees(lines, record):
    """Could the person on these lines actually be the record holder?

    The record carries an initial ("A Jonathan"); the results carry the full
    name ("Miriama Jonathan"). Where no line shows a first name fitting the
    initial, the surname belongs to somebody else - usually a sibling at the
    same club, which the club filter cannot catch.

    Returns True when it cannot tell, so an uncertain case is reported as a
    mark discrepancy rather than quietly dismissed as the wrong person.
    """
    for athlete in record.get('athletes') or []:
        parts = re.sub(r'[.]', ' ', athlete).split()
        if len(parts) < 2:
            return True                  # a team name, or a bare surname
        given = parts[0]
        sur = surname(athlete)
        for line in lines:
            words = [w for w in re.findall(r"[A-Za-z'\-]+", line) if len(w) > 1]
            # Capitalised words only, and not SHOUTED ones: those are club
            # codes like NCAN, which would otherwise match an initial N.
            others = [w for w in words
                      if normalise(w) != sur and w[:1].isupper() and not w.isupper()]
            if len(given) <= 2:
                if any(w[:1].upper() == given[:1].upper() for w in others):
                    return True
            elif any(normalise(w) == normalise(given) for w in others):
                return True
    return False


def check(text, record):
    """Look for the athlete and the mark in one results file."""
    want = record_value(record['performance'])
    names = [surname(a) for a in record.get('athletes') or [] if surname(a)]
    if not names:
        return ('no-athlete', None)

    wanted = set(names)
    hits = []
    for raw in text.splitlines():
        line = raw.strip()
        # compare word by word, so "Macdonald" can fold onto "McDonald";
        # a substring test would also match the wrong people
        words = set(normalise(w) for w in re.findall(r"[A-Za-z'\-]+", line))
        if not (wanted & words):
            continue
        if not CLUB_RE.search(line):
            continue                      # same surname, another club
        hits.append(line)
        if want is None:
            continue
        for token, value in line_numbers(line):
            if abs(value - want) < 0.006:
                return ('found', line[:140])

    # the club relay team is named rather than the four athletes
    if 'relay' in record['event'].lower() and want is not None:
        for raw in text.splitlines():
            low = raw.lower()
            if 'north canterbury' not in low and 'ncan' not in low:
                continue
            for token, value in line_numbers(raw):
                if abs(value - want) < 0.006:
                    return ('found', raw.strip()[:140])

    if hits:
        if not first_name_agrees(hits, record):
            return ('namesake-only', hits[0][:140])
        return ('mark-differs', hits[0][:140])
    return ('no-athlete', None)


def main():
    ap = argparse.ArgumentParser(
        description='Verify records against the official CCAA results.')
    ap.add_argument('--apply', action='store_true',
                    help='write verified sources into records.json')
    ap.add_argument('--report', action='store_true', help='report only')
    ap.add_argument('--cache', help='folder for downloaded PDFs')
    ap.add_argument('--limit', type=int, help='stop after N records')
    ap.add_argument('--refetch', action='store_true',
                    help='download even when a cached copy exists')
    args = ap.parse_args()
    if not args.apply:
        args.report = True

    cache = args.cache or os.path.join(tempfile.gettempdir(), 'ccaa-results')
    if not os.path.isdir(cache):
        os.makedirs(cache)

    say('reading the CCAA results index')
    index = parse_index(get(INDEX_URL).decode('utf-8', 'replace'))
    by_date = collections.defaultdict(list)
    for entry in index:
        for d in entry['dates']:
            by_date[d].append(entry)
    low, high = min(by_date), max(by_date)
    say('   %d file(s) over %d date(s), %s to %s'
        % (len(index), len(by_date), low, high))

    data = json.load(io.open(RECORDS, encoding='utf-8'))
    records = data['records']

    todo = [r for r in records if (r.get('date') or '') in by_date]
    if args.limit:
        todo = todo[:args.limit]
    say('%d of %d record(s) fall on a date with results\n' % (len(todo), len(records)))

    texts = {}

    def results_for(date):
        if date in texts:
            return texts[date]
        entries = [e for e in by_date[date] if not SUMMARY_RE.search(e['label'])]
        entries = entries or by_date[date]
        blob = ''
        for entry in entries:
            name = re.sub(r'[^0-9a-f]', '', entry['href'].split('id=')[-1])[:32]
            path = os.path.join(cache, '%s-%s.pdf' % (date, name))
            if args.refetch or not os.path.exists(path) or os.path.getsize(path) == 0:
                try:
                    body = get(entry['href'])
                except Exception as exc:
                    say('   ! %s: download failed (%s)' % (date, exc))
                    continue
                with open(path, 'wb') as fh:
                    fh.write(body)
            try:
                reader = PdfReader(path)
                blob += '\n'.join((p.extract_text() or '') for p in reader.pages)
            except Exception as exc:
                say('   ! %s: could not read the PDF (%s)' % (date, exc))
        texts[date] = (blob, entries[0]['href'] if entries else None)
        return texts[date]

    counts = collections.Counter()
    differs = []

    for i, r in enumerate(todo, 1):
        text, href = results_for(r['date'])
        if not text.strip():
            # a scanned PDF extracts to nothing; saying "athlete not found"
            # there would be a claim the file cannot support
            r['verified'] = 'unreadable'
            counts['unreadable'] += 1
            continue
        state, evidence = check(text, r)
        r['verified'] = state
        counts[state] += 1
        if state == 'found':
            r['source'] = href
        elif state == 'mark-differs':
            differs.append((r, evidence))
        if i % 10 == 0:
            say('   ... %d/%d' % (i, len(todo)))

    # Hand-supplied pages, for meetings the PDFs do not cover.
    supplied, per_record = {}, {}
    if os.path.exists(SUPPLIED):
        try:
            extra = json.load(io.open(SUPPLIED, encoding='utf-8'))
            supplied = extra.get('by-date', {})
            for entry in extra.get('by-record', []):
                key = (entry.get('date'), entry.get('grade'),
                       entry.get('gender'), entry.get('event'))
                per_record[key] = entry
        except ValueError:
            say('   ! %s is not valid JSON - ignoring it'
                % os.path.relpath(SUPPLIED, ROOT))

    # A link to the exact event beats a link to the whole meeting, so these
    # are applied first and may replace a meeting-level PDF link.
    for r in records:
        entry = per_record.get((r.get('date'), r.get('grade'),
                                r.get('gender'), r.get('event')))
        if not entry or not entry.get('url'):
            continue
        r['source'] = entry['url']
        r['verified'] = 'found' if entry.get('checked') else 'supplied'
        counts['per-event'] += 1

    for r in records:
        if r.get('verified') in ('found', 'supplied'):
            continue
        entry = supplied.get(r.get('date') or '')
        if entry and entry.get('url'):
            r['source'] = entry['url']
            r['verified'] = 'supplied'
            counts['supplied'] += 1

    for r in records:
        if 'verified' not in r:
            r['verified'] = 'no-results'

    # counted off the records, not the running tally - the hand-supplied
    # links are applied after the PDF pass, so a tally taken during it is
    # already out of date by the time this prints
    final = collections.Counter(r.get('verified') for r in records)
    say('\nresults:')
    for state in ('found', 'supplied', 'mark-differs', 'namesake-only',
                  'no-athlete', 'unreadable', 'no-results'):
        say('   %-13s %d' % (state, final[state]))
    direct = sum(1 for r in records
                 if '/events/individual/' in (r.get('source') or ''))
    say('   (%d of the %d found were read off a per-event results page)'
        % (direct, final['found']))

    blind = sorted(set(r['date'] for r in todo
                       if r.get('verified') == 'unreadable'))
    if blind:
        say('\nresults published as a scan, so nothing could be read: %s'
            % ', '.join(blind))

    missing = [r for r in todo if r.get('verified') == 'no-athlete']
    if missing:
        say("\nnot found in that day's results (check the date or the meeting):")
        for r in missing:
            say('   %s grade %-2s %-6s %-16s %-12s %s'
                % (r['date'], r['grade'], r['gender'], r['event'][:16],
                   r['performance'], (r['venue'] or '')[:34]))

    others = [r for r in records if r.get('verified') == 'namesake-only']
    if others:
        say('\nonly a namesake in the results - says nothing about the record:')
        for r in others:
            say('   %s grade %-2s %-6s %-16s %-12s (record: %s)'
                % (r['date'], r['grade'], r['gender'], r['event'][:16],
                   r['performance'], ', '.join(r['athletes'])))

    if differs:
        say('\nathlete is in the results, but with a different mark:')
        for r, evidence in differs:
            say('   grade %-2s %-6s %-16s record says %-12s'
                % (r['grade'], r['gender'], r['event'][:16], r['performance']))
            say('      results line: %s' % (evidence or ''))

    if args.report:
        say('\nreport only - nothing written.')
        return 0

    tmp = RECORDS + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    os.replace(tmp, RECORDS)
    linked = sum(1 for r in records if r.get('source'))
    direct = sum(1 for r in records
                 if '/events/individual/' in (r.get('source') or ''))
    say('\nwrote %s - %d record(s) linked, %d of them straight to the event'
        % (os.path.relpath(RECORDS, ROOT), linked, direct))
    return 0


if __name__ == '__main__':
    sys.exit(main())
