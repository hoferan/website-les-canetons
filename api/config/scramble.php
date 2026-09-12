<?php

use App\Support\Scramble\AuthenticationExceptionResponse;
use App\Support\Scramble\DocumentsTheSessionCookie;
use App\Support\Scramble\Iso8601ToSchema;
use App\Support\Scramble\NotFoundExceptionResponse;
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
        /*
         * NO PROBLEM-TYPE CATALOGUE HERE, deliberately. This description once
         * ended with twenty-one generated sections, one per error code — which
         * dominated the reference's sidebar to document something nobody reads
         * until they hit it. Every error now carries its own `detail`, so the
         * explanation arrives with the failure instead. See
         * App\Support\ErrorVocabulary.
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
  "title": "Invalid form submission",
  "status": 400,
  "code": "validation_failed",
  "instance": "/api/v1/events/42",
  "errors": [{ "field": "endsAt", "reason": "must_be_after" }],
  "requestId": "01JB3K7QW8ZX7VN4S2QK9J0M1P",
  "detail": "One or more submitted fields were rejected. `errors` names each one and why…"
}
```

`title`, `status`, `detail` and `instance` are RFC 9457's own members. `code`,
`errors` and `requestId` are this API's extensions, which the RFC permits.

**Branch on `code`.** `code` and `errors[].reason` are stable machine tokens;
`title` is English prose meant for a log and may be reworded without notice.
The front end maps the tokens to French, and any other client should do the
same.

`detail` says what happened and what to do about it, in English, for whoever
is reading the response. There is no catalogue of error codes elsewhere in
this reference and no endpoint to fetch one: a problem description is wanted
by somebody who has that problem, at the moment they have it, so it travels
with the failure.

There is deliberately **no `type` member** either. RFC 9457 makes it optional,
and here it could only ever have been a constant prefix in front of `code`,
carrying nothing the document did not already have.

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
| `409` | Allowed, but it conflicts with the current state, or with a submission you already made. |
| `412` | Your `If-Match` names a state this thing is no longer in. |
| `419` | The session or CSRF token expired. Prime the cookie and retry. |
| `422` | The submission looks automated. See *Public forms*. |
| `428` | The write needs an `If-Match`. See *Conditional writes*. |
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
- **Timestamps are always UTC**, ISO 8601 with a `+00:00` offset
  (`2026-09-05T08:00:00+00:00`). The band is in Europe/Zurich, so convert for
  display — slicing the hour out of the string shows the wrong time.
  On the way IN, send any offset you like and it is honoured; a value with no
  offset at all is read as UTC.
- Money is an integer number of centimes. `4500` is CHF 45.00.
- Every collection comes in the same envelope. See *Collections*.

## Collections

Every endpoint that answers with a list answers with `{data, meta}`, never with
a bare array — `/roles` and `/sections` included, which are the two nobody will
ever page. One shape means one function reads any list:

```json
{
  "data": [ … ],
  "meta": { "total": 45, "limit": 500, "offset": 0 }
}
```

`total` is the whole collection, not the page you were sent, so a screen can
say "45 membres" without first reading forty-five of them.

Ask for less with `?limit=` and `?offset=`. **You rarely need to**: the default
limit is 500, above every collection this API holds, so omitting both returns
the whole thing in one request. The cap is 1000.

Neither parameter can fail. A `limit` above the cap is clamped, a negative
`offset` reads as zero, and a value that is not a whole number is ignored —
`meta` always reports what was actually applied.

Reads carry an [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) `Link`
header with `first` and `last`, plus `prev` and `next` where they exist:

```
Link: </api/v1/members?limit=2&offset=2>; rel="next",
      </api/v1/members?limit=2&offset=44>; rel="last"
```

**Follow `next` until there is none** rather than doing arithmetic on `meta`.
Your own query parameters are carried along, so paging `/events?past=1` stays
in the past.

The links are relative, as RFC 8288 permits: resolve them against the URL you
requested. They carry no scheme or host, so they stay correct behind whatever
sits in front of the API.

`PUT /api/v1/events/{event}/registration-options` and
`POST /api/v1/events/series` answer with a collection too, and are enveloped
the same way — with no `Link` header, since a `rel="next"` you would have to
PUT again is not a link to follow.

The paging is offset-based rather than cursor-based, deliberately: every
collection here is one page for the foreseeable future. A `cursor` parameter
can be added later without changing this envelope.

## Conditional writes

**Every write that replaces or removes something must prove it is working from
the current state.** Read the thing first, keep the `ETag` the read returns, and
send it back as `If-Match`:

```js
const read = await fetch("/api/v1/events/42", { credentials: "include" });
const etag = read.headers.get("ETag");

await fetch("/api/v1/events/42", {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": xsrf, "If-Match": etag },
  body: JSON.stringify({ title: "Cortège" }),
});
```

No header answers `428 if_match_required`. A header naming a state the thing is
no longer in answers `412 if_match_failed`, and **the 412 does not tell you the
current tag** — retrying blindly with a fresh one would land exactly the
overwrite you were stopped from making. Read it again and decide again.

Which writes, and where their tag comes from:

| Write | Read for its `ETag` |
| --- | --- |
| `PATCH` / `DELETE /events/{event}` | `GET /events/{event}` |
| `PATCH` / `DELETE /members/{member}` | `GET /members/{member}` |
| `PUT /members/{member}/roles` | `GET /members/{member}` |
| `PATCH` / `DELETE /registrations/{registration}` | `GET /registrations/{registration}` |
| `PUT /events/{event}/registration-options` | `GET /events/{event}/registration-options` |

A successful `PATCH` or `PUT` returns the new `ETag`, so consecutive edits need
no read in between. A `DELETE` returns none: there is nothing left to tag.

**Collections hand out no tag**, deliberately — one tag cannot validate
forty-five members, and a list-wide tag would refuse every write whenever
anybody changed anything. That is why each conditional write has a
single-thing read beside it.

The tag is over the thing's own state. An event's tag ignores `myAttendance`,
which is yours alone, so answering an event does not invalidate a pending edit
of it; an event's options are tagged separately from the event, so correcting a
dress code does not refuse an options edit and adding an option does.

**Attendance is exempt.** `PUT` and `DELETE` on
`/events/{event}/attendance` need no `If-Match`: a member is the only ordinary
writer of their own answer, the whole answer is one value so there is no half of
it to lose, and a first answer has no tag to have. Answering stays one request.

Tags are strong validators. `If-Match: *` asserts only that the thing still
exists. There is no conditional `GET` — `If-None-Match` is not implemented and
nothing here is cacheable.

## Public forms

`POST /api/v1/contact` and `POST /api/v1/events/{event}/registrations` are open to
anonymous callers and are protected against automated submission. Both
require:

- an `X-Form-Token` header, from `GET /api/v1/form-token`, at least two seconds
  and at most two hours old, and
- a `website` field, present and empty.

Failing either answers `422 spam_suspected`. Both endpoints are rate limited
to 10 requests a minute per IP.

Both also require an **`Idempotency-Key`** header, so that resending a
submission after a timeout cannot book or send it twice. See *Sending a form
only once*.

## Sending a form only once

A guest on a phone at the hall taps Book, the connection stalls, and they tap
again. Nothing in the second request distinguishes it from a second guest, so
the client has to say, and the `Idempotency-Key` header is how
([draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)).

**Generate a key when the form is rendered** and send the same one for every
attempt at that submission. A fresh submission needs a fresh key.

```js
const key = crypto.randomUUID();

await fetch("/api/v1/contact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Form-Token": formToken,
    "Idempotency-Key": key,
  },
  body: JSON.stringify({ ...fields, website: "" }),
});
```

The first request runs and its answer is stored under the key. A second request
with the same key and the same body gets that answer back, byte for byte and
with the same status, creates nothing, and carries
`Idempotency-Replayed: true` so you can tell an echo from a fresh acceptance.

The key must be 16 to 255 printable ASCII characters. It is scoped to the
endpoint, so one key can be used once on `/contact` and once on a booking. It
is **not** scoped to a caller, because these endpoints are anonymous, which is
why a short key is refused: a collision with somebody else's key answers
`409 idempotency_key_reuse` rather than handing you their booking.

| Answer | Means |
| --- | --- |
| `400 idempotency_key_required` | No header. |
| `400 idempotency_key_invalid` | Too short, too long, or not printable ASCII. |
| `409 idempotency_key_reuse` | The key belongs to a different body, or to an attempt still running. |

A request that **fails** releases its key: nothing was written, so nothing is
being retried, and a guest who mistyped their address can correct it and send
again with the same key. Stored answers are kept for 24 hours.

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
            // Pinned, and matching resources/views/docs.blade.php exactly —
            // DocsTest asserts the two agree. The bare package path resolves to
            // whatever Scalar publishes as `latest`, which is how a toolbar full
            // of features nobody chose appeared on this page. See that view for
            // the full argument and for how to upgrade.
            'cdn' => 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.68.0/dist/browser/standalone.min.js',
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
     * Type and response extensions.
     *
     * Scramble's built-in exception documentation describes Laravel's default
     * error shapes; this API replaces those with App\Exceptions\ApiError's
     * contract, so the built-ins would document responses that never occur.
     */
    'extensions' => [
        ValidationExceptionResponse::class,
        AuthenticationExceptionResponse::class,
        NotFoundExceptionResponse::class,
        // A type-to-schema extension, which is what this array actually
        // reaches. Operation transformers go through AppServiceProvider
        // instead; one listed here is accepted and never called.
        Iso8601ToSchema::class,
    ],

    /*
     * How this API is authenticated, in the document.
     *
     * App\Support\Scramble\DocumentsTheSessionCookie is Scramble's own
     * MiddlewareAuthSecurityStrategy with the scheme replaced: it reads `auth:*`
     * off each route, applies the scheme at the root, and marks every anonymous
     * operation `security: []`. The default scheme is a bearer token, which this
     * API does not have; see that class for the cookie and for why the CSRF
     * header is not a second scheme.
     */
    'security_strategy' => DocumentsTheSessionCookie::class,
];
