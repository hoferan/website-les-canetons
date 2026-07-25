# Design — `/api/*` cutover to Laravel (sub-projects 2a-ii + 2b, combined)

**Date:** 2026-07-25
**Supersedes:** the "Prerequisites for sub-project 2a-ii" section of
`docs/superpowers/plans/2026-07-25-local-docker-prod-parity.md`, and
`docs/handover-2026-07-25.md` (see §11 — that file is deleted when this lands).

## Context

Sub-project 1 (tag-based promotion) and 2a-i (Laravel foundation, Sanctum auth,
guarded migrations) are merged. The local Docker stack already runs the target
architecture: a single origin, one Apache, one PHP-FPM pool, with all of
`/api/*` dispatched into Laravel. On real servers nothing dispatches yet — the
old app still serves every endpoint.

This sub-project performs the cutover. It combines what were planned as two
sub-projects, because the dispatch rule is all-or-nothing (§4).

## Goals

Port the five remaining endpoints — `contact`, `signups`, `altcha`, `events`,
`responses` — to Laravel, activate `/api/*` and `/sanctum/*` dispatch on all
environments, keep the old session-gated pages working, and retire the old
app's API layer and migration system.

## Non-goals

- **The React/Tailwind SPA** — sub-project 3. The old pages, their JS, and the
  French display layer stay exactly as they are.
- **Retiring `$_SESSION` page-gating** — also sub-project 3. This sub-project
  adds a deliberately temporary bridge (§5) to keep it working.
- **Public pages and the auth page** — sub-project 4, undecided.
- **The `.env` shape drift-check** — deferred again; see §9.
- **Reworking the Laravel tree's `.htaccess`** — deliberately left alone; see §6.
- **Renaming `api-laravel/` to `api/`** — a follow-up PR once this cutover is
  verified on PROD; see §12. The end goal is that name, but the rename carries
  its own site-wide-500 hazard and must not share a deploy with this one.

## Decisions

Each of these was chosen explicitly, with alternatives considered.

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Sequencing | Ship 2a-ii + 2b as one cutover, with the wildcard `^api(/\|$)` rule | Per-path dispatch list; dispatch-free 2a-ii |
| Dual session | Laravel writes `$_SESSION` | Laravel reads `$_SESSION`; one shared session store |
| Laravel tree `.htaccess` | Touch neither file (§6) | Per-env generated `public/.htaccess`; guarded per-directory denies |
| Dispatch flag | `[L]` everywhere, unconditionally | `[END]` (Apache 2.4-only); probe the host version first |
| Migrate token | `X-Migrate-Token` header; the controller adapts | Body param; accept both |
| Port style | Eloquent + Laravel validation + Laravel Mail, with a custom error renderer | Lift-and-shift the `App\` classes; adopt Laravel's native 422 shape |
| Old migrations | Delete `sql/migrations/` and the old migrator entirely (§7) | Keep them, applied by `AutoMigrator` on first request |
| Laravel server config | Hand-provisioned `.env`, added to `PROTECTED` (§9) | Build the drift-check now; render `.env` at deploy time |
| Bot protection | Keep self-hosted Altcha; drop `used_challenges` for `Cache::add()` (§1) | Cloudflare Turnstile; honeypot + rate limiting only |
| `api-laravel/` → `api/` | Follow-up PR after PROD verification (§12) | Same PR as the cutover; keep the name permanently |

## 1. Scope of the port

One PR, one cutover. No new DB migrations: 2a-i's guarded migrations already
cover all seven tables, so this is a code-only change — which materially lowers
its risk.

New Eloquent models `ContactMessage`, `Signup`, `UsedChallenge`, `Event`,
`Response` join the existing `User` and `Instrument`. Five controllers, a
FormRequest per write endpoint, and the capability matrix from 2a-i
(`api/tests/Unit/CapabilityTest.php`) expressed as Gates or middleware for
`respond`, `manage_events` and `view_summary`.

Two pieces of the old app move rather than get rewritten:

- **`App\Altcha` → `App\Support\Altcha`, ported as-is.** Laravel ships no bot
  protection for public forms at all — no CAPTCHA, no proof-of-work. The
  alternatives are external services (Turnstile, hCaptcha) or weaker packages
  that only duplicate the honeypot this code already has *in addition to*
  Altcha. This implementation is self-hosted, Altcha-wire-compatible, and
  deliberately fail-closed to mitigate advisory GHSA-82w8-65qw-gch6 in the
  upstream PHP library, so replacing it would be a downgrade.
- **`used_challenges` is dropped; the replay guard moves to Laravel's cache.**
  `ChallengeRepository::consume()` is an atomic "insert if absent, report
  whether it was new", plus a manual prune of day-old rows. That is exactly
  `Cache::add($key, true, $ttl)`, which is atomic, returns `false` when the key
  exists, and expires by itself so the prune disappears. The TTL comes from the
  challenge's own `?expires=<unixts>` in its salt. Laravel's `cache` table
  already exists from 2a-i, so this replaces a bespoke table with the
  framework's own infrastructure.

  Two conditions: it requires the **database** cache store, not `file` or
  `array`, so the guard is shared and durable; and `artisan cache:clear` would
  clear outstanding guards, permitting one replay inside a challenge's short
  remaining TTL by an attacker holding the exact payload. Both are acceptable;
  neither is silent.

  Dropping the table needs a **new** migration. `2026_07_23_000005_create_used_challenges_table.php`
  has already run on all three servers and is recorded in Laravel's
  `migrations` table by filename, so it stays where it is.
- **`App\Mailer::sendConfirmation` → a Mailable** over the same SMTP settings.

The xlsx export keeps `shuchkin/simplexlsxgen`, added to `api/composer.json`
and streamed from the controller.

### Behaviours that must survive the port

These are security- or correctness-relevant, and each is easy to lose silently
in a rewrite. Every one needs a test.

- **The honeypot returns 201 without storing or mailing.** A trapped bot must
  not learn it was trapped, so the response is indistinguishable from success.
- **Altcha fails closed on an empty or `CHANGE_ME` HMAC secret.** The example
  secret is public, so any challenge signed with it is forgeable. A
  half-configured server must reject, never accept.
- **The single-use replay guard runs before any insert or mail**, now via
  `Cache::add()` rather than `used_challenges`.
- **A mail failure must not fail the request.** The reservation is already
  stored; log the error and still return 201.
- **`GET /api/events` annotates only the caller's own response.** There is
  deliberately no `?username=` parameter — that absence is what keeps a
  previously-fixed IDOR closed.
- **Reading events is public; all writes require `manage_events`.**

## 2. The error contract

`app/assets/js/i18n.js`'s `translateApiError()` is the only place in the whole
system where French is computed. It consumes:

```json
{"error": "...", "code": "validation_failed",
 "fields": [{"field": "email", "reason": "invalid_format", "params": {}}]}
```

Laravel's default `{message, errors: {field: [prose]}}` is incompatible, and
this front-end is not replaced until sub-project 3. So one renderer registered
in `bootstrap/app.php`'s `withExceptions()` converts `ValidationException` and
the auth exceptions into the existing shape, mapping Laravel rule names onto
the existing `reason` vocabulary (`required`, `invalid_format`, `invalid_type`,
`invalid_value`, `too_long`).

This is not a wart to be removed later. The existing contract carries stable
machine-readable tokens where Laravel's carries English prose, which is
strictly better for a client-side i18n layer — and keeping it upholds the
project rule that API bodies are English and translation happens only at the
display layer.

**One test earns its keep here:** assert that every `reason` and `field` token
the API can emit exists as a key in `i18n.js`. Without it, a mismatch degrades
silently to `"Une erreur est survenue"` and nobody notices.

## 3. Old app removal

**The end goal is that `app/api/` no longer exists**, and this sub-project
reaches it: all eight handlers and the route generation that requires them in
`app/src/routes.php` are deleted, leaving no old API layer behind. What remains
after this PR is only the *directory name* of the Laravel tree, addressed in
§12.

Then delete only what becomes unreachable:
`App\Altcha`, `App\Mailer`, `App\Http\JsonResponse`, all of `App\Dto`, all of
`App\Validation`, and the `Event`, `Response` and `Challenge` repositories —
plus their unit and integration tests.

**`App\Auth` and `App\Repositories\SignupRepository` stay.** Nine pages
under `app/pages/` still `use` them. "Remove the old handlers" is not "delete
the `App\` layer", and conflating the two would break the members' area.

`App\Repositories\UserRepository` is deleted **only if** `App\Auth` no longer
needs it once login moves to Laravel — verify before removing, since `Auth`
retains `check()`/`user()` for page-gating.

## 4. Dispatch

The block in `docker/web/api-dispatch.htaccess` moves into `app/.htaccess`,
with `[END]` changed to `[L]`. `tools/build-overlays.mjs` stops merging a
docker-specific block; that file, its merge code and its tests are deleted.
Local dev and all three servers then share one spelling in one file, which is
the local-parity principle #50 established.

**Why `[L]`, not `[END]`.** `[END]` was added in Apache 2.3.9, so it does not
exist on 2.2. The host's version is unresolved, `staging/README.md`'s record
that it 500s on `<RequireAny>` leans 2.2, and no `<IfModule>` can guard a
`RewriteRule` flag — an unknown flag is a syntax error, which on this host
means a 500 on every request to the entire site, not a broken endpoint.

`[L]` is safe on both versions and is already known to work here: the previous
session verified empirically that swapping `[END]` for `[L]` still returned
Laravel's 401, because `REDIRECT_STATUS` stops the front-controller catch-all
on the second pass. That is not a new dependency — the catch-all in
`app/.htaccess` already relies on `REDIRECT_STATUS` on this FastCGI host.

The header-forwarding rules (`HTTP_AUTHORIZATION`, `HTTP_X_XSRF_TOKEN`) move
with the block. `Authorization` in particular does not reach PHP on CGI-family
SAPIs without them.

`^api(/|$)` cannot match `api-laravel/...` — the hyphen defeats `(/|$)` — which
is why the rewrite does not loop.

## 5. Session bridge (temporary by construction)

On a successful `AuthController::login`, call `session_start()` and populate
`$_SESSION['user']` in the exact shape `App\Auth::user()` returns; `logout`
destroys both the Sanctum session and the PHP one. Sanctum is the source of
truth; the old pages ride along.

This is only possible because both apps now share one PHP-FPM pool — it could
not have been done before #50, when they were separate services on separate
ports. It is confined to one class so sub-project 3 removes it in one commit,
and it must carry a comment saying so.

The old login JS gains a `GET /sanctum/csrf-cookie` call before
`POST /api/login`; without it Sanctum rejects the POST with 419.

## 6. The Laravel tree's `.htaccess` — deliberately unchanged

Neither `api/.htaccess` (deny-all) nor `api/public/.htaccess` (re-grant) is
modified. This reverses the earlier judgement that fixing the deploy CLI's
protected-set matching was a prerequisite, on the following grounds:

- **Basic Auth on TEST/QA is bot-exclusion, not a security boundary.** Its
  purpose is keeping crawlers off the staging sites.
- **The Laravel tree is not exposed on servers.** `app/.htaccess`'s
  front-controller catch-all has no `!-f` guard — deliberately — so
  `/api-laravel/.env` is rewritten to `index.php` and 404s. It stays that way
  after dispatch is live, since `^api(/|$)` cannot match `api-laravel/...`.
  `tools/build.mjs` also strips `.env` from the artifact, so `APP_KEY` was
  never shipped.
- **The two known bugs cancel out.** The deploy CLI treats `.htaccess` as a
  protected basename at any depth, so neither nested file ever reaches a
  server. The *grant* in `public/.htaccess` is what would have overridden
  TEST/QA's inherited `Require valid-user`; since it never arrives, dispatched
  `/api/*` stays behind Basic Auth on staging, which is the desired behaviour.
- **Dispatch does not need `public/.htaccess`.** `[L]`/`[END]` bypass its
  rewrite rules anyway, and the dispatch block re-adds the header forwarding.

**The one move to avoid:** making the protected set root-relative *without*
also reshaping the grant would deliver `public/.htaccess` to staging and open
`/api/*` to bots — the only endpoints with side effects (`contact` sends mail,
`signups` writes rows). Fixing that CLI bug is therefore explicitly out of
scope here, and both files' comments are corrected to record this reasoning.

Because no `Require` directive is added anywhere, the unresolved Apache version
does not gate this sub-project. The existing `<IfModule>` guard pairs stay
exactly as they are.

## 7. Retiring the old migration system

`sql/migrations/` holds only two files (`001_create_signups.sql`,
`002_create_used_challenges.sql`), both superseded by Laravel's create-or-adopt
migrations. Delete them, along with `App\Migrator`, `App\AutoMigrator`,
`tools/migrate.php`, `app/api/migrate.php`, their two integration tests,
`tools/build.mjs`'s `sql/migrations` copy step, and the old-migrations step in
the Docker entrypoint.

Laravel becomes the single schema owner, so `POST /api/migrate` running
`artisan migrate` is complete rather than partial, and nothing depends on
`auto_migrate` any more.

Two prerequisites, in this order:

1. **Confirm no server is behind.** Run `npm run dbmigrate:<env> -- --dry-run`
   against TEST, QA and PROD. If any reports pending work, deleting the files
   orphans that server's schema.
2. **Align the create branches with the adopt result.** Servers took the adopt
   path, so their `signups.id` is `int(10) UNSIGNED`; the Laravel create branch
   uses `$table->id()`, which is `bigint unsigned`. A fresh local database
   would therefore diverge from every server. Change it to
   `$table->increments('id')`.

   `signups` is now the only table needing this. `used_challenges` would have
   needed the same audit, but §1 drops it — its create-or-adopt migration still
   runs, then the new drop migration removes the table, so any divergence in
   between is irrelevant.

Prerequisite 2 is the reason the previous session kept these files. Skipping it
would silently forfeit the local/prod schema parity that #50 exists to provide.

**Sequencing consequence.** Removing `auto_migrate` and `migrate.token` from
`config/config.example.php` makes the deploy CLI's config-shape pre-flight
refuse every deploy, because it reports drift in both directions — including a
key the server still has that the code no longer expects. All three servers'
`config.php` must be hand-edited **before** the deploy that removes them.

## 8. The migrate token

`MigrateController` changes to read the `X-Migrate-Token` header, matching what
`tools/dbmigrate.mjs` and every environment's CI secrets already send. Nothing
outside the Laravel app changes, and `tools/smoke-docker.mjs` can stop sending
the token both ways.

This also closes the `?token=…` query-string path that `$request->input()`
accepts today and that Apache would write into its access log. Neither spelling
was a framework default — `MigrateController` is our own code, added in
`e904b92`; Laravel ships no HTTP migrate endpoint, because running migrations
over HTTP is bespoke to this host, where remote DB login is blocked.

## 9. Laravel's server-side configuration

**This is the largest missing piece of the cutover.** `tools/build.mjs` strips
`.env` from the artifact and nothing recreates it, so `APP_KEY`, the database
credentials and `MIGRATE_TOKEN` do not exist on TEST, QA or PROD. The first
dispatched request would fail outright. The 2a-i design anticipated this (its
§6, and its own known-gaps note that "the deployed Laravel app first needs a
server-side `.env` to function"); it was never built.

- **Provision `api-laravel/.env` by hand, once per server**, from a committed
  `api/.env.example`, exactly as `config.php` is. Document it in
  `staging/README.md`.
- **Add `.env` to the deploy CLI's `PROTECTED` set.** It is not there today.
  Routine state-based deploys would not touch it, but a `--relist` or a
  bootstrap deploy sees it as a stale remote file and would **delete the
  server's Laravel configuration**. The basename-at-any-depth matching left
  in place by §6 works in our favour here.
- **The shape drift-check stays deferred.** It is a convenience until Laravel
  config starts changing often, and this PR is already the riskiest change in
  the project. The deletion hazard above is closed regardless.

Each server's `APP_ENV`/`APP_DEBUG` must match its environment; `APP_DEBUG`
true on PROD would render stack traces into API responses.

## 10. Testing and rollout

**Laravel Feature tests** per endpoint, including exact assertions on the error
JSON shape, plus the `i18n.js` token-coverage test from §2 and a session-bridge
test asserting `$_SESSION`'s shape after `POST /api/login`. The Laravel suite
keeps using its throwaway `laravel_api_test` database — `RefreshDatabase` drops
every table and must never touch the shared one.

**Old app:** delete the tests for deleted classes; the rest stay green.

**`npm run smoke`** extends to the five now-live endpoints, which lets the
"Known limitation — `/api/*` is ahead of the code" section be removed from
`CLAUDE.md`. One check must assert dispatch survives the front-controller
catch-all, since that is what `[L]` changes.

**Rollout:** merge to `main` auto-deploys TEST. Verify login, RSVP, contact,
signup and the admin xlsx export by hand there. Then tag, deploy QA, verify,
deploy PROD. Rollback is redeploying the prior tag, which restores
`app/.htaccess` and the old handlers together — they must never be promoted
separately.

**Server-side prerequisites, before the first deploy that lands this:** each
server needs its `api-laravel/.env` placed (§9) and its `config.php` trimmed
(§7). Both are hand steps on three servers.

## 11. Corrections to earlier documents

Fold these in and delete `docs/handover-2026-07-25.md`, per its own
instruction. It is currently untracked.

- **The deploy-tooling branch is not a blocker.** `tools/deploy/` is already on
  `main` via #49/#50. `feat/deploy-tooling-improvements` is now *behind* main
  and carries nothing needed here; the handover's §6 is stale. Any fix belongs
  on `main` directly.
- **The nested-`.htaccess` bug is defense-in-depth, not an open exposure.** The
  handover attributes the 404 on `/api-laravel/.env` to the file never being
  uploaded; the root catch-all is the actual protection, and `.env` is stripped
  from the artifact. Severity is lower than recorded, and §6 explains why
  fixing it alone would be harmful.
- **`[END]` is Apache 2.4-only.** The handover treats the host's Apache version
  as mattering only for `Require` spellings. It also governs the dispatch flag,
  where the failure mode is a site-wide 500. §4 removes the dependency.
- **Laravel has no server-side `.env`.** Absent from the handover entirely.
- **`sql/migrations` is retired, not preserved.** The handover assumes the old
  migrator stays.

## 12. Follow-up: renaming `api-laravel/` to `api/`

Out of scope here, but specified now because the hazard is non-obvious and
whoever does it will not rediscover it.

`api-laravel` was chosen deliberately: `^api(/|$)` **cannot** match
`api-laravel/…`, because the hyphen defeats `(/|$)`. That is the only reason
the dispatch rewrite does not loop. Rename the directory and
`RewriteRule ^api(/|$) api/public/index.php [L]` matches its own substitution;
`[L]` ends only the current pass, so the ruleset re-runs against the new path,
matches again, and Apache aborts at ten internal redirects — a **500 on every
`/api/*` request**. `[END]` would prevent it, but §4 rules `[END]` out.

**The fix is one line:** add `RewriteCond %{ENV:REDIRECT_STATUS} ^$` to the
dispatch rule, so the second pass no longer matches. This is the same guard the
front controller already depends on on this FastCGI host.

Two other things that follow-up PR must handle:

- **The mirror churn.** Renaming deletes all of `api-laravel/` — thousands of
  files under `vendor/` — and re-uploads them as `api/`. That will trip the
  deploy CLI's mass-delete brake (>50 files and >20% of the tree). It needs a
  reviewed `-- --dry-run` followed by `-- --force-delete`, which is precisely
  why it does not belong in the cutover's deploy.
- **Nothing user-facing changes.** The public URL is already `/api/*`; only the
  internal directory name moves.

## Risks

| Risk | Mitigation |
| --- | --- |
| `[L]` unverified on this host's Apache | Smoke check asserts dispatch survives the catch-all; TEST confirms before any tag exists |
| Behaviour lost in the rewrite (honeypot, fail-closed Altcha, IDOR) | Each listed in §1 with a required test |
| Silent French fallback from a `reason` mismatch | Token-coverage test against `i18n.js` (§2) |
| Local schema drifting from servers | Prerequisite 2 in §7 |
| A server's `.env` deleted by `--relist` | Added to `PROTECTED` (§9) |
| Config-shape check refusing every deploy | Hand-edit all three `config.php` first (§7) |
| Members' area broken by the dual session | Bridge (§5), verified by hand on TEST |
| Replay guards lost to `artisan cache:clear` | Accepted: one replay inside a short TTL, needing the exact payload (§1) |
| Cache store misconfigured to `file`/`array`, splitting the replay guard | `.env` provisioning checklist pins the database store (§9) |
| Rewrite loop when `api-laravel/` is later renamed | Specified with its fix in §12, out of scope here |
