# Design — WordPress rebuild (greenfield)

**Date:** 2026-07-28
**Supersedes:** every design in this directory that describes the PHP/Laravel
architecture. In particular it abandons
`docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md` (the React
SPA cutover, never implemented beyond its generated API client) and retires the
architecture set out in `2026-07-23-laravel-api-foundation-design.md` and
`2026-07-25-api-cutover-laravel-design.md`.

## Context

Until now the site was two PHP applications sharing one origin: a
front-controller app in `app/` serving 19 server-rendered pages, and a Laravel
API in `api/` owning every `/api/*` route and the database schema. Around them
sat a large tooling estate — a Vite build with one entry per page, bespoke FTP
deploy tooling with a sync-state manifest and a mass-delete brake, AST-based
config-shape pre-flight checks, request-path auto-migration, an OpenAPI export
and a generated TypeScript client, and three tag-promoted environments.

That estate was production-grade and worked. It was also far more machinery than
a carnival brass band's website needs, and it could only be maintained by its
author. The decision was taken to rebuild on WordPress, minimising custom code,
so that the committee can maintain content and a wider pool of people can
maintain the site.

**This is a greenfield rebuild, and the old stack has already been removed from
this branch** — see §13. Nothing is preserved in the working tree: not the `app/`
pages, not the Laravel API, not the deploy tooling, not the schema. All of it
lives on the `archive/php-laravel-stack` branch, pushed to `origin`, which is
also the rollback path (§12). Only *data* and *content* carry over (§7).

A bare WordPress 6.9 install already exists on TEST at `/wp-test/`, with a
hand-written `.htaccess` solving two host-specific problems (§12). Nothing has
been built on it: stock themes only, no custom plugin, no uploads.

## Goals

Rebuild the public site and the members' area as a single WordPress
installation, with off-the-shelf plugins covering everything except one focused
custom plugin for event planning and attendance. Deliver a fresh visual design
rather than reproducing today's appearance.

## Non-goals

- **No souper signup.** The public dinner-reservation form, its menu
  configuration, the Altcha proof-of-work challenge, the honeypot, the
  confirmation email and the xlsx guest-list export are all out of scope. The
  feature is flag-gated off by default on every server today.
- **No historical signup or contact-message import.** Those tables are archived
  as an SQL dump and not migrated (§7).
- **No visual parity.** The old design is explicitly not a target (§5).
- **No QA environment.** TEST and PROD only (§10).
- **No REST API and no SPA.** The site is server-rendered. Nothing external
  consumes it.
- **No French/English translation layer.** The site is French-only (§2).
- **No rebuild of the deploy tooling.** The artifact is two directories (§10).

## Guiding principles

1. **Off-the-shelf unless proven insufficient.** Custom code is confined to one
   plugin, and only for requirements that no free plugin satisfies.
2. **WordPress conventions over ported patterns.** Capabilities, nonces, custom
   post types and the options API replace the equivalents built by hand today.
   Nothing is carried forward because it exists.
3. **The requirements inventory is the contract.** §1 is extracted from the
   current application and is what the rebuild is measured against. A
   requirement absent from §1 is out of scope.
4. **Rollback is redeploying the archive, not keeping two apps running.** The old
   stack was deleted outright rather than carried alongside; it is preserved on
   the `archive/php-laravel-stack` branch, and its database tables survive a
   cutover untouched (§12).

## Decisions

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Platform | WordPress 6.9, single install | Keep Laravel + build the React SPA |
| Events / RSVP | One custom plugin owning events, responses and summaries | Free events plugin + custom RSVP on top; pure off-the-shelf |
| Design | Fresh design, deliberately better | Visual parity via ported CSS; stock theme with light branding |
| Theme | Child theme of Twenty Twenty-Five | Standalone block theme; classic theme |
| Plugin budget | Free / open-source only | Paid plugins where they save days |
| Environments | TEST + PROD, same shared host | PROD only; add QA; managed WordPress hosting |
| Content authoring | Directly in PROD wp-admin | Author on TEST and promote content |
| Data carried over | Member accounts, events, page content and media | Also signups and contact messages; nothing at all |
| Event data model | Custom post type + post meta | Custom table; stock events plugin's CPT |
| Response data model | Custom table with a unique constraint | Post meta; user meta; a taxonomy |
| Roster ("Convoqués") | Derived from the `canetons_respond` capability | A stored member list or a dedicated taxonomy |

## §1 Requirements inventory

Extracted from the current application. This is the acceptance criteria for the
rebuild.

### 1.1 Events

- Fields: title, **start date/time and end date/time**, location, and attire
  (optional). *(Amended — see the note below; originally a single date plus a
  `weekend` boolean.)*
- A multi-day event displays as a date range; a single-day event as one date.
- Dates render in French; times render as `HH:MM`.
- The events list is sorted by start date ascending, and an event stays listed
  until its **end** date has passed, so an in-progress multi-day event remains
  visible.

> **Amended.** The event data model is an explicit **start date/time + end
> date/time** rather than a single date with a `weekend` boolean. It expresses a
> span of any length (not only a two-day weekend) and keeps an in-progress
> multi-day event on the public list. A single-day event has its end equal to its
> start. See §3.1.
- **The events list is readable without logging in.** Both `planning_repet.js`
  and `sinscrire.js` fetch it before authentication today.
- Holders of `manage_events` may create, edit and delete events. Nobody else
  may.

### 1.2 Responses

- An answer is exactly one of `participate` or `notparticipate`.
- **One response per member per event.** Answering again updates the existing
  answer rather than adding a second.
- Only holders of `respond` may write a response. Holders of `manage_events` /
  `view_summary` may not — see 1.4.
- **A member may only read and write their own response.** No request parameter
  names another user; the acting user comes from the session. This closes a
  previously-fixed IDOR and must stay closed.
- A logged-in member sees their own current answer alongside each event.

### 1.3 Attendance summary

Visible to holders of `view_summary` only, scoped to one event:

- Four counters: **Convoqués** (roster size), **Participe**, **Ne participe
  pas**, **Pas de réponse**. The last is roster size minus the other two.
- A roster table listing every member with their username, instrument, and
  answer rendered as `Participe` / `Ne participe pas` / `Pas de réponse`.
- **Participant counts per instrument**, counting only `participate` answers,
  with instruments ordered alphabetically.
- Instruments: Trompette, Trombone, Sousaphone, Cloches, Batterie, Lyre,
  Grosses-Caisse, Comité, Maquillage.

Note: in the old application this list was hardcoded in
`app/assets/js/inscriptions_admin.js` (lines 52–62 on
`archive/php-laravel-stack`), duplicating the `instruments` table. The rebuild has
one source of truth.

### 1.4 Capability matrix

**Not a hierarchy.** This is deliberate: the Team Direction organises events but
does not play in them, so excluding them from `respond` is what makes the "Pas
de réponse" count meaningful.

| Role | `respond` | `manage_events` | `view_summary` |
| --- | --- | --- | --- |
| user | yes | no | no |
| moderator | yes | no | no |
| admin | **no** | yes | yes |

### 1.5 Members

- Identified by username; usernames are unique.
- **No email address.** Members are children (roughly 6–16) who often have
  none.
- Passwords are hashed and admin-managed. There is no self-service reset.
- Each member optionally belongs to one instrument section.

### 1.6 Contact form

- Fields: last name, first name, email, subject (optional), message.
- Submissions are stored and emailed to the committee.
- Open to anonymous visitors.

### 1.7 Public pages

Nine informational pages: accueil, canetons, historique, commencement,
moniteurs, comité / team direction, cd, multimedia, sponsors. Plus the contact
page and a login entry point. The multimedia page links out to an externally
hosted gallery rather than holding media itself.

## §2 Architecture

One WordPress installation at the document root. Four parts:

| Part | Responsibility | Custom |
| --- | --- | --- |
| `canetons` theme | Visual design, templates, block patterns | Configuration + minimal CSS |
| `canetons-planning` plugin | Events, responses, roster summary, roles, instruments | **Yes — the only substantial code** |
| Third-party plugins | Contact form, role management and page gating, SMTP, backups, login hardening | No |
| Content | Nine pages authored in the block editor | No |

Site language is `fr_FR`. Because the site is French-only and server-rendered,
the entire translation layer disappears: no `translateApiError`, no
machine-token API error contract, no i18next. User-visible strings are French
literals in the templates and plugin; code, comments, identifiers and database
names stay English, per the project's language convention.

> **Amended.** The *public* pages are bilingual (fr-CH + de-CH) via two manual
> page trees — see
> `docs/superpowers/specs/2026-07-28-bilingual-public-content-design.md`. The
> code principle here is unchanged: the plugin and members' area stay French with
> no gettext layer; the bilingual-ness lives entirely in hand-authored content.
> wp-admin uses WordPress's native per-user language (de-CH, fr-CH via fr_FR,
> en-US).

There is no API. Browser writes are ordinary form posts to `admin-post.php`,
protected by WordPress nonces — which replaces Sanctum's stateful cookie flow,
the CSRF token priming, and the `apiFetch` wrapper wholesale.

## §3 The `canetons-planning` plugin

### 3.1 Events — custom post type

`canetons_event`, registered with `show_ui: true` and `public: false`.

This is where the leverage is: WordPress supplies the list screen, create,
edit, delete, sorting and per-capability permissions for free. The only custom
admin UI is a single meta box.

- Post title holds the event title.
- Post meta holds `start_date`, `start_time`, `end_date`, `end_time`,
  `location`, `attire`. Each registered with an explicit sanitize callback and
  `show_in_rest: false`. *(Amended — see below.)*
- Dates live in meta rather than `post_date` so that ordering and querying are
  explicit and the editor can set them freely.
- `map_meta_cap` maps the post type's capabilities onto `canetons_manage_events`.

> **Amended.** The event is modelled as an explicit **start date/time and end
> date/time**, replacing the earlier single `date` + `weekend` boolean. This
> reverses the original decision *not* to use a start/end pair: it expresses
> spans of any length, and querying on the end date keeps an in-progress
> multi-day event visible on the public list (the `weekend` model dropped it on
> its second day, because that day was past the single stored date). An empty end
> date defaults to the start date (a single-day event). The old app's `weekend`
> flag is carried over by the migration as `end_date = start_date + 1 day`.

### 3.2 Responses — custom table

`{$wpdb->prefix}canetons_responses`:

| Column | Type |
| --- | --- |
| `id` | bigint unsigned, auto-increment, primary key |
| `user_id` | bigint unsigned |
| `event_id` | bigint unsigned |
| `answer` | enum(`participate`, `notparticipate`) |
| `created_at` | timestamp, default current |
| `updated_at` | timestamp, nullable |

with `UNIQUE KEY (user_id, event_id)`.

A real table rather than post or user meta, for two reasons: the unique
constraint makes requirement 1.2's "answering again updates" correct by
construction rather than by application logic, and the summary is an aggregate
join that meta tables serve badly.

Created by `dbDelta()` on activation, guarded by a schema-version option so
re-activation is a no-op. Rows are removed when their user or event is deleted,
via WordPress's `deleted_user` and `before_delete_post` hooks — MySQL foreign
keys are not used, because WordPress core does not use them and shared-hosting
MariaDB configurations vary.

### 3.3 Instruments

User meta `canetons_instrument`, holding one value from a list defined once in
PHP and exposed through a filter. Set by an administrator on the user profile
screen. Requirement 1.3's instrument list is that list — one source of truth,
replacing today's duplication between the `instruments` table and the JS.

### 3.4 Roles and capabilities

Registered on plugin activation:

| Role | `canetons_respond` | `canetons_manage_events` | `canetons_view_summary` |
| --- | --- | --- | --- |
| `canetons_member` | yes | no | no |
| `canetons_moderator` | yes | no | no |
| `canetons_direction` | **no** | yes | yes |
| `administrator` (core) | **no** | yes | yes |

All four also hold core `read`.

WordPress does not implicitly grant custom capabilities to administrators, so
requirement 1.4's non-hierarchy holds by default rather than needing to be
defended. `administrator` is granted the two management capabilities explicitly
so that site maintenance works, and is deliberately *not* granted
`canetons_respond`.

### 3.5 Surfaces

**Planning (front end).** A block rendering upcoming events. Anonymous visitors
see the list (requirement 1.1). A member holding `canetons_respond`
additionally sees their own current answer and two buttons. Submitting posts to
`admin-post.php` with a nonce; the acting user comes from the session and no
field names a user (requirement 1.2).

**Événements (wp-admin).** The custom post type's own screens, plus the meta
box from §3.1. No custom list table.

**Résumé des inscriptions (wp-admin).** A submenu page, gated on
`canetons_view_summary`, taking an event as its parameter and rendering the four
counters, the roster table and the per-instrument counts of requirement 1.3.

### 3.6 The roster is derived, not stored

"Convoqués" is every user holding `canetons_respond`. Nothing stores a member
list.

This falls out of §3.4 and gives two things for free: Direction and
administrators are excluded automatically, which is what makes "Pas de réponse"
meaningful; and adding a member requires creating exactly one WordPress user,
with no second list to keep in step.

## §4 Third-party plugins

All free, all installed and updated through wp-admin per environment — never
part of a deploy (§10).

| Plugin | Why |
| --- | --- |
| Fluent Forms | Contact form. Chosen over Contact Form 7 because entry storage, a honeypot and email notifications are built in rather than needing add-ons. Covers requirement 1.6 with no code. |
| Members | UI over roles and capabilities, and per-page restriction for the members-only planning page. The plugin registers roles in code (§3.4); this makes them inspectable and adjustable. |
| FluentSMTP | The host's SMTP ports are non-standard (465 for SSL, 4650 for STARTTLS — not 587), so `wp_mail`'s defaults do not work. |
| UpdraftPlus | Scheduled off-site backups of database and uploads (§11). |
| Limit Login Attempts Reloaded | `wp-login.php` is publicly reachable and members have weak, admin-set passwords. |
| WP Dark Mode | A front-end dark-mode toggle. The one deliberate step past the five-plugin budget, at the site owner's request: theme.json cannot express a per-visitor `prefers-color-scheme` switch, and a `/styles` variation is admin-global rather than automatic. Front-end only; it touches none of the plugin's logic. If its upsell noise proves too heavy, the fallback is a hand-written `prefers-color-scheme` block in the theme's single `style.css`. |

Because none of these is tracked in git (§10), nothing would otherwise record
what runs alongside our code — a restore would recover the theme and plugin and
leave the rest unknown. A generated manifest,
`docs/wordpress-install-manifest.csv`, records core and plugin versions and is
refreshed and committed after every update. It is deliberately a diffable text
file rather than only a backup archive: "when did this plugin change, and did the
bug start then?" is a question a binary backup cannot answer.

**Local development installs only a subset, by script**, so a developer's stack
is reproducible after a reset. FluentSMTP is replaced locally by a small mounted
mu-plugin routing mail to Mailpit (both hook `phpmailer_init`, so running both
would mean debugging whichever won); UpdraftPlus and Limit Login Attempts
Reloaded are skipped as purely operational — and the latter would lock a
developer out of their own site while testing the login. WP Dark Mode *is*
installed locally, since it is cosmetic front-end and wants seeing. Servers are
unaffected: on TEST and PROD all six are installed and updated through wp-admin
as above.

## §5 Theme and design

A child theme of Twenty Twenty-Five named `canetons`. Chosen over a standalone
block theme because it inherits maintained templates and needs only the
overrides we actually want; chosen over configuring Twenty Twenty-Five directly
so that customisations survive parent updates.

The design lives in `theme.json` — colour palette, typography, spacing scale —
rather than in stylesheets. Recurring layouts become block patterns: the
sponsor grid, the committee cards, the instrument-section cards. Custom CSS is
permitted only where `theme.json` cannot express something.

A design phase precedes theme work and settles palette, typography and page
layouts. Today's appearance is not a reference (§Non-goals); the ~2,200 lines of
Bulma-based CSS are not ported.

## §6 Content

The nine pages of requirement 1.7 are authored as WordPress pages in the block
editor, using the patterns from §5. The multimedia page keeps its outbound link
to the external gallery.

Content is authored **directly in PROD** (§Decisions). TEST content will
therefore diverge from PROD; that is accepted, because TEST exists to verify
theme and plugin changes, not content.

> **Amended.** The "authored directly in PROD" decision is superseded for the
> initial build by
> `docs/superpowers/specs/2026-07-28-content-propagation-and-mcp-authoring-design.md`,
> which builds the content once locally and propagates it to TEST then PROD via a
> migration plugin (optionally creating pages with Claude over a WordPress MCP).
> The rest of this section — patterns, the multimedia outbound link, and the
> database as the content source of truth — still holds.

The consequence is significant and drives §11: **the database becomes the
source of truth for content**, where today content is in git and recoverable
from it.

## §7 Data migration

**Database topology — confirmed 2026-07-28.** WordPress and the old application
use **separate databases**, not one shared database with a table prefix
separating them. Read from each environment's server-owned `config.php` over FTP:

| Environment | Old application | WordPress |
| --- | --- | --- |
| TEST | `lescanetoqg3` | `lescanetoqg5` (prefix `qsjd_`) |
| PROD | `lescanetoqg2` | **not yet created** |

This host provisions several databases per account, so the earlier assumption
that shared hosting implies one database was wrong. Three consequences:

1. **The migration command needs two connections** — WordPress's own `$wpdb` for
   writing, plus a second connection built from the old `config.php`'s `db`
   credentials for reading. A cross-database query is not an option: each
   database has its own user, with no grant on the other.
2. **§12's isolation guarantee is stronger than it was drafted.** Cutover cannot
   touch the old data at all, because the old data is in a different database —
   this no longer rests on table names merely being distinct.
3. **A WordPress database must be created on PROD before cutover**, through the
   hosting control panel. TEST's `lescanetoqg5` has no PROD counterpart yet, and
   nothing in this plan creates one.

Carried over:

- **Member accounts** — username and role become a WordPress user, plus their
  instrument as user meta. Roles map `user` → `canetons_member`, `moderator` →
  `canetons_moderator`, `admin` → `canetons_direction` (§3.4). Passwords are
  **not** migrated: every member receives a new admin-set password
  communicated out of band. (Even where bcrypt hashes might validate, mixing
  hash provenance across a platform change is not worth the ambiguity.)
- **Events** — past and upcoming, as `canetons_event` posts with meta.
- **Page content and media** — French copy, photographs and sponsor logos,
  re-entered and re-uploaded.

Not carried over: souper signups and contact messages. Both tables are exported
to a dated SQL dump kept outside the web root as an archive.

Members have no email address (requirement 1.5), but WordPress's user admin
requires one. The import assigns synthetic addresses of the form
`<username>@membres.lescanetons.invalid`. `.invalid` is reserved by RFC 2606 and
can never resolve, so no mail can escape to a real recipient. Password reset is
disabled for the three `canetons_*` roles, keeping passwords admin-managed as
requirement 1.5 specifies.

Migration runs as a one-off WP-CLI command shipped in the plugin and removed once
cutover is complete. It opens a second connection to the old database using the
credentials in that environment's old `config.php`, reads there and writes through
WordPress — see the topology note above for why one connection cannot serve both.

## §8 Security

- **Capability checks on every write**, server-side, in the plugin. Requirement
  1.2's own-response-only rule is enforced by taking the user from the session
  and accepting no user-identifying input.
- **WordPress nonces** on every state-changing request.
- **Members-only gating** on the planning page via the Members plugin, with the
  plugin's own capability checks as the actual enforcement — page restriction is
  presentation.
- **Hardening:** disable the theme/plugin file editor (`DISALLOW_FILE_EDIT`),
  disable XML-RPC, close comments and trackbacks across all post types (the site
  has no use for them), and enable core minor auto-updates.
- **Output escaping** on everything rendered, matching the care taken today
  where event data goes through `textContent` and never `innerHTML`.
- TEST stays behind HTTP Basic Auth. Note that this affects `wp-admin` and
  `admin-ajax.php` on TEST, and that this host returns 500 on a per-path
  `.htaccess` exemption — so TEST is entirely behind Basic Auth or not at all.

## §9 Testing

Proportionate to one plugin. The current 6,000-line suite guarded an API
contract that ceases to exist.

- **Unit tests** (plain PHPUnit, no WordPress bootstrap) over the pure logic:
  summary aggregation, per-instrument counting, and the weekend date-range
  formatting. These hold the arithmetic of requirement 1.3.
- **Integration tests** (WordPress's PHPUnit harness, in Docker) over two
  things: response upsert idempotency (requirement 1.2), and capability
  enforcement across all three surfaces of §3.5 including the negative cases —
  that `canetons_direction` cannot respond and that `canetons_member` cannot
  reach the summary. This is a security boundary and gets real coverage.
- **A manual smoke checklist** for theme, content, contact form and login.
  These are configuration; automated tests would buy little.

## §10 Local development, environments and deploy

**Local:** Docker Compose running WordPress on PHP 8.4 with MariaDB 10.3,
matching production versions.

**TEST:** the existing `/wp-test/` install, for verifying theme and plugin
changes before PROD.

**PROD:** the document root, from cutover onwards.

**The deploy artifact is two directories:** `wp-content/themes/canetons/` and
`wp-content/plugins/canetons-planning/`. WordPress core, third-party plugins,
uploads and `wp-config.php` are server-owned — installed and updated through
wp-admin, never written or deleted by a deploy.

The deploy is a small FTP upload script for those two directories. It
deliberately does **not** reproduce the current tooling's sync-state manifest,
mass-delete brake, config-shape pre-flight check or parallel connection pool: at
two directories with no server-owned files inside them, that machinery has
nothing to protect against.

## §11 Backups and maintenance

Because content lives in the database (§6), backups stop being optional.

- UpdraftPlus scheduled to off-site storage: database daily, uploads weekly.
  **Configured before any content is entered.**
- A manual backup precedes every PROD theme or plugin deploy, and every
  third-party plugin update.
- Core minor releases auto-update. Major releases and plugin updates are applied
  on TEST first, then PROD.

## §12 Cutover and rollback

**Cutover is a hard switch.** The old application's files are removed from the
document root and replaced by WordPress, rather than left running alongside it.
This was a deliberate simplification: keeping both would have bought an instant
routing-level revert that a band website does not need, at the cost of every plan
carrying a coexistence constraint.

What makes it safe is that **rollback does not depend on the old files still being
there**:

- The old stack is preserved in full on the `archive/php-laravel-stack` branch,
  pushed to `origin`. Rolling back means redeploying it — minutes over FTP, not
  seconds, which is the trade accepted here.
- **The old data is never touched** — it is in a *different database* (§7:
  `lescanetoqg2` on PROD, versus a WordPress database yet to be created). Cutover
  replaces files in the document root and cannot reach it. Distinct table names
  and the `qsjd_` prefix are a second, redundant layer rather than the guarantee.
- A full backup is taken immediately before cutover (§11).

The old tables stay in place for one month after cutover, then are dropped once
the WordPress data is confirmed good.

Two non-stock rules must carry into the root `.htaccess`, both solving
host-specific problems already diagnosed in the working `.htaccess` of the
existing `/wp-test/` install. That file is the reference implementation and lives
only on the server and in a local scratch copy under `.tmp/` — it is not tracked,
so both rules are restated here in full:

1. **The directory-request rewrite.** This host answers a bare directory request
   with an external 301 appending `index.php`; WordPress's
   `redirect_canonical()` strips it back off, and the two redirect at each other
   forever. An internal rewrite in the fixup phase avoids it. `[L]` only, never
   `[R]`.
2. **The cache-header override**, undoing immutable asset caching. WordPress
   versions assets with a `?ver=` query string rather than a content hash, so a
   one-year `immutable` policy would pin them indefinitely.

Related finding, worth fixing while the two applications coexist: the tracked
`app/.htaccess` front-controller catch-all does **not** exclude `/wp-test`,
though the WordPress `.htaccess` comment asserts it does. Neither
`app/.htaccess` nor `staging/test/.htaccess` (both on
`archive/php-laravel-stack`) mentions
`wp`. The subtree survives only because its own file turns the rewrite engine
on, so per-directory rules stop being inherited. If that file is ever lost,
WordPress URLs reach the old front controller instead of 404ing.

## §13 What was deleted

**Done, at the start rather than at cutover.** The original plan kept the old
stack in the working tree until cutover succeeded; that was dropped in favour of
a clean tree, because the coexistence it bought is not needed (§12) and every
plan would otherwise have carried the constraint.

Removed from this branch: `app/`, `api/`, `web/`, `tools/`, `staging/`, `config/`,
`docker/`, `tests/`, the Vite build, both Composer projects, the GitHub Actions
build/deploy/promotion workflows, the old `docker-compose.yml`, and the root
JS/PHP toolchain (`eslint`, `stylelint`, `prettier`, husky, lint-staged,
`phpcs.xml`, `phpunit.xml`, `orval.config.ts`, `tsconfig.json`,
`vitest.config.ts`). All of it is preserved on `archive/php-laravel-stack`.

Kept:

- `docs/superpowers/` — the project's design history, including the retired
  stack's.
- `.github/workflows/pr-title.yml` plus the issue and PR templates. The
  Conventional Commits check is still correct; CI for the WordPress build is
  Plan 8's job.
- `.claude/` — agent tooling, not application code.
- `.env.test` / `.env.qa` / `.env.prod`, git-ignored. They hold the live FTP
  credentials the WordPress deploy will reuse; deleting them would destroy
  working secrets.

Deliberately not replaced yet: PHP linting. WordPress Coding Standards belongs
with the plugin's own Composer dev dependencies, so the old root `phpcs.xml` went
rather than being adapted.

## §14 Effort

| Phase | Days |
| --- | --- |
| Design direction — palette, typography, page layouts | 3–5 |
| Theme: `theme.json`, templates, block patterns | 4–6 |
| Content entry: nine pages, images, sponsor logos | 3–4 |
| Contact form and SMTP configuration | 1 |
| `canetons-planning` plugin | 8–12 |
| Data import: members and events | 2–3 |
| Environments, deploy script, backups, hardening | 3–4 |
| Tests and smoke checklist | 3–4 |
| Cutover and buffer | 2–3 |
| **Total** | **29–42 days** |

Roughly six to eight and a half weeks for one developer. Lower than the 38–57
days first estimated for a WordPress migration, because the souper signup left
scope and greenfield removed the schema-adoption work; the fresh-design phase
adds some of it back.

## §15 Risks

| Risk | Mitigation |
| --- | --- |
| Content lives in a database on shared hosting, no longer in git | §11, configured before any content is entered |
| WordPress on shared hosting carries a permanent update obligation that the current stack does not | §8 hardening, §11 update policy, minimal plugin count |
| Members' synthetic `.invalid` addresses interact badly with a plugin that assumes real ones | Only six third-party plugins, none of which mails members; password reset disabled for member roles |
| The design phase has no clear finish line and can absorb unbounded time | Settle palette, typography and layouts as a deliverable before theme work starts |
| Custom plugin diverges from requirement 1.4's non-hierarchy under future edits | Negative capability cases are covered by integration tests (§9) |
| Basic Auth on TEST obstructs `wp-admin` and `admin-ajax.php` | Accepted: this host 500s on per-path exemptions, so TEST is wholly behind Basic Auth |

## §16 Open question

The design direction itself — palette, typography, page layouts — is
deliberately unsettled here and is the first phase's deliverable. Everything
else in this document is decided.
