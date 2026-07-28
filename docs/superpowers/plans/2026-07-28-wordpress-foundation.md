# WordPress Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a local WordPress development environment matching production
versions, with an empty-but-activating `canetons-planning` plugin and two working
test harnesses, so that every later plan has somewhere to build and something to
test against.

**Architecture:** One Docker Compose stack (`docker-compose.yml`) runs WordPress
6.9 on PHP 8.4 against MariaDB 10.3. It is the only stack — the previous PHP and
Laravel stack has been deleted from this branch and lives on
`archive/php-laravel-stack`. WordPress core lives in a named volume; only the two
directories that form the deploy artifact are bind-mounted from the tracked tree,
at the same paths they occupy on the server.

**Tech Stack:** WordPress 6.9, PHP 8.4, MariaDB 10.3, Docker Compose, WP-CLI,
Mailpit, PHPUnit 11, `wp-phpunit/wp-phpunit`, `yoast/phpunit-polyfills`.

**Spec:** `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`

---

## Plan roadmap

This plan is **Plan 1 of 9**. The spec is 29–42 days of work; splitting it keeps
each plan independently reviewable and each one delivers working software.

**The near-term goal is a working TEST site.** PROD comes after, once TEST has
been seen and accepted. That splits the original Plan 8 in two: getting TEST
running needs deploy and data migration, but *not* the PROD cutover.

| # | Plan | Delivers | Blocked by |
| --- | --- | --- | --- |
| **1** | **WordPress foundation (this plan)** | ✅ **Done** — local stack, plugin skeleton, both test harnesses | — |
| 2 | Roles, capabilities, instruments | Spec §3.3, §3.4 — the capability matrix with negative tests | 1 |
| 3 | Events custom post type | Spec §3.1 — CPT, meta box, public planning list | 2 |
| 4 | Responses and member RSVP | Spec §3.2, §3.5 — responses table, member planning surface | 3 |
| 5 | Attendance summary | Spec §3.6, §1.3 — counters, roster table, instrument counts | 4 |
| 6 | Design direction and theme | Spec §5 — `theme.json`, templates, block patterns | — (parallel) |
| 7 | Third-party plugins and content | Spec §4, §6 — contact form, SMTP, backups, nine pages | 6 |
| **8a** | **TEST running** — deploy + data migration | Spec §7, §10, §11 — WordPress at TEST's document root, theme and plugin deployed, members and events imported, backups configured | 5, 7 |
| 8b | PROD cutover | Spec §12 — create PROD's WordPress database, hard switch, retire the old app | 8a, plus TEST accepted |

Plan 6 is independent of 1–5 and can run in parallel.

**What 8a has to settle, recorded now so it is not rediscovered:**

- WordPress on TEST currently lives at `/wp-test/`, but TEST's document root is
  `/public_html/staging/test.lescanetons.org`. 8a installs WordPress *at that
  root* and retires the `/wp-test/` subdirectory — the site owner's stated
  intent, and it removes the `RewriteBase /wp-test/` special case.
- **TEST's WordPress database (`lescanetoqg5`) holds a bare install.** A dump
  taken 2026-07-28 contains only the 12 stock `qsjd_*` tables, one INSERT into
  `qsjd_posts` (the default Hello world / Sample Page / Privacy Policy), and no
  real uploads — its 1.6 MB is almost entirely `qsjd_options`. **Nothing on TEST
  needs preserving**, so 8a may reinstall freely.
- The old TEST application's data stays in `lescanetoqg3`, a different database
  (§7), so none of this can touch it.

---

## Repository layout decision

Tracked sources sit at **the same paths they occupy on the server**:

```
wp-content/themes/canetons/
wp-content/plugins/canetons-planning/
```

So a repo path equals a deployed path, the deploy script is a straight copy with
no mapping, and anyone opening the repo can see where things land. The cost is
that the repo root looks like a partial WordPress install — the README covers
that.

**Only your own code is tracked.** WordPress core, the third-party plugins,
`wp-config.php` and `uploads/` are server-owned. The consequence, which drives
several choices below: **the repository is no longer a complete description of
the site.** What is installed alongside your code is recorded in a committed
manifest (Task 2) rather than vendored, because vendoring would fight spec §4's
decision that servers update plugins through wp-admin — the next deploy would
silently revert any such update.

---

## Local development setup

Six decisions worth stating, because each has a wrong-looking alternative:

1. **Core lives in a named volume, not a bind mount.** Core is server-owned in
   every environment and never deployed, so it has no business in the tracked
   tree.
2. **Two narrow bind mounts, never `./wp-content` as a whole.** Mounting the
   whole directory would hide core's bundled themes and every plugin installed
   through wp-admin, and would drop `uploads/` into the repository.
3. **`WP_HOME` and `WP_SITEURL` are pinned as constants.** WordPress otherwise
   stores its URL in the database, so reaching the site on another host or port —
   or importing a database from PROD — produces redirect loops and broken assets.
   This is the single most common WordPress-in-Docker failure and pinning removes
   it entirely.
4. **Configuration comes from `WORDPRESS_*` environment variables.** The
   official image *generates* `wp-config.php` from them, so this is the idiomatic
   path — no mounted config file, and no `wp-config.php` in the tracked tree to
   leak credentials from.
5. **Tests run inside the `wp` container**, via `exec -w`. The official image
   already has PHP 8.4 and `mysqli` (WordPress requires it), so no separate
   runner service or custom Dockerfile is needed.
6. **WP-CLI runs as `run --rm`, not a long-lived sidecar.** Its image's entry
   point is `wp` itself, which exits immediately, so keeping it running would
   need a `tail -f` hack for no benefit.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `docker-compose.yml` | The WordPress stack — the only one. |
| `docker/wp/mu-plugins/local-mail.php` | Routes `wp_mail` to Mailpit. Mounted, never deployed — local only. |
| `wp-content/.gitignore` | Default-deny for plugins and themes, with our two whitelisted. |
| `wp-content/plugins/canetons-planning/canetons-planning.php` | Plugin bootstrap: header, constants, autoloader, hook wiring. Nothing else. |
| `wp-content/plugins/canetons-planning/src/Activator.php` | What happens on activation. Later plans add roles and the responses table. |
| `wp-content/plugins/canetons-planning/src/Schema.php` | Schema-version comparison. Pure, no WordPress. |
| `wp-content/plugins/canetons-planning/composer.json` | Dev-only dependencies. The plugin has no runtime dependencies. |
| `wp-content/plugins/canetons-planning/phpunit-unit.xml.dist` | Unit suite: no WordPress bootstrap. |
| `wp-content/plugins/canetons-planning/phpunit-integration.xml.dist` | Integration suite: full WordPress bootstrap. |
| `wp-content/plugins/canetons-planning/tests/unit/` | `bootstrap.php`, `SchemaTest.php` |
| `wp-content/plugins/canetons-planning/tests/integration/` | `bootstrap.php`, `PluginLoadsTest.php` |
| `wp-content/themes/canetons/` | Created empty here; Plan 6 fills it. |
| `tools/wp-setup.sh` | Idempotent install: core, locale, permalinks, plugins, hardening. |
| `docs/wordpress-install-manifest.csv` | Generated record of core and plugin versions. |

---

## Task 0: Verify the database topology — DONE (2026-07-28)

- [x] **Step 1: Read the old application's database name on each environment**

Fetched each environment's server-owned `config.php` over FTP with credentials
from `.tmp/env/.env.<env>` (git-ignored). Only the `env` and `db.name` keys were
read — that file also holds the live database password, SMTP password and Altcha
secret, so it must never be printed or committed in full.

- [x] **Step 2: Compare against WordPress's**

**They are separate databases.**

| Environment | Old application | WordPress |
| --- | --- | --- |
| TEST | `lescanetoqg3` | `lescanetoqg5` (prefix `qsjd_`) |
| PROD | `lescanetoqg2` | not yet created |

- [x] **Step 3: Record the finding in the spec**

Recorded in §7, with §12's isolation guarantee strengthened accordingly. The
earlier assumption that shared hosting implies one shared database was wrong;
this host provisions several per account.

### What this changed

1. **Plan 8's migration command needs two connections** — WordPress's `$wpdb` to
   write, and a second built from the old `config.php` to read. Each database has
   its own user with no grant on the other, so a cross-database query cannot work.
2. **A WordPress database must be created on PROD before cutover**, by hand in the
   hosting control panel. Nothing in these plans creates one, and PROD has no
   counterpart to TEST's `lescanetoqg5`.
3. **Isolation is now structural, not conventional.** Cutover cannot reach the old
   data because it lives in a different database — the `qsjd_` prefix and distinct
   table names are a redundant second layer rather than the guarantee.

### Document roots — confirmed correct

PROD's `FTP_DIR` is `/public_html/staging/prod.lescanetons.org` and TEST's is the
`test.` equivalent. The `staging/` parent reads oddly for a live site but is
correct: it is simply how this account's FTP tree is laid out, and the public
domain does serve that directory. Confirmed by the site owner, 2026-07-28.

These may later be moved up to the FTP root. That is a **one-value change per
environment** — `FTP_DIR` in `.env.<env>` — and nothing else may hardcode a
document-root path. Plan 8's deploy script must read it from there rather than
embedding it, precisely so this relocation stays a config edit.

---

## Task 1: The WordPress Docker stack

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/wp/mu-plugins/local-mail.php`
- Create: `wp-content/.gitignore`
- Create: `wp-content/themes/canetons/.gitkeep`
- Create: `wp-content/plugins/canetons-planning/.gitkeep`

- [ ] **Step 1: Create the tracked source directories**

```bash
mkdir -p wp-content/themes/canetons wp-content/plugins/canetons-planning docker/wp/mu-plugins
touch wp-content/themes/canetons/.gitkeep wp-content/plugins/canetons-planning/.gitkeep
```

- [ ] **Step 2: Resolve the WordPress image tag**

Run: `docker pull wordpress:6.9-php8.4-apache`

If that tag does not exist, use `wordpress:php8.4-apache` instead, everywhere
below. Pin an explicit tag either way — never `latest`.

- [ ] **Step 3: Write the local-mail mu-plugin**

WordPress's `wp_mail` uses PHP's `mail()`, and the official image has no
sendmail, so mail fails **silently** — the contact form of spec §1.6 would look
like it worked. Create `docker/wp/mu-plugins/local-mail.php`:

```php
<?php
/**
 * Local development only: routes all outbound mail to Mailpit.
 *
 * Mounted into the container from docker/wp/mu-plugins/ and NEVER deployed —
 * the deploy artifact is two directories and this is not in either.
 *
 * On real servers this job belongs to FluentSMTP (spec §4), configured per
 * server through wp-admin. Local development deliberately does not install
 * FluentSMTP: both hook `phpmailer_init`, so running both would mean debugging
 * whichever won. The trade-off is that FluentSMTP's own configuration is
 * verified on TEST rather than locally.
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'phpmailer_init',
	static function ( $phpmailer ): void {
		$phpmailer->isSMTP();
		$phpmailer->Host     = 'wp-mailpit';
		$phpmailer->Port     = 1025;
		$phpmailer->SMTPAuth = false;
		// Mailpit speaks plain SMTP; PHPMailer would otherwise attempt STARTTLS
		// and fail the send.
		$phpmailer->SMTPAutoTLS = false;
	}
);

/**
 * Override the default From address, which is invalid on this site.
 *
 * WordPress builds it as 'wordpress@' . <site host>. Locally that host is
 * `localhost`, giving `wordpress@localhost` — and PHPMailer validates addresses
 * with FILTER_VALIDATE_EMAIL, which REJECTS a domain with no dot. Every send
 * then fails with "Invalid address (From)" and wp_mail() returns false.
 *
 * This is a local-only fault, which is why the fix lives here: TEST
 * (test.lescanetons.org) and PROD (lescanetons.org) have dotted hosts, so their
 * default From validates. On those servers the From address is FluentSMTP's
 * concern and must be a real authenticated mailbox (spec §4).
 *
 * `.invalid` is reserved by RFC 2606, so it can never resolve or deliver to a
 * real recipient — the same reasoning as the synthetic member addresses in
 * spec §7.
 */
add_filter( 'wp_mail_from', static fn (): string => 'no-reply@lescanetons.invalid' );
add_filter( 'wp_mail_from_name', static fn (): string => 'Les Canetons (local)' );
```

**Windows note — this bites every command below.** In Git Bash, MSYS rewrites
`/var/www/html` into `C:/Program Files/Git/var/www/html` before Docker sees it,
and WP-CLI then reports "This does not seem to be a WordPress installation".
Prefix the *docker* commands with `MSYS_NO_PATHCONV=1`:

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html ...
```

Do **not** export it for the whole shell: it also stops `/dev/null` being
translated, so `curl -o /dev/null` then fails with exit 23. Scope it to the
docker invocations only. The `npm run wp:*` scripts are unaffected — npm runs
them through `cmd.exe`, which has no such rewriting.

- [ ] **Step 4: Write the compose file**

Create `docker-compose.yml`:

```yaml
# The WordPress stack (spec §10) — the only one. The previous PHP and Laravel
# stack was deleted from this branch and lives on archive/php-laravel-stack.
#
#   npm run wp:dev     # up
#   npm run wp:setup   # install WordPress (idempotent)
#
# Ports are offset from the obvious defaults (8100 not 8080, 3308 not 3306) so
# the stack does not collide with anything else already running on the machine —
# a stray local MySQL on 3306 is common.
services:
  wp:
    image: wordpress:6.9-php8.4-apache
    ports:
      - "8100:80"
    environment:
      WORDPRESS_DB_HOST: wp-db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DEBUG: 1
      WORDPRESS_CONFIG_EXTRA: |
        /* Pin the site URL rather than letting the database own it. Without
           this, WordPress stores siteurl/home as rows, and reaching the site on
           a different host or port — or importing a database from PROD —
           produces redirect loops and broken asset URLs. */
        define( 'WP_HOME', 'http://localhost:8100' );
        define( 'WP_SITEURL', 'http://localhost:8100' );

        /* Log to wp-content/debug.log instead of rendering warnings into the
           middle of the page, which corrupts JSON and header output. */
        define( 'WP_DEBUG_LOG', true );
        define( 'WP_DEBUG_DISPLAY', false );

        /* Serve unminified core JS/CSS so stack traces point somewhere useful. */
        define( 'SCRIPT_DEBUG', true );

        /* WordPress's recovery mode catches fatals, hides them behind a generic
           page and emails the admin. Useful in production, actively harmful in
           development — we want the fatal on screen. */
        define( 'WP_DISABLE_FATAL_ERROR_HANDLER', true );

        /* Hardening that must hold in every environment (spec §8). Set locally
           too, so nobody develops against behaviour PROD will not allow. */
        define( 'DISALLOW_FILE_EDIT', true );
        define( 'WP_ENVIRONMENT_TYPE', 'local' );
    volumes:
      # Core in a named volume — server-owned everywhere, never tracked, never
      # deployed.
      - wp_core:/var/www/html
      # The two artifact directories, at their real paths. Narrow mounts on
      # purpose: mounting ./wp-content wholesale would hide core's bundled
      # themes and every wp-admin-installed plugin, and would drop uploads/ into
      # the repository.
      - ./wp-content/themes/canetons:/var/www/html/wp-content/themes/canetons
      - ./wp-content/plugins/canetons-planning:/var/www/html/wp-content/plugins/canetons-planning
      # Local-only mail routing. Read-only: nothing should write here.
      - ./docker/wp/mu-plugins:/var/www/html/wp-content/mu-plugins:ro
    depends_on:
      wp-db:
        condition: service_healthy
      wp-mailpit:
        condition: service_started

  # WP-CLI. Invoked as `run --rm`, so it needs no keep-alive entrypoint: the
  # image's own entrypoint IS `wp`. It shares wp_core and the same bind mounts so
  # it sees exactly the filesystem Apache does, and runs as uid 33 (www-data) to
  # avoid leaving root-owned files in the volume that would then break Apache.
  wp-cli:
    image: wordpress:cli-php8.4
    user: "33:33"
    environment:
      WORDPRESS_DB_HOST: wp-db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
    volumes:
      - wp_core:/var/www/html
      - ./wp-content/themes/canetons:/var/www/html/wp-content/themes/canetons
      - ./wp-content/plugins/canetons-planning:/var/www/html/wp-content/plugins/canetons-planning
      - ./docker/wp/mu-plugins:/var/www/html/wp-content/mu-plugins:ro
      # The setup script only — wp-cli has no other business in the repo tree.
      - ./tools/wp-setup.sh:/usr/local/bin/wp-setup:ro
    depends_on:
      wp-db:
        condition: service_healthy

  wp-db:
    image: mariadb:10.3
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: wordpress
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3308:3306"
    volumes:
      - wp_db_data:/var/lib/mysql
    # -h 127.0.0.1, NOT localhost — the same trap already documented in
    # docker-compose.yml. Against `localhost` mysqladmin uses the unix socket,
    # which succeeds against MariaDB's temporary --skip-networking init server
    # while TCP is still unreachable, releasing dependents too early.
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -proot || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  # Catches every outbound mail. Required, not optional: the contact form (spec
  # §1.6) cannot otherwise be verified, because a failed send is silent.
  wp-mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8026:8025"

  # Database UI, logged in automatically — opening the port lands straight on the
  # database with no form. PMA_USER/PMA_PASSWORD are a documented feature of this
  # image, which is why phpMyAdmin is here rather than Adminer: Adminer's own
  # image prefills only the server field, and going further would mean
  # maintaining a bespoke plugin against its PHP API.
  #
  # Safe only because these are throwaway local credentials, hardcoded in this
  # file and used by nothing else. Never do this for a real environment.
  phpmyadmin:
    image: phpmyadmin:latest
    ports:
      - "8101:80"
    environment:
      PMA_HOST: wp-db
      PMA_USER: root
      PMA_PASSWORD: root
      # root, not `wordpress`: it is the only login that can see both the
      # development and the wordpress_test databases at once.
      UPLOAD_LIMIT: 64M
    depends_on:
      wp-db:
        condition: service_healthy

volumes:
  wp_core:
  wp_db_data:
```

- [ ] **Step 5: Write the wp-content gitignore**

Create `wp-content/.gitignore`. Default-deny with explicit exceptions, so the
first `wp:setup` on a fresh clone cannot tempt anyone into committing Fluent
Forms. Scoped here rather than in the root `.gitignore`, which carries unrelated
uncommitted changes:

```
# Third-party plugins and themes are server-owned (spec §4) — installed and
# updated through wp-admin, recorded in docs/wordpress-install-manifest.csv, and
# never tracked. Default-deny, then whitelist ours.
plugins/*
!plugins/canetons-planning/
themes/*
!themes/canetons/

# Written by WordPress at runtime, never ours.
uploads/
upgrade/
cache/
debug.log

# Mounted from docker/wp/mu-plugins/ in local development; on a server this
# directory does not exist at all.
mu-plugins/
```

- [ ] **Step 6: Bring the stack up**

Run: `docker compose up -d`

Expected: `wp-db`, `wp-mailpit`, `phpmyadmin` and `wp` start. `wp-cli` does **not**
— it is a `run --rm` service and correctly stays down.

- [ ] **Step 7: Verify WordPress answers**

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8100/`

Expected: `302 http://localhost:8100/wp-admin/install.php` — an uninstalled
WordPress redirecting to its installer. A `500` means the database credentials or
the healthcheck gate are wrong; check
`docker compose logs wp`.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml docker/wp/ wp-content/
git commit -m "build(wp): add the WordPress development stack"
```

Do not `git add .gitignore` at the root — it carries unrelated uncommitted
changes.

---

## Task 2: Scripted, idempotent WordPress install

Clicking through `install.php` is not reproducible. This script is how every
developer and every rebuilt container gets the same site.

**Files:**
- Create: `tools/wp-setup.sh`
- Create: `docs/wordpress-install-manifest.csv` (generated)

- [ ] **Step 1: Write the setup script**

Create `tools/wp-setup.sh`:

```bash
#!/bin/sh
# Idempotent local WordPress setup. Safe to re-run: every step checks its own
# state first, so this is also the recovery path after `npm run wp:reset`.
#
# Run via `npm run wp:setup`, never directly — the npm script supplies the
# compose file and the run target.
set -eu

WP="wp --path=/var/www/html"

# --- core -------------------------------------------------------------------
if $WP core is-installed 2>/dev/null; then
  echo "core: already installed"
else
  echo "core: installing"
  $WP core install \
    --url="http://localhost:8100" \
    --title="Les Canetons de Fribourg" \
    --admin_user="admin" \
    --admin_password="admin" \
    --admin_email="admin@lescanetons.invalid" \
    --skip-email
fi

# --- locale ----------------------------------------------------------------
# The site is French-only (spec §2). Everything user-visible comes from core and
# plugin translations, so the locale is not cosmetic — it IS the translation
# strategy.
if [ "$($WP option get WPLANG)" = "fr_FR" ]; then
  echo "locale: already fr_FR"
else
  echo "locale: installing fr_FR"
  $WP language core install fr_FR --activate
fi

# --- permalinks ------------------------------------------------------------
# Default WordPress serves ?p=123 URLs. Pretty permalinks are what production
# will use, and they exercise the .htaccess rewrite path, so local must match or
# routing bugs only appear after deploy.
if [ "$($WP option get permalink_structure)" = "/%postname%/" ]; then
  echo "permalinks: already pretty"
else
  echo "permalinks: enabling"
  $WP rewrite structure '/%postname%/' --hard
  $WP rewrite flush --hard
fi

# --- timezone --------------------------------------------------------------
# Event dates and times are meaningless without this (spec §1.1).
$WP option update timezone_string "Europe/Zurich"

# --- hardening (spec §8) ---------------------------------------------------
# Comments and trackbacks closed site-wide: the site has no use for them, and an
# open comment form on shared hosting is a spam liability. Options rather than
# code, so they stay visible and auditable in wp-admin.
$WP option update default_comment_status closed
$WP option update default_ping_status closed
# Local only. PROD sets this to 1 at cutover.
$WP option update blog_public 0

# --- third-party plugins (spec §4) -----------------------------------------
# Installed here so local development is reproducible after a reset. On TEST and
# PROD these are installed and updated through wp-admin — spec §4 is unchanged;
# local is disposable, servers are not.
#
# Three of the five are deliberately absent locally:
#   FluentSMTP            — docker/wp/mu-plugins/local-mail.php does this job,
#                           and both hook phpmailer_init.
#   UpdraftPlus           — purely operational; backs up nothing worth keeping
#                           here, and adds cron noise.
#   Limit Login Attempts  — would lock you out of your own dev site while
#                           testing the login of spec §1.5.
for plugin in fluentform members; do
  if $WP plugin is-installed "$plugin" 2>/dev/null; then
    echo "plugin: $plugin already installed"
  else
    echo "plugin: installing $plugin"
    $WP plugin install "$plugin" --activate
  fi
done

echo "setup: done — http://localhost:8100/wp-admin (admin / admin)"
echo "setup: mail at http://localhost:8026"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tools/wp-setup.sh
git update-index --add --chmod=+x tools/wp-setup.sh
```

- [ ] **Step 3: Run it**

```bash
docker compose run --rm wp-cli wp-setup
```

Expected output ends with:

```
setup: done — http://localhost:8100/wp-admin (admin / admin)
setup: mail at http://localhost:8026
```

- [ ] **Step 4: Verify idempotency**

Run: `docker compose run --rm wp-cli wp-setup`

Expected: `core: already installed`, `locale: already fr_FR`,
`permalinks: already pretty`, and both plugins reported already installed. No
errors, no second install.

- [ ] **Step 5: Verify the site actually serves**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8100/`

Expected: `200`. An installed WordPress no longer redirects to the installer.

- [ ] **Step 6: Verify mail reaches Mailpit**

```bash
docker compose run --rm wp-cli \
  wp --path=/var/www/html eval 'wp_mail("test@lescanetons.invalid","Ping","Body");'
curl -s http://localhost:8026/api/v1/messages | head -c 200
```

Expected: the JSON response reports at least one message with subject `Ping`. An
empty list means the mu-plugin is not loading — confirm the mount with
`docker compose exec wp ls /var/www/html/wp-content/mu-plugins`.

- [ ] **Step 7: Generate the install manifest**

The repository does not vendor core or third-party plugins, so without this
there is no record of what runs alongside your code.

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli \
  wp --path=/var/www/html plugin list --fields=name,version,status --format=csv \
  2>/dev/null | tr -d '\r' | grep -v ",must-use$" > docs/wordpress-install-manifest.csv
V=$(MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli \
  wp --path=/var/www/html core version 2>/dev/null | tr -d '\r')
echo "wordpress-core,$V,core" >> docs/wordpress-install-manifest.csv
```

Expected: a CSV listing `canetons-planning` (once Task 3 lands), `fluentform`,
`members`, the two WordPress-bundled plugins (`akismet`, `hello`), and a
`wordpress-core` row.

Three details, each the result of getting it wrong first:

- **`core version`, not `core version --extra`.** The `--extra` output is
  multi-line human-readable text and appending it produces a malformed CSV.
- **`grep -v ",must-use$"`** drops `local-mail`, the mounted local-only
  mu-plugin. It never runs on a server, so recording it would be misleading.
- **`tr -d '\r'`** because WP-CLI emits CRLF here, which otherwise lands in the
  committed file.

**Known limitation — this manifest currently describes the LOCAL install, not a
server.** Local deliberately installs only two of the five third-party plugins
(see the setup script), so the file is not yet the record of server state the
spec asks for. It becomes meaningful in Plan 7, which installs plugins on TEST
and PROD through wp-admin; that plan must decide how to read versions back off a
server with no SSH and no WP-CLI — most likely from wp-admin's Plugins screen by
hand, since FTP alone cannot run WP-CLI. Until then, treat this file as a local
snapshot.

Regenerate and commit it after any core or plugin update. Unlike an UpdraftPlus
archive it gives diffable history — "when did Fluent Forms change, and did the
bug start then?" is a question a backup blob cannot answer.

- [ ] **Step 8: Commit**

```bash
git add tools/wp-setup.sh docs/wordpress-install-manifest.csv
git commit -m "build(wp): script an idempotent local WordPress install"
```

---

## Task 3: Plugin skeleton that activates cleanly

Activation here is unconditional: it records the schema version and nothing else.
Task 4 adds the guard that decides *whether* to upgrade, test-first — which is
the only part with logic worth testing.

**Files:**
- Create: `wp-content/plugins/canetons-planning/canetons-planning.php`
- Create: `wp-content/plugins/canetons-planning/src/Activator.php`
- Delete: `wp-content/plugins/canetons-planning/.gitkeep`

- [ ] **Step 1: Write the plugin bootstrap**

Create `wp-content/plugins/canetons-planning/canetons-planning.php`:

```php
<?php
/**
 * Plugin Name:       Canetons Planning
 * Description:       Event planning and attendance for Guggenmusik Les Canetons de Fribourg.
 * Version:           0.1.0
 * Requires at least: 6.9
 * Requires PHP:      8.4
 * Author:            Guggenmusik Les Canetons de Fribourg
 * Text Domain:       canetons-planning
 *
 * This file is a bootstrap and nothing else: constants, autoloading, and hook
 * wiring. All behaviour lives in src/, so that everything except WordPress
 * integration can be unit-tested without loading WordPress.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

// Direct access executes this file outside WordPress, with no functions defined
// and no security context. Every entry point guards for it.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION = '0.1.0';

/**
 * The schema version, bumped whenever the plugin's own tables change.
 *
 * Deliberately separate from VERSION: most releases touch no tables, and
 * conflating the two would run a needless upgrade path on every release.
 * Currently 0 — this plugin owns no tables yet; Plan 4 creates the first.
 */
const SCHEMA_VERSION = '0';

const PLUGIN_FILE = __FILE__;

/**
 * Minimal PSR-4 autoloader for this plugin's src/ tree.
 *
 * Composer is a dev-only dependency here (testing), so its autoloader is absent
 * from a deployed install and cannot be relied on at runtime.
 */
spl_autoload_register(
	static function ( string $class ): void {
		$prefix = __NAMESPACE__ . '\\';
		if ( ! str_starts_with( $class, $prefix ) ) {
			return;
		}

		$relative = substr( $class, strlen( $prefix ) );
		$path     = __DIR__ . '/src/' . str_replace( '\\', '/', $relative ) . '.php';

		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

register_activation_hook( __FILE__, [ Activator::class, 'activate' ] );
```

- [ ] **Step 2: Write the activator**

Create `wp-content/plugins/canetons-planning/src/Activator.php`:

```php
<?php
/**
 * Activation. Thin on purpose: it reads and writes WordPress state and delegates
 * every decision to pure code, which is where the tests are.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Activator {
	public const SCHEMA_OPTION = 'canetons_planning_schema_version';

	/**
	 * Runs on plugin activation.
	 *
	 * Activation is not a one-time event: WordPress fires this hook on every
	 * re-activation, and a deploy plus re-activation is a normal recovery
	 * action. Everything here must therefore be idempotent.
	 *
	 * Task 4 adds the upgrade guard in front of the write below.
	 */
	public static function activate(): void {
		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
}
```

- [ ] **Step 3: Remove the placeholder**

```bash
rm wp-content/plugins/canetons-planning/.gitkeep
```

- [ ] **Step 4: Activate the plugin and verify**

```bash
docker compose run --rm wp-cli wp --path=/var/www/html plugin activate canetons-planning
docker compose run --rm wp-cli wp --path=/var/www/html plugin list --status=active --field=name
```

Expected: `Plugin 'canetons-planning' activated.` then `canetons-planning` among
the active plugins. A PHP fatal here means the autoloader path or a namespace is
wrong.

- [ ] **Step 5: Verify activation recorded the schema version**

Run: `docker compose run --rm wp-cli wp --path=/var/www/html option get canetons_planning_schema_version`

Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add wp-content/plugins/canetons-planning/
git commit -m "feat(wp): add the canetons-planning plugin skeleton"
```

---

## Task 4: Unit test harness and the schema-upgrade guard

Two suites exist because they need different bootstraps. This one loads no
WordPress at all, which keeps it fast and forces the interesting logic to stay
pure.

Written test-first: the guard deciding *whether* to run an upgrade is the first
piece of real logic in the plugin, and it gets its test before its
implementation.

**Files:**
- Create: `wp-content/plugins/canetons-planning/composer.json`
- Create: `wp-content/plugins/canetons-planning/.gitignore`
- Create: `wp-content/plugins/canetons-planning/phpunit-unit.xml.dist`
- Create: `wp-content/plugins/canetons-planning/tests/unit/bootstrap.php`
- Create: `wp-content/plugins/canetons-planning/src/Schema.php`
- Modify: `wp-content/plugins/canetons-planning/src/Activator.php`
- Test: `wp-content/plugins/canetons-planning/tests/unit/SchemaTest.php`

- [ ] **Step 1: Write the plugin's composer.json**

Create `wp-content/plugins/canetons-planning/composer.json`:

```json
{
    "name": "canetons/planning",
    "description": "Event planning and attendance for Guggenmusik Les Canetons de Fribourg.",
    "type": "wordpress-plugin",
    "license": "proprietary",
    "require": {
        "php": ">=8.4"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.5",
        "wp-phpunit/wp-phpunit": "^6.9",
        "yoast/phpunit-polyfills": "^3.0"
    },
    "autoload": {
        "psr-4": {
            "Canetons\\Planning\\": "src/"
        }
    }
}
```

There is no `require` beyond PHP itself, deliberately: the plugin ships no
runtime dependencies, so a deployed install needs no `vendor/` directory at all.

- [ ] **Step 2: Ignore the dev dependencies**

Create `wp-content/plugins/canetons-planning/.gitignore`:

```
# Composer dev dependencies (PHPUnit and the WordPress test library). The plugin
# has NO runtime dependencies, so this is development-only and never part of the
# deploy artifact.
/vendor/
/.phpunit.cache/
```

- [ ] **Step 3: Write the unit bootstrap**

Create `wp-content/plugins/canetons-planning/tests/unit/bootstrap.php`:

```php
<?php
/**
 * Unit-suite bootstrap. Loads Composer's autoloader and NOTHING else — no
 * WordPress, no database. A test needing either belongs in tests/integration.
 */

declare( strict_types=1 );

$autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! is_readable( $autoload ) ) {
	fwrite( STDERR, "Run composer install in wp-content/plugins/canetons-planning first.\n" );
	exit( 1 );
}

require_once $autoload;
```

- [ ] **Step 4: Write the unit PHPUnit config**

Create `wp-content/plugins/canetons-planning/phpunit-unit.xml.dist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/unit/bootstrap.php"
         cacheDirectory=".phpunit.cache"
         colors="true"
         failOnWarning="true"
         failOnRisky="true">
    <testsuites>
        <testsuite name="unit">
            <directory>tests/unit</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

- [ ] **Step 5: Write the failing test**

Create `wp-content/plugins/canetons-planning/tests/unit/SchemaTest.php`:

```php
<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Schema;
use PHPUnit\Framework\TestCase;

final class SchemaTest extends TestCase {

	public function test_a_never_installed_plugin_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '', '1' ) );
	}

	public function test_an_older_installed_version_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '1', '2' ) );
	}

	public function test_the_current_version_needs_no_upgrade(): void {
		$this->assertFalse( Schema::needs_upgrade( '2', '2' ) );
	}

	/**
	 * A downgrade must not re-run an older migration against a newer schema —
	 * that is how data gets destroyed. See Schema::needs_upgrade().
	 */
	public function test_a_newer_installed_version_is_left_alone(): void {
		$this->assertFalse( Schema::needs_upgrade( '3', '2' ) );
	}

	public function test_version_comparison_is_not_string_comparison(): void {
		// '10' < '9' as strings, but 10 > 9 as versions. Naive comparison would
		// skip the upgrade to 10 from 9, or re-run 9 over 10.
		$this->assertTrue( Schema::needs_upgrade( '9', '10' ) );
		$this->assertFalse( Schema::needs_upgrade( '10', '9' ) );
	}
}
```

- [ ] **Step 6: Install dev dependencies**

```bash
docker run --rm -v "$PWD/wp-content/plugins/canetons-planning":/app -w /app composer:2 install
```

Expected: PHPUnit, `wp-phpunit` and the polyfills land in `vendor/`.

- [ ] **Step 7: Run the suite to verify it FAILS**

```bash
docker compose exec \
  -w /var/www/html/wp-content/plugins/canetons-planning \
  wp ./vendor/bin/phpunit -c phpunit-unit.xml.dist
```

Expected: every test errors with
`Error: Class "Canetons\Planning\Schema" not found`.

That is the correct failure — `Schema` does not exist yet. A *pass* here would
mean the test is not reaching the code it claims to test.

- [ ] **Step 8: Write the minimal implementation**

Create `wp-content/plugins/canetons-planning/src/Schema.php`:

```php
<?php
/**
 * Schema-version arithmetic. Pure by design — no WordPress, no database — so
 * that the rule deciding whether to run a migration is unit-testable in
 * isolation. The WordPress-facing side lives in Activator.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Schema {
	/**
	 * Whether an installed schema version needs upgrading to the target.
	 *
	 * A never-installed plugin reports an empty string, which must count as
	 * needing the upgrade. An installed version AHEAD of the target (a
	 * downgrade — someone deployed an older plugin over a newer database) must
	 * NOT trigger an upgrade: re-running an older migration against a newer
	 * schema is how data gets destroyed. Such a version is left alone for a
	 * human to look at.
	 */
	public static function needs_upgrade( string $installed, string $target ): bool {
		if ( '' === $installed ) {
			return true;
		}

		return version_compare( $installed, $target, '<' );
	}
}
```

- [ ] **Step 9: Run the suite to verify it PASSES**

```bash
docker compose exec \
  -w /var/www/html/wp-content/plugins/canetons-planning \
  wp ./vendor/bin/phpunit -c phpunit-unit.xml.dist
```

Expected: `OK (5 tests, 6 assertions)`.

If every test still fails on `Class ... not found`, the `autoload.psr-4` prefix in
`composer.json` does not match `src/Schema.php`'s namespace — fix it and re-run
`composer dump-autoload`.

- [ ] **Step 10: Wire the guard into the activator**

In `wp-content/plugins/canetons-planning/src/Activator.php`, replace the
`activate()` method body and drop the docblock's final
`Task 4 adds the upgrade guard` line:

```php
	public static function activate(): void {
		$installed = (string) get_option( self::SCHEMA_OPTION, '' );

		if ( ! Schema::needs_upgrade( $installed, SCHEMA_VERSION ) ) {
			return;
		}

		// Later plans add the responses table and the roles here, ahead of the
		// write below. Each must be idempotent, because WordPress fires this
		// hook on every re-activation.

		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
```

- [ ] **Step 11: Verify the plugin still activates**

```bash
docker compose run --rm wp-cli wp --path=/var/www/html plugin deactivate canetons-planning
docker compose run --rm wp-cli wp --path=/var/www/html plugin activate canetons-planning
docker compose run --rm wp-cli wp --path=/var/www/html option get canetons_planning_schema_version
```

Expected: deactivates, re-activates with no fatal, and still prints `0`.

- [ ] **Step 12: Commit**

```bash
git add wp-content/plugins/canetons-planning/
git commit -m "test(wp): add the unit harness and guard schema upgrades"
```

---

## Task 5: Integration test harness

This is the suite that matters. Spec §9 puts capability enforcement here because
it is a security boundary, and Plans 2–5 all depend on this harness existing.

It runs in the `wp` container — which already has PHP 8.4 and `mysqli`, and is
already on the compose network so `wp-db` resolves — via `exec -w`. No separate
runner service, no custom image.

**Two constraints discovered while building this, both now encoded:**

1. **PHPUnit must be 9.x, not 10 or 11.** WordPress's harness
   (`wp-phpunit/.../abstract-testcase.php`) calls
   `PHPUnit\Util\Test::parseTestMethodAnnotations()`, which PHPUnit 10 removed;
   on PHPUnit 11 every integration test errors with "undefined method". Worse,
   `wp-phpunit` declares **no** PHPUnit constraint of its own, so Composer
   installs an incompatible version without complaint. Pin
   `phpunit/phpunit: ^9.6` with `yoast/phpunit-polyfills: ^2.0` — the pairing
   WordPress core itself uses — and write both `phpunit-*.xml.dist` against the
   **9.6 schema** (`cacheResultFile`, no `<source>` element; `cacheDirectory` and
   `<source>` are 10+ only).
2. **The harness needs constants, not environment variables.** `<env>` entries in
   `phpunit.xml` do not satisfy it: it checks `defined()` and aborts with "The
   following required constants are not defined: WP_TESTS_DOMAIN, WP_TESTS_EMAIL,
   WP_TESTS_TITLE, WP_PHP_BINARY". Configuration therefore lives in
   `tests/wp-tests-config.php`, located via the `WP_PHPUNIT__TESTS_CONFIG`
   environment variable that `wp-phpunit`'s shipped shim reads — set from the
   bootstrap off `__DIR__`, so no absolute path is hardcoded anywhere.

**Files:**
- Create: `wp-content/plugins/canetons-planning/phpunit-integration.xml.dist`
- Create: `wp-content/plugins/canetons-planning/tests/integration/bootstrap.php`
- Test: `wp-content/plugins/canetons-planning/tests/integration/PluginLoadsTest.php`

- [ ] **Step 1: Create the test database**

WordPress's test harness **drops every table on every run**, so it must never
point at the development database.

```bash
docker compose exec -T wp-db \
  mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS wordpress_test; GRANT ALL ON wordpress_test.* TO 'wordpress'@'%';"
```

Verify:

```bash
docker compose exec -T wp-db \
  mysql -uroot -proot -e "SHOW DATABASES LIKE 'wordpress%';"
```

Expected: both `wordpress` and `wordpress_test` listed.

- [ ] **Step 2: Write the integration bootstrap**

Create `wp-content/plugins/canetons-planning/tests/integration/bootstrap.php`:

```php
<?php
/**
 * Integration-suite bootstrap. Loads a real WordPress via wp-phpunit, then
 * loads this plugin inside it, so tests exercise genuine WordPress behaviour —
 * capabilities, hooks, $wpdb — rather than mocks of it.
 *
 * WARNING: the WordPress test harness DROPS EVERY TABLE in the database it is
 * pointed at. WP_TESTS_DB_NAME must be a throwaway database, never the
 * development one.
 */

declare( strict_types=1 );

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

$wp_phpunit = dirname( __DIR__, 2 ) . '/vendor/wp-phpunit/wp-phpunit';

// functions.php defines tests_add_filter, so it must load before the call below.
require_once $wp_phpunit . '/includes/functions.php';

// Load the plugin into the WordPress that is about to boot. muplugins_loaded is
// the earliest hook the harness offers, and loading there rather than activating
// afterwards means the plugin's registration hooks fire normally.
tests_add_filter(
	'muplugins_loaded',
	static function (): void {
		require dirname( __DIR__, 2 ) . '/canetons-planning.php';
	}
);

// Boots WordPress. Must be LAST: registering the filter after this point would
// register it after muplugins_loaded has already fired, the plugin would never
// load, and the tests would fail on a missing class rather than on anything
// real.
require_once $wp_phpunit . '/includes/bootstrap.php';
```

The three-part order is load-bearing: `functions.php` (defines the helper) →
`tests_add_filter` (registers the plugin loader) → `bootstrap.php` (boots
WordPress and fires the hook).

- [ ] **Step 3: Write the integration PHPUnit config**

Create `wp-content/plugins/canetons-planning/phpunit-integration.xml.dist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/integration/bootstrap.php"
         cacheDirectory=".phpunit.cache"
         colors="true">
    <testsuites>
        <testsuite name="integration">
            <directory>tests/integration</directory>
        </testsuite>
    </testsuites>
    <php>
        <!-- A THROWAWAY database. The harness drops every table in it. -->
        <env name="WP_TESTS_DB_NAME" value="wordpress_test"/>
        <env name="WP_TESTS_DB_USER" value="wordpress"/>
        <env name="WP_TESTS_DB_PASSWORD" value="wordpress"/>
        <env name="WP_TESTS_DB_HOST" value="wp-db"/>
        <env name="WP_TESTS_DOMAIN" value="localhost"/>
        <env name="WP_TESTS_EMAIL" value="admin@lescanetons.invalid"/>
        <env name="WP_TESTS_TITLE" value="Les Canetons de Fribourg"/>
    </php>
</phpunit>
```

- [ ] **Step 4: Write the test**

This one validates the harness rather than driving new behaviour, so it is
written against the plugin Task 3 already built.

Create `wp-content/plugins/canetons-planning/tests/integration/PluginLoadsTest.php`:

```php
<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Activator;
use WP_UnitTestCase;

use const Canetons\Planning\SCHEMA_VERSION;
use const Canetons\Planning\VERSION;

final class PluginLoadsTest extends WP_UnitTestCase {

	public function test_the_plugin_is_loaded_inside_wordpress(): void {
		$this->assertTrue( defined( 'Canetons\Planning\VERSION' ) );
		$this->assertSame( '0.1.0', VERSION );
	}

	public function test_the_autoloader_resolves_plugin_classes(): void {
		$this->assertTrue( class_exists( Activator::class ) );
	}

	/**
	 * Activation must be safe to run repeatedly — WordPress fires the hook on
	 * every re-activation, and re-activating after a deploy is a normal
	 * recovery action.
	 */
	public function test_activation_is_idempotent(): void {
		Activator::activate();
		$first = get_option( Activator::SCHEMA_OPTION );

		Activator::activate();
		$second = get_option( Activator::SCHEMA_OPTION );

		$this->assertSame( SCHEMA_VERSION, $first );
		$this->assertSame( $first, $second );
	}
}
```

- [ ] **Step 5: Run the integration suite**

```bash
docker compose exec \
  -w /var/www/html/wp-content/plugins/canetons-planning \
  wp ./vendor/bin/phpunit -c phpunit-integration.xml.dist
```

Expected: `OK (3 tests, 5 assertions)`.

If it fails with `Could not find wp-tests-config.php`, the `<env>` values are not
reaching the harness — re-run with `-v` and check which configuration file
PHPUnit reports loading.

- [ ] **Step 6: Commit**

```bash
git add wp-content/plugins/canetons-planning/
git commit -m "test(wp): add the WordPress integration test harness"
```

---

## Task 6: Wire up npm scripts and document the stack

Nobody should need to remember the compose invocations above.

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the scripts**

Add to `package.json`'s `scripts`, leaving existing entries untouched:

```json
    "wp:dev": "docker compose up -d",
    "wp:down": "docker compose down",
    "wp:reset": "docker compose down -v",
    "wp:setup": "docker compose run --rm wp-cli wp-setup",
    "wp:cli": "docker compose run --rm wp-cli wp --path=/var/www/html",
    "wp:manifest": "docker compose run --rm wp-cli wp --path=/var/www/html plugin list --fields=name,version,status --format=csv > docs/wordpress-install-manifest.csv",
    "wp:test:unit": "docker compose exec -w /var/www/html/wp-content/plugins/canetons-planning wp ./vendor/bin/phpunit -c phpunit-unit.xml.dist",
    "wp:test:integration": "docker compose exec -w /var/www/html/wp-content/plugins/canetons-planning wp ./vendor/bin/phpunit -c phpunit-integration.xml.dist",
    "wp:test": "npm run wp:test:unit && npm run wp:test:integration"
```

`wp:reset` takes `-v`, destroying the database and the core volume — and with it
any local uploads, which live in that volume. That is the intended recovery path:
re-run `wp:dev` then `wp:setup`.

- [ ] **Step 2: Verify both suites through npm**

Run: `npm run wp:test`

Expected: `OK (5 tests, 6 assertions)` then `OK (3 tests, 5 assertions)`.

- [ ] **Step 3: Document it**

Add to `README.md`, as a new section directly after the existing local
development section:

````markdown
## WordPress stack (the rebuild)

Requires Docker only — there are no npm dependencies to install. See
`docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`.

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

Ports are offset from the obvious defaults so the stack does not collide with
anything else already running on the machine.

**What is tracked.** `wp-content/themes/canetons/` and
`wp-content/plugins/canetons-planning/` — at the same paths they occupy on the
server, and together the entire deploy artifact. WordPress core, third-party
plugins, `wp-config.php` and `uploads/` are server-owned and never tracked, so
**this repository is not a complete description of the site**: content lives in
the database and installed versions are recorded in
`docs/wordpress-install-manifest.csv`. Refresh that file after any core or
plugin update.
````

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "docs(wp): document the WordPress development stack"
```

---

## Definition of done

- [ ] `npm run wp:dev && npm run wp:setup` produces a French WordPress at
      http://localhost:8100 from a clean checkout, with pretty permalinks.
- [ ] `npm run wp:test` runs both suites green: 5 unit, 3 integration.
- [ ] `canetons-planning` activates with no notice or fatal, and records
      `canetons_planning_schema_version`.
- [ ] `wp_mail()` reaches Mailpit at http://localhost:8026.
- [ ] `npm run wp:reset && npm run wp:dev && npm run wp:setup` fully recovers.
- [ ] `docs/wordpress-install-manifest.csv` is committed and current.
- [ ] `git status` is clean apart from intended changes — in particular no
      `wp-config.php`, no third-party plugin, and no `vendor/` has become
      tracked.
- [x] Task 0's database-topology finding is recorded in the spec.

---

## Notes for later plans

Discovered while writing this plan; recorded so they are not rediscovered:

- **Plan 2** adds roles to `Activator::activate()`. `administrator` must be
  granted `canetons_manage_events` and `canetons_view_summary` but **not**
  `canetons_respond` (spec §3.4) — and that negative case needs a test, because
  it is the whole non-hierarchy.
- **Plan 4** bumps `SCHEMA_VERSION` from `'0'` to `'1'` when it adds the
  responses table. `Schema::needs_upgrade()` and its tests already cover that
  transition.
- **Plan 7** installs the three plugins local development deliberately skips —
  FluentSMTP, UpdraftPlus and Limit Login Attempts Reloaded — on TEST and PROD
  through wp-admin, and must refresh the manifest afterwards.
- **Plan 8** must not deploy `vendor/`, `composer.json`, `phpunit-*.xml.dist`,
  `tests/` or `.gitignore` from the plugin directory. The artifact is source
  only; the plugin has no runtime dependencies by design.
- **MariaDB 10.3 is below WordPress's recommended MySQL 8.0 / MariaDB 10.5** and
  has been end-of-life since May 2023. It is used because PROD runs 10.3.8 and
  parity is the point — but expect a "recommended version" notice in WordPress's
  Site Health screen, and treat a future core release dropping 10.3 as a real
  risk to raise with the host.
