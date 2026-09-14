# Scalar API documentation at `/api/docs`

Design, 2026-09-07. **Independent of**
`2026-09-07-api-directory-and-deploy-hardening-design.md`: this spec's
controller reads `base_path('openapi.json')`, which is resolved by Laravel and
so is unaffected by that spec's rename. Either can land first.

The recommended order is nonetheless that one, then this — not for a code
dependency but for a human one: both specs require a hand-edit of TEST's `.env`
(a rename there, a new key here), and doing them in order means opening that
file once instead of twice.

---

## 1. Why

R1a deleted the old domain and R1b's API is being built before any of its UI
exists. Until the screens land there is no way to see, or exercise, the API
surface. An OpenAPI document is already generated and committed
(`api/openapi.json`, consumed by orval to produce the SPA client) — it just has
no reader.

The ask is Scalar specifically, on local dev and TEST.

## 2. What is already true

Four facts that shape the whole design, all verified 2026-09-07:

- **Scramble already ships a Scalar renderer.** `api/config/scramble.php` has a
  fully-configured `renderers.scalar` block; `renderer` is merely set to
  `'elements'`. Its view `scramble::scalar` is known-good markup for the
  pinned CDN.
- **The docs UI is unreachable today, even locally.** Scramble registers
  `GET /docs/api`, which is not under `/api/`, so the `.htaccess` SPA catch-all
  rewrites it to the shell — at `:8090` it renders the SPA's 404 view, and
  `:5173` proxies only `/api` and `/sanctum`. Nobody has ever seen this UI in
  this project.
- **Scramble is a dev dependency.** `tools/build.mjs` reinstalls `vendor/`
  with `--no-dev`, so Scramble is not present on any server.
- **`api/openapi.json` ships in the artifact.** It is not in
  `LARAVEL_BUILD_EXCLUDES`, so it is already on TEST today, unread.

And the decisive routing fact: **`/api/*` is dispatched to Laravel before the
SPA fallback**, so anything under `/api/…` needs no `.htaccess` change at all.
Anything outside it does.

## 3. Decisions taken

| # | Decision | Why |
|---|---|---|
| **B1** | Serve the **committed** `openapi.json`; do **not** run Scramble in production. | No new production dependency, no static analysis over the whole app per request on shared hosting, and the docs then show exactly the document orval generated the SPA client from. CI's `openapi-drift` job already fails if that file is stale, so **the documentation cannot lie about the API**. |
| **B2** | Two routes under `/api/`: `GET /api/docs` (the page) and `GET /api/docs.json` (the document). | Keeps the dispatch as the only routing mechanism involved. A path like `/docs` would need a new `.htaccess` rule and a new exposure surface. |
| **B3** | `docs.json` rewrites `servers` to a **relative** `/api` before serving. | The committed document declares `servers: [{url: "https://lescanetons.org/api"}]` — see §4. This is the most dangerous detail in the spec. |
| **B4** | **No `proxyUrl`.** | See §5. |
| **B5** | Gated by `API_DOCS_ENABLED`, defaulting to **false**, answering **404** when off. | Fail closed. A 403 confirms the feature exists; a 404 does not. |
| **B6** | The docs routes are **excluded from the exported document**. | Otherwise the next `npm run openapi` documents the documentation. |
| **B7** | Scalar loads from the **CDN**, not vendored into the artifact. | `@scalar/api-reference` is over a megabyte. This project enforces a per-image budget of 600 KB because a 44 MB asset directory once made pages that never finished loading on a phone; adding a megabyte to every FTP deploy for a docs page contradicts that. The cost is that docs need connectivity, which is acceptable for a docs page. |

## 4. The servers rewrite — the dangerous part

The committed document says, verbatim:

```json
"servers": [{ "url": "https://lescanetons.org/api", "description": "Production" }]
```

That is deliberate and must stay: `api/config/scramble.php` pins an absolute
production URL precisely so the export is byte-identical on every machine, which
is what lets CI's drift check pass at all.

Scalar builds every "Send" from that list. **Served untouched, a docs page on
TEST would fire real requests — including mutating ones — at the live production
site.** Confirmed, not suspected.

So `GET /api/docs.json` decodes the file, replaces `servers` with

```json
"servers": [{ "url": "/api", "description": "TEST environment" }]
```

The **url** is the safety property and stays relative. The **description** is
display text beside it, so it names the environment (`Local dev`,
`TEST environment`, `QA environment`, `Production`) — a wrong label can only
mislabel, never misroute, and a test pins that by requiring the description to
carry no scheme, host or slash. The label comes from `App\Support\Environment`,
shared with the SPA's env ribbon so the two cannot disagree, and inheriting its
fail-safe: an unrecognised `APP_ENV` reads as Production, not as staging.

*(Both were originally specified as the French `Cet environnement`. Wrong on
two counts — an API JSON body must be English, and it said nothing the relative
URL did not already say.)*

and re-encodes. OpenAPI 3.1 defines a relative server URL as relative to where
the document is served, so Scalar resolves it against the page's own origin.
Whatever host you are reading the docs on *is* the host you are calling — it
cannot name the wrong environment, because it names no environment. The
committed file is never modified; the rewrite happens per request.

This is preferred over `url('/api')`, which would depend on `APP_URL` being
correct in each server's hand-written `.env`. If a browser check shows Scalar
not resolving the relative form, the fallback is
`$request->getSchemeAndHttpHost().'/api'` — taken from the actual request,
never from configuration. Note that fallback's failure mode is benign: behind a
TLS-terminating proxy the *scheme* could be wrong, but the *host* is still the
one being viewed, so the worst case is a mixed-content block rather than a
cross-environment call.

## 5. The page

Modelled on `scramble::scalar`, which is known-good for the pinned CDN, keeping
three things from it and dropping one.

**Kept, because without them try-it is broken rather than merely limited:**

- `X-XSRF-TOKEN` replayed from the `XSRF-TOKEN` cookie in `onBeforeRequest`.
  Sanctum's stateful SPA mode puts `/api/*` behind the `web` middleware group,
  so a mutating request without that header answers
  `419 {"code":"invalid_session"}`. This is the same thing
  `web/src/api/http.ts` does for the SPA.
- `credentials: 'include'` on the fetch, or the session cookie is not sent and
  every authenticated endpoint answers 401.
- A `GET /sanctum/csrf-cookie` prime on page load, so the cookie the above
  reads exists on a cold visit. The SPA does this before every mutating call;
  a docs page that skipped it would 419 on the first attempt and look broken.

**Dropped: `proxyUrl`.** `api/config/scramble.php` sets it to
`https://proxy.scalar.com`, and anyone copying that view wholesale inherits it.
Routing try-it through a third-party proxy would send request bodies off-site,
lose the session cookie on the hop, and fail opaquely on TEST because the proxy
has no Basic Auth credentials. These requests are same-origin and need no
proxy. The spec says so here so it is not "restored" later by someone diffing
against Scramble's version.

## 6. Gating

A new key in each server's `.env`:

```dotenv
API_DOCS_ENABLED=false
```

read through `config()` (never `env()` at the point of use, so `config:cache`
cannot leave it stale), and a middleware that `abort(404)`s when it is false.

- Docker: `true`.
- TEST: `true`, set by hand during the spec-A cutover.
- QA: `true` when it is provisioned.
- PROD: **present and `false`** — not absent. The key must exist or the
  config-shape pre-flight refuses the deploy, which is the very consequence
  described below. An interactive console over the whole API surface on a
  public site invites poking, and PROD is the one environment where nobody
  needs it.

**Consequence to plan for:** adding a key to `api/.env.example` makes the
deploy CLI's config-shape pre-flight **refuse** any server whose `.env` lacks
it. That is the intended behaviour — it is how shipping code that expects a new
key fails a deploy instead of 500ing every request afterwards — but it means
TEST's `.env` must gain the key in the same visit as the spec-A cutover. The
R1b plan carries the identical trap for its `BOOTSTRAP_ADMIN_*` keys; both sets
should land in one hand-edit.

## 7. Components

```
api/config/docs.php                          enabled flag
api/app/Http/Middleware/EnsureDocsEnabled.php  404 when off
api/app/Http/Controllers/Api/DocsController.php       renders the page
api/app/Http/Controllers/Api/DocsDocumentController.php  reads + rewrites servers
api/resources/views/docs.blade.php           the Scalar page
api/routes/api.php                           two routes behind the middleware
api/.env.example, docker/api/env.docker      API_DOCS_ENABLED
api/config/scramble.php                      exclude the docs routes (B6)
```

`DocsDocumentController` reads `base_path('openapi.json')` — Laravel's base
path is the `_api/` directory, where the file ships. A missing file is a 404,
not a 500: it means the artifact is incomplete, and a docs page is not worth an
error page.

## 8. Testing

- The document route answers **404** when the flag is off, on both routes.
- With the flag on, `GET /api/docs.json` answers 200 and its `servers` is
  exactly `[{url: "/api", …}]` — **asserted, because this is the guard against
  firing TEST traffic at production.** Mutation-test it: hard-code the
  production URL back and watch the test fail.
- The response is valid JSON and contains a known path (`/config`), proving the
  committed document was actually read rather than an empty object returned.
- `GET /api/docs` answers 200, `text/html`, and references `/api/docs.json`.
- The page contains **no** `proxy.scalar.com`.
- `npm run openapi` after the change leaves `api/openapi.json` unchanged apart
  from the intended exclusions — i.e. the docs routes did not document
  themselves.

Browser check, since a green suite is not a rendered page: at `:8090`, open
`/api/docs`, confirm Scalar renders the endpoint list, then send
`GET /api/config` from the page and confirm the request goes to **localhost**,
not `lescanetons.org`. Then log in through the SPA and send an authenticated
request from the docs page to confirm the cookie and CSRF header both work.

## 9. Out of scope

- **Switching Scramble's own `renderer` to `'scalar'`.** Its UI stays
  unreachable and dev-only; this spec does not depend on it. Changing the
  setting would be a change nobody can observe.
- **Documenting `POST /api/migrate`.** Already excluded, deliberately — nothing
  in a browser may trigger a migration.
- **Authoring prose descriptions for endpoints.** Scramble infers from the code
  today. Worth doing later; not what this spec is for.
- **A public API reference.** This is an internal tool for a band's website.
