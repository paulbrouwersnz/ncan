#!/usr/bin/env python3
"""
indexnow.py

Tell search engines that particular pages have changed. You say which.

    python tools/indexnow.py index.html calendar.html
    python tools/indexnow.py records.html
    python tools/indexnow.py /                     # the home page
    python tools/indexnow.py --dry-run index.html  # show, do not send

Arguments are paths below https://ncan.nz/, so "calendar.html", not the whole
address - though a full URL is accepted and trimmed, and a leading slash is
fine. "index.html" and "/" both mean the home page, which is submitted as
https://ncan.nz/ because that is what the page's canonical says it is.

Both the pages and the key file are checked on a dry run as well as a real
one, so --dry-run tells you whether the submission would actually succeed.

Every page is fetched first. If one does not answer 200 nothing is sent:
IndexNow rejects a whole batch when a URL in it is wrong, so a typo would
otherwise waste the submission and tell you nothing useful.

The submission goes to api.indexnow.org, which passes it on to every engine
taking part - Bing, Yandex, Naver, Seznam and Yep among them. There is no
need to call each one.

IndexNow proves the site is yours by fetching the key file, so
f901e74e08d3438b9e62604b35cb47f5.txt has to be live at the site root holding
exactly the key. That is checked before anything is sent, because without it
every submission is refused and the reason is not obvious.
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request

SITE = 'https://ncan.nz'
HOST = 'ncan.nz'
KEY = 'f901e74e08d3438b9e62604b35cb47f5'
KEY_LOCATION = '%s/%s.txt' % (SITE, KEY)
ENDPOINT = 'https://api.indexnow.org/indexnow'
UA = 'ncan-site-tools/1.0 (+https://ncan.nz)'

# index.html and / are the same page; the canonical says it is the bare domain
HOME = ('', '/', 'index.html', '/index.html')

MEANING = {
    200: 'accepted',
    202: 'accepted - the key is still being validated',
    400: 'bad request - the JSON or the key format is wrong',
    403: 'refused - the key file could not be verified',
    422: 'refused - a URL does not belong to this host, or the key does not match',
    429: 'too many requests - wait and try again',
}


def say(text):
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or 'ascii'
        print(text.encode(enc, 'replace').decode(enc))


WINDOWS_PATH = re.compile(r'^[A-Za-z]:[\/]')


def unmangle(arg):
    """Undo the path rewriting Git Bash does to arguments starting with /.

    In Git Bash (MSYS) a bare "/" is turned into the install directory,
    "C:/Program Files/Git/", before the script is started, and "/x.html"
    into "C:/Program Files/Git/x.html". Nothing here can stop that, so
    recognise the shape and recover what was meant.
    """
    if not WINDOWS_PATH.match(arg):
        return arg, False
    tail = arg.replace(chr(92), '/').rstrip('/').rsplit('/', 1)[-1]
    return (tail if tail.lower().endswith('.html') else ''), True


def to_url(arg):
    """'calendar.html', '/calendar.html' or the full address -> the full address."""
    path = arg.strip()
    for prefix in ('https://' + HOST, 'http://' + HOST, HOST):
        if path.lower().startswith(prefix.lower()):
            path = path[len(prefix):]
            break
    path = path.lstrip('/')
    if path.lower() in [h.lstrip('/').lower() for h in HOME]:
        return SITE + '/'
    return SITE + '/' + path


def fetch_status(url):
    """The status code the live site gives for this URL, or a reason it did not."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, None
    except urllib.error.HTTPError as err:
        return err.code, None
    except Exception as err:
        return None, str(err)


def key_is_live():
    req = urllib.request.Request(KEY_LOCATION, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8', 'replace').strip()
    except urllib.error.HTTPError as err:
        return False, 'HTTP %s' % err.code
    except Exception as err:
        return False, str(err)
    if body != KEY:
        return False, 'it answers, but holds %r' % body[:40]
    return True, 'live and correct'


def submit(urls):
    payload = json.dumps({
        'host': HOST,
        'key': KEY,
        'keyLocation': KEY_LOCATION,
        'urlList': urls,
    }, ensure_ascii=False).encode('utf-8')

    req = urllib.request.Request(ENDPOINT, data=payload, method='POST', headers={
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': UA,
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, MEANING.get(resp.status, 'see the response code')
    except urllib.error.HTTPError as err:
        return err.code, MEANING.get(err.code, err.reason)
    except Exception as err:
        return None, str(err)


def main():
    ap = argparse.ArgumentParser(
        description='Submit named pages to IndexNow.',
        epilog='example: python tools/indexnow.py index.html calendar.html')
    ap.add_argument('pages', nargs='+', metavar='PAGE',
                    help='page path below https://ncan.nz/, e.g. calendar.html')
    ap.add_argument('--dry-run', action='store_true',
                    help='check the pages and show the list, but send nothing')
    args = ap.parse_args()

    urls, seen = [], set()
    mangled = False
    for arg in args.pages:
        arg, was_mangled = unmangle(arg)
        mangled = mangled or was_mangled
        url = to_url(arg)
        if url not in seen:
            seen.add(url)
            urls.append(url)

    if mangled:
        say('note: your shell rewrote a leading "/" into a Windows path; '
            'read as the home page. Pass index.html to avoid the guesswork.' + chr(10))

    say('checking %d page(s) on the live site:' % len(urls))
    missing = []
    for url in urls:
        code, err = fetch_status(url)
        if err:
            say('   %-52s could not be reached: %s' % (url, err))
            missing.append(url)
        elif code != 200:
            say('   %-52s HTTP %s' % (url, code))
            missing.append(url)
        else:
            say('   %-52s 200' % url)

    if missing:
        say('\n%d page(s) did not answer 200. Nothing sent: IndexNow refuses a '
            'whole batch when one URL in it is wrong.' % len(missing))
        return 1

    # Checked on a dry run as well: the key is the usual reason a submission
    # fails, so a rehearsal that skipped it would report all-clear and then
    # the real run would be refused.
    ok, detail = key_is_live()
    say('')
    say('key file %s' % KEY_LOCATION)
    say('   %s' % detail)

    if args.dry_run:
        if ok:
            say('\ndry run - these %d URL(s) would be submitted to %s'
                % (len(urls), ENDPOINT))
            return 0
        say('\ndry run - the %d URL(s) are fine, but the key file is not, so a '
            'real run would be refused. Deploy it to the site root.' % len(urls))
        return 1

    if not ok:
        say('\nNothing sent: IndexNow fetches that file to confirm the site is '
            'yours, so the submission would be refused.')
        return 1

    code, meaning = submit(urls)
    say('\n%s' % ENDPOINT)
    say('   %s  %s' % (code if code else 'ERR', meaning))
    return 0 if code in (200, 202) else 1


if __name__ == '__main__':
    sys.exit(main())
