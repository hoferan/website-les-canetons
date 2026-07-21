import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['app/assets/js/**/*.js'],
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
    files: ['app/assets/js/**/*.js'],
    ignores: ['app/assets/js/session.js'],
    languageOptions: {
      globals: { Session: 'readonly' },
    },
  },
  {
    // `formatFrenchDate` is a shared global: main.js defines it as a
    // top-level function (marked `/* exported formatFrenchDate */` there)
    // and other classic <script> tags loaded after it on the same page
    // (planning_repet.js, sinscrire.js) reference it. Excluded from
    // main.js itself, which would otherwise trip no-redeclare.
    files: ['app/assets/js/**/*.js'],
    ignores: ['app/assets/js/main.js'],
    languageOptions: {
      globals: { formatFrenchDate: 'readonly' },
    },
  },
];
