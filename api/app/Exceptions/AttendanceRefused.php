<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * An answer was refused for a reason that is about the STATE of things, not
 * about a missing grant.
 *
 * There is deliberately no permission for answering an event (design §3), so
 * none of these can be expressed as a 403 from `permission:` middleware:
 *
 *   403 not_answerable          the member is in no register, so nothing is
 *                               being asked of them
 *   409 cannot_record_for_self  C14 — the on-behalf route refusing its own
 *                               caller, which is what stops C11's reason rule
 *                               being one request away from evadable
 *   409 answer_already_settled  C12 — the undo window has closed
 *
 * The status travels ON the exception rather than being hard-coded in the
 * renderer, the same call ReauthenticationFailed makes: 403 and 409 are
 * genuinely different answers here, and one of them is not a conflict.
 *
 * `errorCode`, not `code`, for the reason AccessIntegrityViolation documents
 * at length: \Exception already declares an untyped `$code`, and the wider
 * ecosystem expects getCode() to return an int.
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
