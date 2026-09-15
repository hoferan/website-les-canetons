<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactMessageSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_message_starts_unhandled(): void
    {
        $message = ContactMessage::factory()->create();

        $this->assertNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_a_message_records_who_handled_it(): void
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->handled($camille)->create();

        $this->assertNotNull($message->handled_at);
        $this->assertTrue($message->handledBy->is($camille));
    }

    public function test_the_record_of_who_handled_it_survives_that_member_leaving(): void
    {
        // nullOnDelete rather than cascade: losing the member must not lose
        // the message, which is a stranger's and not the band's to discard.
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $message = ContactMessage::factory()->handled($camille)->create();

        $camille->delete();

        $message->refresh();
        $this->assertNotNull($message->handled_at);
        $this->assertNull($message->handled_by_member_id);
    }

    public function test_the_migration_is_safe_to_run_twice(): void
    {
        // RunPendingMigrations re-checks on every request; a migration that
        // throws on a second pass takes the whole API down with a 503.
        // Invoke the migration again to verify it is truly idempotent.
        (require database_path('migrations/2026_09_15_000001_add_handled_to_contact_messages.php'))->up();

        $this->assertTrue(Schema::hasColumn('contact_messages', 'handled_at'));
        $this->assertTrue(Schema::hasColumn('contact_messages', 'handled_by_member_id'));
    }
}
