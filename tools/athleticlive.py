"""
athleticlive.py

Shared code for reading AthleticLIVE results, used by
tools/club-champs-results.py (and, as a copy, by the private ncan-api project). Not run directly.

AthleticLIVE publishes finished results as plain JSON at data.athletic.live,
one file per thing, keyed by AthleticLIVE's own numbers:

    team_detail/_doc/<team>       a club's track results at one meeting
    session_detail/_doc/<session> every event in a session (Track, Field)
    ind_res_list/_doc/<event>     one event's full results, track or field

A wrong number does not fail: it quietly returns some other meeting's file.
So everything read is checked against the meeting (and date) it should belong
to, and a mismatch stops the run.

Each club's page for a meeting is

    https://<site>/meets/<meeting>/teams/<team>

found by adding /teams to a meeting's address and choosing the club. That page
address is what the tools take, because it carries both numbers needed.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request

FEED = 'https://data.athletic.live'
NCAN_CLUB = 87812            # North Canterbury's athletic.net club number
UA = 'ncan-site-tools/1.0 (+https://ncan.nz)'
PAUSE = 0.15                 # seconds between requests, to be polite

# marks that mean the athlete competed but has no measurable result
NO_MARK = {'ND', 'NM', 'DNF', 'NT', 'FOUL', 'NH', 'F', 'DQ', 'FS', 'UNTIMED', 'UNMEASURED'}
DID_NOT_START = {'DNS', 'SCR', 'SCRATCH'}


class Stop(Exception):
    """A check failed: say why and write nothing."""


# A folder to keep downloaded files in, set by a tool that wants it (see
# use_cache). Finished meetings' results do not change, so a later run can
# read them from here instead of fetching thousands of files again.
CACHE_DIR = None


def use_cache(folder):
    global CACHE_DIR
    os.makedirs(folder, exist_ok=True)
    CACHE_DIR = folder


def feed(kind, number):
    """One JSON file from data.athletic.live, or None if there is no such file."""
    cached = os.path.join(CACHE_DIR, '%s_%s.json' % (kind, number)) if CACHE_DIR else None
    if cached and os.path.exists(cached):
        with open(cached, encoding='utf-8') as fh:
            return json.load(fh)
    url = '%s/%s/_doc/%s' % (FEED, kind, number)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    time.sleep(PAUSE)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))['_source']
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise Stop('%s answered %s' % (url, exc.code))
    except (urllib.error.URLError, OSError) as exc:
        raise Stop('could not reach %s (%s)' % (url, exc))
    if cached:
        with open(cached, 'w', encoding='utf-8') as fh:
            json.dump(data, fh)
    return data


def parse_team_url(url):
    """(site, meeting, team) from a club's AthleticLIVE page address."""
    m = re.match(r'^(https?://[^/]+)/meets/(\d+)/teams/(\d+)', url.strip())
    if not m:
        raise Stop('%r does not look like an AthleticLIVE team page: expected '
                   'https://<site>/meets/<meeting>/teams/<team>' % url)
    return m.group(1), int(m.group(2)), int(m.group(3))


def ncan_team(meet, team_no):
    """The team file, checked to be North Canterbury at this meeting."""
    team = feed('team_detail', team_no)
    if not team:
        raise Stop('AthleticLIVE has no team %d' % team_no)
    if team.get('mi') != meet:
        raise Stop('team %d belongs to meeting %s, not %d: copy the address again from the '
                   'meeting\'s Teams page' % (team_no, team.get('mi'), meet))
    if team.get('ani') != NCAN_CLUB:
        raise Stop('team %d is %s, not North Canterbury' % (team_no, team.get('n')))
    return team


def sessions_for(meet, team, date=None):
    """The meeting's sessions (on `date`, if given), found from the team's results.

    AthleticLIVE does not publish a meeting's list of sessions as a file, so
    one session is found from an event in the team's results, and the
    sessions numbered either side of it are tried. Only sessions belonging to
    this meeting (and dated `date`) are kept."""
    seed = None
    for r in team.get('r', []):
        ev = feed('ind_res_list', r['ev']['i'])
        if ev and ev.get('mi') == meet and ev.get('se'):
            seed = ev['se']['i']
            break
    if seed is None:
        raise Stop('could not find any of meeting %d\'s sessions from the team\'s results' % meet)

    found = {}
    for offset in [0, 1, -1, 2, -2, 3, -3, 4, -4]:
        sid = seed + offset
        s = feed('session_detail', sid)
        if s and s.get('mi') == meet and (date is None or s.get('ds') == date):
            found[sid] = s
    if not found:
        raise Stop('none of meeting %d\'s sessions is dated %s' % (meet, date) if date
                   else 'could not read meeting %d\'s sessions' % meet)
    return found


def event_grade(event):
    """The grade in AthleticLIVE's division name, e.g. 'Grade 11 BP: 41.27m' -> 11."""
    m = re.match(r'\s*Grade\s+(\d+)', event.get('na') or '')
    return int(m.group(1)) if m else None


def programme_name(event):
    """The event in the championship programme's words: 'Hurdles', 'Race Walk',
    '100m', 'Shot Put'. Hurdle and walk distances are dropped, as the
    programme names them without."""
    un = (event.get('un') or '').strip()
    ab = (event.get('ab') or '').strip()
    words = (un + ' ' + ab).lower()
    if 'hurdle' in words or re.search(r'\d+mh\b', ab.lower()):
        return 'Hurdles'
    if 'walk' in words or re.search(r'\brw\b', ab.lower()):
        return 'Race Walk'
    if re.fullmatch(r'\d+', un):
        return un + 'm'
    if un:
        return un
    return ab


def full_name(event):
    """The event with its distance kept: '80m Hurdles', '1200m Race Walk',
    '200m', 'Discus'. Used where different distances must stay apart."""
    un = (event.get('un') or '').strip()
    ab = (event.get('ab') or '').strip()
    if re.fullmatch(r'\d+', un):
        return un + 'm'
    m = re.match(r'^(\d+)\s*(.*)$', un)
    if m:
        rest = m.group(2).strip()
        if re.search(r'walk|\brw\b', (rest + ' ' + ab).lower()):
            rest = 'Race Walk'
        return '%sm %s' % (m.group(1), rest)
    if re.search(r'\brw\b', ab.lower()):
        m = re.match(r'^(\d+)', ab)
        return '%sm Race Walk' % m.group(1) if m else 'Race Walk'
    return un or ab


def is_field(event):
    return (event.get('peg') or '').lower() == 'field' or event.get('es') == 'f'


def place_value(p):
    """Overall place as a number, or None for no place ('--', '')."""
    m = re.match(r'^\s*T?(\d+)\s*$', str(p or ''))
    return int(m.group(1)) if m else None


def mark_value(mark):
    """A mark as a number: seconds for times, metres for distances; None for no mark.
    '33.40' -> 33.4, '5:24.08' -> 324.08, '1:02:03.4' -> 3723.4, '21.80m' -> 21.8.
    A heat's qualifying letter is not part of the mark: '15.87q' -> 15.87, '20.98mq' -> 20.98."""
    s = (mark or '').strip().lower().rstrip('q').strip().rstrip('m').strip()
    if not s:
        return None
    try:
        parts = [float(x) for x in s.split(':')]
    except ValueError:
        return None
    value = 0.0
    for p in parts:
        value = value * 60 + p
    return value


def wind_value(w):
    try:
        return float(str(w).replace('+', '')) if w not in (None, '') else None
    except ValueError:
        return None
