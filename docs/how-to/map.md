# Where things live, and what guards them

The first half is a map of the repository. The second is every check that can
fail a commit, a pull request or a deploy, with the mistake each one exists to
catch. When a guard fails, look it up here before you work around it. The
comment at the top of the guard's own file usually says what went wrong before
it existed.

## The repository

| Path | What lives there |
| --- | --- |
| `api/` | The Laravel application: the whole JSON API and the database schema. Its own Composer project. Ships as `_api/` |
| `web/` | The React SPA: `index.html`, `public/`, `src/`, Playwright specs in `e2e/`, the screenshot sweep in `screenshots/` |
| `tools/` | Every Node script (build, deploy, guards, the PHP runner) and their `*.test.mjs` |
| `tools/deploy/` | The FTP mirror deploy, one module per concern, each tested |
| `config/htaccess/site.htaccess` | The `.htaccess` template, merged per environment by `tools/build-overlays.mjs`. Read its comments before editing |
| `docker/` | The local stack: the dev `.env` (`api/env.docker`), database init, the `php` and `web` images |
| `staging/` | The server runbook, and each server's tracked `.htaccess` and `robots.txt` |
| `docs/` | Decision records (`adr/`), traps, these how-to pages, the web-session notes |
| `.github/workflows/` | CI, the deploys, tagging, the screenshot and Lighthouse runs |
| `dist/` | Build output. Git-ignored, never edited by hand |

### Inside `api/`

| Path | What lives there |
| --- | --- |
| `routes/api.php` | Every route under `/api/v1`, each commented with why it is public or which permission gates it |
| `routes/meta.php` | `/api/docs`, `/api/migrate` and `/api/health`, outside the version prefix |
| `app/Http/Controllers/Api/` | The controllers, mostly one per resource or action |
| `app/Http/Requests/` | Form requests: validation for each write |
| `app/Http/Resources/` | The JSON shape of each response |
| `app/Http/Middleware/` | `RequirePermission` (`permission:`), `ConditionalWrite` (`etag:`), `IdempotentWrite`, `PublicWriteGuard`, `PaginatesCollections`, `RunPendingMigrations` and smaller ones |
| `app/Support/` | Shared logic: the `Permission` enum, `ErrorVocabulary`, the `#[Emits]` attribute, `AccessIntegrity`, `Iso8601`, the inbox sources, and the Scramble extensions that shape `openapi.json` |
| `app/Exceptions/ApiError.php` | Builds every error response |
| `database/migrations/` | The schema and the reference data. See [Write a migration](migrations.md) |
| `database/seeders/` | `DevSeeder`, local only |
| `tests/Feature/` | Behaviour tests and the contract tests listed below |
| `openapi.json` | The generated API contract. Committed |

### Inside `web/src/`

| Path | What lives there |
| --- | --- |
| `main.tsx`, `routes.tsx` | Boot, and the route table |
| `api/http.ts` | The one place a request is made: cookies, CSRF, `ApiError` |
| `api/collection.ts` | `rowsOf()`, to read a `{data, meta}` list |
| `api/generated/` | The orval client and hooks. Generated, never edited |
| `mocks/` | The MSW handlers behind `dev:mock` and the Playwright specs |
| `pages/` | One component per route |
| `components/` | Layout, navigation, route guards, and the vendored UI kit in `ui/` |
| `session/` | The signed-in member and `can()` |
| `i18n/` | `fr.ts`, `de.ts`, `t()`, `translateApiError()`, `roleName()`, `registerName()` |
| `events/`, `history/`, `images/`, `members/`, `carnival/` | Feature code shared by several pages |
| `lib/` | Dates, time zone, small helpers |

## The guards

`npm run check` runs most of them locally. Some only run in CI: the Laravel
suite (it needs a database), Playwright, `composer audit` and the OpenAPI
drift check.

### Before a commit

The Husky hook runs lint-staged. It fixes what it can (Pint on PHP, ESLint and
Prettier on TypeScript, Stylelint and Prettier on CSS) and fails the commit on
what it cannot, such as the ESLint access rule below.

### In CI (`.github/workflows/ci.yml`)

| Job | Runs | Catches |
| --- | --- | --- |
| `lint-api` | Pint, Larastan (level 5), `composer audit` | Formatting drift, type errors, vulnerable PHP packages |
| `tests-api` | The Laravel suite on MariaDB 10.3 | Regressions, and every contract test below |
| `assets` | Node tests, `tsc`, Vitest, ESLint, Stylelint, Prettier, the image budget | Front-end and tooling regressions |
| `e2e` | Playwright against the mocked backend, including an accessibility pass | Broken routing, route guards and rendering in a real browser |
| `guard` | `tools/secret-guard.mjs` | A committed `config.php`, `.env` or database dump. Runs even on docs-only changes |
| `build` | `npm run build`, then checks both halves exist | The build-order bug that drops `_api/` from the artifact |
| `openapi-drift` | Regenerates `openapi.json` and the client, `git diff --exit-code`, Redocly lint | A contract or client that is stale or was edited by hand |
| `pr-title` | Conventional Commits check | A title that would make a bad merge subject |
| `all-green` | `tools/all-green.mjs` | The only required check. Fails if any job is not green, so nothing merges past a red or cancelled job |
| `deploy-test` | Checks the artifact's checksums, then deploys TEST | Files lost between the build and the upload, which the mirror would otherwise delete from TEST |

A change that touches only `docs/` skips most jobs. `screenshots.yml` and
`lighthouse.yml` run on pull requests too, but they only report and never
block.

### Contract tests in the Laravel suite

These pin rules that span the whole API. They are the ones that fail when you add an endpoint and miss a step; see
[Add or change an endpoint](api-endpoint.md).

**Authorization (ADR 0014)**

| Test | Fails when |
| --- | --- |
| `AccessDecidedByPermissionTest` | Code in `app/` decides access by a register, a role name or a role key |
| `PermissionMiddlewareTest` | An `auth:sanctum` route has no `permission:` and is not in its `SESSION_ONLY` list |
| `PermissionCopyTest` | A `Permission` case has no name or hint in `fr.ts` and `de.ts` |
| `tests/Unit/PermissionTest` | A permission name is not dotted lowercase |

**Errors (ADR 0012)**

| Test | Fails when |
| --- | --- |
| `ApiErrorContractTest` | An error response is not a problem document with exactly its seven keys |
| `ApiErrorVocabularyTest` | A `code`, `reason` or `field` the API can emit has no copy in `fr.ts` or `de.ts`, or `ErrorVocabulary` disagrees with the code |
| `DeclaredCodesTest` | A code the API can emit is declared by no operation in `openapi.json` |
| `EmittedCodesTest` | An `#[Emits]` code is unknown, or is not declared on its own operation with the right status |

**The published contract** (these read the committed `openapi.json`)

| Test | Fails when |
| --- | --- |
| `PaginationTest` | A list answers or is documented as anything but `{data, meta}` |
| `ClosedSetsTest` | A field backed by an enum is published as an open string |
| `PublishedConstraintsTest` | A timestamp is not `date-time`, or a minimum a rule enforces is not published |
| `OperationIdentityTest` | An `operationId` breaks the naming form, which is what names the generated hooks |
| `ResponseHygieneTest` | A success response has no description, or the unauthenticated routes are not exactly the public ones |
| `ConditionalWriteTest` | A route names an `etag:` facet nothing can compute, or the document misses a conditional route |

**Wire format**

| Test | Fails when |
| --- | --- |
| `UtcRenderingTest` | A timestamp is not rendered in UTC |
| `Utf8ContractTest` | Text does not round-trip as UTF-8 |
| `ApiVersionTest` | A route escapes `/api/v1`, or a meta route enters it |
| `RequestIdTest` | A response has no request ID, or it differs from the problem document's |

**Migrations.** There is no generic migration guard. Each migration that changes
data has its own test, which runs it twice; see
[Write a migration](migrations.md#test-it). `AutoMigrateTest` and
`MigrateTest` cover the machinery that runs them.

### In the front end

| Guard | Fails when |
| --- | --- |
| `tsc` | A key is missing from `fr.ts` or `de.ts` (`de.ts` is typed `typeof fr`), or a generated type no longer fits |
| ESLint `no-restricted-syntax` | SPA code decides access by `sectionId`, a role key or a role name instead of `can()` |
| `i18n/catalogues.test.ts` | The catalogues differ, German uses `ß`, or a file outside `i18n/` imports a catalogue directly |
| `i18n/index.test.ts` | `translateApiError` leaks a token or an identifier to the screen |
| `api/http.test.ts` | The mutator stops sending cookies, priming CSRF or throwing `ApiError` |
| `api/passwordPolicy.test.ts` | The password length the form announces differs from the API's |
| `pages/oneLayoutPerRow.test.ts` | A page keeps a separate phone and desktop layout for its rows (ADR 0024) |
| `routes.test.tsx`, `components/guards.test.tsx` | A route has the wrong guard in front of it |
| `mocks/handlers.test.ts` | The mocked backend stops refusing what the real API refuses |
| `lib/timeZone.test.ts` | The suite is not running in New York. It runs there on purpose, so a date formatter that lost its Zurich time zone shows the wrong day |
| `web/e2e/a11y.spec.ts` | A route gets a new accessibility violation, or a known one is fixed and still listed |

### In the tooling (`npm run test:js`)

| Test | Fails when |
| --- | --- |
| `build-overlays.test.mjs` | The `.htaccess` template loses the `/api` dispatch, its order, `[L]`, or the fallback's guards. Any of those takes the whole site down |
| `put-overlay.test.mjs` | An overlay would upload with an unsubstituted path, or without the post-cutover rules |
| `all-green.test.mjs` | A CI job is not covered by `all-green`, or `deploy-test` would skip silently |
| `artifact-excludes.test.mjs` | Logs, `.env`, seeders or untracked files would reach the artifact |
| `screenshot-pages.test.mjs` | A route in `routes.tsx` is missing from `web/screenshots/pages.json`, or an entry points nowhere |
| `image-budget.test.mjs` | An image in the repository breaks the budget: longest edge over 1920px or over 600 KB |
| `deploy/preflight.test.mjs` | `PROTECTED_PATHS` changes shape, `_api/.env` could be deleted, or the target check weakens |
| `deploy/sync.test.mjs` | A protected file could be marked stale, or the mass-delete brake moves |

### At deploy time

The deploy exits 2, before uploading anything, when:

- `FTP_DIR` does not name the environment you asked for;
- the server's `_api/.env` keys differ from `api/.env.example`. If that file
  cannot be read, the check is skipped with a notice rather than refused;
- it would delete more than 50 files and more than 20% of the server;
- `--prebuilt` was given an artifact missing its `.htaccess` files or `vendor/`.

It never uploads or deletes `.htaccess`, `robots.txt`, `.htpasswd`,
`config.php`, `_api/.env` or its own state file. After uploading, it compares
file sizes and leaves the deploy resumable if anything is missing.

`Deploy PROD` refuses a commit that is not QA's last successful deployment, and
`Tag Release` refuses to move an existing tag.

### What nothing guards

Some rules in `CLAUDE.md` have no check behind them. Review them by hand:

- the comment on each route in `api/routes/api.php`;
- the JPEG quality, progressive encoding and missing EXIF of committed images;
- that a migration is idempotent, when it has no test of its own.
