# Site tools

Scripts that build and maintain parts of the ncan.nz site. Every page is plain
static HTML: these tools write into the pages and data files, and nothing runs
on the server.

Run them from the repository root, e.g. `python tools/sync-partials.py`. Each
script explains itself in full at the top of the file, and most have `--help`.
This page is the map: what each one is for, and which to run when.

> **Keep this file current.** When a tool is added, removed or changes how it
> is used, update its entry here in the same change.

## How the site is laid out

Every page is a folder holding an `index.html`, so its address has no `.html`:
`calendar/index.html` is `https://ncan.nz/calendar/`, and `index.html` at the root
is the home page. A page can have pages of its own one folder further down: the
gallery's album pages, `gallery/2024-colgate-games/index.html`
(`https://ncan.nz/gallery/2024-colgate-games/`). `tools/pages.py` is the one place
the tools learn this.

- **Links between pages and to `assets/` are written from the site root**
  (`/calendar/`, `/assets/css/styles.css`, `/#join`), so they work from any folder.
  Pages opened straight from the disk (`file://`) don't work any more: use the
  local preview (`python -m http.server 8123`).
- **The athlete page and club champs keep their place after `#/`**:
  `/athlete/#/sam-brown` (a section follows: `/athlete/#/sam-brown/out-of-stadia`)
  and `/club-champs/#/season/2026-27` (with `/club-champs/` alone opening the
  newest season). An in-page link (`#out-of-stadia`) is turned into that form by
  the page. The part after `#` never reaches the web server.
- **The old addresses (moved November 2026)**: each `something.html` at the root
  only sends visitors on to `/something/`, keeping what came after `?` and `#`
  (`assets/js/moved.js`; it turns `athlete.html?a=...` and
  `club-champs.html?season=...` into the new form). **Delete them a few months
  after the move** (the files at the root other than `index.html` and `404.html`).
  `404.html` stays: GitHub Pages shows it for any address that doesn't exist, and
  it sends an old address on for good.
- **Help written by hand**: the Junior Athletics planner's "How to use the planner"
  (`#planner-help` in `junior-athletics/index.html`) describes the buttons, chips and
  behaviour of `assets/js/training*.js` by name (`training.js` for the list and the
  public view, `training-print.js` for printing, `training-editor.js` for the coaches'
  buttons and the planner). When a label or what it does changes
  there, update the help to match.
- **A new page** is a new folder with an `index.html`, copied from a page like it
  (with the partial markers), then the tools in "added a new page" below.
- **Colours and dark mode**: `assets/css/styles.css` uses colours by role
  (`--bg`, `--surface`, `--heading`, `--text`, `--line`, ...; listed at its top), not
  the brand colours directly, except where a colour must never change (the green
  bands, text on yellow). Each role's dark colour is in one place, the "Dark mode"
  block at the end. The site follows the device's light or dark setting (there's
  no switch on the site). When adding a style, use the roles, and look at the page in
  both modes. Every page has `<meta name="darkreader-lock">`, so the Dark Reader
  browser extension leaves the site to its own dark mode rather than recolouring it.
  The header logo has a dark version (`assets/img/logo-dark.svg`: the
  same drawing with a lighter green), to be redone if the logo changes.
- **Files at the root that browsers and others look for by name**:
  `favicon.ico` and `apple-touch-icon.png` (made by `build-icons.py`),
  `site.webmanifest` (the name and icons when the site is added to a phone's home
  screen), `robots.txt` and `sitemap.xml` (`build-sitemap.py`), and
  `.well-known/security.txt`, which says where to report a security problem.
  **`security.txt` has an `Expires` date (17 November 2027): renew it each year**,
  or it stops counting. `_config.yml` lists `.well-known` under `include:`, so it
  is published although it starts with a dot (see "Publishing the site").

## Requirements

Python 3 (currently run with 3.14). Most tools use only the standard library;
these need packages installed with `pip install`:

| Tool | Needs |
|---|---|
| `build-fonts.py` | `fonttools`, `brotli` |
| `build-gallery.py`, `gallery-photos.py` | `Pillow` |
| `build-icons.py` | `Pillow`, and Microsoft Edge or Google Chrome |
| `build-share-image.py` | Microsoft Edge or Google Chrome |
| `import-records.py` | `openpyxl` |
| `verify-records.py` | `pypdf` |

`refresh-library-inventory.js` is not run from here. It is pasted into the
browser's console on the Athletics NZ eLearning library (see below).

## Which tool when

| You've… | Run |
|---|---|
| edited `assets/css/styles.css` or a script in `assets/js/` | nothing: publishing stamps them (don't commit stamps; see "Publishing the site") |
| edited anything in `partials/` | `sync-partials.py` |
| added a new page (a folder with an `index.html`) | `sync-partials.py`, `build-sitemap.py`, then `indexnow.py <page>` |
| changed a page's content and want search engines to notice | `indexnow.py <page>` |
| added photos or albums to the gallery | put the originals in the photo host's `gallery/` folder, then `gallery-photos.py`, upload, `build-gallery.py`, and `build-sitemap.py` if an album was added, renamed or removed (see "Gallery") |
| added or changed a calendar in `assets/calendar/` | `build-calendar-list.py` |
| changed the weekly training times | `build-training-calendar.py`, then `build-calendar-list.py` |
| added AGM papers to `assets/docs/agm/` | `build-agm-list.py` |
| a club championships Saturday has finished | add its meeting on the results sources page, then confirm it under "Review results" on the club champs page |
| a meeting's results are out, or a family asks for a page to be removed | in the private ncan-api project: `ncan add-meeting` / `ncan opt-out`, then `ncan collect` |
| new records to check against official results | `verify-records.py` |
| changed the logo (`assets/img/logo.svg`) | `build-icons.py`, `build-share-image.py`, and redo `assets/img/logo-dark.svg` (the logo with `#164724` as `#3A8F5C` and white as `#0c1813`) |
| it's November (`security.txt` expires on 17 November each year) | move the `Expires` date in `.well-known/security.txt` on a year |
| added characters the site's fonts may not have (e.g. a new macron) | `build-fonts.py` |
| changed the Facebook posts' layout in `build-html.py`, or the updater warned about the allowlist | `check-facebook-posts.py` (see its section to allow something new) |
| changed links, moved or removed a file, or a pull request's "Checks" failed | `check-links.py` (and `sync-partials.py`) |
| renamed or removed a button in the Junior Athletics planner (`assets/js/training*.js`) | update "How to use the planner" in `junior-athletics/index.html`, then `check-planner-help.py` |

## Publishing the site

`.github/workflows/pages.yml` publishes the site to GitHub Pages whenever `main`
changes: on a push or merge, after the Facebook updater (`main.yml`) has
committed new posts (its commits start no workflows of their own), or by hand
(Actions → Publish site → Run workflow). It runs `sync-partials.py` and
`stamp-assets.py`, gathers the public files with `build-site.py`, and deploys
them.

Pages is set to publish this way (Settings → Pages → Build and deployment →
Source: **GitHub Actions**).

**The `?v=` stamps are not committed.** They are added at publish time, so the
pages in the repository link `/assets/css/styles.css` and `/assets/js/...`
plainly, and a pull request that edits the stylesheet or a script doesn't touch
every page (which made pull requests clash). The checks fail if a stamp is
committed: run `python tools/stamp-assets.py --clear` and commit.
`sync-partials.py` is still to be run and committed (the
pull request checks look for it), so the pages in the repository read as they
are published.

### `build-site.py`
Copies the files that make up the website into `_site/` (ignored by git), the
folder the publish workflow hands to GitHub Pages. Only files git tracks are
copied. It leaves out what Pages' old Jekyll build left out, so nothing is
published that wasn't before: names starting with `.` `_` `#` or `~` at any
depth (`.git`, `.github`, `.vscode`, `_config.yml`), Jekyll's default excludes
(`Gemfile`, `node_modules`, `vendor/...`) and `_config.yml`'s `exclude:` list,
but keeping its `include:` list (`.well-known`). It also leaves out the
repository's working files that Jekyll did publish: `tools/`, `partials/`,
`actions/` and `README.md`.

```bash
python tools/build-site.py            # into _site/
python tools/build-site.py --list     # list what would be published
```

## Shared parts of every page

### `sync-partials.py`
Copies `partials/head.html`, `header.html` and `footer.html` into every page,
between marker comments such as `<!-- @partial:header -->`. Edit the partial,
never the copy in a page. Marks the current page's own nav link with
`aria-current`. Links in the partials are written from the site root (`/#join`);
in the home page they become plain anchors (`#join`).

```bash
python tools/sync-partials.py
```

It rewrites the whole block between the markers, so a page whose shared blocks
have been reformatted (e.g. by an editor) shows a large but harmless diff the
next time it runs.

### `stamp-assets.py`
Adds a content hash to the stylesheet link (`styles.css?v=1a2b3c4d`) and to
every script from `assets/js/` (`admin.js?v=...`) in every page and in
`partials/head.html`, so browsers fetch the new file after it changes, rather
than running an old script against the club's updated API. Changes one line
per file reference. The hash ignores line endings, so a Windows checkout (where
git gives files Windows line endings) stamps the same as the files the site serves.

```bash
python tools/stamp-assets.py --clear    # remove the stamps (before committing)
python tools/stamp-assets.py --check    # report what stamping would change
python tools/stamp-assets.py            # stamp (the publish workflow does this)
```

Only the publish workflow stamps (see "Publishing the site"): stamps are not
committed, and the checks fail if one is.

### `build-fonts.py`
Builds the self-hosted Inter and Archivo fonts in `assets/fonts/`, cut down to
the characters the site uses. A character missing from the subset silently
renders in a fallback font, so re-run after adding unusual characters.

```bash
python tools/build-fonts.py
python tools/build-fonts.py --check          # report only
python tools/build-fonts.py --report-chars   # list the characters and where they come from
```

### `build-icons.py`
Makes the site's icons from `assets/img/logo.svg`: `favicon.ico` (browser tabs),
`apple-touch-icon.png` (iPhone home screen) and the Android home screen icons in
`assets/img/icons/` named in `site.webmanifest`. It draws the logo with headless
Edge or Chrome, then sizes it. Run it after the logo changes.

```bash
python tools/build-icons.py
```

### `build-share-image.py`
Makes `assets/img/share.png`, the picture Facebook, WhatsApp, LinkedIn and
others show when a page is shared: the header's logo and name on white,
1200 × 630. The layout is `tools/share-image.html`; the script draws it with
headless Edge or Chrome. Every page names the picture by its full address
(`og:image` in `partials/head.html`), because sharing sites ignore a path
without `https://ncan.nz` and don't show SVG. Run it after the logo or the
layout changes.

```bash
python tools/build-share-image.py
```

## Checks on pull requests

Every pull request, and every push to `main`, runs
`.github/workflows/checks.yml` on GitHub. It fails, with the reason in the
run's log, when:

- **a page is out of step with `partials/`**: it runs `sync-partials.py` and
  fails if that changed anything. Run `python tools/sync-partials.py` and
  commit the result.
- **the calendar page's no-JavaScript list is out of step with
  `assets/calendar/calendars.json`**: it runs
  `build-calendar-list.py --page-only --dry-run`. Run
  `python tools/build-calendar-list.py` (or `--page-only`) and commit the result.
- **a link or file within the site is missing**: it runs `check-links.py`.
- **the Junior Athletics planner's help names a button that isn't there**: it
  runs `check-planner-help.py`. Update the help to the new name (or put the
  old name back).
- **a calendar date test fails**: it runs the tests in `tests/js/` with Node,
  once with `TZ=UTC` and once with `TZ=Pacific/Auckland`.
- **the Facebook posts hold something the home page would take out**: it runs
  `check-facebook-posts.py`.

### Calendar date tests (`tests/js/`)
`tests/js/calendar-dates.test.js` tests `assets/js/calendar-dates.js`, the
calendar page's date and repeat-event helpers: times staying put across the
New Zealand clock changes, `RRULE` (`COUNT`, `UNTIL`, `BYDAY`, `INTERVAL`),
`EXDATE`, all-day events, 29 February and month ends, "today" in New Zealand,
the "NZ time" label and the saved `.ics` times. It uses Node's built-in test
runner, so there is nothing to install (Node 22 or later):

```bash
node --test "tests/js/*.test.js"
```

The helpers never read the machine's own time zone, so the tests pass the same
anywhere. After changing `calendar-dates.js`, run them.

### `check-links.py`
Checks that every `href=` and `src=` in the pages (and `404.html`) that points
into the site, written from the root (`/calendar/`, `/assets/css/styles.css`)
or relative to the page, leads to a file that exists, or to a folder with an
`index.html`. What follows `?` or `#` is ignored. Case counts, as it does on the
web server. Other websites, `mailto:`, `tel:`, in-page `#` links and links built
by scripts are not checked. The old addresses that only redirect are skipped.
Standard library only.

```bash
python tools/check-links.py
```

### `check-facebook-posts.py`: the Facebook posts allowlist
The home page shows the club's Facebook posts from `assets/facebook/posts.html`,
which the "Update Facebook posts" workflow (`main.yml`) builds with
`actions/update-facebook-posts/build-html.py`. Before showing them, the page
cleans them with an **allowlist** in `assets/js/post-clean.js`: only the
elements in `TAGS` and the attributes in `ATTRS` are kept, links must start
`http://` or `https://`, and pictures must be the copies in
`assets/facebook/images/`. Anything else is taken out (elements in `DROP`, such
as `<script>` or `<iframe>`, with everything inside them; other elements keep
their text). Normally nothing is taken out, because `build-html.py` escapes the
posts' text.

`check-facebook-posts.py` reads the same lists from `post-clean.js` and reports
anything in `posts.html` the page would take out. It runs in the checks above,
and in the Facebook updater after each update, where it only warns (the posts
still publish, and the page takes the rest out).

```bash
python tools/check-facebook-posts.py              # the current posts
python tools/check-facebook-posts.py some.html    # any other file
```

**To change what's allowed** (say `build-html.py` starts writing `<p>`, or a
picture's `width`):
1. Add the element to `TAGS`, or the attribute to `ATTRS` under its element
   (`'*'` is for every element), in `assets/js/post-clean.js`. Change `URLS`
   only to allow links or pictures from somewhere new.
2. Run `python tools/check-facebook-posts.py`. It should say "nothing the
   allowlist would take out".
3. Run `python tools/stamp-assets.py`, so browsers fetch the new `post-clean.js`.

**To check it's working**, on a local copy (`python -m http.server`) or on
ncan.nz after publishing:
1. Open the home page. The "Recent posts" should show, with their pictures and
   "View on Facebook" links.
2. Open the browser console (F12, Console). There should be no "Club posts:
   took out ..." warning. If there is one, it lists what was taken out: either
   allow it (above) or find out how it got into `posts.html`.
3. To see the cleaner take something out, paste this into the console. It
   should list the `onclick` and the `<script>`, and print the text without
   them:
   ```js
   var d = new DOMParser().parseFromString('<div onclick="x()">Hi<script>x()</script></div>', 'text/html');
   console.log(ncanPostClean.clean(d.body), d.body.innerHTML);
   ```
4. In GitHub, after the Facebook updater has run, its "Check the posts against
   the home page's allowlist" step should show no warnings.

A link that is known to be broken and is to stay that way for now goes in
`tools/check-links-allow.txt` (the page's address, a space, the link as
written); it is then listed as "allowed" rather than failing. The check says
when a line there no longer matches anything, so it can be taken out. Fix the
link rather than adding to the list where you can.

### `check-planner-help.py`
The Junior Athletics planner's help for coaches, "How to use the planner"
(`#planner-help` in `junior-athletics/index.html`), is written by hand and
names buttons in bold (`<strong>Schedule release</strong>`). This takes every
bold name from the help and checks it is still the text of a button or label
in the planner: a whole string in `assets/js/training*.js` (all of them, if the
planner is split into several files) or an element's text in the page outside
the help. Comments don't count, and case, `&amp;`-style entities and curly
apostrophes are ignored. Prints any name not found and exits 1. Bold text that
is emphasis rather than a label goes in the short `IGNORE` list at the top of
the script. Standard library only.

```bash
python tools/check-planner-help.py
```

## Search engines

### `build-sitemap.py`
Writes `sitemap.xml` and `robots.txt`, listing every page (the home page as
`https://ncan.nz/`, the others as `https://ncan.nz/calendar/` and so on). Add a
page's folder name to `SKIP` in the script to leave it out; `athlete`, `athletes`,
`admin` and `results-sources` are skipped, as they show nothing until someone signs in (and carry a noindex tag).
`junior-athletics` is skipped while the coaches and committee review it. Folders
that only redirect (`tuesday-training/`) are never listed. The sitemap was submitted once in Google Search
Console; Google re-reads it by itself.

```bash
python tools/build-sitemap.py
python tools/build-sitemap.py --check
```

### `indexnow.py`
Tells Bing and the other IndexNow search engines that particular pages have
changed. Checks each page and the key file are live first, and sends nothing
if one isn't.

```bash
python tools/indexnow.py club-champs records     # /club-champs/ and /records/
python tools/indexnow.py /                       # the home page
python tools/indexnow.py --dry-run calendar
```

## Gallery

The photos aren't in this repository. They're hosted at
**`https://photos.ncan.nz/`**, and the gallery's pages link there. A local copy
of the host, by default the folder `ncan-gallery` next to this repository (or
set `NCAN_PHOTOS_DIR`, or pass `--photos-dir`), is what the tools read and
write:

```
gallery/<year>/<album>/<photo>.jpg     full-size originals (the zips' contents)
gallery/<year>/<album>/<photo>.webp    the same, as WebP
gallery/<year>/<album>.zip             an album's zip download
thumbs/<year>/<album>/<photo>.jpg      thumbnails, 500px on the long side
thumbs/<year>/<album>/<photo>.webp     the same, as WebP
```

A thumbnail's address is its original's with `gallery/` swapped for `thumbs/`,
and a WebP's is its JPEG's with `.webp` in place of `.jpg`. Each page offers the
WebP thumbnail with the JPEG as the fallback (`<picture>`), and the photo viewer
opens the WebP original in browsers that show WebP, the JPEG in the rest. The
"open in a new tab" link and the zips stay JPEG.

**Adding an album:**
1. Put the originals in `gallery/<year>/<album>/` in the local copy (and its
   zip beside the folder, as `<album>.zip`, if there is one).
2. `python tools/gallery-photos.py` makes the missing thumbnails and WebP copies.
3. Upload the new files (originals, `.webp`s, `thumbs/`, zip) to the host.
4. `python tools/build-gallery.py` (with `--check-zips` for a new zip), then
   `python tools/build-sitemap.py`, and commit.

The album order and the zip index are in `tools/gallery/` (`order.txt`,
`zips.json`), and so is any album's `title.txt` or `README.md`, at
`tools/gallery/<year>/<album>/`.

**The old addresses:** the originals were at `https://ncan.brouwers.nz/gallery/`
and the thumbnails in this repository (`assets/img/gallery/`, until November
2026). `photos.ncan.nz` is served from the same folder as `ncan.brouwers.nz`,
so old links keep working as they are, with no redirect, for as long as
`ncan.brouwers.nz` points there.

To send old links on to the new address anyway (so they show `photos.ncan.nz`),
the redirect must only apply to the old name: the same folder answers both, so
an unconditional redirect would send `photos.ncan.nz` to itself for ever. For
Apache, in that folder's `.htaccess`:

```
RewriteEngine On
RewriteCond %{HTTP_HOST} ^ncan\.brouwers\.nz$ [NC]
RewriteRule ^(.*)$ https://photos.ncan.nz/$1 [R=301,L]
```

or for nginx, a `server` block for `ncan.brouwers.nz` alone:

```
server { server_name ncan.brouwers.nz; return 301 https://photos.ncan.nz$request_uri; }
```

`tools/gallery/` (the album order and zip index) is only read by
`build-gallery.py`. `tools/` isn't published (`build-site.py` leaves it out).

The photo host must serve `.webp` as `image/webp` (current Apache and nginx do).

### `gallery-photos.py`
Makes, in the local copy of the photo host, a thumbnail for every original
that has none, and a WebP copy beside every original and thumbnail that has
none (or whose JPEG is newer). It never changes or deletes a JPEG. Phone
photos' orientation is baked in, and colour profiles kept.
It can be stopped at any time (Ctrl+C, or even killed) and run again to carry
on: files are written whole or not at all, and a run skips what's already made.

```bash
python tools/gallery-photos.py --dry-run                       # what it would make
python tools/gallery-photos.py                                 # make it
python tools/gallery-photos.py --album "2026/Colgate Games"    # one album
python tools/gallery-photos.py --only webp                     # or --only thumbs
```

Options: `--max-edge` (thumbnail size, 500), `--thumb-quality` (82),
`--webp-quality` (80), `--jobs` (photos converted at once: one per CPU by default), `--webp-max-edge` (cap the originals' WebP copies, e.g.
2560: camera photos are bigger than any screen, and a full-size WebP is only
about 10% smaller than its JPEG, a 2560px one about half). The cap is
remembered in `tools/gallery/photos.json` (commit it), so later runs keep to it,
and each run makes again any original's WebP that isn't that size, bigger or
smaller; `--webp-max-edge 0` goes back to full size.

### `gallery-move-thumbs.py`
One-off, for the move to `photos.ncan.nz`: copies the thumbnails that were in
this repository (`assets/img/gallery/`), exactly as they were, from git history
into the local copy's `thumbs/`. It reports first; `--apply` copies. A
thumbnail already there with the same contents is skipped; a different one is
left alone unless `--overwrite`.

```bash
python tools/gallery-move-thumbs.py            # report
python tools/gallery-move-thumbs.py --apply    # copy
```

### `build-gallery.py`
Rebuilds the gallery pages from the local copy's `thumbs/` folder: one album per
folder (a folder of photos inside another, like `2026/Colgate Games/Day 3`, is an
album of its own), with `tools/gallery/` for album order, zips, titles and
intros (see "Gallery"). It reads which photos there are and their sizes; the
pages link to `https://photos.ncan.nz/`. A photo whose WebP copy isn't in the
local copy yet is offered as JPEG only.

- `gallery/index.html` is the front page: a card per album (its first photo as
  the cover, its title and photo count) under a heading per year, in album
  order. Only the part between the `@generated:gallery` markers is rewritten;
  the heading, intro and note above and below it are edited by hand.
- `gallery/<album>/index.html` is a page per album (`<album>` is the folder path
  in lower case with dashes: `2024/Colgate Games` is `gallery/2024-colgate-games/`),
  with its intro, the zip download, the photos and the photo viewer (its script is
  `assets/js/gallery-viewer.js`). These pages
  are written whole each time, copying the head, header and footer from the
  front page, so don't edit them by hand. A page whose album has gone is
  deleted (only pages the script wrote, which carry `@generated:album`).
- Each photo's alt text names the album and the photo's place in it
  ("2024 Colgate Games, photo 5 of 1036"), plus its caption when the file has a
  descriptive name. Each thumbnail links to its full-size original on the photo host.
- Old links to an album on the single-page gallery (`/gallery/#album-<album>`)
  are sent on to the album's page by the front page's script, `assets/js/gallery.js`.
- The script links are written plain, like every page's: publishing adds the
  `?v=` stamps, so editing either script needs no rebuild.

After adding, renaming or removing an album, run `build-sitemap.py` too, as each
album page is listed in the sitemap.

```bash
python tools/build-gallery.py
python tools/build-gallery.py --check-zips     # which albums have a zip download, and how big
python tools/build-gallery.py --write-order    # save the current album order
NCAN_PHOTOS_URL=http://127.0.0.1:8152/ python tools/build-gallery.py   # preview against a local copy served on 8152 (don't commit)
```

## Calendars

### `build-training-calendar.py`
Generates the weekly training `.ics` files (`training-*.ics`) for a season,
which runs April to March. File names carry no season, so subscriptions keep
working year to year.

```bash
python tools/build-training-calendar.py                # current season
python tools/build-training-calendar.py --season 2027  # 2027/28
python tools/build-training-calendar.py --list         # show the dates
```

### `build-calendar-list.py`
Maintains `assets/calendar/calendars.json`, the list the calendar page (`/calendar/`) reads.
Picks up `.ics` files in the folder, keeping names and colours already set,
and can mirror calendars published elsewhere. Each time it writes the manifest
it also rewrites the list of calendars that readers without JavaScript see on
the calendar page (between the `@generated:calendar-list` markers in
`calendar/index.html`), each calendar's name linked to its `.ics`.

```bash
python tools/build-calendar-list.py                    # rescan the folder
python tools/build-calendar-list.py --fetch            # re-download remote calendars
python tools/build-calendar-list.py --add URL --name "…" --file events-x.ics
python tools/build-calendar-list.py --rainbow          # re-order colours
python tools/build-calendar-list.py --dry-run          # exits 1 if the manifest or page list would change
python tools/build-calendar-list.py --page-only        # only rewrite the page list from the manifest
```

The event calendars themselves (`events-*.ics`, `other-meetings.ics`) are
edited by hand.

## Children's club records

### `import-records.py`
One-off importer from the club's `NCAN Records.xlsx` into
`assets/data/records.json`. After that the JSON is edited by hand and is the
source of truth, so it refuses to overwrite an existing file without `--force`.

```bash
python tools/import-records.py "C:/path/NCAN Records.xlsx" --report
```

### `verify-records.py`
Checks records in `records.json` against the official Canterbury Children's
Athletics result PDFs and writes a `source` link only where the athlete and
mark are found together. Never overwrites a source added by hand, or a record
marked `checked_by` a person.

```bash
python tools/verify-records.py --report     # see what it would do
python tools/verify-records.py --apply
```

Options: `--cache` (folder for downloaded PDFs), `--refetch`, `--limit`.

## Children's club championships

The club champs page (`/club-champs/`) holds no results itself. It reads each season from the club's
API (`https://api.ncan.nz/v1/club-champs`), with no sign-in needed. The API works
the results out from the meetings it collects: add a Saturday's interclub on the
results sources page, and its club championship results are proposed. A club
administrator or coach then reviews and confirms them, in "Review results" on
the club champs page (`assets/js/club-champs-review.js`). Only confirmed results
are shown.

The programme for each season (which events count on each Saturday, and the
points) is in the private **ncan-api** project, `config/club-champs/`, with the
procedures in its `docs/DATA.md`.

## Athlete pages

The athletes page (`/athletes/`) and each athlete's page (`/athlete/#/<their name>`) hold no results themselves. They
read them from the club's API at `https://api.ncan.nz`, and only for someone
signed in: a family sees their own children, coaches and the committee see
everyone. Both show totals for what's shown (results, meetings, events,
distances), with 1st, 2nd and 3rd places in a row of medal blocks of their own
(only when there's a podium; a relay team's place counts once), and the
athletes page counts the athletes on the podium.

The results sources page (`/results-sources/`) is for club administrators,
coaches and the committee, signed in (the API's `GET /v1/meetings` refuses
anyone else): it lists every meeting collected, with how many results each
added and which of our athletes. Anyone else sees only a sign-in form, or a line
saying who the page is for; it is noindex and left out of the sitemap, and the
athletes page shows its link only to staff. Administrators, coaches and the
committee add meetings there; administrators also change a meeting's type and
remove meetings.

The Club admin page (`/admin/`) is for club administrators: what the last collect
found that needs a look, merges, membership changes, the members list upload,
corrections and site-wide blocks (`assets/js/admin.js`); administrators get a
"Club admin" link on the "Signed in as" line. Each athlete page also has a
"Manage this athlete" section for administrators only: its numbers, with links
to their athletic.net bios, and adding or taking out a number: an athletic.net
number, or a page number given by hand (900000001 up), whose results move to
the page (`assets/js/athlete-manage.js`). The shared sign-in code is
`assets/js/ncan-account.js`.

The filter and form dropdowns (`.records-field select`) draw the site's own
arrow, so they look the same in every browser.

Collecting results, the members list, merges, corrections and opt-outs all live
in the private **ncan-api** project (`docs/DATA.md` there), not in this public
repository. No athlete data belongs here.

To try the pages on this computer, run ncan-api's API locally on port 8765,
allowing this site's address (see `docs/API.md` in ncan-api), then open
`http://localhost:8123/athletes/`.

## Committee page

### `build-agm-list.py`
Rebuilds the AGM papers list in `committee/index.html` from the PDFs in
`assets/docs/agm/<year>/`. Recent years are listed; older ones fold away.

```bash
python tools/build-agm-list.py               # 5 most recent years shown
python tools/build-agm-list.py --recent 3
```

## Athletics NZ library

### `refresh-library-inventory.js`
Refreshes `assets/data/athletics-nz-library-inventory.json`, which
the library page (`/athletics-nz-library-inventory/`) reads. It needs your Athletics NZ login,
so it runs in your browser rather than from here:

1. Log in at https://athleticsnz.elearning.worldathletics.org/library
2. Open DevTools (F12) → Console, paste the whole script, press Enter.
3. When the box says **Finished**, the JSON downloads. Replace the file in
   `assets/data/` with it.

It only reads, one folder at a time with a pause between, and can compare
with an earlier inventory.
