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
the club's general picture (assets/img/share.png). Gallery album pages are left
to tools/build-gallery.py, which writes the same lines from the file's "albums".

The images (1200 x 630) are drawn from tools/share-card.html with a headless
Chrome or Edge:
  - each listed page's card, on the club's green: assets/img/share/<page>.jpg
    (home.jpg for the home page)
  - each album's card, its cover photo behind the words: share/<album>.jpg in the
    local copy of the photo host (NCAN_PHOTOS_DIR, or ../ncan-gallery), to be
    uploaded with the photos. Album photos are never kept in this repository.
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


# ------------------------------------------------------------------ the images

def browser():
    for b in BROWSERS:
        if os.path.isfile(b) or shutil.which(b):
            return b
    sys.exit('No Chrome or Edge found.')


def file_url(path):
    return 'file:///' + quote(os.path.abspath(path).replace(os.sep, '/').lstrip('/'), safe='/:')


def draw(words, out, quality=None):
    """Draw the card for words ({headline, line, photo?}) to out (.png, or .jpg at quality)."""
    url = file_url(CARD) + '#' + quote(json.dumps(words, ensure_ascii=False), safe='')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, 'card.png')
        subprocess.run([browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--allow-file-access-from-files', '--user-data-dir=' + os.path.join(tmp, 'p'),
                        '--force-device-scale-factor=1', '--window-size=1200,630',
                        '--virtual-time-budget=3000', '--screenshot=' + png, url],
                       check=True, capture_output=True)
        from PIL import Image
        img = Image.open(png).convert('RGB')
        if out.lower().endswith('.jpg'):
            img.save(out, 'JPEG', quality=quality or 84, optimize=True, progressive=True)
        else:
            img.save(out, 'PNG', optimize=True)


def load_gallery():
    spec = importlib.util.spec_from_file_location('build_gallery', os.path.join(ROOT, 'tools', 'build-gallery.py'))
    bg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bg)
    return bg


def albums(bg):
    """[(slug, title, count, cover path)] from the local copy of the photo host."""
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
        out.append((bg.slug(folder), bg.title_for(folder), len(photos),
                    original if os.path.isfile(original) else os.path.join(bg.GALLERY_DIR, folder, cover)))
    return out


def fingerprint(words, photo=None):
    h = hashlib.sha256(json.dumps(words, sort_keys=True, ensure_ascii=False).encode('utf-8'))
    h.update(io.open(CARD, 'rb').read())
    if photo:
        h.update(io.open(photo, 'rb').read())
    return h.hexdigest()[:16]


def draw_images(data, only=None, check=False):
    """(drawn, problems): each listed page's card and each album's, when missing or out of date."""
    try:
        drawn_before = json.load(io.open(DRAWN, encoding='utf-8'))
    except (OSError, ValueError):
        drawn_before = {}
    done, problems, todo = dict(drawn_before), [], []
    for address in (data.get('pages') or {}):
        meta = pm.page(data, address)
        name = pm.card_name(address)
        words = {'headline': meta['headline'], 'line': meta['line']}
        todo.append((name, words, None, os.path.join(pm.CARD_DIR, name + '.jpg')))
    bg = load_gallery()
    found = albums(bg)
    if not found and not check:
        problems.append('no album photos at %s: album cards not checked (set NCAN_PHOTOS_DIR)' % bg.GALLERY_DIR)
    share_dir = os.path.join(os.path.dirname(bg.GALLERY_DIR), 'share')
    for s, title, count, cover in found:
        meta = pm.album(data, s, title, count)
        words = {'headline': meta['headline'], 'line': meta['line'], 'photo': file_url(cover)}
        focus = ((data.get('albums') or {}).get(s) or {}).get('focus')
        if focus:
            words['focus'] = focus
        todo.append(('album:' + s, words, cover, os.path.join(share_dir, s + '.jpg')))
    drawn = []
    for key, words, photo, out in todo:
        name = key.split(':', 1)[-1]
        stamp = fingerprint({k: v for k, v in words.items() if k != 'photo'}, photo)
        fresh = os.path.isfile(out) and drawn_before.get(key) == stamp
        if only and name != only:
            continue
        if fresh and not only:
            continue
        if check:
            problems.append('%s: %s' % (key, 'out of date' if os.path.isfile(out) else 'not drawn yet'))
            continue
        draw(words, out)
        done[key] = stamp
        drawn.append(os.path.relpath(out, os.path.dirname(ROOT)))
    if not check:
        io.open(DRAWN, 'w', encoding='utf-8', newline='\n').write(json.dumps(done, indent=1, sort_keys=True) + '\n')
    return drawn, problems


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
    if a.images or a.only or a.check:
        drawn, more = draw_images(data, only=a.only, check=a.check)
        problems += more
        for d in drawn:
            print('   drew ' + d)
    for p in problems:
        print('   ! ' + p)
    return 1 if (a.check and (changed or problems)) else 0


if __name__ == '__main__':
    sys.exit(main())
