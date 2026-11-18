# -*- coding: utf-8 -*-
"""Gather the files the website publishes into one folder, for GitHub Pages.

    python tools/build-site.py              # into _site/
    python tools/build-site.py --list       # only list what would be published
    python tools/build-site.py --out DIR

The site is published by .github/workflows/pages.yml: it runs sync-partials.py
and stamp-assets.py, then this, and hands the folder to GitHub Pages. It copies
the files git tracks (so nothing lying around on a computer is published),
leaving out:

- what GitHub Pages' old Jekyll build left out, so nothing is published that
  wasn't before: any file or folder whose name starts with . _ # or ~, or ends
  with ~ (so .git, .github, .vscode, _config.yml), Jekyll's default excludes
  (Gemfile, Gemfile.lock, node_modules, vendor/...), and anything listed under
  "exclude:" in _config.yml; but keeping what _config.yml lists under
  "include:" (.well-known, for security.txt);
- the repository's own working files, which Jekyll did publish: tools/,
  partials/, actions/ (the Facebook updater) and README.md.

Standard library only.
"""
import argparse, fnmatch, io, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Jekyll 3 (what GitHub Pages ran) leaves these out by default
JEKYLL_EXCLUDE = ['Gemfile', 'Gemfile.lock', 'node_modules',
                  'vendor/bundle/', 'vendor/cache/', 'vendor/gems/', 'vendor/ruby/']
# the repository's working files: never part of the website
SITE_EXCLUDE = ['tools', 'partials', 'actions', 'README.md', '_site']


def config_lists(path):
    """The include: and exclude: lists from _config.yml. Only the simple YAML the
    file uses (a key, then "- item" lines, or [a, b]); anything else in it is
    reported, as this build would not act on it."""
    lists = {'include': [], 'exclude': []}
    if not os.path.isfile(path):
        return lists
    key = None
    for raw in io.open(path, encoding='utf-8'):
        line = raw.split(' #', 1)[0].rstrip()
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line[0].isspace() and ':' in line:
            name, _, rest = line.partition(':')
            name, rest = name.strip(), rest.strip()
            key = name if name in lists else None
            if key is None:
                print('   ! _config.yml: "%s" is not used by this build' % name)
            elif rest.startswith('['):
                lists[key] += [v.strip().strip('\'"') for v in rest.strip('[]').split(',') if v.strip()]
            continue
        item = line.strip()
        if key and item.startswith('- '):
            lists[key].append(item[2:].strip().strip('\'"'))
    return lists


def matches(rel, patterns):
    """Jekyll-style: a pattern matches a path, a folder above it, or its name."""
    parts = rel.split('/')
    for pattern in patterns:
        p = pattern.strip('/')
        for i in range(1, len(parts) + 1):
            if fnmatch.fnmatchcase('/'.join(parts[:i]), p):
                return True
        if fnmatch.fnmatchcase(parts[-1], p):
            return True
    return False


def special(name):
    return name[:1] in ('.', '_', '#', '~') or name.endswith('~')


def published(rel, include, exclude):
    """Whether a file (its path from the root, with /) goes on the website."""
    parts = rel.split('/')
    for i, name in enumerate(parts):
        here = '/'.join(parts[:i + 1])
        # a dot or underscore name is left out, at any depth, unless included
        if special(name) and not any(fnmatch.fnmatchcase(here, p.strip('/')) or
                                     fnmatch.fnmatchcase(name, p.strip('/')) for p in include):
            return False
    return not matches(rel, exclude)


def tracked_files(root):
    """Every file git tracks, or every file under the root without git."""
    try:
        out = subprocess.run(['git', 'ls-files', '-z'], cwd=root, check=True,
                             capture_output=True).stdout.decode('utf-8')
        return sorted(f for f in out.split('\0') if f)
    except (OSError, subprocess.CalledProcessError):
        files = []
        for here, dirs, names in os.walk(root):
            dirs[:] = [d for d in dirs if d != '.git']
            files += [os.path.relpath(os.path.join(here, n), root).replace(os.sep, '/') for n in names]
        return sorted(files)


def site_files(root=ROOT, extra_exclude=SITE_EXCLUDE):
    lists = config_lists(os.path.join(root, '_config.yml'))
    exclude = JEKYLL_EXCLUDE + lists['exclude'] + list(extra_exclude)
    return [f for f in tracked_files(root)
            if published(f, lists['include'], exclude)
            and os.path.isfile(os.path.join(root, f))
            and not os.path.islink(os.path.join(root, f))]  # Jekyll's safe mode skips links


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--out', default=os.path.join(ROOT, '_site'), help='folder to write (default: _site)')
    ap.add_argument('--list', action='store_true', help='list the files, copy nothing')
    args = ap.parse_args(argv)

    files = site_files(ROOT)
    if args.list:
        print('\n'.join(files))
        print('%d file(s).' % len(files), file=sys.stderr)
        return 0

    out = os.path.abspath(args.out)
    if os.path.normcase(out) == os.path.normcase(ROOT):
        sys.exit('refusing to write over the repository itself')
    if os.path.exists(out):
        shutil.rmtree(out)
    for rel in files:
        dest = os.path.join(out, *rel.split('/'))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, *rel.split('/')), dest)
    print('copied %d file(s) into %s' % (len(files), os.path.relpath(out, ROOT)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
