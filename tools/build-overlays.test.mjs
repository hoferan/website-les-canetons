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

  assert.match(frontController, /^RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[L\]$/m);
  assert.match(frontController, /^RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[L\]$/m);

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
  const firstDispatch = frontController.match(/^RewriteRule .*api-laravel\/public\/index\.php.*$/m);
  assert.ok(authRule, 'the E=HTTP_AUTHORIZATION RewriteRule must be present');
  assert.ok(xsrfRule, 'the E=HTTP_X_XSRF_TOKEN RewriteRule must be present');
  assert.ok(firstDispatch, 'a dispatch RewriteRule into api-laravel/ must be present');
  assert.ok(
    authRule.index < firstDispatch.index,
    'the Authorization forwarding rule must precede the first dispatch rule'
  );
  assert.ok(
    xsrfRule.index < firstDispatch.index,
    'the X-XSRF-Token forwarding rule must precede the first dispatch rule'
  );
});

test('the dispatch rules precede the legacy-URL redirects and the SPA fallback', () => {
  // The fallback matches every path, so if it came first the dispatch would
  // never run at all.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const firstDispatch = frontController.match(/^RewriteRule .*api-laravel\/public\/index\.php.*$/m);
  const legacyRedirect = frontController.match(/^RedirectMatch 301 .*$/m);
  const fallback = frontController.match(/^RewriteRule \^ index\.html \[L\]$/m);
  assert.ok(firstDispatch, 'a dispatch RewriteRule into api-laravel/ must be present');
  assert.ok(legacyRedirect, 'the legacy-URL RedirectMatch rules must be present');
  assert.ok(fallback, 'the SPA fallback to index.html must be present');
  assert.ok(firstDispatch.index < legacyRedirect.index, 'dispatch must precede RedirectMatch 301');
  assert.ok(firstDispatch.index < fallback.index, 'dispatch must precede the fallback');
});

test('the .php legacy redirect excludes api-laravel/, or the whole API 301s', () => {
  // Regression test for a bug caught by hand during the cutover. The dispatch
  // rewrites /api/* to api-laravel/public/index.php; in per-directory context
  // that substitution re-enters the ruleset, where mod_alias sees a URL ending
  // in .php. Without the exclusion every /api/* and /sanctum/* request 301s to
  // /api-laravel/public/index and Laravel is never reached — the entire API is
  // down, while every page of the site still looks fine.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const phpRedirect = frontController.match(/^RedirectMatch 301 (\S*\(\.\*\)\\\.php\$) .*$/m);
  assert.ok(phpRedirect, 'a .php -> clean-URL RedirectMatch must be present');

  // Assert BEHAVIOUR, not the presence of a substring. The previous version of
  // this test asserted the pattern contained the literal `(?!api-laravel/`,
  // which passed while the rule was still broken on the real host — see below.
  // Compile the actual pattern and run paths through it.
  const pattern = new RegExp(phpRedirect[1]);

  // A genuine client request for a legacy .php URL must still be redirected.
  assert.ok(pattern.test('/contact.php'), 'a legacy .php URL must still 301 to its clean form');

  // The dispatch target must be excluded, or the whole API 301s.
  assert.ok(
    !pattern.test('/api-laravel/public/index.php'),
    'the dispatch target must not match the .php redirect'
  );

  // THE CASE THAT ACTUALLY TOOK TEST DOWN on 2026-08-31, minutes after the
  // cutover. easy-hebergement runs PHP through a FastCGI wrapper, so the URL
  // mod_alias sees on the re-entered pass carries a /cgi-bin/php5.fcgi/ prefix.
  // A start-anchored `(?!api-laravel/)` tests the characters right after the
  // leading slash — `cgi-bin/` — so the exclusion never fired and every
  // /api/* and /sanctum/* request 301'd to
  // /cgi-bin/php5.fcgi/api-laravel/public/index. The API was entirely down
  // while every public page rendered perfectly.
  //
  // Not reproducible locally: the Docker stack serves PHP without that wrapper
  // path, so `npm run smoke` passed 13/13 against the broken build. This
  // assertion is the only thing standing between that bug and production.
  assert.ok(
    !pattern.test('/cgi-bin/php5.fcgi/api-laravel/public/index.php'),
    'the exclusion must match api-laravel/ ANYWHERE in the path, not just at the start — ' +
      'the host prefixes the rewritten path with its FastCGI wrapper'
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

test('the .html legacy redirect excludes index.html, or every page redirect-loops', () => {
  // The fallback rewrites unmatched paths to index.html, and that internal
  // redirect re-enters the ruleset. A rule that 301'd /index.html to / would
  // rewrite to index.html again and loop, on every URL of the site.
  const frontController = readFileSync('config/htaccess/site.htaccess', 'utf8');

  const htmlRedirect = frontController.match(/^RedirectMatch 301 (\S*\(\.\*\)\\\.html\$) .*$/m);
  assert.ok(htmlRedirect, 'a .html -> clean-URL RedirectMatch must be present');
  assert.match(
    htmlRedirect[1],
    /\(\?!index\\\.html\$\)/,
    'the .html RedirectMatch must exclude index.html with a negative lookahead'
  );
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
