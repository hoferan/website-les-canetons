<?php

namespace App\Support;

use App\Exceptions\AttendanceRefused;
use App\Models\Attendance;
use App\Models\Member;

/**
 * The state checks around answering, kept together and out of the
 * controllers, the same way AccessIntegrity holds member administration's.
 *
 * All three are about the state of the system rather than about permissions —
 * which is the whole reason they exist as code at all, since answering is
 * deliberately not gated by any permission.
 */
final class AttendanceIntegrity
{
    /**
     * How long an answer stays undoable.
     *
     * §4 requires an answer to be "immediately undoable", and undoing a FIRST
     * answer must return the event to unanswered rather than to Non — which a
     * second PUT cannot express. But an unlimited undo would make C11
     * decorative: a member could erase a yes and re-answer no for free, with
     * no reason. Five minutes is C12's compromise.
     *
     * Five rather than the toast's few seconds: the toast is the only route
     * to undo, so the window merely has to outlast it comfortably, and a
     * member whose phone dropped mid-tap should not be punished for the
     * reconnect.
     */
    public const UNDO_WINDOW_MINUTES = 5;

    /**
     * Only somebody in a register is answerable — Member::isPlayer(), exactly
     * as R1a defined it.
     *
     * Dominique Direction organises, plays in nothing, and never appears in
     * an attendance list. 403 with its own code rather than the generic
     * access_denied: telling an organiser "accès refusé" when the truth is
     * "you are not in a register" sends them hunting for a permission that
     * does not exist.
     */
    public static function assertAnswerable(Member $member): void
    {
        if ($member->isPlayer()) {
            return;
        }

        throw new AttendanceRefused(
            403,
            'not_answerable',
            'This member is not in a register and is not answerable for events',
        );
    }

    /**
     * The on-behalf route refuses its own caller (decision C14).
     *
     * Found by André while reviewing the design, and it closes a real bypass.
     * demo.both plays AND holds attendance.record_for_others; without this he
     * could withdraw his own yes through the on-behalf endpoint, which is
     * exempt from C11's reason rule (C13), and never supply the sentence the
     * rule exists to collect. Answering for yourself has its own route.
     */
    public static function assertNotSelf(Member $actor, Member $target): void
    {
        if ($actor->id !== $target->id) {
            return;
        }

        throw new AttendanceRefused(
            409,
            'cannot_record_for_self',
            'Use your own answer endpoint to answer for yourself',
        );
    }

    /** C12: the undo window, measured from when the answer was last recorded. */
    public static function assertUndoable(Attendance $attendance): void
    {
        if ($attendance->updated_at->diffInMinutes(now()) < self::UNDO_WINDOW_MINUTES) {
            return;
        }

        throw new AttendanceRefused(
            409,
            'answer_already_settled',
            'This answer can no longer be undone',
        );
    }
}
