<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The counts behind the planning's metadata strip (#93).
 *
 * THE GATE IS THE API, NOT THE SPA. Knowing that twelve people have already
 * said yes can move a thirteenth person's own answer, so the count is not
 * merely something a player has no use for — it would change what the screen
 * is measuring. A count left on the wire and hidden by can() is readable in
 * the network tab.
 */
class EventCountsTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->event = Event::factory()->create();
    }

    /** Somebody who may read the chase list and nothing else. */
    private function answerViewer(): Member
    {
        return Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();
    }

    public function test_a_player_is_told_nothing_about_answers(): void
    {
        // THE LEAK TEST. Mutation-test it by hand: drop the ternary in
        // EventResource and this must go red.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
    }

    public function test_attendance_view_all_sees_the_fraction(): void
    {
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        // One answer; three members in a register — the answering player, the
        // one just created, and nobody else. The viewer holds a role but no
        // register, so they are not answerable and not counted.
        $this->assertSame(1, $response->json('data.0.answeredCount'));
        $this->assertSame(2, $response->json('data.0.answerableCount'));
    }

    public function test_an_answer_from_somebody_who_left_their_register_is_not_counted(): void
    {
        // Otherwise the fraction reads 1/0, and the strip disagrees with the
        // chase list it links to — which lists players only.
        $departed = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $departed->id,
        ]);
        $departed->update(['section_id' => null]);

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertSame(0, $response->json('data.0.answeredCount'));
        $this->assertSame(0, $response->json('data.0.answerableCount'));
    }

    public function test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries(): void
    {
        // The player path is pinned at <= 3 by EventIndexTest and stays there.
        // This is the path that grew: resolving permissions, and the
        // denominator a player never pays for.
        Event::factory()->count(20)->create();
        $viewer = $this->answerViewer();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        $this->assertLessThanOrEqual(
            4,
            $queries,
            'GET /api/v1/events should not scale queries with events',
        );
    }
}
