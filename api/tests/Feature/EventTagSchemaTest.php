<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventTag;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Event tags (#107): the four the band starts with, and what deleting either
 * side of the pivot does to the other.
 */
class EventTagSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_seed_creates_the_four_tags_in_order(): void
    {
        $this->assertSame(
            [
                ['Répétition', 'Probe', 'violet'],
                ['Concert', 'Konzert', 'teal'],
                ['Sortie', 'Auftritt', 'amber'],
                ['Carnaval', 'Fasnacht', 'pink'],
            ],
            EventTag::query()->orderBy('sort_order')->get()
                ->map(fn (EventTag $tag) => [$tag->label_fr, $tag->label_de, $tag->colour->value])
                ->all(),
        );
    }

    public function test_the_seed_is_idempotent(): void
    {
        $this->runSeed();
        $this->runSeed();

        $this->assertSame(4, EventTag::count());
    }

    public function test_the_seed_puts_back_only_what_is_missing(): void
    {
        EventTag::query()->where('label_fr', 'Sortie')->delete();
        EventTag::query()->where('label_fr', 'Concert')->update(['colour' => 'blue']);

        $this->runSeed();

        $this->assertSame(4, EventTag::count());
        $this->assertSame('blue', EventTag::query()->where('label_fr', 'Concert')->firstOrFail()->colour->value);
    }

    public function test_only_carnaval_starts_out_celebrating(): void
    {
        $this->assertSame(
            ['Carnaval'],
            EventTag::query()->where('celebrate', true)->pluck('label_fr')->all(),
        );
    }

    public function test_the_celebrate_flag_is_set_once_and_never_put_back(): void
    {
        // The committee turned it off: a re-run must not turn it back on.
        EventTag::query()->where('label_fr', 'Carnaval')->update(['celebrate' => false]);

        $this->runCelebrateMigration();

        $this->assertSame(0, EventTag::query()->where('celebrate', true)->count());
    }

    public function test_the_celebrate_flag_survives_a_missing_carnaval(): void
    {
        Schema::table('event_tags', fn (Blueprint $table) => $table->dropColumn('celebrate'));
        EventTag::query()->where('label_fr', 'Carnaval')->update(['label_fr' => 'Fasnacht']);

        $this->runCelebrateMigration();

        $this->assertSame(0, EventTag::query()->where('celebrate', true)->count());
    }

    public function test_deleting_a_tag_detaches_it_from_events(): void
    {
        $event = Event::factory()->create();
        $tag = EventTag::query()->where('label_fr', 'Concert')->firstOrFail();
        $event->tags()->attach($tag);

        $tag->delete();

        $this->assertTrue(Event::query()->whereKey($event->id)->exists());
        $this->assertSame(0, $event->tags()->count());
    }

    public function test_deleting_an_event_drops_its_pivot_rows(): void
    {
        $event = Event::factory()->create();
        $event->tags()->attach(EventTag::query()->pluck('id'));

        $event->delete();

        $this->assertSame(0, DB::table('event_event_tag')->count());
        $this->assertSame(4, EventTag::count());
    }

    public function test_an_events_tags_come_in_the_tag_order(): void
    {
        $event = Event::factory()->create();
        $event->tags()->attach(EventTag::query()->orderByDesc('sort_order')->pluck('id'));

        $this->assertSame(
            ['Répétition', 'Concert', 'Sortie', 'Carnaval'],
            $event->tags->pluck('label_fr')->all(),
        );
    }

    private function runCelebrateMigration(): void
    {
        (require database_path('migrations/2026_10_09_000001_add_celebrate_to_event_tags.php'))->up();
    }

    private function runSeed(): void
    {
        (require database_path('migrations/2026_10_06_000002_seed_event_tags.php'))->up();
    }
}
