import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// See the block that uses them, below.
const ROUTER_IMPORTS = {
  name: 'react-router-dom',
  importNames: ['Link', 'NavLink', 'Navigate', 'useNavigate', 'redirect'],
  message:
    'Import Link, Navigate and useNavigate from i18n/routing, which keep the page in its language (#369).',
};

// A toast has a level, an icon, a close button and our own clock (ADR 0042),
// which only the wrapper in components/ui/toast.tsx gives it.
const SONNER_TOAST = {
  name: 'sonner',
  importNames: ['toast'],
  message: 'Raise a toast with notify from @/components/ui/toast (ADR 0042).',
};

// See the router block below.
const DS_DEEP_IMPORT = {
  group: ['@ds/*', '**/design-system/*'],
  message:
    'Import from "@ds", the design system\'s public API (ADR 0046), not from a file inside it.',
};

export default [
  js.configs.recommended,
  {
    // The SPA. Typed with typescript-eslint's parser but WITHOUT type-aware
    // linting: the type-checked rule set needs a program per run and doubles
    // lint time, and `npm run check` already runs `tsc --noEmit` over the same
    // files, so the types are enforced either way.
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The base rule does not understand type-only syntax (it flags a type
      // parameter or an `import type` as unused); the TS-aware one replaces it.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // no-undef cannot see TypeScript's lib types — it reports DOM types like
      // RequestInit as undefined globals. TypeScript itself reports genuinely
      // undefined identifiers, and `npm run check` runs tsc over these files,
      // so the rule is redundant here as well as wrong.
      'no-undef': 'off',
    },
  },
  {
    // Access is decided by a permission, never by which role granted it
    // (ADR 0014). Roles are editable data: a key compared here keeps working
    // until somebody moves the permission to another role in the role editor,
    // and then the screen and the API disagree about who may do what.
    //
    // Only i18n/ may read a role's key, because it is the lookup key for the
    // role's label. Mocks are exempt too: they stand in for the API, which
    // has to know which seeded role is which.
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/i18n/**', 'web/src/mocks/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // The other way back to the old model: the signed-in account's
        // register used as a gate, which is what `isPlayer` was. The session
        // object is called `user` everywhere it is read, and displaying the
        // register (`user.sectionName ?? …`) stays allowed; testing it does not.
        // `user?.sectionName` parses as a ChainExpression wrapping the member
        // access, hence each test twice; the plain form alone missed it.
        ...[
          ':matches(BinaryExpression, UnaryExpression[operator="!"], LogicalExpression[operator=/^(&&|\\|\\|)$/]) > MemberExpression[object.name="user"][property.name=/^section(Id|Name)$/]',
          ':matches(BinaryExpression, UnaryExpression[operator="!"], LogicalExpression[operator=/^(&&|\\|\\|)$/]) > ChainExpression > MemberExpression[object.name="user"][property.name=/^section(Id|Name)$/]',
          ':matches(IfStatement, ConditionalExpression) > MemberExpression.test[object.name="user"][property.name=/^section(Id|Name)$/]',
          ':matches(IfStatement, ConditionalExpression) > ChainExpression.test > MemberExpression[object.name="user"][property.name=/^section(Id|Name)$/]',
        ].map((selector) => ({
          selector,
          message:
            'A register groups and displays; it grants nothing. Decide with can(permission) from useSession(): answering is can("attendance.respond") (ADR 0014).',
        })),
        ...[
          // role.key === "…", roles.some((r) => r.key !== x), and the like.
          'BinaryExpression[operator=/^[!=]==?$/] > MemberExpression[property.name="key"][object.name=/role/i]',
          'BinaryExpression[operator=/^[!=]==?$/] > ChainExpression > MemberExpression[property.name="key"][object.name=/role/i]',
          // Any comparison against one of the seeded role keys, whatever
          // holds it: user.roleKeys[0] === "direction".
          'BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(member|musician|direction|committee)$/]',
          // roleKeys.includes("committee"), and `case "direction":`.
          'CallExpression[callee.property.name="includes"] > Literal[value=/^(member|musician|direction|committee)$/]',
          'SwitchCase > Literal[value=/^(member|musician|direction|committee)$/]',
        ].map((selector) => ({
          selector,
          message:
            'Decide access with can(permission) from useSession(), never by a role key. Roles group permissions and are editable data (ADR 0014).',
        })),
        // An icon-only Button would have no visible name; IconButton shows one
        // on hover and keyboard focus.
        {
          selector: 'JSXAttribute[name.name="size"][value.value=/^icon/]',
          message: 'Use IconButton for an icon-only button (ADR 0040)',
        },
      ],
    },
  },
  {
    // Both languages share one router (#369), so an app path names a page and
    // the German prefix is added by i18n/routing.tsx. The router's own link
    // and navigation would send a German visitor to the French page. Tests
    // may use them, to reach a URL exactly as written.
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/i18n/routing.tsx', 'web/src/**/*.test.{ts,tsx}', 'web/src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [ROUTER_IMPORTS, SONNER_TOAST],
          // The app reaches the design system through `@ds`, never past it
          // (ADR 0046). Inside the design system the next block replaces this.
          patterns: [DS_DEEP_IMPORT],
        },
      ],
    },
  },
  {
    // THE DESIGN SYSTEM'S BOUNDARIES (ADR 0046).
    // Inner layers never import outer ones, and the app reaches the design
    // system only through the `@ds` barrel. dependency-cruiser (npm run
    // lint:boundaries, in CI) states the same rules a second time, adds the
    // allow-list of packages and catches cycles; this block is the one that
    // speaks in the editor.
    files: ['web/src/design-system/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      // The plugin resolves each import itself and, by default, tries `.js`
      // only, so without this it never finds a .ts file and checks nothing.
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      // One element per layer folder: a layer's barrel is part of the layer.
      'boundaries/elements': [
        {
          type: 'ds-primitives',
          pattern: 'web/src/design-system/primitives',
          partialMatch: false,
        },
        {
          type: 'ds-composites',
          pattern: 'web/src/design-system/composites',
          partialMatch: false,
        },
        { type: 'ds-internal', pattern: 'web/src/design-system/internal', partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'ds-primitives' } },
              disallow: { to: { element: { type: 'ds-composites' } } },
              message:
                'A primitive (layer 2) cannot import a composite (layer 3): dependencies point inward.',
            },
            {
              from: { element: { type: 'ds-internal' } },
              disallow: { to: { element: { types: ['ds-primitives', 'ds-composites'] } } },
              message: 'design-system/internal is imported by the layers; it imports none of them.',
            },
          ],
        },
      ],
      // What the design system must not know (ADR 0046). A package outside the
      // allow-list fails dependency-cruiser too; this list is the part worth
      // seeing as you type.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '**/../i18n', '**/../i18n/*'],
              message:
                'The design system imports no app code: text, links and data arrive as props, asChild and slots.',
            },
            {
              group: [
                'i18next',
                'react-i18next',
                'react-router',
                'react-router-dom',
                '@tanstack/*',
                'zod',
                'react-hook-form',
                '@hookform/*',
                'msw',
              ],
              message:
                'The design system must not know about i18n, routing, data fetching or form libraries (ADR 0046).',
            },
          ],
        },
      ],
    },
  },

  {
    // The toast wrapper is the one place that raises a sonner toast.
    files: ['web/src/components/ui/toast.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: [ROUTER_IMPORTS] }],
    },
  },
  {
    // Generated by orval from api/openapi.json — never hand-edited, so linting
    // it only ever produces noise no one may act on. See orval.config.ts.
    ignores: ['web/src/api/generated/**'],
  },
];
