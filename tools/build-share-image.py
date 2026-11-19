#!/usr/bin/env python3
"""Build assets/img/share.png, the picture shown when a page is shared, from
tools/share-image.html (1200 x 630), with a headless Chrome or Edge.

    python tools/build-share-image.py
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'tools', 'share-image.html')
OUT = os.path.join(ROOT, 'assets', 'img', 'share.png')

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome', 'chromium', 'chromium-browser', 'msedge',
]


def browser():
    for b in BROWSERS:
        if os.path.isfile(b) or shutil.which(b):
            return b
    sys.exit('No Chrome or Edge found.')


def main():
    url = 'file:///' + SOURCE.replace(os.sep, '/').lstrip('/')
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--user-data-dir=' + profile, '--force-device-scale-factor=1',
                        '--window-size=1200,630', '--screenshot=' + OUT, url],
                       check=True, capture_output=True)
    print('Wrote', os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
