#!/usr/bin/env python3
"""
import-records.py

One-off importer: turns the club's "NCAN Records.xlsx" into
assets/data/records.json, which is what records.html reads.

After the first run the JSON is the source of truth - edit that by hand, not
the spreadsheet. This script exists so the original did not have to be
retyped, and so it can be re-run if the spreadsheet is ever the newer copy.

    python tools/import-records.py "C:/path/NCAN Records.xlsx"
    python tools/import-records.py <file> --out assets/data/records.json

By default it refuses to overwrite an existing records.json, because that
file is hand-edited afterwards and the spreadsheet will have fallen behind.
Pass --force to overwrite anyway.

HOW THE SHEET IS LAID OUT
    Girls occupy columns A-F and boys columns H-M, side by side, in blocks
    headed "Grade 7" ... "Grade 14". Each row is
    Event | Name | Performance | Date | Venue/Event.

    Two kinds of row carry no event of their own:
      * a relay member - a name with no performance, belonging to the relay
        above it;
      * an equal record - a name WITH a performance, tying the event above.
    They are told apart by whether a performance is present.

The importer does not tidy the data. Performances, venue spellings and
athlete names go across as written, so that what is published matches what
the club recorded. It reports anything that looks inconsistent instead, and
those are worth a human eye - see --report.
"""

import argparse
import datetime
import io
import json
import os
import re
import sys

try:
    import openpyxl
except ImportError:
    sys.exit('import-records.py needs openpyxl:  python -m pip install openpyxl')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, 'assets', 'data', 'records.json')

GIRLS_COLS = (1, 2, 3, 4, 5, 6)      # grade, event, name, perf, date, venue
BOYS_COLS = (8, 9, 10, 11, 12, 13)

GRADE_RE = re.compile(r'^\s*Grade\s+(\d+)\s*$', re.I)


def cell(ws, row, col):
    v = ws.cell(row, col).value
    if v is None:
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v
    return str(v).strip()


def iso_date(value, issues, where):
    """The sheet mixes real dates with text like 18/01/2025 (day first)."""
    if value == '':
        return None
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()

    text = str(value).strip()
    for fmt in ('%d/%m/%Y', '%d/%m/%y', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    issues.append('%s: could not read the date %r - left as written' % (where, text))
    return text


def is_relay(event):
    return 'relay' in event.lower()


def read_side(ws, cols, gender, issues):
    """Walk one half of the sheet, top to bottom."""
    grade_col, event_col, name_col, perf_col, date_col, venue_col = cols
    records = []
    grade = None
    current = None          # the record a continuation row belongs to

    for row in range(1, ws.max_row + 1):
        grade_cell = str(cell(ws, row, grade_col) or '')
        match = GRADE_RE.match(grade_cell)
        if match:
            grade = int(match.group(1))
            current = None
            continue

        event = str(cell(ws, row, event_col) or '')
        name = str(cell(ws, row, name_col) or '')
        perf = cell(ws, row, perf_col)
        perf = '' if perf == '' else str(perf).strip()
        date_raw = cell(ws, row, date_col)
        venue = str(cell(ws, row, venue_col) or '')

        if event.lower() in ('event', ''):
            if event.lower() == 'event':
                continue
        if grade is None or not (event or name or perf):
            continue

        where = '%s grade %s row %d' % (gender, grade, row)

        if event:
            if not (name or perf):
                # an event listed with nothing against it - no record yet
                issues.append('%s: "%s" has no record' % (where, event))
                current = None
                continue
            current = {
                'grade': grade,
                'gender': gender,
                'event': event,
                'athletes': [name] if name else [],
                'performance': perf,
                'date': iso_date(date_raw, issues, where),
                'venue': venue,
                'source': None,
            }
            records.append(current)
            continue

        # no event on this row: either a relay member or an equal record
        if not name:
            continue

        if perf:
            # a tie - same event as the record above, different athlete
            if current is None:
                issues.append('%s: "%s" has no event above it - skipped'
                              % (where, name))
                continue
            records.append({
                'grade': grade,
                'gender': gender,
                'event': current['event'],
                'athletes': [name],
                'performance': perf,
                'date': iso_date(date_raw, issues, where),
                'venue': venue,
                'source': None,
            })
            continue

        if current is None:
            issues.append('%s: stray name "%s" - skipped' % (where, name))
            continue
        if not is_relay(current['event']):
            issues.append('%s: extra name "%s" under "%s", which is not a relay'
                          % (where, name, current['event']))
        current['athletes'].append(name)

    return records


def close_pairs(values, limit=2):
    """Pairs of strings within `limit` edits - catches typos, not just case."""
    def distance(a, b):
        if abs(len(a) - len(b)) > limit:
            return limit + 1
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            cur = [i]
            for j, cb in enumerate(b, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                               prev[j - 1] + (ca != cb)))
            prev = cur
        return prev[-1]

    out = []
    ordered = sorted(values)
    for i, a in enumerate(ordered):
        for b in ordered[i + 1:]:
            d = distance(a.lower(), b.lower())
            if 0 < d <= limit:
                out.append((a, b, d))
    return out


def audit(records, issues):
    """Flag things a human should look at. Nothing is changed."""
    # performances that do not look like a time or a distance
    ok = re.compile(r'^\d{1,2}[:.]\d{2}([:.]\d{1,2})?$|^\d+(\.\d+)?m?$')
    for r in records:
        p = r['performance']
        bare = re.sub(r'\s*\([^)]*\)\s*', '', p).strip()     # drop wind readings
        if p and not ok.match(bare):
            issues.append('odd performance %r for %s %s grade %d'
                          % (p, r['gender'], r['event'], r['grade']))

    # near-identical athlete names, which are usually one person spelled twice
    names = {}
    for r in records:
        for a in r['athletes']:
            key = re.sub(r'[^a-z]', '', a.lower())
            names.setdefault(key, set()).add(a)
    for key, spellings in sorted(names.items()):
        if len(spellings) > 1:
            issues.append('name spelled %d ways: %s'
                          % (len(spellings), ' / '.join(sorted(spellings))))

    # venues differing only by macron or typo
    venues = {}
    for r in records:
        if not r['venue']:
            continue
        key = re.sub(r'[^a-z]', '', r['venue'].lower()
                     .replace('\u0101', 'a'))
        venues.setdefault(key, set()).add(r['venue'])
    for key, spellings in sorted(venues.items()):
        if len(spellings) > 1:
            issues.append('venue spelled %d ways: %s'
                          % (len(spellings), ' / '.join(sorted(spellings))))

    # a normalised key only catches punctuation and case. These catch a typo:
    # MacDonald/McDonald, Puna/Puni - one or two letters apart, almost always
    # the same person or place entered twice.
    all_names = set()
    for r in records:
        all_names.update(r['athletes'])

    def split_name(n):
        """('M', 'macdonald') from 'M MacDonald'. Siblings share a surname
        and differ in the initial, so comparing the two parts separately
        keeps 'A Reavill' and 'C Reavill' apart while still catching
        'M MacDonald' and 'M McDonald'."""
        parts = re.sub(r'[.]', '', n).split()
        if len(parts) < 2:
            return ('', re.sub(r'[^a-z]', '', n.lower()))
        return (parts[0][:1].lower(),
                re.sub(r'[^a-z]', '', ' '.join(parts[1:]).lower()))

    by_initial = {}
    for n in all_names:
        initial, surname = split_name(n)
        by_initial.setdefault(initial, {}).setdefault(surname, set()).add(n)

    for initial, surnames in sorted(by_initial.items()):
        for a, b, d in close_pairs(list(surnames)):
            spellings = sorted(surnames[a] | surnames[b])
            issues.append('same initial, surname %d letter(s) apart: %s'
                          % (d, ' vs '.join(repr(x) for x in spellings)))
        for surname, spellings in sorted(surnames.items()):
            if len(spellings) > 1:
                issues.append('one athlete written %d ways: %s'
                              % (len(spellings), ' / '.join(sorted(spellings))))

    all_venues = set(r['venue'] for r in records if r['venue'])
    for a, b, d in close_pairs(all_venues, limit=1):
        issues.append('venues %d letter(s) apart: %r vs %r' % (d, a, b))


def main():
    ap = argparse.ArgumentParser(description='Import NCAN Records.xlsx to JSON.')
    ap.add_argument('workbook', help='path to NCAN Records.xlsx')
    ap.add_argument('--out', default=DEFAULT_OUT, help='where to write the JSON')
    ap.add_argument('--force', action='store_true',
                    help='overwrite an existing records.json')
    ap.add_argument('--report', action='store_true',
                    help='only report what would be imported, write nothing')
    args = ap.parse_args()

    if os.path.exists(args.out) and not args.force and not args.report:
        print('%s already exists. It is hand-edited after the first import, so\n'
              'this would throw away those edits. Pass --force if you mean it.'
              % os.path.relpath(args.out, ROOT), file=sys.stderr)
        return 1

    wb = openpyxl.load_workbook(args.workbook, data_only=True)
    ws = wb.active

    issues = []
    records = (read_side(ws, GIRLS_COLS, 'girls', issues)
               + read_side(ws, BOYS_COLS, 'boys', issues))
    audit(records, issues)

    records.sort(key=lambda r: (r['grade'], r['gender'], r['event'],
                                r['performance']))

    grades = sorted(set(r['grade'] for r in records))
    data = {
        'updated': datetime.date.today().isoformat(),
        'source': os.path.basename(args.workbook),
        'note': ('Club records for the children\u2019s grades. Edit this file '
                 'directly; add a results URL to a record\u2019s "source" to '
                 'link it for verification.'),
        'grades': grades,
        'records': records,
    }

    print('%d record(s) across grades %s'
          % (len(records), '-'.join(str(g) for g in (grades[:1] + grades[-1:]))))
    for gender in ('girls', 'boys'):
        n = sum(1 for r in records if r['gender'] == gender)
        print('   %-6s %3d' % (gender, n))
    relays = sum(1 for r in records if len(r['athletes']) > 1)
    print('   relays with a named team: %d' % relays)

    if issues:
        print('\n%d thing(s) worth a look:' % len(issues))
        for note in issues:
            print('   - %s' % note.encode('ascii', 'replace').decode('ascii'))

    if args.report:
        print('\nreport only - nothing written.')
        return 0

    out_dir = os.path.dirname(args.out)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    tmp = args.out + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    os.replace(tmp, args.out)
    print('\nwrote %s' % os.path.relpath(args.out, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
