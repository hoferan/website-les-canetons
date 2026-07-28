# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history,
sections, committee, sponsors, media, contact). A members' area, gated by login,
lets members respond to events (participate / not) and lets the admin ("Team
Direction") manage events and view attendance summaries, including per-instrument
participant counts.

## Current state: greenfield rebuild on WordPress

**There is almost no code in this repository yet, and that is expected.**

The site was previously a PHP front-controller app plus a Laravel API, with
bespoke FTP deploy tooling and three tag-promoted environments. That entire stack
was deliberately deleted in favour of a WordPress rebuild minimising custom code.
It is preserved on the **`archive/php-laravel-stack`** branch (pushed to
`origin`) — consult it for historical context, never as a pattern to follow.

Two documents are the source of truth, and you should read them before doing
anything substantive:

| Document | What it settles |
| --- | --- |
| `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` | The design: scope, architecture, data model, capability matrix, testing, deploy, cutover. §1 is the requirements inventory extracted from the old app and is the contract — a requirement absent from §1 is out of scope. |
| `docs/superpowers/plans/2026-07-28-wordpress-foundation.md` | Plan 1 of 8, in executable detail, plus the roadmap for plans 2–8. |

`docs/superpowers/` also holds the design history of the retired stack. Those
older specs describe an architecture that no longer exists.

## Tech Stack

- **WordPress 6.9** on **PHP 8.4** and **MariaDB 10.3** (matching the shared
  host). MariaDB 10.3 is end-of-life and below WordPress's recommended version;
  it is pinned for production parity, deliberately.
- **One custom plugin**, `canetons-planning`: events (custom post type),
  responses (custom table), the attendance summary, roles and capabilities. This
  is the only substantial code in the project.
- **One theme**, `canetons`: a child of Twenty Twenty-Five, with the design
  expressed in `theme.json` and block patterns rather than stylesheets.
- **Five free third-party plugins** cover everything else — contact form
  (Fluent Forms), roles and page gating (Members), SMTP (FluentSMTP), backups
  (UpdraftPlus), login hardening (Limit Login Attempts Reloaded). Installed and
  updated through wp-admin per environment, never deployed. See spec §4.
- **No API, no SPA, no build step.** The site is server-rendered. Browser writes
  are ordinary form posts protected by WordPress nonces.

## Repository layout

Only our own code is tracked, at the same paths it occupies on the server:

```
wp-content/themes/canetons/              the theme
wp-content/plugins/canetons-planning/    the plugin
docker-compose.yml                    local development stack
docker/wp/mu-plugins/                    local-only mail routing (never deployed)
tools/wp-setup.sh                        idempotent local WordPress install
docs/                                    specs, plans, install manifest
```

Those two `wp-content/` directories **are** the entire deploy artifact.

WordPress core, third-party plugins, `wp-config.php` and `uploads/` are
server-owned: installed and updated through wp-admin, never tracked, never
uploaded by a deploy.

**Therefore this repository is not a complete description of the site.** Content
lives in the database (authored directly in PROD), and installed versions are
recorded in `docs/wordpress-install-manifest.csv`, refreshed with
`npm run wp:manifest` after any update. This is the single biggest change from
the old stack, where `dist/build/` from git was everything that ran — and it is
why scheduled off-site backups are mandatory rather than optional (spec §11).

## Local Development

The stack does not exist yet — Plan 1 Task 1 creates it. Once it does:

```bash
npm run wp:dev      # start the stack
npm run wp:setup    # install WordPress (idempotent; run after wp:dev)
npm run wp:test     # both plugin suites
npm run wp:cli ...  # any WP-CLI command
npm run wp:down     # stop
npm run wp:reset    # stop AND destroy the database and core volume
```

There are **no npm dependencies**: every script is a thin Docker Compose
wrapper, so a clone needs only Docker. Nothing to `npm install`.

| URL | What |
| --- | --- |
| http://localhost:8100 | the WordPress site |
| http://localhost:8101 | phpMyAdmin — logged in automatically, no form |
| http://localhost:8026 | Mailpit — all outbound mail lands here |
| `localhost:3308` | MariaDB |

Tests run inside the `wp` container via `exec -w`; the official WordPress image
already has PHP 8.4 and `mysqli`, so there is no separate runner. The unit suite
loads no WordPress at all, which is what keeps the interesting logic pure.

## Environments

**TEST and PROD only** — QA was dropped as redundant at this size. Both are on
`easy-hebergement.net` shared hosting, FTP-only, no SSH and no server-side
Composer. TEST sits entirely behind HTTP Basic Auth (this host returns 500 on a
per-path exemption, so it is all-or-nothing, and that affects `wp-admin` there).

The old `.env.test` / `.env.qa` / `.env.prod` files are **kept**, git-ignored:
they hold the live FTP credentials the WordPress deploy will reuse.

Cutover to PROD is a hard switch — the old application is removed rather than
left running alongside. Rollback is redeploying `archive/php-laravel-stack`.
WordPress uses the `qsjd_` table prefix and the old tables have distinct names,
so the old data survives a cutover untouched.

## Superpowers Skills

This project ships with [Superpowers](https://github.com/obra/superpowers) skills
in `.claude/skills/`. Always use the `Skill` tool to invoke them — never read
skill files manually.

| Skill | When to use |
|-------|-------------|
| `brainstorming` | Before implementing any feature or change |
| `writing-plans` | When given a spec or multi-step task |
| `executing-plans` | When running an existing plan |
| `subagent-driven-development` | For parallel implementation tasks |
| `test-driven-development` | Before writing any implementation code |
| `systematic-debugging` | On any bug or test failure |
| `verification-before-completion` | Before claiming work is done |
| `requesting-code-review` | After completing a feature |
| `receiving-code-review` | When acting on review feedback |
| `finishing-a-development-branch` | When ready to integrate work |
| `dispatching-parallel-agents` | For 2+ independent tasks |
| `using-git-worktrees` | For isolated feature work |
| `writing-skills` | When creating or editing skills |
| `using-superpowers` | Use when starting any conversation |

## Pull Requests

- **Title format:** Conventional Commits — `type(scope): description` (scope
  optional). Enforced by CI (`.github/workflows/pr-title.yml`); a non-conforming
  title fails the check. Types: `feat`, `fix`, `chore`, `docs`, `build`, `ci`,
  `test`, `refactor`, `style`, `perf`.
- **Body:** use `.github/PULL_REQUEST_TEMPLATE.md` — fill in every section rather
  than leaving the placeholder comments unedited.

`pr-title.yml` is the only workflow left; the build, deploy and promotion
workflows went with the old stack. CI for the WordPress build is Plan 8's job.

## Language

- **Everything is written in English** — specs and plans, code, comments,
  identifiers, database table and column names, enum values, slugs, and file
  names.
- **French is used for ONE thing only: user-visible UI text** — page copy,
  labels, buttons, admin-screen headings, on-screen event titles.
- WordPress runs in the `fr_FR` locale, so core and plugin UI is French already.
  Our own user-visible strings are written as French literals directly, with
  English code and comments around them. There is deliberately **no translation
  layer** — the old stack computed French from machine tokens because an API sat
  in between; nothing does now.
- The retired schema already followed this and the rebuild keeps it:
  `contact_messages` used `first_name`/`last_name`, and responses used the
  English enum values `participate` / `notparticipate`, while page labels were
  French. Match that pattern.

## Dos

- Read the spec (§1 especially) before implementing anything.
- Follow the plans in order; each produces working, testable software.
- Keep custom code inside `canetons-planning`. Reach for an off-the-shelf plugin
  or a WordPress core mechanism first.
- Put pure logic in the plugin's `src/` so it can be unit-tested without
  WordPress.
- Keep everything in the activation path idempotent — WordPress fires it on every
  re-activation.
- Refresh `docs/wordpress-install-manifest.csv` after any core or plugin update.

## Don'ts

- Never commit `wp-config.php`, `.env.*`, `.htpasswd`, a database dump, or any
  real member data.
- Never track WordPress core or third-party plugins. A deploy would then revert
  wp-admin updates.
- Never grant `canetons_respond` to `canetons_direction` or `administrator`. The
  capability matrix is **not** a hierarchy — the Team Direction organises events
  but does not vote in them, and that is what makes the "Pas de réponse" count
  meaningful (spec §1.4, §3.4).
- Never copy a pattern from `archive/php-laravel-stack` because it exists there.
  That stack was retired on purpose.
