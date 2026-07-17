// Assembles public/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit public/; it's regenerated
// on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

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

console.log('Built public/ — ready to FTP upload.');
