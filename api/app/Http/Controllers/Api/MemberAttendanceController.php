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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Answering on somebody else's behalf — the phone call to the committee.
 *
 * Two verbs, so not single-action: PUT records an answer and DELETE takes
 * one back. The generated hooks are therefore useMemberAttendanceUpdate and
 * useMemberAttendanceDestroy.
 *
 * REFUSES ITS OWN CALLER (decision C14). This route is exempt from C11's
 * reason-for-a-withdrawal rule (C13), because making the committee invent a
 * reason on a member's behalf puts words in their mouth. That exemption is
 * exactly why aiming it at yourself has to be refused: demo.both plays and
 * holds attendance.record_for_others, and could otherwise take back his own
 * yes for free.
 */
class MemberAttendanceController extends Controller
{
    /**
     * Takes back an answer the committee entered for somebody.
     *
     * Without this a mis-aimed on-behalf write is permanent from the
     * committee's side, and worse from the member's: C12 measures the undo
     * window from `updated_at`, so the five minutes start ticking when the
     * DIRECTION wrote it, and once they lapse C11 can demand a written
     * reason from the member for a commitment they never made.
     *
     * NOT subject to C12 itself. The window exists to stop a member erasing
     * their own yes and re-answering for free; a committee correcting its
     * own typo an hour later is the case it was never aimed at, and they
     * can overwrite the row at will anyway.
     *
     * Refuses its own caller, like the write does (C14): undoing your own
     * answer through the exempt route would sidestep C11 exactly as
     * writing it would.
     */
    public function destroy(Request $request, Event $event, Member $member): JsonResponse
    {
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

    public function update(
        RecordMemberAttendanceRequest $request,
        Event $event,
        Member $member,
    ): AttendanceResource {
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
