# Working on this repo from a Claude Code web session

A web session is a cloud VM. `npm run dev` cannot bring up the compose stack
there, but the Laravel suite, Pint, the Scramble export, Vitest and Playwright
all run. Two things do not: Larastan (by choice, see §1) and anything that needs
Apache (§4).

```bash
npm run websession:init    # npm install, MariaDB, Composer, api/.env, APP_KEY
```

That command is idempotent and ends with `==> Dev stack ready.` Read the rest of
this page before concluding that something cannot run here, and before changing
an environment setting to make it run.

## 1. Composer

A plain `composer install` fails in a fresh web session with:

```
In AuthHelper.php line 132:
  Could not authenticate against github.com
```

No credential is wrong, and the network allowlist is not involved. GitHub
traffic goes through the session's GitHub proxy, which scopes the GitHub API to
the repositories attached to the session and answers 403 for every other one.
Every dist URL in `api/composer.lock` is an `api.github.com` zipball of a
third-party repository, so every download 403s, and Composer reports a 403 as
an authentication failure. Adding hosts to the allowlist or setting network
access to Trusted cannot help.

Git is not scoped that way, so the install goes over git. `npm run
websession:init` does this through `tools/ensure-dev-stack.sh`. By hand:

```bash
export COMPOSER_PROCESS_TIMEOUT=0
composer config --global use-github-api false
node tools/composer-websession.mjs api            # patches BOTH composer files
composer install --working-dir=api --prefer-source
```

Each step is needed:

1. **`use-github-api false`.** At its default, Composer turns a GitHub source
   back into an API zipball, so `--prefer-source` alone lands on the same 403.
2. **No static analysis.** `tools/composer-websession.mjs` removes
   `larastan/larastan` and `phpstan/phpstan` from `composer.json` and
   `composer.lock` (both, or `composer install` refuses because they disagree).
   phpstan publishes no source, so it cannot be installed over git, and since
   `composer install` is all or nothing, leaving it in fails every package and
   leaves no `vendor/autoload.php`. It is also 2.9 GB. `ensure-dev-stack.sh`
   restores both files afterwards; **never commit either edit.**
   `tools/composer-websession.test.mjs` checks that nothing else hard-requires
   either package, so removing them stays safe.
3. **`COMPOSER_PROCESS_TIMEOUT=0`.** Composer kills a child process after 300
   seconds, and parallel clones on a cold cache can exceed that.

What you give up: `npm run lint:types` prints that it is skipped and exits 0, so
`npm run check` can be green here without any PHP having been type-checked.
CI's `lint-api` job runs Larastan on every pull request.

Two things that look like the cause and are not: `GH_TOKEN` and `GITHUB_TOKEN`
read `proxy-injected`, which is the proxy's documented placeholder (Composer
reads neither), and rate limiting.

### Disk

A source install carries each package's full git history, and the peak is far
above a dist install: tens of gigabytes across `api/vendor` and Composer's VCS
mirror cache, against a fixed per-session disk allowance. Running out fails as
`fatal: ... write error. Out of diskspace` mid-clone, with no
`vendor/autoload.php`, which looks like the auth failure above. `ensure-dev-stack.sh`
strips `vendor/**/.git` and clears Composer's cache afterwards. **Do not fill the
disk with anything else first**, Docker images included. `df -h /` showing
`Avail` at 0 with low `Used` means the allowance is spent.

The autoloader prints `Ambiguous class resolution` warnings after a source
install, because packages ship their tests. They are harmless.

### One install at a time

Four tools install `api/vendor` when it is missing: `ensure-dev-stack.sh`,
`tools/pint.mjs` (which every `git commit` reaches through lint-staged),
`tools/phpstan.mjs` and `tools/openapi.mjs`. Here an install takes minutes, so
two overlapping is ordinary, and two writers sharing one vendor tree and one VCS
mirror end with no `vendor/autoload.php`.

They share a lock: a directory `.api-vendor-install.lock` at the repo root,
holding the owner's pid, implemented by `tools/api-vendor.mjs` and by the same
protocol in `ensure-dev-stack.sh`. A waiter re-checks and skips rather than
queueing a second install, and a lock whose holder has died is taken over. If a
run reports waiting on an install that is not happening, delete the lock
directory and try again.

## 2. The environment setup script

Provisioning belongs in the environment's Setup script, which runs once before
Claude starts and is snapshotted into the environment cache:

```bash
#!/bin/bash
set -x

# MariaDB. Ubuntu 24.04 ships 10.11; production is 10.3 (see §4).
DEBIAN_FRONTEND=noninteractive apt-get update -y || true
DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server || true

npm ci || true

# The three Composer steps from §1.
export COMPOSER_ALLOW_SUPERUSER=1
export COMPOSER_PROCESS_TIMEOUT=0
composer config --global use-github-api false || true
node tools/composer-websession.mjs api || true
composer install --working-dir=api --no-interaction --no-progress \
  --prefer-source || true
git checkout -- api/composer.json api/composer.lock || true
```

Keep every line `|| true`: a setup script that exits non-zero fails the session,
and it has about five minutes. That also hides a real failure, so if a session
starts without `api/vendor`, run `npm run websession:init` and read its output.

The snapshot keeps files, not processes. MariaDB has to be started in each
session, which `npm run websession:init` does.

## 3. In a session

| Command | Notes |
| --- | --- |
| `npm run check` | Everything but Larastan, which is skipped (§1) |
| `npm run test:api` | The Laravel suite, run natively |
| `npm run test:e2e` | Needs `PW_CHROMIUM_PATH`, below |
| `npm run openapi && npm run generate:api` | Needs `api/vendor` |

**Playwright.** `npm run test:e2e` fails out of the box with `Executable
doesn't exist at /opt/pw-browsers/chromium_headless_shell-<n>/...` and tells you
to run `npx playwright install`. Don't: the download is blocked, and a browser
is installed, at whatever revision the image was built with rather than the one
`@playwright/test` pins. Point at the one that is there:

```bash
ls /opt/pw-browsers
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-<n>/chrome-linux/chrome npm run test:e2e
```

Use the full `chromium-<n>` binary, not the `chromium_headless_shell-<n>` tree.
`playwright.config.ts` passes the variable to `launchOptions.executablePath`
only when it is set, so CI is unaffected.

**The Laravel suite.** `tools/phpunit.mjs` runs it inside the compose `php`
service when the stack is up and natively otherwise, which here is always.
The native branch exports `DB_HOST=127.0.0.1`, because `api/phpunit.xml` pins
`DB_HOST=db`, the compose service name. PHPUnit does not overwrite a variable
that is already set, so the committed `phpunit.xml` needs no edit.

**`npm install` rewrites `package-lock.json` here.** The image's npm 10 strips
the `libc` fields that npm 11 wrote on optional platform packages. Discard the
change (`git checkout -- package-lock.json`) rather than committing it.

## 4. Docker, and what this stack is not

Docker is installed but no daemon is running. One starts in about a second:

```bash
nohup dockerd >/tmp/dockerd.log 2>&1 &
```

That gives you `mariadb:10.3`, production's version, which the native stack
cannot. Two things stand between it and `npm run dev`:

- **Image pulls need a registry mirror.** Docker Hub serves blobs from
  `production.cloudfront.docker.com`, which is refused (the allowlist names
  `production.cloudflare.docker.com`). Set `/etc/docker/daemon.json` to
  `{"registry-mirrors": ["https://mirror.gcr.io"]}` and all of this repo's
  images pull.
- **The `web` image cannot be built.** `docker/web/Dockerfile` installs Apache
  from Debian's archives, and no Debian mirror is reachable from the session.

So there is no `:8090` parity stack: `npm run smoke`, the `.htaccess` dispatch,
the SPA fallback and the authorization boundary around `_api/` need a real
Docker host.

Also:

- **The native MariaDB is 10.11, production is 10.3.** A migration that leans on
  10.11 syntax passes here and fails on the host. Run anything schema-shaped
  against the `mariadb:10.3` container before it ships.
- **No Mailpit and no DbGate.** Read the database with `sudo mysql`.
- **The agent proxy answers 405 to plain HTTP for every host.** Passing
  `http_proxy`/`https_proxy` into a `docker build` makes apt fail worse.
