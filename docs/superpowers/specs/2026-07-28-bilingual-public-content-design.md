# Design — bilingual public content (fr-CH + de-CH)

**Date:** 2026-07-28
**Amends:** `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` §2.
It relaxes that design's **French-only** decision for the *public* pages, while
keeping its "no translation layer in code" principle intact.

## Context

The migration design (§2) made the site French-only and deliberately avoided any
translation layer — user-visible strings are French literals, in the theme and
the plugin. The site owner now wants the **public** site in **French (Swiss) and
German (Swiss)**, and wp-admin available per user in **de-CH, fr-CH and
(optionally) en-US**.

WordPress separates two things that are easy to conflate:

- **Interface translation** (wp-admin, core, plugin/theme UI strings) is native,
  via gettext locales. Each user can pick their **own** admin language
  (Users → Profile), independent of the site.
- **Content translation** (the same page in two languages, with a switcher) is
  **not** native — core translates the software, not your content. It normally
  needs a multilingual plugin (Polylang, WPML, TranslatePress).

This design takes a deliberately plugin-free middle path for the content.

## Decision

**Two manually-authored page trees, `/fr/*` and `/de/*`, and no multilingual
plugin.** The bilingual-ness lives entirely in hand-authored content; the code
stays monolingual.

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Public bilingual mechanism | **Two manual page trees** (`/fr/…`, `/de/…`) via WordPress page hierarchy | Polylang / WPML / TranslatePress (a 7th plugin); machine-translation proxy |
| Plugin & members' area language | **French only** — not internationalised | Wrapping every plugin literal in gettext + a `de_CH` catalog |
| wp-admin languages | **Native per-user language** (de-CH, fr-CH via fr_FR, en-US) | A plugin; forcing one admin language |
| Site locale | **`fr_FR`** (there is no official `fr_CH`) | Inventing/maintaining a custom `fr_CH` locale |
| `<html lang>` per page | Set by a small **theme filter** from the URL tree (`fr-CH` / `de-CH`) | Leaving every page at the single site locale |

### Why plugin-free is acceptable here

The one thing a manual tree cannot switch is the **plugin's dynamic strings** —
the planning list and RSVP buttons render hardcoded French, and without a plugin
there is no per-request "this is German" signal to flip them. But that surface is
the **members' area**, and the members are French-speaking, so it stays French by
design. The bilingual requirement therefore falls entirely on **static
informational pages**, which are hand-authored content — no code translation, and
spec §2's "no translation layer" holds.

## The locale reality

- **`de_CH`** is an official WordPress locale (Swiss High German; a
  `de_CH_informal` "du" variant also exists and suits a youth band). Install it
  for admin users who want German.
- **`fr_CH` does not exist** as an official WordPress translation. Swiss-French
  sites use **`fr_FR`**. The site locale is therefore `fr_FR`; the visible
  `<html lang>` is set to `fr-CH` / `de-CH` by the theme, independently of the
  WordPress locale (a `lang` attribute is a free BCP-47 tag).
- **`en_US`** is the built-in default and needs no translation file.

## Theme helpers (in the `canetons` theme, not a plugin)

`functions.php` gains three small, filterable helpers — no build step, no plugin:

1. **`canetons_languages()`** — the tree map `slug => BCP-47 tag`
   (`fr => fr-CH`, `de => de-CH`), filterable.
2. **A `language_attributes` filter** — sets `<html lang="de-CH">` on `/de/*` and
   `lang="fr-CH">` elsewhere, derived from the queried page's top-level ancestor
   (falling back to the URL's first segment). Fixes the accessibility/SEO nit of
   German pages otherwise claiming to be French.
3. **`canetons_language_switcher()` / `[canetons_language_switcher]`** — a
   switcher linking to the other tree's landing page, or to a per-page override
   URL in the `_canetons_lang_alt` post meta when a precise counterpart is wanted.
4. **An optional root redirect** — sends the bare `/` to `/fr/` so both languages
   are symmetric; disable or retarget via the `canetons_root_redirect` filter.

## Content workflow

- Create top-level pages **`fr`** and **`de`** (the tree roots), then author each
  informational page as a **child** of one — `Accueil` under `fr` → `/fr/accueil/`,
  `Aktuell` under `de` → `/de/aktuell/`.
- Build **two menus**, one per language, and place the switcher in the header.
- Set the site language to **French (fr_FR)** in Settings → General; each admin
  who wants German or English sets it on their own profile.
- The members' planning page stays French (one tree, or linked from both).
- This composes with the content-propagation design: both trees are ordinary
  content and travel in the same one-time seed import.

## What is given up (honestly)

- **No automatic page↔page mapping** beyond the optional `_canetons_lang_alt`
  meta: the switcher otherwise lands on the other tree's home, not the exact
  counterpart. Acceptable for a small site; the override covers the pages that
  need precision.
- **No `hreflang` alternate tags** telling search engines the two pages are
  translations. The per-page `lang` attribute is set; cross-linking `hreflang`
  is a possible later addition if SEO ever warrants it.
- **Duplicate maintenance** — two copies kept in step by hand. Inherent to any
  bilingual site (a plugin only adds bookkeeping, not fewer copies).

## Non-goals

- No multilingual plugin, and no internationalisation of the `canetons-planning`
  plugin or the members' area — both stay French (spec §2's code principle).
- No machine translation.
- No third (or more) language; the helpers are filterable if that ever changes,
  but the `_canetons_lang_alt` single-override assumes exactly two trees.

## Risks

| Risk | Mitigation |
| --- | --- |
| A page is edited in one language and its twin forgotten | Inherent to manual bilingual content; the switcher's per-page override makes twins easy to find, and the pair is small (nine pages) |
| German visitors see French planning/RSVP text | By design the members' area is French; if a German members' area is ever needed, that is the point to reconsider a plugin |
| Search engines treat the trees as unrelated/duplicate | Per-page `lang` is correct; add `hreflang` cross-links later if SEO matters |
| The root redirect interferes with a chosen static front page | It fires only on the bare front page and is disabled by returning '' from `canetons_root_redirect` |
