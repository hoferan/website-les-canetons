<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * An answer was refused because of the state of things, not a missing grant.
 * The route middleware has already checked the caller's permission:
 *
 *   403 not_answerable          the member an on-behalf answer is for holds no
 *                               attendance.respond, so nothing is being asked
 *                               of them
 *   409 cannot_record_for_self  the on-behalf route refusing its own caller,
 *                               so the reason a withdrawn yes requires
 *                               cannot be evaded (ADR 0018)
 *   409 answer_already_settled  the five-minute undo window has closed
 *   409 event_not_published     the event is still a draft
 *
 * The status travels on the exception because 403 and 409 are different
 * answers here.
 *
 * `errorCode`, not `code`: see AccessIntegrityViolation.
 */
final class AttendanceRefused extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
