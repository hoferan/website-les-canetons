<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventWriteTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        // administrator() grants the seeded `direction` role, which
        // 2026_09_07_000001 gives Permission::cases(), events.manage included.
        $this->organiser = Member::factory()->administrator()->create();
        // 'Cloches' is one of the six registers that same migration seeds.
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Répétition',
            'startsAt' => '2026-09-05T10:00:00+02:00',
            'endsAt' => '2026-09-05T12:00:00+02:00',
            'location' => 'Werkhof',
            'attire' => 'Libre',
            'isPublic' => false,
            'notes' => null,
        ], $overrides);
    }

    public function test_a_player_cannot_create_an_event(): void
    {
        // 403, not 401: they are logged in, they simply do not organise.
        $this->actingAsMember($this->player)
            ->postJson('/api/v1/events', $this->validPayload())
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        // A gate that answered 403 after inserting would pass the assertion
        // above and still put the row on everybody's planning.
        $this->assertDatabaseCount('events', 0);
    }

    public function test_a_role_holder_without_events_manage_is_refused(): void
    {
        // The player above holds no role, so they cannot tell
        // `permission:events.manage` apart from "is in some role" or "holds
        // some permission". `committee` grants only registrations.view, so
        // this member passes every weaker reading and must still be refused.
        $this->actingAsMember(Member::factory()->committee()->create())
            ->postJson('/api/v1/events', $this->validPayload())
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_events_manage_alone_is_enough_to_create(): void
    {
        // Pins the permission string. The organiser holds every permission,
        // so any string in that middleware separates them from a player with
        // none. This member holds exactly events.manage, so only the right
        // string admits them. Roles are editable data, so "runs the planning,
        // does not administer members" is a realistic role.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiserOnly)
            ->postJson('/api/v1/events', $this->validPayload())
            ->assertStatus(201);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // The code as well as the status: 401 is also what a dead session
        // produces, and the SPA acts on the code, since "log in" and "your
        // session ended" are different screens.
        $this->postJson('/api/v1/events', $this->validPayload())
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_organiser_creates_an_event(): void
    {
        // isPublic and notes are sent with non-default values here and only
        // here. With the payload's own `false`/`null`, a controller that never
        // writes those columns is indistinguishable from one that does, since
        // both match the defaults.
        $response = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload([
                'isPublic' => true,
                'notes' => 'Apporter la partition de Carnaval.',
            ]))
            ->assertStatus(201)
            ->assertJsonPath('title', 'Répétition');

        $this->assertDatabaseHas('events', ['title' => 'Répétition', 'location' => 'Werkhof']);

        // The stored row first: is_public decides whether strangers see the
        // rehearsal schedule.
        $event = Event::query()->sole();
        $this->assertSame('Werkhof', $event->location);
        $this->assertSame('Libre', $event->attire);
        $this->assertTrue($event->is_public);
        $this->assertSame('Apporter la partition de Carnaval.', $event->notes);

        // Then the 201 body, which the SPA puts straight into its list.
        $this->assertSame($event->id, $response->json('id'));
        $this->assertSame('Werkhof', $response->json('location'));
        $this->assertSame('Libre', $response->json('attire'));
        $this->assertTrue($response->json('isPublic'));
        $this->assertSame('Apporter la partition de Carnaval.', $response->json('notes'));
    }

    public function test_the_end_must_come_after_the_start(): void
    {
        // Without this a mistyped time produces an event of negative length,
        // which sorts and renders in ways nobody has designed for.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload([
                'startsAt' => '2026-09-05T12:00:00+02:00',
                'endsAt' => '2026-09-05T10:00:00+02:00',
            ]))
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'endsAt')
            // The token too: without its entry in ApiError::REASONS, `after`
            // falls back to 'invalid_format' for a well-formed timestamp.
            ->assertJsonPath('errors.0.reason', 'must_be_after');

        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_unparseable_end_is_reported_as_a_format_error(): void
    {
        // Pins the rule order on endsAt, which StoreEventRequest calls
        // load-bearing. ApiError reports only the first failed rule per field:
        // `date` then `after` reports Date for this payload, and the reversed
        // order reports After, telling the committee that 'pas une date'
        // "doit être après le début".
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload(['endsAt' => 'pas une date']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'endsAt')
            ->assertJsonPath('errors.0.reason', 'invalid_format');
    }

    public function test_an_event_may_span_two_days(): void
    {
        // "Weekend musical, 3-4 October" from the live planning. The rule is
        // "after", not "same day".
        $response = $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload([
                'title' => 'Weekend musical',
                'startsAt' => '2026-10-03T09:00:00+02:00',
                'endsAt' => '2026-10-04T16:00:00+02:00',
            ]))
            ->assertStatus(201);

        // A controller that dropped endsAt onto the start date would still
        // answer 201, so assert the two dates actually differ.
        $event = Event::query()->sole();
        $this->assertSame('2026-10-03 07:00', $event->starts_at->utc()->format('Y-m-d H:i'));
        $this->assertSame('2026-10-04 14:00', $event->ends_at->utc()->format('Y-m-d H:i'));
        $this->assertSame($event->ends_at->toIso8601String(), $response->json('endsAt'));
    }

    public function test_creating_an_event_makes_a_draft(): void
    {
        // Publishing is a second, deliberate act (ADR 0027), so a wrong venue
        // never reaches every planning screen the moment the form is submitted.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload())
            ->assertStatus(201)
            ->assertJsonPath('publishedAt', null);

        $this->assertNull(Event::query()->sole()->published_at);
    }

    public function test_a_draft_saves_with_only_a_title(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', ['title' => 'Concert, lieu à confirmer'])
            ->assertStatus(201)
            ->assertJsonPath('startsAt', null)
            ->assertJsonPath('endsAt', null)
            ->assertJsonPath('location', null)
            ->assertJsonPath('isPublic', false);
    }

    public function test_a_draft_end_is_still_compared_to_its_start_when_both_are_sent(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => 'Répétition',
                'startsAt' => '2026-09-05T12:00:00+02:00',
                'endsAt' => '2026-09-05T10:00:00+02:00',
            ])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'endsAt')
            ->assertJsonPath('errors.0.reason', 'must_be_after');
    }

    public function test_editing_a_draft_may_clear_the_date_and_location(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $draft))
            ->patchJson("/api/v1/events/{$draft->id}", ['startsAt' => null, 'endsAt' => null, 'location' => null])
            ->assertOk()
            ->assertJsonPath('startsAt', null)
            ->assertJsonPath('endsAt', null)
            ->assertJsonPath('location', null);
    }

    public function test_editing_a_published_event_cannot_clear_the_date_or_location(): void
    {
        $event = Event::factory()->create();

        foreach (['startsAt', 'endsAt', 'location'] as $field) {
            $this->actingAsMember($this->organiser)
                ->withHeaders($this->ifMatch('event', $event))
                ->patchJson("/api/v1/events/{$event->id}", [$field => null])
                ->assertStatus(400)
                ->assertJsonPath('errors.0.field', $field)
                ->assertJsonPath('errors.0.reason', 'required');
        }
    }

    public function test_setting_only_the_end_of_a_dateless_draft_is_not_compared_to_a_missing_start(): void
    {
        $draft = Event::factory()->draft()->create(['starts_at' => null, 'ends_at' => null]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $draft))
            ->patchJson("/api/v1/events/{$draft->id}", ['endsAt' => '2026-09-05T12:00:00+02:00'])
            ->assertOk();
    }

    public function test_the_end_of_a_dated_draft_is_still_compared_to_its_stored_start(): void
    {
        $draft = Event::factory()->draft()->create(['starts_at' => '2026-09-05 10:00:00', 'ends_at' => null]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $draft))
            ->patchJson("/api/v1/events/{$draft->id}", ['endsAt' => '2026-09-05T08:00:00+00:00'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'endsAt')
            ->assertJsonPath('errors.0.reason', 'must_be_after');
    }

    public function test_a_missing_title_is_reported_against_its_own_field(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload(['title' => '']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'title')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_creating_an_event_is_audited(): void
    {
        $this->actingAsMember($this->organiser)->postJson('/api/v1/events', $this->validPayload());

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.created',
            'target_type' => 'event',
            // The label as well as the id: only the label still means
            // something after the event is deleted.
            'target_id' => Event::query()->sole()->id,
            'target_label' => 'Répétition',
        ]);
    }

    public function test_the_wall_clock_time_survives_the_round_trip(): void
    {
        // Typed as 10:00 in Fribourg, stored as 08:00 UTC, read back as 10:00,
        // which is what BandTime is for.
        $this->actingAsMember($this->organiser)->postJson('/api/v1/events', $this->validPayload());

        $event = Event::query()->sole();
        $this->assertSame('08:00', $event->starts_at->utc()->format('H:i'));
    }
    // -------------------------------------------------- editing and deleting

    public function test_an_organiser_edits_one_field_without_blanking_the_others(): void
    {
        // PATCH, so every rule is `sometimes`: a form posting only what changed
        // must not clear everything else.
        $event = Event::factory()->create(['title' => 'Répétition', 'location' => 'Werkhof']);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Répétition + apéritif'])
            ->assertOk()
            ->assertJsonPath('title', 'Répétition + apéritif');

        // The stored title as well as the echoed one: a handler that never
        // called save() would answer 200 with the new title.
        $event->refresh();
        $this->assertSame('Répétition + apéritif', $event->title);
        $this->assertSame('Werkhof', $event->location);
    }

    public function test_every_editable_field_can_be_changed(): void
    {
        // Every value here is one the factory does not produce: `isPublic`
        // false and `attire`/`notes` null coincide with the column defaults,
        // so a PATCH that silently drops a field would otherwise go unnoticed.
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", [
                'title' => 'Cortège du Carnaval',
                'startsAt' => '2027-02-13T14:00:00+01:00',
                'endsAt' => '2027-02-13T18:00:00+01:00',
                'location' => 'Place Georges-Python',
                'attire' => 'Costume complet',
                'isPublic' => true,
                'notes' => 'Rendez-vous une heure avant.',
            ])
            ->assertOk();

        $event->refresh();
        $this->assertSame('Cortège du Carnaval', $event->title);
        $this->assertSame('2027-02-13 13:00', $event->starts_at->utc()->format('Y-m-d H:i'));
        $this->assertSame('2027-02-13 17:00', $event->ends_at->utc()->format('Y-m-d H:i'));
        $this->assertSame('Place Georges-Python', $event->location);
        $this->assertSame('Costume complet', $event->attire);
        $this->assertTrue($event->is_public);
        $this->assertSame('Rendez-vous une heure avant.', $event->notes);
    }

    public function test_clearing_a_nullable_field_stores_null(): void
    {
        // The array_key_exists() case, and the only one in this file: isset()
        // reads false for an explicitly sent null, so clearing the attire
        // would answer 200 and change nothing.
        $event = Event::factory()->create([
            'attire' => 'Costume complet',
            'notes' => 'Rendez-vous une heure avant.',
        ]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['attire' => null, 'notes' => null])
            ->assertOk()
            ->assertJsonPath('attire', null)
            ->assertJsonPath('notes', null);

        $event->refresh();
        $this->assertNull($event->attire);
        $this->assertNull($event->notes);
    }

    public function test_editing_still_refuses_an_end_before_the_start(): void
    {
        // Only the end is sent, so the comparison must use the stored start
        // rather than a startsAt that is not in the request.
        $event = Event::factory()->create([
            'starts_at' => '2026-09-05 08:00:00',
            'ends_at' => '2026-09-05 10:00:00',
        ]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['endsAt' => '2026-09-05T09:00:00+02:00'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'endsAt')
            // The token as well as the field, as in the POST's test.
            ->assertJsonPath('errors.0.reason', 'must_be_after');

        // 400 does not by itself prove nothing was written.
        $this->assertSame('2026-09-05 10:00', $event->fresh()->ends_at->utc()->format('Y-m-d H:i'));
    }

    public function test_editing_reports_an_unparseable_end_as_a_format_error(): void
    {
        // Pins the rule order on the PATCH's endsAt, as on the POST: with
        // `date` after the comparison, this payload is reported as
        // must_be_after.
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['endsAt' => 'pas une date'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'endsAt')
            ->assertJsonPath('errors.0.reason', 'invalid_format');
    }

    public function test_editing_cannot_blank_the_title(): void
    {
        // `sometimes` alone skips only an absent field, and '' is present. The
        // `required` paired with it refuses an emptied title.
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => ''])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'title')
            ->assertJsonPath('errors.0.reason', 'required');

        $this->assertSame('Répétition', $event->fresh()->title);
    }

    public function test_a_player_cannot_edit(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->player)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Non'])
            ->assertStatus(403);

        // As with creating: a gate could answer 403 after writing.
        $this->assertSame('Répétition', $event->fresh()->title);
    }

    public function test_events_manage_alone_is_enough_to_edit(): void
    {
        // Pins the permission string on this route. The middleware argument
        // is written once per route, so the create test's pin does not cover
        // it. A member holding exactly events.manage admits only the right
        // string.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($organiserOnly)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Répétition avancée'])
            ->assertOk();

        $this->assertSame('Répétition avancée', $event->fresh()->title);
    }

    public function test_editing_is_audited(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Répétition + apéritif']);

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.updated',
            'target_type' => 'event',
            'target_id' => $event->id,
            // The new title: the old one names an event that no longer
            // exists under that name.
            'target_label' => 'Répétition + apéritif',
        ]);
    }

    public function test_an_organiser_deletes_an_event(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJson(['ok' => true]);

        // A handler that deleted nothing would also answer {ok: true}.
        $this->assertDatabaseMissing('events', ['id' => $event->id]);
    }

    public function test_a_player_cannot_delete(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->player)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertStatus(403);

        $this->assertDatabaseHas('events', ['id' => $event->id]);
    }

    public function test_events_manage_alone_is_enough_to_delete(): void
    {
        // The DELETE route carries its own copy of the middleware string, so
        // it needs its own pin (see the edit case above).
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $event = Event::factory()->create();

        $this->actingAsMember($organiserOnly)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertOk();

        $this->assertDatabaseMissing('events', ['id' => $event->id]);
    }

    public function test_deleting_is_audited_with_the_title_it_had(): void
    {
        // Captured before the delete: the row is gone by the time anybody
        // reads the audit back.
        $event = Event::factory()->create(['title' => 'Vendanges Cheyres']);

        $this->actingAsMember($this->organiser)->withHeaders($this->ifMatch('event', $event))->deleteJson("/api/v1/events/{$event->id}");

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.deleted',
            'target_type' => 'event',
            'target_id' => $event->id,
            'target_label' => 'Vendanges Cheyres',
        ]);
    }

    public function test_an_unknown_event_is_a_404_not_a_500(): void
    {
        // assertStatus(404) alone cannot tell "route-model binding refused an
        // unknown id" from "there is no such route" (ADR 0012 gives both the
        // same problem document). The route is proved to exist by driving the
        // same verb against an id that resolves, as in
        // EventIndexTest::test_an_unknown_event_is_a_404.
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Toujours là'])
            ->assertOk();

        $this->actingAsMember($this->organiser)
            ->patchJson('/api/v1/events/99999', ['title' => 'X'])
            ->assertStatus(404)
            ->assertJsonPath('code', 'not_found');
    }

    public function test_an_organiser_switches_registration_on_and_off(): void
    {
        // registration_closes_at is the enable switch for the whole
        // registration feature (ADR 0020), and the host has no shell, so this
        // endpoint is the only way to run a souper.
        $event = Event::factory()->create();
        $this->assertFalse($event->takesRegistrations());

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", [
                'registrationClosesAt' => '2026-11-30T23:59:00+01:00',
                'registrationMaxGuests' => 6,
            ])
            ->assertOk()
            ->assertJsonPath('takesRegistrations', true)
            ->assertJsonPath('registrationMaxGuests', 6);

        $this->assertTrue($event->fresh()->takesRegistrations());

        // And off again: clearing the close date is how it is switched off,
        // which is why the rule needs `sometimes` AND `nullable`.
        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['registrationClosesAt' => null])
            ->assertOk()
            ->assertJsonPath('takesRegistrations', false);

        $this->assertFalse($event->fresh()->takesRegistrations());
    }

    public function test_registration_can_be_enabled_at_creation(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload([
                'registrationOpensAt' => '2026-10-01T00:00:00+02:00',
                'registrationClosesAt' => '2026-11-30T23:59:00+01:00',
                'registrationMaxGuests' => 6,
            ]))
            ->assertStatus(201)
            ->assertJsonPath('takesRegistrations', true);

        $event = Event::query()->sole();
        $this->assertNotNull($event->registration_opens_at);
        $this->assertSame(6, $event->registration_max_guests);
    }

    public function test_the_registration_window_cannot_close_before_it_opens(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', $this->validPayload([
                'registrationOpensAt' => '2026-11-30T00:00:00+01:00',
                'registrationClosesAt' => '2026-10-01T00:00:00+02:00',
            ]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'registrationClosesAt');
    }

    public function test_patching_only_the_close_date_compares_against_the_stored_opening(): void
    {
        // The PATCH trap UpdateEventRequest::afterTheStart() handles, on the
        // other date pair: `after:registrationOpensAt` compares against an
        // input field, and the request below sends no opening.
        $event = Event::factory()->create([
            'registration_opens_at' => '2026-11-01 00:00:00',
            'registration_closes_at' => '2026-11-30 00:00:00',
        ]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", [
                'registrationClosesAt' => '2026-10-01T00:00:00+02:00',
            ])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'registrationClosesAt');
    }
}
