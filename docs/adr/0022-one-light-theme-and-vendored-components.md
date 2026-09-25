# 0022. Use one light theme, "Scène", with vendored components that alias it

Status: Accepted, 2026-08-31

## Context

Les Canetons is a youth Guggenmusik that performs at night in UV costumes. The old
site's magenta and cyan looked like drift and were the band's own look. The site has
two audiences: strangers read the public pages once, and members open the members' area
every week, on a phone, often outdoors.

The same card markup had been written by hand 28 times and the button styles 16
times, so a rule such as a 44px touch target applied by hand would not survive the next
page. Fixing that needed a component layer, but a library's colour vocabulary could
override a palette that is the band's identity.

## Decision

"Scène": black and neon chrome, the header and footer, around a light page body.
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

Rejected: a fully dark theme, right for the public pages and tiring for the weekly
members' use; a black, white and red poster look; a neutral white site, which would
look like another band; dark mode, which doubles the surface for nobody who has asked;
and the Google Fonts CDN.

## Consequences

Tailwind 4 compiles `dark:` into a `prefers-color-scheme` query, and the app declares
no dark variant, so every `dark:` utility in a copied component is stripped. A future
`shadcn add` will try to bring the `.dark` block back and must be refused. `npm run
fix` runs after every `shadcn add`.

The bundle has no runtime dependencies beyond the two fonts. That is also why the
event calendar is hand-rolled and `tools/image-budget.mjs` reads image headers itself.

A new display face needs its glyph data checked first. Bungee replaced Lilita One,
whose font file ships broken glyph bounding boxes; `docs/traps.md` has the detail.
