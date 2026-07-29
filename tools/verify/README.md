# Site verification harness

Checks the *running site*, which neither plugin suite can: real HTTP, real
sessions, real nonces, rendered markup, and database content. Roughly 120 checks.

The plugin's own suites (`npm run wp:test` — 62 unit, 51 integration) remain the
authority on plugin logic. These scripts cover the parts that only exist once
WordPress, the theme and the content are all in play.

**Requires the stack up** (`npm run wp:dev`) and, for most of them, the content
seeded. See `docs/continue-here.md`.

## Running them

The `.ps1` suites need PowerShell 7 and the `.sh` ones need Git Bash — that is
simply what they were written against on the desktop. Nothing here runs in a
Claude Code web session, which has no Docker at all.

```powershell
# from the repository root
foreach ($s in 'hreflang','nav-and-footer','patterns','header','content') {
  "$s : " + (& "tools/verify/$s.ps1" | Select-String 'TOTAL=')
}
```

```bash
bash tools/verify/agenda.sh        # creates ONE event, checks both trees, deletes it
bash tools/verify/photo-slots.sh   # counts the prepared image blocks in stored content
bash tools/verify/locale.sh        # what locale the site is actually running in
```

Each `.ps1` prints a table and a final `TOTAL=n FAILED=n`.

| Script | What it protects |
| --- | --- |
| `hreflang.ps1` | reciprocal, self-referential `hreflang` pairs; `x-default`; nothing emitted for pages outside the two trees |
| `nav-and-footer.ps1` | the per-language navigation resolves per tree, including on deep pages; the footer is ours and carries none of Twenty Twenty-Five's dead links |
| `patterns.ps1` | the three block patterns render in the shape the real site has (heading → photo → text), and no card-grid markup survives |
| `header.ps1` | header carries the site title, the per-tree nav and the switcher; the footer switcher still works |
| `content.ps1` | the ported French copy is actually present; German is German; contact form renders with French labels; login entry points exist |
| `agenda.sh` | the agenda on both trees: French vs numeric German dates, `Event` JSON-LD, correct seasonal UTC offset, `url` pointing at the right page |
| `photo-slots.sh` | the 24 prepared image blocks exist in stored content |

## The locale scripts

`wplang-hunt.sh` and `wplang-control.sh` are an **investigation** harness, not a
regression suite. The site locale has twice silently reverted to `en_US` and the
cause is still unknown; a tracer is armed at
`docker/wp/mu-plugins/zz-wplang-tracer.php`.

```bash
bash tools/verify/wplang-control.sh                 # prove the tracer still fires
bash tools/verify/wplang-hunt.sh "label" <command>  # run a candidate, report before/after + trace
```

**Run `wplang-control.sh` before trusting any hunt result.** Two earlier versions
of that tracer were silently broken and reported innocence for everything.

## A warning about these scripts

Four assertions written the day this harness was built passed **vacuously** —
they matched something incidental rather than the behaviour claimed:

- checking a title could not break out of a `<script>` block, while WordPress had
  already stripped the payload upstream, so nothing was tested;
- asserting `wp-block-image` was present, which matched a **stylesheet** string —
  an unset `core/image` block emits no `<figure>` and no `<img>` at all;
- asserting the German sponsors page contained *French* headings, left over from
  before it was translated;
- using PowerShell's `-notmatch`, which is **case-insensitive**, so `'Themes'`
  matched `/wp-content/themes/` in every asset URL.

If you add a check here, make it fail on purpose first. A green suite is worth
exactly what its weakest assertion is worth.
