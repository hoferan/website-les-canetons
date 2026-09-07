<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A destructive privileged action was refused because the actor did not
 * re-prove who they are (spec §6, decision B1).
 *
 * 403 for a wrong password, 429 when the actor has been throttled — so the
 * STATUS TRAVELS ON THE EXCEPTION rather than being assumed by the renderer.
 * They are genuinely different answers: one says "that is not your password",
 * the other says "stop asking", and a renderer that hard-coded 403 would turn
 * the throttle into a silent lie.
 *
 * Not 401 in either case. The session is valid and the caller holds the
 * permission; what failed is the re-proof, not the authentication.
 *
 * `errorCode`, not `code`: \Exception already declares `protected $code`
 * (untyped, mutable), PHP 8.4 fatally refuses a subclass that redeclares an
 * inherited property with a type or `readonly`, and the wider ecosystem —
 * loggers, monitoring — expects getCode() to return an int. Same reasoning,
 * and the same trap, as AccessIntegrityViolation; read that class before
 * renaming anything here.
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
