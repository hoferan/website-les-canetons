<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /api/events, PUT/DELETE /api/events/{id} — the admin-only writes.
 *
 * The access rule is the exact opposite of the GET in EventIndexTest: reading
 * the planning is public, changing it needs `manage_events`, which `admin`
 * alone holds. The capability matrix is not a hierarchy, so `user` and
 * `moderator` — who may `respond` — are refused here, and an anonymous caller
 * gets 401 rather than 403.
 *
 * Beyond the happy paths this pins:
 *   1. a refused write changes NOTHING (a 403 that still inserted would be the
 *      real bug, and the status code alone would not catch it);
 *   2. validation reports the camelCase field names in rules() order, because
 *      app/assets/js/i18n.js and planning_repet.js's EVENT_FIELD_INPUT_IDS both
 *      look them up by exactly those names;
 *   3. `attire` is optional — an event with no dress code is legitimate;
 *   4. an update that omits `weekend` PRESERVES the stored flag instead of
 *      defaulting it to 0, matching EventRepository::update()'s currentWeekend()
 *      lookup. Silently defaulting would flip a weekend event to non-weekend;
 *   5. deleting an event takes its responses with it (FK ON DELETE CASCADE) and
 *      does not error.
 *
 * CONTRACT CHANGE (this class was updated alongside it): the id used to travel
 * in the PUT body / DELETE query string, purely because that is what
 * planning_repet.js sent. It is now a `/events/{id}` path parameter,
 * constrained by `whereNumber()`, so a non-numeric id no longer reaches the
 * controller at all — it is a 404 (a routing concern), not the old 400
 * `validation_failed` (a validation concern). An id segment missing entirely
 * (`/api/events` with PUT/DELETE) is a 405 Method Not Allowed rather than a
 * 404, because that bare URI still matches the GET/POST routes registered at
 * it — Laravel only 404s a URI matching no route at all. Several tests below
 * were rewritten in place to pin the new shapes; nothing they used to cover
 * was dropped, only reworded to match where the check now lives.
 */
class EventWriteTest extends TestCase
{
    use RefreshDatabase;

    /** The payload planning_repet.js posts: camelCase, `weekend` a real bool. */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'date' => '2027-11-13',
            'title' => 'Carnaval',
            'startTime' => '20:00',
            'endTime' => '22:00',
            'location' => 'Local',
            'attire' => 'Uniforme',
            'weekend' => false,
        ];
    }

    private function user(string $role, string $username = 'demo.someone'): User
    {
        return User::create(['username' => $username, 'password' => 'x', 'role' => $role]);
    }

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

    // ---------------------------------------------------------------- create

    public function test_an_admin_creates_an_event(): void
    {
        $this->actingAs($this->user('admin'))
            ->postJson('/api/events', $this->payload(['weekend' => true]))
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        // The camelCase request keys must have landed on the snake_case columns.
        $this->assertDatabaseHas('events', [
            'date' => '2027-11-13',
            'title' => 'Carnaval',
            'start_time' => '20:00',
            'end_time' => '22:00',
            'location' => 'Local',
            'attire' => 'Uniforme',
            'weekend' => 1,
        ]);
    }

    public function test_an_empty_attire_is_accepted_and_stored_as_an_empty_string(): void
    {
        // A rehearsal with no dress code — the old DTO used TypeString, not
        // Required, and normalised a missing/blank tenue to ''.
        $this->actingAs($this->user('admin'))
            ->postJson('/api/events', $this->payload(['attire' => '  ']))
            ->assertStatus(201);

        $this->assertSame('', Event::sole()->attire);
    }

    public function test_an_omitted_attire_is_accepted(): void
    {
        $payload = $this->payload();
        unset($payload['attire']);

        $this->actingAs($this->user('admin'))->postJson('/api/events', $payload)
            ->assertStatus(201);

        $this->assertSame('', Event::sole()->attire);
    }

    public function test_a_user_role_may_not_create_an_event(): void
    {
        // user and moderator hold `respond` only — not a hierarchy.
        $this->actingAs($this->user('user'))
            ->postJson('/api/events', $this->payload())
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);

        // The refusal must be total: a 403 that still inserted is the real bug.
        $this->assertDatabaseCount('events', 0);
    }

    public function test_a_moderator_may_not_create_an_event(): void
    {
        $this->actingAs($this->user('moderator'))
            ->postJson('/api/events', $this->payload())
            ->assertStatus(403);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_anonymous_caller_may_not_create_an_event(): void
    {
        $this->postJson('/api/events', $this->payload())
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);

        $this->assertDatabaseCount('events', 0);
    }

    // ------------------------------------------------------------ validation

    public function test_missing_fields_report_the_camel_case_names_in_order(): void
    {
        $this->actingAs($this->user('admin'))->postJson('/api/events', [])
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [
                    ['field' => 'date', 'reason' => 'required'],
                    ['field' => 'title', 'reason' => 'required'],
                    ['field' => 'startTime', 'reason' => 'required'],
                    ['field' => 'endTime', 'reason' => 'required'],
                    ['field' => 'location', 'reason' => 'required'],
                ],
            ]);

        $this->assertDatabaseCount('events', 0);
    }

    /**
     * Rule order is load-bearing: ApiError reports only the FIRST failed rule
     * per field, so `max` must precede any format-ish rule and follow `required`.
     */
    public function test_an_over_long_title_reports_too_long(): void
    {
        $this->actingAs($this->user('admin'))
            ->postJson('/api/events', $this->payload(['title' => str_repeat('x', 256)]))
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [
                    ['field' => 'title', 'reason' => 'too_long', 'params' => ['max' => 255]],
                ],
            ]);
    }

    public function test_a_non_string_start_time_reports_invalid_type(): void
    {
        $this->actingAs($this->user('admin'))
            ->postJson('/api/events', $this->payload(['startTime' => ['20:00']]))
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'startTime', 'reason' => 'invalid_type']);
    }

    // ---------------------------------------------------------------- update

    public function test_an_admin_updates_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events/'.$event->id, $this->payload())
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $fresh = $event->fresh();
        $this->assertSame('2027-11-13', $fresh->date);
        $this->assertSame('Carnaval', $fresh->title);
        // '20:00' went in; MariaDB's TIME column normalises it, exactly as under
        // the old endpoint — planning_repet.js .slice(0, 5)s it back for display.
        $this->assertSame('20:00:00', $fresh->start_time);
        $this->assertSame('Uniforme', $fresh->attire);
        $this->assertSame(0, (int) $fresh->weekend);
        // One event, updated in place — not a second row.
        $this->assertDatabaseCount('events', 1);
    }

    /**
     * CONTRACT CHANGE: `whereNumber('id')` matches "0" just like any other
     * digit string — it is a numeric-shape check, not a positivity check — so
     * an update whose id happens to be 0 is no longer the old 400
     * `invalid_value`. It is simply a well-formed id that matches no Event
     * row, which is already a 200 {"ok":true} no-op for any nonexistent id
     * (see EventController::update()'s docblock). Nothing is created or
     * changed.
     */
    public function test_an_update_with_id_zero_is_a_noop_because_it_matches_no_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events/0', $this->payload())
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertSame('Repetition', $event->fresh()->title, 'no event has id 0, so nothing should have changed');
        $this->assertDatabaseCount('events', 1);
    }

    /**
     * CONTRACT CHANGE: the id is now a URL path parameter, not a body field.
     * A PUT with no id segment at all is `/api/events`, which is a URI that
     * DOES still match a route — GET and POST are both registered there — so
     * this is a routing concern, but a 405 Method Not Allowed rather than a
     * 404: Laravel only 404s a URI that matches no route at all, and 405s one
     * that matches a route but not this HTTP verb. Either way it is no longer
     * the old 400 `invalid_value`.
     */
    public function test_an_update_without_a_path_id_is_a_405_not_a_400(): void
    {
        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', $this->payload())
            ->assertStatus(405)
            ->assertExactJson(['error' => 'Method not allowed', 'code' => 'method_not_allowed']);
    }

    /**
     * Field validation (via EventRequest) still runs before the Event::find()
     * lookup inside the controller — the same ordering the legacy endpoint
     * had, now demonstrated against a numeric id that matches no event, since
     * a MALFORMED id can no longer even reach the controller (see
     * EventWriteTest's non-numeric-id tests below).
     */
    public function test_field_errors_are_still_reported_for_a_numeric_id_matching_no_event(): void
    {
        $this->actingAs($this->user('admin'))
            ->putJson('/api/events/0', [])
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'date', 'reason' => 'required']);
    }

    /**
     * THE WEEKEND-PRESERVATION SUBTLETY. EventRepository::update() looks the
     * stored flag up (currentWeekend()) when the key is absent rather than
     * defaulting to 0, so an API client that omits it cannot silently downgrade
     * a weekend event. Reproduced here deliberately.
     */
    public function test_an_update_omitting_weekend_preserves_the_stored_flag(): void
    {
        $event = $this->event(['weekend' => 1]);
        $payload = $this->payload();
        unset($payload['weekend']);

        $this->actingAs($this->user('admin'))->putJson('/api/events/'.$event->id, $payload)->assertOk();

        $this->assertSame(1, (int) $event->fresh()->weekend, 'the stored weekend flag was not preserved');
    }

    public function test_an_update_sending_weekend_false_clears_the_flag(): void
    {
        // The other half of the property above: an EXPLICIT false must still
        // win. planning_repet.js always sends the checkbox's state, so this is
        // the path the real UI takes when unticking "week-end".
        $event = $this->event(['weekend' => 1]);

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events/'.$event->id, $this->payload(['weekend' => false]))
            ->assertOk();

        $this->assertSame(0, (int) $event->fresh()->weekend);
    }

    public function test_an_update_sending_weekend_true_sets_the_flag(): void
    {
        $event = $this->event(['weekend' => 0]);

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events/'.$event->id, $this->payload(['weekend' => true]))
            ->assertOk();

        $this->assertSame(1, (int) $event->fresh()->weekend);
    }

    public function test_a_user_role_may_not_update_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('user'))
            ->putJson('/api/events/'.$event->id, $this->payload())
            ->assertStatus(403);

        $this->assertSame('Repetition', $event->fresh()->title);
    }

    // ---------------------------------------------------------------- delete

    public function test_an_admin_deletes_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('admin'))
            ->deleteJson('/api/events/'.$event->id)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('events', 0);
    }

    /**
     * CONTRACT CHANGE: same as the PUT case above — `/api/events` with no id
     * segment still matches the GET/POST route registered at that URI, so
     * DELETE there is a 405 Method Not Allowed, not a 404 (Laravel 404s only
     * a URI matching no route at all). Either way it is no longer the old
     * 400 `required`.
     */
    public function test_a_delete_without_a_path_id_is_a_405_not_a_400(): void
    {
        $this->event();

        $this->actingAs($this->user('admin'))->deleteJson('/api/events')
            ->assertStatus(405)
            ->assertExactJson(['error' => 'Method not allowed', 'code' => 'method_not_allowed']);

        $this->assertDatabaseCount('events', 1);
    }

    /**
     * CONTRACT CHANGE: `whereNumber('id')` constrains the route itself, so a
     * non-numeric id never reaches the controller at all — it is a 404,
     * not the old `invalid_value` 400.
     */
    public function test_a_delete_with_a_non_numeric_id_is_a_404(): void
    {
        $this->event();

        $this->actingAs($this->user('admin'))->deleteJson('/api/events/abc')
            ->assertStatus(404);

        $this->assertDatabaseCount('events', 1);
    }

    /**
     * CONTRACT CHANGE: as with update() above, `whereNumber` matches "0" — it
     * is not a positivity check — so a delete whose id happens to be 0 is no
     * longer the old 400 `invalid_value`. It reaches the controller as an
     * ordinary numeric id that matches no event: a no-op delete of zero rows.
     */
    public function test_a_delete_with_id_zero_is_a_noop(): void
    {
        $this->event();

        $this->actingAs($this->user('admin'))->deleteJson('/api/events/0')
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('events', 1);
    }

    /**
     * CONTRACT CHANGE: a negative id contains a `-`, outside `whereNumber`'s
     * `[0-9]+` pattern, so it never matches the route at all — a 404, not the
     * old `invalid_value` 400.
     */
    public function test_a_delete_with_a_negative_id_is_a_404(): void
    {
        $this->event();

        $this->actingAs($this->user('admin'))->deleteJson('/api/events/-3')
            ->assertStatus(404);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_a_user_role_may_not_delete_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('user'))
            ->deleteJson('/api/events/'.$event->id)
            ->assertStatus(403);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_an_anonymous_caller_may_not_delete_an_event(): void
    {
        $event = $this->event();

        $this->deleteJson('/api/events/'.$event->id)->assertStatus(401);

        $this->assertDatabaseCount('events', 1);
    }

    /**
     * The FK on `responses` is ON DELETE CASCADE, so removing an event takes its
     * members' answers with it. Pinned because the alternative — an FK error —
     * would make every delete of an event anyone had answered fail.
     */
    public function test_deleting_an_event_cascades_to_its_responses(): void
    {
        $event = $this->event();
        $other = $this->event(['date' => '2027-02-14']);
        $member = $this->user('user', 'demo.member');
        Response::create(['user_id' => $member->id, 'event_id' => $event->id, 'answer' => 'participate']);
        Response::create(['user_id' => $member->id, 'event_id' => $other->id, 'answer' => 'notparticipate']);

        $this->actingAs($this->user('admin'))
            ->deleteJson('/api/events/'.$event->id)
            ->assertOk();

        $this->assertDatabaseMissing('responses', ['event_id' => $event->id]);
        // Only the deleted event's responses went — the other event's survive.
        $this->assertDatabaseHas('responses', ['event_id' => $other->id]);
    }

    public function test_an_unsupported_method_is_rejected(): void
    {
        $this->actingAs($this->user('admin'))->patchJson('/api/events', $this->payload())
            ->assertStatus(405)
            ->assertExactJson(['error' => 'Method not allowed', 'code' => 'method_not_allowed']);
    }
}
