# R1a — Foundation: schema, permissions, hardened auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy `users`/`role` foundation with a member roster, real
permission-based authorization, and hardened session auth — as a tested API,
with no UI.

**Architecture:** The old domain (events, responses, signups, capabilities) is
deleted outright; nothing is migrated. A `members` table replaces `users` and
holds people, with nullable credentials so a person can exist without an
account. Authorization reads a fixed `Permission` enum in code, granted only
through editable `roles`. Auth stays cookie-session (Sanctum SPA mode), hardened
with argon2id, login throttling, and immediate session revocation.

**Tech Stack:** Laravel 11, PHP 8.4, MariaDB 10.3, PHPUnit, Laravel Pint.

**Source spec:** `docs/superpowers/specs/2026-09-05-rebuild-design.md`

## Global Constraints

- **PHP 8.4, MariaDB 10.3** — match production exactly.
- **Everything is English** — code, comments, DB table/column names, enum and
  stored values, identifiers, file names. French exists only as user-visible UI
  text in `web/src/i18n/fr.ts`.
- **API JSON bodies are English.** The error contract is
  `{error, code, fields[]}`, rendered by `App\Exceptions\ApiError` — never
  Laravel's native `{message, errors:{}}`.
- **Every new error token must have French copy in `web/src/i18n/fr.ts`.**
  `api/tests/Feature/ApiErrorVocabularyTest.php` enforces this and will fail
  otherwise. Keys there must stay bare identifiers with no TypeScript syntax —
  that test brace-walks the file.
- **`web/src/api/generated/` is generated.** Never hand-edit. Regenerate with
  `npm run openapi && npm run generate:api` and commit the result; CI's
  `openapi-drift` job fails if stale.
- **Migrations in this plan are NOT guarded** (`if (! Schema::hasTable(...))`).
  Those adoption branches existed only to adopt the old app's tables. There is
  no legacy to adopt any more — see Task 1.
- **Laravel Pint must pass:** `npm run lint:api`.

## Branch and deployability

Work on `claude/new-session-11x76s`. **This branch is deliberately not
deployable between Task 1 and R1c** — Task 1 removes a working feature set that
R1b and R1c replace. `main` is untouched and TEST keeps running the current
build. This is a rewrite; a broken middle on a branch is the expected shape, and
pretending otherwise would mean carrying two member tables at once.

## Running the tests

Every task below writes its test command in the **Docker** form:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SomeTest
```

In Git Bash prefix that with `MSYS_NO_PATHCONV=1`, or the `-w` argument is
rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

### In a Claude Code web session, substitute this everywhere

There is no Docker daemon. **CLAUDE.md says the Laravel suite cannot run in a
web session; that is out of date — it can**, and this recipe was verified on
2026-09-05 (238 tests, 730 assertions, 9.3s). One-time setup:

```bash
npm run websession:init          # npm install; MariaDB via apt; seeds lescanetons*
cd api && composer install       # api/vendor/ is not committed
php artisan key:generate         # ensure-dev-stack leaves APP_KEY empty without vendor/
```

`npm run websession:init` does **not** create the database `phpunit.xml` names,
so create it once by hand:

```bash
mariadb -uroot -e "CREATE DATABASE IF NOT EXISTS laravel_api_test CHARACTER SET utf8mb4;
  GRANT ALL ON laravel_api_test.* TO 'canetons'@'localhost';
  GRANT ALL ON laravel_api_test.* TO 'canetons'@'127.0.0.1';
  FLUSH PRIVILEGES;"
```

Then every `docker compose exec … php artisan test …` in this plan becomes:

```bash
cd api && DB_HOST=127.0.0.1 php artisan test --filter=SomeTest
```

`DB_HOST` must be overridden because `api/phpunit.xml` hardcodes `DB_HOST=db`,
the **Docker service name**, which does not resolve natively. PHPUnit's `<env>`
elements do not carry `force="true"`, so an already-set environment variable
wins — which is what makes the override work at all.

### What a native green run does and does not prove

`apt` installs **MariaDB 10.11**; production and the Docker stack are **10.3**.
A green native run is therefore weaker evidence than a green Docker run, and
anything touching SQL modes, `enum` or strict-mode behaviour should be
re-checked in Docker before it is called done.

Two things the native stack cannot do at all:

- **`npm run smoke`** and any browser check — those need Apache serving
  `dist/build/` on :8090, which is the Docker `web` service.
- **Task 11 Step 7 and Task 12 Step 9**, both of which require a real browser
  against :8090. Leave them unticked in a web session and say so; do not mark
  them done off a passing suite. This project has already shipped auth changes
  that passed every test and failed in Chrome.

## Non-goals for R1a

- **No UI.** `/members`, `/account` and the events screens are R1b and R1c.
- **No Sanctum removal.** The spec marks that *probable, prototype first*
  (§6). It stays in R1a exactly as configured today; the prototype and the
  decision belong to R1d.
- **No `RunPendingMigrations` removal.** That is R1d. `phpunit.xml` already
  pins `AUTO_MIGRATE=false`, so it does not affect this plan's tests.
- **No infra or `.htaccess` change.** R1d.

---

## File structure

**Deleted (Task 1)**

```
api/app/Http/Controllers/Api/{Event,Response,Signup,Altcha}Controller.php
api/app/Http/Requests/{Event,Signup,Response}*.php
api/app/Models/{Event,Response,Signup,Instrument,User}.php
api/app/Support/{Capability,Occasion,ChallengeGuard}.php
api/app/Http/Middleware/{RequireCapability,EnsureSouperSignupEnabled}.php
api/app/Mail/SignupConfirmation.php
api/database/migrations/2026_07_23_00000{1,2,4,6,7}_*.php
api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php
api/tests/Feature/{Auth,Event,Response,Signup,SouperSignupFlag,Capability}*.php
docker/db/init/01-schema.sql
docker/db/init/02-seed.sql
web/src/pages/*  (all but NotFound.tsx and Login.tsx)
```

**Created**

```
api/app/Support/Permission.php              the fixed permission enum
api/app/Support/EffectivePermissions.php    member -> permissions, one query
api/app/Support/SessionRevoker.php          delete a member's sessions
api/app/Support/AccessIntegrity.php         lockout invariants
api/app/Support/Audit.php                   privileged-mutation recorder
api/app/Http/Middleware/RequirePermission.php
api/app/Models/{Member,Role,Section,AuditEntry}.php
api/config/hashing.php
api/database/migrations/2026_09_05_00000{1..6}_*.php
api/database/seeders/DevSeeder.php
api/tests/Feature/{Login,Me,PermissionMiddleware,SessionRevocation}Test.php
api/tests/Unit/{Permission,EffectivePermissions,AccessIntegrity,Audit}Test.php
```

**Modified**

```
api/config/auth.php          provider model -> Member
api/routes/api.php           trimmed to config, contact, auth
api/bootstrap/app.php        middleware aliases
web/src/i18n/fr.ts           new error tokens
web/src/routes.tsx           trimmed route table
```

---

## Task 1: Clean slate — delete the old domain

Deletion only. Nothing here adds behaviour; the point is that later tasks build
on an empty field rather than around a legacy one.

**Files:**
- Delete: the "Deleted" list under **File structure** above
- Modify: `api/routes/api.php`, `api/bootstrap/app.php`, `web/src/routes.tsx`
- Modify: `docker/db/init/` — remove both SQL files

**Interfaces:**
- Consumes: nothing
- Produces: an API exposing only `GET /api/config`, `POST /api/contact`,
  `POST /api/migrate`; an SPA routing only `/authentification_inscription` and
  the 404. `App\Exceptions\ApiError`, `ConfigController`, `ContactController`,
  `contact_messages` and the `web/src/components/ui/*` library all survive
  untouched.

- [ ] **Step 1: Delete the API domain files**

```bash
cd /home/user/website-les-canetons
git rm -q api/app/Http/Controllers/Api/EventController.php \
          api/app/Http/Controllers/Api/ResponseController.php \
          api/app/Http/Controllers/Api/SignupController.php \
          api/app/Http/Controllers/Api/AltchaController.php \
          api/app/Models/Event.php \
          api/app/Models/Response.php \
          api/app/Models/Signup.php \
          api/app/Models/Instrument.php \
          api/app/Support/Capability.php \
          api/app/Support/Occasion.php \
          api/app/Support/ChallengeGuard.php \
          api/app/Http/Middleware/RequireCapability.php \
          api/app/Http/Middleware/EnsureSouperSignupEnabled.php \
          api/app/Mail/SignupConfirmation.php
git rm -q -r --ignore-unmatch api/app/Http/Requests/EventRequest.php \
          api/app/Http/Requests/SignupRequest.php \
          api/app/Http/Requests/ResponseRequest.php
git rm -q docker/db/init/01-schema.sql docker/db/init/02-seed.sql
```

If any path above does not exist, list the directory and delete the equivalent
file — the intent is "every controller, model, request, support class and
middleware belonging to events, responses, signups or Altcha".

- [ ] **Step 2: Delete their migrations and tests**

```bash
git rm -q api/database/migrations/2026_07_23_000001_create_instruments_table.php \
          api/database/migrations/2026_07_23_000002_create_users_table.php \
          api/database/migrations/2026_07_23_000004_create_signups_table.php \
          api/database/migrations/2026_07_23_000006_create_events_table.php \
          api/database/migrations/2026_07_23_000007_create_responses_table.php \
          api/database/migrations/2026_07_24_000001_add_created_at_to_instruments.php
git rm -q -r --ignore-unmatch api/tests/Feature/AuthTest.php \
          api/tests/Feature/EventTest.php \
          api/tests/Feature/ResponseTest.php \
          api/tests/Feature/SignupTest.php \
          api/tests/Feature/SouperSignupFlagTest.php
```

Then delete any remaining test file under `api/tests/` whose name references
events, responses, signups, Altcha or capabilities. Keep `ApiErrorVocabularyTest`,
`ContactTest`, `ConfigTest`, `MigrateTest`, `AutoMigrateTest`.

- [ ] **Step 3: Add the drop-legacy migration**

Create `api/database/migrations/2026_09_05_000001_drop_legacy_domain_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * The rebuild carries no data forward (design §2, D13), so the old domain's
 * tables are dropped rather than adopted or migrated.
 *
 * Order matters: children before parents, because responses and users hold
 * foreign keys into events, instruments and each other. dropIfExists is used so
 * a fresh database (which never had these) migrates cleanly too.
 *
 * contact_messages is deliberately NOT dropped — it survives the rebuild
 * unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('responses');
        Schema::dropIfExists('signups');
        Schema::dropIfExists('events');
        Schema::dropIfExists('users');
        Schema::dropIfExists('instruments');
    }

    public function down(): void
    {
        // Irreversible by design: these tables are gone for good, and
        // recreating empty ones would be a lie about what down() restores.
    }
};
```

- [ ] **Step 4: Trim the API route table**

Replace the whole of `api/routes/api.php` with:

```php
<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\MigrateController;
use Illuminate\Support\Facades\Route;

// Public: the SPA fetches this before its first render to learn the
// environment (ribbon). It carries no secrets — see ConfigController.
Route::get('/config', ConfigController::class);

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
```

- [ ] **Step 5: Remove the dead middleware wiring**

In `api/bootstrap/app.php`, delete the two `use` lines for
`EnsureSouperSignupEnabled` and `RequireCapability`, delete the entire
`$middleware->alias([...])` call, and delete the whole
`$middleware->prependToPriorityList(...)` call together with its comment block
(it exists only to order the souper feature gate).

Leave `statefulApi()`, `redirectGuestsTo()` and both
`prependToGroup(... RunPendingMigrations::class)` calls exactly as they are.

- [ ] **Step 6: Remove the souper flag from config**

In `api/config/app.php` delete the `souper_signup_enabled` key. In
`api/.env.example` delete the `SOUPER_SIGNUP_ENABLED` line and the
`ALTCHA_HMAC_SECRET` line. In `api/phpunit.xml` delete the
`SOUPER_SIGNUP_ENABLED` env element and its comment.

**Leave `CACHE_STORE=database` in `phpunit.xml` alone.** Its comment justifies
it by `App\Support\ChallengeGuard`, which this task deletes, so it now looks
like dead configuration — it is not. Task 6's login throttle runs on the
`RateLimiter`, which is backed by the cache, and switching this to `array`
would make the throttling tests pass per-process while proving nothing about a
real multi-worker server. Replace the stale comment with:

```xml
        <!-- database, not array: the login throttle (AuthController) runs on
             the RateLimiter, which is cache-backed. The array store is
             per-process, so it would let a throttled attempt through on a real
             multi-worker server while the suite stayed green. -->
```

In `api/app/Http/Controllers/Api/ConfigController.php`, reduce `__invoke()` to:

```php
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'env' => $this->env(),
        ])->header('Cache-Control', 'no-store');
    }
```

Delete the `occasion()` and `menuEntry()` methods, the `use App\Support\Occasion;`
and `use RuntimeException;` lines, and update the class docblock to drop the
mention of feature flags and occasion copy. Keep `ENV_MAP` and `env()`.

- [ ] **Step 7: Trim the SPA route table**

Replace `web/src/routes.tsx` with:

```tsx
import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";

/**
 * The route table during the R1a rebuild.
 *
 * Deliberately almost empty: R1a replaces the foundation and deletes the old
 * domain, and R1b/R1c bring the real screens back on English URLs. Legacy
 * French paths are NOT redirected — the rebuild owes no backwards
 * compatibility (design §7).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
```

Then delete every file in `web/src/pages/` except `Login.tsx`, `Login.test.tsx`,
`NotFound.tsx`, and delete `web/src/components/{DestinationCards,NextEvent,EventCard,RegisterIndex,PhotoPending,Tbd,SouperCta,StatTile}.tsx`
with their `.test.tsx` siblings, plus `web/src/components/guards.tsx` and its
two test files. Delete every spec in `web/e2e/` that references a deleted route.

`Login.tsx` will fail to compile because it references the old session shape —
Task 7 rewrites it. For now, replace its body with a placeholder that renders a
heading only, so the tree typechecks:

```tsx
export function Login() {
  return <h1 className="font-display text-4xl">Connexion</h1>;
}
```

Delete `web/src/pages/Login.test.tsx` — Task 7 writes its replacement.

- [ ] **Step 8: Verify the tree is consistent**

```bash
npm run typecheck && npm run test:web && npm run lint:api
```
Expected: all three pass. Fix any dangling import the deletions exposed — a
failure here is a file that referenced something deleted, and the fix is to
delete that reference too, never to restore the deleted file.

- [ ] **Step 9: Verify the API suite still passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
Expected: PASS. Only `ApiErrorVocabularyTest`, `ContactTest`, `ConfigTest`,
`MigrateTest`, `AutoMigrateTest` and Laravel's own remain.

`ConfigTest` will fail on the removed `features`/`occasion` keys — update its
assertions to expect a body of `{"env": ...}` alone. `ApiErrorVocabularyTest`
may fail on now-unreachable tokens in its MUST_INCLUDE floors; remove the
entries naming deleted classes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: delete the legacy domain ahead of the rebuild"
```

---

## Task 2: Sections and members

**Files:**
- Create: `api/database/migrations/2026_09_05_000002_create_sections_table.php`
- Create: `api/database/migrations/2026_09_05_000003_create_members_table.php`
- Create: `api/app/Models/Section.php`, `api/app/Models/Member.php`
- Modify: `api/config/auth.php`

**Interfaces:**
- Consumes: Task 1's empty schema
- Produces: `App\Models\Member` (Authenticatable, fillable
  `first_name last_name section_id username password committee_title
  instructor_of_section_id public_visible must_change_password`, `password` cast
  `hashed`, `last_login_at` cast `datetime`) and `App\Models\Section` (fillable
  `name sort_order`). Auth resolves `Member` from the `web` guard.

**Note on the column name.** The spec (§3) writes `password_hash`. This plan uses
**`password`**: Laravel's `Authenticatable::getAuthPasswordName()` returns
`'password'`, and deviating means overriding it in the model for no behavioural
gain. The `hashed` cast makes the contents unambiguous.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/MemberModelTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MemberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_can_exist_without_an_account(): void
    {
        $member = Member::create([
            'first_name' => 'Marie',
            'last_name' => 'Rossier',
            'public_visible' => true,
        ]);

        $this->assertNull($member->username);
        $this->assertNull($member->password);
        $this->assertTrue($member->public_visible);
    }

    public function test_more_than_one_member_may_have_no_username(): void
    {
        Member::create(['first_name' => 'A', 'last_name' => 'One']);
        Member::create(['first_name' => 'B', 'last_name' => 'Two']);

        $this->assertSame(2, Member::whereNull('username')->count());
    }

    public function test_the_password_is_stored_hashed(): void
    {
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'plain-text-secret',
        ]);

        $this->assertNotSame('plain-text-secret', $member->password);
        $this->assertTrue(Hash::check('plain-text-secret', $member->password));
    }

    public function test_deleting_a_section_leaves_its_members_sectionless(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $member = Member::create([
            'first_name' => 'Nina',
            'last_name' => 'Bersier',
            'section_id' => $section->id,
        ]);

        $section->delete();

        $this->assertNull($member->fresh()->section_id);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=MemberModelTest
```
Expected: FAIL — `Class "App\Models\Member" not found`.

- [ ] **Step 3: Write the sections migration**

`api/database/migrations/2026_09_05_000002_create_sections_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Registers ("pupitres"). Replaces the old `instruments` table.
 *
 * sort_order exists because registers have a conventional order on the public
 * page; the old front end hardcoded that order in TSX, where it drifted from
 * the table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sections', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sections');
    }
};
```

- [ ] **Step 4: Write the members migration**

`api/database/migrations/2026_09_05_000003_create_members_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The single roster. Replaces `users`.
 *
 * A ROW IS A PERSON, NOT AN ACCOUNT. `username` and `password` are nullable, so
 * an instructor listed on the public page, or a young member whose parent
 * answers for them, needs no login. MariaDB permits many NULLs under one unique
 * index, which is what makes that work.
 *
 * There is deliberately no email column: members are children (~6-16) who often
 * have no address of their own, and passwords are admin-issued. There is also
 * no `active` flag — existence IS the state (design D3), so leaving the band is
 * a delete, and the foreign keys cascade.
 *
 * `role` is absent on purpose. Authorization comes from roles/permissions
 * (Task 3); nothing here grants anything.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('members', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');

            // The register this person plays in. Its presence is also what makes
            // them answerable for events — an instructor with no register is not
            // in the attendance list, so no spurious "sans réponse" is counted.
            $table->foreignId('section_id')->nullable()
                ->constrained('sections')->nullOnDelete();

            $table->string('username')->nullable()->unique();
            $table->string('password')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('last_login_at')->nullable();

            $table->string('committee_title')->nullable();
            $table->foreignId('instructor_of_section_id')->nullable()
                ->constrained('sections')->nullOnDelete();

            // Consent, per person, to appear on the public roster. Defaults to
            // false: these are minors, so publication is opt-in.
            $table->boolean('public_visible')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};
```

- [ ] **Step 5: Write the models**

`api/app/Models/Section.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    protected $fillable = ['name', 'sort_order'];

    /** @return HasMany<Member, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(Member::class);
    }
}
```

`api/app/Models/Member.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A person associated with the band. See the members migration for why
 * credentials are nullable and why there is no email and no role column.
 *
 * Notifiable and MustVerifyEmail are deliberately absent: nothing here sends a
 * notification, and there is no address to verify.
 */
class Member extends Authenticatable
{
    protected $fillable = [
        'first_name',
        'last_name',
        'section_id',
        'username',
        'password',
        'must_change_password',
        'committee_title',
        'instructor_of_section_id',
        'public_visible',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'must_change_password' => 'boolean',
            'public_visible' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Section, $this> */
    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function fullName(): string
    {
        return $this->first_name.' '.$this->last_name;
    }

    /** Whether this person plays, and is therefore answerable for events. */
    public function isPlayer(): bool
    {
        return $this->section_id !== null;
    }
}
```

- [ ] **Step 6: Point the auth provider at Member**

In `api/config/auth.php`, change the `providers.users.model` value from
`App\Models\User::class` to `App\Models\Member::class`. Leave the provider key
named `users` — it is Laravel's own vocabulary for "the thing being
authenticated", and renaming it means renaming it in `guards.web.provider` too
for no gain.

- [ ] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=MemberModelTest
```
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add api/database/migrations api/app/Models api/config/auth.php api/tests/Feature/MemberModelTest.php
git commit -m "feat(api): the members roster replaces users"
```

---

## Task 3: Permissions and roles

**Files:**
- Create: `api/app/Support/Permission.php`
- Create: `api/app/Support/EffectivePermissions.php`
- Create: `api/app/Models/Role.php`
- Create: `api/database/migrations/2026_09_05_000004_create_roles_tables.php`
- Modify: `api/app/Models/Member.php`
- Test: `api/tests/Unit/PermissionTest.php`, `api/tests/Feature/EffectivePermissionsTest.php`

**Interfaces:**
- Consumes: `Member`, `Section` from Task 2
- Produces:
  - `App\Support\Permission` — a backed string enum with cases
    `EventsManage ('events.manage')`, `AttendanceViewAll ('attendance.view_all')`,
    `AttendanceRecordForOthers ('attendance.record_for_others')`,
    `MembersManage ('members.manage')`, `RegistrationsView ('registrations.view')`.
  - `App\Models\Role` — fillable `key`, `label_fr`; `permissions(): Collection<int, Permission>`;
    `syncPermissions(array $permissions): void`.
  - `Member::roles(): BelongsToMany`, `Member::permissions(): Collection<int, Permission>`,
    `Member::hasPermission(Permission $permission): bool`.
  - `App\Support\EffectivePermissions::for(int $memberId): Collection<int, Permission>`.

- [ ] **Step 1: Write the failing unit test for the enum**

Create `api/tests/Unit/PermissionTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Support\Permission;
use PHPUnit\Framework\TestCase;

class PermissionTest extends TestCase
{
    public function test_every_permission_uses_dotted_lowercase_naming(): void
    {
        foreach (Permission::cases() as $permission) {
            $this->assertMatchesRegularExpression(
                '/^[a-z_]+\.[a-z_]+$/',
                $permission->value,
                "Permission {$permission->name} does not follow area.action naming",
            );
        }
    }

    public function test_responding_is_not_a_permission(): void
    {
        // Answering for yourself is what a member IS, not something granted.
        // A `respond` permission would reintroduce the bug where an organiser
        // could not record their own attendance.
        $values = array_column(Permission::cases(), 'value');

        $this->assertNotContains('attendance.respond', $values);
        $this->assertNotContains('respond', $values);
    }

    public function test_the_expected_permissions_exist(): void
    {
        $this->assertSame(
            [
                'events.manage',
                'attendance.view_all',
                'attendance.record_for_others',
                'members.manage',
                'registrations.view',
            ],
            array_column(Permission::cases(), 'value'),
        );
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=PermissionTest
```
Expected: FAIL — `Class "App\Support\Permission" not found`.

- [ ] **Step 3: Write the enum**

`api/app/Support/Permission.php`:

```php
<?php

namespace App\Support;

/**
 * The complete set of permissions the API enforces.
 *
 * THIS IS CODE, NOT DATA, and that is the whole point. A permission is real
 * only if some middleware checks it, so the set cannot be invented in an admin
 * UI — roles (which are data) merely group these.
 *
 * There is deliberately NO permission for answering an event. A member answers
 * for themselves when they belong to a register (Member::isPlayer()); making it
 * a grant is what produced the old bug where an admin could not say whether
 * they were coming, and left "Pas de réponse" counts meaningless.
 */
enum Permission: string
{
    case EventsManage = 'events.manage';
    case AttendanceViewAll = 'attendance.view_all';
    case AttendanceRecordForOthers = 'attendance.record_for_others';
    case MembersManage = 'members.manage';
    case RegistrationsView = 'registrations.view';
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=PermissionTest
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for effective permissions**

Create `api/tests/Feature/EffectivePermissionsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EffectivePermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username = 'demo'): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => 'Person',
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    public function test_a_member_with_no_roles_has_no_permissions(): void
    {
        $this->assertTrue($this->member()->permissions()->isEmpty());
    }

    public function test_permissions_arrive_through_roles(): void
    {
        $member = $this->member();
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);
        $member->roles()->attach($role);

        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertTrue($member->hasPermission(Permission::AttendanceViewAll));
        $this->assertFalse($member->hasPermission(Permission::MembersManage));
    }

    public function test_permissions_from_several_roles_are_unioned_without_duplicates(): void
    {
        $member = $this->member();

        $direction = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $direction->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);

        $committee = Role::create(['key' => 'committee', 'label_fr' => 'Comité']);
        $committee->syncPermissions([Permission::EventsManage, Permission::MembersManage]);

        $member->roles()->attach([$direction->id, $committee->id]);

        $this->assertEqualsCanonicalizing(
            ['events.manage', 'attendance.view_all', 'members.manage'],
            $member->permissions()->map(fn (Permission $p) => $p->value)->all(),
        );
    }

    public function test_a_stored_permission_no_longer_in_the_enum_is_ignored(): void
    {
        // A permission removed from the enum must not crash authorization for
        // every member who still carries the stale row.
        $member = $this->member();
        $role = Role::create(['key' => 'legacy', 'label_fr' => 'Legacy']);
        $member->roles()->attach($role);

        DB::table('role_permissions')->insert([
            'role_id' => $role->id,
            'permission' => 'view_summary',
        ]);

        $this->assertTrue($member->permissions()->isEmpty());
    }

    public function test_revoking_a_role_revokes_its_permissions(): void
    {
        $member = $this->member();
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::MembersManage]);
        $member->roles()->attach($role);

        $this->assertTrue($member->hasPermission(Permission::MembersManage));

        $member->roles()->detach($role);

        $this->assertFalse($member->fresh()->hasPermission(Permission::MembersManage));
    }
}
```

- [ ] **Step 6: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EffectivePermissionsTest
```
Expected: FAIL — `Class "App\Models\Role" not found`.

- [ ] **Step 7: Write the roles migration**

`api/database/migrations/2026_09_05_000004_create_roles_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Roles are DATA; permissions are CODE (see App\Support\Permission).
 *
 * There are deliberately no per-member permission grants. Direct grants are
 * what rots an RBAC system — "why does she have this?" stops being answerable.
 * Permissions arrive only through roles, so the answer is always "because she
 * is in that role".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            // The stable identifier used in seeds and tests.
            $table->string('key')->unique();
            // The French label shown in the admin UI. The only French in the
            // database, and it is display copy, never an identifier.
            $table->string('label_fr');
            $table->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            // A Permission enum VALUE. Stored as a string, not an enum column:
            // adding a permission must be a code change plus a data row, never
            // an ALTER TABLE on a live shared host.
            $table->string('permission', 64);
            $table->primary(['role_id', 'permission']);
        });

        Schema::create('member_roles', function (Blueprint $table) {
            $table->foreignId('member_id')->constrained('members')->cascadeOnDelete();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->primary(['member_id', 'role_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('roles');
    }
};
```

- [ ] **Step 8: Write EffectivePermissions**

`api/app/Support/EffectivePermissions.php`:

```php
<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A member's effective permissions: the union over their roles.
 *
 * One query with a join, rather than loading roles and their permissions as
 * relations — this runs on every permission-gated request and an N+1 here would
 * be paid on a shared host.
 *
 * Unknown stored values are DROPPED, not thrown on. A permission removed from
 * the enum leaves rows behind, and a Permission::from() would turn that into a
 * 500 for every member who still carried one.
 */
final class EffectivePermissions
{
    /** @return Collection<int, Permission> */
    public static function for(int $memberId): Collection
    {
        return DB::table('member_roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'member_roles.role_id')
            ->where('member_roles.member_id', $memberId)
            ->distinct()
            ->pluck('role_permissions.permission')
            ->map(fn (string $value): ?Permission => Permission::tryFrom($value))
            ->filter()
            ->values();
    }

    /** @return Collection<int, int> the ids of members holding a permission */
    public static function memberIdsWith(Permission $permission): Collection
    {
        return DB::table('member_roles')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'member_roles.role_id')
            ->where('role_permissions.permission', $permission->value)
            ->distinct()
            ->pluck('member_roles.member_id');
    }
}
```

- [ ] **Step 9: Write the Role model**

`api/app/Models/Role.php`:

```php
<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Role extends Model
{
    protected $fillable = ['key', 'label_fr'];

    /** @return BelongsToMany<Member, $this> */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'member_roles');
    }

    /** @return Collection<int, Permission> */
    public function permissions(): Collection
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->id)
            ->pluck('permission')
            ->map(fn (string $value): ?Permission => Permission::tryFrom($value))
            ->filter()
            ->values();
    }

    /**
     * Replace this role's permissions with exactly the given set.
     *
     * @param  array<int, Permission>  $permissions
     */
    public function syncPermissions(array $permissions): void
    {
        DB::transaction(function () use ($permissions): void {
            DB::table('role_permissions')->where('role_id', $this->id)->delete();

            $rows = collect($permissions)
                ->unique()
                ->map(fn (Permission $permission): array => [
                    'role_id' => $this->id,
                    'permission' => $permission->value,
                ])
                ->all();

            if ($rows !== []) {
                DB::table('role_permissions')->insert($rows);
            }
        });
    }
}
```

- [ ] **Step 10: Add the relation and helpers to Member**

Append to `api/app/Models/Member.php` (and add
`use App\Support\EffectivePermissions;`, `use App\Support\Permission;`,
`use Illuminate\Database\Eloquent\Relations\BelongsToMany;`,
`use Illuminate\Support\Collection;` to its imports):

```php
    /** @return BelongsToMany<Role, $this> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'member_roles');
    }

    /** @return Collection<int, Permission> */
    public function permissions(): Collection
    {
        return EffectivePermissions::for($this->id);
    }

    public function hasPermission(Permission $permission): bool
    {
        return $this->permissions()->contains($permission);
    }
```

- [ ] **Step 11: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EffectivePermissionsTest
```
Expected: PASS, 5 tests.

- [ ] **Step 12: Commit**

```bash
git add api/app/Support/Permission.php api/app/Support/EffectivePermissions.php \
        api/app/Models/Role.php api/app/Models/Member.php \
        api/database/migrations/2026_09_05_000004_create_roles_tables.php \
        api/tests/Unit/PermissionTest.php api/tests/Feature/EffectivePermissionsTest.php
git commit -m "feat(api): permission enum in code, roles as data"
```

---

## Task 4: The permission middleware

**Files:**
- Create: `api/app/Http/Middleware/RequirePermission.php`
- Modify: `api/bootstrap/app.php`
- Test: `api/tests/Feature/PermissionMiddlewareTest.php`

**Interfaces:**
- Consumes: `Permission`, `Member::hasPermission()` from Task 3
- Produces: route middleware alias `permission:<value>`, e.g.
  `Route::middleware(['auth:sanctum', 'permission:events.manage'])`. Pair it with
  `auth:sanctum` so an anonymous caller gets 401, not 403.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/PermissionMiddlewareTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PermissionMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['api', 'auth:sanctum', 'permission:events.manage'])
            ->get('/api/_test/guarded', fn () => response()->json(['ok' => true]));
    }

    private function memberWith(?Permission $permission): Member
    {
        $member = Member::create([
            'first_name' => 'Demo',
            'last_name' => 'Person',
            'username' => 'demo',
            'password' => 'secret123',
        ]);

        if ($permission !== null) {
            $role = Role::create(['key' => 'test', 'label_fr' => 'Test']);
            $role->syncPermissions([$permission]);
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->getJson('/api/_test/guarded')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_a_member_without_the_permission_gets_403(): void
    {
        $this->actingAs($this->memberWith(null))
            ->getJson('/api/_test/guarded')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_a_member_with_the_permission_passes(): void
    {
        $this->actingAs($this->memberWith(Permission::EventsManage))
            ->getJson('/api/_test/guarded')
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_a_different_permission_does_not_open_the_route(): void
    {
        $this->actingAs($this->memberWith(Permission::MembersManage))
            ->getJson('/api/_test/guarded')
            ->assertStatus(403);
    }

    public function test_an_unknown_permission_name_is_a_loud_failure(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'permission:events.mangle'])
            ->get('/api/_test/typo', fn () => response()->json(['ok' => true]));

        $this->withoutExceptionHandling();
        $this->expectException(\InvalidArgumentException::class);

        $this->actingAs($this->memberWith(Permission::EventsManage))
            ->getJson('/api/_test/typo');
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=PermissionMiddlewareTest
```
Expected: FAIL — the `permission` middleware alias is not defined.

- [ ] **Step 3: Write the middleware**

`api/app/Http/Middleware/RequirePermission.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Support\Permission;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: permission:events.manage | attendance.view_all | ...
 *
 * The ONLY place authorization is decided. No role name is ever consulted —
 * roles merely group permissions, and which role granted this one is not a
 * question the enforcement point may ask.
 *
 * Authentication is a separate concern: pair this with auth:sanctum so an
 * anonymous caller gets 401 rather than 403.
 *
 * Throws AuthorizationException rather than calling abort(403). abort() raises
 * a bare HttpException, which App\Exceptions\ApiError deliberately does not
 * catch, so the response would leave the {error, code, fields[]} contract (and
 * leak a stack trace under APP_DEBUG). See bootstrap/app.php.
 *
 * A permission string that is not an enum case throws INVALID_ARGUMENT rather
 * than quietly denying. A typo in a route definition is a programming error,
 * and a silent denial would look like a working guard while the real one was
 * never applied.
 */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $required = Permission::tryFrom($permission);

        if ($required === null) {
            throw new InvalidArgumentException(
                "Unknown permission '{$permission}' on a route. ".
                'It must be a case of App\Support\Permission.'
            );
        }

        if (! $request->user()?->hasPermission($required)) {
            throw new AuthorizationException;
        }

        return $next($request);
    }
}
```

- [ ] **Step 4: Register the alias**

In `api/bootstrap/app.php`, add `use App\Http\Middleware\RequirePermission;` to
the imports and, inside `withMiddleware`, after the `prependToGroup` calls:

```php
        $middleware->alias([
            'permission' => RequirePermission::class,
        ]);
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=PermissionMiddlewareTest
```
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Middleware/RequirePermission.php api/bootstrap/app.php \
        api/tests/Feature/PermissionMiddlewareTest.php
git commit -m "feat(api): permission route middleware"
```

---

## Task 5: argon2id hashing

**Files:**
- Create: `api/config/hashing.php`
- Modify: `api/.env.example`
- Test: `api/tests/Feature/HashingTest.php`

**Interfaces:**
- Consumes: nothing
- Produces: `Hash::make()` produces argon2id digests by default; the driver is
  overridable with the `HASH_DRIVER` env var.

**Host risk, must be verified before any deploy.** `PASSWORD_ARGON2ID` requires
PHP built with argon2 support. It is present in the local PHP 8.4 build
(verified 2026-09-05), but **the shared host has not been checked**. The test in
Step 1 fails loudly rather than silently falling back, and `HASH_DRIVER=bcrypt`
is the escape hatch if the host lacks it.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/HashingTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HashingTest extends TestCase
{
    public function test_this_php_build_supports_argon2id(): void
    {
        $this->assertTrue(
            defined('PASSWORD_ARGON2ID'),
            'This PHP build has no argon2 support. Set HASH_DRIVER=bcrypt for '.
            'this environment and record why in the deploy notes.',
        );
    }

    public function test_the_default_driver_is_argon2id(): void
    {
        $this->assertSame('argon2id', config('hashing.driver'));
    }

    public function test_a_hash_round_trips(): void
    {
        $hash = Hash::make('correct horse battery staple');

        $this->assertStringStartsWith('$argon2id$', $hash);
        $this->assertTrue(Hash::check('correct horse battery staple', $hash));
        $this->assertFalse(Hash::check('wrong', $hash));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=HashingTest
```
Expected: FAIL on `test_the_default_driver_is_argon2id` — `config('hashing.driver')`
is `bcrypt` (Laravel's packaged default), because no `config/hashing.php` exists.

- [ ] **Step 3: Write the config**

`api/config/hashing.php`:

```php
<?php

return [

    /*
     * argon2id, not bcrypt. There is no legacy hash to migrate — the rebuild
     * issues every member a fresh credential (design D13) — so nothing forces
     * the older algorithm.
     *
     * NOTE FOR DEPLOYS: argon2id needs a PHP built with argon2 support.
     * HashingTest asserts it loudly rather than letting a server fall back
     * silently. If a host lacks it, set HASH_DRIVER=bcrypt in that server's
     * .env and record why — do not change this default.
     */
    'driver' => env('HASH_DRIVER', 'argon2id'),

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
    ],

    /*
     * PHP's own defaults, stated explicitly so a PHP upgrade cannot silently
     * change the work factor. 64 MiB and 4 passes on a single thread is the
     * OWASP-recommended floor and is affordable on shared hosting for the
     * handful of logins this application sees.
     */
    'argon' => [
        'memory' => env('ARGON_MEMORY', 65536),
        'threads' => env('ARGON_THREADS', 1),
        'time' => env('ARGON_TIME', 4),
        'verify' => true,
    ],

];
```

- [ ] **Step 4: Document the env vars**

Add to `api/.env.example`, after the existing `BCRYPT_ROUNDS` line (or near the
app block if none exists):

```
# Password hashing. argon2id is the default and needs a PHP built with argon2
# support; set HASH_DRIVER=bcrypt only on a host that lacks it.
HASH_DRIVER=argon2id
ARGON_MEMORY=65536
ARGON_THREADS=1
ARGON_TIME=4
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=HashingTest
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole suite**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
Expected: PASS. `phpunit.xml` sets `BCRYPT_ROUNDS=4` for speed; argon2 has no
equivalent knob there, so the suite gets slower. If it becomes painful, add
`<env name="ARGON_MEMORY" value="1024"/>` and `<env name="ARGON_TIME" value="1"/>`
to `phpunit.xml` with a comment saying they are test-only speed settings.

- [ ] **Step 7: Commit**

```bash
git add api/config/hashing.php api/.env.example api/tests/Feature/HashingTest.php
git commit -m "feat(api): argon2id password hashing"
```

---

## Task 6: Hardened login and logout

**Files:**
- Rewrite: `api/app/Http/Controllers/Api/AuthController.php`
- Modify: `web/src/i18n/fr.ts`
- Test: `api/tests/Feature/LoginTest.php`

**Interfaces:**
- Consumes: `Member` (Task 2), argon2id (Task 5)
- Produces:
  - `POST /api/login` — body `{username, password}`; 200 `{ok: true}` on success;
    401 `{error, code: "invalid_credentials"}` on any failure; 429
    `{error, code: "too_many_attempts"}` when throttled. Sets `last_login_at`
    and regenerates the session.
  - `POST /api/logout` — 200 `{ok: true}`.
  - New error code emitted: `too_many_attempts`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/LoginTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear($this->throttleKey());
    }

    private function throttleKey(string $username = 'lea.keller'): string
    {
        return 'login:'.$username.'|127.0.0.1';
    }

    /**
     * Sanctum's statefulApi() only starts a session for a request carrying an
     * Origin whose host is in SANCTUM_STATEFUL_DOMAINS. phpunit.xml pins
     * `localhost`, so this mirrors how the real same-origin SPA arrives.
     *
     * @param  array<string, mixed>  $data
     */
    private function spaPostJson(string $uri, array $data = []): TestResponse
    {
        return $this->withHeaders(['Origin' => 'http://localhost'])->postJson($uri, $data);
    }

    private function member(): Member
    {
        return Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
    }

    public function test_valid_credentials_authenticate(): void
    {
        $this->member();

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertAuthenticated();
    }

    public function test_a_successful_login_records_the_time(): void
    {
        $member = $this->member();
        $this->assertNull($member->last_login_at);

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertNotNull($member->fresh()->last_login_at);
    }

    public function test_a_wrong_password_is_refused_generically(): void
    {
        $this->member();

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(401)->assertJson(['code' => 'invalid_credentials']);

        $this->assertGuest();
    }

    public function test_an_unknown_username_gives_the_same_answer_as_a_wrong_password(): void
    {
        // Anything else enables username enumeration.
        $this->member();

        $unknown = $this->spaPostJson('/api/login', [
            'username' => 'nobody',
            'password' => 'secret123',
        ]);
        $wrong = $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ]);

        $this->assertSame($unknown->status(), $wrong->status());
        $this->assertSame($unknown->json('code'), $wrong->json('code'));
    }

    public function test_a_member_without_a_username_cannot_log_in(): void
    {
        Member::create(['first_name' => 'Petit', 'last_name' => 'Canard']);

        $this->spaPostJson('/api/login', [
            'username' => '',
            'password' => 'anything',
        ])->assertStatus(400)->assertJson(['code' => 'validation_failed']);

        $this->assertGuest();
    }

    public function test_repeated_failures_are_throttled(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ])->assertStatus(401);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'wrong',
        ])->assertStatus(429)->assertJson(['code' => 'too_many_attempts']);
    }

    public function test_throttling_blocks_even_the_correct_password(): void
    {
        // Otherwise an attacker who guesses right on attempt 200 is unaffected
        // by the limit.
        $this->member();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertStatus(429);

        $this->assertGuest();
    }

    public function test_a_successful_login_clears_the_counter(): void
    {
        $this->member();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->spaPostJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong',
            ]);
        }

        $this->spaPostJson('/api/login', [
            'username' => 'lea.keller',
            'password' => 'secret123',
        ])->assertOk();

        $this->assertSame(0, RateLimiter::attempts($this->throttleKey()));
    }

    public function test_logout_ends_the_session(): void
    {
        $member = $this->member();

        $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/logout')
            ->assertOk()->assertJson(['ok' => true]);

        $this->assertGuest();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=LoginTest
```
Expected: FAIL — `AuthController` still returns `['role' => ...]` and has no
throttling.

- [ ] **Step 3: Rewrite the controller**

Replace `api/app/Http/Controllers/Api/AuthController.php` entirely:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    /**
     * Five failures per username+IP, then a one-minute lock that grows with
     * every further attempt.
     *
     * Keyed on BOTH so that neither dimension alone defeats it: per-IP only
     * lets a botnet spread attempts across addresses, per-username only lets
     * one attacker lock a member out of their own account by hammering it.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $key = $this->throttleKey($credentials['username'], $request->ip());

        // Checked BEFORE the password is verified, so a throttled attacker who
        // finally guesses correctly is still refused. Verifying first and
        // throttling after would make the limit decorative.
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            return ApiError::json(429, 'too_many_attempts', 'Too many attempts');
        }

        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            // One generic code, never per-field: saying which of username or
            // password was wrong enables enumeration. A member with no username
            // never reaches here — the `required` rule above rejects an empty
            // one, and a NULL username matches nothing.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        RateLimiter::clear($key);

        // Fixation defence: the pre-login session id must not survive the
        // privilege change.
        $request->session()->regenerate();

        /** @var Member $member */
        $member = Auth::user();
        $member->forceFill(['last_login_at' => now()])->save();

        // Deliberately no role or permissions in this body. The client asks
        // GET /api/me for identity, so there is exactly one shape describing
        // who you are and one place to change it.
        return response()->json(['ok' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        return response()->json([
            'id' => $member->id,
            'username' => $member->username,
            'firstName' => $member->first_name,
            'lastName' => $member->last_name,
            'isPlayer' => $member->isPlayer(),
            'mustChangePassword' => $member->must_change_password,
            'permissions' => $member->permissions()->map(fn ($p) => $p->value)->all(),
        ])->header('Cache-Control', 'no-store, private');
    }

    private function throttleKey(string $username, ?string $ip): string
    {
        return 'login:'.$username.'|'.($ip ?? 'unknown');
    }
}
```

- [ ] **Step 4: Add the French copy for the new code**

In `web/src/i18n/fr.ts`, inside the `errors` object, after `invalid_credentials`:

```
    too_many_attempts: "Trop de tentatives. Veuillez réessayer dans une minute.",
```

Keep it a bare identifier with no quotes around the key — `ApiErrorVocabularyTest`
brace-walks this file and a quoted key would hide the token from the guard.

- [ ] **Step 5: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=LoginTest
```
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the vocabulary guard**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ApiErrorVocabularyTest
```
Expected: PASS. A failure here means `too_many_attempts` did not land where the
guard looks — check that the key is unquoted and inside the `errors` block.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/AuthController.php web/src/i18n/fr.ts \
        api/tests/Feature/LoginTest.php
git commit -m "feat(api): throttled login, and GET /api/me carries permissions"
```

---

## Task 7: `GET /api/me` contract test

**Files:**
- Test: `api/tests/Feature/MeTest.php`

**Interfaces:**
- Consumes: `AuthController::me()` from Task 6
- Produces: nothing new — this pins the shape R1b's SPA session provider will
  consume.

- [ ] **Step 1: Write the test**

Create `api/tests/Feature/MeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_anonymous_caller_is_refused(): void
    {
        $this->getJson('/api/me')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_it_returns_identity_and_effective_permissions(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'section_id' => $section->id,
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
        $role = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $role->syncPermissions([Permission::EventsManage, Permission::AttendanceViewAll]);
        $member->roles()->attach($role);

        $response = $this->actingAs($member)->getJson('/api/me')->assertOk();

        $response->assertJson([
            'id' => $member->id,
            'username' => 'lea.keller',
            'firstName' => 'Léa',
            'lastName' => 'Keller',
            'isPlayer' => true,
            'mustChangePassword' => false,
        ]);

        $this->assertEqualsCanonicalizing(
            ['events.manage', 'attendance.view_all'],
            $response->json('permissions'),
        );
    }

    public function test_it_never_leaks_the_password_hash(): void
    {
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);

        $body = $this->actingAs($member)->getJson('/api/me')->assertOk()->json();

        $this->assertArrayNotHasKey('password', $body);
        $this->assertStringNotContainsString('argon2', json_encode($body));
    }

    public function test_a_member_with_no_register_is_not_a_player(): void
    {
        $member = Member::create([
            'first_name' => 'Marc',
            'last_name' => 'Rossier',
            'username' => 'marc.rossier',
            'password' => 'secret123',
        ]);

        $this->actingAs($member)->getJson('/api/me')
            ->assertOk()
            ->assertJson(['isPlayer' => false]);
    }

    public function test_the_response_is_never_cached(): void
    {
        // /api/me varies by identity; a shared proxy caching it would serve one
        // member's identity to another.
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);

        $this->actingAs($member)->getJson('/api/me')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }
}
```

- [ ] **Step 2: Run it**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=MeTest
```
Expected: PASS, 5 tests. If `test_the_response_is_never_cached` fails on the
exact header value, read the actual value from the failure output and assert
that instead — Laravel composes `Cache-Control` and may order or extend the
directives. Do **not** weaken the assertion to "contains no-store" without
recording why; the point is that the value is pinned.

- [ ] **Step 3: Commit**

```bash
git add api/tests/Feature/MeTest.php
git commit -m "test(api): pin the GET /api/me contract"
```

---

## Task 8: Immediate session revocation

**Files:**
- Create: `api/app/Support/SessionRevoker.php`
- Test: `api/tests/Feature/SessionRevocationTest.php`

**Interfaces:**
- Consumes: `Member` from Task 2
- Produces: `App\Support\SessionRevoker::forMember(int $memberId): int` —
  deletes that member's rows from `sessions` and returns how many. R1b calls it
  after deleting a member, changing a password, or changing roles.

**Why this exists.** Deleting a member currently leaves their `sessions` row
intact, so they stay logged in until it expires. Without this, hard-delete as an
offboarding mechanism is theatre.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/SessionRevocationTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Support\SessionRevoker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SessionRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    /**
     * Writes a row shaped like Laravel's database session handler's, so the
     * test exercises the real table rather than a stand-in. phpunit.xml runs
     * SESSION_DRIVER=array, so nothing else populates this table here.
     */
    private function seedSession(string $id, ?int $memberId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $memberId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])),
            'last_activity' => time(),
        ]);
    }

    public function test_it_deletes_only_that_members_sessions(): void
    {
        $lea = $this->member('lea');
        $marc = $this->member('marc');

        $this->seedSession('session-lea-phone', $lea->id);
        $this->seedSession('session-lea-laptop', $lea->id);
        $this->seedSession('session-marc', $marc->id);

        $deleted = SessionRevoker::forMember($lea->id);

        $this->assertSame(2, $deleted);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $lea->id)->count());
        $this->assertSame(1, DB::table('sessions')->where('user_id', $marc->id)->count());
    }

    public function test_it_leaves_anonymous_sessions_alone(): void
    {
        $lea = $this->member('lea');
        $this->seedSession('session-anonymous', null);
        $this->seedSession('session-lea', $lea->id);

        SessionRevoker::forMember($lea->id);

        $this->assertSame(1, DB::table('sessions')->whereNull('user_id')->count());
    }

    public function test_it_is_safe_when_there_is_nothing_to_revoke(): void
    {
        $this->assertSame(0, SessionRevoker::forMember(999));
    }

    public function test_deleting_a_member_cascades_nothing_onto_sessions(): void
    {
        // sessions has no foreign key to members, so the row survives the
        // delete — which is exactly why SessionRevoker must be called
        // explicitly, and why this test exists to state it.
        $lea = $this->member('lea');
        $this->seedSession('session-lea', $lea->id);

        $lea->delete();

        $this->assertSame(1, DB::table('sessions')->where('user_id', $lea->id)->count());
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SessionRevocationTest
```
Expected: FAIL — `Class "App\Support\SessionRevoker" not found`.

- [ ] **Step 3: Write the revoker**

`api/app/Support/SessionRevoker.php`:

```php
<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Ends every session belonging to a member, immediately.
 *
 * WHY THIS EXISTS. The `sessions` table has no foreign key to `members`, so
 * deleting a member leaves their session row untouched and they stay logged in
 * until it expires on its own. Without this call, hard-delete as an offboarding
 * mechanism is theatre — the thing the rebuild set out to fix.
 *
 * Call it after: deleting a member, changing their password, and changing their
 * roles. The last one matters as much as the first: a revoked permission that
 * only takes effect at the next login is a revoked permission the holder can
 * keep using all evening.
 *
 * Laravel's database session handler writes the authenticated id into
 * `user_id`; that column name comes from the framework, not from this
 * application's vocabulary, which is why it does not say `member_id`.
 */
final class SessionRevoker
{
    /** @return int the number of sessions ended */
    public static function forMember(int $memberId): int
    {
        return DB::table('sessions')->where('user_id', $memberId)->delete();
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SessionRevocationTest
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/SessionRevoker.php api/tests/Feature/SessionRevocationTest.php
git commit -m "feat(api): revoke a member's sessions immediately"
```

---

## Task 9: Lockout invariants

**Files:**
- Create: `api/app/Support/AccessIntegrity.php`
- Create: `api/app/Exceptions/AccessIntegrityViolation.php`
- Modify: `web/src/i18n/fr.ts`
- Modify: `api/bootstrap/app.php`
- Test: `api/tests/Feature/AccessIntegrityTest.php`

**Interfaces:**
- Consumes: `Permission`, `EffectivePermissions` (Task 3), `Member` (Task 2)
- Produces:
  - `App\Exceptions\AccessIntegrityViolation` — a `RuntimeException` carrying a
    `code` string, rendered as HTTP 409.
  - `App\Support\AccessIntegrity::assertMayDelete(Member $actor, Member $target): void`
  - `App\Support\AccessIntegrity::assertMayReplaceRoles(Member $actor, Member $target, array $roleIds): void`
  - New error codes: `cannot_remove_last_administrator`, `cannot_demote_self`,
    `cannot_delete_self`.

R1b's members controller calls these before every destructive write. They live
here, with the foundation, so that controller cannot forget them.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/AccessIntegrityTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private Role $admins;

    private Role $plain;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admins = Role::create(['key' => 'direction', 'label_fr' => 'Team Direction']);
        $this->admins->syncPermissions([Permission::MembersManage]);

        $this->plain = Role::create(['key' => 'committee', 'label_fr' => 'Comité']);
        $this->plain->syncPermissions([Permission::EventsManage]);
    }

    private function member(string $username, ?Role $role = null): Member
    {
        $member = Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);

        if ($role !== null) {
            $member->roles()->attach($role);
        }

        return $member;
    }

    public function test_the_last_administrator_cannot_be_deleted(): void
    {
        $only = $this->member('only', $this->admins);
        $other = $this->member('other', $this->admins);

        // Two exist, so removing one is fine.
        AccessIntegrity::assertMayDelete($only, $other);

        $other->delete();

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayDelete($only, $only->fresh());
    }

    public function test_the_violation_carries_the_last_administrator_code(): void
    {
        $only = $this->member('only', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($only, $only);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_remove_last_administrator', $e->code);
        }
    }

    public function test_nobody_may_delete_themselves(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayDelete($actor, $actor);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_delete_self', $e->code);
        }
    }

    public function test_a_member_without_the_permission_may_be_deleted_freely(): void
    {
        // The assertion IS that the call returns rather than throwing.
        // expectNotToPerformAssertions() says so honestly; assertTrue(true)
        // would only be silencing PHPUnit's risky-test warning.
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);
        $target = $this->member('target', $this->plain);

        AccessIntegrity::assertMayDelete($actor, $target);
    }

    public function test_the_last_administrator_cannot_be_demoted(): void
    {
        $actor = $this->member('actor', $this->admins);
        $only = $this->member('only', $this->admins);
        $actor->roles()->detach($this->admins);

        $this->expectException(AccessIntegrityViolation::class);
        AccessIntegrity::assertMayReplaceRoles($actor, $only, [$this->plain->id]);
    }

    public function test_nobody_may_strip_their_own_administration(): void
    {
        $actor = $this->member('actor', $this->admins);
        $this->member('spare', $this->admins);

        try {
            AccessIntegrity::assertMayReplaceRoles($actor, $actor, [$this->plain->id]);
            $this->fail('Expected AccessIntegrityViolation');
        } catch (AccessIntegrityViolation $e) {
            $this->assertSame('cannot_demote_self', $e->code);
        }
    }

    public function test_keeping_administration_while_adding_a_role_is_allowed(): void
    {
        $this->expectNotToPerformAssertions();

        $actor = $this->member('actor', $this->admins);

        AccessIntegrity::assertMayReplaceRoles(
            $actor,
            $actor,
            [$this->admins->id, $this->plain->id],
        );
    }

    public function test_a_violation_renders_as_409_in_the_error_contract(): void
    {
        \Illuminate\Support\Facades\Route::middleware('api')->get(
            '/api/_test/violation',
            fn () => throw new AccessIntegrityViolation('cannot_delete_self', 'Cannot delete self'),
        );

        $this->getJson('/api/_test/violation')
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_delete_self']);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AccessIntegrityTest
```
Expected: FAIL — `Class "App\Exceptions\AccessIntegrityViolation" not found`.

- [ ] **Step 3: Write the exception**

`api/app/Exceptions/AccessIntegrityViolation.php`:

```php
<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A write was refused because it would have broken an access invariant —
 * locking everyone out of member administration, or letting someone remove
 * their own ability to undo the change.
 *
 * 409 Conflict, not 403: the caller HAS the permission. The request conflicts
 * with the state of the system, which is precisely what 409 is for.
 */
final class AccessIntegrityViolation extends RuntimeException
{
    public function __construct(
        public readonly string $code,
        string $message,
    ) {
        parent::__construct($message);
    }
}
```

- [ ] **Step 4: Write the invariants**

`api/app/Support/AccessIntegrity.php`:

```php
<?php

namespace App\Support;

use App\Exceptions\AccessIntegrityViolation;
use App\Models\Member;
use Illuminate\Support\Facades\DB;

/**
 * The invariants that keep member administration recoverable.
 *
 * Two failure modes these exist to prevent, both of which end with someone
 * needing database access to repair a website:
 *
 *   1. The last holder of members.manage is deleted or demoted, and nobody can
 *      administer members any more.
 *   2. An administrator removes their own administration and cannot undo it.
 *
 * These are deliberately NOT permission checks — the caller has the permission.
 * They are state checks, which is why they raise 409 rather than 403.
 */
final class AccessIntegrity
{
    public static function assertMayDelete(Member $actor, Member $target): void
    {
        if ($actor->id === $target->id) {
            throw new AccessIntegrityViolation(
                'cannot_delete_self',
                'A member cannot delete their own account',
            );
        }

        if (self::wouldOrphanAdministration([$target->id])) {
            throw new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            );
        }
    }

    /**
     * @param  array<int, int>  $roleIds  the roles the target would be left with
     */
    public static function assertMayReplaceRoles(Member $actor, Member $target, array $roleIds): void
    {
        $keepsAdministration = self::rolesGrantAdministration($roleIds);

        if ($actor->id === $target->id && ! $keepsAdministration) {
            throw new AccessIntegrityViolation(
                'cannot_demote_self',
                'A member cannot remove their own member administration',
            );
        }

        if (! $keepsAdministration && self::wouldOrphanAdministration([$target->id])) {
            throw new AccessIntegrityViolation(
                'cannot_remove_last_administrator',
                'This is the last member who can administer members',
            );
        }
    }

    /**
     * True when removing these members would leave nobody holding
     * members.manage.
     *
     * @param  array<int, int>  $excludedMemberIds
     */
    private static function wouldOrphanAdministration(array $excludedMemberIds): bool
    {
        $remaining = EffectivePermissions::memberIdsWith(Permission::MembersManage)
            ->reject(fn ($id) => in_array((int) $id, $excludedMemberIds, true));

        return $remaining->isEmpty();
    }

    /** @param  array<int, int>  $roleIds */
    private static function rolesGrantAdministration(array $roleIds): bool
    {
        if ($roleIds === []) {
            return false;
        }

        return DB::table('role_permissions')
            ->whereIn('role_id', $roleIds)
            ->where('permission', Permission::MembersManage->value)
            ->exists();
    }
}
```

- [ ] **Step 5: Render the violation as 409**

In `api/bootstrap/app.php`, add `use App\Exceptions\AccessIntegrityViolation;`
to the imports and register this renderer inside `withExceptions`, immediately
after the `SchemaUnavailable` one and before the catch-all `HttpException` one:

```php
        // 409. A write was refused because it would have broken an access
        // invariant — see App\Support\AccessIntegrity. Registered before the
        // catch-all HttpException closure below so the specific case wins.
        $exceptions->render(fn (AccessIntegrityViolation $e, Request $request) => $request->is('api/*')
            ? ApiError::json(409, $e->code, $e->getMessage())
            : null);
```

- [ ] **Step 6: Add the French copy**

In `web/src/i18n/fr.ts`, inside `errors`, after `too_many_attempts`:

```
    cannot_delete_self: "Vous ne pouvez pas supprimer votre propre compte.",
    cannot_demote_self: "Vous ne pouvez pas retirer vos propres droits d'administration.",
    cannot_remove_last_administrator:
      "C'est la dernière personne pouvant administrer les membres.",
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AccessIntegrityTest
```
Expected: PASS, 8 tests.

- [ ] **Step 8: Run the vocabulary guard**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ApiErrorVocabularyTest
```
Expected: PASS. If it reports the three new codes as unreachable rather than
missing, add them to its explicit token list with the comment "raised by
App\Support\AccessIntegrity" — they are emitted through `ApiError::json()` from
an exception renderer, which no mechanical scan of `app/` can see.

- [ ] **Step 9: Commit**

```bash
git add api/app/Support/AccessIntegrity.php api/app/Exceptions/AccessIntegrityViolation.php \
        api/bootstrap/app.php web/src/i18n/fr.ts api/tests/Feature/AccessIntegrityTest.php
git commit -m "feat(api): invariants that keep member administration recoverable"
```

---

## Task 10: The audit log

**Files:**
- Create: `api/database/migrations/2026_09_05_000005_create_audit_log_table.php`
- Create: `api/app/Models/AuditEntry.php`
- Create: `api/app/Support/Audit.php`
- Test: `api/tests/Feature/AuditTest.php`

**Interfaces:**
- Consumes: `Member` from Task 2
- Produces: `App\Support\Audit::record(?Member $actor, string $action, string $targetType, ?int $targetId, string $targetLabel): AuditEntry`.
  Actions used by R1b: `member.created`, `member.deleted`, `member.roles_changed`,
  `member.password_reset`. R1c adds `event.deleted`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/AuditTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Support\Audit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    public function test_it_records_who_did_what_to_whom(): void
    {
        $actor = $this->member('actor');
        $target = $this->member('target');

        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());

        $entry = AuditEntry::sole();

        $this->assertSame($actor->id, $entry->actor_member_id);
        $this->assertSame('member.deleted', $entry->action);
        $this->assertSame('member', $entry->target_type);
        $this->assertSame($target->id, $entry->target_id);
        $this->assertSame('Demo Target', $entry->target_label);
    }

    public function test_the_label_survives_the_target_being_deleted(): void
    {
        // The whole point: after a hard delete, target_id points at nothing, so
        // the entry must still say who it was.
        $actor = $this->member('actor');
        $target = $this->member('target');

        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());
        $target->delete();

        $this->assertSame('Demo Target', AuditEntry::sole()->target_label);
    }

    public function test_deleting_the_actor_keeps_the_entry(): void
    {
        $actor = $this->member('actor');
        $target = $this->member('target');
        Audit::record($actor, 'member.deleted', 'member', $target->id, $target->fullName());

        $actor->delete();

        $entry = AuditEntry::sole();
        $this->assertNull($entry->actor_member_id);
        $this->assertSame('member.deleted', $entry->action);
    }

    public function test_a_systemic_action_may_have_no_actor(): void
    {
        Audit::record(null, 'member.created', 'member', 1, 'Seeded Person');

        $this->assertNull(AuditEntry::sole()->actor_member_id);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AuditTest
```
Expected: FAIL — `Class "App\Models\AuditEntry" not found`.

- [ ] **Step 3: Write the migration**

`api/database/migrations/2026_09_05_000005_create_audit_log_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Privileged mutations only — never ordinary activity, and never attendance.
 *
 * This does not contradict the rebuild's "history is not relevant" decision:
 * that concerns attendance answers, which are dead data once an event has
 * happened. This is a security control, and it is what makes "why does this
 * person have access?" answerable at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();

            // nullOnDelete, not cascade: an entry recording what someone did
            // must survive that someone leaving the band. Losing the actor's
            // identity is acceptable; losing the record is not.
            $table->foreignId('actor_member_id')->nullable()
                ->constrained('members')->nullOnDelete();

            $table->string('action', 64);
            $table->string('target_type', 32);

            // Plain integer with no foreign key: the target is usually
            // hard-deleted moments later, and a constraint would either block
            // that or erase the entry.
            $table->unsignedBigInteger('target_id')->nullable();

            // Who or what the target WAS, captured at write time. Without this
            // the log says "member 47 was deleted" and nobody can tell who 47
            // was.
            $table->string('target_label');

            $table->timestamp('created_at')->useCurrent();
            $table->index(['target_type', 'target_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_log');
    }
};
```

- [ ] **Step 4: Write the model and recorder**

`api/app/Models/AuditEntry.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditEntry extends Model
{
    protected $table = 'audit_log';

    // Only created_at exists — an audit entry is never updated.
    public const UPDATED_AT = null;

    protected $fillable = [
        'actor_member_id',
        'action',
        'target_type',
        'target_id',
        'target_label',
    ];

    /** @return BelongsTo<Member, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'actor_member_id');
    }
}
```

`api/app/Support/Audit.php`:

```php
<?php

namespace App\Support;

use App\Models\AuditEntry;
use App\Models\Member;

/**
 * Records a privileged mutation.
 *
 * $targetLabel is captured by the CALLER, before the mutation, because the
 * target is usually gone by the time anyone reads this back. Passing
 * $target->fullName() after a delete would record an empty string.
 */
final class Audit
{
    public static function record(
        ?Member $actor,
        string $action,
        string $targetType,
        ?int $targetId,
        string $targetLabel,
    ): AuditEntry {
        return AuditEntry::create([
            'actor_member_id' => $actor?->id,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'target_label' => $targetLabel,
        ]);
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AuditTest
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add api/database/migrations/2026_09_05_000005_create_audit_log_table.php \
        api/app/Models/AuditEntry.php api/app/Support/Audit.php \
        api/tests/Feature/AuditTest.php
git commit -m "feat(api): audit log for privileged mutations"
```

---

## Task 11: Development seed, OpenAPI, and the full green run

**Files:**
- Create: `api/database/seeders/DevSeeder.php`
- Modify: `api/database/seeders/DatabaseSeeder.php`
- Modify: `docker/web/entrypoint.sh` (or whichever file runs migrations at
  container start — locate it with `grep -rn "artisan migrate" docker/`)
- Test: `api/tests/Feature/DevSeederTest.php`

**Interfaces:**
- Consumes: everything above
- Produces: `php artisan db:seed` creates sections, two roles and three members
  with password `demo` — `demo.direction` (members.manage + events.manage +
  attendance.view_all + attendance.record_for_others + registrations.view),
  `demo.player` (a register, no roles), `demo.both` (a register *and* the
  direction role).

`demo.both` exists because it is the case the old system could not represent —
someone who organises *and* plays. If a future change reintroduces the old
either/or, that member is what breaks.

**Never real member data or real passwords** — synthetic names only.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/DevSeederTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Support\Permission;
use Database\Seeders\DevSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DevSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DevSeeder::class);
    }

    public function test_it_creates_the_three_demo_logins(): void
    {
        foreach (['demo.direction', 'demo.player', 'demo.both'] as $username) {
            $member = Member::where('username', $username)->first();

            $this->assertNotNull($member, "missing seeded member {$username}");
            $this->assertTrue(Hash::check('demo', $member->password));
        }
    }

    public function test_the_direction_member_can_manage_but_does_not_play(): void
    {
        $member = Member::where('username', 'demo.direction')->sole();

        $this->assertTrue($member->hasPermission(Permission::MembersManage));
        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertFalse($member->isPlayer());
    }

    public function test_the_player_has_no_permissions_but_plays(): void
    {
        $member = Member::where('username', 'demo.player')->sole();

        $this->assertTrue($member->permissions()->isEmpty());
        $this->assertTrue($member->isPlayer());
    }

    public function test_one_member_both_organises_and_plays(): void
    {
        // The case the old role matrix could not express.
        $member = Member::where('username', 'demo.both')->sole();

        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertTrue($member->isPlayer());
    }

    public function test_seeding_twice_does_not_duplicate_anyone(): void
    {
        $this->seed(DevSeeder::class);

        $this->assertSame(1, Member::where('username', 'demo.player')->count());
    }

    public function test_the_sections_are_ordered(): void
    {
        $names = \App\Models\Section::orderBy('sort_order')->pluck('name')->all();

        $this->assertSame('Trompettes', $names[0]);
        $this->assertGreaterThanOrEqual(4, count($names));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=DevSeederTest
```
Expected: FAIL — `Class "Database\Seeders\DevSeeder" not found`.

- [ ] **Step 3: Write the seeder**

`api/database/seeders/DevSeeder.php`:

```php
<?php

namespace Database\Seeders;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Database\Seeder;

/**
 * Local development and test data. SYNTHETIC ONLY — never a real member's name
 * and never a real password.
 *
 * Idempotent, because the dev container runs migrations (and may run this) on
 * every start.
 */
class DevSeeder extends Seeder
{
    public function run(): void
    {
        $sections = collect([
            'Trompettes' => 1,
            'Trombones' => 2,
            'Clarinettes' => 3,
            'Percussions' => 4,
        ])->mapWithKeys(fn (int $order, string $name) => [
            $name => Section::firstOrCreate(['name' => $name], ['sort_order' => $order]),
        ]);

        $direction = Role::firstOrCreate(
            ['key' => 'direction'],
            ['label_fr' => 'Team Direction'],
        );
        $direction->syncPermissions([
            Permission::EventsManage,
            Permission::AttendanceViewAll,
            Permission::AttendanceRecordForOthers,
            Permission::MembersManage,
            Permission::RegistrationsView,
        ]);

        $committee = Role::firstOrCreate(
            ['key' => 'committee'],
            ['label_fr' => 'Comité'],
        );
        $committee->syncPermissions([Permission::RegistrationsView]);

        // Organises, does not play: no register, so never in an attendance list.
        $this->member('demo.direction', 'Dominique', 'Direction', null)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // Plays, organises nothing.
        $this->member('demo.player', 'Perrine', 'Player', $sections['Clarinettes']->id);

        // BOTH — the case the old role matrix could not express. If someone
        // reintroduces an either/or, this member is what breaks.
        $this->member('demo.both', 'Bastien', 'Both', $sections['Trompettes']->id)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // A person with no account at all: listed publicly, never logs in.
        Member::firstOrCreate(
            ['first_name' => 'Nadia', 'last_name' => 'Sansconnexion'],
            [
                'section_id' => $sections['Percussions']->id,
                'public_visible' => true,
            ],
        );
    }

    private function member(string $username, string $first, string $last, ?int $sectionId): Member
    {
        return Member::firstOrCreate(
            ['username' => $username],
            [
                'first_name' => $first,
                'last_name' => $last,
                'section_id' => $sectionId,
                'password' => 'demo',
                'public_visible' => true,
            ],
        );
    }
}
```

- [ ] **Step 4: Register it**

Replace the body of `run()` in `api/database/seeders/DatabaseSeeder.php` with:

```php
    public function run(): void
    {
        $this->call(DevSeeder::class);
    }
```

Remove any reference to `User::factory()` Laravel's scaffold left there.

- [ ] **Step 5: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=DevSeederTest
```
Expected: PASS, 6 tests.

- [ ] **Step 6: Make the dev stack seed itself**

The old stack seeded the database from `docker/db/init/02-seed.sql`, which Task 1
deleted. Find the entrypoint that runs migrations:

```bash
grep -rn "artisan migrate" docker/
```

In that file, add `php api-laravel/artisan db:seed --force` immediately after the
migrate line, wrapped in the same retry the migrate call already uses. The
seeder is idempotent, so running it on every container start is safe.

- [ ] **Step 7: Rebuild the stack and confirm a real login works**

```bash
npm run dev:down && npm run dev
npm run build
```

Then, against http://localhost:8090, confirm with the browser's network tab:
`POST /api/login` with `demo.direction` / `demo` returns 200, and a subsequent
`GET /api/me` returns all five permissions and `"isPlayer": false`.

A green suite is not a working login — the Sanctum cookie round-trip is only
exercised for real in a browser, and this project has previously shipped auth
changes that passed every test and failed in Chrome.

- [ ] **Step 8: Regenerate the API client**

```bash
npm run openapi && npm run generate:api
```
Expected: `web/src/api/generated/` changes to drop the deleted endpoints and add
`/api/me`. Commit the result — CI's `openapi-drift` job fails if it is stale.

- [ ] **Step 9: Run everything**

```bash
npm run check
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
Expected: both green.

- [ ] **Step 10: Commit**

```bash
git add api/database/seeders web/src/api/generated docker/ \
        api/tests/Feature/DevSeederTest.php
git commit -m "feat(api): synthetic dev seed with an organiser who also plays"
```

---

## Task 12: Session cookie hardening and an absolute lifetime

Independent of Tasks 7–11 — it only needs Task 6's `AuthController`. Do it last
or straight after Task 6, whichever suits.

**Files:**
- Modify: `api/config/session.php`
- Modify: `docker/api/env.docker`, `api/.env.example`
- Create: `api/app/Http/Middleware/EnforceAbsoluteSessionLifetime.php`
- Modify: `api/bootstrap/app.php`, `api/app/Http/Controllers/Api/AuthController.php`
- Test: `api/tests/Feature/SessionLifetimeTest.php`

**Interfaces:**
- Consumes: `AuthController::login()` (Task 6)
- Produces: login writes `auth.started_at` (a UNIX timestamp) into the session;
  `EnforceAbsoluteSessionLifetime` is appended to the `api` group and ends any
  session older than `session.absolute_lifetime` minutes with a 401
  `not_authenticated`.

**Why an absolute lifetime.** Laravel's `session.lifetime` is *idle* only — it is
refreshed on every request, so a session that is used daily never expires at
all. On a shared family device that is indefinite access.

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/SessionLifetimeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SessionLifetimeTest extends TestCase
{
    use RefreshDatabase;

    private function member(): Member
    {
        return Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'secret123',
        ]);
    }

    public function test_the_session_cookie_is_secure_http_only_and_strict(): void
    {
        $this->assertTrue(config('session.http_only'));
        $this->assertSame('strict', config('session.same_site'));
        $this->assertTrue(
            config('session.secure'),
            'SESSION_SECURE_COOKIE must default to true; local http dev overrides it.',
        );
    }

    public function test_login_stamps_the_session_start(): void
    {
        $this->member();

        $this->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/login', ['username' => 'lea.keller', 'password' => 'secret123'])
            ->assertOk();

        $this->assertNotNull(session('auth.started_at'));
    }

    public function test_a_fresh_session_is_accepted(): void
    {
        $member = $this->member();

        $this->actingAs($member)
            ->withSession(['auth.started_at' => now()->timestamp])
            ->getJson('/api/me')
            ->assertOk();
    }

    public function test_a_session_older_than_the_absolute_lifetime_is_refused(): void
    {
        $member = $this->member();
        $tooOld = now()->subMinutes(config('session.absolute_lifetime') + 1)->timestamp;

        $this->actingAs($member)
            ->withSession(['auth.started_at' => $tooOld])
            ->getJson('/api/me')
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);
    }

    public function test_a_session_with_no_stamp_is_refused(): void
    {
        // A session predating this middleware, or one forged by hand. Failing
        // closed is the only safe reading of "we do not know when this began".
        $member = $this->member();

        $this->actingAs($member)
            ->withSession([])
            ->getJson('/api/me')
            ->assertStatus(401);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SessionLifetimeTest
```
Expected: FAIL — `config('session.same_site')` is `lax` and
`session.absolute_lifetime` does not exist.

- [ ] **Step 3: Harden the session config**

In `api/config/session.php`, set these four values and add the comments:

```php
    /*
     * IDLE lifetime. Refreshed on every request, so on its own a daily user's
     * session never ends — see 'absolute_lifetime' below.
     */
    'lifetime' => (int) env('SESSION_LIFETIME', 120),

    /*
     * ABSOLUTE lifetime, in minutes. Not a Laravel setting: it is read by
     * App\Http\Middleware\EnforceAbsoluteSessionLifetime, which ends any
     * session that began longer ago than this however active it has been.
     * Twelve hours — long enough that nobody is logged out mid-rehearsal,
     * short enough that a session on a shared family device does not last a
     * season.
     */
    'absolute_lifetime' => (int) env('SESSION_ABSOLUTE_LIFETIME', 720),

    /*
     * Defaults to TRUE, unlike Laravel's packaged config. Every real server is
     * HTTPS; only local http dev needs it off, and docker/api/env.docker sets
     * SESSION_SECURE_COOKIE=false for exactly that. Defaulting the other way
     * means a forgotten .env key silently ships a cookie over plaintext.
     */
    'secure' => filter_var(env('SESSION_SECURE_COOKIE', true), FILTER_VALIDATE_BOOLEAN),

    /*
     * strict, not Laravel's lax. The SPA and the API are same-origin, and the
     * shell is a static file that needs no cookie to load — every request that
     * must carry the session is an XHR from that already-loaded page, which is
     * same-site. So strict costs nothing here and closes the cross-site cases
     * lax leaves open.
     */
    'same_site' => env('SESSION_SAME_SITE', 'strict'),
```

Leave `'http_only' => true` as Laravel ships it; the test pins it so it cannot
be loosened silently.

- [ ] **Step 4: Set the dev overrides**

In `docker/api/env.docker` add:

```
# Local dev is plain http, so the cookie cannot be Secure-only or the browser
# will not send it. Every deployed server leaves this unset and gets true.
SESSION_SECURE_COOKIE=false
```

In `api/.env.example` add, near the other session keys:

```
# Leave SESSION_SECURE_COOKIE unset on any real server — it defaults to true.
SESSION_ABSOLUTE_LIFETIME=720
```

- [ ] **Step 5: Write the middleware**

`api/app/Http/Middleware/EnforceAbsoluteSessionLifetime.php`:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ends a session that began too long ago, however recently it was used.
 *
 * Laravel's session.lifetime is an IDLE timeout: it is refreshed on every
 * request, so someone who opens the site daily is never logged out. This is the
 * absolute cap on top of it.
 *
 * FAILS CLOSED. A session with no auth.started_at stamp — one predating this
 * middleware, or one assembled by hand — is refused rather than trusted,
 * because "we do not know when this began" is not a reason to allow it.
 *
 * Throws AuthenticationException rather than returning a response, so the
 * refusal renders through ApiError::unauthenticated() and stays inside the
 * {error, code, fields[]} contract.
 */
class EnforceAbsoluteSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() === null) {
            return $next($request);
        }

        $startedAt = $request->session()->get('auth.started_at');
        $maxAgeSeconds = ((int) config('session.absolute_lifetime', 720)) * 60;

        if (! is_int($startedAt) || (time() - $startedAt) > $maxAgeSeconds) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw new AuthenticationException;
        }

        return $next($request);
    }
}
```

- [ ] **Step 6: Register it and stamp the session at login**

In `api/bootstrap/app.php` add
`use App\Http\Middleware\EnforceAbsoluteSessionLifetime;` and, inside
`withMiddleware`, after the `alias([...])` call:

```php
        // APPENDED, not prepended: it needs the session started and the user
        // resolved, so it must run after StartSession and Authenticate rather
        // than in front of them like RunPendingMigrations.
        $middleware->appendToGroup('api', EnforceAbsoluteSessionLifetime::class);
```

In `AuthController::login()`, immediately after
`$request->session()->regenerate();`, add:

```php
        // The absolute-lifetime clock. Written after regenerate(), because
        // regenerating migrates the session data and writing before it would
        // work but reads as though the order did not matter — it does the day
        // someone switches to a driver that does not migrate.
        $request->session()->put('auth.started_at', time());
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SessionLifetimeTest
```
Expected: PASS, 5 tests.

- [ ] **Step 8: Run the whole suite**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
Expected: PASS. `MeTest` and `PermissionMiddlewareTest` use `actingAs()` without
a session stamp and will now 401. Add
`->withSession(['auth.started_at' => now()->timestamp])` after each `actingAs()`
in those two files — that is the correct fix, not relaxing the middleware.

- [ ] **Step 9: Confirm in a browser**

```bash
npm run build
```
Log in at http://localhost:8090 with `demo.direction` / `demo` and confirm in
DevTools → Application → Cookies that the session cookie shows **HttpOnly ✓,
SameSite Strict, Secure ✗** (Secure is off because dev is http — that is the
`env.docker` override working).

- [ ] **Step 10: Commit**

```bash
git add api/config/session.php api/app/Http/Middleware/EnforceAbsoluteSessionLifetime.php \
        api/bootstrap/app.php api/app/Http/Controllers/Api/AuthController.php \
        docker/api/env.docker api/.env.example \
        api/tests/Feature/SessionLifetimeTest.php api/tests/Feature/MeTest.php \
        api/tests/Feature/PermissionMiddlewareTest.php
git commit -m "feat(api): strict session cookies and an absolute lifetime"
```

---

## Done when

- `docker compose exec -w /var/www/html/api-laravel web php artisan test` is green.
- `npm run check` is green.
- A browser login at http://localhost:8090 with `demo.direction` / `demo`
  succeeds, and `GET /api/me` returns the five permissions.
- That session cookie is HttpOnly and SameSite=Strict.
- `git grep -n "Capability\|manage_events\|view_summary\|moderator\|SOUPER_SIGNUP"`
  returns nothing outside `docs/`.
- `api/app/Models/User.php` no longer exists.

## Carried into R1b

- The members admin UI (`/members`), `/account`, and the login screen rewrite.
- **Re-authentication before destructive privileged actions** (spec §6). It has
  no home until those endpoints exist, so it belongs with the members
  controller, not here.
- `AccessIntegrity`, `SessionRevoker` and `Audit` have no callers yet. R1b's
  members controller must call all three: the invariants before every
  destructive write, the revoker after delete / password change / role change,
  and the audit recorder for each.
- **Verify argon2id on the shared host before any deploy** (Task 5).
