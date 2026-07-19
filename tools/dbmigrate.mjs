// Triggers the server-side migration endpoint (POST <SITE_URL>/api/migrate) as
// a post-deploy step. Reads SITE_URL + MIGRATE_TOKEN from .env.<target> (then
// .env). --dry-run reports pending migrations without applying. Exits non-zero
// on any non-2xx response or a status != "ok", so a failed migration fails the
// deploy. DB credentials never appear here — the endpoint uses the server's
// config.php.
import { loadDotEnv } from './dotenv.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TARGETS = ['test', 'qa', 'prod'];
const target = args.find((a) => !a.startsWith('--'));
if (!target || !TARGETS.includes(target)) {
  console.error(`Usage: node tools/dbmigrate.mjs <${TARGETS.join('|')}> [--dry-run]`);
  process.exit(1);
}

// Env-specific first (wins), then shared base — matches deploy.mjs.
loadDotEnv(`.env.${target}`);
loadDotEnv('.env');

const siteUrl = process.env.SITE_URL;
const token = process.env.MIGRATE_TOKEN;
const missing = [!siteUrl && 'SITE_URL', !token && 'MIGRATE_TOKEN'].filter(Boolean);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} — set them in .env.${target} (see .env.${target}.example).`);
  process.exit(1);
}

const mode = DRY_RUN ? 'dry-run' : 'apply';
const url = `${siteUrl.replace(/\/$/, '')}/api/migrate?mode=${mode}`;
console.log(`${target.toUpperCase()} migrate (${mode}) -> ${siteUrl.replace(/\/$/, '')}/api/migrate`);

// TEST/QA sit behind site-wide HTTP Basic Auth (this host rejects a per-path
// exemption in .htaccess), so also send Basic Auth credentials when configured.
// PROD has no Basic Auth — leave BASIC_AUTH_* unset there and none is sent.
const headers = { 'X-Migrate-Token': token };
const authUser = process.env.BASIC_AUTH_USER;
const authPass = process.env.BASIC_AUTH_PASS;
if (authUser && authPass) {
  headers.Authorization = `Basic ${Buffer.from(`${authUser}:${authPass}`).toString('base64')}`;
}

let res;
let text;
try {
  res = await fetch(url, { method: 'POST', headers });
  text = await res.text();
} catch (err) {
  console.error(`Migration request failed (could not reach ${siteUrl.replace(/\/$/, '')}): ${err.message}`);
  process.exit(1);
}

// The endpoint returns JSON. Anything else (an HTML error/404 page) means the
// site is broken or /api/migrate isn't configured — report that clearly instead
// of a cryptic JSON parse error.
let body;
try {
  body = JSON.parse(text);
} catch {
  const snippet = text.trim().slice(0, 200).replace(/\s+/g, ' ');
  console.error(`\nMigration ${mode} FAILED: expected JSON from ${url} but got a non-JSON response (HTTP ${res.status}).`);
  console.error(`Response starts with: ${snippet}`);
  console.error(
    `\nLikely causes: HTTP ${res.status} 401 -> missing/wrong BASIC_AUTH_USER/BASIC_AUTH_PASS ` +
      '(TEST/QA are behind Basic Auth); the site is erroring (check the page loads); migrate.token ' +
      "not set in this env's config.php (the endpoint 404s when unconfigured); or SITE_URL is wrong."
  );
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));

if (!res.ok || body.status !== 'ok') {
  console.error(`\nMigration ${mode} FAILED (HTTP ${res.status}).`);
  process.exit(1);
}

if (mode === 'dry-run') {
  console.log(`\nPending: ${body.pending?.length ? body.pending.join(', ') : '(none)'}`);
} else {
  console.log(`\nApplied: ${body.applied?.length ? body.applied.join(', ') : '(none — already up to date)'}`);
}
