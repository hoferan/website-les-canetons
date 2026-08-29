# The Members' Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four members'-area routes — respond to an event, read the answers, and the admin's landing page — leaving only the three flag-gated souper routes on `Placeholder`.

**Architecture:** An API fix first (a generated type that is currently wrong), then the pages, then the guards wired to real URLs for the first time. The pages read `GET /api/events` and `GET /api/responses` and write `POST /api/responses`, all through the generated client.

**Tech Stack:** Laravel 11 + Scramble on the API side; React 19 + TypeScript, Tailwind 4, TanStack Query via orval, Vitest + Testing Library, Playwright on the web side.

**Design:** `docs/superpowers/specs/2026-08-29-members-area-design.md`

---

## Before you start

**The capability matrix is NOT a hierarchy, and this sub-project is where that bites.**

```
user      → respond
moderator → respond
admin     → manage_events, view_summary
```

**An admin cannot respond.** On `/sinscrire` a member sees "S'inscrire" and an admin sees "Résumé" — different buttons on the same row, not one button with different permissions. Every intuition about roles says otherwise. `web/src/session/capabilities.ts` mirrors `api/app/Support/Capability.php`; the SPA's copy is **UX only** and Laravel's `capability:` middleware is the enforcement, so a mistake here will not be caught by a 403.

Other things that will trip you:

- **`web/src/api/generated/` is generated. Never hand-edit it.** Change the Laravel controller, run `npm run openapi && npm run generate:api`, commit the result. CI's `openapi-drift` job fails if either is stale.
- **The query hooks are `export function`, not `export const`** — `useResponseIndex`, `useEventIndex`, `useAuthUser`. A grep for `export const use` misses them.
- **The double `.data` is real**: `query.data.data`, TanStack Query's then orval's envelope.
- **Narrow errors with `instanceof ApiError`** — that is what `useApiFormError` is for.
- **Tailwind class names are strings**, so a token that does not exist fails silently. The tokens are in the `@theme` block of `web/src/styles.css`.
- **`npm run check` does not run the Laravel suite.** It needs a database:
  `docker compose exec -w /var/www/html/api-laravel web php artisan test` (prefix with `MSYS_NO_PATHCONV=1` in Git Bash).
- Baselines: **140 unit tests** across 20 files, **11 e2e**, `npm run check` exit 0, 13/13 smoke, **232** Laravel tests.

## File structure

| File | Responsibility |
| --- | --- |
| `api/app/Http/Controllers/Api/ResponseController.php` | **modify.** One attribute declaring the real 200 shape. |
| `api/tests/Feature/ResponseShapeContractTest.php` | **new.** Fails if the attribute and the controller disagree. |
| `api/openapi.json`, `web/src/api/generated/**` | **regenerated.** Never hand-edited. |
| `web/src/mocks/handlers.ts` | **modify.** Hand-written `GET /api/responses`. |
| `web/src/pages/Sinscrire.tsx` | **new.** The events table with the capability-split action. |
| `web/src/pages/InscriptionsUtilisateurs.tsx` | **new.** The participation form. |
| `web/src/pages/InscriptionsAdmin.tsx` | **new.** Tiles, the per-user table, the register counts. |
| `web/src/pages/Admin.tsx` | **new.** The admin hub. |
| `web/src/routes.tsx` | **modify.** Four routes, each wrapped in a guard. |
| `web/src/routes.test.tsx` | **modify.** Four rows. |
| `web/e2e/members.spec.ts` | **new.** The guard round trip, end to end. |

---

## Task 1: Type `GET /api/responses` in the contract

**Files:**
- Modify: `api/app/Http/Controllers/Api/ResponseController.php`
- Create: `api/tests/Feature/ResponseShapeContractTest.php`
- Regenerate: `api/openapi.json`, `web/src/api/generated/**`

The generated client currently declares:

```ts
export type responseIndexResponse200 = { data: string[]; status: 200 };
```

It is not a list of strings. Scramble cannot infer through the `Collection::map` that builds the response — the same failure that made `GET /api/events` a `string[]`, fixed the same way.

- [ ] **Step 1: Write the contract test first**

This is the test that makes writing the shape twice safe. It follows
`api/tests/Feature/EventShapeContractTest.php` — read that first for the
reasoning — but differs in one way that matters: `EventShapeContractTest`
compares the document against `Event::toFrontendShape()`, which is callable on
an unsaved model, so it needs no database. `ResponseController` has no such
seam; its shape is built inline from a query. So this one asks the endpoint.

Create `api/tests/Feature/ResponseShapeContractTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drift guard: the response-summary shape is written twice, and the two must
 * agree.
 *
 * WHY TWICE. Scramble cannot infer through the Collection::map that
 * ResponseController::summary() builds its payload with — it emitted
 * `string[]`, which type-checked at every SPA call site and was wrong about
 * every field. So the shape is declared in a #[Response] attribute on index(),
 * and it has to be a LITERAL: Scramble resolves a @phpstan-type alias to a
 * property-less object, which is exactly how GET /api/events ended up untyped.
 *
 * WHY THIS ONE NEEDS A DATABASE, unlike EventShapeContractTest. The event shape
 * has a seam — Event::toFrontendShape() — callable on an unsaved model. This
 * one does not: summary() is a query. The only honest way to learn what the
 * endpoint returns is to ask it.
 */
class ResponseShapeContractTest extends TestCase
{
    use RefreshDatabase;

    private const OPENAPI = __DIR__.'/../../openapi.json';

    public function test_the_documented_shape_matches_what_the_endpoint_returns(): void
    {
        [$event, $admin] = $this->seedOneEventAndAnAdmin();

        $rows = $this->actingAs($admin)
            ->getJson('/api/responses?eventId='.$event->id)
            ->assertOk()
            ->json();

        self::assertNotEmpty($rows, 'The endpoint returned no rows, so this proves nothing.');

        $documented = $this->documentedProperties();
        $actual = array_keys($rows[0]);

        sort($documented);
        sort($actual);

        self::assertSame($documented, $actual, implode("\n", [
            "The shape in ResponseController::index()'s #[Response] attribute has drifted",
            'from what the endpoint actually returns.',
            '',
            'Update BOTH the attribute and summary()\'s @return, then run',
            '`npm run openapi && npm run generate:api` and commit api/openapi.json',
            'and web/src/api/generated/ with the change.',
        ]));
    }

    /** @return list<string> */
    private function documentedProperties(): array
    {
        self::assertFileExists(self::OPENAPI, 'Run `npm run openapi` to generate it.');

        $document = json_decode((string) file_get_contents(self::OPENAPI), true, 512, JSON_THROW_ON_ERROR);
        $schema = $document['paths']['/responses']['get']['responses'][200]['content']['application/json']['schema'] ?? null;

        self::assertIsArray($schema, 'GET /responses has no documented 200 response schema at all.');
        self::assertSame('array', $schema['type'] ?? null, 'GET /responses must document an array.');
        self::assertIsArray(
            $schema['items']['properties'] ?? null,
            'GET /responses documents an array with no item properties — the #[Response] '
            .'attribute on ResponseController::index() is missing or unresolvable, and the '
            .'generated client will be untyped.'
        );

        return array_keys($schema['items']['properties']);
    }
}
```

**`seedOneEventAndAnAdmin()` is deliberately left for you to write**, because how this project builds test rows is a thing to copy rather than invent: **read two existing files in `api/tests/Feature/` first** — one that creates an event and one that creates a user with a role — and follow whatever they do (factories, `::create([...])`, or a seeder). It needs to produce one event, at least one user so the LEFT JOIN yields a row, and an admin to call as. Do not reach for `Event::factory()` without checking `api/database/factories/` actually has one.

Run it: it must FAIL, because the attribute does not exist yet and
`$schema['items']['properties']` will be absent.

- [ ] **Step 2: Add the attribute**

In `api/app/Http/Controllers/Api/ResponseController.php`, import the alias the sibling controller uses:

```php
use Dedoc\Scramble\Attributes\Response as ApiResponse;
```

and put this immediately above `public function index(Request $request): JsonResponse`:

```php
    /**
     * The 200 shape, declared because Scramble cannot infer it.
     *
     * index() builds its payload with a Collection::map, and Scramble gives up
     * on that — it emitted `string[]`, which type-checked at every call site
     * and was wrong about every field. GET /api/events had the identical
     * problem and this is the identical fix.
     *
     * A LITERAL, not a @phpstan-type alias: Scramble resolves an alias to a
     * property-less object, which is how the events endpoint ended up as
     * `string[]` in the first place. That means the shape is written twice —
     * here and in summary()'s @return — and ResponseShapeContractTest fails if
     * the two ever disagree, so it is duplication a test catches rather than a
     * comment asking you to remember.
     */
    #[ApiResponse(status: 200, type: 'list<array{username: string, instrument: string|null, response: string|null}>')]
```

- [ ] **Step 3: Run the contract test**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ResponseShapeContractTest
```
Expected: PASS. (PowerShell, or prefix with `MSYS_NO_PATHCONV=1` in Git Bash.)

- [ ] **Step 4: Regenerate the client**

```bash
npm run openapi && npm run generate:api
```

Then confirm the type is fixed:

```bash
grep -A4 "responseIndexResponse200" web/src/api/generated/endpoints.ts
```

Expected: `data` is now a list of objects with `username`, `instrument` and `response` — **not** `string[]`. If it is still `string[]`, the attribute did not take; stop and report rather than continuing, because everything downstream is built on this type.

- [ ] **Step 5: Verify nothing else moved**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
npm run typecheck && npm run lint:api
```
Expected: 233 Laravel tests (232 + the new one); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add api web/src/api/generated
git commit -m "fix(api): declare the real shape of GET /api/responses

Scramble emitted string[] — it cannot infer through the Collection::map that
builds the payload, exactly as it could not for GET /api/events. The endpoint
the whole attendance summary is built on had no usable type, and the wrong one
type-checked everywhere.

The shape is now written twice, in the attribute and in summary()'s @return,
because Scramble resolves a @phpstan-type alias to a property-less object.
ResponseShapeContractTest fails if they diverge.

openapi-drift would not have caught this: it checks the committed document
matches what Scramble emits, not that what Scramble emits is right."
```

---

## Task 2: The mocked backend

**Files:**
- Modify: `web/src/mocks/handlers.ts`

Every assertion in this sub-project is about specific counts, and the generated handler returns faker data. `GET /api/responses` has to be hand-written.

- [ ] **Step 1: Add the handler**

In `web/src/mocks/handlers.ts`, add a seed and a handler. Put the seed next to the existing `SEED` events array, and the handler in the `overrides` array immediately after the `/api/events` write handlers.

```ts
type MockResponseRow = {
  username: string;
  instrument: string | null;
  response: string | null;
};

/**
 * One row per user, whether or not they answered — that is what the real
 * endpoint returns (a LEFT JOIN from users), and it is what lets the summary
 * count "En attente" and derive the register list without a hardcoded array.
 *
 * Deliberately covers all three states and a user with no instrument, because
 * every assertion about this page is about counts.
 */
const RESPONSE_ROWS: MockResponseRow[] = [
  { username: "demo.user", instrument: "Trompette", response: "participate" },
  { username: "demo.moderator", instrument: "Trompette", response: "notparticipate" },
  { username: "anna.batterie", instrument: "Batterie", response: "participate" },
  { username: "luc.trombone", instrument: "Trombone", response: null },
  { username: "sans.instrument", instrument: null, response: "participate" },
];
```

and the handler:

```ts
  // Hand-written: the generated handler returns faker data, and every
  // assertion about the summary is about specific counts. Mirrors the real
  // endpoint's authorisation — view_summary is admin-only — so a non-admin
  // gets the same 403 here as it would there.
  http.get("/api/responses", ({ request }) => {
    if (!currentUser) return unauthenticated();
    if (currentUser.role !== "admin") return forbidden();

    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) {
      return HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "eventId", reason: "required" }],
        },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(eventId) || Number(eventId) <= 0) {
      return HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "eventId", reason: "invalid_number" }],
        },
        { status: 400 },
      );
    }

    return HttpResponse.json(RESPONSE_ROWS);
  }),
```

- [ ] **Step 2: Also let the mocked POST record an answer**

The existing `POST /api/responses` handler comes from the generated catch-all, which always succeeds and records nothing. `/sinscrire` shows "Choix enregistré" once an event carries a response, so a test that answers and then looks at the list needs the mock to remember.

Add, in `overrides`, before the generated handlers:

```ts
  // Records the answer on the mocked event, so a test can respond and then see
  // "Choix enregistré" on the list. The generated handler always succeeds and
  // remembers nothing, which would make that flow untestable.
  http.post("/api/responses", async ({ request }) => {
    if (!currentUser) return unauthenticated();
    // `respond` is user and moderator — NOT admin. The Team Direction
    // organises events; it does not vote in them.
    if (currentUser.role === "admin") return forbidden();

    const body = (await request.json()) as { eventId?: number; participation?: string };
    events = events.map((event) =>
      event.id === body.eventId ? { ...event, response: body.participation ?? null } : event,
    );
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),
```

- [ ] **Step 3: Reset it between tests**

`resetMockState()` already restores `events` from `SEED`. `RESPONSE_ROWS` is never mutated, so it needs nothing — but confirm by reading `resetMockState` rather than assuming.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run && npm run typecheck && npm run lint:js
```

```bash
git add web/src/mocks
git commit -m "test(web): hand-written GET and POST /api/responses in the mocked backend

The generated handlers return faker data and remember nothing. Every assertion
in the members' area is about specific counts, and the events list shows
\"Choix enregistré\" only once an answer has been recorded.

The POST mirrors the real authorisation, which is the part intuition gets
wrong: `respond` belongs to user and moderator, and an admin is refused."
```

---

## Task 3: `/sinscrire` — the events table

**Files:**
- Create: `web/src/pages/Sinscrire.tsx`, `web/src/pages/Sinscrire.test.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`

- [ ] **Step 1: Write the failing tests**

The capability split is the thing this page exists to get right, so it is the thing the tests are about.

Create `web/src/pages/Sinscrire.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Sinscrire } from "./Sinscrire";

const rows = async () =>
  within(await screen.findByRole("table", { name: "Événements à venir" })).getAllByRole("row");

test("a member who may respond gets a sign-up action", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "S’inscrire" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other button entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "S’inscrire" })).toBeNull();
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<Sinscrire />);
  expect(await screen.findAllByRole("link", { name: "S’inscrire" })).toHaveLength(3);
});

test("an event already answered shows a disabled confirmation instead", async () => {
  setMockUser("demo.user");
  const { server } = await import("../mocks/node");
  const { HttpResponse, http } = await import("msw");
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json([
        {
          id: 1,
          date: "2026-09-20",
          title: "Concert d'automne",
          startTime: "19:00:00",
          endTime: "22:00:00",
          location: "Salle communale",
          attire: null,
          weekend: 0,
          response: "participate",
        },
      ]),
    ),
  );

  await renderWithSession(<Sinscrire />);
  const confirmed = await screen.findByRole("button", { name: "Choix enregistré" });
  expect(confirmed).toBeDisabled();
  expect(screen.queryByRole("link", { name: "S’inscrire" })).toBeNull();
});

// The API orders by date. The old page re-sorted client-side; dropping that
// means a change in the API's ordering fails HERE rather than being silently
// corrected in the UI.
test("the rows keep the order the API returned", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Sinscrire />);
  const [, ...body] = await rows();
  expect(body.map((row) => within(row).getAllByRole("cell")[1]!.textContent)).toEqual([
    "Concert d'automne",
    "Assemblée générale",
    "Week-end de répétition",
  ]);
});
```

Note the apostrophe: **"S’inscrire" uses the typographic `’`**, matching the rest of this SPA's copy. Copy it from here.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run web/src/pages/Sinscrire.test.tsx`
Expected: FAIL — `Failed to resolve import "./Sinscrire"`.

- [ ] **Step 3: Write the page**

```tsx
import { Link } from "react-router-dom";

import { useEventIndex } from "../api/generated/endpoints";
import { formatEventDate } from "../lib/date";
import { useSession } from "../session/SessionProvider";

/**
 * The events a member answers.
 *
 * The action cell is the whole point, and it is where the capability matrix
 * stops being intuitive: `respond` belongs to user and moderator, `view_summary`
 * to admin, and they do NOT overlap. So a member gets "S'inscrire" and an admin
 * gets "Résumé" — different buttons on the same row, not one button with
 * different permissions.
 *
 * No client-side sort: the API orders by date, as /planning_repet established.
 * A test pins the order so a change there fails in the suite rather than being
 * papered over here.
 */
export function Sinscrire() {
  const { can } = useSession();
  const events = useEventIndex();

  if (events.isPending) {
    return <p className="mx-auto max-w-3xl px-4 py-8">Chargement…</p>;
  }

  if (events.isError) {
    return (
      <p role="alert" className="mx-auto max-w-3xl px-4 py-8">
        Les événements n’ont pas pu être chargés. Veuillez réessayer.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Événements à venir</h1>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Événements à venir">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Date</th>
              <th className="p-3 font-semibold text-ink-muted">Titre</th>
              <th className="p-3 font-semibold text-ink-muted">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {events.data.data.map((event) => (
              <tr key={event.id} className="border-b border-line last:border-0">
                <td className="p-3">{formatEventDate(event.date)}</td>
                <td className="p-3">{event.title}</td>
                <td className="p-3">
                  {can("respond") ? (
                    event.response ? (
                      <button
                        type="button"
                        disabled
                        className="rounded border border-line px-3 py-1 text-sm text-ink-muted"
                      >
                        Choix enregistré
                      </button>
                    ) : (
                      <Link
                        to={`/inscriptions_utilisateurs?id=${event.id}`}
                        className="inline-block rounded bg-violet px-3 py-1 text-sm font-semibold text-white hover:bg-violet/90"
                      >
                        S’inscrire
                      </Link>
                    )
                  ) : null}

                  {can("view_summary") ? (
                    <Link
                      to={`/inscriptions_admin?id=${event.id}`}
                      className="inline-block rounded border border-line px-3 py-1 text-sm hover:border-violet hover:text-violet"
                    >
                      Résumé
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire the route, behind a guard**

This is the **first route in the application to use a guard**. In `web/src/routes.tsx` add:

```tsx
import { RequireAuth } from "./components/guards";
import { Sinscrire } from "./pages/Sinscrire";
```

and replace:

```tsx
        <Route path="/sinscrire" element={<Placeholder title="Inscriptions" />} />
```

with:

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

`RequireAuth`, not a capability guard: **any** logged-in member may see the list. The row actions are what differ.

`web/src/routes.test.tsx`'s table has **no `/sinscrire` row** — checked, it never had one — so nothing to change there. The page has its own tests, and the guard gets its own in Task 6.

- [ ] **Step 5: Verify**

```bash
npx vitest run && npm run typecheck && npm run lint:js
```

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): /sinscrire, the events a member answers

The action cell splits on capability, which is where the matrix stops being
intuitive: respond belongs to user and moderator, view_summary to admin, and
they do not overlap. A member gets \"S'inscrire\"; an admin gets \"Résumé\"
instead — not as well. Tests pin both directions.

First route in the application to sit behind a guard."
```

---

## Task 4: `/inscriptions_utilisateurs` — the participation form

**Files:**
- Create: `web/src/pages/InscriptionsUtilisateurs.tsx`, `web/src/pages/InscriptionsUtilisateurs.test.tsx`
- Modify: `web/src/routes.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { InscriptionsUtilisateurs } from "./InscriptionsUtilisateurs";

const app = (
  <Routes>
    <Route path="/inscriptions_utilisateurs" element={<InscriptionsUtilisateurs />} />
    <Route path="/sinscrire" element={<p>Liste</p>} />
  </Routes>
);

test("it names the event being answered, which the old page did not", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });
  expect(await screen.findByText(/Concert d'automne/)).toBeInTheDocument();
});

test("the member's own username is shown and not editable", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });
  const username = await screen.findByLabelText("Identifiant de l’utilisateur :");
  expect(username).toHaveValue("demo.user");
  expect(username).toHaveAttribute("readonly");
});

test("answering returns to the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });

  await user.selectOptions(await screen.findByLabelText("Participation :"), "participate");
  await user.click(screen.getByRole("button", { name: "Confirmer" }));

  expect(await screen.findByText("Liste")).toBeInTheDocument();
});

// A hand-typed or stale URL must not post garbage and must not render an empty
// form that looks answerable.
test("a missing id says so in French rather than posting", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun événement");
  expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull();
});

test("an unknown id says so rather than showing a blank form", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=9999" });
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Aucun événement"),
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Expected: FAIL on the missing import.

- [ ] **Step 3: Write the page**

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useEventIndex, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { formatEventDate } from "../lib/date";
import { useSession } from "../session/SessionProvider";

/**
 * Answer one event.
 *
 * The event comes from the list rather than a dedicated endpoint — there is no
 * GET /api/events/{id}, and the list is already cached by the time anyone
 * arrives here from /sinscrire.
 *
 * It NAMES the event, which the old page did not: its heading was "Inscription
 * à l'événement" and nothing on screen said which one. That was a defect, and
 * the date and title cost nothing here.
 */
export function InscriptionsUtilisateurs() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [participation, setParticipation] = useState("");
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const eventId = Number(params.get("id"));
  const events = useEventIndex();
  const event =
    Number.isInteger(eventId) && eventId > 0 && !events.isPending && !events.isError
      ? events.data.data.find((candidate) => candidate.id === eventId)
      : undefined;

  const respond = useResponseStore({
    mutation: {
      onSuccess: () => navigate("/sinscrire"),
      onError: setFromThrown,
    },
  });

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (respond.isPending || !event) return;
    clear();
    respond.mutate({
      data: {
        eventId: event.id,
        participation: participation as "participate" | "notparticipate",
      },
    });
  };

  if (events.isPending) {
    return <p className="mx-auto max-w-md px-4 py-8">Chargement…</p>;
  }

  // One message for "no id", "not a number" and "no such event": from the
  // member's side they are the same situation — the link they followed does not
  // point at an event any more.
  if (!event) {
    return (
      <section className="mx-auto max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Inscription à l’événement</h1>
        <p role="alert" className="mt-4 text-danger">
          Aucun événement à confirmer. Retournez à la liste et choisissez-en un.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h1 className="font-display text-3xl">Inscription à l’événement</h1>
      <p className="mt-2 text-ink-muted">
        {formatEventDate(event.date)} — {event.title}
      </p>

      <FormError error={error} />

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="response-username">Identifiant de l’utilisateur :</label>
          <input
            id="response-username"
            type="text"
            readOnly
            value={user?.username ?? ""}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-ink-muted"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="response-participation">Participation :</label>
          <select
            id="response-participation"
            required
            value={participation}
            onChange={(changeEvent) => setParticipation(changeEvent.target.value)}
            className="w-full rounded border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
          >
            <option value="" disabled>
              Choisissez une option
            </option>
            <option value="participate">Je participe</option>
            <option value="notparticipate">Je ne participe pas</option>
          </select>
        </div>

        <button
          type="submit"
          aria-disabled={respond.isPending}
          className="rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Confirmer
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Wire the route**

```tsx
import { RequireCapability } from "./components/guards";
import { InscriptionsUtilisateurs } from "./pages/InscriptionsUtilisateurs";
```

Replace:

```tsx
        <Route
          path="/inscriptions_utilisateurs"
          element={<Placeholder title="Mes inscriptions" />}
        />
```

with:

```tsx
        <Route
          path="/inscriptions_utilisateurs"
          element={
            <RequireCapability capability="respond">
              <InscriptionsUtilisateurs />
            </RequireCapability>
          }
        />
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run && npm run typecheck && npm run lint:js
```

```bash
git add web/src
git commit -m "feat(web): /inscriptions_utilisateurs, the participation form

It names the event being answered. The old page's heading was \"Inscription à
l'événement\" and nothing on screen said which one, which is a defect rather
than a feature worth reproducing.

A missing, non-numeric or unknown id renders one French message rather than an
empty form that looks answerable: from the member's side those are the same
situation."
```

---

## Task 5: `/inscriptions_admin` and `/admin`

**Files:**
- Create: `web/src/pages/InscriptionsAdmin.tsx`, `web/src/pages/InscriptionsAdmin.test.tsx`, `web/src/pages/Admin.tsx`
- Modify: `web/src/routes.tsx`, `web/src/routes.test.tsx`

- [ ] **Step 1: Write the failing tests**

The counts are the whole page, and the mocked rows in Task 2 were chosen to make them unambiguous: 3 participating, 1 not, 1 pending, across 4 instruments one of which is null.

```tsx
import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { InscriptionsAdmin } from "./InscriptionsAdmin";

const app = (
  <Routes>
    <Route path="/inscriptions_admin" element={<InscriptionsAdmin />} />
  </Routes>
);

const tile = async (label: string) =>
  (await screen.findByText(label)).closest("[data-tile]") as HTMLElement;

test("the three tiles count participating, declining and pending", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });

  expect(await tile("Participe")).toHaveTextContent("3");
  expect(await tile("Ne participe pas")).toHaveTextContent("1");
  // Pending is everyone who has not answered — the reason the endpoint returns
  // every user rather than only the ones who replied.
  expect(await tile("En attente")).toHaveTextContent("1");
});

test("every member appears, answered or not", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });
  const table = await screen.findByRole("table", { name: "Réponses" });
  expect(within(table).getAllByRole("row")).toHaveLength(6); // header + 5
});

// Derived from the data, not from a hardcoded list of French instrument names
// as the old page had — that list drifted from the instruments table.
test("the register counts count participants only", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin?id=1" });
  const table = await screen.findByRole("table", { name: "Résumé des instruments" });

  const trumpet = within(table).getByRole("row", { name: /Trompette/ });
  // Two trumpets in the fixture, but one declined.
  expect(within(trumpet).getAllByRole("cell")[1]).toHaveTextContent("1");

  const drums = within(table).getByRole("row", { name: /Batterie/ });
  expect(within(drums).getAllByRole("cell")[1]).toHaveTextContent("1");
});

test("a missing id says so rather than showing an empty summary", async () => {
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/inscriptions_admin" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun événement");
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Write `InscriptionsAdmin.tsx`**

```tsx
import { useSearchParams } from "react-router-dom";

import { useResponseIndex } from "../api/generated/endpoints";

/**
 * Who is coming, and how many of each register.
 *
 * The endpoint returns EVERY user with their instrument and their answer or
 * null — a LEFT JOIN, not only the people who replied. That is what makes
 * "En attente" countable, and it is why the register list can be derived from
 * the data instead of the hardcoded array of nine French instrument names the
 * old page carried, which drifted from the `instruments` table.
 */
export function InscriptionsAdmin() {
  const [params] = useSearchParams();
  const eventId = params.get("id");

  const summary = useResponseIndex(
    { eventId: eventId ?? "" },
    { query: { enabled: Boolean(eventId) } },
  );

  if (!eventId) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-4xl">Résumé des inscriptions</h1>
        <p role="alert" className="mt-4 text-danger">
          Aucun événement choisi. Retournez à la liste et choisissez-en un.
        </p>
      </section>
    );
  }

  if (summary.isPending) {
    return <p className="mx-auto max-w-4xl px-4 py-8">Chargement…</p>;
  }

  if (summary.isError) {
    return (
      <p role="alert" className="mx-auto max-w-4xl px-4 py-8 text-danger">
        Le résumé n’a pas pu être chargé. Veuillez réessayer.
      </p>
    );
  }

  const rows = summary.data.data;
  const participating = rows.filter((row) => row.response === "participate");
  const declining = rows.filter((row) => row.response === "notparticipate");
  const pending = rows.length - participating.length - declining.length;

  // Derived, and sorted, so the table is stable between renders.
  const registers = [
    ...new Set(rows.map((row) => row.instrument).filter((name): name is string => Boolean(name))),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  const tiles = [
    { label: "Participe", value: participating.length },
    { label: "Ne participe pas", value: declining.length },
    { label: "En attente", value: pending },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-4xl">Résumé des inscriptions</h1>

      {/* aria-live, as the old page had: the numbers change when the query
          refetches, and an admin watching the page should hear it. */}
      <div aria-live="polite" className="mt-6 grid gap-3 sm:grid-cols-3">
        {tiles.map((item) => (
          <div
            key={item.label}
            data-tile
            className="rounded-lg border border-line bg-panel p-5 text-center"
          >
            <p className="font-display text-4xl text-violet">{item.value}</p>
            <p className="mt-1 text-sm text-ink-muted">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Réponses">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Nom d’utilisateur</th>
              <th className="p-3 font-semibold text-ink-muted">Instrument</th>
              <th className="p-3 font-semibold text-ink-muted">Participation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.username} className="border-b border-line last:border-0">
                <td className="p-3">{row.username}</td>
                <td className="p-3">{row.instrument ?? "—"}</td>
                <td className="p-3">
                  {row.response === "participate"
                    ? "Participe"
                    : row.response === "notparticipate"
                      ? "Ne participe pas"
                      : "En attente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-2xl">Résumé des instruments</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Résumé des instruments">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Instrument</th>
              <th className="p-3 font-semibold text-ink-muted">Nombre</th>
            </tr>
          </thead>
          <tbody>
            {registers.map((register) => (
              <tr key={register} className="border-b border-line last:border-0">
                <td className="p-3">{register}</td>
                <td className="p-3 tabular-nums">
                  {participating.filter((row) => row.instrument === register).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `Admin.tsx`**

```tsx
import { Link } from "react-router-dom";

/**
 * The admin's landing page.
 *
 * The old page was two buttons: "Ajouter un événement", linking to
 * /planning_repet?admin=true, and "Se déconnecter". Both are redundant now —
 * the planning page shows admins the event form automatically, and logout lives
 * on the login route. Rather than reproduce two controls that no longer do
 * anything distinct, this is the page they were trying to be.
 */
const DESTINATIONS: { to: string; title: string; description: string }[] = [
  {
    to: "/planning_repet",
    title: "Planning et répétitions",
    description: "Ajouter, modifier ou supprimer un événement.",
  },
  {
    to: "/sinscrire",
    title: "Inscriptions",
    description: "Voir les réponses des membres, événement par événement.",
  },
];

export function Admin() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Administration</h1>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {DESTINATIONS.map((destination) => (
          <li key={destination.to}>
            <Link
              to={destination.to}
              className="block h-full rounded-lg border border-line bg-panel p-5 hover:border-violet"
            >
              <span className="font-display text-xl text-violet">{destination.title}</span>
              <span className="mt-1 block text-ink-muted">{destination.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Wire both routes**

```tsx
import { Admin } from "./pages/Admin";
import { InscriptionsAdmin } from "./pages/InscriptionsAdmin";
```

Replace:

```tsx
        <Route path="/admin" element={<Placeholder title="Administration" />} />
        <Route path="/inscriptions_admin" element={<Placeholder title="Inscriptions (admin)" />} />
```

with:

```tsx
        <Route
          path="/admin"
          element={
            <RequireCapability capability="manage_events">
              <Admin />
            </RequireCapability>
          }
        />
        <Route
          path="/inscriptions_admin"
          element={
            <RequireCapability capability="view_summary">
              <InscriptionsAdmin />
            </RequireCapability>
          }
        />
```

In `web/src/routes.test.tsx`, **remove this row**:

```tsx
  ["/inscriptions_admin", "Inscriptions (admin)"],
```

It asserts the placeholder's heading, and that table renders anonymously — the route is guarded now, so an anonymous visit lands on the login form instead. The page has its own tests and the guard gets its own in Task 6, so the coverage moves rather than disappears.

- [ ] **Step 6: Confirm only the souper is left**

```bash
grep -c "<Placeholder" web/src/routes.tsx
```
Expected: **3** — `/signup`, `/signup_thanks`, `/signups_admin`.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run && npm run typecheck && npm run lint:js && npm run build
```

```bash
git add web/src
git commit -m "feat(web): the attendance summary and the admin hub

The register counts are derived from the response rather than the hardcoded
array of nine French instrument names the old page carried — the endpoint
returns every user with their instrument, so the list falls out of the data and
cannot drift from the instruments table.

/admin becomes the page it was trying to be. Its two old buttons both went
somewhere reachable already: the planning page shows admins the event form on
its own, and logout lives on the login route."
```

---

## Task 6: The guards, end to end

**Files:**
- Create: `web/e2e/members.spec.ts`
- Create: `web/src/components/guards.routes.test.tsx`

Until this sub-project, `grep RequireAuth web/src/routes.tsx` returned nothing. The guards were unit-tested against synthetic routes; now they have real URLs, and the round trip has never been exercised.

- [ ] **Step 1: Unit-test the guards at their real routes**

Create `web/src/components/guards.routes.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";

// Anonymous: bounced to the login form, carrying where they wanted to go.
test.each([
  "/sinscrire",
  "/inscriptions_utilisateurs?id=1",
  "/inscriptions_admin?id=1",
  "/admin",
])("%s sends an anonymous visitor to the login form", async (route) => {
  await renderWithSession(<AppRoutes />, { route });
  expect(await screen.findByRole("heading", { name: "Authentification" })).toBeInTheDocument();
});

// Logged in but wrong capability: refused IN PLACE, never bounced. Sending
// someone already past the login form back to it reads as "your session
// expired" and invites them to log in again at something they will never be
// allowed to see.
test("a member without view_summary is refused, not redirected", async () => {
  setMockUser("demo.user");
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_admin?id=1" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé.");
  expect(screen.queryByRole("heading", { name: "Authentification" })).toBeNull();
});

// The direction intuition gets wrong: admin does NOT hold `respond`.
test("an admin is refused the response form", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<AppRoutes />, { route: "/inscriptions_utilisateurs?id=1" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé.");
});

test("an admin reaches the summary and the hub", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<AppRoutes />, { route: "/admin" });
  expect(await screen.findByRole("heading", { name: "Administration" })).toBeInTheDocument();
});
```

- [ ] **Step 2: The round trip, end to end**

Create `web/e2e/members.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill(username);
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}

// The whole point of carrying the attempted path into router state: a member
// who clicks a deep link, logs in, and lands somewhere else has lost the thing
// they were trying to do.
test("a guard bounce returns you to the page you wanted", async ({ page }) => {
  await page.goto("/sinscrire");
  await expect(page.getByRole("heading", { name: "Authentification" })).toBeVisible();

  await page.getByLabel("Identifiant :").fill("demo.user");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Événements à venir" })).toBeVisible();
});

test("a member answers an event and the list remembers", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/sinscrire");

  await page.getByRole("link", { name: "S’inscrire" }).first().click();
  await page.getByLabel("Participation :").selectOption("participate");
  await page.getByRole("button", { name: "Confirmer" }).click();

  await expect(page.getByRole("heading", { name: "Événements à venir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choix enregistré" }).first()).toBeVisible();
});

test("an admin reads the summary instead of answering", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/sinscrire");

  await expect(page.getByRole("link", { name: "S’inscrire" })).toHaveCount(0);
  await page.getByRole("link", { name: "Résumé" }).first().click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();
});
```

- [ ] **Step 3: Run everything**

```bash
npx vitest run && npm run test:e2e
```
Expected: all pass. The e2e count goes from 11 to 14.

- [ ] **Step 4: Commit**

```bash
git add web/src web/e2e
git commit -m "test(web): the guards, at real URLs, for the first time

Until this sub-project nothing in routes.tsx was wrapped in a guard, so the
bounce had never been exercised against a real path. These cover all four
directions: anonymous is redirected carrying the attempted path, a logged-in
member without the capability is refused IN PLACE, an admin is refused the
response form — which is the direction intuition gets wrong — and the round
trip lands on the page originally wanted."
```

---

## Task 7: Look at it, verify everything, hand over

**Files:**
- Modify: `docs/continue-here.md`

- [ ] **Step 1: Screenshot the four routes**

Two defects survived a fully green suite in sub-project A1 and two more in A2. Drive Playwright against the mocked dev server on **port 5174** — kill anything already listening there first, or you will screenshot stale code — and log in as each role.

Capture: `/sinscrire` as `demo.user` and as `demo.admin` (the two different action columns), `/inscriptions_utilisateurs?id=1`, `/inscriptions_admin?id=1`, `/admin`, and `/inscriptions_admin?id=1` at 390px wide.

What to look for: the tables do not scroll the page sideways on a phone; the tiles read clearly; one `<h1>` per route; the footer at the bottom.

- [ ] **Step 2: The full gate**

```bash
npm run check
npm run test:e2e
npm run build
npm run smoke
```

and in PowerShell:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

Expected: `check` exit 0; 14 e2e; 13/13 smoke; **233** Laravel tests.

- [ ] **Step 3: Against the real API**

This is the sub-project where it matters most — everything before it was static. With the stack up, at http://localhost:5173:

- log in as `demo.user`, answer an event, confirm the row becomes "Choix enregistré" **and survives a reload** (it is in MariaDB, not React state);
- check the row in the database:
  `docker compose exec -T db mysql -ucanetons -pcanetons lescanetons -e "SELECT * FROM responses ORDER BY id DESC LIMIT 3;"`
- log in as `demo.admin`, open the summary for that event, and confirm the counts match what is in the table;
- confirm `demo.admin` is **refused** `/inscriptions_utilisateurs?id=1` and `demo.user` is refused `/inscriptions_admin?id=1`;
- delete the test rows afterwards.

**If the pages render unstyled, restart the `assets` container** — its `node_modules` is a named volume and goes stale.

- [ ] **Step 4: Update the handover**

In `docs/continue-here.md`: C is done, **only D remains** (three flag-gated souper routes), and `GET /api/signups` is still typed `string` for D to fix. Record any trap this plan cost you.

- [ ] **Step 5: Commit and push**

```bash
git add docs/continue-here.md
git commit -m "docs: the members' area is built; only the souper remains"
git push
```

---

## Notes for whoever executes this

- **The capability matrix is not a hierarchy.** Admin cannot respond. If a test seems to say something absurd about roles, it is probably right.
- **Never hand-edit `web/src/api/generated/`.** Task 1 regenerates it; everything after consumes it.
- **The query hooks are `export function`**, so `grep "export const use"` will tell you `useResponseIndex` does not exist. It does.
- **`useResponseIndex` takes params AND options, and options is not optional** in the overload you want: `useResponseIndex({ eventId }, { query: { enabled } })`. The `enabled` guard is what stops the query firing with an empty eventId, which the API answers 400.
- **An accessible name keeps `&nbsp;` as U+00A0.** Not relevant to these four pages, but it has caught two implementers already.
- **`S’inscrire` uses the typographic apostrophe.** A test matching `S'inscrire` with a straight one silently finds nothing.
