// Assembles public/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit public/; it's regenerated
// on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

rmSync('public', { recursive: true, force: true });
cpSync('app', 'public', { recursive: true });

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app',
    '-e',
    'COMPOSER_VENDOR_DIR=public/vendor',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

// The repo-root composer.json maps App\ -> app/src/ (correct for the dev
// tree, where composer.json sits next to app/). Inside the built public/,
// app/'s CONTENTS were copied flat (classes now live at public/src/, not
// public/app/src/), so the vendor/ installed above has the wrong autoload
// map for this tree. Regenerate it in place, scoped to public/'s own
// flattened layout, reusing the packages already installed — no network
// access, no package re-resolution, just a corrected class map.
writeFileSync('public/composer.json', JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }, null, 2));
execFileSync(
  'docker',
  ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app/public', 'composer:2', 'dump-autoload', '--optimize', '--no-interaction'],
  { stdio: 'inherit' }
);
rmSync('public/composer.json');

console.log('Built public/ — ready to FTP upload.');
