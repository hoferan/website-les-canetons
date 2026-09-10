<?php

use App\Support\Scramble\AccessDeniedExceptionResponse;
use App\Support\Scramble\AuthenticationExceptionResponse;
use App\Support\Scramble\ValidationExceptionResponse;
use Dedoc\Scramble\Http\Middleware\RestrictedDocsAccess;

return [
    /*
     * Which routes to document. String or array form; use Scramble::routes() for custom selection.
     *
     * 'api_path' => [
     *     'include' => 'api',
     *     'exclude' => ['api/internal'],
     * ],
     *
     * Without *, patterns match path segments (api matches api and api/users, not apiary).
     * With *, Str::is is used (e.g. api/v*).
     *
     * One static include → default server is /{include} and paths are stripped (/users).
     * Multiple includes or wildcards → server defaults to / and paths stay full (/api/users).
     * Override with `servers`, or use Scramble::registerApi() for separate bases.
     */
    /*
     * The docs routes are excluded so the API reference does not document
     * itself — and, more to the point, so orval does not generate TanStack
     * Query hooks for a documentation page.
     *
     * The array form is used with a SINGLE include, which keeps Scramble's
     * path-stripping behaviour: paths stay /me and /config rather than
     * becoming /api/me. Verified 2026-09-07 by exporting both ways and
     * diffing — the document is byte-identical.
     */
    'api_path' => [
        'include' => 'api',
        'exclude' => ['api/docs', 'api/docs.json'],
    ],

    /*
     * Your API domain. By default, app domain is used. This is also a part of the default API routes
     * matcher, so when implementing your own, make sure you use this config if needed.
     */
    'api_domain' => null,

    /*
     * Where scramble:export writes the document. Resolved against the WORKING
     * DIRECTORY of the process running artisan (File::put is a bare
     * file_put_contents), not against any project-root concept — so this lands
     * at api/openapi.json because the exporter always runs from api/. See
     * tools/openapi.mjs, which cd's there for exactly this reason.
     *
     * That file is committed and consumed by orval.
     */
    'export_path' => 'openapi.json',

    /*
     * Cache configuration for the generated OpenAPI document.
     *
     * Use `scramble:cache` to warm the cache and `scramble:clear` to invalidate it.
     */
    'cache' => [
        'key' => 'scramble.openapi',
        'store' => 'file',
    ],

    'info' => [
        /*
         * API version.
         */
        'version' => env('API_VERSION', '0.0.1'),

        /*
         * Rendered at the top of the reference at GET /api/docs. This is the
         * first and often only thing a developer reads, so it carries what
         * cannot be discovered from an endpoint list: how to authenticate,
         * what an error looks like, and the conventions every response
         * follows.
         */
        'description' => <<<'MARKDOWN'
The API behind the members' area and the public forms of the Guggenmusik
**Les Canetons de Fribourg**.

## Authenticating

Session cookies, not tokens. The browser and the API share one origin, so
there is no CORS and no `Authorization` header.

1. `GET /sanctum/csrf-cookie` once per page load. It sets `XSRF-TOKEN`.
2. `POST /api/login` with `username` and `password`.
3. Send the `XSRF-TOKEN` cookie value back as an `X-XSRF-TOKEN` header on
   every request that writes. Without it a write answers
   `419 invalid_session`.

Reads that need a session answer `401 not_authenticated` without one.

## Errors

Every failure uses one shape:

```json
{
  "error": "Invalid form submission",
  "code": "validation_failed",
  "fields": [{ "field": "endsAt", "reason": "must_be_after" }]
}
```

`code` and `fields[].reason` are stable machine tokens, never prose to show
a user. The front end maps them to French; any other client should do the
same rather than displaying `error`, which is English and meant for logs.

`fields` is present only on `400 validation_failed`. A `reason` may carry
`params` (for example `{"max": 255}`) when the sentence needs a number.

## Status codes

| Code | Means |
| --- | --- |
| `400` | The submitted fields are wrong. See `fields`. |
| `401` | No session. Log in. |
| `403` | Logged in, but not allowed to do this. |
| `404` | No such thing, or nothing you may know exists. |
| `409` | Allowed, but it conflicts with the current state. |
| `419` | The session or CSRF token expired. Prime the cookie and retry. |
| `422` | The submission looks automated. See *Public forms*. |
| `429` | Rate limited. |
| `503` | The service is temporarily refusing to serve. |

## Permissions

Authorisation is by permission, never by role. Roles are editable data that
group permissions; which role granted one is not a question the API answers.
`GET /api/me` returns the caller's effective permissions.

`events.manage`, `attendance.view_all`, `attendance.record_for_others`,
`members.manage`, `registrations.view`, `registrations.manage`.

Answering an event deliberately needs **no** permission: anyone in a register
answers for themselves.

## Conventions

- Field names are `camelCase` in both directions.
- Timestamps are ISO 8601 with an offset (`2026-09-05T10:00:00+02:00`).
  Events happen in Europe/Zurich whatever the reader's timezone; send an
  offset and one will be honoured.
- Money is an integer number of centimes. `4500` is CHF 45.00.
- Collections are returned as bare JSON arrays, with no `data` envelope.

## Public forms

`POST /api/contact` and `POST /api/events/{event}/registrations` are open to
anonymous callers and are protected against automated submission. Both
require:

- an `X-Form-Token` header, from `GET /api/form-token`, at least two seconds
  and at most two hours old, and
- a `website` field, present and empty.

Failing either answers `422 spam_suspected`. Both endpoints are rate limited
to 10 requests a minute per IP.
MARKDOWN,
    ],

    'ui' => [
        'title' => null,
    ],

    'renderer' => 'elements',

    'renderers' => [
        /*
         * Stoplight Elements config options: https://docs.stoplight.io/docs/elements/b074dc47b2826-elements-configuration-options
         */
        'elements' => [
            'view' => 'scramble::docs',
            'theme' => 'light',
            'hideTryIt' => false,
            'hideSchemas' => false,
            'logo' => '',
            'tryItCredentialsPolicy' => 'include',
            'layout' => 'responsive',
            'router' => 'hash',
        ],
        /*
         * Scalar API reference config options: https://scalar.com/products/api-references/configuration
         */
        'scalar' => [
            'view' => 'scramble::scalar',
            'cdn' => 'https://cdn.jsdelivr.net/npm/@scalar/api-reference',
            'theme' => 'laravel',
            'proxyUrl' => 'https://proxy.scalar.com',
            'darkMode' => false,
            'showDeveloperTools' => 'never',
            'agent' => ['disabled' => true],
            'credentials' => 'include',
        ],
    ],

    /*
     * Pinned to an ABSOLUTE production URL on purpose. Left at null, Scramble
     * derives the server from APP_URL, so the same code exports a different
     * document on every machine (http://localhost:8090/api locally, something
     * else in CI) and the drift check in CI could never pass. Laravel's url()
     * helper returns absolute URLs unchanged, so this value survives verbatim
     * and the exported document is byte-identical everywhere.
     *
     * The client does not read this: web/src/api/http.ts prepends /api itself,
     * because the SPA is served from the same origin as the API.
     */
    'servers' => [
        'Production' => 'https://lescanetons.org/api',
    ],

    /**
     * Determines how Scramble stores the descriptions of enum cases.
     * Available options:
     * - 'description' – Case descriptions are stored as the enum schema's description using table formatting.
     * - 'extension' – Case descriptions are stored in the `x-enumDescriptions` enum schema extension.
     *
     *    @see https://redocly.com/docs-legacy/api-reference-docs/specification-extensions/x-enum-descriptions
     * - false - Case descriptions are ignored.
     */
    'enum_cases_description_strategy' => 'description',

    /**
     * Determines how Scramble stores the names of enum cases.
     * Available options:
     * - 'names' – Case names are stored in the `x-enumNames` enum schema extension.
     * - 'varnames' - Case names are stored in the `x-enum-varnames` enum schema extension.
     * - false - Case names are not stored.
     */
    'enum_cases_names_strategy' => false,

    /**
     * When Scramble encounters deep objects in query parameters, it flattens the parameters so the generated
     * OpenAPI document correctly describes the API. Flattening deep query parameters is relevant until
     * OpenAPI 3.2 is released and query string structure can be described properly.
     *
     * For example, this nested validation rule describes the object with `bar` property:
     * `['foo.bar' => ['required', 'int']]`.
     *
     * When `flatten_deep_query_parameters` is `true`, Scramble will document the parameter like so:
     * `{"name":"foo[bar]", "schema":{"type":"int"}, "required":true}`.
     *
     * When `flatten_deep_query_parameters` is `false`, Scramble will document the parameter like so:
     *  `{"name":"foo", "schema": {"type":"object", "properties":{"bar":{"type": "int"}}, "required": ["bar"]}, "required":true}`.
     */
    'flatten_deep_query_parameters' => true,

    'middleware' => [
        'web',
        RestrictedDocsAccess::class,
    ],

    /*
     * Custom exception documentation. Scramble's built-ins describe Laravel's
     * default error shapes; this API replaces those with App\Exceptions\ApiError's
     * contract, so the built-ins would document responses that never occur.
     */
    'extensions' => [
        ValidationExceptionResponse::class,
        AuthenticationExceptionResponse::class,
        AccessDeniedExceptionResponse::class,
    ],

    /*
     * Automatically document API security (OpenAPI `security` / `securitySchemes`) based on route
     * middleware.
     *
     * Disabled by default. Uncomment the line below to enable `MiddlewareAuthSecurityStrategy`.
     * When at least one documented route uses middleware matching the configured patterns (by default
     * `auth` and `auth:*`), bearer auth is applied globally. Routes without matching middleware are
     * marked as public (`security: []`).
     *
     * Set to `null` explicitly to disable. If you already configure security manually via
     * `afterOpenApiGenerated` / `extendOpenApi`, keep this disabled to avoid duplicate schemes.
     *
     * Customize with a class-string or [class, options]:
     *
     * 'security_strategy' => [
     *     \Dedoc\Scramble\SecurityDocumentation\MiddlewareAuthSecurityStrategy::class,
     *     [
     *         'middleware' => ['auth', 'auth:*'],
     *         'scheme' => \Dedoc\Scramble\Support\Generator\SecurityScheme::http('bearer'),
     *     ],
     * ],
     */
    // 'security_strategy' => \Dedoc\Scramble\SecurityDocumentation\MiddlewareAuthSecurityStrategy::class,
    'security_strategy' => null,
];
