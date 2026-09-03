# E2b — `/accueil` as a front door — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home route from "a heading and a placeholder box" into a front
door: a hero built from facts `/historique` already publishes, the next upcoming
event read live from `GET /api/events`, and four curated destination cards.

**Architecture:** Three additive pieces, each in its own component so
`web/src/pages/Accueil.tsx` stays a page rather than a page plus three features
(the reason `SouperCta` is already its own file). The hero is plain copy in the
page. `NextEvent` owns its own query and **renders `null` whenever it has no
data** — pending, error and an empty list all collapse to the same "the section
is simply not there", which is what the spec demands and what keeps a slow or
failing API from touching the hero. `DestinationCards` is a presentational list
the page feeds a hardcoded, curated array.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind 4 (CSS-first, tokens in
`web/src/styles.css`), the generated TanStack Query client
(`web/src/api/generated/endpoints.ts`), Vitest + Testing Library, Playwright
against MSW (`--mode mock`).

---

## Read before starting

- The spec: `docs/superpowers/specs/2026-09-01-e2b-accueil-front-door-design.md`.
  Every decision below comes from it; where this plan departs from it, the
  departure is called out in the task and the reason is written into the code.
- `docs/continue-here.md`, sections "Look at the site before designing anything"
  and "Traps worth knowing before you touch anything".
- `web/src/components/EventCard.tsx` — its doc comment explains why its actions
  are a footer slot and why it emits `h3`. Both matter here.

## Three facts about this codebase that will bite you

1. **Run the JS suites from PowerShell, not Git Bash.** From Git Bash, Vitest 4
   fails to collect *every* test file with "Vitest failed to find the runner".
   It looks like a catastrophic regression and is a lowercase drive letter.
2. **A green suite is not a rendered page.** Four E1 defects passed every
   assertion — a sentence that rendered on two lines, a dimmed link, an overlap.
   Task 8 is not optional decoration; it is where this plan finds its bugs.
3. **French typography:** a non-breaking space before `:`, `!` and `?` —
   `&nbsp;:` — as `web/src/pages/Moniteurs.tsx` and `PhotoPending.tsx` do. In an
   accessible name that character stays a literal U+00A0 and is invisible beside
   a plain space, so the tests below assert on fragments that do not span one.

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/pages/Accueil.tsx` | **modify** — the page: souper card, hero, photo slot, next event, destinations, in that order. Owns the curated destination array. |
| `web/src/pages/Accueil.test.tsx` | **modify** — the page's own coverage, including the absent-when-empty case at page level. |
| `web/src/components/NextEvent.tsx` | **create** — the next upcoming event, or nothing. Owns the `useEventIndex()` call. |
| `web/src/components/NextEvent.test.tsx` | **create** — renders the first upcoming event; renders nothing on `[]` and on error. |
| `web/src/components/DestinationCards.tsx` | **create** — a named list of link cards. Knows nothing about which destinations. |
| `web/src/components/DestinationCards.test.tsx` | **create** — the list is named, each card links where it says. |
| `web/src/pages/Admin.tsx` | **modify** — drops its own copy of the identical card tree. |
| `web/src/pages/Admin.test.tsx` | **create** — the hub's one destination card, which nothing asserts today. |
| `web/src/App.test.tsx` | **modify** — pins the old `h1`. |
| `web/src/routes.test.tsx` | **modify** — pins the old `h1`. |
| `web/e2e/accueil.spec.ts` | **create** — the measurements no unit test can make. |
| `docs/continue-here.md` | **modify** — the handover, at the end. |

---

### Task 1: The hero

Replaces "Bienvenue sur notre site" — a heading that says nothing — with the
spec's display line and supporting sentence, and folds the band's badge into it.

**Note the spec predates the badge.** `BrandLogo` landed on `/accueil` in PR #69
(2026-09-03), two days after the spec was written, so the spec's page order does
not mention it. It stays: its comment records that this is the badge's **only**
placement on the site, and that E2b "should be free to rework the page around
it". The hero is that rework — the badge becomes the hero's mark instead of a
lone image under an empty heading.

**Files:**
- Modify: `web/src/pages/Accueil.tsx`
- Modify: `web/src/pages/Accueil.test.tsx`
- Modify: `web/src/App.test.tsx:26`
- Modify: `web/src/routes.test.tsx:30`

- [ ] **Step 1: Write the failing tests**

Add to `web/src/pages/Accueil.test.tsx`, after the imports and before the
existing souper tests:

```tsx
// THE COPY IS A CONDENSATION, NOT A NEW CLAIM. Every fact here is already
// published on /historique — created in October 2002, a "guggen d'enfants",
// aged 7 to 18, no need to read music, moniteurs teaching register by register
// at Saturday-morning rehearsals. Asserting the sentences here means a future
// edit that invents something has to change a test to do it.
test("the hero says what the band is, in one line and one sentence", async () => {
  await renderWithSession(<Accueil />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();

  // Fragments, not the whole sentence: it contains a non-breaking space before
  // its colon, and a test asserting the full string with an ordinary space
  // fails on two characters that look identical in the diff.
  expect(screen.getByText(/De 7 à 18 ans/)).toBeInTheDocument();
  expect(screen.getByText(/pas besoin de connaître la musique/)).toBeInTheDocument();
  expect(screen.getByText(/registre par registre/)).toBeInTheDocument();
  expect(screen.getByText(/répétitions du samedi matin/)).toBeInTheDocument();
});

// The head-count is deliberately absent. /historique says the band GREW TO
// "une quarantaine d'enfants" — a sentence about 2002-03, not a membership
// figure for today. Repeating it in the present tense on the front page would
// be both a new claim and a perishable one.
test("the hero claims no membership figure", async () => {
  await renderWithSession(<Accueil />);

  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByText(/quarantaine/)).not.toBeInTheDocument();
});

// The badge is the band's mark, and this is its ONLY placement on the site —
// it was in the footer too until 2026-09-03 and became wallpaper. If it is
// dropped while reworking the hero, nothing else on the site shows it.
test("the hero carries the band's badge", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByAltText("Le logo des Canetons de Fribourg")).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From **PowerShell**, at the repo root:

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: the three new tests FAIL — "Unable to find an accessible element with
the role heading and name …" for the first, and `getByText(/De 7 à 18 ans/)`
unable to find for the same reason. The pre-existing souper tests still pass.
(`the hero claims no membership figure` fails on its `findByRole` line, not on
its assertion — that is expected at this point.)

- [ ] **Step 3: Write the hero**

Replace the whole of `web/src/pages/Accueil.tsx` with:

```tsx
import { PhotoPending } from "../components/PhotoPending";
import { SouperCta } from "../components/SouperCta";
import { PageSection } from "@/components/PageSection";
import { BrandLogo } from "@/components/Logo";

/**
 * The home page — the front door.
 *
 * IT WAS FAITHFUL PARITY, AND THAT WAS THE PROBLEM. The legacy home page was a
 * logo, the words "Bienvenue sur notre site", the navigation and one image: it
 * never said when the band was founded, what a Guggenmusik is, or who can join.
 * The SPA reproduced that exactly, so with the souper flag off the front page
 * was a content-free heading and a placeholder. See the E2b spec.
 *
 * THE HERO COPY IS A CONDENSATION OF /historique, NOT NEW COPY. Nothing factual
 * is invented anywhere on this site — the 23 `<Tbd>` fields blocking PROD are
 * the proof of how seriously that is taken. Every clause below is already
 * published on /historique, which is why this page did not have to wait for the
 * band to write anything. It still deserves their eyes once.
 *
 * The souper call-to-action stays FIRST and stays flag-gated: while it is on it
 * is the most time-sensitive thing on the site. It lives in its own component
 * because its two buttons link to /signup and /signups_admin.
 */
export function Accueil() {
  return (
    <PageSection width="text">
      <SouperCta />

      {/* The band's badge — the mark people know from the flyers, the costumes
          and the instruments — as the hero's mark. It sits here because the
          header carries the duck alone; see Logo.tsx for why the lockup was
          split.

          THIS IS THE BADGE'S ONLY PLACEMENT ON THE SITE. It was briefly in the
          footer too, and dropped on 2026-09-03: shown in the chrome of every
          page it stopped being the thing you recognize and became wallpaper.
          One prominent placement beats two quiet ones.

          Narrower below `sm`. It was a flat w-64 (256px) when this page was a
          heading and a box; above a hero that now has a display line and a
          sentence to read, 256px of duck on a 390px screen pushes the copy off
          the first screen. */}
      <BrandLogo className="mx-auto w-48 sm:w-64" />

      {/* text-3xl below `sm`. Bungee is a signage face whose lowercase glyphs
          are drawn as CAPITALS, so this line sets as caps whatever the source
          says and is far wider than Karla at the same size — at text-4xl it
          takes four lines on a 390px screen. A sentence-case heading is not
          available while this face is in use; that is the look, not a bug. */}
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">
        La guggen d’enfants de Fribourg, depuis 2002.
      </h1>

      {/* ONE sentence, not a paragraph, and it carries the only practically
          useful facts: Saturday mornings, and no experience needed. That is
          what someone deciding whether to turn up needs.

          NO TUTOIEMENT. /commencement says "Tu veux commencer la guggen ?"
          because it addresses children directly; the members' area says "vous".
          A front door is read by parents and children both, so the copy stays
          impersonal — "pas besoin de connaître la musique" is the source's own
          phrasing — rather than inventing a register shift on the site's
          most-read page.

          IF THE BAND EVER WRITES TWO OR THREE SENTENCES ABOUT THEMSELVES, THEY
          REPLACE THIS ONE. That is the whole reason the page could ship without
          waiting for them, and why no <Tbd /> was put on the front page: the
          destination is the same page minus one paragraph. */}
      <p className="mt-4 text-lg text-ink-muted">
        De 7 à 18 ans — et pas besoin de connaître la musique&nbsp;: les moniteurs apprennent les
        morceaux registre par registre, aux répétitions du samedi matin.
      </p>

      <PhotoPending what="des Canetons en concert" />
    </PageSection>
  );
}
```

- [ ] **Step 4: Run the page's tests to verify they pass**

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: PASS, except the pre-existing `with the feature off there is no card`,
which still asserts the old heading and now fails. Fix it in the next step.

- [ ] **Step 5: Update the three tests that pin the old heading**

In `web/src/pages/Accueil.test.tsx`, in `with the feature off there is no card`,
replace:

```tsx
  expect(await screen.findByRole("heading", { name: "Bienvenue sur notre site" })).toBeVisible();
```

with:

```tsx
  // The hero is what proves the page rendered at all — which is the point of
  // asserting it here rather than only asserting the card's absence.
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();
```

In `web/src/App.test.tsx`, replace:

```tsx
  expect(
    await screen.findByRole("heading", { name: "Bienvenue sur notre site" }),
  ).toBeInTheDocument();
```

with:

```tsx
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeInTheDocument();
```

In `web/src/routes.test.tsx`, in the `test.each` table, replace:

```tsx
  ["/", "Bienvenue sur notre site"],
```

with:

```tsx
  ["/", "La guggen d’enfants de Fribourg, depuis 2002."],
```

- [ ] **Step 6: Run the whole web suite**

```powershell
npx vitest run
```

Expected: every file passes. If anything else still mentions the old heading,
`grep -rn "Bienvenue sur notre site" web/` finds it — there were exactly four
call sites at `80633d6`, three of them tests.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Accueil.tsx web/src/pages/Accueil.test.tsx web/src/App.test.tsx web/src/routes.test.tsx
git commit -m "feat(web): a real hero on the home page, condensed from /historique"
```

---

### Task 2: `NextEvent` — the next upcoming event, or nothing at all

The only thing on the front page that changes by itself. It is correct **because
of E1a**: before that change `GET /api/events` returned every event ever in
ascending order, so "the first event" was the oldest row in the database and a
block like this would have advertised a concert from years ago.

**Files:**
- Create: `web/src/components/NextEvent.tsx`
- Create: `web/src/components/NextEvent.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/NextEvent.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { isoDaysFromToday } from "../mocks/handlers";
import { server } from "../mocks/node";
import { formatEventDate } from "../lib/date";
import { renderWithSession } from "../test/renderWithSession";
import { NextEvent } from "./NextEvent";

// The MSW fixture's first UPCOMING event: +20 days, "Concert d'automne",
// 19:00-22:00, Salle communale. The fixture also holds one event in the PAST
// (-9 days), which the endpoint's default filter drops — so this test fails if
// the component ever stops relying on that filter and takes row zero of
// everything.
test("it shows the next upcoming event, with its date, time and place", async () => {
  await renderWithSession(<NextEvent />);

  expect(await screen.findByRole("heading", { name: "Prochain événement" })).toBeVisible();

  // getByText, NOT a heading query: EventCard emits the event's DATE as its h3
  // and the title as a <p> under it. And the apostrophe is a STRAIGHT one —
  // the fixture's own string, not the site's typographic convention.
  expect(screen.getByText("Concert d'automne")).toBeVisible();

  // Computed, never a literal: the fixture's dates are offsets from today, so a
  // hardcoded date would be a time bomb that fails on some future Tuesday for
  // no discoverable reason.
  expect(screen.getByText(formatEventDate(isoDaysFromToday(20)))).toBeInTheDocument();

  expect(screen.getByText(/19:00 – 22:00/)).toBeInTheDocument();
  expect(screen.getByText(/Salle communale/)).toBeInTheDocument();

  expect(screen.getByRole("link", { name: "Voir tous les événements" })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});

// THE TEST THIS COMPONENT EXISTS TO SATISFY. An empty-state card reading "aucun
// événement" on a band's front page says "this band does nothing", which is
// worse than the section not being there. So the requirement is ABSENT, not
// empty — and "absent" is only provable by asserting on the container.
test("with no upcoming events the section is absent, not empty", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<NextEvent />);

  const booted = await screen.findByTestId("booted");
  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByText(/aucun/i)).not.toBeInTheDocument();
  // Nothing at all — not a heading with an empty list under it.
  expect(booted).toBeEmptyDOMElement();
});

// The front page gained a live dependency, and this is the risk the spec names:
// if /api/events is slow or fails, the hero and the destinations must still be
// there. A failing query renders nothing rather than an alert — this is the one
// consumer of that endpoint where an error message would be pure noise, because
// the visitor did not ask for the schedule.
test("a failing request renders nothing rather than an error", async () => {
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json(
        { error: "Server error", code: "server_error", fields: [] },
        { status: 500 },
      ),
    ),
  );

  await renderWithSession(<NextEvent />);

  const booted = await screen.findByTestId("booted");
  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(booted).toBeEmptyDOMElement();
});
```

> `renderWithSession` wraps whatever it is given in
> `<div data-testid="booted">`, and returns only after that marker is in the
> document — the boot gate renders `null` until `GET /api/config` and
> `GET /api/user` have resolved. That wrapper is what makes
> `toBeEmptyDOMElement()` a meaningful assertion here: it is the component's
> whole output.

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npx vitest run web/src/components/NextEvent.test.tsx
```

Expected: FAIL at collection — "Failed to resolve import ./NextEvent".

- [ ] **Step 3: Write the component**

Create `web/src/components/NextEvent.tsx`:

```tsx
import { useEventIndex } from "../api/generated/endpoints";
import { formatTime } from "../lib/date";
import { ButtonLink } from "@/components/ButtonLink";
import { EventCard } from "@/components/EventCard";

/**
 * The next upcoming event, on the front page — or nothing.
 *
 * IT IS CORRECT BECAUSE OF E1a. `GET /api/events` used to return every event
 * ever, ascending, so "the first row" was the OLDEST event in the database and
 * this block would have advertised a concert from years ago. The endpoint
 * filters to upcoming by default now, so taking row zero is right by
 * construction — and there is deliberately no client-side sort or filter here,
 * exactly as on /planning_repet: a change in the API's ordering should fail a
 * test, not be papered over in two places.
 *
 * IT RENDERS NOTHING UNLESS IT HAS AN EVENT, AND THAT IS THE WHOLE DESIGN.
 * Pending, error and an empty list all collapse into `data` being undefined or
 * row zero being missing, so one guard covers all three. There is deliberately
 * no "Chargement…" and no `role="alert"`:
 *
 *   - an empty-state card saying "aucun événement" on a band's front page reads
 *     as "this band does nothing", which is worse than no section;
 *   - the visitor never asked for the schedule, so an error about it is noise
 *     on the page where noise is most visible;
 *   - the spec's stated risk is that this live dependency must never block the
 *     hero or the destinations, and a component that can only add or add
 *     nothing cannot.
 *
 * /planning_repet is the page that DOES owe the visitor a loading state and an
 * error, because there the schedule is what they came for.
 */
export function NextEvent() {
  const events = useEventIndex();

  // `.data.data` — the outer is TanStack Query's, the inner is orval's
  // { data, status, headers } envelope that the mutator in api/http.ts must
  // return. Undefined while pending and on error, both of which end up here.
  const next = events.data?.data[0];
  if (!next) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">Prochain événement</h2>

      {/* A ONE-ITEM <ul>, because EventCard IS an <li> (it uses Card's asChild
          so that /planning_repet's named lists are valid markup). Reusing it
          here is the point: a second, near-identical event card tree would have
          to be kept in step with this one forever, and it is the component that
          already knows a weekend event spans two days.

          Named, so a `listitem` query scoped to this list means exactly one
          thing — the layout's nav is a list too, and an unscoped query once
          counted four events as seventeen rows. The name matches the heading;
          they are different roles, so no query is ambiguous. */}
      <ul aria-label="Prochain événement" className="mt-3">
        <EventCard
          event={next}
          actions={
            <ButtonLink to="/planning_repet" variant="outline">
              Voir tous les événements
            </ButtonLink>
          }
        >
          {/* The same one-line meta as /planning_repet: three labelled lines
              ("Heure de début :", "Heure de fin :", "Lieu :") were mostly label
              on a phone, and the values alone say the same thing. The separator
              is aria-hidden so a screen reader reads the line rather than
              spelling a dot. */}
          <p>
            {formatTime(next.startTime)} – {formatTime(next.endTime)}
            <span aria-hidden="true"> · </span>
            {next.location}
          </p>
        </EventCard>
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npx vitest run web/src/components/NextEvent.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Prove the absent-when-empty guard can actually fail**

A guard that cannot fail is worth nothing, and E1 shipped one that silently
asserted nothing. Temporarily replace the guard in `NextEvent.tsx`:

```tsx
  const next = events.data?.data[0];
  if (!next) return <section className="mt-8">Aucun événement à venir.</section>;
```

Run `npx vitest run web/src/components/NextEvent.test.tsx`. Expected: BOTH
`with no upcoming events the section is absent, not empty` and
`a failing request renders nothing rather than an error` FAIL — the first on
`queryByText(/aucun/i)`, the second on `toBeEmptyDOMElement`. Then **revert to
`if (!next) return null;`** and re-run: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/NextEvent.tsx web/src/components/NextEvent.test.tsx
git commit -m "feat(web): a next-event block that renders nothing when it has nothing"
```

---

### Task 3: Put the next-event block on the page

**Files:**
- Modify: `web/src/pages/Accueil.tsx`
- Modify: `web/src/pages/Accueil.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `web/src/pages/Accueil.test.tsx`:

```tsx
test("the front page carries the next upcoming event", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("heading", { name: "Prochain événement" })).toBeVisible();
  // A <p>, not a heading — EventCard's h3 is the date — and a straight
  // apostrophe, which is what the MSW fixture holds.
  expect(screen.getByText("Concert d'automne")).toBeVisible();
});

// The hero and the photo slot must survive the live dependency failing. This is
// the page-level half of NextEvent's own coverage: that component renders
// nothing, and this proves nothing else on the page went with it.
test("with no upcoming events the hero and the photo slot are still there", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<Accueil />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(document.querySelector("[data-photo-pending]")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: `the front page carries the next upcoming event` FAILS — unable to
find a heading named "Prochain événement". The second new test PASSES already
(nothing renders that block yet), which is fine: it is a regression guard, and
step 4 is what makes it meaningful.

- [ ] **Step 3: Render it**

In `web/src/pages/Accueil.tsx`, add the import:

```tsx
import { NextEvent } from "../components/NextEvent";
```

and put the block immediately after `<PhotoPending … />`:

```tsx
      <PhotoPending what="des Canetons en concert" />

      {/* AFTER the photo slot, per the E2b spec's page order: the hero says what
          the band is, and this says what it is doing next. It is the only thing
          on this page that changes by itself, and it is allowed to render
          nothing — see NextEvent.tsx. */}
      <NextEvent />
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: every test in the file passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Accueil.tsx web/src/pages/Accueil.test.tsx
git commit -m "feat(web): show the next upcoming event on the home page"
```

---

### Task 4: `DestinationCards`

A named list of link cards. `web/src/pages/Admin.tsx` already contains this exact
tree, and this codebase's own rule — see `EventCard`'s doc comment — is that a
second near-identical card tree is one you keep in step forever. So it is
extracted here and adopted there in Task 6.

**Files:**
- Create: `web/src/components/DestinationCards.tsx`
- Create: `web/src/components/DestinationCards.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/DestinationCards.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { DestinationCards } from "./DestinationCards";

// No session and no query client: this component reads nothing. MemoryRouter
// only because <Link> needs a router context.
function renderCards() {
  return render(
    <MemoryRouter>
      <DestinationCards
        label="Où aller"
        destinations={[
          { to: "/canetons", title: "Les canetons", description: "Registre par registre." },
          { to: "/planning_repet", title: "Événements", description: "Les prochaines dates." },
        ]}
      />
    </MemoryRouter>,
  );
}

test("each card is a link to its own destination", () => {
  renderCards();

  expect(screen.getByRole("link", { name: /Les canetons/ })).toHaveAttribute("href", "/canetons");
  expect(screen.getByRole("link", { name: /Événements/ })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});

// Named, because the layout's nav is a list too: an unscoped listitem query
// counts nav items, which once turned four events into seventeen rows.
test("the list is named, and holds one item per destination", () => {
  renderCards();

  const list = screen.getByRole("list", { name: "Où aller" });
  expect(list.querySelectorAll("li")).toHaveLength(2);
});

// The description belongs INSIDE the link, not beside it: a card whose title
// alone is the link text reads as "Les canetons" to a screen reader and gives
// no more than the nav already does.
test("the description is part of the link", () => {
  renderCards();

  // Matched as a fragment of the accessible NAME, not as separate text: what is
  // being pinned is that the description is inside the anchor. Do not assert
  // the joined string — jsdom loads no stylesheet, so the `block` on the second
  // span is inert there and the two texts run together without a space. That is
  // a jsdom artefact, not what a browser computes, and pinning it would pin the
  // artefact.
  expect(screen.getByRole("link", { name: /Registre par registre\./ })).toHaveAttribute(
    "href",
    "/canetons",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npx vitest run web/src/components/DestinationCards.test.tsx
```

Expected: FAIL at collection — "Failed to resolve import ./DestinationCards".

- [ ] **Step 3: Write the component**

Create `web/src/components/DestinationCards.tsx`:

```tsx
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";

export type Destination = { to: string; title: string; description: string };

/**
 * A short grid of link cards pointing somewhere else on the site.
 *
 * IT MUST NEVER BE GENERATED FROM `NAV`. On /accueil these four cards
 * deliberately duplicate four of the navigation's ten entries: the nav is the
 * list of every page and is the source of truth for what EXISTS, while this is
 * a curated shortlist of what a stranger most likely wants first. If the two
 * drift, the nav is right about existence and this is still right about
 * priority. Deriving one from the other collapses that distinction and turns
 * the front door back into a second navigation.
 *
 * The WHOLE CARD is the link, not a "read more" inside it: 44px is the floor
 * for every interactive control on this site, and a card-sized target is
 * easier still on a phone. The description sits inside the anchor so the
 * accessible name says where the link goes and why, rather than repeating the
 * nav's own label.
 *
 * `focus-ring` because the card has no other focus affordance — it is a <div>
 * turned into an <a>, and `focus-ring` is what this codebase uses in place of
 * the browser default everywhere else.
 *
 * `h-full` on both the card and the anchor: in a grid row, a two-line
 * description beside a one-line one otherwise leaves the shorter card floating
 * with a ragged bottom edge.
 */
export function DestinationCards({
  label,
  destinations,
}: {
  label: string;
  destinations: Destination[];
}) {
  return (
    <ul aria-label={label} className="mt-6 grid gap-3 sm:grid-cols-2">
      {destinations.map((destination) => (
        <li key={destination.to}>
          <Card asChild className="h-full gap-0 p-5 transition-colors hover:border-violet">
            <Link to={destination.to} className="focus-ring block h-full">
              <span className="font-display text-xl text-violet">{destination.title}</span>
              <span className="mt-1 block text-ink-muted">{destination.description}</span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npx vitest run web/src/components/DestinationCards.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/DestinationCards.tsx web/src/components/DestinationCards.test.tsx
git commit -m "feat(web): extract the destination card grid into a component"
```

---

### Task 5: The four destinations on the front page

**Files:**
- Modify: `web/src/pages/Accueil.tsx`
- Modify: `web/src/pages/Accueil.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/Accueil.test.tsx`:

```tsx
// FOUR, and these four. The nav has ten entries; this is the curated shortlist
// a stranger wants first, and the test names the routes so a "tidy-up" that
// generates them from NAV fails here instead of silently turning the front door
// into a second navigation.
test("the front page offers four curated destinations", async () => {
  await renderWithSession(<Accueil />);

  const list = await screen.findByRole("list", { name: "Découvrir les Canetons" });
  expect(list.querySelectorAll("li")).toHaveLength(4);

  const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
  expect(href(/^Nous rejoindre/)).toBe("/commencement");
  expect(href(/^Les canetons/)).toBe("/canetons");
  expect(href(/^Événements/)).toBe("/planning_repet");
  expect(href(/^Contact/)).toBe("/comite_teamdirection");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: FAIL — unable to find a list named "Découvrir les Canetons".

- [ ] **Step 3: Render the destinations**

In `web/src/pages/Accueil.tsx`, add the import:

```tsx
import { DestinationCards, type Destination } from "../components/DestinationCards";
```

Add above the `Accueil` function, after its doc comment:

```tsx
/**
 * The four pages a stranger most likely wants, in the order the spec set them.
 *
 * A CURATED SUBSET OF THE NAV, ON PURPOSE — see DestinationCards.tsx. The nav
 * lists all ten pages; these are four of them, chosen rather than derived.
 *
 * "Événements", not "Planning". The E2b spec wrote "Planning (/planning_repet)"
 * descriptively, from before E1c merged /sinscrire into that page and renamed
 * both the nav entry and the page's own h1 to "Événements". Two names for one
 * page, on the front door, is exactly the kind of drift the content audit found
 * elsewhere on this site.
 *
 * Each description says what is ON the page it links to. None of them asserts a
 * fact about the band — those come from /historique, or from the band.
 */
const DESTINATIONS: Destination[] = [
  {
    to: "/commencement",
    title: "Nous rejoindre",
    description: "Les instruments recherchés, les horaires et les critères d’âge.",
  },
  {
    to: "/canetons",
    title: "Les canetons",
    description: "Les musiciens du groupe, registre par registre.",
  },
  {
    to: "/planning_repet",
    title: "Événements",
    description: "Les prochaines prestations et répétitions.",
  },
  {
    to: "/comite_teamdirection",
    title: "Contact",
    description: "Nous écrire, réserver les Canetons, et le comité.",
  },
];
```

and render the list last, after `<NextEvent />`:

```tsx
      <NextEvent />

      {/* LAST, per the spec's page order. Someone who has read the hero and the
          next event and is still here is the person who wants to go somewhere. */}
      <DestinationCards label="Découvrir les Canetons" destinations={DESTINATIONS} />
```

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```

Expected: every test in the file passes.

- [ ] **Step 5: Check the four routes actually exist**

```bash
grep -n 'path="/commencement"\|path="/canetons"\|path="/planning_repet"\|path="/comite_teamdirection"' web/src/routes.tsx
```

Expected: four **uncommented** `<Route>` lines. A commented one — `/cd`,
`/multimedia` and `/sponsors` are all hidden — would make a card that lands on
the 404 view.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Accueil.tsx web/src/pages/Accueil.test.tsx
git commit -m "feat(web): four curated destinations on the home page"
```

---

### Task 6: `/admin` adopts `DestinationCards`

`Admin.tsx` holds the same card tree this plan just extracted, and nothing
asserts what it renders — `guards.routes.test.tsx:41` checks only its heading.

**Files:**
- Modify: `web/src/pages/Admin.tsx`
- Create: `web/src/pages/Admin.test.tsx`

- [ ] **Step 1: Write the test for what Admin renders today**

Create `web/src/pages/Admin.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Admin } from "./Admin";

// The page itself, not the guard around it — guards.routes.test.tsx covers who
// may reach /admin. Written when this page adopted DestinationCards, because
// nothing pinned its one card and a shared component could have dropped it
// without a single test going red.
test("the hub links the admin to the events page", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Admin />);

  expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
  expect(screen.getByRole("link", { name: /^Événements/ })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});
```

- [ ] **Step 2: Run it to verify it passes against the current page**

```powershell
npx vitest run web/src/pages/Admin.test.tsx
```

Expected: PASS. This test characterises today's behaviour, so the refactor in
step 3 has something to break.

- [ ] **Step 3: Refactor the page onto the shared component**

Replace the whole of `web/src/pages/Admin.tsx` with:

```tsx
import { DestinationCards, type Destination } from "../components/DestinationCards";
import { PageSection } from "@/components/PageSection";

/**
 * The admin's landing page.
 *
 * The old page was two buttons: "Ajouter un événement", linking to
 * /planning_repet?admin=true, and "Se déconnecter". Both are redundant now —
 * the planning page shows admins the event form automatically, and logout lives
 * on the login route. Rather than reproduce two controls that no longer do
 * anything distinct, this is the page they were trying to be.
 *
 * The card grid moved into DestinationCards on 2026-09-03, when /accueil grew
 * four of them: this page's tree and that one's were identical, and the rule
 * this codebase already follows (see EventCard) is that a second
 * near-identical card tree is one you keep in step forever.
 */
const DESTINATIONS: Destination[] = [
  {
    to: "/planning_repet",
    title: "Événements",
    description: "Ajouter, modifier ou supprimer un événement, et lire les réponses des membres.",
  },
];

export function Admin() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Administration</h1>

      <DestinationCards label="Administration" destinations={DESTINATIONS} />
    </PageSection>
  );
}
```

- [ ] **Step 4: Run the affected tests**

```powershell
npx vitest run web/src/pages/Admin.test.tsx web/src/components/guards.routes.test.tsx
```

Expected: both pass. If the link assertion fails, the shared component's
accessible name differs from the old markup's — check the description is inside
the anchor.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Admin.tsx web/src/pages/Admin.test.tsx
git commit -m "refactor(web): /admin uses the shared destination card grid"
```

---

### Task 7: e2e — the measurements the unit suite cannot make

jsdom has no layout, so nothing above can see a hero that takes four lines, a
card grid that overflows 390px, or a tap target under 44px.

**Files:**
- Create: `web/e2e/accueil.spec.ts`

- [ ] **Step 1: Write the spec**

Create `web/e2e/accueil.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// 390x844, the phone every E1 and E2 finding was measured at. The home route is
// public, so none of this needs a session. The mocked backend has the souper
// flag ON and one upcoming event, so the page renders in its fullest state —
// which is the state most likely to overflow.
test.use({ viewport: { width: 390, height: 844 } });

test("the front door does not scroll sideways on a phone", async ({ page }) => {
  await page.goto("/");

  // WAIT FOR THE MOUNT BEFORE MEASURING. page.evaluate does not auto-wait the
  // way a locator does, and on an empty document scrollWidth trivially equals
  // clientWidth — the assertion would pass no matter what the page does.
  await expect(page.getByRole("list", { name: "Découvrir les Canetons" })).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("the hero's sentence is on the first screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The badge and the display line together must leave the supporting sentence
  // on the first screen — that sentence carries the only practically useful
  // facts on the page (Saturday mornings, no experience needed). 844px is the
  // viewport, and the souper card sits above all of this while its flag is on,
  // which is why the bound is the sentence's TOP rather than the hero's height.
  const sentence = page.getByText(/pas besoin de connaître la musique/);
  const box = (await sentence.boundingBox())!;
  expect(box.y, "the hero sentence should start within the first screen").toBeLessThan(844);
});

test("every destination card is a full-size tap target that navigates", async ({ page }) => {
  const destinations = [
    { name: /^Nous rejoindre/, path: "/commencement" },
    { name: /^Les canetons/, path: "/canetons" },
    { name: /^Événements/, path: "/planning_repet" },
    { name: /^Contact/, path: "/comite_teamdirection" },
  ];

  for (const destination of destinations) {
    await page.goto("/");
    const list = page.getByRole("list", { name: "Découvrir les Canetons" });
    const link = list.getByRole("link", { name: destination.name });

    // 44px is the floor for every interactive control here. A card is far
    // bigger than that, so this fails only if the card stops BEING the link —
    // a "read more" anchor inside it would measure about 20px.
    const box = (await link.boundingBox())!;
    expect(box.height, "the whole card should be the tap target").toBeGreaterThanOrEqual(44);

    // All four, not one representative: a dead route renders a perfect card and
    // lands on the 404 view, and three of this site's pages ARE hidden routes
    // that would do exactly that.
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
  }
});

test("the next event block shows a real event and leads to the planning", async ({ page }) => {
  await page.goto("/");

  const section = page.getByRole("list", { name: "Prochain événement" });
  await expect(section).toBeVisible();

  // The fixture's first upcoming event. Its date is an offset from today, so
  // the title is the stable thing to assert on here — the unit test is what
  // pins the date, where the offset can be recomputed. A straight apostrophe:
  // that is what the fixture holds, and EventCard renders the title verbatim
  // in a <p>, not as a heading.
  await expect(section.getByText("Concert d'automne")).toBeVisible();

  await section.getByRole("link", { name: "Voir tous les événements" }).click();
  await expect(page).toHaveURL(/planning_repet$/);
  await expect(page.getByRole("heading", { level: 1, name: "Événements" })).toBeVisible();
});
```

- [ ] **Step 2: Run it**

```powershell
npx playwright test web/e2e/accueil.spec.ts
```

Expected: 4 passed. The harness starts its own Vite on **5174** with
`--mode mock`; if the dev stack is up it publishes an UNMOCKED server on 5173,
which is why the harness has a port of its own. Do not move it to 5173.

- [ ] **Step 3: Run the whole e2e suite**

```powershell
npx playwright test
```

Expected: 29 passed (25 at `80633d6`, plus these four).

- [ ] **Step 4: Commit**

```bash
git add web/e2e/accueil.spec.ts
git commit -m "test(web): e2e coverage for the home page's layout and destinations"
```

---

### Task 8: Look at the page

**This is where this plan finds its defects.** Four E1 defects and one D defect
passed a fully green suite; every one was found by screenshotting a page and
reading it.

**Files:**
- Create: `<scratchpad>/shoot-accueil.mjs` (throwaway, never committed)

- [ ] **Step 1: Start the mocked dev server on 5199**

```bash
npx vite --mode mock --port 5199 --strictPort
```

Leave it running. **Port 5199, not 5173:** something else on this machine
answers 5173 with a 302 to `/assets/dist/`, which looks like the app
half-working.

- [ ] **Step 2: Write the screenshot script**

Create `shoot-accueil.mjs` in the scratchpad directory:

```js
// Absolute import: a script in the scratchpad cannot resolve "@playwright/test"
// from the project's node_modules.
import { chromium } from "file:///c:/Workspace/website-les-canetons/node_modules/playwright/index.mjs";

const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch();

// A FRESH CONTEXT PER ROLE, never a logout: /authentification_inscription
// renders the logged-in branch when a session exists, so the second login's
// getByLabel("Identifiant :") times out on a form that is not there.
for (const role of [null, "demo.user", "demo.admin"]) {
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["desktop", 1280, 900],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();

    if (role) {
      await page.goto("http://localhost:5199/authentification_inscription");
      await page.getByLabel("Identifiant :").fill(role);
      await page.getByLabel("Mot de passe :").fill("demo");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await page.waitForURL((url) => !url.pathname.includes("authentification"));
    }

    await page.goto("http://localhost:5199/");
    // Wait on the LAST thing the page renders, so nothing is mid-mount.
    await page.getByRole("list", { name: "Découvrir les Canetons" }).waitFor();

    const file = `${OUT}/accueil-${role ?? "anonymous"}-${label}.png`;
    await page.screenshot({ path: file, fullPage: true });

    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    console.log(file, `${pageHeight}px`, sideways ? "SCROLLS SIDEWAYS" : "ok");

    await context.close();
  }
}

await browser.close();
```

- [ ] **Step 3: Run it and read every image**

```bash
node <scratchpad>/shoot-accueil.mjs <scratchpad>
```

Then **read the six PNGs**. Check, specifically:

| Look for | Why |
| --- | --- |
| The `h1` on at most three lines at 390px | Bungee sets lowercase as capitals; at `text-4xl` this line took four. If it still reads as a wall, drop to `text-2xl sm:text-4xl`. |
| The supporting sentence as **one paragraph**, not stacked words | `Card`'s base classes are `flex flex-col`; a hint on `/planning_repet` stacked into two lines this way and `toHaveTextContent` could not see it. |
| The badge not dominating the first screen at 390px | It was `w-64` when this page was a heading and a box. |
| The four cards 1-up at 390px, 2-up at 1280px, **equal heights per row** | `h-full` is what removes the ragged edge. |
| The next-event card's button not overlapping its date | The E1 defect this exact card class had: `absolute top-2 right-2` controls rendered on top of the date at 390px. |
| The admin shot showing "Voir les inscriptions"; the member and anonymous shots showing "S’inscrire au souper" | The capability matrix is not a hierarchy — an admin holds `view_summary` and never `respond`. |
| No horizontal scroll on any of the six | The script prints it per shot. |

- [ ] **Step 4: See the flag-off state, which is the state the page exists for**

With the souper card gone the front page used to be a heading and a box. Check
what it is now: in `web/src/mocks/handlers.ts`, temporarily set
`features: { souper_signup: false }` in the `/api/config` handler, re-run the
script into a second directory, and read the anonymous phone and desktop shots.
The page must still read as a front door. **Revert the handler afterwards** —
`git diff web/src/mocks/handlers.ts` must be empty before Task 9.

- [ ] **Step 5: Fix what you saw, if anything**

Any change here needs its own test if it is testable, and a re-run of step 3.
Commit fixes individually:

```bash
git commit -m "fix(web): <what the screenshot showed>"
```

- [ ] **Step 6: Stop the dev server**

---

### Task 9: Verify, update the handover, open the PR

- [ ] **Step 1: The full check**

From **PowerShell**, at the repo root:

```powershell
npm run check
```

Expected: exit 0. It runs typecheck, Pint, the web suite, eslint, stylelint,
prettier, the secret guard and `guard:images` — whose two "exempt but not in the
tree" notes for `comite.jpg` and `Flyer.jpeg` are expected output, not failures.

- [ ] **Step 2: The suites, individually, with their numbers**

```powershell
npx vitest run
npm run test:js
npx playwright test
```

Against the `80633d6` baseline in `docs/continue-here.md`, expect:
- **Vitest: 249** (234 + 3 hero + 1 no-figure + 1 badge + 3 NextEvent + 2
  page-level next-event + 3 DestinationCards + 1 destinations + 1 Admin), in
  **39** files (36 + NextEvent, DestinationCards, Admin).
- **`test:js`: 140 passed**, unchanged — no tooling was touched.
- **Playwright: 29 passed** (25 + 4).

Record the numbers you actually get. If they differ, say so rather than
adjusting the claim.

- [ ] **Step 3: The build and the smoke checks**

```powershell
npm run build
npm run smoke
```

Expected: exit 0, `dist/build/` holding `index.html`, `assets/` and
`api-laravel/`; smoke 13/13.

- [ ] **Step 4: Confirm the API was not touched**

```bash
git diff --stat main -- api/
```

Expected: empty. E2b is a new consumer of `GET /api/events` and nothing more, so
the Laravel suite cannot have moved — say that in the PR rather than claiming a
run that did not happen. If the diff is NOT empty, something went wrong; run the
suite in Docker:

```powershell
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

- [ ] **Step 5: Update the handover**

Edit `docs/continue-here.md`:

1. In "START HERE", change E2b from "next — spec written, not yet planned" to
   shipped, and make **E2c** the next round.
2. In the sub-projects table, mark **E2b done** with this PR's number.
3. In "The numbers that mean green", replace the Vitest and Playwright counts
   with the ones from step 2, and date the table to today.
4. In "What E2 inherits", strike the `/accueil` front-door item, and in
   "What E is actually facing" strike "`/accueil` is a heading and one
   placeholder box".
5. Fix the handover's own staleness while you are in there: it says `main` is at
   `022f8b9`, but `fc13683` (#66), `3fdae68` (#67) and `80633d6` (#69) landed
   after it. Add them to the "Branch and merge history" table.
6. **Do not touch the PROD-blocked section.** E2b adds and fills no `<Tbd>`: 23
   `Tbd` and 10 `PhotoPending` is still the number.

- [ ] **Step 6: Commit and push a branch**

```bash
git checkout -b feat/e2b-accueil-front-door
git add docs/continue-here.md
git commit -m "docs: update the handover for E2b"
git push -u origin feat/e2b-accueil-front-door
```

(If the work above was committed on `main`, move it: `git branch -f main
origin/main` after branching, and confirm `git log --oneline origin/main..HEAD`
lists exactly this plan's commits.)

- [ ] **Step 7: Open the PR — and stop there**

The title must be Conventional Commits; CI enforces it
(`.github/workflows/pr-title.yml`). Fill in **every** section of
`.github/PULL_REQUEST_TEMPLATE.md`.

```bash
gh pr create --title "feat(web): /accueil as a front door" --body-file <filled-in template>
```

**Do not merge.** A merge to `main` auto-deploys TEST, so merging *is*
deploying. Report CI's result and hand the decision over.

---

## Self-review against the spec

| Spec requirement | Task |
| --- | --- |
| Hero: display line + one supporting sentence, no tutoiement, no head-count | 1 |
| Page order: souper, hero, PhotoPending, next event, destinations | 1, 3, 5 |
| Next event read live from `GET /api/events` — date, title, times, location, links to `/planning_repet` | 2, 3 |
| **Degrades to nothing** — not an empty card, not "aucun événement" | 2 (steps 1 and 5), 3 |
| Loading and error states never block the hero or the destinations | 2, 3 |
| Four destination cards to the four named routes | 5 |
| "a curated subset, not generated from NAV" stated in the component | 4 |
| Souper card unchanged, still flag-gated, still first | 1 — its existing tests are untouched |
| Test: the hero copy renders | 1 |
| Test: the next-event block against the MSW fixture | 2 |
| Test: **absent** with no upcoming events | 2, 3 |
| Test: the four destination links point at the four routes | 5 |
| Look at the page at 390 and 1280, three roles, flag on and off | 8 |
| No `<Tbd>` added or filled; PROD stays blocked | 9 step 5 |
| No nav change, no `/historique` change, no hero photograph, no API change | nothing here touches them; 9 step 4 verifies the API |

**Two documented departures from the spec**, both because the spec predates the
code, and both written into the code as comments rather than left for a reader
to notice:

1. **The badge is kept**, folded into the hero. PR #69 put it on this page two
   days after the spec was written, and it is the badge's only placement on the
   site.
2. **The third card is titled "Événements", not "Planning".** E1c renamed that
   page's nav entry and its own `h1` to "Événements"; two names for one page on
   the front door is the drift the content audit exists to catch.

**One thing the spec asks for that no test can prove:** that the hero copy is a
condensation rather than an invention. Task 1's tests pin the sentences and the
component comment names `/historique` as the source, which is the most a test can
do. It still deserves the band's eyes once.
