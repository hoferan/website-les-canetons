# Les Canetons: black-box UI/UX review

Reviewed commit `a869179` (main, "Merge pull request #374 … duplicate-card"), 11 Nov 2026.
Method: the app run with `vite --mode mock` (MSW-mocked backend, no Docker), driven with Playwright; axe-core for accessibility; the repository's own Lighthouse budget script for performance. No component, page, hook or style source in `web/src` was read. Mock fixtures (`web/src/mocks/handlers.ts`) were read only to learn the accounts and the login password.

Everything below is drafts in this folder. Nothing has been committed, pushed or created on GitHub.

## 1. Executive summary

**Verdict.** This is a polished, unusually consistent interface for a small volunteer project. One input style, one button system, linked field errors, a correct alert dialog, a language switch that keeps the equivalent page, and no horizontal overflow at any of the four widths in either language. The problems are few and specific: the single-page app never tells a screen reader (or the browser tab) that the page changed, the keyboard focus ring on buttons is faint, a handful of public pages show editor-only text, loading/error states are bare text without a retry, and the small-component layer (badges, cards) has drifted. None of it blocks a task. The most serious is accessibility of navigation, not visual design.

**Top 5 issues** (draft numbers; see `issues/`)

1. **005 Every route has the same `<title>` and navigation is not announced.** All 7 routes sampled in FR and DE return "Guggenmusik Les Canetons de Fribourg"; after clicking Contact on /agenda, focus stays on the nav link and the live region stays empty. WCAG 2.4.2 and 4.1.3. High.
2. **007 Keyboard focus ring on buttons is about 2.5:1.** A 3 px ring in indigo at 50% alpha (2.55:1 on white, 2.51:1 on the cream page) replaces the button's dark border. WCAG 1.4.11. Medium.
3. **009 Public pages show editor instructions and empty-photo placeholders.** /band shows "… à compléter sur la page Membres : prénoms du registre" to anonymous visitors, and "Photo à venir" appears seven times across /band and /. Medium.
4. **003/004 Loading and error states have no recovery.** With the events request failing, /events says "Le planning n’a pas pu être chargé." and offers no Réessayer; the error uses a different red from field errors. Medium.
5. **011/012 Performance budget is breached on every public page.** Lighthouse (mobile profile, median of 3): JS 324 KB gzip vs a 240 KB budget; LCP 3.40-3.63 s vs 3.20 s; score 73-84 vs 85; home CLS 0.197 (0.169 on /de/) vs 0.100. Medium.

**Top 3 strengths**

1. **Form behaviour is exemplary.** Validation runs on submit, focus moves to the first invalid field, each error is linked with `aria-describedby`, typed values survive a server error, and success moves focus to the confirmation heading (contact: "Message envoyé"). Required fields are marked and the form states it once ("* champ obligatoire").
2. **Axe finds nothing.** Zero violations at WCAG 2.0/2.1/2.2 A and AA tags on 74 route/role/locale pages at 1280 px; mobile menu closes on Escape and returns focus to its button; the destructive dialog is an `alertdialog` with focus on Annuler, Tab trapped, Escape closing.
3. **A coherent, memorable brand system used consistently.** One ink, one muted grey, a five-colour brand palette, hard-offset shadows and the Bungee display face used only for headings, nav and short labels; body text is Karla at 14-16 px.

## 2. Setup and coverage

| Item | Detail |
| --- | --- |
| Commit | `a869179`, branch tip equals `origin/main` at start |
| App | `vite --mode mock` on :5199; browser: Chromium via Playwright (the project's pinned build was not installed, so the preinstalled Chromium was used) |
| Roles logged in | anon, `demo.player`, `demo.both`, `demo.direction`, `demo.committee`, `demo.young` (password `demo`); `mustchange`, `registeronly` and `guestlists` were visited by the link crawl only |
| Locales | FR at `/`, DE under `/de/`, every audited page in both |
| Widths | 375, 768, 1280, 1920 (292 page renders, 73 route/locale pairs; full-page PNGs for all) |
| Route inventory | link crawl per role (`data/routes.json`), plus the project's `web/screenshots/pages.json` for screens only reachable from menus. 36 routes including /dev/ui |
| Accessibility | axe-core tags wcag2a, wcag2aa, wcag21aa, wcag22aa at 1280: 0 violations on 74 pages; my own DOM checks for names, labels, headings, `lang`; keyboard probes on public pages, forms, the mobile menu and one dialog |
| Contrast | pixel-sampled behind every text node (text hidden, page screenshotted). After removing false positives (borders and highlighted spans) nothing real remained |
| States | `window.fetch` override per page to force slow (4 s), empty and 500 responses on /events and the contact POST. Playwright route interception cannot see requests answered by the MSW service worker |
| Performance | `npm run lighthouse` (production build, mocked API, mobile profile) |

**Not covered or weaker than asked.** No real screen reader was used (announcements inferred from live regions and focus). Keyboard-only completion was verified for the contact form, login, the mobile menu and one dialog, not for every journey. Loading, empty and error states were forced on /events and the contact form only; other list screens are expected to behave alike and issue 004 says to verify each. DE navigation labels were not read. The mocked data has English-looking placeholder photos ("Photo 1 · 960w"), and the dev ribbon "DEV" in the header corner belongs to mock mode; neither is judged. `/dev/ui` (the component catalogue) is reachable without login in the mock build; I could not tell whether production serves it. Two findings from an earlier pass were false positives and dropped: unnamed switches on the form editor (they are labelled) and two "empty" buttons on the registrations page (inside a closed `<details>`).

## 3. Personas and journeys

| Persona | Top tasks | Result |
| --- | --- | --- |
| **Parent of a prospective child** (public, mobile, French or German) | Read what the band is; see when and where; find how to join and contact | Clear and fast. Home answers "who, age, when" above the fold at 375 px. German is complete, with history entries flagged "Auf Französisch" where untranslated. Issues 009, 005 |
| **Event guest** (public) | Book the "Souper de soutien" | Sensible form: required marks, quantities with min/max (child meal max 3), validation on submit, first error focused. Nothing tells the user a request is in flight (010). A "Choisissez au moins une personne." line is shown before any action |
| **Player or parent** (`demo.player`, `demo.young`) | Answer yes or no to each event; fill a form when the event has one; change password | Planning groups "À répondre" first with a count; one-tap Oui/Non. Section/title heading levels are flat (008); empty/error states are bare (003) |
| **Direction** (`demo.direction`) | Create events and series, edit the booking form, manage members, roles, registers, photos, site texts | Dense but orderly. The form editor mirrors the guest's form; delete dialogs are correct. Checkbox sizes drift on /roles (006); badge variety (001) |
| **Committee** (`demo.committee`) | Read guest lists and export; handle the inbox | Registrations page summarises totals, exports Excel/CSV, shows per-guest cards. Text-heavy, back link is a 17 px target (016) |

## 4. Findings by area

**Task flows and navigation.** Wayfinding is good: the active section is highlighted, members get a "Retour au planning" link on detail pages, and the language switch lands on the equivalent page (checked from /agenda and /events/7/book). Gaps: same title everywhere and no route announcement (005); nav says "Événements" while the page says "Planning" (015).

**Forms.** Labels, `autocomplete` (family-name, given-name, email, tel, street-address, username, current-password), input types and `inputmode=numeric` on quantities are all correct; `noValidate` forms with custom, linked messages. A honeypot `name=website` input is `hidden`. Gaps: no sending state (010). Native date/time controls render in the browser's locale (mm/dd/yyyy in my headless run), which the app cannot control.

**Feedback.** Contact success moves focus to the heading; server errors keep values and use `role=alert`; the destructive dialog names the consequence ("Elle sera retirée de 5 événements."). The load error is a lone paragraph with no retry (003/004).

**Content.** Tone is warm and direct. Editor instructions leak to visitors on /band (009). Dates read "mer., 23.12.2026, 18:30 – 23:30" in both locales (locale-correct for fr-CH/de-CH).

**Visual consistency and colour.** See section 5. Colour is tight; the fragmentation is in shape and shadow scales and in badges. Semantic colour is sparse: there is no success/warning/error set outside the field-error red (#e0201a) and the Notice component (#376 open); "Provisoire" and "Jamais utilisé" use the brand pink, which is also a decoration colour.

**Typography.** Bungee is limited to headings, nav, tags and the wordmark; it stays readable at 13 px uppercase in the nav. Fonts load with `swap` and the home hero shifts (0.223) once at about 1.7 s (011). The 11 px letter-spaced tagline under the logo is the smallest text.

**Responsiveness.** No horizontal overflow at 375, 768, 1280 or 1920 px in either language. 1920 px keeps a narrow centred column (about 670 px) with large empty margins; readable but sparse. Mobile menu: 44 px button, `aria-expanded`, no `aria-controls`. Touch targets: all buttons are >= 44 px, switches 44x24; failures are the standalone back link (17 px) and shrinking checkboxes (006, 016).

**Accessibility.** See strengths; open items are 005, 006, 007, 008, 016. `lang` is `fr-CH`/`de-CH` and switches with the locale. The skip link "Aller au contenu" is the first tab stop (1x1 box with an indigo outline when focused); its on-screen appearance on focus was not captured. No images lacking `alt`.

**i18n.** German is complete on every screen checked; no layout broke (no overflow; longer words such as "Mitglieder", "Anmeldungen" fit). Member-entered content (event titles, history entries) stays in the language typed, flagged where translation is missing.

## 5. Token inconsistencies (from computed styles)

Counted across 292 page renders; counts are element or text-run occurrences. Full data: `data/tokens.json`.

| Token | Values found | Verdict |
| --- | --- | --- |
| Font family | Karla Variable (body), Bungee (display) | Clean |
| Font size | 8, 10, 11, 12, 13, 14 (7,550 runs), 16 (3,528), 18, 20, 24, 30, 36, 48, 96, 128 px | 15 sizes. 11 px is the logo tagline; the 8 and 10 px runs were not located on the pages I probed (likely the mock-mode DEV ribbon and the notification dot). Needs a scale (014) |
| Font weight | 400, 500, 600, 700 | Fine, but badges use all of 400/500/600 (001) |
| Text colours | 16 distinct: ink `#14121c`, muted `#5a5768`, white, white 70%, red `#e0201a`, indigo, tag text colours | No near-duplicate greys. Muted grey on cream/white is >= 6:1 |
| Near-duplicates | `#0b0a12` (header/footer surface) vs `#14121c` (ink); `#e0201a` (field errors) vs Tailwind red-700 (load error) | Merge the reds (003); the blacks are different roles and acceptable |
| Radius | 4, 6, 8, 12, 14, 16, 18, 20 px + pill | Buttons 12, inputs 6, cards 18-20; 8, 14, 16 are strays (002, 014) |
| Hard shadow | 3 px ink, 4 px pink (dark surfaces), 5 px ink (tiles), 2 px ring | Surface-dependent pink/ink looks intentional; 3 vs 5 px tied to Surface variants (002) |
| Spacing | 4, 8, 12, 16, 20, 32, 40, 56, 64 plus strays 6, 10, 14 | Mostly a 4-pt scale |
| Border | 1 px `#e2e3ea` (inputs, outline pills), 2 px (list cards), 3 px (buttons, form panels, tiles) | Three weights, each with a clear role |
| Buttons | primary `#4b2ed6`, secondary white, accent `#ffd23f`; 44 px tall (48 px for hero and form submit); horizontal padding 12, 16 or 20 px for the same size | Padding drift (013) |
| Badges | 17 computed signatures, heights 20/24/26 px, weights 400/500/600 | Drift (001) |
| Contrast | No text/background pair measured below AA once borders and highlighted spans were excluded; focus ring 2.5:1 | Focus ring only (007) |

## 6. Component inventory (from the rendered UI)

Pattern counts are from `data/components.json` (936 instances, 1280 px, FR, 28 route/role pages). The app has a catalogue at `/dev/ui` covering Button, Icon+word, IconButton (tip, grow), Indicator, dark-surface call to action and form footer. Patterns not in it are marked **gap**.

| Pattern | Instances | Variants seen | Verdict |
| --- | --- | --- | --- |
| Button | 160+ | primary, secondary, accent (+ sm); sizes 44/48; pink or ink shadow by surface | Intentional variants; padding drift (013) |
| Text input, select, textarea | 70+ | one signature per type (44 px, 6 px radius, 1 px border, 14 px/16 px) | Consistent |
| Form field (label, hint, error) | 40+ | label + `*`, hint under, error linked by id | Consistent in the DOM; exists informally. Not a candidate issue |
| Checkbox, radio, switch | 18 / 8 / 8 | checkbox widths 13-20 px | Drift (006) |
| Badge / tag chip | 36 | 17 signatures | **gap** (001) |
| Surface / card | 79 | 47 signatures, 4 kinds | **gap** (002) |
| Loading/empty/error block | 3 | plain text lines | **gap** (003) |
| Alert dialog | 1 seen | confirm + cancel | Good |
| Navigation (header, mobile menu, language group, account chip) | all pages | consistent | Good |
| Page header | two: purple confetti hero (public, booking) and plain H1 block (members' area) | intentional, documented by the "calm version" of the carnival look | Not a candidate |
| Row with actions (members, roles, registers, tags) | 30+ | action buttons in a wrapped row | Covered by open #379-#383 |
| Toast | not triggered in this run | | #375 closed; not assessed |

**Component candidates** (full specs in the issues): 001 Badge (primitive), 002 Surface (layout primitive; the home tile and Planning row mix surface, content and actions, so actions move to the action bar of #379-#383), 003 StateMessage (composite, composes Surface and Button). Dependency-ordered: Badge and Surface (independent) before StateMessage before the adoption issue 004 and the token scale 014.

## 7. Prioritised action plan

| Order | Issue | Severity | Effort | Why now |
| --- | --- | --- | --- | --- |
| 1 | 005 Route title and announcement | high | s | Only high-severity finding |
| 2 | 006 Checkbox shrink | medium | s | Real bug, visible, one-line fix |
| 3 | 007 Focus indicator | medium | s | Affects every keyboard user |
| 4 | 009 Editor text on public pages | medium | s | Visitors see internal instructions |
| 5 | 010 Sending state | medium | s | Every form |
| 6 | 011 Home hero shift | medium | s | Core Web Vital |
| 7 | 008 Heading levels | medium | s | Screen-reader structure |
| 8 | 001 Badge | medium | m | Component, unblocks 014 |
| 9 | 002 Surface | medium | l | Component, unblocks 014 |
| 10 | 003 StateMessage | medium | m | Component, unblocks 004 |
| 11 | 004 Adopt StateMessage | medium | m | After 003 |
| 12 | 013 Button padding | low | s | Quick alignment |
| 13 | 014 Token scale | low | m | After 001, 002 |
| 14 | 015 Terminology | low | s | Copy |
| 15 | 016 Target sizes | low | s | Polish |
| 16 | 012 Bundle and LCP | medium | m | Largest effort, least certain gain (mock timings) |

## 8. Overlap with existing GitHub issues

Read with the REST API (`gh issue list` is blocked here, GraphQL). 16 draft issues; none duplicates an existing issue.

| Draft | Related existing | Relation |
| --- | --- | --- |
| 005 | #172 (closed: shell metadata French on /de/*) | Same area, different gap: the titles are still static |
| 009 | #106 (open: public site needs eight photographs, a phone number, two contacts) | Content gap behind it; this issue is about what visitors see meanwhile |
| 011 | #236 (closed: public pages shift when data arrives) | Regression of a different cause, above the data |
| 012 | #294 (closed: keep editor photo code out of the visitor bundle) | Continuation |
| 013 | #344 (closed: one button system) | Residual drift after it |
| 003 | #376 (open: give the inline Notice the toast's four levels) | Share the error colour and levels |
| 002 | #379-#383 (open: one action bar for edit controls) | Boundary: actions are not Surface's job |

## 9. Reproducing

Scripts are in `docs/ux-review/scripts/` (`crawl`, `audit`, `analyze`, `contrast`, `components`, `interact1-3`, `crops`, `probe*`, `make-issues`). Run with `npm run dev:mock -- --port 5199` and `node docs/ux-review/scripts/<name>.mjs`. Raw data: `docs/ux-review/data/`. Screenshots: `docs/ux-review/screenshots/` named `<role>__<route>-<locale>-<width>.png`; flow and state captures start `flow-` and `state-`; component crops are in `screenshots/components/`.
