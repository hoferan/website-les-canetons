<?php

namespace App\Http\Requests;

use App\Support\AttendanceStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Somebody holding attendance.record_for_others answering for a member.
 *
 * NO C11 REASON RULE, deliberately (decision C13). The member phoned the
 * committee to say they cannot come; making the committee invent a written
 * reason on their behalf would put words in their mouth, and the note is free
 * text here for whatever they actually said.
 *
 * That exemption is exactly why the route refuses its own caller (C14): a
 * member who both plays and manages — demo.both — could otherwise withdraw
 * their own yes through this endpoint and never supply the reason C11 asks
 * for. The refusal is in the controller, not here, because it is a conflict
 * with the state of the system rather than a malformed field.
 */
class RecordMemberAttendanceRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'status' => ['required', 'string', AttendanceStatus::rule()],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
