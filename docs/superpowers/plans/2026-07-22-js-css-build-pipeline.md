# JS/CSS Build Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vite as a JS/CSS build pipeline (issue #4): bundle/minify/cache-bust `app/assets/js` and `app/assets/css`, convert the JS to real ES modules, replace the manually-vendored `bulma`/`i18next`/`lucide` with npm dependencies, and serve the bundled output through a manifest-driven `App\Assets` helper used by both existing template mechanisms (`head.php`/`footer.php` and `layout.html.twig`).

**Architecture:** Vite builds every currently-independent `<script>`/page-CSS file as a named entry (`app/assets/js/*.js` minus `session.js`, `app/assets/css/*.css` minus `main.css`) into `app/assets/dist/`, emitting a `manifest.json` at `app/assets/dist/.vite/manifest.json`. `App\Assets` reads that manifest and emits `<script type="module">`/`<link rel="modulepreload">`/`<link rel="stylesheet">` tags by entry name; `head.php`/`footer.php` and `View.php`/`layout.html.twig` both call it instead of hardcoding asset paths. `tools/build.mjs` runs `vite build` before copying `app/` → `public/`, and stops shipping the now-dead raw JS/CSS source.

**Tech Stack:** Vite (bundler), native ES modules (no framework), PHP 8.4 (`App\Assets`), PHPUnit (tests), existing ESLint/Stylelint/Prettier tooling.

## Global Constraints

- No visual or content change on any page (per spec §2 Non-Goals).
- No page migrates from `head.php` to Twig in this work (that's #8–#11).
- No CI PR-gate job for this build (that's #5) — only local (`npm run check`/`serve`) and the existing `deploy-test` CI job (which already runs `npm run build`) are wired up here.
- `build.sourcemap: false` — no source maps ship to `public/` (spec §4).
- A manifest entry missing for a requested name is a hard error (`RuntimeException`), never a silent fallback (spec §7).
- `main.js` and `i18n.js` remain the two entries loaded on every page, unconditionally (spec §8) — do not fold them into per-page `$pageScripts`.
- Everything written in English (identifiers, comments, commit messages); French stays confined to user-visible page copy, unaffected by this work.

---

## Verified facts (empirical, not assumed)

These were confirmed by actually running a Vite build in a scratch directory during planning — later tasks rely on them directly:

- With `root: 'app/assets'` and `rollupOptions.input` given as an array of paths relative to that root (e.g. `'js/main.js'`, `'css/accueil.css'`), the manifest is written to `<outDir>/.vite/manifest.json` (**not** `<outDir>/manifest.json`), and each entry's manifest **key is exactly the input path as given** (e.g. `"js/main.js"`), with a `file` field (hashed output path relative to `outDir`), `isEntry: true`, and an optional `imports` array of shared-chunk keys (each prefixed `_`, e.g. `"_session-XYZ.js"`) — which can contain **duplicate entries** for a module imported via more than one binding.
- `@import url("main.css")` inside a page CSS file is correctly inlined by Vite at build time into that page's single output CSS file — no code changes needed to any `@import url("main.css")` line.
- A module that is **both** its own Vite entry **and** imported by another entry (e.g. `main.js`, entry-and-imported-by `planning_repet.js`) is emitted as a **single** output file; the importing entry's bundle references it via a real `import` statement. Native ES module caching means the browser evaluates it exactly once even when both `<script type="module">` tags are present on the same page — `main.js`'s `DOMContentLoaded` handler will **not** double-fire.
- `lucide`'s ESM `createIcons()` requires an explicit `icons` map argument (`createIcons({ icons: { Menu, ... } })`) — calling it bare (as the vendored UMD global did) throws `"Please provide an icons object."` in the npm build. The map key must be the PascalCase icon component name; `lucide`'s npm package exports `Menu`, `ExternalLink`, `Pencil`, `Trash2` — matching this project's four `data-lucide` values (`menu`, `external-link`, `pencil`, `trash-2`) exactly.
- `import i18next from 'i18next'` yields an object with `.init`/`.t`/`.exists` — a drop-in replacement for the vendored UMD global; no change needed to the `i18next.init({...})` call body itself.
- `bulma`'s npm package ships `node_modules/bulma/css/bulma.css`.

---

### Task 1: Vite setup — dependencies and config

**Files:**
- Modify: `package.json`
- Create: `vite.config.js`
- Create/modify: `.gitignore` (confirm `/app/assets/dist/` is ignored — verify, don't duplicate if a broader pattern already covers it)

**Interfaces:**
- Produces: `app/assets/dist/.vite/manifest.json` (consumed by `App\Assets` in Task 7), Vite entries keyed `js/<file>.js` / `css/<file>.css` (consumed by all later JS/CSS/template tasks).

- [ ] **Step 1: Install Vite and the three npm-managed vendor libs**

```bash
npm install --save-dev vite
npm install --save-dev bulma i18next lucide
```

- [ ] **Step 2: Check installed versions land in `package.json`**

Run: `grep -E '"(vite|bulma|i18next|lucide)"' package.json`
Expected: all four listed under `devDependencies`.

- [ ] **Step 3: Create `vite.config.js`**

```js
import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const JS_DIR = 'app/assets/js';
const CSS_DIR = 'app/assets/css';

// session.js is imported by other entries as a shared module (see
// app/assets/js/session.js) — it is never its own <script> tag, so it must
// not be a Vite entry point itself.
const JS_ENTRY_EXCLUDE = new Set(['session.js', 'icons.js']);
// main.css is @imported by every page CSS file — it is never linked
// directly, so it must not be a Vite entry point itself.
const CSS_ENTRY_EXCLUDE = new Set(['main.css']);

const jsEntries = readdirSync(JS_DIR)
  .filter((file) => file.endsWith('.js') && !JS_ENTRY_EXCLUDE.has(file))
  .map((file) => `js/${file}`);

const cssEntries = readdirSync(CSS_DIR)
  .filter((file) => file.endsWith('.css') && !CSS_ENTRY_EXCLUDE.has(file))
  .map((file) => `css/${file}`);

export default defineConfig({
  root: 'app/assets',
  base: '/assets/dist/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: [...jsEntries, ...cssEntries],
    },
  },
});
```

`icons.js` (created in Task 2) is a shared module like `session.js`, not its own `<script>` tag — excluded here up front so Task 2 doesn't need to revisit this file.

- [ ] **Step 4: Verify `.gitignore` already ignores the build output**

Run: `grep -n "dist" .gitignore`
Expected: the existing `/dist/` entry (for `build:overlay` output) does **not** match `app/assets/dist/` (different path). Add a new line if missing:

```gitignore
# generated Vite build output (npm run build / vite build); never hand-edit or commit
/app/assets/dist/
```

- [ ] **Step 5: Run a build against the current (still-global-script) JS to confirm the pipeline runs end-to-end**

Run: `npx vite build`
Expected: exits 0, prints a summary of built files, and creates `app/assets/dist/.vite/manifest.json`. (The JS files aren't ES modules yet — that's fine; Vite bundles plain scripts too. Tasks 2–4 convert them.)

- [ ] **Step 6: Inspect the manifest to confirm the key format matches the "Verified facts" section above**

Run: `cat app/assets/dist/.vite/manifest.json | head -20`
Expected: keys like `"js/main.js"`, `"css/accueil.css"`, each with a `file` field.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore
git commit -m "build: add Vite as the JS/CSS build pipeline"
```

---

### Task 2: Convert `session.js`, `main.js`, and add `icons.js`

**Files:**
- Modify: `app/assets/js/session.js`
- Modify: `app/assets/js/main.js`
- Create: `app/assets/js/icons.js`

**Interfaces:**
- Produces: `export const Session` (from `session.js`), `export function formatFrenchDate(date, options)` (from `main.js`), `export const icons` (from `icons.js`) — all consumed by Task 4 (`planning_repet.js`, `sinscrire.js`) and by `main.js` itself.
- Consumes: `createIcons` from the `lucide` npm package (Task 1).

- [ ] **Step 1: Rewrite `app/assets/js/session.js`**

```js
// UI-only helper. NOT a source of truth for authentication — the server
// enforces auth via the session cookie and injects the authenticated role as
// window.__sessionRole on every page (see partials/head.php). The UI reads that
// server value, so it can never disagree with the real session (e.g. a fresh
// tab no longer shows a "logged out" UI while the server session is still alive).
// The capability map mirrors Auth::CAPABILITIES in src/Auth.php.
export const Session = (function () {
  var CAPABILITIES = {
    user: ["respond"],
    moderator: ["respond"],
    admin: ["manage_events", "view_summary"],
  };
  function role() {
    return (typeof window !== "undefined" && window.__sessionRole) || null;
  }
  function can(capability) {
    var caps = CAPABILITIES[role()] || [];
    return caps.indexOf(capability) !== -1;
  }
  return {
    uiRole: role,
    canManageEvents: function () {
      return can("manage_events");
    },
    canViewSummary: function () {
      return can("view_summary");
    },
    canRespond: function () {
      return can("respond");
    },
  };
})();
```

(Only change from today: `export` added, the now-unnecessary `/* exported Session */` ESLint directive comment removed.)

- [ ] **Step 2: Create `app/assets/js/icons.js`**

```js
// icons.js — the small, fixed set of Lucide icons used across the site (see
// CLAUDE.md's Icons section). Shared here so main.js (initial page load) and
// planning_repet.js (re-init after the admin event list rebuilds) initialize
// from the same icon set — add a new icon here, not per call site.
import { ExternalLink, Menu, Pencil, Trash2 } from 'lucide';

export const icons = { ExternalLink, Menu, Pencil, Trash2 };
```

- [ ] **Step 3: Rewrite `app/assets/js/main.js`**

```js
// main.js — nav + banner UI wiring.
// Auth is enforced server-side via the session cookie; everything here is
// UI-only.
import { createIcons } from 'lucide';
import { icons } from './icons.js';
import { Session } from './session.js';

// Current page identifier (the route slug), used for returnTo links.
var currentPage = window.location.pathname.split("/").pop();

// Formats a Date as French text ("22 août 2026" by default). Pass options to
// override toLocaleDateString's format, e.g. { weekday: "long", ...defaults }.
export function formatFrenchDate(date, options) {
  var defaults = { day: "numeric", month: "long", year: "numeric" };
  return date.toLocaleDateString("fr-FR", options || defaults);
}

document.addEventListener("DOMContentLoaded", function () {
  setupNavToggle();
  setupNavAuth();
  setupLoginBtn();
  createIcons({ icons });
});

// Mobile hamburger toggle. The nav markup is server-rendered, so it exists at
// parse time (no fetch to wait for).
function setupNavToggle() {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (!toggle || !nav) {
    return;
  }
  toggle.addEventListener("click", function () {
    var isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

// In-menu login/logout link (#nav-auth-link). Uses the UI-only role hint to
// decide the label; the server is the real source of truth.
function setupNavAuth() {
  wireAuthControl(document.getElementById("nav-auth-link"));
}

// Desktop banner login/logout button (#login-btn). Same behavior as the nav link.
function setupLoginBtn() {
  wireAuthControl(document.getElementById("login-btn"));
}

function wireAuthControl(el) {
  if (!el) {
    return;
  }
  if (Session.uiRole()) {
    el.textContent = "Déconnexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      fetch("/api/logout", { method: "POST" }).finally(function () {
        window.location.href = "/";
      });
    });
  } else {
    el.textContent = "Connexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "/authentification_inscription?returnTo=" + currentPage;
    });
  }
}
```

(Changes from today: real `import`s replace the implicit-global dependency on `session.js`/vendored `lucide`; `export` replaces the `/* exported formatFrenchDate */` comment; `lucide.createIcons()` → `createIcons({ icons })`; the `typeof Session === "undefined"` guard in `wireAuthControl` is dropped — with a real `import`, `Session` is always defined, so the guard was dead code once converted.)

- [ ] **Step 4: Build and confirm no errors**

Run: `npx vite build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/assets/js/session.js app/assets/js/main.js app/assets/js/icons.js
git commit -m "refactor(js): convert session.js and main.js to ES modules"
```

---

### Task 3: Convert `i18n.js`

**Files:**
- Modify: `app/assets/js/i18n.js`

**Interfaces:**
- Consumes: `i18next` npm package (Task 1).
- Produces: `export function translateApiError(body)` — consumed by Task 4 (`planning_repet.js`).

- [ ] **Step 1: Rewrite `app/assets/js/i18n.js`**

```js
import i18next from 'i18next';

i18next.init({
  lng: "fr",
  fallbackLng: "fr",
  resources: {
    fr: {
      translation: {
        errors: {
          validation_failed: "Le formulaire contient des erreurs.",
          method_not_allowed: "Méthode non autorisée",
          not_authenticated: "Non authentifié",
          access_denied: "Accès refusé",
          invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect",
          event_not_found: "Événement introuvable",
          invalid_session: "Session invalide",
          service_unavailable: "Service indisponible",
          captcha_failed: "Vérification anti-robot échouée, veuillez réessayer.",
        },
        validation: {
          required: "est requis",
          too_long: "est trop long (maximum {{max}} caractères)",
          invalid_format: "n'est pas dans un format valide",
          invalid_type: "a un type invalide",
          invalid_value: "doit être l'une des valeurs suivantes : {{allowed}}",
        },
        fields: {
          date: "Date",
          title: "Titre",
          startTime: "Heure de début",
          endTime: "Heure de fin",
          location: "Lieu",
          attire: "Tenue",
          id: "Identifiant",
          lastName: "Nom",
          firstName: "Prénom",
          email: "E-mail",
          subject: "Sujet",
          message: "Message",
          first_name: "Prénom",
          last_name: "Nom",
          address: "Adresse",
          phone: "Téléphone",
          table_name: "Table",
          menus: "Menus",
          username: "Identifiant",
          password: "Mot de passe",
          eventId: "Événement",
          participation: "Participation",
        },
      },
    },
  },
});

var API_ERROR_FALLBACK = "Une erreur est survenue. Veuillez réessayer.";

// Translates a parsed API error response body ({error, code, fields?}) into
// French for display. The frontend's own data stays English throughout —
// this is the only place French text is computed. Any unknown code/reason/
// field falls back to a generic message rather than leaking an English or
// raw i18next key to the user (i18next's own miss behavior is to return the
// key itself, which this function never lets reach the UI).
export function translateApiError(body) {
  var code = body && body.code;
  var rawFields = (body && body.fields) || [];

  var fields = rawFields.map(function (entry) {
    var fieldKey = "fields." + entry.field;
    var fieldLabel = i18next.exists(fieldKey) ? i18next.t(fieldKey) : entry.field;
    var reasonKey = "validation." + entry.reason;
    var reasonText = i18next.exists(reasonKey)
      ? i18next.t(reasonKey, entry.params || {})
      : API_ERROR_FALLBACK;
    return { field: entry.field, message: fieldLabel + " " + reasonText };
  });

  var errorKey = "errors." + code;
  var message = i18next.exists(errorKey) ? i18next.t(errorKey) : API_ERROR_FALLBACK;

  return { message: message, fields: fields };
}
```

(Only changes from today: `import i18next from 'i18next';` replaces the vendored-global comment; `export` replaces `/* exported translateApiError */`. The `i18next.init({...})` call body and `translateApiError`'s body are byte-identical to today.)

- [ ] **Step 2: Build and confirm no errors**

Run: `npx vite build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/assets/js/i18n.js
git commit -m "refactor(js): convert i18n.js to an ES module using npm i18next"
```

---

### Task 4: Convert `planning_repet.js` and `sinscrire.js`

**Files:**
- Modify: `app/assets/js/planning_repet.js`
- Modify: `app/assets/js/sinscrire.js`

**Interfaces:**
- Consumes: `Session` (Task 2), `formatFrenchDate` (Task 2), `translateApiError` (Task 3), `createIcons`/`icons` (Task 1/2).

- [ ] **Step 1: Add imports to the top of `app/assets/js/planning_repet.js` and replace the bare `lucide.createIcons()` call**

Replace:

```js
// using session.js

const isAdmin = Session.canManageEvents();
```

with:

```js
import { createIcons } from 'lucide';
import { icons } from './icons.js';
import { translateApiError } from './i18n.js';
import { formatFrenchDate } from './main.js';
import { Session } from './session.js';

const isAdmin = Session.canManageEvents();
```

Replace the one `lucide.createIcons();` call (inside `loadEvents()`, after the event list is rebuilt) with:

```js
      createIcons({ icons });
```

No other lines in this file change — every other reference (`translateApiError`, `formatFrenchDate`) is now resolved via the imports above instead of ambient globals.

- [ ] **Step 2: Add imports to the top of `app/assets/js/sinscrire.js` and update its header comment**

Replace:

```js
// using session.js  (page access is enforced server-side)
document.addEventListener("DOMContentLoaded", function () {
```

with:

```js
import { Session } from './session.js';
import { formatFrenchDate } from './main.js';

// Page access is enforced server-side.
document.addEventListener("DOMContentLoaded", function () {
```

No other lines change.

- [ ] **Step 3: Build and confirm no errors**

Run: `npx vite build`
Expected: exits 0.

- [ ] **Step 4: Manually diff both files against git to confirm only the intended lines changed**

Run: `git diff app/assets/js/planning_repet.js app/assets/js/sinscrire.js`
Expected: only the import blocks, the `createIcons({ icons })` call, and the `sinscrire.js` comment line differ — no other line touched.

- [ ] **Step 5: Commit**

```bash
git add app/assets/js/planning_repet.js app/assets/js/sinscrire.js
git commit -m "refactor(js): convert planning_repet.js and sinscrire.js to ES modules"
```

---

### Task 5: Simplify `eslint.config.js` and verify the remaining JS files

**Files:**
- Modify: `eslint.config.js`

**Interfaces:** None (tooling config only).

The 8 remaining entry files (`admin.js`, `authentification-inscription.js`, `contact.js`, `inscriptions_admin.js`, `inscriptions_utilisateurs.js`, `signup.js`, `signups_admin.js`, `supper-popup.js`) have **zero** cross-file dependencies (confirmed during planning by reading each file) — they need no content changes at all. Valid JS with no `import`/`export` statements is still a valid ES module, so they work unmodified under `<script type="module">`.

- [ ] **Step 1: Rewrite `eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['app/assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // Several files use a leading-underscore parameter name as an explicit
      // "intentionally unused" placeholder (e.g. `.then((_) => ...)`), which
      // is a common, readable convention rather than a bug.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
```

This removes the five blocks that existed solely to declare `Session`/`formatFrenchDate`/`i18next`/`translateApiError`/`lucide` as shared globals with load-order comments — real `import`/`export` (Tasks 2–4) makes them unnecessary. `sourceType` changes from `'script'` to `'module'`.

- [ ] **Step 2: Run ESLint across all of `app/assets/js`**

Run: `npm run lint:js`
Expected: exits 0, no errors. (If any of the 8 untouched files fail, it means one of them actually did reference a cross-file global not caught during planning — investigate and fix that specific file before proceeding; do not silence via a new global declaration, since the whole point of this task is removing that pattern.)

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): switch app/assets/js ESLint config to ES modules"
```

---

### Task 6: Move vendored libs to npm; delete `app/assets/vendor/`

**Files:**
- Modify: `app/assets/css/signups_admin.css`
- Delete: `app/assets/vendor/bulma.min.css`
- Delete: `app/assets/vendor/i18next.min.js`
- Delete: `app/assets/vendor/lucide.min.js`
- Delete: `app/assets/vendor/README.md`

**Interfaces:** None beyond the CSS `@import` change (JS-side npm imports for `i18next`/`lucide` were already wired in Tasks 2–3).

- [ ] **Step 1: Update the Bulma import in `app/assets/css/signups_admin.css`**

Replace:

```css
@import url("../vendor/bulma.min.css");
```

with:

```css
@import "bulma/css/bulma.css";
```

- [ ] **Step 2: Delete the vendor directory**

```bash
git rm -r app/assets/vendor
```

- [ ] **Step 3: Build and confirm Bulma resolves correctly from `node_modules`**

Run: `npx vite build`
Expected: exits 0. Then: `grep -c '\.tile-box' app/assets/dist/assets/signups_admin-*.css` (or open the built CSS file) to confirm Bulma's rules were actually bundled in (a non-zero/plausible byte count for that output file vs. `signups_admin.css`'s own small source size is a quick sanity check that the import didn't silently resolve to nothing).

- [ ] **Step 4: Run the full CSS lint to confirm the new `@import` syntax is accepted**

Run: `npm run lint:css`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/assets/css/signups_admin.css
git commit -m "build(assets): replace vendored bulma/i18next/lucide with npm deps"
```

---

### Task 7: `App\Assets` (TDD)

**Files:**
- Create: `tests/Unit/AssetsTest.php`
- Create: `app/src/Assets.php`

**Interfaces:**
- Produces: `Assets::init(?string $manifestPath = null): void`, `Assets::scriptTags(string $jsFile): string`, `Assets::styleTag(string $cssFile): string` — consumed by Task 8 (`head.php`/`footer.php`) and Task 9 (`View.php`).

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Assets;
use PHPUnit\Framework\TestCase;

final class AssetsTest extends TestCase
{
    private string $manifestPath;

    protected function setUp(): void
    {
        $this->manifestPath = sys_get_temp_dir() . '/assets-test-manifest-' . uniqid() . '.json';
        file_put_contents($this->manifestPath, json_encode([
            'js/main.js' => [
                'file' => 'assets/main-ABC123.js',
                'isEntry' => true,
                // Vite's real output can list the same shared chunk twice
                // (once per import binding) — the fixture reproduces that.
                'imports' => ['_session-XYZ789.js', '_session-XYZ789.js'],
            ],
            '_session-XYZ789.js' => [
                'file' => 'assets/session-XYZ789.js',
            ],
            'js/admin.js' => [
                'file' => 'assets/admin-DEF456.js',
                'isEntry' => true,
            ],
            'css/accueil.css' => [
                'file' => 'assets/accueil-GHI789.css',
                'isEntry' => true,
            ],
        ]));
        Assets::init($this->manifestPath);
    }

    protected function tearDown(): void
    {
        Assets::init();
        @unlink($this->manifestPath);
    }

    public function testScriptTagsIncludesModulePreloadForImportsWithoutDuplicates(): void
    {
        $html = Assets::scriptTags('main.js');
        $this->assertSame(
            '<link rel="modulepreload" href="/assets/dist/assets/session-XYZ789.js">' . "\n"
                . '<script type="module" src="/assets/dist/assets/main-ABC123.js"></script>',
            $html
        );
    }

    public function testScriptTagsWithoutImportsOmitsModulePreload(): void
    {
        $html = Assets::scriptTags('admin.js');
        $this->assertSame(
            '<script type="module" src="/assets/dist/assets/admin-DEF456.js"></script>',
            $html
        );
    }

    public function testStyleTagReturnsLinkTag(): void
    {
        $html = Assets::styleTag('accueil.css');
        $this->assertSame('<link rel="stylesheet" href="/assets/dist/assets/accueil-GHI789.css">', $html);
    }

    public function testMissingScriptEntryThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Assets::scriptTags('does-not-exist.js');
    }

    public function testMissingStyleEntryThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Assets::styleTag('does-not-exist.css');
    }

    public function testMissingManifestFileThrows(): void
    {
        Assets::init('/nonexistent/path/manifest.json');
        $this->expectException(\RuntimeException::class);
        Assets::scriptTags('main.js');
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:php -- --filter AssetsTest`
Expected: FAIL — `Class "App\Assets" not found`.

- [ ] **Step 3: Write `app/src/Assets.php`**

```php
<?php

namespace App;

/**
 * Reads the Vite build manifest (app/assets/dist/.vite/manifest.json) and
 * emits the HTML tags for a given entry — the single mechanism both
 * head.php/footer.php and View.php/layout.html.twig use to reference built
 * JS/CSS, instead of each hardcoding asset paths.
 */
final class Assets
{
    private static ?string $manifestPath = null;
    private static ?array $manifest = null;

    /**
     * Points at a specific manifest file (tests use this to inject a
     * fixture); pass null to reset to the real build output.
     */
    public static function init(?string $manifestPath = null): void
    {
        self::$manifestPath = $manifestPath;
        self::$manifest = null;
    }

    private static function manifestPath(): string
    {
        return self::$manifestPath ?? __DIR__ . '/../assets/dist/.vite/manifest.json';
    }

    private static function manifest(): array
    {
        if (self::$manifest === null) {
            $path = self::manifestPath();
            if (!is_file($path)) {
                throw new \RuntimeException(
                    "Vite manifest not found at \"$path\" — run \`npm run build\` (or \`npx vite build\`) first."
                );
            }
            self::$manifest = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        return self::$manifest;
    }

    private static function entry(string $key): array
    {
        $manifest = self::manifest();
        if (!isset($manifest[$key])) {
            throw new \RuntimeException(
                "Vite manifest has no entry for \"$key\" — check it's listed in vite.config.js's entries."
            );
        }

        return $manifest[$key];
    }

    /**
     * <script type="module"> for the given entry, preceded by
     * <link rel="modulepreload"> for each shared chunk it imports.
     */
    public static function scriptTags(string $jsFile): string
    {
        $entry = self::entry("js/$jsFile");
        $tags = [];
        foreach (array_unique($entry['imports'] ?? []) as $importKey) {
            $chunk = self::entry($importKey);
            $tags[] = '<link rel="modulepreload" href="/assets/dist/' . htmlspecialchars($chunk['file']) . '">';
        }
        $tags[] = '<script type="module" src="/assets/dist/' . htmlspecialchars($entry['file']) . '"></script>';

        return implode("\n", $tags);
    }

    /** <link rel="stylesheet"> for the given CSS entry. */
    public static function styleTag(string $cssFile): string
    {
        $entry = self::entry("css/$cssFile");

        return '<link rel="stylesheet" href="/assets/dist/' . htmlspecialchars($entry['file']) . '">';
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:php -- --filter AssetsTest`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/Assets.php tests/Unit/AssetsTest.php
git commit -m "feat(assets): add App\\Assets, a Vite-manifest-driven asset tag helper"
```

---

### Task 8: Wire `head.php`/`footer.php` to `App\Assets`

**Files:**
- Modify: `app/partials/head.php`
- Modify: `app/partials/footer.php`

**Interfaces:**
- Consumes: `Assets::styleTag()`, `Assets::scriptTags()` (Task 7).

- [ ] **Step 1: Update `app/partials/head.php`**

Replace:

```php
use App\Auth;
```

with:

```php
use App\Assets;
use App\Auth;
```

Replace:

```php
    <!-- Single per-page stylesheet; it @imports main.css itself. -->
    <link rel="stylesheet" href="assets/css/<?= htmlspecialchars($pageCss) ?>">
```

with:

```php
    <!-- Bundled by Vite (tools/build.mjs); main.css's content is inlined into
         this file at build time, so this is the only stylesheet request. -->
    <?= Assets::styleTag($pageCss) ?>
```

- [ ] **Step 2: Update `app/partials/footer.php`**

Replace:

```php
use App\Auth;
use App\Features;
use App\Repositories\SignupRepository;
```

with:

```php
use App\Assets;
use App\Auth;
use App\Features;
use App\Repositories\SignupRepository;
```

Replace:

```php
<script src="assets/js/supper-popup.js"></script>
<?php endif; ?>

<?php // Scripts shared by every page, then any page-specific scripts (in load order). ?>
<script src="assets/vendor/lucide.min.js"></script>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/vendor/i18next.min.js"></script>
<script src="assets/js/i18n.js"></script>
<?php foreach ($pageScripts ?? [] as $script) : ?>
<script src="assets/js/<?= htmlspecialchars($script) ?>"></script>
<?php endforeach; ?>
```

with:

```php
<?= Assets::scriptTags('supper-popup.js') ?>
<?php endif; ?>

<?php // Scripts loaded on every page, then any page-specific scripts (in load order). ?>
<?= Assets::scriptTags('main.js') ?>
<?= Assets::scriptTags('i18n.js') ?>
<?php foreach ($pageScripts ?? [] as $script) : ?>
<?= Assets::scriptTags($script) ?>
<?php endforeach; ?>
```

- [ ] **Step 3: Run the PHP lint/syntax check**

Run: `npm run lint:php`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add app/partials/head.php app/partials/footer.php
git commit -m "feat(assets): serve head.php/footer.php's assets through App\\Assets"
```

Note: every page under `app/pages/*.php` still calls these partials, so this task alone changes what all 20 pages emit for `<link>`/`<script>` tags — verified end-to-end in Task 12's manual smoke test, once Task 10's build wiring makes `app/assets/dist/` actually exist when the site is served.

---

### Task 9: Wire `View.php`/`layout.html.twig` to `App\Assets`

**Files:**
- Modify: `app/src/View.php`
- Modify: `app/templates/layout.html.twig`
- Modify: `tests/Unit/ViewTest.php`

**Interfaces:**
- Consumes: `Assets::styleTag()`, `Assets::scriptTags()` (Task 7).

- [ ] **Step 1: Update `app/src/View.php`**

Replace the `renderPage` context array:

```php
        echo self::twig()->render($template, [
            'page_title' => $pageTitle,
            'page_css' => $pageCss,
            'page_scripts' => $pageScripts,
            'current_route' => $currentRoute,
            'session_role_json' => json_encode(Auth::role()),
            'env_is_prod' => Env::isProd(),
            'env_current' => Env::current(),
            'env_ribbon_label' => Env::ribbonLabel(),
            'show_signup_popup' => $showSignupPopup,
            'popup_occasion' => $showSignupPopup
                ? SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]
                : null,
        ]);
```

with:

```php
        echo self::twig()->render($template, [
            'page_title' => $pageTitle,
            'page_stylesheet_tag' => Assets::styleTag($pageCss),
            'common_script_tags' => Assets::scriptTags('main.js') . "\n" . Assets::scriptTags('i18n.js'),
            'page_script_tags' => array_map(
                static fn (string $script): string => Assets::scriptTags($script),
                $pageScripts
            ),
            'current_route' => $currentRoute,
            'session_role_json' => json_encode(Auth::role()),
            'env_is_prod' => Env::isProd(),
            'env_current' => Env::current(),
            'env_ribbon_label' => Env::ribbonLabel(),
            'show_signup_popup' => $showSignupPopup,
            'popup_script_tag' => $showSignupPopup ? Assets::scriptTags('supper-popup.js') : null,
            'popup_occasion' => $showSignupPopup
                ? SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]
                : null,
        ]);
```

`Assets` doesn't need a `use` import here since `View` already lives in the `App` namespace.

- [ ] **Step 2: Update `app/templates/layout.html.twig`**

Replace:

```twig
    <link rel="stylesheet" href="assets/css/{{ page_css }}">
```

with:

```twig
    {{ page_stylesheet_tag|raw }}
```

Replace:

```twig
<script src="assets/js/supper-popup.js"></script>
{% endif %}

<script src="assets/vendor/lucide.min.js"></script>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/vendor/i18next.min.js"></script>
<script src="assets/js/i18n.js"></script>
{% for script in page_scripts %}
<script src="assets/js/{{ script }}"></script>
{% endfor %}
```

with:

```twig
{{ popup_script_tag|raw }}
{% endif %}

{{ common_script_tags|raw }}
{% for tag in page_script_tags %}
{{ tag|raw }}
{% endfor %}
```

- [ ] **Step 3: Update `tests/Unit/ViewTest.php` to set up a fixture manifest**

Add `use App\Assets;` alongside the existing `use` statements, and a `manifestPath` property. Replace `setUp`/`tearDown`:

```php
final class ViewTest extends TestCase
{
    private string $manifestPath;

    protected function setUp(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
        $this->manifestPath = sys_get_temp_dir() . '/view-test-manifest-' . uniqid() . '.json';
        file_put_contents($this->manifestPath, json_encode([
            'js/main.js' => ['file' => 'assets/main-fixture.js', 'isEntry' => true],
            'js/i18n.js' => ['file' => 'assets/i18n-fixture.js', 'isEntry' => true],
            'js/supper-popup.js' => ['file' => 'assets/supper-popup-fixture.js', 'isEntry' => true],
            'css/test.css' => ['file' => 'assets/test-fixture.css', 'isEntry' => true],
        ]));
        Assets::init($this->manifestPath);
    }

    protected function tearDown(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
        Assets::init();
        @unlink($this->manifestPath);
    }
```

- [ ] **Step 4: Update the one assertion that checked the old hardcoded path**

Replace:

```php
    public function testPageTitleAndCssRender(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('<title>Test Title</title>', $html);
        $this->assertStringContainsString('assets/css/test.css', $html);
    }
```

with:

```php
    public function testPageTitleAndCssRender(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('<title>Test Title</title>', $html);
        $this->assertStringContainsString('/assets/dist/assets/test-fixture.css', $html);
    }
```

All other `ViewTest` assertions (session role, env ribbon, 404 content, nav active-state, popup visibility) are unaffected — they don't touch CSS/JS asset paths.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:php`
Expected: PASS — including all `ViewTest` and `AssetsTest` cases, plus everything else unaffected.

- [ ] **Step 6: Commit**

```bash
git add app/src/View.php app/templates/layout.html.twig tests/Unit/ViewTest.php
git commit -m "feat(assets): serve layout.html.twig's assets through App\\Assets"
```

---

### Task 10: Wire the build into `tools/build.mjs`

**Files:**
- Modify: `tools/build.mjs`

**Interfaces:**
- Consumes: `npx vite build` (Task 1's config), produces `public/assets/dist/`.

- [ ] **Step 1: Add the Vite build step before the `app/` → `public/` copy, and prune the now-dead raw source after it**

Replace:

```js
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

rmSync('public', { recursive: true, force: true });
cpSync('app', 'public', { recursive: true });
```

with:

```js
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

// Bundle JS/CSS first so app/assets/dist/ exists before the app/ -> public/
// copy below picks it up.
execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });

rmSync('public', { recursive: true, force: true });
cpSync('app', 'public', { recursive: true });

// The raw JS/CSS source is superseded by the bundled output just copied
// above (public/assets/dist/) — the server never references it directly
// anymore (see App\Assets), so don't ship dead source alongside the bundles.
rmSync('public/assets/js', { recursive: true, force: true });
rmSync('public/assets/css', { recursive: true, force: true });
```

(`app/assets/vendor/` was already deleted in Task 6, so it needs no explicit removal here — there's nothing left to copy.)

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: exits 0. Then verify the pruning worked and the bundle landed:

```bash
test ! -d public/assets/js && echo "js pruned: OK"
test ! -d public/assets/css && echo "css pruned: OK"
test -f public/assets/dist/.vite/manifest.json && echo "manifest present: OK"
test -f public/index.php && echo "index.php present: OK"
```

Expected: all four lines print.

- [ ] **Step 3: Commit**

```bash
git add tools/build.mjs
git commit -m "build: run vite build in tools/build.mjs and stop shipping raw JS/CSS source"
```

---

### Task 11: `package.json` script wiring and `.htaccess` cache policy

**Files:**
- Modify: `package.json`
- Modify: `app/.htaccess`

**Interfaces:** None beyond the new `build:assets` npm script Tasks 12 references.

- [ ] **Step 1: Add a `build:assets` script and wire it into `check`/`serve`**

In `package.json`'s `scripts`, add:

```json
    "build:assets": "vite build",
```

and update:

```json
    "serve": "node tools/ensure-dev-stack.mjs && php -S 127.0.0.1:8090 -t app",
```

to:

```json
    "serve": "node tools/ensure-dev-stack.mjs && npm run build:assets && php -S 127.0.0.1:8090 -t app",
```

and update:

```json
    "check": "npm run lint:php && npm run test:php && npm run lint:js && npm run lint:css && npm run format:check && npm run guard",
```

to:

```json
    "check": "npm run build:assets && npm run lint:php && npm run test:php && npm run lint:js && npm run lint:css && npm run format:check && npm run guard",
```

(`tools/build.mjs` keeps its own direct `npx vite build` call from Task 10 rather than shelling out to `npm run build:assets` — avoids an `npm`-vs-`npm.cmd` cross-platform indirection inside the deploy-critical build script. `build:assets` exists as the single human-facing "just build the assets" command for `check`/`serve` and for manual use.)

- [ ] **Step 2: Verify `npm run serve` builds assets and serves correctly**

Run (background-friendly — start then curl, don't block):

```bash
npm run build:assets
```

Expected: exits 0, `app/assets/dist/.vite/manifest.json` exists.

- [ ] **Step 3: Update `app/.htaccess`'s cache policy for the now-hashed JS/CSS output**

Every surviving `.css`/`.js` file under `public/assets/` is now Vite's content-hashed `dist/` output (Task 10 prunes the old unhashed source) — a given hashed filename's content never changes, only the filename does when content changes, so it's safe to cache far in the future instead of revalidating every request. `.html` isn't hashed (still dynamically rendered), so it keeps the existing revalidate policy.

Replace:

```apache
<IfModule mod_headers.c>
  <FilesMatch "\.(html|css|js)$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
</IfModule>
```

with:

```apache
<IfModule mod_headers.c>
  <FilesMatch "\.html$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
  # Vite's build output (see App\Assets) is content-hashed: a given
  # filename's bytes never change, only the filename does when the
  # content does. Safe to cache indefinitely instead of revalidating.
  <FilesMatch "\.(css|js)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
```

- [ ] **Step 4: Confirm `tools/build-overlays.mjs` picks up the change (it reads `app/.htaccess` directly)**

Run: `npm run build:overlay`
Expected: exits 0; `grep -A2 "FilesMatch" dist/overlay/prod/.htaccess` shows the new two-block cache policy.

Note for whoever deploys this: per `staging/README.md`, `.htaccess` is a server-owned file placed once per server and re-uploaded by hand only when it changes — this Task's `.htaccess` edit needs a manual `dist/overlay/<env>/.htaccess` re-upload to each existing TEST/QA/PROD server to take effect live (same process already documented for any other `app/.htaccess` change).

- [ ] **Step 5: Commit**

```bash
git add package.json app/.htaccess
git commit -m "build: wire vite build into check/serve; cache Vite's hashed output long-term"
```

---

### Task 12: Docker Compose watch service, docs, and final verification

**Files:**
- Modify: `docker-compose.yml`
- Modify: `CLAUDE.md`
- Modify: `app/assets/vendor/README.md` (already deleted in Task 6 — nothing to do here beyond confirming it's gone)

**Interfaces:** None (dev environment + docs only).

- [ ] **Step 1: Add an `assets` service to `docker-compose.yml`**

Add a new top-level service (after `vendor`, before `web`) and make `web` depend on it:

```yaml
  # Rebuilds app/assets/dist/ whenever a JS/CSS source file under app/assets/
  # changes, so `web` always serves real built output from disk — same code
  # path as production, no HMR/second port. First build takes a few seconds
  # after `up`; a request to web before it finishes may 404 on an asset tag
  # until the initial watch build completes (self-resolves on the next
  # request/refresh, unlike the one-shot `vendor`/`migrate` services this
  # can't block on completion since it runs forever).
  assets:
    image: node:20
    working_dir: /repo
    volumes:
      - .:/repo
      - node_modules:/repo/node_modules
    command: sh -c "npm ci && npx vite build --watch"
```

Update the `web` service's `depends_on` to add:

```yaml
    depends_on:
      vendor:
        condition: service_completed_successfully
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
      assets:
        condition: service_started
```

Add the new named volume alongside the existing ones:

```yaml
volumes:
  db_data:
  vendor:
  node_modules:
```

- [ ] **Step 2: Smoke-test the compose stack (only if Docker is available in this environment — skip with a note if not)**

Run: `docker compose up -d --build` then `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/`
Expected: `200` (may need a few seconds for the first `assets` build to finish — retry once if the first curl 404s on an asset tag).
Then: `docker compose down`

- [ ] **Step 3: Update `CLAUDE.md`'s Tech Stack section**

Replace:

```
- **Vanilla JS + CSS** under `app/assets/` — no bundler (a JS/CSS build
  pipeline is a separate, later roadmap item).
```

with:

```
- **Vanilla JS + CSS** under `app/assets/`, built by **Vite** (`vite.config.js`)
  into `app/assets/dist/` — one entry per currently-independent `<script>`/
  page-CSS file, ES modules (native `import`/`export`, no framework), with
  content-hashed output and a `manifest.json` that `App\Assets`
  (`app/src/Assets.php`) reads to emit the right `<script type="module">`/
  `<link rel="modulepreload">`/`<link rel="stylesheet">` tags — the one
  mechanism both `head.php`/`footer.php` and `layout.html.twig` use, instead
  of hardcoding asset paths. `bulma`, `i18next`, and `lucide` are npm
  devDependencies bundled in at build time (not vendored static files).
```

- [ ] **Step 4: Update `CLAUDE.md`'s Icons section**

Replace:

```
- **Icons:** [Lucide](https://lucide.dev), vendored at
  `app/assets/vendor/lucide.min.js` (see `app/assets/vendor/README.md`).
  Markup: `<i data-lucide="icon-name"></i>`, converted to inline `<svg>` by
  calling `lucide.createIcons()` — globally in `main.js`'s
  `DOMContentLoaded` handler, and again anywhere JS creates icon markup
  dynamically after that (e.g. `planning_repet.js`'s `loadEvents()` calls
  it again after every list rebuild, since the global `DOMContentLoaded`
  call only ever sees the page's initial markup).
```

with:

```
- **Icons:** [Lucide](https://lucide.dev), an npm devDependency bundled by
  Vite — the small fixed icon set actually used is centralized in
  `app/assets/js/icons.js` (`export const icons = { ExternalLink, Menu,
  Pencil, Trash2 }`; add a new icon there, not per call site). Markup:
  `<i data-lucide="icon-name"></i>`, converted to inline `<svg>` by calling
  `createIcons({ icons })` (imported from `'lucide'`) — in `main.js`'s
  `DOMContentLoaded` handler, and again anywhere JS creates icon markup
  dynamically after that (e.g. `planning_repet.js`'s `loadEvents()` calls
  it again after every list rebuild, since the global `DOMContentLoaded`
  call only ever sees the page's initial markup).
```

- [ ] **Step 5: Run the full local check suite**

Run: `npm run check`
Expected: exits 0 (now includes `build:assets` as its first step, per Task 11).

- [ ] **Step 6: Manual smoke test — start the dev server and check representative pages in a browser**

Run: `npm run serve` (or `docker compose up -d --build` if Docker is available), then visit:
- `/` (accueil) — confirms `main.js`'s nav/hamburger and the CSS bundle load with no console errors.
- `/planning_repet` as `demo.admin` — confirms the icon re-init path (`createIcons({ icons })` after `loadEvents()`) still renders the delete/edit icons on the admin event list, and `translateApiError`/`formatFrenchDate` still work (submit an invalid event to see a translated validation error).
- `/inscriptions_admin?id=<an-event-id>` — confirms `sinscrire.js`'s `Session`/`formatFrenchDate` usage still works on the inscriptions list page.
- `/signups_admin` (or wherever Bulma-styled admin content is reachable) — confirms the Bulma-via-npm styling renders identically to before.

Expected: no visual regression on any of the four pages, no browser console errors.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml CLAUDE.md
git commit -m "docs: update CLAUDE.md for the Vite build pipeline; add Docker Compose watch service"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage:** every numbered section of the approved spec (Vite config/entries §4, ES module conversion §5, vendored-libs-to-npm §6, `App\Assets` §7, template integration §8, `tools/build.mjs` §9, local dev workflow §10, testing §11, deployment impact §12) maps to a task above. The one item the spec explicitly left open ("resolved during implementation based on Vite's actual manifest shape" — §7) was resolved empirically during planning (see "Verified facts") rather than guessed.
- **One deliberate, justified addition beyond the spec's file list:** `app/assets/js/icons.js` (Task 2) and the `app/.htaccess` cache-policy change (Task 11). Neither contradicts the spec's non-goals (no visual/content change); both are implementation-level necessities the spec anticipated in spirit (§6's "and any icons needed"; §12's framing of hashed filenames as enabling correct cache invalidation, which requires an actual long-lived cache header to pay off).
- **Type/name consistency check:** `Assets::scriptTags(string $jsFile)` / `Assets::styleTag(string $cssFile)` are the only two public methods, used identically in Tasks 8 and 9 with no signature drift. `Session`, `formatFrenchDate`, `translateApiError`, `icons` — every import in Task 4 matches the exact export name/path defined in Tasks 2–3.
