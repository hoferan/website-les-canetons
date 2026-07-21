# Replace text/emoji icons with Lucide

**Date:** 2026-07-21
**Status:** Approved (design)

## Problem

A few spots in the UI use plain text/HTML-entity glyphs standing in for
icons instead of real icons:

- `app/partials/navigation.php` — the mobile nav hamburger toggle button
  uses the literal `☰` character.
- `app/partials/navigation.php` — the "Galerie" external link uses a
  literal `↗` character.
- `app/assets/js/planning_repet.js` — the admin event-list delete button
  uses `&times;` (`×`).
- `app/assets/js/planning_repet.js` — the admin event-list edit button
  uses `&#x270E;` (`✎`).

These render inconsistently across fonts/platforms and don't match a real
icon set. There is also no documented convention for icon usage, so future
additions could each pick their own style/size, drifting further.

Source issue: #18.

## Decision

Adopt [Lucide](https://lucide.dev) (MIT-licensed, outline/stroke SVG icon
set) via its vanilla-JS pattern — `data-lucide="icon-name"` attributes,
converted to real inline `<svg>` elements by calling
`lucide.createIcons()`.

**Vendoring:** curl the UMD build straight into
`app/assets/vendor/lucide.min.js`, following this project's existing
vendoring convention (`i18next.min.js`, `bulma.min.css` already live there,
each documented in `app/assets/vendor/README.md` with library/version/
source/refresh-command). No npm devDependency, no `node_modules` involved
— Lucide's only role here is producing one static file.

- Version: **1.25.0** (latest at time of writing).
- Source: `https://cdn.jsdelivr.net/npm/lucide@1.25.0/dist/umd/lucide.min.js`
  (verified present in the npm tarball for this version).

**Icon mapping:**

| Location | Old | New |
|---|---|---|
| `app/partials/navigation.php` — mobile hamburger button | `☰` | `<i data-lucide="menu"></i>` |
| `app/partials/navigation.php` — Galerie link | `Galerie ↗` | `Galerie <i data-lucide="external-link"></i>` |
| `app/assets/js/planning_repet.js` — `createDeleteElement` | `innerHTML = "&times;"` | `innerHTML = '<i data-lucide="trash-2"></i>'` |
| `app/assets/js/planning_repet.js` — `createEditElement` | `innerHTML = "&#x270E;"` | `innerHTML = '<i data-lucide="pencil"></i>'` |

**Script loading & initialization:**

- Add `<script src="assets/vendor/lucide.min.js"></script>` in
  `app/partials/footer.php`, in the same "vendor script before its
  consumer" slot as `i18next.min.js` — before `session.js`/`main.js`.
- `main.js`'s existing `DOMContentLoaded` handler gets one more call,
  `lucide.createIcons()`, alongside `setupNavToggle()` etc. This converts
  every server-rendered `data-lucide` element site-wide on every page load
  (covers the nav hamburger and the Galerie link — both present in markup
  at parse time).
- `planning_repet.js`'s `loadEvents()` rebuilds the admin event list from a
  `fetch()` response; the delete/edit icons don't exist until then, so
  `lucide.createIcons()` is called again after `loadEvents()` finishes
  appending list items, picking up the newly-created `data-lucide`
  elements.
- `eslint.config.js` gets a `lucide: 'readonly'` global declaration
  (scoped to `main.js` and `planning_repet.js`), matching the existing
  pattern for the vendored `i18next` global.

**CSS:**

Today's icons are styled via `font-size` (sizing) and `color` (state/hover
color) because they're text glyphs. Lucide's default SVG template sets
`stroke="currentColor"` and `fill="none"` on the root `<svg>`, so color
continues to cascade for free from the parent element's `color` — the
`.delete-icon`/`.edit-icon` hover-color transitions and `.nav-toggle`'s
white icon need no change on that front. What SVGs *don't* pick up from
`font-size` is their box size, so `.nav-toggle`, `.delete-icon`,
`.edit-icon`, and the Galerie link each get an explicit `width`/`height`
rule for their icon, standardized to the single size below. Any further
spacing/alignment tweaks (e.g. margin between "Galerie" and its icon) are
tuned by eye via `npm run serve` during implementation rather than
guessed here.

## Icon usage convention (new, documented in `CLAUDE.md`)

Because this issue introduces the site's first real icon library, it also
establishes the convention future icon usage must follow — added as a new
"Icons" subsection under `CLAUDE.md`'s Architecture section:

- **Style:** Lucide ships one style only — outline/stroke
  (`fill="none"`, `stroke="currentColor"`). There's no solid/filled
  variant to accidentally mix in; never override `fill` on a Lucide icon.
- **Size:** one standard size, **24×24px**, for every icon in normal UI
  usage (buttons, nav, inline with text, list actions) — never size icons
  ad hoc per spot. This is why the delete/edit icons (currently 48px/30px)
  are equalized to 24px, and why the Galerie link's icon is 24px rather
  than scaled to the surrounding link text. Exception: large-format
  decorative usage (a hero section, a page title, a logo lockup) where the
  icon isn't part of a UI control or running text — those may use a
  different, purpose-fit size. No such usage exists in the codebase today.
- **Color:** don't set `stroke` directly on an icon — it inherits
  `currentColor` from the surrounding element's CSS `color`, so hover/state
  colors are styled on the parent as usual.
- **Markup/init mechanism:** `<i data-lucide="icon-name"></i>`, converted
  by `lucide.createIcons()` — called globally on `DOMContentLoaded`
  (`main.js`), and again by any JS that creates icon markup dynamically
  after that point (see `planning_repet.js`'s `loadEvents()`).

## Goals

1. All four listed text/emoji glyphs are replaced with Lucide icons using
   the mapping above.
2. `lucide.min.js` is vendored following the existing convention (curl +
   README entry), no new devDependency.
3. Icons render correctly on first page load (server-rendered markup) and
   after the admin event list is dynamically rebuilt.
4. Delete and edit icons are visually equalized to the new 24×24px
   standard; hover-color behavior (red on delete-hover, blue on
   edit-hover) is preserved.
5. `CLAUDE.md` documents the icon usage convention (style/size/color/
   mechanism) so future icon additions follow it without re-deriving it.

## Non-goals

- **No icon audit beyond the four listed spots.** Other emoji already in
  the codebase (e.g. the supper-popup's 🦆🎉, the popup close `✕`) are
  decorative/playful content, not UI-control icons standing in for a
  missing icon — out of scope for this issue.
- **No design-system/token work.** This is a scoped icon swap, not part of
  the larger (and currently un-started) visual-identity/design-system
  roadmap tracked in issues #6/#7.
- **No new build tooling.** Vendoring stays a static curl'd file, matching
  `bulma.min.css`/`i18next.min.js` — no bundler, no npm devDependency.

## Testing / verification

- `npm run check` (phpcs, eslint, stylelint, prettier, secret guard) must
  pass, including the new `lucide` eslint global.
- Manual verification via `npm run serve`:
  - Public page at mobile width: hamburger renders and toggles the nav.
  - Any public page: Galerie link renders its external-link icon.
  - Logged in as `demo.admin` on `/planning_repet`: delete and edit icons
    render at the same size, hover colors work, and both actions (delete
    with confirm, edit populating the form) still function.
