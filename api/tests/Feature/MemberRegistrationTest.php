<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Support\FormAudience;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    /** @param  array<string, mixed>  $attributes */
    private function membersForm(array $attributes = []): Event
    {
        return Event::factory()->takingRegistrations()->create([
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
