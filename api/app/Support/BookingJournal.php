<?php

namespace App\Support;

use App\Models\BookingChange;
use App\Models\Member;
use App\Models\Registration;
use Illuminate\Support\Facades\DB;

/**
 * Writes the booking journal the committee inbox nets against (ADR 0035).
 *
 * Called from Registration's model hooks and writeChoices(), never from a
 * controller, so a new write path cannot forget it: the risk ADR 0021
 * rejected a stored inbox for.
 *
 * The row is written after the transaction commits. A booking refused and
 * rolled back leaves no trace, and journal ids follow commit order, which the
 * read mark relies on: a cursor that a late-committing row could slip under
 * would swallow a change nobody saw.
 */
final class BookingJournal
{
    public static function record(Registration $registration, BookingChangeKind $kind): void
    {
        // Null on the public form, where a guest has no account.
        $actor = auth()->user();
        $row = [
            'event_id' => $registration->event_id,
            'registration_id' => $registration->id,
            'change' => $kind,
            'actor_member_id' => $actor instanceof Member ? $actor->id : null,
            'actor_label' => $actor instanceof Member ? $actor->fullName() : null,
        ];

        DB::afterCommit(fn () => BookingChange::create($row));
    }
}
