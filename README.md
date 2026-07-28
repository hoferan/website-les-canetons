# Les Canetons de Fribourg — Website

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**,
a Fribourg carnival brass band. Public pages present the band (history, sections,
committee, sponsors, media, contact). A login-gated members' area lets members
respond to events (participate / not); the admin ("Team Direction") manages events
and views attendance summaries, including per-instrument participant counts.

## Status: greenfield rebuild on WordPress

This repository is being rebuilt on WordPress. **Almost nothing is implemented
yet** — the design and the first implementation plan are written, and the build
starts from there.

The previous stack (a PHP front-controller app, a Laravel API, bespoke FTP deploy
tooling and three tag-promoted environments) was deliberately retired. It lives
on the [`archive/php-laravel-stack`](../../tree/archive/php-laravel-stack) branch
for historical reference.

| Read this | For |
| --- | --- |
| [The design](docs/superpowers/specs/2026-07-28-wordpress-migration-design.md) | Scope, architecture, data model, capability matrix, testing, deploy, cutover |
| [Plan 1 of 8](docs/superpowers/plans/2026-07-28-wordpress-foundation.md) | The foundation, step by step, plus the roadmap for plans 2–8 |

## Tech stack

- **WordPress 6.9**, **PHP 8.4**, **MariaDB 10.3** — matching the shared host.
- **One custom plugin** (`canetons-planning`): events, responses, attendance
  summary, roles and capabilities. The only substantial code here.
- **One theme** (`canetons`): child of Twenty Twenty-Five, design in
  `theme.json` and block patterns.
- **Five free plugins** for everything else: Fluent Forms, Members, FluentSMTP,
  UpdraftPlus, Limit Login Attempts Reloaded.
- No API, no SPA, no build step. Server-rendered, with WordPress nonces on writes.

## Local development

Requires Docker only — there are no npm dependencies to install.

```bash
npm run wp:dev       # start the stack
npm run wp:setup     # install WordPress (idempotent; run after wp:dev)
npm run wp:test      # both plugin suites
npm run wp:cli ...   # any WP-CLI command, e.g. npm run wp:cli user list
npm run wp:manifest  # refresh docs/wordpress-install-manifest.csv
npm run wp:down      # stop
npm run wp:reset     # stop AND destroy the database and core volume
```

| URL | What |
| --- | --- |
| http://localhost:8100 | the WordPress site (`admin` / `admin`) |
| http://localhost:8101 | phpMyAdmin — logged in automatically, no form |
| http://localhost:8026 | Mailpit — all outbound mail lands here |
| `localhost:3308` | MariaDB |

Two suites: `wp:test:unit` loads no WordPress at all (fast, and it forces the
interesting logic to stay pure), while `wp:test:integration` boots a real
WordPress against a throwaway `wordpress_test` database — the harness drops
every table in it, which is exactly why it is never pointed at the development
one.

**PHPUnit is pinned to 9.x deliberately.** WordPress's test harness calls
PHPUnit APIs that version 10 removed, and it declares no constraint of its own,
so Composer will silently install an incompatible release if the pin is
loosened. See the plugin's `composer.json`.

Running the raw `docker compose` commands by hand in Git Bash on Windows needs
`MSYS_NO_PATHCONV=1`, or `/var/www/html` is rewritten to a Windows path and
WP-CLI reports "not a WordPress installation". The `npm run` scripts are
unaffected — npm runs them through `cmd.exe`.

### Without Docker (Claude Code web sessions)

Web sessions have no running Docker daemon, and starting one there gets you no
bridge networking — so `docker compose up` cannot work
(`anthropics/claude-code#29515`). Start with:

```bash
bash tools/check-web-session.sh   # reports what this session can actually do
```

`npm run wp:test:unit` and `npm run wp:install` fall back to native PHP and
Composer automatically. **`npm run wp:test:integration` has no fallback and fails
loudly** — it needs real WordPress and MariaDB, and it is where capability
enforcement is verified, so a skipped run must never resemble a passing one.
Editing code, plans and docs works anywhere.

## What is tracked

`wp-content/themes/canetons/` and `wp-content/plugins/canetons-planning/` — at
the same paths they occupy on the server, and together the entire deploy
artifact.

WordPress core, third-party plugins, `wp-config.php` and `uploads/` are
server-owned: managed through wp-admin, never tracked, never deployed.

**So this repository is not a complete description of the site.** Content lives
in the database, and installed versions are recorded in
[the install manifest](docs/wordpress-install-manifest.csv). That is why
scheduled off-site backups are mandatory, not optional.

## Environments

TEST and PROD, both on `easy-hebergement.net` shared hosting (FTP only, no SSH).
TEST is entirely behind HTTP Basic Auth. Cutover to PROD is a hard switch;
rollback is redeploying the archive branch.
