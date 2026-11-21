# -*- coding: utf-8 -*-
"""Tests for tools/page_photos.py, the header photo checks. Run with

    python -m unittest discover -s tests/py
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools'))
import page_photos as P  # noqa: E402

H = 'https://photos.ncan.nz/'
PAGES = {'/', '/junior-athletics/', '/history/'}
TODAY = datetime.date(2026, 11, 21)


def problems(data):
    return P.check(data, PAGES, today=TODAY)[0]


class Checks(unittest.TestCase):
    def test_good_file(self):
        data = {'pools': {'a': [H + 'a.webp'], 'b': {'include': ['a'], 'photos': [H + 'b.webp']}},
                'pages': {'/': {'pool': 'b'},
                          '/junior-athletics/#/plan/*': {'pool': 'a', 'focus': '50% 30%'},
                          '/junior-athletics/#/plan/2026-11-24': {'photos': [H + 'x.webp']},
                          '/history/': {'photo': 'none'}}}
        self.assertEqual(problems(data), [])

    def test_hosts(self):
        data = {'pools': {'a': ['https://example.com/a.jpg', '/assets/img/nope.jpg',
                                H + 'with space.jpg']}, 'pages': {}}
        out = problems(data)
        self.assertTrue(any('must be on' in p for p in out))
        self.assertTrue(any('not in the repository' in p for p in out))
        self.assertTrue(any('%-encoded' in p for p in out))

    def test_pools(self):
        data = {'pools': {'a': {'include': ['b']}, 'b': {'include': ['a']},
                          'c': {'include': ['missing']}, 'd': []},
                'pages': {'/': {'pool': 'nope'}}}
        out = ' | '.join(problems(data))
        self.assertIn('includes itself', out)
        self.assertIn('"missing", which is not a pool', out)
        self.assertIn('pool "d": has no photos', out)
        self.assertIn('no pool "nope"', out)

    def test_private_pool_on_public_page(self):
        data = {'pools': {'p': {'photos': [H + 'a.webp'], 'public': False},
                          'club': {'include': ['p']}},
                'pages': {'/': {'pool': 'club'},
                          '/history/': {'pool': 'club', 'public': False}}}
        out = problems(data)
        self.assertEqual(len(out), 1)
        self.assertIn('page "/"', out[0])

    def test_pages(self):
        data = {'pools': {}, 'pages': {
            '/nowhere/': {'photo': 'none'},
            '/junior-athletics/#/plan/*/x': {'photo': 'none'},
            '/junior-athletics/#/plan/2026-02-30': {'photo': 'none'},
            '/history/': {'photos': [H + 'a.webp'], 'pool': 'x'},
            '/': {'photos': [H + 'a.webp'], 'focus': 'top'}}}
        out = ' | '.join(problems(data))
        self.assertIn('not a page on the site', out)
        self.assertIn('only at the end', out)
        self.assertIn('not a date', out)
        self.assertIn('give one of', out)
        self.assertIn('focus "top"', out)

    def test_old_plan_warns(self):
        data = {'pools': {}, 'pages': {'/junior-athletics/#/plan/2025-01-01': {'photo': 'none'}}}
        bad, warnings = P.check(data, PAGES, today=TODAY)
        self.assertEqual(bad, [])
        self.assertEqual(len(warnings), 1)

    def test_first_photo_and_script(self):
        data = {'pools': {'a': [H + 'a.webp', H + 'b.webp']},
                'pages': {'/': {'pool': 'a'}, '/history/': {'photos': [H + 'c.webp']},
                          '/junior-athletics/': {'photos': [H + 'd.webp']},
                          '/junior-athletics/#/plan/*': {'pool': 'a'}}}
        pages = data['pages']
        self.assertEqual(P.first_photo(data, pages['/'])['src'], H + 'a.webp')
        self.assertTrue(P.needs_script(data, '/', pages['/']))
        self.assertFalse(P.needs_script(data, '/history/', pages['/history/']))
        self.assertTrue(P.needs_script(data, '/junior-athletics/', pages['/junior-athletics/']))
        self.assertEqual(P.head_style(P.photo_of(H + "it's.webp"), '10% 20%'),
                         "--photo: url('%sit%%27s.webp'); --photo-webp: url('%sit%%27s.webp'); "
                         "--photo-focus: 10%% 20%%" % (H, H))


if __name__ == '__main__':
    unittest.main()
