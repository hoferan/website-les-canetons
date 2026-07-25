// Smoke-tests the local Docker stack. Every check here asserts something that
// only holds because the stack matches production: both apps on ONE origin, the
// Laravel dispatch surviving the old app's catch-all, the authorization
// boundary the chrooted FTP layout forces around the Laravel tree, and the
// asset cache policy. Run after `npm run dev`.
//
// Known blind spot: docker/web/api-dispatch.htaccess also forwards the
// Authorization and X-XSRF-Token headers into the FastCGI request (CGI-family
// SAPIs don't hand Authorization to PHP otherwise). That half of the block is
// not asserted here: Sanctum's SPA flow is cookie-based, /api/user 401s the
// same with or without a bogus bearer token, and no route in this app echoes
// the header back — so there is no cheap way to observe it through the
// current routes. Only the [END]-vs-the-old-app's-catch-all half is covered,
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
  // Three things at once. 401 rather than the old app's 404 proves the dispatch
  // rule won against the catch-all (it says nothing about [END] specifically —
  // REDIRECT_STATUS is what actually defeats the catch-all on the second pass;
  // see docker/web/api-dispatch.htaccess). 401 rather than 403 proves
  // api/public/.htaccess's "Require all granted" overrode the parent deny —
  // this is the ONLY request whose resolved file sits under that denied tree.
  // The JSON body distinguishes Laravel from any other 401.
  const res = await request('/api/user', { headers: { Accept: 'application/json' } });
  if (res.status === 403) {
    return `got 403 — api/public/.htaccess is missing "Require all granted" (or the whole tree is 403ing — check the /historique result first): ${await detail(res)}`;
  }
  if (res.status === 404) {
    return `got 404 — either the old app answered (the dispatch block lost to the catch-all, or is not first in the merged .htaccess), or Laravel booted with no /api/user route: ${await detail(res)}`;
  }
  if (res.status !== 401) return `expected 401 from Laravel, got ${await detail(res)}`;
  const body = await res.json().catch(() => ({}));
  return body.message === 'Unauthenticated.'
    ? null
    : `expected Laravel's unauthenticated JSON, got ${JSON.stringify(body)}`;
});

check('/sanctum/* reaches Laravel and starts the SPA cookie flow', async () => {
  const res = await request('/sanctum/csrf-cookie');
  if (res.status !== 204) return `expected 204, got ${await detail(res)}`;
  const cookies = res.headers.getSetCookie().join('; ');
  return cookies.includes('XSRF-TOKEN') ? null : `no XSRF-TOKEN cookie in "${cookies}"`;
});

check("Laravel's .env is not readable over the web", async () => {
  // Locally this is 403, from api/.htaccess's deny-all: Apache evaluates
  // authorization during the directory walk, before mod_rewrite's per-directory
  // fixup ever runs the old app's catch-all, so the deny-all wins first (see
  // that file's own comment). On a real server it would 404 instead — not
  // because the catch-all wins there, but because .htaccess is a protected
  // basename never uploaded (tools/deploy/preflight.mjs's PROTECTED set), so
  // the deny-all doesn't exist to answer first. Loose on purpose (assert "not
  // exposed", not the exact status) so this keeps passing across that
  // difference and across the 2a-ii catch-all change — but locally, expect 403
  // specifically; a future 404 here is worth digging into, not shrugging off.
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
  // The token is sent BOTH ways on purpose: MigrateController reads a `token`
  // request input, while tools/dbmigrate.mjs sends an X-Migrate-Token header
  // (the old app's contract). Sub-project 2a-ii has to reconcile those; sending
  // both keeps this check valid whichever way it lands.
  const res = await request('/api/migrate', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Migrate-Token': 'local-dev-migrate-token' },
    body: new URLSearchParams({ token: 'local-dev-migrate-token' }),
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

check('the old app /api/* endpoints are shadowed by Laravel (accepted cost, spec §6)', async () => {
  // Task 8's manual `curl -o /dev/null` step can't tell these apps apart by
  // status alone the way this check needs to: the old app answers 400 (its
  // validator rejects the empty POST body, via App\Http\JsonResponse::error
  // at app/api/contact.php:20-21), Laravel answers 404 (no matching route) —
  // status IS the discriminator here. The content-type check below is
  // belt-and-braces against a third party answering (e.g. an Apache error
  // document), not the primary signal — app/api/contact.php:8 sets
  // Content-Type: application/json before it even validates, so both apps'
  // responses are JSON and content-type alone can't tell them apart.
  //
  // Latent hazard: this check is safe today only because contact.php's
  // validation rejects the empty body BEFORE the `INSERT INTO
  // contact_messages` at app/api/contact.php:26. If a future contact.php
  // moved validation after that insert (or accepted an empty body), this
  // check would start writing rows to the dev database on every smoke run.
  const res = await request('/api/contact', { method: 'POST', headers: { Accept: 'application/json' } });
  if (res.status === 400) {
    return `got 400 — the old app answered (app/api/contact.php is a registered route at routes.php:75), so /api/* is not reaching Laravel: ${await detail(res)}`;
  }
  if (res.status !== 404) return `expected Laravel's 404, got ${await detail(res)}`;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('json') ? null : `404 came from the old app, not Laravel (content-type "${ct}")`;
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
