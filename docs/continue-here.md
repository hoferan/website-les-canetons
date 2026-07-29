# Where we left off — 2026-07-29

Read this first when picking the WordPress rebuild back up. It records state that
is **not** derivable from the repository, because content lives in the database
(spec §10) and some of what matters is a decision still open rather than code.

Branch: `feat/wordpress-migration`, everything committed and pushed, 20 commits
that day. No PR — deliberately, by request.

## Start the stack

```bash
npm run wp:dev      # start
npm run wp:setup    # idempotent; ALSO the fix if the site locale has drifted
npm run wp:test     # unit 62, integration 51 — both must be green
```

Site: http://localhost:8100 · wp-admin `admin` / `admin` · Mailpit
http://localhost:8026 · phpMyAdmin http://localhost:8101

## What exists now

Phases 1–4 of `docs/desktop-bringup.md` are done. Beyond that checklist:

- **Ten informational pages per tree**, `/fr/*` and `/de/*`, carrying the **real
  French copy ported from lescanetons.org** and **German drafts that need a native
  read**. Plus `/fr/agenda/` + `/de/termine/` (the public event list) and
  `/fr/contact/` + `/de/kontakt/`.
- **Per-language navigation.** WordPress has no per-language menu; a
  `render_block_data` filter in the theme resolves `core/navigation` from
  `canetons_current_language()`, keyed to the `Menu FR` / `Menu DE` wp_navigation
  posts. Rename those menus and you must update `canetons_language_menus`.
- **Header and footer are theme files**, `parts/header.html` and
  `parts/footer.html`, overriding Twenty Twenty-Five. Do NOT re-do these in the
  Site Editor: an editor change lives only in the database and no deploy carries
  it.
- **`hreflang` alternates** from the `_canetons_lang_alt` twin meta on every page.
- **`Event` JSON-LD** on the agenda pages, from `src/EventSchema.php`.
- **`npm run wp:snapshot` / `wp:snapshot:list` / `wp:restore <name>`** — local
  database + uploads snapshots, with a locale guard (see below).

## Open decisions, in priority order

1. **The contact form emails nobody.** It renders and stores submissions, but has
   **no email notification** — neither does Fluent Forms' own bundled demo form,
   whose settings it was cloned from. Configure it in Fluent Forms → Settings →
   Email Notifications. Until then, messages collect in wp-admin unseen, and
   requirement 1.6 is not really met.
2. **Who currently directs the band?** The live site contradicts itself and all
   three versions were ported as-is. `historique` says Delphine Maillard and Laura
   Mantel passed the baton to **Lilou Keller and Anaïs Meuwly**; `/fr/canetons/`
   says "Laura et Delphine"; the comité lists Laura Mantel as Responsable Team
   Direction. One of these is stale.
3. **Personal contact details.** Deliberately NOT ported, and flagged with a TODO
   in the copy naming what the old site published: the comité's email and phone,
   and two mobile numbers on `/fr/commencement/`. The organisational address
   `comite@lescanetons.org` on the CD page WAS ported.
4. **Photographs.** 24 empty image blocks are prepared and captioned across the
   canetons, comité, moniteurs and accueil pages. An unset image block renders
   nothing on the front end — no broken image, but also no visible gap, so the
   pages look text-only until you upload. Upload through the Media library, never
   as hardcoded URLs, or you lose `srcset`, lazy loading and the WebP sizes.
5. **The visual pass** — Duck & Brass rendering, the three patterns in the
   inserter. Never done; it is the one thing that genuinely needs your eyes.

## Traps worth knowing before you touch anything

**The site locale silently reverts to `en_US`.** It happened twice and is
**unexplained**. `npm run wp:setup` fixes it. Symptom: French dates render as
"Saturday 5 December 2026"; the German tree looks fine because its dates are
numeric, so the French tree is your canary.

- A tracer is **armed** at `docker/wp/mu-plugins/zz-wplang-tracer.php`. It logs
  every write to the option with a backtrace, SAPI and argv, to
  `wp-content/wplang-trace.log`. Its docblock lists the seven candidates already
  exonerated — do not re-test them. **Check that log the next time the locale
  drifts**, then fix the cause and delete the file.
- `wp:snapshot` warns when the locale is wrong and records it in a manifest;
  `wp:snapshot:list` marks a bad snapshot `<-- WRONG`. This exists because a
  snapshot captured the empty value once and `wp:restore` faithfully put it back.
  **Never seed TEST from a snapshot flagged WRONG.**

**Content is not in git, by design.** It lives in the `wp_db_data` and `wp_core`
Docker volumes, and `npm run wp:reset` destroys both — including uploads. The only
other copy is `.snapshots/`, which is git-ignored and on this machine only. Take a
snapshot before anything risky.

**Empty `core/image` blocks and front-end assertions.** Four separate test
assertions written that day passed *vacuously*, matching incidental strings rather
than the behaviour claimed. If you add a check, make it fail first on purpose.

## Next steps

1. Close the five open decisions above (1 and 2 are the blocking ones).
2. Upload photographs; correct the German.
3. Then Phase 5 of `docs/desktop-bringup.md` — seed TEST. Add a **locale check
   after the import**, which the checklist does not yet have.
4. Then `docs/cutover.md` for PROD.
