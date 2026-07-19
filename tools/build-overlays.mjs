// Generates the per-environment "overlay" files — the handful of files that
// differ between test / qa / prod and therefore must NOT travel with the
// promoted code artifact (public/). Output goes to dist/overlay/<env>/, ready to
// upload once per server (and again only when app/.htaccess or the auth block
// changes).
//
//   test / qa : .htaccess = staging auth block + the current app/.htaccess
//               front controller (auto-merged), staging robots.txt (noindex),
//               and .htpasswd if one exists locally.
//   prod      : plain app/.htaccess + the real app/robots.txt (no auth).
//
// config.php is deliberately NOT emitted — it is server-owned and set by hand.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { loadDotEnv } from './dotenv.mjs';

// Per-env values (e.g. HTPASSWD_PATH_TEST/HTPASSWD_PATH_QA) live in .env.<env>;
// load every per-env file first, then the shared .env base. loadDotEnv never
// overwrites an already-set var (first-wins), and the suffixed keys are
// distinct per env, so loading all of them causes no collisions.
for (const e of ['test', 'qa', 'prod']) {
  loadDotEnv(`.env.${e}`);
}
loadDotEnv('.env');

const ENVS = ['test', 'qa', 'prod'];

const requested = process.argv.slice(2).filter((a) => a !== 'all');
const targets = requested.length ? requested : ENVS;

const unknown = targets.filter((e) => !ENVS.includes(e));
if (unknown.length) {
  console.error(`Unknown environment(s): ${unknown.join(', ')}. Use: ${ENVS.join(' | ')} | all`);
  process.exit(1);
}

const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

/** test/qa .htaccess: auth overlay first, then the built front controller. */
function mergedHtaccess(env) {
  let auth = readFileSync(`staging/${env}/.htaccess`, 'utf8').trimEnd();
  if (auth.includes('__HTPASSWD_PATH__')) {
    const pathVar = `HTPASSWD_PATH_${env.toUpperCase()}`;
    const real = process.env[pathVar];
    if (real) {
      auth = auth.split('__HTPASSWD_PATH__').join(real);
    } else {
      console.warn(
        `  ! ${pathVar} not set — leaving __HTPASSWD_PATH__ placeholder in ` +
          `${env}/.htaccess (set it in .env, or fill the path on the server).`
      );
    }
  }
  return (
    `${auth}\n\n` +
    '# ---------------------------------------------------------------------------\n' +
    '# Front controller + cache policy (generated from app/.htaccess by\n' +
    '# tools/build-overlays.mjs — do not edit here; edit app/.htaccess)\n' +
    '# ---------------------------------------------------------------------------\n' +
    `${frontController}\n`
  );
}

for (const env of targets) {
  const outDir = `dist/overlay/${env}`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (env === 'prod') {
    writeFileSync(`${outDir}/.htaccess`, `${frontController}\n`);
    // Prod's public robots.txt is part of the site content (app/), if one
    // exists yet. No app/robots.txt -> prod simply serves none (fully crawlable).
    if (existsSync('app/robots.txt')) {
      cpSync('app/robots.txt', `${outDir}/robots.txt`);
    }
  } else {
    writeFileSync(`${outDir}/.htaccess`, mergedHtaccess(env));
    cpSync(`staging/${env}/robots.txt`, `${outDir}/robots.txt`);
    const htpasswd = `staging/${env}/.htpasswd`;
    if (existsSync(htpasswd)) {
      cpSync(htpasswd, `${outDir}/.htpasswd`);
    }
  }

  const files = readdirSync(outDir).sort().join(', ');
  console.log(`Built dist/overlay/${env}/ (${files})`);
}

console.log('\nUpload each env overlay to its server once (config.php is set by hand, separately).');
