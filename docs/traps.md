# Traps

Things that cost real debugging time and are not obvious from the code.

**This file is for traps that live nowhere else.** What `CLAUDE.md` already
says (the PowerShell-vs-Git-Bash Vitest failure, `MSYS_NO_PATHCONV`,
`npm run check` not building, never running `docker compose up` directly) is
not repeated here, and neither is anything a comment at the line already
covers.

---

## Check a display font's glyph data before adopting it

Lilita One was dropped because its woff2 ships incorrect `glyf` bounding boxes
on 104 of its 210 outline glyphs, so Firefox's OpenType Sanitiser logged a
warning for every heading glyph it drew. Nothing rendered wrong, but several
other fonts in the same heavy-display register are worse.

Measure with fontTools in a throwaway venv. It is deliberately not a project
dependency or a CI test: a display face changes roughly never, and the moment
of choosing is the only moment it matters.

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

On Windows the venv's binaries are under `Scripts\`, not `bin/`. A variable
face lives in `@fontsource-variable/<name>`, as `<name>-latin-wght-normal.woff2`
(Karla is one).

Already measured, so nobody re-measures: **clean**: Bungee (0/343), Anton,
Archivo Black, Alfa Slab One, Passion One, Righteous, Fredoka One, and Karla
(the body face, 0/274). **Not clean**: Lilita One (104/210), Bowlby One (13,
and no latin-ext), Titan One (9).

Bungee's lowercase glyphs are drawn as capitals: it is a signage face, so every
heading renders in caps whatever the source says, and a heading cannot be
sentence case while it is in use.

## The `assets` container needs two env vars, both set in `docker-compose.yml`

`VITE_API_PROXY_TARGET=http://web`, because inside that container
`localhost:8090` is the container itself. With the default, every API call
answers 502 and the SPA looks broken with no clue why.

`VITE_USE_POLLING=1`, because bind-mount filesystem events do not reach it on
Docker Desktop. Without polling, an edit never triggers HMR and the dev server
keeps serving the previous version until the container restarts.

## A deploy alone does not turn a server over — it breaks it

`.htaccess` is server-owned and never uploaded by a deploy. A cutover deploy
uploads the SPA and **deletes** the old entry point, so until the new
`.htaccess` lands, the site is down.

Order: deploy, then **immediately** `npm run put-overlay:<env>`. On TEST that
window is free (Basic Auth, no visitors). On PROD it is real downtime, and there
is no atomic swap over FTP. A routine redeploy onto a server whose `.htaccess`
is already current does not touch it.

---

## Scramble: an `extensions` entry that names no class is silently dropped

`config/scramble.php`'s `extensions` array takes every kind of Scramble
extension. Each pipeline that reads it keeps the entries that are `is_a()` its
own base class, so a name that resolves to no class matches none of them and
disappears without a warning. The file has no namespace: `MyExtension::class`
without a `use` line names the global `\MyExtension`, which does not exist.

The symptom is nothing at all. The export succeeds, the document is unchanged,
and nothing logs a warning. **Diagnose it by putting a `throw` in `handle()`.**
If the export still succeeds, the class is never reached, and the problem is
how it is listed, not what it does.

Until 2026-10-19 this entry said an `OperationExtension` listed in that array is
never called. That is wrong for Scramble 0.13.36. A throwing extension listed
only there failed the export, and moving `DocumentsFailureModes` there from
`AppServiceProvider` left `api/openapi.json` byte-identical. The same throwing
extension listed without its `use` line let the export pass, which matches what
was seen on 2026-09-11 and is the likely cause of the old conclusion.

Operation extensions from the array run before the ones `AppServiceProvider`
registers with `withOperationTransformers()`, because Scramble's own provider
boots first. This project keeps all four of its own in the provider, so their
order is in one list.

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
`content` as `Schema` while `setContent()` accepts a `Reference`. Keep the
`@phpstan-ignore instanceof.alwaysFalse` with its note.

## Scramble: what breaks a field's type and what leaks into descriptions

Three ways the exported document quietly stops matching the code. In each,
`openapi-drift` stays green, because it only proves the document matches what
Scramble inferred. Check the generated type (`web/src/api/generated/model/*.ts`)
after changing a field shaped like these.

- **A helper hides nullability.** Scramble reads the expression, not a
  helper's signature, so a helper returning `?string` can publish as `string`
  and make an optional field required for every client. Write the null case at
  the call site: `$this->x === null ? null : Iso8601::utc($this->x)`, as
  `EventResource` does.
- **A comment above an array key becomes that property's `description`.** Hoist
  an implementation note above the whole statement, or out of the literal
  (`ApiError::json()` shows how).
- **A raw `$request->attributes->get(...)` read types as the wrong primitive.**
  `ParameterBag::get()` is untyped, so Scramble published
  `EventResource::answerableCount` as `string | null`. An explicit `(int)` on
  the non-null branch makes it `number | null`.

## Scramble: CRLF in a PHP file collapses summary and description

Scramble splits a docblock into `summary` and `description` on `\n\n`. A file
with CRLF endings has none, so the whole block becomes one `summary` with
literal `\r\n` inside, no `description` is emitted, and `/api/docs` prints the
paragraph as an operation title.

On Windows this happens without touching a line ending on purpose: a script
rewrites a PHP file in text mode, the pre-commit Pint pass normalises it back
to LF, and an `npm run openapi` run in between records a shape no checkout
reproduces. CI then fails `openapi-drift` with a diff that looks like an orval
version disagreement. **Generate after the PHP is normalised**, and when the job
fails on a document you just regenerated, check this first:

```bash
grep -cF '\r\n' api/openapi.json   # must be 0
```

## Scramble: an `(object)` cast publishes as a scalar

`InboxController::summary()` returns `(object) $counts` so an empty map
serializes as `{}` rather than `[]`. Scramble has no handler for casts and
published `counts` as `string`, while the JSON on the wire was right.
`openapi-drift` cannot catch it.

The fix is a `@return array{...}` docblock on the method. That disagrees with
the native `JsonResponse` return type, so PHPStan needs a targeted
`@phpstan-ignore return.phpDocType` beside it. The two travel together.

## Scalar: a heading wrapped in backticks gets no route

Scalar builds each heading's anchor from its plain text, so a heading entirely
inside a code span slugifies to nothing, and every such heading collapses to the
same empty route:

```markdown
### `validation_failed`   ->  api-1/description/          (empty, collides)
### validation_failed     ->  api-1/description/validation-failed
```

Put the formatting in the line below the heading instead.

## `$request->session()` throws — and being authenticated does not imply a session

It raises `RuntimeException: Session store not set on request` rather than
returning null. A request Sanctum has not treated as stateful (no `Origin` in
`SANCTUM_STATEFUL_DOMAINS`) can still reach an authenticated branch with no
session: `AuthController::login` right after `Auth::attempt()` is the case
today, and it answered 500 until it was guarded. `NonStatefulRequestTest` now
drives that path.

Guard with `$request->hasSession()` wherever a session is touched. The
unguarded `session()` calls in the password controllers are safe only because
there are no API tokens (ADR 0010); adding a token credential would make them
reachable.

## :5173 serves the checkout the stack was started from

The compose `assets` service publishes a Vite dev server on 5173 and mounts
**the repo root compose was started from**. From that checkout it is the dev
server, and `.claude/launch.json` attaches to it. From another worktree it
serves the OTHER tree's `web/`: everything renders, nothing you changed is
there, and it reads as a broken build.

In a worktree, run a dev server of its own. `vite.config.ts` honours `PORT` and
the dev stack is stateful on any localhost port, so `PORT=5180 npm run dev:web`
works. It proxies to whatever :8090 is running; point `VITE_API_PROXY_TARGET`
elsewhere if the branch also changes `api/`.

**`npm run dev` is not a dev server.** It is `build-overlays.mjs docker &&
docker compose up -d --build`, and from a second directory it starts a SECOND
compose project racing the first for 8090, 5173, 3307, 8025 and 8091.

Two DbGate containers are their own race, because cookies ignore the port:
each signs the browser's token with the `.key` in its own `/root/.dbgate`
volume, so one rejects the other's token and both log
`DBGM-00098 Sending invalid token error` until the cookie is cleared. Dropping
the `dbgate_data` volume does the same to one stack.

## The dev stack is stateful on ANY localhost port, deliberately

`SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` is
`localhost:*,127.0.0.1:*`. Sanctum matches the Origin with `Str::is()`, so `*`
is a real pattern, and an origin missing from the list falls out of stateful
mode. It is a wildcard because each worktree's dev server takes whatever port
is free; narrowed back to a list, everything works except signing in on the
unlisted port. `POST /api/v1/login` then answers **400
`stateful_request_required`** ("Cette requête ne peut pas ouvrir de session").
`NonStatefulRequestTest` pins the wildcard, the list and the foreign host.

**Never let that wildcard reach a server.** `api/.env.example` carries
`CHANGE_ME`, and each server names its own origin.

## MariaDB 10.3: the second `timestamp` column in a table

A migration with two of them fails outright:

```
SQLSTATE[42000]: 1067 Invalid default value for 'expires_at'
```

`explicit_defaults_for_timestamp` is off on this version and on the host, so the
first `TIMESTAMP NOT NULL` column implicitly gets `DEFAULT CURRENT_TIMESTAMP ON
UPDATE CURRENT_TIMESTAMP` and every later one `'0000-00-00 00:00:00'`, which
strict mode refuses. The column named in the error is the innocent one.

Use `$table->dateTime(...)` for both; the code writing the row supplies the
value. `2026_09_12_000001` is the worked example.

## A negative assertion goes vacuous when its control moves behind a menu

`RowActions` (`web/src/components/RowActions.tsx`) puts a row's less frequent
actions behind a `…` trigger, and a Radix menu item is not in the DOM until the
menu opens. So

    expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();

stops proving that somebody without `events.manage` cannot delete, and passes
for everyone. Converting `/events` onto `RowActions` left such assertions green
while they guarded nothing, and you need to know this before opening the test
file, because afterwards the suite is green either way.

**What to write instead:** `expectNoSuchAction` in
`web/src/pages/Events.test.tsx`. It asserts no inline link, no inline button and
no overflow trigger on the page; the third clause carries the meaning, because
with fewer than two leftover actions `RowActions` draws no trigger. Match the
trigger with `aria-haspopup="menu"`, never its French name, or the clause passes
vacuously on `/de/*`.

**Then watch it fail.** Remove the permission gate the assertion guards, confirm
it goes red, restore the gate. Where no mutation isolates a line, write that
down.

## `bcrypt()` in a test against an argon2id app

`Member::factory()->create(['password' => bcrypt('x')])` throws `Could not
verify the hashed value's configuration` during `create()`: the `hashed` cast on
`Member::password` verifies an already-hashed value against the configured
argon2id driver. It reads as a framework error, not a failed assertion. Pass
the plain string and let the cast hash it, or use `Hash::make()`.

## `fr.ts` writes the apostrophe two ways

`web/src/i18n/fr.ts` uses the STRAIGHT apostrophe (`'`) in its `errors`,
`validation` and `registers` sections ("L'export Excel n'est pas disponible",
"Quelqu'un a modifié cet élément") and the typographic one (`’`) in most other
copy ("Ce qu’on réserve"). The two sit side by side on screen.

A test that matches a message on the wrong character fails as **"unable to find
the text"**, which reads as a message that is not rendered. Check the catalogue,
not your keyboard.

## Multipart is POST-only in PHP, and a list needs brackets

PHP fills `$_POST` and `$_FILES` only for a `POST`. A multipart `PUT` or `PATCH`
reaches Laravel with an empty body, so validation answers "required" for files
that were plainly sent. The image upload is `POST /images` for that reason; do
not "fix" it into a `PUT`.

PHP also keeps only the LAST of several parts that share a bare name. The
upload sends each size of a photo as `files[]`; sent as `files`, which is what
the generated `imageStore()` does, only the smallest size arrives, passes every
check, and the library stores a 480px photo. `uploadViaApi()` and
`replaceViaApi()` in `web/src/images/useUploadQueue.ts` build their own bodies
for that reason. Keep both off the generated functions.

## Laravel's `image`, `mimes` and `dimensions` rules need extensions this host may lack

`image`, `mimes`, `mimetypes` and `dimensions` need `fileinfo`. Nobody has
recorded which extensions the host loads, and without `fileinfo` the rule fails
on a valid file or throws. `App\Support\JpegInspector` needs only
`getimagesize()`, which is core PHP; use it (ADR 0028).

## `inline-block` is 32px wide here

`web/src/styles.css` names a spacing token `block` (`--spacing-block: 2rem`).
Tailwind 4 builds the `inline-*` utilities, which set `inline-size`, from the
spacing scale, so `.inline-block` matches two rules: `display: inline-block`
and `inline-size: var(--spacing-block)`. A badge with that class is 32px wide,
and its words run out of the background one per line. jsdom applies no CSS, so
the suite cannot see it.

Wrap the badge in a `flex` container and leave the class off, as the draft badge
in `EventCard.tsx` and the roster pill in `Members.tsx` do.

## `Log::warning` never reaches a server's log

`api/.env.example` sets `LOG_LEVEL=error`, and the Docker stack runs at
`debug`. A warning shows up locally and is dropped on every server. Log a
failure somebody must act on, such as a mail that did not go out, at `error`,
as `ContactController` and `RegistrationController` do.

## `app()->environment()` in a config file takes down every route

Config files load before the container binds `env`, so the call throws
`Target class [env] does not exist` at boot and every request fails. Read
`env('APP_ENV')` instead, as `config/docs.php` does.

## Compare stamps on Carbon's clock, never `time()`

`$this->travel()` and `travelTo()` move Carbon's clock only. Code that compares
a stored stamp against `time()` keeps the real clock, so a test that travels
sees the wrong answer, and one that does not can fail only at certain hours of
the day. Use `now()->timestamp`.

## Travelling to a fixed date logs the test out

A test that `travelTo()`s a literal calendar date loses the session
`actingAsMember()` gave it, and every request answers 401. A test asserting a
refusal reads that as a pass. Travel relative to today instead, as
`EventIndexTest` does with `CarbonImmutable::now(BandTime::ZONE)->setTime(10, 0)`.
