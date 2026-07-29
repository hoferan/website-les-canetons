# PROD cutover checklist

The hard switch from the old application to WordPress (spec §12, Plan 8b). Cutover
replaces the files at the document root; it **cannot touch the old data**, which
lives in a *different database* (spec §7) — that is what makes it safe. Rollback
is redeploying the archive branch, not keeping two apps running.

Work top to bottom. Do not start Phase D until TEST has been seen and accepted.

---

## A. Prerequisites (days before)

- [ ] **TEST is accepted** — theme, the nine pages, contact form, login and the
      planning/summary flows have been reviewed on TEST and signed off.
- [ ] **All plugin integration tests pass on Docker** — `npm run wp:test` is
      green (5 suites: capabilities, events, responses/RSVP, roster, plugin-loads).
      This is the security boundary; do not cut over on unrun tests.
- [ ] **PROD WordPress database created** through the hosting control panel
      (spec §7 — it does not exist yet). Record its name, user and password
      somewhere safe (never in git).
- [ ] **Old-database credentials in hand** — read `db` from PROD's old
      `config.php` over FTP (name is `lescanetoqg2`). Needed for the migration.
- [ ] **PROD `wp-config.php` prepared** (server-owned, never tracked): the new DB
      credentials, table prefix `qsjd_`, `WP_HOME`/`WP_SITEURL` = the PROD URL,
      fresh salts, and the hardening constants of spec §8 (`DISALLOW_FILE_EDIT`,
      `WP_ENVIRONMENT_TYPE` = `production`, disable the file editor).
- [ ] **`lftp` installed** locally and `.env.prod` present with `FTP_HOST`,
      `FTP_USER`, `FTP_PASSWORD`, `FTP_DIR` (PROD document root).

## B. Stand up WordPress on PROD (Plan 7, authored directly in PROD)

**Content is seeded by import, not hand-authored here** — the nine pages and
media are built once locally and imported, per
`docs/superpowers/specs/2026-07-28-content-propagation-and-mcp-authoring-design.md`.
The import overwrites the database (including users), so its ordering matters: it
runs onto a **fresh** PROD, *before* PROD has any real accounts or content, and
per-environment config is applied **after**.

- [ ] Install WordPress core at the PROD document root, locale **fr_FR**,
      permalinks **`/%postname%/`**, timezone **Europe/Zurich**.
- [ ] **Import the content archive** built locally (migration plugin), onto this
      fresh PROD, rewriting URLs to the PROD URL. The archive carries pages and
      media only — no members or events.
- [ ] **Recreate/confirm the PROD admin account** — the import replaced the users
      table with the local site's, so the only login now is the local admin.
      Restore the real PROD admin before continuing.
- [ ] **Deploy theme + plugin:** `npm run wp:deploy:prod` (confirms a backup),
      then activate the `canetons` theme and the `canetons-planning` plugin.
- [ ] Install and activate the six third-party plugins via wp-admin: Fluent
      Forms, Members, FluentSMTP, UpdraftPlus, Limit Login Attempts Reloaded,
      WP Dark Mode (spec §4). Then `npm run wp:manifest` and commit the refreshed
      `docs/wordpress-install-manifest.csv`.
- [ ] **Configure UpdraftPlus off-site backups now — after the import, before any
      real content edits** (spec §11): database daily, uploads weekly. The import
      overwrote the backup config, so re-confirm the destination here; the "before
      content" invariant holds because no live editing has happened yet.
- [ ] Configure **FluentSMTP** with a real authenticated mailbox (ports 465 SSL /
      4650 STARTTLS — not 587). Send a test mail and confirm delivery.
- [ ] Verify the **contact form** (Fluent Forms) came across in the import — last
      name, first name, email, subject (optional), message — with committee
      notification; rebuild it if the form did not travel.
- [ ] **Members plugin:** confirm the members-only planning page restriction and
      that the `canetons_*` roles look right (the plugin registers them on
      activation).
- [ ] Verify the **nine pages** (accueil, canetons, historique, commencement,
      moniteurs, comité/team direction, cd, multimédia, sponsors), the contact and
      login pages, the front page and menus all imported correctly and render with
      no `localhost` leaks. The multimédia page links out to the external gallery.
- [ ] Confirm the `[canetons_planning]` list is on the members' planning page.

## C. Migrate data (spec §7)

- [ ] Take a fresh backup.
- [ ] **Dry run:** `npm run wp:cli canetons migrate -- --old-config=<path-to-old-config.php> --dry-run`.
      Review the member and event counts against expectations.
- [ ] **Run for real** (drop `--dry-run`). Re-running is safe — it skips anything
      already migrated.
- [ ] Verify a sample: members carry the right role and instrument; events have
      the right date/time/location/weekend. Passwords are **not** migrated —
      distribute new admin-set passwords out of band (spec §7, requirement 1.5).

## D. Cutover day — the hard switch (spec §12)

- [ ] **Full backup immediately before** — database, uploads and files (spec §11).
- [ ] Install the PROD **`.htaccess`** at the document root from
      `docs/htaccess-prod.txt`, **after reconciling its two host-fix rules against
      the real `/wp-test/` reference file**. Confirm: no directory-request
      redirect loop, and CSS/JS are served revalidatable (not one-year immutable).
- [ ] **Remove the old application files** from the document root (the old `app/`
      front controller, `api/`, and anything else it served) so WordPress is the
      only thing there. The old `.htaccess` goes with them.
- [ ] Flush permalinks (Settings → Permalinks → Save) and confirm the WordPress
      block sits **below** the host fixes in `.htaccess`.
- [ ] Set **`blog_public` = 1** so search engines may index (it was 0 pre-launch).
- [ ] **Smoke test on PROD** (spec §9 manual checklist):
  - [ ] Home and each of the nine pages render, styled, no redirect loop.
  - [ ] Contact form submits and the committee receives the mail.
  - [ ] `wp-login.php` works; Limit Login Attempts is active.
  - [ ] Planning list shows upcoming events **while logged out**.
  - [ ] A member can RSVP and sees their answer marked; answering again updates it.
  - [ ] A Team Direction / admin user sees the **Résumé des inscriptions** page;
        a member does **not**. Direction and admins have no RSVP buttons.
  - [ ] Dark mode toggles.

## E. Post-cutover

- [ ] Monitor for 24–48 h. Check **Site Health** — a "recommended version" notice
      for MariaDB 10.3 is expected and accepted (PROD parity).
- [ ] Confirm the first scheduled UpdraftPlus backup ran and landed off-site.
- [ ] **Leave the old tables in place for one month** (spec §12). Once the
      WordPress data is confirmed good, drop `lescanetoqg2`'s old tables. Keep the
      dated SQL dump of signups and contact messages (not migrated) as an archive.

## F. Rollback (only if cutover fails)

- [ ] Redeploy `archive/php-laravel-stack` to the document root over FTP and
      restore the old application's `.htaccess`. This is minutes, not seconds —
      the accepted trade for not running two apps side by side.
- [ ] The **old data is untouched** — it is in a different database (`lescanetoqg2`)
      that cutover never reached. The `qsjd_` prefix and distinct table names are a
      redundant second layer, not the guarantee.

---

### Notes carried from the plans

- **TEST is all-or-nothing behind HTTP Basic Auth** (spec §8): this host 500s on a
  per-path exemption, so Basic Auth covers `wp-admin` and `admin-ajax.php` there
  too. PROD is not behind Basic Auth.
- **Nothing hardcodes the document root** except `FTP_DIR` in `.env.prod`
  (Plan 1, Task 0) — if PROD later moves up from `/public_html/staging/...`, that
  one value changes and nothing else.
- **Remove the migration command after cutover** — `wp canetons migrate` is a
  one-off shipped in the plugin (spec §7); delete `src/Cli/Migrate.php` and its
  bootstrap registration once the data is confirmed good.
