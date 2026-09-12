<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `myAttendance` on the planning: one request renders the whole list with
 * both buttons already in the right state.
 */
class MyAttendanceTest extends TestCase
{
    use RefreshDatabase;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    public function test_the_planning_carries_my_own_answer(): void
    {
        $event = Event::factory()->create(['starts_at' => now()->addWeek(), 'ends_at' => now()->addWeek()->addHours(2)]);
        Attendance::factory()->create([
            'event_id' => $event->id,
            'member_id' => $this->player->id,
            'note' => 'A vélo.',
        ]);

        $this->actingAsMember($this->player)
            ->getJson('/api/v1/events')
            ->assertOk()
            ->assertJsonPath('data.0.myAttendance.status', 'yes')
            ->assertJsonPath('data.0.myAttendance.note', 'A vélo.')
            ->assertJsonPath('data.0.myAttendance.recordedByDirection', false);
    }

    public function test_an_unanswered_event_reports_null(): void
    {
        Event::factory()->create(['starts_at' => now()->addWeek(), 'ends_at' => now()->addWeek()->addHours(2)]);

        $this->actingAsMember($this->player)
            ->getJson('/api/v1/events')
            ->assertOk()
            ->assertJsonPath('data.0.myAttendance', null);
    }

    public function test_it_never_shows_somebody_elses_answer(): void
    {
        // THE LEAK THIS GUARDS. The relation is constrained to the caller in
        // the QUERY, so another member's answer is never even loaded.
        $event = Event::factory()->create(['starts_at' => now()->addWeek(), 'ends_at' => now()->addWeek()->addHours(2)]);
        $other = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->no()->create([
            'event_id' => $event->id,
            'member_id' => $other->id,
            'note' => 'Ceci ne regarde personne.',
        ]);

        $body = $this->actingAsMember($this->player)->getJson('/api/v1/events')->assertOk()->json('data');

        $this->assertNull($body[0]['myAttendance']);
        $this->assertStringNotContainsString('Ceci ne regarde personne.', json_encode($body));
    }

    public function test_one_event_carries_it_too(): void
    {
        $event = Event::factory()->create();
        Attendance::factory()->no()->create([
            'event_id' => $event->id,
            'member_id' => $this->player->id,
        ]);

        $this->actingAsMember($this->player)
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('myAttendance.status', 'no');
    }

    public function test_editing_an_event_still_reports_my_own_answer(): void
    {
        // An organiser who ALSO plays. Without the explicit load in update()
        // this answers null and resets the buttons on their own screen.
        $both = Member::factory()->inSection('Trompettes')->administrator()->create();
        $event = Event::factory()->create();
        Attendance::factory()->create(['event_id' => $event->id, 'member_id' => $both->id]);

        $this->actingAsMember($both)
            ->withHeaders($this->ifMatch('event', $event))
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Répétition déplacée'])
            ->assertOk()
            ->assertJsonPath('myAttendance.status', 'yes');
    }

    public function test_the_planning_still_costs_a_fixed_number_of_queries(): void
    {
        // The eager load is ONE query for the whole list, not one per row.
        // EventIndexTest's budget of 3 was set as a floor with exactly this
        // release's join in mind.
        Event::factory()->count(10)->create([
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addWeek()->addHours(2),
        ])->each(fn (Event $e) => Attendance::factory()->create([
            'event_id' => $e->id,
            'member_id' => $this->player->id,
        ]));

        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->player)->getJson('/api/v1/events')->assertOk();

        $this->assertLessThanOrEqual(3, $queries, 'myAttendance must not query per event');
    }

    public function test_deleting_an_event_reports_how_many_answers_went_with_it(): void
    {
        // The confirmation dialog needs to name the damage, not just ask
        // again. R3 adds registrationsDeleted beside this.
        $organiser = Member::factory()->administrator()->create();
        $event = Event::factory()->create();

        Member::factory()->count(3)->inSection('Cloches')->create()
            ->each(fn (Member $m) => Attendance::factory()->create([
                'event_id' => $event->id,
                'member_id' => $m->id,
            ]));

        $this->actingAsMember($organiser)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJson(['ok' => true, 'attendanceDeleted' => 3]);

        $this->assertSame(0, Attendance::query()->count());
    }
}
