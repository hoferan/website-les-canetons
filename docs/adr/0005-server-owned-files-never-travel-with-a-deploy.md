# 0005. Keep server-owned files out of every deploy

Status: Accepted, 2026-09-07

## Context

Some files differ per server and cannot ship in a shared artifact: the Basic Auth block
with its absolute `.htpasswd` path, `robots.txt`, and Laravel's `_api/.env` with its
secrets. One FTP account reaches every environment.

The deploy tool used to protect these by basename, at any depth. That silently dropped
`api/.htaccess` and `api/public/.htaccess`, the authorization boundary around the
Laravel tree (ADR 0003), from every upload for the whole life of the project. No server
ever had them until 2026-09-07.

## Decision

The protected set is a list of exact root-relative paths, `PROTECTED_PATHS` in
`tools/deploy/preflight.mjs`: `.htaccess`, `robots.txt`, `.htpasswd`, `config.php`,
`_api/.env`, and the tool's own `.sync-state.json`. A deploy never uploads and never
deletes them.

Each server gets them another way:

- `npm run build:overlay` generates `.htaccess` and `robots.txt` per environment into
  `dist/overlay/<env>/`, filling in the `.htpasswd` path from the git-ignored
  `.env.<env>`. `npm run put-overlay:<env>` places them, after backing up the live
  file.
- `_api/.env` is always placed by hand.

Before uploading, the deploy fetches the server's `_api/.env` and compares its set of
keys, never its values, with `api/.env.example`. A key missing on either side refuses
the deploy and names the keys. Each target also refuses unless its `FTP_DIR` matches
the environment's name.

## Consequences

Code that expects a new `.env` key fails that server's deploy instead of answering 500
on every request afterwards. The price is that every new key has to be hand-added on
every server before its next deploy. Optional settings therefore live in
`api/config/*.php` with defaults and never in `.env.example`.

Renaming `_api/` must be mirrored in `PROTECTED_PATHS`. If the `_api/.env` entry stops
matching, the next `--relist` classifies each server's API configuration as stale and
deletes it.

The overlay does not move with the code. Rolling back means redeploying a tag and, if
the template changed, placing the previous overlay too. Placing the new overlay on a
server still running the old site takes it down, so on QA and PROD the overlay and the
artifact move together, at the cutover.
