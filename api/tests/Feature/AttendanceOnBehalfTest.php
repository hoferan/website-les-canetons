<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\AttendanceStatus;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PUT /api/events/{event}/attendance/{member} — the phone call to the
 * committee, and decisions C13 and C14.
 */
class AttendanceOnBehalfTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Member $player;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
        $this->event = Event::factory()->create();
    }

    private function url(?Member $target = null): string
    {
        return "/api/events/{$this->event->id}/attendance/".($target ?? $this->player)->id;
    }

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->putJson($this->url(), ['status' => 'no'])->assertStatus(401);
        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_a_player_cannot_answer_for_somebody_else(): void
    {
        $other = Member::factory()->inSection('Cloches')->create();

        $this->actingAsMember($other)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_record_for_others_alone_is_enough(): void
    {
        // PINS THE PERMISSION STRING, which the organiser fixture cannot:
        // `direction` holds every permission, so any string would separate
        // it from a player holding none.
        $recorder = Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceRecordForOthers)->create())
            ->create();

        $this->actingAsMember($recorder)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertOk();
    }

    public function test_viewing_the_list_does_not_let_you_speak_for_people(): void
    {
        // Two separate permissions, and roles are editable data that may
        // grant one without the other.
        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();

        $this->actingAsMember($viewer)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertStatus(403);
    }

    public function test_the_answer_is_stamped_with_who_entered_it(): void
    {
        // So the chase list can say the direction entered it rather than
        // implying the member replied.
        $this->actingAsMember($this->organiser)
            ->putJson($this->url(), ['status' => 'no', 'note' => 'A téléphoné.'])
            ->assertOk()
            ->assertJsonPath('recordedByDirection', true)
            ->assertJsonPath('note', 'A téléphoné.');

        $this->assertSame($this->organiser->id, Attendance::query()->sole()->recorded_by_member_id);
    }

    public function test_it_is_audited(): void
    {
        // Unlike a self-answer. This is one person acting for another, and
        // "who said I was not coming?" needs an answer later.
        $this->actingAsMember($this->organiser)->putJson($this->url(), ['status' => 'no']);

        $this->assertDatabaseHas('audit_log', [
            'actor_member_id' => $this->organiser->id,
            'action' => 'attendance.recorded_for_member',
            'target_type' => 'member',
            'target_id' => $this->player->id,
        ]);
    }

    public function test_recording_for_a_member_with_no_register_is_refused(): void
    {
        $organiserOnly = Member::factory()->administrator()->create();

        $this->actingAsMember($this->organiser)
            ->putJson($this->url($organiserOnly), ['status' => 'yes'])
            ->assertStatus(403)
            ->assertJson(['code' => 'not_answerable']);

        $this->assertSame(0, Attendance::query()->count());
    }

    // ------------------------------------------------- C13: exempt from C11

    public function test_the_committee_may_withdraw_a_yes_without_a_reason(): void
    {
        // C13. The member phoned to say they cannot come; making the
        // committee invent a written reason on their behalf would put words
        // in their mouth.
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
            'status' => AttendanceStatus::Yes,
        ]);

        $this->actingAsMember($this->organiser)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertOk();

        $this->assertSame(AttendanceStatus::No, Attendance::query()->sole()->status);
    }

    // ------------------------------------------- C14: it refuses its caller

    public function test_it_refuses_its_own_caller(): void
    {
        // THE BYPASS THIS CLOSES. demo.both plays AND holds
        // attendance.record_for_others. Without this he could take back his
        // own yes through the exempt endpoint and never supply the reason
        // C11 exists to collect. 409, not 403: he HAS the permission — the
        // request conflicts with the state of things.
        $both = Member::factory()->inSection('Trompettes')->administrator()->create();

        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $both->id,
            'status' => AttendanceStatus::Yes,
        ]);

        $this->actingAsMember($both)
            ->putJson($this->url($both), ['status' => 'no'])
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_record_for_self']);

        // And the yes still stands.
        $this->assertSame(AttendanceStatus::Yes, Attendance::query()->sole()->status);
    }

    public function test_the_self_refusal_outranks_being_unanswerable(): void
    {
        // An organiser who plays in nothing, aiming at themselves, is BOTH
        // self-targeting and unanswerable. cannot_record_for_self is the
        // more useful answer — it names the endpoint they should be using —
        // so it must win. Same priority reasoning AccessIntegrity applies to
        // its own overlapping refusals.
        $this->actingAsMember($this->organiser)
            ->putJson($this->url($this->organiser), ['status' => 'yes'])
            ->assertStatus(409)
            ->assertJson(['code' => 'cannot_record_for_self']);
    }
}
