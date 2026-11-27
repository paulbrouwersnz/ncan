# -*- coding: utf-8 -*-
"""Page titles, descriptions and share images: reading tools/page-meta.json.

Shared by tools/build-page-meta.py (writes them into the pages and draws the
share images) and tools/build-gallery.py (the album pages' heads). See
tools/README.md ("Page titles and share images").

Standard library only.
"""
import html
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'tools', 'page-meta.json')
SITE = 'https://ncan.nz'
CLUB = 'North Canterbury Athletic Club'
SUFFIX = ' — ' + CLUB

# the designed cards (no photo) are kept here; an album's card, made from its
# cover photo, lives on the photo host beside the photos, never in this repository
CARD_DIR = os.path.join(ROOT, 'assets', 'img', 'share')
CARD_URL = SITE + '/assets/img/share/'
ALBUM_CARD_URL = 'https://photos.ncan.nz/share/'
DEFAULT_IMAGE = SITE + '/assets/img/share.png'

# the og:image lines every page ends its head with (written by build-page-meta.py
# and build-gallery.py, between these markers)
OPEN, CLOSE = '<!-- @share-image -->', '<!-- /@share-image -->'


def load(path=DATA):
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def card_name(address):
    """The card's file name for a page's address: '/' -> 'home', '/club-champs/' -> 'club-champs'."""
    name = address.strip('/').replace('/', '-')
    return name or 'home'


def page(data, address):
    """{title, og_title, description, headline, line, image} for a page in the file, or None."""
    p = (data.get('pages') or {}).get(address)
    if not p:
        return None
    title = p['title'] if address == '/' else p['title'] + SUFFIX
    return {'title': title, 'og_title': p.get('og_title') or title, 'description': p['description'],
            'headline': p['headline'], 'line': p['line'],
            'image': CARD_URL + card_name(address) + '.jpg', 'type': 'image/jpeg'}


def plural(n):
    return '%d photo%s' % (n, '' if n == 1 else 's')


def album(data, slug, title, count):
    """The album page's {title, description, headline, line, image}. An album not in
    the file yet (a new one) gets "<album title>: club photos" and its cover."""
    a = (data.get('albums') or {}).get(slug) or {}
    headline = a.get('headline') or title
    who = a.get('who') or 'club athletes'                 # who the photos are of
    where = a.get('where') or 'at the %s' % title         # "on day 3 of the 2026 Colgate Games"
    end = a.get('title_end') or 'club photos'
    return {'title': '%s: %s%s' % (headline, end, SUFFIX),
            'og_title': '%s: %s%s' % (headline, end, SUFFIX),
            'description': '%s of %s %s, in the %s photo gallery.' % (plural(count), who, where, CLUB),
            'headline': headline,
            'line': '%s of %s' % (plural(count), who),
            'image': ALBUM_CARD_URL + slug + '.jpg', 'type': 'image/jpeg'}


def image_block(meta=None):
    """The og:image lines for a page: its own card, or the club's general image."""
    e = lambda s: html.escape(s, quote=True)
    if meta:
        url, kind, alt = meta['image'], meta['type'], meta['headline'] + ' — ' + CLUB
    else:
        url, kind, alt = DEFAULT_IMAGE, 'image/png', CLUB
    return ('%s\n'
            '<meta property="og:image" content="%s">\n'
            '<meta property="og:image:type" content="%s">\n'
            '<meta property="og:image:width" content="1200">\n'
            '<meta property="og:image:height" content="630">\n'
            '<meta property="og:image:alt" content="%s">\n'
            '<meta name="twitter:image" content="%s">\n'
            '%s' % (OPEN, e(url), kind, e(alt), e(url), CLOSE))
