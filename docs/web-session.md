# Working on this repo from a Claude Code web session

A web session is a cloud VM with no Docker daemon, so `npm run dev` cannot
bring up the compose stack. Everything else works — including the Laravel
suite, Pint, Larastan and the Scramble export — provided the environment is
configured. This page is how to configure it once, and what to do in a session
that lands in an environment nobody has configured yet.

Read this before concluding that something "cannot run in a web session". That
claim was in `CLAUDE.md` for a while and it was wrong; it cost a session most of
a day and shipped a pull request with three declared verification gaps that all
turned out to be the same misconfiguration.

## 1. Network access — the part that actually matters

Composer reads package metadata from `repo.packagist.org` and then downloads
each package's **`dist`** archive from **`api.github.com`**. Both hosts are in
the **Trusted** allowlist, so on Trusted everything works with no further
setup.

The failure mode worth recognising is an environment on **Custom** whose list
has packagist but not GitHub's archive hosts. That is the worst combination,
because resolution succeeds and every single download then answers `403`:

```
Failed to download phpstan/phpstan from dist: Could not authenticate against github.com
```

"Could not authenticate" is misleading. Nothing is wrong with your credentials;
the proxy refused the host, and Composer reports a policy denial the same way it
reports an auth failure.

Set **Network access** to **Trusted**, or — if the environment has to stay on
**Custom** — add these three:

```text
api.github.com
codeload.github.com
objects.githubusercontent.com
```

Note that **git to `github.com` keeps working regardless**, because git traffic
goes through the session's GitHub proxy rather than the network allowlist. That
is exactly why the failure is confusing: `git clone` and `git push` are fine
while `composer install` cannot fetch a single package.

### Why `--prefer-source` is only a partial answer

`tools/ensure-dev-stack.sh` retries with `--prefer-source`, which clones each
package from git and so rides the GitHub proxy. It is a documented Composer
mode, not a trick, and it gets 120 of this repo's 121 packages.

It does not get **`phpstan/phpstan`**, which publishes no `source` in
`composer.lock` — dist only. It arrives transitively through `larastan/larastan`
(the repo requires larastan, never phpstan directly), and larastan genuinely
requires it, so it cannot simply be dropped. One dist-only package is enough to
fail the whole install, because `composer install` is all-or-nothing.

So `--prefer-source` buys a working install only if that package is already in
Composer's cache. Fix the allowlist instead.

### How the wider PHP world solves this

The ecosystem answer to "our network cannot reach GitHub's archive hosts" is to
put a mirror you control in between — [Private
Packagist](https://blog.packagist.com/closing-composers-download-fallback-paths-in-private-packagist/),
[Satis](https://github.com/composer/satis), Packeton, Nexus or Artifactory —
which re-hosts the dist zips on a host your network does allow. That is the
right answer when you own the network and cannot change it.

Here we do own the allowlist and can change it in one field, so a mirror would
be infrastructure bought to work around a checkbox.

## 2. The environment setup script

Provisioning belongs in the environment's **Setup script**, which runs once
before Claude starts and is then snapshotted into the environment cache, so
later sessions start with it already done.

```bash
#!/bin/bash
set -x

# MariaDB. Ubuntu 24.04 ships 10.11; docker-compose.yml and production both
# pin 10.3. Fine for everything this repo does, but see the note below.
DEBIAN_FRONTEND=noninteractive apt-get update -y || true
DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server || true

# Dependencies. Both are cached into the snapshot, which is the whole point:
# a session starts with them on disk instead of spending minutes installing.
export COMPOSER_ALLOW_SUPERUSER=1
composer install --working-dir=api --no-interaction --no-progress || true
npm ci || true
```

Keep every line `|| true`: a setup script that exits non-zero fails the whole
session, and the script has to finish inside roughly five minutes.

**The snapshot keeps files, not processes.** A MariaDB the setup script started
is gone by the time a session runs; only the installed packages survive. Start
the daemon per session — a `SessionStart` hook is the right home, or just run
`npm run websession:init`, which is idempotent and will skip the work the
snapshot already did.

## 3. In a session

```bash
npm run websession:init    # npm install, MariaDB, Composer, api/.env, APP_KEY
```

Idempotent, and a no-op when Docker is reachable. If the allowlist is wrong it
stops with the host list from §1 rather than leaving a half-built stack.

Then:

| Command | Notes |
| --- | --- |
| `npm run check` | Full suite, `lint:api` and `lint:types` included |
| `npm run test:api` | The Laravel suite — see below |
| `npm run test:e2e` | Playwright against the mocked backend |
| `npm run openapi && npm run generate:api` | Needs Scramble, so needs `api/vendor` |

`npm run test:api` (`tools/phpunit.mjs`) runs the suite inside the compose
`web` service when the stack is up, and natively otherwise. The native branch
exports `DB_HOST=127.0.0.1`, because `api/phpunit.xml` pins `DB_HOST=db` — the
compose service name, which resolves inside the stack and nowhere else. PHPUnit
does not overwrite a variable that is already set, so one export is the whole
difference; the committed `phpunit.xml` needs no profile and no edit.

## 4. What this stack is not

- **MariaDB is 10.11, production is 10.3.** Everything here stays well inside
  both, but a migration leaning on 10.11 syntax would pass in a web session and
  fail on the host. Run anything schema-shaped in Docker before it ships.
- **There is no `:8090` parity stack**, so `npm run smoke` and any Apache
  behaviour — the `.htaccess` dispatch, the SPA fallback, the authorization
  boundary around `_api/` — cannot be exercised here at all. Those want Docker.
- **No Mailpit and no DbGate.** Read the database with `sudo mysql`.
- **`--prefer-source` installs carry each package's test files**, so the
  autoloader prints `Ambiguous class resolution` warnings. Harmless, and absent
  once the allowlist lets dist archives through.
