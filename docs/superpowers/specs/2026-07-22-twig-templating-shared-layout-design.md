# Twig Templating for Shared Layout — Design

**Date:** 2026-07-22
**Status:** Approved (pending spec review)
**Scope:** GitHub issue #3. Phase 0 (Foundations), roadmap item 2 of
`docs/superpowers/specs/2026-07-16-2026-modernization-roadmap-design.md`. Introduces
Twig, converts the four shared layout partials (`head.php`, `banner.php`,
`navigation.php`, `footer.php`) into one Twig base layout, and proves it end-to-end
by converting the 404 page onto it. No other page's content is touched — that is
Phase 2 (issues #8–#11).

## 1. Context

Today every page under `app/pages/*.php` manually `require`s
`app/partials/head.php`, which itself pulls in `env_banner.php`; each page also
separately `require`s `banner.php`, `navigation.php`, and — after its own
content — `footer.php`. There is no template inheritance: shared markup changes
require editing every page's `require` chain (or, more precisely, editing the
shared partial and trusting every page includes it consistently). The
routing-layer design (`2026-07-17-routing-layer-design.md`) deliberately left this
untouched ("No Twig / templating changes — pages keep their current
`require`-based rendering. Twig conversion is the next roadmap issue and depends
on this one.").

This design also settles a scoping question the issue text leaves implicit: it
would be possible to build the Twig base layout and never actually render
anything through it until Phase 2 lands. That was rejected during brainstorming —
shipping unexercised templating infrastructure defers all proof it works to a
much later issue. Instead, this issue also converts `app/pages/404.php`, since it
is not claimed by any Phase 2 issue's page list and is simple enough (no forms,
no page-specific JS) to be a clean, low-risk proof that the full
layout→content→render pipeline works end-to-end through the real front
controller.

## 2. Goals / Non-Goals

**Goals**

1. Add `twig/twig` as a Composer runtime dependency.
2. A single Twig base layout (`app/templates/layout.html.twig`) that reproduces,
   markup-for-markup, what `head.php` + `banner.php` + `navigation.php` +
   `footer.php` render today — no visual or content change.
3. A small `App\View` class that owns the `Twig\Environment` and exposes one
   rendering entry point pages will call, now and in future Phase 2 migrations.
4. Convert `app/pages/404.php` to `app/templates/404.html.twig`, wired through
   the front controller's `Dispatcher::NOT_FOUND` branch, as the proof this all
   works end-to-end.

**Non-Goals**

- No other page (`accueil.php`, `contact.php`, `admin.php`, etc.) changes in this
  issue. All remaining pages keep rendering via the existing PHP partials chain
  until their own Phase 2 issue (#8, #9, #10, or #11) converts them.
- No visual/design changes — this is a mechanical port of existing markup onto
  Twig, not a redesign (that's #6/#7, later, after this issue).
- No Twig compiled-template disk cache (see §4) — no writable-directory
  dependency added to the FTP/shared-hosting deploy model.
- No reusable Twig macros/components — that is #7 (design-system-in-code),
  which explicitly depends on this issue for the underlying Twig setup.

## 3. Architecture

```
app/
  src/
    View.php              # NEW — owns the Twig\Environment, renders pages
  templates/               # NEW — Twig template source
    layout.html.twig        # NEW — base layout (replaces head/banner/nav/footer partials for its consumers)
    404.html.twig           # NEW — extends layout.html.twig, overrides `content`
  pages/
    404.php                 # DELETED — fully superseded by templates/404.html.twig
    accueil.php              # unchanged — still requires partials/head.php etc.
    ... (every other page)   # unchanged
  partials/
    head.php, banner.php, navigation.php, footer.php, env_banner.php
                             # unchanged — still required by every non-404 page
```

`composer.json`'s `require` block gains `"twig/twig": "^3.0"`. Not a
`require-dev`-only install: `twig/twig` must survive `composer install --no-dev`
in `tools/build.mjs`, since it's needed at runtime in `public/`.

## 4. `App\View`

A single class, `app/src/View.php`, PSR-4 autoloaded as `App\View`:

- Constructs one `Twig\Environment` (lazily, on first use) with:
  - `Twig\Loader\FilesystemLoader` pointed at `app/templates/`.
  - `cache => false`. Decided during brainstorming: this host has no confirmed
    writable directory reachable over FTP, no server-side Composer/SSH to
    manage a cache directory's lifecycle across deploys, and the traffic
    volume doesn't currently justify the added moving parts. Twig recompiles
    templates per-request; revisit only if profiling later shows this matters.
  - `debug => !Env::isProd()`.
  - `autoescape => 'html'` (Twig's default — matches the `htmlspecialchars()`
    escaping every partial does today).
- One public static method:

  ```php
  View::renderPage(
      string $template,
      string $pageTitle,
      string $pageCss,
      array $pageScripts,
      string $currentRoute,
  ): void
  ```

  It assembles the context every page needs (mirroring what `head.php`,
  `footer.php`, and `navigation.php` compute today) and echoes
  `$twig->render($template, $context)`:

  - `page_title`, `page_css`, `page_scripts` — passed straight through.
  - `session_role_json` — `json_encode(Auth::role())`, injected via `{{
    session_role_json|raw }}` into the same `<script>window.__sessionRole =
    ...;</script>` tag `head.php` emits today (`|raw` is safe here: the value is
    machine-generated JSON, not user input, matching today's direct `echo
    json_encode(...)`).
  - `env_is_prod`, `env_current`, `env_ribbon_label` — from `Env::isProd()`,
    `Env::current()`, `Env::ribbonLabel()`, feeding the same ribbon markup
    `env_banner.php` renders today (rendered inline in `layout.html.twig`
    rather than as a separate included partial — one file, same output).
  - `current_route` — passed through as-is; `navigation.php`'s existing
    `inscriptions_admin`/`inscriptions_utilisateurs` → `sinscrire` mapping is
    reproduced with a `{% set %}` at the top of the nav markup in
    `layout.html.twig`, in the same place that logic lives today.

No other public surface. Error handling is intentionally absent beyond what
Twig itself throws (`Twig\Error\LoaderError`, `Twig\Error\RuntimeError`, etc.) —
these are genuine programmer errors (a missing template file, a bad variable
reference) that should fail loudly, consistent with how the rest of the
codebase handles unexpected states.

## 5. `layout.html.twig`

One file, structurally: everything `head.php` renders (doctype, `<head>`,
favicons, manifest, the per-page stylesheet link, the session-role script tag)
down through `env_banner.php`, `banner.php`, `navigation.php`, then a single

```twig
{% block content %}{% endblock %}
```

then everything `footer.php` renders (the `<footer>`, the shared script tags in
their existing load order, any `page_scripts` loop) — no other blocks. A child
template only ever needs to override page content; title/CSS/scripts are data,
not something a child restructures, so they're plain context variables rather
than blocks.

## 6. 404 page

`app/templates/404.html.twig`:

```twig
{% extends 'layout.html.twig' %}
{% block content %}
  {# same markup app/pages/404.php's <section class="notfound-section"> has today #}
{% endblock %}
```

`app/index.php`'s `Dispatcher::NOT_FOUND` case changes from

```php
require __DIR__ . '/pages/404.php';
```

to

```php
View::renderPage('404.html.twig', 'Page introuvable', '404.css', [], '404');
```

`app/pages/404.php` is deleted — fully superseded, no other route references it.

## 7. Transitional duplication (expected, not a defect)

For the duration of Phase 2, the shared layout markup exists in two forms: the
original PHP partials (driving every page except `/404`) and
`layout.html.twig` (driving `/404`, then whichever pages Phase 2 converts next).
Both render from the same source markup as of this issue, so they stay visually
identical barring drift. The PHP partials are deleted once their last consumer
(the final Phase 2 migration) lands — no separate cleanup issue is needed for
that; it falls out naturally as `grep`-ing for their last `require` comes up
empty.

## 8. Testing

- `tests/Unit/ViewTest.php` (new): following `tests/Unit/EnvBannerTest.php`'s
  pattern, calls `View::renderPage('404.html.twig', ...)` and asserts on the
  returned/captured HTML string:
  - Env ribbon present/absent and correctly labeled under each of
    `Env::init('prod'|'test'|'qa'|'dev')` (same cases `EnvBannerTest` covers).
  - `page_title` appears in `<title>`; `page_css` appears in the stylesheet
    `<link>`.
  - The session-role `<script>` tag contains the expected JSON for a null and a
    non-null `Auth` role.
  - The 404 content block's copy (`Page introuvable`, the "retour à l'accueil"
    link) renders.
- `tests/Unit/RoutesTest.php`: no route-table change (404 is the dispatcher's
  built-in fallback, not a registered route), so no new case is strictly
  required; confirm the existing suite still passes unchanged.
- No Playwright/e2e coverage — out of scope (Phase 4, issue #14).

## 9. Deployment / build impact

- `npm run build`'s existing `composer install --no-dev` (in `tools/build.mjs`)
  picks up `twig/twig` automatically once it's a `require` dependency — no
  change to `build.mjs` needed.
- `app/templates/` is source, copied into `public/templates/` by the existing
  `cpSync('app', 'public', ...)` step — no change to `build.mjs` needed there
  either.
- No new writable directory, no new `.gitignore` entry (cache disabled, per
  §4).
