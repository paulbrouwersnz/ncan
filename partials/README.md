# Shared page chrome

`header.html` and `footer.html` are the single source of truth for the site
header and footer. **Do not edit the header or footer inside the pages** — the
regions between these markers are overwritten:

    <!-- @partial:header -->  ...generated...  <!-- /@partial:header -->
    <!-- @partial:footer -->  ...generated...  <!-- /@partial:footer -->

## Workflow

1. Edit `partials/header.html` or `partials/footer.html`.
2. Run:

       python tools/sync-partials.py

3. Commit the partial *and* the regenerated pages.

The script updates every `.html` file in the project root that carries the
markers, so new pages just need the two marker pairs pasted in.

## Link style

Write links in the partials as if from a page other than the home page, e.g.
`index.html#training`. When the script writes into `index.html` it rewrites
those to plain anchors (`#training`) so in-page links scroll instead of
reloading. A nav link pointing at the page being written gets
`aria-current="page"` automatically.
