// Fails if secrets or production data are tracked by git.
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const offenders = tracked.filter(
  (f) =>
    /(^|\/)config\.php$/.test(f) ||
    /(^|\/)\.env$/.test(f) ||
    /\.dump\.sql$/.test(f) ||
    /(^|\/)prod-.*\.sql$/.test(f)
);

if (offenders.length > 0) {
  console.error('Secret guard FAILED — these must never be committed:');
  for (const f of offenders) console.error('  ' + f);
  process.exit(1);
}
console.log('Secret guard: OK (no secrets or prod dumps tracked).');
