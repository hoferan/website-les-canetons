// Smoke-tests the local Docker stack. Every check here asserts something that
// only holds because the stack matches production: both apps on ONE origin, the
// Laravel dispatch surviving the old app's catch-all, the authorization
// boundary the chrooted FTP layout forces around the Laravel tree, and the
// asset cache policy. Run after `npm run dev`.
//
// See docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md.
import { readFileSync } from 'node:fs';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8090';

/** Each check returns a failure string, or null when it passes. */
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const get = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init });

check('the old app is still served (front-controller catch-all intact)', async () => {
  const res = await get('/historique');
  return res.status === 200 ? null : `expected 200, got ${res.status}`;
});

check('/api/* reaches Laravel, and the deny-all did not block it', async () => {
  // Three things at once. 401 rather than the old app's 404 proves the dispatch
  // rule won against the catch-all ([END], not [L]). 401 rather than 403 proves
  // api/public/.htaccess's "Require all granted" overrode the parent deny —
  // this is the ONLY request whose resolved file sits under that denied tree.
  // The JSON body distinguishes Laravel from any other 401.
  const res = await get('/api/user', { headers: { Accept: 'application/json' } });
  if (res.status === 403) return 'got 403 — api/public/.htaccess is missing "Require all granted"';
  if (res.status !== 401) return `expected 401 from Laravel, got ${res.status}`;
  const body = await res.json().catch(() => ({}));
  return body.message === 'Unauthenticated.'
    ? null
    : `expected Laravel's unauthenticated JSON, got ${JSON.stringify(body)}`;
});

check('/sanctum/* reaches Laravel and starts the SPA cookie flow', async () => {
  const res = await get('/sanctum/csrf-cookie');
  if (res.status !== 204) return `expected 204, got ${res.status}`;
  const cookies = res.headers.getSetCookie().join('; ');
  return cookies.includes('XSRF-TOKEN') ? null : `no XSRF-TOKEN cookie in "${cookies}"`;
});

check("Laravel's .env is not readable over the web", async () => {
  // Answered by the old app's 404 today (its catch-all rewrites this to
  // index.php before authorization runs), and by api/.htaccess's deny-all once
  // that catch-all changes. Either way it must not be the file.
  const res = await get('/api-laravel/.env');
  if (res.status === 200) return 'served 200 — the .env is exposed';
  const body = await res.text();
  return body.includes('APP_KEY') ? 'the response body leaked .env contents' : null;
});

check("Laravel's vendor/ is not readable over the web", async () => {
  const res = await get('/api-laravel/vendor/autoload.php');
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
  const res = await fetch(`${BASE}/api/migrate`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Migrate-Token': 'local-dev-migrate-token' },
    body: new URLSearchParams({ token: 'local-dev-migrate-token' }),
  });
  if (res.status !== 200) return `expected 200, got ${res.status}`;
  const json = await res.json().catch(() => ({}));
  return json.ok === true ? null : `expected {ok:true}, got ${JSON.stringify(json)}`;
});

check('built assets are served with the immutable cache policy', async () => {
  const manifestPath = 'app/assets/dist/.vite/manifest.json';
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return `no ${manifestPath} — has the assets container finished its first build?`;
  }
  const entry = Object.values(manifest).find((e) => typeof e.file === 'string' && e.file.endsWith('.css'));
  if (!entry) return 'no CSS entry in the Vite manifest';

  const res = await get(`/assets/dist/${entry.file}`);
  if (res.status !== 200) return `expected 200 for /assets/dist/${entry.file}, got ${res.status}`;
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
    problem = error.message;
  }
  if (problem) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${problem}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed against ${BASE}`);
process.exit(failed ? 1 : 0);
