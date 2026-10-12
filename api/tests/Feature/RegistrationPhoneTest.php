<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * #129: every booking keeps the number as typed and gains it in E.164 when
 * it can be read as one. App\Support\PhoneNumber decides what is readable;
 * PhoneNumberTest pins that. This pins where it is applied.
 */
class RegistrationPhoneTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private RegistrationOption $meal;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->event = Event::factory()->takingRegistrations()->create();
        $this->meal = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
    }

    private function book(string $phone): Registration
    {
        $this->postJson("/api/v1/events/{$this->event->id}/registrations", $this->publicWriteBody([
            'firstName' => 'Delphine',
            'lastName' => 'Maillard',
            'email' => 'delphine@example.test',
            'phone' => $phone,
            'address' => null,
            'tableName' => null,
            'choices' => [['optionId' => $this->meal->id, 'quantity' => 1]],
        ]), $this->publicWriteHeaders())->assertStatus(201);

        return Registration::query()->latest('id')->firstOrFail();
    }

    public function test_a_booking_keeps_the_number_as_typed_and_adds_it_in_e164(): void
    {
        $booking = $this->book('+41 (0)79 322 12 57');

        $this->assertSame('+41 (0)79 322 12 57', $booking->phone);
        $this->assertSame('+41793221257', $booking->phone_e164);
    }

    public function test_a_number_that_cannot_be_read_still_books(): void
    {
        // The public form does not refuse a guest for how they write their
        // number: the committee reads it instead of tapping it.
        $booking = $this->book('079 322 12 57 (soir)');

        $this->assertSame('079 322 12 57 (soir)', $booking->phone);
        $this->assertNull($booking->phone_e164);
    }

    public function test_the_guest_list_carries_both(): void
    {
        $this->book('079 322 12 57');

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->getJson("/api/v1/events/{$this->event->id}/registrations")
            ->assertOk()
            ->assertJsonPath('data.0.phone', '079 322 12 57')
            ->assertJsonPath('data.0.phoneE164', '+41793221257');
    }

    public function test_correcting_the_number_corrects_the_dial_string(): void
    {
        $booking = $this->book('079 322 12 57');

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['phone' => '026 322 11 22'])
            ->assertOk()
            ->assertJsonPath('phone', '026 322 11 22')
            ->assertJsonPath('phoneE164', '+41263221122');
    }

    public function test_the_migration_fills_existing_bookings_and_may_run_again(): void
    {
        $readable = $this->book('079 322 12 57');
        $unreadable = $this->book('à demander');
        // As a booking made before the column existed would stand.
        DB::table('registrations')->update(['phone_e164' => null]);

        $migration = require database_path('migrations/2026_10_13_000002_add_phone_e164_to_registrations.php');
        $migration->up();
        $migration->up();

        $this->assertSame('+41793221257', $readable->fresh()?->phone_e164);
        $this->assertNull($unreadable->fresh()?->phone_e164);
        $this->assertSame('079 322 12 57', $readable->fresh()->phone);
    }
}
