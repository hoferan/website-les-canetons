# Run the dev stacks

There are three ways to run the site locally. Each one answers a different
question, and the wrong one gives you a confident wrong answer.

| Stack | Start it with | Answers |
| --- | --- | --- |
| Vite on :5173 against Docker | `npm run dev`, then `npm run dev:web` | Does my change work against the real API and database? |
| Apache on :8090 | `npm run build`, with the stack up | Does the **deployed artifact** work: the `.htaccess`, the `_api/` boundary, the caching? |
| The mocked backend | `npm run dev:mock` | What does a page look like, with no Docker at all? |

## The Docker stack

```bash
npm install
npm run dev       # writes dist/overlay/docker/.htaccess, then docker compose up -d --build
npm run dev:web   # Vite with HMR
npm run dev:down  # stop
```

`npm run dev` brings up six services from `docker-compose.yml`:

| Service | Port | What it is |
| --- | --- | --- |
| `assets` | 5173 | A Vite dev server, proxying `/api` and `/sanctum` to `web` |
| `web` | 8090 | Apache and PHP-FPM serving `dist/build/`, shaped like a server's document root |
| `php` | none | The container every PHP command runs in, see below |
| `db` | 3307 | MariaDB 10.3, the version production runs |
| `mailpit` | 8025 | Catches every mail the API sends |
| `dbgate` | 8091 | A database UI, opened straight into `lescanetons` |

Never run `docker compose up` on its own. Compose bind-mounts the generated
`dist/overlay/docker/.htaccess`, and if that file is missing Docker creates a
directory in its place and `web` will not start.

Sign in with one of the seeded accounts in the root [README](../../README.md#quick-start-local-dev).
All of them use the password `demo`.

### :5173 is where you work

Source edits show up there through HMR. Every `/api/*` call goes to the real
Laravel in `web`, which talks to the real MariaDB, so cookies, CSRF, permissions
and validation all behave as they will on a server.

The `assets` container mounts the checkout that compose was **started from**.
If you work in a second worktree, :5173 serves the other tree: everything
renders and none of your changes are there. Run a dev server of your own:

```bash
PORT=5180 npm run dev:web
```

Any localhost port can sign in, because `SANCTUM_STATEFUL_DOMAINS` in
`docker/api/env.docker` is a wildcard on purpose. `docs/traps.md` has both
traps in full.

### :8090 is the parity check

`web` serves whatever `npm run build` last wrote to `dist/build/`, so it does
not see source edits. It serves the same bytes a deploy would upload, behind
the same generated `.htaccess`.

```bash
npm run build
npm run smoke   # 11 HTTP checks against :8090
```

Use it when you touch `config/htaccess/site.htaccess`, `api/.htaccess`,
`api/public/.htaccess`, `tools/build.mjs` or anything else that only exists in
the artifact. A green dev server says nothing about those.

`npm run check` deliberately does not build. Vite empties `dist/build/` first,
which would delete `_api/` from under a running stack.

### PHP commands

There is no local PHP install. Every PHP command goes through
`tools/php-runner.mjs`, which uses the `php` container when it is healthy and a
native `php` otherwise:

```bash
npm run artisan -- route:list
npm run composer -- require some/package
npm run php -- -v
npm run test:api            # the Laravel suite
```

The suite uses its own database, `laravel_api_test`, because `RefreshDatabase`
drops every table. Never run two Laravel suites at the same time against one
stack: they share that database.

On Git Bash, a raw `docker compose exec -w /repo/api …` needs
`MSYS_NO_PATHCONV=1`, or Git Bash rewrites `/repo/api` into a Windows path.
Run Vitest from PowerShell: under Git Bash it can load twice and fail every
file with "Vitest failed to find the runner".

## The mocked backend

```bash
npm run dev:mock
```

This is Vite with `web/.env.mock`, which sets `VITE_MOCK_API=1`. The SPA then
starts [MSW](https://mswjs.io/) and answers every `/api/*` call from
`web/src/mocks/handlers.ts` in the browser. No Docker, no PHP, no database.

It has its own fixture accounts with the same names. In the mock, `demo.both`
has to change their password before anything else.

What it is good for: looking at a page, at both widths, in a few seconds. What
it is not: proof that the API behaves the same way. The handlers are written by
hand and can drift from Laravel. When a page works under the mock and not
against the stack, believe the stack.

The Playwright specs (`npm run test:e2e`) and the screenshot sweep
(`npm run screenshots`) both run against this mock. The specs start their own
server on **5174**, never 5173: with the stack up, Playwright would otherwise
adopt the unmocked server on 5173 and run every spec against the real database.

## Which one to reach for

- A new page or a layout change: `dev:mock` to iterate, then :5173 to confirm.
- A new endpoint or a change to one: :5173, plus `npm run test:api`.
- `.htaccess`, the build, the deploy tooling: `npm run build && npm run smoke`
  on :8090.
- Screenshots for a pull request: `npm run screenshots`, which writes every
  route at 1280 and 390px into `dist/screenshots/`.
