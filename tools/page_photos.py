# -*- coding: utf-8 -*-
"""Header photos: reading and checking assets/data/page-photos.json.

Shared by tools/make-head-photo.py (writes each page's first photo into the
page and checks the file) and tools/build-gallery.py (keeps the album pages'
entries up to date). assets/js/page-photos.js resolves pools the same way in
the browser; the file's layout is described at the top of that script and in
tools/README.md ("Header photos").

Standard library only.
"""
import datetime
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'assets', 'data', 'page-photos.json')

PHOTO_HOST = 'https://photos.ncan.nz/'
LOCAL_PREFIX = '/assets/'
MAX_DEPTH = 4
FOCUS = re.compile(r'^(\d{1,3})% (\d{1,3})%$')
TAG = re.compile(r'^[a-z0-9][a-z0-9-]*$')
HASH = re.compile(r'^#/[a-z0-9][a-z0-9/-]*(\*)?$|^#/\*$')
PLAN_DATE = re.compile(r'#/plan/(\d{4}-\d{2}-\d{2})$')
OLD_PLAN_DAYS = 400

POOL_KEYS = {'include', 'photos', 'exclude', 'pick', 'public', 'note'}
PAGE_KEYS = {'pool', 'photos', 'photo', 'focus', 'public', 'source', 'note'}
PHOTO_KEYS = {'src', 'webp', 'tags', 'focus', 'note'}


class PhotoError(Exception):
    pass


def load(path=DATA, raw=False):
    """The file's settings. At publish time tools/fetch-page-photos.py adds the
    ones changed on the Club admin page (from the club's API) as an "api"
    part; they are laid over the file's (overlay()) unless raw is True, as
    when the file is to be written back (tools/build-gallery.py)."""
    with io.open(path, encoding='utf-8') as f:
        data = json.load(f)
    if raw or 'api' not in data:
        return data
    return overlay(data, data.get('api') or {})


def overlay(base, layer):
    """base's settings with layer's laid over them: a pool or page entry in
    layer replaces base's of the same name; the rest of base's are kept (the
    gallery album entries, say). The same as overlay() in page-photos.js."""
    out = {'about': base.get('about', '')}
    for part in ('pools', 'pages'):
        merged = dict(base.get(part) or {})
        merged.update(layer.get(part) or {})
        out[part] = merged
    return out


def save(data, path=DATA):
    """Write the file back: pools and pages sorted, one photo per line."""
    out = {'about': data.get('about', ''),
           'pools': dict(sorted(data.get('pools', {}).items())),
           'pages': dict(sorted(data.get('pages', {}).items()))}
    text = json.dumps(out, indent=2, ensure_ascii=False) + '\n'
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def photo_of(p, pool=''):
    if isinstance(p, str):
        return {'src': p, 'webp': p, 'tags': [], 'focus': '', 'pool': pool}
    return {'src': p.get('src'), 'webp': p.get('webp') or p.get('src'),
            'tags': p.get('tags') or [], 'focus': p.get('focus') or '', 'pool': pool}


def pool_spec(data, name):
    spec = data.get('pools', {}).get(name)
    if spec is None:
        raise PhotoError('no pool "%s"' % name)
    return {'photos': spec} if isinstance(spec, list) else spec


def pool_groups(data, name, depth=1, stack=()):
    """[[photo, ...], ...]: one group per included pool and one for the pool's
    own photos, each photo once, excluded photos dropped (as page-photos.js)."""
    if name in stack:
        raise PhotoError('pool "%s" includes itself' % name)
    if depth > MAX_DEPTH:
        raise PhotoError('pools nested more than %d deep at "%s"' % (MAX_DEPTH, name))
    spec = pool_spec(data, name)
    groups = []
    for child in spec.get('include', []):
        flat = []
        for g in pool_groups(data, child, depth + 1, stack + (name,)):
            flat += g
        groups.append(flat)
    groups.append([photo_of(p, name) for p in spec.get('photos', [])])
    seen = set()
    gone = set(spec.get('exclude', []))
    out = []
    for g in groups:
        kept = []
        for p in g:
            if p['src'] in seen or p['src'] in gone:
                continue
            seen.add(p['src'])
            kept.append(p)
        if kept:
            out.append(kept)
    return out


def pools_reached(data, name, stack=()):
    """Every pool a pool takes photos from, itself included."""
    if name in stack:
        return set()
    out = {name}
    for child in pool_spec(data, name).get('include', []):
        out |= pools_reached(data, child, stack + (name,))
    return out


def entry_groups(data, entry):
    if entry.get('photo') == 'none':
        return []
    if entry.get('pool'):
        groups = pool_groups(data, entry['pool'])
        if pool_spec(data, entry['pool']).get('pick') == 'by-pool':
            return groups
        flat = [p for g in groups for p in g]
        return [flat] if flat else []
    own = [photo_of(p) for p in entry.get('photos', [])]
    return [own] if own else []


def first_photo(data, entry):
    """The photo written into the page: the first one the entry would pick from."""
    groups = entry_groups(data, entry)
    return groups[0][0] if groups else None


def needs_script(data, page, entry):
    """True when assets/js/page-photos.js has work to do on the page: more than
    one photo to pick from, or #/... entries of its own."""
    if any(key.startswith(page + '#') for key in data.get('pages', {})):
        return True
    if not entry:
        return False
    return sum(len(g) for g in entry_groups(data, entry)) > 1


def pick_data(data, page):
    """The choices the page's picker script needs (tools/head-photo-pick.js):
    {"p": [photo, ...], "e": {key: {"g": [[index, ...], ...], "f": focus}}}
    for the page's entry and its #/... entries. Each photo is listed once, as
    [src], [src, webp] or [src, webp, focus]."""
    photos, index, entries = [], {}, {}
    for key, entry in sorted(data.get('pages', {}).items()):
        if key != page and not key.startswith(page + '#'):
            continue
        groups = []
        for g in entry_groups(data, entry):
            ids = []
            for p in g:
                item = [p['src']]
                if p['webp'] != p['src'] or p['focus']:
                    item.append(p['webp'])
                if p['focus']:
                    item.append(p['focus'])
                tag = tuple(item)
                if tag not in index:
                    index[tag] = len(photos)
                    photos.append(item)
                ids.append(index[tag])
            groups.append(ids)
        out = {'g': groups}
        if entry.get('focus'):
            out['f'] = entry['focus']
        entries[key] = out
    return {'p': photos, 'e': entries}


def css_url(u):
    return "url('%s')" % u.replace("'", '%27')


def head_style(photo, focus=''):
    """The style attribute's value for a page head showing a photo."""
    style = '--photo: %s; --photo-webp: %s' % (css_url(photo['src']), css_url(photo['webp']))
    focus = focus or photo.get('focus')
    if focus:
        style += '; --photo-focus: %s' % focus
    return style


# ------------------------------------------------------------------ checks

def _check_address(where, src, problems, root):
    if not isinstance(src, str) or not src:
        problems.append('%s: a photo with no address' % where)
    elif src.startswith(PHOTO_HOST):
        if not re.match(r'^https://photos\.ncan\.nz/[^\s\'"()<>]+$', src):
            problems.append('%s: %s is not a plain address (spaces and quotes '
                            'must be %%-encoded)' % (where, src))
    elif src.startswith(LOCAL_PREFIX):
        local = os.path.join(root, *src.lstrip('/').split('/'))
        if not os.path.isfile(local):
            problems.append('%s: %s is not in the repository' % (where, src))
    else:
        problems.append('%s: %s must be on %s or a file under %s'
                        % (where, src, PHOTO_HOST, LOCAL_PREFIX))


def _check_focus(where, focus, problems):
    m = FOCUS.match(focus) if isinstance(focus, str) else None
    if not m or int(m.group(1)) > 100 or int(m.group(2)) > 100:
        problems.append('%s: focus "%s" should be "x%% y%%", each 0 to 100' % (where, focus))


def _check_photo(where, p, problems, root):
    if isinstance(p, str):
        _check_address(where, p, problems, root)
        return
    if not isinstance(p, dict):
        problems.append('%s: a photo is an address or {"src": ...}' % where)
        return
    for k in set(p) - PHOTO_KEYS:
        problems.append('%s: unknown field "%s" on a photo' % (where, k))
    _check_address(where, p.get('src'), problems, root)
    if p.get('webp'):
        _check_address(where, p['webp'], problems, root)
    for t in p.get('tags', []):
        if not isinstance(t, str) or not TAG.match(t):
            problems.append('%s: tag "%s" should be lower case letters, digits and -' % (where, t))
    if 'focus' in p:
        _check_focus(where, p['focus'], problems)


def check(data, page_addresses, root=ROOT, today=None):
    """(problems, warnings): lists of strings. page_addresses is the set of the
    site's page addresses ('/', '/calendar/', '/gallery/2024-colgate-games/')."""
    problems, warnings = [], []
    today = today or datetime.date.today()
    for k in set(data) - {'about', 'pools', 'pages'}:
        problems.append('unknown top-level field "%s"' % k)
    pools = data.get('pools', {})
    pages = data.get('pages', {})

    for name, spec in pools.items():
        where = 'pool "%s"' % name
        if not TAG.match(name):
            problems.append('%s: pool names are lower case letters, digits and -' % where)
        if isinstance(spec, list):
            spec = {'photos': spec}
        if not isinstance(spec, dict):
            problems.append('%s: a pool is a list of photos or {"include": ...}' % where)
            continue
        for k in set(spec) - POOL_KEYS:
            problems.append('%s: unknown field "%s"' % (where, k))
        for p in spec.get('photos', []):
            _check_photo(where, p, problems, root)
        for child in spec.get('include', []):
            if child not in pools:
                problems.append('%s: includes "%s", which is not a pool' % (where, child))
        if spec.get('pick', 'photo') not in ('photo', 'by-pool'):
            problems.append('%s: pick is "photo" or "by-pool"' % where)
        if 'public' in spec and not isinstance(spec['public'], bool):
            problems.append('%s: public is true or false' % where)
        try:
            if not pool_groups(data, name):
                problems.append('%s: has no photos' % where)
        except PhotoError as e:
            problems.append('%s: %s' % (where, e))

    for key, entry in pages.items():
        where = 'page "%s"' % key
        path, _, rest = key.partition('#')
        if path not in page_addresses:
            problems.append('%s: %s is not a page on the site' % (where, path))
        if rest:
            hash_part = '#' + rest
            if not HASH.match(hash_part):
                problems.append('%s: the #/... part should be lower case, '
                                'with any * only at the end' % where)
            m = PLAN_DATE.search(hash_part)
            if m:
                try:
                    day = datetime.date(*map(int, m.group(1).split('-')))
                    if (today - day).days > OLD_PLAN_DAYS:
                        warnings.append('%s: the plan is more than a year old; '
                                        'remove the entry if it is no longer needed' % where)
                except ValueError:
                    problems.append('%s: %s is not a date' % (where, m.group(1)))
        if not isinstance(entry, dict):
            problems.append('%s: an entry is {"pool": ...}, {"photos": [...]} '
                            'or {"photo": "none"}' % where)
            continue
        for k in set(entry) - PAGE_KEYS:
            problems.append('%s: unknown field "%s"' % (where, k))
        given = [k for k in ('pool', 'photos', 'photo') if k in entry]
        if len(given) != 1:
            problems.append('%s: give one of "pool", "photos" or "photo": "none"' % where)
            continue
        if 'photo' in entry and entry['photo'] != 'none':
            problems.append('%s: "photo" can only be "none"; use "photos": [...]' % where)
        if 'photos' in entry:
            if not entry['photos']:
                problems.append('%s: has no photos' % where)
            for p in entry['photos']:
                _check_photo(where, p, problems, root)
        if 'focus' in entry:
            _check_focus(where, entry['focus'], problems)
        if 'pool' in entry:
            if entry['pool'] not in pools:
                problems.append('%s: no pool "%s"' % (where, entry['pool']))
            elif entry.get('public', True):
                try:
                    private = sorted(n for n in pools_reached(data, entry['pool'])
                                     if isinstance(pools[n], dict) and pools[n].get('public') is False)
                except PhotoError:
                    private = []
                if private:
                    problems.append('%s: a public page uses %s, marked "public": false'
                                    % (where, ', '.join('"%s"' % n for n in private)))
    return problems, warnings
