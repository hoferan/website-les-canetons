import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const run = (...args) =>
  execFileSync(process.execPath, ['tools/build-overlays.mjs', ...args], { encoding: 'utf8' });

test('the docker target is the plain front controller', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8').trimEnd();

  // The Laravel dispatch block lives in the template now, so there is nothing
  // left to merge: the local Docker document root gets exactly what prod gets.
  assert.equal(out, `${frontController}\n`);
});

test('the site .htaccess template dispatches /api and /sanctum into Laravel with [L], never the END flag', () => {
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  assert.match(frontController, /^RewriteRule \^api\(\/\|\$\) _api\/public\/index\.php \[L\]$/m);
  assert.match(frontController, /^RewriteRule \^sanctum\(\/\|\$\) _api\/public\/index\.php \[L\]$/m);

  // The END flag is Apache 2.3.9+; an unknown RewriteRule flag is a syntax
  // error, so on a 2.2 host it would 500 EVERY request to the whole site.
  // Check directive LINES, not prose — the comment above those two rules
  // deliberately explains why that flag is not used here.
  const directives = frontController.split('\n').filter((line) => !line.trimStart().startsWith('#'));
  assert.ok(
    !directives.some((line) => line.includes('[END]')),
    'no directive may use the Apache 2.4-only [END] flag'
  );
});

test('the header-forwarding rules precede the dispatch rules in the template', () => {
  // If a reorder ever put the dispatch first, [L] would end the pass before
  // Authorization was forwarded and every token-authenticated request would
  // silently look anonymous. Match actual directive LINES, not prose — the
  // explanatory comments mention these same names.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const authRule = frontController.match(/^RewriteRule .*E=HTTP_AUTHORIZATION.*$/m);
  const xsrfRule = frontController.match(/^RewriteRule .*E=HTTP_X_XSRF_TOKEN.*$/m);
  const firstDispatch = frontController.match(/^RewriteRule .*_api\/public\/index\.php.*$/m);
  assert.ok(authRule, 'the E=HTTP_AUTHORIZATION RewriteRule must be present');
  assert.ok(xsrfRule, 'the E=HTTP_X_XSRF_TOKEN RewriteRule must be present');
  assert.ok(firstDispatch, 'a dispatch RewriteRule into _api/ must be present');
  assert.ok(
    authRule.index < firstDispatch.index,
    'the Authorization forwarding rule must precede the first dispatch rule'
  );
  assert.ok(
    xsrfRule.index < firstDispatch.index,
    'the X-XSRF-Token forwarding rule must precede the first dispatch rule'
  );
});

test('the dispatch rules precede the SPA fallback', () => {
  // The fallback matches every path, so if it came first the dispatch would
  // never run at all.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const firstDispatch = frontController.match(/^RewriteRule .*_api\/public\/index\.php.*$/m);
  const fallback = frontController.match(/^RewriteRule \^ index\.html \[L\]$/m);
  assert.ok(firstDispatch, 'a dispatch RewriteRule into _api/ must be present');
  assert.ok(fallback, 'the SPA fallback to index.html must be present');
  assert.ok(firstDispatch.index < fallback.index, 'dispatch must precede the fallback');
});

test('the site rules carry no legacy RedirectMatch', () => {
  // Deleted 2026-09-07 with their targets: every URL is English now and the
  // rebuild owes no backwards compatibility (ADR 0003). They carried both
  // of the template's negative-lookahead landmines, so a re-added rule needs
  // its own assertions — see the note left in site.htaccess.
  const template = readFileSync('config/htaccess/site.htaccess', 'utf8');

  assert.ok(
    !/^\s*RedirectMatch/m.test(template),
    'a RedirectMatch was re-added without the fcgi-prefix assertions that made the old ones safe',
  );
});

test('content-hashed assets are cached immutably, and that includes the fonts', () => {
  // Fonts were missing from this block until 2026-08-31 and so came back from
  // the server with NO Cache-Control at all — they match neither the css/js
  // block nor the image block. Vite content-hashes them exactly like the JS and
  // CSS, so they are equally safe to freeze.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const immutable = frontController.match(/<FilesMatch "([^"]+)">\s*\n\s*Header set Cache-Control "public, max-age=31536000, immutable"/);
  assert.ok(immutable, 'an immutable Cache-Control FilesMatch must be present');

  // Compile the real pattern and run actual built filenames through it, rather
  // than asserting on its spelling — the same lesson as the .php redirect test.
  const pattern = new RegExp(immutable[1]);
  // Representative Vite output names. The hashes are deliberately synthetic:
  // real ones change whenever a font or bundle changes, and this test is about
  // the extensions the rule covers, not about any particular build.
  for (const name of [
    'index-A1b2C3d4.js',
    'index-A1b2C3d4.css',
    'bungee-latin-400-normal-A1b2C3d4.woff2',
    'bungee-latin-ext-400-normal-A1b2C3d4.woff',
    'karla-latin-wght-normal-A1b2C3d4.woff2',
  ]) {
    assert.ok(pattern.test(name), `${name} must be cached immutably (it is content-hashed)`);
  }

  // The shell must NOT be frozen — it is the one file that must be re-fetched
  // for a deploy to be picked up at all.
  assert.ok(!pattern.test('index.html'), 'index.html must never be immutable');
});

test('woff2 has an explicit MIME type, or this host serves it as text/plain', () => {
  // Observed on TEST: no woff2 mapping on the host, so fonts came back as
  // text/plain. Browsers sniff font data, which is why it went unnoticed.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  assert.match(frontController, /^\s*AddType font\/woff2 \.woff2$/m, 'woff2 needs an AddType');
  assert.match(frontController, /^\s*AddType font\/woff \.woff$/m, 'woff needs an AddType');
  // The x-font-* forms are deprecated; RFC 8081 registered font/*.
  assert.doesNotMatch(frontController, /AddType\s+application\/x-font/, 'use the RFC 8081 font/* types');
});

test('docker is not part of the default (server) run', () => {
  // This invokes the real CLI with no args, so it also rebuilds the actual
  // dist/overlay/{test,qa,prod} server overlays as a side effect (reading
  // .env.test/.env.qa and copying git-ignored staging/*/.htpasswd files if
  // present). dist/ is git-ignored, so this is harmless, just worth knowing.
  const stdout = run();
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});

test('docker is not part of an `all` run either', () => {
  const stdout = run('all');
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});

test('the docker run does not print the server upload hint', () => {
  const stdout = run('docker');
  assert.doesNotMatch(stdout, /Upload each env overlay/);
});

/** The RewriteCond lines bound to the SPA fallback, nearest first. */
const fallbackGuards = () => {
  const lines = readFileSync('config/htaccess/site.htaccess', 'utf8').split(/\r?\n/);
  const fallback = lines.findIndex((line) => /^RewriteRule \^ index\.html \[L\]/.test(line));
  assert.notEqual(fallback, -1, 'the SPA fallback rule is gone');

  // A RewriteCond applies only to the rule that follows it, so only the
  // unbroken run of conditions IMMEDIATELY above counts: a blank line or
  // another rule in between silently detaches them.
  const guards = [];
  for (let i = fallback - 1; i >= 0 && lines[i].startsWith('RewriteCond '); i--) guards.push(lines[i]);
  return guards;
};

test('the SPA fallback keeps its guards', () => {
  // The REDIRECT_STATUS guard is what stops the fallback re-matching its own
  // output and looping until Apache gives up with "Request exceeded the limit
  // of 10 internal redirects" — on EVERY url of the site, not one page. The
  // !^/assets/ guard is what lets the hashed bundles be served as files.
  //
  // Neither had a test until 2026-09-07. That gap came to light while this
  // file's other assertions were being deleted.
  const guards = fallbackGuards();

  assert.match(guards[0], /^RewriteCond %\{ENV:REDIRECT_STATUS\} \^\$/);
  assert.ok(
    guards.some((line) => /^RewriteCond %\{REQUEST_URI\} !\^\/assets\//.test(line)),
    'the !^/assets/ guard is gone or detached'
  );
});

test('the SPA fallback lets /robots.txt through, and nothing else by that name', () => {
  // Without the exclusion the catch-all answers /robots.txt with the shell, and
  // no crawler reads a server's own robots.txt (issue #113). It must stay an exact
  // path: anything looser re-opens the fallback to files that must not be
  // served, which is the reason it is a catch-all at all.
  //
  // Compile the real condition and run paths through it, rather than assert
  // on its spelling.
  const robots = fallbackGuards()
    .map((line) => line.match(/^RewriteCond %\{REQUEST_URI\} !(\S+)$/)?.[1])
    .filter(Boolean)
    .map((pattern) => new RegExp(pattern))
    .filter((pattern) => pattern.test('/robots.txt'));
  assert.equal(robots.length, 1, 'no fallback guard excludes /robots.txt');

  for (const path of ['/robots.txt.bak', '/robotsXtxt', '/de/robots.txt', '/robots.txt/x', '/config.php']) {
    assert.ok(!robots[0].test(path), `${path} must still get the SPA shell`);
  }
});

test('the canonical-host redirect fires only on the browser pass, and only for www.', () => {
  // A mod_rewrite rule, deliberately: mod_alias sees internal paths on the
  // re-entered pass, including this host's /cgi-bin/php5.fcgi/ prefix, which
  // is what made the three legacy 301s dangerous.
  //
  // Mutation-tested: drop either RewriteCond and this fails.
  const template = readFileSync('config/htaccess/site.htaccess', 'utf8');
  const lines = template.split(/\r?\n/);

  const rule = lines.findIndex((line) => /^RewriteRule \^\(\.\*\)\$ https:\/\/%1\/\$1 \[R=301,L\]/.test(line));
  assert.notEqual(rule, -1, 'the canonical-host redirect is gone');

  // Both conditions must be the two lines IMMEDIATELY above: a RewriteCond
  // binds only to the rule that follows it.
  assert.match(lines[rule - 1], /^RewriteCond %\{HTTP_HOST\} \^www\\.\(\.\+\)\$ \[NC\]/);
  assert.match(lines[rule - 2], /^RewriteCond %\{ENV:REDIRECT_STATUS\} \^\$/);

  // The host condition must come SECOND. %1 is the last matching condition's
  // capture, and the REDIRECT_STATUS guard captures nothing — swap them and
  // the redirect targets https:///$1.
  assert.ok(
    lines[rule - 1].includes('HTTP_HOST'),
    'the host condition must be the one immediately above the rule, or %1 is not the host'
  );

  // It must run before the dispatch, so /api/* on a www. host is redirected
  // rather than answered.
  const dispatch = lines.findIndex((line) => /^RewriteRule \^api\(\/\|\$\)/.test(line));
  assert.ok(rule < dispatch, 'the canonical redirect must precede the API dispatch');

  // [END] does not exist on Apache 2.2 and an unknown flag is a syntax error,
  // which is a 500 on every request to the whole site.
  assert.ok(!/\[R=301,END\]/.test(template), 'never the END flag');
});
