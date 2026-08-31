// tools/put-overlay.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from './put-overlay.mjs';

test('parseArgs: accepts a valid target with no flags', () => {
  assert.deepEqual(parseArgs(['test']), { target: 'test', dryRun: false });
});

test('parseArgs: accepts --dry-run', () => {
  assert.deepEqual(parseArgs(['qa', '--dry-run']), { target: 'qa', dryRun: true });
});

test('parseArgs: refuses a missing target', () => {
  assert.match(parseArgs([]).error, /Usage: npm run put-overlay:/);
});

test('parseArgs: refuses an unknown target', () => {
  assert.match(parseArgs(['docker']).error, /Usage: npm run put-overlay:/);
});

test('parseArgs: refuses an unknown flag', () => {
  assert.match(parseArgs(['test', '--force']).error, /Unknown flag: --force/);
});

test('parseArgs: refuses a second positional', () => {
  assert.match(parseArgs(['test', 'qa']).error, /Unexpected argument: qa/);
});

import { hasUnsubstitutedAuthPath } from './put-overlay.mjs';

test('hasUnsubstitutedAuthPath: catches the unsubstituted directive', () => {
  const text = 'AuthType Basic\nAuthUserFile "__HTPASSWD_PATH__"\nRequire valid-user\n';
  assert.equal(hasUnsubstitutedAuthPath(text), true);
});

test('hasUnsubstitutedAuthPath: a substituted directive is fine', () => {
  const text = 'AuthUserFile "/home/site/.htpasswd"\nRequire valid-user\n';
  assert.equal(hasUnsubstitutedAuthPath(text), false);
});

// build-overlays.mjs substitutes ONLY the quoted directive value and leaves the
// bare token in its NOTE comment. A bare-token check would refuse every
// correctly built test/qa overlay — the exact bug this test locks out.
test('hasUnsubstitutedAuthPath: the bare token in a comment is NOT a refusal', () => {
  const text =
    '# NOTE: the real path is injected from HTPASSWD_PATH, replacing the\n' +
    '#       __HTPASSWD_PATH__ token below.\n' +
    'AuthUserFile "/home/site/.htpasswd"\n';
  assert.equal(hasUnsubstitutedAuthPath(text), false);
});

test('hasUnsubstitutedAuthPath: tolerates extra spacing around the directive', () => {
  assert.equal(hasUnsubstitutedAuthPath('  AuthUserFile   "__HTPASSWD_PATH__"'), true);
});

test('hasUnsubstitutedAuthPath: an overlay with no auth block is fine (prod)', () => {
  assert.equal(hasUnsubstitutedAuthPath('RewriteEngine on\nRewriteRule ^ index.html [L]\n'), false);
});

import { planOverlay } from './put-overlay.mjs';

// `exists` is injected so these stay pure — no temp directories needed.
const existsIn = (names) => (p) => names.includes(p);

test('planOverlay: .htaccess plus robots.txt when both exist', () => {
  const exists = existsIn(['dist/overlay/test/.htaccess', 'dist/overlay/test/robots.txt']);
  assert.deepEqual(planOverlay('dist/overlay/test', exists), {
    files: ['.htaccess', 'robots.txt'],
  });
});

test('planOverlay: robots.txt is optional (prod emits none)', () => {
  const exists = existsIn(['dist/overlay/prod/.htaccess']);
  assert.deepEqual(planOverlay('dist/overlay/prod', exists), { files: ['.htaccess'] });
});

// .htpasswd is credentials and stays hand-placed; its presence must not pull it
// into the upload set.
test('planOverlay: never includes .htpasswd', () => {
  const exists = existsIn([
    'dist/overlay/test/.htaccess',
    'dist/overlay/test/robots.txt',
    'dist/overlay/test/.htpasswd',
  ]);
  assert.deepEqual(planOverlay('dist/overlay/test', exists).files, ['.htaccess', 'robots.txt']);
});

test('planOverlay: a missing .htaccess is an error, not an empty upload', () => {
  const result = planOverlay('dist/overlay/test', existsIn([]));
  assert.equal(result.files, undefined);
  assert.match(result.error, /dist\/overlay\/test\/\.htaccess not found/);
  assert.match(result.error, /npm run build:overlay/);
});
