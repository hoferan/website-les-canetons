import assert from 'node:assert/strict';
import test from 'node:test';

import { findVcsStamps } from './artifact-vendor.mjs';

// The shape Composer writes, trimmed to the two entries that matter: the root
// package (which it describes twice — once under 'root', once under its own
// name in 'versions') and one dependency, whose reference is a legitimate
// 40-hex commit read out of composer.lock.
const installedPhp = (root) => `<?php return array(
    'root' => array(
        'name' => 'laravel/laravel',
        'pretty_version' => '${root.pretty}',
        'version' => '${root.version}',
        'reference' => ${root.reference},
        'type' => 'project',
        'install_path' => __DIR__ . '/../../',
        'aliases' => array(),
        'dev' => false,
    ),
    'versions' => array(
        'brick/math' => array(
            'pretty_version' => '0.18.0',
            'version' => '0.18.0.0',
            'reference' => '82944324d1c1bdb2c2618e89978d4e2ad78d69ad',
            'type' => 'library',
            'install_path' => __DIR__ . '/../brick/math',
            'aliases' => array(),
            'dev_requirement' => false,
        ),
        'laravel/laravel' => array(
            'pretty_version' => '${root.pretty}',
            'version' => '${root.version}',
            'reference' => ${root.reference},
            'type' => 'project',
            'install_path' => __DIR__ . '/../../',
            'aliases' => array(),
            'dev' => false,
        ),
    ),
);
`;

// What a build inside a git checkout produces: the checkout's own HEAD.
const STAMPED = installedPhp({
  pretty: 'dev-main',
  version: 'dev-main',
  reference: "'c37499d8b40aa0492cb4ed491968836aae70de2e'",
});

// What a build with no VCS identity produces. '1.0.0+no-version-set' is
// Composer's own fallback when it cannot guess a root version, verified by
// installing the same lock outside a git checkout.
const CLEAN = installedPhp({
  pretty: '1.0.0+no-version-set',
  version: '1.0.0.0',
  reference: 'null',
});

test('the build checkout’s commit in the root reference is reported', () => {
  const stamps = findVcsStamps(STAMPED);

  assert.equal(stamps.length > 0, true, 'a root reference of a commit SHA must be reported');
  assert.match(stamps.join('\n'), /c37499d8b40aa0492cb4ed491968836aae70de2e/);
});

test('a VCS-derived root version is reported', () => {
  const stamps = findVcsStamps(
    installedPhp({ pretty: 'dev-main', version: 'dev-main', reference: 'null' })
  );

  assert.equal(stamps.length > 0, true, 'dev-<branch> names the branch the build ran on');
  assert.match(stamps.join('\n'), /dev-main/);
});

test('a versionless export is reported clean', () => {
  assert.deepEqual(findVcsStamps(CLEAN), []);
});

test('a dependency’s reference is not mistaken for a build stamp', () => {
  // Every dependency carries a 40-hex reference read out of composer.lock.
  // Those are identical on every machine and are the point of the file; a
  // guard that banned commit SHAs outright would report all 79 of them.
  assert.equal(CLEAN.includes('82944324d1c1bdb2c2618e89978d4e2ad78d69ad'), true);
  assert.deepEqual(findVcsStamps(CLEAN), []);
});

test('the root package is checked wherever Composer repeats it', () => {
  // Composer writes the root twice. A guard that read only the first block
  // would pass a file that still names the branch further down.
  const halfClean = STAMPED.replace(
    /'root' => array\(\n        'name' => 'laravel\/laravel',\n        'pretty_version' => 'dev-main',\n        'version' => 'dev-main',\n        'reference' => '[0-9a-f]{40}'/,
    "'root' => array(\n        'name' => 'laravel/laravel',\n        'pretty_version' => '1.0.0+no-version-set',\n        'version' => '1.0.0.0',\n        'reference' => null"
  );

  assert.equal(halfClean.includes("'pretty_version' => 'dev-main'"), true, 'fixture must still be dirty');
  assert.equal(findVcsStamps(halfClean).length > 0, true);
});

test('a file with no root package is reported rather than passed', () => {
  // A guard that returns "clean" for something it could not parse guards
  // nothing. If Composer ever changes this file's shape, that must be loud.
  assert.equal(findVcsStamps('<?php return array();').length > 0, true);
});
