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
  deploy artifact into `public/`; merges to `main` auto-deploy it to **TEST**
  via CI, then **QA** and **PROD** are manual-approval gates in the same CI run
  (GitHub Environment reviewers) that promote the exact same tested commit.

## Quick start (local dev)

Requires **Docker** and **Node** (PHP/Composer are not needed locally — the PHP
tooling runs in containers).

```bash
npm install          # dev tooling
npm run php:install  # PHP dev deps into vendor/ (Dockerized Composer; run once)
docker compose up -d --build
```

- Site: <http://localhost:8090>
- Adminer (DB UI): <http://localhost:8091>

The stack's one-shot `vendor` service installs the app's PHP deps into a shared volume
(with an autoload map flattened for the container) before `web` starts, so no host-side
`vendor/` is required to run the site.

Seeded test logins (synthetic data, all passwords `demo`):

| Username         | Role                                  |
| ---------------- | ------------------------------------- |
| `demo.admin`     | admin (manage events, view summaries) |
| `demo.moderator` | moderator (respond)                   |
| `demo.user`      | user (respond)                        |

Stop with `docker compose down`.

## Project structure

```
app/           Tracked source — pages/, api/, assets/, partials/, src/ (App\* classes), .htaccess
public/        Generated FTP deploy payload (npm run build). Git-ignored; never hand-edited.
config/        Config templates (config.example.php) + local Docker config (config.docker.php)
docker/        Local dev stack (web Dockerfile, DB schema + synthetic seed)
tools/         Cross-platform dev scripts (Dockerized PHP/Composer, build, secret guard)
docs/          Design specs and implementation plans
.github/       CI workflow, PR & issue templates
```

`app/` is the source you edit. `public/` is what actually gets deployed — always
rebuild it (`npm run build`) before an FTP upload.

## Development

```bash
npm run check   # all checks: php -l + phpcs (PSR-12, Dockerized), eslint, stylelint, prettier, secret guard
npm run fix     # auto-fix
```

A Husky pre-commit hook lints staged files automatically. See **[CLAUDE.md](CLAUDE.md)**
for architecture details and conventions.

## Configuration

The real `app/config.php` holds DB credentials and is **git-ignored**. Create it
locally with:

```bash
cp config/config.example.php app/config.php
```

Local Docker uses `config/config.docker.php` automatically (mounted into the container).

## Deployment

Deploys run entirely in CI as one pipeline (`.github/workflows/ci.yml`):

```
php,tests,assets,guard,build ─→ deploy-test ─→ deploy-qa ─→ deploy-prod
                                 (auto)         (gated)       (gated)
```

- **TEST** deploys automatically on every merge to `main`, once all checks pass.
- **QA** and **PROD** are manual gates: the run pauses at each until a maintainer
  approves it (GitHub → the run → "Review deployments"). Because it is one run on
  one commit, QA and PROD receive the exact bytes tested on TEST.
- Each deploy writes a `deployment.json` to the site root recording the deployed
  commit, ref, and time — e.g. `https://<prod-host>/deployment.json` — so you can
  always see what is live where. Per-env status is also on the badges above.

The server-owned files (`.htaccess`, `robots.txt`, `config.php`) are never
uploaded, so promotion never touches a server's config. For the full server
layout, the access-control overlay, and manual/WinSCP fallbacks, see
[staging/README.md](staging/README.md).

To build the artifact locally without deploying:

```bash
npm run build   # -> public/ (regenerated fresh; never edit by hand)
```
