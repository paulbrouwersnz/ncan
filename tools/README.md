# Site tools

Scripts that build and maintain parts of the ncan.nz site. Every page is plain
static HTML: these tools write into the pages and data files, and nothing runs
on the server.

Run them from the repository root, e.g. `python tools/sync-partials.py`. Each
script explains itself in full at the top of the file, and most have `--help`.
This page is the map: what each one is for, and which to run when.

> **Keep this file current.** When a tool is added, removed or changes how it
> is used, update its entry here in the same change.

## Requirements

Python 3 (currently run with 3.14). Most tools use only the standard library;
these need packages installed with `pip install`:

| Tool | Needs |
|---|---|
| `build-fonts.py` | `fonttools`, `brotli` |
| `build-gallery.py`, `shrink-gallery.py` | `Pillow` |
| `import-records.py` | `openpyxl` |
| `verify-records.py` | `pypdf` |

`refresh-library-inventory.js` is not run from here. It is pasted into the
browser's console on the Athletics NZ eLearning library (see below).

## Which tool when

| You've… | Run |
|---|---|
| edited `assets/css/styles.css` | `stamp-assets.py` |
| edited anything in `partials/` | `sync-partials.py`, then `stamp-assets.py` |
| added a new page | `sync-partials.py`, `stamp-assets.py`, `build-sitemap.py`, then `indexnow.py <page>` |
| changed a page's content and want search engines to notice | `indexnow.py <page>` |
| added photos or albums to the gallery | `shrink-gallery.py` (after the originals are on the mirror), then `build-gallery.py` |
| added or changed a calendar in `assets/calendar/` | `build-calendar-list.py` |
| changed the weekly training times | `build-training-calendar.py`, then `build-calendar-list.py` |
| added AGM papers to `assets/docs/agm/` | `build-agm-list.py` |
| a club championships Saturday has finished | `club-champs-results.py` |
| a meeting's results are out, or a family asks for a page to be removed | in the private ncan-api project: `ncan add-meeting` / `ncan opt-out`, then `ncan collect` |
| new records to check against official results | `verify-records.py` |
| added characters the site's fonts may not have (e.g. a new macron) | `build-fonts.py` |

## Shared parts of every page

### `sync-partials.py`
Copies `partials/head.html`, `header.html` and `footer.html` into every page,
between marker comments such as `<!-- @partial:header -->`. Edit the partial,
never the copy in a page. Marks the current page's own nav link with
`aria-current`.

```bash
python tools/sync-partials.py
```

It rewrites the whole block between the markers, so a page whose shared blocks
have been reformatted (e.g. by an editor) shows a large but harmless diff the
next time it runs.

### `stamp-assets.py`
Adds a content hash to the stylesheet link (`styles.css?v=1a2b3c4d`) in every
page and in `partials/head.html`, so browsers fetch the new stylesheet after it
changes. Changes one line per page.

```bash
python tools/stamp-assets.py            # stamp
python tools/stamp-assets.py --check    # report only
python tools/stamp-assets.py --clear    # remove the stamps
```

### `build-fonts.py`
Builds the self-hosted Inter and Archivo fonts in `assets/fonts/`, cut down to
the characters the site uses. A character missing from the subset silently
renders in a fallback font, so re-run after adding unusual characters.

```bash
python tools/build-fonts.py
python tools/build-fonts.py --check          # report only
python tools/build-fonts.py --report-chars   # list the characters and where they come from
```

## Search engines

### `build-sitemap.py`
Writes `sitemap.xml` and `robots.txt`, listing every `.html` page at the site
root (the home page as `https://ncan.nz/`). Add a filename to `SKIP` in the
script to leave a page out; `athlete.html` is skipped, as on its own it is only
a template. The sitemap was submitted once in Google Search
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
python tools/indexnow.py club-champs.html records.html
python tools/indexnow.py /                       # the home page
python tools/indexnow.py --dry-run calendar.html
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
Rebuilds `gallery.html` from the folders in `assets/img/gallery/`: one album
per folder, a `title.txt` to rename it, a `README.md` for an intro, and
`order.txt` for album order. Each thumbnail links to its full-size copy on the
mirror.

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
Maintains `assets/calendar/calendars.json`, the list `calendar.html` reads.
Picks up `.ics` files in the folder, keeping names and colours already set,
and can mirror calendars published elsewhere.

```bash
python tools/build-calendar-list.py                    # rescan the folder
python tools/build-calendar-list.py --fetch            # re-download remote calendars
python tools/build-calendar-list.py --add URL --name "…" --file events-x.ics
python tools/build-calendar-list.py --rainbow          # re-order colours
python tools/build-calendar-list.py --dry-run
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

### `club-champs-results.py`
Fills in one Saturday of the championships in
`assets/data/club-champs/<season>.json` from AthleticLIVE's published results,
with a link to each official result.

1. Take the meeting's AthleticLIVE address and add `/teams`, e.g.
   `https://athleticscanterbury.anet.live/meets/80234/teams`.
2. Click **North Canterbury Athletic Cl** and copy that page's address.
3. Run it once results are final:

```bash
python tools/club-champs-results.py --date 2026-11-14 https://athleticscanterbury.anet.live/meets/NNNNN/teams/NNNNNNN
python tools/club-champs-results.py --date 2026-11-14 <same address> --apply
python tools/club-champs-results.py --date 2026-11-14 <same address> --apply --replace   # redo a Saturday
```

Without `--apply` it only shows what it found. It stops, writing nothing, if
the team page isn't North Canterbury's, the meeting or date don't match, the
date isn't on the programme, or an athlete's AthleticLIVE year doesn't match
the race they ran in. For an athlete AthleticLIVE has in the wrong year, add
them to `"grades"` in the season file, e.g. `"Stella Brown": 9`.

It only finds athletes listed under North Canterbury on AthleticLIVE, and is
built for single-day interclub meetings.

Starting a new season is a matter of data files, not this tool: see the notes
at the top of `assets/data/club-champs/index.json`.

## Athlete pages

`athletes.html` and `athlete.html?id=<number>` hold no results themselves. They
read them from the club's API at `https://api.ncan.nz`, and only for someone
signed in: a family sees their own children, coaches and the committee see
everyone. `results-sources.html` is public: it lists every meeting collected,
with how many of our athletes and results each added, and shows the athletes'
names only to coaches and the committee. The shared sign-in code is
`assets/js/ncan-account.js`.

Collecting results, the members list, merges, corrections and opt-outs all live
in the private **ncan-api** project (`docs/DATA.md` there), not in this public
repository. No athlete data belongs here.

To try the pages on this computer, run ncan-api's API locally on port 8765,
allowing this site's address (see `docs/API.md` in ncan-api), then open
`http://localhost:8123/athletes.html`.

### `athleticlive.py`
Not run directly: the AthleticLIVE reading used by `club-champs-results.py`
(a copy is in ncan-api for the athlete pages) (fetching the published JSON, finding a meeting's
sessions, checking every file belongs to the right meeting, reading marks).

## Committee page

### `build-agm-list.py`
Rebuilds the AGM papers list in `committee.html` from the PDFs in
`assets/docs/agm/<year>/`. Recent years are listed; older ones fold away.

```bash
python tools/build-agm-list.py               # 5 most recent years shown
python tools/build-agm-list.py --recent 3
```

## Athletics NZ library

### `refresh-library-inventory.js`
Refreshes `assets/data/athletics-nz-library-inventory.json`, which
`athletics-nz-library-inventory.html` reads. It needs your Athletics NZ login,
so it runs in your browser rather than from here:

1. Log in at https://athleticsnz.elearning.worldathletics.org/library
2. Open DevTools (F12) → Console, paste the whole script, press Enter.
3. When the box says **Finished**, the JSON downloads. Replace the file in
   `assets/data/` with it.

It only reads, one folder at a time with a pause between, and can compare
with an earlier inventory.
