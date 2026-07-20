# Public signup anti-abuse (Turnstile + honeypot)

**Date:** 2026-07-20
**Status:** Approved (design)

## Problem

`POST /api/signups` (`app/api/signups.php`) is the public supper-signup
endpoint. It is unauthenticated by design and, for every accepted submission,
both writes a row and **sends an SMTP confirmation email to a user-supplied
address** (`App\Mailer::sendConfirmation`). That makes it a **mail-amplification
vector**: a script posting valid JSON directly to the endpoint can drive
outbound mail to arbitrary addresses, which on the shared `easy-hebergement`
host can get the SMTP mailbox throttled or blacklisted, and floods the `signups`
table.

A code review flagged this as a gate on enabling the `souper_signup` feature in
PROD (the feature is currently config-gated **off** there). The maintainer wants
a human-verification control on the endpoint before it is switched on.

## Decision

Add **Cloudflare Turnstile** (managed "checkbox"/invisible challenge) as the
primary control, backed by a near-free **honeypot** field. Turnstile was chosen
over Google reCAPTCHA v2 for privacy: it does not monetize visitor data, which
matters for a European (Swiss) audience, while giving the same "prove you're
human" UX.

Because a Turnstile token is **single-use and short-lived**, every accepted
submission already requires a freshly-solved human challenge. That bounds
mail amplification at the verification layer, so **no IP-based rate limiter, no
stored IPs (raw or hashed), and no new DB migration** are needed. This is also
the cleanest privacy outcome: the endpoint stores no client IP at all.

## Goals

1. Require a valid, server-verified Turnstile token before `POST /api/signups`
   inserts a row or sends mail.
2. **Fail-closed:** any verification error (timeout, non-200, network failure,
   `success:false`) blocks the submission rather than leaving the mail vector
   open.
3. Add a honeypot field as free defense-in-depth that stops naive bots before
   the `siteverify` call is even spent.
4. Store no client IP. Add no new DB table or migration.
5. Keep the network-touching verifier a small, injectable, unit-testable unit.
6. Work in local dev and CI without a real Cloudflare account.

## Non-goals

- **No IP rate limiting.** Explicitly dropped in favour of the CAPTCHA gate; the
  single-use token already bounds per-submission mail. No `signup_attempts`
  table.
- **No CAPTCHA on other forms.** Only the public supper-signup POST is in scope;
  the authenticated members' area and the existing `contact` form are unchanged.
- **No `X-Forwarded-For` trust.** The optional `remoteip` passed to Turnstile
  uses `REMOTE_ADDR` only — this host has no trusted reverse proxy, so trusting
  a client-supplied `XFF` would let an attacker spoof it.
- **No time-to-fill / session timing check.** Superseded by the CAPTCHA; not
  worth the multi-tab session edge cases.

## Architecture

### `App\Turnstile` (new)

A small verifier that mirrors how `App\Mailer` isolates its side effect: a pure
core plus an **injectable HTTP transport** so unit tests never hit the network.

- Constructed with the secret key and an optional transport callable
  (`fn(string $url, array $fields): ?string` returning the response body, or
  `null`/throwing on failure). The default transport does a short-timeout
  (~5s) POST via cURL (falling back to `file_get_contents` with a stream
  context) — matching how the rest of the tooling reaches HTTPS.
- `verify(string $token, ?string $remoteIp = null): bool`
  - Empty token → `false` (no network call).
  - POSTs `secret`, `response` (and `remoteip` when provided) to
    `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
  - Returns `true` **only** when the transport yields a 200 body that JSON-
    decodes to `success === true`. Every other outcome — thrown transport
    exception, `null` body, non-JSON, `success:false` — returns `false`
    (fail-closed).

### Backend flow — `app/api/signups.php` (POST branch)

New payload fields: `hp` (honeypot) and `turnstile_token`. Check order is
cheapest-first, so `siteverify` is only spent on an otherwise-valid form:

1. **Honeypot:** if `hp` is a non-empty string → **silently return `201 {ok:true}`**
   without storing or mailing. A silent success avoids revealing the trap.
2. **Field validation** (existing block) → `400 {error:'Formulaire invalide'}`.
3. **Turnstile:** `(new Turnstile($config['turnstile']['secret_key']))
   ->verify($token, $_SERVER['REMOTE_ADDR'] ?? null)`. On `false` →
   `403 {error:'Vérification anti-robot échouée, veuillez réessayer.'}`.
4. **Insert + fail-safe mail** (existing block, unchanged).

### Frontend — `app/pages/signup.php` + `app/assets/js/signup.js`

- `signup.php` renders the Cloudflare `api.js` script
  (`https://challenges.cloudflare.com/turnstile/v0/api.js`, `async defer`) and a
  `<div class="cf-turnstile" data-sitekey="…">` widget, with the site key read
  from config (same `global $config` access the page/api layer already uses).
- A visually-hidden honeypot input: `name="website"`, positioned off-screen in
  CSS, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`, with an
  `<label>` a screen reader would skip.
- `signup.js` adds to the JSON payload: `turnstile_token` (read from the
  widget-injected `cf-turnstile-response` field) and `hp` (the honeypot value).
  If no token is present at submit time → block with an alert asking the user to
  complete the check. On a failed/rejected submit, call `turnstile.reset()` so a
  fresh token can be obtained (tokens are single-use).

### Config + dev/CI story

- New config block: `'turnstile' => ['site_key' => '', 'secret_key' => '']`,
  added to `config/config.example.php` and `config/config.docker.php`.
- **Local dev and CI use Cloudflare's documented always-pass test keys** so no
  real account is needed there:
  - site key `1x00000000000000000000AA`
  - secret key `1x0000000000000000000000000000000AA`
  These go in `config.docker.php` (and, as illustrative placeholders, the
  example). TEST/QA/PROD get real keys minted from a free Cloudflare Turnstile
  dashboard with the site domains registered.
- **Config-shape drift gate:** because `deploy.mjs` compares each server's
  `config.php` key shape against `config.example.php`, adding `turnstile` means
  every server's `config.php` must declare it before that server can deploy.
  This must be documented (staging/deploy notes) and the keys placed on each
  server ahead of the deploy that ships this code.

## Testing

- **`App\Turnstile` unit tests** (`tests/Unit/TurnstileTest.php`) with a fake
  transport:
  - valid token + `{"success":true}` body → `true`;
  - `{"success":false,...}` body → `false`;
  - transport throws / returns `null` (timeout, network) → `false` (fail-closed);
  - empty token → `false` with **no** transport call;
  - asserts the POST carries the correct `secret`/`response`/`remoteip` fields
    and the correct endpoint URL.
- The honeypot and token plumbing in `signups.php` stays thin (a guard `if` and
  a single `verify` call); the POST path is not unit-tested today and this change
  does not add a harness for it. Manual verification: a submission with the
  honeypot filled returns 201 and creates no row/mail; a submission with a
  bad/absent token returns 403; a submission with the dev test key succeeds
  end-to-end locally.

## Rollout notes

- No migration. Deploy is code + per-server `config.php` key placement.
- Before enabling `souper_signup` in PROD: register the production domain in the
  Cloudflare Turnstile dashboard, put the real keys in the PROD `config.php`,
  and confirm no `.htaccess`/header sets a Content-Security-Policy that would
  block `challenges.cloudflare.com` (the main site has no strict CSP today —
  verify during build).
