# Committee inbox implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the committee a worklist of things needing action, and make the contact messages that have been stored since July readable, handleable and deletable.

**Architecture:** The inbox is computed from its sources at read time, with no table of its own — `InboxRegistry` asks each registered `InboxSource` what of its own is open, and `ContactMessageSource` is the only source today. Open state lives on the source row (`contact_messages.handled_at`), shared across the committee and stamped with who handled it. Two new permissions split reading from clearing; both writes are conditional on an entity tag.

**Tech Stack:** Laravel 13 / PHP 8.4 / MariaDB 10.3 on the API side; React 19 + TypeScript + Tailwind 4 + TanStack Query through the orval-generated client on the web side. PHPUnit for the API, Vitest for the web.

**Spec:** [`docs/superpowers/specs/2026-09-15-committee-inbox-design.md`](../specs/2026-09-15-committee-inbox-design.md)

**Issue:** [#88](https://github.com/hoferan/website-les-canetons/issues/88). Branch: `feat/committee-inbox` (already cut; the spec is committed on it as `6823b91`).

## Global constraints

- **English everywhere except on-screen text.** Code, comments, DB columns, enum values, route paths, error tokens: English. French appears only in `web/src/i18n/` and in rendered UI copy.
- **Never hand-edit `web/src/api/generated/`.** Change the controller, run `npm run openapi && npm run generate:api`, commit the result.
- **Every list endpoint answers `{data, meta}`** — `App\Http\Middleware\PaginatesCollections` does it for free. Read rows on the client through `rowsOf()` from `web/src/api/collection.ts`.
- **The middleware aliases are `permission:` and `etag:`** (`api/bootstrap/app.php:139-144`). CLAUDE.md calls the first one `capability:`; that is stale — see [#112](https://github.com/hoferan/website-les-canetons/issues/112).
- **Migrations must be idempotent.** `RunPendingMigrations` re-checks on every request, and the same files run against TEST, QA and PROD. Guard with `Schema::hasColumn` / `insertOrIgnore`.
- **Run the Laravel suite in Docker**, never two at once:
  `MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test`
- **Run the web suite from PowerShell, not Git Bash** — Git Bash's lowercase drive letter makes Vitest 4 fail to find its runner across all 29 files.
- **Any new error token needs French copy** in `web/src/i18n/fr.ts` in the same commit; `ApiErrorVocabularyTest` reads that file directly.

---

## Task 1: Schema and model

**Files:**
- Create: `api/database/migrations/2026_09_15_000001_add_handled_to_contact_messages.php`
- Create: `api/database/factories/ContactMessageFactory.php`
- Modify: `api/app/Models/ContactMessage.php`
- Test: `api/tests/Feature/ContactMessageSchemaTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `contact_messages.handled_at` (nullable timestamp) and `contact_messages.handled_by_member_id` (nullable FK); `ContactMessage::$fillable` gaining both; `ContactMessage::handledBy(): BelongsTo`; `ContactMessage::factory()` with a `->handled(Member $by)` state.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/ContactMessageSchemaTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactMessageSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_message_starts_unhandled(): void
    {
        $message = ContactMessage::factory()->create();

        $this->assertNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_a_message_records_who_handled_it(): void
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->handled($camille)->create();

        $this->assertNotNull($message->handled_at);
        $this->assertTrue($message->handledBy->is($camille));
    }

    public function test_the_record_of_who_handled_it_survives_that_member_leaving(): void
    {
        // nullOnDelete rather than cascade: losing the member must not lose
        // the message, which is a stranger's and not the band's to discard.
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->handled($camille)->create();

        $camille->delete();

        $message->refresh();
        $this->assertNotNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_the_migration_is_safe_to_run_twice(): void
    {
        // RunPendingMigrations re-checks on every request; a migration that
        // throws on a second pass takes the whole API down with a 503.
        $this->assertTrue(Schema::hasColumn('contact_messages', 'handled_at'));
        $this->assertTrue(Schema::hasColumn('contact_messages', 'handled_by_member_id'));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageSchemaTest
```

Expected: FAIL — `Call to undefined method App\Models\ContactMessage::factory()`.

- [ ] **Step 3: Write the migration**

`api/database/migrations/2026_09_15_000001_add_handled_to_contact_messages.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Open and handled, for the committee inbox.
 *
 * `handled_at IS NULL` is the whole definition of an open item — the inbox is
 * computed from its sources rather than materialised, so this column is the
 * only state it has.
 *
 * WHY THE MEMBER IS RECORDED. The state is shared: one person answers a
 * prestation enquiry on the band's behalf, so marking it handled marks it for
 * everybody. Shared state with no author answers the wrong question, though —
 * "has anybody dealt with this" matters much less than "who replied" — and
 * nullOnDelete keeps that answer readable after a member leaves the band.
 *
 * Guarded because RunPendingMigrations re-checks on every request.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('contact_messages', 'handled_at')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->timestamp('handled_at')->nullable();
            });
        }

        if (! Schema::hasColumn('contact_messages', 'handled_by_member_id')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->foreignId('handled_by_member_id')
                    ->nullable()
                    ->constrained('members')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('contact_messages', 'handled_by_member_id')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->dropConstrainedForeignId('handled_by_member_id');
            });
        }

        if (Schema::hasColumn('contact_messages', 'handled_at')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->dropColumn('handled_at');
            });
        }
    }
};
```

- [ ] **Step 4: Update the model**

`api/app/Models/ContactMessage.php` — replace the whole file:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A message somebody sent through the public contact form.
 *
 * Stored raw and escaped at output time. `handled_at` is what the committee
 * inbox reads: null means the item is still open.
 */
class ContactMessage extends Model
{
    /** @use HasFactory<\Database\Factories\ContactMessageFactory> */
    use HasFactory;

    protected $fillable = [
        'last_name',
        'first_name',
        'email',
        'subject',
        'message',
        'handled_at',
        'handled_by_member_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['handled_at' => 'datetime'];
    }

    /** Who marked this handled, or null while it is open — or after they left the band. */
    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'handled_by_member_id');
    }
}
```

- [ ] **Step 5: Write the factory**

`api/database/factories/ContactMessageFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\ContactMessage;
use App\Models\Member;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ContactMessage> */
class ContactMessageFactory extends Factory
{
    protected $model = ContactMessage::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'last_name' => $this->faker->lastName(),
            'first_name' => $this->faker->firstName(),
            'email' => $this->faker->safeEmail(),
            'subject' => $this->faker->sentence(4),
            'message' => $this->faker->paragraph(),
        ];
    }

    /** Already dealt with, by a named member. */
    public function handled(Member $by): static
    {
        return $this->state(fn () => [
            'handled_at' => now(),
            'handled_by_member_id' => $by->id,
        ]);
    }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageSchemaTest
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add api/database/migrations/2026_09_15_000001_add_handled_to_contact_messages.php api/database/factories/ContactMessageFactory.php api/app/Models/ContactMessage.php api/tests/Feature/ContactMessageSchemaTest.php
git commit -m "feat(api): record whether a contact message has been handled, and by whom"
```

---

## Task 2: The two permissions, and the grant that keeps TEST alive

This is the task the spec names as most likely to silently kill the feature. Do the migration test first and take it seriously.

**Files:**
- Modify: `api/app/Support/Permission.php`
- Create: `api/database/migrations/2026_09_15_000002_grant_message_permissions.php`
- Test: `api/tests/Feature/GrantMessagePermissionsTest.php`

**Interfaces:**
- Consumes: Task 1's migration ordering (this one must sort after it).
- Produces: `Permission::MessagesView` (`'messages.view'`) and `Permission::MessagesManage` (`'messages.manage'`); `direction` holds both, `committee` holds view.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/GrantMessagePermissionsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The permissions exist as data on a database that already had the roles.
 *
 * WHY THIS TEST IS THE IMPORTANT ONE. 2026_09_07_000001 seeds `direction` with
 * Permission::cases(), so a FRESH database picks both new tokens up for free
 * and every test here would pass without the grant migration existing at all.
 * TEST is not a fresh database: both roles are already there, that migration
 * returns early for a role that exists, and the result is a perfectly correct
 * feature that 403s for every single person. The third test below is the one
 * that fails when the grant migration is missing.
 */
class GrantMessagePermissionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_direction_may_read_and_manage_messages(): void
    {
        $this->assertTrue($this->roleHas('direction', Permission::MessagesView));
        $this->assertTrue($this->roleHas('direction', Permission::MessagesManage));
    }

    public function test_committee_may_read_messages_but_not_clear_them(): void
    {
        $this->assertTrue($this->roleHas('committee', Permission::MessagesView));
        $this->assertFalse($this->roleHas('committee', Permission::MessagesManage));
    }

    public function test_the_grant_reaches_roles_that_already_existed(): void
    {
        // Reproduces TEST: the roles are here, the permissions are not.
        $this->revoke('direction', Permission::MessagesView);
        $this->revoke('direction', Permission::MessagesManage);
        $this->revoke('committee', Permission::MessagesView);

        $this->runGrantMigration();

        $this->assertTrue($this->roleHas('direction', Permission::MessagesView));
        $this->assertTrue($this->roleHas('direction', Permission::MessagesManage));
        $this->assertTrue($this->roleHas('committee', Permission::MessagesView));
    }

    public function test_the_grant_is_safe_to_run_twice(): void
    {
        $this->runGrantMigration();
        $this->runGrantMigration();

        $this->assertSame(1, $this->grantCount('direction', Permission::MessagesView));
    }

    private function runGrantMigration(): void
    {
        (require database_path('migrations/2026_09_15_000002_grant_message_permissions.php'))->up();
    }

    private function roleId(string $key): int
    {
        return (int) DB::table('roles')->where('key', $key)->value('id');
    }

    private function roleHas(string $key, Permission $permission): bool
    {
        return $this->grantCount($key, $permission) > 0;
    }

    private function grantCount(string $key, Permission $permission): int
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', $permission->value)
            ->count();
    }

    private function revoke(string $key, Permission $permission): void
    {
        DB::table('role_permissions')
            ->where('role_id', $this->roleId($key))
            ->where('permission', $permission->value)
            ->delete();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=GrantMessagePermissionsTest
```

Expected: FAIL — `App\Support\Permission::MessagesView` does not exist.

- [ ] **Step 3: Add the enum cases**

Append to `api/app/Support/Permission.php`, inside the enum:

```php
    /**
     * Reading the committee inbox, and the messages the public has sent.
     *
     * `committee` holds this as its second permission: a prestation enquiry is
     * committee business, and somebody has to be able to read one.
     */
    case MessagesView = 'messages.view';

    /**
     * Marking a message handled, reopening it, and deleting it.
     *
     * SEPARATE FROM MessagesView for the same reason RegistrationsManage is
     * separate from RegistrationsView: the token that merely looks must not
     * carry the power to destroy. Binning a stranger's message is direction's
     * call, and `committee` deliberately does not hold this.
     */
    case MessagesManage = 'messages.manage';
```

- [ ] **Step 4: Write the grant migration**

`api/database/migrations/2026_09_15_000002_grant_message_permissions.php`:

```php
<?php

use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives `direction` both message permissions and `committee` the read.
 *
 * WHY THIS EXISTS AT ALL. 2026_09_07_000001 seeds `direction` with
 * Permission::cases(), so a fresh database needs nothing from this file. It
 * also returns early for a role that already exists — deliberately, because a
 * role's permissions become the committee's business once seeded and a re-sync
 * would undo their edits on the next deploy. TEST, QA and PROD all have both
 * roles already, so without this migration nobody holds either token and every
 * screen in the committee inbox answers 403 to everybody, with the code
 * perfectly correct.
 *
 * WHY THAT IS NOT AN OVERRIDE. Neither token existed when the committee last
 * looked at these roles, so nobody can have deliberately removed one. Adding a
 * permission the enum had no case for is not reversing a decision. Same
 * reasoning as 2026_09_10_000003.
 *
 * insertOrIgnore against the (role_id, permission) primary key: safe to re-run,
 * and safe against a committee that has granted it themselves in the meantime.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->grant('direction', Permission::MessagesView);
        $this->grant('direction', Permission::MessagesManage);
        $this->grant('committee', Permission::MessagesView);
    }

    /**
     * Removes only the three grants, never a role.
     *
     * Same reasoning as 2026_09_07_000001's own down(): this migration created
     * three rows, and those are the only rows it may take back.
     */
    public function down(): void
    {
        $this->revoke('direction', Permission::MessagesView);
        $this->revoke('direction', Permission::MessagesManage);
        $this->revoke('committee', Permission::MessagesView);
    }

    private function grant(string $key, Permission $permission): void
    {
        $roleId = DB::table('roles')->where('key', $key)->value('id');

        // A database without the role is one where 2026_09_07_000001 has not
        // run, or where the committee deleted it. Neither is this migration's
        // problem to repair.
        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')->insertOrIgnore([
            'role_id' => $roleId,
            'permission' => $permission->value,
        ]);
    }

    private function revoke(string $key, Permission $permission): void
    {
        $roleId = DB::table('roles')->where('key', $key)->value('id');

        if ($roleId === null) {
            return;
        }

        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission', $permission->value)
            ->delete();
    }
};
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=GrantMessagePermissionsTest
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Mutation-test the important one**

Comment out the three `grant()` calls in `up()`, re-run, and confirm `test_the_grant_reaches_roles_that_already_existed` FAILS. Restore them. A test that passes with the migration gutted is not protecting anything.

- [ ] **Step 7: Run the whole suite**

`ClosedSetsTest` and `EffectivePermissionsTest` both walk the permission enum and may need the new cases acknowledged.

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS. If either closed-set test fails, it is telling you about a list that must name every permission — extend it rather than relaxing it.

- [ ] **Step 8: Commit**

```bash
git add api/app/Support/Permission.php api/database/migrations/2026_09_15_000002_grant_message_permissions.php api/tests/Feature/GrantMessagePermissionsTest.php
git commit -m "feat(api): split reading the committee inbox from clearing it"
```

---

## Task 3: The resource and the entity-tag facet

**Files:**
- Create: `api/app/Http/Resources/ContactMessageResource.php`
- Modify: `api/app/Support/EntityTag.php` (`FACETS` const and `state()`)
- Test: `api/tests/Feature/ContactMessageTagTest.php`

**Interfaces:**
- Consumes: `ContactMessage` from Task 1.
- Produces: `ContactMessageResource` with keys `id`, `lastName`, `firstName`, `email`, `subject`, `message`, `receivedAt`, `handledAt`, `handledBy`; the `contact_message` facet, readable via `EntityTag::compute('contact_message', $message)` and `$this->ifMatch('contact_message', $message)` in tests.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/ContactMessageTagTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Support\EntityTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageTagTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_facet_can_be_computed(): void
    {
        $message = ContactMessage::factory()->create();

        $this->assertNotNull(EntityTag::compute('contact_message', $message));
    }

    public function test_the_facet_is_registered(): void
    {
        $this->assertContains('contact_message', EntityTag::facets());
    }

    public function test_two_messages_have_different_tags(): void
    {
        // The hazard this pins: every message stored before this release has
        // `updated_at IS NULL`, so a tag computed over timestamps alone would
        // be identical across all of them, and If-Match would let a write
        // aimed at one succeed against any other. Rendering the resource
        // carries the id, so it cannot.
        $first = ContactMessage::factory()->create(['updated_at' => null]);
        $second = ContactMessage::factory()->create(['updated_at' => null]);

        $this->assertNotSame(
            EntityTag::compute('contact_message', $first),
            EntityTag::compute('contact_message', $second),
        );
    }

    public function test_handling_a_message_moves_its_tag(): void
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->create();

        $before = EntityTag::compute('contact_message', $message);

        $message->update(['handled_at' => now(), 'handled_by_member_id' => $camille->id]);

        $this->assertNotSame($before, EntityTag::compute('contact_message', $message));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageTagTest
```

Expected: FAIL — `Undefined array key "contact_message"` out of `EntityTag::of()`/`FACETS`.

- [ ] **Step 3: Write the resource**

`api/app/Http/Resources/ContactMessageResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Models\ContactMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One message from the public contact form, as the committee reads it.
 *
 * The sender's own words travel raw: they were stored raw and are escaped at
 * output time by React, which escapes by default. Nothing here is translated —
 * a stranger's message is content, and `handledBy` is a person's name.
 *
 * @mixin ContactMessage
 */
class ContactMessageResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'lastName' => $this->last_name,
            'firstName' => $this->first_name,
            'email' => $this->email,
            'subject' => $this->subject,
            'message' => $this->message,
            /** When the visitor sent it. */
            'receivedAt' => $this->created_at?->toIso8601String(),
            /** When somebody dealt with it, or null while it is still open. */
            'handledAt' => $this->handled_at?->toIso8601String(),
            /** Who dealt with it. Null while open, and null again if that member has since left the band. */
            'handledBy' => $this->whenLoaded(
                'handledBy',
                fn () => $this->handledBy?->first_name.' '.$this->handledBy?->last_name,
                null,
            ),
        ];
    }
}
```

- [ ] **Step 4: Register the facet**

In `api/app/Support/EntityTag.php`, add to the `FACETS` const:

```php
        'contact_message' => 'contactMessage',
```

and add an arm to `state()`, before the `default`:

```php
            'contact_message' => (new ContactMessageResource($model->load('handledBy')))->toArray(self::bare()),
```

plus the import `use App\Http\Resources\ContactMessageResource;`.

The relation is loaded here because the resource publishes it, exactly as the `member` and `registration` arms load theirs — a change of who handled a message must move the tag.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter="ContactMessageTagTest|ConditionalWriteTest"
```

Expected: PASS. `ConditionalWriteTest::test_every_facet_can_be_computed` walks `FACETS` and will fail if `state()` has no arm for the new name.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Resources/ContactMessageResource.php api/app/Support/EntityTag.php api/tests/Feature/ContactMessageTagTest.php
git commit -m "feat(api): tag a contact message so two people cannot clear it at once"
```

---

## Task 4: Reading the messages

**Files:**
- Create: `api/app/Http/Controllers/Api/ContactMessageController.php`
- Modify: `api/routes/api.php`
- Test: `api/tests/Feature/ContactMessageReadTest.php`

**Interfaces:**
- Consumes: `ContactMessageResource`, `Permission::MessagesView` from Tasks 2 and 3.
- Produces: `GET /api/v1/contact-messages` (operationId `contactMessage.index`) and `GET /api/v1/contact-messages/{contactMessage}` (`contactMessage.show`), the second handing out the `contact_message` ETag.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/ContactMessageReadTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageReadTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // 401 rather than 403, so a caller is told to log in rather than told
        // they are not allowed — see the note in CLAUDE.md on pairing
        // auth:sanctum with permission:.
        $this->getJson('/api/v1/contact-messages')->assertStatus(401);
    }

    public function test_a_plain_member_is_refused(): void
    {
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)
            ->getJson('/api/v1/contact-messages')
            ->assertStatus(403);
    }

    public function test_the_committee_reads_the_messages(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/contact-messages')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3);
    }

    public function test_the_newest_message_comes_first(): void
    {
        $old = ContactMessage::factory()->create(['created_at' => now()->subDays(3)]);
        $new = ContactMessage::factory()->create(['created_at' => now()]);

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/contact-messages')
            ->assertOk()
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.1.id', $old->id);
    }

    public function test_the_list_can_be_filtered_to_open_or_handled(): void
    {
        $camille = $this->committeeMember();
        $open = ContactMessage::factory()->create();
        $done = ContactMessage::factory()->handled($camille)->create();

        $this->actingAsMember($camille)
            ->getJson('/api/v1/contact-messages?handled=0')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $open->id);

        $this->actingAsMember($camille)
            ->getJson('/api/v1/contact-messages?handled=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $done->id);
    }

    public function test_reading_one_message_hands_out_its_tag(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson("/api/v1/contact-messages/{$message->id}")
            ->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('data.message', $message->message);
    }

    /** Holds messages.view through the `committee` role, and nothing more. */
    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageReadTest
```

Expected: FAIL with 404s — the routes do not exist.

- [ ] **Step 3: Write the controller**

`api/app/Http/Controllers/Api/ContactMessageController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContactMessageResource;
use App\Models\ContactMessage;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Committee inbox', 'The messages the public has sent, and whether anybody has dealt with them.', weight: 45)]
class ContactMessageController extends Controller
{
    /**
     * List the messages the public has sent.
     *
     * Newest first. `?handled=0` returns only what is still open — the same
     * set the inbox shows — and `?handled=1` only what has been dealt with.
     * Omit the parameter for everything.
     *
     * Paginated: read `data` for the rows and `meta.total` for the count.
     */
    #[Endpoint(operationId: 'contactMessage.index')]
    public function index(Request $request): AnonymousResourceCollection
    {
        $messages = ContactMessage::query()
            ->with('handledBy')
            // Newest first, with the id as a tiebreaker: created_at has
            // one-second resolution here, and two messages sent in the same
            // second would otherwise page unstably.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->when($request->has('handled'), fn ($query) => $request->boolean('handled')
                ? $query->whereNotNull('handled_at')
                : $query->whereNull('handled_at'))
            ->get();

        return ContactMessageResource::collection($messages);
    }

    /**
     * Read one message.
     *
     * This is the read that hands out the `ETag` the two writes below require:
     * a collection hands out none. A screen reads the message as it opens it
     * and writes with that read's tag, never a fresher one.
     */
    #[Endpoint(operationId: 'contactMessage.show')]
    public function show(ContactMessage $contactMessage): ContactMessageResource
    {
        return new ContactMessageResource($contactMessage->load('handledBy'));
    }
}
```

- [ ] **Step 4: Add the routes**

In `api/routes/api.php`, inside the authenticated group, after the registrations block:

```php
    // THE COMMITTEE INBOX. `committee` holds messages.view as its second
    // permission — a prestation enquiry is committee business and somebody has
    // to be able to read one — so reading is all this token grants.
    Route::middleware('permission:messages.view')->group(function () {
        Route::get('/contact-messages', [ContactMessageController::class, 'index']);

        // The read that hands out the tag the writes below require. Gated with
        // the readers rather than the managers, unlike /registrations/{id}:
        // this one is also how a screen displays the message body, so the
        // people who merely read need it too.
        Route::get('/contact-messages/{contactMessage}', [ContactMessageController::class, 'show'])
            ->middleware('etag:contact_message');
    });
```

plus the import `use App\Http\Controllers\Api\ContactMessageController;`.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageReadTest
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Controllers/Api/ContactMessageController.php api/routes/api.php api/tests/Feature/ContactMessageReadTest.php
git commit -m "feat(api): let the committee read the messages the public sent"
```

---

## Task 5: Handling and deleting a message

**Files:**
- Modify: `api/app/Http/Controllers/Api/ContactMessageController.php`
- Modify: `api/routes/api.php`
- Create: `api/app/Http/Requests/HandleContactMessageRequest.php`
- Test: `api/tests/Feature/ContactMessageManageTest.php`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: `PATCH /api/v1/contact-messages/{contactMessage}` (`contactMessage.handle`) taking `{handled: bool}`, and `DELETE` (`contactMessage.destroy`). Both require `If-Match`.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/ContactMessageManageTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactMessageManageTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_committee_may_read_but_not_clear(): void
    {
        // The whole point of the split: `committee` sees the enquiry and
        // cannot bin it. If this passes, the two tokens have collapsed into
        // one somewhere.
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->committeeMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true],
                $this->ifMatch('contact_message', $message))
            ->assertStatus(403);
    }

    public function test_direction_marks_a_message_handled(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($dominique)
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true],
                $this->ifMatch('contact_message', $message))
            ->assertOk()
            ->assertJsonPath('data.handledBy', 'Dominique Direction');

        $message->refresh();
        $this->assertNotNull($message->handled_at);
        $this->assertSame($dominique->id, $message->handled_by_member_id);
    }

    public function test_reopening_clears_both_columns(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->handled($dominique)->create();

        $this->actingAsMember($dominique)
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => false],
                $this->ifMatch('contact_message', $message))
            ->assertOk();

        $message->refresh();
        $this->assertNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_a_write_without_if_match_is_refused(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => true])
            ->assertStatus(428);
    }

    public function test_a_stale_tag_is_refused(): void
    {
        $dominique = $this->directionMember();
        $message = ContactMessage::factory()->create();
        $stale = $this->ifMatch('contact_message', $message);

        // Somebody else got there first.
        $message->update(['handled_at' => now(), 'handled_by_member_id' => $dominique->id]);

        $this->actingAsMember($dominique)
            ->deleteJson("/api/v1/contact-messages/{$message->id}", [], $stale)
            ->assertStatus(412);

        $this->assertDatabaseHas('contact_messages', ['id' => $message->id]);
    }

    public function test_direction_deletes_a_message(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->deleteJson("/api/v1/contact-messages/{$message->id}", [],
                $this->ifMatch('contact_message', $message))
            ->assertNoContent();

        $this->assertDatabaseMissing('contact_messages', ['id' => $message->id]);
    }

    public function test_handled_must_be_a_boolean(): void
    {
        $message = ContactMessage::factory()->create();

        $this->actingAsMember($this->directionMember())
            ->patchJson("/api/v1/contact-messages/{$message->id}", ['handled' => 'yes please'],
                $this->ifMatch('contact_message', $message))
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed');
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }

    private function directionMember(): Member
    {
        $dominique = Member::factory()->named('Dominique', 'Direction', 'dominique')->create();
        $dominique->roles()->attach(Role::where('key', 'direction')->sole());

        return $dominique;
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageManageTest
```

Expected: FAIL with 405/404 — the routes do not exist.

- [ ] **Step 3: Write the form request**

`api/app/Http/Requests/HandleContactMessageRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Marking a message handled, or putting it back.
 *
 * `required` rather than defaulting to true: a PATCH with an empty body would
 * otherwise silently handle the message, and this endpoint is also how one is
 * reopened.
 */
class HandleContactMessageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['handled' => ['required', 'boolean']];
    }
}
```

- [ ] **Step 4: Add the two actions**

Append to `ContactMessageController`:

```php
    /**
     * Mark a message handled, or put it back.
     *
     * `{"handled": true}` stamps who did it and when; `{"handled": false}`
     * clears both. Reopening is not an error — a message marked handled by
     * mistake is a normal thing to correct.
     *
     * Requires `If-Match` with the tag from reading this message. Without one
     * the request answers `428`; with a stale one, `412`.
     */
    #[Endpoint(operationId: 'contactMessage.handle')]
    public function handle(HandleContactMessageRequest $request, ContactMessage $contactMessage): ContactMessageResource
    {
        $handled = $request->boolean('handled');

        $contactMessage->update([
            'handled_at' => $handled ? now() : null,
            'handled_by_member_id' => $handled ? $request->user()->id : null,
        ]);

        return new ContactMessageResource($contactMessage->load('handledBy'));
    }

    /**
     * Delete a message.
     *
     * For what the form catches that the spam guard did not. Requires
     * `If-Match`, so a message somebody else has just dealt with cannot be
     * deleted by a screen that has not seen that yet.
     */
    #[Endpoint(operationId: 'contactMessage.destroy')]
    public function destroy(ContactMessage $contactMessage): \Illuminate\Http\Response
    {
        $contactMessage->delete();

        return response()->noContent();
    }
```

plus the imports `use App\Http\Requests\HandleContactMessageRequest;`.

- [ ] **Step 5: Add the routes**

In `api/routes/api.php`, after the `messages.view` group:

```php
    // Clearing the inbox, which is a different act from reading it and a
    // different set of people: `committee` sees a prestation enquiry, and
    // binning a stranger's message is direction's call.
    Route::middleware('permission:messages.manage')->group(function () {
        Route::patch('/contact-messages/{contactMessage}', [ContactMessageController::class, 'handle'])
            ->middleware('etag:contact_message');
        Route::delete('/contact-messages/{contactMessage}', [ContactMessageController::class, 'destroy'])
            ->middleware('etag:contact_message');
    });
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=ContactMessageManageTest
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Mutation-test the permission split**

Change the `messages.manage` route group to `permission:messages.view` and confirm `test_the_committee_may_read_but_not_clear` FAILS. Restore it. That test is the only thing standing between the committee and a delete button.

- [ ] **Step 8: Commit**

```bash
git add api/app/Http/Controllers/Api/ContactMessageController.php api/app/Http/Requests/HandleContactMessageRequest.php api/routes/api.php api/tests/Feature/ContactMessageManageTest.php
git commit -m "feat(api): mark a contact message handled, or delete it"
```

---

## Task 6: The inbox itself

**Files:**
- Create: `api/app/Support/Inbox/InboxItem.php`
- Create: `api/app/Support/Inbox/InboxSource.php`
- Create: `api/app/Support/Inbox/InboxRegistry.php`
- Create: `api/app/Support/Inbox/ContactMessageSource.php`
- Test: `api/tests/Feature/InboxRegistryTest.php`

**Interfaces:**
- Consumes: `ContactMessage`, `Permission::MessagesView`.
- Produces: `InboxRegistry::openFor(Member $member): Collection` of `InboxItem`, and `InboxRegistry::countsFor(Member $member): array<string, int>` keyed by kind.

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/InboxRegistryTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use App\Support\Inbox\InboxRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InboxRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_open_message_is_an_inbox_item(): void
    {
        $message = ContactMessage::factory()->create(['first_name' => 'Jean', 'last_name' => 'Dupont']);

        $items = app(InboxRegistry::class)->openFor($this->committeeMember());

        $this->assertCount(1, $items);
        $this->assertSame('contactMessage', $items->first()->kind);
        $this->assertStringContainsString('Jean Dupont', $items->first()->title);
        $this->assertSame("/contact-messages?open={$message->id}", $items->first()->path);
    }

    public function test_a_handled_message_leaves_the_inbox(): void
    {
        $camille = $this->committeeMember();
        ContactMessage::factory()->handled($camille)->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($camille));
    }

    public function test_a_member_without_the_permission_sees_nothing(): void
    {
        // Filtered, never refused: the nav entry is already hidden from them,
        // and the endpoint must stay safe to call unconditionally.
        ContactMessage::factory()->count(2)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->assertCount(0, app(InboxRegistry::class)->openFor($perrine));
        $this->assertSame([], app(InboxRegistry::class)->countsFor($perrine));
    }

    public function test_counts_are_keyed_by_kind(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->assertSame(
            ['contactMessage' => 3],
            app(InboxRegistry::class)->countsFor($this->committeeMember()),
        );
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=InboxRegistryTest
```

Expected: FAIL — `Class "App\Support\Inbox\InboxRegistry" not found`.

- [ ] **Step 3: Write the item and the interface**

`api/app/Support/Inbox/InboxItem.php`:

```php
<?php

namespace App\Support\Inbox;

use Carbon\CarbonInterface;

/**
 * One thing somebody has to deal with.
 *
 * A value object with no table behind it. The inbox is computed from its
 * sources at read time, so an item exists only for as long as it takes to
 * answer one request — which is what makes it impossible for the inbox to
 * drift from the rows it describes.
 */
final readonly class InboxItem
{
    public function __construct(
        public string $kind,
        public int $id,
        public string $title,
        public string $summary,
        public CarbonInterface $arrivedAt,
        public string $path,
    ) {}
}
```

`api/app/Support/Inbox/InboxSource.php`:

```php
<?php

namespace App\Support\Inbox;

use App\Support\Permission;
use Illuminate\Support\Collection;

/**
 * Something that can put work in the committee's inbox.
 *
 * ADDING A SOURCE IS A CLASS AND A REGISTRY LINE, deliberately — see the
 * design doc for why the inbox is computed rather than materialised. A source
 * owns its own definition of "open"; nothing here stores state.
 */
interface InboxSource
{
    /** A stable machine name. It reaches the SPA and is translated there. */
    public function kind(): string;

    /** What a member must hold to see, and act on, items of this kind. */
    public function permission(): Permission;

    /** @return Collection<int, InboxItem> */
    public function openItems(): Collection;

    /** The same set, counted, without building the items. */
    public function openCount(): int;
}
```

- [ ] **Step 4: Write the contact-message source**

`api/app/Support/Inbox/ContactMessageSource.php`:

```php
<?php

namespace App\Support\Inbox;

use App\Models\ContactMessage;
use App\Support\Permission;
use Illuminate\Support\Collection;

/**
 * Messages from the public contact form that nobody has dealt with yet.
 *
 * The first inbox source, and the reason the inbox exists: these rows have
 * been accumulating since 2026-07-23 with no route that could read one.
 */
final class ContactMessageSource implements InboxSource
{
    public function kind(): string
    {
        return 'contactMessage';
    }

    public function permission(): Permission
    {
        return Permission::MessagesView;
    }

    /** @return Collection<int, InboxItem> */
    public function openItems(): Collection
    {
        return ContactMessage::query()
            ->whereNull('handled_at')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ContactMessage $message) => new InboxItem(
                kind: $this->kind(),
                id: $message->id,
                title: trim($message->first_name.' '.$message->last_name),
                // The subject when there is one, else the opening of the
                // message: a row with no second line reads as an empty item.
                summary: $message->subject ?: str($message->message)->limit(120)->value(),
                arrivedAt: $message->created_at,
                // Deep-links to the archive with this message already open, so
                // the inbox is a way through to the work rather than a
                // second place to do it.
                path: "/contact-messages?open={$message->id}",
            ));
    }

    public function openCount(): int
    {
        return ContactMessage::query()->whereNull('handled_at')->count();
    }
}
```

- [ ] **Step 5: Write the registry**

`api/app/Support/Inbox/InboxRegistry.php`:

```php
<?php

namespace App\Support\Inbox;

use App\Models\Member;
use Illuminate\Support\Collection;

/**
 * Every inbox source, filtered to what one member may act on.
 *
 * FILTERS, NEVER REFUSES. A member holding none of the relevant permissions
 * gets an empty inbox rather than a 403: the nav entry is already hidden from
 * them, and the summary endpoint has to stay safe to call on every navigation
 * without the client first working out whether it is allowed to.
 *
 * The source list is hard-coded rather than injected. There is one source, a
 * container binding would be indirection with nothing on the other end of it,
 * and a second source is one line here.
 */
class InboxRegistry
{
    /** @return list<InboxSource> */
    private function sources(): array
    {
        return [new ContactMessageSource];
    }

    /** @return list<InboxSource> */
    private function sourcesFor(Member $member): array
    {
        return array_values(array_filter(
            $this->sources(),
            fn (InboxSource $source) => $member->hasPermission($source->permission()),
        ));
    }

    /**
     * Everything open that this member may act on, newest first across all
     * sources.
     *
     * @return Collection<int, InboxItem>
     */
    public function openFor(Member $member): Collection
    {
        return collect($this->sourcesFor($member))
            ->flatMap(fn (InboxSource $source) => $source->openItems())
            ->sortByDesc(fn (InboxItem $item) => $item->arrivedAt)
            ->values();
    }

    /**
     * How many are open per kind, for the nav badge.
     *
     * @return array<string, int>
     */
    public function countsFor(Member $member): array
    {
        $counts = [];

        foreach ($this->sourcesFor($member) as $source) {
            $counts[$source->kind()] = $source->openCount();
        }

        return $counts;
    }
}
```

- [ ] **Step 6: Nothing to check here**

`InboxRegistry` calls `$member->hasPermission(Permission $p)`, which is `api/app/Models/Member.php:122` and is the same method `App\Http\Middleware\RequirePermission` calls at line 45. Verified during planning; the registry and the middleware ask the same question through the same code, which is what keeps the inbox's filtering and the routes' enforcement from disagreeing.

- [ ] **Step 7: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=InboxRegistryTest
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add api/app/Support/Inbox api/tests/Feature/InboxRegistryTest.php
git commit -m "feat(api): compute the committee inbox from its sources"
```

---

## Task 7: The inbox endpoints

**Files:**
- Create: `api/app/Http/Controllers/Api/InboxController.php`
- Create: `api/app/Http/Resources/InboxItemResource.php`
- Modify: `api/routes/api.php`
- Test: `api/tests/Feature/InboxEndpointTest.php`

**Interfaces:**
- Consumes: `InboxRegistry` from Task 6.
- Produces: `GET /api/v1/inbox` (`inbox.index`, enveloped list) and `GET /api/v1/inbox/summary` (`inbox.summary`, `{total, counts}`).

- [ ] **Step 1: Write the failing test**

`api/tests/Feature/InboxEndpointTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InboxEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_is_refused(): void
    {
        $this->getJson('/api/v1/inbox')->assertStatus(401);
        $this->getJson('/api/v1/inbox/summary')->assertStatus(401);
    }

    public function test_the_inbox_lists_open_items(): void
    {
        ContactMessage::factory()->count(2)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.kind', 'contactMessage');
    }

    public function test_a_member_without_permission_gets_an_empty_inbox_not_a_refusal(): void
    {
        ContactMessage::factory()->count(2)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_summary_counts_by_kind(): void
    {
        ContactMessage::factory()->count(3)->create();

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox/summary')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('counts.contactMessage', 3);
    }

    public function test_the_summary_is_empty_for_a_member_who_may_see_nothing(): void
    {
        ContactMessage::factory()->count(3)->create();
        $perrine = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->actingAsMember($perrine)
            ->getJson('/api/v1/inbox/summary')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=InboxEndpointTest
```

Expected: FAIL with 404.

- [ ] **Step 3: Write the resource**

`api/app/Http/Resources/InboxItemResource.php`:

```php
<?php

namespace App\Http\Resources;

use App\Support\Inbox\InboxItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One item in the committee inbox.
 *
 * `kind` is a machine name and stays English; the SPA translates it. `title`
 * and `summary` are content — a stranger's name and their own words — and are
 * rendered verbatim.
 *
 * @mixin InboxItem
 */
class InboxItemResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** Which source this came from, e.g. `contactMessage`. */
            'kind' => $this->kind,
            /** The id of the underlying row, unique only within its kind. */
            'id' => $this->id,
            'title' => $this->title,
            'summary' => $this->summary,
            'arrivedAt' => $this->arrivedAt->toIso8601String(),
            /** Where to go to deal with it, relative to the site root. */
            'path' => $this->path,
        ];
    }
}
```

- [ ] **Step 4: Write the controller**

`api/app/Http/Controllers/Api/InboxController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\InboxItemResource;
use App\Support\Inbox\InboxRegistry;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Committee inbox', 'The messages the public has sent, and whether anybody has dealt with them.', weight: 45)]
class InboxController extends Controller
{
    public function __construct(private readonly InboxRegistry $registry) {}

    /**
     * Everything open that you may act on.
     *
     * Newest first across every kind. Filtered by permission rather than
     * refused: a member who may act on nothing gets an empty list, so this is
     * safe to call for anybody with a session.
     */
    #[Endpoint(operationId: 'inbox.index')]
    public function index(Request $request): AnonymousResourceCollection
    {
        return InboxItemResource::collection($this->registry->openFor($request->user()));
    }

    /**
     * How much is waiting, for the nav badge.
     *
     * Deliberately not a list, so it is not enveloped: this is called on
     * navigation and should stay as small as an answer can be.
     */
    #[Endpoint(operationId: 'inbox.summary')]
    public function summary(Request $request): JsonResponse
    {
        $counts = $this->registry->countsFor($request->user());

        return response()->json([
            /** Open items across every kind you may act on. */
            'total' => array_sum($counts),
            /** The same, broken down by kind. Absent kinds are ones you may not see. */
            'counts' => (object) $counts,
        ]);
    }
}
```

- [ ] **Step 5: Add the routes**

In `api/routes/api.php`, in the authenticated group, ABOVE the `messages.view` block:

```php
    // THE INBOX NEEDS A SESSION AND NOTHING MORE. It filters by permission
    // rather than refusing, so the nav can ask for the count without first
    // working out whether it is allowed to — see InboxRegistry.
    //
    // `/inbox/summary` is written before `/inbox/{anything}` would be, if one
    // ever exists; there is no dynamic segment here today and adding one must
    // not shadow this.
    Route::get('/inbox/summary', [InboxController::class, 'summary']);
    Route::get('/inbox', [InboxController::class, 'index']);
```

plus `use App\Http\Controllers\Api\InboxController;`.

- [ ] **Step 6: Run the tests and watch them pass**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test --filter=InboxEndpointTest
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/InboxController.php api/app/Http/Resources/InboxItemResource.php api/routes/api.php api/tests/Feature/InboxEndpointTest.php
git commit -m "feat(api): serve the committee inbox and its count"
```

---

## Task 8: Correct the lie, and regenerate

**Files:**
- Modify: `api/app/Http/Controllers/Api/ContactController.php`
- Modify: `api/openapi.json` (generated)
- Modify: `web/src/api/generated/**` (generated)
- Test: `api/tests/Feature/ContactEndpointTest.php` (check it still passes)

- [ ] **Step 1: Correct the annotation**

In `ContactController`, replace the `#[Response]` attribute:

```php
    #[Response(200, 'Stored for the committee to read in their inbox. Nothing is sent to the address given.')]
```

and in the docblock, replace the paragraph beginning "Stores the message for the committee to read" with:

```
     * Stores the message and answers `{"ok": true}`. Nothing is sent to the
     * address given, and nothing is emailed to the committee — they read it in
     * the inbox at `GET /api/v1/inbox`.
```

- [ ] **Step 2: Regenerate**

```bash
npm run openapi && npm run generate:api
```

- [ ] **Step 3: Confirm the new operations landed**

```bash
grep -c "contactMessage\|inbox" api/openapi.json
```

Expected: a non-zero count naming `contactMessage.index`, `contactMessage.show`, `contactMessage.handle`, `contactMessage.destroy`, `inbox.index`, `inbox.summary`.

- [ ] **Step 4: Run both suites**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS, including `DocsTest`, `DeclaredCodesTest` and `EmittedCodesTest`.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/ContactController.php api/openapi.json web/src/api/generated
git commit -m "docs(api): say what the contact endpoint actually does"
```

---

## Task 9: Mock handlers

**Files:**
- Modify: `web/src/mocks/handlers.ts`

**Interfaces:**
- Produces: MSW handlers for all six routes, both lists enveloped through the existing `collection()` helper.

- [ ] **Step 1: Add a seeded fixture and the handlers**

In `web/src/mocks/handlers.ts`, alongside the other fixtures, add an array of three contact messages (two open, one handled) and handlers for:

- `GET /api/v1/inbox` → `collection(openMessages.map(toInboxItem), request)`
- `GET /api/v1/inbox/summary` → `HttpResponse.json({ total: openMessages.length, counts: { contactMessage: openMessages.length } })`
- `GET /api/v1/contact-messages` → `collection(messages, request)`, honouring `?handled=0|1`
- `GET /api/v1/contact-messages/:id` → the row, with an `ETag` header
- `PATCH /api/v1/contact-messages/:id` → flips `handledAt`/`handledBy`, returns the row
- `DELETE /api/v1/contact-messages/:id` → 204

Both collections must go through `collection()` — it mirrors `PaginatesCollections`, clamping included, and a hand-rolled `{data, meta}` here would drift from the middleware.

- [ ] **Step 2: Run the mocked app and look at it**

```bash
npm run dev:mock
```

Visit `/contact-messages` and `/inbox` — both 404 until Tasks 10 and 11, which is expected. Confirm in the network tab that the six routes answer rather than falling through to the catch-all.

- [ ] **Step 3: Commit**

```bash
git add web/src/mocks/handlers.ts
git commit -m "test(web): mock the committee inbox endpoints"
```

---

## Task 10: The contact messages archive

**Files:**
- Create: `web/src/pages/ContactMessages.tsx`
- Create: `web/src/pages/ContactMessages.test.tsx`
- Modify: `web/src/routes.tsx`
- Modify: `web/src/i18n/fr.ts`

**Interfaces:**
- Consumes: the generated hooks `useContactMessageIndex`, `contactMessageShow`, `contactMessageHandle`, `contactMessageDestroy`.
- Produces: the route `/contact-messages`, reading `?open=<id>` to expand one message on arrival (the inbox deep-links to it).

- [ ] **Step 1: Write the failing test**

`web/src/pages/ContactMessages.test.tsx` — cover, at minimum:

```tsx
it("lists the messages newest first", async () => { /* … */ });
it("renders an empty state when nothing has been sent", async () => { /* … */ });
it("expands the message named by ?open=", async () => { /* … */ });
it("hides the handle and delete controls from someone with only messages.view", async () => { /* … */ });
it("marks a message handled and shows who did it", async () => { /* … */ });
```

Follow `web/src/pages/Members.test.tsx` for the render harness — it already wires the session provider, the query client and MSW.

- [ ] **Step 2: Run it and watch it fail**

```powershell
npm run test:web -- ContactMessages
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the page**

Model it on `web/src/pages/Members.tsx`:

- Cards below `md`, a table from `md` up. **No bare tables on phones** — this band's phones are 390px, and #89 was exactly this bug on the planning.
- Read rows with `rowsOf<ContactMessageResource>(query.data)` and the count with `totalOf`.
- Expanding a row calls `contactMessageShow(id)`, and the response's `ETag` is captured with `entityTagOf` from `web/src/api/ifMatch.ts`. The handle and delete mutations send it back with `ifMatch(tag)`. **Never a fresher tag** — the point is that the write is checked against what the person actually read.
- Gate the handle and delete controls on `can("messages.manage")` from `useSession()`. The route itself is guarded on `messages.view`, so a committee member reaches the page and sees no controls.
- Delete takes a plain `window.confirm`-style dialog using the existing UI primitives, not `ConfirmByTypingName` — that ceremony is for destroying a member.
- A `mailto:` link on the sender's address, so replying is one tap.

- [ ] **Step 4: Add the route**

In `web/src/routes.tsx`, beside the `/members` guard:

```tsx
          {/* The inbox's archive for one source: open and handled alike.
              messages.view, because reading is what `committee` holds — the
              controls inside answer to messages.manage instead. */}
          <Route element={<RequirePermission permission="messages.view" />}>
            <Route path="/contact-messages" element={<ContactMessages />} />
          </Route>
```

- [ ] **Step 5: Add the French copy**

In `web/src/i18n/fr.ts`, add the page's strings: the heading, the open/handled filter labels, "Marquer comme traité", "Rouvrir", "Supprimer", "Traité par {name}, le {date}", and an empty state that reads like the normal case rather than an error.

- [ ] **Step 6: Run the tests and watch them pass**

```powershell
npm run test:web -- ContactMessages
```

Expected: PASS.

- [ ] **Step 7: Look at the page**

A green suite over a broken page is this project's characteristic failure. Run `npm run dev:mock`, open `/contact-messages` at 1280 and at 390, and confirm with a screenshot that nothing overflows and the expanded message is readable.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/ContactMessages.tsx web/src/pages/ContactMessages.test.tsx web/src/routes.tsx web/src/i18n/fr.ts
git commit -m "feat(web): a screen for the messages the public has sent"
```

---

## Task 11: The inbox screen and the nav badge

**Files:**
- Create: `web/src/pages/Inbox.tsx`
- Create: `web/src/pages/Inbox.test.tsx`
- Modify: `web/src/routes.tsx`
- Modify: `web/src/components/Layout.tsx` (`DIRECTION_NAV`, line 44)
- Modify: `web/src/i18n/fr.ts`

- [ ] **Step 1: Write the failing test**

`web/src/pages/Inbox.test.tsx`:

```tsx
it("lists open items newest first", async () => { /* … */ });
it("links each item to where it is dealt with", async () => { /* … */ });
it("renders a calm empty state when nothing is waiting", async () => { /* … */ });
it("shows no badge when the count is zero", async () => { /* … */ });
```

- [ ] **Step 2: Run it and watch it fail**

```powershell
npm run test:web -- Inbox
```

- [ ] **Step 3: Write the page and the nav entry**

`Inbox.tsx` reads `useInboxIndex()` and renders items grouped by kind, each linking to `item.path`. Translate `kind` through `web/src/i18n/` — never render the machine name.

In `Layout.tsx`, add to `DIRECTION_NAV`:

```tsx
  { to: "/inbox", label: "Boîte de réception", permission: "messages.view" },
```

The badge reads `useInboxSummary()`. **It must not poll.** Refresh it on navigation and invalidate its query key from the handle and delete mutations in Task 10. A timer against this shared host, for a number that changes a few times a month, would cost every member a request a minute.

Route it in `routes.tsx` under `RequireSession` — the endpoint filters rather than refuses, but the nav only offers it to people who hold the permission, so `RequirePermission permission="messages.view"` is the honest guard and keeps the page consistent with its entry.

- [ ] **Step 4: Run the tests and watch them pass**

```powershell
npm run test:web -- Inbox
```

- [ ] **Step 5: Mutation-test the badge**

Make `countsFor` return an empty array unconditionally in the API and confirm a test fails. If none does, the badge is asserted by nothing.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Inbox.tsx web/src/pages/Inbox.test.tsx web/src/routes.tsx web/src/components/Layout.tsx web/src/i18n/fr.ts
git commit -m "feat(web): the committee inbox, and a count in the nav"
```

---

## Task 12: Verification and the pull request

- [ ] **Step 1: The full local gate**

```bash
npm run check
```

```bash
MSYS_NO_PATHCONV=1 docker compose exec -w /var/www/html/_api web php artisan test
```

Both must be green. Fix, do not skip.

- [ ] **Step 2: Parity check against the built artifact**

```bash
npm run build && npm run smoke
```

Expected: 9 checks pass. This is where a route that works under Vite and not under Apache shows up.

- [ ] **Step 3: Render every affected route and look**

With `npm run dev:mock`, screenshot `/inbox` and `/contact-messages` at 1280 and 390, as a member holding `messages.view` only and as one holding both. Four renders. Confirm the committee sees no delete control.

- [ ] **Step 4: Prove the migration path**

Against a database that already has the roles — the TEST shape — run the migrations and confirm both permissions land. This is the failure the spec calls out as most likely and least visible.

- [ ] **Step 5: Open the pull request**

Title: `feat: a committee inbox, and contact messages that reach somebody`.
Body: fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`, close with `Closes #88`, link the spec, and attach the four screenshots. Evidence, not assertion.

**Do not merge.** A merge to `main` auto-deploys TEST, so merging is deploying — that is the user's call, not the implementer's.

---

## Self-review

**Spec coverage.** §2 model → Task 6. §3 schema → Task 1. §4 permissions and the grant → Task 2. §5 API surface, all six routes and the facet → Tasks 3, 4, 5, 7. §6 error vocabulary → no new tokens; the validation failure in Task 5 uses the existing `validation_failed`. §7 web, both screens and the nav → Tasks 9, 10, 11. §8 non-goals → nothing implements them, by construction. §9 risks → the grant migration has its own mutation test (Task 2 Step 6), `openapi.json` is regenerated in Task 8 rather than at the end.

**Placeholders.** Tasks 10 and 11 give test names and construction rules rather than full component bodies. That is deliberate and bounded: both pages are explicitly modelled on `Members.tsx`, which is in the repository and is the house pattern for exactly this screen. Every decision that is not derivable from that file — the ETag read-then-write flow, the `can("messages.manage")` gate, the no-polling rule, the card/table breakpoint — is stated.

**Type consistency.** `kind` is `contactMessage` everywhere: `ContactMessageSource::kind()`, `InboxItemResource`, the counts map, the mock. The facet is `contact_message` (snake, matching `event.options` and `registration` in `FACETS`) and its route parameter is `contactMessage`, which is what `Route::get('/contact-messages/{contactMessage}')` binds. The permission strings are `messages.view` and `messages.manage` in the enum, the routes, the guards and the nav.

**Every symbol this plan names was read during planning**, including the one that was briefly in doubt: `Member::hasPermission(Permission): bool` at `api/app/Models/Member.php:122`. The middleware aliases, `EntityTag::FACETS` and `state()`, `TestCase::actingAsMember()` and `ifMatch()`, `Member::factory()->named()`, `rowsOf`/`totalOf`, `entityTagOf`/`ifMatch` on the web side, `collection()` in the mocks and `DIRECTION_NAV` at `Layout.tsx:44` were all read rather than assumed.
