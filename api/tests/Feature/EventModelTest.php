<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EventModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_event_stores_its_start_and_end_as_datetimes(): void
    {
        $event = Event::factory()->create([
            'starts_at' => '2026-10-03 07:00:00',
            'ends_at' => '2026-10-04 14:00:00',
        ]);

        // The two-day case: "Weekend musical, 3-4 October" is one event whose
        // start and end fall on different days.
        $this->assertSame('2026-10-03', $event->starts_at->format('Y-m-d'));
        $this->assertSame('2026-10-04', $event->ends_at->format('Y-m-d'));
    }

    public function test_a_draft_may_have_no_dates_or_location(): void
    {
        // A draft may be written before anybody knows the date. The publish
        // path requires the dates (EventPublishTest).
        $draft = Event::factory()->draft()->create([
            'starts_at' => null,
            'ends_at' => null,
            'location' => null,
        ]);

        $this->assertNull($draft->fresh()->starts_at);
        $this->assertNull($draft->fresh()->ends_at);
        $this->assertNull($draft->fresh()->location);
    }

    public function test_an_event_still_needs_a_title(): void
    {
        // The title names the row in a list of drafts, so it stays NOT NULL.
        $this->expectException(QueryException::class);

        Event::factory()->draft()->create(['title' => null]);
    }

    public function test_is_draft_follows_published_at(): void
    {
        $this->assertTrue(Event::factory()->draft()->create()->isDraft());
        $this->assertFalse(Event::factory()->create()->isDraft());
    }

    public function test_the_published_scope_leaves_out_drafts(): void
    {
        $published = Event::factory()->create();
        Event::factory()->draft()->create();

        $this->assertSame([$published->id], Event::query()->published()->pluck('id')->all());
    }

    public function test_the_migration_backfills_existing_rows_as_published(): void
    {
        // A deploy must not turn the whole planning into drafts.
        Schema::dropColumns('events', 'published_at');
        DB::table('events')->insert([
            'title' => 'Répétition',
            'starts_at' => '2026-10-03 07:00:00',
            'ends_at' => '2026-10-03 09:00:00',
            'location' => 'Werkhof',
            'created_at' => '2026-09-01 12:00:00',
            'updated_at' => '2026-09-01 12:00:00',
        ]);

        $this->addPublishedAt()->up();

        $this->assertSame(
            '2026-09-01 12:00:00',
            DB::table('events')->value('published_at'),
        );
    }

    public function test_running_the_migration_again_does_not_publish_a_draft(): void
    {
        // RunPendingMigrations can re-enter a file after a partial failure. A
        // backfill that ran on every entry would publish every draft.
        $draft = Event::factory()->draft()->create();

        $this->addPublishedAt()->up();

        $this->assertNull($draft->fresh()->published_at);
    }

    private function addPublishedAt(): object
    {
        return require database_path('migrations/2026_09_30_000001_add_published_at_to_events.php');
    }

    public function test_an_event_is_private_unless_somebody_says_otherwise(): void
    {
        // A forgotten flag must fall the safe way, so rehearsals never reach
        // strangers by accident.
        //
        // Bypasses EventFactory on purpose: its definition() sets
        // is_public => false itself, so a factory-built row would pass even
        // with the model and column default deleted. MemberModelTest's
        // docblock applies the same reasoning to a whole file.
        $event = Event::query()->create([
            'title' => 'Répétition',
            'starts_at' => '2026-09-05 08:00:00',
            'ends_at' => '2026-09-05 10:00:00',
            'location' => 'Werkhof',
        ]);

        $this->assertFalse($event->is_public);
    }

    public function test_the_public_flag_is_a_boolean_not_an_integer(): void
    {
        // Without the cast this arrives in JSON as 1/0 and the generated
        // TypeScript types it as number. The @property docblock already
        // claims bool for PHPStan; this checks the runtime cast.
        // @phpstan-ignore method.alreadyNarrowedType (the runtime cast is the subject)
        $this->assertIsBool(Event::factory()->create(['is_public' => true])->is_public);
    }
}
