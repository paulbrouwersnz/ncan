#!/usr/bin/env python3
"""Check assets/facebook/posts.html against the home page's allowlist.

The home page keeps only the elements and attributes that assets/js/post-clean.js
allows, and takes out everything else. This reads the same lists from that file
and reports anything in posts.html the page would take out: either something
unsafe got into the posts, or build-html.py has started writing something new
that needs adding to the allowlist (see the notes at the top of post-clean.js).

    python tools/check-facebook-posts.py            # checks assets/facebook/posts.html
    python tools/check-facebook-posts.py FILE.html  # checks another file

Exits 1 when something would be taken out. With --warn it prints GitHub
warnings and exits 0 (the Facebook updater uses that, so posts still publish).
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLEANER = os.path.join(ROOT, 'assets', 'js', 'post-clean.js')
POSTS = os.path.join(ROOT, 'assets', 'facebook', 'posts.html')


def js_list(src, name):
    m = re.search(r'var %s = (\[[^\]]*\]);' % name, src)
    if not m:
        sys.exit('post-clean.js: no %s list' % name)
    return json.loads(m.group(1).replace("'", '"'))


def allowlist():
    src = open(CLEANER, encoding='utf-8').read()
    m = re.search(r'var ATTRS = \{(.*?)\};', src, re.S)
    if not m:
        sys.exit('post-clean.js: no ATTRS')
    attrs = {}
    for key, values in re.findall(r"'?([\w*]+)'?\s*:\s*(\[[^\]]*\])", m.group(1)):
        attrs[key] = json.loads(values.replace("'", '"'))
    urls = {}
    for key, pattern, flags in re.findall(r'(\w+): /(.+?)/(\w*),?\n', src):
        urls[key] = re.compile(pattern.replace(r'\/', '/'), re.I if 'i' in flags else 0)
    return set(js_list(src, 'TAGS')), attrs, set(js_list(src, 'DROP')), urls


class Checker(HTMLParser):
    def __init__(self, rules):
        super().__init__(convert_charrefs=True)
        self.tags, self.attrs, self.drop, self.urls = rules
        self.found = []

    def handle_starttag(self, tag, attrs):
        line = self.getpos()[0]
        if tag in self.drop:
            self.found.append((line, '<%s> (removed with what it holds)' % tag))
            return
        if tag not in self.tags:
            self.found.append((line, '<%s> (its text is kept)' % tag))
            return
        allowed = set(self.attrs.get('*', [])) | set(self.attrs.get(tag, []))
        for name, value in attrs:
            value = value or ''
            if name not in allowed:
                self.found.append((line, '%s %s' % (tag, name)))
            elif name in self.urls and not self.urls[name].search(value.strip()):
                self.found.append((line, '%s %s="%s"' % (tag, name, value[:60])))
            elif name == 'target' and value != '_blank':
                self.found.append((line, '%s target="%s"' % (tag, value)))

    handle_startendtag = handle_starttag


def main(argv):
    warn = '--warn' in argv
    files = [a for a in argv if not a.startswith('--')] or [POSTS]
    checker = Checker(allowlist())
    for path in files:
        checker.feed(open(path, encoding='utf-8').read())
    if not checker.found:
        print('Facebook posts: nothing the allowlist would take out.')
        return 0
    for line, what in checker.found:
        if warn:
            print('::warning file=assets/facebook/posts.html,line=%d::The home page will take out %s' % (line, what))
        else:
            print('line %d: the home page would take out %s' % (line, what))
    if not warn:
        print('If build-html.py now writes this on purpose, add it to the lists in assets/js/post-clean.js.')
    return 0 if warn else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
