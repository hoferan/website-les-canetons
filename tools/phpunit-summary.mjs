// Reads a PHPUnit JUnit XML report and writes a markdown summary to stdout
// (redirected to $GITHUB_STEP_SUMMARY in CI). No XML parser dependency --
// PHPUnit's JUnit output is simple enough to read with targeted regexes.
// Usage: node tools/phpunit-summary.mjs <junit.xml>
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node tools/phpunit-summary.mjs <junit.xml>');
  process.exit(1);
}

const xml = readFileSync(path, 'utf8');

function attrs(tag) {
  const out = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

const allSuiteTags = [...xml.matchAll(/<testsuite\b[^>]*>/g)].map((m) => attrs(m[0]));
const root = allSuiteTags[0];
if (!root) {
  console.log('## PHPUnit results\n\nCould not parse the JUnit report.');
  process.exit(0);
}

const failed = Number(root.errors) + Number(root.failures);
const icon = failed === 0 ? '✅' : '❌';

console.log(`## ${icon} PHPUnit results\n`);
console.log(`| Tests | Assertions | Failures | Errors | Skipped | Time |`);
console.log(`|---|---|---|---|---|---|`);
console.log(
  `| ${root.tests} | ${root.assertions} | ${root.failures} | ${root.errors} | ${root.skipped} | ${Number(root.time).toFixed(2)}s |`
);

// Second-level suites are the configured testsuites (unit, integration, ...).
const namedSuites = allSuiteTags.filter((a) => a !== root && !a.file);
if (namedSuites.length) {
  console.log(`\n| Suite | Tests | Failures | Errors |`);
  console.log(`|---|---|---|---|`);
  for (const s of namedSuites) {
    console.log(`| ${s.name} | ${s.tests} | ${s.failures} | ${s.errors} |`);
  }
}

// List individual failing/erroring tests, if any.
const brokenRe = /<testcase\b([^>]*)>\s*<(failure|error)\b[^>]*>([\s\S]*?)<\/\2>/g;
const broken = [...xml.matchAll(brokenRe)];
if (broken.length) {
  console.log(`\n### Failed tests\n`);
  for (const [, testcaseAttrs, kind, message] of broken) {
    const { classname, name } = attrs(`<testcase ${testcaseAttrs}>`);
    // PHPUnit's failure/error text starts with a "Class::method" line
    // duplicating the testcase name, then the actual message -- skip that
    // first line when it's just the redundant identifier.
    const lines = message.trim().split('\n').filter(Boolean);
    const summary = lines[0] === `${classname}::${name}` ? lines[1] : lines[0];
    console.log(`- **${kind === 'failure' ? '❌' : '💥'} ${classname}::${name}** — ${summary ?? ''}`);
  }
}
