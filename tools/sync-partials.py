# -*- coding: utf-8 -*-
"""Sync the shared head, header and footer into every page.

Edit partials/head.html, partials/header.html, partials/footer.html or
partials/staff-tools.json (the staff tools cards), then run:

    python tools/sync-partials.py

Each page carries marker comments; everything between them is regenerated, so
the pages stay plain static HTML with no runtime includes.

    <!-- @partial:header -->  ... generated ...  <!-- /@partial:header -->

partials/head.html holds only what every page shares - charset, viewport, the
icons, the font preloads and the stylesheet. The four things that differ per
page (title, description, og:title, og:description) stay in the page itself,
below the markers.

At publish time the stylesheet and script links get a cache-busting stamp
(tools/stamp-assets.py, run after this one, stamps partials/head.html and the
pages alike). The stamps aren't committed.

Links in the partials are written from the site root (/#training, /calendar/),
because the pages live in folders (calendar/index.html; see tools/pages.py).
When writing into the home page, /#training becomes a plain anchor (#training)
so in-page links do not reload the page. The nav link matching the page being
written gets aria-current="page".
"""
import io, os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pages import pages as site_pages  # noqa: E402
import staff_tools  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# head first, so a page reads in the order it is written
PARTIALS = ('head', 'header', 'footer')
STAFF_TOOLS = None  # partials/staff-tools.json, loaded in main()


ATTEMPTS = 5


def retry(action, attempts=ATTEMPTS):
    """Run an action that touches a file, giving a transient lock time to clear.

    On Windows an editor, sync client or virus scanner can hold a file open for
    a moment, which surfaces here as EACCES or EINVAL. Retrying briefly turns a
    hard failure into a pause.
    """
    for attempt in range(attempts):
        try:
            return action()
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.2 * (attempt + 1))


def read(path):
    return retry(lambda: io.open(path, encoding='utf-8').read())


def localise(markup, page):
    """Rewrite links in the partial for the page it is being written into
    (page: its address, '/' or '/calendar/')."""
    if page == '/':
        markup = markup.replace('href="/#', 'href="#')
        markup = markup.replace('href="/"', 'href="#top"')

    # mark the current page in the nav
    def mark(m):
        tag, href = m.group(0), m.group(1)
        if href.split('#')[0] == page or (page == '/' and href in ('#top', '')):
            return tag  # the brand link is not a nav item; leave it alone
        return tag

    markup = re.sub(r'\s+aria-current="page"', '', markup)
    pattern = r'(<li><a href="%s")' % re.escape(page)
    markup = re.sub(pattern, r'\1 aria-current="page"', markup)
    return markup


def write_atomic(path, text, attempts=ATTEMPTS):
    """Replace a file in one step, retrying a briefly locked target.

    A direct open(path, 'w') truncates before it writes, so a failure midway
    leaves a half-written page. Windows also raises EINVAL/EACCES here when an
    editor or scanner momentarily holds the file, which has bitten this script
    mid-run and left some pages synced and others not.
    """
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)
    try:
        retry(lambda: os.replace(tmp, path), attempts)
    except OSError:
        os.remove(tmp)
        raise


def sync(page_path, page):
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

    # the staff tools cards, from partials/staff-tools.json (tools/staff_tools.py)
    html, tools_changed = staff_tools.apply(html, STAFF_TOOLS)
    changed += tools_changed

    if changed:
        write_atomic(page_path, html)
    print('   %s: %s' % (page, ', '.join(changed) if changed else 'already up to date'))
    return bool(changed)


def main():
    global STAFF_TOOLS
    STAFF_TOOLS = staff_tools.load()
    problems = staff_tools.check(STAFF_TOOLS)
    if problems:
        print('partials/staff-tools.json has problems:')
        for p in problems:
            print('   ! ' + p)
        return 1
    pages = site_pages(ROOT)
    print('syncing partials into %d page(s):' % len(pages))
    any_changed = False
    failed = []
    for _, address, p in pages:
        # a page we cannot read or write is reported and skipped - stopping here
        # would leave some pages synced and the rest stale, which is worse
        try:
            any_changed |= sync(p, address)
        except OSError as err:
            failed.append(address)
            print('   ! %s: %s' % (address, err))

    if failed:
        print('done, but %d page(s) were not synced: %s'
              % (len(failed), ', '.join(failed)))
        print('nothing was half-written - run again once they are free.')
        return 1

    print('done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
