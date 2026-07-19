# Les Canetons de Fribourg — Website

[![CI](https://github.com/hoferan/website-les-canetons/actions/workflows/ci.yml/badge.svg)](https://github.com/hoferan/website-les-canetons/actions/workflows/ci.yml)

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
- Hosted on `easy-hebergement.net` shared hosting; deployed by **manual FTP**
  of the built `public/` directory (`npm run build`).

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

| Username | Role |
|----------|------|
| `demo.admin` | admin (manage events, view summaries) |
| `demo.moderator` | moderator (respond) |
| `demo.user` | user (respond) |

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

```bash
npm run build
```

Upload the contents of the generated `public/` directory to the host via FTP/SFTP.
`public/` is regenerated fresh on every run — never edit it by hand. When
syncing, keep the server's existing `config.php` in place (exclude it from the
upload, or maintain a separate local prod-values copy of `app/config.php` used
only for from-scratch deploys) — `npm run build` will happily copy whatever
local `app/config.php` you have, which is a dev convenience, not a production
config source.
