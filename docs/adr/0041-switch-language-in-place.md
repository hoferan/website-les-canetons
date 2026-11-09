---
status: accepted
date: 2026-11-09
decision-makers: André Hofer
---

# Switch language in place, keeping the locale in the path

## Context and Problem Statement

ADR 0023 put the locale in the URL, French at `/` and German under `/de/*`, and made switching language a full page load. Two shortcuts left no other way: on a German page the router was mounted with `basename="/de"`, which cannot change while the app runs, and `t()` is a plain function on the assumption that the language never changes during a page's life.

The reload cost a visitor little, since a visitor switches once. It cost a lot in the block editor. Since #357 the page is the editor's preview, and #368 asked to see the German page while editing the French one. A reload throws away what was typed, so #368 had to carry the draft through `sessionStorage` and reopen the right editor on the other side, for every kind of block. In the review of #368 André asked why other applications switch language without a reload (#369).

The locale in the URL is still right: a shared `/de/join` opens in German, and Google indexes both languages through the `hreflang` alternates. How does the app change language without leaving the page?

## Considered Options

- One router for both languages, the route table matching the path without `/de`
- Keep the reload, and carry editor state across it in `sessionStorage`
- Keep the language out of the URL, in a stored preference

## Decision Outcome

Chosen option: "One router for both languages", because it removes the reload from every screen at once, where the hand-over would have covered the block editor alone.

The router is mounted at the app's base, the same for both languages. `LocaleFromUrl` in `web/src/i18n/routing.tsx` sits above the route table. On every navigation it reads the locale from the path and sets i18next to it, which is synchronous because both catalogues are in memory. It updates `<html lang>` and the document metadata, and hands the route table the location without the German segment. So `/join` and `/de/join` render the same components, and a switch keeps them mounted with their state.

The route table calls `useLocale()`, so a change of language renders it again, and every page with it. Without that call React would skip the pages: their elements are made once, and `t()` subscribes to nothing.

App links add the prefix themselves. `Link`, `Navigate` and `useNavigate` come from `i18n/routing.tsx`, which resolves the path and puts it under `/de` on a German page. The header's switch is one of these links, pointed at the other locale.

The leave guard compares paths without the German segment, and `ScrollToTop` sees them that way too, so a switch neither asks before leaving nor scrolls to the top.

This replaces the full page navigation and the per-language `basename` of ADR 0023. The rest of 0023 stands.

### Consequences

- Good, because switching language keeps what is on screen: an open block editor, a half-filled form, the scroll position.
- Good, because #368 needs no hand-over, since its switch can be a link.
- Bad, because a text kept in state keeps the language it was made in. An error or a toast already on screen stays in the old language until the next action replaces it. Translated text is computed while rendering, never kept in state or a memo.
- Bad, because every app link and navigation has to come from `i18n/routing.tsx`. The router's own drop the German prefix.

### Confirmation

ESLint's `no-restricted-imports` refuses `Link`, `NavLink`, `Navigate`, `useNavigate` and `redirect` from `react-router-dom` outside `i18n/routing.tsx` and the tests. `switchInPlace.test.tsx` types into the contact form and switches, and fails if the field loses its value, if a label stays French, or if the leave guard asks. The e2e `locale.spec.ts` fails if the switch loads the document again.

## Pros and Cons of the Options

### Keep the reload, and carry editor state across it in `sessionStorage`

- Good, because it touches only the editor.
- Bad, because every block type needs its own way back into its editor, with stale drafts to detect, and every other form still loses its input on a switch.

### Keep the language out of the URL, in a stored preference

- Bad, because a shared link would open in the reader's language instead of the sender's, which ADR 0023 rejected.

## More Information

ADR 0023 has the reasons for the locale in the path. Issues #369 and #368.
