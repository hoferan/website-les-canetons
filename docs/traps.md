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

## The dev server on :5173 is already running — attach, do not start

`npm run dev` is **not** a dev server. It is
`build-overlays.mjs docker && docker compose up -d --build`, the whole stack.
Pointing a preview at it from a worktree starts a SECOND compose project (a
different directory means a different project name) racing the first for every
published port: 8090, 5173, 3307, 8025, 8091.

The Vite dev server is the compose `assets` service, which already publishes
5173. So the right preview configuration attaches rather than starts, and
`.claude/launch.json` is tracked for that reason — see `.gitignore`, which
negates a global ignore to keep it:

```json
{ "name": "dev", "url": "http://localhost:5173", "port": 5173, "autoPort": false }
```

Attach-only is right permanently, not just when the stack happens to be up:
:5173 is occupied exactly when :8090 is available, and the dev server needs
:8090 for its `/api` proxy, so there is no state in which starting a copy helps.

Note that `assets` mounts the repo root it was started from, so from a worktree
the preview serves the MAIN checkout. Fine for contract work, wrong the moment
you change something under `web/`.

## Moving the Vite port breaks login, and only login

`SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` pins
`localhost:8090,127.0.0.1:8090,localhost:5173,127.0.0.1:5173`. Sanctum matches
the request's Origin against that list to decide whether to treat the request as
stateful — that is, whether a session cookie applies at all.

On any other port the SPA builds, renders and fetches `/api/v1/config` happily,
because none of that needs a session. Only signing in fails. Add the port to
that variable, or stay on 5173.

The refusal is at least legible, and deliberately so: `POST /api/v1/login`
answers **400 `stateful_request_required`** — "Cette requête ne peut pas ouvrir
de session" — rather than the 500 it used to, or a generic credential error that
would send you re-typing a correct password. See `NonStatefulRequestTest`.

## `bcrypt()` in a test against an argon2id app

`Member::factory()->create(['password' => bcrypt('x')])` makes `Hash::check`
**throw** `Could not verify the hashed value's configuration` rather than return
false — so the test fails with a confusing framework error rather than a failed
assertion. Use `Hash::make()`, which follows the configured driver.

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
  than kept as a running parity reference. The consequence is that the parity
  reference is `git show dcd7862^:app/pages/<page>.php` and the live site.
- **Icons are `lucide-react`** — the same set as the old site, as components.
  There is no central icon registry; the old `assets/js/icons.js` existed only
  because the vanilla library needed one.
- **Guards refuse in place rather than redirect** when a logged-in member lacks
  the permission. Bouncing somebody already past the login form reads as "your
  session expired" and invites them to log in again at something they will never
  be allowed to see. This is what R1b's `RequirePermission` guard must do.
