import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import {
  includeInLaravelBuild,
  isRuntimeWritableContent,
  LARAVEL_BUILD_EXCLUDES,
  RUNTIME_WRITABLE_DIRS,
  travelsInArtifact,
} from './artifact-excludes.mjs';

const API_ROOT = path.resolve('api');
const ships = (rel) => includeInLaravelBuild(path.join(API_ROOT, rel), API_ROOT);

// ---------------------------------------------------------------- issue #109

test('a developer’s Laravel log never travels in the artifact', () => {
  // The whole of #109. A deploy from a developer machine uploaded this file,
  // and the next deploy from anywhere else deleted the server's real one.
  assert.equal(ships('storage/logs/laravel.log'), false);
});

test('the runtime-writable directories keep their .gitignore and lose everything else', () => {
  for (const dir of RUNTIME_WRITABLE_DIRS) {
    assert.equal(
      ships(`${dir}/.gitignore`),
      true,
      `${dir}/.gitignore must ship: it is the only thing that creates ${dir} on a server, ` +
        'because the deploy CLI prunes directories left empty.'
    );
    assert.equal(ships(`${dir}/anything-else`), false, `${dir}/ contents must not ship`);
  }
});

test('compiled views are dropped however deep they sit', () => {
  assert.equal(ships('storage/framework/views/0393e34355e9e3498f7c633b7be74ac3.php'), false);
  // A parallel-test worker writes into a subdirectory. A rule that only looked
  // one level down would ship these.
  assert.equal(ships('storage/framework/views/test_4/0393e34355e9e3498f7c633b7be74ac3.php'), false);
});

test('a same-named file that is not at the project root still ships', () => {
  // The root-relative rule exists so these survive. A basename match would
  // strip all three.
  assert.equal(ships('app/Support/README.md'), true);
  assert.equal(ships('resources/tests/fixture.json'), true);
  assert.equal(ships('database/migrations/2026_09_05_000002_create_sections_table.php'), true);
});

test('the excluded project-root entries are excluded', () => {
  for (const entry of LARAVEL_BUILD_EXCLUDES) {
    assert.equal(ships(entry), false, `${entry} must not ship`);
  }
});

test('.env.example ships and .env does not', () => {
  // Shipping the template next to the real file is the point; see staging/README.md.
  assert.equal(ships('.env.example'), true);
  assert.equal(ships('.env'), false);
});

test('isRuntimeWritableContent does not match a directory that merely starts the same', () => {
  assert.equal(isRuntimeWritableContent('storage/logs-archive/old.log'), false);
  assert.equal(isRuntimeWritableContent('storage/logs/old.log'), true);
});

// --------------------------------------------------------- the general guard
//
// The specific assertions above are the bugs already known. This one is the
// class: ANY file present under api/ but not tracked by git belongs to whoever
// ran something locally, and none of it may reach a server.
//
// That invariant holds exactly, because the artifact's vendor/ is reinstalled
// by build.mjs with --no-dev after the copy rather than carried through it. So
// there is no untracked file under api/ that the copy legitimately wants.
//
// This is the test that would have caught #109 without anyone thinking of
// laravel.log first, and it is the one that catches whatever the next tool
// writes there.

test('no untracked file under api/ can reach the artifact', (t) => {
  // --others lists untracked files; WITHOUT --exclude-standard it includes
  // gitignored ones too, which is the whole point — laravel.log is gitignored.
  // travelsInArtifact, not the raw filter: cpSync never descends into a rejected
  // directory, so asking the filter about vendor/autoload.php on its own answers
  // "copy it" and this guard would report 24 000 false positives.
  const untracked = execFileSync('git', ['ls-files', '--others', '--', 'api'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/^api\//, ''));

  // A CLEAN CHECKOUT HAS NONE, and that is the normal case in CI: the `assets`
  // job runs this suite after `npm ci` only, so api/vendor/ does not exist and
  // nothing has written a log. There is then nothing for this guard to find,
  // which is a pass and not a failure — an empty assertion here would turn CI
  // red for the one reason that means the machine is tidy. The named
  // assertions above still run everywhere; this one adds its value on a
  // developer's machine, which is the only place the bug it guards can occur.
  if (untracked.length === 0) {
    t.skip('clean checkout: nothing untracked under api/ to test against');

    return;
  }

  const leaking = untracked.filter((rel) => travelsInArtifact(rel));

  assert.deepEqual(
    leaking.slice(0, 20),
    [],
    `${leaking.length} untracked file(s) under api/ would be copied into dist/build/_api/. ` +
      'Everything untracked belongs to the local machine; add it to LARAVEL_BUILD_EXCLUDES ' +
      'or RUNTIME_WRITABLE_DIRS in tools/artifact-excludes.mjs.'
  );
});

test('travelsInArtifact accounts for cpSync skipping a rejected directory whole', () => {
  // The filter, asked in isolation, says yes to this. The artifact never sees
  // it, because `vendor` itself was rejected and cpSync did not descend.
  assert.equal(ships('vendor/autoload.php'), true);
  assert.equal(travelsInArtifact('vendor/autoload.php'), false);

  assert.equal(travelsInArtifact('database/seeders/DevSeeder.php'), false);
  assert.equal(travelsInArtifact('app/Support/Capability.php'), true);
});
