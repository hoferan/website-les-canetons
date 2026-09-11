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
     * Multiple includes or wildcards → server defaults to / and paths stay full (/api/v1/users).
     * Override with `servers`, or use Scramble::registerApi() for separate bases.
     */
    /*
     * Only the versioned contract is documented. routes/meta.php — /api/docs,
     * /api/docs.json and /api/migrate — sits at /api/* and is therefore outside
     * this include entirely, which is why there is no longer an `exclude` list:
     * the reference cannot document itself, and orval cannot generate TanStack
     * Query hooks for a documentation page or a migration trigger.
     *
     * The array form is used with a SINGLE static include, which keeps
     * Scramble's path-stripping behaviour: documented paths stay /me and
     * /config rather than becoming /api/v1/me, and the server becomes
     * /api/v1. Verified 2026-09-07 by exporting both ways and diffing — the
     * document is byte-identical apart from that server URL.
     */
    'api_path' => [
        'include' => 'api/v1',
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
        'version' => env('API_VERSION', '1.0.0'),

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

A server-side session in a cookie. There is no bearer token, no
`Authorization` header, and nothing for a client to store.

The browser and the API are served from one origin, so there is no CORS
either. From a browser this is close to automatic:

```js
await fetch("/api/v1/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": xsrf },
  body: JSON.stringify({ username, password }),
});
```

`credentials: "include"` is what sends and stores the cookie. After that,
reads need nothing at all.

The one manual step is the `X-XSRF-TOKEN` header on requests that write. Its
value is the `XSRF-TOKEN` cookie, which is readable from JavaScript by
design; `GET /sanctum/csrf-cookie` sets it, once per page load. Axios does
this for you and needs no code. A write without the header answers
`419 invalid_session`, which means "prime the cookie and retry", not "log in
again".

Reads that need a session and do not have one answer
`401 not_authenticated`.

### Why a cookie rather than a token

The session cookie is `HttpOnly`, `Secure` and `SameSite=Strict`. Being
unreadable from JavaScript is the point: a token kept in `localStorage` is
exfiltrable by any script that manages to run on the page, and it cannot be
revoked server-side without keeping a list of live tokens, which is a
session by another name. Logging out here ends the session on the server.

`SameSite=Strict` is also the real defence against cross-site request
forgery: a request originating from another site never carries the cookie,
so it arrives unauthenticated whatever else it sends. The CSRF token is
defence in depth on top of that, not the mechanism holding the door shut.

## Errors

Every failure is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
problem document, served as `application/problem+json`:

```json
{
  "type": "https://lescanetons.org/problems/validation-failed",
  "title": "Invalid form submission",
  "status": 400,
  "instance": "/api/v1/events/42",
  "code": "validation_failed",
  "errors": [{ "field": "endsAt", "reason": "must_be_after" }],
  "requestId": "01JB3K7QW8ZX7VN4S2QK9J0M1P"
}
```

`type`, `title`, `status` and `instance` are the standard members. `code`,
`errors` and `requestId` are this API's extensions, which RFC 9457 permits.

**Branch on `code`, not on `title`.** `code` and `errors[].reason` are stable
machine tokens; `title` is English prose meant for a log, and it may be
reworded without notice. The front end maps the tokens to French, and any
other client should do the same. `type` carries the same token as `code`,
hyphenated, for a reader who prefers the URI; those URIs identify a problem
type and are not currently documents you can fetch.

`errors` is always present, and empty for a failure with nothing field-level
to say. A `reason` may carry `params` (for example `{"max": 255}`) when the
sentence needs a number.

`requestId` is a ULID, also returned as the `X-Request-Id` header on every
response. Quote it when reporting a problem; it identifies the request in the
server log. Send your own `X-Request-Id` and it is honoured, provided it is a
well-formed ULID.

## Status codes

| Code | Means |
| --- | --- |
| `400` | The submitted fields are wrong. See `errors`. |
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
`GET /api/v1/me` returns the caller's effective permissions.

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

`POST /api/v1/contact` and `POST /api/v1/events/{event}/registrations` are open to
anonymous callers and are protected against automated submission. Both
require:

- an `X-Form-Token` header, from `GET /api/v1/form-token`, at least two seconds
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
     * The client does not read this: web/src/api/http.ts prepends /api/v1 itself,
     * because the SPA is served from the same origin as the API.
     */
    'servers' => [
        'Production' => 'https://lescanetons.org/api/v1',
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
