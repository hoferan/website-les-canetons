<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceIntegrity;
use App\Support\AttendanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A member answering for themselves: PUT to say yes or no, DELETE to undo.
 */
class AttendanceAnswerTest extends TestCase
{
    use RefreshDatabase;

    private Member $player;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->player = Member::factory()->inSection('Cloches')->create();
        $this->event = Event::factory()->create();
    }

    private function url(): string
    {
        return "/api/events/{$this->event->id}/attendance";
    }

    public function test_an_anonymous_caller_gets_401(): void
    {
        $this->putJson($this->url(), ['status' => 'yes'])->assertStatus(401);
        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_a_player_says_yes(): void
    {
        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertOk()
            ->assertJsonPath('status', 'yes')
            ->assertJsonPath('note', null)
            ->assertJsonPath('recordedByDirection', false);

        $answer = Attendance::query()->sole();
        $this->assertSame(AttendanceStatus::Yes, $answer->status);
        $this->assertSame($this->player->id, $answer->member_id);
        $this->assertNull($answer->recorded_by_member_id);
    }

    public function test_answering_twice_updates_rather_than_duplicating(): void
    {
        // PUT is an idempotent upsert: tapping Oui then Non must not race
        // itself into two rows, and the client needs no create-vs-update
        // branch.
        $this->actingAsMember($this->player)->putJson($this->url(), ['status' => 'yes']);
        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'no', 'note' => 'Je suis malade.'])
            ->assertOk();

        $this->assertSame(1, Attendance::query()->count());
        $this->assertSame(AttendanceStatus::No, Attendance::query()->sole()->status);
    }

    public function test_a_member_with_no_register_is_not_answerable(): void
    {
        // Dominique Direction organises and plays in nothing. 403 with its
        // own code, NOT access_denied: there is no permission for answering,
        // so a generic refusal would send them hunting for a grant that does
        // not exist.
        $organiser = Member::factory()->administrator()->create();

        $this->actingAsMember($organiser)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertStatus(403)
            ->assertJson(['code' => 'not_answerable']);

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_a_player_who_also_manages_may_still_answer(): void
    {
        // demo.both: plays in a register AND runs the planning. The case the
        // old either/or role matrix could not express, and the bug that
        // motivated having no permission for answering at all.
        $both = Member::factory()->inSection('Trompettes')->administrator()->create();

        $this->actingAsMember($both)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertOk();

        $this->assertSame(1, Attendance::query()->count());
    }

    public function test_an_unknown_status_is_refused_with_the_accepted_set(): void
    {
        // The `in` rule, so ApiError supplies params.allowed — without it
        // i18next prints the literal "{{allowed}}" on screen.
        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'peut-être'])
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'status')
            ->assertJsonPath('fields.0.reason', 'invalid_value')
            ->assertJsonPath('fields.0.params.allowed', ['yes', 'no']);
    }

    // ------------------------------------------------ C11: withdrawing a yes

    public function test_withdrawing_a_yes_costs_a_reason(): void
    {
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
            'status' => AttendanceStatus::Yes,
        ]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('fields.0.field', 'note')
            ->assertJsonPath('fields.0.reason', 'required');

        // And the yes still stands: a refused withdrawal must not half-apply.
        $this->assertSame(AttendanceStatus::Yes, Attendance::query()->sole()->status);
    }

    public function test_withdrawing_a_yes_with_a_reason_is_accepted(): void
    {
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
            'status' => AttendanceStatus::Yes,
        ]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'no', 'note' => 'Je pars en vacances.'])
            ->assertOk()
            ->assertJsonPath('note', 'Je pars en vacances.');
    }

    public function test_a_first_answer_of_no_costs_nothing(): void
    {
        // The rule is asymmetric on purpose: saying no from the start is not
        // taking anything back, and demanding a reason for it would train
        // people to type a full stop.
        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertOk();
    }

    public function test_changing_a_no_to_a_yes_costs_nothing(): void
    {
        Attendance::factory()->no()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
        ]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertOk();
    }

    public function test_answering_yes_again_costs_nothing(): void
    {
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
        ]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertOk();
    }

    public function test_the_reason_rule_reads_this_events_answer_not_another(): void
    {
        // A yes for a DIFFERENT event must not make this one a withdrawal.
        Attendance::factory()->create(['member_id' => $this->player->id]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'no'])
            ->assertOk();
    }

    public function test_a_self_answer_clears_a_direction_stamp(): void
    {
        // The member correcting it themselves is exactly the case where
        // "saisie par la direction" stops being true.
        $recorder = Member::factory()->administrator()->create();
        Attendance::factory()->no()->recordedBy($recorder)->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
        ]);

        $this->actingAsMember($this->player)
            ->putJson($this->url(), ['status' => 'yes'])
            ->assertOk()
            ->assertJsonPath('recordedByDirection', false);

        $this->assertNull(Attendance::query()->sole()->recorded_by_member_id);
    }

    // -------------------------------------------------------- C12: undo

    public function test_undo_removes_the_answer_entirely(): void
    {
        // Not "sets it to no": undoing a FIRST answer must return the event
        // to unanswered, which a second PUT cannot express. That is the
        // whole reason this endpoint exists.
        $this->actingAsMember($this->player)->putJson($this->url(), ['status' => 'yes']);

        $this->actingAsMember($this->player)
            ->deleteJson($this->url())
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_undo_expires(): void
    {
        // An unlimited undo would make C11 decorative: erase the yes, answer
        // no, never give a reason.
        $answer = Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
        ]);
        $answer->forceFill([
            'updated_at' => now()->subMinutes(AttendanceIntegrity::UNDO_WINDOW_MINUTES + 1),
        ])->saveQuietly();

        $this->actingAsMember($this->player)
            ->deleteJson($this->url())
            ->assertStatus(409)
            ->assertJson(['code' => 'answer_already_settled']);

        $this->assertSame(1, Attendance::query()->count());
    }

    public function test_undo_is_still_open_just_inside_the_window(): void
    {
        // The boundary from the other side: 6 minutes being refused says
        // nothing about whether 4 is allowed.
        $answer = Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $this->player->id,
        ]);
        $answer->forceFill([
            'updated_at' => now()->subMinutes(AttendanceIntegrity::UNDO_WINDOW_MINUTES - 1),
        ])->saveQuietly();

        $this->actingAsMember($this->player)->deleteJson($this->url())->assertOk();
        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_undoing_nothing_is_not_an_error(): void
    {
        // Undo is reached from a toast, and a double tap on a flaky
        // connection must not read as a failure to the member.
        $this->actingAsMember($this->player)
            ->deleteJson($this->url())
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_undo_touches_only_your_own_answer(): void
    {
        $other = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $other->id,
        ]);

        $this->actingAsMember($this->player)->deleteJson($this->url())->assertOk();

        $this->assertSame(1, Attendance::query()->count());
    }
}
