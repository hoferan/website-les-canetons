# Twig Templating for Shared Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the shared PHP-partials layout (`head.php` + `banner.php` +
`navigation.php` + `footer.php`) into one Twig base layout, and prove it works
end-to-end by rendering `/404` through it — with every other page untouched.

**Architecture:** A new `App\View` class owns a single `Twig\Environment`
(filesystem loader over `app/templates/`, no disk cache) and exposes one
static entry point, `View::renderPage(...)`, that assembles the shared
context (session role, env ribbon, nav active-state, the souper-signup
popup) the same way `head.php`/`footer.php`/`navigation.php` do today, then
renders a template that extends `layout.html.twig`. The front controller's
404 branch is the only caller for now.

**Tech Stack:** PHP 8.4, `twig/twig` (new Composer runtime dependency),
PHPUnit (existing).

## Global Constraints

- PHP 8.4, matching production (per `composer.json`'s `"php": ">=8.4"`).
- `twig/twig` goes in `composer.json`'s `require` block (not `require-dev`) —
  it must survive `tools/build.mjs`'s `composer install --no-dev` since it's a
  runtime dependency of `public/`.
- Twig's compiled-template cache is disabled (`cache => false`) — no writable
  directory on the FTP/shared-hosting deploy target, no cache directory to
  manage across deploys.
- Template source lives at `app/templates/`, files named `*.html.twig`.
- No visual or content changes: `layout.html.twig` must reproduce
  `head.php`/`banner.php`/`navigation.php`/`footer.php`'s markup exactly,
  including the souper-signup popup footer.php currently renders
  conditionally (`Features::enabled('souper_signup') && !Auth::canViewSummary()`).
- Every page other than `/404` keeps rendering via the existing PHP partials
  chain, unchanged, until its own Phase 2 issue converts it.
- Run `npm run check` before the final commit (project convention).

---

### Task 1: Add the Twig dependency

**Files:**
- Modify: `composer.json`, `composer.lock` (both updated by `composer require`)

**Interfaces:**
- Produces: `Twig\Environment`, `Twig\Loader\FilesystemLoader` classes
  autoloadable via `vendor/autoload.php`, consumed by Task 2's `App\View`.

- [ ] **Step 1: Set up the dev environment (first time in this session only)**

Run: `npm run websession:init`
Expected: installs npm deps, installs PHP deps into `vendor/`, provisions a
native MariaDB and writes `app/config.php` (idempotent — skip if it already
ran earlier this session; check with `ls app/config.php`).

- [ ] **Step 2: Add twig/twig as a runtime dependency**

Run: `node tools/composer.mjs require twig/twig:^3.0 --no-interaction`
Expected: composer resolves and installs `twig/twig` (and its `symfony/*`
polyfill dependencies), updates `composer.json`'s `require` block and
`composer.lock`, prints "Generating autoload files".

- [ ] **Step 3: Verify Twig is autoloadable**

Run: `php -r "require 'vendor/autoload.php'; var_dump(class_exists(Twig\Environment::class));"`
Expected: `bool(true)`

- [ ] **Step 4: Verify nothing else broke**

Run: `npm run lint:php`
Expected: `php -l: OK` and a clean PHPCS run (exit 0).

- [ ] **Step 5: Commit**

```bash
git add composer.json composer.lock
git commit -m "build(deps): add twig/twig for shared-layout templating (#3)"
```

---

### Task 2: Build the Twig base layout, the 404 template, and `App\View`

**Files:**
- Create: `app/templates/layout.html.twig`
- Create: `app/templates/404.html.twig`
- Create: `app/src/View.php`
- Test: `tests/Unit/ViewTest.php`

**Interfaces:**
- Consumes: `App\Auth::role()`, `App\Auth::canViewSummary()`, `App\Env::isProd()`,
  `App\Env::current()`, `App\Env::ribbonLabel()`, `App\Features::enabled(string): bool`,
  `App\Repositories\SignupRepository::OCCASIONS`,
  `App\Repositories\SignupRepository::ACTIVE_OCCASION` — all existing, unchanged.
- Produces: `App\View::renderPage(string $template, string $pageTitle, string
  $pageCss, array $pageScripts, string $currentRoute): void` — echoes rendered
  HTML. Consumed by Task 3's front-controller change.

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/ViewTest.php`:

```php
<?php

use App\Env;
use App\Features;
use PHPUnit\Framework\TestCase;

final class ViewTest extends TestCase
{
    protected function setUp(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
    }

    private function render(string $template, string $currentRoute = '404'): string
    {
        ob_start();
        \App\View::renderPage($template, 'Test Title', 'test.css', [], $currentRoute);
        return (string) ob_get_clean();
    }

    public function testPageTitleAndCssRender(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('<title>Test Title</title>', $html);
        $this->assertStringContainsString('assets/css/test.css', $html);
    }

    public function testSessionRoleNullWhenLoggedOut(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('window.__sessionRole = null;', $html);
    }

    public function testSessionRoleReflectsLoggedInUser(): void
    {
        $_SESSION['user'] = ['username' => 'demo.admin', 'role' => 'admin'];
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('window.__sessionRole = "admin";', $html);
    }

    public function testProdEnvironmentRendersNoRibbon(): void
    {
        Env::init('prod');
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('env-ribbon', $html);
    }

    public function testTestEnvironmentRendersTestRibbon(): void
    {
        Env::init('test');
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('env-ribbon-test', $html);
        $this->assertStringContainsString('TEST', $html);
    }

    public function testFourOhFourContentRenders(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('Page introuvable', $html);
        $this->assertStringContainsString('Retour', $html);
    }

    public function testNoNavItemIsActiveForFourOhFourRoute(): void
    {
        $html = $this->render('404.html.twig', '404');
        $this->assertStringNotContainsString('class="active"', $html);
    }

    public function testSignupPopupHiddenWhenFeatureDisabled(): void
    {
        Features::init(['souper_signup' => false]);
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('supper-popup', $html);
    }

    public function testSignupPopupRendersForGuestWhenFeatureEnabled(): void
    {
        Features::init(['souper_signup' => true]);
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('id="supper-popup"', $html);
        $this->assertStringContainsString('Souper des 25 ans des Canetons', $html);
    }

    public function testSignupPopupHiddenForAdminEvenWhenFeatureEnabled(): void
    {
        Features::init(['souper_signup' => true]);
        $_SESSION['user'] = ['username' => 'demo.admin', 'role' => 'admin'];
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('supper-popup', $html);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/ViewTest.php`
Expected: FAIL — `Class "App\View" not found` (or a Twig loader error, since
neither `App\View` nor the templates exist yet).

- [ ] **Step 3: Create the base layout template**

Create `app/templates/layout.html.twig`:

```twig
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ page_title }}</title>
    <link rel="icon" href="/assets/icons/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="/assets/icons/48.png">
    <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
    <link rel="manifest" href="/assets/icons/manifest.json" crossorigin="use-credentials">
    <meta name="theme-color" content="#e0201a">
    <link rel="stylesheet" href="assets/css/{{ page_css }}">
    <script>window.__sessionRole = {{ session_role_json|raw }};</script>
</head>
<body>
{% if not env_is_prod %}
<div class="env-ribbon env-ribbon-{{ env_current }}" aria-hidden="true">
  {{ env_ribbon_label }}
</div>
{% endif %}
<header>
<div class="header-container">
  <img src="assets/img/Les_Canetons_Fribourg_logo_2.jpg" alt="Logo" />
  <h1>Guggenmusik Les Canetons de Fribourg</h1>
  <button id="login-btn">Login</button>
</div>
{% set current_route = current_route in ['inscriptions_admin', 'inscriptions_utilisateurs'] ? 'sinscrire' : current_route %}
<nav class="nav">
  <button
    type="button"
    class="nav-toggle"
    aria-label="Menu de navigation"
    aria-expanded="false"
    aria-controls="nav-menu"
  >
    <i data-lucide="menu" class="icon-md icon-block"></i>
  </button>
  <ul id="nav-menu">
    <li class="{{ current_route == '' ? 'active' : '' }}"><a href="/">Accueil</a></li>
    <li class="{{ current_route == 'commencement' ? 'active' : '' }}"><a href="/commencement">Commencer les Canetons</a></li>
    <li class="{{ current_route == 'comite_teamdirection' ? 'active' : '' }}"><a href="/comite_teamdirection">Contact Canetons</a></li>
    <li class="{{ current_route == 'canetons' ? 'active' : '' }}"><a href="/canetons">Les canetons</a></li>
    <li class="{{ current_route == 'moniteurs' ? 'active' : '' }}"><a href="/moniteurs">Moniteurs</a></li>
    <li class="{{ current_route == 'planning_repet' ? 'active' : '' }}"><a href="/planning_repet">Planning et répétitions</a></li>
    <li class="{{ current_route == 'sinscrire' ? 'active' : '' }}"><a href="/sinscrire">Inscriptions</a></li>
    <li class="{{ current_route == 'cd' ? 'active' : '' }}"><a href="/cd">CD</a></li>
    <li class="{{ current_route == 'sponsors' ? 'active' : '' }}"><a href="/sponsors">Sponsors et liens amis</a></li>
    <li class="{{ current_route == 'historique' ? 'active' : '' }}"><a href="/historique">Historique</a></li>
    <li><a
      href="https://www.flickr.com/photos/201962767@N02/collections"
      id="galerie-link"
      target="_blank"
    >Galerie <i data-lucide="external-link" class="icon-sm icon-inline"></i></a></li>
    <li class="{{ current_route == 'multimedia' ? 'active' : '' }}"><a href="/multimedia">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>

{% block content %}{% endblock %}

<footer>
  <p class="footer-copyright">&copy; 2026 Guggenmusik les canetons de Fribourg Tous droits réservés.</p>
</footer>

{% if show_signup_popup %}
<div
  id="supper-popup"
  class="popup-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="{{ popup_occasion.title }}"
>
  <div class="popup-box">
    <button type="button" class="popup-close" aria-label="Fermer">✕</button>
    <div class="popup-banner">
      <div class="popup-duck">🦆🎉</div>
      <h3>{{ popup_occasion.title }}</h3>
      <p class="popup-subtitle">{{ popup_occasion.subtitle }}</p>
      <p class="popup-date">{{ popup_occasion.date_display }}</p>
    </div>
    <div class="popup-body">
      <p>{{ popup_occasion.teaser }}</p>
      <p>{{ popup_occasion.invitation }}</p>
      <a class="popup-cta" href="/signup">S'inscrire au souper</a>
      <button type="button" class="popup-dismiss">Non merci, ne plus afficher</button>
    </div>
  </div>
</div>
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
</body>
</html>
```

- [ ] **Step 4: Create the 404 template**

Create `app/templates/404.html.twig`:

```twig
{% extends 'layout.html.twig' %}
{% block content %}
<section class="notfound-section">
  <p class="notfound-code">404</p>
  <h2>Page introuvable</h2>
  <p class="notfound-text">
    Oups&nbsp;! La page que vous recherchez n’existe pas ou a été déplacée.
  </p>
  <a class="notfound-home" href="/">Retour à l’accueil</a>
</section>
{% endblock %}
```

- [ ] **Step 5: Create `App\View`**

Create `app/src/View.php`:

```php
<?php

namespace App;

use App\Repositories\SignupRepository;
use Twig\Environment;
use Twig\Loader\FilesystemLoader;

/**
 * Renders page templates through the shared Twig base layout
 * (templates/layout.html.twig). Assembles the same context
 * head.php/footer.php/navigation.php compute today — session role, env
 * ribbon, nav active-state, the souper-signup popup — so a template only
 * has to supply its own title/CSS/scripts/content.
 */
final class View
{
    private static ?Environment $twig = null;

    private static function twig(): Environment
    {
        if (self::$twig === null) {
            $loader = new FilesystemLoader(__DIR__ . '/../templates');
            // No disk cache (see plan's Global Constraints): no writable
            // directory to rely on on the FTP/shared-hosting deploy target.
            self::$twig = new Environment($loader, [
                'cache' => false,
                'debug' => !Env::isProd(),
            ]);
        }

        return self::$twig;
    }

    /** @param string[] $pageScripts */
    public static function renderPage(
        string $template,
        string $pageTitle,
        string $pageCss,
        array $pageScripts,
        string $currentRoute
    ): void {
        $showSignupPopup = Features::enabled('souper_signup') && !Auth::canViewSummary();

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
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/ViewTest.php`
Expected: `OK (10 tests, ...)`

- [ ] **Step 7: Lint the new PHP file**

Run: `npm run lint:php`
Expected: `php -l: OK` and a clean PHPCS run.

- [ ] **Step 8: Commit**

```bash
git add app/templates/layout.html.twig app/templates/404.html.twig app/src/View.php tests/Unit/ViewTest.php
git commit -m "feat(templates): add Twig base layout, 404 template, and App\\View (#3)"
```

---

### Task 3: Wire the front controller's 404 branch to Twig, retire the old partial-based 404 page

**Files:**
- Modify: `app/index.php:14-17`
- Delete: `app/pages/404.php`

**Interfaces:**
- Consumes: `App\View::renderPage(...)` from Task 2.

- [ ] **Step 1: Update the front controller's NOT_FOUND branch**

In `app/index.php`, replace:

```php
    case Dispatcher::NOT_FOUND:
        http_response_code(404);
        require __DIR__ . '/pages/404.php';
        break;
```

with:

```php
    case Dispatcher::NOT_FOUND:
        http_response_code(404);
        \App\View::renderPage('404.html.twig', 'Page introuvable', '404.css', [], '404');
        break;
```

- [ ] **Step 2: Delete the now-superseded 404 page**

Run: `git rm app/pages/404.php`

- [ ] **Step 3: Confirm the route table is unaffected**

Run: `vendor/bin/phpunit tests/Unit/RoutesTest.php`
Expected: `OK (3 tests, ...)` — 404 is the dispatcher's built-in fallback, not
a registered route, so this suite needs no changes and must still pass
unchanged.

- [ ] **Step 4: Manually verify the real request path**

Run: `npm run serve` (in one terminal), then in another:
`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/this-page-does-not-exist`
Expected: `404`

Then: `curl -s http://127.0.0.1:8090/this-page-does-not-exist | grep -o 'Page introuvable'`
Expected: `Page introuvable`

Stop the `npm run serve` process (Ctrl+C) once confirmed.

- [ ] **Step 5: Run the full check suite**

Run: `npm run check`
Expected: all of `lint:php`, `test:php`, `lint:js`, `lint:css`,
`format:check`, `guard` pass.

- [ ] **Step 6: Commit**

```bash
git add app/index.php app/pages/404.php
git commit -m "feat(routing): render 404 through the new Twig layout (#3)"
```
