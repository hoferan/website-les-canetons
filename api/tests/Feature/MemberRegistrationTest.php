<?php

namespace Tests\Feature;

use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\EntityTag;
use App\Support\FormAudience;
use App\Support\OptionKind;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Forms for members only: members book with their account, one booking each,
 * which they change or withdraw until the form closes (#318, ADR 0034).
 */
class MemberRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_form_is_public_until_the_committee_says_otherwise(): void
    {
        $event = Event::factory()->takingRegistrations()->create();

        $this->assertSame(FormAudience::Public, $event->fresh()->registration_audience);
        $this->assertFalse($event->fresh()->isMembersOnly());
    }

    public function test_a_members_booking_needs_no_email_or_phone(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $member = Member::factory()->named('Anna', 'Muster')->create();

        $booking = Registration::create([
            'event_id' => $event->id,
            'member_id' => $member->id,
            'first_name' => 'Anna',
            'last_name' => 'Muster',
        ]);

        $this->assertTrue($booking->fresh()->isMember());
        $this->assertNull($booking->fresh()->email);
    }

    public function test_a_member_books_an_event_once(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $member = Member::factory()->create();
        $row = ['event_id' => $event->id, 'member_id' => $member->id, 'first_name' => 'A', 'last_name' => 'B'];

        Registration::create($row);

        $this->expectException(QueryException::class);
        Registration::create($row);
    }

    public function test_the_member_bookings_migration_is_idempotent(): void
    {
        $migration = require database_path('migrations/2026_10_24_000001_add_member_bookings.php');

        $migration->up();
        $migration->up();

        $this->assertSame(FormAudience::Public, Event::factory()->create()->fresh()->registration_audience);
    }

    public function test_nobody_without_a_session_learns_that_a_members_form_exists(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->getJson("/api/v1/events/{$event->id}/registration")->assertNotFound();
        $this->book($event, [['optionId' => $meal->id, 'quantity' => 1]])->assertNotFound();
        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_member_reads_a_members_form(): void
    {
        $event = $this->membersForm();

        $this->actingAsMember(Member::factory()->create())
            ->getJson("/api/v1/events/{$event->id}/registration")
            ->assertOk()
            ->assertJsonPath('audience', 'members')
            ->assertJsonPath('open', true);
    }

    public function test_a_public_form_says_it_is_public(): void
    {
        $event = Event::factory()->takingRegistrations()->create();

        $this->getJson("/api/v1/events/{$event->id}/registration")
            ->assertOk()
            ->assertJsonPath('audience', 'public');
    }

    public function test_the_anonymous_booking_path_refuses_a_members_form_even_with_a_session(): void
    {
        // Otherwise a member could book twice, once as a guest, and the
        // form's contact rules would be the anonymous ones.
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->actingAsMember(Member::factory()->create());
        $this->book($event, [['optionId' => $meal->id, 'quantity' => 1]])->assertNotFound();
    }

    public function test_the_agenda_offers_no_booking_link_for_a_members_form(): void
    {
        $event = $this->membersForm(['is_public' => true]);

        $this->getJson('/api/v1/agenda')
            ->assertOk()
            ->assertJsonPath('data.0.id', $event->id)
            ->assertJsonPath('data.0.registrationOpen', false);
    }

    public function test_the_form_editor_saves_the_audience(): void
    {
        $event = Event::factory()->takingRegistrations()->create();

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('event.options', $event))
            ->putJson("/api/v1/events/{$event->id}/registration-options", [
                'options' => [],
                'form' => [
                    'registrationEnabled' => true,
                    'registrationOpensAt' => null,
                    'registrationClosesAt' => now()->addMonth()->toIso8601String(),
                    'registrationMaxGuests' => null,
                    'registrationAsksAddress' => true,
                    'registrationAsksTable' => true,
                    'registrationAudience' => 'members',
                ],
            ])
            ->assertOk();

        $this->assertTrue($event->fresh()->isMembersOnly());
    }

    public function test_the_form_editor_may_leave_the_audience_out(): void
    {
        // A screen loaded before the deploy sends the six settings it knows.
        $event = $this->membersForm();

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('event.options', $event))
            ->putJson("/api/v1/events/{$event->id}/registration-options", [
                'options' => [],
                'form' => [
                    'registrationEnabled' => true,
                    'registrationOpensAt' => null,
                    'registrationClosesAt' => now()->addMonth()->toIso8601String(),
                    'registrationMaxGuests' => null,
                    'registrationAsksAddress' => true,
                    'registrationAsksTable' => true,
                ],
            ])
            ->assertOk();

        $this->assertTrue($event->fresh()->isMembersOnly());
    }

    public function test_the_event_carries_its_audience(): void
    {
        $event = $this->membersForm();

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('registrationAudience', 'members');
    }

    // ------------------------------------------------- a member books

    public function test_a_member_books_a_members_form_with_their_account(): void
    {
        Mail::fake();
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $anna = Member::factory()->named('Anna', 'Muster')->create();

        $this->actingAsMember($anna)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 2]]])
            ->assertCreated()
            ->assertJsonPath('isMember', true)
            ->assertJsonPath('firstName', 'Anna')
            ->assertJsonPath('lastName', 'Muster')
            ->assertJsonPath('email', null)
            ->assertJsonPath('phone', null)
            ->assertJsonPath('guestCount', 2);

        $this->assertSame($anna->id, Registration::query()->sole()->member_id);
        Mail::assertNothingSent();
    }

    public function test_a_member_reads_their_own_booking_and_nobody_elses(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $anna = Member::factory()->create();

        $this->actingAsMember($anna)->getJson($this->mine($event))->assertNotFound();
        $this->bookAs(Member::factory()->create(), $event, [['optionId' => $meal->id, 'quantity' => 1]]);
        $this->actingAsMember($anna)->getJson($this->mine($event))->assertNotFound();

        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 3]]);
        $this->actingAsMember($anna)->getJson($this->mine($event))
            ->assertOk()
            ->assertJsonPath('choices.0.quantity', 3);
    }

    public function test_a_member_changes_their_answers_and_keeps_one_booking(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $size = RegistrationOption::factory()->kind(OptionKind::Text)->create(['event_id' => $event->id, 'label' => 'Taille']);
        $anna = Member::factory()->create();

        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 2], ['optionId' => $size->id, 'value' => 'M']]);

        $this->actingAsMember($anna)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
            ->assertOk()
            ->assertJsonPath('guestCount', 1)
            ->assertJsonCount(1, 'choices');

        $this->assertSame(1, Registration::query()->count());
        $this->assertSame(1, RegistrationChoice::query()->count());
    }

    public function test_the_name_follows_the_account_when_the_answers_change(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $anna = Member::factory()->named('Anna', 'Muster')->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $anna->update(['last_name' => 'Brügger']);

        $this->actingAsMember($anna)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
            ->assertOk()
            ->assertJsonPath('lastName', 'Brügger');
    }

    public function test_a_member_withdraws(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $anna = Member::factory()->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $this->actingAsMember($anna)->deleteJson($this->mine($event))->assertOk()->assertJsonPath('ok', true);

        $this->assertSame(0, Registration::query()->count());
        $this->actingAsMember($anna)->deleteJson($this->mine($event))->assertNotFound();
    }

    public function test_nothing_changes_before_the_form_opens(): void
    {
        $event = $this->membersForm([], 'registrationNotYetOpen');
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->actingAsMember(Member::factory()->create())
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'registration_not_open');
    }

    public function test_after_the_form_closes_the_answers_are_read_only(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $anna = Member::factory()->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1]]);
        $event->update(['registration_closes_at' => now()->subMinute()]);

        $this->actingAsMember($anna)->getJson($this->mine($event))->assertOk();
        $this->actingAsMember($anna)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 2]]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'registration_closed');
        $this->actingAsMember($anna)->deleteJson($this->mine($event))
            ->assertStatus(409)
            ->assertJsonPath('code', 'registration_closed');
        $this->assertSame(1, Registration::query()->count());
    }

    public function test_there_is_no_member_path_on_a_public_form_or_a_draft(): void
    {
        $public = Event::factory()->takingRegistrations()->create();
        $draft = $this->membersForm(['published_at' => null]);
        $closed = $this->membersForm(['registration_enabled' => false]);
        $member = Member::factory()->administrator()->create();

        foreach ([$public, $draft, $closed] as $event) {
            $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
            $this->actingAsMember($member)->getJson($this->mine($event))->assertNotFound();
            $this->actingAsMember($member)
                ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
                ->assertNotFound();
        }
    }

    public function test_the_member_path_needs_a_session(): void
    {
        $event = $this->membersForm();

        $this->putJson($this->mine($event), ['choices' => []])->assertUnauthorized();
    }

    public function test_a_change_may_keep_the_last_places_it_already_holds(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id, 'capacity' => 3]);
        $anna = Member::factory()->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 3]]);

        $this->actingAsMember($anna)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 3]]])
            ->assertOk();

        $this->actingAsMember(Member::factory()->create())
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.quantity')
            ->assertJsonPath('errors.0.reason', 'not_enough_places');
    }

    public function test_a_members_booking_keeps_to_the_per_booking_cap_and_the_required_blocks(): void
    {
        $event = $this->membersForm(['registration_max_guests' => 2]);
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $size = RegistrationOption::factory()->kind(OptionKind::Text)->create(['event_id' => $event->id, 'required' => true]);
        $member = Member::factory()->create();

        $this->actingAsMember($member)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 3], ['optionId' => $size->id, 'value' => 'L']]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.reason', 'too_many_guests');

        $this->actingAsMember($member)
            ->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', "answers.{$size->id}");
    }

    public function test_a_members_write_locks_the_event_before_reading_anything(): void
    {
        // Both the cap and "one booking each" are a count followed by a
        // write, so every member write takes the ADR 0031 lock first.
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $this->actingAsMember(Member::factory()->create());

        $log = [];
        DB::listen(function (QueryExecuted $query) use (&$log): void {
            $log[] = strtolower($query->sql);
        });
        $this->app['events']->listen(TransactionBeginning::class, function () use (&$log): void {
            $log[] = 'BEGIN';
        });

        $this->putJson($this->mine($event), ['choices' => [['optionId' => $meal->id, 'quantity' => 1]]])->assertCreated();

        $lock = array_search(true, array_map(
            fn (string $sql): bool => str_contains($sql, 'from `events`') && str_contains($sql, 'for update'),
            $log,
        ), true);
        $this->assertIsInt($lock, 'No lock on the event.');
        $this->assertSame('BEGIN', $log[$lock - 1] ?? null, 'The event lock is not the first statement of its transaction.');
    }

    public function test_a_members_booking_does_not_move_the_events_tag(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $before = EntityTag::compute('event', $event);

        $this->bookAs(Member::factory()->create(), $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $this->assertSame($before, EntityTag::compute('event', $event));
    }

    public function test_an_event_read_without_the_callers_subselect_carries_no_answer_flags(): void
    {
        // How EntityTag renders it: a fresh row, no caller. Flags read from a
        // missing subselect would put the window's open state into the tag.
        $event = $this->membersForm();

        $rendered = (new EventResource(Event::query()->findOrFail($event->id)))->toArray(Request::create('/'));

        $this->assertNull($rendered['myRegistration']);
    }

    public function test_the_planning_says_whether_i_have_answered_a_members_form(): void
    {
        $form = $this->membersForm(['title' => 'Pique-nique']);
        $public = Event::factory()->takingRegistrations()->create(['title' => 'Souper', 'starts_at' => now()->addMonths(3)]);
        $meal = RegistrationOption::factory()->create(['event_id' => $form->id]);
        $anna = Member::factory()->create();

        $row = fn (int $id) => collect($this->actingAsMember($anna)->getJson('/api/v1/events')->assertOk()->json('data'))
            ->firstWhere('id', $id);

        $this->assertSame(['answered' => false, 'open' => true], $row($form->id)['myRegistration']);
        $this->assertNull($row($public->id)['myRegistration']);

        $this->bookAs($anna, $form, [['optionId' => $meal->id, 'quantity' => 1]]);
        $this->assertSame(['answered' => true, 'open' => true], $row($form->id)['myRegistration']);
    }

    public function test_the_guest_list_marks_a_members_booking(): void
    {
        $event = $this->membersForm();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $this->bookAs(Member::factory()->named('Anna', 'Muster')->create(), $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $this->actingAsMember(Member::factory()->committee()->create())
            ->getJson("/api/v1/events/{$event->id}/registrations")
            ->assertOk()
            ->assertJsonPath('data.0.isMember', true)
            ->assertJsonPath('data.0.firstName', 'Anna')
            ->assertJsonPath('data.0.email', null);
    }

    private function mine(Event $event): string
    {
        return "/api/v1/events/{$event->id}/my-registration";
    }

    /** @param  list<array<string, mixed>>  $choices */
    private function bookAs(Member $member, Event $event, array $choices): void
    {
        $this->actingAsMember($member)
            ->putJson($this->mine($event), ['choices' => $choices])
            ->assertSuccessful();
    }

    /** @param  array<string, mixed>  $attributes */
    private function membersForm(array $attributes = [], string $state = 'takingRegistrations'): Event
    {
        return Event::factory()->{$state}()->create([
            'registration_audience' => FormAudience::Members,
            ...$attributes,
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $choices
     */
    private function book(Event $event, array $choices): TestResponse
    {
        return $this->postJson(
            "/api/v1/events/{$event->id}/registrations",
            $this->publicWriteBody([
                'firstName' => 'Delphine',
                'lastName' => 'Maillard',
                'email' => 'delphine@example.test',
                'phone' => '079 322 12 57',
                'choices' => $choices,
            ]),
            $this->publicWriteHeaders(),
        );
    }
}
