<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST / PUT / DELETE /api/events — the admin-only writes.
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
            ->putJson('/api/events', $this->payload(['id' => $event->id]))
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

    public function test_an_update_with_id_zero_is_rejected(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', $this->payload(['id' => 0]))
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'id', 'reason' => 'invalid_value']],
            ]);

        $this->assertSame('Repetition', $event->fresh()->title);
    }

    public function test_an_update_without_an_id_is_rejected(): void
    {
        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', $this->payload())
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'id', 'reason' => 'invalid_value']);
    }

    /**
     * Field validation runs BEFORE the id check, exactly as in the legacy
     * endpoint: a PUT that is bad in both ways reports the fields, not the id.
     */
    public function test_field_errors_take_precedence_over_a_bad_id(): void
    {
        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', ['id' => 0])
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'date', 'reason' => 'required'])
            ->assertJsonMissing([['field' => 'id', 'reason' => 'invalid_value']]);
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
        $payload = $this->payload(['id' => $event->id]);
        unset($payload['weekend']);

        $this->actingAs($this->user('admin'))->putJson('/api/events', $payload)->assertOk();

        $this->assertSame(1, (int) $event->fresh()->weekend, 'the stored weekend flag was not preserved');
    }

    public function test_an_update_sending_weekend_false_clears_the_flag(): void
    {
        // The other half of the property above: an EXPLICIT false must still
        // win. planning_repet.js always sends the checkbox's state, so this is
        // the path the real UI takes when unticking "week-end".
        $event = $this->event(['weekend' => 1]);

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', $this->payload(['id' => $event->id, 'weekend' => false]))
            ->assertOk();

        $this->assertSame(0, (int) $event->fresh()->weekend);
    }

    public function test_an_update_sending_weekend_true_sets_the_flag(): void
    {
        $event = $this->event(['weekend' => 0]);

        $this->actingAs($this->user('admin'))
            ->putJson('/api/events', $this->payload(['id' => $event->id, 'weekend' => true]))
            ->assertOk();

        $this->assertSame(1, (int) $event->fresh()->weekend);
    }

    public function test_a_user_role_may_not_update_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('user'))
            ->putJson('/api/events', $this->payload(['id' => $event->id]))
            ->assertStatus(403);

        $this->assertSame('Repetition', $event->fresh()->title);
    }

    // ---------------------------------------------------------------- delete

    public function test_an_admin_deletes_an_event(): void
    {
        $event = $this->event();

        // ?id= in the QUERY STRING — that is what planning_repet.js sends.
        $this->actingAs($this->user('admin'))
            ->deleteJson('/api/events?id='.$event->id)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_a_delete_without_an_id_is_rejected(): void
    {
        $this->event();

        $this->actingAs($this->user('admin'))->deleteJson('/api/events')
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'id', 'reason' => 'required']],
            ]);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_a_delete_with_an_empty_id_is_rejected_as_required(): void
    {
        $this->actingAs($this->user('admin'))->deleteJson('/api/events?id=')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'id', 'reason' => 'required']);
    }

    public function test_a_delete_with_a_non_positive_id_is_rejected_as_invalid(): void
    {
        // Present but unusable is a different reason token from absent, and
        // i18n.js renders the two differently.
        $admin = $this->user('admin');

        $this->actingAs($admin)->deleteJson('/api/events?id=0')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'id', 'reason' => 'invalid_value']);

        $this->actingAs($admin)->deleteJson('/api/events?id=-3')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'id', 'reason' => 'invalid_value']);
    }

    public function test_a_user_role_may_not_delete_an_event(): void
    {
        $event = $this->event();

        $this->actingAs($this->user('user'))
            ->deleteJson('/api/events?id='.$event->id)
            ->assertStatus(403);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_an_anonymous_caller_may_not_delete_an_event(): void
    {
        $event = $this->event();

        $this->deleteJson('/api/events?id='.$event->id)->assertStatus(401);

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
            ->deleteJson('/api/events?id='.$event->id)
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
