# [North Canterbury Athletic Club Incorporated website](https://ncan.nz/)
Replacement site for the North Canterbury Athletic Club Incorporated, a track and field and cross country running club based in Rangiora, New Zealand.

Formerly hosted at www.sporty.co.nz/northcantathletics/

## Intent
- Modernise the website and make it more mobile-friendly.
- No adds
- More dynamic information, e.g. club calendar, results, records, news, etc.
- Bring over as much relevant content as possible from the old site, especially the gallery and history pages.
- Make the club as transparent as possible, e.g. committee members, constitution, financials, etc.

## Challenges
- Establishing a workflow for maintaining the site, especially for non-technical committee members.
- Maintaining the site over time, especially if the original developer is no longer available.
- Keeping calendars and other dynamic content up to date.
- Limiting pages to a manageable number, while still providing enough information for members and the public.

## Notes
- Currently changes are made by emailing the request to paul@brouwers.nz
- ncan.nz domain registered with https://domains.co.nz/.  Cost is around NZ$40/year.
- Hosted on GitHub Pages, which is free for public repositories.
- The site itself is static: JavaScript fetches data from JSON files and renders it in the browser, which keeps it simple and fast.  Tools used to keep the pages in sync are included in the repository; [tools/README.md](tools/README.md) explains each, and how the site is laid out.
- Anything private (athlete pages, results sources, training plan editing, the club admin pages, header photo settings, sign-in) comes from the club's own API at api.ncan.nz, kept in a separate private repository (ncan-api). Nothing private is stored in this public repository.
- Gallery photos are served from the club's NAS at photos.ncan.nz.
- The facebook sync is currently managed with a GitHub action.
