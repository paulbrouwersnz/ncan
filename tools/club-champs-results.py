#!/usr/bin/env python3
"""
club-champs-results.py

Fill in one Saturday of the children's club championships from AthleticLIVE.

    python tools/club-champs-results.py --date 2026-11-14 TEAM-PAGE-URL
    python tools/club-champs-results.py --date 2026-11-14 TEAM-PAGE-URL --apply

TEAM-PAGE-URL is North Canterbury's page for that meeting on AthleticLIVE.
Take the meeting's address, add /teams to the end, choose North Canterbury
Athletic Cl from the list, and copy the address of the page that opens:

    https://athleticscanterbury.anet.live/meets/80234          the meeting
    https://athleticscanterbury.anet.live/meets/80234/teams    its clubs
    https://athleticscanterbury.anet.live/meets/80234/teams/1855906   <- this

(The Teams link in AthleticLIVE's top menu is a different, site-wide list.)

Run it once results are final - by the Monday after, as a rule. Running it
while a meeting is still live picks up whatever has been published so far.

Without --apply nothing is written: you see what would go in, and anything
that needs a decision. With --apply the results for that Saturday are written
to the season's file in assets/data/club-champs/. If the Saturday already has
results, add --replace to swap them for the fresh set.

WHERE THE RESULTS COME FROM
    AthleticLIVE publishes finished results as plain JSON at data.athletic.live.
    For each championship event on the programme for --date, the script reads
    that event's results, the same results the official link shows, and picks
    out athletes whose club is North Canterbury (athletic.net club 87812).

    Those files are keyed by AthleticLIVE's own numbers, and a wrong number
    quietly returns some other meeting's file, so every file is checked for
    the right meeting and date before it is used. Any mismatch stops the run.

CHECKS BEFORE ANYTHING IS WRITTEN
    - the team page is North Canterbury's, at the meeting in the address
    - --date is a Saturday on the season's programme
    - every session and event read is from that meeting, on --date
    - every championship event on the programme is found at the meeting

    Anything else that needs a person - an athlete whose AthleticLIVE year
    does not match the race they ran in, an event that cannot be matched -
    stops the run with an explanation rather than a guess.

PLACES AND POINTS
    Place is the order among North Canterbury athletes in the grade, from the
    official overall places; equal places stay equal. An athlete who competed
    but has no mark (ND, NM, DNF, NT, FOUL) takes the next place after everyone
    with a mark, shared with any others without one. DNS did not compete and is
    left out. The page turns places into points.

ATHLETES WHOSE ATHLETICLIVE YEAR IS WRONG
    List them in the season file's "grades", e.g. "grades": {"Stella Brown": 9}.
    Their listed grade wins over AthleticLIVE's. An athlete listed under one
    grade but running in another grade's race is reported for you to place by
    hand, since their place can't be read off a different race.
"""

import argparse
import datetime
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from athleticlive import (DID_NOT_START, NCAN_CLUB, NO_MARK, Stop, event_grade,  # noqa: E402
                          feed, ncan_team, parse_team_url, place_value, programme_name,
                          sessions_for)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'assets', 'data', 'club-champs')
GROUPS = ('7-9', '10-14')

def say(text=''):
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


# ---------------------------------------------------------------- the season

def season_for(date):
    """(path, data) of the season file whose programme has this Saturday."""
    index_path = os.path.join(DATA_DIR, 'index.json')
    with io.open(index_path, encoding='utf-8') as fh:
        seasons = json.load(fh).get('seasons', [])
    for s in seasons:
        path = os.path.join(DATA_DIR, s['id'] + '.json')
        if not os.path.exists(path):
            continue
        with io.open(path, encoding='utf-8') as fh:
            data = json.load(fh)
        if any(m.get('date') == date for m in data.get('meetings', [])):
            return path, data
    raise Stop('%s is not a Saturday on any season\'s programme (assets/data/club-champs/)' % date)


def group_of(grade):
    return '7-9' if grade <= 9 else '10-14'


# ---------------------------------------------------------------- the results

def ncan_rows(event, results, grades, site, meet):
    """North Canterbury results in one event: (rows, problems)."""
    grade = event_grade(event)
    rows, problems = [], []
    for r in results.get('r', []):
        a = r.get('a') or {}
        club = (a.get('t') or {}).get('ani')
        if club != NCAN_CLUB:
            continue
        name = re.sub(r'\s+', ' ', a.get('n') or '').strip()
        mark = (r.get('m') or '').strip()
        if mark.upper() in DID_NOT_START:
            continue
        year = int(a['y']) if str(a.get('y', '')).strip().isdigit() else None
        real = grades.get(name, year)
        if real != grade:
            where = '%s %s Grade %d' % (event['gl'], programme_name(event), grade)
            if name in grades:
                problems.append('%s is grade %s (season file "grades") but ran in %s: place them by hand'
                                % (name, real, where))
            else:
                problems.append('%s is Yr %s on AthleticLIVE but ran in %s. If they are grade %d, add '
                                '"%s": %d to the season file\'s "grades" and run again'
                                % (name, year, where, grade, name, grade))
            continue
        rows.append({
            'athlete': name,
            'overall': place_value(r.get('p')),
            'mark': mark,
            'source': '%s/meets/%d/events/individual/%d' % (site, meet, event['i']),
        })
    return rows, problems


def assign_places(rows):
    """NCAN places from overall places; no-mark athletes share the next one."""
    placed = sorted([r for r in rows if r['overall'] is not None], key=lambda r: r['overall'])
    place, last, n = 0, None, 0
    for r in placed:
        n += 1
        if r['overall'] != last:
            place, last = n, r['overall']
        r['place'] = place
    unplaced = [r for r in rows if r['overall'] is None]
    for r in unplaced:
        if r['mark'] and r['mark'].upper() not in NO_MARK:
            r['note'] = 'no overall place but mark %r' % r['mark']
        r['place'] = len(placed) + 1
    return placed + unplaced


# ------------------------------------------------------------------- the run

def run(args):
    try:
        datetime.date.fromisoformat(args.date)
    except ValueError:
        raise Stop('--date must look like 2026-11-14')

    site, meet, team_no = parse_team_url(args.team_url)
    path, season = season_for(args.date)
    meeting = [m for m in season['meetings'] if m['date'] == args.date][0]
    grades = {re.sub(r'\s+', ' ', k).strip(): int(v) for k, v in (season.get('grades') or {}).items()}

    team = ncan_team(meet, team_no)
    sessions = sessions_for(meet, team, args.date)
    say('Meeting %d on %s, sessions: %s' % (meet, args.date,
        ', '.join('%s (%d)' % (s['n'], sid) for sid, s in sorted(sessions.items()))))

    # every event in those sessions, by (gender, programme event, grade)
    at_meeting = {}
    for s in sessions.values():
        for ev in s.get('evs', []):
            if ev.get('mi') != meet:
                continue
            g = event_grade(ev)
            if g is None:
                continue
            key = ((ev.get('gl') or '').lower(), programme_name(ev), g)
            at_meeting.setdefault(key, []).append(ev)

    rows_out, problems, missing = [], [], []
    for gender in ('girls', 'boys'):
        for group in GROUPS:
            grades_in = range(7, 10) if group == '7-9' else range(10, 15)
            for name in (meeting.get(gender) or {}).get(group, []):
                for grade in grades_in:
                    events = at_meeting.get((gender, name, grade), [])
                    if not events:
                        missing.append('%s %s Grade %d' % (gender.title(), name, grade))
                        continue
                    if len(events) > 1:
                        problems.append('%s %s Grade %d is listed %d times at the meeting'
                                        % (gender.title(), name, grade, len(events)))
                        continue
                    ev = events[0]
                    results = feed('ind_res_list', ev['i'])
                    if not results:
                        missing.append('%s %s Grade %d (no results published yet)' % (gender.title(), name, grade))
                        continue
                    if results.get('mi') != meet or (results.get('se') or {}).get('ds') != args.date:
                        raise Stop('event %d is not from meeting %d on %s' % (ev['i'], meet, args.date))
                    rows, trouble = ncan_rows(ev, results, grades, site, meet)
                    problems.extend(trouble)
                    for r in assign_places(rows):
                        out = {'date': args.date, 'gender': gender, 'grade': grade, 'event': name,
                               'place': r['place'], 'athlete': r['athlete'], 'mark': r['mark'],
                               'source': r['source']}
                        rows_out.append((out, r))

    # ---- report
    say()
    say('%d result(s) for %s:' % (len(rows_out), args.date))
    for out, r in rows_out:
        flag = '' if r['overall'] is not None else '   (no mark)'
        if r.get('note'):
            flag = '   (%s)' % r['note']
        say('  %-5s %-2d %-9s %-3s %-28s %-9s%s' % (out['gender'], out['grade'], out['event'],
                                                    ordinal(out['place']), out['athlete'], out['mark'], flag))
    if missing:
        say()
        say('Championship events not found at the meeting:')
        for m in missing:
            say('  ' + m)
    if problems:
        say()
        say('Needs a decision:')
        for p in problems:
            say('  ' + p)

    existing = [r for r in season.get('results', []) if r.get('date') == args.date]
    if existing:
        say()
        say(compare(existing, [o for o, _ in rows_out]))

    if missing or problems:
        say()
        say('Nothing written: sort out the above first.')
        return 1
    if not args.apply:
        say()
        say('Check only - nothing written. Add --apply to write these to %s.' % os.path.relpath(path, ROOT))
        return 0
    if existing and not args.replace:
        say()
        say('%s already has %d result(s). Add --replace to swap them for these.' % (args.date, len(existing)))
        return 1

    # the new rows go where that Saturday's old ones were (or on the end), keeping diffs small
    fresh = [o for o, _ in rows_out]
    kept, at = [], None
    for r in season.get('results', []):
        if r.get('date') == args.date:
            if at is None:
                at = len(kept)
        else:
            kept.append(r)
    if at is None:
        at = len(kept)
    season['results'] = kept[:at] + fresh + kept[at:]
    meeting['results'] = '%s/meets/%d' % (site, meet)          # the whole meeting
    meeting['ncan'] = '%s/meets/%d/teams/%d' % (site, meet, team_no)  # North Canterbury's page
    season['updated'] = datetime.date.today().isoformat()
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(json.dumps(season, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)
    say()
    say('Written %d result(s) to %s.' % (len(rows_out), os.path.relpath(path, ROOT)))
    return 0


def compare(old, new):
    key = lambda r: (r['gender'], r['grade'], r['event'], r['athlete'])
    a = {key(r): r for r in old}
    b = {key(r): r for r in new}
    lines = []
    for k in sorted(set(a) | set(b)):
        if k not in b:
            lines.append('  only in the file now: %s' % ' '.join(map(str, k)))
        elif k not in a:
            lines.append('  new from AthleticLIVE: %s' % ' '.join(map(str, k)))
        else:
            diff = [f for f in ('place', 'mark', 'source') if a[k].get(f) != b[k].get(f)]
            if diff:
                lines.append('  changed %s: %s (%s)' % (', '.join(diff), ' '.join(map(str, k)),
                             ', '.join('%s %r -> %r' % (f, a[k].get(f), b[k].get(f)) for f in diff)))
    head = 'Compared with the %d result(s) already in the file for this Saturday:' % len(old)
    return head + '\n' + ('\n'.join(lines) if lines else '  identical')


def ordinal(n):
    if n is None:
        return '-'
    if 10 <= n % 100 <= 20:
        return '%dth' % n
    return '%d%s' % (n, {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))


def main():
    ap = argparse.ArgumentParser(description='Fill in a Saturday of the club championships from AthleticLIVE.')
    ap.add_argument('team_url', help="North Canterbury's AthleticLIVE team page for the meeting")
    ap.add_argument('--date', required=True, help='the programme Saturday, e.g. 2026-11-14')
    ap.add_argument('--apply', action='store_true', help='write the results (otherwise only show them)')
    ap.add_argument('--replace', action='store_true', help='replace results already entered for --date')
    args = ap.parse_args()
    try:
        return run(args)
    except Stop as exc:
        say('Stopped: %s' % exc)
        say('Nothing written.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
