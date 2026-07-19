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

let res;
let body;
try {
  res = await fetch(url, { method: 'POST', headers: { 'X-Migrate-Token': token } });
  body = await res.json();
} catch (err) {
  console.error(`Migration request failed: ${err.message}`);
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
