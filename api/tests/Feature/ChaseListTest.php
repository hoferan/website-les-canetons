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
 * GET /api/events/{event}/attendance — a chase list, not a report.
 */
class ChaseListTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
        $this->event = Event::factory()->create();
    }

    private function url(): string
    {
        return "/api/events/{$this->event->id}/attendance";
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->getJson($this->url())->assertStatus(401);
    }

    public function test_a_player_cannot_see_who_has_not_replied(): void
    {
        // Answering is everybody's; reading who has NOT answered is the
        // committee's.
        $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson($this->url())
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_attendance_view_all_alone_is_enough(): void
    {
        // PINS THE PERMISSION STRING. The organiser holds `direction`, which
        // the seed grants every permission, so any string in that middleware
        // separates them from a player with none.
        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();

        $this->actingAsMember($viewer)->getJson($this->url())->assertOk();
    }

    public function test_it_lists_every_answerable_member_including_the_silent_ones(): void
    {
        // THE POINT OF THE SCREEN. Returning only the answers would push
        // "who has not replied?" into a client-side diff against a
        // separately-fetched roster — two requests that can disagree.
        $answered = Member::factory()->named('Perrine', 'Player')->inSection('Cloches')->create();
        $silent = Member::factory()->named('Nadia', 'Sansconnexion')->inSection('Batteurs')->create();

        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $answered->id,
        ]);

        $response = $this->actingAsMember($this->organiser)->getJson($this->url())->assertOk();

        $byId = collect($response->json())->keyBy('memberId');

        $this->assertSame('yes', $byId[$answered->id]['attendance']['status']);
        $this->assertNull($byId[$silent->id]['attendance']);
    }

    public function test_a_member_with_no_register_never_appears(): void
    {
        // Dominique Direction organises, plays in nothing, and is not
        // answerable — so listing her would put a permanent "pas de réponse"
        // on a screen whose whole job is to be emptied.
        $response = $this->actingAsMember($this->organiser)->getJson($this->url())->assertOk();

        $this->assertNotContains(
            $this->organiser->id,
            array_column($response->json(), 'memberId')
        );
    }

    public function test_each_entry_carries_what_the_chase_list_renders(): void
    {
        // assertSame on VALUES, not assertJsonStructure: key presence alone
        // stayed green through a field swap in Task 4 and had to be
        // strengthened afterwards.
        $player = Member::factory()->named('Perrine', 'Player')->inSection('Cloches')->create();
        Attendance::factory()->no()->recordedBy($this->organiser)->create([
            'event_id' => $this->event->id,
            'member_id' => $player->id,
            'note' => 'Elle a téléphoné.',
        ]);

        $entry = collect(
            $this->actingAsMember($this->organiser)->getJson($this->url())->json()
        )->firstWhere('memberId', $player->id);

        $this->assertSame('Perrine', $entry['firstName']);
        $this->assertSame('Player', $entry['lastName']);
        $this->assertSame('Cloches', $entry['sectionName']);
        $this->assertSame('no', $entry['attendance']['status']);
        $this->assertSame('Elle a téléphoné.', $entry['attendance']['note']);
        $this->assertTrue($entry['attendance']['recordedByDirection']);
    }

    public function test_it_shows_only_this_events_answers(): void
    {
        // An answer to last week's rehearsal must not appear against this
        // one — the failure that would make the whole list quietly wrong.
        $player = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->create(['member_id' => $player->id]);

        $entry = collect(
            $this->actingAsMember($this->organiser)->getJson($this->url())->json()
        )->firstWhere('memberId', $player->id);

        $this->assertNull($entry['attendance']);
    }

    public function test_it_is_ordered_by_name(): void
    {
        Member::factory()->named('Zoé', 'Zwahlen')->inSection('Cloches')->create();
        Member::factory()->named('Alain', 'Aebischer')->inSection('Cloches')->create();

        $names = array_column(
            $this->actingAsMember($this->organiser)->getJson($this->url())->json(),
            'lastName'
        );

        $sorted = $names;
        sort($sorted);
        $this->assertSame($sorted, $names);
    }

    public function test_the_chase_list_costs_a_fixed_number_of_queries(): void
    {
        // TWO QUERIES WHATEVER THE ROSTER SIZE — the players with their
        // register, and this event's answers. The roster is ~45 people and
        // this screen is read on a phone at a rehearsal; a hasMany per row
        // is the N+1 it would otherwise grow.
        Member::factory()->count(15)->inSection('Cloches')->create()
            ->each(fn (Member $m) => Attendance::factory()->create([
                'event_id' => $this->event->id,
                'member_id' => $m->id,
            ]));

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->organiser)->getJson($this->url())->assertOk();

        // The two data queries plus the permission lookup and session work.
        $this->assertLessThanOrEqual(6, $queries, 'the chase list should not query per member');
    }
}
