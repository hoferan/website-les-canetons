<?php

namespace App\Support;

use App\Models\BookingChange;
use App\Models\Member;
use App\Models\Registration;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Writes the booking journal the committee inbox nets against (ADR 0035).
 *
 * Called from Registration's model hooks and writeChoices(), never from a
 * controller, so a new write path cannot forget it: the risk ADR 0021
 * rejected a stored inbox for.
 *
 * The row is written after the transaction commits, so a booking refused and
 * rolled back leaves no trace. It also keeps journal ids close to commit
 * order, which the read mark relies on: a row written inside a long booking
 * transaction would take an id early and could land under a mark set before
 * it committed. Two rows written in the same instant can still take their ids
 * out of order; that window is microseconds wide.
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
            'kind' => $kind,
            'actor_member_id' => $actor instanceof Member ? $actor->id : null,
            'actor_label' => $actor instanceof Member ? $actor->fullName() : null,
        ];

        DB::afterCommit(function () use ($row): void {
            // The booking has committed by now. Failing here would answer an
            // error for a booking that exists, and a guest's retry would book
            // twice; a missing journal row only costs the inbox one notice.
            try {
                BookingChange::create($row);
            } catch (Throwable $failure) {
                report($failure);
            }
        });
    }
}
