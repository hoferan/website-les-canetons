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

/**
 * Answering on somebody else's behalf — the phone call to the committee.
 *
 * Single-action, matching MemberRoleController and EventSeriesController. It
 * is also what makes the generated client hook `useMemberAttendance` rather
 * than `useMemberAttendanceUpdate`.
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
    public function __invoke(
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
            $member->fullName().' / '.$event->title,
        );

        return new AttendanceResource($attendance);
    }
}
