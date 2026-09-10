<?php

namespace App\Http\Requests;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceStatus;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A member answering for THEMSELVES.
 *
 * WITHDRAWING A YES COSTS A REASON (decision C11). If the stored answer is
 * `yes` and the incoming one is `no`, `note` becomes required and a blank one
 * comes back as an ordinary validation failure against that field — no new
 * error vocabulary invented, and it lands in the dialog beside the box the
 * member has to fill in.
 *
 * The rule is asymmetric on purpose. Saying yes late costs nothing; taking a
 * yes back is what leaves the cook with a headcount that is wrong and the
 * committee with a gap in a Guggenmusik's front row. Recording on somebody's
 * behalf is exempt (C13) and uses RecordMemberAttendanceRequest instead —
 * which is also why C14 makes the on-behalf route refuse its own caller,
 * because otherwise this rule would be one request away from evadable.
 */
class RecordOwnAttendanceRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'status' => ['required', 'string', AttendanceStatus::rule()],

            // `required` rather than `nullable` only on the withdrawal, and
            // `required` leads the list because ApiError reports the FIRST
            // failed rule per field.
            'note' => [$this->withdrawingAYes() ? 'required' : 'nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Is this request taking back a `yes` the member themselves gave?
     *
     * Null-safe throughout, the same call UpdateEventRequest makes:
     * ApiErrorVocabularyTest instantiates every FormRequest outside a request
     * to read its rules() keys, so there is no bound route model and no
     * authenticated user then. At runtime the route and the session guarantee
     * both.
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
