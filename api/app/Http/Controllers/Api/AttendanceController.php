<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RecordOwnAttendanceRequest;
use App\Http\Resources\AttendanceResource;
use App\Http\Resources\ChaseListEntryResource;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceIntegrity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AttendanceController extends Controller
{
    /**
     * THE CHASE LIST — every answerable member, not just those who replied.
     *
     * Returning only the answers would push "who has not replied?" — the
     * entire point of this screen — into a client-side diff against a
     * separately-fetched roster, which is two requests that can disagree.
     *
     * Answerable means Member::isPlayer(): having a register. There is
     * deliberately no permission for being answerable — making it a grant is
     * what produced the old bug where an admin could not say whether they
     * were coming, and left the "Pas de réponse" counts meaningless.
     *
     * TWO QUERIES WHATEVER THE ROSTER SIZE: the players with their register,
     * and this event's answers keyed by member. Pinned by
     * test_the_chase_list_costs_a_fixed_number_of_queries — the roster is ~45
     * people and this screen is read on a phone at a rehearsal.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        $players = Member::query()
            ->with('section')
            ->whereNotNull('section_id')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        $answers = Attendance::query()
            ->where('event_id', $event->id)
            ->get()
            ->keyBy('member_id');

        // setRelation rather than a lookup inside the Resource: the Resource
        // must not be able to issue a query per row, which is the N+1 this
        // endpoint would otherwise grow the first time somebody edited it.
        $players->each(fn (Member $player) => $player->setRelation(
            'attendance',
            $answers->get($player->id)
        ));

        return ChaseListEntryResource::collection($players);
    }

    /**
     * A member's own answer.
     *
     * PUT, so it is an IDEMPOTENT UPSERT: tapping Oui and then Non needs no
     * create-versus-update branch in the client and cannot race itself into
     * two rows — UNIQUE(event_id, member_id) is the backstop.
     *
     * NOT AUDITED, deliberately. The audit log records privileged mutations,
     * and answering for yourself is the one write in this release that
     * everybody makes and nobody administers. The on-behalf route IS audited,
     * because that one is a person acting for another person.
     */
    public function update(RecordOwnAttendanceRequest $request, Event $event): AttendanceResource
    {
        /** @var Member $member */
        $member = $request->user();

        AttendanceIntegrity::assertAnswerable($member);

        $data = $request->validated();

        $attendance = Attendance::updateOrCreate(
            ['event_id' => $event->id, 'member_id' => $member->id],
            [
                'status' => $data['status'],
                'note' => $data['note'] ?? null,
                // Cleared, including when this overwrites an answer the
                // direction had entered: the member correcting it themselves
                // is exactly the case where "saisie par la direction" stops
                // being true.
                'recorded_by_member_id' => null,
            ]
        );

        return new AttendanceResource($attendance);
    }

    /**
     * UNDO. Removes the answer entirely, returning the event to unanswered —
     * which is what a second PUT cannot express, and the whole reason this
     * endpoint exists rather than the client sending the opposite answer.
     *
     * The window is AttendanceIntegrity's (C12).
     */
    public function destroy(Request $request, Event $event): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        $attendance = Attendance::query()
            ->where('event_id', $event->id)
            ->where('member_id', $member->id)
            ->first();

        // Already gone. Idempotent rather than 404: undo is reached from a
        // toast, and a double tap on a flaky connection must not read as an
        // error to the member.
        if ($attendance === null) {
            return response()->json(['ok' => true]);
        }

        AttendanceIntegrity::assertUndoable($attendance);

        $attendance->delete();

        return response()->json(['ok' => true]);
    }
}
