# Les Canetons de Fribourg — Website

[![CI](https://github.com/hoferan/website-les-canetons/actions/workflows/ci.yml/badge.svg)](https://github.com/hoferan/website-les-canetons/actions/workflows/ci.yml)
[![TEST](https://img.shields.io/github/deployments/hoferan/website-les-canetons/test?label=TEST)](https://github.com/hoferan/website-les-canetons/deployments)
[![QA](https://img.shields.io/github/deployments/hoferan/website-les-canetons/qa?label=QA)](https://github.com/hoferan/website-les-canetons/deployments)
[![PROD](https://img.shields.io/github/deployments/hoferan/website-les-canetons/prod?label=PROD)](https://github.com/hoferan/website-les-canetons/deployments)

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**,
a Fribourg carnival brass band. Public pages present the band (history, sections,
committee, sponsors, media, contact). A login-gated members' area lets members
respond to events (participate / not); the admin ("Team Direction") manages events
and views attendance summaries.

## Tech stack

- **PHP 8.4**, PSR-4 autoloaded `App\*` classes, routed through a single
  front controller (`nikic/fast-route`).
- **MariaDB 10.3** via `mysqli`.
- **Vanilla JS + CSS** (no bundler yet), served by **Apache** with `.htaccess`.
- Hosted on `easy-hebergement.net` shared hosting. `npm run build` assembles the
  deploy artifact into `dist/build/`; merges to `main` auto-deploy it to **TEST**
  via CI, while **QA** and **PROD** are promoted independently via tag-based
  `workflow_dispatch` workflows (see "Deployment" below).

## Quick start (local dev)

Requires **Docker** and **Node** (PHP/Composer are not needed locally — the PHP
tooling runs in containers).

```bash
npm install     # everything; there is no separate PHP install step
npm run dev     # generate the docker .htaccess overlay, then bring the stack up
npm run dev:web # Vite dev server on :5173 — where you actually work
```

**Never `docker compose up` directly** — the stack needs a generated overlay file in
place first, which `npm run dev` handles for you (see [CLAUDE.md](CLAUDE.md) for why).

| URL | What |
| --- | --- |
| http://localhost:5173 | Vite dev server (HMR), proxying `/api` to :8090 |
| http://localhost:8090 | Apache serving the **built** artifact — parity checks |
| http://localhost:8091 | Adminer (DB UI) |
| http://localhost:8025 | Mailpit (catches outgoing mail) |

The :8090 stack serves whatever `npm run build` last produced; it does not pick
up source edits. That is the point — it is the parity check.

Seeded test logins (synthetic data, all passwords `demo`; a fourth member,
Nadia Sansconnexion, is seeded with no account at all):

| Username         | What they can do                                                    |
| ---------------- | --------------------------------------------------------------------- |
| `demo.direction` | Holds the `direction` role: manage events, view/record attendance for others, manage members. No section, so not in any register. |
| `demo.player`    | Plays in Clarinettes (in the register, answers for events). Holds no role. |
| `demo.both`      | Plays in Trompettes **and** holds the `direction` role — both answers for events and manages them. |

```bash
npm run smoke     # HTTP smoke checks against the built artifact (13 checks)
npm run dev:down  # stop
```

## Project structure

```
web/           React + TypeScript SPA (Vite, Tailwind). The public site and members' area.
api/            Laravel 13 — the whole JSON API and the database schema. Its own Composer project.
dist/build/     Generated FTP deploy payload (npm run build). Git-ignored; never hand-edited.
config/htaccess/ The site .htaccess template, merged per environment by tools/build-overlays.mjs
docker/         Local dev stack (web Dockerfile, DB schema + synthetic seed)
tools/          Cross-platform dev scripts (build, deploy, secret guard)
docs/           Design specs and implementation plans
.github/        CI workflows, PR & issue templates
```

`web/` and `api/` are the source you edit. `dist/build/` is what gets deployed —
always rebuild it (`npm run build`) before an FTP upload.

## Development

```bash
npm run check   # typecheck, Pint, both test suites, eslint, stylelint, prettier, secret guard
npm run fix     # auto-fix
```

`npm run check` does not run the Laravel suite — it needs a live database:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

A Husky pre-commit hook lints staged files automatically. See **[CLAUDE.md](CLAUDE.md)**
for architecture details and conventions.

## Configuration

Laravel's `api/.env` holds the DB credentials, `APP_KEY` and the migrate token,
and is **git-ignored**. Local Docker mounts `docker/api/env.docker` in its place
automatically, so there is nothing to create for local dev. Each server's copy
is placed **by hand, once** — see [staging/README.md](staging/README.md); a
server without it 500s every `/api/*` request.

## Deployment

`ci.yml` auto-deploys **TEST** on every merge to `main`. **QA** and **PROD** are
promoted independently via tag-based `workflow_dispatch` workflows, not gated
approvals in that same run:

- **`Tag Release`** — dispatch once you've verified a commit on TEST; it tags
  that commit `YYYY-MM-DD-<short-sha>` (no-ops if already tagged).
- **`Deploy QA`** / **`Deploy PROD`** — dispatch either by picking a tag from
  GitHub's native ref selector. `Deploy PROD` first checks, via the GitHub
  Deployments API, that its target commit was already successfully deployed to
  QA — refusing to proceed otherwise. Rolling back is redeploying an older tag;
  there is no separate rollback mechanism.
- Each deploy writes a `deployment.json` to the site root recording the deployed
  commit, ref, and time — e.g. `https://<prod-host>/deployment.json` — so you can
  always see what is live where. Per-env status is also on the badges above.

The server-owned files (`.htaccess`, `robots.txt`, `api-laravel/.env`) are never
uploaded, so promotion never touches a server's config. For the full server
layout, the access-control overlay, and manual/WinSCP fallbacks, see
[staging/README.md](staging/README.md).

To build the artifact locally without deploying:

```bash
npm run build   # -> dist/build/ (regenerated fresh; never edit by hand)
```
