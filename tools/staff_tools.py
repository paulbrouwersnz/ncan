# -*- coding: utf-8 -*-
"""The staff tools cards, written from one list (partials/staff-tools.json).

/admin/ is the one staff tools page, for coaches, the committee and admins.
It carries marker comments, and tools/sync-partials.py replaces what sits
between them with every group of cards:

    <!-- @tools:admin -->  ... generated ...  <!-- /@tools:admin -->

Each group is wrapped in <div class="admin-tools__group" data-lowest="...">,
and admin.js shows only the groups the signed-in role reaches (an admin can
"View as" a coach or the committee). Hiding is only for tidiness: each tool's
own page, and the club's API behind it, still refuse anyone below its role.
"""
import html
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.path.join(ROOT, 'partials', 'staff-tools.json')
RANK = ['coach', 'committee', 'admin']
# each marked page and the role it is for
PAGES = {'admin': 'admin'}
INDENT = '        '


def load(path=LIST):
    with io.open(path, encoding='utf-8') as fh:
        return json.load(fh)


def check(data, exists=None):
    """Problems with the list, as sentences ([] when it is fine). exists(href)
    says whether an address is a page on the site; left out, they aren't checked."""
    out = []
    groups = data.get('groups') or []
    names = [g.get('name') for g in groups]
    for g in groups:
        if g.get('lowest') not in RANK:
            out.append('group %r: lowest must be one of %s' % (g.get('name'), ', '.join(RANK)))
    if len(set(names)) != len(names):
        out.append('two groups share a name')
    seen = set()
    for t in data.get('tools') or []:
        title = t.get('title') or '(no title)'
        for key in ('title', 'href', 'blurb', 'lowest', 'group'):
            if not t.get(key):
                out.append('%s: %s is missing' % (title, key))
        if t.get('lowest') and t['lowest'] not in RANK:
            out.append('%s: lowest must be one of %s' % (title, ', '.join(RANK)))
        if t.get('group') and t['group'] not in names:
            out.append('%s: no group called %r' % (title, t['group']))
        elif t.get('group'):
            g = groups[names.index(t['group'])]
            if t.get('lowest') in RANK and g.get('lowest') in RANK \
                    and RANK.index(t['lowest']) != RANK.index(g['lowest']):
                # a coach tool in an admin group would be hidden from coaches,
                # an admin tool in the coaches' group shown to them
                out.append('%s: lowest %s does not match its group (%s)'
                           % (title, t['lowest'], g['lowest']))
        href = t.get('href') or ''
        if href and not href.startswith('/'):
            out.append('%s: href must start with / (a page on this site)' % title)
        elif href and exists and not exists(href):
            out.append('%s: %s is not a page on the site' % (title, href))
        if href and href in seen:
            out.append('%s: %s is listed twice' % (title, href))
        seen.add(href)
    return out


def groups_for(data, role):
    """[(group, tools)] shown on role's page, in list order; empty groups left out."""
    reach = RANK.index(role)
    shown = []
    for g in data['groups']:
        if RANK.index(g['lowest']) > reach:
            continue
        tools = [t for t in data['tools'] if t['group'] == g['name']]
        if tools:
            shown.append((g, tools))
    return shown


def esc(text):
    return html.escape(text, quote=False)


def card(t, pad):
    badge = ''
    if t.get('count'):
        badge = ' <span class="admin-count" id="admin-count-%s" hidden></span>' % esc(t['count'])
    return '\n'.join([
        pad + '<article class="card">',
        pad + '  <div class="card__body">',
        pad + '    <h3><a class="card__link" href="%s">%s</a>%s</h3>'
        % (html.escape(t['href']), esc(t['title']), badge),
        pad + '    <p>%s</p>' % esc(t['blurb']),
        pad + '  </div>',
        pad + '</article>',
    ])


def render(data, page, nl='\n'):
    """The markup between a page's markers: every group its role reaches, each
    wrapped with its lowest role for admin.js to show or hide."""
    role = PAGES[page]
    lines = []
    for g, tools in groups_for(data, role):
        lines.append(INDENT + '<div class="admin-tools__group" data-lowest="%s">' % esc(g['lowest']))
        pad = INDENT + '  '
        lines.append(pad + '<h2 class="admin-tools__head">%s</h2>' % esc(g['name']))
        lines.append(pad + '<div class="cards">')
        lines.extend(card(t, pad + '  ') for t in tools)
        lines.append(pad + '</div>')
        if g.get('more'):
            lines.append(pad + '<p class="admin-tools__note">%s</p>' % esc(g['more']))
        lines.append(INDENT + '</div>')
    return nl + nl.join(nl.join(lines).split('\n')) + nl + INDENT


def apply(text, data):
    """(text with every @tools block it carries rewritten, [blocks changed])."""
    nl = '\r\n' if '\r\n' in text else '\n'
    changed = []
    for page in PAGES:
        open_tag = '<!-- @tools:%s -->' % page
        close_tag = '<!-- /@tools:%s -->' % page
        if open_tag not in text or close_tag not in text:
            continue
        start = text.index(open_tag) + len(open_tag)
        end = text.index(close_tag)
        block = render(data, page, nl)
        if text[start:end] != block:
            text = text[:start] + block + text[end:]
            changed.append('tools:' + page)
    return text, changed
