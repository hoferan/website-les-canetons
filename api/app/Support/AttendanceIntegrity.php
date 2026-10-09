<?php

namespace App\Support;

use App\Exceptions\AttendanceRefused;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;

/**
 * The state checks around answering, kept together and out of the
 * controllers, the same way AccessIntegrity holds member administration's.
 *
 * They are about the state of the system rather than the caller's
 * permissions, which the route middleware has already checked by the time any
 * of these runs. assertAnswerable() looks at the member an answer is FOR.
 */
final class AttendanceIntegrity
{
    /**
     * How long an answer stays undoable.
     *
     * An answer has to be immediately undoable, and undoing a FIRST answer
     * must return the event to unanswered rather than to Non — which a
     * second PUT cannot express. But an unlimited undo would make the reason
     * a withdrawn yes costs decorative: a member could erase a yes and
     * re-answer no for free, with no reason. Five minutes is the compromise
     * (ADR 0018).
     *
     * Five rather than the toast's few seconds: the toast is the only route
     * to undo, so the window merely has to outlast it comfortably, and a
     * member whose phone dropped mid-tap should not be punished for the
     * reconnect.
     */
    public const UNDO_WINDOW_MINUTES = 5;

    /**
     * Nobody answers a draft, whoever they are.
     *
     * A manager can see one, so 404 is not available to them, and an answer
     * given now would sit on an event the rest of the band cannot see.
     */
    public static function assertPublished(Event $event): void
    {
        if (! $event->isDraft()) {
            return;
        }

        throw new AttendanceRefused(
            409,
            'event_not_published',
            'This event is still a draft and takes no answers',
        );
    }

    /**
     * Only a holder of `attendance.respond` is answerable, and this checks
     * the member an answer is FOR, on the on-behalf route.
     *
     * Answering for yourself never reaches it: that route carries
     * `permission:attendance.respond`, so a caller without it is refused
     * `403 access_denied` before the controller runs. Here the caller does
     * hold a permission, attendance.record_for_others, and the refusal is
     * about somebody else. Its own code says so, where access_denied would
     * send the committee hunting for a grant of their own that is not
     * missing.
     *
     * Dominique Direction organises, holds no `musician`, and never appears
     * on the chase list, so nobody answers for her either.
     */
    public static function assertAnswerable(Member $member): void
    {
        if ($member->hasPermission(Permission::AttendanceRespond)) {
            return;
        }

        throw new AttendanceRefused(
            403,
            'not_answerable',
            'This member does not hold attendance.respond and is not answerable for events',
        );
    }

    /**
     * The on-behalf route refuses its own caller (ADR 0018).
     *
     * It closes a real bypass. demo.both plays AND holds
     * attendance.record_for_others; without this he could withdraw his own
     * yes through the on-behalf endpoint, which is exempt from the reason
     * rule, and never supply the sentence the rule exists to collect.
     * Answering for yourself has its own route.
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

    /** The undo window, measured from when the answer was last recorded. */
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
