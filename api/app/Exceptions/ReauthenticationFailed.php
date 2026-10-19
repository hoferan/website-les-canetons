<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A destructive privileged action was refused because the actor did not
 * re-prove who they are. The only caller is a member changing their own
 * password (ADR 0017).
 *
 * 403 for a wrong password, 429 when the actor has been throttled, so the
 * status travels on the exception rather than being assumed by the renderer.
 *
 * Not 401 in either case: the session is valid and the caller holds the
 * permission; what failed is the re-proof.
 *
 * `errorCode`, not `code`: see AccessIntegrityViolation.
 */
final class ReauthenticationFailed extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
