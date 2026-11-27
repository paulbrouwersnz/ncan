#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Page titles, descriptions and share images, from tools/page-meta.json.

    python tools/build-page-meta.py            write each page's title, description and og:image lines
    python tools/build-page-meta.py --images   ...and draw the share images that are missing or out of date
    python tools/build-page-meta.py --images --only calendar   one page's (or album's) image again
    python tools/build-page-meta.py --check    say what's missing or out of step, change nothing

The heads: for every page listed under "pages" in page-meta.json, its <title>,
description, og:title and og:description are set from the file (a title gets
" — North Canterbury Athletic Club" on the end, except the home page's). Every
page then ends its head with its share image lines between
<!-- @share-image --> markers: its own card when the file lists it, otherwise
the club's general picture (assets/img/share.png). Gallery album pages are
written by tools/build-gallery.py from the file's "albums"; here only their
image lines are brought up to date with assets/data/album-cards.json.

The images (1200 x 630) are drawn from tools/share-card.html with a headless
Chrome or Edge:
  - each listed page's card, on the club's green: assets/img/share/<page>.jpg
    (home.jpg for the home page)
  - each album's overlay: the words and shading on a see-through PNG,
    assets/img/share/albums/<album>.png. The club's API puts the album's card
    together when it's first asked for (https://api.ncan.nz/g/<album>.jpg), laying
    the overlay over the album's cover, fetched from the photo host. Which cover
    and overlay each album has is written to assets/data/album-cards.json, with a
    version that changes with either. Album photos are never kept in this
    repository. Albums are found in the local copy of the photo host
    (NCAN_PHOTOS_DIR, or ../ncan-gallery).
A card is drawn again only when its words or photo change (tools/share-images.json
remembers what each was drawn from), or with --only.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import page_meta as pm  # noqa: E402
import pages as site_pages  # noqa: E402

ROOT = pm.ROOT
CARD = os.path.join(ROOT, 'tools', 'share-card.html')
DRAWN = os.path.join(ROOT, 'tools', 'share-images.json')
ALBUM_MARK = '<!-- @generated:album -->'
HEAD_END = '<!-- /@partial:head -->'

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome', 'chromium', 'chromium-browser', 'msedge',
]


def esc(s):
    return s.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


# ------------------------------------------------------------------ the heads

def set_head(html, meta):
    """The page with its title, description, og:title and og:description from meta
    (when given) and its share image lines (always). Only the part of the head
    after the shared partial is touched."""
    if HEAD_END not in html or '</head>' not in html:
        raise ValueError('no %s or </head>' % HEAD_END)
    cut = html.index(HEAD_END) + len(HEAD_END)
    top, rest = html[:cut], html[cut:]
    end = rest.index('</head>')
    head, tail = rest[:end], rest[end:]
    # the old share lines, and any og:image line left from before the markers
    head = re.sub(r'\n?%s.*?%s' % (re.escape(pm.OPEN), re.escape(pm.CLOSE)), '', head, flags=re.S)
    head = re.sub(r'\n<meta (?:property="og:image[^"]*"|name="twitter:image") content="[^"]*">', '', head)
    if meta:
        tags = [('title', None, '<title>%s</title>' % esc(meta['title'])),
                ('meta', 'name="description"', '<meta name="description" content="%s">' % esc(meta['description'])),
                ('meta', 'property="og:title"', '<meta property="og:title" content="%s">' % esc(meta['og_title'])),
                ('meta', 'property="og:description"',
                 '<meta property="og:description" content="%s">' % esc(meta['description']))]
        last = None
        for kind, attr, line in tags:
            rx = re.compile(r'<title>.*?</title>' if kind == 'title' else r'<meta %s content="[^"]*">' % re.escape(attr),
                            re.S)
            m = rx.search(head)
            if m:
                head = head[:m.start()] + line + head[m.end():]
                last = m.start() + len(line)
            else:                               # missing: after the one before it
                at = last if last is not None else len(head.rstrip('\n'))
                head = head[:at] + '\n' + line + head[at:]
                last = at + 1 + len(line)
    head = head.rstrip('\n') + '\n' + pm.image_block(meta) + '\n'
    return top + head + tail


def write_heads(data, check=False):
    """(changed, problems) over every page but the albums."""
    changed, problems = [], []
    listed = set((data.get('pages') or {}).keys())
    seen = set()
    for name, address, path in site_pages.pages():
        html = io.open(path, encoding='utf-8').read()
        if ALBUM_MARK in html:
            continue                            # tools/build-gallery.py writes these
        seen.add(address)
        meta = pm.page(data, address)
        try:
            new = set_head(html, meta)
        except ValueError as e:
            problems.append('%s: %s' % (address, e))
            continue
        if new != html:
            changed.append(address)
            if not check:
                io.open(path, 'w', encoding='utf-8', newline='').write(new)
    for address in sorted(listed - seen):
        problems.append('page-meta.json lists %s, which is not a page' % address)
    return changed, problems


def set_album_image(html, card):
    """An album page with its share image lines naming its card on the API (card:
    its entry in album-cards.json, with its slug), or the club's general picture (None)."""
    if card:
        url, kind = pm.ALBUM_CARD_URL + '%s.jpg?v=%s' % (card['slug'], card['v']), 'image/jpeg'
    else:
        url, kind = pm.DEFAULT_IMAGE, 'image/png'
    if pm.OPEN not in html:
        raise ValueError('no %s' % pm.OPEN)
    start = html.index(pm.OPEN)
    end = html.index(pm.CLOSE, start)
    block = html[start:end]
    block = re.sub(r'(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*',
                   lambda m: m.group(1) + esc(url), block)
    block = re.sub(r'(<meta property="og:image:type" content=")[^"]*', lambda m: m.group(1) + kind, block)
    return html[:start] + block + html[end:]


def write_album_heads(cards, check=False):
    """(changed, problems): the album pages' image lines, from album-cards.json."""
    changed, problems = [], []
    for name, address, path in site_pages.pages():
        html = io.open(path, encoding='utf-8').read()
        if ALBUM_MARK not in html:
            continue
        s = address.strip('/').rsplit('/', 1)[-1]
        card = dict(cards[s], slug=s) if s in cards else None
        try:
            new = set_album_image(html, card)
        except ValueError as e:
            problems.append('%s: %s' % (address, e))
            continue
        if new != html:
            changed.append(address)
            if not check:
                io.open(path, 'w', encoding='utf-8', newline='').write(new)
    return changed, problems


# ------------------------------------------------------------------ the images

def browser():
    for b in BROWSERS:
        if os.path.isfile(b) or shutil.which(b):
            return b
    sys.exit('No Chrome or Edge found.')


def file_url(path):
    return 'file:///' + quote(os.path.abspath(path).replace(os.sep, '/').lstrip('/'), safe='/:')


def draw(words, out, quality=None):
    """Draw the card for words ({headline, line, overlay?}) to out: .jpg at quality,
    or .png (an overlay: see-through, in 256 colours, which keeps it small)."""
    url = file_url(CARD) + '#' + quote(json.dumps(words, ensure_ascii=False), safe='')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, 'card.png')
        subprocess.run([browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--allow-file-access-from-files', '--user-data-dir=' + os.path.join(tmp, 'p'),
                        '--force-device-scale-factor=1', '--window-size=1200,630',
                        '--default-background-color=00000000',
                        '--virtual-time-budget=3000', '--screenshot=' + png, url],
                       check=True, capture_output=True)
        from PIL import Image
        img = Image.open(png)
        if out.lower().endswith('.jpg'):
            img.convert('RGB').save(out, 'JPEG', quality=quality or 84, optimize=True, progressive=True)
        else:
            img = img.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            img.save(out, 'PNG', optimize=True)


def load_gallery():
    spec = importlib.util.spec_from_file_location('build_gallery', os.path.join(ROOT, 'tools', 'build-gallery.py'))
    bg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bg)
    return bg


def albums(bg):
    """[(slug, title, count, cover's address)] from the local copy of the photo host:
    the cover's original on the photo host, or its thumbnail when there's no original."""
    out = []
    if not os.path.isdir(bg.GALLERY_DIR):
        return out
    for dirpath, dirnames, files in os.walk(bg.GALLERY_DIR):
        dirnames.sort()
        rel = os.path.relpath(dirpath, bg.GALLERY_DIR)
        photos = sorted(f for f in files if f.lower().endswith(bg.EXTS))
        if rel == '.' or not photos:
            continue
        folder = rel.replace(os.sep, '/')
        cover = bg.cover_for(folder, photos)
        original = os.path.join(bg.ORIGINALS_DIR, folder, cover)
        where = '%s/%s' % (quote(folder), quote(cover))
        out.append((bg.slug(folder), bg.title_for(folder), len(photos),
                    (bg.FULL_BASE if os.path.isfile(original) else bg.THUMB_BASE) + where))
    return out


def fingerprint(words):
    """What a card was drawn from (its words, and an album's photo and focus), with the card's design."""
    h = hashlib.sha256(json.dumps(words, sort_keys=True, ensure_ascii=False).encode('utf-8'))
    h.update(io.open(CARD, 'rb').read().replace(b'\r\n', b'\n'))
    return h.hexdigest()[:16]


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + '\n')


ABOUT = ("Each gallery album's link-preview card, for the club's API (GET https://api.ncan.nz/g/<album>.jpg), "
         'which lays the overlay over the photo. Written by tools/build-page-meta.py --images.')


def draw_images(data, only=None, check=False):
    """(drawn, problems, album list): each listed page's card and each album's
    overlay, when missing or out of date, and the album list
    (assets/data/album-cards.json). The albums come from the local copy of the
    photo host; without it (as in CI) the list kept is checked against the
    overlays instead."""
    try:
        drawn_before = json.load(io.open(DRAWN, encoding='utf-8'))
    except (OSError, ValueError):
        drawn_before = {}
    done, problems, todo = dict(drawn_before), [], []
    for address in (data.get('pages') or {}):
        meta = pm.page(data, address)
        name = pm.card_name(address)
        words = {'headline': meta['headline'], 'line': meta['line']}
        todo.append((name, words, os.path.join(pm.CARD_DIR, name + '.jpg')))
    kept = pm.album_cards()
    found = albums(load_gallery())
    if found:
        cards = {}
        for s, title, count, cover in found:
            meta = pm.album(data, s, title, count, cards={})
            focus = ((data.get('albums') or {}).get(s) or {}).get('focus')
            words = {'headline': meta['headline'], 'line': meta['line'], 'overlay': True, 'photo': cover}
            if focus:
                words['focus'] = focus
            cards[s] = {'photo': cover, 'overlay': pm.ALBUM_OVERLAY_URL + s + '.png', 'v': fingerprint(words)}
            if focus:
                cards[s]['focus'] = focus
            todo.append(('album:' + s, words, os.path.join(pm.ALBUM_OVERLAYS, s + '.png')))
        if check and cards != kept:
            problems.append('assets/data/album-cards.json is out of step with the albums')
    else:
        if not check:
            problems.append('no album photos at %s: album overlays not drawn (set NCAN_PHOTOS_DIR)'
                            % load_gallery().GALLERY_DIR)
        cards = kept
        for s, c in kept.items():                   # what the list names must be there
            if not os.path.isfile(os.path.join(pm.ALBUM_OVERLAYS, s + '.png')):
                problems.append('album:%s: its overlay is missing' % s)
            elif drawn_before.get('album:' + s) != c.get('v'):
                problems.append('album:%s: its overlay is out of date' % s)
    drawn = []
    for key, words, out in todo:
        name = key.split(':', 1)[-1]
        stamp = fingerprint(words)
        fresh = os.path.isfile(out) and drawn_before.get(key) == stamp
        if only and name != only:
            continue
        if fresh and not only:
            continue
        if check:
            problems.append('%s: %s' % (key, 'out of date' if os.path.isfile(out) else 'not drawn yet'))
            continue
        draw({k: v for k, v in words.items() if k not in ('photo', 'focus')}, out)
        done[key] = stamp
        drawn.append(os.path.relpath(out, os.path.dirname(ROOT)))
    if not check:
        if found:
            for s in set(kept) - set(cards):       # an album taken down: its overlay goes too
                done.pop('album:' + s, None)
                try:
                    os.remove(os.path.join(pm.ALBUM_OVERLAYS, s + '.png'))
                except OSError:
                    pass
            write_json(pm.ALBUM_LIST, {'about': ABOUT, 'albums': cards})
        write_json(DRAWN, done)
    return drawn, problems, cards


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--images', action='store_true', help='draw the share images that are missing or out of date')
    ap.add_argument('--only', help='draw this one again: a page (calendar, home) or an album')
    ap.add_argument('--check', action='store_true', help='change nothing; say what is out of step')
    a = ap.parse_args()
    data = pm.load()
    changed, problems = write_heads(data, check=a.check)
    print('%s %d page head(s)' % ('would change' if a.check else 'updated', len(changed)))
    for c in changed:
        print('   ' + c)
    cards = pm.album_cards()
    if a.images or a.only or a.check:
        drawn, more, cards = draw_images(data, only=a.only, check=a.check)
        problems += more
        for d in drawn:
            print('   drew ' + d)
    album_changed, more = write_album_heads(cards, check=a.check)
    changed += album_changed
    problems += more
    for c in album_changed:
        print('   %s image lines: %s' % ('would change' if a.check else 'updated', c))
    for p in problems:
        print('   ! ' + p)
    return 1 if (a.check and (changed or problems)) else 0


if __name__ == '__main__':
    sys.exit(main())
