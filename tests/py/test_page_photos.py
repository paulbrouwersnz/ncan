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


class Overlay(unittest.TestCase):
    def test_overlay(self):
        base = {'about': 'x', 'pools': {'a': [H + 'a.webp']},
                'pages': {'/gallery/x/': {'photos': [H + 'g.webp']}, '/': {'pool': 'a'}}}
        out = P.overlay(base, {'pools': {'b': [H + 'b.webp']}, 'pages': {'/': {'pool': 'b'}}})
        self.assertEqual(set(out['pools']), {'a', 'b'})
        self.assertEqual(out['pages']['/'], {'pool': 'b'})
        self.assertIn('/gallery/x/', out['pages'])
        self.assertEqual(base['pages']['/'], {'pool': 'a'})

    def test_load_lays_the_api_part_over(self):
        import json
        import tempfile
        data = {'about': '', 'pools': {}, 'pages': {'/': {'photo': 'none'}},
                'api': {'version': 2, 'pools': {}, 'pages': {'/': {'photos': [H + 'a.webp']}}}}
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(data, f)
        try:
            merged = P.load(f.name)
            self.assertNotIn('api', merged)
            self.assertEqual(merged['pages']['/'], {'photos': [H + 'a.webp']})
            self.assertIn('api', P.load(f.name, raw=True))
        finally:
            os.unlink(f.name)


class FetchFromApi(unittest.TestCase):
    """tools/fetch-page-photos.py: what the API's settings lose at publish time."""

    @classmethod
    def setUpClass(cls):
        import importlib.util
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(here, '..', '..', 'tools', 'fetch-page-photos.py')
        spec = importlib.util.spec_from_file_location('fetch_page_photos', path)
        cls.F = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.F)

    def test_missing_pages_left_out(self):
        settings = {'pools': {'a': [H + 'a.webp']},
                    'pages': {'/junior-athletics/': {'pool': 'a'}, '/no-such-page/': {'pool': 'a'}, '/': {'pool': 'a'}}}
        layer, notes = self.F.usable(settings, {'pools': {}, 'pages': {}})
        self.assertEqual(list(layer['pages']), ['/junior-athletics/'])
        self.assertTrue(any('no heading band' in n for n in notes))
        self.assertTrue(any('/no-such-page/' in n for n in notes))

    def test_problem_leaves_all_out(self):
        settings = {'pools': {'a': ['https://example.com/a.jpg']}, 'pages': {'/': {'pool': 'a'}}}
        layer, notes = self.F.usable(settings, {'pools': {}, 'pages': {}})
        self.assertIsNone(layer)
        self.assertTrue(any('left out of this publish' in n for n in notes))


if __name__ == '__main__':
    unittest.main()


class Picker(unittest.TestCase):
    """The choices written into a page for tools/head-photo-pick.js, and the
    script make-head-photo.py writes after the band's opening tag."""

    data = {'pools': {'a': [H + 'a.webp', {'src': H + 'b.jpg', 'webp': H + 'b.webp', 'focus': '1% 2%'}]},
            'pages': {'/junior-athletics/': {'pool': 'a'},
                      '/junior-athletics/#/plan/*': {'pool': 'a', 'focus': '5% 5%'},
                      '/junior-athletics/#/plan/2026-12-01': {'photo': 'none'},
                      '/history/': {'photos': [H + 'c.webp']}}}

    def test_pick_data(self):
        d = P.pick_data(self.data, '/junior-athletics/')
        self.assertEqual(d['p'], [[H + 'a.webp'], [H + 'b.jpg', H + 'b.webp', '1% 2%']])
        self.assertEqual(d['e'], {'/junior-athletics/': {'g': [[0, 1]]},
                                  '/junior-athletics/#/plan/*': {'g': [[0, 1]], 'f': '5% 5%'},
                                  '/junior-athletics/#/plan/2026-12-01': {'g': []}})

    def test_script_written_and_rewritten(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'make_head_photo', os.path.join(os.path.dirname(P.__file__), 'make-head-photo.py'))
        M = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(M)
        tag = '<section class="page-head" aria-labelledby="h">'
        entry = self.data['pages']['/junior-athletics/']
        new = M.rewrite_tag(tag, self.data, '/junior-athletics/', entry)
        self.assertTrue(new.startswith('<section class="page-head page-head--photo" aria-labelledby="h" '
                                       'style="--photo: url(\'%sa.webp\')' % H))
        self.assertIn(' data-page-photos><script data-head-pick>(function', new)
        self.assertTrue(new.endswith(')</script>'))
        self.assertNotIn('\n', new)
        # the whole match (tag and script) found again, and written the same
        html = '<main>' + new + '<h1>x</h1></main>'
        m = M.HEAD.search(html)
        self.assertEqual(m.group(0), new)
        self.assertEqual(M.rewrite_tag(m.group(0), self.data, '/junior-athletics/', entry), new)
        # a single photo: no script, and an old one is taken out
        one = M.rewrite_tag(new, self.data, '/history/', self.data['pages']['/history/'])
        self.assertNotIn('<script', one)
        self.assertNotIn('data-page-photos', one)

    def test_script_cannot_end_early(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'make_head_photo', os.path.join(os.path.dirname(P.__file__), 'make-head-photo.py'))
        M = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(M)
        data = {'pools': {}, 'pages': {'/x/': {'photos': [H + 'a</script>.webp', H + 'b.webp']}}}
        script = M.picker_script(data, '/x/')
        self.assertEqual(script.count('</script>'), 1)
