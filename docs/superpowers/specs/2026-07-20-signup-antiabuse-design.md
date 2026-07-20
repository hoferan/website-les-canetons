# Public signup anti-abuse (self-hosted Altcha + honeypot)

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
a human-work verification control on the endpoint before it is switched on,
**without** signing up for an external CAPTCHA service (no dashboard, no
per-environment keys, no domain registration).

## Decision

Add a **self-hosted, Altcha-wire-compatible proof-of-work (PoW) challenge** as
the primary control, backed by a near-free **honeypot** field. The browser must
solve a small SHA-256 PoW issued and verified by our own server; the only secret
is a random HMAC string the maintainer generates once per server.

We implement the (small, stable) Altcha PoW protocol **ourselves** rather than
pull the official `altcha-org/altcha` v2 library, because:

- The v2 library moved to a heavier key-derivation API (`Pbkdf2`/`Argon2id`/
  `Scrypt`, multi-class options) that is disproportionate for this form.
- Its reference integration (`altcha-starter-php`) is unmaintained (404).
- It carries a published advisory (GHSA-82w8-65qw-gch6): `verifySolution`
  **skips the HMAC check when the payload omits `signature`**. Our
  implementation rejects any signature-less payload by construction, so it is
  immune to that class of bug.

The protocol is: server issues `{algorithm, challenge, maxnumber, salt,
signature}` where `challenge = sha256(salt + number)` and `signature =
HMAC-SHA256(challenge, secret)`. The client brute-forces `number` in
`[0, maxnumber]`, then returns `{algorithm, challenge, number, salt, signature}`
(base64) for the server to recompute and verify. Expiry is embedded in the salt;
because the salt feeds the challenge hash, a tampered expiry breaks the
signature — so expiry needs no separate signing.

## Goals

1. Require a valid, server-verified PoW solution before `POST /api/signups`
   inserts a row or sends mail.
2. **Fail-closed:** any verification failure (bad/missing signature, wrong hash,
   expired, malformed payload) blocks the submission.
3. **Replay-safe:** each solved challenge is consumed exactly once, so a single
   solve cannot be replayed to send many mails within the expiry window.
4. Add a honeypot field as free defense-in-depth that silently drops naive bots.
5. Store **no client IP** (no PII). The only new persisted data is a hash
   (the challenge signature) with a timestamp, pruned after a day.
6. No external service, account, dashboard, domain registration, CDN, vendored
   third-party blob, or Composer dependency. The client solver is vanilla JS.
7. Keep the crypto in a small, injectable, unit-testable `App\Altcha` unit.
8. Work in local dev and CI with only a throwaway HMAC secret in config.

## Non-goals

- **No IP rate limiting.** The single-use, expiring, human-solved challenge
  bounds per-submission mail; no per-IP counter and no stored IPs.
- **No official Altcha library or web-component widget.** Wire-compatible, but
  implemented in-house (see Decision).
- **No CAPTCHA on other forms.** Only the public supper-signup POST is in scope;
  the members' area and the `contact` form are unchanged.
- **No spam-filter / server-signature (classification) mode.** Only the plain
  PoW `verifySolution` flow; no external scoring.

## Architecture

### `App\Altcha` (new — pure crypto, no DB, no network)

- `__construct(string $secret)` — the per-server HMAC secret.
- `createChallenge(int $maxNumber, int $ttlSeconds, ?int $now = null, ?int
  $number = null, ?string $saltHex = null): array` — returns
  `['algorithm'=>'SHA-256','challenge'=>…,'maxnumber'=>…,'salt'=>…,'signature'=>…]`.
  The optional `$now`/`$number`/`$saltHex` exist **only for deterministic
  tests**; production calls pass just `$maxNumber, $ttlSeconds` and the method
  uses `random_int`/`random_bytes`/`time()`. Salt format:
  `<hex>?expires=<unixts>`.
- `verifySolution(string $payloadBase64, ?int $now = null): ?string` — returns
  the challenge **signature** (used as the replay key) on success, or `null` on
  any failure. Steps, all fail-closed:
  1. base64-decode + json-decode; require an array.
  2. Require all of `algorithm, challenge, number, salt, signature` present and
     scalar. **A missing `signature` is a hard reject** (advisory mitigation).
  3. `algorithm === 'SHA-256'`.
  4. Parse `expires` from the salt; reject if absent or `< now`.
  5. `hash_equals(sha256(salt.number), challenge)`.
  6. `hash_equals(hmac_sha256(challenge, secret), signature)`.

### `App\Repositories\ChallengeRepository` (new — replay store)

- `__construct(mysqli $db)`.
- `consume(string $signature): bool` — opportunistically prunes rows older than
  a day, then `INSERT IGNORE`s the signature; returns `true` iff it was newly
  inserted (`affected_rows === 1`). A `false` means the signature was already
  used → replay. Using `INSERT IGNORE` + `affected_rows` avoids any dependency
  on mysqli exception mode.

### New route + endpoint

- `GET /api/altcha` → `app/api/altcha.php`: builds `new Altcha($config['altcha']
  ['hmac_secret'])`, echoes `createChallenge(100000, 600)` as JSON. Registered
  in `app/src/routes.php` alongside the other `souper_signup`-gated API routes,
  so it only exists while the feature is on.

### Backend flow — `app/api/signups.php` (POST branch)

New payload fields: `hp` (honeypot) and `altcha` (base64 solution). Order —
cheapest first; the PoW is only verified on an otherwise-valid form:

1. **Honeypot:** `hp` non-empty → **silently return `201 {ok:true}`** (no store,
   no mail).
2. **Field validation** (existing) → `400 {error:'Formulaire invalide'}`.
3. **PoW verify:** `$sig = (new Altcha($secret))->verifySolution($altcha)`; if
   `null` → `403 {error:'Vérification anti-robot échouée, veuillez réessayer.'}`.
4. **Replay consume:** `if (!$challengeRepo->consume($sig))` → same `403`.
5. **Insert + fail-safe mail** (existing, unchanged).

### Frontend — `app/pages/signup.php`, `app/assets/js/signup.js`, `signup.css`

- `signup.php`: add only the visually-hidden honeypot input (`name="website"`,
  off-screen, `tabindex="-1"`, `aria-hidden`, `autocomplete="off"`). **No widget,
  no external script.**
- `signup.js`: on submit, fetch a fresh challenge from `/api/altcha`, solve the
  PoW with `crypto.subtle.digest('SHA-256', …)` (loop `number` until the hash
  matches), then POST the payload with `hp` + `altcha`. The submit button is
  disabled and labelled "Vérification…" during the solve, restored on failure.
  Fetching a fresh challenge per submit means a failed attempt naturally gets a
  new challenge — no widget-reset bookkeeping, and never a
  replay-consumed-token false block.
- `signup.css`: the off-screen `.hp-field` rule.

### Config

- New block `'altcha' => ['hmac_secret' => 'CHANGE_ME']` in
  `config/config.example.php`; `config/config.docker.php` gets a fixed throwaway
  secret so local dev/CI just work.
- **Config-shape drift gate:** adding `altcha` means every server's `config.php`
  must declare it before that server can deploy. The secret is any long random
  string the maintainer generates — no external setup. Documented in the rollout
  notes below.

## Testing

- **`tests/Unit/AltchaTest.php`** (no DB/network, deterministic via injected
  `now`/`number`/`saltHex`):
  - a solved payload for a freshly-created challenge verifies (returns the
    signature);
  - tampered `number` → `null`; tampered `challenge` → `null`;
  - payload missing `signature` → `null` (advisory);
  - expired challenge (`now` past the salt's expiry) → `null`;
  - wrong-secret verifier → `null`;
  - malformed base64 / non-JSON → `null`.
- **`tests/Integration/ChallengeRepositoryTest.php`** (extends
  `IntegrationTestCase`; the test DB has no `used_challenges` table by default,
  so — mirroring `MigratorTest` — it `CREATE TABLE IF NOT EXISTS` in `setUp` and
  cleans its own `test-%` rows in `setUp`/`tearDown`, since DDL auto-commits past
  the rollback): first `consume(sig)` → `true`; a second `consume(sig)` → `false`
  (replay).
- The honeypot/PoW plumbing in `signups.php` and the vanilla-JS solver stay thin;
  the POST path is not unit-tested today and this change adds no harness for it.
  Manual verification: honeypot-filled → 201, no row/mail; empty/absent `altcha`
  → 403; a normal browser submission solves and completes end-to-end locally.

## Rollout notes

- One new idempotent migration `002_create_used_challenges.sql`; applied by the
  existing migration pipeline.
- Before enabling `souper_signup` in PROD (and on TEST/QA before the deploy that
  ships this): add the `altcha` block with a long random `hmac_secret` to each
  server's `config.php` — otherwise the config-shape drift gate refuses that
  server's deploy.
- `crypto.subtle` requires a **secure context** (HTTPS or localhost). All
  environments are HTTPS (staging behind Basic Auth over TLS; PROD is HTTPS), and
  local dev is `localhost`, so this holds. If a plain-HTTP context ever appears,
  the solver must degrade gracefully (it would currently fail closed → block).
