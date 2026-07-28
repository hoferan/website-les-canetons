# Design — content propagation and MCP-assisted authoring

**Date:** 2026-07-28
**Amends:** `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` §6.
It **supersedes that design's "content authoring: directly in PROD" decision**
for the initial build. Everything else in the migration design stands.

## Context

The migration design (§6) decided the nine public pages would be authored
**directly in PROD**, in the block editor. The consequence is that TEST, PROD
and any local build each get their content entered by hand — the same nine pages
authored up to three times.

The site owner does not want to author the same pages three times. This design
replaces that with **author once, then propagate**: build the full site locally,
then move the *content* to TEST and later PROD as a repeatable import, rather than
retyping it.

This changes only *where content originates* and *how it travels*. It does not
change the migration design's data model, plugin, theme, environments, or the
member/event data migration (§7), which still runs per environment from the old
application's database.

## Goals

1. Author the nine pages and their media **once**, locally.
2. Propagate that content to TEST, verify, then to PROD, as a repeatable step —
   no retyping, no per-environment re-authoring.
3. **Optionally** automate the mechanical creation of pages with Claude over a
   WordPress MCP server, so that "build the nine pages" becomes "generate them
   from supplied copy and the theme's patterns."

## Non-goals

- **Not a change to the data migration.** Members and events still come from the
  old database via the `wp canetons migrate` WP-CLI command (§7), run per
  environment. Content and member/event data travel by different paths and must
  not be conflated.
- **Not cloning per-environment configuration.** FluentSMTP's mailbox,
  UpdraftPlus's destination and Limit Login Attempts' state are per environment
  and are never propagated from local.
- **Not keeping the migration tooling installed.** The migration plugin and, if
  used, the WordPress MCP plugin are transient — installed to seed, removed after.

## The three constraints that decide the mechanism

1. **URLs are baked into the database.** WordPress stores its site URL in
   `wp_options` and embeds absolute URLs inside page content, menus and
   *serialized* plugin data. A naïve SQL find-replace corrupts serialized data;
   the rewrite must be serialization-aware.
2. **No SSH on the shared host.** `wp search-replace` (WP-CLI) cannot run on
   TEST or PROD. Any URL rewrite must run **locally before export** or through a
   **wp-admin** tool on the target.
3. **Per-environment config lives in the database too.** A whole-database clone
   from local would overwrite the target's FluentSMTP/UpdraftPlus settings, which
   are environment-specific.

## Decisions

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Where content originates | Built once **locally in Docker** | Authored in PROD (3× by hand); authored on TEST |
| Propagation mechanism | **A migration plugin** (All-in-One WP Migration, or Duplicator) — one archive, imported via wp-admin | Raw DB dump/import; WXR export/import alone |
| Media | **Bundled in the migration archive** | Manual re-upload; FTP-copying `wp-content/uploads/` separately |
| URL rewrite | **Done by the migration plugin's importer** (serialization-safe) | Manual SQL `REPLACE`; Better Search Replace by hand |
| Per-environment plugin config | **Re-applied on each target after import** | Cloned from local (would overwrite real mailbox/backup settings) |
| Member/event data | **Unchanged** — `wp canetons migrate` per environment (§7) | Carried in the content clone |
| Page creation (authoring) | Manual in the block editor, **optionally automated via WordPress MCP + Claude** | — |
| Local table prefix | Set local to **`qsjd_`** to match the servers | Leave local at the default `wp_` |

### Why a migration plugin over raw DB or WXR

- **Raw DB dump/import** hits all three constraints at once: it needs a matching
  table prefix, a serialization-safe URL rewrite that cannot run on the host, a
  separate `uploads/` copy, and it clobbers per-environment config. Most
  footguns, least recommended.
- **WXR** (Tools → Export/Import) moves content cleanly and does **not** clobber
  config, but it exports media as *references*, not files — and the importer can
  only fetch them from a source URL the target can reach, which `localhost` is
  not. Media then has to travel separately anyway.
- **A migration plugin** bundles content **and** media into one archive and
  rewrites URLs on import, through wp-admin, with no SSH. It is the shortest path
  to the owner's actual wish. Its cost is that it clones everything (users,
  options, config), which is handled by re-applying per-environment config after
  import and by keeping member/event data on its own path.

## Workflow

1. **Build locally.** Bring up the stack (`npm run wp:dev && npm run wp:setup`),
   deploy the theme and plugin, and author the nine pages using the theme's block
   patterns (committee cards, sponsor grid, instrument sections), uploading images
   into the local Media Library. This is the one-and-only authoring pass —
   optionally automated (see below).
2. **Export.** With the migration plugin, export the whole site to a single
   archive.
3. **Import on TEST** through wp-admin; the importer rewrites `localhost:8100` →
   the TEST URL and restores media.
4. **Re-apply TEST's per-environment config:** FluentSMTP mailbox, UpdraftPlus
   destination, Limit Login Attempts. Run `wp canetons migrate` against TEST for
   members and events. Verify (smoke checklist, spec §9).
5. **Import on PROD** from the *same* archive; rewrite URLs to the PROD URL.
6. **Re-apply PROD's per-environment config** and run `wp canetons migrate`
   against PROD. Follow the cutover checklist (`docs/cutover.md`).
7. **Remove the transient tooling** (migration plugin; MCP plugin if used) and
   refresh `docs/wordpress-install-manifest.csv`.

After this, TEST and PROD diverge as PROD receives real edits — accepted, exactly
as the migration design already anticipated (§6). PROD's database remains the
source of truth for content thereafter (§11 backups unchanged).

## Optional: MCP-assisted page creation

The authoring pass in step 1 can be automated with **Claude driving a WordPress
MCP server**, turning "build nine pages by hand" into "generate them from supplied
copy and the theme's patterns."

**How it works.** Install a WordPress MCP plugin (e.g. Automattic's
`wordpress-mcp`, which exposes WordPress's abilities — create/update posts and
pages, upload media — as MCP tools over an authenticated HTTP endpoint). Point an
MCP client (Claude Desktop or Claude Code) at that endpoint. Claude then creates
each page by calling the MCP tools, passing **block markup it generates from the
theme's patterns plus the committee's real French copy**. Because page content is
self-contained block markup, and the theme and plugin are already installed, the
pages render correctly once created.

**Target the local site, not PROD.** MCP page creation runs against the **local**
build; the pages then propagate through the migration plugin like any other
content. This keeps the credentialed MCP surface on a disposable local site and
off the live servers. (Pointing MCP directly at TEST/PROD is possible but adds a
credentialed control surface to a live host, and TEST's site-wide Basic Auth
obstructs the MCP HTTP calls — see migration design §8.)

**What MCP automates, and what it does not.** MCP automates the *mechanics* —
creating the page objects, setting titles and slugs, assembling block markup,
uploading media that already exists on disk. It does **not** invent the content:
the committee still provides the French copy and gathers the real photographs and
sponsor logos. The value is real for nine structured pages, but it is an
accelerator for authoring, not a replacement for it.

**Caveats and cleanup.**
- The WordPress MCP plugin is **not one of the six plugins** of migration design
  §4. It is transient: installed to seed, **removed immediately after**, and it
  never reaches TEST or PROD.
- It is a **control surface** over the whole site. Authenticate with a **scoped
  application password**, use it only against the local site, and **revoke it**
  when done.
- It is **not wired up in the Claude Code web session** where this design was
  written; it runs on the desktop, where an MCP client can reach a local
  WordPress. Treat this section as a documented option, not a completed setup.

## Local parity change

Set the local WordPress **table prefix to `qsjd_`** (via
`WORDPRESS_TABLE_PREFIX` in `docker-compose.yml`), matching TEST and PROD. The
migration plugin abstracts the prefix, so this is not strictly required for the
chosen mechanism, but it removes the last difference between local and server and
makes any future database-level operation a clean match. A one-line change,
applied on a fresh local database.

## Security and cleanup

- **Transient tooling is removed after seeding:** the migration plugin, and the
  MCP plugin if used. Neither belongs in the steady-state site of §4.
- **Credentials are scoped and revoked:** any application password created for
  MCP is local-only and revoked when the authoring pass is complete.
- **Manifest refreshed** (`npm run wp:manifest`) after tooling is added and again
  after it is removed, so the record of what runs alongside our code stays true.

## Testing and verification

- After the TEST import: the nine pages render styled; internal links and image
  `src`s point at the TEST URL (no `localhost` leaks); the Media Library shows the
  images; menus and the front page are set.
- The migration plugin's own import log reports the URL rewrite count.
- The existing smoke checklist (spec §9) covers the rest — contact form, login,
  planning/RSVP/summary.

## Risks

| Risk | Mitigation |
| --- | --- |
| A whole-site import overwrites a target's per-environment plugin config | Re-apply FluentSMTP/UpdraftPlus/Limit Login config after each import; it is a listed step |
| `localhost` URLs leak into imported content | Use the migration plugin's URL rewrite, then grep the rendered pages for `localhost` during verification |
| The MCP plugin is left installed on a live server | It is local-only and removed after seeding; the manifest refresh would surface it |
| Content clone and member/event migration are conflated | They travel by separate, documented paths; the content archive carries no members or events worth keeping |
| Free migration-plugin import size limit exceeded | A band site's media is small; if hit, use the plugin's chunked import or Duplicator |
