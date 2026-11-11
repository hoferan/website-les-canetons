# Track the UI/UX review findings (milestone: UI/UX Improvements)

**Labels:** ux, design-system, severity:medium, effort:l

## Problem
A black-box review of the web app at commit a869179 (main), run against the mocked backend with six roles, French and German, four widths, found a mature, consistent interface with a short list of concrete gaps. This issue tracks them in recommended order.

## Evidence
docs/ux-review/REPORT.md in the review branch; screenshots in the `ux-review/assets` branch.

## Guideline
Nielsen's 10 heuristics, WCAG 2.2 AA, Material 3, Apple HIG, GOV.UK, Baymard (named per issue).

## Proposal
Work in this order. Items in the same group are independent.

1. Accessibility and honesty on the public site (no dependencies): #005 Give every route its own page title and announce navigation to screen readers; #006 Stop checkboxes shrinking to 13-19 px when their label wraps; #007 Strengthen the keyboard focus indicator on buttons; #009 Stop showing editor instructions and empty photo placeholders to visitors
2. Feedback and stability: #010 Show progress and block repeat clicks while a form is sending; #011 Stop the home hero shifting when the display font loads; #008 Fix heading levels: event titles under section headings, form section legends
3. Components, in dependency order: #001 Extract one Badge component for tags, visibility and account status; #002 Extract one Surface (card) component and retire radius/border/shadow drift; #003 Create a StateMessage component for loading, empty and error states
4. Adoption and consolidation: #004 Adopt StateMessage on every screen that loads a list; #013 Align button heights and horizontal padding to one value per size; #014 Document and enforce the radius, shadow and type-size scales; #015 Use one name for the planning section in the nav, title and links; #016 Give standalone links like "← Retour au planning" a 44 px target; #012 Bring the public bundle and LCP back inside the Lighthouse budget

(Draft numbers are placeholders; GitHub issue numbers replace them on creation.)

## Acceptance criteria
- [ ] Every linked issue is closed or has a recorded decision not to do it
- [ ] Re-run the audit scripts in docs/ux-review/scripts and attach the before/after counts

## Dependencies
Blocks nothing; links all issues above.
