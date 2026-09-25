---
status: accepted
date: 2026-09-11
decision-makers: André Hofer
---

# Authenticate with the same-origin session cookie only

## Context and Problem Statement

The SPA and the API share one origin
([ADR-0002](0002-one-origin-laravel-api-and-react-spa.md)). The members are about 45
people, most of them children. A token kept in `localStorage` is readable by any script
injected into the page and cannot be withdrawn by the server.

The API was declared public-grade on 2026-09-11
([ADR-0013](0013-hold-the-api-to-public-standards.md)), and a plan followed to add
personal access tokens, OAuth or OIDC, `__Host-` cookie prefixes, an Origin allowlist
and breached-password checks.

How does a member authenticate to the API?

## Considered Options

- Laravel Sanctum in stateful SPA mode, with the same-origin session cookie as the
  only credential
- A token kept in `localStorage`
- The public-grade plan: personal access tokens, OAuth or OIDC, `__Host-` cookie
  prefixes, an Origin allowlist and breached-password checks

## Decision Outcome

Chosen option: "Laravel Sanctum in stateful SPA mode", because the SPA and the API share
one origin, and unlike a token in `localStorage` the session cookie is out of reach of
injected scripts and can be withdrawn by the server.

Sessions are stored in the database. There are no tokens and no CORS. The server is the
only authority; the SPA's guards are for the user's convenience.

- The cookie is `Secure`, `HttpOnly` and `SameSite=Strict`.
  `EnforceAbsoluteSessionLifetime` re-applies Strict after Sanctum forces Lax.
- A session idles out after 120 minutes and ends after 720 regardless, and the
  absolute check fails closed.
- Login regenerates the session. Logout invalidates it and rotates the CSRF token.
- Passwords are hashed with argon2id.
- Login is throttled per username and address: five failures lock that pair out for
  fifteen minutes, and every failure answers the same `invalid_credentials`.
- Every response that depends on who is asking is sent `no-store`, through
  `NoStoreResponse`.
- Deleting a member, resetting their password or replacing their roles deletes their
  `sessions` rows in the same transaction as the change, through `SessionRevoker`. A
  member changing their own password keeps the current session and loses the others,
  or the forced change after a first login would bounce straight back to the login
  form.

### Consequences

- Good, because deleting a member, resetting their password or replacing their roles
  ends their sessions in the same transaction.
- Bad, because every mutating request has to replay the `XSRF-TOKEN` cookie, or it
  answers 419. The mutator in `web/src/api/http.ts` primes and replays it, which is
  why nothing calls `fetch("/api/…")` directly.
- Bad, because a caller that is not the SPA gets `400 stateful_request_required`. That
  includes a browser on the `www.` alias, which is why that alias redirects
  ([ADR-0003](0003-laravel-inside-the-document-root-behind-htaccess.md)).
- Bad, because revocation depends on the database session driver.

## Pros and Cons of the Options

### A token kept in `localStorage`

- Bad, because any script injected into the page can read it.
- Bad, because the server cannot withdraw it.

### The public-grade plan

It was deferred in full the same day, 2026-09-11.

- Bad, because the only consumer anyone could name is first-party.

## More Information

The deferred plan comes back when a non-browser consumer needs to authenticate, when
the SPA and the API move to different origins (which breaks `SameSite=Strict`), or
when a third party needs delegated access. The `personal_access_tokens` table exists
from Sanctum's install and is unused.
