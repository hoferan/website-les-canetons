# R1b — Members administration, `/account`, and the login screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> **This plan states requirements, not code.** Its verbatim PHP/TS/TSX was
> removed on 2026-09-07, deliberately. Transcribing it is what produced every
> defect found while building Task 1: an idempotency test that could not fail,
> a duplicate-key collision with reference data the plan itself introduced, and
> a phpunit assumption the plan's own step falsified. The reasoning in those
> blocks survives below as stated requirements, together with the literals that
> cannot be re-derived — error tokens, throttle limits, routes.
>
> So: read the requirements, **verify them against the code as it actually is**,
> then write the implementation. Keep the test names and the literals exactly;
> everything else is yours to derive. Commands, mutation-test recipes and
> expected outcomes are unchanged and are still to be followed literally.

> ### Completed 2026-09-09. Where this plan and the code disagreed
>
> Tasks 1-10 (the API) were built in an earlier session. Tasks 11-16 (the SPA)
> were built on 2026-09-09, and four of this plan's own steps had been overtaken
> by decisions recorded further down it. Each was resolved in favour of the code
> as it actually is, per the preamble above:
>
> - **Task 11 Steps 1-3 were a no-op.** `npm run openapi` and
>   `npm run generate:api` both came back byte-identical: Tasks 6-10 had already
>   committed a current client, and `roleIds` was already `number[]`.
> - **Task 11 and Task 15 assume a person with no account.** 2026_09_08_000001
>   made `username`/`password` NOT NULL, so that row cannot exist. Every "Pas de
>   compte" state, and the optional username on the member form, is gone.
> - **Task 15's `ConfirmWithPassword` is `ConfirmByTypingName`.** Decision B7
>   removed re-authentication from the roster writes and, in the same entry,
>   said a type-the-name confirmation replaces it and that Task 15 must build
>   it. It is now the only guard on a delete, and it is mutation-tested.
> - **Task 15 builds role assignment**, which its own step list omitted while
>   the goal below and decision B3 both require it. Without it
>   `PUT /members/{member}/roles` would have shipped with no caller.
> - **Task 16 Step 5 names `AccessIntegrity::assertMayRemoveCredentials()`,
>   which no longer exists** — the credentials model dissolved it. The
>   equivalent surviving guard, `assertMayDelete()` in
>   `MemberController::destroy()`, was commented out instead: two tests failed
>   (`test_deleting_yourself_is_refused`,
>   `test_deleting_the_last_administrator_is_refused`) and it was restored.
>
> Verified 2026-09-09: Laravel **226 passed** in Docker, `npm run check` exit 0,
> `npm run openapi && npm run generate:api` left the tree clean, and the whole
> of Step 4's browser checklist passed against the built artifact on :8090.

**Goal:** The committee can administer the roster from a real screen — create a
person, give them an account, assign their register and their roles, reset a
password, remove them — and every member can log in and change their own
password.

**Architecture:** R1a built the schema, the permission enum, the hardened login
and three support classes with **no callers**: `AccessIntegrity`,
`SessionRevoker` and `Audit`. R1b is the controller that calls all three, plus
the screens on top. The API comes first (Tasks 1–9), then the SPA (Tasks
10–15). Authorization is `permission:members.manage` on every roster route;
the SPA's guard mirrors it for UX only and enforces nothing.

**Tech Stack:** Laravel 13 + Sanctum session auth + MariaDB 10.3 on the API
side; React 19 + TypeScript + Tailwind 4 + TanStack Query through the orval-
generated client on the SPA side. Tests: PHPUnit (Docker) and Vitest + MSW.

---

## Read before starting

| For | Read |
| --- | --- |
| Why the system is shaped this way | `docs/superpowers/specs/2026-09-05-rebuild-design.md` — §3 domain model, §4 screens, §6 security |
| What R1a actually built | `docs/superpowers/plans/2026-09-05-r1a-foundation.md`, and its "Carried into R1b" section |
| Host constraints, commands, the `.htaccess` | `CLAUDE.md` |

R1a's carried-forward list is this plan's spine:

- the members admin UI, `/account`, and the login screen — Tasks 10–15;
- **re-authentication before destructive privileged actions** — Task 2;
- `AccessIntegrity`, `SessionRevoker` and `Audit` need callers — Tasks 6–9;
- **argon2id must be verified on the shared host before any deploy** — still
  open, and still not this plan's job (no deploy happens here).

---

## Decisions taken for this plan

Four questions the spec leaves open were settled on 2026-09-07 before writing:

| # | Decision | Why it was a question |
| --- | --- | --- |
| **B1** | **Re-authentication is a `currentPassword` field on each destructive request**, verified server-side, not a time-boxed "sudo" window. | §6 requires re-auth but names no mechanism. A per-request password needs no new session state, and the field sits in the same dialog that names the damage. |
| **B2** | **The first administrator is created by a guarded migration reading `BOOTSTRAP_ADMIN_*` from that server's `.env`.** | The shared host has no shell: FTP plus the token-gated `POST /api/migrate` is the whole remote surface, so `artisan` cannot be run on a server and there is otherwise no way to get a first login onto TEST. |
| **B3** | **`/members` ASSIGNS existing roles and registers; it does not edit them.** Roles, their permissions, and the register list are created by the bootstrap migration. | §3 calls roles "freely-editable data" but §4 defines no URL for editing them, and none for registers either. Naming two new URLs is a decision for when there is a screen to hang them on. |
| **B4** | **One plan, API first then UI.** | R1a's shape, and the branch stays continuous. |
| **B7** | **The destructive roster endpoints do NOT re-authenticate.** Delete, role replacement and password reset trust the session cookie. `POST /api/me/password` still requires the current password. | Added 2026-09-08, reversing **B1** and spec §6, after André asked what the header actually buys. Answer: only protection against an unattended, still-logged-in device — the cookie is already trusted to read the whole roster and edit anyone, so re-auth was an extra lock on three doors out of seventeen. Weighed against the friction and a UI that must carry a password dialog everywhere, André chose to trust the cookie. Mistake-prevention moves to a **type-the-name confirmation in the UI**, which is where it belongs: a server cannot distinguish a typed confirmation from an automated one, which is why GitHub enforces it in the browser only. `/api/me/password` keeps `currentPassword` because that is the operation's own input, not ceremony — without it a borrowed phone locks the real owner out of their own account permanently. **What this accepts:** somebody holding an unlocked, logged-in phone can delete a member and their history, grant themselves nothing new (they already have everything), and reset any member's password — including another administrator's — and read the new value. |
| **B6** | **`roles` carries no display name.** `roles.label_fr` is dropped; the UI resolves the name and help text from `roles.key` through `web/src/i18n/fr.ts`. | Added 2026-09-08, after André restated the rule: the backend is 100% English, the sole exception is text a user typed, and UI text must be translatable by a fixed identifier. Nobody typed "Team Direction" — a migration did — so it is system text and `key` is the identifier. When roles become editable a committee-typed name IS user input and gets a nullable `label` rendered verbatim, with a fallback to the key's translation; that column ships with the editor, not before, so the fallback branch is never untested code. |
| **B5** | **The current user is `/api/me` everywhere**, so changing your own password is `POST /api/me/password`, not `POST /api/account/password`. | Added 2026-09-07, after André queried `/api/me`. `/me` is the widespread convention (Spotify, Microsoft Graph) and is already built, so it stays; what changes is the sibling this plan had put under a second noun. One resource noun for one subject. The SPA **screen** is still `/account` — a page name and a resource name are different things, and only the API had two nouns for the same subject. |

**A consequence of B3 to state plainly:** after this plan, adding or renaming a
register, or changing what a role grants, is an Adminer job. That is a
deliberate, recorded limitation, not an oversight — see "Carried out of R1b".

---

## Global Constraints

- **English everywhere except rendered UI text.** Identifiers, columns, JSON
  bodies, error codes, comments, this file. French appears only in what a
  browser paints. NOT in `roles` — see B6.
- **The API error contract is `{error, code, fields[]}`.** Every new `code` and
  every new `fields[].reason` MUST have French copy in `web/src/i18n/fr.ts` or
  `api/tests/Feature/ApiErrorVocabularyTest.php` fails.
- **`web/src/api/generated/` is generated.** Change the controller, run
  `npm run openapi && npm run generate:api`, commit the result.
- **Never `disabled` on a button.** This app uses `aria-disabled` plus an early
  return in the handler — disabling the focused control blurs it to `<body>`
  and throws focus away mid-submit. See `web/src/components/ui/button.tsx`.
- **Every interactive control clears 44px.** `Button` and `Input` carry
  `min-h-touch`; anything hand-rolled must too.
- **No bare tables on phones** (§4). The roster is cards below `md` and a table
  at `md` and up.
- **Use the four spacing tokens** — `tight` / `related` / `block` / `section` —
  not improvised `mt-*`. See the `@theme` block in `web/src/styles.css`.

## Branch and deployability

Continue on **`claude/new-session-11x76s`**, the R1a branch. It remains
deliberately **not deployable** until R1c, because R1a deleted the events and
attendance domain that R1c replaces. `main` is untouched and TEST keeps serving
the pre-rebuild build. **Do not open a pull request** — in this repository a
merge to `main` auto-deploys TEST, so a merge is a deploy.

### One deploy-time trap this plan creates

Task 1 adds keys to `api/.env.example`. The deploy CLI runs a **config-shape
pre-flight**: it fetches the target's `_api/.env` and compares its *key
set* against `api/.env.example`, and **refuses the deploy on any drift**. So
from Task 1 onward, every server's `.env` must gain `BOOTSTRAP_ADMIN_USERNAME`,
`BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FIRST_NAME` and
`BOOTSTRAP_ADMIN_LAST_NAME` before it will accept another deploy. Nothing here
deploys, so nothing breaks now — but note it in the R1c/R1d hand-off rather
than discovering it as a refused deploy.

## Running the tests

Every test command below is in the **Docker** form:

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SomeTest
```

In Git Bash prefix it with `MSYS_NO_PATHCONV=1`, or the `-w` argument is
rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

**Run the web suite from PowerShell, not Git Bash.** Git Bash reports the cwd
with a lowercase drive letter and Vitest 4 keys module resolution off it, which
intermittently loads two `vitest` instances and fails every file with "Vitest
failed to find the runner". It looks like a catastrophic regression; it is a
shell choice.

```powershell
npm run test:web
npm run check          # typecheck, Pint, web tests, eslint, stylelint, prettier, secret guard
```

### In a Claude Code web session, substitute this everywhere

There is no Docker daemon. Follow the recipe in the R1a plan's own
"In a Claude Code web session" section (`npm run websession:init`, then
`cd api && DB_HOST=127.0.0.1 php artisan test --filter=…`).

**And read this before trusting a green run there.** The R1a branch shipped two
tests that were green natively and **red in Docker for a day**: they asserted
`config('session.secure')`, which the native `api/.env` leaves at its `true`
default while `docker/api/env.docker` sets it `false` for plain-http dev. Fixed
in `6a3ff12` by pinning `SESSION_SECURE_COOKIE=true` in `api/phpunit.xml`. The
lesson for this plan: **anything that reads configuration, a cookie flag or a
hash driver must be re-run in Docker before it is called done.** Task 15 is
that re-run and is not optional.

---

## Non-goals for R1b

- **No roles or registers editor** (B3).
- **No events, no attendance, no chase list.** That is R1c, and it is why the
  branch is not deployable yet.
- **No public pages.** `/band`, `/committee`, `/join`, `/history` are R2. This
  plan adds no public route and leaves `public_visible` as a column the roster
  form can set and nothing yet reads.
- **No Sanctum removal**, no `RunPendingMigrations` removal, no `.htaccess`
  change, no docs clean-up. All R1d.
- **No self-service password reset.** Every password is committee-issued (§4.4).
  There is no email on a member record to send one to.
- **No deploy.** Not to TEST, not anywhere.

---

## File structure

**Created — API**

```
api/app/Http/Controllers/Api/MemberController.php     the roster: index, store, update, destroy
api/app/Http/Controllers/Api/MemberRoleController.php replace one member's roles
api/app/Http/Controllers/Api/MemberPasswordController.php  admin resets a password
api/app/Http/Controllers/Api/AccountPasswordController.php a member changes their own
api/app/Http/Controllers/Api/SectionController.php    read-only register list
api/app/Http/Controllers/Api/RoleController.php       read-only role list, with permissions
api/app/Http/Requests/StoreMemberRequest.php
api/app/Http/Requests/UpdateMemberRequest.php
api/app/Http/Requests/ReplaceMemberRolesRequest.php
api/app/Http/Requests/AccountPasswordRequest.php
api/app/Http/Middleware/NoStoreResponse.php           Cache-Control on every identity-dependent response
api/app/Http/Resources/MemberResource.php             one place that shapes a member as JSON
api/app/Http/Resources/SectionResource.php
api/app/Http/Resources/RoleResource.php               a role WITH what it grants
api/app/Exceptions/ReauthenticationFailed.php         403 wrong password / 429 throttled
api/app/Support/Reauthentication.php                  verifies the actor's own password, throttled
api/app/Support/GeneratedPassword.php                 a readable admin-issued password
api/config/bootstrap.php                              the first administrator's credentials, per server
api/database/migrations/2026_09_07_000001_seed_registers_and_roles.php
api/database/migrations/2026_09_07_000002_bootstrap_first_administrator.php
api/tests/Feature/MemberIndexTest.php
api/tests/Feature/MemberWriteTest.php
api/tests/Feature/MemberRolesTest.php
api/tests/Feature/MemberPasswordTest.php
api/tests/Feature/AccountPasswordTest.php
api/tests/Feature/SectionAndRoleIndexTest.php
api/tests/Feature/ReauthenticationTest.php
api/tests/Feature/BootstrapAdministratorTest.php
api/tests/Feature/SeedRegistersAndRolesTest.php
api/tests/Unit/GeneratedPasswordTest.php
```

**Created — SPA**

```
web/src/components/guards.tsx            RequirePermission + the refusal page
web/src/components/MustChangePassword.tsx forces the password change through
web/src/pages/Members.tsx                the roster screen
web/src/pages/Account.tsx                change my own password
web/src/members/MemberForm.tsx           create/edit one person
web/src/members/MemberRow.tsx            one roster entry: card below md, row at md+
web/src/members/ConfirmWithPassword.tsx  the destructive dialog that names the damage
web/src/members/GeneratedPasswordDialog.tsx  shows a new password exactly once
web/src/pages/Login.test.tsx
web/src/pages/Account.test.tsx
web/src/pages/Members.test.tsx
web/src/components/guards.test.tsx
web/src/components/MustChangePassword.test.tsx
```

**Modified**

```
api/app/Support/AccessIntegrity.php    count only members who can actually log in (Task 6)
api/app/Support/SessionRevoker.php     add forMemberExcept() (Task 3)
api/app/Exceptions/ApiError.php        map the `min` rule to a `too_short` token (Task 8)
api/app/Models/Member.php              canAuthenticate(), and the roles relation already exists
api/database/seeders/DevSeeder.php     stop creating registers; use the migration's (Task 1)
api/tests/Feature/DevSeederTest.php    the register list is now the real six (Task 1)
api/routes/api.php                     the new routes, each with why it is gated as it is
api/.env.example                       BOOTSTRAP_ADMIN_* keys
docker/api/env.docker                  the same keys, with dev values
web/src/session/SessionProvider.tsx    add can(permission)
web/src/routes.tsx                     /members and /account
web/src/components/Layout.tsx          the nav entries, gated
web/src/pages/Login.tsx                a real login form (it is a one-line stub today)
web/src/i18n/fr.ts                     French for every new token
web/src/mocks/handlers.ts              hand-written handlers for the new endpoints
web/e2e/shell.spec.ts                  the login page assertion, once it is a form
```

---

## The API surface this plan builds

| Method | Path | Gate | Body → Response |
| --- | --- | --- | --- |
| GET | `/api/sections` | `permission:members.manage` | → `[{id, name, sortOrder}]` |
| GET | `/api/roles` | `permission:members.manage` | → `[{id, key, permissions[]}]` |
| GET | `/api/members` | `permission:members.manage` | → `[MemberResource]` |
| POST | `/api/members` | `permission:members.manage` | person fields + `roleIds[]` → `{member, generatedPassword?}` |
| PATCH | `/api/members/{member}` | `permission:members.manage` | person fields → `{member, generatedPassword?}` |
| DELETE | `/api/members/{member}` | `permission:members.manage` | `{currentPassword}` → `{ok, sessionsEnded}` |
| PUT | `/api/members/{member}/roles` | `permission:members.manage` | `{roleIds[], currentPassword}` → `{member, sessionsEnded}` |
| POST | `/api/members/{member}/password` | `permission:members.manage` | `{currentPassword}` → `{generatedPassword, sessionsEnded}` |
| POST | `/api/me/password` | `auth:sanctum` | `{currentPassword, newPassword}` → `{ok, sessionsEnded}` |

Every one of these is identity-dependent, so **every response must carry
`Cache-Control: no-store, private`** (§4). `AuthController::me()` already does;
`MemberResource`-returning endpoints must too, or a shared proxy can serve one
member's roster view to somebody else.

**Re-authentication is required on exactly the destructive three** — delete,
role replacement, password reset — plus `/api/me/password`, which carries
the actor's current password as its own subject. Creating and editing a person
do **not** require it: they are not destructive, and a password prompt on every
typo correction is a prompt people learn to type through without reading.

---

## Task 1: Registers and roles as real data, and a first administrator

**Why this is first.** Nothing else can be exercised without a register list, a
role that grants `members.manage`, and somebody holding it. B2 makes this a
migration because the shared host has no shell.

**Files:**
- Create: `api/database/migrations/2026_09_07_000001_seed_registers_and_roles.php`
- Create: `api/database/migrations/2026_09_07_000002_bootstrap_first_administrator.php`
- Create: `api/tests/Feature/SeedRegistersAndRolesTest.php`
- Create: `api/tests/Feature/BootstrapAdministratorTest.php`
- Modify: `api/.env.example`, `docker/api/env.docker`
- Modify: `api/database/seeders/DevSeeder.php`, `api/tests/Feature/DevSeederTest.php`

- [x] **Step 1: Write the failing test for the reference data**

Create `api/tests/Feature/SeedRegistersAndRolesTest.php`:


**Implement `api/tests/Feature/SeedRegistersAndRolesTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `SeedRegistersAndRolesTest`, `test_the_six_real_registers_exist_in_the_bands_own_order`, `test_the_direction_role_grants_every_permission`, `test_the_committee_role_grants_only_the_guest_list`, `test_re_running_the_migration_neither_duplicates_nor_resets`

Literals to preserve verbatim:

- `sort_order`

Requirements, from the plan's own comments:

- The registers and roles arrive as a MIGRATION, not a seeder, because the
  shared host has no shell: `artisan db:seed` cannot be run on a server, and
  the only remote trigger that exists is the migration path. See the rebuild
  design's §7 and decision B2 in this plan. RefreshDatabase runs migrations,
  so every test in the suite now starts with these rows present. That is
  intentional — they are reference data, not fixtures.
- The band's own order, recovered from the pre-rebuild /canetons page.
  "Direction" was listed there too and is NOT a register: a musical director
  is a member with a committee_title, or one whose instructor_of_section_id
  points at the register they teach. Putting it here would make it
  selectable as somebody's instrument.
- A deployed server re-runs nothing, but RunPendingMigrations and `artisan
  migrate` both must be safe to invoke twice, and a committee that has
  edited what a role grants must not have it silently reset underneath them
  — the "roles are editable data" capability this rebuild exists to add.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SeedRegistersAndRolesTest
```

Expected: FAIL. `Section::orderBy(...)->pluck('name')` returns `[]`, and
`Role::where('key','direction')->sole()` throws
`Illuminate\Database\Eloquent\ModelNotFoundException`.

- [x] **Step 3: Write the reference-data migration**

Create `api/database/migrations/2026_09_07_000001_seed_registers_and_roles.php`:


**Implement `api/database/migrations/2026_09_07_000001_seed_registers_and_roles.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `extends`, `up`, `down`, `role`

Literals to preserve verbatim:

- `sort_order`, `created_at`, `updated_at`, `member_roles`, `role_id`,
  `role_permissions`, `section_id`, `instructor_of_section_id`

Requirements, from the plan's own comments:

- The registers and the two roles, as DATA rather than a seeder. WHY A
  MIGRATION. The shared host has no shell — FTP plus the token-gated POST
  /api/migrate is the entire remote surface — so `artisan db:seed` can never
  be run against a server. The migration path is the only mechanism that
  reaches a deployed database, and it already runs itself on the first
  request after a deploy (App\Http\Middleware\RunPendingMigrations).
  IDEMPOTENT AND NON-DESTRUCTIVE, in the same style as every migration in
  this project: it inserts what is missing and touches nothing that exists.
  A role's permissions are seeded ONLY when the role itself is new, because
  the committee can edit them (design §3) and a migration that re-synced
  them would silently undo that on the next deploy.
- The band's own order, recovered from the pre-rebuild /canetons page.
  "Direction" appeared there as a seventh entry and is deliberately absent:
  it is not a register anyone plays in. A musical director is a member with
  a committee_title, or with instructor_of_section_id pointing at the
  register they teach.
- insertOrIgnore against the unique index on sections.name: a register a
  committee has renamed is left alone rather than resurrected under its old
  name on the next deploy.
- `down()` deliberately removes only the roles and registers nothing has
  attached itself to. Dropping a register that members point at, or a role
  members hold, would cascade into the roster — and this migration's whole
  purpose is to be safe to run against a live database.
- @param  array<int, Permission>  $permissions
- The role is already here, so its permissions are the committee's business
  now. Do not re-sync them.


- [x] **Step 4: Run it to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SeedRegistersAndRolesTest
```

Expected: PASS, 4 tests.

- [x] **Step 5: Write the failing test for the first administrator**

Create `api/tests/Feature/BootstrapAdministratorTest.php`:


**Implement `api/tests/Feature/BootstrapAdministratorTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `BootstrapAdministratorTest`, `runBootstrap`, `directly`, `test_it_creates_an_administrator_from_the_environment`, `test_it_does_nothing_when_an_administrator_already_exists`, `test_it_does_nothing_when_the_environment_is_unset`, `test_it_refuses_a_short_password_rather_than_creating_a_weak_account`, `test_an_existing_holder_of_members_manage_counts_as_bootstrapped`

Literals to preserve verbatim:

- `first_name`, `last_name`

Requirements, from the plan's own comments:

- The chicken-and-egg problem this solves: /members is gated on
  members.manage, so somebody must already hold it before anybody can grant
  it — and the host has no shell to create that first person with. The
  migration reads BOOTSTRAP_ADMIN_* from the server's own .env, which is the
  file each server already owns by hand, and does nothing at all unless
  administration is genuinely unheld. Under phpunit.xml those keys are
  unset, so the migration no-ops for the whole suite and these tests drive
  it directly with config().
- The migration has already run (RefreshDatabase) and no-opped, so invoke
  the class directly rather than re-running `migrate`, which would find
  nothing pending.
- A second run, as a redeploy would do.
- Failing loudly is the right answer: a migration that quietly skipped would
  leave a server with no way in and no message saying why, and one that
  created the account anyway would put a five-character password on the only
  account that can administer the band.
- Not merely "a member exists" — the guard is whether ADMINISTRATION is
  held. A database full of players with no administrator still needs this
  migration to run.


- [x] **Step 6: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=BootstrapAdministratorTest
```

Expected: FAIL — the migration file does not exist, so `require` raises
`failed to open stream: No such file or directory`.

- [x] **Step 7: Add the config the migration reads**

Create `api/config/bootstrap.php`:


**Implement `api/config/bootstrap.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `first_name`, `last_name`

Requirements, from the plan's own comments:

- The first administrator, for a host with no shell. Read through config()
  rather than env() directly at the point of use, so the migration is
  drivable from a test (see BootstrapAdministratorTest) and so
  `config:cache` on a server cannot leave it reading a stale value. These
  keys are set BY HAND in each server's _api/.env, exactly as APP_KEY
  and the DB credentials already are. There is no default password and there
  must never be one.


- [x] **Step 8: Write the bootstrap migration**

Create `api/database/migrations/2026_09_07_000002_bootstrap_first_administrator.php`:


**Implement `api/database/migrations/2026_09_07_000002_bootstrap_first_administrator.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `extends`, `up`, `down`

Literals to preserve verbatim:

- `role_permissions`, `first_name`, `last_name`, `must_change_password`,
  `section_id`, `public_visible`, `created_at`, `updated_at`,
  `member_roles`, `member_id`, `role_id`

Requirements, from the plan's own comments:

- Creates the FIRST person who can administer members, and only ever that.
  WHY THIS EXISTS. /members is gated on members.manage, and permissions
  arrive only through roles — so on a fresh database nobody can grant
  anybody anything. On a normal host you would run an artisan command once.
  This host has no shell: the FTP account is chrooted to the web root and
  remote MySQL is blocked, so the migration path is the only thing that
  reaches a deployed database at all. THE GUARD IS "IS ADMINISTRATION HELD",
  not "are there any members". A database full of players with nobody
  holding members.manage is exactly the state this must repair. The password
  is read from that server's own .env and the account is created with
  must_change_password, because a password that has been typed into a file
  is not a secret worth keeping.
- Not an error. A local stack, a test run, or a server that has already been
  bootstrapped by hand all land here legitimately.
- Refusing beats creating: this account can lock the whole band out of its
  own administration, so it does not get a five-character password because
  somebody was in a hurry with a .env file.
- No register: this account administers, and a member with no section_id is
  not answerable for events, so it never shows up in an attendance count as
  an unanswered row.
- Publication is opt-in per person (the members migration defaults it
  false); a bootstrap account has consented to nothing.
- Deliberately empty. Rolling this back would delete the only account that
  can administer members, which is the state it exists to prevent.


- [x] **Step 9: Run it to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=BootstrapAdministratorTest
```

Expected: PASS, 5 tests.

- [x] **Step 10: Document the environment keys**

Add to `api/.env.example`, after the `SESSION_*` block:

```dotenv
# --- First administrator ------------------------------------------------------
# Read ONCE, by the 2026_09_07_000002 migration, and only when nobody holds
# members.manage — so a bootstrapped server ignores these keys forever after.
# They exist because this host has no shell: there is no way to run an artisan
# command against a deployed database, so the first login has to arrive through
# the migration path.
#
# Minimum 12 characters, or the migration refuses and every /api/* request 503s
# until it is fixed. The account is created with must_change_password, so this
# value stops being a credential at the first login.
BOOTSTRAP_ADMIN_USERNAME=
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_ADMIN_FIRST_NAME=Comité
BOOTSTRAP_ADMIN_LAST_NAME=Canetons
```

Add to `docker/api/env.docker`, so the local stack bootstraps itself:

```dotenv
# The local stack bootstraps itself with these; DevSeeder's demo.direction
# already holds members.manage, so in practice the migration finds
# administration held and no-ops. Kept in step with api/.env.example because
# the deploy CLI compares the two files' KEY SETS and refuses on drift.
BOOTSTRAP_ADMIN_USERNAME=comite.local
BOOTSTRAP_ADMIN_PASSWORD=local-dev-not-a-secret
BOOTSTRAP_ADMIN_FIRST_NAME=Comité
BOOTSTRAP_ADMIN_LAST_NAME=Local
```

- [x] **Step 11: Check the secret guard is content**

```bash
node tools/secret-guard.mjs
```

Expected: PASS. `BOOTSTRAP_ADMIN_PASSWORD=` is empty in `.env.example`, and the
docker value is a self-describing non-secret. **If the guard flags either,
do not weaken the guard** — rename the docker value until it is obviously not
a credential.

- [x] **Step 12: Point DevSeeder at the migration's registers**

The registers are now reference data, so the seeder must stop inventing its
own — `DevSeederTest` currently asserts the four synthetic ones, and with both
sets present neither list is the truth.

In `api/database/seeders/DevSeeder.php`, replace the `$sections` block:


**Implement `api/database/seeders/DevSeeder.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `sort_order`

Requirements, from the plan's own comments:

- The registers come from the 2026_09_07_000001 migration now — they are
  reference data, not fixtures. Assigning demo members to the REAL registers
  also means the dev stack renders the same register list a server does,
  which is what makes a local screenshot worth anything.


and replace the three `$sections[...]` lookups with real register names:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `first_name`, `last_name`, `section_id`, `public_visible`

Requirements, from the plan's own comments:

- BOTH — the case the old role matrix could not express. If someone
  reintroduces an either/or, this member is what breaks.
- A person with no account at all: listed publicly, never logs in.


Also delete the seeder's own `$direction->syncPermissions([...])` and
`$committee->syncPermissions([...])` blocks together with the two
`Role::firstOrCreate` calls, and read the roles instead:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- The roles come from the migration too. firstOrCreate here would create a
  SECOND role with the same key on a database where the migration had run —
  and syncPermissions would undo a developer's hand-edits, which is the
  thing DevSeederTest pins.


> `$committee` becomes unused once its `syncPermissions` call goes. Assign it to
> a demo member rather than deleting the line — a role nothing holds is a role
> whose screen nobody looks at:
>
> ```php
>         // Holds the committee role and plays: the guest list is the only
>         // thing they can see, and they are still in the attendance list.
>         $this->member('demo.committee', 'Camille', 'Committee', $sections['Trombones']->id)
>             ->roles()->syncWithoutDetaching([$committee->id]);
> ```

- [x] **Step 13: Update DevSeederTest to the real register list**

In `api/tests/Feature/DevSeederTest.php`, replace
`test_the_sections_are_ordered`:


**Implement `api/tests/Feature/DevSeederTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `test_the_seeder_uses_the_real_registers_rather_than_inventing_any`

Literals to preserve verbatim:

- `sort_order`

Requirements, from the plan's own comments:

- The register list belongs to the 2026_09_07_000001 migration now. What
  this pins is that the SEEDER did not add to it: a synthetic register in
  the dev stack means a local screenshot shows a list no server has.


Keep `test_a_hand_edited_roles_permissions_survive_a_reseed` exactly as it is —
it now guards the seeder's *reading* of the roles rather than its writing of
them, and it must still pass.

- [x] **Step 14: Run the whole suite**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS. If `DevSeederTest` fails on `$sections['Cloches']` being
undefined, the seeder ran against a database where migration 000001 had not —
check the migration's filename ordering.

- [x] **Step 15: Commit**

```bash
git add api/config/bootstrap.php api/database/migrations api/database/seeders \
        api/tests/Feature/SeedRegistersAndRolesTest.php \
        api/tests/Feature/BootstrapAdministratorTest.php \
        api/tests/Feature/DevSeederTest.php api/.env.example docker/api/env.docker
git commit -m "feat(api): registers, roles and a first administrator as migrations

The host has no shell, so `artisan db:seed` can never run against a server and
the migration path is the only thing that reaches a deployed database. Both
migrations are idempotent and non-destructive: a renamed register survives, and
a role whose permissions the committee has edited is never re-synced.

The bootstrap migration creates an administrator ONLY when nobody holds
members.manage, reads its credentials from that server's own .env, refuses a
password under 12 characters rather than creating a weak account that can lock
the band out, and sets must_change_password.

DevSeeder stops inventing registers and assigns its demo members to the real
six, so a local screenshot shows the list a server actually has."
```

---

## Task 2: Re-authentication before a destructive action

**Why.** Spec §6: "Re-authentication before destructive privileged actions.
Whoever holds `members.manage` can lock the band out; re-entering their own
password is proportionate for this audience, TOTP is not." Decision **B1** makes
it a `currentPassword` field on each destructive request rather than a sudo
window.

**The part that is easy to get wrong:** an authenticated attacker with a stolen
session can otherwise use this as a **password oracle** — a clean yes/no answer,
guessable as fast as the host will serve it. It is throttled per actor for
exactly that reason.

**Files:**
- Create: `api/app/Exceptions/ReauthenticationFailed.php`
- Create: `api/app/Support/Reauthentication.php`
- Create: `api/tests/Feature/ReauthenticationTest.php`
- Modify: `api/bootstrap/app.php`, `web/src/i18n/fr.ts`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/ReauthenticationTest.php`:


**Implement `api/tests/Feature/ReauthenticationTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `ReauthenticationTest`, `actor`, `test_the_correct_password_passes`, `test_a_wrong_password_is_refused_as_403`, `test_a_member_with_no_password_cannot_reauthenticate`, `test_repeated_wrong_passwords_lock_the_actor_out_with_429`, `test_a_success_clears_the_attempt_counter`, `test_the_throttle_is_per_actor`

Literals to preserve verbatim:

- `first_name`, `last_name`, `reauth_failed`, `too_many_attempts`

Requirements, from the plan's own comments:

- A person row with no credentials is legitimate (an instructor listed
  publicly, a child whose parent answers). Such a row can never be the actor
  on a request — there is no way to log in as it — but failing CLOSED means
  a future caller that gets one cannot treat "no password set" as "any
  password matches".
- Note the CORRECT password: a throttled actor is refused anyway, or the
  limit is decorative — the same argument as the login throttle in
  AuthController.
- One member fumbling their password must not lock a colleague out of
  administering the band.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=ReauthenticationTest
```

Expected: FAIL — `Class "App\Exceptions\ReauthenticationFailed" not found`.

- [x] **Step 3: Write the exception**

Create `api/app/Exceptions/ReauthenticationFailed.php`:


**Implement `api/app/Exceptions/ReauthenticationFailed.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `ReauthenticationFailed`, `__construct`

Requirements, from the plan's own comments:

- A destructive privileged action was refused because the actor did not re-
  prove who they are (spec §6). 403 for a wrong password, 429 when the actor
  has been throttled — so the status travels on the exception rather than
  being assumed by the renderer. `errorCode`, not `code`: \Exception already
  declares `protected $code` and the ecosystem expects getCode() to return
  an int. Same reasoning, and the same trap, as AccessIntegrityViolation —
  read that class's comment before renaming anything here.


- [x] **Step 4: Write the support class**

Create `api/app/Support/Reauthentication.php`:


**Implement `api/app/Support/Reauthentication.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `Reauthentication`, `assert`, `throttleKey`

Literals to preserve verbatim:

- `MAX_ATTEMPTS = 5`, `DECAY_SECONDS = 900`, `too_many_attempts`,
  `reauth_failed`

Requirements, from the plan's own comments:

- Re-proves that the person holding this session is the person who owns the
  account, immediately before something irreversible. WHY IT IS THROTTLED.
  Without a limit this is a password oracle: anyone with a stolen session
  cookie can guess the account's real password against an endpoint that
  answers yes or no, as fast as the host will serve it. The limit is keyed
  on the ACTOR rather than the IP, so neither a botnet spreading attempts
  nor one colleague's typos can affect anybody else. Attempts made WHILE
  throttled do not extend the lock: assert() returns before hit() once
  tooManyAttempts() is true, exactly as AuthController::login() does.
- @throws ReauthenticationFailed
- Checked BEFORE the hash comparison, so a throttled actor is refused even
  when they finally type it correctly. Verifying first and throttling after
  would make the limit decorative.
- Fails closed on a credential-less person row. Hash::check() against a null
  hash raises a TypeError; treating it as a match would be very much worse.


- [x] **Step 5: Render it inside the error contract**

In `api/bootstrap/app.php`, immediately after the `AccessIntegrityViolation`
render callback and **before** the catch-all `HttpException` one:


**Implement `api/bootstrap/app.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- 403 or 429. A destructive privileged action was refused because the actor
  did not re-prove their identity — see App\Support\Reauthentication. The
  status travels on the exception because a wrong password and a throttled
  actor are different answers.


and add the import `use App\Exceptions\ReauthenticationFailed;`.

> **Keep the specific-before-general order.** `ReauthenticationFailed` is a
> plain `RuntimeException`, so the final `HttpException` closure would not
> actually swallow it — but the existing comment on the `SchemaUnavailable`
> closure explains why the order is maintained anyway: so that widening either
> one later cannot silently pick the wrong winner.

- [x] **Step 6: Add the French copy**

In `web/src/i18n/fr.ts`, add to `errors`:


**Implement `web/src/i18n/fr.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_


and to `fields`:


**Implement `web/src/i18n/fr.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_


`too_many_attempts` already exists and needs nothing.

- [x] **Step 7: Run the test and the vocabulary guard**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=ReauthenticationTest
docker compose exec -w /var/www/html/_api web php artisan test --filter=ApiErrorVocabularyTest
```

Expected: PASS, 6 tests, and the guard green.

- [x] **Step 8: Commit**

```bash
git add api/app/Exceptions/ReauthenticationFailed.php api/app/Support/Reauthentication.php \
        api/tests/Feature/ReauthenticationTest.php api/bootstrap/app.php web/src/i18n/fr.ts
git commit -m "feat(api): throttled re-authentication for destructive actions"
```

---

## Task 3: End a member's other sessions without ending your own

**Why.** §6 says revocation is immediate on a password change. Taken literally
that logs the actor out of the session they are currently using — and since the
first thing a new account does is change its password on a forced screen, that
path bounces every first login straight back to the login form. The property
that matters is that **every other** session dies.

`SessionRevoker::forMember()` stays exactly as it is, and remains the right call
for an administrator resetting somebody *else's* password, or deleting them.

**Files:**
- Modify: `api/app/Support/SessionRevoker.php`
- Modify: `api/tests/Feature/SessionRevocationTest.php`

- [x] **Step 1: Write the failing test**

Append to `api/tests/Feature/SessionRevocationTest.php`, inside the class:


**Implement `api/tests/Feature/SessionRevocationTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `test_revoking_all_but_one_session_leaves_that_one_alive`, `test_revoking_all_but_one_touches_no_other_member`

Literals to preserve verbatim:

- `first_name`, `last_name`, `user_id`


> This file already has a helper that inserts a session row. Read it and use it
> — `$this->insertSession()` is the name to expect. If it differs, use the real
> one rather than adding a second.

- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SessionRevocationTest
```

Expected: FAIL — `Call to undefined method App\Support\SessionRevoker::forMemberExcept()`.

- [x] **Step 3: Add the method**

In `api/app/Support/SessionRevoker.php`, below `forMember()`:


**Implement `api/app/Support/SessionRevoker.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `forMemberExcept`

Literals to preserve verbatim:

- `user_id`

Requirements, from the plan's own comments:

- Ends every session belonging to a member EXCEPT one. For a member changing
  their OWN password. The property §6 wants is that a stolen session stops
  working the moment the password changes, and that holds as long as every
  other session dies. Killing the current one as well would log the actor
  out of the screen they are standing on — and the forced-change screen is
  where every first login begins. Pass Session::getId(), read AFTER any
  regenerate() the request performs, or this deletes the row it meant to
  keep. @return int the number of sessions ended


- [x] **Step 4: Run it to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SessionRevocationTest
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add api/app/Support/SessionRevoker.php api/tests/Feature/SessionRevocationTest.php
git commit -m "feat(api): revoke a member's other sessions, keeping the current one"
```

---

## Task 4: A generated password a person can read down the phone

**Why.** §4.4: `members.manage` opens a member, hits "Réinitialiser le mot de
passe", and **a generated password is shown once, to read out or hand over**. So
the alphabet matters more than entropy theatre: `l` next to `1` next to `I` is a
password an adult misreads aloud and a child mistypes, and the failure mode is a
phone call, not a breach.

**Files:**
- Create: `api/app/Support/GeneratedPassword.php`
- Create: `api/tests/Unit/GeneratedPasswordTest.php`

- [x] **Step 1: Write the failing test**

Create `api/tests/Unit/GeneratedPasswordTest.php`:


**Implement `api/tests/Unit/GeneratedPasswordTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `GeneratedPasswordTest`, `test_it_is_grouped_for_reading_aloud`, `test_it_never_uses_a_character_that_can_be_misheard_or_misread`, `test_two_calls_do_not_agree`, `test_it_carries_enough_entropy_to_be_worth_generating`

Requirements, from the plan's own comments:

- The point of the whole class. An administrator reads this down the phone
  to a thirteen-year-old, so the alphabet excludes 0/o, 1/l/i, 5/s and 2/z —
  every pair that produces a second phone call.
- 200 generations, so a character that slipped into the alphabet fails
  reliably rather than one run in fifty.
- Stated as a test so that shrinking the alphabet or the length is a
  decision somebody makes deliberately rather than a tidy-up. The figures
  below are deliberately CONSERVATIVE against the real alphabet — see the
  class.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=GeneratedPasswordTest
```

Expected: FAIL — `Class "App\Support\GeneratedPassword" not found`.

- [x] **Step 3: Write the class**

Create `api/app/Support/GeneratedPassword.php`:


**Implement `api/app/Support/GeneratedPassword.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `GeneratedPassword`, `make`

Literals to preserve verbatim:

- `ALPHABET = 'abcdefghjkmnpqrtuvwxy346789'`, `GROUPS = 3`, `GROUP_LENGTH =
  4`

Requirements, from the plan's own comments:

- A committee-issued password, shown exactly once (§4.4). THE ALPHABET IS
  THE DESIGN. This gets read out loud — an administrator opens a member,
  hits "Réinitialiser le mot de passe", and reads the result down the phone
  or hands it over on paper to a child who then types it on a phone
  keyboard. So every confusable pair is gone: 0/O, 1/l/I, 5/S, 2/Z. What is
  left is 27 characters, and 12 of them is roughly 57 bits — far more than
  enough for a credential whose whole life is the minutes until
  must_change_password forces it to be replaced. Lower case only, and
  hyphen-grouped, for the same reason: "was that a capital?" is a question
  nobody should have to ask about something dictated. Randomizer, not
  str_shuffle or rand: this is a credential, and PHP's Randomizer defaults
  to the CSPRNG.
- 27 characters: no i, l, o, s, z, 0, 1, 2 or 5.


> **Count the alphabet before running.** If `ALPHABET` is not 27 characters, the
> class comment is wrong and one of the two must change. The entropy test's
> deliberately low `22` still holds for anything from 22 characters up, so it
> does not need editing — but the comment must not claim a figure the string
> does not support.

- [x] **Step 4: Run it to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=GeneratedPasswordTest
```

Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add api/app/Support/GeneratedPassword.php api/tests/Unit/GeneratedPasswordTest.php
git commit -m "feat(api): a generated password meant to be read aloud"
```

---

## Task 5: Administration must be REACHABLE, not merely assigned

**This task fixes a real gap in R1a**, found while designing this plan's update
endpoint. `AccessIntegrity::wouldOrphanAdministration()` asks
`EffectivePermissions::memberIdsWith(MembersManage)` — which returns everyone
whose *roles* grant it, regardless of whether they can log in at all.

A member row is a person, not an account: `username` and `password` are nullable
by design. So this sequence passes every invariant R1a ships and locks the band
out completely:

1. Two people hold `members.manage`.
2. One is deleted — allowed, since one remains.
3. The remaining one has their **username cleared** through
   `PATCH /api/members/{id}`, which no invariant guards.
4. Nobody can log in and administer anything. The host has no shell, so the
   repair is Adminer.

The fix is one line of intent: **an administrator who cannot authenticate is not
an administrator.**

**Files:**
- Modify: `api/app/Support/AccessIntegrity.php`, `api/app/Models/Member.php`
- Modify: `api/tests/Feature/AccessIntegrityTest.php`

- [x] **Step 1: Write the failing tests**

Append to `api/tests/Feature/AccessIntegrityTest.php`, inside the class:


**Implement `api/tests/Feature/AccessIntegrityTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `test_a_credential_less_administrator_does_not_count_as_one`, `test_stripping_the_last_reachable_administrators_roles_is_refused`, `test_removing_the_credentials_of_the_last_administrator_is_refused`, `test_removing_the_credentials_of_a_player_is_fine`, `test_removing_credentials_is_fine_while_another_administrator_can_log_in`

Literals to preserve verbatim:

- `cannot_remove_last_administrator`, `first_name`, `last_name`

Requirements, from the plan's own comments:

- The hole this closes. `members` rows are PEOPLE: username and password are
  nullable so an instructor on the public page, or a child whose parent
  answers, needs no login. Somebody who holds members.manage but has no
  username cannot administer anything, so they cannot be the reason a
  deletion is allowed.


> This file already has a helper that creates a member holding
> `members.manage`. Read it and use it — `$this->administrator()` is the name to
> expect. If it differs, use the real one rather than adding a second. It must
> create members WITH credentials; if it does not, these tests are meaningless.

- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=AccessIntegrityTest
```

Expected: FAIL. The first two fail because a credential-less holder still
counts, so no exception is thrown; the third fails with
`Call to undefined method …::assertMayRemoveCredentials()`.

- [x] **Step 3: Give Member the question to answer**

In `api/app/Models/Member.php`, below `isPlayer()`:


**Implement `api/app/Models/Member.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `canAuthenticate`

Requirements, from the plan's own comments:

- Whether this person can actually log in. A row is a person, not an
  account, so both credentials are nullable — and a permission held by
  somebody who cannot authenticate protects nobody. AccessIntegrity's
  lockout invariants count only members for whom this is true.


- [x] **Step 4: Count only reachable administrators**

In `api/app/Support/AccessIntegrity.php`, replace `wouldOrphanAdministration()`
entirely:


**Implement `api/app/Support/AccessIntegrity.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `wouldOrphanAdministration`

Requirements, from the plan's own comments:

- True when removing these members would leave nobody who can BOTH
  administer members and log in. The credential filter is the point.
  `members` rows are people: username and password are nullable so an
  instructor on the public page needs no login. Counting such a row as an
  administrator let this sequence lock the band out while passing every
  invariant — two administrators, delete one, clear the other's username —
  and the host has no shell to repair it with. This also returns true when
  nobody holds members.manage in the first place. R1b's controller cannot
  reach that state (it is gated on members.manage), but a seeder or console
  command calling in against such a database would find every deletion
  refused. Not a guarantee that removing these members is the cause. @param
  array<int, int>  $excludedMemberIds


- [x] **Step 5: Add the credentials invariant**

In the same file, below `assertMayReplaceRoles()`:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `assertMayRemoveCredentials`

Literals to preserve verbatim:

- `cannot_remove_last_administrator`

Requirements, from the plan's own comments:

- Refuses to take away the login of the last person who can administer
  members. PATCH /api/members/{id} can clear a username, and no other
  invariant looks at credentials — so without this, "edit this person and
  blank their username" is a lockout with none of the ceremony deleting them
  would have required. Only the ORPHAN case is checked. Removing your own
  login while another administrator can still log in is a strange thing to
  do, but it is recoverable by that administrator — and refusing it would
  also refuse the legitimate case of an outgoing committee member who stays
  on the public roster as a person.


`use App\Models\Member;` is already imported in this file.

- [x] **Step 6: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=AccessIntegrityTest
```

Expected: PASS, including the five new tests.

- [x] **Step 7: Mutation-test the change**

This project has shipped four tests that asserted nothing. Prove these do not.

1. Delete the two `whereNotNull()` calls in `wouldOrphanAdministration()`.
   Re-run. **Expect** `test_a_credential_less_administrator_does_not_count_as_one`
   and `test_stripping_the_last_reachable_administrators_roles_is_refused` to
   FAIL.
2. Restore them, and empty the body of `assertMayRemoveCredentials()`. Re-run.
   **Expect** `test_removing_the_credentials_of_the_last_administrator_is_refused`
   to FAIL.
3. Restore. Re-run: green.

Record in the commit message what failed at each step.

- [x] **Step 8: Run the whole suite**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS. `AccessIntegrityTest`'s existing tests create members with
credentials, so the tightened count does not move them. If any existing test
DOES move, read it before changing it — it may be describing the old, wrong
behaviour.

- [x] **Step 9: Commit**

```bash
git add api/app/Support/AccessIntegrity.php api/app/Models/Member.php \
        api/tests/Feature/AccessIntegrityTest.php
git commit -m "fix(api): an administrator who cannot log in is not an administrator"
```

---

## How these endpoints are shaped, and why — measured, not assumed

Before writing any controller, know these three facts. **All three were
measured against the installed Scramble on 2026-09-07** by generating the
document from a throwaway controller and reading the result; none of them is
inferred from documentation.

**1. Scramble cannot see through `->map(closure)`.** This controller —


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


— produces this schema, which orval turns into `string[]`:


**Implement the json described here.** _(verbatim json removed — derive it from these requirements and the code as it actually is)_


A whole screen's data silently untyped, with no error anywhere. **Do not build
a list response by mapping a closure.**

**2. An API Resource gives a named schema with correct nullability.** The same
payload through `MemberResource::collection(...)`, returned from a method typed
`AnonymousResourceCollection`, produces `#/components/schemas/MemberResource`
with `username` typed `["string","null"]` — Scramble reads the column's
nullability off the model. This is the shape to use for every list and every
single-member response.

**3. Two gotchas inside a Resource, both measured:**

- **The `data` wrapper.** `JsonResource` wraps collections in `{"data": […]}`
  by default, which `/api/me` and `/api/config` do not do, and which every
  hand-written MSW handler would then have to imitate.
  `JsonResource::withoutWrapping()` in `AppServiceProvider::boot()` removes it
  **from the OpenAPI schema as well as the response** — verified: the response
  schema becomes a bare `{"type":"array","items":{"$ref":…}}`. Add that call in
  Task 6, with the first Resource.
- **`->pluck()->all()` types as an untyped object.** Written inline,
  `'roleIds' => $this->roles->pluck('id')->all()` produces
  `{"type":"object","additionalProperties":{}}`. Moved into a private method
  with a `/** @return list<int> */` docblock it produces
  `{"type":"array","items":{"type":"integer"}}`. **Every non-scalar value in a
  Resource goes through a typed private method.**

**And one about caching.** Every identity-dependent response needs
`Cache-Control: no-store` (§4). `ConfigController` and `AuthController::me()`
set it inline today; nine more endpoints setting a header by hand is a rule
that lasts until the tenth. Task 6 adds a route middleware instead. Note that
**Symfony's `Response::prepare()` appends `", private"` whenever a session
cookie is present**, so assert with `assertStringContainsString('no-store', …)`
rather than an exact match — `ConfigEndpointTest::test_it_is_not_cacheable`
documents exactly this and is the model to copy.

---

## Task 6: The register and role lists, and the shape everything else follows

**Why first among the endpoints.** The member form cannot render a register
dropdown or a role checklist without them, and they establish the Resource +
`no-store` pattern that Tasks 7–10 reuse.

**Both are gated on `permission:members.manage`,** even though a register name
is hardly a secret. The reason is YAGNI, not secrecy: `/members` is the only
consumer that exists, and R2 — which needs the register list for the public
band page — can widen the gate when it has a second consumer to justify it.
Opening it now would be guessing at R2's requirements.

**Files:**
- Create: `api/app/Http/Middleware/NoStoreResponse.php`
- Create: `api/app/Http/Resources/SectionResource.php`, `RoleResource.php`
- Create: `api/app/Http/Controllers/Api/SectionController.php`, `RoleController.php`
- Create: `api/tests/Feature/SectionAndRoleIndexTest.php`
- Modify: `api/app/Providers/AppServiceProvider.php`, `api/bootstrap/app.php`, `api/routes/api.php`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/SectionAndRoleIndexTest.php`:


**Implement `api/tests/Feature/SectionAndRoleIndexTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `SectionAndRoleIndexTest`, `actingAsAdministrator`, `test_the_registers_come_back_in_their_configured_order`, `test_the_roles_come_back_with_what_they_grant`, `test_neither_list_is_wrapped_in_a_data_envelope`, `test_neither_list_may_be_cached`, `test_an_anonymous_caller_gets_401_not_403`, `test_a_member_without_members_manage_gets_403`

Literals to preserve verbatim:

- `first_name`, `last_name`, `/api/sections`, `/api/roles`,
  `not_authenticated`, `status 401`, `status 403`, `access_denied`

Requirements, from the plan's own comments:

- Every authenticated request in this suite needs BOTH the Origin header and
  the auth.started_at stamp: the header makes Sanctum treat the request as
  coming from a stateful frontend and attach a session store at all, and the
  stamp satisfies EnforceAbsoluteSessionLifetime, which fails closed on a
  session it cannot date. Mirrors PermissionMiddlewareTest.
- The list the 2026_09_07_000001 migration seeds, in sort_order — NOT in id
  order, and not alphabetical. The old front end hardcoded this order in
  TSX, where it drifted from the table.
- JsonResource wraps collections in {"data": …} by default. /api/me and
  /api/config return bare payloads, so wrapping here would give the API two
  shapes for no reason — and every hand-written MSW handler would have to
  imitate the wrapper.
- Not an exact-match assertion: Symfony's Response::prepare() appends ",
  private" whenever a session cookie is present. See
  ConfigEndpointTest::test_it_is_not_cacheable for the full reasoning.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SectionAndRoleIndexTest
```

Expected: FAIL — every test 404s, because the routes do not exist. (The
anonymous test may *appear* to pass for the wrong reason: a 404 is not a 401.
Read the failure output rather than the summary line.)

- [x] **Step 3: Turn off resource wrapping**

In `api/app/Providers/AppServiceProvider.php`:


**Implement `api/app/Providers/AppServiceProvider.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


and in `boot()`:


**Implement `api/app/Providers/AppServiceProvider.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- This API returns bare payloads: /api/config and /api/me both do, and the
  {error, code, fields[]} error contract has no envelope either.
  JsonResource wraps COLLECTIONS in {"data": …} by default, which would give
  the same API two shapes depending on whether a response happened to be
  built from a Resource. Verified 2026-09-07: this also removes the wrapper
  from the generated OpenAPI schema, not just from the response — so the
  generated client and the MSW handlers agree with the real API rather than
  each other.


- [x] **Step 4: Write the no-store middleware**

Create `api/app/Http/Middleware/NoStoreResponse.php`:


**Implement `api/app/Http/Middleware/NoStoreResponse.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `NoStoreResponse`, `handle`

Requirements, from the plan's own comments:

- Marks a response as never cacheable. WHY IT IS A MIDDLEWARE. Design §4:
  "Because /events varies by identity, every identity-dependent API response
  must send Cache-Control: no-store, or a shared proxy can serve a member's
  view to an anonymous visitor. The current split-by-page design avoided
  this bug by accident; the new one must avoid it on purpose." On purpose
  means structurally. Nine roster endpoints each remembering to call
  ->header(...) is a rule that holds until the tenth is added by somebody
  who did not read the other nine. Sets `no-store` alone and lets Symfony's
  Response::prepare() append ", private" as it already does whenever a
  session cookie is present — which on these routes is always. Tests should
  therefore assert the DIRECTIVE, not the header's exact string.


- [x] **Step 5: Alias it**

In `api/bootstrap/app.php`, extend the existing alias array:


**Implement `api/bootstrap/app.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


and add `use App\Http\Middleware\NoStoreResponse;`.

- [x] **Step 6: Write the two Resources**

Create `api/app/Http/Resources/SectionResource.php`:


**Implement `api/app/Http/Resources/SectionResource.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `SectionResource`, `toArray`

Requirements, from the plan's own comments:

- A register ("pupitre"). @mixin \App\Models\Section
- @return array<string, mixed>


Create `api/app/Http/Resources/RoleResource.php`:


**Implement `api/app/Http/Resources/RoleResource.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `RoleResource`, `toArray`, `permissionValues`

Requirements, from the plan's own comments:

- A role, WITH what it grants. The permissions travel with the role because
  that is how the UI answers "why does she have this?" — always "because she
  is in Team Direction", never a per-member grant (design §3). The roster
  screen therefore needs no per-member permission list, which also keeps GET
  /api/members to one query per relation instead of one per member. @mixin
  \App\Models\Role
- @return array<string, mixed>
- A typed method, not an inline expression, and that is not style. Measured
  2026-09-07: written inline this types as
  {"type":"object","additionalProperties":{}} in the OpenAPI document and
  arrives in TypeScript as an untyped object. The docblock is what makes it
  string[]. @return list<string>


- [x] **Step 7: Write the two controllers**

Create `api/app/Http/Controllers/Api/SectionController.php`:


**Implement `api/app/Http/Controllers/Api/SectionController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `SectionController`, `index`

Literals to preserve verbatim:

- `sort_order`

Requirements, from the plan's own comments:

- The registers, in their configured order. The return type is
  AnonymousResourceCollection rather than JsonResponse deliberately: it is
  what lets Scramble emit a $ref to a named schema. Wrapping this in
  response()->json() would erase the type and generate `string[]` in the
  client — measured, see this plan's preamble. `index()` rather than
  `__invoke()`, even though this controller has one action: Scramble names
  the operation after controller + method and drops the method for a single-
  action controller, so `__invoke` would generate the hook `useSection` for
  something that returns a list. `index` gives `useSectionIndex`.


Create `api/app/Http/Controllers/Api/RoleController.php`:


**Implement `api/app/Http/Controllers/Api/RoleController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `RoleController`, `index`

Requirements, from the plan's own comments:

- `index()`, not `__invoke()` — see SectionController for why.


- [x] **Step 8: Add the routes**

Replace the `auth:sanctum` group in `api/routes/api.php` with:


**Implement `api/routes/api.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- `no-store` on the whole authenticated group: every response below depends
  on who is asking, and a shared proxy that cached one would serve one
  member's view to another (design §4). A middleware rather than nine
  ->header() calls, so the tenth endpoint cannot forget.
- Any account holder may change their OWN password, so this is gated on
  authentication alone. It re-verifies the current password itself. (Added
  in Task 10 — leave it out until then.)
- Member administration. `permission:` never sees a role name: roles merely
  group permissions, and which role granted this one is not a question the
  enforcement point may ask (design §3).
- Read-only reference data the roster form needs. Gated on members.manage
  because /members is the only consumer that exists; R2's public band page
  can widen it when it has a second one.


and add the two imports.

- [x] **Step 9: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=SectionAndRoleIndexTest
```

Expected: PASS, 6 tests.

- [x] **Step 10: Confirm the middleware did not disturb `/api/me`**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MeTest
```

Expected: PASS. `MeTest` asserts the exact string `no-store, private`:
`me()` sets it inline, this middleware overwrites it with `no-store` on the way
out, and Symfony appends `, private` — landing on the same value. **If that
test fails, do not loosen it.** Delete the inline `->header('Cache-Control',
…)` from `AuthController::me()` instead, with a comment pointing at the
middleware, and re-run.

- [x] **Step 11: Run the whole suite, then commit**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
git add api/app/Http/Middleware/NoStoreResponse.php api/app/Http/Resources \
        api/app/Http/Controllers/Api/SectionController.php \
        api/app/Http/Controllers/Api/RoleController.php \
        api/app/Providers/AppServiceProvider.php api/bootstrap/app.php \
        api/routes/api.php api/tests/Feature/SectionAndRoleIndexTest.php
git commit -m "feat(api): the register and role lists the roster form needs

Establishes the shape the rest of R1b follows: API Resources (which Scramble
turns into named schemas with correct nullability), withoutWrapping so the API
keeps one payload shape, every non-scalar value through a typed private method
because an inline pluck() generates an untyped object, and no-store as a
middleware so the tenth identity-dependent endpoint cannot forget it."
```

---

## Task 7: The roster

**Files:**
- Create: `api/app/Http/Resources/MemberResource.php`
- Create: `api/app/Http/Controllers/Api/MemberController.php`
- Create: `api/tests/Feature/MemberIndexTest.php`
- Modify: `api/routes/api.php`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/MemberIndexTest.php`:


**Implement `api/tests/Feature/MemberIndexTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberIndexTest`, `administrator`, `actingAsAdministrator`, `test_it_lists_people_with_and_without_accounts`, `test_it_is_ordered_by_name_so_a_person_can_be_found`, `test_each_entry_carries_what_the_roster_screen_renders`, `test_it_never_exposes_a_password_hash`, `test_a_person_without_a_register_is_not_a_player`, `test_it_answers_401_anonymously_and_403_without_the_permission`, `test_listing_the_roster_costs_a_fixed_number_of_queries`

Literals to preserve verbatim:

- `first_name`, `last_name`, `section_id`, `public_visible`, `/api/members`,
  `committee_title`, `status 401`, `status 403`

Requirements, from the plan's own comments:

- A person with no credentials at all — an instructor on the public page, or
  a child whose parent answers. ONE ROSTER: if this row is missing from the
  list, the screen is an account list wearing a roster's name, and the
  person can never be given an account.
- $hidden on the model covers a model serialised directly; a Resource that
  reads $this->password would sail straight past it. This is the assertion
  that catches that.
- The single fact that decides who is answerable for events. An organiser
  with no register must not appear in an attendance list, or every count
  carries a permanent phantom "sans réponse".
- ~45 members is the real roster. Without eager loading this is three
  queries per person on a shared host, and the screen that administers the
  band is the one that feels it.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberIndexTest
```

Expected: FAIL — 404 on every request.

- [x] **Step 3: Write the Resource**

Create `api/app/Http/Resources/MemberResource.php`:


**Implement `api/app/Http/Resources/MemberResource.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberResource`, `toArray`, `roleIds`, `lastLoginAt`

Requirements, from the plan's own comments:

- One person on the roster. A ROW IS A PERSON, NOT AN ACCOUNT, and this
  payload has to say so: username and hasAccount are separate fields
  precisely because a person with neither still belongs on the roster, still
  has a register, and can still be given an account later. NO PASSWORD
  FIELD, AND NO PERMISSIONS FIELD. The password hash is absent because
  nothing may ever read it back — the model's $hidden protects a directly-
  serialised model, but a Resource that reads $this->password would sail
  straight past it, so the protection here is simply not writing the line.
  MemberIndexTest asserts the rendered body contains no hash prefix.
  Permissions are absent because they are answered by the ROLE: the roster
  sends roleIds, GET /api/roles sends what each role grants, and the UI
  joins them. That is what makes "why does she have this?" answerable —
  always "because she is in Team Direction" (design §3) — and it keeps this
  endpoint at a fixed number of queries instead of one per member. @mixin
  \App\Models\Member
- @return array<string, mixed>
- Whether they PLAY, which is the single fact that decides who is answerable
  for an event. Derived from section_id rather than stored, so the two can
  never disagree.
- Not the same question as "has a username": both credentials must be
  present to log in, and the lockout invariants count only people for whom
  that is true.
- Typed methods, not inline expressions. Measured 2026-09-07: an inline
  `->pluck('id')->all()` types as an untyped object in the OpenAPI document
  and arrives in TypeScript as `object`. The docblock is what makes it
  `number[]`. @return list<int>


- [x] **Step 4: Write the controller's index**

Create `api/app/Http/Controllers/Api/MemberController.php`:


**Implement `api/app/Http/Controllers/Api/MemberController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberController`, `index`

Literals to preserve verbatim:

- `last_name`, `first_name`

Requirements, from the plan's own comments:

- The whole roster — everyone, account or not. Ordered by name because this
  screen is scanned for a person, not browsed by register. Grouping by
  register is the UI's business, and it has sectionName to do it with.
  with() is not an optimisation to revisit later: ~45 members without it is
  three queries each on a shared host.


- [x] **Step 5: Add the route**

Inside the `permission:members.manage` group in `api/routes/api.php`:


**Implement `api/routes/api.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 6: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberIndexTest
```

Expected: PASS, 7 tests. If the query-count test fails, `with(['section',
'roles'])` is missing or a Resource method is touching a relation it did not
eager-load.

- [x] **Step 7: Commit**

```bash
git add api/app/Http/Resources/MemberResource.php \
        api/app/Http/Controllers/Api/MemberController.php \
        api/routes/api.php api/tests/Feature/MemberIndexTest.php
git commit -m "feat(api): GET /api/members, the whole roster

Everyone, account or not — one roster (design §8), so a person with no
credentials is listed, has a register, and can be given an account later. No
password field and no per-member permission list: permissions are answered by
the role, which is what keeps 'why does she have this?' answerable and this
endpoint at a fixed query count."
```

---

## Task 8: Create and edit a person

**One design decision, taken here and load-bearing for the two tasks after it:
`POST /api/members` never creates a password.** It creates a person, optionally
with a username. Turning that into a working account is
`POST /api/members/{member}/password` (Task 10) — the *same* operation as a
reset.

Three reasons, in order of weight:

1. **§4.4 describes exactly one way a password comes into being:** an
   administrator opens a member, hits "Réinitialiser le mot de passe", and
   reads out what appears. "Give this existing person an account" and "reset
   this person's password" are then literally the same operation, with one
   implementation and one dialog.
2. **Every response stays a single inferable shape.** A create that answered
   `{member: …, generatedPassword: …}` mixes a Resource into a literal, and
   Scramble's inference through that is unknown — the measured facts in this
   plan's preamble cover Resources and literals, not hybrids. One shape per
   endpoint keeps the generated client honest.
3. A credential in a *creation* response is a credential in a response that
   the UI was not necessarily built to treat as secret.

**Files:**
- Create: `api/app/Http/Requests/StoreMemberRequest.php`, `UpdateMemberRequest.php`
- Create: `api/tests/Feature/MemberWriteTest.php`
- Modify: `api/app/Http/Controllers/Api/MemberController.php`, `api/routes/api.php`
- Modify: `api/app/Exceptions/ApiError.php`, `web/src/i18n/fr.ts`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/MemberWriteTest.php`:


**Implement `api/tests/Feature/MemberWriteTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberWriteTest`, `setUp`, `section`, `test_it_creates_a_person_with_a_register_and_roles`, `test_a_created_person_has_no_password_and_therefore_no_account_yet`, `test_it_creates_a_person_with_no_username_at_all`, `test_a_duplicate_username_is_reported_against_its_own_field`, `test_a_missing_name_is_a_validation_failure_not_a_500`, `test_creating_a_person_is_audited_with_their_name`, `test_it_updates_only_the_fields_that_were_sent`, `test_updating_a_person_keeps_their_own_username`, `test_clearing_a_username_also_clears_the_password_and_ends_the_sessions`, `test_clearing_the_last_administrators_username_is_refused_as_409`, `test_neither_write_requires_re_authentication`, `test_a_player_cannot_write_to_the_roster`

Literals to preserve verbatim:

- `first_name`, `last_name`, `/api/members`, `status 400`,
  `validation_failed`, `already_taken`, `section_id`, `public_visible`,
  `/api/members/{`, `user_id`, `ip_address`, `user_agent`, `last_activity`,
  `status 409`, `cannot_remove_last_administrator`, `status 403`

Requirements, from the plan's own comments:

- Deliberate: creating a person and issuing a credential are separate
  operations, and issuing one is the same operation as resetting one (§4.4).
  A create that minted a password would be a second way for a credential to
  come into being.
- An instructor on the public page, or a child whose parent answers.
- The most likely error on this whole screen, so its copy matters. An
  unmapped `unique` rule would render "Identifiant n'est pas dans un format
  valide", which is both wrong and unhelpful.
- Untouched, because PATCH means PATCH. A form that posts only the changed
  field must not silently blank the rest.
- The unique rule must ignore the row being edited, or renaming somebody's
  surname fails because their username is "already taken" by themselves.
- The lockout this closes: no invariant used to look at credentials, so
  "edit this person and blank their username" was a lockout with none of the
  ceremony that deleting them would have required. The host has no shell, so
  the repair would be Adminer.
- Deliberate. Creating and editing a person are not destructive, and a
  password prompt on every corrected typo is a prompt people learn to type
  through without reading — which is worse than not having one, because it
  trains the reflex that the destructive dialogs rely on.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberWriteTest
```

Expected: FAIL — 404 on POST and PATCH.

- [x] **Step 3: Map the `unique` rule to a token worth reading**

In `api/app/Exceptions/ApiError.php`, add to the `REASONS` map, after
`'max' => 'too_long',`:


**Implement `api/app/Exceptions/ApiError.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `already_taken`

Requirements, from the plan's own comments:

- The likeliest failure on the roster form, so it does not get the generic
  fallback: an unmapped rule renders "n'est pas dans un format valide",
  which for a taken username is both wrong and useless.


> `exists` is deliberately left unmapped. It can only fail from a stale form
> holding a register or role that has since been deleted, and the generic
> "n'est pas dans un format valide" is a survivable sentence for a case the
> user fixes by reloading. Adding a token for it would mean adding French copy
> for a message nobody should ever see.

In `web/src/i18n/fr.ts`, add to `validation`:


**Implement `web/src/i18n/fr.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 4: Write the two Form Requests**

Create `api/app/Http/Requests/StoreMemberRequest.php`:


**Implement `api/app/Http/Requests/StoreMemberRequest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `StoreMemberRequest`, `rules`

Requirements, from the plan's own comments:

- Field names are camelCase, matching what the SPA sends and what
  App\Exceptions\ApiError echoes into fields[].field, where
  web/src/i18n/fr.ts looks them up. Renaming one silently breaks its French
  error message. RULE ORDER IS LOAD-BEARING: ApiError reports only the FIRST
  failed rule per field, so `required` comes first (an empty field reports
  `required`, not `invalid_format`) and `max` precedes `unique` (an over-
  long username reports `too_long`, not a database round-trip). There is
  deliberately no `password` field. Creating a person and issuing a
  credential are separate operations — see MemberPasswordController.
- @return array<string, array<int, mixed>>
- Lower case, digits, dot, hyphen, underscore. The seeded logins look like
  `demo.direction`, and a username that has to be dictated should not depend
  on capitalisation. Note the column collates case-insensitively, so `Lea`
  and `lea` would be the same account anyway — the rule makes that visible
  rather than surprising.
- Required, not defaulted: publication of a minor's name is a decision
  somebody makes, so the form has to state it rather than inherit it.


Create `api/app/Http/Requests/UpdateMemberRequest.php`:


**Implement `api/app/Http/Requests/UpdateMemberRequest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `UpdateMemberRequest`, `rules`

Requirements, from the plan's own comments:

- PATCH, so every rule is `sometimes`: a form that posts only the field it
  changed must not blank the others. `sometimes` is not the same as
  `nullable`, and both are needed on the nullable columns — `sometimes`
  means "skip this field if absent", `nullable` means "null is a legal value
  when present". Without `sometimes` an absent field fails `required`;
  without `nullable` an explicit null fails the type rules. Clearing a
  register is an explicit null, so both matter. Roles are NOT here.
  Replacing them is PUT /api/members/{member}/roles, which needs re-
  authentication and its own invariant check — folding it into the general
  edit would put a privilege change behind a form that has neither.
- @return array<string, array<int, mixed>>
- @var \App\Models\Member $member
- ignore() the row being edited, or renaming somebody's surname fails
  because their username is "already taken" by themselves.


- [x] **Step 5: Write store() and update()**

Add to `api/app/Http/Controllers/Api/MemberController.php`:


**Implement `api/app/Http/Controllers/Api/MemberController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `store`, `update`

Literals to preserve verbatim:

- `first_name`, `last_name`, `section_id`, `committee_title`,
  `instructor_of_section_id`, `public_visible`

Requirements, from the plan's own comments:

- Creates a person. NOT an account: see this class's password sibling.
- No AccessIntegrity check: adding a person, with or without roles, cannot
  orphan administration or demote anybody.
- Edits a person. Roles and passwords are elsewhere, each behind its own re-
  authentication.
- The lockout nothing else guards: PATCH can blank a username, and an
  administrator who cannot log in is not an administrator.
- The nullable columns go through exists(), not has(): has() is false for an
  explicitly-sent null, so clearing a register would silently do nothing.
- Both, together. A password with no username is a credential nothing can
  use and nobody can see, which is how a "removed" account stays half-alive
  in the table.
- Their login just stopped existing, so their sessions must stop with it —
  otherwise the account keeps working until the cookie expires on its own.


with these imports added at the top of the file:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


> **`array_filter` on the fill() array is a trap in the making** — it drops
> any value that is `null`, which is exactly right for `firstName`/`lastName`
> (both `required` when present, so a null can only mean "absent") and exactly
> wrong for anything nullable. That is why the nullable columns are handled
> separately below it. If you add another non-nullable field, put it in the
> `fill()`; anything nullable goes in the `foreach`.

- [x] **Step 6: Add the routes**

Inside the `permission:members.manage` group:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberWriteTest
docker compose exec -w /var/www/html/_api web php artisan test --filter=ApiErrorVocabularyTest
```

Expected: PASS, 12 tests, and the vocabulary guard green.

- [x] **Step 8: Commit**

```bash
git add api/app/Http/Requests/StoreMemberRequest.php api/app/Http/Requests/UpdateMemberRequest.php \
        api/app/Http/Controllers/Api/MemberController.php api/app/Exceptions/ApiError.php \
        api/routes/api.php api/tests/Feature/MemberWriteTest.php web/src/i18n/fr.ts
git commit -m "feat(api): create and edit a person on the roster

Creating a person never mints a password: issuing a credential is the same
operation as resetting one (§4.4), so there is one implementation and one
dialog. Clearing a username clears the password and ends the sessions with it,
and is refused outright when it would leave nobody able to log in and
administer — the lockout no invariant used to look at."
```

---

## Task 9: Delete a person, and change what they can do

Both are destructive, both need re-authentication, and both are the reason
`AccessIntegrity`, `SessionRevoker` and `Audit` exist.

**Files:**
- Create: `api/app/Http/Requests/ReplaceMemberRolesRequest.php`
- Create: `api/app/Http/Controllers/Api/MemberRoleController.php`
- Create: `api/tests/Feature/MemberRolesTest.php`
- Modify: `api/app/Http/Controllers/Api/MemberController.php`, `api/routes/api.php`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/MemberRolesTest.php`:


**Implement `api/tests/Feature/MemberRolesTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberRolesTest`, `setUp`, `administrator`, `player`, `sessionFor`, `test_it_replaces_a_members_roles`, `test_a_role_change_ends_that_members_sessions_immediately`, `test_a_role_change_does_not_end_anybody_elses_sessions`, `test_a_role_change_is_audited`, `test_a_wrong_password_changes_nothing`, `test_a_missing_password_is_a_validation_failure`, `test_removing_your_own_administration_is_refused`, `test_stripping_the_last_administrator_is_refused`, `test_deleting_a_member_removes_them_and_ends_their_sessions`, `test_deleting_a_member_is_audited_with_the_name_they_had`, `test_deleting_yourself_is_refused`, +2 more

Literals to preserve verbatim:

- `ACTOR_PASSWORD = 'the-actors-password'`, `first_name`, `last_name`,
  `user_id`, `ip_address`, `user_agent`, `last_activity`, `/api/members/{`,
  `status 403`, `reauth_failed`, `status 400`, `validation_failed`, `status
  409`, `cannot_demote_self`, `cannot_remove_last_administrator`,
  `cannot_delete_self`, `access_denied`

Requirements, from the plan's own comments:

- A revoked permission that only takes effect at the next login is a
  permission the holder can keep using all evening.
- Even with a second administrator present, so this is the self-demotion
  guard and not the orphan one.
- The orphan check outranks the self-demotion one when both apply: "you
  would lock everyone out" is the more informative answer.
- Captured BEFORE the delete, or the audit records an empty string — the row
  is gone by the time anyone reads it back.


- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberRolesTest
```

Expected: FAIL — 404 on PUT and DELETE.

- [x] **Step 3: Write the roles request**

Create `api/app/Http/Requests/ReplaceMemberRolesRequest.php`:


**Implement `api/app/Http/Requests/ReplaceMemberRolesRequest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `ReplaceMemberRolesRequest`, `rules`

Requirements, from the plan's own comments:

- PUT semantics: `roleIds` is the complete set the member will be left with,
  and an empty array means "no roles". That is deliberate — a PATCH-style
  "add this one" API cannot express removal, and removal is the half that
  needs the invariants. `roleIds` is `present` rather than `required`:
  `required` rejects an empty array, which is the most important value this
  endpoint accepts.
- @return array<string, array<int, mixed>>


- [x] **Step 4: Write the roles controller**

Create `api/app/Http/Controllers/Api/MemberRoleController.php`:


**Implement `api/app/Http/Controllers/Api/MemberRoleController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberRoleController`, `__invoke`

Requirements, from the plan's own comments:

- Replaces one member's roles — which is the only way any permission is ever
  granted or taken away (design §3: no direct per-member grants). THE ORDER
  OF THE FIRST THREE CALLS IS THE WHOLE SECURITY OF THIS ENDPOINT: 1. re-
  authenticate — before anything is read or written, so a stolen session
  cannot change what anybody can do; 2. check the invariants — before the
  write, so a refusal leaves no trace; 3. write, then revoke, then audit.
  Getting 1 and 2 the other way round would leak whether a change WOULD be
  allowed to somebody who cannot make it. Getting 3 wrong — revoking before
  writing — would end the sessions and then fail, leaving the member logged
  out with their old permissions intact.
- @var array<int, int> $roleIds
- Captured before the write, so the audit records who this was at the time
  of the change.
- In the SAME transaction as the change (§6). A revoked permission that only
  takes effect at the next login is a permission the holder can keep using
  all evening.


- [x] **Step 5: Write destroy()**

Add to `api/app/Http/Controllers/Api/MemberController.php`:


**Implement `api/app/Http/Controllers/Api/MemberController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `destroy`

Requirements, from the plan's own comments:

- Removes a person entirely. Existence is the state (design D3): there is no
  `active` flag and no soft delete, so leaving the band is this. Same
  ordering rule as MemberRoleController: re-authenticate, then check the
  invariants, then write — and capture the name BEFORE the delete, because
  the row is gone by the time anyone reads the audit back.
- Before the delete, not after: member_roles and the foreign keys cascade,
  but `sessions` has NO foreign key to members — so a deleted member stays
  logged in until their cookie expires unless this runs. Without it, hard-
  delete is theatre.


and add the imports `use App\Support\Reauthentication;` and
`use Illuminate\Http\Request;`.

- [x] **Step 6: Add the routes**

Inside the `permission:members.manage` group:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberRolesTest
```

Expected: PASS, 13 tests.

- [x] **Step 8: Mutation-test the ordering claims**

The class comment asserts that the call order is the security of the endpoint.
Prove the tests can tell.

1. Move `Reauthentication::assert()` in `MemberRoleController` to *after*
   `AccessIntegrity::assertMayReplaceRoles()`. Re-run. **Expect**
   `test_removing_your_own_administration_is_refused` to now answer 409 for a
   caller who supplied a wrong password too — write a note if no test catches
   it, and add one that does: a wrong password against a self-demotion must
   report `reauth_failed`, not `cannot_demote_self`.
2. Remove the `SessionRevoker::forMember()` call from the roles controller.
   Re-run. **Expect** `test_a_role_change_ends_that_members_sessions_immediately`
   to FAIL.
3. Move `SessionRevoker::forMember()` in `destroy()` to after `$member->delete()`.
   Re-run — it will still pass, because the delete cascades nothing into
   `sessions`. **This is worth knowing:** the ordering there is about
   transaction safety, not correctness of the row count. Leave it before the
   delete anyway, and record that the test does not distinguish it.
4. Revert all three.

- [x] **Step 9: Run the whole suite, then commit**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
git add api/app/Http/Requests/ReplaceMemberRolesRequest.php \
        api/app/Http/Controllers/Api/MemberRoleController.php \
        api/app/Http/Controllers/Api/MemberController.php \
        api/routes/api.php api/tests/Feature/MemberRolesTest.php
git commit -m "feat(api): delete a member, and replace their roles

The first callers AccessIntegrity, SessionRevoker and Audit have had since R1a
built them. Both endpoints re-authenticate before reading anything, check the
invariants before writing, and revoke inside the same transaction as the
change — a revoked permission that waits for the next login is one the holder
keeps using all evening, and a deleted member with a live session is theatre."
```

---

## Task 10: Issuing a password, and changing your own

Two endpoints that look similar and differ in every detail that matters:

| | `POST /api/members/{member}/password` | `POST /api/me/password` |
| --- | --- | --- |
| Gate | `permission:members.manage` | `auth:sanctum` — any account holder |
| Who chooses the password | the system (`GeneratedPassword`) | the member |
| Shown once | yes, that is the point | never — they typed it |
| `must_change_password` after | **set** | **cleared** |
| Sessions | **all** of the target's die | all the actor's **other** ones die |
| Audit action | `member.password_reset` | `account.password_changed` |

**Files:**
- Create: `api/app/Http/Controllers/Api/MemberPasswordController.php`
- Create: `api/app/Http/Controllers/Api/AccountPasswordController.php`
- Create: `api/app/Http/Requests/AccountPasswordRequest.php`
- Create: `api/tests/Feature/MemberPasswordTest.php`, `AccountPasswordTest.php`
- Modify: `api/app/Exceptions/ApiError.php`, `api/routes/api.php`, `web/src/i18n/fr.ts`

- [x] **Step 1: Write the failing test for issuing a password**

Create `api/tests/Feature/MemberPasswordTest.php`:


**Implement `api/tests/Feature/MemberPasswordTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberPasswordTest`, `setUp`, `member`, `test_it_returns_a_password_once_and_stores_only_its_hash`, `test_it_forces_a_change_at_the_next_login`, `test_it_turns_a_person_without_an_account_into_one_with_an_account`, `test_a_person_with_no_username_cannot_be_given_a_password`, `test_it_ends_every_session_the_target_had`, `test_resetting_your_own_password_here_keeps_you_logged_in`, `test_it_is_audited`, `test_a_wrong_password_issues_nothing`, `test_the_generated_password_never_appears_in_the_audit_log`, `test_a_player_cannot_issue_a_password`

Literals to preserve verbatim:

- `ACTOR_PASSWORD = 'the-actors-password'`, `first_name`, `last_name`,
  `/api/members/{`, `status 400`, `validation_failed`,
  `required_before_password`, `user_id`, `ip_address`, `user_agent`,
  `last_activity`, `status 403`, `reauth_failed`, `access_denied`

Requirements, from the plan's own comments:

- The password was read out loud down a phone, so it is not a secret and
  must not survive first use.
- Issuing a credential and resetting one are the SAME operation (§4.4),
  which is why POST /api/members never mints a password.
- A password with no username is a credential nothing can use. The
  administrator has to give them a username first, and the message says
  which field to fix.
- The UI sends an administrator to /account for their own password, so this
  path is unusual — but being logged out by your own click, with a generated
  password you then have to use, is a bad enough outcome to be worth one
  branch. The forced change still applies.
- The one place a credential could plausibly get written down forever.


- [x] **Step 2: Write the failing test for changing your own password**

Create `api/tests/Feature/AccountPasswordTest.php`:


**Implement `api/tests/Feature/AccountPasswordTest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `AccountPasswordTest`, `setUp`, `actingAsMember`, `test_a_member_can_change_their_own_password`, `test_it_clears_the_forced_change_flag`, `test_the_wrong_current_password_changes_nothing`, `test_a_short_password_is_refused_with_a_message_about_length`, `test_it_ends_the_members_other_sessions_but_not_this_one`, `test_the_member_is_still_logged_in_afterwards`, `test_it_is_audited_without_either_password`, `test_an_anonymous_caller_gets_401`

Literals to preserve verbatim:

- `CURRENT = 'issued-by-the-committee'`, `first_name`, `last_name`,
  `must_change_password`, `/api/me/password`, `status 403`, `reauth_failed`,
  `status 400`, `validation_failed`, `too_short`, `user_id`, `ip_address`,
  `user_agent`, `last_activity`, `/api/me`, `status 401`

Requirements, from the plan's own comments:

- NOT actingAs() here: one test below must be genuinely anonymous, and un-
  acting afterwards is fragile. Every other test opens with
  actingAsMember().
- The Origin header and the auth.started_at stamp are both required — see
  MeTest for why.
- No permission is required, and that is the point: this is the screen every
  member needs and nobody administers.
- `min` used to map to 'invalid_number' — "n'est pas un nombre valide" for a
  short password. ApiError's own docblock predicted this and asked for a
  too_short token; this is it.
- A stolen session stops working the moment the password changes (§6)...
- ...but not the session standing on the screen. Every first login lands on
  the forced-change form, so logging the actor out here would bounce every
  new account straight back to the login page.


> **Note the shape of that test class.** `setUp()` creates the member but does
> NOT call `actingAs()` — every authenticated test opens with
> `actingAsMember()` instead. That is what lets the last test be genuinely
> anonymous; un-acting after the fact (`forgetGuards()`) works until it
> quietly does not, and an auth test that is accidentally authenticated passes
> for the wrong reason.

- [x] **Step 3: Run both to verify they fail**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberPasswordTest
docker compose exec -w /var/www/html/_api web php artisan test --filter=AccountPasswordTest
```

Expected: FAIL, 404 throughout.

- [x] **Step 4: Give the `min` rule a token that means what it says**

In `api/app/Exceptions/ApiError.php`, in the `REASONS` map, **replace**:


**Implement `api/app/Exceptions/ApiError.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `invalid_number`

Requirements, from the plan's own comments:

- Laravel's `min` is polymorphic — numeric value, string length and array
  count all report as `Min`, with nothing in failedRules to tell them apart.
  This mapping suits the numeric case; a string or array `min` would render
  "n'est pas un nombre valide" and needs its own too_short token (mirroring
  too_long) rather than reusing this entry.


with:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `too_short`, `invalid_number`

Requirements, from the plan's own comments:

- Laravel's `min` is polymorphic — numeric value, string length and array
  count all report as `Min`, with nothing in failedRules to tell them apart.
  This entry commits to the STRING-LENGTH reading, which is the only one
  this API uses (the password minimum), and mirrors too_long including its
  params branch in validation() below. A NUMERIC minimum must therefore use
  `gt` instead, which keeps 'invalid_number'. Adding `min:1` to a numeric
  field would tell the user their number "est trop court".


and in `validation()`, extend the params branch:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- Required, not optional: 'too_short' interpolates {{min}}, and i18next
  prints a missing interpolation value literally — so without this the user
  reads "minimum {{min}} caractères".


In `web/src/i18n/fr.ts`, add to `validation`:


**Implement `web/src/i18n/fr.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_


and to `fields`:


**Implement `web/src/i18n/fr.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 5: Write the member password controller**

Create `api/app/Http/Controllers/Api/MemberPasswordController.php`:


**Implement `api/app/Http/Controllers/Api/MemberPasswordController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `MemberPasswordController`, `__invoke`

Literals to preserve verbatim:

- `required_before_password`, `must_change_password`

Requirements, from the plan's own comments:

- Issues a member a new password, shown to the administrator exactly once.
  This is BOTH "give this person an account" and "reset this person's
  password" — §4.4 describes one mechanism, so there is one endpoint. A
  person with a username and no password is simply one who has never been
  issued one. The returned password is the only copy that will ever exist in
  plaintext: it is hashed on the way into the database, never written to the
  audit log, and never returned again.
- A password with no username is a credential nothing can use. The reason
  token is paramless on purpose: ApiError's closure-error path emits field
  and reason only, and an interpolating token would put a raw placeholder on
  the screen.
- Resetting your OWN password here would otherwise log you out with a
  generated password you then have to use. The UI sends administrators to
  /account instead, so this branch is for the unusual path only — the forced
  change below still applies either way.
- The 'hashed' cast on Member::casts() hashes this on save.
- It was read out loud down a phone, so it is not a secret and must not
  survive first use.
- No password in the audit log, ever — pinned by MemberPasswordTest::test_th
  e_generated_password_never_appears_in_the_audit_log.


- [x] **Step 6: Write the account password request and controller**

Create `api/app/Http/Requests/AccountPasswordRequest.php`:


**Implement `api/app/Http/Requests/AccountPasswordRequest.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `AccountPasswordRequest`, `rules`

Requirements, from the plan's own comments:

- A member choosing their own password. EIGHT CHARACTERS, and that is a
  judgement rather than a standard. The people typing this are 6-16 years
  old, on a phone, and the account protects a rehearsal calendar. Login is
  throttled per username AND per IP with a fifteen-minute lockout, there is
  no password reset by email to phish, and the committee-issued default is
  ~57 bits — so the marginal value of demanding twelve is small next to the
  number of children who would write it on the inside of a case lid. Raise
  it if the committee asks. Rule order: `required` before `min`, so an empty
  field reports `required`.
- @return array<string, array<int, string>>


Create `api/app/Http/Controllers/Api/AccountPasswordController.php`:


**Implement `api/app/Http/Controllers/Api/AccountPasswordController.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Shape: `AccountPasswordController`, `__invoke`

Literals to preserve verbatim:

- `must_change_password`

Requirements, from the plan's own comments:

- A member changes their own password. Gated on authentication alone — no
  permission. This is the one screen every account holder needs and nobody
  administers, and it is where every first login lands, because a committee-
  issued password arrives with must_change_password set. Re-authentication
  here is not ceremony bolted on: knowing the current password is the only
  thing standing between a borrowed, unlocked phone and a permanently stolen
  account. It reuses Reauthentication, so the same per-actor throttle
  applies.
- A privilege change, so the session id must not survive it — the same
  fixation defence login performs.
- AFTER regenerate(), deliberately: the id changes, and reading it
  beforehand would keep the row that regenerate() has just destroyed while
  deleting the live one. See SessionRevoker.


- [x] **Step 7: Add the routes**

In `api/routes/api.php`, inside the `['auth:sanctum', 'no-store']` group but
**outside** the `permission:members.manage` group:


**Implement `api/routes/api.php`.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- Any account holder may change their OWN password — no permission, because
  this is the screen every member needs and nobody administers. It re-
  verifies the current password itself.


and inside the `permission:members.manage` group:


**Implement the php described here.** _(verbatim php removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- Issuing a credential and resetting one are the same operation (§4.4).


- [x] **Step 8: Run both tests, and the vocabulary guard**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=MemberPasswordTest
docker compose exec -w /var/www/html/_api web php artisan test --filter=AccountPasswordTest
docker compose exec -w /var/www/html/_api web php artisan test --filter=ApiErrorVocabularyTest
```

Expected: PASS — 10, 8 and the guard.

- [x] **Step 9: Run the whole suite**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS. **Watch for `ApiErrorContractTest`** — it may pin the old
`min` → `invalid_number` mapping. If it does, that test is now describing
behaviour this task deliberately changed: update it to `too_short` with its
`params`, and say so in the commit.

- [x] **Step 10: Commit**

```bash
git add api/app/Http/Controllers/Api/MemberPasswordController.php \
        api/app/Http/Controllers/Api/AccountPasswordController.php \
        api/app/Http/Requests/AccountPasswordRequest.php \
        api/app/Exceptions/ApiError.php api/routes/api.php \
        api/tests/Feature/MemberPasswordTest.php api/tests/Feature/AccountPasswordTest.php \
        web/src/i18n/fr.ts
git commit -m "feat(api): issue a password, and change your own

Issuing and resetting are one endpoint because §4.4 describes one mechanism:
the generated password is returned once, hashed on the way in, never audited,
and carries must_change_password because it was read out loud down a phone.

Changing your own password ends every OTHER session and keeps the current one,
regenerating its id first — the forced-change screen is where every first login
lands, so logging the actor out there would bounce them to the login form.

Also maps Laravel's `min` rule to a new too_short token with its {{min}}
params, which ApiError's own docblock had asked for: a short password used to
be reported as 'not a valid number'. Numeric minimums use `gt`."
```

---

# The SPA half

Six things to know before writing any component. All are established facts
about *this* codebase, not general React advice.

**1. Every request goes through the generated client.** Never `fetch("/api/…")`.
`web/src/api/http.ts` owns cookie credentials, Sanctum's CSRF priming and the
`{error, code, fields[]}` contract, and it throws a typed `ApiError` for every
non-2xx. A mutating request that skips it comes back
`419 {"code":"invalid_session"}`.

**2. Responses arrive double-wrapped.** `customFetch` returns orval's envelope
`{data, status, headers}`, and TanStack Query wraps that again — so a query
hook's value is `query.data.data`. `SessionProvider` already does this and its
comment says so. It is not a typo when you write it.

**3. Errors are narrowed with `instanceof`, not by the declared type.** The
generated hooks type `TError` as the *declared* error models, but what the
mutator throws is always an `ApiError`. `useApiFormError(fallbackMessage)` does
the narrowing, the French translation and the per-field lookup; every form in
this app uses it and none re-implements it.

**4. French comes only from `translateApiError()`.** Never hand-write a French
sentence for an API failure in a component — add the token to
`web/src/i18n/fr.ts` (Tasks 2, 8 and 10 already did) and let the shared path
render it. A component may write French for things the API knows nothing about:
headings, labels, a client-side "the two passwords do not match".

**5. `aria-disabled`, never `disabled`.** Disabling the focused control blurs it
to `<body>` and throws focus away mid-submit. Pair `aria-disabled` with an early
return in the handler. `Button` styles the former.

**6. Use `renderWithSession()` in tests.** `SessionProvider` renders `null` until
config and `/me` have resolved, so a test that asserts straight after `render()`
sees an empty tree and looks like a component bug. `setMockUser("demo.direction")`
before rendering picks the identity.

---

## Task 11: Regenerate the client, and teach the mocked backend the roster

**Files:**
- Modify: `api/openapi.json`, `web/src/api/generated/**` (both GENERATED — commit, never edit)
- Modify: `web/src/mocks/handlers.ts`, `web/src/session/SessionProvider.tsx`
- Modify: `web/src/mocks/handlers.test.ts`

- [x] **Step 1: Regenerate**

```bash
npm run openapi
npm run generate:api
```

- [x] **Step 2: Read the generated names and write them down**

```bash
grep -n "^export const use" web/src/api/generated/endpoints.ts
```

Scramble names an operation after controller + method, dropping the method for a
single-action controller — that is why R1a has `authLogin`/`authMe` (multi-action)
and `config`/`contact` (single-action). So these are the names to **expect**:

| Endpoint | Hook |
| --- | --- |
| `GET /sections` | `useSectionIndex` |
| `GET /roles` | `useRoleIndex` |
| `GET /members` | `useMemberIndex` |
| `POST /members` | `useMemberStore` |
| `PATCH /members/{member}` | `useMemberUpdate` |
| `DELETE /members/{member}` | `useMemberDestroy` |
| `PUT /members/{member}/roles` | `useMemberRole` |
| `POST /members/{member}/password` | `useMemberPassword` |
| `POST /account/password` | `useAccountPassword` |

**Use whatever the grep actually printed.** The table is a derivation from four
observed examples, not a guarantee, and the rest of this plan's imports assume
it. If a name differs, use the real one — do not rename the controller to force
the guess to be right.

- [x] **Step 3: Check the generated types are not loose**

```bash
grep -n "MemberResource\|SectionResource\|RoleResource" web/src/api/generated/model/index.ts
```

Expected: a model file per Resource. Then open `web/src/api/generated/model/memberResource.ts`
and confirm `roleIds` is `number[]` — **not** `object`, and not `unknown`.

If it is `object`, a Resource is returning an untyped expression: find the
inline `->pluck()` or `->map()` and move it into a private method with a
`/** @return list<int> */` docblock, then regenerate. This plan's preamble has
the measurement.

- [x] **Step 4: Add `can()` to the session**

In `web/src/session/SessionProvider.tsx`, extend the `Session` type and value:


**Implement `web/src/session/SessionProvider.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- UX ONLY. Laravel's `permission:` middleware is the sole enforcement — a
  mistake here shows a wrong button, it does not open a hole. Do not let
  that make it sloppy: a member shown an admin form that then 403s is a bug
  report either way. Takes the permission STRING the API sends, not a role
  name. Roles group permissions and nothing in the UI may branch on which
  role granted one (design §3) — the same rule the middleware follows.


and, where `value` is built:


**Implement the tsx described here.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 5: Teach the mocked backend the roster**

The mocked backend is what `npm run dev:mock` and every component test run
against, and it is deliberately a real little backend rather than a fixture
dump: R1a's comment on this file explains why the login is genuine rather than
a role switcher.

Add to `web/src/mocks/handlers.ts`, above the generated fallbacks:


**Implement `web/src/mocks/handlers.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_

Shape: `initialMembers`, `resetRoster`, `refuseWithoutMembersManage`, `sectionOf`

Literals to preserve verbatim:

- `/api/generated/model`, `ACTOR_PASSWORD = "demo"`

Requirements, from the plan's own comments:

- The mocked roster. MUTABLE MODULE STATE, reset by resetMockState() between
  tests — the same pattern as the mocked session above it, and for the same
  reason: a screen that creates a member and then lists them must see what
  it created, or the test is asserting against a fixture rather than a flow.
  The register list mirrors the 2026_09_07_000001 migration exactly. A
  synthetic register here would mean a mocked screenshot showing a list no
  server has.
- The seeded roster, mirroring DevSeeder. Cloned on reset, never shared.
- A person with NO account. The roster screen must list them, or it is an
  account list wearing a roster's name.
- Test seam: see resetMockState(), which must reset EVERY store in this
  file.
- Mirrors the `permission:members.manage` gate, so the guards are exercised.


and add these to the `overrides` array:


**Implement the ts described here.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_

Literals to preserve verbatim:

- `/api/sections`, `/api/roles`, `/api/members`, `refusal =
  refuseWithoutMembersManage()`, `body = (await request.json()) as
  Partial<MemberResource>`, `/api/members/`, `index =
  members.findIndex((member) => member.id === Number(params.id))`, `updated
  = { ...members[index], ...body }`, `body = (await request.json()) as {
  currentPassword?: string }`, `id = Number(params.id)`, `body = (await
  request.json()) as { roleIds?: number[]`, `/api/me/password`, `body =
  (await request.json()) as { currentPassword?: string`

Requirements, from the plan's own comments:

- Ordered by name, like the real endpoint: the screen is scanned for a
  person, and a mock in insertion order would hide a sorting bug.
- Creating a person never mints a password — the real API does not either,
  and a mock that did would hide the second step from every test.
- Mirrors AccessIntegrity: deleting yourself is refused. Without this the
  mocked app would let a flow through that the real API answers 409 to.
- Mirrors AccessIntegrity's self-demotion guard.
- A FIXED value, deliberately: a random one would make a screenshot diff-
  noisy and a test unable to assert what it shows. It still matches the real
  generator's shape, which is what the UI formats.


and extend `resetMockState()`:


**Implement the ts described here.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_

Shape: `resetMockState`

Requirements, from the plan's own comments:

- Test seam: every mock store is module state, so every test must reset them
  all.


- [x] **Step 6: Pin the mock's own behaviour**

`web/src/mocks/handlers.test.ts` exists because a mock that silently drifts from
the API is worse than no mock. Add:


**Implement `web/src/mocks/handlers.test.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_

Shape: `lists the roster including a person with no account`, `refuses the roster to a member without members.manage`, `refuses a destructive call with the wrong password`, `forgets a created member between tests`

Literals to preserve verbatim:

- `response = await fetch("/api/members")`, `/api/members`, `roster = (await
  response.json()) as { lastName: string`, `/api/members/2`, `before =
  ((await (await fetch("/api/members")).json()) as unknown[]).length`

Requirements, from the plan's own comments:

- The assertion that makes every other test in the suite trustworthy: if
  resetMockState() misses the roster, one test's member leaks into the next
  and a count assertion fails only when the whole file runs.


- [x] **Step 7: Run the web suite and commit**

```powershell
npm run test:web
npm run typecheck
```

```bash
git add api/openapi.json web/src/api/generated web/src/mocks web/src/session/SessionProvider.tsx
git commit -m "chore(web): regenerate the client, and mock the roster endpoints

The mocked backend gets a real mutable roster rather than a fixture dump, and
mirrors the API's refusals — members.manage, re-authentication, self-deletion —
so the screens' guards are exercised rather than assumed. Adds can() to the
session for the UX-only guards."
```

---

## Task 12: A login screen

`web/src/pages/Login.tsx` is currently one line returning an `<h1>`. Everything
below it is new.

**Files:**
- Modify: `web/src/pages/Login.tsx`
- Create: `web/src/pages/Login.test.tsx`
- Modify: `web/e2e/shell.spec.ts`

- [x] **Step 1: Write the failing test**

Create `web/src/pages/Login.test.tsx`:


**Implement `web/src/pages/Login.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `Login`, `labels both fields, so a password manager can fill them`, `reports a wrong password in French, against the form`, `keeps the password field on a failure so only the wrong part is retyped`, `does not submit an empty form to the API`, `shows the submit as busy without disabling it`

Requirements, from the plan's own comments:

- findByTEXT, not findByRole("alert"). FormError keeps its role="alert"
  element in the tree ALWAYS — that is deliberate, so the region is
  announced reliably — which means findByRole resolves immediately against
  an empty div and the content assertion races the mutation. Waiting on the
  string is the only form that actually waits. The token
  invalid_credentials, translated — never the API's English, and never a raw
  i18next key.
- Same reason as above: wait on the message, not on the always-present
  region.
- Both fields are `required`, so the browser stops it. Asserted because the
  alternative — a 400 round-trip to be told a field is required — is a worse
  experience for the commonest mistake there is.
- NEVER the disabled attribute: disabling the focused control blurs it to
  <body> and throws focus away mid-submit.


- [x] **Step 2: Run it to verify it fails**

```powershell
npm run test:web -- Login
```

Expected: FAIL — `getByLabelText("Identifiant")` finds nothing; the stub renders
only a heading.

- [x] **Step 3: Write the login screen**

Replace `web/src/pages/Login.tsx`:


**Implement `web/src/pages/Login.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `Login`, `submit`

Literals to preserve verbatim:

- `/api/generated/endpoints`, `/api/useApiFormError`, `queryClient =
  useQueryClient()`, `navigate = useNavigate()`, `location = useLocation()`,
  `login = useAuthLogin()`, `attempted = safeReturnTo((location.state as {
  from?: unknown } | null)?.from)`

Requirements, from the plan's own comments:

- The one way in. WHERE IT GOES AFTERWARDS, in order: 1. /account, if the
  account must change its password. A committee-issued password was read out
  loud down a phone, so it is not a secret — MustChangePassword enforces
  this globally, but sending them straight there avoids a pointless bounce
  through a page they cannot use. 2. wherever they were trying to go, passed
  through router STATE by the route guard, normalised by safeReturnTo. 3.
  "/" otherwise. The session is invalidated rather than written: GET /api/me
  is the single shape describing who you are, so the login response
  deliberately carries no identity (see AuthController::login) and this
  refetches it instead of guessing.
- aria-disabled, not disabled — so this early return is what actually
  prevents a double submit.
- Await the refetch before navigating: the destination is chosen from the
  new session, and a route guard that renders against a stale one would
  bounce the member straight back here.
- The username stays; only the password is cleared, so the commonest mistake
  costs one field rather than two.


> **`getAuthMeQueryKey` may be named differently** — check what
> `web/src/api/generated/endpoints.ts` exports (`grep "QueryKey" `). orval
> generates a key helper per query; use the real name.

- [x] **Step 4: Run the test to verify it passes**

```powershell
npm run test:web -- Login
```

Expected: PASS, 5 tests.

- [x] **Step 5: Update the e2e spec**

`web/e2e/shell.spec.ts` asserts the login page renders an `<h1>` reading
"Connexion", which still holds. Add the form to it:


**Implement `web/e2e/shell.spec.ts`.** _(verbatim ts removed — derive it from these requirements and the code as it actually is)_

Shape: `the login page renders a usable form`


- [x] **Step 6: Commit**

```bash
git add web/src/pages/Login.tsx web/src/pages/Login.test.tsx web/e2e/shell.spec.ts
git commit -m "feat(web): a real login screen

Replaces the one-line stub. Sends a member with must_change_password straight
to /account rather than bouncing them through a page they cannot use, awaits
the /me refetch before navigating so no guard renders against a stale session,
and keeps the username on a failure so the commonest mistake costs one field.
No 'forgot password' link: there is no address to send one to, and every
password is committee-issued."
```

---

## Task 13: `/account`, and the forced change nobody can walk around

**Files:**
- Create: `web/src/pages/Account.tsx`, `web/src/pages/Account.test.tsx`
- Create: `web/src/components/MustChangePassword.tsx`, `MustChangePassword.test.tsx`

- [x] **Step 1: Write the failing test for the page**

Create `web/src/pages/Account.test.tsx`:


**Implement `web/src/pages/Account.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `Account`, `changes the password and says so`, `catches a mistyped confirmation without asking the API`, `reports a wrong current password in French`, `reports a too-short password with the minimum, not a placeholder`, `explains the forced change rather than just refusing to leave`

Literals to preserve verbatim:

- `problem = await screen.findByText(/trop court/)`

Requirements, from the plan's own comments:

- findByText: the role="status" region is always in the tree (see
  Account.tsx), so findByRole would resolve against an empty div before the
  mutation lands.
- A client-side check, and one of the few French strings a component may
  write itself: the API knows nothing about a confirmation field, so there
  is no token to translate. Checking it here also means a typo costs no
  round-trip and no throttle attempt.
- The regression this guards: 'too_short' interpolates {{min}}, and i18next
  prints a missing interpolation value LITERALLY. If the API ever stops
  sending params.min, the user reads "minimum {{min}} caractères".
- demo.direction's mustChangePassword is false in the mock, so the notice
  must be absent — the page is also the ordinary "change my password"
  screen. Asserted on the TEXT, not on queryByRole("alert"): FormError keeps
  an empty role="alert" in the tree at all times, so "no alert element" is
  never true on this page and that assertion would fail for a reason that
  has nothing to do with the notice.


- [x] **Step 2: Run it to verify it fails**

```powershell
npm run test:web -- Account
```

Expected: FAIL — the module does not exist.

- [x] **Step 3: Write the page**

Create `web/src/pages/Account.tsx`:


**Implement `web/src/pages/Account.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `Account`, `submit`

Literals to preserve verbatim:

- `/api/generated/endpoints`, `/api/useApiFormError`, `queryClient =
  useQueryClient()`, `change = useAccountPassword()`

Requirements, from the plan's own comments:

- Change my own password. The only screen every account holder needs and
  nobody administers. It is also where every FIRST login lands, because a
  committee-issued password arrives with must_change_password set — so the
  page has to work as both the routine screen and the one you cannot leave.
  The difference is one notice. There is no "delete my account" and no
  profile editing. A member's name and register are roster data the
  committee owns (§4), and a child removing themselves from the band's
  roster is not a thing this site should offer.
- Client-side, deliberately: the API has no confirmation field, so there is
  no token to translate — and a typo here costs no round-trip and burns no
  re-authentication attempt against the throttle.
- mustChangePassword has just flipped, and MustChangePassword below reads it
  — so the session must be refetched or the member stays trapped on this
  page after succeeding.


- [x] **Step 4: Write the failing test for the gate**

Create `web/src/components/MustChangePassword.test.tsx`:


**Implement `web/src/components/MustChangePassword.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `tree`, `MustChangePassword`, `lets an ordinary member through`, `lets an anonymous visitor through`, `sends a member who must change their password to /account`, `does not redirect /account to itself`

Requirements, from the plan's own comments:

- It is not an auth guard. A public page must not depend on being logged in.
- The loop this prevents: a gate that redirects unconditionally sends
  /account to /account forever and the page never renders.


> This needs a fourth mocked user. Add to `USERS` in `web/src/mocks/handlers.ts`:
>
> ```ts
>   // A first login: a committee-issued password that must be replaced.
>   "demo.mustchange": {
>     id: 4,
>     username: "demo.mustchange",
>     firstName: "Marceau",
>     lastName: "Nouveau",
>     isPlayer: true,
>     mustChangePassword: true,
>     permissions: [],
>   },
> ```

- [x] **Step 5: Write the gate**

Create `web/src/components/MustChangePassword.tsx`:


**Implement `web/src/components/MustChangePassword.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `MustChangePassword`

Requirements, from the plan's own comments:

- Holds a member on /account until they have replaced a committee-issued
  password. WHY A GATE AND NOT JUST A REDIRECT AT LOGIN. The password was
  read out loud down a phone or written on a slip of paper, so it is not a
  secret — and a member who logs in, gets sent to /account and then types
  any other URL would otherwise carry on using it indefinitely. Login sends
  them here as a courtesy; this is what makes it hold. IT IS NOT AN AUTH
  GUARD. An anonymous visitor passes straight through: public pages must not
  depend on being logged in, and R2 adds several. /account itself is exempt,
  or the redirect targets the page it is redirecting from and the app
  renders nothing at all. Logout stays reachable because it is a button in
  the layout chrome, not a route.


- [x] **Step 6: Run both tests**

```powershell
npm run test:web -- Account MustChangePassword
```

Expected: PASS, 5 + 4 tests.

- [x] **Step 7: Mutation-test the gate**

1. Delete the `pathname !== "/account"` condition. Re-run. **Expect**
   `does not redirect /account to itself` to FAIL (the test renders nothing, or
   React Router reports too many redirects).
2. Change `user?.mustChangePassword` to `user !== null`. Re-run. **Expect**
   `lets an ordinary member through` to FAIL.
3. Revert both.

- [x] **Step 8: Commit**

```bash
git add web/src/pages/Account.tsx web/src/pages/Account.test.tsx \
        web/src/components/MustChangePassword.tsx web/src/components/MustChangePassword.test.tsx \
        web/src/mocks/handlers.ts
git commit -m "feat(web): /account, and a forced password change that holds

A committee-issued password was read out loud, so it is not a secret. Login
sends a member with must_change_password to /account as a courtesy; the gate is
what stops them typing another URL and carrying on with it. Anonymous visitors
pass through — it is not an auth guard — and /account is exempt from its own
redirect."
```

---

## Task 14: The guards, the routes, and a nav that shows only what works

**Files:**
- Create: `web/src/components/guards.tsx`, `web/src/components/guards.test.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`
- Modify: `web/src/components/Layout.tsx`, `web/src/components/Layout.test.tsx`

- [x] **Step 1: Write the failing test for the guard**

Create `web/src/components/guards.test.tsx`:


**Implement `web/src/components/guards.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `tree`, `RequirePermission`, `renders the page for a member who holds the permission`, `sends an anonymous visitor to the login page`, `refuses a logged-in member IN PLACE rather than bouncing them to login`, `gives the refusal a heading, a gutter and a way out`

Requirements, from the plan's own comments:

- Bouncing somebody who is already logged in to a login form reads as "your
  session expired" and invites them to log in again, repeatedly, at
  something they will never be allowed to see.
- A refusal is a real page. This assertion exists because the previous
  version of this guard rendered a bare <p role="alert"> with no heading —
  an empty document to anyone navigating by heading — outside PageSection,
  so at 390px the words sat flush against the left edge. Four tests passed
  over it for weeks because they only checked the string was in the DOM.
- The shell, which is what carries the gutter.


- [x] **Step 2: Run it to verify it fails**

```powershell
npm run test:web -- guards
```

Expected: FAIL — the module does not exist.

- [x] **Step 3: Write the guard**

Create `web/src/components/guards.tsx`:


**Implement `web/src/components/guards.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `useAttemptedPath`, `RequirePermission`, `AccessDenied`

Literals to preserve verbatim:

- `location = useLocation()`, `from = useAttemptedPath()`

Requirements, from the plan's own comments:

- Route guards — UX ONLY. Laravel's `permission:` middleware is the sole
  enforcement. These decide what to SHOW, so a mistake here shows a wrong
  button; it does not open a hole. Do not let that make them sloppy: a
  member shown an admin form that then 403s is a bug report either way. An
  anonymous visitor is sent to the login page. A logged-in one WITHOUT the
  permission is refused in place instead — bouncing them to a login form
  they are already past reads as "your session expired" and invites them to
  log in again, repeatedly, at something they will never be allowed to see.
  It takes a PERMISSION, never a role name. Roles merely group permissions,
  and which role granted one is not a question any enforcement point — or
  any mirror of one — may ask (design §3).
- Where the visitor was trying to go, as a path the login route can navigate
  back to. Router STATE, not a query parameter: it never appears in a URL,
  so nobody can craft it. `safeReturnTo` normalises it on the way out anyway
  — see lib/returnTo for why that belt-and-braces stays.
- The refusal page. IT USED TO BE `<p role="alert">Accès refusé.</p>` AND
  NOTHING ELSE — no heading, so anyone navigating by heading found an empty
  document, and outside PageSection, so at 390px the words sat flush against
  the left edge while every other route on the site was padded. This is a
  page a legitimate, logged-in member reaches by following an ordinary link,
  so it gets a heading, an explanation that does not blame them, and a way
  out — the same shape as NotFound, the site's other dead end.
  `role="alert"` stays on the explanation so the refusal is ANNOUNCED: the
  route changed without a navigation, and a screen-reader user who hears
  nothing has no idea why the page they asked for is not there.


- [x] **Step 4: Wire the routes**

Replace `web/src/routes.tsx`:


**Implement `web/src/routes.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `AppRoutes`

Requirements, from the plan's own comments:

- The route table after R1b. URLs are RESOURCE-ORIENTED, and there is
  deliberately no /admin or /manage namespace: under real RBAC there is no
  single privileged area — events.manage and members.manage are different
  people — and a namespace named after a permission level is a lie about the
  model (design §4). The nav still groups Direction screens under one
  heading; nav grouping and URL structure are different problems and only
  one of them has to encode authorization. MustChangePassword wraps
  everything INSIDE the layout: a committee-issued password must be replaced
  before any other screen is usable, and the gate has to see the pathname to
  exempt /account from its own redirect. Legacy French paths are NOT
  redirected — the rebuild owes no backwards compatibility (design §7/D11) —
  so they fall through to the 404 view like every other unknown path. Still
  absent, and each waits on its own release: /events and its children (R1c),
  /band, /committee, /join, /history (R2), /events/:id/registrations (R3).


> **`/login` sits inside `MustChangePassword` on purpose.** A member who must
> change their password and navigates to `/login` is already logged in; sending
> them to `/account` is right. It cannot trap anyone, because logging out is a
> button in the chrome rather than a route.

- [x] **Step 5: Add the nav entries**

In `web/src/components/Layout.tsx`, replace the empty `NAV` constant and its
comment:


**Implement `web/src/components/Layout.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Requirements, from the plan's own comments:

- The content nav. Still short: R1b adds the members' tool, and the public
  pages arrive with R2 (/band, /committee, /join, /history) and R1c
  (/events). Every entry here must be a route that exists — a nav item that
  404s is worse than a missing one.
- Screens grouped under "Direction", each gated by the permission that gates
  the API route behind it. THE GROUP IS ABSENT, NOT REFUSED (design §4). A
  member who cannot use /members never sees the word — showing a link that
  leads to "Accès refusé" teaches people that parts of the site are broken
  for them.


and inside the `<ul>`, after the `NAV.map(...)` block:


**Implement the tsx described here.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_


Change the destructure at the top of the component to take `can`:


**Implement the tsx described here.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_


and replace the auth item so a logged-in member reaches their own account
rather than the login form:


**Implement the tsx described here.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_


- [x] **Step 6: Test the nav's gating**

Add to `web/src/components/Layout.test.tsx`:


**Implement `web/src/components/Layout.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `shows the Membres entry to a member who can administer members`, `hides the Membres entry entirely from a member who cannot`, `hides it from an anonymous visitor`, `points a logged-in member`

Requirements, from the plan's own comments:

- ABSENT, not refused: a link that leads to "Accès refusé" teaches people
  that parts of the site are broken for them.


- [x] **Step 7: Update the route table's test**

`web/src/routes.test.tsx` asserts the R1a table. Add:


**Implement `web/src/routes.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `renders the roster at /members for somebody who may administer it`, `refuses /members in place for a member who may not`, `still answers an unknown path with the 404 view`

Requirements, from the plan's own comments:

- The catch-all must survive the new nesting. Apache serves the SPA shell
  for every unknown path by design, so this view IS the site's 404.


- [x] **Step 8: Run the suite**

```powershell
npm run test:web
```

Expected: PASS. This step will fail until Task 15 creates `Members.tsx` — write
a one-line placeholder (`export function Members() { return <h1>Membres</h1>; }`)
to get the routes green, and Task 15 replaces it.

- [x] **Step 9: Commit**

```bash
git add web/src/components/guards.tsx web/src/components/guards.test.tsx \
        web/src/routes.tsx web/src/routes.test.tsx \
        web/src/components/Layout.tsx web/src/components/Layout.test.tsx \
        web/src/pages/Members.tsx
git commit -m "feat(web): the permission guard, the routes, and a nav that only shows what works

The guard takes a permission, never a role name — the same rule the middleware
follows. An anonymous visitor goes to /login; a logged-in member without the
permission is refused IN PLACE, on a page with a heading, a gutter and a way
out, because bouncing somebody past the login form back to it reads as an
expired session. The Direction group is absent rather than refused for anyone
who cannot use it."
```

---

## Task 15: `/members` — the roster screen

The biggest screen in R1b, and the one with the most ways to be quietly wrong.
Four rules from §4 govern it:

1. **No bare tables on phones.** Cards below `md`, a table at `md` and up.
2. **No destructive action without naming the damage** — "Supprimer Léa Rossier"
   and what goes with her, not "Êtes-vous sûr ?".
3. **A generated password is shown once**, to read out or hand over.
4. **Every control clears 44px**, and none of them uses the `disabled`
   attribute.

**Files:**
- Modify: `web/src/pages/Members.tsx` (replacing Task 14's placeholder)
- Create: `web/src/members/MemberForm.tsx`
- Create: `web/src/members/ConfirmWithPassword.tsx`
- Create: `web/src/members/GeneratedPasswordDialog.tsx`
- Create: `web/src/pages/Members.test.tsx`

- [x] **Step 1: Write the failing test**

Create `web/src/pages/Members.test.tsx`:


**Implement `web/src/pages/Members.test.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `renderRoster`, `Members`, `lists everybody, including a person with no account`, `says which people cannot log in, rather than leaving it blank`, `shows each person`, `creates a person and shows them in the list`, `reports a taken username against its own field, in French`, `names the person and the consequence before deleting them`, `requires the actor`, `deletes the person once the password is right`, `keeps the person and explains, when the password is wrong`, `refuses to issue a password to somebody with no username`, `shows the new password for a person who has a username`, `refuses to let the actor delete themselves, and says why`

Literals to preserve verbatim:

- `result = await renderWithSession(<Members />, { route: "/members" })`,
  `row = screen.getByText("Sansconnexion").closest("[data-member]")`, `row =
  screen.getByText("Player").closest("[data-member]") as HTMLElement`,
  `direction = screen.getByText("Direction").closest("[data-member]") as
  HTMLElement`, `dialog = await screen.findByRole("alertdialog")`, `row =
  screen.getByText("Sansconnexion").closest("[data-member]") as
  HTMLElement`, `row = screen.getByText("Direction").closest("[data-
  member]") as HTMLElement`

Requirements, from the plan's own comments:

- The list arrives asynchronously; every assertion below depends on it.
- A blank username cell reads as missing data. It is a state — this person
  is on the roster and has never been given an account — and the screen has
  to say so, because the fix is a button on that row.
- The role's French LABEL, resolved from GET /api/roles — never the key
  "direction", and never the raw permission strings.
- "Êtes-vous sûr ?" is a question nobody reads. The name is what makes the
  dialog worth stopping for.
- She has no username, so the mock refuses — give her one first would be a
  longer flow; this asserts the refusal lands on the right field.
- The fixed value the mock returns. Shown as text that can be read aloud —
  not in a password field, which would defeat the entire point.
- The API's cannot_delete_self, translated. The UI does not pre-empt this:
  the server owns the invariant and the screen reports what it says.


- [x] **Step 2: Run it to verify it fails**

```powershell
npm run test:web -- Members
```

Expected: FAIL — the placeholder renders only a heading.

- [x] **Step 3: Write the destructive-confirmation dialog**

Create `web/src/members/ConfirmWithPassword.tsx`:


**Implement `web/src/members/ConfirmWithPassword.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `ConfirmWithPassword`

Requirements, from the plan's own comments:

- The one dialog every destructive privileged action goes through. TWO
  THINGS IT REFUSES TO SEPARATE, because separating them is how each gets
  skipped: - NAMING THE DAMAGE. "Êtes-vous sûr ?" is a question nobody
  reads. `title` and `description` carry the person's actual name and what
  will happen to them (design §4: no destructive action without naming the
  damage). - RE-AUTHENTICATION. Spec §6: whoever holds members.manage can
  lock the band out, so they re-enter their own password. The field lives
  HERE, in the same dialog as the warning, so the password is typed while
  reading what it authorises — not in a separate step that becomes muscle
  memory. The action button is never `disabled` (it would blur focus to
  <body> mid-submit); `aria-disabled` plus the early return in `onConfirm`
  is what prevents a double submit.
- Never leave a typed password in state behind a closed dialog.
- The dialog must NOT close on click: the action can fail (a wrong password,
  or a 409 invariant) and the error has to be readable where it happened.
  The caller closes it on success.


- [x] **Step 4: Write the once-only password dialog**

Create `web/src/members/GeneratedPasswordDialog.tsx`:


**Implement `web/src/members/GeneratedPasswordDialog.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `GeneratedPasswordDialog`

Requirements, from the plan's own comments:

- Shows a newly-issued password exactly once (§4.4). AS SELECTABLE TEXT, IN
  A LARGE MONOSPACE, NOT IN A PASSWORD FIELD. The whole purpose is that an
  administrator reads it down the phone or hands it over, so masking it
  would defeat the feature. It is deliberately not copied to the clipboard
  automatically either: a credential silently sitting in the clipboard is
  worse than one on screen for ten seconds, and this audience reads it aloud
  rather than pasting it. The dialog says plainly that it will not be shown
  again, because it will not: the server keeps only the hash.


- [x] **Step 5: Write the member form**

Create `web/src/members/MemberForm.tsx`:


**Implement `web/src/members/MemberForm.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `draftFrom`, `MemberForm`

Literals to preserve verbatim:

- `/api/generated/model`

Requirements, from the plan's own comments:

- Create or edit one person. A PERSON, NOT AN ACCOUNT. The username is
  optional and there is no password field at all: issuing a credential is a
  separate, re-authenticated action (§4.4), and it is the same action as
  resetting one. The form says so rather than leaving an empty password box
  that would imply otherwise. `publicVisible` is a checkbox written out by
  hand, not through FormField: FormField's own comment explains why it
  handles no checkboxes — the value is a boolean and the label belongs after
  the control. It carries min-h-touch explicitly because it is not a Button
  or an Input and so inherits nothing.


> **The `disabled` attribute on those checkboxes is the ONE legitimate use** in
> this app: the rule exists because disabling a *focused submit button* throws
> focus to `<body>` mid-request. A checkbox that is inert for the whole lifetime
> of the form is a different thing, and `aria-disabled` on an input does not
> stop it being toggled. Keep the explanatory copy beneath it — an inert control
> with no explanation is worse than either.

- [x] **Step 6: Write the roster screen**

Replace `web/src/pages/Members.tsx` entirely:


**Implement `web/src/pages/Members.tsx`.** _(verbatim tsx removed — derive it from these requirements and the code as it actually is)_

Shape: `Members`, `openCreate`, `openEdit`, `closeForm`, `submitForm`, `confirmDelete`, `confirmIssuePassword`, `MemberActions`

Literals to preserve verbatim:

- `/api/generated/endpoints`, `/api/generated/model`,
  `/api/useApiFormError`, `roster = useMemberIndex()`, `sections =
  useSectionIndex()`, `roles = useRoleIndex()`, `queryClient =
  useQueryClient()`, `form = useApiFormError("L’enregistrement a échoué.")`,
  `destructive = useApiFormError("L’action a échoué.")`, `create =
  useMemberStore()`, `update = useMemberUpdate()`, `destroy =
  useMemberDestroy()`, `issuePassword = useMemberPassword()`, `members =
  roster.data?.data ?? []`, `sectionList = sections.data?.data ?? []`,
  `roleList = roles.data?.data ?? []`, `roleLabel = (id: number) =>
  roleList.find((role) => role.id === id)?.key ?? ""` translated through `fr.ts.roles[key].label`, `name =
  `${deleting.firstName} ${deleting.lastName}``

Requirements, from the plan's own comments:

- The roster: everybody in the band, whether or not they can log in. ONE
  ROSTER (design §8). A person with no username is listed, has a register,
  and can be given an account from this screen — so this is not an account
  list wearing a roster's name, and "Pas de compte" is a state with a button
  next to it rather than missing data. CARDS BELOW md, A TABLE FROM md UP
  (§4: no bare tables on phones). The screen this replaces rendered a table
  that scrolled sideways at 390px, which is the width most of this band's
  phones actually are. Both layouts render from the same array in one pass;
  only their wrappers differ, so the two can never disagree about what is on
  the roster. Roles are shown by their French LABEL, joined from GET
  /api/roles. Never the key, and never the permission strings: "why does she
  have this?" is answered with "because she is in Team Direction" (design
  §3). INVARIANT REFUSALS COME FROM THE SERVER. This screen does not pre-
  empt cannot_delete_self or cannot_remove_last_administrator with its own
  copy of the rule — a duplicated rule drifts, and then the two disagree in
  front of somebody trying to fix a lockout. It renders what the API says,
  translated.
- The panel stays OPEN: a rejected username has to be corrected where it was
  typed, and closing the form would throw away everything else too.
- Dialog stays open, so a wrong password or a 409 invariant is read where
  the action was taken rather than behind a dialog that has vanished.
- Order matters: capture the password, then close the confirmation, then
  show it. Closing first would unmount the state this reads.
- Names the damage (§4). It says what is actually known to go: the person
  and their access. Attendance and registrations arrive in R1c and R3, and
  THIS SENTENCE MUST GAIN THEM THEN — "3 réponses à venir seront effacées"
  is the example the spec gives.
- The three per-person actions, written once and rendered in both layouts.
  Extracted because two copies of three buttons is where a fourth action
  ends up in one layout and not the other — and the phone layout is the one
  that gets forgotten. Every button is a `Button`, so every one carries min-
  h-touch (44px) without anybody remembering to add it.


> **Three things to check against the real generated client**, because the
> mutation argument names come from the OpenAPI path parameter and this plan
> derived them rather than reading them:
>
> - `update.mutateAsync({ member: id, data })` — the key is whatever the path
>   parameter is called (`{member}` here, so `member`). Grep
>   `MemberUpdateMutationBody` and the generated `memberUpdate(` signature.
> - `destroy.mutateAsync({ member: id, data: { currentPassword } })` — a
>   DELETE with a body. Confirm the generated `memberDestroy` accepts one; if
>   orval omitted it because the OpenAPI document declares no request body for
>   DELETE, **add the body to the document** by giving `destroy()` a Form
>   Request (`DeleteMemberRequest` with the same single rule) so Scramble sees
>   it, then regenerate. Do not fall back to `fetch`.
> - `result.data.generatedPassword` — the single `.data` is orval's envelope on
>   a mutation's return. Not the double `.data` a query has.
>

- [x] **Step 7: Run the tests**

```powershell
npm run test:web -- Members
```

Expected: PASS, 13 tests.

- [x] **Step 8: Check it on a phone-width viewport**

A green suite is not a rendered page — this project's defects hide from
assertions. Run the mocked app and look:

```powershell
npm run dev:mock
```

Log in as `demo.direction` / `demo`, go to `/members`, and at **390px** confirm:
no horizontal scrollbar anywhere on the page; every button reachable with a
thumb; the delete dialog's text not clipped; the generated password legible at
arm's length. Then at **1280px** confirm the table appears and the cards do not.

- [x] **Step 9: Commit**

```bash
git add web/src/pages/Members.tsx web/src/pages/Members.test.tsx web/src/members
git commit -m "feat(web): the roster screen

Everybody, account or not — 'Pas de compte' is a state with a button to fix it,
not missing data. Cards below md and a table above, because the screen this
replaces scrolled sideways at 390px. Destructive actions name the person and
take the actor's password in the same dialog that carries the warning, and a
generated password is shown once as selectable text meant to be read aloud.
Invariant refusals are reported from the server rather than duplicated here."
```

---

## Task 16: The full green run, and looking at it in a browser

**A green suite is not a rendered page.** This project has shipped auth changes
that passed every test and failed in Chrome, and four tests that asserted
nothing at all. This task is not a formality.

- [x] **Step 1: The whole API suite, in Docker**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS, no skips. **In Docker specifically** — a Claude Code web session
runs natively against a different `.env`, and that difference has already
shipped two red tests to this branch (see "Running the tests").

- [x] **Step 2: Everything else**

```powershell
npm run check
```

That is typecheck, Pint, the web suite, eslint, stylelint, prettier and the
secret guard. All green, no exceptions.

- [x] **Step 3: Confirm the generated client is not stale**

```bash
npm run openapi
npm run generate:api
git status --porcelain api/openapi.json web/src/api/generated
```

Expected: **no output.** Anything listed means the committed artifacts drifted
from the controllers, which is exactly what CI's `openapi-drift` job fails on.

- [x] **Step 4: Rebuild the stack and log in as a human**

```bash
npm run build
npm run dev
```

Then at http://localhost:8090, with a real browser:

1. Log in as `demo.direction` / `demo`. **Confirm the session cookie is
   HttpOnly and SameSite=Strict** in the browser's own devtools — not in a test.
2. Open `/members`. Confirm the roster lists Nadia Sansconnexion with
   "Pas de compte".
3. Create a person with a username. Generate their password. **Write it down.**
4. Log out. Log in as that person with that password. Confirm you land on
   `/account` and cannot navigate away — try typing `/members` in the address
   bar.
5. Change the password. Confirm you are still logged in afterwards.
6. Log in as `demo.player` / `demo`. Confirm **"Membres" is absent from the
   nav**, and that typing `/members` gives the refusal page with a heading and a
   way out — not a redirect to the login form.

- [x] **Step 5: Prove one guard can actually fail**

Pick the guard that matters most and break it on purpose:

```
Comment out the AccessIntegrity::assertMayRemoveCredentials() call in
MemberController::update(), then run MemberWriteTest.

EXPECT: test_clearing_the_last_administrators_username_is_refused_as_409 FAILS.

Restore it.
```

If it still passes, the test is not testing what it claims and must be fixed
before this task is done.

- [x] **Step 6: Tick this plan's boxes and commit the record**

Update the checkboxes in this file to reflect what was actually done, leaving
anything genuinely skipped **unticked with a note saying why**. R1a's plan was
committed with every box unticked and its work complete, which cost a later
session real time working out which was true.

```bash
git add docs/superpowers/plans/2026-09-07-r1b-members-and-account.md
git commit -m "docs: R1b complete — check off the plan"
```

---

## Done when

- `docker compose exec -w /var/www/html/_api web php artisan test` is
  green **in Docker**.
- `npm run check` is green.
- `npm run openapi && npm run generate:api` leaves the tree clean.
- A browser at http://localhost:8090 can: log in as `demo.direction`, create a
  person, give them an account, log in as them, be held on `/account`, change
  the password, and stay logged in.
- `demo.player` sees no "Membres" nav entry and gets the refusal page — with a
  heading — at `/members`.
- `git grep -n "roleIds\|permissions" web/src/components/Layout.tsx` shows the
  nav gating on a **permission**, never a role key.
- **No pull request has been opened.** The branch is not deployable until R1c.

## Carried out of R1b

- **No roles or registers editor** (decision B3). Adding a register, renaming
  one, or changing what a role grants is an Adminer job until a screen exists.
  §4 defines no URL for either; naming two is a decision for when there is a
  screen to hang them on.
- **`public_visible` is settable and nothing reads it.** R2's `/band` and
  `/committee` are what make it mean anything.
- **`instructorOfSectionId` is settable and nothing reads it** — same reason.
- **`registrations.view` is granted by the committee role and gates nothing
  yet.** R3.
- **`attendance.*` and `events.manage` are granted and gate nothing yet.** R1c.
- **Contact-form anti-abuse still has no owner** (spec §9.5, unchanged by this
  plan). `ContactController` has no honeypot, no submit-timing check and no
  Altcha — the implementation was deleted with the souper feature. R2 is the
  natural home, since that is when the public pages ship.
- **argon2id has never been verified on the shared host.** Carried from R1a and
  still a pre-deploy blocker: `HASH_DRIVER=argon2id` needs a PHP built with
  argon2 support, and this plan issues every password through it.
- **The deploy CLI will refuse every server whose `.env` lacks the four
  `BOOTSTRAP_ADMIN_*` keys** that Task 1 adds to `api/.env.example`. Set them by
  hand on TEST before R1c's first deploy.
- **`npm run smoke` is still broken on this branch** — `tools/smoke-docker.mjs`
  asserts the souper endpoints R1a deleted. Not R1b's work, and not covered by
  spec §9.6's documentation clean-up either, which mentions only that file's
  spec-path comments. It needs an owner in R1c or R1d.

---

## Self-review notes

Checked against the spec, 2026-09-07:

- §3's domain model: `sections`, `members`, `roles`/`role_permissions`/
  `member_roles` are all exercised. `events`, `attendance`,
  `event_registration_options`, `registrations`, `registration_choices` are
  R1c/R3. `contact_messages` untouched. `audit_log` gains five actions.
- §4's screens: `/members`, `/account` and `/login` are built. `/events*`,
  `/band`, `/committee`, `/join`, `/history` are named as out of scope with the
  release that owns each.
- §4's four decisive interactions: #4 (passwords have a human path) is built in
  full. #1–#3 are attendance and the chase list — R1c.
- §4's deliberate absences: naming the damage ✓; no bare tables on phones ✓; no
  nav entry a member cannot use ✓; no page whose only content is a link ✓
  (`/account` is a form, the refusal page is a real page).
- §6's posture: re-authentication ✓ (Task 2), immediate revocation on delete,
  role change and password change ✓ (Tasks 3, 9, 10), argon2id inherited from
  R1a and flagged as unverified on the host, throttling extended to
  re-authentication ✓. HTTPS/HSTS/security headers and the `_api/.env`
  deny block remain R1d — infrastructure, and this branch changes no
  `.htaccess`.
- Lockout invariants: R1a's two, plus the credential-reachability gap this plan
  found and closes (Task 5).
