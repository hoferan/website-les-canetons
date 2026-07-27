import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['app/assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // Several files use a leading-underscore parameter name as an explicit
      // "intentionally unused" placeholder (e.g. `.then((_) => ...)`), which
      // is a common, readable convention rather than a bug.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // node:test files co-located with the browser modules they cover (e.g.
    // app/assets/js/api.test.mjs), run by `npm run test:js`. They execute in
    // Node but stub the browser APIs the module under test uses, so they need
    // both sets of globals — the block above supplies only browser ones, and
    // only to *.js. The .mjs extension is deliberate: vite.config.js builds an
    // entry per *.js file in that directory, so a test named *.test.js would be
    // bundled as if it were page code.
    files: ['app/assets/js/**/*.test.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
