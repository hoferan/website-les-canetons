# JS/CSS Build Pipeline — Design

**Date:** 2026-07-22
**Status:** Approved (pending spec review)
**Scope:** GitHub issue #4. Phase 0 (Foundations), roadmap item 3 of
`docs/superpowers/specs/2026-07-16-2026-modernization-roadmap-design.md`. Introduces
Vite as a JS/CSS build pipeline, converts `app/assets/js/*.js` to ES modules, and
replaces the manually-vendored third-party libraries (`bulma.min.css`,
`i18next.min.js`, `lucide.min.js`) with npm-managed dependencies bundled by Vite.
Infrastructure only — no visual/content change on any page.

## 1. Context

Today `app/assets/js/*.js` and `app/assets/css/*.css` ship as-is: one classic
`<script>` tag per JS file (load order matters — `session.js` before `main.js`
before page-specific scripts — coordinated today via `/* exported X */` comments
and a hand-maintained block of cross-file global declarations in
`eslint.config.js`), and one `<link rel="stylesheet">` per page, where each
page's CSS file itself `@import url("main.css")` (a second request per page).
Third-party libraries (`bulma`, `i18next`, `lucide`) are committed as static
files under `app/assets/vendor/`, refreshed by hand per `app/assets/vendor/README.md`.
`tools/build.mjs` (the `npm run build` step that produces the FTP-ready `public/`
artifact) copies `app/` to `public/` verbatim — it does not touch JS/CSS at all.

All 20 pages under `app/pages/*.php` still render through `head.php`/`footer.php`
(the pre-Twig partials); only the 404 page renders through
`app/templates/layout.html.twig` (via `App\View`, added in the Twig-templating
design). Both mechanisms currently hardcode the asset paths they emit and both
need to keep working, since Phase 2 (#8–#11) will migrate pages from one to the
other incrementally, not all at once.

## 2. Goals / Non-Goals

**Goals**

1. Add Vite as a devDependency; bundle, minify, and cache-bust `app/assets/js`
   and `app/assets/css`.
2. Convert `app/assets/js/*.js` to ES modules (explicit `import`/`export`),
   removing the load-order-dependent global-script pattern.
3. Replace `app/assets/vendor/` with npm-managed `bulma`, `i18next`, and
   `lucide` dependencies, imported where used.
4. A manifest-driven `App\Assets` helper so both `head.php`/`footer.php` and
   `layout.html.twig` emit correct asset tags from the same mechanism.
5. Wire the build into `tools/build.mjs` (and therefore `npm run build`,
   already run by the `deploy-test` CI job on every merge to `main`) and into
   local dev (Docker Compose, web sessions).

**Non-Goals**

- No CI job that runs this build as a PR gate — that is issue #5.
- No page migrates from `head.php` to Twig in this issue — that is #8–#11.
- No visual or content change. The one intentional non-visual behavior change:
  per-page CSS's `@import url("main.css")` gets inlined at build time (one
  request instead of two), and asset filenames become content-hashed instead
  of stable (correct cache invalidation for Vite's shared chunks).
- No Alpine.js/htmx — that's #10/#11, which depend on this issue for the build
  pipeline but are otherwise unrelated.

## 3. Architecture

```
app/
  assets/
    js/
      main.js                 # entry — nav/banner wiring; exports formatFrenchDate
      session.js               # module (no longer its own <script> tag) — exports Session
      i18n.js                  # entry — i18next init; exports translateApiError
      admin.js, contact.js, authentification-inscription.js,
      inscriptions_admin.js, inscriptions_utilisateurs.js,
      planning_repet.js, signup.js, signups_admin.js,
      sinscrire.js, supper-popup.js
                                # entries — import Session/formatFrenchDate/translateApiError
                                # as needed instead of relying on global load order
    css/
      main.css                 # imported (not a standalone entry) by every page CSS file
      accueil.css, admin.css, ... (one per page)
                                # entries — @import "main.css" inlined by Vite at build time
    vendor/                    # DELETED — replaced by npm deps (bulma, i18next, lucide)
    dist/                      # NEW, gitignored — Vite build output + manifest.json
  src/
    Assets.php                 # NEW — reads dist/manifest.json, emits asset tags
  partials/
    head.php, footer.php       # updated — call App\Assets instead of hardcoded paths
  templates/
    layout.html.twig           # updated — same, via context View.php supplies
  src/View.php                 # updated — passes Assets-derived tags into Twig context
vite.config.js                 # NEW, repo root
package.json                   # NEW deps: vite, bulma, i18next, lucide (devDependencies)
tools/build.mjs                # updated — runs `vite build` before the app/ -> public/ copy
```

## 4. Vite configuration & entries

`vite.config.js` (repo root):

- `root: 'app/assets'`, `build.outDir: 'dist'` (relative to root, i.e.
  `app/assets/dist/`), `build.manifest: true`, `build.rollupOptions.input`
  listing every current entry file (the JS files above, plus every per-page
  CSS file) by explicit path.
- No HTML entries — this is the "backend integration" mode Vite documents for
  non-JS backends: entries are `.js`/`.css` files, not `.html` pages, and the
  backend (PHP, here) reads `manifest.json` to know what to link.
- `base` set to `/assets/dist/` so emitted asset URLs match how `public/` is
  served (front controller passes `/assets/*` straight through per
  `app/.htaccess`).
- `build.sourcemap: false` — no source maps ship to `public/`. There's no error-
  tracking tool in this project consuming them, and `/assets/*` is served
  directly to the public, so shipping original (if minified-adjacent) source
  by default isn't worth it for a static community-site deploy. Revisit if an
  error-tracking integration is ever added.

Each currently-independent `<script>` file becomes a Vite entry. `session.js`
and the export-only portions of `main.js`/`i18n.js` are not independent
`<script>` tags anymore — they're modules imported by the entries that need
them. Vite/Rollup's native-ESM multi-entry output automatically splits shared
imports (e.g. `session.js` imported by both `main.js` and `planning_repet.js`)
into a shared chunk with a content hash, loaded once per page regardless of how
many entries import it (the browser's ES module registry caches by URL).

Each per-page CSS file becomes its own entry too, so Vite resolves its
`@import url("main.css")` at build time into one bundled, minified,
content-hashed CSS file — replacing the current runtime `@import` (a second
HTTP request per page).

## 5. ES module conversion

Cross-file globals become named exports/imports:

| File | Today | After |
|---|---|---|
| `session.js` | `const Session = (function(){...})();` (implicit global) | `export const Session = ...` |
| `main.js` | `function formatFrenchDate(...)` (implicit global) | `export function formatFrenchDate(...)`; imports `Session` |
| `i18n.js` | `function translateApiError(...)` (implicit global) | `export function translateApiError(...)`; imports `i18next` from the npm package |
| `planning_repet.js`, `sinscrire.js`, etc. | reference `Session`/`formatFrenchDate`/`translateApiError`/`lucide` as ambient globals | `import { Session } from './session.js'`, `import { formatFrenchDate } from './main.js'`, `import { translateApiError } from './i18n.js'`, `import { createIcons } from 'lucide'` as needed |

`eslint.config.js` changes `sourceType: 'script'` to `'module'` and removes the
five blocks that exist solely to declare `Session`/`formatFrenchDate`/
`i18next`/`translateApiError`/`lucide` as shared globals with load-order
comments — real `import`/`export` makes those unnecessary. `stylelint`/
`prettier` configs are unaffected (they already target `app/assets/**/*.{js,css}`
by glob, which still matches after the conversion).

## 6. Vendored libs → npm deps

- `bulma`, `i18next`, `lucide` added as devDependencies (bundled at build time,
  not runtime deps — consistent with a static PHP/FTP deploy; nothing installs
  them server-side).
- `signups_admin.css`'s `@import url("../vendor/bulma.min.css");` becomes
  `@import "bulma/css/bulma.css";` (resolved by Vite from `node_modules`).
- `i18n.js` imports `i18next` from the npm package instead of relying on the
  vendored UMD global.
- `main.js`/`planning_repet.js` import `createIcons` (and any icons needed) from
  the `lucide` npm package instead of the vendored UMD global; markup (`<i
  data-lucide="...">`) is unchanged — only how `createIcons()` is invoked
  changes.
- `app/assets/vendor/` and `app/assets/vendor/README.md` are deleted.
- `CLAUDE.md`'s Icons section (which currently describes
  `app/assets/vendor/lucide.min.js` and script-tag loading) is updated to
  describe the npm-import mechanism instead.

## 7. `App\Assets`

New class, `app/src/Assets.php`, PSR-4 autoloaded as `App\Assets`:

- Lazily loads and caches `<docroot>/assets/dist/manifest.json` (path resolved
  the same way `bootstrap.php` resolves other docroot-relative paths).
- `Assets::scriptTags(string $entry): string` — returns the `<script
  type="module" src="...">` tag for the given entry plus any
  `<link rel="modulepreload" href="...">` tags for its imported chunks
  (Vite's manifest lists each entry's `imports`).
- `Assets::styleTag(string $entry): string` — returns the `<link
  rel="stylesheet" href="...">` tag for a CSS entry (or for a JS entry's
  associated `css` array, if Vite attaches CSS to a JS entry rather than
  treating it as a separate entry — resolved during implementation based on
  Vite's actual manifest shape for this config).
- A manifest entry that's missing for a requested name is a hard error
  (`RuntimeException`), not a silent fallback — consistent with this
  project's existing philosophy of failing loud on misconfiguration (e.g. the
  config-shape drift check in `deploy.mjs`) rather than degrading quietly.

## 8. Template integration

- **`head.php`**: `<link rel="stylesheet" href="assets/css/<?= $pageCss ?>">`
  becomes `<?= Assets::styleTag($pageCss) ?>` (where `$pageCss` now names a
  Vite entry, e.g. `accueil.css`, same value pages already pass in).
- **`footer.php`**: the fixed list of `<script src="assets/...">` tags
  (`lucide.min.js`, `session.js`, `main.js`, `i18next.min.js`, `i18n.js`) plus
  the `$pageScripts` loop becomes a small fixed list of `Assets::scriptTags(...)`
  calls — `main.js` and `i18n.js` remain the two entries loaded on every page
  (session.js and lucide/i18next are pulled in as their shared-chunk/npm
  dependencies, not named directly), plus the existing `$pageScripts` loop
  now calling `Assets::scriptTags($script)` per page-specific entry.
- **`layout.html.twig`**: the equivalent hardcoded
  `<link rel="stylesheet" href="assets/css/{{ page_css }}">` and the
  `{% for script in page_scripts %}` loop are replaced the same way.
  `View::renderPage()` adds pre-rendered tag strings (or a small Twig
  extension wrapping `App\Assets`) to the context so both templates resolve
  assets through the exact same manifest lookup — one mechanism regardless of
  which template style a given page currently uses.

## 9. Build pipeline integration (`tools/build.mjs`)

- A `vite build` step (via `execFileSync`, same pattern already used for the
  two `composer:2` Docker invocations in this file) runs **before** the
  existing `cpSync('app', 'public', { recursive: true })`. Since
  `app/assets/dist/` lives under `app/`, the existing copy picks it up into
  `public/assets/dist/` automatically — no separate copy step needed.
- The copy step additionally excludes the now-unused raw source from
  `public/`: `app/assets/js/*.js`, `app/assets/css/*.css`, and (since it's
  already deleted per §6) `app/assets/vendor/` are not needed at runtime once
  only `dist/`'s bundled output is referenced — keeping the deploy payload
  from shipping dead source next to the bundles.
- `npm run build`'s existing consumers — `deploy:test`/`deploy:qa`/`deploy:prod`
  and the CI `deploy-test` job that already runs `npm run build` on every merge
  to `main` — pick up the new step automatically, no changes needed there.

## 10. Local dev workflow

- **Docker Compose**: the `web` service's compose config gains a sibling
  step/service running `vite build --watch` against the same mounted `app/`
  volume PHP reads from, writing to `app/assets/dist/` — editing a JS/CSS file
  rebuilds automatically and the running site picks it up on the next request.
  No HMR, no second exposed port — PHP always serves real built output from
  disk, the same code path as production.
- **Web sessions (no Docker)**: `npm run serve` (via `tools/ensure-dev-stack.mjs`
  or a small addition to the `serve` script) runs `vite build` once — not
  watch, since these are short-lived, non-interactive sessions — before
  starting `php -S`. `npm run serve` remains a single command.
- **`npm run check`**: gains the Vite build as a prerequisite, so a build
  failure fails `check` locally, same spirit as `php -l`/phpcs failing it. A
  dedicated CI job gating every PR on this is issue #5, not this one.

## 11. Testing

- `tests/Unit/AssetsTest.php` (new): given a fixture `manifest.json`, asserts
  `Assets::scriptTags()`/`Assets::styleTag()` produce the expected tags
  (including modulepreload for an entry with shared-chunk imports), and that a
  missing entry throws.
- `tests/Unit/ViewTest.php` (existing, from the Twig-templating design):
  extended to assert the 404 page's emitted asset tags come from `App\Assets`
  rather than a hardcoded path.
- ESLint (`npm run lint:js`) continues to run unchanged (module syntax is
  already valid under `ecmaVersion: 2022`; only `sourceType` and the
  global-declaration blocks change, per §5) — verifies every converted file
  still passes lint.
- No Playwright/e2e coverage — out of scope (Phase 4, issue #14); manual smoke
  test (via `npm run serve` or Docker) of a representative page (e.g.
  `accueil`, `planning_repet` for the icon re-init path, `signups_admin` for
  Bulma) confirms no visual regression before merging.

## 12. Deployment / build impact

- `public/assets/dist/` (bundled JS/CSS + manifest) ships; `public/assets/js`,
  `public/assets/css`, `public/assets/vendor` no longer do (§9).
- No new writable directory on the server — `dist/` is built locally/in CI and
  uploaded as static files, same as every other asset today.
- `deploy.mjs`'s existing byte-size-diff upload logic and `--prune` flag need
  no changes: hashed filenames naturally change size/name when content
  changes, and stale hashed files from a previous build are exactly what
  `--prune` already exists to clean up.
