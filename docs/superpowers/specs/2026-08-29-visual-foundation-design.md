# Visual foundation — design

**Date:** 2026-08-29
**Branch:** `feat/spa-cutover`
**Status:** approved, ready for a plan

This is sub-project **A1** of the SPA cutover. It gives the site a visual design
and applies it to everything that already exists. **A2** — the nine content
pages — follows on top of it and is out of scope here.

## Why this exists at all

The SPA is structurally complete for four routes and **visually blank**. Its
entire stylesheet is:

```css
@import "tailwindcss";
@theme { --color-canetons-red: #e0201a; }
```

The header has no background, the footer is a plain top border, and every page
renders in Tailwind's defaults. The old PHP site had 547 lines of shared CSS
plus a bespoke stylesheet per page. Porting nine more content pages onto nothing
would mean styling them twice.

## What the band actually looks like

This was nearly got wrong, so it is recorded here.

The old per-page CSS looks like a decade of drift: `canetons.css` sets headings
to magenta `#f0f` and paragraphs to cyan `#3ac0d8`, `sponsors.css` sets them to
two different blues, `comite_teamdirection.css` uses neither. The obvious read is
"accumulated mess, tidy it up".

That read is wrong. The site's background image is a **neon splatter on black**,
and Les Canetons is a **youth Guggenmusik that performs in UV costumes at
night** — the group photograph is two dozen kids in glow paint on a Fribourg
bridge in the snow. Those page colours were pulled out of the band's own look.

So neon on black *is* the identity. A tasteful white site would not be a
clean-up; it would look like a different band. Anyone tempted to neutralise the
palette should open `web/public/assets/img/canetons.jpg` first.

## The direction: *Scène*

Three directions were mocked up and compared
(https://claude.ai/code/artifact/ec2ff76f-b64a-4fd0-a5ed-89c5ab2c5a3b):
*Néon* (full dark), *Affiche* (gig-poster black/white/red), and *Scène*.
**Scène was chosen**, deliberately, for who uses this site:

- the nine public pages are read once, by a stranger;
- the members' area is read **every week**, on a phone, often outdoors, by
  people checking whether they play on Saturday.

A dark interface taxes the second group every time. So the **chrome is black and
neon — the header is the stage — and the page body is light.**

If this were only the public pages, *Néon* would have been the honest answer.
That trade is recorded so it is not silently re-litigated.

### Tokens

| Token | Value | Role |
| --- | --- | --- |
| `--color-ground` | `#F7F8FA` | page background — cool, faint violet bias, **not** a warm cream |
| `--color-panel` | `#FFFFFF` | cards, form surfaces |
| `--color-ink` | `#14121C` | body text |
| `--color-ink-muted` | `#5A5768` | secondary text, captions |
| `--color-line` | `#E2E3EA` | rules, borders |
| `--color-stage` | `#0B0A12` | the header, and only the header |
| `--color-violet` | `#4B2ED6` | **the interface accent**: links, active nav, primary buttons |
| `--color-pink` | `#FF3D9A` | emphasis only — never a whole surface |
| `--color-danger` | `#E0201A` | form errors |

**On red.** `--color-canetons-red` exists today and does two jobs at once: it is
the logo's red *and* the error colour in `EventForm`, `Login` and `Contact`. In
Scène red is not a brand colour — violet carries the interface — so red is free
to mean exactly one thing. It is renamed `--color-danger`, and every
`text-canetons-red` / `border-canetons-red` becomes the semantic name. The
`EnvRibbon` keeps a red ribbon; that is a warning, which is the same meaning.

### Type

Both faces are **self-hosted through Fontsource** (`@fontsource/lilita-one`,
`@fontsource-variable/karla`, both confirmed on npm at 5.3.0), imported in
`styles.css` and bundled by Vite.

**Not Google's CDN**, for three separate reasons, any one of which is
sufficient: a Swiss band site should not hand every visitor's IP to a third
party; TEST and QA sit behind HTTP Basic Auth where a blocked third-party
request is an easy thing to misdiagnose; and the build stays self-contained,
which is the same property the rest of this project already insists on.

| Role | Face | Used for |
| --- | --- | --- |
| Display | **Lilita One** | page titles, section headings. It echoes the logo's hand-drawn bubble lettering, which is the one typographic thing the band already owns. |
| Body | **Karla** | everything else. A grotesque with enough character not to read as a default, and it sets French accents cleanly. |

Type scale, in `rem`: `0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3`.
Headings get `text-wrap: balance`; running text stays near 65 characters.

### The chrome

- **Header** — `--color-stage`, the logo at its current size, the band name in
  Lilita One. Full-bleed; it is the only dark surface on a public page.
- **Navigation** — on `--color-panel` below the header, not inside it. Ten
  items plus the Flickr link and the auth item; the set and its order are
  already correct in `Layout.tsx` and **must not be re-ordered** — it is the
  order the band is used to, copied from the old `navigation.php`. The active
  item is violet with a violet underline, replacing today's `font-bold
  underline`. The mobile disclosure keeps its existing `aria-expanded` /
  `aria-controls` wiring untouched.
- **Footer** — `--color-stage` to bookend the header, muted text.
- **`EnvRibbon`** — unchanged in behaviour, restyled to sit legibly against a
  dark header. Its "unknown env means PROD, i.e. no ribbon" default is
  load-bearing and stays.

## Scope

**In:**

1. **Resize the images.** `web/public/assets/img/` is **45 MB**;
   `directionmusicale.jpg` alone is **19 MB** and eight more exceed 2 MB. On a
   phone at a rehearsal that is a page that never finishes loading. This is
   mechanical, independent of the design, and worth more than any colour
   decision here — so it goes first, in its own commit.
2. **Tokens and fonts** in `web/src/styles.css`.
3. **`Layout.tsx`** — header, nav, footer; and `EnvRibbon.tsx` restyled.
4. **Restyle the four ported pages** — `PlanningRepet`, `Login`, `Contact`,
   `Confirmation` — plus the shared `FormField` / `FormError` and
   `EventForm` / `EventActions` they render.

**Out:**

- The nine content pages — A2.
- Dark mode. Scène commits to one look; two would double the surface for
  nobody who has asked.
- Any change to markup structure, French copy, routes, or the API.

## The constraint that makes this checkable

**The tests assert on roles and French text, not on CSS classes — with exactly
one exception, verified by grep rather than assumed.**

```
web/src/components/Layout.test.tsx:71
  expect(screen.getByRole("link", { name: "Inscriptions" })).toHaveClass("font-bold");
```

That is the only `toHaveClass` in the suite. It pins a real behaviour — the two
inscription sub-pages highlight the "Inscriptions" nav item, as the old nav did
— but it pins it *through* the styling, and Scène changes the active item from
`font-bold underline` to violet. **That one test must change**, and the
replacement must keep asserting the behaviour rather than deleting it: assert
the violet active class, or better, assert `aria-current`, which is what the
behaviour actually means and does not move again the next time the design does.

Everything else is the acceptance criterion: **if any other test needs
changing, the restyle changed behaviour and has overreached.** That includes
the end-to-end suite — `web/e2e/planning.spec.ts` samples animation frames
around the submit button and selects `#event-title` by id; `auth.spec.ts` drives
every form by label — all of which must keep passing untouched.

## Risks

- **Image resizing is destructive and touches committed binaries.** Do it in
  its own commit, keep the originals' aspect ratios, and check the visible
  result rather than trusting the byte count. `comite.jpg` (55 KB) and the logo
  (39 KB) are already small — resizing everything blindly would degrade them for
  no gain.
- **Tailwind 4 is CSS-first here.** There is no `tailwind.config.ts`; tokens go
  in the `@theme` block in `styles.css`, and Stylelint needs its at-rules in
  `.stylelintrc.json`'s `ignoreAtRules` — both already true, and the plan must
  not "fix" either.
- **`--color-canetons-red` is referenced in five files**, and they do not all
  mean the same thing:

  | File | Use | Becomes |
  | --- | --- | --- |
  | `styles.css` | the token itself | `--color-danger` |
  | `FormField.tsx` | error text, error border, error message | `--color-danger` |
  | `EnvRibbon.tsx` | the non-prod ribbon | `--color-danger` — a warning is the same meaning |
  | `NotFound.tsx` | the big "404" | `--color-danger` |
  | `Placeholder.tsx` | the placeholder page title | **neither** — it is not an error. Plain ink; and it is temporary scaffolding that A2 deletes anyway. |

  Renaming is a string find-and-replace with no compile-time safety net at all —
  Tailwind class names are strings, so a missed one fails silently as an
  unstyled element. `grep -rn "canetons-red" web/src` returning nothing is the
  cheap check; `npm run build` plus looking at the pages is the real one.
- **The restyle touches every page at once through `Layout.tsx`.** That is the
  point, and it is also why the e2e suite matters more than usual here.
