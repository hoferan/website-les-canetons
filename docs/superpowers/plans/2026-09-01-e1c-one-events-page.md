# E1c — one events page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `/sinscrire` into `/planning_repet` so one public page lists the events and carries every control, each gated by the capability that already gates it.

**Architecture:** The two pages already share `GET /api/events` and `EventCard`; only the buttons differ, and those are chosen per card by capability rather than per page. So this moves controls onto one page and retires the other — no new component, no API change. It lands in an order where every commit leaves a working site: the shared control moves out of the dying page first, the surviving page grows the controls second, and `/sinscrire` is only retired once nothing needs it.

**Tech Stack:** React 19, React Router 7, Vite 8, Tailwind 4 (CSS-first), shadcn/ui (vendored), TanStack Query, MSW, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-e1c-one-events-page-design.md`

**Branch:** `feat/e1-mobile-and-component-library`, stacked onto the open PR #63. Do not branch; do not merge.

---

## Read before starting

- The spec above, in full. It records *why* the merged page is public and why the archive gains exactly one action.
- `CLAUDE.md` — the capability matrix is **not a hierarchy**: `user`/`moderator` hold `respond`; `admin` holds `manage_events`/`view_summary` and therefore may **not** respond.

**Run the web suite from PowerShell, not Git Bash.** Git Bash reports the cwd with a lowercase drive letter and Vitest 4 keys module resolution off that path; from Git Bash it can load two instances of `vitest` and every test file fails to collect with "Vitest failed to find the runner". It looks like a catastrophic regression and is not one. The identical command from PowerShell is green.

**The Laravel suite is not needed for this plan** — no task touches `api/`. Do not skip `npm run check`, which does not run it either.

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `web/src/pages/AnswerControls.tsx` | Create — the two answers for one event, moved out of `Sinscrire.tsx` unchanged | 1 |
| `web/src/pages/PlanningRepet.tsx` | Modify — grows the answer controls, the Résumé link, the anonymous hint, the archive's Résumé | 2, 3, 4, 5 |
| `web/src/pages/PlanningRepet.test.tsx` | Modify — absorbs `Sinscrire.test.tsx`'s role-matrix and one-tap coverage | 2, 3, 4, 5 |
| `web/src/pages/Sinscrire.tsx` | Delete | 5 |
| `web/src/pages/Sinscrire.test.tsx` | Delete — its coverage moves in tasks 2-4 | 5 |
| `web/src/routes.tsx` | Modify — `/sinscrire` redirects; `RequireAuth` import goes | 5, 6 |
| `web/src/routes.test.tsx` | Modify — pins the redirect and the new `h1` | 5 |
| `web/src/components/Layout.tsx` | Modify — one nav entry, `ACTIVE_ALIASES` retargeted | 5 |
| `web/src/components/Layout.test.tsx` | Modify — the nav assertions name "Événements" | 5 |
| `web/src/pages/Admin.tsx` | Modify — two destination cards become one | 5 |
| `web/src/pages/InscriptionsUtilisateurs.tsx` | Modify — post-answer navigation target | 5 |
| `web/src/components/guards.tsx` | Modify — `RequireAuth` deleted | 6 |
| `web/src/components/guards.test.tsx` | Modify — its three `RequireAuth` tests go | 6 |
| `web/e2e/members.spec.ts` | Modify — guard-bounce retargeted, answer journey moves to `/planning_repet` | 7 |
| `web/e2e/mobile.spec.ts` | **Unchanged** — it already targets `/planning_repet` and the list named "Événements". Listed here so nobody "fixes" it | — |

---

## Task 1: Move `AnswerControls` out of the dying page

`AnswerControls` lives inside `Sinscrire.tsx` today. `PlanningRepet` needs it and `Sinscrire.tsx` is about to be deleted, so it moves out first, **unchanged**, while both pages still work. Nothing about its behaviour changes in this task and no test should need editing.

It goes in `web/src/pages/`, beside `EventActions.tsx`, because that is where this project already keeps a page-level control component.

**Files:**
- Create: `web/src/pages/AnswerControls.tsx`
- Modify: `web/src/pages/Sinscrire.tsx`

- [ ] **Step 1: Establish the baseline**

```powershell
npm run test:web
```

Record the passing count. It must be identical at Step 5.

- [ ] **Step 2: Create `web/src/pages/AnswerControls.tsx`**

Move the component across verbatim, with its docblock, plus the imports it needs:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getEventIndexQueryKey, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { Button } from "@/components/ui/button";

/**
 * The two answers, for one event.
 *
 * ONE TAP COMMITS. The old flow was four interactions — tap S'inscrire, land on
 * a second page, open a <select> (an OS wheel picker on a phone), pick, tap
 * Confirmer — for a yes/no question, on a screen someone reads outdoors while
 * deciding whether they play on Saturday.
 *
 * That is only safe because the answer stays CHANGEABLE. The API has always
 * upserted on (user_id, event_id); it was the UI that made a mistap permanent
 * with a disabled "Choix enregistré" button. So a mistap here self-corrects.
 *
 * Its own component, and its own state, because pending and error belong to one
 * card. Hoisted to the page they would grey out every card while one saves.
 *
 * It lives beside EventActions rather than inside a page because BOTH the
 * events list and any future single-event view need it, and it used to live
 * inside /sinscrire — the page E1c retired.
 */
export function AnswerControls({ eventId, answer }: { eventId: number; answer: string | null }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const respond = useResponseStore({
    mutation: {
      onSuccess: async () => {
        setChanging(false);
        toast.success("Votre réponse est enregistrée.");
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      },
      onError: setFromThrown,
    },
  });

  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending) return;
    clear();
    respond.mutate({ data: { eventId, participation } });
  };

  if (answer && !changing) {
    return (
      <>
        <p className="font-semibold text-violet">
          {answer === "participate" ? "Je participe" : "Je ne participe pas"}
        </p>
        <Button type="button" variant="outline" onClick={() => setChanging(true)}>
          Modifier
        </Button>
      </>
    );
  }

  return (
    <>
      {/* w-full so the error takes its own line: this renders into
          EventCard's `actions` row, which is a flex container, and a bare
          FormError would sit beside a button instead of above both. */}
      <div className="w-full">
        <FormError error={error} />
      </div>
      <Button
        type="button"
        aria-disabled={respond.isPending}
        onClick={() => send("participate")}
        className="flex-1 sm:flex-none"
      >
        Je participe
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-disabled={respond.isPending}
        onClick={() => send("notparticipate")}
        className="flex-1 sm:flex-none"
      >
        Je ne participe pas
      </Button>
    </>
  );
}
```

- [ ] **Step 3: Delete the component from `Sinscrire.tsx` and import it instead**

Remove the whole `function AnswerControls(...) { ... }` block and its docblock from `web/src/pages/Sinscrire.tsx`, and add:

```tsx
import { AnswerControls } from "./AnswerControls";
```

- [ ] **Step 4: Drop the imports `Sinscrire.tsx` no longer uses**

`useQueryClient`, `useState`, `toast`, `getEventIndexQueryKey`, `useResponseStore`, `useApiFormError`, `FormError` and `Button` were all for `AnswerControls`. Let ESLint say which are now unused:

```bash
npm run lint:js
```

Expected after removing them: no output. **Do not guess** — remove exactly what ESLint names.

- [ ] **Step 5: The checkpoint**

```powershell
npm run test:web
```

Expected: the **same passing count as Step 1**, with no test file edited. This task moved a file and changed nothing else.

```bash
git diff --stat -- "web/src/**/*.test.tsx"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/AnswerControls.tsx web/src/pages/Sinscrire.tsx
git commit -m "refactor(web): move AnswerControls out of Sinscrire

It lives beside EventActions now, which is where this project keeps a
page-level control component. Moved verbatim ahead of the merge, so the commit
that grows /planning_repet is about the merge and this one is provably not:
same tests, same count, no test edited."
```

---

## Task 2: `/planning_repet` grows the answer controls and the summary link

The merge itself. After this task both pages do the same thing, which is briefly redundant and deliberately so — `/sinscrire` is retired in Task 5, once nothing needs it.

**Files:**
- Modify: `web/src/pages/PlanningRepet.tsx`
- Modify: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/pages/PlanningRepet.test.tsx`. These are `Sinscrire.test.tsx`'s role-matrix and one-tap tests, retargeted at this page — that file is deleted in Task 5 and its coverage must land here first:

```tsx
const cards = async () =>
  within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem");

test("a member who may respond gets both answers on every event", async () => {
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Je ne participe pas" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other action entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
});

test("answering an event takes one tap and shows the saved answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);

  const first = (await cards())[0]!;
  await user.click(within(first).getByRole("button", { name: "Je participe" }));

  expect(await within(first).findByText("Je participe")).toBeInTheDocument();
  expect(within(first).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The API has ALWAYS allowed this — ResponseController::store upserts on
// (user_id, event_id) and its own comment says "Answering again overwrites".
// Only the UI forbade it, with a disabled "Choix enregistré" button, which made
// a mistap permanent. One-tap answering is only safe because of this.
test("an answer can be changed", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  const concert = SEED.find((event) => event.title === "Concert d'automne")!;
  server.use(
    http.get("/api/events", () => HttpResponse.json([{ ...concert, response: "participate" }])),
  );

  await renderWithSession(<PlanningRepet />);
  await user.click(await screen.findByRole("button", { name: "Modifier" }));
  expect(await screen.findByRole("button", { name: "Je ne participe pas" })).toBeInTheDocument();
});

// An anonymous visitor reads the planning and can do nothing to it. This is the
// assertion that stops the merged page leaking member controls to the public.
test("an anonymous visitor gets no controls at all", async () => {
  await renderWithSession(<PlanningRepet />);
  await screen.findByRole("list", { name: "Événements" });
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Modifier / })).toBeNull();
});
```

Add `setMockUser` to the existing `../mocks/handlers` import (the file already imports `SEED` from there), and add:

```tsx
import userEvent from "@testing-library/user-event";
```

if it is not already present — Task E1b added it for the past-events disclosure, so check before adding a duplicate.

- [ ] **Step 2: Run and verify they fail**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: FAIL — `Unable to find role="button" and name "Je participe"`. The anonymous test PASSES already, because the page has no such controls yet; that is expected and it is a guard for later, not a driver now.

- [ ] **Step 3: Work out once whether this visitor has any controls at all**

An anonymous visitor must not get an empty `mt-4` footer under every card. `EventCard` renders its actions row whenever `actions` is truthy, and a fragment whose three branches are all `null` **is** truthy — so the emptiness has to be decided before the prop is built.

In `web/src/pages/PlanningRepet.tsx`, above the `return`, beside the existing `past` calculation:

```tsx
  // Anonymous visitors get no footer at all rather than an empty one: an
  // EventCard renders its actions row whenever `actions` is truthy, and a
  // fragment of three nulls is truthy.
  const hasActions = can("respond") || can("view_summary") || can("manage_events");
```

- [ ] **Step 4: Render the controls**

In the same file, replace the `actions` prop on the upcoming list's `EventCard`:

```tsx
            actions={
              can("manage_events") ? (
                <EventActions event={toEditableEvent(event)} onEdit={setEditing} />
              ) : undefined
            }
```

with:

```tsx
            actions={
              hasActions ? (
                <>
                  {/* The capability matrix, on one card. `respond` is user and
                      moderator; `view_summary` and `manage_events` are admin.
                      They do NOT overlap, so an admin gets the summary and the
                      edit controls and NO answer buttons -- which is the whole
                      reason this page can serve every member at once. */}
                  {can("respond") ? (
                    <AnswerControls eventId={event.id} answer={event.response} />
                  ) : null}
                  {can("view_summary") ? (
                    <ButtonLink to={`/inscriptions_admin?id=${event.id}`} variant="outline">
                      Résumé
                    </ButtonLink>
                  ) : null}
                  {can("manage_events") ? (
                    <EventActions event={toEditableEvent(event)} onEdit={setEditing} />
                  ) : null}
                </>
              ) : undefined
            }
```

- [ ] **Step 5: Add the imports**

```tsx
import { AnswerControls } from "./AnswerControls";
import { ButtonLink } from "@/components/ButtonLink";
```

- [ ] **Step 6: Run the tests**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: all PASS.

```powershell
npm run test:web
```

Expected: all PASS. `/sinscrire` is untouched and its own tests still pass — both pages work right now.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/PlanningRepet.tsx web/src/pages/PlanningRepet.test.tsx
git commit -m "feat(web): the planning page carries every control

Answer buttons for respond, Résumé for view_summary, Modifier/Supprimer for
manage_events -- all on the same card, each gated by the capability that already
gated it on the page it came from.

An anonymous visitor gets no footer at all rather than an empty one: EventCard
renders its actions row whenever \`actions\` is truthy, and a fragment of three
nulls is truthy. A test pins that the public sees no controls.

/sinscrire still works and still has its own tests. It is retired once nothing
needs it."
```

---

## Task 3: The hint for anonymous visitors

An anonymous visitor sees a schedule and no controls, with nothing to suggest more exists.

**Files:**
- Modify: `web/src/pages/PlanningRepet.tsx`
- Modify: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/pages/PlanningRepet.test.tsx`:

```tsx
test("an anonymous visitor is told that logging in lets them answer", async () => {
  await renderWithSession(<PlanningRepet />);
  const hint = await screen.findByText(/Connectez-vous pour indiquer votre participation/);
  expect(hint).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Connectez-vous" })).toHaveAttribute(
    "href",
    "/authentification_inscription",
  );
});

// A member already has the buttons in front of them. A banner repeating what
// the UI shows is noise on every visit.
test("a logged-in member never sees the hint", async () => {
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);
  await screen.findByRole("list", { name: "Événements" });
  expect(screen.queryByText(/Connectez-vous pour indiquer/)).toBeNull();
});
```

- [ ] **Step 2: Run and verify they fail**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: the first FAILS on the missing text; the second passes vacuously and becomes meaningful in Step 3.

- [ ] **Step 3: Render the hint**

`useSession()` already gives `can`; take `user` from it too:

```tsx
  const { can, user } = useSession();
```

and render immediately above the `<ul aria-label="Événements">`:

```tsx
      {/* Shown to ANONYMOUS visitors only. The page is public — anyone may read
          when the band plays — but without this a visitor sees a bare schedule
          with nothing to suggest that signing in lets them answer. A member
          never sees it: they have the buttons. */}
      {!user ? (
        <p className="mt-6 rounded-lg border border-line bg-panel p-4 text-ink-muted">
          <Link to="/authentification_inscription" className="focus-ring font-semibold text-violet underline">
            Connectez-vous
          </Link>{" "}
          pour indiquer votre participation.
        </p>
      ) : null}
```

with `import { Link } from "react-router-dom";`.

> A plain `Link` inside a sentence, not a `ButtonLink`: this is an inline link in prose, which is the one case the 44px target floor does not apply to. The same reasoning left `/commencement`'s map link and the committee mailto alone in E1b.

- [ ] **Step 4: Run the tests**

```powershell
npm run test:web
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/PlanningRepet.tsx web/src/pages/PlanningRepet.test.tsx
git commit -m "feat(web): tell an anonymous visitor that logging in lets them answer

The page is public and stays public, but a visitor saw a bare schedule with no
sign that anything more existed. A member never sees the hint -- they have the
buttons, and a banner repeating the UI is noise on every visit.

An inline link in prose, not a ButtonLink: the 44px floor does not apply to a
link inside a sentence, which is the same call E1b made for the committee
mailto and the map link."
```

---

## Task 4: The archive gains Résumé

Past cards carry no controls today. Merging the pages puts **Résumé** on the same page as the disclosure, and an admin looking at last week's concert is then one click from who actually came — which is the most useful moment for that summary.

**Files:**
- Modify: `web/src/pages/PlanningRepet.tsx`
- Modify: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/pages/PlanningRepet.test.tsx`:

```tsx
test("an admin can read the summary of a past event", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(screen.getByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  expect(await past.findByRole("link", { name: "Résumé" })).toBeInTheDocument();
});

// Résumé is read-only and is the point of the archive for an admin. Everything
// destructive stays off it: a delete button on a list of things that already
// happened invites exactly the misclick it guards against. Answering is not
// offered either — answering an event that has happened is meaningless, which
// is why /inscriptions_utilisateurs 'Aucun événement' branch catches it too.
test("the archive offers nothing destructive, and no way to answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(screen.getByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  await past.findByRole("link", { name: "Résumé" });
  expect(past.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
  expect(past.queryByRole("button", { name: /^Modifier/ })).toBeNull();
  expect(past.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("a member sees the archive with no controls on it", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);

  await user.click(screen.getByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  await past.findByText("Répétition du samedi");
  expect(past.queryByRole("button", { name: "Je participe" })).toBeNull();
  expect(past.queryByRole("link", { name: "Résumé" })).toBeNull();
});
```

- [ ] **Step 2: Run and verify they fail**

```powershell
npx vitest run web/src/pages/PlanningRepet.test.tsx
```

Expected: the first FAILS on the missing `Résumé` link. The other two pass already and are guards.

- [ ] **Step 3: Add it to the archive's cards**

In `web/src/pages/PlanningRepet.tsx`, the past list's `EventCard` currently takes no `actions`. Give it exactly one:

```tsx
                <EventCard
                  key={event.id}
                  event={event}
                  className="opacity-75"
                  actions={
                    can("view_summary") ? (
                      <ButtonLink to={`/inscriptions_admin?id=${event.id}`} variant="outline">
                        Résumé
                      </ButtonLink>
                    ) : undefined
                  }
                >
```

and update the comment above the past `<ul>` — the old one says the archive carries no actions, which stops being true here:

```tsx
          {/* NAMED differently from "Événements", so a listitem query scoped to
              either list means exactly one thing.

              ONE action, and only for view_summary: who actually came is most
              useful AFTER an event, not least. Everything destructive stays
              off — a delete button on a list of things that already happened
              invites exactly the misclick it guards against — and there is no
              way to answer, because answering an event that has happened is
              meaningless. */}
```

- [ ] **Step 4: Run the tests**

```powershell
npm run test:web
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/PlanningRepet.tsx web/src/pages/PlanningRepet.test.tsx
git commit -m "feat(web): an admin can read the summary of a past event

Merging the pages put Résumé on the same page as the past-events disclosure, and
who actually came is most useful AFTER an event rather than least.

One action only. Nothing destructive goes on the archive -- a delete button on a
list of things that already happened invites exactly the misclick it guards
against -- and there is no way to answer, because answering an event that has
happened is meaningless."
```

---

## Task 5: Retire `/sinscrire`

One atomic task: the nav, the route, the page and everything pointing at it move together, or the site contradicts itself between commits.

**Files:**
- Delete: `web/src/pages/Sinscrire.tsx`, `web/src/pages/Sinscrire.test.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`, `web/src/components/Layout.tsx`, `web/src/components/Layout.test.tsx`, `web/src/pages/Admin.tsx`, `web/src/pages/InscriptionsUtilisateurs.tsx`, `web/src/pages/PlanningRepet.tsx`

- [ ] **Step 1: Confirm the coverage has already moved**

```bash
grep -c "^test(" web/src/pages/Sinscrire.test.tsx
```

Expected: `6`. Every one of them now exists in `PlanningRepet.test.tsx` — the role matrix, one-tap, change-the-answer and the order — added in Task 2. **Check that before deleting**; the order test lives in `PlanningRepet.test.tsx` already as "the events are listed in the order the API returned them", so it is not re-added.

- [ ] **Step 2: The redirect**

In `web/src/routes.tsx`, replace the whole `/sinscrire` route:

```tsx
        <Route
          path="/sinscrire"
          element={
            <RequireAuth>
              <Sinscrire />
            </RequireAuth>
          }
        />
```

with:

```tsx
        {/* MERGED into /planning_repet on 2026-09-01. The URL is kept and
            REDIRECTED rather than dropped, because URLs are frozen here: members
            have it bookmarked and the nav pointed at it for years. Nothing in
            the app links here any more — every internal link goes straight to
            the surviving URL — so this exists for bookmarks alone, which is why
            routes.test.tsx pins it. */}
        <Route path="/sinscrire" element={<Navigate to="/planning_repet" replace />} />
```

and change the router import at the top of the file, which reads `import { Route, Routes } from "react-router-dom";` today:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
```

then delete the `import { Sinscrire } from "./pages/Sinscrire";` line.

- [ ] **Step 3: Pin the redirect**

In `web/src/routes.test.tsx`, add beside the hidden-page tests:

```tsx
// /sinscrire was MERGED into /planning_repet, not deleted: the URL is frozen and
// is in members' bookmarks. A redirect that nothing in the app relies on is a
// redirect nobody notices has broken, so it is pinned here.
test("/sinscrire redirects to the planning rather than 404ing", async () => {
  await renderWithSession(<AppRoutes />, { route: "/sinscrire" });
  expect(await screen.findByRole("heading", { name: "Événements" })).toBeInTheDocument();
});
```

- [ ] **Step 4: The page heading**

In `web/src/pages/PlanningRepet.tsx`:

```tsx
      <h1 className="font-display text-4xl">Événements</h1>
```

(replacing "Planning des prestations et des répétitions"). The "sous réserve de modifications" subtitle below it stays.

Then update `web/src/routes.test.tsx`'s route table, which asserts the old heading:

```tsx
  ["/planning_repet", "Événements"],
```

and delete the comment above that line — "The real page, not a placeholder — hence the fuller heading" — which no longer describes anything.

- [ ] **Step 5: The nav**

In `web/src/components/Layout.tsx`, replace these two `NAV` entries:

```tsx
  { to: "/planning_repet", label: "Planning et répétitions" },
  { to: "/sinscrire", label: "Inscriptions" },
```

with one:

```tsx
  { to: "/planning_repet", label: "Événements" },
```

and retarget the aliases:

```tsx
/**
 * The two inscription sub-pages highlight the "Événements" item, matching the
 * old setActiveNavigation() behaviour. They pointed at /sinscrire until that
 * page was merged into /planning_repet on 2026-09-01.
 */
const ACTIVE_ALIASES: Record<string, string> = {
  "/inscriptions_admin": "/planning_repet",
  "/inscriptions_utilisateurs": "/planning_repet",
};
```

- [ ] **Step 6: The nav's tests**

In `web/src/components/Layout.test.tsx`, two tests name the old labels.

Replace the alias test's expectation:

```tsx
test("the inscription sub-pages highlight the Événements item, as the old nav did", async () => {
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_admin" });
  // aria-current, not a class: this is the accessible expression of "you are
  // here", it is what a screen reader announces, and it does not have to be
  // rewritten the next time the active item's styling changes.
  expect(screen.getByRole("link", { name: "Événements" })).toHaveAttribute("aria-current", "page");
});
```

and the ordinary case:

```tsx
test("the item for the page you are on is the current one, and only it", async () => {
  await renderWithSession(<AppRoutes />, { route: "/planning_repet" });

  expect(screen.getByRole("link", { name: "Événements" })).toHaveAttribute("aria-current", "page");

  const current = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
  expect(current).toEqual(["Événements"]);
});
```

The nav-order test asserts only `labels.slice(0, 5)` — "Accueil", "Commencer les Canetons", "Contact Canetons", "Les canetons", "Moniteurs" — none of which move. **Leave it alone.**

- [ ] **Step 7: `Admin.tsx`'s destinations**

Two cards pointed at the two pages. Replace the whole `DESTINATIONS` array:

```tsx
const DESTINATIONS: { to: string; title: string; description: string }[] = [
  {
    to: "/planning_repet",
    title: "Événements",
    description: "Ajouter, modifier ou supprimer un événement, et lire les réponses des membres.",
  },
];
```

- [ ] **Step 8: `InscriptionsUtilisateurs.tsx`'s navigation target**

```tsx
      onSuccess: () => navigate("/planning_repet"),
```

and in its docblock, replace the sentence naming the old page:

```tsx
 * A DEEP-LINK FALLBACK now, not the main flow. /planning_repet answers inline in
 * one tap, so nothing links here any more — but the URL is frozen and is in
 * bookmarks, so it keeps working and offers the same two buttons.
```

- [ ] **Step 9: Delete the page and its test**

```bash
git rm web/src/pages/Sinscrire.tsx web/src/pages/Sinscrire.test.tsx
```

- [ ] **Step 10: Find every stale mention**

```bash
grep -rn "sinscrire\|Sinscrire" web/src web/e2e --include=*.ts --include=*.tsx
```

Expected remaining: only the redirect route in `routes.tsx`, the redirect test in `routes.test.tsx`, and **comments** in `EventCard.tsx`, `ButtonLink.tsx`, `handlers.ts` and the generated `endpoints.ts`. The generated file is regenerated from the API's docblock and **must not be hand-edited**. Update the three hand-written comments to name `/planning_repet`; leave the generated one.

- [ ] **Step 11: Test**

```powershell
npm run test:web
```

Expected: all PASS, with six fewer tests than before this task (`Sinscrire.test.tsx` is gone and its coverage moved in Task 2).

```bash
npm run typecheck && npm run lint:js
```

Expected: both clean. A dangling `Sinscrire` import anywhere fails here.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(web): retire /sinscrire into /planning_repet

One page lists the events and carries every control. The nav's two entries
become one, 'Événements', and the page's h1 matches it.

/sinscrire REDIRECTS rather than 404s: URLs are frozen here, members have it
bookmarked and the nav pointed at it for years. Nothing in the app relies on
that redirect -- ACTIVE_ALIASES, Admin's destination card and
InscriptionsUtilisateurs' post-answer navigation all point at the surviving URL
directly -- which is exactly why routes.test.tsx pins it. A redirect the app
itself never exercises is one nobody notices has broken.

Sinscrire.tsx and its six tests are deleted; every one of those tests now exists
against /planning_repet."
```

---

## Task 6: Delete `RequireAuth`

`/sinscrire` was its only call site. `RequireCapability` already performs the identical anonymous → login-with-`returnTo` bounce, so nothing is lost but the component.

**Files:**
- Modify: `web/src/components/guards.tsx`, `web/src/components/guards.test.tsx`, `web/src/routes.tsx`

- [ ] **Step 1: Prove it has no call sites**

```bash
grep -rn "RequireAuth" web/src --include=*.tsx
```

Expected: only `guards.tsx` (its definition), `guards.test.tsx` (its three tests) and possibly a stale import in `routes.tsx`. **If any route still uses it, stop** — Task 5 missed something.

- [ ] **Step 2: Delete the component**

Remove the whole `export function RequireAuth({ children }: { children: ReactNode }) { … }` block from `web/src/components/guards.tsx`, and add to the file's top docblock, after the paragraph about anonymous visitors:

```
 * There is ONE guard, deliberately. RequireAuth existed alongside this and was
 * deleted on 2026-09-01 with its only call site, /sinscrire: it did nothing
 * RequireCapability does not already do for an anonymous visitor, and a guard
 * with no callers is a guard nobody keeps correct.
```

- [ ] **Step 3: Delete its tests**

In `web/src/components/guards.test.tsx`, delete these three tests entirely:

- `RequireAuth lets any logged-in member through, whatever their role`
- `RequireAuth keeps an anonymous visitor out`
- `RequireAuth sends an anonymous visitor to the login route`

and remove `RequireAuth` from the import at the top:

```tsx
import { RequireCapability } from "./guards";
```

**Keep** `RequireCapability carries the location too, query string included` — that is the test which now solely pins the `returnTo` mechanism, and it must not be lost.

- [ ] **Step 4: Clear the import in `routes.tsx`**

```tsx
import { RequireCapability } from "./components/guards";
```

- [ ] **Step 5: Test**

```powershell
npm run test:web
```

Expected: all PASS, three fewer tests.

```bash
npm run typecheck && npm run lint:js
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/guards.tsx web/src/components/guards.test.tsx web/src/routes.tsx
git commit -m "refactor(web): delete RequireAuth, which lost its only call site

/sinscrire was the only route using it. RequireCapability already performs the
identical anonymous → login-with-returnTo bounce, so nothing is lost but the
component and its three tests.

The returnTo mechanism stays pinned by 'RequireCapability carries the location
too, query string included', which is now the only test that covers it."
```

---

## Task 7: The e2e suite

**The guard-bounce test is the trap in this whole plan.** It proves itself by visiting `/sinscrire` anonymously and expecting the login form. That route now redirects to a **public** page, so without a retarget the test would pass against a page that never bounces — asserting nothing, silently, forever.

**Files:**
- Modify: `web/e2e/members.spec.ts`

- [ ] **Step 1: Retarget the guard bounce**

Replace `a guard bounce returns you to the page you wanted`:

```tsx
// /inscriptions_admin, not /sinscrire: that URL now redirects to a PUBLIC page,
// so this test would pass against a page that never bounces and assert nothing
// at all. Any guarded route proves the mechanism; this one is guarded by
// RequireCapability, which is the only guard left.
test("a guard bounce returns you to the page you wanted", async ({ page }) => {
  await page.goto("/inscriptions_admin?id=1");
  await expect(page.getByRole("heading", { name: "Authentification" })).toBeVisible();

  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();
});
```

- [ ] **Step 2: Move the answer journey to the surviving URL**

In the same file, `a member answers an event in one tap and can change it` and `an admin reads the summary instead of answering` both `page.goto("/sinscrire")`. Change both to:

```tsx
  await page.goto("/planning_repet");
```

and in the first, change the list name — the merged page's list is named `"Événements"`, not `"Événements à venir"`:

```tsx
  const first = page.getByRole("list", { name: "Événements" }).getByRole("listitem").first();
```

- [ ] **Step 3: Run the e2e suite**

```bash
npm run test:e2e
```

Expected: all PASS. `planning.spec.ts` and `mobile.spec.ts` are untouched — both already target `/planning_repet` and the list named `"Événements"`.

- [ ] **Step 4: Prove the retarget actually bounces**

The point of Step 1 is that the assertion is real. Confirm the login form genuinely appears rather than the test passing by accident:

```bash
npm run test:e2e -- --grep "guard bounce"
```

Expected: 1 passed. Then temporarily change `/inscriptions_admin?id=1` to `/planning_repet` and re-run: it must **FAIL** on the missing "Authentification" heading. Change it back.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/members.spec.ts
git commit -m "test(e2e): retarget the guard bounce, and answer on the merged page

The guard-bounce test proved itself through /sinscrire, which now redirects to a
PUBLIC page -- it would have kept passing against a page that never bounces,
asserting nothing. It uses /inscriptions_admin now, and the retarget was checked
by pointing it at the public page and watching it fail.

The answer journey and the admin summary journey both move to /planning_repet
and the list named 'Événements'."
```

---

## Task 8: Look at it, verify, and update the PR

- [ ] **Step 1: Build and look**

```bash
npm run build:web
```

Serve the mocked app and read the page in all three states:

```powershell
npx vite --mode mock --port 5199 --strictPort
```

At **390** and **1280**, check:

1. **Anonymous** `/planning_repet` — the schedule, the hint above the list, and **no footer at all** under any card.
2. **`demo.user`** — two answer buttons per card, no Résumé, no Modifier/Supprimer. One tap turns a card into "Je participe" + Modifier.
3. **`demo.admin`** — Résumé, Modifier and Supprimer per card, and **no** answer buttons. The archive shows Résumé only.
4. The nav shows **one** "Événements" entry, and it is `aria-current` on this page.
5. `/sinscrire` in the address bar lands on the planning.

- [ ] **Step 2: Full verification**

```powershell
npm run check
```
```bash
npm run test:e2e
npm run build && npm run smoke
```

Expected: all green; smoke is 13/13.

- [ ] **Step 3: Confirm the blast radius**

```bash
git diff --stat main -- "web/src/**/*.test.tsx" "web/e2e"
```

Every changed test file must be one this plan named: `PlanningRepet`, `Sinscrire` (deleted), `routes`, `Layout`, `guards`, `InscriptionsUtilisateurs`, `members.spec`. Plus the files E1a/E1b already changed on this branch. **If anything else appears, something overreached.**

- [ ] **Step 4: Push and update PR #63**

```bash
git push
```

The PR body describes E1a and E1b. Add an E1c section to it — the merged page, the redirect, the deleted guard, and the archive's new action — so a reviewer is not surprised by commits the description does not mention.

**Do not merge.** A merge to `main` auto-deploys TEST, and that is André's call.

---

## Definition of done

- [ ] `npm run check` green.
- [ ] `npm run test:e2e` green, `planning.spec.ts` and `mobile.spec.ts` untouched.
- [ ] `npm run build && npm run smoke` green — 13/13.
- [ ] `grep -rn "RequireAuth" web/src` — only the explanatory comment in `guards.tsx`.
- [ ] `grep -rln "Sinscrire" web/src` — nothing (the generated `endpoints.ts` may mention `/sinscrire` in prose; that is regenerated from the API and is not hand-edited).
- [ ] The three states read at 390 and 1280, per Task 8 Step 1.
- [ ] PR #63 updated. Not merged.

## Deliberately not done

No API change — `GET /api/events` already serves every case. `/inscriptions_admin` and `/inscriptions_utilisateurs` keep their URLs and their behaviour. `PhotoPending`, page copy, motion and the hidden pages remain **E2**, and **PROD stays blocked on content** (`<Tbd>`, `<PhotoPending>`), which this plan does not touch and cannot unblock.
