<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RecordMemberAttendanceRequest;
use App\Http\Resources\AttendanceResource;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceIntegrity;
use App\Support\Audit;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

#[Group('Attendance', weight: 30)]
class MemberAttendanceController extends Controller
{
    /**
     * Take back a member's answer.
     *
     * Requires `attendance.record_for_others`. Removes that member's answer
     * for the event entirely, returning them to unanswered. Answers
     * `{"ok": true}`, and taking back an answer that is not there is not an
     * error.
     *
     * Unlike a member undoing their own answer, this is not limited to five
     * minutes: correcting a mis-aimed entry an hour later is the case it
     * exists for.
     *
     * Refuses `409 cannot_record_for_self` when the member named is the
     * caller. Use `DELETE /api/v1/events/{event}/attendance` for your own
     * answer.
     */
    #[Response(200, 'Withdrawn. The member own five-minute undo window starts from this moment.')]
    #[Emits('cannot_record_for_self', 'event_not_published')]
    public function destroy(Request $request, Event $event, Member $member): JsonResponse
    {
        AttendanceIntegrity::assertPublished($event);

        // Two verbs, so this controller is not single-action and the hooks
        // are useMemberAttendanceUpdate and useMemberAttendanceDestroy.
        //
        // Without this, a mis-aimed on-behalf write would stick: the undo
        // window runs from `updated_at`, so it starts when the direction wrote
        // the row, and once it lapses withdrawing the yes costs the member a
        // written reason for a commitment they never made (ADR 0018).
        //
        // Not subject to the undo window, which stops a member erasing their
        // own yes for free; the committee can overwrite the row at will
        // anyway.
        //
        // Refuses its own caller, like the write: undoing your own answer
        // through this exempt route would sidestep the reason rule.
        /** @var Member $actor */
        $actor = $request->user();

        AttendanceIntegrity::assertNotSelf($actor, $member);

        $attendance = Attendance::query()
            ->where('event_id', $event->id)
            ->where('member_id', $member->id)
            ->first();

        // Idempotent, like the member's own undo: nothing to take back is
        // the state the caller asked for.
        if ($attendance === null) {
            return response()->json(['ok' => true]);
        }

        $status = $attendance->status->value;
        $attendance->delete();

        Audit::record(
            $actor,
            'attendance.withdrawn_for_member',
            'member',
            $member->id,
            $member->fullName().' / '.$event->title.' / '.$status,
        );

        return response()->json(['ok' => true]);
    }

    /**
     * Record an answer on a member's behalf.
     *
     * Requires `attendance.record_for_others`, for the member who telephones
     * the committee instead of answering themselves. Idempotent: sending an
     * answer again replaces the previous one, and the response is always
     * `200` with the answer as it now stands. It is marked as recorded by the
     * direction, so a list does not imply the member replied.
     *
     * `status` is `yes` or `no`; anything else fails validation against that
     * field with `invalid_value`. `note` is free text for whatever the member
     * said, and stays optional even when the answer takes back a `yes`. A
     * member answering for themselves owes a reason for that; inventing one
     * on somebody else's behalf would put words in their mouth.
     *
     * Refuses `409 cannot_record_for_self` when the member named is the
     * caller, whose own answer has its own endpoint, and `403 not_answerable`
     * when that member does not hold `attendance.respond`, whatever their
     * register.
     */
    #[Emits('cannot_record_for_self', 'not_answerable', 'event_not_published')]
    public function update(
        RecordMemberAttendanceRequest $request,
        Event $event,
        Member $member,
    ): AttendanceResource {
        // Refuses its own caller (ADR 0018). This route is exempt from the
        // reason a withdrawn yes costs, so aimed at yourself it would let
        // somebody like demo.both, who plays and holds
        // attendance.record_for_others, take back his own yes for free.
        //
        // The self-refusal is checked before answerability, pinned by
        // test_the_self_refusal_outranks_being_unanswerable.
        /** @var Member $actor */
        $actor = $request->user();

        AttendanceIntegrity::assertPublished($event);
        AttendanceIntegrity::assertNotSelf($actor, $member);
        AttendanceIntegrity::assertAnswerable($member);

        $data = $request->validated();

        $attendance = Attendance::updateOrCreate(
            ['event_id' => $event->id, 'member_id' => $member->id],
            [
                'status' => $data['status'],
                'note' => $data['note'] ?? null,
                // Stamped, so the chase list can say the answer was entered
                // by the direction rather than implying the member replied.
                'recorded_by_member_id' => $actor->id,
            ]
        );

        // Audited, unlike a self-answer, to answer "who said I was not
        // coming?" later. Both names go in the label because the rows it
        // points at may be gone by then.
        Audit::record(
            $actor,
            'attendance.recorded_for_member',
            'member',
            $member->id,
            // Audit has no payload column, so the status goes in the label.
            $member->fullName().' / '.$event->title.' / '.$data['status'],
        );

        return new AttendanceResource($attendance);
    }
}
