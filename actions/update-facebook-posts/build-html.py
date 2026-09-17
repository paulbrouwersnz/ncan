#!/usr/bin/env python3
"""
build-html.py

Reads extracted.json (the output of extract_posts.jq) and renders it as a
single, self-contained HTML stub: one card per post, with timestamps
converted to local NZ time (Pacific/Auckland — handles NZST/NZDT correctly).

Every thumbnail image is downloaded next to the output file (into an
"images" subfolder) and the <img> tag points at that local copy instead of
the remote Facebook CDN URL, so the page still shows its pictures even
offline or after the signed CDN links expire. If a download fails (no
network, link already expired, etc.) that one image quietly falls back to
its original remote URL rather than breaking the page.

Images are cached by URL, so an image already on disk is reused rather than
re-fetched. Once the page has been rendered, any file left in the images
folder that the new page does not reference is deleted, so images belonging
to posts that have scrolled off the feed do not accumulate.

Usage:
    python3 build_html.py [input.json] [output.html]

Defaults to extracted.json -> posts.html in the current directory.
Downloaded images land in <output dir>/images/.
"""

import sys
import os
import re
import json
import html
import hashlib
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

NZ = ZoneInfo("Pacific/Auckland")
USER_AGENT = "Mozilla/5.0 (compatible; build_html.py/1.0; +local image fetcher)"
IMAGES_DIRNAME = "images"
# Where the images folder is reachable from on the live site. The stub is
# injected into pages at the site root, so the src has to be site-absolute
# rather than relative to this file.
WEB_BASE = "/assets/facebook/"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def fmt_time(ts):
    """Unix seconds -> 'Mon, 31 Aug 2026, 11:12 PM NZST'."""
    if ts is None:
        return None
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(NZ)
    return dt.strftime("%a, %d %b %Y, %I:%M %p").replace(" 0", " ") + " " + dt.tzname()


def esc(text):
    if text is None:
        return ""
    return html.escape(text).replace("\n", "<br>")


def guess_extension(url):
    path = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path)[1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else ".jpg"


class ImageDownloader:
    """Downloads remote images into an `images/` folder beside the output
    HTML, and returns the src to use for each one: the local copy's
    site-absolute path normally, or the original remote URL for any image
    that fails to download. Either way the value is ready to use as-is.
    """

    def __init__(self, images_dir):
        self.images_dir = images_dir
        self.keep = set()
        self.downloaded = 0
        self.cached = 0
        self.failed = 0
        self.removed = 0

    def resolve(self, url):
        if not url:
            return None

        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
        filename = digest + guess_extension(url)
        dest_path = os.path.join(self.images_dir, filename)
        web_path = f"{WEB_BASE}{IMAGES_DIRNAME}/{filename}"
        self.keep.add(filename)

        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
            self.cached += 1
            return web_path

        os.makedirs(self.images_dir, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            with open(dest_path, "wb") as f:
                f.write(data)
            self.downloaded += 1
            return web_path
        except Exception as exc:
            print(f"  ! could not download image, keeping remote URL: {url}\n    ({exc})", file=sys.stderr)
            self.failed += 1
            return url


def prune_images(images):
    """Delete downloaded images the freshly built page no longer references.

    Run this AFTER rendering, once every post has been resolved - the set of
    files to keep is only complete at that point. Clearing the folder up
    front instead would defeat the cache, since every image would then have
    to be downloaded again on every run.
    """
    if not os.path.isdir(images.images_dir):
        return
    for name in os.listdir(images.images_dir):
        if name in images.keep:
            continue
        path = os.path.join(images.images_dir, name)
        if os.path.isfile(path) or os.path.islink(path):
            os.remove(path)
            images.removed += 1


def render_media(src):
    if not src:
        return ""
    return f'<img class="thumb" src="{html.escape(src, quote=True)}" alt="" loading="lazy">'


def render_link(url):
    if not url:
        return ""
    return f'<a class="link" href="{html.escape(url, quote=True)}" target="_blank" rel="noopener">{esc(url)}</a>'


def render_author(post):
    user = post.get("user") or {}
    name = user.get("name")
    fb_url = post.get("facebookUrl")
    if not name:
        return ""
    if fb_url:
        who = f'<a href="{html.escape(fb_url, quote=True)}" target="_blank" rel="noopener">{esc(name)}</a>'
    else:
        who = esc(name)
    return f'<div class="author">{who}</div>'


def render_shared(sp, images):
    if not sp:
        return ""
    user = sp.get("user") or {}
    name = user.get("name")
    profile_url = user.get("profileUrl")
    if name and profile_url:
        who = f'<a href="{html.escape(profile_url, quote=True)}" target="_blank" rel="noopener">{esc(name)}</a>'
    elif name:
        who = esc(name)
    else:
        who = ""

    time_str = fmt_time(sp.get("timestamp"))
    media0 = (sp.get("media") or [{}])[0] if sp.get("media") else {}

    parts = ['<div class="shared">']
    meta_bits = [b for b in [who, time_str] if b]
    if meta_bits:
        parts.append(f'<div class="shared-meta">{" &middot; ".join(meta_bits)}</div>')
    if sp.get("text"):
        parts.append(f'<div class="shared-text">{esc(sp["text"])}</div>')
    local_src = images.resolve(media0.get("thumbnail"))
    thumb = render_media(local_src)
    if thumb:
        parts.append(thumb)
    link = render_link(sp.get("link"))
    if link:
        parts.append(f'<div class="shared-link">{link}</div>')
    parts.append("</div>")
    return "".join(parts)


def render_post(post, images):
    time_str = fmt_time(post.get("timestamp"))
    media0 = (post.get("media") or [{}])[0] if post.get("media") else {}

    parts = ['<article class="post">']

    author = render_author(post)
    if author:
        parts.append(author)

    parts.append('<div class="post-head">')
    if time_str:
        parts.append(f'<span class="time">{time_str}</span>')
    if post.get("url"):
        parts.append(
            f'<a class="permalink" href="{html.escape(post["url"], quote=True)}" '
            f'target="_blank" rel="noopener">View on Facebook &rarr;</a>'
        )
    parts.append("</div>")

    if post.get("text"):
        parts.append(f'<div class="text">{esc(post["text"])}</div>')

    local_src = images.resolve(media0.get("thumbnail"))
    thumb = render_media(local_src)
    if thumb:
        parts.append(thumb)

    link = render_link(post.get("link"))
    if link:
        parts.append(f'<div class="post-link">{link}</div>')

    shared = render_shared(post.get("sharedPost"), images)
    if shared:
        parts.append(shared)

    parts.append("</article>")
    return "".join(parts)


PAGE_TEMPLATE = """
{posts}
"""


def main():
    in_path = sys.argv[1] if len(sys.argv) > 1 else "extracted.json"
    out_path = sys.argv[2] if len(sys.argv) > 2 else "posts.html"

    with open(in_path, encoding="utf-8") as f:
        posts = json.load(f)

    out_dir = os.path.dirname(os.path.abspath(out_path))
    images_dir = os.path.join(out_dir, IMAGES_DIRNAME)
    images = ImageDownloader(images_dir)

    posts_html = "\n  ".join(render_post(p, images) for p in posts)
    prune_images(images)
    page = PAGE_TEMPLATE.format(
        count=len(posts),
        plural="" if len(posts) == 1 else "s",
        posts=posts_html,
    )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(page)

    print(
        f"Wrote {out_path} ({len(posts)} posts) — images: "
        f"{images.downloaded} downloaded, {images.cached} reused from cache, "
        f"{images.removed} no longer needed and deleted, "
        f"{images.failed} failed (kept remote URL)"
    )


if __name__ == "__main__":
    main()

