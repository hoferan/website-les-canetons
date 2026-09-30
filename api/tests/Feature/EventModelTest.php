<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Database\Migrations\Migration;
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

        // The two-day case, which the old date + weekend boolean could not
        // express: "Weekend musical, 3-4 October" is one event whose start and
        // end fall on different days.
        $this->assertSame('2026-10-03', $event->starts_at->format('Y-m-d'));
        $this->assertSame('2026-10-04', $event->ends_at->format('Y-m-d'));
    }

    public function test_a_draft_may_have_no_dates_or_location(): void
    {
        // Replaces the old "cannot exist without an end". The guarantee that a
        // multi-day event is one whose start and end differ, with no `weekend`
        // flag, now lives on the publish path (EventPublishTest), because a
        // draft is allowed to be written before anybody knows the date.
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

    private function addPublishedAt(): Migration
    {
        return require database_path('migrations/2026_09_30_000001_add_published_at_to_events.php');
    }

    public function test_an_event_is_private_unless_somebody_says_otherwise(): void
    {
        // The live defect this default exists to prevent: /planning_repet
        // showed rehearsals to strangers. The accident can now only fall the
        // safe way.
        //
        // DELIBERATELY BYPASSES EventFactory here: EventFactory::definition()
        // hard-codes is_public => false as one of its own defaults, so a row
        // built through Event::factory()->create() would keep passing even if
        // the model/column default were deleted outright — the factory would
        // only be asserting on itself. Building the row by hand through
        // Event::query()->create() is what makes this test able to catch a
        // regression in that default. See MemberModelTest's docblock for the
        // same reasoning applied to a whole file of these.
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
        // TypeScript types it as number, which every consumer then has to
        // defend against. The @property docblock tells PHPStan this is
        // already bool, which is exactly the claim this test verifies at
        // runtime — the cast, not the annotation, is the subject.
        // @phpstan-ignore method.alreadyNarrowedType (the runtime cast is the subject)
        $this->assertIsBool(Event::factory()->create(['is_public' => true])->is_public);
    }
}
