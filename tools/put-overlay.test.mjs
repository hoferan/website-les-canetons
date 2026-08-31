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

import { putOverlay } from './put-overlay.mjs';

// A stub standing in for basic-ftp's Client: records calls, fails on demand.
function fakeClient({ failDownload = false, failUpload = null } = {}) {
  const calls = { downloads: [], uploads: [] };
  return {
    calls,
    async downloadTo(local, remote) {
      if (failDownload) {
        throw new Error('550 No such file');
      }
      calls.downloads.push({ local, remote });
    },
    async uploadFrom(local, remote) {
      if (failUpload && remote.endsWith(failUpload)) {
        throw new Error('553 Permission denied');
      }
      calls.uploads.push({ local, remote });
    },
  };
}

const noop = () => {};

test('putOverlay: backs up the live .htaccess before uploading anything', async () => {
  const client = fakeClient();
  await putOverlay({
    client,
    remoteRoot: '/public_html/staging/test.lescanetons.org',
    localDir: 'dist/overlay/test',
    files: ['.htaccess', 'robots.txt'],
    backupPath: 'dist/overlay/test/.htaccess.backup',
    dryRun: false,
    log: noop,
  });
  assert.deepEqual(client.calls.downloads, [
    {
      local: 'dist/overlay/test/.htaccess.backup',
      remote: '/public_html/staging/test.lescanetons.org/.htaccess',
    },
  ]);
  // .htaccess LAST — see the ordering test below for why.
  assert.deepEqual(
    client.calls.uploads.map((u) => u.remote),
    [
      '/public_html/staging/test.lescanetons.org/robots.txt',
      '/public_html/staging/test.lescanetons.org/.htaccess',
    ]
  );
});

test('putOverlay: a failed backup refuses and uploads nothing', async () => {
  const client = fakeClient({ failDownload: true });
  await assert.rejects(
    putOverlay({
      client,
      remoteRoot: '/public_html/staging/test.lescanetons.org',
      localDir: 'dist/overlay/test',
      files: ['.htaccess'],
      backupPath: 'dist/overlay/test/.htaccess.backup',
      dryRun: false,
      log: noop,
    }),
    /could not back up the live \.htaccess/
  );
  assert.equal(client.calls.uploads.length, 0);
});

test('putOverlay: dry-run backs up but uploads nothing', async () => {
  const client = fakeClient();
  await putOverlay({
    client,
    remoteRoot: '/public_html/staging/test.lescanetons.org',
    localDir: 'dist/overlay/test',
    files: ['.htaccess', 'robots.txt'],
    backupPath: 'dist/overlay/test/.htaccess.backup',
    dryRun: true,
    log: noop,
  });
  assert.equal(client.calls.downloads.length, 1);
  assert.equal(client.calls.uploads.length, 0);
});

// .htaccess goes LAST: robots.txt landing first is harmless, but .htaccess is
// what flips the routing. If a later upload fails, the site has still turned
// over rather than being left mid-swap.
test('putOverlay: uploads .htaccess last so routing flips only once', async () => {
  const client = fakeClient();
  await putOverlay({
    client,
    remoteRoot: '/root',
    localDir: 'dist/overlay/test',
    files: ['.htaccess', 'robots.txt'],
    backupPath: 'b',
    dryRun: false,
    log: noop,
  });
  assert.equal(client.calls.uploads.at(-1).remote, '/root/.htaccess');
});
