# -*- coding: utf-8 -*-
"""Sync the shared header and footer into every page.

Edit partials/header.html and partials/footer.html, then run:

    python tools/sync-partials.py

Each page carries marker comments; everything between them is regenerated, so
the pages stay plain static HTML with no runtime includes.

    <!-- @partial:header -->  ... generated ...  <!-- /@partial:header -->

Links in the partials are written as if from a page other than the home page
(index.html#training). When writing into index.html those are rewritten to
plain anchors (#training) so in-page links do not reload the page. The nav link
matching the page being written gets aria-current="page".
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIALS = ('header', 'footer')


def read(path):
    return io.open(path, encoding='utf-8').read()


def localise(markup, page):
    """Rewrite links in the partial for the page it is being written into."""
    if page == 'index.html':
        markup = markup.replace('href="index.html#', 'href="#')
        markup = markup.replace('href="index.html"', 'href="#top"')

    # mark the current page in the nav
    def mark(m):
        tag, href = m.group(0), m.group(1)
        if href.split('#')[0] == page or (page == 'index.html' and href in ('#top', '')):
            return tag  # the brand link is not a nav item; leave it alone
        return tag

    markup = re.sub(r'\s+aria-current="page"', '', markup)
    pattern = r'(<li><a href="%s")' % re.escape(page)
    markup = re.sub(pattern, r'\1 aria-current="page"', markup)
    return markup


def sync(page_path):
    page = os.path.basename(page_path)
    html = read(page_path)
    changed = []

    for name in PARTIALS:
        partial = read(os.path.join(ROOT, 'partials', '%s.html' % name)).rstrip('\n')
        open_tag = '<!-- @partial:%s -->' % name
        close_tag = '<!-- /@partial:%s -->' % name

        if open_tag not in html or close_tag not in html:
            print('   ! %s: no %s markers, skipped' % (page, name))
            continue

        start = html.index(open_tag) + len(open_tag)
        end = html.index(close_tag)
        block = '\n' + localise(partial, page) + '\n'

        if html[start:end] != block:
            html = html[:start] + block + html[end:]
            changed.append(name)

    if changed:
        io.open(page_path, 'w', encoding='utf-8', newline='').write(html)
    print('   %s: %s' % (page, ', '.join(changed) if changed else 'already up to date'))
    return bool(changed)


def main():
    pages = [os.path.join(ROOT, f) for f in sorted(os.listdir(ROOT))
             if f.endswith('.html')]
    print('syncing partials into %d page(s):' % len(pages))
    any_changed = False
    for p in pages:
        any_changed |= sync(p)
    print('done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
