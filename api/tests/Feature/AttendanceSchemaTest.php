<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceIntegrity;
use App\Support\AttendanceStatus;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AttendanceSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_answers_an_event_once(): void
    {
        // UNIQUE(event_id, member_id) is what makes PUT an idempotent upsert
        // rather than a race: tapping Oui then Non cannot produce two rows.
        $answer = Attendance::factory()->create();

        $this->expectException(QueryException::class);

        Attendance::factory()->create([
            'event_id' => $answer->event_id,
            'member_id' => $answer->member_id,
        ]);
    }

    public function test_the_same_member_may_answer_two_different_events(): void
    {
        $member = Member::factory()->inSection('Cloches')->create();
        $first = Attendance::factory()->create(['member_id' => $member->id]);
        $second = Attendance::factory()->create(['member_id' => $member->id]);

        $this->assertNotSame($first->event_id, $second->event_id);
        $this->assertSame(2, Attendance::query()->count());
    }

    public function test_deleting_the_event_takes_its_answers_with_it(): void
    {
        $answer = Attendance::factory()->create();

        Event::query()->findOrFail($answer->event_id)->delete();

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_deleting_the_member_takes_their_answers_with_it(): void
    {
        $answer = Attendance::factory()->create();

        Member::query()->findOrFail($answer->member_id)->delete();

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_losing_the_recorder_keeps_the_answer(): void
    {
        // ON DELETE SET NULL, not CASCADE: the answer is what the cook counts,
        // so deleting the member who typed it must not remove the player's.
        $recorder = Member::factory()->administrator()->create();
        $answer = Attendance::factory()->recordedBy($recorder)->create();

        $recorder->delete();

        $answer->refresh();
        $this->assertSame(AttendanceStatus::Yes, $answer->status);
        $this->assertNull($answer->recorded_by_member_id);
        $this->assertFalse($answer->wasRecordedByDirection());
    }

    public function test_a_self_answer_is_distinguishable_from_one_entered_for_you(): void
    {
        $recorder = Member::factory()->administrator()->create();

        $this->assertFalse(Attendance::factory()->create()->wasRecordedByDirection());
        $this->assertTrue(Attendance::factory()->recordedBy($recorder)->create()->wasRecordedByDirection());
    }

    public function test_the_status_is_stored_in_english(): void
    {
        // Stored values are English; French exists only in web/src/i18n/. A
        // cast that stored "oui" would be invisible from PHP.
        Attendance::factory()->no()->create();

        $this->assertSame('no', DB::table('attendance')->value('status'));
    }

    public function test_the_accepted_values_come_from_the_enum(): void
    {
        // The `in:` rule is derived from the enum, so a third status cannot
        // pass validation while the UI knows nothing about it.
        $this->assertSame(['yes', 'no'], AttendanceStatus::values());
    }

    public function test_the_undo_window_is_five_minutes(): void
    {
        // Pinned to the literal on purpose. Every other test builds its
        // fixture from UNDO_WINDOW_MINUTES, so they pin the comparison and not
        // the policy: widening the window to 24 hours leaves them green. A
        // large window makes the reason-for-a-withdrawal rule decorative,
        // because a member can erase a yes and re-answer no for free.
        $this->assertSame(5, AttendanceIntegrity::UNDO_WINDOW_MINUTES);
        $this->assertSame('in:yes,no', AttendanceStatus::rule());
    }
}
