#!/usr/bin/env python3
"""Make the site's icons from the logo (assets/img/logo.svg).

    python tools/build-icons.py

Writes:
  favicon.ico                               browser tabs (16, 32, 48 px, transparent)
  apple-touch-icon.png                      iPhone home screen (180 px, on white)
  assets/img/icons/icon-192.png, -512.png   Android home screen (site.webmanifest)
  assets/img/icons/icon-maskable-512.png    the same with room for Android to crop it

Run it after the logo changes. It draws the SVG with Microsoft Edge or Google
Chrome (headless), then sizes the picture with Pillow (pip install pillow).
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, 'assets', 'img', 'logo.svg')
ICONS = os.path.join(ROOT, 'assets', 'img', 'icons')
CLEAR, WHITE = (0, 0, 0, 0), (255, 255, 255, 255)


def browser():
    """A Chromium browser to draw the SVG with."""
    names = ['msedge', 'chrome', 'google-chrome', 'chromium', 'chromium-browser']
    places = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    for place in places:
        if os.path.isfile(place):
            return place
    sys.exit('Needs Microsoft Edge or Google Chrome to draw the logo.')


def draw_logo(work):
    """The logo as a large transparent PNG, cropped to its edges."""
    w, h = 1776, 1016                     # twice the SVG's own 888 x 508
    page = os.path.join(work, 'logo.html')
    with open(page, 'w', encoding='utf-8') as fh:
        fh.write('<!doctype html><style>html,body{margin:0;background:transparent}'
                 'img{display:block;width:%dpx;height:%dpx}</style><img src="%s">'
                 % (w, h, 'file:///' + LOGO.replace('\\', '/')))
    shot = os.path.join(work, 'logo.png')
    subprocess.run([browser(), '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--user-data-dir=' + os.path.join(work, 'profile'),
                    '--default-background-color=00000000', '--window-size=%d,%d' % (w, h),
                    '--screenshot=' + shot, 'file:///' + page.replace('\\', '/')],
                   check=True, capture_output=True, timeout=120)
    # Edge on Windows can hand the work to a background process and return first
    for _ in range(120):
        if os.path.isfile(shot) and os.path.getsize(shot) > 0:
            break
        time.sleep(.5)
    else:
        sys.exit('The browser did not draw the logo.')
    time.sleep(1)                         # let it finish writing
    logo = Image.open(shot).convert('RGBA')
    if logo.getpixel((0, 0))[3] != 0:
        sys.exit('The browser drew the logo on a background; expected a transparent one.')
    return logo.crop(logo.getbbox())


def square(logo, size, fill, share):
    """The logo centred in a size x size square, as wide as `share` of it."""
    canvas = Image.new('RGBA', (size, size), fill)
    w = round(size * share)
    h = round(w * logo.height / logo.width)
    canvas.alpha_composite(logo.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return canvas


def main():
    # (the browser may still hold its profile folder for a moment, so leftovers are ignored)
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as work:
        logo = draw_logo(work)
    os.makedirs(ICONS, exist_ok=True)
    out = []

    def save(img, path, **kw):
        img.save(path, **kw)
        out.append(os.path.relpath(path, ROOT))

    # browser tabs: transparent, as wide as the icon
    save(square(logo, 256, CLEAR, 1.0), os.path.join(ROOT, 'favicon.ico'),
         sizes=[(16, 16), (32, 32), (48, 48)])
    # home screens: iOS fills transparency with black, so on white with a margin
    save(square(logo, 180, WHITE, .84).convert('RGB'), os.path.join(ROOT, 'apple-touch-icon.png'), optimize=True)
    for size in (192, 512):
        save(square(logo, size, WHITE, .84).convert('RGB'),
             os.path.join(ICONS, 'icon-%d.png' % size), optimize=True)
    # Android crops a "maskable" icon to a circle or other shape: keep the logo in the middle
    save(square(logo, 512, WHITE, .72).convert('RGB'),
         os.path.join(ICONS, 'icon-maskable-512.png'), optimize=True)
    for path in out:
        print('wrote', path.replace('\\', '/'))


if __name__ == '__main__':
    main()
