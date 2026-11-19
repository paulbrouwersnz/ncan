# -*- coding: utf-8 -*-
"""Check the Junior Athletics planner's help still names buttons that exist.

The help for coaches, "How to use the planner" (the <details id="planner-help">
block in junior-athletics/index.html), is written by hand and names the
planner's buttons and labels in bold (<strong>...</strong>). This reads every
bold name from the help and looks for it as text in the planner's code:

    assets/js/training*.js            (the planner, however many files it is in)
    junior-athletics/index.html       (the page, with the help itself left out;
                                       "New training plan" and "Start from the
                                       latest plan" are buttons on the page)

A name counts as found when it is a whole piece of text there: a string in the
script ('Schedule release', "Done") or an element's text in the page
(>Start from the latest plan<), not merely a word in a comment or a longer
sentence. A name that is not found is printed and the tool exits 1, so a button
renamed in the code without the help following shows up in Checks.

Matching ignores case, HTML entities (&amp;, &rsquo;) and JavaScript \\u
escapes, and treats curly and straight apostrophes alike, so "Print with
coaches' notes" matches however the code spells the apostrophe.

    python tools/check-planner-help.py

Standard library only.
"""
import glob
import html
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'junior-athletics', 'index.html')
SCRIPTS = os.path.join(ROOT, 'assets', 'js', 'training*.js')

# Bold text in the help that is emphasis or a description, not the label of a
# button or control, so is not expected to appear in the code. Keep this short:
# add a name only when it is deliberately not a label.
IGNORE = {
    # describes the shaded notes boxes; the code only has it inside longer
    # labels ("Coaches-only note for ...")
    'coaches-only',
}

HELP_RE = re.compile(r'<details\b[^>]*\bid="planner-help"[^>]*>.*?</details>', re.S | re.I)
BOLD_RE = re.compile(r'<(strong|b)\b[^>]*>(.*?)</\1>', re.S | re.I)


def read(path):
    return io.open(path, encoding='utf-8').read()


def normalise(text):
    """Lower case, entities and \\u escapes decoded, quotes and spaces plain."""
    text = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
    text = html.unescape(text)
    text = text.replace('’', "'").replace('‘', "'").replace(' ', ' ')
    return re.sub(r'\s+', ' ', text).strip().lower()


def without_comments(code):
    """Drop HTML and JavaScript comments, which quote button names ("Start from
    the latest plan") and would otherwise count as the button still being there.
    A // only starts a comment at the start of a line or after a space, so
    "https://" in a string is left alone."""
    code = re.sub(r'<!--.*?-->', '', code, flags=re.S)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    return re.sub(r'(^|\s)//[^\n]*', r'\1', code, flags=re.M)


def as_label(name, code):
    """True when name is a whole string or element text in the (normalised) code:
    a quote, backtick or > before it and a quote, backtick or < after it."""
    edge_in, edge_out = r'''["'`>] ?''', r''' ?["'`<]'''
    return re.search(edge_in + re.escape(name) + edge_out, code) is not None


def main():
    page = read(PAGE)
    found = HELP_RE.search(page)
    if not found:
        print('no <details id="planner-help"> in %s' % os.path.relpath(PAGE, ROOT))
        return 2

    names = []
    for m in BOLD_RE.finditer(found.group(0)):
        # tags inside the bold (a link, say) are dropped; the code is searched as is
        name = normalise(re.sub(r'<[^>]+>', '', m.group(2)))
        if name and name not in names:
            names.append(name)

    scripts = sorted(glob.glob(SCRIPTS))
    if not scripts:
        print('no planner scripts matching %s' % os.path.relpath(SCRIPTS, ROOT))
        return 2
    # the code to search: the scripts, and the page with the help taken out
    haystack = normalise(without_comments('\n'.join(
        [page[:found.start()] + page[found.end():]] + [read(p) for p in scripts])))

    checked = [n for n in names if n not in IGNORE]
    missing = [n for n in checked if not as_label(n, haystack)]
    for gone in sorted(IGNORE - set(names)):
        print('   note: "%s" is in IGNORE but no longer bold in the help - '
              'it can come out' % gone)

    print('checked %d bold name(s) in the planner help against %s and the page'
          % (len(checked), ', '.join(os.path.relpath(p, ROOT).replace('\\', '/')
                                     for p in scripts)))
    if missing:
        print('not found in the planner code (renamed or removed? update the help, '
              'or add it to IGNORE if it is not a label):')
        for name in missing:
            print('   - %s' % name)
        return 1
    print('every name the help puts in bold is in the planner.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
