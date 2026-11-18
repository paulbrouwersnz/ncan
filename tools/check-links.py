# -*- coding: utf-8 -*-
"""Check that every link and file a page refers to on this site exists.

    python tools/check-links.py

Reads every page (tools/pages.py; the old addresses that only redirect are left
out) and 404.html, and checks each href= and src= that points into the site:
written from the root (/calendar/, /assets/css/styles.css) or relative to the
page (../assets/x.png). Anything after ? or # is ignored, so
/athlete/#/sam-brown and styles.css?v=1a2b3c4d are checked as /athlete/ and
styles.css. A folder address (/calendar/) must have an index.html.

Not checked: other websites (http:, https:, //host), mailto:, tel:, data:,
javascript:, links within the page (#join), and anything a script builds at run
time (links inside <script> are not read).

Prints each broken link with the page it is on and exits 1 if there are any, so
the pull request checks (.github/workflows/checks.yml) fail on a broken link.

A link that is known to be broken and is to stay that way for now goes in
tools/check-links-allow.txt, one per line, as the page's address and the link
exactly as written:

    /records/ /assets/docs/old-file.pdf

It is then reported as "allowed" rather than failing the check. An entry that no
longer matches anything is reported too, so the list can be kept short.
"""
import argparse, io, os, re, sys
from html.parser import HTMLParser
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pages import pages as site_pages, ROOT  # noqa: E402

ALLOW_FILE = os.path.join(ROOT, 'tools', 'check-links-allow.txt')
# a scheme (http:, mailto:, data:, javascript: ...) or a protocol-relative //host
EXTERNAL = re.compile(r'^([a-zA-Z][a-zA-Z0-9+.-]*:|//)')


class Refs(HTMLParser):
    """Collects (line, attribute, value) for every href= and src=."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ('href', 'src') and value is not None:
                self.refs.append((self.getpos()[0], name, value.strip()))

    handle_startendtag = handle_starttag


def target(link, page_path, root):
    """The file a link refers to, or None when it is not ours to check."""
    if not link or link.startswith('#') or EXTERNAL.match(link):
        return None
    path = unquote(re.split(r'[?#]', link, maxsplit=1)[0])
    if not path:
        return None  # only a ?query: the page itself
    if path.startswith('/'):
        full = os.path.join(root, path.lstrip('/'))
    else:
        full = os.path.join(os.path.dirname(page_path), path)
    return os.path.normpath(full)


def exact_case(full, root):
    """Whether each part of the path exists with exactly that case. The web
    server is case-sensitive; Windows and macOS disks usually aren't."""
    rel = os.path.relpath(full, root)
    here = root
    for part in rel.split(os.sep):
        if part not in os.listdir(here):
            return False
        here = os.path.join(here, part)
    return True


def exists(full, root):
    """Whether the site would serve something there."""
    if os.path.relpath(full, root).startswith('..'):
        return False  # climbs out of the site
    if full == root:
        return True
    if os.path.isdir(full):
        # a folder (/calendar/, or /calendar, which is sent on to it) is served
        # only through its index.html: GitHub Pages lists no folders
        return exact_case(full, root) and os.path.isfile(os.path.join(full, 'index.html'))
    return os.path.isfile(full) and exact_case(full, root)


def read_allow(path):
    allowed = set()
    if os.path.isfile(path):
        for line in io.open(path, encoding='utf-8'):
            line = line.strip()
            # a whole line starting with # is a note (a link may itself hold a #)
            if line and not line.startswith('#'):
                page, _, link = line.partition(' ')
                allowed.add((page, link.strip()))
    return allowed


def site_files(root):
    """(address, path) of every page to check: the pages and 404.html."""
    out = [(address, path) for _, address, path in site_pages(root)]
    notfound = os.path.join(root, '404.html')
    if os.path.isfile(notfound):
        out.append(('/404.html', notfound))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--root', default=ROOT, help='the site folder (default: this repository)')
    args = ap.parse_args(argv)
    root = os.path.abspath(args.root)
    allow_path = ALLOW_FILE if root == os.path.abspath(ROOT) else os.path.join(root, 'tools', 'check-links-allow.txt')
    allowed = read_allow(allow_path)

    broken, excused, used = [], [], set()
    files = site_files(root)
    checked = 0
    for address, path in files:
        parser = Refs()
        parser.feed(io.open(path, encoding='utf-8').read())
        for line, attr, link in parser.refs:
            full = target(link, path, root)
            if full is None:
                continue
            checked += 1
            if exists(full, root):
                continue
            where = '%s line %d: %s="%s"' % (address, line, attr, link)
            if (address, link) in allowed:
                used.add((address, link))
                excused.append(where)
            else:
                broken.append(where)

    print('checked %d link(s) in %d page(s).' % (checked, len(files)))
    for where in excused:
        print('   allowed (tools/check-links-allow.txt): ' + where)
    for page, link in sorted(allowed - used):
        print('   ! no longer broken, take it out of tools/check-links-allow.txt: %s %s' % (page, link))
    if broken:
        print('%d broken link(s):' % len(broken))
        for where in broken:
            print('   ' + where)
        return 1
    print('no broken links.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
