# Give every route its own page title and announce navigation to screen readers

**Labels:** ux, a11y, severity:high, effort:s

## Problem
`document.title` is "Guggenmusik Les Canetons de Fribourg" on every route I loaded, in both locales: /, /de/, /band, /de/band, /contact, /login and the 404. After a client-side navigation (clicking Contact in the nav on /agenda), the URL changes to /contact, focus stays on the nav link, scroll position is unchanged, the polite live region (`aria-live=polite`) is empty and the title is the same. A screen-reader user gets no sign that the page changed, and browser history, tabs and bookmarks are indistinguishable.

## Evidence
- Data: docs/ux-review/data/interact2.json (titles), probe4 output in this issue
- docs/ux-review/data/merged.json (title per route)

## Guideline
WCAG 2.4.2 Page Titled (A); 4.1.3 Status Messages (AA); 2.4.3 Focus Order; GOV.UK page-title pattern ("<page> - <service>").

## Proposal
Per route set `document.title` to "<H1> – Les Canetons de Fribourg" in the active locale (a hook next to the route table), update on locale switch. On client-side navigation move focus to the page's `h1` (tabindex=-1) or write the title into the existing polite live region, and scroll to top. Keep the skip link target intact.

## Acceptance criteria
- [ ] Every route listed in web/screenshots/pages.json has a unique title in FR and DE
- [ ] After navigating with the keyboard from the nav, the screen reader announces the new page (verified with a Playwright check on the live-region text or focused heading)
- [ ] Browser Back restores the previous title
- [ ] Switching FR/DE changes the title language

## Dependencies
Related (not a duplicate): #172 closed, which made the shell metadata French/German; titles are still static.
