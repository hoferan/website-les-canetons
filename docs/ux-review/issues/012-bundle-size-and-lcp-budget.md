# Bring the public bundle and LCP back inside the Lighthouse budget

**Labels:** ux, performance, severity:medium, effort:m

## Problem
The informational Lighthouse run (production build, mobile profile, median of 3) breaches its budget on all five public pages: JS 324 KB gzip against 240 KB; LCP 3.40-3.63 s against 3.20 s; Score 73 (/), 83 (/band), 81 (/history), 84 (/agenda), 74 (/de/) against 85. TBT is 157-193 ms. The mocked API answers locally, so real timings will differ, but the bundle size is real.

## Evidence
- docs/ux-review/data/lighthouse.txt

## Guideline
Core Web Vitals LCP (good <= 2.5 s; budget here 3.2 s); Nielsen #7 (efficiency).

## Proposal
Analyse the 324 KB with a bundle visualiser; route-split the members' area and editors out of the visitor entry; preload the LCP image on the home hero; check the weights of Karla Variable and Bungee (subsets already present: bungee-vietnamese etc. appear in the build output).

## Acceptance criteria
- [ ] Visitor entry JS <= 240 KB gzip
- [ ] LCP <= 3.2 s and score >= 85 on the five pages, median of 3
- [ ] Members and editor routes still load on demand without a visible spinner longer than 300 ms on the mocked backend

## Dependencies
Related: #294 closed (editor photo code out of the visitor bundle).
