import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['code/assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
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
    // `Session` is a shared global: session.js assigns it as a top-level
    // const (marked `/* exported Session */` there), and other classic
    // <script> tags loaded after it on the same page (main.js,
    // planning_repet.js, sinscrire.js) reference it. Excluded from
    // session.js itself, which would otherwise trip no-redeclare.
    files: ['code/assets/js/**/*.js'],
    ignores: ['code/assets/js/session.js'],
    languageOptions: {
      globals: { Session: 'readonly' },
    },
  },
];
