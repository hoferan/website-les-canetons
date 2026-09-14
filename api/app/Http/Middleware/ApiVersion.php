<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Announces which version of the contract answered, and — when the day comes —
 * that it is going away.
 *
 * The contract lives under /api/v1. THIS CLASS OWNS THAT STRING: bootstrap/app.php
 * passes self::PREFIX to withRouting(apiPrefix:), and the check below uses the
 * same constant, so the prefix cannot drift between where routes are mounted and
 * where this middleware decides whether it is looking at one.
 *
 * Three headers, all driven by config/api.php and all absent by default:
 *
 *   Deprecation: @1793491200
 *       RFC 9745. A structured-field Date — an `@` followed by unix seconds —
 *       naming the moment this version became deprecated. Not a boolean, and
 *       not an HTTP-date; the two sibling headers use three different formats
 *       between them, which is exactly the sort of thing that gets guessed
 *       wrong at 2am during a migration.
 *
 *   Sunset: Sat, 01 Aug 2026 00:00:00 GMT
 *       RFC 8594. An HTTP-date, naming when the version stops answering.
 *
 *   Link: </api/v2>; rel="successor-version"
 *       RFC 8288, relation registered by RFC 5829. Where to go instead.
 *
 * v1 configures none of them and this middleware emits nothing. It is built and
 * tested now because the alternative is writing it during the one week it has to
 * work, against a contract that already has consumers. See A1 in
 * docs/superpowers/specs/2026-09-11-api-v1-public-contract-design.md.
 *
 * It deliberately does NOT apply to routes/meta.php (/api/docs, /api/migrate).
 * Those are unversioned — they describe or operate the API rather than being part
 * of it — and they share the `api` middleware group, so the prefix check is what
 * keeps them out rather than a second group.
 */
class ApiVersion
{
    /**
     * The route prefix the versioned contract is mounted at.
     *
     * Read by bootstrap/app.php's withRouting(apiPrefix:) as well as by this
     * middleware. Changing it here moves both.
     */
    public const PREFIX = 'api/v1';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->is(self::PREFIX.'/*') && ! $request->is(self::PREFIX)) {
            return $response;
        }

        foreach ($this->retirementHeaders() as $header => $value) {
            $response->headers->set($header, $value);
        }

        return $response;
    }

    /**
     * @return array<string, string>
     */
    private function retirementHeaders(): array
    {
        $headers = [];

        if ($deprecatedAt = $this->timestamp('api.deprecation.at')) {
            // RFC 9745 sf-date: "@" then unix seconds.
            $headers['Deprecation'] = '@'.$deprecatedAt;
        }

        if ($sunsetAt = $this->timestamp('api.deprecation.sunset')) {
            // RFC 8594 wants an HTTP-date, which is always GMT.
            $headers['Sunset'] = gmdate('D, d M Y H:i:s', $sunsetAt).' GMT';
        }

        if ($successor = config('api.deprecation.successor')) {
            $headers['Link'] = '<'.$successor.'>; rel="successor-version"';
        }

        return $headers;
    }

    /**
     * Config carries a date string a human wrote in a .env; this turns it into
     * seconds, or into nothing at all. An unparseable value emits no header
     * rather than a wrong one: a malformed Sunset is worse than a missing one,
     * because a client that believes it will stop calling on the wrong day.
     */
    private function timestamp(string $key): ?int
    {
        $configured = config($key);

        if (! is_string($configured) || $configured === '') {
            return null;
        }

        $parsed = strtotime($configured);

        return $parsed === false ? null : $parsed;
    }
}
