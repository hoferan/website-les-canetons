# Desktop bring-up checklist

What to do after pulling `feat/wordpress-migration` on a machine with Docker.
The important part is **Phase 1**: the plugin's integration suite has never
actually run (it can't in a Docker-less web session), so this is where it first
executes against real WordPress + MariaDB.

Related docs: `README.md` (commands), `docs/cutover.md` (PROD cutover),
`docs/superpowers/specs/2026-07-28-content-propagation-and-mcp-authoring-design.md`
(content propagation), `docs/htaccess-prod.txt` (the PROD `.htaccess` draft).

---

## Phase 0 — Get on the branch

- [ ] `git fetch origin`
- [ ] `git checkout feat/wordpress-migration && git pull`

## Phase 1 — Prove the plugin (do this first)

- [ ] `npm run wp:dev` — start the Docker stack.
- [ ] `npm run wp:setup` — install WordPress (fr_FR, pretty permalinks, plugins).
      Idempotent; safe to re-run.
- [ ] `npm run wp:test` — run **both** suites. Unit should stay green (45 tests);
      the **integration** suite runs here for the first time.
- [ ] If integration fails, capture the output — a test written but never executed
      occasionally needs a small tweak. It validates: the capability negatives
      (member can't reach the summary; Direction/admin can't RSVP), the start/end
      event model, responses upsert idempotency, roster derivation, and the
      Profile `edit_users` gate.

## Phase 2 — Eyeball it (browser)

- [ ] `npm run wp:cli theme activate canetons` (setup activates the plugin, not
      the theme).
- [ ] At `http://localhost:8100` / `/wp-admin` (admin / admin): the theme renders
      in **Duck & Brass**, and the three patterns (comité sections, sponsor links,
      instrument sections) appear in the editor inserter.
- [ ] Create an **Événement** — the meta box shows start date/time **and** end
      date/time (no weekend checkbox). A multi-day event stays on the list until
      its end date passes.
- [ ] Put `[canetons_planning]` on a page; view it logged out (events show), then
      RSVP as a member and confirm the answer is marked.
- [ ] As an admin, set a member's **instrument** on their profile. Confirm a
      **member cannot see** that field on their own profile.
- [ ] Open **Résumé des inscriptions** as a Direction/admin user; confirm a plain
      member cannot see it, and that Direction/admin have no RSVP buttons.
- [ ] Send a test mail and confirm it lands in Mailpit (`http://localhost:8026`).

## Phase 3 — Test the migration against a real old-DB copy

- [ ] Load an old-application DB dump into the stack's MariaDB as a separate
      database:
      ```bash
      docker compose exec -T wp-db mysql -uroot -proot -e "CREATE DATABASE old_import"
      docker compose exec -T wp-db sh -c 'mysql -uroot -proot old_import < /path/in/container.sql'
      ```
- [ ] Dry run:
      ```bash
      npm run wp:cli canetons migrate -- --old-db-host=wp-db --old-db-name=old_import \
        --old-db-user=root --old-db-pass=root --dry-run
      ```
      Review the member and event counts.
- [ ] Real run (drop `--dry-run`). Verify a sample: members carry the right role
      and instrument; events have the right start/end dates and times.
- [ ] **Confirm instrument labels.** Any member landing with an empty instrument
      means the old section name did not match a label. Current labels:
      `trumpet=Trompette, trombone=Trombone, sousaphone=Sousaphone, bells=Cloches,`
      `drums=Batterie, lyre=Lyre, bass_drum=Grosses-Caisse, committee=Comité,`
      `makeup=Maquillage`. Matching tolerates case/space/hyphen/accents but not
      singular↔plural — flag any that differ from the old `instruments.name`.

## Phase 4 — Build the content once (bilingual fr-CH + de-CH)

Public pages are bilingual via two manual page trees, `/fr/*` and `/de/*` — no
multilingual plugin (see
`docs/superpowers/specs/2026-07-28-bilingual-public-content-design.md`). The
members' area and the plugin stay French.

- [ ] Create the two tree roots: a page **`fr`** (slug `fr`) and a page **`de`**
      (slug `de`).
- [ ] Author the **ten pages** as children of `fr` (accueil, agenda, canetons,
      historique, commencement, moniteurs, comité/team direction, cd, multimédia,
      sponsors) → `/fr/accueil/` … using the theme's patterns, real French copy
      and images. The multimédia page links out to the external gallery.
- [ ] Author the **German twins** as children of `de` → `/de/aktuell/` … For a
      precise switcher target, set the `_canetons_lang_alt` custom field on a page
      to its counterpart's URL.
- [ ] **Content only:** do not create real members, and do not run `migrate`
      locally — the export must carry pages and media, not accounts or events.
- [ ] (Optional) drive page creation with a WordPress MCP, per the
      content-propagation spec.

### Verify the bilingual theme helpers

- [ ] Set the site language to **French (fr_FR)** in Settings → General (there is
      no official `fr_CH`), and install **`de_CH`** for German admins.
- [ ] View a `/de/*` page and confirm the source shows `<html lang="de-CH">`; a
      `/fr/*` page shows `lang="fr-CH"`.
- [ ] Place `[canetons_language_switcher]` in the header (or a menu/pattern) and
      confirm it links across trees; the current language shows as inactive.
- [ ] Visit the bare `/` and confirm it redirects to `/fr/` (disable/retarget via
      the `canetons_root_redirect` filter if you don't want this).
- [ ] Build **two menus** (one per language) and assign them.
- [ ] In a second admin user's profile, set the admin language to **de-CH** (or
      **en-US**) and confirm wp-admin switches for that user only.

## Phase 5 — Seed TEST

- [ ] **Locale check before exporting:** `bash tools/verify/locale.sh` must show
      `fr_FR` for both `WPLANG_option` and `get_locale`. The locale has twice
      silently reverted to `en_US` (see `docs/continue-here.md`); an archive
      exported in that state faithfully reproduces the bug on TEST. `npm run
      wp:setup` fixes the drift — and read `wp-content/wplang-trace.log` first,
      while the cause is fresh.
- [ ] Install a migration plugin (All-in-One WP Migration) locally and **export**
      the site to one archive. In Advanced options, **exclude must-use plugins**:
      the local stack mounts `docker/wp/mu-plugins/` — Mailpit mail rerouting and
      the locale tracer — and neither belongs on TEST. The mail router in
      particular would silently swallow TEST's outbound mail.
- [ ] Import onto a **fresh TEST** (overwrites its database, including users).
- [ ] **Locale check after the import.** TEST has no WP-CLI, so check in the
      browser: Réglages → Général must show **Français** as the site language,
      and an event date on `/fr/agenda/` must render in French ("samedi 5
      décembre 2026"), not English. The French tree is the canary — German dates
      are numeric and look fine either way.
- [ ] Recreate/confirm the **TEST admin account** (the import replaced it with the
      local one).
- [ ] `npm run wp:deploy:test` — mirror theme + plugin.
- [ ] Re-apply per-environment config (FluentSMTP, Limit Login) and **confirm the
      UpdraftPlus backup destination before any real edits**.
- [ ] Run `migrate` against TEST for members/events, then smoke-test (spec §9).

## Phase 6 — PROD cutover

- [ ] Reconcile `docs/htaccess-prod.txt` against the real `/wp-test/` `.htaccess`.
- [ ] Follow `docs/cutover.md` end to end.

---

### Hand back to review

- Any **Phase 1 integration failures** — the most likely place to need a fix.
- The **instrument-label confirmation** from Phase 3.
