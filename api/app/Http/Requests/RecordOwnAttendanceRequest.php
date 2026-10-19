<?php

namespace App\Http\Requests;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A member's own answer to an event.
 *
 * `status` is `yes` or `no`; there is no "maybe". The endpoint is idempotent,
 * so sending the same answer twice is fine and answering again replaces the
 * previous answer.
 *
 * One conditional rule: taking back a `yes` costs a reason. If the stored
 * answer is `yes` and this request sends `no`, `note` becomes required and an
 * empty one fails validation against `note` with `required`. Saying yes late,
 * or repeating a `no`, needs no note.
 *
 * Recording an answer on somebody else's behalf uses
 * `PUT /api/v1/events/{event}/attendance/{member}`, which does not ask for the
 * reason.
 */
class RecordOwnAttendanceRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Withdrawing a yes costs a reason (ADR 0018). A blank note is an
        // ordinary validation failure against `note`, so it needs no new error
        // vocabulary and shows beside the field the member has to fill in.
        //
        // Asymmetric on purpose: a late yes costs nothing, a withdrawn yes
        // leaves a wrong headcount. Recording on somebody's behalf uses
        // RecordMemberAttendanceRequest, which is why that route refuses its
        // own caller: otherwise this rule could be evaded.
        //
        // `note` leads with `required` on a withdrawal because ApiError
        // reports the first failed rule per field.
        return [
            /** Whether the member is coming. One of `yes` or `no`. */
            'status' => ['required', 'string', AttendanceStatus::rule()],

            /** Free text. Required when this request changes the member's own stored `yes` into a `no`; optional otherwise. */
            'note' => [$this->withdrawingAYes() ? 'required' : 'nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Is this request taking back a `yes` the member themselves gave?
     *
     * Null-safe, like UpdateEventRequest: ApiErrorVocabularyTest instantiates
     * every FormRequest outside a request to read its rules() keys, with no
     * bound route model and no user.
     */
    private function withdrawingAYes(): bool
    {
        if ($this->input('status') !== AttendanceStatus::No->value) {
            return false;
        }

        $event = $this->route('event');
        $member = $this->user();

        if (! $event instanceof Event || ! $member instanceof Member) {
            return false;
        }

        return Attendance::query()
            ->where('event_id', $event->id)
            ->where('member_id', $member->id)
            ->where('status', AttendanceStatus::Yes)
            ->exists();
    }
}
