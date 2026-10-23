<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A form's own settings: whether it is open at all, and whether it asks for
 * an address and a table (#114, ADR 0033).
 */
class RegistrationFormSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organiser = Member::factory()->administrator()->create();
    }

    public function test_a_form_that_is_not_open_answers_404_like_no_form(): void
    {
        $event = Event::factory()->takingRegistrations()->create(['registration_enabled' => false]);
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->getJson("/api/v1/events/{$event->id}/registration")->assertNotFound();
        $this->book($event, [['optionId' => $meal->id, 'quantity' => 1]])->assertNotFound();
        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_form_that_is_not_open_is_not_offered_on_the_agenda(): void
    {
        $event = Event::factory()->takingRegistrations()->public()->create(['registration_enabled' => false]);

        $this->getJson('/api/v1/agenda')
            ->assertOk()
            ->assertJsonPath('data.0.id', $event->id)
            ->assertJsonPath('data.0.registrationOpen', false);
    }

    public function test_a_new_event_starts_with_its_form_closed(): void
    {
        // So the committee can build the souper's form in October and open
        // it in December.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events', [
                'title' => 'Souper 2027',
                'startsAt' => now()->addMonths(2)->toIso8601String(),
                'registrationClosesAt' => now()->addMonth()->toIso8601String(),
            ])
            ->assertCreated()
            ->assertJsonPath('registrationEnabled', false)
            ->assertJsonPath('takesRegistrations', true);
    }

    public function test_the_committee_opens_the_form(): void
    {
        $event = Event::factory()->takingRegistrations()->create(['registration_enabled' => false]);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['registrationEnabled' => true])
            ->assertOk()
            ->assertJsonPath('registrationEnabled', true);

        $this->getJson("/api/v1/events/{$event->id}/registration")->assertOk();
    }

    public function test_forms_taking_bookings_today_stay_open_through_the_migration(): void
    {
        // Raw rows, as the schema stood before: the model now writes the new
        // columns.
        $this->formSwitches()->down();
        $row = fn (array $extra) => DB::table('events')->insertGetId([
            'title' => 'Souper',
            'starts_at' => now()->addMonth(),
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
            ...$extra,
        ]);
        $taking = $row(['registration_closes_at' => now()->addWeeks(2)]);

        $this->formSwitches()->up();

        $this->assertSame(1, (int) ((array) DB::table('events')->find($taking))['registration_enabled']);
        $this->assertTrue(Event::query()->findOrFail($taking)->registrationIsOpen());
        // The column's default is false for what comes after.
        $this->assertSame(0, (int) ((array) DB::table('events')->find($row([])))['registration_enabled']);
    }

    public function test_the_form_switches_migration_is_idempotent(): void
    {
        $this->formSwitches()->up();
        $this->formSwitches()->up();

        $this->assertTrue(Schema::hasColumns('events', [
            'registration_enabled', 'registration_asks_address', 'registration_asks_table',
        ]));
    }

    public function test_a_form_asks_for_the_address_and_the_table_unless_told_not_to(): void
    {
        $event = Event::factory()->takingRegistrations()->create();

        $this->getJson("/api/v1/events/{$event->id}/registration")
            ->assertOk()
            ->assertJsonPath('asksAddress', true)
            ->assertJsonPath('asksTable', true);
    }

    public function test_a_form_that_does_not_ask_for_them_stores_neither(): void
    {
        $event = Event::factory()->takingRegistrations()->create([
            'registration_asks_address' => false,
            'registration_asks_table' => false,
        ]);
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->getJson("/api/v1/events/{$event->id}/registration")
            ->assertJsonPath('asksAddress', false)
            ->assertJsonPath('asksTable', false);

        $this->book($event, [['optionId' => $meal->id, 'quantity' => 1]], [
            'address' => 'Route des Alpes 12',
            'tableName' => 'Avec les Python',
        ])->assertCreated();

        $booking = Registration::query()->sole();
        $this->assertNull($booking->address);
        $this->assertNull($booking->table_name);
    }

    public function test_the_event_carries_the_form_settings_and_takes_them(): void
    {
        $event = Event::factory()->takingRegistrations()->create();

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", [
                'registrationAsksAddress' => false,
                'registrationAsksTable' => false,
            ])
            ->assertOk()
            ->assertJsonPath('registrationEnabled', true)
            ->assertJsonPath('registrationAsksAddress', false)
            ->assertJsonPath('registrationAsksTable', false);
    }

    /**
     * @param  list<array<string, mixed>>  $choices
     * @param  array<string, mixed>  $extra
     */
    private function book(Event $event, array $choices, array $extra = []): TestResponse
    {
        return $this->postJson(
            "/api/v1/events/{$event->id}/registrations",
            $this->publicWriteBody([
                'firstName' => 'Delphine',
                'lastName' => 'Maillard',
                'email' => 'delphine@example.test',
                'phone' => '079 322 12 57',
                'choices' => $choices,
                ...$extra,
            ]),
            $this->publicWriteHeaders(),
        );
    }

    private function formSwitches(): object
    {
        return require database_path('migrations/2026_10_23_000002_add_form_switches_to_events.php');
    }
}
