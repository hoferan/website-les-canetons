<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A write was refused because it would have broken an access invariant —
 * locking everyone out of member administration, or letting someone remove
 * their own ability to undo the change.
 *
 * 409 Conflict, not 403: the caller HAS the permission. The request conflicts
 * with the state of the system, which is precisely what 409 is for.
 */
final class AccessIntegrityViolation extends RuntimeException
{
    /**
     * Untyped and NOT `readonly`, deliberately, unlike everywhere else in this
     * codebase: `\Exception` already declares `protected $code` (untyped, no
     * default type, mutable), and PHP 8.4 fatally refuses a subclass that
     * redeclares an inherited property with a type or with `readonly` added —
     * "Cannot redeclare non-readonly property Exception::$code as readonly",
     * and the same failure for adding a plain `string` type with no `readonly`
     * at all. Widening visibility to `public` is the only change PHP accepts.
     * The property is still set exactly once, in the constructor below, and
     * never written again — that is the actual contract, just not one PHP's
     * `readonly` keyword can express here.
     */
    public $code;

    public function __construct(string $code, string $message)
    {
        $this->code = $code;
        parent::__construct($message);
    }
}
