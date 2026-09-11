# -*- coding: utf-8 -*-
"""Rebuild the AGM list in committee.html from the files in assets/docs/agm/.

Drop PDFs into assets/docs/agm/<year>/ and run:

    python tools/build-agm-list.py            # 5 most recent years shown
    python tools/build-agm-list.py --recent 3 # show 3, fold the rest away

The most recent years are listed directly; anything older goes inside a
<details> block the reader can expand (no JavaScript needed). The markup
between the markers below is regenerated, so do not hand-edit it.

    <!-- @generated:agm -->  ...  <!-- /@generated:agm -->
"""
import argparse, io, os, re, sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGM_DIR = os.path.join(ROOT, 'assets', 'docs', 'agm')
PAGE = os.path.join(ROOT, 'committee.html')

OPEN, CLOSE = '<!-- @generated:agm -->', '<!-- /@generated:agm -->'
DEFAULT_RECENT = 5

# filename pattern -> (label, sort order)
RULES = [
    (r'agm\s*minutes|^\d{4}\s*agm\b|\bminutes\b', 'Minutes', 0),
    (r'president', "President's report", 1),
    (r'child', "Children's report", 2),
    (r'coach', "Coach's report", 3),
    (r'treasur|financ|account', 'Financial statements', 4),
    (r'agenda|notice', 'Notice & agenda', 5),
]


def describe(filename):
    stem = os.path.splitext(filename)[0]
    low = stem.lower()
    for pattern, label, order in RULES:
        if re.search(pattern, low):
            return label, order
    return stem, 9


def esc(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def collect():
    """[(year, [(order, label, href), ...]), ...] newest first, empty years dropped."""
    if not os.path.isdir(AGM_DIR):
        return [], []

    years = sorted([d for d in os.listdir(AGM_DIR)
                    if os.path.isdir(os.path.join(AGM_DIR, d)) and d.isdigit()],
                   reverse=True)

    found, empty = [], []
    for year in years:
        files = sorted(f for f in os.listdir(os.path.join(AGM_DIR, year))
                       if f.lower().endswith('.pdf'))
        if not files:
            empty.append(year)
            continue
        docs = []
        for f in files:
            label, order = describe(f)
            docs.append((order, label, 'assets/docs/agm/%s/%s' % (year, quote(f))))
        docs.sort(key=lambda d: (d[0], d[1].lower()))
        found.append((year, docs))
    return found, empty


def render_year(year, docs, indent):
    pad = ' ' * indent
    items = '\n'.join(
        '%s    <li><a href="%s">%s</a> <span class="doc__type">PDF</span></li>'
        % (pad, href, esc(label)) for _, label, href in docs)
    return ('%s<li class="agm">\n'
            '%s  <div class="agm__year">\n'
            '%s    <h3>%s AGM</h3>\n'
            '%s    <p class="agm__when">%d paper%s</p>\n'
            '%s  </div>\n'
            '%s  <ul class="agm__docs">\n'
            '%s\n'
            '%s  </ul>\n'
            '%s</li>'
            % (pad, pad, pad, year, pad, len(docs), '' if len(docs) == 1 else 's',
               pad, pad, items, pad, pad))


def build(recent):
    found, empty = collect()
    if not found:
        print('no AGM papers found under %s' % AGM_DIR)
        return 1

    shown, older = found[:recent], found[recent:]

    parts = ['      <ul class="agm-list" data-reveal>',
             '\n\n'.join(render_year(y, d, 8) for y, d in shown),
             '      </ul>']

    if older:
        older_papers = sum(len(d) for _, d in older)
        span = ('%s&ndash;%s' % (older[0][0], older[-1][0])
                if len(older) > 1 else older[0][0])
        parts += [
            '',
            '      <details class="agm-more">',
            '        <summary>',
            '          <span class="agm-more__label">Earlier annual general meetings</span>',
            '          <span class="agm-more__meta">%s &middot; %d paper%s</span>'
            % (span, older_papers, '' if older_papers == 1 else 's'),
            '          <span class="agm-more__chev" aria-hidden="true"></span>',
            '        </summary>',
            '        <ul class="agm-list agm-list--earlier">',
            '\n\n'.join(render_year(y, d, 10) for y, d in older),
            '        </ul>',
            '      </details>',
        ]

    markup = '\n'.join(parts)

    html = io.open(PAGE, encoding='utf-8').read()
    if OPEN not in html or CLOSE not in html:
        print('markers not found in committee.html - add:\n  %s\n  %s' % (OPEN, CLOSE))
        return 1

    start, end = html.index(OPEN) + len(OPEN), html.index(CLOSE)
    io.open(PAGE, 'w', encoding='utf-8', newline='').write(
        html[:start] + '\n' + markup + '\n      ' + html[end:])

    print('AGM list rebuilt: %d year(s) shown, %d folded away' % (len(shown), len(older)))
    for y, d in shown:
        print('   %s  %d document(s)' % (y, len(d)))
    for y, d in older:
        print('   %s  %d document(s)   (in "earlier" block)' % (y, len(d)))
    if empty:
        print('empty (skipped): %s' % ', '.join(empty))
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--recent', type=int, default=DEFAULT_RECENT,
                    help='how many years to show before folding (default %d)' % DEFAULT_RECENT)
    sys.exit(build(ap.parse_args().recent))
