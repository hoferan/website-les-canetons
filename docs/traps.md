# Traps

Things that cost real debugging time and are not obvious from the code.

Extracted 2026-09-08 from `docs/continue-here.md`, which was deleted: it was
74 KB describing the pre-rebuild SPA cutover, and by the end it was actively
misleading — it named seeded logins that no longer exist, a smoke-check count
that had changed, and `api-laravel/` paths from before the `_api/` rename. Only
the entries below were still true.

Several completed plans under `docs/superpowers/plans/2026-08-*` still point at
`docs/continue-here.md`. They are archival records of work already shipped and
were left untouched rather than rewritten; this file is where their traps went.

**This file is for traps that live nowhere else.** Anything already in
`CLAUDE.md` — the PowerShell-vs-Git-Bash Vitest failure, `MSYS_NO_PATHCONV`,
`npm run check` not building, the `FTP_PASSWORD`/`FTP_PASS` mismatch, never
running `docker compose up` directly — is not repeated here.

---

## Check a display font's glyph data before adopting it

Lilita One was dropped on 2026-08-31 because its woff2 ships incorrect `glyf`
bounding boxes on **104 of its 210** outline glyphs, so Firefox's OpenType
Sanitiser logged a warning for every heading glyph it drew. Nothing rendered
wrong — it was console noise — but it is avoidable, and several other fonts in
the same heavy-display register are worse.

Measured with fontTools in a throwaway venv. This is deliberately **not** a
project dependency and **not** a CI test: doing it in Node means either a new
dependency or hand-parsing the woff2 `glyf` transform, and a partial parser
would give false confidence about the exact thing it is meant to guarantee. A
display face changes roughly never, and a minute by hand at the moment of
choosing is the only moment it matters.

```bash
python -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
/tmp/fontenv/bin/python - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont('node_modules/@fontsource/<name>/files/<name>-latin-400-normal.woff2')
glyf = f['glyf']
bad = 0
for n in f.getGlyphOrder():
    g = glyf[n]
    if getattr(g, 'numberOfContours', 0) == 0:
        continue
    old = (g.xMin, g.yMin, g.xMax, g.yMax)
    g.recalcBounds(glyf)
    bad += old != (g.xMin, g.yMin, g.xMax, g.yMax)
print(bad, 'glyphs with an incorrect bbox')
EOF
```

Results recorded 2026-08-31 so nobody re-measures — **clean:** Bungee (0/343),
Anton, Archivo Black, Alfa Slab One, Passion One, Righteous, Fredoka One, and
Karla (the body face, 0/274). **Not clean:** Lilita One (104/210), Bowlby One
(13, and no latin-ext), Titan One (9).

Also worth knowing: **Bungee's lowercase glyphs are drawn as capitals.** It is a
signage face, so every heading renders in caps whatever the source says. That is
the look, not a bug — but a heading cannot be sentence-case while it is in use.

## The `assets` container needs two env vars, both set in `docker-compose.yml`

`VITE_API_PROXY_TARGET=http://web`, because inside that container
`localhost:8090` is the container itself — with the default, every API call
answers 502 and the SPA looks broken with no clue why.

`VITE_USE_POLLING=1`, because bind-mount filesystem events do not reach it on
Docker Desktop. Without polling an edit never triggers HMR, the dev server keeps
serving the previous version, and the only thing that helps is restarting the
container, which nobody guesses.

## A deploy alone does not turn a server over — it breaks it

`.htaccess` is server-owned and never uploaded by a deploy. A deploy uploads the
SPA and **deletes** the old entry point; until the new `.htaccess` lands, the
site is down.

Order: deploy, then **immediately** `npm run put-overlay:<env>`. On TEST that
window is free (Basic Auth, no visitors). On PROD it is real downtime, and there
is no atomic swap over FTP.

This applies to a *cutover*. A routine redeploy onto a server whose `.htaccess`
is already correct does not touch it.

## Injecting the FTP password for a one-off command

`CLAUDE.md` records that the `.env.*` files use `FTP_PASSWORD` while the CLI
reads `FTP_PASS`, and that this is deliberate. The incantation:

```powershell
Get-Content .env.test | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
$env:FTP_PASS = $env:FTP_PASSWORD
node tools/deploy/cli.mjs test --status
```

## `build-overlays.mjs` and the bare-token guard

It opens each environment with `rmSync(outDir, {recursive: true, force: true})`,
so anything left in `dist/overlay/<env>/` is destroyed by the next
`build:overlay` — which is why `put-overlay` writes its rollback backup to
`dist/htaccess-backups/` instead.

It substitutes only the *quoted* `AuthUserFile "__HTPASSWD_PATH__"` and
deliberately leaves the bare token in a NOTE comment. A guard matching the bare
token therefore refuses every correctly built test/qa overlay.

---

## Scramble: an `extensions` entry that is silently never called

`config/scramble.php`'s `extensions` array is documented as taking extensions,
and its filter really does accept an `OperationExtension` — but one listed there
is **never invoked**. That array feeds the pipelines which build schemas and
responses from TYPES. Operation transformers are a separate pipeline.

Register one through the provider instead:

```php
// AppServiceProvider::boot()
Scramble::configure()->withOperationTransformers(MyExtension::class);
```

Cost an hour on 2026-09-11. The symptom is nothing at all: the export succeeds,
the document is unchanged, no warning anywhere. **Diagnose it by putting a
`throw` in `handle()`** — if the export still succeeds, the class is not being
called and the problem is registration, not logic.

## Scramble: a request body's content entry IS a `$ref`

To extend a request schema from an extension, resolve the reference at the
CONTENT level, not one level deeper:

```php
$body = $operation->requestBodyObject?->content['application/json'] ?? null;
if ($body instanceof Reference) {                    // <- the entry itself
    $body = $this->openApiTransformer->getComponents()->get($body);
}
$type = $body instanceof Schema ? $body->type : null;
```

Resolving `$body->type` instead silently does nothing: the header a sibling call
added still appears, so it looks like it worked. Larastan calls the
`instanceof Reference` branch impossible, because Scramble's docblock types
`content` as `Schema|null` — the docblock is narrower than the runtime, and a
`var_dump` settles it. `@phpstan-ignore instanceof.alwaysFalse` with a note.

## Scramble: what breaks nullability and what leaks into descriptions

Two ways the exported document quietly stops matching the code:

- **A helper hides nullability.** `Instant::iso($this->opens_at)` returning
  `?string` was typed `string` in the document, silently making an optional
  field required for every generated client. `$this->opens_at?->utc()->toIso8601String()`
  keeps it `string|null` — Scramble reads the nullsafe operator, not the
  signature. Caught by the mocks' typecheck, not by any API test.
- **A comment above an array key becomes that property's `description`.** An
  implementation note written above `'errors' => ...` in `ApiError::json()` was
  published into the OpenAPI document. Hoist the explanation above the whole
  statement, or out of the literal entirely.
- **A raw `$request->attributes->get(...)` read types as the wrong primitive,
  not merely as non-nullable.** `EventResource::answerableCount` read the
  `ANSWERABLE_COUNT` request attribute straight into a null-check ternary, and
  Scramble inferred the whole field as `string | null` — `ParameterBag::get()`
  is untyped, so that is the type Scramble found at the expression, and it has
  no idea the attribute is always an int when it is not null. The fix is an
  explicit `(int)` cast on the non-null branch, which is what makes the field
  `number | null` in the generated client rather than `string | null`. Check
  the generated type after any change to a field shaped this way
  (`grep` the field in `web/src/api/generated/model/*.ts`) — the failure is
  silent, `openapi-drift` only proves the document matches what Scramble
  inferred, and a wrong primitive still round-trips fine in the mocks.

## Scramble: CRLF in a PHP file collapses summary and description

Scramble splits a docblock into `summary` and `description` on a blank line,
which it recognises as `\n\n`. A source file with CRLF endings has none, so the
whole block becomes one `summary`, with literal `\r\n` inside it and the
trailing full stop stripped the way summaries are. No `description` is emitted
at all, and `/api/docs` then prints the entire paragraph as an operation title.

This is easy to cause on Windows without touching a line ending on purpose: a
script that rewrites a PHP file in text mode writes CRLF, the pre-commit hook's
Pint pass normalises it back to LF, and `npm run openapi` run BETWEEN those two
records a shape no checkout will ever reproduce. CI regenerates from an LF tree
and `openapi-drift` fails with a diff that looks like an orval version
disagreement.

**Generate after the PHP is normalised, not before**, and if the job fails on a
document you just regenerated, look at whether the summaries contain `\r\n`
before looking anywhere else:

```bash
grep -cF '\r\n' api/openapi.json   # must be 0
```

## Scramble: an `(object)` cast publishes as a scalar

`InboxController::summary()` returns `(object) $counts` so an empty map
serializes as `{}` rather than `[]`. Scramble has no handler for cast
expressions, so it inferred nothing from the cast and typed `counts` as
`string`. The JSON on the wire was correct; the published type was simply
false.

`openapi-drift` cannot catch this. It only proves the document matches what
Scramble inferred, not that the inference was right.

The fix is a `@return array{...}` docblock on the method, steering Scramble to
the real shape. That docblock then disagrees with the native `JsonResponse`
return type, so PHPStan needs a targeted `@phpstan-ignore return.phpDocType`
next to it. The two travel together — drop the `@phpstan-ignore` and PHPStan
fails on the docblock; drop the docblock and the cast is back to typing as a
string.

## Scalar: a heading wrapped in backticks gets no route

Scalar builds each heading's anchor from its **plain text**, so a heading whose
text is entirely inside a code span slugifies to nothing — every such heading
collapses to the same empty route and none is addressable:

```markdown
### `validation_failed`   ->  api-1/description/          (empty, collides)
### validation_failed     ->  api-1/description/validation-failed
```

What made it visible: an ordinary prose heading two sections above routed
correctly, so the slugifier plainly worked. Put the formatting in the line
below the heading instead.

## `$request->session()` throws — and being authenticated does not imply a session

It raises `RuntimeException: Session store not set on request` rather than
returning null. Two 500s came from this in one codebase: `AuthController::login`
and `EnforceAbsoluteSessionLifetime`, both inside branches where a user was
already authenticated, which felt like proof a session existed. It is not — a
request Sanctum has not treated as stateful reaches an authenticated branch with
no session at all.

Guard with `$request->hasSession()` wherever a session is touched outside the
`web` group. Note that the whole test suite hides this: every login test sets an
`Origin` matching `SANCTUM_STATEFUL_DOMAINS`, because that is what the SPA does,
so the failing path is the one nothing internal drives.

## :5173 serves the checkout the stack was started from

The compose `assets` service publishes a Vite dev server on 5173, and it mounts
**the repo root compose was started from**. Work in that checkout and it is
exactly right — it is the dev server, and `.claude/launch.json` attaches to it:

```json
{ "name": "dev", "url": "http://localhost:5173", "port": 5173, "autoPort": false }
```

From a git worktree it is a trap, because it serves the OTHER tree's `web/`:
everything renders, nothing you changed is there, and the natural conclusion is
a broken build rather than the wrong checkout. **That is the main reason this
project stopped using worktrees** (2026-09-12). Only one stack can exist — five
published ports — and it can only mount one tree, so a worktree needs its own
Vite, a Sanctum wildcard and a fast-forward every time the stack should catch
up. Work in `C:\Workspace\website-les-canetons` on `rebuild` instead.

If you do need a second checkout live at once, `vite.config.ts` honours
`process.env.PORT` (Vite does not on its own) and `SANCTUM_STATEFUL_DOMAINS`
accepts any localhost port, so `PORT=5180 npx vite` gives that tree a working
dev server. Point `VITE_API_PROXY_TARGET` at a stack of its own if the branch
also changes `api/`; otherwise it proxies to whatever :8090 is running.

**`npm run dev` is not a dev server.** It is
`build-overlays.mjs docker && docker compose up -d --build`. Run from a second
directory it starts a SECOND compose project — a different directory means a
different project name — racing the first for 8090, 5173, 3307, 8025 and 8091.

Two DbGate containers on two ports is its own flavour of that race, because
**cookies ignore the port**. DbGate signs the browser's token with `.key` from
its own `/root/.dbgate` volume, so the second stack's DbGate rejects the token
the first one issued for `localhost`, and both log
`DBGM-00098 Sending invalid token error` until you clear the cookie. Measured
2026-09-12. The same thing happens for one stack if you ever drop the
`dbgate_data` volume, since the key is regenerated with it.

## The dev stack is stateful on ANY localhost port, deliberately

`SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` is `localhost:*,127.0.0.1:*`.
Sanctum matches the browser's Origin against that list with `Str::is()`, so `*`
is a real pattern, and an origin missing from it falls out of stateful mode: the
session cookie stops applying.

It is a wildcard because the ports are not knowable in advance — each worktree's
dev server takes whatever was free. Narrowing it back to a list is the trap:
everything keeps working except signing in, on whichever port is not listed.
`NonStatefulRequestTest` pins all three halves — the wildcard accepts an
arbitrary port, an explicit list refuses one, and neither accepts a host that is
not this machine.

The refusal is at least legible, and deliberately so: `POST /api/v1/login`
answers **400 `stateful_request_required`** — "Cette requête ne peut pas ouvrir
de session" — rather than the 500 it used to, or a generic credential error that
would send you re-typing a correct password.

**Never let that wildcard reach a server.** `api/.env.example` carries
`CHANGE_ME` and each server names its own origin; `*` there would make any host
stateful.

## MariaDB 10.3: the second `timestamp` column in a table

A migration with two of them fails outright:

```
SQLSTATE[42000]: 1067 Invalid default value for 'expires_at'
```

`explicit_defaults_for_timestamp` is off on this version and on the shared
host, so the FIRST `TIMESTAMP NOT NULL` column implicitly gets
`DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` and every later one
implicitly gets `'0000-00-00 00:00:00'` — which strict mode then refuses. The
column named in the error is the innocent one; nothing about it is wrong.

Use `$table->dateTime(...)` for both. It takes no implicit default, and the
code writing the row is already supplying the value. `2026_09_12_000001` is the
worked example.

## A negative assertion goes vacuous when its control moves behind a menu

`RowActions` (`web/src/components/RowActions.tsx`) puts a row's less frequent
actions behind a `…` trigger, and a Radix menu item is not in the DOM until
that menu opens. So

    expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();

stops proving that somebody without `events.manage` cannot delete, and starts
passing for everyone, silently. The line still reads as coverage.

This was measured. Converting `/events` onto `RowActions` in #118
with the tests left untouched, the two tests holding three of the four such
assertions **stayed green**. That halfway commit was run on purpose, because
the alternative was to argue about it. An earlier slice had already shipped
four assertions that sat vacuous for months until somebody reintroduced the
bug and watched.

You need this before you open the test file. Afterwards the failure is
invisible, because the suite is green either way.

**What to write instead.** `expectNoSuchAction` in
`web/src/pages/Events.test.tsx` is the worked example. It asserts absence
three ways — no inline link, no inline button, and no overflow trigger
anywhere on the page — and the third clause is the one carrying the meaning,
because with fewer than two leftover actions `RowActions` draws no trigger at
all and renders everything inline.

Match that trigger with `aria-haspopup="menu"`, never with its French
accessible name. A name-anchored regex cannot match the German label, so on
`/de/*` the clause that carries the meaning passes vacuously — the same defect
one layer up, inside the helper written to close it.

**Then watch it fail.** Remove the permission gate the assertion guards, run
the file, confirm that assertion goes red, and restore the gate. An assertion
nobody has watched fail is not a guard. Where no mutation isolates a line —
two actions behind a single gate, as on the guest list — write that down
instead of leaving the question open.

## `bcrypt()` in a test against an argon2id app

`Member::factory()->create(['password' => bcrypt('x')])` makes `Hash::check`
**throw** `Could not verify the hashed value's configuration` rather than return
false — so the test fails with a confusing framework error rather than a failed
assertion. Use `Hash::make()`, which follows the configured driver.

## `fr.ts` writes an apostrophe differently from the rest of the French

`web/src/i18n/fr.ts` uses the STRAIGHT apostrophe (`'`) throughout its `errors`
and `validation` catalogues — "L'export Excel n'est pas disponible",
"Quelqu'un a modifié cet élément" — while the page copy authored directly in
the components uses the typographic one (`’`): "l’événement", "Ce qu’on
réserve". The two therefore sit side by side on screen.

It matters before you open a file rather than after, because a test that
matches an error message on the wrong character fails as **"unable to find the
text"**, which reads as a message that is not rendered rather than as a quote
mark. Check the catalogue, not your keyboard.

# Decisions taken in conversation, not visible in the code

- **WordPress is abandoned.** A greenfield rebuild was designed and half-built
  between 2026-07-28 and 2026-08-28, then dropped: *"the effort to migrate
  completely to wordpress is too high! I don't want to learn wordpress, I'm a
  developer."* The branch, its remote and its Docker volumes are deleted. Any
  WordPress design document still reachable in history — including one claiming
  to supersede every other design — is void.
- **The backend question was reopened and closed: Laravel stays.** It owns the
  schema, does Sanctum cookie auth, generates the client, and already runs on
  this shared FTP host.
- **Hard cutover over building alongside.** `app/` was deleted up front rather
  than kept as a running parity reference. The live site is now the only one
  left — that pull request was squash-merged, and no branch holds the old pages'
  commits any more.
- **Icons are `lucide-react`** — the same set as the old site, as components.
  There is no central icon registry; the old `assets/js/icons.js` existed only
  because the vanilla library needed one.
- **Guards refuse in place rather than redirect** when a logged-in member lacks
  the permission. Bouncing somebody already past the login form reads as "your
  session expired" and invites them to log in again at something they will never
  be allowed to see. This is what R1b's `RequirePermission` guard must do.
