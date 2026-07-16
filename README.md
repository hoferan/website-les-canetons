# Les Canetons de Fribourg — Website

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**,
a Fribourg carnival brass band. Public pages present the band (history, sections,
committee, sponsors, media, contact). A login-gated members' area lets members
respond to events (participate / not); the admin ("Team Direction") manages events
and views attendance summaries.

## Tech stack

- **PHP 8.1**, **buildless** — no framework, no bundler, no runtime dependencies.
- **MariaDB 10.3** via `mysqli`.
- **Vanilla JS + CSS** (no build step), served by **Apache** with `.htaccess`.
- Hosted on `easy-hebergement.net` shared hosting; deployed by **manual FTP** of `code/`.

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

Seeded test logins (synthetic data, all passwords `demo`):

| Username | Role |
|----------|------|
| `demo.admin` | admin (manage events, view summaries) |
| `demo.moderator` | moderator (respond) |
| `demo.user` | user (respond) |

Stop with `docker compose down`.

## Project structure

```
code/          The exact FTP deploy payload — pages, api/, assets/, partials/, src/, .htaccess
config/        Config templates (config.example.php) + local Docker config (config.docker.php)
docker/        Local dev stack (web Dockerfile, DB schema + synthetic seed)
tools/         Cross-platform dev scripts (Dockerized PHP lint, secret guard)
docs/          Design specs and implementation plans
.github/       CI workflow, PR & issue templates
```

`code/` contains **only** files that get deployed. All tooling lives at the repo root.

## Development

```bash
npm run check   # all checks: php -l + phpcs (PSR-12, Dockerized), eslint, stylelint, prettier, secret guard
npm run fix     # auto-fix
```

A Husky pre-commit hook lints staged files automatically. See **[CLAUDE.md](CLAUDE.md)**
for architecture details and conventions.

## Configuration

The real `code/config.php` holds DB credentials, is **git-ignored**, and is uploaded
via FTP. Create it locally with:

```bash
cp config/config.example.php code/config.php
```

Local Docker uses `config/config.docker.php` automatically (mounted into the container).

## Deployment

Buildless — upload the contents of `code/` to the host via FTP/SFTP. There is no build
step; JS/CSS are edited in place.
