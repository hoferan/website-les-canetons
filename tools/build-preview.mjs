// Builds the PR preview of the SPA into dist/preview/ (#353):
//
//   npm run build:preview -- <pr-number>
//
// The SPA against the mocked backend in web/src/mocks/, for GitHub Pages at
// https://hoferan.github.io/website-les-canetons/pr-<n>/. vite.config.ts's
// preview mode sets the base, the noindex tag and the deep-link restore.
// The design system's Storybook goes beside it, at pr-<n>/storybook/.
// .github/workflows/preview.yml publishes the result.
//
// Never the deploy artifact: that is `npm run build`, which tools/mock-leak.mjs
// checks carries none of this.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const OUT = 'dist/preview';

const pr = process.argv[2] ?? '';
if (!/^[1-9]\d*$/.test(pr)) {
  console.error(`Usage: npm run build:preview -- <pr-number>   (got "${pr}")`);
  process.exit(1);
}

// Vite's bin run with this Node, as tools/build.mjs does and for the same
// reason: `npx` is a .cmd shim on Windows that execFileSync cannot spawn.
const require = createRequire(import.meta.url);
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const storybookBin = path.join(
  path.dirname(require.resolve('storybook/package.json')),
  'dist',
  'bin',
  'dispatcher.js',
);

rmSync(OUT, { recursive: true, force: true });
execFileSync(process.execPath, [viteBin, 'build', '--mode', 'preview'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_PREVIEW_PR: pr },
});

// Without the worker every API request goes to Pages and the app cannot boot.
if (!existsSync(`${OUT}/mockServiceWorker.js`)) {
  console.error(`${OUT}/mockServiceWorker.js is missing; is it still in web/public/?`);
  process.exit(1);
}

// After Vite, never before: Vite empties its outDir, which would delete the
// stories. Storybook writes only relative paths, so the folder works under the
// PR's subpath with no base setting.
execFileSync(process.execPath, [storybookBin, 'build', '--quiet', '-o', `${OUT}/storybook`], {
  stdio: 'inherit',
});
if (!existsSync(`${OUT}/storybook/index.html`)) {
  console.error(`${OUT}/storybook/index.html is missing after the Storybook build.`);
  process.exit(1);
}

console.log(`Built ${OUT}/ for PR ${pr}, with the stories in ${OUT}/storybook/.`);
