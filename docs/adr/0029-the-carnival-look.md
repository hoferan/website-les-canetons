---
status: accepted
date: 2026-10-08
decision-makers: André Hofer
---

# Give the public pages a carnival look: poster heroes, scalloped edges and raised cards

## Context and Problem Statement

The first outside feedback on the rebuilt site came from a committee member on
2026-10-08. They found it plain and boring, asked where the fun and the colour were on
the site of a children's Guggenmusik, and said it seemed to have no overall concept.
They liked the phone menu and noticed that it looked different from everything else.

ADR 0022 explains why. It gave the band's look (the black stage, neon, Bungee) to the
header and footer only, and kept every page body light grey and white for the members
who read the planning on a phone each week. The phone menu was the one screen built
entirely in the stage style, so it was the one place where the identity showed.

They also asked for carnival decoration, as long as it is licence-free and scales.

What should the public pages look like, and how does that stay one design across the
pages, the chrome and the members' area?

## Considered Options

- A, "Nuit UV": every public page on the black stage, in neon, like the phone menu
- B, "Confettis": a violet-to-pink poster hero, a light body with outlined cards and
  offset shadows, tilted tiles, and confetti everywhere
- C, a mix: B as the base, confetti only on coloured surfaces, the phone menu brought
  into the same design
- Keep ADR 0022 and add decoration to the existing pages

## Decision Outcome

Chosen option: C, because it has B's fun and its daytime, children's-carnival feel,
long pages stay easy to read, and the phone menu joins the same design.

The mock-ups are in [`0029/`](0029/): the home page at
[390px](0029/home-phone.png) and [1280px](0029/home-desktop.png), the
[open phone menu](0029/menu-phone.png), and [`mock.html`](0029/mock.html), which opens
from a checkout and holds the exact values. They are kept as they were agreed. Once a
page is built, its code is the authority.

The rules the code follows:

- A public page opens with a poster hero, `bg-poster` in `web/src/styles.css`, which
  ends in a scalloped edge (`Scallop`). One coloured band further down, yellow on the
  home page, is allowed to carry confetti too.
- The page ground is cream. Confetti goes on coloured surfaces only and never sits
  behind text: `Confetti` keeps clear of anything marked `data-confetti-avoid`.
- Anything a visitor can press is raised: a 3px ink outline and a hard offset shadow,
  ink on light surfaces and pink on the stage. The `raised` button variants and the
  `shadow-raised` tokens carry it.
- One highlight, yellow under ink, marks both the word that matters in a heading and
  the current page in the navigation.
- Section headings carry the wavy pink underline (`heading-wave`). Tiles on a coloured
  band tilt alternately; cards on cream stay straight.
- The decoration is SVG drawn for this site: confetti strips, dots, triangles,
  squiggles, stars and notes. There is nothing to license and it is sharp at any size.
  The icons inside cards come from `lucide-react`, already a dependency.
- The members' area takes the colours, the raised buttons and the outlined cards, but
  no confetti, no tilt and no hero, because it is a tool used every week.

This supersedes ADR 0022's light grey and white page body. The rest of 0022 stands:
one theme, no dark mode, self-hosted fonts, and vendored components that alias the
tokens.

### Consequences

- Good, because a visitor's first screen now says carnival and children's band.
- Good, because the chrome, the pages and the phone menu speak one visual language,
  which was the committee member's point about the menu.
- Good, because the decoration is ours, so no licence has to be tracked.
- Bad, because white text on the poster passes only while the gradient runs away from
  the text. It is 5.3:1 at its worst point, the top right of the hero paragraph at
  390px, and a hero that puts text further right or higher needs measuring again.
- Bad, because confetti is placed by measuring the layout, so it is recomputed on
  every resize and draws nothing until the first measurement.

### Confirmation

`web/src/carnival/scatter.test.ts` and `Confetti.test.tsx` fail if confetti can land
on text. `web/src/lib/utils.test.ts` fails if a raised shadow stops replacing a
vendored one. The issues of milestone R11 each close with screenshots at 390px and
1280px next to the mock-up.

## Pros and Cons of the Options

### A, "Nuit UV"

- Good, because it is closest to the costumes and to the old site's splatter on black.
- Bad, because white on black is tiring on the long pages, history and join.
- Bad, because it ties the site to this year's UV costume theme, which changes.

### B, "Confettis"

- Good, because the outlined cards with offset shadows read as pressable at a glance.
- Bad, because confetti on the cream read as clutter, and black confetti on yellow
  looked like crumbs.
- Bad, because a scallop stretched to the page width squashed into a zigzag on a
  phone, and tilting every card made the pages tiring to scan.

## More Information

Issue #244 has the feedback and the breakdown into milestone R11. ADR 0022 is the
record this one partly supersedes.
