<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_an_event_cannot_exist_without_an_end(): void
    {
        // Decision C6. Required is what dissolves the `weekend` boolean: a
        // multi-day event is one whose dates differ, so there is no flag to
        // keep in step.
        $this->expectException(QueryException::class);

        Event::factory()->create(['ends_at' => null]);
    }

    public function test_an_event_is_private_unless_somebody_says_otherwise(): void
    {
        // The live defect this default exists to prevent: /planning_repet
        // showed rehearsals to strangers. The accident can now only fall the
        // safe way.
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
