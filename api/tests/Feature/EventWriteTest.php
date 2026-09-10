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
        // 2026_09_07_000001 gives Permission::cases() — events.manage
        // included. Its name predates the role being more than members.manage.
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
            ->postJson('/api/events', $this->validPayload())
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        // The refusal has to be a refusal to WRITE, not merely a refused
        // status: a gate that answered 403 after inserting would pass the
        // assertion above and still put the row on everybody's planning.
        $this->assertDatabaseCount('events', 0);
    }

    public function test_a_role_holder_without_events_manage_is_refused(): void
    {
        // The player above holds NO role at all, so they cannot tell
        // `permission:events.manage` apart from a gate reading "is in some
        // role" or "holds some permission". `committee` grants exactly one
        // permission, registrations.view: this member passes every weaker
        // reading of the check and must still be refused.
        $this->actingAsMember(Member::factory()->committee()->create())
            ->postJson('/api/events', $this->validPayload())
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_events_manage_alone_is_enough_to_create(): void
    {
        // PINS THE PERMISSION STRING ITSELF. The organiser holds `direction`,
        // which the seed grants Permission::cases() — every permission — so
        // any string at all in that middleware separates them from a player
        // with none, and swapping events.manage for members.manage left the
        // whole file green. This member holds a fixture role granting exactly
        // events.manage and nothing else, so only the right string admits
        // them. It is also the realistic case: roles are editable data, and
        // "runs the planning, does not administer members" is a role the band
        // may well create.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiserOnly)
            ->postJson('/api/events', $this->validPayload())
            ->assertStatus(201);

        $this->assertDatabaseCount('events', 1);
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        // The code as well as the status, the same pairing EventIndexTest
        // makes: 401 is also what a stale CSRF token or a dead session would
        // produce, and the SPA acts on the code — "log in" and "your session
        // ended" are different screens.
        $this->postJson('/api/events', $this->validPayload())
            ->assertStatus(401)
            ->assertJson(['code' => 'not_authenticated']);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_organiser_creates_an_event(): void
    {
        // isPublic and notes are sent NON-DEFAULT, here and only here. With
        // the payload's own `false`/`null` a controller that never writes
        // those two columns is indistinguishable from one that does: false is
        // both the column default and Event::$attributes', and null is the
        // column's. Dropping either from Event::create() left this whole file
        // green until this test sent something else. The other tests keep the
        // default shape, which is the one the plan pinned.
        $response = $this->actingAsMember($this->organiser)
            ->postJson('/api/events', $this->validPayload([
                'isPublic' => true,
                'notes' => 'Apporter la partition de Carnaval.',
            ]))
            ->assertStatus(201)
            ->assertJsonPath('title', 'Répétition');

        $this->assertDatabaseHas('events', ['title' => 'Répétition', 'location' => 'Werkhof']);

        // On the stored row first: this is what the next reader of the
        // planning gets, and is_public in particular is the column that
        // decides whether the rehearsal schedule is visible to strangers.
        $event = Event::query()->sole();
        $this->assertSame('Werkhof', $event->location);
        $this->assertSame('Libre', $event->attire);
        $this->assertTrue($event->is_public);
        $this->assertSame('Apporter la partition de Carnaval.', $event->notes);

        // Then on the 201 body, which the SPA puts straight into the list it
        // is already showing rather than re-fetching.
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
            ->postJson('/api/events', $this->validPayload([
                'startsAt' => '2026-09-05T12:00:00+02:00',
                'endsAt' => '2026-09-05T10:00:00+02:00',
            ]))
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('fields.0.field', 'endsAt')
            // The token, not just the field: `after` is absent from
            // ApiError::REASONS by default and would silently fall back to
            // 'invalid_format' — "n'est pas dans un format valide" for a
            // perfectly well-formed timestamp.
            ->assertJsonPath('fields.0.reason', 'must_be_after');

        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_unparseable_end_is_reported_as_a_format_error(): void
    {
        // PINS THE RULE ORDER on endsAt, which StoreEventRequest calls
        // load-bearing and nothing else checked. ApiError reports only the
        // FIRST failed rule per field; measured 2026-09-10 on this stack, the
        // shipped `date`-then-`after` order reports Date for this payload and
        // the reversed order reports After. So with the rules the other way
        // round the committee is told that 'pas une date' "doit être après le
        // début" — sent to fix the one thing that was not wrong.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/events', $this->validPayload(['endsAt' => 'pas une date']))
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'endsAt')
            ->assertJsonPath('fields.0.reason', 'invalid_format');
    }

    public function test_an_event_may_span_two_days(): void
    {
        // "Weekend musical, 3-4 October" from the live planning. The rule is
        // "after", not "same day".
        $response = $this->actingAsMember($this->organiser)
            ->postJson('/api/events', $this->validPayload([
                'title' => 'Weekend musical',
                'startsAt' => '2026-10-03T09:00:00+02:00',
                'endsAt' => '2026-10-04T16:00:00+02:00',
            ]))
            ->assertStatus(201);

        // 201 alone cannot tell "the two-day event was stored" from "an event
        // was stored": a controller that dropped endsAt onto the start date
        // would answer 201 and quietly turn C6's whole reason for existing
        // back into a one-day row. Assert the two dates actually differ.
        $event = Event::query()->sole();
        $this->assertSame('2026-10-03 07:00', $event->starts_at->utc()->format('Y-m-d H:i'));
        $this->assertSame('2026-10-04 14:00', $event->ends_at->utc()->format('Y-m-d H:i'));
        $this->assertSame($event->ends_at->toIso8601String(), $response->json('endsAt'));
    }

    public function test_a_missing_title_is_reported_against_its_own_field(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/events', $this->validPayload(['title' => '']))
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'title')
            ->assertJsonPath('fields.0.reason', 'required');
    }

    public function test_creating_an_event_is_audited(): void
    {
        $this->actingAsMember($this->organiser)->postJson('/api/events', $this->validPayload());

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.created',
            'target_type' => 'event',
            // The id and the label both, because the label is the only part of
            // an audit row that still means something after the event is
            // deleted — an entry naming neither is a timestamp.
            'target_id' => Event::query()->sole()->id,
            'target_label' => 'Répétition',
        ]);
    }

    public function test_the_wall_clock_time_survives_the_round_trip(): void
    {
        // Typed as 10:00 in Fribourg, stored as 08:00 UTC, read back as 10:00.
        // This is the whole reason BandTime exists.
        $this->actingAsMember($this->organiser)->postJson('/api/events', $this->validPayload());

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
            ->patchJson("/api/events/{$event->id}", ['title' => 'Répétition + apéritif'])
            ->assertOk()
            ->assertJsonPath('title', 'Répétition + apéritif');

        // The STORED title as well as the echoed one. A handler that assigned
        // the attribute and never called save() answers 200 with the new title
        // and leaves the planning exactly as it was — and the location
        // assertion below would pass right alongside it.
        $event->refresh();
        $this->assertSame('Répétition + apéritif', $event->title);
        $this->assertSame('Werkhof', $event->location);
    }

    public function test_every_editable_field_can_be_changed(): void
    {
        // Every value here is one the factory does NOT produce, which is the
        // whole point: `isPublic` false and `attire`/`notes` null coincide with
        // the column defaults, so a PATCH that silently drops a field is
        // indistinguishable from one that writes it unless the test sends
        // something else. Task 5 lost `is_public` out of its insert with all
        // eight tests green for exactly that reason (see 6250d7f).
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", [
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
        // THE array_key_exists() CASE, and the only one in this file: isset()
        // reads false for an explicitly-sent null, so clearing the attire —
        // the committee deciding a gig is in ordinary clothes after all —
        // would answer 200 and change nothing. Every other test here sends a
        // value, which is how that stays invisible.
        $event = Event::factory()->create([
            'attire' => 'Costume complet',
            'notes' => 'Rendez-vous une heure avant.',
        ]);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", ['attire' => null, 'notes' => null])
            ->assertOk()
            ->assertJsonPath('attire', null)
            ->assertJsonPath('notes', null);

        $event->refresh();
        $this->assertNull($event->attire);
        $this->assertNull($event->notes);
    }

    public function test_editing_still_refuses_an_end_before_the_start(): void
    {
        // The rule has to hold on PATCH too, and this is the sharp case: only the
        // END is sent, so the comparison must reach for the STORED start rather
        // than a startsAt that is not in the request.
        $event = Event::factory()->create([
            'starts_at' => '2026-09-05 08:00:00',
            'ends_at' => '2026-09-05 10:00:00',
        ]);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", ['endsAt' => '2026-09-05T09:00:00+02:00'])
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'endsAt')
            // The token as well as the field, for the reason the POST's own
            // test gives: `after` would otherwise fall back to
            // 'invalid_format' and call a well-formed timestamp malformed.
            ->assertJsonPath('fields.0.reason', 'must_be_after');

        // 400 does not by itself prove nothing was written.
        $this->assertSame('2026-09-05 10:00', $event->fresh()->ends_at->utc()->format('Y-m-d H:i'));
    }

    public function test_editing_reports_an_unparseable_end_as_a_format_error(): void
    {
        // PINS THE RULE ORDER on the PATCH's endsAt, the same load-bearing
        // order StoreEventRequest documents and for the same reason: ApiError
        // reports only the FIRST failed rule per field. Measured 2026-09-10 on
        // this stack — with `date` moved after the comparison, this payload is
        // reported as must_be_after, so the committee is told that 'pas une
        // date' "doit être après le début", about the one thing that was not
        // wrong.
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", ['endsAt' => 'pas une date'])
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'endsAt')
            ->assertJsonPath('fields.0.reason', 'invalid_format');
    }

    public function test_editing_cannot_blank_the_title(): void
    {
        // `sometimes` on its own would let this through: it skips an ABSENT
        // field, and '' is present and a string. The `required` paired with it
        // is what refuses an emptied title, and nothing else in this file
        // would notice if it were dropped.
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", ['title' => ''])
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'title')
            ->assertJsonPath('fields.0.reason', 'required');

        $this->assertSame('Répétition', $event->fresh()->title);
    }

    public function test_a_player_cannot_edit(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->player)
            ->patchJson("/api/events/{$event->id}", ['title' => 'Non'])
            ->assertStatus(403);

        // As with creating: a gate that answered 403 after writing would pass
        // the status assertion and still have edited everybody's planning.
        $this->assertSame('Répétition', $event->fresh()->title);
    }

    public function test_events_manage_alone_is_enough_to_edit(): void
    {
        // PINS THE PERMISSION STRING ON THIS ROUTE. The middleware argument is
        // written once per route, so the create test's pin says nothing about
        // this one: the organiser holds `direction` (every permission) and the
        // player holds none, so any string at all separates them and a typo
        // here would be caught by nothing. A member holding a fixture role
        // that grants exactly events.manage admits only the right string.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($organiserOnly)
            ->patchJson("/api/events/{$event->id}", ['title' => 'Répétition avancée'])
            ->assertOk();

        $this->assertSame('Répétition avancée', $event->fresh()->title);
    }

    public function test_editing_is_audited(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/events/{$event->id}", ['title' => 'Répétition + apéritif']);

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'event.updated',
            'target_type' => 'event',
            'target_id' => $event->id,
            // The NEW title: a row still labelled with the old one names an
            // event that no longer exists under that name.
            'target_label' => 'Répétition + apéritif',
        ]);
    }

    public function test_an_organiser_deletes_an_event(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->deleteJson("/api/events/{$event->id}")
            ->assertOk()
            ->assertJson(['ok' => true]);

        // {ok: true} is exactly what a handler that deleted nothing would also
        // answer; this line is the one that says the row is gone.
        $this->assertDatabaseMissing('events', ['id' => $event->id]);
    }

    public function test_a_player_cannot_delete(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->player)
            ->deleteJson("/api/events/{$event->id}")
            ->assertStatus(403);

        $this->assertDatabaseHas('events', ['id' => $event->id]);
    }

    public function test_events_manage_alone_is_enough_to_delete(): void
    {
        // The DELETE route carries its own copy of the middleware string, so
        // it needs its own pin — see the edit case above for why neither the
        // organiser nor the player can supply one.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $event = Event::factory()->create();

        $this->actingAsMember($organiserOnly)
            ->deleteJson("/api/events/{$event->id}")
            ->assertOk();

        $this->assertDatabaseMissing('events', ['id' => $event->id]);
    }

    public function test_deleting_is_audited_with_the_title_it_had(): void
    {
        // Captured BEFORE the delete: the row is gone by the time anybody reads
        // the audit back.
        $event = Event::factory()->create(['title' => 'Vendanges Cheyres']);

        $this->actingAsMember($this->organiser)->deleteJson("/api/events/{$event->id}");

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
        // unknown id" from "there is no such route": in Task 4 that bare
        // assertion passed with the route deleted outright. The message is
        // unique to the binding failing to resolve, and is in the JSON body
        // whether or not APP_DEBUG is on — only trace/exception/file are
        // debug-gated. Same pairing as
        // EventIndexTest::test_an_unknown_event_is_a_404.
        $this->actingAsMember($this->organiser)->patchJson('/api/events/99999', ['title' => 'X'])
            ->assertStatus(404)
            ->assertJsonFragment(['message' => 'No query results for model [App\\Models\\Event] 99999']);
    }
}
