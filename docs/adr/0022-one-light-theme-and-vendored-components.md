---
status: accepted
date: 2026-08-31
decision-makers: André Hofer
---

# Use one light theme, "Scène", with vendored components that alias it

## Context and Problem Statement

Les Canetons is a youth Guggenmusik that performs at night in UV costumes. The old
site's magenta and cyan looked like drift and were the band's own look. The site has
two audiences: strangers read the public pages once, and members open the members' area
every week, on a phone, often outdoors.

The same card markup had been written by hand 28 times and the button styles 16
times, so a rule such as a 44px touch target applied by hand would not survive the next
page. Fixing that needed a component layer, but a library's colour vocabulary could
override a palette that is the band's identity.

What should the site look like, and how should a component layer be added without
losing the band's palette?

## Considered Options

- "Scène", one light theme, with vendored shadcn/ui components that alias its tokens
- A fully dark theme
- A black, white and red poster look
- A neutral white site
- Dark mode
- The Google Fonts CDN

## Decision Outcome

Chosen option: "Scène", because its black and neon chrome keeps the band's night look
while a light page body suits the members' weekly use, and components that only alias
its tokens cannot override the palette.

"Scène" is black and neon chrome, the header and footer, around a light page body.
Violet is the interface accent. Pink is for emphasis and never fills a surface. Red
means an error and nothing else. There is one theme and no dark mode. The tokens are
the `@theme` block in `web/src/styles.css`. Fonts are self-hosted through Fontsource,
Bungee for display and Karla for text, so no visitor's address goes to a third party
and nothing breaks behind TEST's Basic Auth.

Components come from shadcn/ui on Radix, copied into `web/src/components/ui/` and
owned like the rest of the code. Only what a screen needs is copied. Every shadcn
variable (`--primary`, `--accent` and the rest) is an alias of a `--color-*` token and
never introduces a colour. The app's own components sit above them in
`web/src/components/`.

### Consequences

- Good, because a rule such as a 44px touch target lives in a component instead of in
  28 hand-written cards and 16 hand-written button styles.
- Good, because no visitor's address goes to a third party for fonts, and nothing
  breaks behind TEST's Basic Auth.
- Bad, because every `dark:` utility in a copied component is stripped: Tailwind 4
  compiles `dark:` into a `prefers-color-scheme` query, and the app declares no dark
  variant. A future `shadcn add` will try to bring the `.dark` block back and must be
  refused. `npm run fix` runs after every `shadcn add`.
- Bad, because a new display face needs its glyph data checked first. Bungee replaced
  Lilita One, whose font file ships broken glyph bounding boxes; `docs/traps.md` has
  the detail.

The bundle has no runtime dependencies beyond the two fonts. That is also why the
event calendar is hand-rolled and `tools/image-budget.mjs` reads image headers itself.

## Pros and Cons of the Options

### A fully dark theme

- Good, because it is right for the public pages.
- Bad, because it is tiring for the weekly members' use.

### A neutral white site

- Bad, because it would look like another band.

### Dark mode

- Bad, because it doubles the surface for nobody who has asked.

### The Google Fonts CDN

- Bad, because self-hosting is what keeps visitors' addresses away from a third party
  and keeps the fonts working behind TEST's Basic Auth.
