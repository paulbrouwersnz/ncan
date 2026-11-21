# -*- coding: utf-8 -*-
"""Tests for tools/staff_tools.py, the staff tools cards. Run with

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


def titles(page):
    return re.findall(r'class="card__link" href="[^"]*">([^<]*)</a>', S.render(DATA, page))


def heads(page):
    return re.findall(r'<h2 class="admin-tools__head">([^<]*)</h2>', S.render(DATA, page))


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


class ThePages(unittest.TestCase):
    def test_admin_shows_every_group(self):
        self.assertEqual(heads('admin'), [g['name'] for g in DATA['groups']])
        self.assertEqual(sorted(titles('admin')), sorted(t['title'] for t in DATA['tools']))
        self.assertNotIn('Other staff tools', S.render(DATA, 'admin'))

    def test_committee_page(self):
        self.assertEqual(heads('committee'), ['Committee tools', 'Coaches’ tools'])
        want = [t['title'] for t in DATA['tools'] if t['lowest'] in ('committee', 'coach')]
        self.assertEqual(titles('committee'), want)
        self.assertIn('Club champs review', titles('committee'))

    def test_coaches_page(self):
        self.assertEqual(heads('coaches'), [])   # one group: a hidden "Tools" heading
        self.assertIn('id="tools-heading"', S.render(DATA, 'coaches'))
        self.assertEqual(titles('coaches'), [t['title'] for t in DATA['tools'] if t['lowest'] == 'coach'])

    def test_higher_tools_never_shown_lower(self):
        for page, role in S.PAGES.items():
            reach = S.RANK.index(role)
            shown = set(titles(page))
            for t in DATA['tools']:
                if S.RANK.index(t['lowest']) > reach:
                    self.assertNotIn(t['title'], shown, '%s on %s' % (t['title'], page))

    def test_who_else_notes_only_on_admin(self):
        self.assertIn('Committee members see these', S.render(DATA, 'admin'))
        self.assertIn('Coaches and the committee see these', S.render(DATA, 'admin'))
        for page in ('committee', 'coaches'):
            self.assertNotIn('see these on their own page', S.render(DATA, page))

    def test_count_badge(self):
        self.assertIn('id="admin-count-review"', S.render(DATA, 'admin'))

    def test_apply_is_stable(self):
        text = '<div>\n        <!-- @tools:coaches --><!-- /@tools:coaches -->\n</div>\n'
        once, changed = S.apply(text, DATA)
        self.assertEqual(changed, ['tools:coaches'])
        twice, changed = S.apply(once, DATA)
        self.assertEqual((twice, changed), (once, []))

    def test_pages_are_in_step(self):
        for page, path in (('admin', 'admin'), ('committee', 'committee-tools'), ('coaches', 'coaches-tools')):
            with open(os.path.join(ROOT, path, 'index.html'), encoding='utf-8') as fh:
                text = fh.read()
            self.assertIn('<!-- @tools:%s -->' % page, text)
            self.assertEqual(S.apply(text, DATA)[1], [], path)


if __name__ == '__main__':
    unittest.main()
