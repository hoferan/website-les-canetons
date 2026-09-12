// Smoke-tests the local Docker stack. Every check here asserts something that
// only holds because the stack matches production: the SPA shell and the API on
// ONE origin, the Laravel dispatch surviving the SPA fallback, the authorization
// boundary the chrooted FTP layout forces around the Laravel tree, and the
// cache policy on both the shell and the hashed bundles. Run after
// `npm run build && npm run dev` — the `web` container serves dist/build/, so
// these assert the artifact that actually gets deployed, not the dev server.
//
// /api/* is Laravel's alone. So the recurring point of the /api/* checks below
// is simply that LARAVEL ANSWERS AT ALL, with the right status and the right
// body shape: a 404 on any of them means the dispatch in
// config/htaccess/site.htaccess is broken, not that a route is missing.
//
// Known blind spot: the dispatch block also forwards the Authorization and
// X-XSRF-Token headers into the FastCGI request (CGI-family SAPIs don't hand
// Authorization to PHP otherwise). That half of the block is not asserted here:
// Sanctum's SPA flow is cookie-based, /api/me 401s the same with or without a
// bogus bearer token, and no route in this app echoes the header back — so
// there is no cheap way to observe it through the current routes. Only the
// [L]-vs-the-fallback half is covered.
//
// See docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md and
// docs/superpowers/specs/2026-08-28-spa-clean-cutover-and-mocks-design.md.
//
// Trimmed 2026-09-07: four checks asserted the events/signups/altcha domain
// that R1a deleted, and the deny-all check requested the framework's default
// /api/user, which this app's route table has never had. The file was 8/13 for
// that whole period, which is worse than having no smoke test — a real
// breakage would have arrived as one more red line among five.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8090';

/** Each check returns a failure string, or null when it passes. */
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const request = (path, init = {}) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });

/** Renders a response's status plus a clipped, whitespace-collapsed body, so a
 * failure message says who actually answered (Laravel JSON, the SPA shell
 * page, an Apache error document, ...) instead of just a bare status code. */
const detail = async (res) => `${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 200)}`;

/**
 * Whether Laravel produced a response, decided from headers alone.
 *
 * Symfony's HttpFoundation defaults an uncached response to `Cache-Control:
 * no-cache, private`, so `private` is the token to look for. The alternative
 * answer is now the SPA fallback serving index.html, which the cache block
 * stamps `max-age=0, must-revalidate` — so a /api/* request that comes back
 * without `private` means the dispatch lost to the fallback.
 *
 * The PHPSESSID branch predates the cutover: it distinguished Laravel from the
 * old front end, whose bootstrap called session_start() on every request. That
 * app is gone and nothing in the document root starts a PHP session any more,
 * so the branch should never fire — it is kept because if one ever does appear,
 * something is running that has no business running, and the message says so
 * more usefully than a bare Cache-Control mismatch would.
 *
 * Returns null when it looks like Laravel, or a failure string naming who
 * actually answered.
 */
const mustBeLaravel = (res) => {
  const cacheControl = res.headers.get('cache-control') ?? '';
  const cookies = res.headers.getSetCookie().join('; ');
  if (cookies.includes('PHPSESSID')) {
    return `a PHPSESSID cookie came back — something started a PHP session, so this is not Laravel and not the static shell (Set-Cookie: "${cookies}")`;
  }
  if (!cacheControl.includes('private')) {
    return `Cache-Control "${cacheControl}" is not Symfony's "no-cache, private" — something other than Laravel answered`;
  }
  return null;
};

check('the SPA shell is served for a page URL (fallback intact)', async () => {
  // /historique is a route the SPA owns and no file on disk matches, so this
  // exercises the fallback rather than a static hit. A 500 here is the rewrite
  // loop the fallback's REDIRECT_STATUS guard exists to prevent, not a missing
  // file — see config/htaccess/site.htaccess.
  const res = await request('/historique');
  if (res.status !== 200) return `expected 200, got ${await detail(res)}`;
  const body = await res.text();
  if (body.includes('<?php')) {
    return 'PHP served as source — the FastCGI handler never engaged (mod_proxy_fcgi / SetHandler / php-fpm on 127.0.0.1:9000)';
  }
  return body.includes('<div id="root">') ? null : 'a 200 that is not the SPA shell document';
});

check('the shell is served must-revalidate, so a deploy is picked up', async () => {
  // index.html names the hashed bundles. Cached, a returning visitor would keep
  // loading the previous deploy's bundle graph until the cache expired.
  const res = await request('/');
  if (res.status !== 200) return `expected 200, got ${await detail(res)}`;
  const cacheControl = res.headers.get('cache-control') ?? '';
  return cacheControl.includes('must-revalidate')
    ? null
    : `expected a must-revalidate Cache-Control on the shell, got "${cacheControl}"`;
});

check('/api/* reaches Laravel, and the deny-all did not block it', async () => {
  // Three things at once. 401 rather than a 404 proves the dispatch rule won
  // against the SPA fallback (it says nothing about [L] specifically —
  // REDIRECT_STATUS is what actually defeats the catch-all on the second pass;
  // see the dispatch block's comment in the template). 401 rather than 403
  // proves api/public/.htaccess's "Require all granted" overrode the parent
  // deny — this is the ONLY request whose resolved file sits under that denied
  // tree. The JSON body distinguishes Laravel from any other 401.
  //
  // /api/me, not the framework's default /api/user: R1a's route table has no
  // /user, so this check asserted a 404 for weeks. Any authenticated route
  // would do; /api/me is the one guaranteed to exist for as long as there is a
  // session at all.
  const res = await request('/api/v1/me', { headers: { Accept: 'application/json' } });
  if (res.status === 403) {
    return `got 403 — api/public/.htaccess is missing "Require all granted" (or the whole tree is 403ing — check the shell result first): ${await detail(res)}`;
  }
  if (res.status === 404) {
    return `got 404 — either the SPA fallback answered (the dispatch block lost to it, or is not first in the merged .htaccess), or Laravel booted with no /api/me route: ${await detail(res)}`;
  }
  if (res.status !== 401) return `expected 401 from Laravel, got ${await detail(res)}`;
  // The error contract, NOT Laravel's native {message: "Unauthenticated."}:
  // App\Exceptions\ApiError deliberately replaces that shape so that
  // web/src/i18n/'s translateApiError() has a stable machine token to map onto
  // French. Asserting `code` here is what pins that replacement in place end to
  // end, through the real HTTP stack.
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
  // The single highest-value check in this file: the API's .env holds the DB
  // password, APP_KEY and MIGRATE_TOKEN, and it is a hand-placed server-owned
  // file, so nothing in the build or deploy pipeline would notice it being
  // exposed.
  //
  // ORDER MATTERS, and an earlier draft of this check got it wrong: it
  // returned on `status === 200` BEFORE reading the body, which made the
  // APP_KEY leak test unreachable for the only status where it could ever
  // matter. Read the body first, then discriminate.
  //
  // A 200 here does NOT mean the file was served. The site .htaccess's
  // fallback is a deliberate catch-all that answers 200 with the SPA shell for
  // any unknown path — so a missing deny-all shows up as the shell, not as a
  // 404. (The comment this replaced claimed a server would 404. It never did.)
  // Distinguishing the two matters at 23:00: "the .env is exposed" and "the
  // boundary is missing but nothing leaked" call for very different panic.
  const res = await request('/_api/.env');
  const body = await res.text();

  if (body.includes('APP_KEY') || body.includes('DB_PASSWORD')) {
    return `the response body leaked .env contents (status ${res.status})`;
  }
  if (res.status === 403) return null;
  if (res.status === 200) {
    return 'got 200 serving the SPA shell — the deny-all did not answer, so the only ' +
      'thing protecting the Laravel tree is the catch-all rewrite. _api/.htaccess is ' +
      'either not being read (AllowOverride?) or did not deploy';
  }
  return `expected 403 from the deny-all, got ${res.status}`;
});

check("Laravel's vendor/ is not readable over the web", async () => {
  // Same shape and the same ordering fix as the .env check above — read the
  // body first, so the ComposerAutoloaderInit leak test is reachable even when
  // the status is 200. A 200 here means the SPA shell answered (the catch-all
  // fallback), not that vendor/ was served: see the .env check's comment.
  const res = await request('/_api/vendor/autoload.php');
  const body = await res.text();

  if (body.includes('ComposerAutoloaderInit')) {
    return `the response body leaked PHP source (status ${res.status})`;
  }
  if (res.status === 403) return null;
  if (res.status === 200) {
    return 'got 200 serving the SPA shell — the deny-all did not answer, so the only ' +
      'thing protecting the Laravel tree is the catch-all rewrite. _api/.htaccess is ' +
      'either not being read (AllowOverride?) or did not deploy';
  }
  return `expected 403 from the deny-all, got ${res.status}`;
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
  // MigrateController always returns an `output` key the old endpoint never
  // emits — pin it so a 200/{ok:true} from some other handler can't pass.
  return typeof json.output === 'string'
    ? null
    : `answered, but not by Laravel's MigrateController: ${JSON.stringify(json)}`;
});

check('POST /api/contact is Laravel, answering in the problem-document contract', async () => {
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
  // IT NOW HAS TO GET PAST PublicWriteGuard, added 2026-09-12. R3 put a
  // honeypot and a submit-timing floor in front of both anonymous write
  // endpoints, so a bare POST answers 422 `spam_suspected` and never reaches
  // validation — this check had been asserting a 400 it could no longer be
  // given. It primes a real token and waits the floor out rather than simply
  // asserting the 422, because what is worth smoking here is the ERROR CONTRACT
  // over the real stack: api/tests/ covers the guard thoroughly and cannot
  // cover Apache and FastCGI at all.
  //
  // Safe to fire repeatedly: the body carries ONLY the honeypot, so Laravel's
  // validation still rejects it before ContactController runs and no row ever
  // reaches `contact_messages`. Should the rules ever be relaxed to accept an
  // empty body, this would start writing rows to the dev database on every
  // smoke run — change the check, not the guard.
  const tokenRes = await request('/api/v1/form-token', { headers: { Accept: 'application/json' } });
  if (tokenRes.status !== 200) return `could not mint a form token: ${await detail(tokenRes)}`;
  const { token } = await tokenRes.json().catch(() => ({}));
  if (!token) return 'GET /api/v1/form-token answered 200 without a token';

  // App\Support\FormToken refuses a stamp younger than two seconds.
  await new Promise((resolve) => setTimeout(resolve, 2100));

  const res = await request('/api/v1/contact', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Form-Token': token,
    },
    // PublicWriteGuard wants the honeypot PRESENT and empty; omitting it is
    // exactly the bot signature it exists to catch.
    body: JSON.stringify({ website: '' }),
  });
  if (res.status === 404) {
    return `got 404 — /api/* is not reaching Laravel at all (the dispatch block in the template lost to the SPA fallback): ${await detail(res)}`;
  }
  if (res.status === 422) {
    return `PublicWriteGuard refused this submission, so the contract was never exercised: ${await detail(res)}`;
  }
  if (res.status !== 400) return `expected Laravel's 400 for a body with no fields, got ${await detail(res)}`;

  const body = await res.json().catch(() => ({}));
  if (body.code !== 'validation_failed') {
    return `expected code "validation_failed" (App\Exceptions\ApiError), got ${JSON.stringify(body)}`;
  }
  // The per-field array is the half of the contract web/src/i18n/ needs to
  // render a message next to each input; a bare {title, code} would satisfy the
  // line above but leave the form unable to say WHICH field is wrong. It is
  // `errors` on the wire — http.ts renames it to `fields` on the client side.
  return Array.isArray(body.errors) && body.errors.length > 0
    ? null
    : `expected a non-empty errors[] alongside the code, got ${JSON.stringify(body)}`;
});

check('hashed bundles are served with the immutable cache policy', async () => {
  // Read the bundle URL out of the built shell rather than a Vite manifest:
  // the SPA build emits no manifest (nothing server-side reads one any more),
  // and index.html is what the browser actually follows.
  const shellPath = fileURLToPath(new URL('../dist/build/index.html', import.meta.url));
  let shell;
  try {
    shell = readFileSync(shellPath, 'utf8');
  } catch (error) {
    return `could not read ${shellPath}: ${error.message} — run \`npm run build\` first`;
  }
  const bundle = shell.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!bundle) return 'no hashed /assets/*.js bundle found in dist/build/index.html';

  const res = await request(bundle);
  if (res.status !== 200) {
    return `expected 200 for ${bundle}, got ${await detail(res)} — a 404 here means the container is serving a different build than dist/build/ on disk`;
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
