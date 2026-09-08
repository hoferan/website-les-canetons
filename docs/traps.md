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
