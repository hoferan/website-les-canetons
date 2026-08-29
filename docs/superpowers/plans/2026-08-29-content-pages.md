# The Nine Content Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the nine remaining public content pages from the old PHP site onto the SPA's existing design system, leaving only the members' area and the souper on `Placeholder`.

**Architecture:** Nine components in `web/src/pages/`, nine route swaps in `routes.tsx`. None of them touches the API. They are grouped into three tasks by shape — prose, photo, structured — because the work inside each shape is the same work repeated, and a slip is likelier between shapes than within one.

**Tech Stack:** React 19 + TypeScript, Tailwind 4 (CSS-first, tokens in `web/src/styles.css`), Vitest + Testing Library, Playwright.

**Design:** `docs/superpowers/specs/2026-08-29-content-pages-design.md`
**The design system these sit on:** `docs/superpowers/specs/2026-08-29-visual-foundation-design.md`

---

## Before you start

- **The parity source is `git show dcd7862^:app/pages/<page>.php`.** Every French string in this plan came from there. Copy them from this plan rather than retyping — the accents and the apostrophes matter, and this project has already lost time to a mismatched one.
- **Everything is written in English except user-visible UI text, which is French.** Comments, identifiers, file names: English.
- **Use only the A1 tokens.** `bg-ground bg-panel text-ink text-ink-muted border-line bg-stage text-violet text-pink text-danger font-display`. **Tailwind class names are strings, so a token that does not exist fails silently** as an unstyled element — no TypeScript error, no lint warning, no failing test. If unsure, check the `@theme` block in `web/src/styles.css`.
- **Do not introduce a colour, a font size or a spacing value of your own.**
- Baselines: **132 unit tests** across 18 files, **11 e2e**, `npm run check` exit 0, 13/13 smoke.
- A Husky pre-commit hook runs eslint, stylelint and prettier on staged files. Reformatting is normal.

### The shared page shell

Every page in this plan opens the same way. It is written out in each task rather than extracted, because nine pages sharing a four-line wrapper is not duplication worth a component — and a `<PageShell>` would have to grow a prop for every page that differs.

```tsx
<section className="mx-auto max-w-3xl px-4 py-8">
  <h1 className="font-display text-4xl">…</h1>
```

`max-w-5xl` instead, on the two grid pages (`comite_teamdirection`, `commencement`).

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/pages/Accueil.tsx` | **new.** The static half of the home page. |
| `web/src/pages/Historique.tsx` | **new.** Five paragraphs of band history. |
| `web/src/pages/Cd.tsx` | **new.** The 20th-anniversary CD and how to order it. |
| `web/src/pages/Sponsors.tsx` | **new.** Three lists of external links. |
| `web/src/pages/Multimedia.tsx` | **new.** One France 3 embed. |
| `web/src/pages/Canetons.tsx` | **new.** The group photo plus seven register sections. |
| `web/src/pages/Moniteurs.tsx` | **new.** The instructors' photo and the per-register list. |
| `web/src/pages/ComiteTeamDirection.tsx` | **new.** Committee grid, musical direction, godparents. |
| `web/src/pages/Commencement.tsx` | **new.** Joining information, contacts, the flyer. |
| `web/src/routes.tsx` | **modify.** Nine `Placeholder` entries replaced. |
| `web/src/routes.test.tsx` | **modify.** The one test file that must change — see the spec. |
| `web/src/pages/Canetons.test.tsx` | **new.** Pins the seven sections. |
| `web/src/pages/Commencement.test.tsx` | **new.** Pins the flyer download link. |

---

## Task 1: The five prose pages

**Files:**
- Create: `web/src/pages/Accueil.tsx`, `Historique.tsx`, `Cd.tsx`, `Sponsors.tsx`, `Multimedia.tsx`
- Modify: `web/src/routes.tsx`

- [ ] **Step 1: `Accueil.tsx`**

```tsx
/**
 * The home page — the STATIC half of the old accueil.php.
 *
 * The other half was a feature-flagged call-to-action for the souper, reading
 * the occasion copy that GET /api/config already publishes. It is deliberately
 * not here: its two buttons link to /signup and /signups_admin, which are still
 * Placeholder, and a call-to-action that lands on a placeholder is worse than
 * none. The souper sub-project builds the CTA and its destinations together.
 */
export function Accueil() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Bienvenue sur notre site</h1>
      <img
        src="/assets/img/Cindyphotography-128.jpg"
        alt="Les Canetons en concert, costumes fluorescents sous la lumière noire"
        className="mt-6 rounded-lg"
      />
    </section>
  );
}
```

- [ ] **Step 2: `Historique.tsx`**

```tsx
/**
 * The band's history, ported verbatim from historique.php.
 *
 * Note this page says the direction passed to Lilou Keller and Anaïs Meuwly,
 * while comite_teamdirection.tsx still lists Laura Mantel and Delphine Maillard
 * as the direction musicale. The live site contradicts itself; the port
 * reproduces both, because which one is current is a content question for the
 * band rather than something to settle inside a refactor. Recorded as an open
 * question in docs/continue-here.md.
 */
export function Historique() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">L’Histoire des Canetons</h1>

      <div className="mt-6 max-w-prose space-y-4">
        <p className="font-semibold">
          LA GUGGEN D’ENFANTS &laquo;&nbsp;LES CANETONS&nbsp;&raquo; DE FRIBOURG S’EST
          OFFICIELLEMENT CREEE EN OCTOBRE 2002. DEBUTANT AVEC UNE DIZAINE DE MUSICIENS… CETTE
          JEUNE GUGGEN S’EST VITE RETROUVEE AVEC UNE QUARANTAINE D’ENFANTS.
        </p>
        <p>
          En remarquant l’engouement de plusieurs gamins qui suivaient les &laquo;&nbsp;3
          Canards&nbsp;&raquo; et qui rêvaient de mettre de l’ambiance comme eux, il n’en fallut
          pas plus pour que Jacky Schaller accepte de prendre la direction de ces petits hyper
          motivés&nbsp;!
        </p>
        <p>
          Débutant avec une dizaine de musiciens, sans vraiment recruter, jouant uniquement la
          carte du &laquo;&nbsp;bouche à oreilles&nbsp;&raquo;, cette jeune guggen s’est vite
          retrouvée avec une quarantaine d’enfants, âgés de 7 à 18 ans. Pas besoin de connaître la
          musique pour s’intégrer au groupe... Des moniteurs apprennent les morceaux aux jeunes,
          registre par registre, lors des répétitions qui ont lieu, en général, le samedi matin.
        </p>
        <p>
          Dès la saison 2007/2008, les Directeurs (tous d’anciens Canetons) se sont succédé. Tout
          d’abord Anthony Cotting, puis Delphine Brügger et Fabio Portmann.
        </p>
        <p>
          Depuis 2019, les Canetons ont été dirigés par Delphine Maillard et Laura Mantel. Après
          sept années d’un engagement remarquable, elles passent à présent le flambeau à deux
          jeunes musiciennes, Lilou Keller et Anaïs Meuwly. Toutes deux débordent d’énergie et de
          motivation, prêtes à poursuivre l’aventure et à insuffler un nouvel élan à cette
          merveilleuse Guggen.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `Cd.tsx`**

```tsx
export function Cd() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">2022 - Les Canetons ont 20 ans&nbsp;!!!</h1>
      <p className="mt-2 text-xl text-ink-muted">Notre nouveau CD vient de sortir&nbsp;!!</p>

      <img src="/assets/img/CD_img.png" alt="La pochette du CD des Canetons" className="mt-6" />

      <p className="mt-6">N’hésitez pas à le commander au plus vite&nbsp;!!</p>

      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Comment commander</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Auprès des musiciens que vous connaissez</li>
          <li>Auprès de chaque membre du comité</li>
          <li>
            En écrivant à{" "}
            <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
              comite@lescanetons.org
            </a>
          </li>
        </ul>
        <p className="mt-4 text-lg font-semibold">
          Prix&nbsp;: <span className="text-violet">20.-</span> pièce
        </p>
        <p className="text-ink-muted">Disponible en CD ou en clé USB</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `Sponsors.tsx`**

```tsx
/** Three groups of outbound links, in the order the old page listed them. */
const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Les Carnavals",
    links: [
      { href: "http://www.carnavaldesbolzes.ch/", label: "Carnaval des Bolzes - Fribourg" },
      { href: "http://www.carnavalestavayer.ch/", label: "Carnaval d’Estavayer" },
      { href: "http://www.carnavalromont.ch/", label: "Carnaval de Romont" },
      {
        href: "http://www.carnatchaux.ch/",
        label: "Carna’Tchaux : Carnaval de la Chaux de Fonds",
      },
      { href: "http://www.brandonspayerne.ch/", label: "Les Brandons de Payerne" },
    ],
  },
  {
    heading: "Les Guggens",
    links: [
      { href: "http://www.3canards.ch/portal/index.php", label: "Les 3 Canards - Fribourg" },
      { href: "http://www.lesgouillesagasses.com/", label: "Les Gouilles Agasses - Le Mouret" },
      { href: "http://www.lesendiables.ch/", label: "Les Endiablés - Courtepin" },
      { href: "http://www.lestricounis.ch/", label: "Les Tricounis - Belfaux" },
      { href: "http://www.ladecaps.com/", label: "La Décapsuleuse - Romont" },
    ],
  },
  {
    heading: "Les Amis",
    links: [
      { href: "http://www.collaud-criblet.ch/home.php", label: "Collaud & Criblet - Publicité" },
      { href: "http://www.13carnavaleux.com/", label: "Les 13 Carnavaleux" },
    ],
  },
];

/**
 * The URLs are http:// because that is what the old page had and what these
 * sites answer on. Upgrading them here would be guessing on twelve third-party
 * hosts we do not control; a broken link is worse than an unencrypted one to a
 * public carnival homepage.
 */
export function Sponsors() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      {/* "Liens Amis" title-cased, which is unusual in French and is what the
          old page had. The NAV label beside it is lowercase; both are
          reproduced as they are rather than reconciled. */}
      <h1 className="font-display text-4xl">Sponsors et Liens Amis</h1>

      <div className="mt-6 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.heading} className="rounded-lg border border-line bg-panel p-5">
            <h2 className="font-display text-xl">{group.heading}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `Multimedia.tsx`**

```tsx
export function Multimedia() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">France 3 Alsace / Carnaval de Colmar 2016</h1>

      {/* https, not the old protocol-relative //embed.francetv.fr — the site is
          HTTPS-only and that form is a relic of serving both schemes.

          aspect-video plus an absolutely positioned iframe, rather than the old
          fixed 560x315: at 390px wide a fixed-width iframe overflows the page
          and scrolls the whole body sideways. */}
      <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-lg bg-stage">
        <iframe
          src="https://embed.francetv.fr/cca9a2de4ec3e5e4c5a2ca96470d500c"
          title="Carnaval de Colmar 2016 — reportage France 3 Alsace"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>

      <p className="mt-4">
        <a
          href="https://france3-regions.francetvinfo.fr/grand-est/haut-rhin/colmar/colmar-une-cavalcade-rien-que-pour-les-enfants-933067.html"
          target="_blank"
          rel="noreferrer"
          className="text-violet hover:underline"
        >
          Colmar&nbsp;: une cavalcade rien que pour les enfants
        </a>
      </p>
    </section>
  );
}
```

- [ ] **Step 6: Wire the five routes**

In `web/src/routes.tsx` add the imports, keeping the block alphabetical as it already is:

```tsx
import { Accueil } from "./pages/Accueil";
import { Cd } from "./pages/Cd";
import { Historique } from "./pages/Historique";
import { Multimedia } from "./pages/Multimedia";
import { Sponsors } from "./pages/Sponsors";
```

and replace exactly these five lines:

```tsx
        <Route path="/" element={<Placeholder title="Accueil" />} />
        <Route path="/historique" element={<Placeholder title="Historique" />} />
        <Route path="/cd" element={<Placeholder title="CD" />} />
        <Route path="/sponsors" element={<Placeholder title="Sponsors et liens amis" />} />
        <Route path="/multimedia" element={<Placeholder title="Multimédia" />} />
```

with:

```tsx
        <Route path="/" element={<Accueil />} />
        <Route path="/historique" element={<Historique />} />
        <Route path="/cd" element={<Cd />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="/multimedia" element={<Multimedia />} />
```

- [ ] **Step 7: Update the route table test**

`web/src/routes.test.tsx`'s `test.each` asserts on the *placeholder* headings for `/` and `/historique`. Both change. Replace those two rows and add the three new routes:

```tsx
  ["/", "Bienvenue sur notre site"],
  ["/historique", "L’Histoire des Canetons"],
  ["/cd", "2022 - Les Canetons ont 20 ans !!!"],
  ["/sponsors", "Sponsors et Liens Amis"],
  ["/multimedia", "France 3 Alsace / Carnaval de Colmar 2016"],
```

**The accessible name of a heading collapses `&nbsp;` to a normal space**, so the `/cd` row reads `20 ans !!!` with an ordinary space even though the JSX has `&nbsp;`. If that row fails, that is why — do not "fix" it by removing the `&nbsp;` from the page, which is there for correct French typography.

- [ ] **Step 8: Verify**

```bash
npx vitest run && npm run typecheck && npm run lint:js && npm run build
```
Expected: all pass. The five routes render their own headings.

- [ ] **Step 9: Commit**

```bash
git add web/src
git commit -m "feat(web): port the five prose content pages

accueil, historique, cd, sponsors and multimedia. The home page gets only its
static half: the souper call-to-action links to /signup and /signups_admin,
which are still placeholders, so it ships with the souper sub-project that
builds its destinations.

The France 3 embed moves from a protocol-relative // to https and from a fixed
560x315 to an aspect-video box, which stopped it scrolling the whole page
sideways on a phone."
```

---

## Task 2: The two photo pages

**Files:**
- Create: `web/src/pages/Canetons.tsx`, `web/src/pages/Canetons.test.tsx`, `web/src/pages/Moniteurs.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`

- [ ] **Step 1: Write the failing test for `Canetons`**

`canetons` is a hero plus **seven** register sections of near-identical markup. The failure mode is a copy-paste slip — a duplicated section, a caption under the wrong photograph, a section quietly lost. Pin the count and the pairing.

Create `web/src/pages/Canetons.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { Canetons } from "./Canetons";

test("every register has a section, in the old page's order", () => {
  render(<Canetons />);
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "La Direction Musicale",
    "Nos Batteurs",
    "Nos Grosses-Caisses",
    "Notre Lyre",
    "Nos Cloches",
    "Nos Trompettes",
    "Nos Trombones",
  ]);
});

// The slip this guards against is a caption landing under the wrong
// photograph, which no count would catch and which reads as correct.
test("each register's photograph and roster belong to that register", () => {
  render(<Canetons />);
  const trumpets = screen.getByRole("heading", { name: "Nos Trompettes" }).closest("article")!;
  expect(within(trumpets).getByRole("img")).toHaveAttribute(
    "src",
    "/assets/img/trompettes.jpg",
  );
  expect(trumpets).toHaveTextContent("Naïma, Cléa E, Maeva, Eloïse, Coline, Gaëtan");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run web/src/pages/Canetons.test.tsx`
Expected: FAIL — `Failed to resolve import "./Canetons"`.

- [ ] **Step 3: Write `Canetons.tsx`**

```tsx
/**
 * One entry per register, in the old page's order.
 *
 * A data array rather than seven copies of the same markup: the sections differ
 * only in their photograph and their roster, and seven hand-written copies is
 * exactly where a caption ends up under the wrong picture.
 *
 * `rosters` is a list because the trumpets are photographed in two rows and the
 * old page captioned each separately.
 */
const REGISTERS: { heading: string; image: string; alt: string; rosters: string[] }[] = [
  {
    heading: "La Direction Musicale",
    image: "directionmusicale.jpg",
    alt: "La direction musicale des Canetons",
    rosters: ["Laura et Delphine"],
  },
  {
    heading: "Nos Batteurs",
    image: "batteurs.jpg",
    alt: "Les batteurs des Canetons",
    rosters: ["De gauche à droite : Nolan, Kevin, Arnaud, Gwenael"],
  },
  {
    heading: "Nos Grosses-Caisses",
    image: "grossescaisses.jpg",
    alt: "Les grosses caisses des Canetons",
    rosters: ["De gauche à droite : William, Kilian, Marc-Jérôme"],
  },
  {
    heading: "Notre Lyre",
    image: "lyre.jpg",
    alt: "La lyre des Canetons",
    rosters: ["Mäelle"],
  },
  {
    heading: "Nos Cloches",
    image: "cloches.jpg",
    alt: "Les cloches des Canetons",
    rosters: ["De gauche à droite : Lilou, Baptiste, Benjamin, Abigaëlle"],
  },
  {
    heading: "Nos Trompettes",
    image: "trompettes.jpg",
    alt: "Les trompettes des Canetons",
    rosters: [
      "Debout de gauche à droite : Naïma, Cléa E, Maeva, Eloïse, Coline, Gaëtan",
      "Devant de gauche à droite : Amandine, Nathaël, Leia, Nora",
    ],
  },
  {
    heading: "Nos Trombones",
    image: "trombones.jpg",
    alt: "Les trombones des Canetons",
    rosters: ["De gauche à droite : Sarah, Cléa F, Axel, Camille"],
  },
];

export function Canetons() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Nos Canetons</h1>
      <img
        src="/assets/img/canetons.jpg"
        alt="Les Canetons au complet, en costume fluorescent, de nuit sur un pont de Fribourg"
        className="mt-6 rounded-lg"
      />

      <div className="mt-10 space-y-10">
        {REGISTERS.map((register) => (
          <article key={register.heading}>
            <h2 className="font-display text-2xl">{register.heading}</h2>
            {/* Lazy below the fold — every one of these is a photograph, and
                all seven eagerly is the whole page's weight at once. */}
            <img
              src={`/assets/img/${register.image}`}
              alt={register.alt}
              loading="lazy"
              className="mt-3 rounded-lg"
            />
            {register.rosters.map((roster) => (
              <p key={roster} className="mt-2 text-ink-muted">
                {roster}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run web/src/pages/Canetons.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `Moniteurs.tsx`**

```tsx
/** Instructor per register, in the old page's order. */
const INSTRUCTORS: { register: string; names: string }[] = [
  { register: "Batterie", names: "Fabio, Théo, Nolan, Kevin" },
  { register: "Grosse caisse", names: "Kevin, Marc-Jérome" },
  { register: "Cloche", names: "Clémence, Baptiste" },
  { register: "Lyre", names: "Elodie" },
  { register: "Trompette", names: "Amanda, Anthony, Adeline" },
  { register: "Trombone", names: "Jessaline, Cassandra" },
];

export function Moniteurs() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Nos Moniteurs</h1>
      <img
        src="/assets/img/moniteurs.jpg"
        alt="Les moniteurs des Canetons"
        className="mt-6 rounded-lg"
      />

      <p className="mt-8 font-display text-3xl text-violet">MERCI</p>
      <p className="mt-1 max-w-prose">
        à tous les moniteurs et toutes les personnes qui donnent de leur temps pour nos canetons
      </p>

      <ul className="mt-6 space-y-1 rounded-lg border border-line bg-panel p-5">
        {INSTRUCTORS.map((instructor) => (
          <li key={instructor.register}>
            <strong className="font-semibold text-ink-muted">{instructor.register}&nbsp;:</strong>{" "}
            {instructor.names}
          </li>
        ))}
      </ul>

      {/* The old page ended with a bare list of names under class "absentes" —
          those photographed absent. Kept, with the label the class implied but
          the markup never showed. */}
      <p className="mt-4 text-sm text-ink-muted">
        Absent·es de la photo&nbsp;: Cassandra, Adeline, Fabio, Théo, Elodie, Baptiste, Nolan,
        Kevin, Marc-Jérome
      </p>
    </section>
  );
}
```

- [ ] **Step 6: Wire the two routes**

Add to `web/src/routes.tsx`'s import block:

```tsx
import { Canetons } from "./pages/Canetons";
import { Moniteurs } from "./pages/Moniteurs";
```

and replace:

```tsx
        <Route path="/canetons" element={<Placeholder title="Les canetons" />} />
        <Route path="/moniteurs" element={<Placeholder title="Moniteurs" />} />
```

with:

```tsx
        <Route path="/canetons" element={<Canetons />} />
        <Route path="/moniteurs" element={<Moniteurs />} />
```

In `web/src/routes.test.tsx`, replace the `/canetons` row and add `/moniteurs`:

```tsx
  ["/canetons", "Nos Canetons"],
  ["/moniteurs", "Nos Moniteurs"],
```

- [ ] **Step 7: Verify**

```bash
npx vitest run && npm run typecheck && npm run lint:js && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add web/src
git commit -m "feat(web): port the canetons and moniteurs pages

Seven register sections built from a data array rather than seven copies of the
same markup — seven hand-written copies is exactly where a caption ends up under
the wrong photograph, so a test pins both the order and the pairing.

Alt text is rewritten rather than ported: the old markup used the filename
(alt=\"batteurs\"), which is an accessibility defect there is no reason to
reproduce."
```

---

## Task 3: The two structured pages

**Files:**
- Create: `web/src/pages/ComiteTeamDirection.tsx`, `web/src/pages/Commencement.tsx`, `web/src/pages/Commencement.test.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`

- [ ] **Step 1: Write `ComiteTeamDirection.tsx`**

The committee's names, roles and the one published phone number port **verbatim**. They are the band's own contact details, already public, and publishing them is what this page is for.

```tsx
/**
 * The committee, in the order the old page listed it — which is by office, not
 * alphabetical, and is how the band reads it.
 *
 * One member publishes a phone number and the rest do not. That asymmetry is
 * the old page's and is deliberate: it is the number for booking the band.
 */
const COMMITTEE: { role: string; name: string; phone?: string }[] = [
  { role: "Présidente", name: "Delphine Maillard" },
  { role: "Vice-présidente - secrétaire", name: "Amanda Portmann" },
  { role: "Responsable prestations", name: "Céline Cuennet", phone: "079 322 12 57" },
  { role: "Responsable caisse", name: "Marc Rossier" },
  { role: "Responsable intendance", name: "Tiago Garces Cardoso" },
  { role: "Responsable costumes", name: "Martine Jutzet" },
  { role: "Responsable Team Direction", name: "Laura Mantel" },
  { role: "Membre", name: "Patrice Bersier" },
];

/**
 * Note: this page lists Laura Mantel and Delphine Maillard as the direction
 * musicale, while Historique.tsx says they handed over to Lilou Keller and
 * Anaïs Meuwly. The live site contradicts itself and the port reproduces both —
 * which is current is a content question for the band. See
 * docs/continue-here.md.
 */
export function ComiteTeamDirection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-4xl">Le comité</h1>

      <img
        src="/assets/img/comite.jpg"
        alt="Le comité des Canetons"
        className="mt-6 rounded-lg"
      />

      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
        <p className="mt-2">
          <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
            comite@lescanetons.org
          </a>
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMITTEE.map((member) => (
          <li key={member.role} className="rounded-lg border border-line bg-panel p-4">
            <p className="text-xs font-semibold tracking-wide text-violet uppercase">
              {member.role}
            </p>
            <p className="mt-1">{member.name}</p>
            {member.phone ? (
              <p className="mt-1">
                <a
                  href={`tel:+41${member.phone.replace(/\s/g, "").slice(1)}`}
                  className="text-violet hover:underline"
                >
                  {member.phone}
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-2xl">Direction musicale</h2>
      <img
        src="/assets/img/directionmusicale.jpg"
        alt="La direction musicale des Canetons"
        loading="lazy"
        className="mt-3 rounded-lg"
      />
      <p className="mt-2 text-ink-muted">Laura Mantel et Delphine Maillard</p>

      <h2 className="mt-12 font-display text-2xl">Le parrain et la marraine</h2>
      <img
        src="/assets/img/parrainmarraine.jpg"
        alt="Le parrain et la marraine des Canetons"
        loading="lazy"
        className="mt-3 rounded-lg"
      />
      <p className="mt-2 text-ink-muted">Richard Hertig et Annick Bürgisser</p>
    </section>
  );
}
```

**Check the generated `tel:` href by hand.** `079 322 12 57` must become `tel:+41793221257`, which is what the old page had. If the expression above produces anything else, replace it with a literal `tel:` string in the data array rather than deriving it — one number does not justify a transformation that can be wrong.

- [ ] **Step 2: Write the failing test for the flyer**

Create `web/src/pages/Commencement.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Commencement } from "./Commencement";

// The download is the page's call to action — the flyer a parent prints and
// puts on a noticeboard. A broken href here fails silently: the link still
// looks like a link.
test("the flyer can be downloaded", () => {
  render(<Commencement />);
  const download = screen.getByRole("link", { name: /Télécharger le flyer/ });
  expect(download).toHaveAttribute("href", "/assets/img/Flyer.jpeg");
  expect(download).toHaveAttribute("download");
});
```

Run it: FAIL, `Failed to resolve import "./Commencement"`.

- [ ] **Step 3: Write `Commencement.tsx`**

```tsx
/** The four information blocks, in the old page's order. */
const FACTS: { heading: string; lines: string[] }[] = [
  { heading: "Instruments recherchés", lines: ["Trompette", "Trombone", "Sousaphone", "Euphonium"] },
  { heading: "Horaires", lines: ["Les samedis matin", "De 10h à 12h"] },
  { heading: "Critères d’âge", lines: ["Dès 7 ans dans l’année civile jusqu’à l’âge de 18 ans"] },
];

/** Published so a parent can call about joining. Ported verbatim. */
const CONTACTS: { name: string; phone: string; tel: string }[] = [
  { name: "Delphine Maillard", phone: "075 417 71 91", tel: "tel:0754177191" },
  { name: "Laura Mantel", phone: "079 280 77 67", tel: "tel:0792807767" },
];

const WERKHOF_MAP =
  "https://www.google.com/maps/dir/46.8067938,7.1370156/Association+Werkhof+Fribourg,+Planche-Inférieure+14,+1700+Fribourg/@46.8124723,7.1349983,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x478e69237f5723e3:0x97fe5bd05ee01349!2m2!1d7.1656142!2d46.8025755?hl=fr&entry=ttu";

export function Commencement() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-4xl">Tu veux commencer la guggen&nbsp;?</h1>
      <p className="mt-4 max-w-prose">
        Nous sommes constamment à la recherche de quelques souffleurs pour s’époumonner et faire
        &laquo;&nbsp;concurrence&nbsp;&raquo; à nos percussions&nbsp;!
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FACTS.map((fact) => (
          <div key={fact.heading} className="rounded-lg border border-line bg-panel p-5">
            <h2 className="font-display text-xl">{fact.heading}</h2>
            {fact.lines.map((line) => (
              <p key={line} className="mt-1">
                {line}
              </p>
            ))}
          </div>
        ))}

        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 className="font-display text-xl">Lieu</h2>
          <p className="mt-1">
            <a
              href={WERKHOF_MAP}
              target="_blank"
              rel="noreferrer"
              className="text-violet hover:underline"
            >
              Werkhof
            </a>
          </p>
          <p>Basse-Ville de Fribourg</p>
        </div>

        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 className="font-display text-xl">Contacts</h2>
          {CONTACTS.map((contact) => (
            <p key={contact.tel} className="mt-1">
              {contact.name} —{" "}
              <a href={contact.tel} className="text-violet hover:underline">
                {contact.phone}
              </a>
            </p>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <img
          src="/assets/img/Flyer.jpeg"
          alt="Le flyer de recrutement des Canetons"
          loading="lazy"
          className="rounded-lg"
        />
        {/* An <a download>, not a button wrapping one as the old page had: a
            button inside a link is invalid markup and confuses assistive
            technology about what the control does. */}
        <a
          href="/assets/img/Flyer.jpeg"
          download
          className="mt-4 inline-block rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90"
        >
          Télécharger le flyer
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire the two routes**

Add to the import block:

```tsx
import { ComiteTeamDirection } from "./pages/ComiteTeamDirection";
import { Commencement } from "./pages/Commencement";
```

and replace:

```tsx
        <Route path="/commencement" element={<Placeholder title="Commencer les Canetons" />} />
        <Route path="/comite_teamdirection" element={<Placeholder title="Contact Canetons" />} />
```

with:

```tsx
        <Route path="/commencement" element={<Commencement />} />
        <Route path="/comite_teamdirection" element={<ComiteTeamDirection />} />
```

In `web/src/routes.test.tsx`, replace the `/comite_teamdirection` row and add `/commencement`:

```tsx
  ["/comite_teamdirection", "Le comité"],
  ["/commencement", "Tu veux commencer la guggen ?"],
```

Again: `&nbsp;` collapses to a normal space in the accessible name, so the row reads `guggen ?` with an ordinary space.

- [ ] **Step 5: Confirm no content page is a placeholder any more**

```bash
grep -c "<Placeholder" web/src/routes.tsx
```
Expected: **7** — the four members'-area routes and the three flag-gated souper ones. Anything higher means a route was missed.

- [ ] **Step 6: Verify**

```bash
npx vitest run && npm run typecheck && npm run lint:js && npm run lint:css && npm run build && npm run test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): port the committee and joining pages

Committee names, roles and the one published phone number port verbatim: they
are the band's own contact details, already public, and publishing them is what
these pages are for.

The flyer's download is a plain <a download> rather than the old page's button
wrapped in a link, which was invalid markup and ambiguous to assistive
technology about what the control does."
```

---

## Task 4: Look at all nine, then verify everything

**Files:**
- Modify: `docs/continue-here.md`

- [ ] **Step 1: Screenshot every page**

A design change is only checkable by looking at it — two defects survived a fully green suite in the previous sub-project. Drive Playwright against the mocked dev server and read the images.

```bash
npx vite --config vite.config.ts --mode mock --port 5174 --strictPort &
```

Then this, saved outside the repository (a scratchpad directory) and run with `node`:

```js
import { chromium } from "file:///C:/Workspace/website-les-canetons/node_modules/@playwright/test/index.mjs";

const BASE = "http://localhost:5174";
const OUT = "<your scratchpad directory>";
const ROUTES = [
  "/", "/historique", "/canetons", "/cd", "/commencement",
  "/moniteurs", "/sponsors", "/multimedia", "/comite_teamdirection",
];

const browser = await chromium.launch();

for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}${route}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(700); // let the webfonts and the photographs settle
  const name = route === "/" ? "accueil" : route.replace(/\//g, "");
  await page.screenshot({ path: `${OUT}/page-${name}.png`, fullPage: true });
  console.log(name);
  await page.close();
}

// The narrow check: the iframe and the photo grids are where a phone breaks.
for (const route of ["/canetons", "/multimedia", "/comite_teamdirection"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto(`${BASE}${route}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/narrow-${route.replace(/\//g, "")}.png` });
  console.log(`narrow ${route}`);
  await page.close();
}

await browser.close();
```

`fullPage: true` on the wide shots, because `/canetons` is eight photographs tall and the interesting failures are below the fold.

**If port 5174 is already in use, kill what is there first** — a stale dev server serves stale code and you will screenshot the wrong thing. `Get-NetTCPConnection -LocalPort 5174 -State Listen` finds the owner.

What to look for on each:

- the heading is in Lilita One, not a system sans — if every heading looks plain, the fonts did not load;
- photographs are not stretched or cropped oddly, and the portrait one (`lyre.jpg` on `/canetons`) is not letterboxed;
- the footer sits at the bottom, not halfway up;
- the active nav item is violet — and now that these routes are real, **check two or three different ones**;
- `/multimedia`'s iframe fills its box and does not scroll the page sideways at 390px;
- `/comite_teamdirection`'s card grid reflows sensibly at each breakpoint.

- [ ] **Step 2: The full gate**

```bash
npm run check
npm run test:e2e
npm run build
npm run smoke
```

and, in PowerShell (or with `MSYS_NO_PATHCONV=1` in Git Bash):

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

Expected: `check` exit 0; 11 e2e; 13/13 smoke; 232 Laravel tests.

- [ ] **Step 3: Against the real API**

These pages make no API calls, so what this proves is that the **chrome still works on them**. Bring the stack up, open http://localhost:5173, and click through the nav.

**If the pages render unstyled, restart the `assets` container** before assuming a code problem — its `node_modules` is a named volume and it installs at start, so it goes stale. The tell is one line in `docker compose logs assets`.

- [ ] **Step 4: Update the handover**

In `docs/continue-here.md`:

- A2 is done; **seven routes remain on `Placeholder`** — C's four and D's three.
- Record the **open content question**: `historique` says the direction passed to Lilou Keller and Anaïs Meuwly, `comite_teamdirection` still lists Laura Mantel and Delphine Maillard. Both ported verbatim; the band decides which is current.
- Record that **the souper CTA on `/accueil` is deferred to D**, and that `config.occasion` already carries the copy it needs.
- Add any trap this plan cost you.

- [ ] **Step 5: Commit and push**

```bash
git add docs/continue-here.md
git commit -m "docs: the nine content pages are ported; the members' area is next"
git push
```

---

## Notes for whoever executes this

- **Copy the French from this plan, not from the old PHP.** It is already transcribed, and re-transcribing is how an accent or an apostrophe drifts.
- **`&nbsp;` collapses to a normal space in an accessible name.** A `routes.test.tsx` row asserting on a heading that contains one uses an ordinary space. Do not remove the `&nbsp;` from the page — French typography wants it before `!`, `?` and `:`.
- **A Tailwind token that does not exist fails silently.** Check the `@theme` block in `web/src/styles.css` if unsure.
- **`routes.test.tsx` is the only test file that should change**, and only its `test.each` table. Anything else needing an edit means something went wrong.
- **Do not re-order `NAV` in `Layout.tsx`.** It is the order the band is used to.
- **`directionmusicale.jpg` appears on two pages** — `/canetons` and `/comite_teamdirection`. It was a 19 MB camera original before the previous sub-project resized it, and the SPA has never rendered it. If it looks soft, that is that compression showing.
