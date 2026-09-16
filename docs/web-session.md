# Working on this repo from a Claude Code web session

A web session is a cloud VM. `npm run dev` cannot bring up the compose stack
there, but **everything else works — including the Laravel suite, Pint, Larastan
and the Scramble export.** Measured 2026-09-15: `npm run test:api` green at
585 tests / 3885 assertions, `npm run check` green end to end.

This page is what makes that true, and what to do in a session that lands
somewhere it is not.

Read it before concluding that something "cannot run in a web session". That
claim was in `CLAUDE.md` for a while and it was wrong; it cost a session most of
a day and shipped a pull request with three declared verification gaps that all
turned out to be the same misconfiguration.

Read §1 before concluding the opposite, too. The **first** version of this page
blamed the network allowlist, which is not involved at all, and cost two more
sessions — one of them spent changing an environment setting that could never
have helped.

## 1. Composer, and the failure that looks like everything else

`composer install` fails in a fresh web session. The error names a credential:

```
In AuthHelper.php line 132:
  Could not authenticate against github.com
```

**Nothing is wrong with any credential, and nothing is wrong with the network
allowlist.** GitHub traffic does not travel through the session's egress
allowlist at all — it takes the session's **GitHub proxy**, which scopes the
GitHub **API** to the repositories *attached to the session*. Every other
repository answers 403:

```
api.github.com/repos/hoferan/website-les-canetons   200
api.github.com/repos/symfony/var-dumper             403
  {"message":"GitHub access to this repository is not enabled for this
   session. Use add_repo to request access."}
```

Every one of the 121 dist URLs in `api/composer.lock` is an `api.github.com`
zipball of a third-party repository. So **every** dist download 403s, Composer
reads 403 as "needs authentication", and reports it as the line above.

This is why adding hosts to a Custom allowlist does nothing, and why setting
Network access to **Trusted** does nothing either. Both were tried. The hosts
were reachable the whole time.

### What does work: git

Git is not scoped the same way. Arbitrary public repositories clone fine:

```
git ls-remote https://github.com/symfony/var-dumper.git   ->  e9d9cf5...
```

So the install goes over git instead of over HTTP. **`npm run websession:init`
already does this** — `tools/ensure-dev-stack.sh` handles all three steps. By
hand it is:

```bash
export COMPOSER_PROCESS_TIMEOUT=0
composer config --global use-github-api false
node tools/composer-lock-git-sources.mjs api/composer.lock   # then restore it
composer install --working-dir=api --prefer-source
```

All three are needed, and each fails in its own quiet way without the others:

1. **`use-github-api false`.** Left at its default `true`, Composer converts a
   GitHub *source* back into an API zipball download, so `--prefer-source` puts
   you straight back on the 403. This is the step that is easy to miss, because
   `--prefer-source` looks like it should be sufficient on its own.
2. **A `source` for `phpstan/phpstan`.** It is the only package in this lock
   that publishes none — dist-only on packagist, pulled in transitively by
   larastan (this repo never requires phpstan directly). `composer install` is
   all-or-nothing, so that single package fails all 121, and you get `vendor/`
   with 43 of 43 vendor directories populated and **no `vendor/autoload.php`**,
   because Composer aborts before dumping the autoloader. It looks like a total
   failure and is one package short.
3. **`COMPOSER_PROCESS_TIMEOUT=0`.** Composer kills any child process after
   300s, and cloning `phpstan/phpstan` exceeds that — it carries a built phar
   across 857 tags, and all 121 packages clone at once. It times out on a cold
   cache and succeeds on a warm one, so it passes when you test it and fails
   for the next person.

`tools/composer-lock-git-sources.mjs` derives that source from the package's own
dist URL — a zipball URL names the owner, the repository and the exact commit —
so the clone lands on the commit the archive was built from. It patches the lock
in place and `ensure-dev-stack.sh` restores it afterwards: **the committed lock
must never carry those entries**, since they work around one environment's proxy
and everyone else would inherit them.

Nothing here is a trick. `--prefer-source` and `use-github-api` are both
documented Composer modes.

### Two things that are not the cause

- **`GH_TOKEN` and `GITHUB_TOKEN` read as the literal string `proxy-injected`.**
  That is the documented placeholder for the GitHub proxy, not a broken token.
  Composer does not read either variable (it reads `COMPOSER_AUTH`, which is
  unset), so it is not the cause of the auth error however much it looks like it.
- **Rate limiting.** 15000/hour, and a failing run has used about 20.

### The cost of the source install

Source installs are slower and carry each package's test files, so the
autoloader prints `Ambiguous class resolution` warnings — including one naming
`App\Providers\AppServiceProvider` against `laravel/pint`'s own copy. Harmless.

**The disk cost is not harmless.** A web session's writable space is a fixed
per-session allowance, not a real filesystem, and a source install of this repo
peaks at roughly 37 GB:

| | |
| --- | --- |
| `api/vendor` | ~19 GB — a full-history `.git` in each of the 121 packages |
| Composer's VCS mirror cache | ~18 GB |

That is enough to exhaust the allowance outright, and it fails as
`fatal: ... write error. Out of diskspace` mid-clone, leaving no
`vendor/autoload.php` — which looks exactly like the §1 failure and is not.
`ensure-dev-stack.sh` drops both afterwards (strips `vendor/**/.git`, then
`composer clear-cache`), taking `api/vendor` back to roughly its dist-install
size. Nothing here runs `composer update`, so neither copy is missed.

The peak is still the peak, so **do not fill the disk with anything else first**
— pulling Docker images (§4) before provisioning is what exhausted it the one
time this was measured. `df -h /` reporting `Avail` at 0 with low `Used` means
the allowance is spent, not that the machine is broken.

### One install at a time, across processes

Four things install `api/vendor`, and until 2026-09-16 none of them knew about
the others:

| Entry point | Reached by |
| --- | --- |
| `tools/ensure-dev-stack.sh` | `npm run websession:init` |
| `tools/pint.mjs` | `npm run lint:api` — **and every `git commit`**, via Husky and lint-staged |
| `tools/phpstan.mjs` | `npm run lint:types` |
| `tools/openapi.mjs` | `npm run openapi` |

Each self-heals a missing `api/vendor`. Here that install takes minutes rather
than seconds, so two of them overlapping is ordinary rather than unlucky — and
one of the triggers is *committing*, which is what an agent does in the middle
of a task.

MEASURED 2026-09-16: a provisioning run and a pre-commit Pint ran together,
wrote the same vendor tree and the same VCS mirror, took phpstan's mirror alone
to 15 GB against the 2.9 GB one writer produces, and ended with no
`vendor/autoload.php` at all. Killing one left its `git fetch` orphaned and
still writing into the shared mirror, which is the same failure a second time.

They now share a lock: a directory `.api-vendor-install.lock` at the repo root,
holding the owner's pid. `tools/api-vendor.mjs` implements it for the three Node
tools and `ensure-dev-stack.sh` implements the same protocol in shell, so a Node
tool and the script serialise against each other rather than only among
themselves. `mkdir` is the atomic step; "test then create" is not.

Two properties matter:

- **A waiter re-checks and skips.** It does not queue its own install behind
  the first. One install is the point; installs in an orderly line is the same
  wasted session, just tidier.
- **A lock whose holder is gone is taken over**, not waited on. A Composer
  killed mid-clone would otherwise wedge every later run until the session ends.

If a run ever reports waiting on an install that is not happening, delete
`.api-vendor-install.lock` and try again.

## 2. The environment setup script

Provisioning belongs in the environment's **Setup script**, which runs once
before Claude starts and is then snapshotted into the environment cache, so
later sessions start with it already done.

```bash
#!/bin/bash
set -x

# MariaDB. Ubuntu 24.04 ships 10.11; docker-compose.yml and production both
# pin 10.3. Fine for everything this repo does, but see §4.
DEBIAN_FRONTEND=noninteractive apt-get update -y || true
DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server || true

npm ci || true

# Composer, the same three steps tools/ensure-dev-stack.sh takes, and for the
# reasons in §1. Without ALL of these the install fails on every package.
export COMPOSER_ALLOW_SUPERUSER=1
export COMPOSER_PROCESS_TIMEOUT=0
composer config --global use-github-api false || true
node tools/composer-lock-git-sources.mjs api/composer.lock || true
composer install --working-dir=api --no-interaction --no-progress \
  --prefer-source || true
git checkout -- api/composer.lock || true
```

Keep every line `|| true`: a setup script that exits non-zero fails the whole
session, and the script has to finish inside roughly five minutes. Note that
`|| true` also hides a real failure — if a session starts without `api/vendor`,
run `npm run websession:init` and read its output rather than assuming the
setup script succeeded.

**The snapshot keeps files, not processes.** A MariaDB the setup script started
is gone by the time a session runs; only the installed packages survive. Start
the daemon per session — `npm run websession:init` is idempotent and will skip
the work the snapshot already did.

## 3. In a session

```bash
npm run websession:init    # npm install, MariaDB, Composer, api/.env, APP_KEY
```

Idempotent. It ends with `==> Dev stack ready.` and nothing else needs doing.

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

**`npm install` rewrites `package-lock.json` here.** This image ships npm
10.9.7 and the committed lock was written by npm 11+, which records a `libc`
field on optional platform packages; 10.9.7 strips them, for a 24-line deletion
that is pure version churn. Discard it (`git checkout -- package-lock.json`)
rather than committing it.

## 4. Docker, and what this stack is not

**Docker is installed** — `docker`, `dockerd`, `containerd`, `runc`, buildx and
the compose plugin all ship in the session image, and the cloud-environment
documentation lists them. No daemon is running, but one starts fine:

```bash
nohup dockerd >/tmp/dockerd.log 2>&1 &     # ~1s to accept connections
```

Verified 2026-09-15: `docker run hello-world` works, and **`mariadb:10.3` runs
and answers on TCP**, which is production's version and the one thing the native
stack cannot give you.

Two things stand between that and `npm run dev`, and the second is a wall:

- **Image pulls need a registry mirror.** Docker Hub serves blobs from
  `production.cloudfront.docker.com`, which is refused; the environment's
  default allowlist names `production.clou**dflare**.docker.com`, an older host.
  One letter. Work around it with
  `/etc/docker/daemon.json` → `{"registry-mirrors": ["https://mirror.gcr.io"]}`,
  after which all six of this repo's images pull.
- **The `web` image cannot be built.** `docker/web/Dockerfile` runs
  `apt-get install apache2 …` on `php:8.4-fpm`, which is Debian trixie, and
  **no Debian mirror is on the allowlist** — `deb.debian.org` answers 403 over
  plain HTTP and is refused at CONNECT over HTTPS, while Ubuntu's archives are
  allowed. There is no way around this from inside the session.

So **there is still no `:8090` parity stack**, and `npm run smoke` and every
Apache behaviour — the `.htaccess` dispatch, the SPA fallback, the
authorization boundary around `_api/` — remain out of reach. Those want a real
Docker host. What a web session's Docker buys is a 10.3 database, which is worth
having when something is schema-shaped.

Also true regardless:

- **The native MariaDB is 10.11, production is 10.3.** Everything here stays
  well inside both, but a migration leaning on 10.11 syntax would pass in a web
  session and fail on the host. Either run it against the `mariadb:10.3`
  container above, or in Docker proper, before it ships.
- **No Mailpit and no DbGate.** Read the database with `sudo mysql`.

### A note on the agent proxy

Outbound HTTPS goes through a CONNECT proxy. It answers **405 to plain HTTP for
every host**, allowed or not — plain-HTTP egress goes direct and is filtered
separately. So passing `http_proxy`/`https_proxy` into a `docker build` makes
apt fail *worse*, not better. Don't.
