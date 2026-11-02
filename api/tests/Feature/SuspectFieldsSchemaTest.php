<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Registration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SuspectFieldsSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_booking_and_a_message_start_unflagged(): void
    {
        $this->assertNull(Registration::factory()->create()->refresh()->suspect_fields);
        $this->assertNull(ContactMessage::factory()->create()->refresh()->suspect_fields);
    }

    public function test_the_flagged_fields_come_back_as_a_list(): void
    {
        $booking = Registration::factory()->create(['suspect_fields' => ['tableName', 'answers']]);
        $message = ContactMessage::factory()->create(['suspect_fields' => ['message']]);

        $this->assertSame(['tableName', 'answers'], $booking->refresh()->suspect_fields);
        $this->assertSame(['message'], $message->refresh()->suspect_fields);
    }

    public function test_the_migration_is_safe_to_run_twice(): void
    {
        // RunPendingMigrations re-checks on every request; a migration that
        // throws on a second pass takes the whole API down with a 503.
        (require database_path('migrations/2026_11_02_000001_add_suspect_fields_to_submissions.php'))->up();

        $this->assertTrue(Schema::hasColumn('registrations', 'suspect_fields'));
        $this->assertTrue(Schema::hasColumn('contact_messages', 'suspect_fields'));
    }
}
