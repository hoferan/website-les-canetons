# Stop the home hero shifting when the display font loads

**Labels:** ux, performance, severity:medium, effort:s

## Problem
The home page still shifts after first paint: one layout shift of 0.223 at about 1.7 s (Playwright PerformanceObserver, 1280 px, FR). Its sources are the hero heading text (y 198 to 253), the hero paragraph (329 to 386), the hero image (230 to 258) and the section below (589 to 646). Everything that moved sits at or above the agenda block, so data arrival is not the obvious cause; Bungee is declared `font-display: swap` and was still unloaded when the page first painted. The Lighthouse budget run agrees: CLS 0.197 on / and 0.169 on /de/ against 0.100, while /band, /agenda and /history stay at or below 0.057. I have not isolated the cause with a font-blocking test; treat the font swap as the first hypothesis.

## Evidence
- Data: docs/ux-review/data/interact2.json (homeCLS, fonts)
- docs/ux-review/data/lighthouse.txt

## Guideline
Core Web Vitals CLS (good <= 0.1); Nielsen #1.

## Proposal
Preload the Bungee latin woff2 used by the hero heading, and define a metric-matched fallback face (`size-adjust`, `ascent-override`, `descent-override`) so the swap does not rewrap the heading. Confirm by blocking the font request in Playwright and re-measuring. If the shift persists, reserve space for the agenda cards and the hero image (aspect ratio).

## Acceptance criteria
- [ ] Lighthouse CLS <= 0.1 on / and /de/ (median of 3, as tools/lighthouse.mjs does)
- [ ] With the Bungee request blocked and then delayed 1.5 s, no layout-shift entry above 0.05 on /, /de/, /agenda, /band, /history
- [ ] No regression on /band, /agenda and /history

## Dependencies
Regression of #236 (closed), which addressed data-driven shifts; this one is above the data.
