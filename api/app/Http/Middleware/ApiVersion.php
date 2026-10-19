<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Announces that the contract version that answered is deprecated, once
 * config/api.php says so. ADR 0013.
 *
 * This class owns the /api/v1 prefix: bootstrap/app.php passes self::PREFIX to
 * withRouting(apiPrefix:), and the check below uses the same constant, so the
 * two cannot drift.
 *
 * Three headers, all driven by config/api.php and all absent by default:
 *
 *   Deprecation: @1793491200
 *       RFC 9745. A structured-field Date (`@` then unix seconds) naming when
 *       this version became deprecated. Neither a boolean nor an HTTP-date.
 *
 *   Sunset: Sat, 01 Aug 2026 00:00:00 GMT
 *       RFC 8594. An HTTP-date, naming when the version stops answering.
 *
 *   Link: </api/v2>; rel="successor-version"
 *       RFC 8288, relation registered by RFC 5829. Where to go instead.
 *
 * v1 configures none of them, so this middleware emits nothing yet.
 *
 * routes/meta.php (/api/docs, /api/migrate) is unversioned and shares the `api`
 * middleware group, so the prefix check is what keeps those routes out.
 */
class ApiVersion
{
    /**
     * The route prefix the versioned contract is mounted at, also read by
     * bootstrap/app.php's withRouting(apiPrefix:).
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
     * Parses a date string written by hand in a .env. An unparseable value
     * emits no header: a client that believes a malformed Sunset stops calling
     * on the wrong day.
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
