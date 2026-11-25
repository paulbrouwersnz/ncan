# -*- coding: utf-8 -*-
"""The site's pages, for the tools: where each one lives and its address.

Every page is a folder with an index.html, so its address has no .html:

    index.html                  https://ncan.nz/
    calendar/index.html         https://ncan.nz/calendar/
    athlete/index.html          https://ncan.nz/athlete/#/sam-brown

A page may also have pages of its own, one folder further down:

    gallery/2024-colgate-games/index.html    https://ncan.nz/gallery/2024-colgate-games/

(the gallery's album pages, written by tools/build-gallery.py). They are listed
straight after the page they sit under, named 'gallery/2024-colgate-games'.

The .html files left at the root (calendar.html and so on), and the folders of
pages renamed since (tuesday-training/, now junior-athletics/), only send
visitors on to the new address; they carry <meta name="ncan-redirect">, and the
tools leave them alone. 404.html does the same for any old address once they're gone.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://ncan.nz'
# folders at the root that hold the site's files, not pages
NOT_PAGES = {'assets', 'partials', 'tools', 'tests', 'actions', '.git', '.github', '.claude', 'node_modules'}
REDIRECT_MARK = '<meta name="ncan-redirect"'


def pages(root=ROOT):
    """[(name, address, path)] for every page: ('index', '/', .../index.html),
    ('calendar', '/calendar/', .../calendar/index.html) ... the home page first,
    each page's own pages straight after it."""
    out = []
    home = os.path.join(root, 'index.html')
    if os.path.exists(home):
        out.append(('index', '/', home))
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name, 'index.html')
        if name in NOT_PAGES or name.startswith('.'):
            continue
        if os.path.isfile(path):
            if not _redirect(path):
                out.append((name, '/%s/' % name, path))
                out += _subpages(root, name)
        elif os.path.isdir(os.path.join(root, name)):
            out += _subpages(root, name)   # a folder of pages only: my/shares/
    return out


def _subpages(root, name):
    """[(name, address, path)] for the pages in a page's own folders:
    ('gallery/2024-colgate-games', '/gallery/2024-colgate-games/', ...)."""
    out = []
    folder = os.path.join(root, name)
    for sub in sorted(os.listdir(folder)):
        path = os.path.join(folder, sub, 'index.html')
        if not sub.startswith(('.', '_')) and os.path.isfile(path) and not _redirect(path):
            out.append(('%s/%s' % (name, sub), '/%s/%s/' % (name, sub), path))
    return out


def _redirect(path):
    """Whether a page only sends visitors on (an old address)."""
    with open(path, encoding='utf-8') as fh:
        return REDIRECT_MARK in fh.read(2000)


def page_files(root=ROOT):
    """(relative path, full path) of every page, for the tools that edit them."""
    return [(os.path.relpath(path, root).replace(os.sep, '/'), path) for _, _, path in pages(root)]


def address(name):
    """'calendar' or 'calendar.html' -> '/calendar/'; 'index' -> '/'."""
    name = name.strip('/')
    if name.endswith('.html'):
        name = name[:-5]
    if name.endswith('/index'):
        name = name[:-6]
    return '/' if name in ('', 'index') else '/%s/' % name
