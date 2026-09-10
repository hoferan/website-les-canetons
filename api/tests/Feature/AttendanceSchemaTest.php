<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
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
        // ON DELETE SET NULL, not CASCADE, and the difference matters: the
        // answer is what the cook counts. Deleting the committee member who
        // typed it must not un-invite the player.
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
        // The project rule: machine values are English and French exists only
        // in web/src/i18n/. A cast that quietly stored "oui" would be
        // invisible from PHP and wrong in every export.
        Attendance::factory()->no()->create();

        $this->assertSame('no', DB::table('attendance')->value('status'));
    }

    public function test_the_accepted_values_come_from_the_enum(): void
    {
        // The `in:` rule body is derived rather than retyped, so adding a
        // third status could not silently pass validation while the UI knew
        // nothing about it.
        $this->assertSame(['yes', 'no'], AttendanceStatus::values());
        $this->assertSame('in:yes,no', AttendanceStatus::rule());
    }
}
