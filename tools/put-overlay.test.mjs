// tools/put-overlay.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseArgs,
  hasUnsubstitutedAuthPath,
  hasPostCutoverRules,
  planOverlay,
  backupFilePath,
  putOverlay,
} from './put-overlay.mjs';

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

// Pins the guard to the real tracked template, not just inline fixtures: if
// someone ever unquotes the AuthUserFile directive in staging/test/.htaccess,
// build-overlays.mjs silently stops substituting it AND this guard silently
// stops catching it — with every test above still green, since none of them
// reads the actual file.
test('hasUnsubstitutedAuthPath: matches the real tracked staging/test/.htaccess template', () => {
  const text = readFileSync('staging/test/.htaccess', 'utf8');
  assert.equal(hasUnsubstitutedAuthPath(text), true);
});

test('hasPostCutoverRules: a real post-cutover overlay (dispatch + SPA fallback) passes', () => {
  const text =
    'RewriteRule ^api(/|$) api-laravel/public/index.php [L]\n' +
    'RewriteRule ^sanctum(/|$) api-laravel/public/index.php [L]\n' +
    'RewriteRule ^ index.html [L]\n';
  assert.equal(hasPostCutoverRules(text), true);
});

// The old front-controller shape still contains the substring "index.php"
// (via the legacy .php redirect target), so checking for that alone would
// wrongly pass a stale, pre-cutover overlay — the exact outage this guard
// exists to prevent.
test('hasPostCutoverRules: an old front-controller-only overlay (no SPA fallback) fails', () => {
  const text = 'RedirectMatch 301 ^/(?:index\\.php|accueil\\.(?:php|html))$ /\n';
  assert.equal(hasPostCutoverRules(text), false);
});

test('hasPostCutoverRules: the API dispatch alone, without the SPA fallback, still fails', () => {
  const text = 'RewriteRule ^api(/|$) api-laravel/public/index.php [L]\n';
  assert.equal(hasPostCutoverRules(text), false);
});

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

test('backupFilePath: lands outside dist/overlay/, timestamped and filesystem-safe', () => {
  const now = new Date('2026-08-31T12:34:56.789Z');
  assert.equal(
    backupFilePath('test', false, now),
    'dist/htaccess-backups/test-2026-08-31T12-34-56-789Z.htaccess'
  );
});

test('backupFilePath: different targets never collide', () => {
  const now = new Date('2026-08-31T12:34:56.789Z');
  assert.notEqual(backupFilePath('test', false, now), backupFilePath('qa', false, now));
});

// This is the exact bug flagged against the old fixed path: a --dry-run
// backup must never be able to overwrite a real cutover's backup.
test('backupFilePath: two runs a millisecond apart never collide', () => {
  const a = backupFilePath('test', false, new Date('2026-08-31T12:00:00.000Z'));
  const b = backupFilePath('test', false, new Date('2026-08-31T12:00:00.001Z'));
  assert.notEqual(a, b);
});

test('backupFilePath: a dry-run path lands in its own dry-run/ subdirectory', () => {
  const now = new Date('2026-08-31T12:34:56.789Z');
  assert.equal(
    backupFilePath('test', true, now),
    'dist/htaccess-backups/dry-run/test-2026-08-31T12-34-56-789Z.htaccess'
  );
});

// A dry-run backup that landed in the SAME namespace as real backups would,
// after a real cutover, download the NEW .htaccess and become the newest file
// there — so a rollback picking "the most recent backup" would restore the
// very file being rolled back from. The subdirectory is what prevents that.
test('backupFilePath: a dry-run path and a real path never collide, even for the same target and instant', () => {
  const now = new Date('2026-08-31T12:34:56.789Z');
  assert.notEqual(backupFilePath('test', false, now), backupFilePath('test', true, now));
});

// putOverlay's post-upload size check (see below) genuinely stats the local
// .htaccess, so any test exercising a real (non-dry-run) upload needs one on
// disk — same mkdtempSync-fixture pattern as tools/deploy/local.test.mjs, not
// a fake node:fs.
const HTACCESS_CONTENT = '# fixture .htaccess\n';
const HTACCESS_SIZE = Buffer.byteLength(HTACCESS_CONTENT);

function overlayFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-put-overlay-'));
  writeFileSync(path.join(dir, '.htaccess'), HTACCESS_CONTENT);
  return dir;
}

// A stub standing in for basic-ftp's Client: records calls, fails on demand.
// `remoteSize` backs the fake `size()` used by the post-upload verification
// and defaults to matching the fixture's real .htaccess size, so tests that
// aren't about the size check don't have to think about it.
function fakeClient({ failDownload = null, failUpload = null, remoteSize = HTACCESS_SIZE } = {}) {
  const calls = { downloads: [], uploads: [] };
  return {
    calls,
    async downloadTo(local, remote) {
      if (failDownload === 'notfound') {
        const err = new Error('550 No such file or directory.');
        err.code = 550;
        throw err;
      }
      if (failDownload === 'transport') {
        throw new Error('ECONNRESET: connection reset by peer');
      }
      calls.downloads.push({ local, remote });
    },
    async uploadFrom(local, remote) {
      if (failUpload && remote.endsWith(failUpload)) {
        throw new Error('553 Permission denied');
      }
      calls.uploads.push({ local, remote });
    },
    async size() {
      return remoteSize;
    },
  };
}

const noop = () => {};

test('putOverlay: backs up the live .htaccess before uploading anything', async () => {
  const localDir = overlayFixture();
  const client = fakeClient();
  const backupPath = 'dist/htaccess-backups/test-fixture.htaccess';
  await putOverlay({
    client,
    remoteRoot: '/public_html/staging/test.lescanetons.org',
    localDir,
    files: ['.htaccess', 'robots.txt'],
    backupPath,
    dryRun: false,
    log: noop,
  });
  assert.deepEqual(client.calls.downloads, [
    { local: backupPath, remote: '/public_html/staging/test.lescanetons.org/.htaccess' },
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

// A brand-new server has no live .htaccess yet — a real, documented
// first-time-per-server operation, not an error condition.
test('putOverlay: a missing live .htaccess (new environment) logs and proceeds', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ failDownload: 'notfound' });
  const logs = [];
  await putOverlay({
    client,
    remoteRoot: '/root',
    localDir,
    files: ['.htaccess'],
    backupPath: 'dist/htaccess-backups/new-env.htaccess',
    dryRun: false,
    log: (m) => logs.push(m),
  });
  assert.equal(client.calls.downloads.length, 0);
  assert.ok(logs.some((m) => /no live \.htaccess on the server/.test(m)));
  assert.equal(client.calls.uploads.length, 1);
});

// Any OTHER backup failure (auth, timeout, transport) is not the "new
// environment" case and must still refuse hard — and as a guard refusal, not
// a plain failure, it exits 2.
test('putOverlay: a genuine backup failure (not "no such file") refuses and uploads nothing', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ failDownload: 'transport' });
  await assert.rejects(
    putOverlay({
      client,
      remoteRoot: '/root',
      localDir,
      files: ['.htaccess'],
      backupPath: 'dist/htaccess-backups/test.htaccess',
      dryRun: false,
      log: noop,
    }),
    (err) => {
      assert.match(err.message, /could not back up the live \.htaccess/);
      assert.equal(err.exitCode, 2);
      return true;
    }
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
    backupPath: 'dist/htaccess-backups/dry-run/test-fixture.htaccess',
    dryRun: true,
    log: noop,
  });
  assert.equal(client.calls.downloads.length, 1);
  assert.equal(client.calls.uploads.length, 0);
});

// .htaccess goes LAST: robots.txt landing first is harmless, but .htaccess is
// what flips the routing. If a later upload fails, .htaccess itself has still
// either fully landed or never been touched, never half-written.
test('putOverlay: uploads .htaccess last so routing flips only once', async () => {
  const localDir = overlayFixture();
  const client = fakeClient();
  await putOverlay({
    client,
    remoteRoot: '/root',
    localDir,
    files: ['.htaccess', 'robots.txt'],
    backupPath: 'dist/htaccess-backups/test-order.htaccess',
    dryRun: false,
    log: noop,
  });
  assert.equal(client.calls.uploads.at(-1).remote, '/root/.htaccess');
});

test('putOverlay: verifies the uploaded .htaccess size matches the local file', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ remoteSize: HTACCESS_SIZE });
  const logs = [];
  await putOverlay({
    client,
    remoteRoot: '/root',
    localDir,
    files: ['.htaccess'],
    backupPath: 'dist/htaccess-backups/test-verify-ok.htaccess',
    dryRun: false,
    log: (m) => logs.push(m),
  });
  assert.ok(logs.some((m) => /verified \.htaccess/.test(m)));
});

// This host is known to truncate transfers (see tools/deploy/ftp.mjs's verify
// phase) — an unverified .htaccess is the one file that 500s the entire site.
test('putOverlay: throws on a truncated .htaccess upload (size mismatch) and names the backup', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ remoteSize: HTACCESS_SIZE - 1 });
  const backupPath = 'dist/htaccess-backups/test-truncated.htaccess';
  await assert.rejects(
    putOverlay({
      client,
      remoteRoot: '/root',
      localDir,
      files: ['.htaccess'],
      backupPath,
      dryRun: false,
      log: noop,
    }),
    (err) => {
      assert.match(err.message, /size mismatch/);
      assert.ok(err.message.includes(backupPath));
      return true;
    }
  );
});

test('putOverlay: dry-run skips the size check entirely (nothing was uploaded to verify)', async () => {
  const client = fakeClient({ remoteSize: 999999 }); // would fail the check if it ran
  await putOverlay({
    client,
    remoteRoot: '/root',
    localDir: 'dist/overlay/test',
    files: ['.htaccess'],
    backupPath: 'dist/htaccess-backups/dry-run/test-size-skip.htaccess',
    dryRun: true,
    log: noop,
  });
  // No throw = the mismatched remoteSize was never consulted under dry-run.
});

test('putOverlay: a failed robots.txt upload rejects before .htaccess is ever attempted', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ failUpload: 'robots.txt' });
  await assert.rejects(
    putOverlay({
      client,
      remoteRoot: '/root',
      localDir,
      files: ['.htaccess', 'robots.txt'],
      backupPath: 'dist/htaccess-backups/test-fail-robots.htaccess',
      dryRun: false,
      log: noop,
    })
  );
  assert.equal(client.calls.uploads.some((u) => u.remote.endsWith('.htaccess')), false);
});

test('putOverlay: a failed .htaccess upload rejects after robots.txt already landed', async () => {
  const localDir = overlayFixture();
  const client = fakeClient({ failUpload: '.htaccess' });
  await assert.rejects(
    putOverlay({
      client,
      remoteRoot: '/root',
      localDir,
      files: ['.htaccess', 'robots.txt'],
      backupPath: 'dist/htaccess-backups/test-fail-htaccess.htaccess',
      dryRun: false,
      log: noop,
    })
  );
  assert.equal(client.calls.uploads.some((u) => u.remote.endsWith('robots.txt')), true);
});
