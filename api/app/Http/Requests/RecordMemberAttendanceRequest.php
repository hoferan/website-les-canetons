<?php

namespace App\Http\Requests;

use App\Support\AttendanceStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One member's answer, entered on their behalf by the committee.
 *
 * The same payload a member sends for themselves, with one rule missing:
 * `note` is always optional here, even when the answer changes from `yes` to
 * `no`. The committee is writing down what somebody told them on the phone,
 * not justifying a decision of their own.
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
        // NO C11 REASON RULE, deliberately (decision C13). The member phoned
        // the committee to say they cannot come; making the committee invent a
        // written reason on their behalf would put words in their mouth, and
        // the note is free text here for whatever they actually said.
        //
        // That exemption is exactly why the route refuses its own caller
        // (C14): a member who both plays and manages — demo.both — could
        // otherwise withdraw their own yes through this endpoint and never
        // supply the reason C11 asks for. The refusal is in the controller,
        // not here, because it is a conflict with the state of the system
        // rather than a malformed field.
        return [
            /** Whether the member is coming. One of `yes` or `no`. */
            'status' => ['required', 'string', AttendanceStatus::rule()],
            /** What the member said, in their words. Always optional on this endpoint, including when an earlier `yes` is being withdrawn. */
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
