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
use App\Support\EffectivePermissions;
use App\Support\Emits;
use App\Support\Permission;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Attendance', 'Who is coming. Holders of `attendance.respond` answer for themselves; seeing the whole list and answering for somebody else are separate permissions.', weight: 30)]
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
     * Answerable means holding `attendance.respond`, whatever the member's
     * register. A member without it, such as somebody who only organises,
     * never appears here.
     *
     * Each entry carries the member's name and register alongside their
     * answer, and an answer says whether the direction entered it rather than
     * the member giving it themselves.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        // The chase list: every answerable member, not only those who replied,
        // so "who has not replied?" needs no client-side diff against a
        // separately fetched roster.
        //
        // Answerable means holding attendance.respond, the permission the
        // member's own answer route requires. The register only labels a row.
        //
        // Two queries whatever the roster size (the permission filter is a
        // subquery), pinned by
        // test_the_chase_list_costs_a_fixed_number_of_queries. This screen is
        // read on a phone at a rehearsal.
        $players = Member::query()
            ->with('section')
            ->whereIn('id', EffectivePermissions::holders(Permission::AttendanceRespond))
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        $answers = Attendance::query()
            ->where('event_id', $event->id)
            ->get()
            ->keyBy('member_id');

        // setRelation, so the Resource never issues a query per row.
        $players->each(fn (Member $player) => $player->setRelation(
            'attendance',
            $answers->get($player->id)
        ));

        return ChaseListEntryResource::collection($players);
    }

    /**
     * Record your own answer for an event.
     *
     * Requires `attendance.respond`, whatever the caller's register.
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
     * Answering for yourself clears any mark saying the direction entered the
     * answer.
     */
    #[Emits('event_not_published')]
    public function update(RecordOwnAttendanceRequest $request, Event $event): AttendanceResource
    {
        /** @var Member $member */
        $member = $request->user();

        AttendanceIntegrity::assertPublished($event);

        $data = $request->validated();

        // An idempotent upsert: the client needs no create-versus-update
        // branch, and UNIQUE(event_id, member_id) stops a race into two rows.
        //
        // Not audited. The audit log records privileged mutations, and
        // answering for yourself is a write everybody makes and nobody
        // administers. The on-behalf route is audited.
        $attendance = Attendance::updateOrCreate(
            ['event_id' => $event->id, 'member_id' => $member->id],
            [
                'status' => $data['status'],
                'note' => $data['note'] ?? null,
                // Cleared even over an answer the direction entered: once the
                // member corrects it, "saisie par la direction" is no longer
                // true.
                'recorded_by_member_id' => null,
            ]
        );

        return new AttendanceResource($attendance);
    }

    /**
     * Take back your own answer.
     *
     * Requires `attendance.respond`, like giving one. Removes the answer
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
    #[Emits('answer_already_settled', 'event_not_published')]
    public function destroy(Request $request, Event $event): JsonResponse
    {
        AttendanceIntegrity::assertPublished($event);

        // Undo exists because a second PUT cannot express "unanswered".
        //
        // AttendanceIntegrity limits it to five minutes from updated_at: an
        // unlimited undo would let a member erase a yes and re-answer no
        // without the reason that costs.
        /** @var Member $member */
        $member = $request->user();

        $attendance = Attendance::query()
            ->where('event_id', $event->id)
            ->where('member_id', $member->id)
            ->first();

        // Idempotent rather than 404: undo is reached from a toast, and a
        // double tap on a flaky connection must not read as an error.
        if ($attendance === null) {
            return response()->json(['ok' => true]);
        }

        AttendanceIntegrity::assertUndoable($attendance);

        $attendance->delete();

        return response()->json(['ok' => true]);
    }
}
