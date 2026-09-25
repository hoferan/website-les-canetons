# 0023. Put the locale in the URL and every string in two typed catalogues

Status: Accepted, 2026-09-18

## Context

Fribourg is a bilingual canton, and German shipped as a real second language between
2026-09-18 and 2026-09-21. Until then French lived inline in the JSX. A link has to
open in the language it was shared in. The API emits only English machine tokens (ADR
0012), so all translation has to happen in the SPA.

The `.htaccess` catch-all already serves the shell for any path (ADR 0003), so a
language prefix needed no server change.

## Decision

French is unprefixed at `/` and German lives under `/de/*`. `/de` is matched as a
whole path segment, so a future `/design` is not German. The router mounts with
`BrowserRouter basename`, so no link or `navigate()` call had to change. The API and
`/sanctum` are never prefixed.

The URL is the only authority on the language. A stored preference is read in one
place, a visit to the bare `/`, which then redirects to `/de`. The browser's language
is never consulted. Switching language is a full page navigation.

All user-facing text lives in `web/src/i18n/fr.ts` and `de.ts`. `de.ts` is declared
`typeof fr`, so a key in one and not the other fails `npm run typecheck`. Components
call a typed `t()` exported from `web/src/i18n/index.ts`. There is no
`react-i18next`, no provider and no hook, because the language never changes during a
page's life. Because i18next starts at module scope, nothing may be translated at
module scope; the nav arrays carry keys, not labels.

German uses the formal *Sie* to mirror the French *vous*, and `/join` uses *du* to
mirror the *tu* aimed at children. Dates use `Europe/Zurich` and one Intl tag per
language, `fr-CH` and `de-CH`.

Rejected: a stored preference that overrides the URL, which would show a shared German
link in French; detecting the browser's language; a feature flag for German, which
would add a server `.env` key (ADR 0005); and Swiss German dialect, which has no
standard spelling.

## Consequences

Every string costs two translations, permanently.

Text people type, such as event titles and names, is content and is shown as typed. A
register or role name reads the same on both pages until the role editor stores
labels per language (ADR 0014).

Anything that sets `window.location` directly bypasses the prefix and has to add it.

`web/index.html` stays one French shell. `applyDocumentMeta` localises the title,
description and manifest at runtime; Open Graph tags stay French, because their
readers run no JavaScript, and a second shell would need a rewrite rule in the
server-owned `.htaccess`.
