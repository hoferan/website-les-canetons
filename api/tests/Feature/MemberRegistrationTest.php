<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Support\FormAudience;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
