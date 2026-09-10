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
use Dedoc\Scramble\Attributes\Group;
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
     * caller. Use `DELETE /api/events/{event}/attendance` for your own
     * answer.
     */
    public function destroy(Request $request, Event $event, Member $member): JsonResponse
    {
        // Answering on somebody else's behalf — the phone call to the
        // committee. Two verbs, so this controller is not single-action: PUT
        // records an answer and DELETE takes one back. The generated hooks
        // are therefore useMemberAttendanceUpdate and
        // useMemberAttendanceDestroy.
        //
        // Without this endpoint a mis-aimed on-behalf write is permanent from
        // the committee's side, and worse from the member's: C12 measures the
        // undo window from `updated_at`, so the five minutes start ticking
        // when the DIRECTION wrote it, and once they lapse C11 can demand a
        // written reason from the member for a commitment they never made.
        //
        // NOT subject to C12 itself. The window exists to stop a member
        // erasing their own yes and re-answering for free; a committee
        // correcting its own typo an hour later is the case it was never
        // aimed at, and they can overwrite the row at will anyway.
        //
        // Refuses its own caller, like the write does (C14): undoing your own
        // answer through the exempt route would sidestep C11 exactly as
        // writing it would.
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
     * when that member is in no register.
     */
    public function update(
        RecordMemberAttendanceRequest $request,
        Event $event,
        Member $member,
    ): AttendanceResource {
        // REFUSES ITS OWN CALLER (decision C14). This route is exempt from
        // C11's reason-for-a-withdrawal rule (C13), because making the
        // committee invent a reason on a member's behalf puts words in their
        // mouth. That exemption is exactly why aiming it at yourself has to
        // be refused: demo.both plays and holds
        // attendance.record_for_others, and could otherwise take back his own
        // yes for free.
        //
        // The self-refusal is checked FIRST, so it outranks being
        // unanswerable — pinned by
        // test_the_self_refusal_outranks_being_unanswerable.
        /** @var Member $actor */
        $actor = $request->user();

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

        // Audited, unlike a self-answer: this is one person acting for
        // another, and the question it answers later is "who said I was not
        // coming?". Both names go in the label for the reason Audit::record
        // asks the CALLER for one — the rows it points at may be gone by the
        // time anybody reads it back.
        Audit::record(
            $actor,
            'attendance.recorded_for_member',
            'member',
            $member->id,
            // The STATUS is in the label, not only the names. Audit has no
            // payload column, and without it this entry cannot answer the
            // one question its own reason for existing names: 'who said I
            // was not coming?'
            $member->fullName().' / '.$event->title.' / '.$data['status'],
        );

        return new AttendanceResource($attendance);
    }
}
