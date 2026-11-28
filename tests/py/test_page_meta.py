# -*- coding: utf-8 -*-
"""Tests for tools/page_meta.py and the head writing in tools/build-page-meta.py
(page titles, descriptions and share images). Run with

    python -m unittest discover -s tests/py
"""
import importlib.util
import os
import sys
import unittest

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tools')
sys.path.insert(0, TOOLS)
import page_meta as M  # noqa: E402

spec = importlib.util.spec_from_file_location('build_page_meta', os.path.join(TOOLS, 'build-page-meta.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

DATA = {'pages': {
    '/': {'title': 'Club — Run.', 'og_title': 'Club', 'description': 'Home words.',
          'headline': 'Run.', 'line': 'For all.'},
    '/calendar/': {'title': 'Club calendar: events', 'description': 'Dates & times.',
                   'headline': 'Club calendar', 'line': 'Events.'}},
    'albums': {'2017-senior-athletes': {'headline': 'Senior athletes 2017', 'where': 'in 2017',
                                        'who': 'the club’s senior athletes'},
               '2020-x-mike-s-photos': {'headline': 'Colgate Games 2020', 'where': 'at the 2020 Colgate Games',
                                        'title_end': 'Mike’s photos'}}}

PAGE = ('<head>\n<!-- @partial:head -->\n<meta property="og:type" content="website">\n<!-- /@partial:head -->\n\n'
        '<link rel="canonical" href="https://ncan.nz/calendar/">\n\n'
        '<title>Old</title>\n<meta name="description" content="Old words.">\n'
        '<meta property="og:title" content="Old">\n<meta property="og:description" content="Short.">\n'
        '</head>\n<body></body>')


class PageMeta(unittest.TestCase):
    def test_a_page_gets_the_club_name_on_its_title_but_the_home_page_keeps_its_own(self):
        p = M.page(DATA, '/calendar/')
        self.assertEqual(p['title'], 'Club calendar: events — North Canterbury Athletic Club')
        self.assertEqual(p['og_title'], p['title'])
        self.assertEqual(p['image'], 'https://ncan.nz/assets/img/share/calendar.jpg')
        home = M.page(DATA, '/')
        self.assertEqual((home['title'], home['og_title']), ('Club — Run.', 'Club'))
        self.assertTrue(home['image'].endswith('/share/home.jpg'))
        self.assertIsNone(M.page(DATA, '/nowhere/'))

    def test_albums_follow_the_pattern_and_new_albums_still_get_one(self):
        cards = {'2017-senior-athletes': {'v': 'abc123'}}
        a = M.album(DATA, '2017-senior-athletes', '2017 Senior Athletes', 4, cards=cards)
        self.assertEqual(a['title'], 'Senior athletes 2017: club photos — North Canterbury Athletic Club')
        self.assertEqual(a['description'], '4 photos of the club’s senior athletes in 2017, '
                                           'in the North Canterbury Athletic Club photo gallery.')
        self.assertEqual((a['image'], a['type']), ('https://api.ncan.nz/g/2017-senior-athletes.jpg?v=abc123', 'image/jpeg'))
        self.assertTrue(M.album(DATA, '2020-x-mike-s-photos', 'x', 1, cards)['title'].startswith('Colgate Games 2020: Mike’s photos'))
        new = M.album(DATA, '2027-relay', '2027 Relay', 1, cards)
        self.assertEqual(new['line'], '1 photo of club athletes')
        self.assertTrue(new['title'].startswith('2027 Relay: club photos'))
        self.assertEqual((new['image'], new['type']), (M.DEFAULT_IMAGE, 'image/png'))   # no card yet

    def test_the_share_lines_name_the_card_or_the_club_picture(self):
        self.assertIn('content="https://ncan.nz/assets/img/share/calendar.jpg"', M.image_block(M.page(DATA, '/calendar/')))
        plain = M.image_block(None)
        self.assertIn('share.png', plain)
        self.assertIn('image/png', plain)
        self.assertTrue(plain.startswith(M.OPEN) and plain.endswith(M.CLOSE))


class Heads(unittest.TestCase):
    def test_the_head_takes_the_files_words_and_its_card_once(self):
        html = B.set_head(PAGE, M.page(DATA, '/calendar/'))
        self.assertIn('<title>Club calendar: events — North Canterbury Athletic Club</title>', html)
        self.assertIn('<meta name="description" content="Dates &amp; times.">', html)
        self.assertIn('<meta property="og:description" content="Dates &amp; times.">', html)
        self.assertEqual(html.count('og:image"'), 1)
        self.assertLess(html.index(M.CLOSE), html.index('</head>'))
        self.assertEqual(B.set_head(html, M.page(DATA, '/calendar/')), html)   # again: nothing changes

    def test_a_missing_description_is_added_and_an_unlisted_page_keeps_its_words(self):
        bare = PAGE.replace('<meta name="description" content="Old words.">\n', '')
        html = B.set_head(bare, M.page(DATA, '/calendar/'))
        self.assertLess(html.index('<title>'), html.index('name="description"'))
        self.assertLess(html.index('name="description"'), html.index('og:title'))
        kept = B.set_head(PAGE, None)
        self.assertIn('<title>Old</title>', kept)
        self.assertIn('share.png', kept)

    def test_an_old_og_image_line_outside_the_markers_goes(self):
        old = PAGE.replace('</head>', '<meta property="og:image" content="https://ncan.nz/x.png">\n</head>')
        html = B.set_head(old, None)
        self.assertNotIn('x.png', html)
        self.assertEqual(html.count('og:image"'), 1)

    def test_an_album_page_names_its_card_on_the_api_or_the_club_picture(self):
        old = B.set_head(PAGE, M.album(DATA, '2027-relay', '2027 Relay', 3, cards={}))
        html = B.set_album_image(old, {'slug': '2027-relay', 'v': 'f00d'})
        self.assertIn('<meta property="og:image" content="https://api.ncan.nz/g/2027-relay.jpg?v=f00d">', html)
        self.assertIn('<meta name="twitter:image" content="https://api.ncan.nz/g/2027-relay.jpg?v=f00d">', html)
        self.assertIn('<meta property="og:image:type" content="image/jpeg">', html)
        self.assertIn('og:image:alt" content="2027 Relay — North Canterbury Athletic Club"', html)
        self.assertEqual(B.set_album_image(html, None), old)

    def test_the_partial_is_left_alone(self):
        with self.assertRaises(ValueError):
            B.set_head('<head><title>x</title></head>', None)


if __name__ == '__main__':
    unittest.main()
