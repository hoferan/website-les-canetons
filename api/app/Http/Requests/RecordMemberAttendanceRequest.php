<?php

namespace App\Http\Requests;

use App\Support\AttendanceStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One member's answer, entered on their behalf by the committee.
 *
 * The same payload a member sends for themselves, with one rule missing:
 * `note` is always optional here, even when the answer changes from `yes` to
 * `no`, because the committee is writing down what the member told them.
 *
 * The route refuses a caller who aims it at their own membership, so a member
 * who both plays and manages still has to answer for themselves through
 * `PUT /api/v1/events/{event}/attendance`.
 */
class RecordMemberAttendanceRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // No reason is required for a withdrawn yes (ADR 0018): the committee
        // records what the member told them and should not invent a reason.
        //
        // That exemption is why the route refuses its own caller: a member who
        // both plays and manages could otherwise withdraw their own yes here
        // without the reason RecordOwnAttendanceRequest asks for. The refusal
        // is in the controller because it is a conflict with the system's
        // state, not a malformed field.
        return [
            /** Whether the member is coming. One of `yes` or `no`. */
            'status' => ['required', 'string', AttendanceStatus::rule()],
            /** What the member said, in their words. Always optional on this endpoint, including when an earlier `yes` is being withdrawn. */
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
