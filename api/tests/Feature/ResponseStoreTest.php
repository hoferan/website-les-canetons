<?php

namespace Tests\Feature;

use App\Http\Requests\ResponseRequest;
use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /api/responses — a member records THEIR OWN answer for one event.
 *
 * Three properties are pinned here beyond the happy path:
 *   1. the answer is always the CALLER'S. The user comes from the session and
 *      the request body has no field that could name someone else — the
 *      no-answering-on-behalf test below is the guard, and it must keep failing
 *      if such a field is ever added;
 *   2. `admin` may NOT respond. The capability matrix is deliberately not a
 *      hierarchy: `user`/`moderator` hold `respond`, `admin` holds
 *      `manage_events`/`view_summary`. The Team Direction organises events but
 *      does not vote in them, and the summary's "Pas de réponse" count depends
 *      on that (see ResponseSummaryTest);
 *   3. answering again CHANGES the answer rather than adding a second row — the
 *      table's unique (user_id, event_id) makes a duplicate impossible, so a
 *      non-upsert implementation would be a 500 on the member's second click.
 */
class ResponseStoreTest extends TestCase
{
    use RefreshDatabase;

    private function event(array $overrides = []): Event
    {
        return Event::create($overrides + [
            'date' => '2027-01-09',
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 0,
        ]);
    }

    private function user(string $username, string $role = 'user'): User
    {
        return User::create(['username' => $username, 'password' => 'x', 'role' => $role]);
    }

    public function test_a_member_records_an_answer(): void
    {
        $event = $this->event();
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'participate'])
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('responses', [
            'user_id' => $user->id,
            'event_id' => $event->id,
            'answer' => 'participate',
        ]);
    }

    /** A moderator holds `respond` too — the matrix lists it alongside `user`. */
    public function test_a_moderator_may_also_respond(): void
    {
        $event = $this->event();
        $moderator = $this->user('demo.moderator', 'moderator');

        $this->actingAs($moderator)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'notparticipate'])
            ->assertStatus(201);

        $this->assertDatabaseHas('responses', [
            'user_id' => $moderator->id,
            'answer' => 'notparticipate',
        ]);
    }

    public function test_answering_twice_updates_instead_of_duplicating(): void
    {
        $event = $this->event();
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'participate'])
            ->assertStatus(201);
        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'notparticipate'])
            ->assertStatus(201);

        // Exactly one row, carrying the SECOND answer: the unique
        // (user_id, event_id) means anything else is either a 500 or a lost
        // change of mind.
        $this->assertSame(1, Response::query()->count());
        $this->assertDatabaseHas('responses', [
            'user_id' => $user->id,
            'event_id' => $event->id,
            'answer' => 'notparticipate',
        ]);
    }

    /**
     * The upsert is scoped to (caller, event) — a second member answering the
     * same event ADDS a row, it does not overwrite the first member's answer.
     * Guards against an upsert keyed on the event alone.
     */
    public function test_two_members_answering_one_event_keep_separate_rows(): void
    {
        $event = $this->event();
        $alice = $this->user('demo.alice');
        $bob = $this->user('demo.bob');

        $this->actingAs($alice)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'participate'])
            ->assertStatus(201);
        $this->actingAs($bob)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'notparticipate'])
            ->assertStatus(201);

        $this->assertSame(2, Response::query()->count());
        $this->assertDatabaseHas('responses', ['user_id' => $alice->id, 'answer' => 'participate']);
        $this->assertDatabaseHas('responses', ['user_id' => $bob->id, 'answer' => 'notparticipate']);
    }

    /**
     * THE NO-ANSWERING-ON-BEHALF GUARD. The body carries every plausible way of
     * naming another member; all of them must be ignored, because the user is
     * taken from the session and nothing else. If a userId/username field is
     * ever honoured, this test fails.
     */
    public function test_the_body_cannot_name_another_member(): void
    {
        $event = $this->event();
        $caller = $this->user('demo.caller');
        $victim = $this->user('demo.victim');

        $this->actingAs($caller)->postJson('/api/responses', [
            'eventId' => $event->id,
            'participation' => 'participate',
            'userId' => $victim->id,
            'user_id' => $victim->id,
            'username' => $victim->username,
        ])->assertStatus(201);

        $this->assertSame(1, Response::query()->count());
        $this->assertDatabaseHas('responses', ['user_id' => $caller->id]);
        $this->assertDatabaseMissing('responses', ['user_id' => $victim->id]);
    }

    /**
     * THE ADMIN-CANNOT-RESPOND GUARD. 403 and, just as importantly, NOTHING
     * STORED — a refusal that still wrote the row would be worse than no
     * refusal at all, because the summary would then count the admin.
     */
    public function test_an_admin_may_not_respond_and_nothing_is_stored(): void
    {
        $event = $this->event();
        $admin = $this->user('demo.admin', 'admin');

        $this->actingAs($admin)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'participate'])
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);

        $this->assertSame(0, Response::query()->count());
    }

    public function test_an_anonymous_caller_is_unauthenticated(): void
    {
        $event = $this->event();

        // 401, not 403: auth:sanctum is paired with the capability middleware so
        // "not logged in" and "logged in but not allowed" stay distinguishable.
        $this->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'participate'])
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);

        $this->assertSame(0, Response::query()->count());
    }

    public function test_an_unknown_event_is_not_found(): void
    {
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => 999999, 'participation' => 'participate'])
            ->assertStatus(404)
            ->assertExactJson(['error' => 'Event not found', 'code' => 'event_not_found']);

        $this->assertSame(0, Response::query()->count());
    }

    /**
     * `invalid_value` is the one reason token whose French interpolates an
     * {{allowed}} list, and the `in` rule is the only thing that can supply it.
     * The params are asserted here because i18next prints a missing
     * interpolation value literally — a member would otherwise read a raw
     * {{allowed}} on screen. See App\Exceptions\ApiError::REASONS.
     */
    public function test_an_invalid_participation_reports_the_allowed_values(): void
    {
        $event = $this->event();
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => $event->id, 'participation' => 'maybe'])
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [[
                    'field' => 'participation',
                    'reason' => 'invalid_value',
                    'params' => ['allowed' => ['participate', 'notparticipate']],
                ]],
            ]);

        $this->assertSame(0, Response::query()->count());
    }

    /**
     * The French label is a display concern only — the STORED and ACCEPTED
     * values are the English enum, and the request class is their single source.
     */
    public function test_the_allowed_answers_are_the_english_enum_values(): void
    {
        $this->assertSame(['participate', 'notparticipate'], ResponseRequest::ANSWERS);
    }

    public function test_a_missing_event_id_is_required(): void
    {
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['participation' => 'participate'])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('fields.0.field', 'eventId')
            ->assertJsonPath('fields.0.reason', 'required');
    }

    /**
     * A non-positive id fails `gt:0`, which ApiError maps to the PARAMLESS
     * 'invalid_number' — deliberately not the legacy 'invalid_value', whose
     * French needs an {{allowed}} list that `gt` cannot supply. assertExactJson
     * pins the absence of a `params` key as much as the token.
     */
    public function test_a_non_positive_event_id_is_not_a_valid_number(): void
    {
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => 0, 'participation' => 'participate'])
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'eventId', 'reason' => 'invalid_number']],
            ]);
    }

    public function test_a_non_numeric_event_id_has_an_invalid_type(): void
    {
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => 'abc', 'participation' => 'participate'])
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'eventId', 'reason' => 'invalid_type']],
            ]);
    }

    /**
     * inscriptions_utilisateurs.js reads the id out of the query string, so it
     * always posts a STRING. A numeric string must be accepted, not reported as
     * the wrong type.
     */
    public function test_a_numeric_string_event_id_is_accepted(): void
    {
        $event = $this->event();
        $user = $this->user('demo.user');

        $this->actingAs($user)
            ->postJson('/api/responses', ['eventId' => (string) $event->id, 'participation' => 'participate'])
            ->assertStatus(201);

        $this->assertDatabaseHas('responses', ['event_id' => $event->id, 'user_id' => $user->id]);
    }
}
