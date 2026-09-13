# -*- coding: utf-8 -*-
"""Generate the club training calendar as an .ics, from the weekly schedule.

The schedule below mirrors the "When we train" table in index.html. Only the
regular weekly sessions are generated. Saturday interclub is deliberately left
out: those are fixtures on specific dates, not a weekly commitment, and they
already reach the site through the Athletics Canterbury calendar.

    python tools/build-training-calendar.py                 # current season
    python tools/build-training-calendar.py --season 2027   # 2027/28
    python tools/build-training-calendar.py --list          # show the dates

A season runs April to March, winter first then summer, so "2026" means the
2026/27 season: winter Apr-Sep 2026, summer Oct 2026 - Mar 2027. After
generating, refresh the manifest:

    python tools/build-calendar-list.py
"""
import argparse
import datetime
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAL_DIR = os.path.join(ROOT, 'assets', 'calendar')

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

# (weekday, start, end, summary, location, description, season)
#   season: 'summer' Oct-Mar, 'winter' Apr-Sep, 'all' the whole year
SESSIONS = [
    {
        'slug': 'sprints-running-race-walking',
        'name': 'Sprints, running and race walking coaching',
        'day': MON, 'start': '16:30', 'end': '17:30', 'season': 'summer',
        'location': 'Ashgrove Park, Rangiora',
        'description': 'Suitable for ages 10 through to masters athletes.',
    },
    {
        'slug': 'junior-club-night',
        'name': 'Junior club night (ages 7\u201314)',
        'day': TUE, 'start': '17:15', 'end': '18:30', 'season': 'summer',
        'location': 'Rangiora New Life School field',
        'description': 'Sprints, distance, long jump, high jump, shot put, discus, '
                       'race walking and hurdles, taught as play. Parent helpers '
                       'always welcome.',
    },
    {
        'slug': 'teens-senior-athletics',
        'name': 'Teens and senior athletics training',
        'day': TUE, 'start': '18:15', 'end': '19:15', 'season': 'summer',
        'location': 'Rangiora New Life School field',
        'description': 'Event-group squads with qualified coaches and '
                       'individualised training.',
    },
    {
        'slug': 'cross-country-road-race-walking',
        'name': 'Cross country, road and race walking coaching',
        'day': MON, 'start': '16:30', 'end': '17:30', 'season': 'winter',
        'location': 'Loburn Domain and Ashgrove Park',
        'description': 'Venue alternates through the winter season.',
    },
    {
        'slug': 'race-walks-coaching',
        'name': 'Race walks coaching',
        'day': WED, 'start': '16:30', 'end': '17:30', 'season': 'all',
        'location': 'Ashgrove Park and Pegasus',
        'description': '',
    },
    {
        'slug': 'the-good-trot',
        'name': 'The Good Trot \u2013 adult and teen social intervals',
        'day': THU, 'start': '18:00', 'end': '19:00', 'season': 'all',
        'location': 'Meet at The Good Drop, Rangiora',
        'description': '',
    },
]

# Pacific/Auckland, so calendar apps place these correctly wherever they are
VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Pacific/Auckland
X-LIC-LOCATION:Pacific/Auckland
BEGIN:DAYLIGHT
TZOFFSETFROM:+1200
TZOFFSETTO:+1300
TZNAME:NZDT
DTSTART:19700927T020000
RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+1300
TZOFFSETTO:+1200
TZNAME:NZST
DTSTART:19700405T030000
RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU
END:STANDARD
END:VTIMEZONE"""

BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']


def first_on_or_after(date, weekday):
    """The first given weekday falling on or after date."""
    return date + datetime.timedelta(days=(weekday - date.weekday()) % 7)


def season_span(kind, start_year):
    """(first day, last day) of a season part, for the start_year/+1 season.

    A season runs April to March, winter first:

        winter   1 Apr start_year   - 30 Sep start_year
        summer   1 Oct start_year   - 31 Mar start_year + 1
        all      1 Apr start_year   - 31 Mar start_year + 1

    The first session of each part is the first matching weekday on or after
    the start, so summer 2026 opens on Monday 5 October.
    """
    if kind == 'winter':
        return datetime.date(start_year, 4, 1), datetime.date(start_year, 9, 30)
    if kind == 'summer':
        return datetime.date(start_year, 10, 1), datetime.date(start_year + 1, 3, 31)
    return datetime.date(start_year, 4, 1), datetime.date(start_year + 1, 3, 31)


def ascii_safe(text):
    """For console output: a Windows console is often cp1252, not UTF-8."""
    return text.encode('ascii', 'replace').decode('ascii')


def escape(text):
    return (text.replace('\\', '\\\\').replace(';', '\\;')
                .replace(',', '\\,').replace('\n', '\\n'))


def fold(line):
    """Fold to 75 octets. The continuation's leading space is the marker, so a
    space in the content survives as the first character after it."""
    encoded = line.encode('utf-8')
    if len(encoded) <= 75:
        return line
    out = [encoded[:74].decode('utf-8', 'ignore')]
    rest = encoded[len(out[0].encode('utf-8')):]
    while rest:
        chunk = rest[:73].decode('utf-8', 'ignore')
        out.append(' ' + chunk)
        rest = rest[len(chunk.encode('utf-8')):]
    return '\n'.join(out)


def build_one(session, start_year, stamp):
    """One calendar for one weekly session. Returns (text, report) or None."""
    season = '%d/%s' % (start_year, str(start_year + 1)[-2:])
    span_start, span_end = season_span(session['season'], start_year)
    first = first_on_or_after(span_start, session['day'])
    if first > span_end:
        return None

    sh, sm = (int(x) for x in session['start'].split(':'))
    eh, em = (int(x) for x in session['end'].split(':'))
    # UNTIL must be UTC; noon the day after the season ends is safely past the
    # last session and cannot pull in an extra one
    until = (span_end + datetime.timedelta(days=1)).strftime('%Y%m%dT120000Z')

    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//North Canterbury Athletic Club//%s %s//EN' % (session['slug'], season),
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        # not escaped: X-WR-CALNAME is a vendor property and not every reader
        # unescapes it, so a comma in the name is safer left alone
        'X-WR-CALNAME:%s' % session['name'],
        'X-WR-TIMEZONE:Pacific/Auckland',
        'X-WR-CALDESC:' + escape(
            '%s, %s season %s. One session per week, so you can subscribe to just '
            'this one.' % (session['name'], session['season'], season)),
        VTIMEZONE,
        'BEGIN:VEVENT',
        'UID:training-%s-%s@ncan.nz' % (season.replace('/', '-'), session['slug']),
        'DTSTAMP:%s' % stamp,
        'DTSTART;TZID=Pacific/Auckland:%sT%02d%02d00' % (first.strftime('%Y%m%d'), sh, sm),
        'DTEND;TZID=Pacific/Auckland:%sT%02d%02d00' % (first.strftime('%Y%m%d'), eh, em),
        'RRULE:FREQ=WEEKLY;BYDAY=%s;UNTIL=%s' % (BYDAY[session['day']], until),
        'SUMMARY:%s' % escape(session['name']),
        'LOCATION:%s' % escape(session['location']),
    ]
    if session['description']:
        lines.append('DESCRIPTION:%s' % escape(session['description']))
    lines += ['END:VEVENT', 'END:VCALENDAR']

    text = '\n'.join(fold(l) for l in lines) + '\n'
    weeks = ((span_end - first).days // 7) + 1
    return text, (session, first, span_end, weeks)


def main():
    ap = argparse.ArgumentParser(description='Generate the training calendar.')
    ap.add_argument('--season', type=int, default=None,
                    help='starting year, e.g. 2026 for the 2026/27 season')
    ap.add_argument('--list', action='store_true', help='report the dates generated')
    args = ap.parse_args()

    today = datetime.date.today()
    # a season opens in April, so Jan-Mar still belongs to the one before
    start_year = args.season if args.season else (today.year if today.month >= 4
                                                  else today.year - 1)

    season = '%d/%s' % (start_year, str(start_year + 1)[-2:])
    tag = season.replace('/', '-')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    # one calendar per session, so a member can subscribe to only what they attend
    written = []
    for session in SESSIONS:
        built = build_one(session, start_year, stamp)
        if not built:
            continue
        text, report = built
        name = 'training-%s-%s.ics' % (tag, session['slug'])
        path = os.path.join(CAL_DIR, name)
        tmp = path + '.tmp'
        with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
            fh.write(text)
        os.replace(tmp, path)
        written.append((name, report))

    # a previous run may have produced the single combined calendar
    combined = os.path.join(CAL_DIR, 'training-%s.ics' % tag)
    if os.path.exists(combined):
        os.remove(combined)
        print('removed the old combined %s' % os.path.basename(combined))

    print('wrote %d calendar(s) for the %s season:' % (len(written), season))
    for name, (session, first, last, weeks) in written:
        print('   %-44s %-8s %s -> %s  ~%d weeks'
              % (name, session['season'], first.strftime('%a %d %b %Y'),
                 last.strftime('%d %b %Y'), weeks))
        if args.list:
            print('      %s  %s' % (ascii_safe(session['name']),
                                    ascii_safe(session['location'])))

    print('now run: python tools/build-calendar-list.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
