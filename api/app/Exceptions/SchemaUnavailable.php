<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * The database schema cannot be trusted to be up to date for this request, and
 * App\Http\Middleware\RunPendingMigrations refused to let it through.
 *
 * Thrown for exactly two situations, both of which mean "there are pending
 * migrations and they are not applied right now":
 *
 *  - the migration run itself failed (a throwing migration, or `artisan
 *    migrate` exiting non-zero), or
 *  - the advisory lock could not be taken within the timeout, i.e. another
 *    PHP-FPM worker has been migrating for longer than we are willing to wait.
 *
 * Serving the request anyway is the one thing that must not happen: a
 * half-applied schema produces wrong answers rather than errors, and wrong
 * answers are the failure mode nobody notices. So this exists to turn that into
 * a visible 503 — see the render() closure in bootstrap/app.php and
 * ApiError::serviceUnavailable().
 *
 * A plain RuntimeException rather than a Symfony HttpException(503), on
 * purpose. Handler::render() runs prepareException() before renderViaCallbacks()
 * and rewrites several framework exceptions on the way, and the existing
 * catch-all HttpException closure (ApiError::invalidSession) already has to
 * discriminate by status because of it. A type of our own that the framework
 * has no opinion about cannot be rewritten out from under its render closure,
 * and cannot be swallowed by that catch-all either. Being unhandled by
 * Laravel's own conventions also means report() logs it with its stack trace,
 * which is the audit trail an operator needs to find out WHY a server started
 * 503ing.
 */
final class SchemaUnavailable extends RuntimeException {}
