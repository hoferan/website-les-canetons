# Design: Admin Overview — Bulma foundation (scoped) + UX refinements

- **Date:** 2026-07-16
- **Status:** Design approved (spec under review)
- **Language rule:** English everywhere (spec, code, identifiers, file names); French only for
  user-visible UI text.

## 1. Context & goal

The admin signups overview (`code/signups_admin.php` + `assets/js/signups_admin.js` +
`assets/css/signups_admin.css`) currently uses hand-written CSS. Readability is adequate but
plain. The goal is twofold:

1. Improve the overview table/tiles with UI/UX best practices.
2. Introduce a **CSS framework as a reusable foundation** for a later site-wide redesign —
   **without** breaking the site's core constraint.

**Framework decision:** **Bulma** (pure CSS, no JS bundle), vendored as a single precompiled
file. Chosen over Bootstrap (heavier, JS bundle for some components, more generic) and Pico
(too minimal as a component foundation); Ant Design was ruled out (React component library,
needs a JS build — incompatible with this server-rendered PHP site).

**Constraint impact:** The site is buildless (edit-in-place, FTP deploy, `.htaccess` cache
revalidation). A vendored precompiled CSS file adds **no build step**, so the deployed site
stays buildless. CLAUDE.md's "no framework" wording is relaxed to "no build step; third-party
CSS/JS may be vendored as static files" (the build-step ban remains).

**Scope now:** Bulma is loaded **only** on the admin overview page. Every other page is
untouched. A full site-wide redesign using Bulma is explicitly future work.

## 2. Vendoring & tooling hygiene

- Add **`code/assets/vendor/bulma.min.css`** — Bulma 1.x (pin the exact version in a header
  comment, e.g. `1.0.4`), the precompiled `bulma.min.css` from the official distribution.
  It is a static asset, committed and deployed as-is.
- **Reproducible refresh (dev-only):** add `bulma` to `package.json` `devDependencies` and a
  documented copy step (`node_modules/bulma/css/bulma.min.css` → `code/assets/vendor/`). The
  shipped artifact is the committed file, not `node_modules`. (Alternative if npm is
  undesirable: a documented pinned download; either way the committed file is authoritative.)
- **Tooling exclusions (must not lint/format vendored CSS):**
  - Stylelint (`lint:css`) globs `code/assets/css/**/*.css` — placing Bulma under
    `assets/vendor/` keeps it out of scope automatically.
  - Prettier (`format:check`) globs `code/assets/**/*.{js,css}`, which WOULD include vendor.
    Add **`.prettierignore`** at the repo root containing `code/assets/vendor/`.
  - ESLint (`lint:js`) globs `code/assets/js` only — unaffected.
  - Secret-guard — unaffected.
- **CLAUDE.md:** update the "Don'ts" / stack wording: replace "no framework for the deployed
  site" with "no **build step** for the deployed site; third-party CSS/JS may be **vendored**
  as static files (e.g. Bulma in `code/assets/vendor/`)."

## 3. Scope & load order (admin page only)

`code/assets/css/signups_admin.css` becomes (imports first, in this order):

```css
@import url("../vendor/bulma.min.css");
@import url("main.css");
/* Bulma theme variables + admin-specific overrides below */
```

- Path: `signups_admin.css` lives in `assets/css/`; Bulma lives in `assets/vendor/`, so the
  import is `../vendor/bulma.min.css` (up one level, into `vendor/`). `main.css` is in the same
  `assets/css/` directory, hence the bare `main.css`.
- **Why this order:** Bulma's base/reset loads first; `main.css` loads second and remains
  authoritative for the shared chrome (`header`, `.nav`, `banner`, `footer`, `section`,
  `.btn-primary`, popup). `main.css` has **no bare `table` rule**, so Bulma's table styles
  apply to the overview table without conflict.
- **Isolation:** No other page references Bulma. `head.php` injects one per-page stylesheet;
  only `signups_admin.php` sets `$pageCss = 'signups_admin.css'`, so the public site is
  unchanged.
- **Coexistence checks (verify at implementation):** on the admin page, confirm the shared
  header/nav/footer and the outer `section` card still render correctly (Bulma base for
  `body`, headings, links, buttons is overridden by `main.css` order/specificity where they
  overlap). Bare `<a>`/`<button>` inside the admin content may pick up Bulma styling — that is
  acceptable/desired; the CSV control uses an explicit Bulma `button` class.

## 4. Theming to the duck identity

Bulma 1.x themes via CSS custom properties. In `signups_admin.css` (loaded only here, so a
global `:root` block is fine):

```css
:root {
  --bulma-primary: #e7a11c;         /* duck amber */
  --bulma-primary-invert: #241a05;
  --bulma-link: #b9760d;
}
```

Menu semantics reuse the existing palette (kept consistent across tiles, header dots, and any
tags): meat `#9c3c17`, child `#23577f`, vegetarian `#2f6b3c`. The aim: it reads as the
Canetons site, not stock Bulma.

## 5. Improved overview (UI/UX)

Markup stays server-rendered shell + JS-filled body (unchanged data flow: `signups_admin.js`
fetches `GET api/signups.php`, builds rows). The JS now emits Bulma classes.

- **Summary tiles:** Bulma `columns` of `box` cards. Hierarchy: Total personnes / Total tables
  as the primary KPIs, then three colour-coded menu tiles (Viande/Enfant/Végétarien) using the
  menu palette, consistent with the table header dots.
- **Table:** `div.table-container` (responsive horizontal scroll) › `table.table.is-fullwidth.is-hoverable`.
  - Solid **white** table surface (as requested).
  - **Sticky header** (`thead th { position: sticky; top: 0; }` + background) for long lists.
  - Numeric columns right-aligned with `font-variant-numeric: tabular-nums`; zero rendered as a
    muted "–".
  - Per-table **group rows** visually distinct (amber accent bar / subhead style); grand-total
    `tfoot` row.
  - One column per menu (Viande/Enfant/Végét.) + Total, matching the current data model.
- **Accessibility:** `scope="col"` on header cells; a visually-hidden `<caption>` naming the
  table; `aria-live="polite"` on the async-filled container so screen readers announce load.
- **CSV export:** the existing `?format=csv` link restyled as a Bulma `button` (no behavioural
  change).

## 6. Files touched / created

**Created**
- `code/assets/vendor/bulma.min.css` (vendored Bulma 1.x)
- `.prettierignore` (repo root) — ignore `code/assets/vendor/`

**Modified**
- `code/assets/css/signups_admin.css` — imports (bulma → main.css), theme vars, overrides
- `code/signups_admin.php` — Bulma structure/classes in the static shell (table-container,
  table classes, `scope`, caption, tiles container, CSV button)
- `code/assets/js/signups_admin.js` — emit Bulma classes for tiles + rows
- `CLAUDE.md` — constraint wording (no build step; vendoring allowed)
- `package.json` — add `bulma` devDependency (optional, for reproducible refresh)

## 7. Testing / verification

- `npm run check` green — explicitly confirm Prettier and Stylelint do **not** touch
  `assets/vendor/bulma.min.css` (add `.prettierignore`; Stylelint scope already excludes it).
- Browser as `demo.admin`: tiles + table render improved; sticky header works; numbers aligned;
  group rows + grand total correct; CSV button downloads.
- **Regression:** confirm the shared header/nav/footer look correct on the admin page, and that
  at least two other pages (e.g. `index.php`, `contact.php`) are visually unchanged (Bulma not
  loaded there).
- Responsive: on a narrow viewport the table scrolls horizontally inside `.table-container`.

## 8. Out of scope (YAGNI)

Site-wide redesign / migrating other pages to Bulma; Bulma's JavaScript components; sorting,
filtering, or search in the table; XLSX export; any change to the public signup flow or API.
