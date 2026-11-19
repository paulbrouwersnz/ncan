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
  behaviour of `assets/js/training.js` by name. When a label or what it does changes
  there, update the help to match.
- **A new page** is a new folder with an `index.html`, copied from a page like it
  (with the partial markers), then the tools in "added a new page" below.
- **Colours and dark mode**: `assets/css/styles.css` uses colours by role
  (`--bg`, `--surface`, `--heading`, `--text`, `--line`, ...; listed at its top), not
  the brand colours directly, except where a colour must never change (the green
  bands, text on yellow). Each role's dark colour is in one place, the "Dark mode"
  block at the end. The site follows the device's light or dark setting; the
  "Switch to dark mode" button in the footer (`assets/js/theme.js`) overrides it
  for that browser. When adding a style, use the roles, and look at the page in
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
| `build-gallery.py`, `shrink-gallery.py` | `Pillow` |
| `build-icons.py` | `Pillow`, and Microsoft Edge or Google Chrome |
| `build-share-image.py` | Microsoft Edge or Google Chrome |
| `import-records.py` | `openpyxl` |
| `verify-records.py` | `pypdf` |

`refresh-library-inventory.js` is not run from here. It is pasted into the
browser's console on the Athletics NZ eLearning library (see below).

## Which tool when

| You've… | Run |
|---|---|
| edited `assets/css/styles.css` or a script in `assets/js/` | `stamp-assets.py` (optional once the site publishes through GitHub Actions: see "Publishing the site") |
| edited anything in `partials/` | `sync-partials.py`, then `stamp-assets.py` |
| added a new page (a folder with an `index.html`) | `sync-partials.py`, `stamp-assets.py`, `build-sitemap.py`, then `indexnow.py <page>` |
| changed a page's content and want search engines to notice | `indexnow.py <page>` |
| added photos or albums to the gallery | `shrink-gallery.py` (after the originals are on the mirror), then `build-gallery.py`, then `build-sitemap.py` if an album was added, renamed or removed |
| added or changed a calendar in `assets/calendar/` | `build-calendar-list.py` |
| changed the weekly training times | `build-training-calendar.py`, then `build-calendar-list.py` |
| added AGM papers to `assets/docs/agm/` | `build-agm-list.py` |
| a club championships Saturday has finished | add its meeting on the results sources page, then confirm it under "Review results" on the club champs page |
| a meeting's results are out, or a family asks for a page to be removed | in the private ncan-api project: `ncan add-meeting` / `ncan opt-out`, then `ncan collect` |
| new records to check against official results | `verify-records.py` |
| changed the logo (`assets/img/logo.svg`) | `build-icons.py`, `build-share-image.py`, and redo `assets/img/logo-dark.svg` (the logo with `#164724` as `#3A8F5C` and white as `#0c1813`) |
| it's November (`security.txt` expires on 17 November each year) | move the `Expires` date in `.well-known/security.txt` on a year |
| added characters the site's fonts may not have (e.g. a new macron) | `build-fonts.py` |
| changed links, moved or removed a file, or a pull request's "Checks" failed | `check-links.py` (and `sync-partials.py`) |
| renamed or removed a button in the Junior Athletics planner (`assets/js/training*.js`) | update "How to use the planner" in `junior-athletics/index.html`, then `check-planner-help.py` |

## Publishing the site

`.github/workflows/pages.yml` publishes the site to GitHub Pages whenever `main`
changes: on a push or merge, after the Facebook updater (`main.yml`) has
committed new posts (its commits start no workflows of their own), or by hand
(Actions → Publish site → Run workflow). It runs `sync-partials.py` and
`stamp-assets.py`, gathers the public files with `build-site.py`, and deploys
them.

> **One-off setting, needed before this takes over:** Settings → Pages → Build
> and deployment → Source: **GitHub Actions** (the repository owner). Until
> then, Pages keeps building straight from the `main` branch with Jekyll, as it
> always has, and the stamps must still be committed.

Once it's switched, **committing the `?v=` stamps is optional**: they are
brought up to date at publish time, so a pull request that edits the stylesheet
or a script needn't run `stamp-assets.py` (and two pull requests no longer
clash over the same stamp). Running it locally still does no harm, and keeps a
local preview fresh. `sync-partials.py` is still to be run and committed (the
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
python tools/stamp-assets.py            # stamp
python tools/stamp-assets.py --check    # report only
python tools/stamp-assets.py --clear    # remove the stamps
```

The publish workflow runs it too (see "Publishing the site"), so once Pages
publishes through GitHub Actions, committing the stamps is optional.

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
page's folder name to `SKIP` in the script to leave it out; `athlete`, `athletes`
and `admin` are skipped, as they show nothing until someone signs in (and carry a noindex tag).
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

### `shrink-gallery.py`
Resizes the photos in `assets/img/gallery/` in place to thumbnails (500px on
the long edge). **This overwrites the originals.** The full-size photos live
on the mirror at `https://ncan.brouwers.nz/gallery/`, and the script checks a
sample is there before shrinking anything. Never run it on photos that aren't
on the mirror yet.

```bash
python tools/shrink-gallery.py                       # dry run
python tools/shrink-gallery.py --album "2026/Colgate Games" --apply
```

Options: `--max-edge`, `--quality`, `--jobs`, `--sample`, and
`--skip-remote-check` (not advised).

### `build-gallery.py`
Rebuilds the gallery from the folders in `assets/img/gallery/`: one album per
folder (a folder of photos inside another, like `2026/Colgate Games/Day 3`, is an
album of its own), a `title.txt` to rename it, a `README.md` for an intro, and
`order.txt` for album order.

- `gallery/index.html` is the front page: a card per album (its first photo as
  the cover, its title and photo count) under a heading per year, in album
  order. Only the part between the `@generated:gallery` markers is rewritten;
  the heading, intro and note above and below it are edited by hand.
- `gallery/<album>/index.html` is a page per album (`<album>` is the folder path
  in lower case with dashes: `2024/Colgate Games` is `gallery/2024-colgate-games/`),
  with its intro, the zip download, the photos and the photo viewer. These pages
  are written whole each time, copying the head, header and footer from the
  front page, so don't edit them by hand. A page whose album has gone is
  deleted (only pages the script wrote, which carry `@generated:album`).
- Each photo's alt text names the album and the photo's place in it
  ("2024 Colgate Games, photo 5 of 1036"), plus its caption when the file has a
  descriptive name. Each thumbnail links to its full-size copy on the mirror.
- Old links to an album on the single-page gallery (`/gallery/#album-<album>`)
  are sent on to the album's page by a small script on the front page.

After adding, renaming or removing an album, run `build-sitemap.py` too, as each
album page is listed in the sitemap.

```bash
python tools/build-gallery.py
python tools/build-gallery.py --check-zips     # which albums have a zip download, and how big
python tools/build-gallery.py --write-order    # save the current album order
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

The results sources page (`/results-sources/`) is public: it lists every meeting collected, with how
many of our athletes and results each added, and shows the athletes' names only
to coaches and the committee. Signed in, administrators, coaches and the
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
