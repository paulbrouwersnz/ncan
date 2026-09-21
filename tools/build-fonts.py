#!/usr/bin/env python3
"""
build-fonts.py

Builds the self-hosted web fonts in assets/fonts/ so no page has to talk to
Google.

The site used to load Inter and Archivo from fonts.googleapis.com, which cost
two third-party connections on every page and 164 KB of font data - 83 KB of
which was Inter's "latin-ext" file, pulled in to render eight macrons. This
downloads the upstream variable fonts, cuts them down to the characters the
site actually uses, and writes one woff2 per family.

Both families are variable, so a single file covers every weight the CSS
asks for: Inter 400-700 and Archivo 600-800.

    ------------------------------------------------------------------
    SUBSETTING HAS A FAILURE MODE WORTH KNOWING. A character that is not
    in the subset will not render in Inter or Archivo - the browser will
    silently fall back to Segoe UI for that one character, mid-word.
    ------------------------------------------------------------------

To keep that from biting, the character set is not hard-coded. It is:

  * every character in the site's own .html files,
  * every character in the calendar feeds under assets/calendar/, since
    those supply event text at runtime,
  * plus a safety baseline: printable ASCII, the Latin-1 letters (European
    names), the te reo Maori macrons, and the punctuation the CSS and JS
    emit (arrows, bullets, curly quotes, dashes).

So re-running this after a content change keeps the subset honest. Run it
whenever you add a page or notice a character rendering in the wrong face.

Usage:
    python tools/build-fonts.py
        Rebuild assets/fonts/*.woff2 and report the sizes.

    python tools/build-fonts.py --check
        Report what would change and write nothing. Exits 1 if the fonts
        are out of date, so it works as a pre-publish check.

    python tools/build-fonts.py --report-chars
        List the characters that went into the subset, and where each
        unusual one came from. Useful when a glyph goes missing.
"""

import argparse
import glob
import io
import os
import re
import sys
import unicodedata
import urllib.request

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    sys.exit('build-fonts.py needs fontTools:  python -m pip install "fonttools[woff]"')

try:
    import brotli  # noqa: F401  - fontTools needs it to write woff2
except ImportError:
    sys.exit('build-fonts.py needs brotli:  python -m pip install brotli')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, 'assets', 'fonts')
CALENDAR_DIR = os.path.join(ROOT, 'assets', 'calendar')

# The upstream variable fonts, straight from Google's own repository. These
# are the full files - the subsetting below is ours, not theirs.
FAMILIES = [
    {
        'name': 'Inter',
        'file': 'inter-variable.woff2',
        'url': 'https://github.com/google/fonts/raw/main/ofl/inter/'
               'Inter%5Bopsz,wght%5D.ttf',
        # opsz stays variable: the CSS relies on font-optical-sizing: auto,
        # which quietly improves small text. wght is the axis the site uses.
        'pin': {},
        'weights': '400 700',
    },
    {
        'name': 'Archivo',
        'file': 'archivo-variable.woff2',
        'url': 'https://github.com/google/fonts/raw/main/ofl/archivo/'
               'Archivo%5Bwdth,wght%5D.ttf',
        # the site never varies width, so pinning it to normal drops a whole
        # axis worth of deltas
        'pin': {'wdth': 100},
        'weights': '600 800',
    },
]

# Characters the pages cannot be scanned for: emitted by CSS content, by the
# JavaScript, or simply likely enough in future copy to be worth carrying.
BASELINE = set(chr(c) for c in range(0x20, 0x7F))              # printable ASCII
BASELINE |= set(chr(c) for c in range(0xA0, 0x100))            # Latin-1
BASELINE |= set('ĀāĒēĪī'         # Maori macrons
                'ŌōŪū')
BASELINE |= set('‐‑–—‘’“'   # dashes, quotes
                '”…•·→←×'   # ... bullet arrows
                '©™®€£')


def read_text(path):
    try:
        with io.open(path, encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def scan_sources():
    """Characters used by the site, with a note of where each one came from."""
    origins = {}

    def note(text, where):
        for ch in text:
            if ch in ('\n', '\r', '\t'):
                continue
            origins.setdefault(ch, set()).add(where)

    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        note(read_text(path), os.path.basename(path))

    if os.path.isdir(CALENDAR_DIR):
        for name in sorted(os.listdir(CALENDAR_DIR)):
            if name.lower().endswith('.ics'):
                note(read_text(os.path.join(CALENDAR_DIR, name)),
                     'calendar/' + name)

    for ch in BASELINE:
        origins.setdefault(ch, set()).add('baseline')

    return origins


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'build-fonts.py'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def build_one(family, chars, out_dir, write=True):
    """Subset one family. Returns (path, size, source_size)."""
    raw = fetch(family['url'])
    font = TTFont(io.BytesIO(raw))

    if family['pin']:
        font = instancer.instantiateVariableFont(font, family['pin'],
                                                 updateFontNames=False)

    options = subset.Options()
    options.flavor = 'woff2'
    options.desubroutinize = False
    options.hinting = False
    options.legacy_kern = False
    options.notdef_outline = False
    # keep the bits that make text look right, drop the rest
    options.layout_features = ['kern', 'liga', 'clig', 'calt', 'ccmp',
                               'locl', 'mark', 'mkmk', 'rlig']
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]   # keep the OFL licence
    options.drop_tables += ['DSIG']
    options.recalc_bounds = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[ord(c) for c in chars])
    subsetter.subset(font)

    buf = io.BytesIO()
    font.flavor = 'woff2'
    font.save(buf)
    data = buf.getvalue()

    path = os.path.join(out_dir, family['file'])
    if write:
        if not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        tmp = path + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)

    return path, len(data), len(raw)


def main():
    ap = argparse.ArgumentParser(
        description='Build the self-hosted subsetted web fonts.')
    ap.add_argument('--check', action='store_true',
                    help='report what would change and write nothing')
    ap.add_argument('--report-chars', action='store_true',
                    help='list the characters in the subset and their source')
    args = ap.parse_args()

    origins = scan_sources()
    chars = set(origins)

    if args.report_chars:
        unusual = sorted((c for c in chars if ord(c) > 0x7E), key=ord)
        print('%d character(s) in the subset, %d of them beyond ASCII:'
              % (len(chars), len(unusual)))
        for ch in unusual:
            where = ', '.join(sorted(origins[ch]))
            print('   U+%04X  %-36s %s'
                  % (ord(ch), unicodedata.name(ch, '?')[:36], where[:44]))
        return 0

    print('subset: %d character(s) from %d page(s) plus the baseline'
          % (len(chars), len(glob.glob(os.path.join(ROOT, '*.html')))))

    total_new = 0
    changed = False
    for family in FAMILIES:
        path, size, source = build_one(family, chars, FONT_DIR,
                                       write=not args.check)
        old = os.path.getsize(path) if os.path.exists(path) and args.check else None
        total_new += size
        note = ''
        if args.check:
            if old is None:
                note, changed = '  (new)', True
            elif old != size:
                note, changed = '  (was %.1f KB)' % (old / 1024.0), True
            else:
                note = '  (unchanged)'
        print('   %-24s %6.1f KB   from %.0f KB upstream%s'
              % (family['file'], size / 1024.0, source / 1024.0, note))

    print('total: %.1f KB for %d file(s)' % (total_new / 1024.0, len(FAMILIES)))

    if args.check:
        print('check only - nothing written.'
              if changed else 'fonts are up to date.')
        return 1 if changed else 0

    print('written to %s' % os.path.relpath(FONT_DIR, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
