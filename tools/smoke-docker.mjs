// Smoke-tests the local Docker stack. Every check here asserts something that
// only holds because the stack matches production: both apps on ONE origin, the
// Laravel dispatch surviving the old app's catch-all, the authorization
// boundary the chrooted FTP layout forces around the Laravel tree, and the
// asset cache policy. Run after `npm run dev`.
//
// Since the cutover, /api/* is Laravel's alone — app/api/ is deleted. So the
// recurring point of the /api/* checks below is simply that LARAVEL ANSWERS AT
// ALL, with the right status and the right body shape: a 404 on any of them
// means the dispatch in app/.htaccess is broken, not that a route is missing.
//
// Known blind spot: app/.htaccess's dispatch block also forwards the
// Authorization and X-XSRF-Token headers into the FastCGI request (CGI-family
// SAPIs don't hand Authorization to PHP otherwise). That half of the block is
// not asserted here: Sanctum's SPA flow is cookie-based, /api/user 401s the
// same with or without a bogus bearer token, and no route in this app echoes
// the header back — so there is no cheap way to observe it through the
// current routes. Only the [L]-vs-the-old-app's-catch-all half is covered,
// by check 2.
//
// See docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8090';

/** Each check returns a failure string, or null when it passes. */
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const request = (path, init = {}) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });

/** Renders a response's status plus a clipped, whitespace-collapsed body, so a
 * failure message says who actually answered (Laravel JSON, an old-app Twig
 * page, an Apache error document, ...) instead of just a bare status code. */
const detail = async (res) => `${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 200)}`;

/**
 * Which of the two PHP apps produced a response, decided from headers alone —
 * the only signal left now that the Laravel port is byte-faithful and both apps
 * would answer some routes identically (see check 7).
 *
 * Every old-app response passes through src/bootstrap.php's session_start(),
 * so PHP's session cache limiter stamps it `Cache-Control: no-store, no-cache,
 * must-revalidate` and sets a PHPSESSID cookie. Laravel starts no PHP session
 * and Symfony's HttpFoundation defaults an uncached response to `Cache-Control:
 * no-cache, private`. Both contain the substring "no-cache", so `private` — not
 * "no-cache" — is the discriminating token.
 *
 * Verified empirically in both directions against the running stack: `private`
 * with no PHPSESSID on /api/user, /api/contact, /api/events, /api/altcha,
 * /api/signups and an unrouted /api/nonexistent; `no-store, must-revalidate`
 * with a PHPSESSID on /historique, /contact and an unrouted /nonexistent-page.
 *
 * Returns null when it looks like Laravel, or a failure string naming who
 * actually answered.
 */
const mustBeLaravel = (res) => {
  const cacheControl = res.headers.get('cache-control') ?? '';
  const cookies = res.headers.getSetCookie().join('; ');
  if (cookies.includes('PHPSESSID')) {
    return `a PHPSESSID cookie came back — the OLD app answered, so /api/* is not reaching Laravel (Set-Cookie: "${cookies}")`;
  }
  if (!cacheControl.includes('private')) {
    return `Cache-Control "${cacheControl}" is not Symfony's "no-cache, private" — something other than Laravel answered`;
  }
  return null;
};

/**
 * One value out of docker/api/env.docker — the file the stack actually mounts
 * as api-laravel/.env, so this is the same configuration Laravel booted with.
 * Checks that read it assert the behaviour the stack IS configured for rather
 * than hardcoding one branch, which is what lets a maintainer flip a setting
 * there and still get a meaningful 11/11.
 *
 * Throws rather than returning a sentinel: an unreadable env.docker or a
 * missing key is a broken stack, and each caller turns it into a failure
 * string.
 */
const dockerApiEnv = (key) => {
  const envPath = fileURLToPath(new URL('../docker/api/env.docker', import.meta.url));
  const line = new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(envPath, 'utf8'));
  if (!line) throw new Error(`no ${key}= line in ${envPath}`);
  return line[1].trim();
};

check('the old app is still served (front-controller catch-all intact)', async () => {
  const res = await request('/historique');
  if (res.status !== 200) return `expected 200, got ${res.status}`;
  const body = await res.text();
  if (body.includes('<?php')) {
    return 'PHP served as source — the FastCGI handler never engaged (mod_proxy_fcgi / SetHandler / php-fpm on 127.0.0.1:9000)';
  }
  return body.includes('</html>') ? null : 'a 200 that is not a rendered HTML page';
});

check('/api/* reaches Laravel, and the deny-all did not block it', async () => {
  // Three things at once. 401 rather than a 404 proves the dispatch rule won
  // against the old app's catch-all (it says nothing about [L] specifically —
  // REDIRECT_STATUS is what actually defeats the catch-all on the second pass;
  // see the dispatch block's comment in app/.htaccess). 401 rather than 403
  // proves api/public/.htaccess's "Require all granted" overrode the parent
  // deny — this is the ONLY request whose resolved file sits under that denied
  // tree. The JSON body distinguishes Laravel from any other 401.
  const res = await request('/api/user', { headers: { Accept: 'application/json' } });
  if (res.status === 403) {
    return `got 403 — api/public/.htaccess is missing "Require all granted" (or the whole tree is 403ing — check the /historique result first): ${await detail(res)}`;
  }
  if (res.status === 404) {
    return `got 404 — either the old app's catch-all answered (the dispatch block lost to it, or is not first in the merged .htaccess), or Laravel booted with no /api/user route: ${await detail(res)}`;
  }
  if (res.status !== 401) return `expected 401 from Laravel, got ${await detail(res)}`;
  // The error contract, NOT Laravel's native {message: "Unauthenticated."}:
  // App\Exceptions\ApiError deliberately replaces that shape so that
  // app/assets/js/i18n.js's translateApiError() has a stable machine token to
  // map onto French. Asserting `code` here is what pins that replacement in
  // place end to end, through the real HTTP stack.
  const body = await res.json().catch(() => ({}));
  return body.code === 'not_authenticated'
    ? null
    : `expected the {error, code} contract with code "not_authenticated", got ${JSON.stringify(body)}`;
});

check('/sanctum/* reaches Laravel and starts the SPA cookie flow', async () => {
  const res = await request('/sanctum/csrf-cookie');
  if (res.status !== 204) return `expected 204, got ${await detail(res)}`;
  const cookies = res.headers.getSetCookie().join('; ');
  return cookies.includes('XSRF-TOKEN') ? null : `no XSRF-TOKEN cookie in "${cookies}"`;
});

check("Laravel's .env is not readable over the web", async () => {
  // The single highest-value check in this file: api-laravel/.env holds the DB
  // password, APP_KEY, MIGRATE_TOKEN and the Altcha HMAC secret, and it is a
  // hand-placed server-owned file, so nothing in the build or deploy pipeline
  // would notice it being exposed.
  //
  // Locally this is 403, from api/.htaccess's deny-all: Apache evaluates
  // authorization during the directory walk, before mod_rewrite's per-directory
  // fixup ever runs the old app's catch-all, so the deny-all wins first (see
  // that file's own comment). On a real server it would 404 instead — not
  // because the catch-all wins there, but because .htaccess is a protected
  // basename never uploaded (tools/deploy/preflight.mjs's PROTECTED set), so
  // the deny-all doesn't exist to answer first. Loose on purpose (assert "not
  // exposed", not the exact status) so this keeps passing across that
  // difference — but locally, expect 403 specifically; a future 404 here is
  // worth digging into, not shrugging off.
  const res = await request('/api-laravel/.env');
  if (res.status === 200) return 'served 200 — the .env is exposed';
  const body = await res.text();
  return body.includes('APP_KEY') ? 'the response body leaked .env contents' : null;
});

check("Laravel's vendor/ is not readable over the web", async () => {
  const res = await request('/api-laravel/vendor/autoload.php');
  if (res.status === 200) return 'served 200 — vendor/ is exposed';
  const body = await res.text();
  return body.includes('ComposerAutoloaderInit') ? 'the response body leaked PHP source' : null;
});

check('the token-gated migrate route works end to end', async () => {
  // Proves dispatch + Laravel boot + .env + DB connection all line up.
  //
  // Header-only, exactly as tools/dbmigrate.mjs sends it: MigrateController
  // reads the secret from the X-Migrate-Token HEADER and from nowhere else (a
  // request input would also accept ?token=…, which Apache would write to the
  // access log in plain text). Sending it in the body too would only let this
  // check keep passing if that were ever loosened — so it doesn't.
  const res = await request('/api/migrate', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Migrate-Token': 'local-dev-migrate-token' },
  });
  if (res.status !== 200) return `expected 200, got ${await detail(res)}`;
  const json = await res.json().catch(() => ({}));
  if (json.ok !== true) return `expected {ok:true}, got ${JSON.stringify(json)}`;
  // MigrateController always returns an `output` key that the old app never
  // emits — pin it so a 200/{ok:true} from some other handler can't pass.
  return typeof json.output === 'string'
    ? null
    : `answered, but not by Laravel's MigrateController: ${JSON.stringify(json)}`;
});

check('POST /api/contact is Laravel, answering in the {error, code, fields[]} contract', async () => {
  // This replaced a check that asserted "the old app's /api/* endpoints are
  // shadowed by Laravel", discriminating the two apps by STATUS: the old app
  // 400 (its validator rejecting the empty body), Laravel 404 (no route). Both
  // halves are dead. app/api/ no longer exists, so there is nothing left to
  // shadow and no way for the old app to answer this path; and the port is
  // deliberately byte-faithful, so Laravel now returns that same 400 with an
  // identical body — the check had inverted into reporting "the old app
  // answered" on a correct stack.
  //
  // A negative check for a condition that can no longer arise earns nothing, so
  // this is the positive one instead: Laravel serves this route, and the error
  // contract survives the real HTTP stack (Apache dispatch, FastCGI, Symfony's
  // exception rendering) rather than only api/tests/. It is deliberately a
  // MUTATING public endpoint — the one class of route where the dispatch is
  // most load-bearing and a 404 the most damaging.
  //
  // Safe to fire repeatedly: Laravel validates the request before
  // ContactController runs, so an empty body never reaches the
  // `contact_messages` insert. Should the rules ever be relaxed to accept an
  // empty body, this would start writing rows to the dev database on every
  // smoke run — change the check, not the guard.
  const res = await request('/api/contact', { method: 'POST', headers: { Accept: 'application/json' } });
  if (res.status === 404) {
    return `got 404 — /api/* is not reaching Laravel at all (the dispatch block in app/.htaccess lost to the front-controller catch-all): ${await detail(res)}`;
  }
  if (res.status !== 400) return `expected Laravel's 400 for an empty body, got ${await detail(res)}`;
  const notLaravel = mustBeLaravel(res);
  if (notLaravel) return notLaravel;
  const body = await res.json().catch(() => ({}));
  if (body.code !== 'validation_failed') {
    return `expected code "validation_failed" (App\\Exceptions\\ApiError), got ${JSON.stringify(body)}`;
  }
  // The per-field array is the half of the contract i18n.js needs to render a
  // message next to each input; a bare {error, code} would satisfy the line
  // above but leave the form unable to say WHICH field is wrong.
  return Array.isArray(body.fields) && body.fields.length > 0
    ? null
    : `expected a non-empty fields[] alongside the code, got ${JSON.stringify(body)}`;
});

check('GET /api/events is public and served by Laravel', async () => {
  // planning_repet.js and sinscrire.js both fetch this before anyone logs in,
  // so an auth requirement here would silently empty the public planning. 401
  // is therefore as much a failure as 404.
  const res = await request('/api/events', { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `got 404 — /api/* is not reaching Laravel: ${await detail(res)}`;
  if (res.status === 401 || res.status === 403) {
    return `got ${res.status} — /api/events must stay unauthenticated: ${await detail(res)}`;
  }
  if (res.status !== 200) return `expected 200, got ${await detail(res)}`;
  const notLaravel = mustBeLaravel(res);
  if (notLaravel) return notLaravel;
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? null : `expected a JSON array of events, got ${JSON.stringify(body)?.slice(0, 200)}`;
});

check('GET /api/signups matches what docker/api/env.docker configures', async () => {
  // The opposite boundary from /api/events on the very same prefix: this one
  // lists every guest's name, address, phone and email, and is gated by
  // auth:sanctum + capability:view_summary. Anonymous must get the contract's
  // 401 — never a 200.
  //
  // Unless the whole feature is off. SOUPER_SIGNUP_ENABLED gates the endpoint
  // NAME, both verbs together (App\Http\Middleware\EnsureSouperSignupEnabled),
  // so with it off the correct answer is a 404 that looks like an unrouted
  // path — which is why this reads the flag instead of hardcoding 401. A 404 is
  // only a broken dispatch under the enabled branch.
  let enabled;
  try {
    enabled = dockerApiEnv('SOUPER_SIGNUP_ENABLED') === 'true';
  } catch (error) {
    return error.message;
  }

  const res = await request('/api/signups', { headers: { Accept: 'application/json' } });
  const notLaravel = mustBeLaravel(res);
  if (notLaravel) return notLaravel;

  if (!enabled) {
    // Not a pass-by-default branch: 200 or 401 would both mean the gate is not
    // holding, so assert the disabled contract exactly.
    return res.status === 404
      ? null
      : `SOUPER_SIGNUP_ENABLED is off in docker/api/env.docker, so expected 404, got ${await detail(res)}`;
  }

  if (res.status === 404) return `got 404 despite SOUPER_SIGNUP_ENABLED=true — broken dispatch, or stale container config (recreate it, don't just restart): ${await detail(res)}`;
  if (res.status === 200) return `got 200 — the summary is exposed to anonymous callers: ${await detail(res)}`;
  if (res.status !== 401) return `expected 401 for an anonymous caller, got ${await detail(res)}`;
  const body = await res.json().catch(() => ({}));
  return body.code === 'not_authenticated'
    ? null
    : `expected code "not_authenticated", got ${JSON.stringify(body)}`;
});

check('GET /api/altcha matches what docker/api/env.docker configures', async () => {
  // AltchaController fails CLOSED with 503 on an empty secret or the literal
  // CHANGE_ME, so the correct outcome depends on the stack's own config — which
  // is why this reads it rather than hardcoding 200. Either way the point is
  // the same: Laravel answered.
  //
  // Two settings decide the answer now. SOUPER_SIGNUP_ENABLED gates the route's
  // very existence, and it is checked FIRST because that is the order the
  // middleware stack runs in: with the feature off there is no route to fail
  // closed, so the secret is irrelevant and the correct answer is 404. Only
  // under the enabled branch is a 404 a broken dispatch.
  let enabled;
  let secret;
  try {
    enabled = dockerApiEnv('SOUPER_SIGNUP_ENABLED') === 'true';
    secret = dockerApiEnv('ALTCHA_HMAC_SECRET');
  } catch (error) {
    return error.message;
  }
  const configured = secret !== '' && secret !== 'CHANGE_ME';

  const res = await request('/api/altcha', { headers: { Accept: 'application/json' } });
  const notLaravel = mustBeLaravel(res);
  if (notLaravel) return notLaravel;

  if (!enabled) {
    return res.status === 404
      ? null
      : `SOUPER_SIGNUP_ENABLED is off in docker/api/env.docker, so expected 404, got ${await detail(res)}`;
  }

  if (res.status === 404) return `got 404 despite SOUPER_SIGNUP_ENABLED=true — broken dispatch, or stale container config (recreate it, don't just restart): ${await detail(res)}`;
  const body = await res.json().catch(() => ({}));

  if (!configured) {
    // Not a pass-by-default branch: fail-closed is a real behaviour with its own
    // contract code, so assert it exactly.
    if (res.status !== 503) {
      return `ALTCHA_HMAC_SECRET is unset/CHANGE_ME in docker/api/env.docker, so expected a fail-closed 503, got ${res.status} ${JSON.stringify(body)}`;
    }
    return body.code === 'service_unavailable'
      ? null
      : `expected code "service_unavailable", got ${JSON.stringify(body)}`;
  }

  if (res.status === 503) {
    return `503 despite a secret in docker/api/env.docker — the container is running stale config (recreate it, don't just restart): ${JSON.stringify(body)}`;
  }
  if (res.status !== 200) return `expected 200, got ${await detail(res)}`;
  // The full challenge, not just a 200: sinscrire.js's Altcha widget cannot
  // compute a proof without every one of these, and POST /api/signups verifies
  // the signature against them.
  const missing = ['algorithm', 'challenge', 'salt', 'signature', 'maxnumber'].filter((k) => body[k] == null);
  return missing.length === 0 ? null : `challenge is missing ${missing.join(', ')}: ${JSON.stringify(body)}`;
});

check('built assets are served with the immutable cache policy', async () => {
  const manifestPath = fileURLToPath(new URL('../app/assets/dist/.vite/manifest.json', import.meta.url));
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return `could not read ${manifestPath}: ${error.message} — has the assets container finished its first build?`;
  }
  const entry = Object.values(manifest).find((e) => typeof e.file === 'string' && e.file.endsWith('.css'));
  if (!entry) return 'no CSS entry in the Vite manifest';

  const res = await request(`/assets/dist/${entry.file}`);
  if (res.status !== 200) {
    return `expected 200 for /assets/dist/${entry.file}, got ${await detail(res)} — a 404 here means the host manifest and the served build disagree (stale manifest, or Vite mid-rebuild)`;
  }
  const cacheControl = res.headers.get('cache-control') ?? '';
  return cacheControl.includes('immutable')
    ? null
    : `expected an immutable Cache-Control, got "${cacheControl}"`;
});

let failed = 0;
for (const { name, fn } of checks) {
  let problem;
  try {
    problem = await fn();
  } catch (error) {
    // Node's fetch rejects with a bare `TypeError: fetch failed`; the actual
    // reason lives on `.cause`. For a dual-stack connection refusal that cause
    // is itself an AggregateError with an EMPTY `.message` — the real text is
    // one level deeper, on `.cause.errors[0].message` (or, failing that,
    // `.cause.code` for a single-attempt cause, or
    // `.cause.errors[0].code` for a multi-attempt one — AggregateError
    // itself never has `.code`, only its per-attempt sub-errors do).
    const cause = error.cause;
    const causeMessage = cause?.message || cause?.errors?.[0]?.message || cause?.code || cause?.errors?.[0]?.code;
    problem = causeMessage ? `${error.message} — ${causeMessage}` : error.message;
  }
  if (problem) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${problem}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed against ${BASE}`);
process.exitCode = failed ? 1 : 0;
