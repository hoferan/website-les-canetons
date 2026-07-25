// Generates the overlay files that sit on top of the shared code artifact —
// mostly the per-environment server files (test / qa / prod) that differ per
// server and therefore must NOT travel with the promoted code artifact
// (public/), plus one local-only target (docker). Output goes to
// dist/overlay/<env>/; server overlays are ready to upload once per server
// (and again only when app/.htaccess or the auth block changes).
//
//   test / qa : .htaccess = staging auth block + the current app/.htaccess
//               front controller (auto-merged), staging robots.txt (noindex),
//               and .htpasswd if one exists locally.
//   prod      : plain app/.htaccess + the real app/robots.txt (no auth).
//   docker    : .htaccess = Laravel API dispatch block + app/.htaccess; a
//               local build artifact (feeds the local Docker document root),
//               not a server overlay — never uploaded anywhere.
//
// config.php is deliberately NOT emitted — it is server-owned and set by hand.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { loadDotEnv } from './dotenv.mjs';

// HTPASSWD_PATH is a uniform key across the per-env files (.env.test / .env.qa),
// so it is loaded per-env inside mergedHtaccess() below — this tool processes
// several envs in one run, and loadDotEnv is first-wins, so a top-level load
// would let the first env's value stick for the others.

const ENVS = ['test', 'qa', 'prod'];
// `docker` is not a server. It generates the local Docker document root's
// .htaccess (Laravel API dispatch block + app/.htaccess) into
// dist/overlay/docker/, which docker-compose.yml bind-mounts. It lives here
// rather than in a tool of its own because it is the very same
// merge-a-block-onto-app/.htaccess operation the staging auth overlay performs,
// and because sub-project 2a-ii will promote that block into app/.htaccess —
// at which point this target simply stops being needed.
//
// It is never part of a default or `all` run: those emit server overlays you
// upload, and this one is a local build artifact. Ask for it by name.
const LOCAL = ['docker'];
const ALL = [...ENVS, ...LOCAL];

const requested = process.argv.slice(2).filter((a) => a !== 'all');
const targets = requested.length ? requested : ENVS;

const unknown = targets.filter((e) => !ALL.includes(e));
if (unknown.length) {
  console.error(
    `Unknown environment(s): ${unknown.join(', ')}. ` +
      `Use: ${ENVS.join(' | ')} | all (servers), or ${LOCAL.join(' | ')} (local Docker document root)`
  );
  process.exit(1);
}

const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

/** Appends the built front controller, with its generated-from banner, after `block`. */
function withFrontController(block) {
  return (
    `${block.trimEnd()}\n\n` +
    '# ---------------------------------------------------------------------------\n' +
    '# Front controller + cache policy (generated from app/.htaccess by\n' +
    '# tools/build-overlays.mjs — do not edit here; edit app/.htaccess)\n' +
    '# ---------------------------------------------------------------------------\n' +
    `${frontController}\n`
  );
}

/** test/qa .htaccess: auth overlay first, then the built front controller. */
function mergedHtaccess(env) {
  let auth = readFileSync(`staging/${env}/.htaccess`, 'utf8').trimEnd();
  if (auth.includes('__HTPASSWD_PATH__')) {
    // Read HTPASSWD_PATH fresh from THIS env's file. Delete first: loadDotEnv is
    // first-wins, so a value loaded for a previous env in the loop would stick.
    delete process.env.HTPASSWD_PATH;
    loadDotEnv(`.env.${env}`);
    loadDotEnv('.env');
    const real = process.env.HTPASSWD_PATH;
    if (real) {
      // Replace only the quoted directive value (AuthUserFile "__HTPASSWD_PATH__"),
      // leaving the bare token in the explanatory NOTE comment intact.
      auth = auth.split('"__HTPASSWD_PATH__"').join(`"${real}"`);
    } else {
      console.warn(
        `  ! HTPASSWD_PATH not set in .env.${env} — leaving __HTPASSWD_PATH__ ` +
          `placeholder in ${env}/.htaccess (set it there, or fill the path on the server).`
      );
    }
  }
  return withFrontController(auth);
}

/** docker .htaccess: Laravel API dispatch block first, then the front controller. */
function dockerHtaccess() {
  return withFrontController(readFileSync('docker/web/api-dispatch.htaccess', 'utf8'));
}

for (const env of targets) {
  const outDir = `dist/overlay/${env}`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (LOCAL.includes(env)) {
    writeFileSync(`${outDir}/.htaccess`, dockerHtaccess());
  } else if (env === 'prod') {
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

if (targets.some((env) => ENVS.includes(env))) {
  console.log('\nUpload each env overlay to its server once (config.php is set by hand, separately).');
}
