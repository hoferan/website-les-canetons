# Comité & Team Direction page refresh — Design

**Date:** 2026-07-16
**Page:** `code/comite_teamdirection.php`
**Goal:** Bring the committee page up to date ("2026 without a full makeover"): fix the
broken contact data and replace the long single-column stack with a responsive card
grid, staying within the site's existing buildless, monochrome-grey design language plus
one warm "duck" accent.

## Problem

The current page has two issues:

1. **Broken contact data.** Each committee member lists an individual
   `@lescanetons.org` email. Only `comite@lescanetons.org` actually exists — the other
   eight personal addresses (`delphine@`, `amanda@`, `celine@`, `marc@`, `tiago@`,
   `martine@`, `laura@`, `patrice@`) bounce. They are live-looking `mailto:` links that
   go nowhere.
2. **Dated layout.** Members are rendered as a single centered vertical column, one
   `.committee-member` block after another, producing a lot of scrolling and whitespace
   on desktop.

## Scope

Two files, both edited in place. No JavaScript, no PHP logic, no new dependencies —
the site stays buildless (PHP 8.1, vanilla CSS).

- `code/comite_teamdirection.php` — markup restructure
- `code/assets/css/comite_teamdirection.css` — grid + card styles

Out of scope: any change to partials, other pages, the color/font system elsewhere, or
site-wide CSS.

## Content decisions

- **Remove all eight dead personal emails.** No personal `mailto:` links remain.
- **Keep the one working email**, `comite@lescanetons.org`, promoted to a single
  prominent **contact block** placed near the top (after the group photo).
- **Keep Céline Cuennet's phone number** `079 322 12 57` (real) as a `tel:` link on her
  card.
- All roles and names are preserved exactly as they appear today.

Committee data to render (role → name → optional phone):

| Role | Name | Phone |
|------|------|-------|
| Présidente | Delphine Maillard | — |
| Vice-présidente - secrétaire | Amanda Portmann | — |
| Responsable prestations | Céline Cuennet | 079 322 12 57 |
| Responsable caisse | Marc Rossier | — |
| Responsable intendance | Tiago Garces Cardoso | — |
| Responsable costumes | Martine Jutzet | — |
| Responsable Team Direction | Laura Mantel | — |
| Membre | Patrice Bersier | — |

The three photo sections are kept, restyled to match:

- **Le comité** — group photo (`assets/img/comite.jpg`), full width, above the grid.
- **Direction musicale** — photo (`assets/img/directionmusicale.jpg`) + "Laura Mantel
  et Delphine Maillard".
- **Le parrain et la marraine** — photo (`assets/img/parrainmarraine.jpg`) + "Richard
  Hertig et Annick Bürgisser".

## Layout

Top-to-bottom order within `section.personne-section`:

1. `<h2>Le comité</h2>` + group photo (full width).
2. **Contact block** — a centered card containing the `comite@lescanetons.org`
   `mailto:` link, with a small accent left-border.
3. **Committee grid** — the eight members as cards.
4. `<h2>Direction musicale</h2>` + photo + names (full-width captioned block).
5. `<h2>Le parrain et la marraine</h2>` + photo + names (full-width captioned block).

**Grid:** CSS Grid, `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` with a
gap. This yields ~3 columns on desktop, ~2 on tablet, 1 on mobile with no JS and no
extra media query. The grid is width-constrained by the existing `section` max-width.

**Member card markup** (per member), e.g.:

```html
<article class="member-card">
  <p class="member-role">Responsable prestations</p>
  <p class="member-name">Céline Cuennet</p>
  <p class="member-phone"><a href="tel:+41793221257">079 322 12 57</a></p>
</article>
```

Cards without a phone simply omit the `.member-phone` paragraph.

## Visual design

- **Member card:** white background, soft 1px border (`#e5e5e5`), 10px border-radius
  (matches the site's cards), light shadow (`0 1px 3px rgba(0,0,0,0.08)`), comfortable
  padding, centered text. Hover: gentle lift (`transform: translateY(-3px)`), slightly
  stronger shadow, and an accent top-border — via `transition` for smoothness.
- **Role label** (`.member-role`): small, uppercase, letter-spaced, colored with the
  contrast-safe accent ink.
- **Name** (`.member-name`): bold, dark (`#222`).
- **Phone** (`.member-phone a`): muted grey, `tel:` link, no underline until hover.
- **Contact block:** centered card, accent left-border, the email as a `mailto:` link.

### Accent color

Introduce one warm "duck" accent, defined as CSS custom properties at the top of the
page stylesheet:

- `--accent: #f2b705;` — duck yellow, used only for **decorative** elements (hover
  top-border, contact block left-border, optional label underline). Not used for text.
- `--accent-ink: #8a6100;` — darker amber used for the **role label text**; meets WCAG
  AA (≥ 4.5:1) on a white background for small text.

Rationale: the bright duck yellow fails contrast for small text on white, so decorative
vs. text uses are split into two tokens.

## Accessibility

- `mailto:` and `tel:` remain real, functional links.
- Image `alt` text preserved on all three photos.
- Role label text uses `--accent-ink` for ≥ 4.5:1 contrast; name/phone use existing
  dark/grey values already in the palette.
- Semantic markup: members as `<article>`, roles/names as text; headings unchanged.

## Constraints

- **Buildless.** Edit CSS/JS in place; no bundler, no framework, no runtime deps.
- **CSS in browser-compatible notation** — no nesting, no modern color functions
  (`oklch`, etc.) — to satisfy the repo's CSS secret/format guard and Stylelint config
  (see commit `95c4897`). CSS custom properties are permitted (widely supported).
- Match production (PHP 8.1). No PHP behavior change on this page.

## Testing / verification

- `npm run check` passes (Stylelint, Prettier, ESLint no-op, secret-guard, `php -l`).
- Manual visual check in Docker (`docker compose up -d`, `http://localhost:8090`,
  Comité page) at desktop and mobile widths: grid reflows 3 → 2 → 1 columns; cards hover
  correctly; photo sections render.
- Grep the page confirms `comite@lescanetons.org` is the only email address present and
  no other `@lescanetons.org` address remains.
- Céline's `tel:` link still dials `+41793221257`.
