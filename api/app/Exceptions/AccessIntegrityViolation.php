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
    public function __construct(
        /**
         * Deliberately NOT named `code`: `\Exception` already declares
         * `protected $code` (untyped, no default type, mutable), and PHP 8.4
         * fatally refuses a subclass that redeclares an inherited property
         * with a type or with `readonly` added. Beyond the PHP restriction,
         * the wider PHP ecosystem — loggers, error handlers, monitoring
         * integrations — expects `Exception::getCode()` to return an int;
         * shadowing it with a machine token would silently break that
         * contract for anything that never touches this app's own renderer.
         * A distinct property name buys both a typed `readonly` property and
         * a correct, untouched `getCode()`.
         */
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
