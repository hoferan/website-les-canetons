# The shell's metadata on a German page

Design for [#172](https://github.com/hoferan/website-les-canetons/issues/172),
split out of the German locale work as the one part that was a decision rather
than a set of mechanical fixes. Decided 2026-09-21.

Premise: [2026-09-18-german-locale-design.md](2026-09-18-german-locale-design.md).

## The problem

`web/index.html` is a single static shell serving every path, so everything in
its `<head>` is French whatever locale the visitor is reading. `#159` shipped
the `hreflang` alternates, which now point crawlers at pages whose static shell
contradicts them.

## What actually decides this

The issue lists seven items and three options. The useful axis is neither of
those: it is **who reads each tag, and whether that reader runs JavaScript.**

| Item                          | Reader                                           | Runtime injection    |
| ----------------------------- | ------------------------------------------------ | -------------------- |
| `<title>`                     | a person — tab, bookmarks, history, tab switcher | **works**            |
| `<meta name="description">`   | Google, which renders JS in a second pass        | **mostly works**     |
| manifest `name` / `start_url` | the browser at install time, after JS has run    | **works**            |
| `og:*`                        | WhatsApp, Facebook, Signal — **no JS**           | **achieves nothing** |
| `<html lang="fr">`, static    | a crawler with no JS                             | **achieves nothing** |
| `<noscript>`                  | a visitor with no JS, by definition              | **achieves nothing** |

So option 1 is not "cheap but weak" across the board. It is a complete fix for
the first three and literally worthless for the last three. Only option 2 — two
shells emitted by `tools/build.mjs` — touches those, and it costs a rewrite rule
in the **server-owned `.htaccess`**: never uploaded by a deploy, hand-placed on
TEST, QA and PROD, on a file CLAUDE.md records two separate site-wide outages
from.

## The decision

**Runtime injection for the three that work; leave the three that do not, and
write down why.**

Traded away: a German page shared on WhatsApp previews with the French title and
description. Accepted, for a children's band in Fribourg, against hand-editing
`.htaccess` on three servers. Revisit if German pages are ever shared enough to
notice — the two-shell option stays open and nothing here blocks it.

One honest static signal is added in exchange: `og:locale:alternate` = `de_CH`,
which says the content exists in German without claiming this document is it.

### Not in scope

`<title>` is today a **single static string for the whole site**, in either
language — there is no per-page title machinery. This design localises that one
string. Per-page titles are a separate, larger feature and are not started here.

## Components

### `web/src/i18n/documentMeta.ts`

One exported function, `applyDocumentMeta(locale)`. It sets `document.title`,
sets the `<meta name="description">` content, and repoints
`<link rel="manifest">` at the locale's manifest.

Called from `main.tsx` on the line after
`document.documentElement.lang = htmlLang(locale)`. Both corrections patch the
static shell for this boot, so they belong together; both sit inside the
existing `else`, because the redirecting branch navigates away.

**It runs for both locales, one code path.** For French it rewrites identical
values. A `locale === "de-CH"` guard would mean the French path was never
exercised, and the first bug in it would ship.

### Catalogue

A new `meta: { title, description }` section in `fr.ts` and `de.ts`. The French
values are copied verbatim from the shell.

### `web/public/assets/icons/manifest.de.json`

Differs from the existing manifest by **exactly one field**, `start_url: "/de"`.
"Guggenmusik Les Canetons de Fribourg" is the band's name preceded by a German
word, so `name` and `short_name` need no translation at all.

`lang` is added to both files — honest metadata, currently missing.

Neither file sets `id`, so `start_url` _is_ the app's identity and the two
install as two separate apps. That is correct: they are two language editions,
and someone who installs both wanted both.

### `web/index.html`

One static line, `og:locale:alternate`. The comment block at `:20-31` is
extended to record why `og:*`, the static `<html lang>` and the `<noscript>` are
deliberately left French, so that a later reader does not "fix" them at runtime
and believe the problem solved.

## The accepted cost, written down

On `/de/agenda` the browser paints the French title before `main.tsx` runs and
swaps it. One shell, one static `<title>`, so this is unavoidable — the same
class of compromise as `<html lang>` already being corrected at runtime rather
than served correctly.

## Testing

1. **`documentMeta.test.ts`**, jsdom. French leaves the shell's values in place;
   German replaces all three, manifest href included.
2. **A drift guard.** Reads `web/index.html` and asserts `fr.meta.title` and
   `fr.meta.description` equal what the shell actually ships. Without it the two
   copies drift silently and a French visitor gets a flash of one title being
   replaced by a different one — a failure invisible to every other test in the
   suite, because both values are individually valid.
3. **An e2e assertion** that `/de/agenda` has a German `document.title`. This is
   also the evidence the issue asks to close with.
