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
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Attendance', 'Who is coming. Anyone in a register answers for themselves; seeing the whole list and answering for somebody else are separate permissions.', weight: 30)]
class AttendanceController extends Controller
{
    /**
     * List who is coming to an event.
     *
     * Requires `attendance.view_all`. Returns every member who is answerable
     * for the event, ordered by name, whether or not they have replied: an
     * entry's `attendance` is `null` for somebody who has not, which is what
     * this list is read for.
     *
     * Answerable means being in a register. A member who is in none, such as
     * somebody who only organises, never appears here.
     *
     * Each entry carries the member's name and register alongside their
     * answer, and an answer says whether the direction entered it rather than
     * the member giving it themselves.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        // THE CHASE LIST — every answerable member, not just those who
        // replied. Returning only the answers would push "who has not
        // replied?" — the entire point of this screen — into a client-side
        // diff against a separately-fetched roster, which is two requests
        // that can disagree.
        //
        // Answerable means Member::isPlayer(): having a register. There is
        // deliberately no permission for being answerable — making it a grant
        // is what produced the old bug where an admin could not say whether
        // they were coming, and left the "Pas de réponse" counts meaningless.
        //
        // TWO QUERIES WHATEVER THE ROSTER SIZE: the players with their
        // register, and this event's answers keyed by member. Pinned by
        // test_the_chase_list_costs_a_fixed_number_of_queries — the roster is
        // ~45 people and this screen is read on a phone at a rehearsal.
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
     * Record your own answer for an event.
     *
     * Any logged-in member who is in a register; no permission is needed.
     * Answering is idempotent: sending an answer again replaces the previous
     * one rather than adding a second, and the response is always `200` with
     * the answer as it now stands, including its `recordedAt`.
     *
     * `status` is `yes` or `no`; anything else fails validation against that
     * field with `invalid_value`, which lists what is accepted.
     *
     * Taking back a `yes` costs a reason: if the stored answer is `yes` and
     * the incoming one is `no`, `note` is required, and a blank one fails
     * validation against `note` with `required`. A first answer of `no`, and
     * a change from `no` to `yes`, cost nothing. Recording on somebody else's
     * behalf is exempt from this rule.
     *
     * A member who is in no register is refused with `403 not_answerable`:
     * nothing is being asked of them, and no permission would change that.
     *
     * Answering for yourself clears any mark saying the direction entered the
     * answer.
     */
    #[Emits('not_answerable')]
    public function update(RecordOwnAttendanceRequest $request, Event $event): AttendanceResource
    {
        /** @var Member $member */
        $member = $request->user();

        AttendanceIntegrity::assertAnswerable($member);

        $data = $request->validated();

        // PUT, so it is an IDEMPOTENT UPSERT: tapping Oui and then Non needs
        // no create-versus-update branch in the client and cannot race itself
        // into two rows — UNIQUE(event_id, member_id) is the backstop.
        //
        // NOT AUDITED, deliberately. The audit log records privileged
        // mutations, and answering for yourself is the one write in this
        // release that everybody makes and nobody administers. The on-behalf
        // route IS audited, because that one is a person acting for another
        // person.
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
     * Take back your own answer.
     *
     * Any logged-in member; no permission is needed. Removes the answer
     * entirely and returns the event to unanswered, which is a state a second
     * `PUT` cannot express. Answers `{"ok": true}`, and taking back an answer
     * that is not there is not an error.
     *
     * The window closes five minutes after the answer was last recorded;
     * after that it answers `409 answer_already_settled`. `recordedAt` on the
     * answer is what tells a client whether the window is still open, so it
     * can offer the undo or not rather than finding out from a refusal.
     */
    #[Response(200, 'Withdrawn. The member now counts as not having answered.')]
    #[Emits('answer_already_settled')]
    public function destroy(Request $request, Event $event): JsonResponse
    {
        // UNDO. Removes the answer entirely, returning the event to
        // unanswered — which is what a second PUT cannot express, and the
        // whole reason this endpoint exists rather than the client sending
        // the opposite answer.
        //
        // The window is AttendanceIntegrity's (C12): five minutes from
        // updated_at, so C11's reason-for-a-withdrawal rule is not decorative
        // — an unlimited undo would let a member erase a yes and re-answer no
        // for free.
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
