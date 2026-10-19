<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A write was refused because it would have broken an access invariant:
 * locking everyone out of member administration, or letting someone remove
 * their own ability to undo the change.
 *
 * 409 Conflict, not 403: the caller has the permission, but the request
 * conflicts with the state of the system.
 */
final class AccessIntegrityViolation extends RuntimeException
{
    public function __construct(
        /**
         * Deliberately not named `code`: `\Exception` already declares an
         * untyped, mutable `protected $code`, and PHP 8.4 fatally refuses a
         * subclass that redeclares an inherited property with a type or
         * `readonly`. Loggers and error handlers also expect getCode() to
         * return an int.
         */
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
