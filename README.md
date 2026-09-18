# [North Canterbury Athletic Club Incorporated website](https://ncan.nz/)
Replacement site for the North Canterbury Athletic Club Incorporated, a track and field and cross country running club based in Rangiora, New Zealand.

Formerly hosted at https://www.sporty.co.nz/northcantathletics/

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
- The site is essentially static, with no server-side processing.  Dynamic content is provided by JavaScript, which fetches data from JSON files and renders it in the browser.  This allows for a more interactive experience, while still keeping the site simple and fast.  Tools used to keep the pages in sync are included in the repository.
- The facebook sync is currently managed with a GitHub action.
