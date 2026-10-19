<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * The database schema cannot be trusted to be up to date for this request, and
 * App\Http\Middleware\RunPendingMigrations refused to let it through.
 *
 * Thrown when there are pending migrations that are not applied right now:
 *
 *  - the migration run itself failed (a throwing migration, or `artisan
 *    migrate` exiting non-zero), or
 *  - the advisory lock could not be taken within the timeout, because
 *    another PHP-FPM worker is still migrating.
 *
 * A half-applied schema produces wrong answers rather than errors, so this
 * turns it into a visible 503 (see the render() closure in bootstrap/app.php
 * and ApiError::serviceUnavailable()).
 *
 * A plain RuntimeException rather than a Symfony HttpException(503):
 * Handler::render() runs prepareException() first and rewrites several
 * framework exceptions, and the catch-all HttpException closure
 * (ApiError::invalidSession) would see it too. A type of our own cannot be
 * rewritten or swallowed, and report() logs it with its stack trace, which
 * tells an operator why the server is answering 503.
 */
final class SchemaUnavailable extends RuntimeException {}
