// tools/deploy/preflight.mjs
// Pre-deploy safety checks: the protected-files set, the per-env target-path
// guard (the one FTP account reaches every environment), and the
// api-laravel/.env key-shape check.
//
// That last one used to parse each server's config.php to an AST. config.php
// is gone with the old front end; Laravel's .env is now the only server-owned
// configuration, and a dotenv key set is a line-regex rather than a parse — so
// this no longer needs php-parser at all. Key *values* are never read,
// returned or logged, so a server's credentials cannot leak into deploy output.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { STATE_FILE } from './state.mjs';

// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately).
//
// ROOT-RELATIVE PATHS, matched exactly — NOT basenames at any depth, which is
// what this used to be. The basename form silently dropped `api/.htaccess`
// and `api/public/.htaccess` — which ship as `api-laravel/.htaccess` and
// `api-laravel/public/.htaccess` in the artifact this set actually matches
// against — from every upload for the whole life of the project:
// tools/build.mjs copies both into the artifact, and they are the deny/grant
// pair that is supposed to be the authorization boundary around the Laravel
// tree, so the effect was that a server had exactly ONE thing between the
// internet and Laravel's .env — the SPA fallback's catch-all rewrite.
//
// Written without a leading slash so each entry compares === to the posix
// `rel` paths walkBuild() and the state file both use.
//
// The export was renamed along with the semantics, on purpose: a call site
// still passing this to something that does a basename match now throws
// instead of quietly matching nothing and making every server-owned file
// deletable.
export const PROTECTED_PATHS = new Set([
  // Server-owned: the site rules plus each staging environment's auth block.
  '.htaccess',
  // Server-owned: Disallow on test/qa, the real one (or none) on prod.
  'robots.txt',
  // Server-owned credentials for the staging Basic Auth. NO tool uploads this
  // — see tools/put-overlay.mjs, which refuses on purpose, because
  // re-uploading credentials during a cutover window is a way to lock yourself
  // out. It also lives INSIDE the document root on this host, so deleting it
  // leaves an .htaccess whose AuthUserFile points at nothing and Apache
  // answers 500 to every request.
  '.htpasswd',
  // Dead — it configured the front end deleted in the SPA cutover — but every
  // server still HAS it, and this set is what stops a bootstrap or --relist
  // deploy deleting files it did not put there. It holds live DB credentials
  // until removed by hand, once per server, after which this entry can go.
  'config.php',
  // Laravel's server-owned configuration: APP_KEY, DB credentials,
  // MIGRATE_TOKEN. Hand-placed, git-ignored, stripped from the artifact by
  // tools/build.mjs, and it exists NOWHERE ELSE — so without this entry a
  // --relist or bootstrap deploy classifies it as stale and deletes the API's
  // entire configuration.
  'api-laravel/.env',
  STATE_FILE,
]);

// FTP_DIR must name the target env as its own path/subdomain segment, so a
// mistyped dir can never deploy to — or delete from! — the wrong environment.
const GUARDS = {
  test: /(^|[/.])test([/.]|$)/i,
  qa: /(^|[/.])qa([/.]|$)/i,
  prod: /(^|[/.])prod([/.]|$)/i,
};
export const TARGETS = Object.keys(GUARDS);

export function checkTargetDir(target, dir) {
  if (GUARDS[target].test(dir)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Refusing to run: FTP_DIR="${dir}" does not look like the ${target.toUpperCase()} target. ` +
      `This account can reach other environments too, so deploy only runs against a path matching "${target}".`,
  };
}

/**
 * The KEYS a dotenv file declares, sorted and de-duplicated.
 *
 * Values are never captured, so nothing downstream can log a credential. A
 * commented-out line declares nothing; a key with an empty value still counts
 * as declared, because an unset value is a value problem and this check is
 * deliberately only about shape.
 */
export function envKeys(source) {
  const keys = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

// Pure comparison of two key lists (expected = what the deployed code needs,
// actual = what the server declares).
export function compareEnvShape(expected, actual) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((k) => !actualSet.has(k));
  const extra = actual.filter((k) => !expectedSet.has(k));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

// Fetch the target's api-laravel/.env and compare its key set against
// api/.env.example (the source of truth for what the deployed code expects), so
// a deploy that would land code needing a key the server has never been given
// fails here rather than 500ing every /api/* request afterwards. Best-effort on
// fetch: a brand-new environment has no .env yet — the API can't run either
// way, so blocking wouldn't add protection there; report `skipped` and let the
// caller warn.
export async function checkEnvShape(client, remoteRoot) {
  const expected = envKeys(readFileSync('api/.env.example', 'utf8'));
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-env-'));
  const tmpEnv = path.join(tmpDir, 'env');
  try {
    try {
      await client.downloadTo(tmpEnv, `${remoteRoot}/api-laravel/.env`);
    } catch (err) {
      return { ok: true, skipped: true, reason: err.message, missing: [], extra: [] };
    }
    return { skipped: false, ...compareEnvShape(expected, envKeys(readFileSync(tmpEnv, 'utf8'))) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
