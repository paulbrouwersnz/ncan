# -*- coding: utf-8 -*-
"""Tests for tools/staff_tools.py, the staff tools cards on /admin/. Run with

    python -m unittest discover -s tests/py
"""
import copy
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import staff_tools as S  # noqa: E402

DATA = S.load()
HTML = S.render(DATA, 'admin')


def titles(markup):
    return re.findall(r'class="card__link" href="[^"]*">([^<]*)</a>', markup)


def heads(markup):
    return re.findall(r'<h2 class="admin-tools__head">([^<]*)</h2>', markup)


def groups(markup):
    """[(lowest, markup of that group)] in page order."""
    return re.findall(r'<div class="admin-tools__group" data-lowest="([a-z]+)">(.*?)\n\s*</div>(?=\s*(?:<div class="admin-tools__group"|$))',
                      markup, re.S)


def exists(href):
    path = href.split('#')[0].strip('/')
    return os.path.exists(os.path.join(ROOT, path, 'index.html'))


class TheList(unittest.TestCase):
    def test_list_is_fine(self):
        self.assertEqual(S.check(DATA, exists), [])

    def test_every_lowest_is_a_role(self):
        for t in DATA['tools']:
            self.assertIn(t['lowest'], S.RANK, t['title'])

    def test_problems_found(self):
        bad = copy.deepcopy(DATA)
        bad['tools'][0]['lowest'] = 'parent'
        bad['tools'][1]['group'] = 'Nowhere'
        bad['tools'][2]['href'] = 'https://example.com/'
        bad['tools'][3]['href'] = '/no-such-page/'
        bad['tools'].append(dict(bad['tools'][-1]))   # listed twice
        coach = [t for t in bad['tools'] if t['lowest'] == 'coach'][0]
        coach['group'] = 'Members'                       # a coach tool in an admin group
        out = ' | '.join(S.check(bad, exists))
        for words in ('lowest must be one of', 'no group called', 'must start with /',
                      'not a page on the site', 'listed twice', 'does not match its group'):
            self.assertIn(words, out)


class ThePage(unittest.TestCase):
    def test_every_group_and_tool_written(self):
        self.assertEqual(heads(HTML), [g['name'] for g in DATA['groups']])
        self.assertEqual(sorted(titles(HTML)), sorted(t['title'] for t in DATA['tools']))

    def test_each_group_says_its_lowest_role(self):
        found = groups(HTML)
        self.assertEqual([low for low, _ in found], [g['lowest'] for g in DATA['groups']])
        for low, markup in found:
            for title in titles(markup):
                tool = [t for t in DATA['tools'] if t['title'] == title][0]
                self.assertEqual(tool['lowest'], low, title)

    def test_what_each_role_would_see(self):
        # admin.js shows a group when the role reaches its data-lowest
        def seen(role):
            reach = S.RANK.index(role)
            return [t for low, m in groups(HTML) if S.RANK.index(low) <= reach for t in titles(m)]
        self.assertEqual(seen('coach'), [t['title'] for t in DATA['tools'] if t['lowest'] == 'coach'])
        self.assertIn('Club champs review', seen('committee'))
        self.assertIn('Club committee', seen('committee'))
        self.assertNotIn('Needs a look', seen('committee'))
        self.assertEqual(sorted(seen('admin')), sorted(t['title'] for t in DATA['tools']))

    def test_no_old_pages_mentioned(self):
        self.assertNotIn('see these on their own page', HTML)
        self.assertEqual(sorted(S.PAGES), ['admin'])

    def test_count_badge(self):
        self.assertIn('id="admin-count-review"', HTML)

    def test_apply_is_stable(self):
        text = '<div>\n        <!-- @tools:admin --><!-- /@tools:admin -->\n</div>\n'
        once, changed = S.apply(text, DATA)
        self.assertEqual(changed, ['tools:admin'])
        twice, changed = S.apply(once, DATA)
        self.assertEqual((twice, changed), (once, []))

    def test_page_is_in_step(self):
        with open(os.path.join(ROOT, 'admin', 'index.html'), encoding='utf-8') as fh:
            text = fh.read()
        self.assertIn('<!-- @tools:admin -->', text)
        self.assertEqual(S.apply(text, DATA)[1], [])

    def test_old_pages_are_gone(self):
        for path in ('coaches-tools', 'committee-tools'):
            self.assertFalse(os.path.exists(os.path.join(ROOT, path)), path)


if __name__ == '__main__':
    unittest.main()
