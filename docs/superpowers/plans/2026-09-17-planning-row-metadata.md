# Planning-row metadata strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a `Public` chip, a `12/18 réponses` fraction and a booking count under each event title on `/planning`, so the committee stops opening every event to learn them.

**Architecture:** Three query-time aggregates on `EventResource` — `answeredCount`, `answerableCount`, `guestCount` — computed by `withCount`/`withSum` subselects and one `COUNT`, never stored. Each is `null` unless the caller holds the matching permission, so the gate is the API and not the SPA. Each is also `null` when its aggregate is not loaded, which is what keeps the counts out of `EntityTag`. On the SPA side `EventCard` gains a `meta` slot and a new permission-blind `EventMeta` component renders the strip.

**Tech Stack:** Laravel 13 / PHP 8.4 / MariaDB, PHPUnit; React 19 + TypeScript, Vitest + Testing Library, MSW; orval-generated client.

**Spec:** `docs/superpowers/specs/2026-09-17-planning-row-metadata-design.md`

## Global Constraints

- **Issue:** closes [#93](https://github.com/hoferan/website-les-canetons/issues/93). One issue, one branch, one PR, closed with `Closes #93`.
- **Branch:** `claude/new-session-cj3yc4`. Do not push to any other branch.
- **Language:** everything in code is English — identifiers, comments, test names, API JSON. French appears **only** as user-visible UI text in `web/src/`.
- **Never hand-edit** `web/src/api/generated/` or `dist/build/`.
- **Regenerate the client** with `npm run openapi && npm run generate:api` and commit the result, or CI's `openapi-drift` job fails.
- **Scramble reads the expression, not the signature.** Every new resource field is written as an inline ternary. Do not extract a helper method for them, and do not use `$this->when()`.
- **Run the web suite from PowerShell, not Git Bash** (Vitest 4 resolves modules off the drive-letter case). In this Linux session that does not apply.
- `npm run check` does **not** run the Laravel suite; `npm run test:api` does.
- **Commit after every task.** Conventional Commits for the PR title: `feat(api): …`, `feat(web): …`.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
  ```

## File Structure

| File | Responsibility |
| --- | --- |
| `api/app/Models/Event.php` | gains `registrationChoices()`, a `HasManyThrough` so `withSum` has a relation to name |
| `api/app/Http/Controllers/Api/EventController.php` | resolves the caller's permissions once, loads the aggregates on every path |
| `api/app/Http/Controllers/Api/EventSeriesController.php` | loads the aggregates on the path that also returns an `EventResource` |
| `api/app/Http/Resources/EventResource.php` | the three nullable fields and the null rule |
| `api/tests/Feature/EventCountsTest.php` | **new** — the gate, the leak, the arithmetic, the query budget |
| `api/tests/Feature/ConditionalWriteTest.php` | gains the "answering does not move the tag" test |
| `web/src/events/EventMeta.tsx` | **new** — the strip, permission-blind |
| `web/src/events/EventMeta.test.tsx` | **new** — its rendering and accessible names |
| `web/src/events/EventCard.tsx` | gains the `meta` slot |
| `web/src/pages/Events.tsx` | decides what the strip is given |
| `web/src/pages/Events.test.tsx` | the gate at the UI layer |
| `web/src/mocks/handlers.ts` | mirrors the server's gate and the three fields |

---

### Task 1: `answeredCount` and `answerableCount`, gated by `attendance.view_all`

**Files:**
- Modify: `api/app/Http/Controllers/Api/EventController.php`
- Modify: `api/app/Http/Resources/EventResource.php`
- Test: `api/tests/Feature/EventCountsTest.php` (create)

**Interfaces:**
- Produces: `EventResource` JSON gains `answeredCount: int|null` and `answerableCount: int|null`.
- Produces: `EventController::maySeeAnswers(Request): bool` — private static, true when the caller holds `attendance.view_all`. Task 2 adds `maySeeGuests()` beside it.
- Produces: `EventController::counts(): array<string, \Closure>` — **public** static, the `withCount` map. Task 2 adds `withSum` beside it; Task 3's series generator calls it, which is why it is public from the start.
- Produces: `EventController::answerable(Request): ?int` — private static, the denominator, or null when the caller may not see it.

- [ ] **Step 1: Write the failing test file**

Create `api/tests/Feature/EventCountsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The counts behind the planning's metadata strip (#93).
 *
 * THE GATE IS THE API, NOT THE SPA. Knowing that twelve people have already
 * said yes can move a thirteenth person's own answer, so the count is not
 * merely something a player has no use for — it would change what the screen
 * is measuring. A count left on the wire and hidden by can() is readable in
 * the network tab.
 */
class EventCountsTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->event = Event::factory()->create();
    }

    /** Somebody who may read the chase list and nothing else. */
    private function answerViewer(): Member
    {
        return Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();
    }

    public function test_a_player_is_told_nothing_about_answers(): void
    {
        // THE LEAK TEST. Mutation-test it by hand: drop the ternary in
        // EventResource and this must go red.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
    }

    public function test_attendance_view_all_sees_the_fraction(): void
    {
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        // One answer; three members in a register — the answering player, the
        // one just created, and nobody else. The viewer holds a role but no
        // register, so they are not answerable and not counted.
        $this->assertSame(1, $response->json('data.0.answeredCount'));
        $this->assertSame(2, $response->json('data.0.answerableCount'));
    }

    public function test_an_answer_from_somebody_who_left_their_register_is_not_counted(): void
    {
        // Otherwise the fraction reads 1/0, and the strip disagrees with the
        // chase list it links to — which lists players only.
        $departed = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $departed->id,
        ]);
        $departed->update(['section_id' => null]);

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertSame(0, $response->json('data.0.answeredCount'));
        $this->assertSame(0, $response->json('data.0.answerableCount'));
    }

    public function test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries(): void
    {
        // The player path is pinned at <= 3 by EventIndexTest and stays there.
        // This is the path that grew: resolving permissions, and the
        // denominator a player never pays for.
        Event::factory()->count(20)->create();
        $viewer = $this->answerViewer();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        $this->assertLessThanOrEqual(
            4,
            $queries,
            'GET /api/v1/events should not scale queries with events',
        );
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:api -- --filter=EventCountsTest`
Expected: FAIL. `test_a_player_is_told_nothing_about_answers` fails on `assertNull` receiving nothing (the key is absent), and the others fail because `answeredCount` is null.

- [ ] **Step 3: Add the permission resolution and the count load to the controller**

In `api/app/Http/Controllers/Api/EventController.php`, add `use App\Support\Permission;` to the imports, then add these two private statics next to `myAttendance()`:

```php
    /**
     * Whether the caller may see how many people have answered.
     *
     * RESOLVED ONCE PER REQUEST, not once per row. Member::hasPermission()
     * runs EffectivePermissions::for(), which is a query every time it is
     * called, so asking inside the Resource would be an N+1 that nothing in
     * the suite would catch — the rows would all be correct.
     *
     * A request with no user answers false. That is not only the anonymous
     * case: EntityTag::state() renders this Resource through a bare
     * Request::create('/'), and the counts must not reach the tag.
     */
    private static function maySeeAnswers(Request $request): bool
    {
        return $request->user()?->hasPermission(Permission::AttendanceViewAll) ?? false;
    }

    /**
     * The aggregate loads that back the planning's metadata strip (#93).
     *
     * SUBSELECTS ON THE QUERY THAT ALREADY RUNS, so neither of these is a
     * round trip and neither scales with the number of events. Nothing is
     * stored: a cached total would have to be invalidated by every answer,
     * every booking, and every member who joins or leaves a register.
     *
     * The answer count is constrained to members who are CURRENTLY in a
     * register, so the fraction cannot read 19/18 when somebody who answered
     * has since left theirs, and so this and the chase list it links to count
     * the same population.
     *
     * PUBLIC because EventSeriesController returns EventResource too, and the
     * shape has to be the same there. A second copy of this map is a second
     * place to forget a field.
     *
     * @return array<string, \Closure>
     */
    public static function counts(): array
    {
        return [
            'attendance as answered_count' => fn ($query) => $query->whereHas(
                'member',
                fn ($member) => $member->whereNotNull('section_id'),
            ),
        ];
    }

    /**
     * How many members are answerable at all — the denominator.
     *
     * A property of the ROSTER, not of the event, so it is one query for the
     * whole list rather than one per row. Only run for a caller who may see
     * it, so a player never pays for it.
     */
    private static function answerable(Request $request): ?int
    {
        return self::maySeeAnswers($request)
            ? Member::query()->whereNotNull('section_id')->count()
            : null;
    }
```

Add `use App\Models\Member;` to the imports.

- [ ] **Step 4: Load the counts in `index()` and pass the denominator**

In `index()`, replace the return statement with:

```php
        // THE DENOMINATOR RIDES THE REQUEST, not the collection envelope.
        // It is one number for the whole list, so running the COUNT per row
        // would be a query per event; and ->additional() writes into the
        // envelope, which PaginatesCollections owns and every EventResource
        // in the collection is rendered beneath rather than inside.
        $request->attributes->set('answerableCount', self::answerable($request));

        return EventResource::collection(
            $query->with(self::myAttendance($request))
                ->withCount(self::counts())
                ->get()
        );
```

- [ ] **Step 5: Add the two fields to `EventResource`**

In `api/app/Http/Resources/EventResource.php`, add `use App\Support\Permission;` and insert after `'isPublic' => $this->is_public,`:

```php
            /**
             * How many answerable members have replied, or null when the
             * caller may not see answers.
             */
            'answeredCount' => $this->countOrNull($request, 'answered_count'),
            /**
             * How many members are answerable at all — the denominator of the
             * fraction. Null when the caller may not see answers.
             */
            'answerableCount' => $request->user()?->hasPermission(Permission::AttendanceViewAll)
                ? $request->attributes->get('answerableCount')
                : null,
```

and this private method at the bottom of the class:

```php
    /**
     * An aggregate, or null.
     *
     * NULL MEANS TWO THINGS AND THAT IS DELIBERATE: the caller may not see it,
     * or it was never loaded. The second is what keeps these counts out of
     * EntityTag. EntityTag::state() renders this Resource from a freshly-read
     * model with no ->load() at all — unlike the member and registration arms
     * beside it — so every aggregate is absent there and drops out of the
     * hash.
     *
     * Without that, a member ANSWERING an event would move that event's tag,
     * and a committee member's pending edit of the TITLE would answer 412 for
     * a reason that has nothing to do with the title. That is exactly the
     * failure myAttendance's docblock describes, arrived at from the other
     * side. Pinned by ConditionalWriteTest::
     * test_answering_an_event_does_not_move_its_tag.
     *
     * The overload is invisible to every consumer: the SPA renders the strip
     * only when can() passes AND the value is non-null, and the tag wants null
     * either way.
     */
    private function countOrNull(Request $request, string $attribute): ?int
    {
        if (! array_key_exists($attribute, $this->getAttributes())) {
            return null;
        }

        return $request->user()?->hasPermission(Permission::AttendanceViewAll) === true
            ? (int) $this->getAttributes()[$attribute]
            : null;
    }
```

Note the ternaries are written inline in `toArray()` for `answerableCount` and inside a `?int`-returning method for `answeredCount`. If `npm run openapi` types either as non-nullable, inline both as full ternaries in `toArray()` — the `registrationOpensAt` pattern directly above is the known-good shape, and CLAUDE.md records a `?Iso8601` helper silently retyping a field from `string|null` to `string`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:api -- --filter=EventCountsTest`
Expected: PASS, 4 tests.

- [ ] **Step 7: Run the existing event suites for regressions**

Run: `npm run test:api -- --filter='EventIndexTest|EventWriteTest|EventSeriesTest|ConditionalWriteTest'`
Expected: PASS. `test_listing_the_planning_costs_a_fixed_number_of_queries` must still pass at `<= 3` — it acts as a player, who pays for permission resolution but not the denominator.

- [ ] **Step 8: Mutation-test the leak by hand**

Temporarily change `countOrNull`'s return to `(int) $this->getAttributes()[$attribute]` with no permission check, then run:

Run: `npm run test:api -- --filter=test_a_player_is_told_nothing_about_answers`
Expected: **FAIL**. Restore the check and confirm it passes again. A green assertion here has been wrong before in this repo.

- [ ] **Step 9: Commit**

```bash
git add api/app/Http/Controllers/Api/EventController.php \
        api/app/Http/Resources/EventResource.php \
        api/tests/Feature/EventCountsTest.php
git commit -m "$(cat <<'EOF'
feat(api): answer counts on the planning, gated by attendance.view_all

Two query-time aggregates on EventResource, never stored. Withheld from a
player in the RESPONSE rather than hidden by the SPA: knowing how many have
already answered can move a thirteenth person's own answer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 2: `guestCount`, gated by `registrations.view`

**Files:**
- Modify: `api/app/Models/Event.php`
- Modify: `api/app/Http/Controllers/Api/EventController.php`
- Modify: `api/app/Http/Resources/EventResource.php`
- Test: `api/tests/Feature/EventCountsTest.php`

**Interfaces:**
- Consumes: `EventController::counts()` from Task 1 — this task adds a second entry to the returned map.
- Produces: `Event::registrationChoices(): HasManyThrough<RegistrationChoice, Registration, Event>`.
- Produces: `EventResource` JSON gains `guestCount: int|null`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/Feature/EventCountsTest.php`, and add `use App\Models\Registration;` and `use App\Models\RegistrationOption;` to its imports:

```php
    public function test_a_player_is_told_nothing_about_bookings(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $event->id]);
        Registration::factory()
            ->withChoice($option, 4)
            ->create(['event_id' => $event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.1.guestCount'));
    }

    public function test_guest_count_sums_quantities_rather_than_counting_bookings(): void
    {
        // "3 x adulte, 1 x enfant" is four people, and four is what fills the
        // hall. One booking that reads "1" is the bug this pins.
        $event = Event::factory()->takingRegistrations()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $event->id]);
        Registration::factory()
            ->withChoice($option, 4)
            ->create(['event_id' => $event->id]);

        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsView)->create())
            ->create();

        $response = $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $event->id);

        $this->assertSame(4, $row['guestCount']);
    }

    public function test_the_two_gates_are_independent(): void
    {
        // demo.committee holds registrations.view WITHOUT attendance.view_all.
        // Anything that collapses these into one "committee" check breaks this
        // member, the way demo.both breaks an either/or role matrix.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsView)->create())
            ->create();

        $response = $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
        $this->assertSame(0, $response->json('data.0.guestCount'));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:api -- --filter=EventCountsTest`
Expected: FAIL on the three new tests — `guestCount` is absent from the payload.

- [ ] **Step 3: Add the `HasManyThrough` to `Event`**

In `api/app/Models/Event.php`, add `use Illuminate\Database\Eloquent\Relations\HasManyThrough;` and `use App\Models\RegistrationChoice;` if absent, then next to `registrations()`:

```php
    /**
     * Every option booked at this event, across every booking.
     *
     * EXISTS SO withSum HAS A RELATION TO NAME. Laravel's aggregate helpers
     * take one relation, not a dotted path, so "sum the quantities of the
     * choices of this event's registrations" needs the hop declared. Nothing
     * reads it as a relation.
     *
     * @return HasManyThrough<RegistrationChoice, Registration, $this>
     */
    public function registrationChoices(): HasManyThrough
    {
        return $this->hasManyThrough(RegistrationChoice::class, Registration::class);
    }
```

- [ ] **Step 4: Extend `counts()` and add the second gate to the controller**

In `EventController::counts()`, the map stays for `withCount`. `withSum` is a separate call, so change the return in `index()` to:

```php
        return EventResource::collection(
            $query->with(self::myAttendance($request))
                ->withCount(self::counts())
                ->withSum('registrationChoices as guest_count', 'quantity')
                ->get()
        );
```

and add beside `maySeeAnswers()`:

```php
    /**
     * Whether the caller may see how many people are booked.
     *
     * A DIFFERENT GATE FROM maySeeAnswers, not a shared "committee" one: the
     * seeded `committee` role holds registrations.view and NOT
     * attendance.view_all, so somebody genuinely holds one without the other.
     */
    private static function maySeeGuests(Request $request): bool
    {
        return $request->user()?->hasPermission(Permission::RegistrationsView) ?? false;
    }
```

- [ ] **Step 5: Add the field to `EventResource`**

Insert after `answerableCount`:

```php
            /**
             * How many PEOPLE are booked — the sum of the quantities, because
             * "3 x adulte, 1 x enfant" is four people and four is what fills
             * the hall. Null when the caller may not see bookings.
             */
            'guestCount' => $this->guestCountOrNull($request),
```

and generalise `countOrNull` into two callers by adding:

```php
    /**
     * The booked head count, or null. Same null rule as countOrNull() — see
     * its docblock for why "not loaded" must also answer null.
     */
    private function guestCountOrNull(Request $request): ?int
    {
        if (! array_key_exists('guest_count', $this->getAttributes())) {
            return null;
        }

        return $request->user()?->hasPermission(Permission::RegistrationsView) === true
            ? (int) ($this->getAttributes()['guest_count'] ?? 0)
            : null;
    }
```

`withSum` over an empty set yields `null`, hence the `?? 0`: an event that takes bookings and has none reads `0`, not `null`, so the SPA can tell "none yet" from "not yours to see".

- [ ] **Step 6: Run the tests**

Run: `npm run test:api -- --filter=EventCountsTest`
Expected: PASS, 7 tests.

- [ ] **Step 7: Run the full API suite**

Run: `npm run test:api`
Expected: PASS. Note the count; the suite was 585 tests on 2026-09-15 and this plan adds to it.

- [ ] **Step 8: Commit**

```bash
git add api/app/Models/Event.php \
        api/app/Http/Controllers/Api/EventController.php \
        api/app/Http/Resources/EventResource.php \
        api/tests/Feature/EventCountsTest.php
git commit -m "$(cat <<'EOF'
feat(api): booked head count on the planning, gated by registrations.view

Sums quantities rather than counting bookings: "3 x adulte, 1 x enfant" is
four people, and four is what fills the hall.

A separate gate from the answer count, pinned by a test: the seeded committee
role holds registrations.view without attendance.view_all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 3: The same shape on every path, and the ETag invariant

**Files:**
- Modify: `api/app/Http/Controllers/Api/EventController.php` (`show`, `store`, `update`)
- Modify: `api/app/Http/Controllers/Api/EventSeriesController.php`
- Test: `api/tests/Feature/EventCountsTest.php`
- Test: `api/tests/Feature/ConditionalWriteTest.php`

**Interfaces:**
- Consumes: `EventController::counts()` and `maySeeAnswers()` from Task 1; `maySeeGuests()` from Task 2.
- Produces: nothing new on the wire — the same three fields, now populated on single reads and writes too.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/Feature/EventCountsTest.php`:

```php
    public function test_reading_one_event_carries_the_same_counts_as_the_list(): void
    {
        // One Resource, one shape. A client reading a single event should not
        // have to fetch a list to learn the denominator.
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson("/api/v1/events/{$this->event->id}")
            ->assertOk();

        $this->assertSame(1, $response->json('data.answeredCount'));
        $this->assertSame(2, $response->json('data.answerableCount'));
    }
```

And append to `api/tests/Feature/ConditionalWriteTest.php`:

```php
    public function test_answering_an_event_does_not_move_its_tag(): void
    {
        // EntityTag::state() renders EventResource itself, so a count left in
        // the tag would make a member's ANSWER invalidate a committee
        // member's pending edit of the TITLE — a 412 for a reason that has
        // nothing to do with the title.
        $event = Event::factory()->create();
        $before = EntityTag::compute('event', $event);

        Attendance::factory()->create(['event_id' => $event->id]);

        $this->assertSame($before, EntityTag::compute('event', $event->fresh()));
    }
```

`EntityTag::compute(string $facet, Model $model): ?string` is public (verified at `api/app/Support/EntityTag.php:116`), so call it directly — no HTTP round trip is needed. Add `use App\Models\Attendance;`, `use App\Models\Event;` and `use App\Support\EntityTag;` to the test file's imports if they are not already there.

Note that `compute()` re-reads from the database itself, so passing `$event` and `$event->fresh()` is belt-and-braces rather than required — `test_the_tag_describes_what_is_stored_not_what_is_in_hand` is what pins that behaviour.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:api -- --filter='EventCountsTest|ConditionalWriteTest'`
Expected: `test_reading_one_event_carries_the_same_counts_as_the_list` FAILS with null counts. `test_answering_an_event_does_not_move_its_tag` should **already pass** if the null rule from Task 1 is right — if it fails, the aggregates are reaching the tag and that is the bug this task exists to catch.

- [ ] **Step 3: Load the aggregates on the remaining paths**

In `EventController::show()`, replace the load:

```php
        $event->load(self::myAttendance($request));
        $event->loadCount(self::counts());
        $event->loadSum('registrationChoices as guest_count', 'quantity');
```

Do the same after the model is created or updated in `store()` and `update()`, immediately before the `EventResource` is constructed. In `EventSeriesController::__invoke()`, before `EventResource::collection($events)`, load them across the collection:

```php
        $events = collect($events)->each(function (Event $event) use ($request): void {
            $event->loadCount(EventController::counts());
            $event->loadSum('registrationChoices as guest_count', 'quantity');
        })->all();
```

`counts()` was declared `public static` in Task 1 precisely for this call site, so no visibility change is needed here.

Each of these paths also needs the denominator on the request:

```php
        $request->attributes->set('answerableCount', self::answerable($request));
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:api -- --filter='EventCountsTest|ConditionalWriteTest|EventWriteTest|EventSeriesTest'`
Expected: PASS.

- [ ] **Step 5: Mutation-test the ETag invariant**

Temporarily make `countOrNull` return `0` instead of `null` when the attribute is absent, then run:

Run: `npm run test:api -- --filter=test_answering_an_event_does_not_move_its_tag`
Expected: still PASS (a constant does not move the tag). Now make it return the event's id instead, re-run, and confirm `test_an_events_tag_does_not_depend_on_who_is_asking` and the new test still behave as documented. Restore the `null`.

- [ ] **Step 6: Run Pint and the full suite**

Run: `npm run lint:api && npm run test:api`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/EventController.php \
        api/app/Http/Controllers/Api/EventSeriesController.php \
        api/tests/Feature/EventCountsTest.php \
        api/tests/Feature/ConditionalWriteTest.php
git commit -m "$(cat <<'EOF'
feat(api): the same count shape on every event read and write

One Resource, one shape: a single read should not have to fetch a list to
learn the denominator.

Pins the ETag invariant the null rule exists for. EntityTag::state() renders
EventResource from a model with no relations loaded, so the counts drop out of
the hash -- without which a member answering an event would 412 a committee
member's unrelated title edit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 4: Regenerate the client, and mirror the gate in the mocked backend

**Files:**
- Modify: `web/src/mocks/handlers.ts`
- Modify: `web/src/api/generated/` (generated, never hand-edited)
- Modify: `openapi.json` (generated)

**Interfaces:**
- Consumes: the three fields from Tasks 1–2.
- Produces: `EventResource` in `web/src/api/generated/model` gains `answeredCount`, `answerableCount`, `guestCount`, each `number | null`.

- [ ] **Step 1: Regenerate**

Run: `npm run openapi && npm run generate:api`
Expected: `openapi.json` and `web/src/api/generated/` change.

- [ ] **Step 2: Verify the generated types are nullable**

Run: `grep -n "answeredCount\|answerableCount\|guestCount" web/src/api/generated/model/eventResource.ts`
Expected: each typed `number | null`. **If any is typed `number` without the null**, Scramble has mis-inferred it — rewrite that field in `EventResource::toArray()` as a full inline ternary (the `registrationOpensAt` shape) and regenerate. Do not hand-edit the generated file.

- [ ] **Step 3: Mirror the gate in the mocked backend**

In `web/src/mocks/handlers.ts`, add the three fields to every object in `initialEvents()` as `answeredCount: null, answerableCount: null, guestCount: null` — the stored shape is the ungated one. Then add, next to `withMyAttendance`:

```ts
/**
 * The committee's counts, gated exactly as the server gates them.
 *
 * MIRRORS App\Http\Resources\EventResource, including the two DIFFERENT
 * permissions: the seeded committee role holds registrations.view without
 * attendance.view_all. A mock that hands a player these numbers is a mock the
 * SPA's own leak test passes against, which is worse than no mock.
 */
function withCommitteeCounts(event: EventResource): EventResource {
  const maySeeAnswers = currentMockUser()?.permissions.includes("attendance.view_all") ?? false;
  const maySeeGuests = currentMockUser()?.permissions.includes("registrations.view") ?? false;

  return {
    ...event,
    answeredCount: maySeeAnswers ? answeredCountFor(event.id) : null,
    answerableCount: maySeeAnswers ? answerableCount() : null,
    guestCount: maySeeGuests ? guestsFor(event.id) : null,
  };
}
```

The three helpers it leans on, placed just above it, next to `myAnswerFor()`:

```ts
/**
 * How many answerable members have replied to an event.
 *
 * COUNTS THROUGH THE ROSTER rather than over the answers map, so an answer
 * from somebody who is in no register is not counted — the same constraint
 * EventController::counts() puts in the subselect. The `answers` map is keyed
 * by answerKey(eventId, memberId).
 */
function answeredCountFor(eventId: number): number {
  return members.filter((member) => member.isPlayer && answers.has(answerKey(eventId, member.id)))
    .length;
}

/** The denominator: everybody in a register. A property of the roster, not of the event. */
function answerableCount(): number {
  return members.filter((member) => member.isPlayer).length;
}

/**
 * How many PEOPLE are booked at an event.
 *
 * Reads each booking's own `guestCount`, which totalsOf() already computed
 * from its choices. Summing the lines a second time here is exactly the
 * disagreement that function's docblock exists to prevent.
 */
function guestsFor(eventId: number): number {
  return registrations
    .filter((booking) => booking.eventId === eventId)
    .reduce((sum, booking) => sum + booking.guestCount, 0);
}
```

and `withCommitteeCounts` calls `answeredCountFor(event.id)`, `answerableCount()` and `guestsFor(event.id)` in place of the names used in the sketch above.

- [ ] **Step 4: Apply it in the list handler**

At `http.get("/api/v1/events", …)`, change the return:

```ts
    return collection(planning.map(withMyAttendance).map(withCommitteeCounts), request);
```

Apply `withCommitteeCounts` on the single-event `GET`, `POST` and `PUT` handlers too, so the mock matches Task 3's shape.

- [ ] **Step 5: Typecheck and run the web suite**

Run: `npm run test:web`
Expected: PASS — no behaviour has changed yet, only the payload.

- [ ] **Step 6: Commit**

```bash
git add openapi.json web/src/api/generated web/src/mocks/handlers.ts
git commit -m "$(cat <<'EOF'
build(api): regenerate the client for the planning counts

The mocked backend mirrors the server's two gates, including the case where
they differ: the committee role holds registrations.view without
attendance.view_all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 5: `EventMeta`, the strip itself

**Files:**
- Create: `web/src/events/EventMeta.tsx`
- Create: `web/src/events/EventMeta.test.tsx`

**Interfaces:**
- Produces: `EventMeta({ isPublic?: boolean; answered?: number; answerable?: number; guests?: number }): ReactNode` — renders `null` when given nothing.

- [ ] **Step 1: Write the failing test**

Create `web/src/events/EventMeta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { EventMeta } from "./EventMeta";

test("renders nothing when it is given nothing", () => {
  const { container } = render(<EventMeta />);
  expect(container).toBeEmptyDOMElement();
});

test("shows the public chip only for a public event", () => {
  const { rerender } = render(<EventMeta isPublic />);
  expect(screen.getByText("Public")).toBeInTheDocument();

  // Absence, not a "Privé" chip: within an audience that all holds
  // events.manage, absence is unambiguous, and the planning is mostly
  // rehearsals.
  rerender(<EventMeta isPublic={false} />);
  expect(screen.queryByText("Public")).toBeNull();
});

test("reads the fraction out loud as words", () => {
  // "12/18" is announced as a date or a fraction by a screen reader, neither
  // of which is what it says.
  render(<EventMeta answered={12} answerable={18} />);
  expect(screen.getByText("12/18 réponses")).toBeInTheDocument();
  expect(screen.getByLabelText("12 réponses sur 18")).toBeInTheDocument();
});

test("shows the zero fraction rather than hiding it", () => {
  // On the planning, 0/18 IS the chase cue.
  render(<EventMeta answered={0} answerable={18} />);
  expect(screen.getByText("0/18 réponses")).toBeInTheDocument();
  expect(screen.getByLabelText("0 réponse sur 18")).toBeInTheDocument();
});

test("pluralises the head count and names the empty case", () => {
  const { rerender } = render(<EventMeta guests={6} />);
  expect(screen.getByText("6 personnes")).toBeInTheDocument();

  rerender(<EventMeta guests={1} />);
  expect(screen.getByText("1 personne")).toBeInTheDocument();

  // "0 personne" is not French.
  rerender(<EventMeta guests={0} />);
  expect(screen.getByText("Aucune inscription")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- EventMeta`
Expected: FAIL — cannot resolve `./EventMeta`.

- [ ] **Step 3: Write the component**

Create `web/src/events/EventMeta.tsx`:

```tsx
/**
 * The metadata strip under an event's title (#93).
 *
 * PERMISSION-BLIND, like EventCard itself. Every prop is optional and the
 * screen decides which to pass: the API has already withheld what the caller
 * may not see, and this component never asks who is reading.
 *
 * IT RENDERS NOTHING WHEN GIVEN NOTHING, so a player's card grows no empty row.
 */
export function EventMeta({
  isPublic,
  answered,
  answerable,
  guests,
}: {
  isPublic?: boolean;
  answered?: number;
  answerable?: number;
  guests?: number;
}) {
  const showsAnswers = answered !== undefined && answerable !== undefined;
  const chips = [isPublic === true, showsAnswers, guests !== undefined];

  if (!chips.some(Boolean)) {
    return null;
  }

  return (
    <div data-testid="event-meta" className="mt-tight flex flex-wrap gap-tight text-sm">
      {isPublic === true ? (
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-ink-muted">
          Public
        </span>
      ) : null}

      {showsAnswers ? (
        <span
          className="text-ink-muted"
          aria-label={`${answered} ${answered === 1 ? "réponse" : "réponses"} sur ${answerable}`}
        >
          {answered}/{answerable} réponses
        </span>
      ) : null}

      {guests !== undefined ? (
        <span className="text-ink-muted">
          {guests === 0 ? "Aucune inscription" : `${guests} personne${guests > 1 ? "s" : ""}`}
        </span>
      ) : null}
    </div>
  );
}
```

Note `0 réponse` singular in the `aria-label` but `0/18 réponses` in the visible text: the visible form is a fraction followed by a plural noun, while the spoken form is a counted noun, and French takes the singular after zero.

- [ ] **Step 4: Run the tests**

Run: `npm run test:web -- EventMeta`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/events/EventMeta.tsx web/src/events/EventMeta.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): the planning row's metadata strip

Permission-blind, like EventCard: every prop is optional and the screen
decides what to pass. Renders nothing when given nothing.

The fraction carries an aria-label because "12/18" is announced as a date.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 6: Wire the strip into the card and the screen

**Files:**
- Modify: `web/src/events/EventCard.tsx`
- Modify: `web/src/pages/Events.tsx:181` (the `card()` helper)
- Test: `web/src/pages/Events.test.tsx`

**Interfaces:**
- Consumes: `EventMeta` from Task 5; the three generated fields from Task 4.
- Produces: `EventCard` accepts `meta?: ReactNode`, rendered under the date line.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/pages/Events.test.tsx`:

```tsx
test("a player is told nothing about answers or bookings", async () => {
  // Mirrors EventCountsTest::test_a_player_is_told_nothing_about_answers at
  // the UI layer. The API has already withheld the numbers; this asserts the
  // screen does not invent them.
  await renderPlanning("demo.player");
  expect(screen.queryAllByTestId("event-meta")).toHaveLength(0);
});

test("an organiser sees the public chip and the answer fraction", async () => {
  await renderPlanning("demo.direction");
  const strips = screen.getAllByTestId("event-meta");
  expect(strips.length).toBeGreaterThan(0);
  expect(screen.getAllByText(/réponses$/).length).toBeGreaterThan(0);
  // Exactly one seeded event is public — the gig at Cheyres.
  expect(screen.getAllByText("Public")).toHaveLength(1);
});

test("the booking count appears only on an event that takes bookings", async () => {
  // The souper is the only one. Every other card would otherwise carry a
  // count that can never move.
  await renderPlanning("demo.committee");
  expect(screen.getAllByText(/personnes?$|^Aucune inscription$/)).toHaveLength(1);
});

test("the past keeps the strip", async () => {
  // The fraction stops being a chase cue and becomes a record of who
  // answered, which is worth having on the screen that shows the past.
  await renderPlanning("demo.direction");
  await userEvent.click(screen.getByRole("button", { name: "Voir les événements passés" }));
  await waitFor(() => expect(screen.getAllByTestId("event-card")).toHaveLength(1));
  expect(screen.getAllByTestId("event-meta")).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:web -- Events.test`
Expected: FAIL on the last two — no `event-meta` exists yet. The player test passes vacuously, which is the point of writing it before the wiring: it must keep passing afterwards.

- [ ] **Step 3: Add the `meta` slot to `EventCard`**

In `web/src/events/EventCard.tsx`, extend the props and the docblock. Add to the signature:

```tsx
export function EventCard({
  event,
  actions,
  answer,
  meta,
}: {
  event: EventResource;
  actions?: ReactNode;
  answer?: ReactNode;
  meta?: ReactNode;
}) {
```

and render it directly under the date line, inside the `min-w-0` column:

```tsx
          <p data-testid="event-when" className="mt-tight text-sm text-ink-muted">
            {formatEventWhen(event.startsAt, event.endsAt)}
          </p>

          {/* INSIDE THE min-w-0 COLUMN, not beside it. The strip wraps on its
              own at 390px rather than widening the card — #89's failure was a
              box that could not shrink dragging the document 223px sideways,
              and the action row directly above this one is still open as
              #118. */}
          {meta}
```

Add to the docblock, beside the existing "TWO SLOTS RATHER THAN ONE" paragraph, that there are now three and that `meta` is the committee's read-only summary, decided by the screen like the other two.

- [ ] **Step 4: Pass the strip from `Events.tsx`**

Add the import `import { EventMeta } from "../events/EventMeta";` and, inside `card()`, add to the `<EventCard>` element:

```tsx
        // WHAT THE SCREEN DECIDES, mirroring the API's gates for UX only —
        // the numbers are already null for anybody who may not see them, so
        // this suppresses an empty strip rather than protecting anything.
        meta={
          <EventMeta
            isPublic={mayManage ? event.isPublic : undefined}
            answered={maySeeAnswers ? (event.answeredCount ?? undefined) : undefined}
            answerable={maySeeAnswers ? (event.answerableCount ?? undefined) : undefined}
            guests={
              maySeeGuests && event.takesRegistrations ? (event.guestCount ?? undefined) : undefined
            }
          />
        }
```

`isPublic` is passed as `undefined` rather than `false` for a non-manager so the chip is absent, and `EventMeta` renders nothing at all when every prop is undefined.

- [ ] **Step 5: Run the tests**

Run: `npm run test:web -- Events.test`
Expected: PASS, including the player test still passing.

- [ ] **Step 6: Run the whole check**

Run: `npm run check`
Expected: PASS — typecheck, Pint, web tests, eslint, stylelint, prettier, secret guard, image budget.

- [ ] **Step 7: Commit**

```bash
git add web/src/events/EventCard.tsx web/src/pages/Events.tsx web/src/pages/Events.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): show visibility and answer counts on each planning row

EventCard gains a third slot. It stays permission-blind: the screen decides
what the strip is given, as it already does for actions and answers.

Closes #93

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
EOF
)"
```

---

### Task 7: Evidence, and the pull request

**Files:**
- None modified. This task produces the artefacts the issue is closed with.

- [ ] **Step 1: Capture the 390px screenshot**

Start the dev server (`npm run dev:web`), sign in as `demo.direction` (password `demo`), open `/planning` at a 390px viewport, and capture the souper card — the five-action one — showing the strip under its title.

CLAUDE.md records that a web session has **no `:8090` parity stack**, so this is the Vite dev server against the mocked backend, not the built artefact. Say so when attaching the image; the strip's rendering is what is being evidenced, not Apache's behaviour.

- [ ] **Step 2: Verify the whole suite one more time**

Run: `npm run check && npm run test:api`
Expected: PASS both. Record the API test count.

Note: `npm run lint:types` prints a notice and exits 0 in a web session — Larastan is deliberately not installed here, so `npm run check` can be green without any PHP having been type-checked. CI's `lint-api` job is the real gate. Read the PR.

- [ ] **Step 3: Push**

```bash
git push -u origin claude/new-session-cj3yc4
```

- [ ] **Step 4: Open the pull request**

Title: `feat: show public visibility and answer counts on each planning row`

Body: fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`. It must carry:
- `Closes #93`
- the 390px screenshot
- the leak test named, with the note that it was mutation-tested by hand (Task 1 Step 8)
- the query arithmetic: a player 2 → 3, a committee caller 2 → 4, constant in the number of events
- the ETag invariant and why it needed its own test
- the footer:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01BLbpXWUnW5fLFt3g7EP15x
  ```

- [ ] **Step 5: Watch CI**

`openapi-drift` and `lint-api` are the two most likely to fail here — the first if the generated client was not committed, the second because Larastan never ran locally.
