# -*- coding: utf-8 -*-
"""Tests for tools/fetch-calendars.py: what the publish step takes from the API.

    python -m unittest discover -s tests/py
"""
import importlib.util
import io
import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, '..', '..', 'tools', 'fetch-calendars.py')


def load():
    spec = importlib.util.spec_from_file_location('fetch_calendars', PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ics(name):
    return ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:%s\r\n'
            'BEGIN:VEVENT\r\nSUMMARY:Club night\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' % name)


def cal(slug, **extra):
    c = {'slug': slug, 'file': slug + '.ics', 'name': slug.title(), 'colour': '#12684d',
         'public': True}
    c.update(extra)
    return c


class Entries(unittest.TestCase):
    F = load()

    def test_keeps_order_name_and_colour(self):
        out = self.F.manifest_entries({'calendars': [cal('events-b'), cal('events-a', colour='red')]})
        self.assertEqual([e['file'] for e in out], ['events-b.ics', 'events-a.ics'])
        self.assertEqual(out[0], {'file': 'events-b.ics', 'name': 'Events-B', 'colour': '#12684d'})
        self.assertNotIn('colour', out[1])      # not a #rrggbb colour: left to the page

    def test_staff_only_left_out(self):
        out = self.F.manifest_entries({'calendars': [cal('a'), cal('b', public=False)]})
        self.assertEqual([e['file'] for e in out], ['a.ics'])

    def test_bad_listings_refused(self):
        bad = [
            {},
            {'calendars': []},
            {'calendars': [cal('b', public=False)]},
            {'calendars': [cal('../etc')]},
            {'calendars': [dict(cal('a'), file='b.ics')]},
            {'calendars': [cal('a'), cal('a')]},
            {'calendars': [dict(cal('a'), name='  ')]},
        ]
        for listing in bad:
            with self.assertRaises(ValueError, msg=listing):
                self.F.manifest_entries(listing)

    def test_whole_ics_only(self):
        self.F.check_ics('a', ics('A'))
        for text in ['', '<html>error</html>', 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n']:
            with self.assertRaises(ValueError):
                self.F.check_ics('a', text)


class Fetch(unittest.TestCase):
    """main(), with the API's answers stood in for, writing into a scratch folder."""

    def setUp(self):
        self.F = load()
        self.dir = tempfile.mkdtemp()
        self.F.CAL_DIR = self.dir
        self.F.MANIFEST = os.path.join(self.dir, 'calendars.json')
        self.F.API = 'https://api.test/v1/calendars'
        self.F.LIVE = 'https://site.test/assets/calendar/calendars.json'
        self.old = {'events-a.ics': ics('Old A'), 'gone.ics': ics('Gone'),
                    'calendars.json': '{"calendars": []}\n'}
        for name, text in self.old.items():
            with io.open(os.path.join(self.dir, name), 'w', encoding='utf-8', newline='') as f:
                f.write(text)
        self.answers = {
            self.F.API: json.dumps({'version': 7, 'updated': '2026-11-22 12:00',
                                    'calendars': [cal('events-a'), cal('events-b')]}),
            self.F.API + '/events-a.ics': ics('New A'),
            self.F.API + '/events-b.ics': ics('New B'),
        }

        def fetch(url):
            if url not in self.answers:
                raise OSError('no answer for ' + url)
            return self.answers[url]
        self.F.fetch = fetch

    def tearDown(self):
        shutil.rmtree(self.dir)

    def run_main(self, *argv):
        import sys
        saved = sys.argv
        sys.argv = ['fetch-calendars.py'] + list(argv)
        out = io.StringIO()
        try:
            with redirect_stdout(out):
                code = self.F.main()
        finally:
            sys.argv = saved
        return code, out.getvalue()

    def read(self, name):
        with io.open(os.path.join(self.dir, name), encoding='utf-8', newline='') as f:
            return f.read()

    def assertUntouched(self):
        for name, text in self.old.items():
            self.assertEqual(self.read(name), text, name)
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'events-b.ics')))

    def test_writes_feeds_and_manifest(self):
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertEqual(self.read('events-a.ics'), ics('New A'))
        self.assertEqual(self.read('events-b.ics'), ics('New B'))
        manifest = json.loads(self.read('calendars.json'))
        self.assertEqual(manifest['version'], 7)
        self.assertEqual(manifest['source'], 'api')
        self.assertEqual([c['file'] for c in manifest['calendars']], ['events-a.ics', 'events-b.ics'])
        # a calendar deleted on the editor keeps its file, but isn't listed
        self.assertEqual(self.read('gone.ics'), ics('Gone'))
        self.assertIn('gone.ics is no longer in the API', out)

    def test_api_down_leaves_everything(self):
        del self.answers[self.F.API]
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn('left as they are', out)
        self.assertUntouched()

    def test_one_bad_feed_leaves_everything(self):
        self.answers[self.F.API + '/events-b.ics'] = '<html>Bad gateway</html>'
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn('left as they are', out)
        self.assertUntouched()

    def test_compare_live(self):
        self.answers[self.F.LIVE] = json.dumps({'version': 7, 'calendars': []})
        self.assertEqual(self.run_main('--compare-live')[1].strip().splitlines()[-1], 'false')
        self.answers[self.F.LIVE] = json.dumps({'version': 6, 'calendars': []})
        self.assertEqual(self.run_main('--compare-live')[1].strip().splitlines()[-1], 'true')
        # the live file from before the switch has no version
        self.answers[self.F.LIVE] = json.dumps({'calendars': []})
        self.assertEqual(self.run_main('--compare-live')[1].strip().splitlines()[-1], 'true')
        # the API down: nothing to publish
        del self.answers[self.F.API]
        self.assertEqual(self.run_main('--compare-live')[1].strip().splitlines()[-1], 'false')
        self.assertUntouched()


if __name__ == '__main__':
    unittest.main()
