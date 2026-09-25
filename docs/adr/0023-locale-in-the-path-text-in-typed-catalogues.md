---
status: accepted
date: 2026-09-18
decision-makers: André Hofer
---

# Put the locale in the URL and every string in two typed catalogues

## Context and Problem Statement

Fribourg is a bilingual canton, and German shipped as a real second language between
2026-09-18 and 2026-09-21. Until then French lived inline in the JSX. A link has to
open in the language it was shared in. The API emits only English machine tokens
([ADR-0012](0012-errors-are-problem-documents-without-language.md)), so all
translation has to happen in the SPA.

The `.htaccess` catch-all already serves the shell for any path
([ADR-0003](0003-laravel-inside-the-document-root-behind-htaccess.md)), so a language
prefix needed no server change.

How does the SPA decide the language of a page, and where does its text live?

## Considered Options

- The locale in the URL path, and every string in two typed catalogues
- A stored preference that overrides the URL
- Detecting the browser's language
- A feature flag for German
- Swiss German dialect

## Decision Outcome

Chosen option: "The locale in the URL path", because a link then opens in the
language it was shared in, and the catch-all already serves the shell for any path, so
the prefix needed no server change.

French is unprefixed at `/` and German lives under `/de/*`. `/de` is matched as a
whole path segment, so a future `/design` is not German. The router mounts with
`BrowserRouter basename`, so no link or `navigate()` call had to change. The API and
`/sanctum` are never prefixed.

The URL is the only authority on the language. A stored preference is read in one
place, a visit to the bare `/`, which then redirects to `/de`. The browser's language
is never consulted. Switching language is a full page navigation.

All user-facing text lives in `web/src/i18n/fr.ts` and `de.ts`. Components call a
typed `t()` exported from `web/src/i18n/index.ts`. There is no `react-i18next`, no
provider and no hook, because the language never changes during a page's life.
Because i18next starts at module scope, nothing may be translated at module scope; the
nav arrays carry keys instead of labels.

German uses the formal *Sie* to mirror the French *vous*, and `/join` uses *du* to
mirror the *tu* aimed at children. Dates use `Europe/Zurich` and one Intl tag per
language, `fr-CH` and `de-CH`.

`web/index.html` stays one French shell. `applyDocumentMeta` localises the title,
description and manifest at runtime.

### Consequences

- Good, because a shared link opens in the language it was shared in.
- Bad, because every string costs two translations, permanently.
- Bad, because anything that sets `window.location` directly bypasses the prefix and
  has to add it.
- Bad, because Open Graph tags stay French. Their readers run no JavaScript, and a
  second shell would need a rewrite rule in the server-owned `.htaccess`.

Text people type, such as event titles and names, is content and is shown as typed. A
register or role name reads the same on both pages until the role editor stores
labels per language ([ADR-0014](0014-authorize-by-permission-never-by-role.md)).

### Confirmation

`de.ts` is declared `typeof fr`, so a key in one catalogue and not the other fails
`npm run typecheck`.

## Pros and Cons of the Options

### A stored preference that overrides the URL

- Bad, because it would show a shared German link in French.

### Detecting the browser's language

- Bad, because the URL is the only authority on the language, and a shared link has to
  open in the language it was shared in.

### A feature flag for German

- Bad, because it would add a server `.env` key
  ([ADR-0005](0005-server-owned-files-never-travel-with-a-deploy.md)).

### Swiss German dialect

- Bad, because it has no standard spelling.
