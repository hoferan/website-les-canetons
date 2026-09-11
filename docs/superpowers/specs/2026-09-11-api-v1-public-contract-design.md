# API v1 — the public contract

**Status:** approved 2026-09-11. It reshapes the contract every release from R1c
onward is written against.

**Process for this program, decided by André on 2026-09-11:** this spec is the only
written artifact. No per-release plan files, no subagent implementers, no separate
review rounds. The one discipline kept from the R1b/R1c cadence is the house test
pattern — `assertSame` on values, never `assertJsonStructure` alone, and never a bare
`assertStatus(404)` — because that is where every real defect those reviews found was
hiding.

## Why now

`api/openapi.json` was reviewed on 2026-09-10 and the machine-readable half had
fallen behind the prose half. `POST /events/{event}/registrations` documented `200`
with an empty schema against a controller returning `201` with a resource; `403`
appeared on none of the sixteen permission-gated routes; the two public forms could
not be called at all from a generated client, because the mandatory `X-Form-Token`
header and `website` field existed only in prose. Nine operations promised a status
in their description that they did not declare.

The API for events, attendance and registrations is built. On the web side only
`/events` consumes any of it, plus `/login`, `/account` and `/members` from R1b.
Every other screen — R1c-2's attendance, R2's public pages, R3's booking form — is
unbuilt. Changing the URL shape, the error envelope and the collection envelope costs
four screens today and every screen later.

**This program therefore precedes the remaining UI work rather than running beside
it.**

## Audience decision

André chose, on 2026-09-11, to hold this API to genuinely-public standards rather
than to "one SPA and a future me". That decision is what justifies versioning, RFC
9457, conditional requests, idempotency, pagination and a non-browser credential —
each of which would be ceremony for a single redeployable consumer.

Its sharpest consequence: **a cookie session is useless to a server-side
integrator.** Public means a second credential type (A6), not a better version of the
first.

## Source of truth

**Code-first. Scramble stays.** The document is derived from the code and CI's
existing `openapi-drift` job already proves it is current — a guarantee that
spec-first would downgrade into a test we would have to build and maintain. Where
inference falls short, the fix is an attribute or a Scramble extension, never a
hand-edited document and never an overlay file.

`api/openapi.json` and `web/src/api/generated/` remain generated. Neither is ever
hand-edited.

## Non-goals

- **MFA and passkeys.** 45 members, usernames dictated over the telephone, and no
  shell on the host for account recovery. The lockout risk exceeds the threat. This
  is a decision, not an omission; revisit it if the roster ever holds money.
- **Cursor pagination.** Offset is enough for every collection here and a `cursor`
  parameter can be added later without breaking the envelope. See A5.
- **A v2.** A1 builds the machinery that would retire v1. It does not use it.
- **Public read surfaces** (a public agenda, an iCal feed). That is R2 feature work,
  not contract work.

---

## A1 — everything under `/api/v1`

**Decisions**

- `withRouting(apiPrefix: 'api/v1')` in `bootstrap/app.php`. Confirmed available in
  this Laravel version — `ApplicationBuilder::withRouting()` takes `$apiPrefix`.
- Meta routes stay unversioned and outside the contract: `/api/docs`,
  `/api/docs.json`, `/api/migrate`. They describe or operate the API; they are not
  part of it.
- `config/scramble.php`'s `api_path.include` becomes `api/v1`. Keeping a **single**
  static include preserves Scramble's path-stripping, so documented paths stay
  `/events` and the server becomes `/api/v1`. Verify by diffing the export: only
  `servers[0].url` should move.
- `.htaccess` is untouched. `^api(/|$)` already matches `/api/v1/...`, and the
  substituted `_api/public/index.php` still cannot re-match it.
- `web/src/api/http.ts`: `API_BASE` becomes `/api/v1`. `GET /sanctum/csrf-cookie` is
  **not** under the prefix and does not move.
- `info.version` becomes `1.0.0`, still read from `env('API_VERSION')`.
- Sanctum's stateful `api` middleware group still applies — confirm
  `EnsureFrontendRequestsAreStateful` and `RunPendingMigrations` still sit where
  `AutoMigrateTest`'s placement tests expect them.

**The retirement machinery.** A new `App\Http\Middleware\ApiVersion` attaches, from
config, `Deprecation` and `Sunset` (RFC 9745 / RFC 8594) and
`Link: <...>; rel="successor-version"`. For v1 the config is empty and the middleware
emits nothing. It is built and tested now so that retiring v1 is a config change
rather than an archaeology project.

**Acceptance**

- Every route answers under `/api/v1/*` and nothing answers under bare `/api/*`
  except the three meta routes.
- The exported document's server is `https://lescanetons.org/api/v1`, and
  `DocsDocumentController` still rewrites it to a relative `/api/v1`.
- A test asserts `ApiVersion` emits no headers when unconfigured, and all three when
  configured.

---

## A2 — RFC 9457 problem details

**The shape**

```json
{
  "type": "https://lescanetons.org/problems/validation-failed",
  "title": "Invalid form submission",
  "status": 400,
  "instance": "/api/v1/events/42",
  "code": "validation_failed",
  "errors": [{ "field": "endsAt", "reason": "must_be_after" }],
  "requestId": "01JB3K7QW8ZX..."
}
```

Served as `application/problem+json` on every failure.

**Decisions**

- `code` survives alongside `type`. It is redundant with the URI and RFC 9457
  explicitly permits extension members. It is what `translateApiError()` maps, so the
  French layer moves by one property name rather than being rewritten.
- `error` becomes `title`, keeping its meaning: English, for logs, never displayed.
- `fields` becomes `errors`, and its entries keep `field` / `reason` / `params`.
  RFC 7807's own non-normative example used `invalid-params`; kebab-case in an API
  that is camelCase in both directions is worse than a conventional name.
- `instance` is the request path. `status` duplicates the HTTP status, as the RFC
  intends.
- `errors` is present on every problem, empty where there is nothing field-level to
  say. Today `fields` is absent on some errors and required on others, including
  across the three shared components.
- **`requestId`** is a per-request ULID: generated in middleware, accepted from an
  inbound `X-Request-Id` when it is a well-formed ULID, echoed on **every** response,
  attached to the log context, and carried in the problem body. A member reporting a
  failure then hands over a string that finds the log line.
- The `type` URI is **`/api/problems/<code-with-hyphens>`, a relative reference**,
  and it resolves — see the amendment below.

### Amended 2026-09-11: `type` resolves, and it is relative

The original text above said `type` would be an absolute production URL that did not
resolve, calling the pages "a deliberate deferral". Both halves were wrong, and
André found the flaw in the second.

**It resolves.** A `type` that looks fetchable and 404s is a small lie told to every
developer who pastes it into a browser, and it is expensive to correct later: the
moment a client branches on `type`, changing it is a breaking change. `/api/problems`
and `/api/problems/{code}` now serve it — unversioned in `routes/meta.php`, because a
problem type outlives a contract version; ungated, unlike `/api/docs`, because the
vocabulary already ships to every visitor inside the SPA bundle and a `type` that
resolved only where `API_DOCS_ENABLED` happened to be on would be worse than one that
never resolved; and content-negotiated, so a browser gets a page and a tool gets JSON.

**It is relative, not absolute.** The absolute form had a fault beyond not resolving
locally: a server running a newer build emits codes production does not have yet, so
its error documents pointed at a production page that 404s for a type which genuinely
exists on the machine that answered. A relative URI reference — which RFC 9457 permits,
typing `type` as a URI *reference* — keeps the property the absolute form was chosen
for, since the string is byte-identical everywhere and therefore still a stable key a
client can branch on, while resolving against whichever host served the document. Per-host
absolute URLs would have given one problem type three identities and broken that
branching on promotion.

**The reference lives inside Scalar too.** `ErrorVocabulary::markdown()` generates the
whole section into `info.description`, which Scalar parses into a collapsible sidebar
group beside Session and Events. That answers the styling question by dissolving it:
there is no plugin that makes a hand-built page look like Scalar, and a hand-matched
copy would drift on every Scalar release — content inside the document cannot. The
standalone pages remain, because a `type` URI must resolve to something and a JS
renderer cannot serve a per-token URL, but they stop being where people browse.

**404 stops escaping the contract.** Today `NotFoundHttpException` falls through the
catch-all `HttpException` renderer — which returns null for anything but 419 — to
Laravel's default, producing `{message}`: a body with no `code`, which
`translateApiError()` can only answer with the generic French fallback. A dedicated
renderer gives it `code: not_found`. Every other status gets the same audit: 400,
401, 403, 404, 405, 409, 412, 419, 422, 428, 429, 503.

**Blast radius, accepted.** `App\Exceptions\ApiError`, every renderer in
`bootstrap/app.php`, every API test asserting an error body,
`ApiErrorVocabularyTest`, `web/src/i18n/index.ts`, `web/src/api/http.ts`'s `ApiError`
type, and `web/src/mocks/handlers.ts`. **`web/src/i18n/fr.ts` is not rewritten** —
the tokens are unchanged, only the envelope around them.

---

## A3 — a contract that cannot lie

**`App\Support\Scramble\DocumentsFailureModes extends OperationExtension`** reads
each route's actual gathered middleware and writes the failures it implies:

| Middleware on the route | Adds |
| --- | --- |
| `auth:sanctum` | 401 |
| `permission:*` | 403 |
| `throttle:*` | 429, with its rate-limit headers |
| `public-write` | 422, the `X-Form-Token` header parameter, and the `website` body property |
| a bound `{model}` parameter | 404 |
| requires `If-Match` (A4) | 412 and 428, and the `If-Match` header parameter |

Add `permission:` to a route and 403 appears in the document. Remove it and 403 goes.
There is no annotation to forget, which is the property that makes this survive the
next two years.

**This reverses a written decision.** `AccessDeniedExceptionResponse`'s docblock
argues against documenting 403 per route, on the grounds that the SPA's mutator
normalizes every non-2xx into one type so per-route 403s buy the generated client
almost nothing. That reasoning holds for one known consumer and fails for a third
party who has only the document. Replace that docblock paragraph rather than leaving
it to contradict the code.

**Attributes where inference genuinely cannot reach**

- `#[Response(201, type: RegistrationResource::class)]` on
  `RegistrationController::store` — Scramble cannot see through
  `response()->json(new Resource(...), 201)`, which is why that endpoint currently
  documents `200` with `{"type":"object"}` and generates
  `RegistrationStore200 = { [key: string]: unknown }`.
- `#[Group]` descriptions on all seven tags.
- `#[Endpoint(operationId: ...)]` to normalize the operations that lost their
  resource prefix — `eventSeries`, `accountPassword`, `memberRole`, `memberPassword`,
  `guestListExport`, `registrationOption`, `formToken`, `contact`, `config` — onto
  the `resource.action` convention the rest already follows. These become the
  generated hook names.
- `#[Example]` on the operations whose payloads are not obvious: the series
  generator, the options replacement, a booking.

**Closed enums, so the client fails at compile time**

- `code` and `errors[].reason` from a new `App\Support\ErrorVocabulary` — a single
  const list feeding both the OpenAPI enum and `ApiErrorVocabularyTest`, which
  already reads `fr.ts` to prove every token has French. The generated client then
  refuses to compile against a token with no translation, instead of falling back to
  generic French at runtime.
- `AttendanceResource.status` becomes `["yes","no"]`. It is `string` today while both
  request schemas carry the enum, so the one field the whole attendance feature
  branches on has no exhaustiveness checking.
- `/config`'s `env` becomes `["dev","test","qa","prod"]`, and `features` becomes
  `additionalProperties: {type: boolean}` to match its own documented behaviour — "a
  flag the server says nothing about reads as false" — rather than declaring today's
  single flag as required.
- `{format}` on the export becomes `["xlsx","csv","md","json"]`.

**Two mechanisms, applied once each**

- **Timestamps.** A `TypeToSchemaExtension` over a small `App\Support\Iso8601` value
  object that resources return, emitting `{type: string, format: date-time}`. One
  mechanism covers `startsAt`, `endsAt`, `recordedAt`, `createdAt`, `lastLoginAt`,
  `opensAt` and `closesAt` — none of which carries a format today, while the
  *request* schemas for the same fields all do.
- **Numeric minima.** A rules extension emitting `minimum` / `exclusiveMinimum` from
  `gt:` and `gte:`. Scramble maps `max:` to `maximum` but drops both, so the document
  currently advertises `quantity: 0` and `registrationMaxGuests: -5` as valid against
  rules that reject them. Switching the rules to `min:` is **not** available:
  `ApiError::REASONS` reserves `min` for the string-length reading, and a numeric
  `min` would tell a user their number "est trop court".

**Response hygiene**

- A real `description` on every 2xx. Thirty operations currently carry `""`, or a
  type name already visible in the schema.
- `securitySchemes` declared — cookie session, plus bearer after A6 — a root
  `security`, and `security: []` on the anonymous operations, so "does this need a
  session" becomes machine-readable instead of inferred from whether 401 is listed.
- The export's `Transfer-Encoding: chunked` response header is removed: it is
  hop-by-hop, sniffed from a test response, and meaningless in a contract.
  `Content-Disposition` gets a description. File bodies get `format: binary`, and
  media types lose their embedded `charset` parameters.
- `RegistrationFormResource.event` becomes a named component like every sibling.
- `past` on `GET /events` stops being a free-text string.

**CI.** `redocly lint` joins the `openapi-drift` job, so the document is checked for
validity and not only for currency. That job would have caught the empty success
schema, the undeclared statuses and the unconstrained `{format}` mechanically.

**The reference is public, the console is not.** Decided 2026-09-11, reversing
`API_DOCS_ENABLED`'s default from off to on. The old default was security through
obscurity: `web/src/api/generated/endpoints.ts` ships inside the SPA bundle every
visitor downloads, carrying every path, method and type more machine-readably than the
reference does, and what protects this API is `auth:sanctum` and the permission
middleware. A public API with a hidden reference is close to a contradiction.

What *was* real about the old restriction is the try-it console, not the content.
`docs.blade.php` primes the CSRF cookie so "Send" genuinely performs the request —
deliberately, because a reference you cannot try is half a reference — which on
production puts a committee member one click from `DELETE /api/v1/events/{event}`
against live data. So `docs.interactive` gates the console separately, defaulting off
in production and on everywhere else, which is where poking at endpoints belongs. An
unset or unrecognised `APP_ENV` reads as production and turns it off.

---

## A4 — conditional requests and double-submit

**ETag / If-Match.** Strong ETags computed from a hash of the serialized
representation. `PATCH` and `DELETE` on events, registrations and members **require**
`If-Match`: **428** when it is absent, **412** when it is stale. Requiring rather
than honouring is the rigorous reading, and we own the only client.

The bug this closes is live: two committee members with the planning open, one moves
a start time, the other clears the notes, and today the second write silently
discards the first.

**Idempotency-Key**, per `draft-ietf-httpapi-idempotency-key-header`, on
`POST /events/{event}/registrations` and `POST /contact`. The key and a fingerprint
of the request are stored with the response; a replay returns the original response
and creates nothing; the same key with a different body answers **409**
`idempotency_key_reuse`; a request still in flight answers 409 as well.

**This host has no scheduler**, so expiry is probabilistic garbage collection on
write — the approach Laravel already uses to sweep sessions — not a cron job.
Retention 24 hours.

The failure it prevents is anonymous and real: a guest on a phone at the hall taps
Book twice on a slow connection, and the caterer counts two meals.

---

## A5 — paginated collections

`{data, meta}` plus RFC 8288 `Link` headers — `first`, `prev`, `next`, `last` — on
**every** collection, `/sections` and `/roles` included. A public API where some
collections page and others do not is worse than either choice applied consistently.

Offset-based, with `limit` and `offset`, a capped `limit`, and a default above any
real collection size so the SPA sees one page. **Not cursor:** cursor pays for itself
on large or shifting sets, and every set here is single-page forever — 45 members, a
~30-event season, a few hundred bookings at a sold-out souper. A `cursor` parameter
can be added later without breaking the envelope.

This overturns the documented convention "collections are returned as bare JSON
arrays, with no `data` envelope". `CLAUDE.md` and the `info.description` both say so
and both change with it.

**Blast radius:** every list call in the SPA, every MSW handler returning an array,
and the generated client's return types.

---

## A6 — auth to current RFCs

**What already meets the bar, and is not being replaced.** Session regenerated on
login; invalidated and CSRF-rotated on logout; idle *and* absolute lifetimes;
`SameSite=Strict`, `HttpOnly`, `Secure`; argon2id; login throttled per
username-and-address; a password change that ends every other session. For a
same-origin browser SPA that is what the IETF's browser-app BCP and OWASP both
recommend — tokens in JavaScript would be a downgrade.

**What changes**

- **`__Host-` prefix** on the session and XSRF cookies (RFC 6265bis §4.1.3.2),
  pinning them to the origin. It requires `Secure`, `Path=/` and no `Domain`, so it
  is env-driven: on in TEST/QA/PROD, off in plain-HTTP docker dev.
- **`Origin` validation** on state-changing requests, checked against a configured
  allowlist. OWASP now treats this as the primary CSRF defence with the token as
  depth; today the token and `SameSite` carry it alone.
- **Breached-password checking** per NIST SP 800-63B §5.1.1.2, via HIBP's k-anonymity
  API on password set and change. Config-gated and **fail-open with a logged
  warning**: a shared host's outbound HTTPS failing must never block a member from
  changing their password.
- **Personal access tokens.** Sanctum tokens whose abilities are the existing
  permission strings, issued through an endpoint because this host has no shell to
  run artisan on. `auth:sanctum` already accepts both credentials;
  `RequirePermission` must read token abilities as well as roles, and a token must
  never be able to exceed its owner's permissions. 401 then carries
  `WWW-Authenticate: Bearer`, which RFC 9110 requires and today's 401 omits.
- **`X-Content-Type-Options: nosniff`** on API responses; `Cache-Control: no-store`
  extended from the `no-store` group to every authenticated response.

**The bcrypt trap.** `rebuild-state` anticipates `HASH_DRIVER=bcrypt` as the fallback
if argon2id turns out to be unavailable on the shared host. bcrypt silently truncates
at 72 bytes, so the long passphrase NIST asks us to allow would become a 72-byte
password with no error. Guard it: refuse a password longer than 72 bytes while the
bcrypt driver is active, rather than accepting it and hashing a prefix.

---

## Order and verification

Execute A1 → A2 → A3 → A4 → A5 → A6. A1 first because it renames every URL and gets
more expensive daily; A2 before A3 because declaring thirty responses against an
envelope that is about to change means declaring them twice. A6 is independent and
could move, but it lands last so the token credential is documented by the A3
machinery rather than needing its own pass.

Each sub-project is done when the Laravel suite is green **in Docker**, `npm run
check` exits 0, `npm run openapi && npm run generate:api` leaves the tree clean, and
`redocly lint` passes (from A3 onward).

**Never run two Laravel suites at once.** One shared `laravel_api_test` database and
`RefreshDatabase` drops every table, so two concurrent runs tear the schema out from
under each other and report a green suite as catastrophically red. Before believing
any red result:

```
docker compose exec web sh -c "ps ax | grep '[a]rtisan test' | wc -l"
```

## What this program does not answer

The SPA screens that consume the changed contract — attendance, the public pages, the
booking form — are still R1c-2, R2 and R3. This spec changes the contract they will
be built against; it does not build them.
