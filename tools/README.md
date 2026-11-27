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
  `/athlete/#/sam-brown` (a section follows: `/athlete/#/sam-brown/out-of-stadia`;
  an enlarged chart: `/athlete/#/sam-brown/chart/100m-hurdles`, so Back closes it)
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
| edited anything in `partials/`, including the staff tools list (`staff-tools.json`) | `sync-partials.py` |
| added a new page (a folder with an `index.html`) | `sync-partials.py`, `build-sitemap.py`, then `indexnow.py <page>` |
| changed a page's content and want search engines to notice | `indexnow.py <page>` |
| added photos or albums to the gallery | put the originals in the photo host's `gallery/` folder, then `gallery-photos.py`, upload, `build-gallery.py`, and `build-sitemap.py` if an album was added, renamed or removed (see "Gallery") |
| added, changed or cancelled a calendar event, or changed a calendar | nothing here: use the calendar editor at `/admin/calendars/` (see "Calendars"); don't edit `assets/calendar/` by hand |
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
| edited `assets/data/page-photos.json` (header photos) | `make-head-photo.py` (see "Header photos") |
| changed header photos on the Club admin header photos page | nothing: published within the half hour (see "Header photos") |

## Publishing the site

`.github/workflows/pages.yml` publishes the site to GitHub Pages whenever `main`
changes: on a push or merge, after the Facebook updater (`main.yml`) has
committed new posts (its commits start no workflows of their own), or by hand
(Actions → Publish site → Run workflow). It brings in the header photo
settings and the calendars kept by the club's API (`fetch-page-photos.py`,
`fetch-calendars.py`), runs `sync-partials.py` and `stamp-assets.py`, gathers
the public files with `build-site.py`, and deploys them. Every half hour it also
checks whether the header photos or calendars in the API differ from the live
site's, and publishes if they do.

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

It also writes the **staff tools cards** on `/admin/`, between
`<!-- @tools:admin -->` markers, from one list: `partials/staff-tools.json`
(`tools/staff_tools.py`).
Each tool is one entry: `title`, `href`, `blurb`, `lowest` (coach, committee or
admin), `group`, and an optional `count` for a waiting-count badge. Each group
is written with its lowest role (`data-lowest`), and `admin.js` shows each
person only the groups their role reaches. Hiding is only tidiness: each
tool's page and the API still refuse anyone below its role.

An admin can **Act as** a coach, the committee or one family (the switch in
the green band on `/admin/`; `POST /v1/auth/act-as` in the API). The API then
answers them as that role on every page, so they see and use the site exactly
as that person does, without signing in as them, and still records every
change as the admin. A yellow banner on every page (`account-link.js`) says
who they're acting as, with **Back to admin**. It ends when they go back, at
sign-out, or after an hour. Tests: `tests/js/account-link.test.js`. To add a tool,
add one entry and run the script; it refuses a list with an unknown role or
group, a tool whose role doesn't match its group, or an address listed twice.
Tests: `tests/py/test_staff_tools.py`.

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
- **a JavaScript test fails**: it runs the tests in `tests/js/` with Node,
  once with `TZ=UTC` and once with `TZ=Pacific/Auckland`.
- **the Facebook posts hold something the home page would take out**: it runs
  `check-facebook-posts.py`.
- **a header photo isn't approved, or a page is out of step with
  `assets/data/page-photos.json`**: it runs `make-head-photo.py --check` and
  the tests in `tests/py/`. Fix the entry it names, run
  `python tools/make-head-photo.py`, and commit the result.

### Tests (`tests/js/`, `tests/py/`)

Each `tests/js/<name>.test.js` tests the helpers in `assets/js/<name>.js` (or
`tools/head-photo-pick.js`):

| Test file | What it covers |
|---|---|
| `calendar-dates.test.js` | the calendar's dates and repeat events (below) |
| `page-photos.test.js`, `head-photo-pick.test.js` | header photos: pools, which entry wins, the pick before the page draws |
| `training-links.test.js` | training plan links: moved plans, no plan, draft wording |
| `ncan-account.test.js` | sign-in: `#/next/` return addresses, where each role lands, the at-least-role check, the committee note, sending again after a typo |
| `form-lock.test.js` | locking a form while it works (below) |
| `gallery-viewer.test.js` | the photo viewer's download button |
| `meeting-links.test.js` | a meeting's other links on the results sources and athlete pages |
| `calendar-edit.test.js` | the calendar editor: form to event and back, its checks, the words for dates and repeats |
| `athlete-seasons.test.js` | seasons on the athlete charts (1 April to 31 March, winter and summer bands, "so far", season bests per weight), the By season view (each date's day in its season, 29 February included, and each season's colour), Hide empty months (only months with no result in any season, each run of them a break on the axis) and the enlarged chart's date ranges |
| `pb-card.test.js` | Share cards (`assets/js/pb-card.js`): the headline for a new PB, PB, season best, podium place or result, with its caption and file name; the Photo card filling the card with its washes, the Event card's scene for each event (and its track colour), the crop keeping the focus point in view, zooming in and dragging the photo (stopping at its edges); the improvement wording (−0.32s, +18cm, +1.05m), the place only for 1st–3rd, first name only by default for children, the season count, the caption and file name, and the square and story layouts: the mark in gold, the ribbon only with an improvement, every word inside the card and nothing overlapping |
| `wind-adjust.test.js` | wind-adjusted estimates (`assets/js/wind-adjust.js`): sprints by race distance (a 200m on the straight only), hurdles, long and triple jump, each event's wind limit, long jump marked rough over 2 m/s, and no estimate for other events, no mark or no reading |
| `chart-image.test.js` | the enlarged chart saved as an image (Download, `assets/js/chart-image.js`): the file name (athlete and event, accents dropped), the dates line, the key wrapping into rows, reading a key swatch's ring from its CSS, the image shapes (Auto, landscape 3:2, portrait 4:5, square 1:1) and the layout leaving the chart room in each, a note (the wind-adjusted caution) wrapped under the key; for Share, the name on a shared image (full, or first name only) and the details sent with it |
| `shared-charts.test.js` | the shared links lists (`assets/js/shared-charts.js`): what each share shows (event, dates, view, wind adjusted; a season card by its season), who shared it ("you" or someone else for families, the email for admins), the removed wording ("Removed by the club" for families, with who and why for admins) and the admin page's Show and Find; the share usage badges (today and live against the limits, which is full) |

`tests/py/test_page_photos.py` tests the header photo checks
(`python -m unittest discover -s tests/py`). Add a test file with any new helper
file; GitHub runs them all on every pull request.

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
`admin` (and its tool pages under it) and `results-sources` are skipped, as they show nothing until someone signs in (and carry a noindex tag). `recaps` (meeting recaps) is skipped too in phase 1: the pages carry a noindex tag.
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

## Header photos

Any page with a green heading band (`.page-head--photo` in `styles.css`; not
the home page, which has its own hero) can have a photo behind it. A page with
no entry keeps the plain band.

**Admins change them on the Club admin page** (`/admin/header-photos/`): pools,
pages and `#/...` addresses, a "which photo shows here?" tester, versions with
undo, and the athletes' own photos most recently uploaded, each with Remove
(`assets/js/admin-photos.js`). The club's API keeps those settings
(`GET /v1/page-photos`, in ncan-api) and checks them as `make-head-photo.py`
does. They are laid over `assets/data/page-photos.json`: a pool or page entry
there replaces the file's of the same name, and the file keeps the gallery's
album entries and anything written by hand.

- On a page that picks photos as it loads (marked `data-page-photos`, below),
  `page-photos.js` reads the API's settings too, so a change shows within five
  minutes (the API's cache time). If the API can't be reached in 2.5 seconds it
  uses the copy published with the file.
- At publish time `tools/fetch-page-photos.py` adds the API's settings to the
  published file as its `"api"` part (never committed: `make-head-photo.py
  --check` fails if it is), and `make-head-photo.py` writes them into the
  pages, so a page that had no photo before gets one. The Publish site
  workflow also runs every half hour, and publishes only when the settings
  differ from the live site's (`fetch-page-photos.py --compare-live`). An entry
  for a page that isn't on the site, or has no heading band, is left out with a
  warning; if the settings still have a problem, all of them are left out of
  that publish. Neither ever stops a publish.

**Athletes' own photos** (`assets/js/athlete-photo.js`, "A photo for this
page" on `/athlete/`): the athlete's GameDay contacts and admins can upload one;
coaches can also remove one. It's cropped to the band's shape (2:1) in the
browser, with a focus point, made 1600 pixels across (never under 640) and
saved as WebP (JPEG where the browser can't), under 600 KB; drawing it afresh
leaves out the file's location and camera details, and the API checks it again
and strips anything left. It's private like the page: fetched signed in and
shown with `NCAN.pageHead.photo({photo, focus})`, which keeps it over whatever
the settings give `/athlete/`.

With a photo there, the same people get **Edit photo** and **Replace photo**.
Edit photo changes only what stays in view: a 3 × 3 "Keep in view" grid (top
left `0% 0%` … bottom right `100% 100%`), or a point clicked on the photo,
shown as **Custom**. It saves just the focus (`POST .../photo/settings`), with
no new upload, and the heading follows as you choose. Replace photo is the
crop-and-upload flow, starting from the current "Keep in view"; the new photo
takes the old one's place in one step. The grid is its own file,
`assets/js/anchor-grid.js` (tests: `tests/js/anchor-grid.test.js`), so the admin
Header photos editor can use it later.

The file has two parts (the admin page's "Edit as text" uses the same layout):

```json
{
  "pools": {
    "sprints": ["https://photos.ncan.nz/gallery/2026/a.webp", "https://photos.ncan.nz/gallery/2026/b.webp"],
    "jumps":   [{ "src": "https://photos.ncan.nz/thumbs/2026/c.jpg",
                  "webp": "https://photos.ncan.nz/gallery/2026/c.webp",
                  "tags": ["long-jump"], "focus": "50% 30%" }],
    "junior":  { "include": ["sprints", "jumps"], "photos": ["..."] },
    "club":    { "include": ["junior", "seniors"], "exclude": ["https://photos.ncan.nz/gallery/2026/b.webp"],
                 "pick": "by-pool" }
  },
  "pages": {
    "/junior-athletics/":                  { "pool": "junior" },
    "/junior-athletics/#/plan/*":          { "pool": "jumps" },
    "/junior-athletics/#/plan/2026-11-24": { "photos": ["https://photos.ncan.nz/gallery/2026/relay.webp"], "focus": "50% 30%" },
    "/history/":                           { "photo": "none" }
  }
}
```

- **A photo** is an address, or `{"src", "webp", "tags", "focus"}` when
  there is a JPEG and a WebP (the browser takes the WebP) or it carries tags or
  a focus point. Photos must be on `https://photos.ncan.nz/` or a file under
  `/assets/`. Only put photos in a pool used by a public page when the club has
  consent to publish them, the same rule as the gallery.
- **A pool** is a list of photos, or `{"include": [pools], "photos": [...],
  "exclude": [addresses]}`. Included pools are merged, each photo once, and
  `exclude` is applied last. A pool may include pools that include others, up
  to four deep. `"pick": "by-pool"` picks one of its pools first, then a photo
  in it, so a small pool isn't drowned out by a big one. `"public": false`
  marks a pool that must not reach a public page; a page using one must say
  `"public": false` too.
- **A page entry** gives one of `"pool"`, `"photos"`, or `"photo": "none"`,
  and an optional `"focus"` (`"x% y%"`, the part of the photo kept in view;
  `center 35%` otherwise). The key can name a `#/...` address: the exact
  address wins (`#plan-2026-11-24`, the planner's list link, counts as
  `#/plan/2026-11-24`), then the longest pattern ending in `*`, then the page.
  An entry replaces the page's choice; to add to it, use a pool that includes
  the page's pool.

After editing, run:

```bash
python tools/make-head-photo.py
```

It checks the file (see its docstring for the list), then writes each page's
first photo into the page, so it shows before any script runs. Where there is
more to choose from (several photos, or `#/...` entries), it also marks the
band `data-page-photos` and writes a small script straight after the band's
opening tag (`tools/head-photo-pick.js`, with that page's choices). It picks a
photo at random, not the one that page showed last time, as the page is read,
before it is first drawn, so the photo doesn't jump. `assets/js/page-photos.js`
(on every page, from `partials/head.html`) then keeps that photo while the
live settings still allow it for the address, and otherwise, or as the
`#/...` part changes to an entry that rules it out, loads the new photo first
and fades it in over the old (no fade for people who ask for reduced motion).
`head-photo-pick.js` is squeezed onto one line when written, so end every
statement with a semicolon and keep comments on lines of their own.
Unmarked pages never fetch the file. A page's own script can call
`NCAN.pageHead.photo({tags: [...]})` to prefer photos with those tags, or
`NCAN.pageHead.photo({photo: {src, webp}, focus})` to show a photo of its own
until `NCAN.pageHead.photo({release: true})`.

The gallery's album pages are entries too, marked `"source": "gallery"`:
`build-gallery.py` rewrites those from each album's cover photo and leaves
hand-written entries alone (an album entry without `"source"` wins; run
`make-head-photo.py` after `build-gallery.py` to write it in).

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
`zips.json`), and so is any album's `title.txt`, `cover.txt` or `README.md`, at
`tools/gallery/<year>/<album>/`.

**Choosing an album's cover:** an album's cover photo is its card's picture on
the gallery front page, and the photo behind the green heading band on the
album's own page (darkened on the left so the white title stays readable). It
is the album's first photo (by file name). To show another, put that photo's file name in
`tools/gallery/<year>/<album>/cover.txt` (e.g. `IMG_0312.jpg`; the extension
and capitals don't matter), then run `python tools/build-gallery.py` and
commit. A name that isn't in the album is reported, and the first photo used.

**The old addresses:** the originals were at `https://ncan.brouwers.nz/gallery/`
and the thumbnails in this repository (`assets/img/gallery/`, until November
2026). `photos.ncan.nz` is served from the same folder as `ncan.brouwers.nz`,
so old links keep working as they are, with no redirect, for as long as
`ncan.brouwers.nz` points there.

To send old links on to the new address anyway (so they show `photos.ncan.nz`),
the redirect must only apply to the old name: the same folder answers both, so
an unconditional redirect would send `photos.ncan.nz` to itself for ever.

**The photo host's `.htaccess`:** the complete file is
[`photo-host.htaccess`](photo-host.htaccess). Upload it to the photo folder (the
virtual host's document root, shown in Web Station → Virtual Host) as
`.htaccess`, replacing the old one. It:

1. redirects `ncan.brouwers.nz` to `photos.ncan.nz` (the old name only);
2. sends `.webp` as `image/webp`;
3. lets ncan.nz's pages fetch photos (`Access-Control-Allow-Origin` for
   `https://ncan.nz`, `https://www.ncan.nz` and `localhost` for testing, plus
   `Vary: Origin`), so the viewer's download button can save the photo straight
   to the device instead of opening it in a new tab (`gallery-viewer.js`
   checks once, with a HEAD request, the first time the viewer opens). Browsers only let a page
   read a photo from another site when that site says so; JavaScript on ncan.nz
   can't add the header itself;
4. makes any photo address ending in `?download=1` save rather than show
   (`Content-Disposition: attachment`), with no JavaScript needed. The
   viewer's download button links there, so it saves even when the check in
   3 says no; on a host without either rule the photo opens in a new tab.

Check it after uploading (each should show the header named):

```bash
curl -sI -H "Origin: https://ncan.nz" "https://photos.ncan.nz/thumbs/2017/Canterbury%20Champs%20Timaru/20170305_175501.jpg"
```

```bash
curl -sI "https://photos.ncan.nz/thumbs/2017/Canterbury%20Champs%20Timaru/20170305_175501.jpg?download=1"
```

```bash
curl -sI "https://ncan.brouwers.nz/gallery/"
```

The first should include `Access-Control-Allow-Origin: https://ncan.nz`, the
second `Content-Disposition: attachment`, the third `301` and
`Location: https://photos.ncan.nz/gallery/`. If none of the headers appear, the
virtual host isn't reading `.htaccess` (it needs `AllowOverride`), or Web
Station is using nginx for it rather than Apache 2.4 (Web Station → Virtual
Host → Back-end server). A `500` error means a module is missing; the
Apache error log names it.

For nginx in place of Apache, a `server` block for `ncan.brouwers.nz` alone does
the redirect:

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

The club's calendars are edited on the calendar editor (`/admin/calendars/`,
below) and kept by the club's API. The files in `assets/calendar/` are the
website's fallback copy, refreshed from the API at every publish and not
committed:

- **The calendar page** (`assets/js/calendar.js`) reads `GET /v1/calendars` and
  each calendar's `.ics` from the API as it loads, so an edit shows there within
  a minute. If the API doesn't answer within 2.5 seconds it uses the published
  files.
- **Phones that subscribe** keep using `https://ncan.nz/assets/calendar/<name>.ics`.
  The publish workflow writes those files from the API (`fetch-calendars.py`),
  on every publish and on the half-hour check when the calendars have changed,
  so subscribers get an edit within about 30 minutes, plus their calendar app's
  own refresh time (Google Calendar can take up to a day).

Don't edit the `.ics` files or `calendars.json` by hand: the next publish
replaces them with the API's copy. The repository's copy is only refreshed if
someone commits a fresh one (run `fetch-calendars.py` and commit), which is
worth doing now and then so the fallback isn't far behind.

### `fetch-calendars.py`
Run by the publish workflow: fetches the API's public calendars into
`assets/calendar/` (one `.ics` per calendar, and `calendars.json` with the
API's version), then `build-calendar-list.py --page-only` rewrites the calendar
page's no-JavaScript list. It never stops a publish and never publishes half a
set: if the API can't be reached, or its list or any `.ics` doesn't look right,
every file is left as it is. A calendar deleted on the editor keeps its file,
so a subscriber's link still answers, but is no longer listed.

```bash
python tools/fetch-calendars.py                  # fetch into assets/calendar/
python tools/fetch-calendars.py --compare-live   # "true" if the API's version differs from the live site's
```

### `build-training-calendar.py`
Retired: weekly training is now a repeating event on the calendar editor. It
used to generate the weekly training `.ics` files (`training-*.ics`) for a
season (April to March); its output would now be replaced at the next publish.

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

Since the switch to the calendar editor, the publish workflow is what runs it
(`--page-only`); the other options are for the old hand-kept files.

### The calendar editor (`/admin/calendars/`)

Coaches, the committee and administrators add, change and cancel events in the
club's calendars at `/admin/calendars/` (the **Calendars** card on the staff
tools page). The club's API keeps them (`private/calendars.json` in ncan-api;
its `docs/API.md`, "Calendars"): each event is stored once with the calendars
it shows in, and every save is a version, the last 50 kept, so **Versions** on
the page can go back. Administrators also get **Calendar settings**: change a
calendar's name, colour, kind, order, description or whether it is public; make
a new one (its subscription name becomes `<name>.ics` and never changes); delete
one; and how many years of past events the feeds keep.

- `assets/js/admin-calendars.js` is the page; `assets/js/calendar-edit.js` holds
  its pure parts (form to event and back, the checks, the words for dates and
  repeats), tested by `tests/js/calendar-edit.test.js`.
- Each change sends the version the page loaded. The API refuses only if *that*
  event changed since, and the page offers **Load the latest**.
- The address names the calendar and event: `/admin/calendars/#/events-senior`,
  or `#/events-senior/<event id>` to open one event's editor.
- A saved change shows on the calendar page within a minute and reaches
  subscribers at the next publish (see "Calendars" above).

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

## Roles

Who can do what is decided by the club's API (its `docs/API.md` has the full
table); the site only chooses what to show. There are four roles, lowest
first, and each can do everything the roles below it can:

**family < coach < committee < admin**

- **family**: an adult athlete (their own page), a parent or guardian: the
  pages GameDay links them to. GameDay contacts also choose who else sees the
  page and upload its photo.
- **coach**: every athlete's page, training plans, the club champs review,
  results sources, removing an athlete's photo. Lands on `/admin/`, which
  shows them the Coaches' tools.
- **committee**: everything a coach can, plus committee tools as they're
  added. Lands on `/admin/`, which shows them Committee tools and Coaches'
  tools. On the training plans and the club champs
  review they see a note that coaches usually make changes there.
- **admin**: everything. Lands on `/admin/`.

Staff keep their family links: a coach who is a parent manages their child's
page like any parent, and the "Signed in as ..." line links to their own
athletes (`own` from `GET /v1/auth/me`).

In code, check the lowest role allowed with `NCAN.atLeast(who, 'coach')`
(`assets/js/ncan-account.js`), never by listing role names. Each group of
cards on `/admin/` says its lowest role in `data-lowest`.

## Athlete pages

The athletes page (`/athletes/`) and each athlete's page (`/athlete/#/<their name>`) hold no results themselves. They
read them from the club's API at `https://api.ncan.nz`, and only for someone
signed in: a family sees their own children, coaches and above see everyone
(see [Roles](#roles)). Both show totals for what's shown (results, meetings, events,
distances), with 1st, 2nd and 3rd places in a row of medal blocks of their own
(only when there's a podium; a relay team's place counts once), and the
athletes page counts the athletes on the podium.

The results sources page (`/results-sources/`) is for club administrators,
coaches and the committee, signed in (the API's `GET /v1/meetings` refuses
anyone else): it lists every meeting collected, with how many results each
added and which of our athletes. Anyone else sees only a sign-in form, or a line
saying who the page is for; it is noindex and left out of the sitemap, and the
athletes page shows its link only to staff. Administrators, coaches and the
committee add meetings there; administrators also rename a meeting, change its
type, give it up to five other links (an organiser's PDF, a photo finish: shown on
the page and on athlete pages, never collected; `assets/js/meeting-links.js`) and
remove meetings. Adding, renaming, a type change or removing starts a collect
(5–10 minutes), and the form stays locked until it ends.

**Event charts** (`assets/js/athlete.js`, with the season maths in
`assets/js/athlete-seasons.js`): every chart shades winter (1 April to 30
September) light grey and leaves summer white, with a dashed line and the
season's name at each 1 April and a faint "Winter"/"Summer" inside each band
(charts covering 60 days or less get none). "Show seasons" turns the bands off.
Each season's best always has a light green surround (`--chart-sb`), per weight
for throws. A Timeline / By season switch draws every season on one April to
March axis, one coloured line per season. "Hide empty months" (off by default,
with a ? tip) squashes out months with no result in any season, each run shown as
a // break; page charts hide only months empty for every event shown, so they
still line up. All three choices are remembered on the device.
The settings that change every chart (the switches, Spread out, a chart per
weight, Show seasons, Hide empty months) sit together above the page's charts
(`#ath-chart-controls`); the small charts carry no switches. The enlarged chart
has the switches on the chart, and copies of Wind-legal only, Spread out, Show
seasons and Hide empty months above it (`ZOOM_CHECKS`), each shown when the page
offers it and changed on the page too.

**Wind-adjusted estimates** (`assets/js/wind-adjust.js`): an As run / Wind
adjusted switch, shown when at least one chart has an estimate, built like
Timeline / By season (for every chart and the enlarged one, remembered on the device). In
Wind adjusted, the line and points stay on the marks as run; each estimate is a
faint dotted circle at the end of a faint dotted stalk from its point, and a result beyond its event's
wind limit is greyed out (`--chart-off`). The key's "Wind-adjusted estimate" and
"No estimate" entries show only then. The details panel gives the estimate, or
says the wind exceeds the event's limit; the results table's wind tag gives the
estimate too, and "How they are worked out" opens the note under the charts.
The chart's title becomes "100m, wind-adjusted estimate"; a downloaded or shared
image of it says the same in its title line and carries the chart's caution
under its key (`render`'s `note` in `assets/js/chart-image.js`).
Sprints (60m, 80m, 100m, 200m) use Mureika's air-resistance model to 4 m/s;
hurdles and triple jump use Moinat (2018) to 2 m/s; long jump Moinat to 4 m/s,
"rough" over 2. Estimates are a guide: PBs, records, "Wind-legal only", share
cards and club champs always use the mark as run.

The maximise button opens an **enlarged chart** (`#/<athlete>/chart/<event>`,
so Back closes it): more labels, range chips (All, This season, Last season,
Last 12 months, Pick dates), a details panel for the picked result (click, tap
or ← →), and the key underneath, where hovering or clicking an entry lights its
marks. Closing it leaves the page's settings as they were. **Download** saves a
PNG made in the browser (`assets/js/chart-image.js`, nothing uploaded), in the
chosen Shape (Auto, landscape 3:2, portrait 4:5, square 1:1), with the title,
key and the club's share image in the footer. **Share** (GameDay contacts and
admins, unless sharing is paused) previews the same image, asks for consent and
a name (full, or first name only), then uploads it for a public link
`https://api.ncan.nz/s/<id>`. A share is never changed: share a new one and
remove the old.

**Share cards** (`assets/js/pb-card.js`): a share icon to the right of every
measured mark: each line of the results table, the PB boxes (and their best
wind-legal mark) and the enlarged chart's details panel. Anyone who can see the page
can make one. The headline says what the result was: "New personal best" (better
than the PB before it), "Personal best", "Season best", "1st place" to "3rd place",
or "Result"; a wind-assisted mark is never a PB card. The caption ("New PB for…",
"Season best for…", "1st place for…", "Sam: 100m in…") and file name (`-pb`,
`-season-best`, `-result`) follow. The card shows the name (first name only by
default for a result with a grade, ages 7–14; Show surname turns it on), the event
(and weight), the mark in gold, and for a new PB a "PB −0.32s" ribbon, the previous
best and "3rd PB this season"; the place only when 1st–3rd, wind, meeting and date.
**Style** is a dropdown, so more styles can be added: **Club colours** (the
green-and-gold Podium card) or **Photo**: the athlete's header photo fills the card,
cropped around its focus point, with dark washes behind the words. The photo can be
placed: drag it on the card preview (it stops at the photo's edges), zoom with the
slider (100–400%), or select the preview and use the arrow keys and + / −; **Reset**
goes back to the photo's focus point. The position is kept when the shape changes (so
check it again), and reset when the photo changes. With a header photo it's used by default and **Use a
different photo** picks another; without one, picking a photo is the only way to a
Photo card. A picked photo stays on the device (it's only uploaded inside the
finished card, if a public link is made). **Event**: the Photo card's layout over a
scene of the event drawn on the card (`sceneFor()` picks it from the event name):
sprints under 400m, a lane in perspective to the finish line; 400m and longer and
track walks, the whole track from overhead; hurdles; steeplechase, the water jump seen from the infield, runners coming from the right over the barrier into the deep end;
long and triple jump (three take-off lines), the runway to the sand pit; high jump,
the mat where the fan meets the grass, uprights just in front and the bar a little above its leading edge; pole vault, the pit with its white centre, front pads and the V
down to the box, tall standards and the bar high above; shot, discus, hammer and javelin, the
implement in its sector (a silver-rimmed orange discus, a hammer with a slack wire, a javelin stuck point first); cross country, grass hills with bright pink round-marker gates either side of the course line; trail and mountain runs, a dirt trail winding
up through bush-covered hills; road runs, a road to a finish gantry over a chequered line; road walks, a wide flat path round a circuit, a long line of cones down the middle. **Track** picks Blue (Ngā
Puna Wai, the default), Red or Grass, shown only when the scene has a track. Cross
country, road and relay results (the out-of-stadia table) have a share icon by their
time too: a "Result" or place card that opens as an Event card, with the race name and
out-of-stadia grade and no PB wording. Photo and Event cards upload as JPEG, Club
colours as PNG. Square (1080 × 1080) or Story (1080 × 1920). **Download** (the share sheet on phones) keeps it on the
device; a suggested caption can be copied. The athlete's GameDay contacts and
admins can also **Create public link**: the same share API with `view=pb-card` and
the result's date as `from` and `to`, listed under Shared charts as a "PB card" whatever its headline.
The card is laid out as plain shapes and words (`layout()`, tested without a
browser) and drawn on a canvas, since an image made from SVG can't use the site's
fonts.

Charts, PB cards and season cards shared publicly are managed with
`assets/js/shared-charts.js`. A chart shared in Wind adjusted is sent with
`wind=adjusted`, so its title ends ", wind-adjusted estimate" and the lists say
"Timeline, wind adjusted". Links are made on the athlete page (the chart, PB
card and season card dialogs, each with a **Manage your shared links** link);
the athlete page shows only one line for the people who may share for that
athlete ("Lily has 3 public links · Manage", `GET /v1/athletes/<address>/shares`;
the API refuses everyone else, so nothing shows). **Shared links**
(`/my/shares/`, `GET /v1/me/shares`) lists every link of the athletes the
signed-in person manages, grouped by athlete, newest first, with Show (one
athlete) when there's more than one; `#/athlete/<address>` picks one, and
Manage links there. Each link shows its thumbnail, what it is (event, dates and
view, or "Season card · 2025/26 season"), when it was made, with Open, Copy
link, Download image and Remove (confirmed). The admin tool page
`/admin/shared/` (`GET /v1/admin/shares`) has every share, Show (live,
removed, all), Find, Remove with a required reason, and Pause sharing. A share is never changed; Remove stops its link at once and
can't be undone. A new share made on the page appears in the list straight away
(the `ncan:shared` event from `athlete.js`). The admin landing card counts
the live shares (removed ones aren't counted).
**Share usage** badges (`Today 1 / 20`, `Live 15 / 100`) sit beside Create public
link in the Share dialog and the PB card, and on Shared charts: shares this person
made today, and this athlete's live shares, against their limits (administrators
get ten times both: 200 a day, 1,000 live). A limit reached turns its badge yellow
and Create public link off. The numbers come from the API (`share_usage` on the
athlete page, `usage` with the list and after each share).

**Locking a form while it works** (`assets/js/form-lock.js`):
`FormLock.lock(box, true)` disables the controls in `box`, marks it `is-locked`
and `aria-busy`, and the stylesheet shades it with a spinner; `FormLock.lock(box,
false)` re-enables only what it disabled. The results sources forms, the members
list upload and the header photos editor use it. On a tall area add `lock-quiet`
(shading, no big spinner) and give the status line `lock-keep` and `is-busy`, so
it stays readable above the shading with a small spinner. The spinner is a ring
that erases and redraws; with the device's reduced motion setting on it breathes
instead (one shared style in `styles.css`). Unlock on every ending: success,
refusal and network error.

The Club admin pages are for club administrators. `/admin/` lists the tools,
each on its own page: needs a look (`/admin/review/`), the members list upload
(`/admin/members-list/`), membership changes (`/admin/membership/`), merges
(`/admin/merges/`), corrections (`/admin/corrections/`), athlete addresses
(`/admin/addresses/`), site-wide blocks (`/admin/blocked/`) and header photos
(`/admin/header-photos/`). They all use `assets/js/admin.js`, which draws only
the sections a page has; old `/admin/#section` links go on to the tool's page.
To add a tool: a new folder under `admin/` with its section, and a card on
`/admin/`. Administrators get a "Club admin" link on the "Signed in as" line. Each athlete page also has a
"Manage this athlete" section for administrators only: its numbers, with links
to their athletic.net bios, and adding or taking out a number: an athletic.net
number, or a page number given by hand (900000001 up), whose results move to
the page (`assets/js/athlete-manage.js`). The shared sign-in code is
`assets/js/ncan-account.js`.

Signing in has one address, `/sign-in/` (`assets/js/sign-in.js`), and the header
links to it on every page: "Sign in", or "My NCAN" for someone signed in
(`assets/js/account-link.js`, loaded from `partials/head.html`; it asks the API
only when the device has signed in before, so most visitors cause no request).
Signed in, `/sign-in/` sends people on to the page named after `#/next`, for
example `/sign-in/#/next/athlete/%23/sam-brown` (the page's own `#` written `%23`;
`NCAN.nextFromHash` and `NCAN.signInLink`), kept after the `#` so it never reaches
a server or its logs (a page of this site only,
`NCAN.safeNext`) or to their own page (`NCAN.home`): staff (coaches, the
committee and administrators) to `/admin/` and families to `/athletes/`. The emailed link comes back to `/sign-in/`, which does the same.
Pages that need signing in keep their own sign-in box, which brings people back
to that page. `/admin/` is the one staff tools page: cards linking to the
tools, written from `partials/staff-tools.json` by `sync-partials.py`, each
group shown only to the roles it's for (Club admin for administrators, Staff
tools for everyone else). Both are noindex and left out of the sitemap. The API's plain sign-in form
(`/v1/auth/sign-in`) redirects here; `?plain=1` keeps the plain form, for
browsers without JavaScript.

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
