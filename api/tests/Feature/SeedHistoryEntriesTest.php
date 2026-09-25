<?php

namespace Tests\Feature;

use App\Models\HistoryEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The history the site carried before it could be edited arrives as rows,
 * once, and never into a history the committee has started.
 */
class SeedHistoryEntriesTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_fresh_database_carries_the_four_entries_in_order(): void
    {
        $this->assertSame(
            ['2002-10-01', '2007-01-01', '2019-01-01', '2026-01-01'],
            HistoryEntry::query()->orderBy('occurred_on')->get()
                ->map(fn (HistoryEntry $entry) => $entry->occurred_on->toDateString())->all(),
        );

        $first = HistoryEntry::query()->orderBy('occurred_on')->firstOrFail();
        $this->assertTrue($first->important);
        $this->assertSame('flag', $first->icon);
        $this->assertStringNotContainsString('CREEE', (string) $first->body_fr);
        $this->assertStringContainsString('créée en octobre 2002', (string) $first->body_fr);

        $this->assertNull(HistoryEntry::query()->where('occurred_on', '2007-01-01')->value('title_fr'));
    }

    public function test_running_it_again_adds_nothing(): void
    {
        $this->runSeed();

        $this->assertSame(4, HistoryEntry::count());
    }

    public function test_it_never_writes_into_a_history_the_committee_has_started(): void
    {
        HistoryEntry::query()->delete();
        HistoryEntry::factory()->create(['title_fr' => 'Écrit par le comité']);

        $this->runSeed();

        $this->assertSame(1, HistoryEntry::count());
    }

    private function runSeed(): void
    {
        (require database_path('migrations/2026_09_26_000003_seed_history_entries.php'))->up();
    }
}
