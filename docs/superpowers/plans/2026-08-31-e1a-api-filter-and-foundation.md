# E1a — the events filter and the component-library foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `GET /api/events` so it returns upcoming events by default, and stand up the shadcn/ui foundation and the three project primitives that E1b's page work depends on.

**Architecture:** Two halves that share a branch. The first is a backend change with a regenerated client and a de-time-bombed test fixture — provable by tests alone, no pixels move. The second installs shadcn/ui via its CLI, maps its semantic tokens one-directionally onto the existing *Scène* palette, and adds `PageSection`, `StatTile` and `EventCard`. No page is restyled here; that is E1b.

**Tech Stack:** Laravel 11 + Scramble (OpenAPI), orval (generated TanStack Query client), React 19 + Vite 8 + Tailwind 4 (CSS-first), shadcn/ui via CLI, MSW for the mocked backend, Vitest + Playwright + PHPUnit.

**Spec:** `docs/superpowers/specs/2026-08-31-e1-mobile-and-component-library-design.md` — sections 1, 2, 3 and 6.

---

## Read before starting

- `CLAUDE.md` — especially "Tailwind 4 is CSS-first", the generated-client rule, and the note that `npm run check` does **not** run the Laravel suite.
- `docs/superpowers/specs/2026-08-29-visual-foundation-design.md` — why the palette is what it is. Task 8 is the one place a library could quietly neutralise it.

**The Laravel suite needs a live database.** It does not run under `npm run check`. Run it in Docker:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

In Git Bash prefix that with `MSYS_NO_PATHCONV=1`, or the `-w` argument is rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

**Run the web suite from PowerShell, not Git Bash.** Git Bash reports the cwd with a lowercase drive letter and Vitest 4 keys module resolution off that path; from Git Bash it can load two instances of `vitest` and every test file fails to collect with "Vitest failed to find the runner". It looks like a catastrophic regression and is not one. The identical command from PowerShell is green.

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `api/tests/Feature/EventIndexTest.php` | Modify — relative dates, then the filter's four new tests | 1, 2 |
| `api/app/Http/Controllers/Api/EventController.php` | Modify — the `include` parameter and the default filter | 3 |
| `web/src/api/generated/**` | Regenerate — never hand-edit | 4 |
| `web/src/mocks/handlers.ts` | Modify — time-independent fixture, then the same filter | 5, 6 |
| `web/src/mocks/handlers.test.ts` | Modify — new cases for the filter | 6 |
| `web/src/pages/PlanningRepet.test.tsx` | Modify — drop two date assertions redundant with `lib/date.test.ts` | 5 |
| `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | Modify — the `@/*` alias, in all three | 7 |
| `components.json` | Create — shadcn CLI config | 8 |
| `web/src/styles.css` | Modify — the token mapping, then E1's own tokens | 8, 12 |
| `web/src/lib/utils.ts` | Create — shadcn's `cn()` helper | 8 |
| `web/src/components/ui/*.tsx` | Create — the vendored six | 9, 10, 11 |
| `web/src/components/PageSection.tsx` | Create — the three page widths | 13 |
| `web/src/components/StatTile.tsx` | Create — the admin summary tile | 14 |
| `web/src/components/EventCard.tsx` | Create — date heading + title, with slots | 15 |

---

## Task 1: De-time-bomb `EventIndexTest`

Every date in this file is a 2027 literal. Once the filter lands, each one becomes a past date on its own date and drops out of the default response — so the whole file would start failing in 2027 for a reason that looks nothing like its cause. Convert to offsets from today **before** the filter exists, while the suite is still green and the change is provably behaviour-neutral.

`EventWriteTest` and `EventShapeContractTest` never call `GET /api/events`, and the response tests hit `/api/responses`. They are unaffected and must not be touched.

**Files:**
- Modify: `api/tests/Feature/EventIndexTest.php`

- [ ] **Step 1: Confirm the file is green before touching it**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest
```

Expected: all tests pass. Note the count; it must not change in this task.

- [ ] **Step 2: Add a relative-date helper beside the existing `event()` helper**

In `api/tests/Feature/EventIndexTest.php`, immediately above `private function event(...)`:

```php
    /**
     * A date N days from today, as 'YYYY-MM-DD'.
     *
     * Dates here are OFFSETS, not literals, because GET /api/events filters to
     * upcoming events by default. Every date in this file used to be a 2027
     * literal, which was harmless while the endpoint returned everything and a
     * dated time bomb the moment it did not: each one would have fallen out of
     * the default response on its own date, failing tests that are not about
     * dates at all.
     *
     * now() is UTC (api/config/app.php hardcodes it) and so is the controller's
     * comparison, so the two agree by construction.
     */
    private function inDays(int $days): string
    {
        return now()->addDays($days)->toDateString();
    }
```

- [ ] **Step 3: Replace every date literal with an offset**

Six literals, at the lines listed. Keep the relative ORDER of dates identical so the ordering assertions still mean what they meant:

| Was | Becomes |
| --- | --- |
| `'2027-01-09'` | `$this->inDays(30)` |
| `'2027-02-14'` | `$this->inDays(60)` |
| `'2027-03-05'` | `$this->inDays(90)` |
| `'2027-04-01'` | `$this->inDays(120)` |
| `'2027-05-20'` | `$this->inDays(150)` |
| `'2027-11-13'` | `$this->inDays(180)` |

So `test_events_are_public_and_ordered_by_date` becomes:

```php
    public function test_events_are_public_and_ordered_by_date(): void
    {
        // Inserted out of order, so the response pins the old query's ORDER BY
        // date rather than insertion / id order.
        $this->event($this->inDays(90), ['title' => 'Third']);
        $this->event($this->inDays(30), ['title' => 'First']);
        $this->event($this->inDays(60), ['title' => 'Second']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.title', 'First')
            ->assertJsonPath('1.title', 'Second')
            ->assertJsonPath('2.title', 'Third');
    }
```

Find the rest with:

```bash
grep -n "'20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]'" api/tests/Feature/EventIndexTest.php
```

Expected after the edit: no matches.

- [ ] **Step 4: Run the file and confirm the same count still passes**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest
```

Expected: PASS, same number of tests as Step 1. This task changed no behaviour.

- [ ] **Step 5: Commit**

```bash
git add api/tests/Feature/EventIndexTest.php
git commit -m "test(api): make EventIndexTest dates relative to today

Every date in this file was a 2027 literal. That is harmless while
GET /api/events returns everything, and becomes a dated time bomb the moment it
filters to upcoming events: each literal would fall out of the default response
on its own date and fail tests that are not about dates at all.

Behaviour-neutral on its own -- same tests, same count -- and done first so the
filter's own tests land on a fixture that is stable in time."
```

---

## Task 2: Failing tests for the events filter

Write these before the implementation. Section 6 of the spec is explicit about why: every date in this file was future, so the filter could ship completely untested and the suite would stay green — the same blind spot that let the defect survive the port.

**Files:**
- Modify: `api/tests/Feature/EventIndexTest.php`

- [ ] **Step 1: Write the four failing tests**

Append inside the class, after `test_events_are_public_and_ordered_by_date`:

```php
    public function test_past_events_are_excluded_by_default(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);
        $this->event($this->inDays(7), ['title' => 'Upcoming']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Upcoming');
    }

    /**
     * An event happening TODAY is still upcoming — it has not happened yet.
     * The column is a plain `date` with no time component, so there is nothing
     * finer to compare against and the boundary must be inclusive.
     */
    public function test_an_event_today_is_still_upcoming(): void
    {
        $this->event($this->inDays(0), ['title' => 'Today']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Today');
    }

    public function test_include_past_returns_the_whole_history(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);
        $this->event($this->inDays(7), ['title' => 'Upcoming']);

        $this->getJson('/api/events?include=past')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.title', 'Past')
            ->assertJsonPath('1.title', 'Upcoming');
    }

    /**
     * Anything that is not exactly `past` gets the safe answer, mirroring the
     * convention POST /api/migrate already uses for `?mode`: only the exact
     * string opts in, so a typo cannot silently widen what is returned.
     */
    public function test_an_unrecognised_include_value_falls_back_to_the_default(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);

        $this->getJson('/api/events?include=everything')
            ->assertOk()
            ->assertJsonCount(0);
    }
```

- [ ] **Step 2: Run them and verify they fail for the right reason**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest
```

Expected: `test_past_events_are_excluded_by_default` FAILS with `Failed asserting that actual size 2 matches expected size 1`; `test_an_unrecognised_include_value_falls_back_to_the_default` FAILS with size 1 vs 0. `test_an_event_today_is_still_upcoming` and `test_include_past_returns_the_whole_history` PASS already — the endpoint returns everything today, which satisfies both. That is expected and correct: they are regression guards for the boundary and the opt-in, not drivers of new behaviour.

- [ ] **Step 3: Commit the failing tests**

```bash
git add api/tests/Feature/EventIndexTest.php
git commit -m "test(api): pin upcoming-by-default for GET /api/events

Two of the four fail today: past events are returned, and an unrecognised
?include value does not fall back to the safe answer. The other two guard the
inclusive today boundary and the ?include=past opt-in."
```

---

## Task 3: Implement the filter

**Files:**
- Modify: `api/app/Http/Controllers/Api/EventController.php`

- [ ] **Step 1: Add the `QueryParameter` import**

At the top of the file, beside the existing Scramble import:

```php
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response as ApiResponse;
```

`QueryParameter` ships in Scramble 0.13 (`api/vendor/dedoc/scramble/src/Attributes/QueryParameter.php`). It is what puts the parameter in the OpenAPI document, which is what makes orval generate it in Task 4. Without the attribute the filter would work over HTTP and be unreachable from the typed client.

- [ ] **Step 2: Document the parameter and the new default on `index`**

Add the attribute immediately above the existing `#[ApiResponse(...)]` line:

```php
    #[QueryParameter(
        'include',
        description: 'Set to `past` to receive the whole history. Any other value, or none, returns only events from today onwards.',
        type: 'string',
        required: false,
        example: 'past',
    )]
```

- [ ] **Step 3: Extend the docblock so the reason survives**

Replace the existing `GET /api/events — public index, ordered by date.` first line of the `index()` docblock with:

```php
    /**
     * GET /api/events — public index, UPCOMING BY DEFAULT, ordered by date.
     *
     * `?include=past` returns everything; anything else returns `date >= today`.
     *
     * WHY THE DEFAULT IS THE FILTERED ONE. This used to return every event ever,
     * ascending — "exactly the old query". So /sinscrire, headed "Événements à
     * venir", listed events that had already happened at the TOP of the list,
     * each with a dead "Choix enregistré" button, and /planning_repet put the
     * next rehearsal at the BOTTOM of a list that grows every season. On the one
     * screen whose purpose is "do I play Saturday?", that was the worst defect
     * in the app.
     *
     * The safe answer is the default rather than something a caller opts into,
     * for the same reason this endpoint deliberately has no ?username=
     * parameter: a page that forgets to ask should not be able to reintroduce
     * the bug.
     *
     * The boundary is INCLUSIVE of today — an event happening today has not
     * happened yet — and `where`, not `whereDate`, so the comparison stays
     * index-friendly if `events.date` is ever indexed (it is not today, and at
     * this band's volume it does not need to be).
     *
     * now() is UTC, because api/config/app.php hardcodes it and there is no
     * APP_TIMEZONE key. Fribourg is UTC+1/+2, so a UTC "today" LAGS local time
     * and today's event stays listed for the first hour or two of tomorrow. That
     * errs in the safe direction; the dangerous direction would be hiding an
     * event before it happened, which needs UTC to run ahead of local time and
     * never does here. Do not "fix" this by setting APP_TIMEZONE as a side
     * effect — timestamps were standardised on UTC deliberately.
```

Keep the rest of the existing docblock — the `response` / IDOR paragraph, the eager-loading paragraph, the optional-authentication paragraph and the `$request->user('sanctum')` paragraph are all still true and all still load-bearing.

- [ ] **Step 4: Implement it**

In `index()`, replace:

```php
        $userId = $request->user()?->id;

        $events = Event::query()
            ->when(
```

with:

```php
        $userId = $request->user()?->id;

        // Only the exact string opts in, mirroring POST /api/migrate's ?mode.
        $includePast = $request->query('include') === 'past';

        $events = Event::query()
            ->when(
                ! $includePast,
                fn ($query) => $query->where('date', '>=', now()->toDateString())
            )
            ->when(
```

- [ ] **Step 5: Run the tests**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest
```

Expected: all PASS, including the two that failed in Task 2.

- [ ] **Step 6: Run the whole API suite, to prove the blast radius**

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

Expected: all PASS. `EventWriteTest`, `EventShapeContractTest`, `ResponseStoreTest`, `ResponseSummaryTest` and `ModelsTest` never call `GET /api/events`, so none of them should move. **If any of them fails, stop** — it means something reaches the index that this plan did not account for.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint:api
git add api/app/Http/Controllers/Api/EventController.php
git commit -m "feat(api): GET /api/events returns upcoming events by default

?include=past returns the whole history; anything else gets today onwards.

The endpoint returned every event ever, ascending, so /sinscrire -- headed
'Evenements a venir' -- listed past events at the top with dead buttons, and
/planning_repet buried the next rehearsal at the bottom of an ever-growing list.

The safe answer is the default rather than opt-in, for the same reason this
endpoint has no ?username= parameter: a page that forgets to ask must not be
able to reintroduce the bug. The today boundary is inclusive, and the UTC
comparison errs toward showing an event too long rather than hiding it early."
```

---

## Task 4: Regenerate the OpenAPI document and the client

`web/src/api/generated/` is generated and must never be hand-edited. CI's `openapi-drift` job fails if either the document or the client is stale.

**Files:**
- Regenerate: the OpenAPI document and `web/src/api/generated/**`

- [ ] **Step 1: Regenerate**

```bash
npm run openapi && npm run generate:api
```

- [ ] **Step 2: Confirm the parameter reached the client**

```bash
grep -n "EventIndexParams\|include" web/src/api/generated/endpoints.ts | head -20
```

Expected: an `EventIndexParams` type carrying an optional `include`, and `getEventIndexUrl` / `eventIndex` / `useEventIndex` / `getEventIndexQueryKey` taking it. **If `include` does not appear, stop** — the `#[QueryParameter]` attribute did not take effect, and continuing would leave `?include=past` unreachable from the typed client, which E1b's past-events disclosure depends on.

- [ ] **Step 3: Confirm the existing call sites still compile**

The parameter is optional, so `useEventIndex()` in `PlanningRepet.tsx`, `Sinscrire.tsx` and `InscriptionsUtilisateurs.tsx` should be unchanged and still type-check.

```bash
npm run typecheck
```

Expected: no errors. **Do not** add arguments to those calls in this task — they want the default, which is now the right one. E1b changes only `/planning_repet`, and only for its disclosure.

- [ ] **Step 4: Run the web suite**

```powershell
npm run test:web
```

Expected: all PASS. The mock still returns everything, and every fixture date is still in the future, so nothing should move yet.

- [ ] **Step 5: Commit**

`tools/openapi.mjs` writes `api/openapi.json`, and orval reads that to emit `web/src/api/generated/`:

```bash
git add api/openapi.json web/src/api/generated
git status --short
git commit -m "chore(api): regenerate the OpenAPI document and client for ?include

Generated output only -- never hand-edited. CI's openapi-drift job fails if this
is stale. The parameter is optional, so every existing useEventIndex() call site
compiles unchanged and now gets the upcoming-only default it wanted all along."
```

`git status --short` must show nothing else outstanding. If it does, something
was regenerated that this task did not expect — read it before committing.

---

## Task 5: Make the MSW fixture time-independent

The mock fixture holds three hardcoded 2026 dates. That was fine while the endpoint returned everything. With the filter in place it is a dated time bomb: on **2026-09-21** the first event falls out of the default response, and by **2026-11-16** all three do — leaving the mocked `/sinscrire` empty, `npm run dev:mock` useless, and `PlanningRepet.test.tsx` failing for a reason no one would guess.

Two assertions in `PlanningRepet.test.tsx` pin literal French date strings. **They are already redundant:** `web/src/lib/date.test.ts` pins `formatEventDate` and `formatEventDateRange` on fixed dates, including the exact `"samedi 14 novembre 2026 au dimanche 15 novembre 2026"` string. Formatting stays pinned where formatting lives; the page tests stop depending on the wall clock.

**Files:**
- Modify: `web/src/mocks/handlers.ts`
- Modify: `web/src/pages/PlanningRepet.test.tsx`

- [ ] **Step 1: Add the offset helper above `SEED`**

In `web/src/mocks/handlers.ts`, immediately above `const SEED: MockEvent[] = [`:

```ts
/**
 * A date N days from today, as "YYYY-MM-DD" in LOCAL parts.
 *
 * The fixture's dates are OFFSETS, not literals, because GET /api/events now
 * filters to upcoming events by default. Three hardcoded 2026 dates were
 * harmless while the endpoint returned everything and a dated time bomb the
 * moment it did not: the first would have dropped out of the default response
 * on 2026-09-21 and all three by 2026-11-16, leaving the mocked /sinscrire
 * empty and PlanningRepet.test.tsx red for a reason its error message would not
 * hint at.
 *
 * Local parts, not toISOString(), to match lib/date.ts's parseLocalDate: an
 * event is a plain calendar day, and a UTC round-trip shifts it by one west of
 * Greenwich.
 */
function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
```

- [ ] **Step 2: Replace the three fixture dates with offsets**

Keep the same order, the same titles and the same relative spacing, so every ordering assertion keeps its meaning:

| Event | Was | Becomes |
| --- | --- | --- |
| `Concert d'automne` | `"2026-09-20"` | `isoDaysFromToday(20)` |
| `Assemblée générale` | `"2026-10-10"` | `isoDaysFromToday(40)` |
| `Week-end de répétition` | `"2026-11-14"` | `isoDaysFromToday(75)` |

Leave `weekend: 1` on `Week-end de répétition` — the date-range rendering depends on it.

- [ ] **Step 3: Replace the two wall-clock date assertions**

In `web/src/pages/PlanningRepet.test.tsx`, replace:

```tsx
  expect(within(first).getByText("dimanche 20 septembre 2026")).toBeInTheDocument();
```

with:

```tsx
  // The DATE is asserted through the app's own formatter rather than as a
  // literal, because the fixture's dates are now offsets from today. That is
  // not a weaker assertion than it looks: the French formatting itself is
  // pinned on FIXED dates in web/src/lib/date.test.ts, which is where
  // formatting belongs. This test's job is that the card shows the event's
  // date at all.
  expect(within(first).getByText(formatEventDate(CONCERT.date))).toBeInTheDocument();
```

Look the fixture entry up **by title, not by index** — Task 6 prepends a past
event to `SEED`, which would silently shift every index. Add above the tests:

```tsx
// By title rather than by index: Task 6 adds a past event at the START of SEED,
// and an index here would then point at the wrong event while still type-checking.
const CONCERT = SEED.find((event) => event.title === "Concert d'automne")!;
const WEEKEND = SEED.find((event) => event.title === "Week-end de répétition")!;
```

and replace:

```tsx
  expect(
    await screen.findByText("samedi 14 novembre 2026 au dimanche 15 novembre 2026"),
  ).toBeInTheDocument();
```

with:

```tsx
  expect(await screen.findByText(formatEventDateRange(WEEKEND.date))).toBeInTheDocument();
```

Add the imports at the top of the test file:

```tsx
import { formatEventDate, formatEventDateRange } from "../lib/date";
import { SEED } from "../mocks/handlers";
```

- [ ] **Step 4: Export `SEED` from the handlers**

In `web/src/mocks/handlers.ts`, change:

```ts
const SEED: MockEvent[] = [
```

to:

```ts
export const SEED: MockEvent[] = [
```

- [ ] **Step 5: Run the web suite**

```powershell
npm run test:web
```

Expected: all PASS. If `PlanningRepet.test.tsx` fails on `toHaveLength(3)`, the offsets are wrong — all three must be in the future.

- [ ] **Step 6: Commit**

```bash
git add web/src/mocks/handlers.ts web/src/pages/PlanningRepet.test.tsx
git commit -m "test(web): make the mock event fixture independent of the wall clock

With GET /api/events filtering to upcoming events, three hardcoded 2026 dates
became a dated time bomb: the first would have dropped out of the default
response on 2026-09-21 and all three by 2026-11-16, leaving the mocked
/sinscrire empty and PlanningRepet.test.tsx red for an unguessable reason.

The two literal French date assertions this replaces were already redundant --
lib/date.test.ts pins both formatters on fixed dates, including the exact
weekend-range string. Formatting stays pinned where formatting lives."
```

---

## Task 6: Teach the mock the same filter, and give it a past event

The mock must implement the same contract as the API or the mocked front end goes on hiding the defect. And the fixture gains a **past** event — that is the point of the task, not a detail: the all-future bias is what made the bug invisible in the first place, so dev and e2e must both be able to see it.

**Files:**
- Modify: `web/src/mocks/handlers.ts`
- Modify: `web/src/mocks/handlers.test.ts`

- [ ] **Step 1: Write the failing mock tests**

In `web/src/mocks/handlers.test.ts`, beside the existing `GET /events returns the seeded French events, ordered by date` test:

```ts
test("GET /events excludes past events by default", async () => {
  const response = await fetch("/api/events");
  const events = (await response.json()) as { title: string }[];

  expect(response.status).toBe(200);
  expect(events.map((event) => event.title)).toEqual([
    "Concert d'automne",
    "Assemblée générale",
    "Week-end de répétition",
  ]);
  expect(events.map((event) => event.title)).not.toContain("Répétition du samedi");
});

test("GET /events?include=past returns the whole history, oldest first", async () => {
  const response = await fetch("/api/events?include=past");
  const events = (await response.json()) as { title: string }[];

  expect(response.status).toBe(200);
  expect(events.map((event) => event.title)).toEqual([
    "Répétition du samedi",
    "Concert d'automne",
    "Assemblée générale",
    "Week-end de répétition",
  ]);
});
```

- [ ] **Step 2: Run them and verify they fail**

```powershell
npx vitest run web/src/mocks/handlers.test.ts
```

Expected: the first FAILS because the past event does not exist yet and the `not.toContain` passes vacuously while the `toEqual` is fine — so in practice the **second** test fails with a 3-element array. Both become meaningful once Step 3 adds the event.

- [ ] **Step 3: Add a past event to the fixture, first in date order**

At the **start** of the `SEED` array in `web/src/mocks/handlers.ts`:

```ts
  {
    // DELIBERATELY IN THE PAST. The fixture used to be all-future, and that
    // bias is exactly what hid the missing date filter from the mocked front
    // end while the API's own tests were biased the same way. Keep one past
    // event here so /sinscrire hiding it, and /planning_repet's past-events
    // disclosure revealing it, are both visible in `npm run dev:mock` and
    // testable in e2e.
    id: 4,
    date: isoDaysFromToday(-9),
    title: "Répétition du samedi",
    startTime: "10:00:00",
    endTime: "12:00:00",
    location: "Werkhof",
    attire: null,
    weekend: 0,
    response: null,
  },
```

Its `id` is 4 rather than 1 so the three existing events keep the ids every other test and fixture already references.

- [ ] **Step 4: Add the filter to the handler**

Add above the handler list, beside `isoDaysFromToday`:

```ts
/** Mirrors EventController::index — the boundary is inclusive of today. */
function isUpcoming(event: MockEvent): boolean {
  return event.date >= isoDaysFromToday(0);
}
```

ISO `YYYY-MM-DD` strings compare correctly with `>=`, which is why no parsing is needed.

Then replace:

```ts
  http.get("/api/events", () => HttpResponse.json(events)),
```

with:

```ts
  // Mirrors EventController::index, including that only the exact string
  // `past` opts in. A mock that returned everything would go on hiding the
  // defect this endpoint was just fixed for.
  http.get("/api/events", ({ request }) => {
    const includePast = new URL(request.url).searchParams.get("include") === "past";
    return HttpResponse.json(includePast ? events : events.filter(isUpcoming));
  }),
```

- [ ] **Step 5: Run the mock tests**

```powershell
npx vitest run web/src/mocks/handlers.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Run the whole web suite**

```powershell
npm run test:web
```

Expected: all PASS. The past event is excluded by default, so every page test still sees exactly three events and `toHaveLength(3)` holds. **If a test now sees four events, a handler is returning the unfiltered list.**

- [ ] **Step 7: See it in the browser**

```powershell
npx vite --mode mock --port 5199 --strictPort
```

Log in as `demo.user` / `demo` and check `/sinscrire`: three events, and **no** "Répétition du samedi". Then confirm the past event is reachable:

```bash
curl -s "http://localhost:5199/api/events?include=past" | grep -c "Répétition du samedi"
```

Expected: `1`.

- [ ] **Step 8: Commit**

```bash
git add web/src/mocks/handlers.ts web/src/mocks/handlers.test.ts
git commit -m "test(web): mock the events filter, and seed one past event

The mock now implements the same upcoming-by-default contract as the API,
including that only the exact string 'past' opts in.

The past event is the point rather than a detail: the fixture's all-future bias
is what hid the missing filter from the mocked front end while the API's own
tests were biased the same way. With it, /sinscrire hiding a past event is
visible in dev and testable in e2e."
```

---

## Task 7: The `@/*` alias, in all three configs

shadcn's CLI writes imports as `@/components/ui/...` and `@/lib/utils`. This repo has no alias.

**It goes in three files, not one.** `vitest.config.ts` is a separate config here, and missing it means every test importing a vendored component fails to resolve **while `npm run build` stays green** — a green build over a red suite.

**Files:**
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: `tsconfig.json`**

Add `baseUrl` and `paths` inside `compilerOptions`:

```json
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["web/src/*"]
    }
```

- [ ] **Step 2: `vite.config.ts`**

Add the import at the top:

```ts
import { fileURLToPath } from "node:url";
```

and a `resolve` block inside `defineConfig({...})`, beside `plugins`:

```ts
  // `@/` -> web/src. Note root is "web" below, so this is resolved from the
  // REPO root and not from the Vite root. It must agree with tsconfig.json's
  // paths and with vitest.config.ts, which is a separate config file in this
  // project -- see its own comment.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
```

- [ ] **Step 3: `vitest.config.ts` — the one that is easy to forget**

Replace the whole file with:

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// A dedicated config for web/ tests, kept separate from vite.config.ts.
//
// It originally existed because the repo also carried vite.config.js for the
// OLD front end, and without this file vitest auto-loaded that config and
// searched app/assets/ for tests, finding none. That front end is gone as of
// the SPA cutover, so the original reason has lapsed and these two configs
// could be merged -- but that is sub-project B's business, not a side effect of
// a mobile pass.
//
// While it exists it MUST carry the same `@/` alias as vite.config.ts and
// tsconfig.json. Vitest does not read vite.config.ts when this file is present,
// so omitting the alias here fails every test that imports a vendored shadcn
// component while `npm run build` stays perfectly green.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  test: {
    include: ["web/src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["web/src/setupTests.ts"],
  },
});
```

- [ ] **Step 4: Prove all three work with a throwaway import**

Temporarily add to `web/src/pages/Accueil.tsx`, as the first import:

```tsx
import { formatTime } from "@/lib/date";
```

and reference it once inside the component body: `void formatTime;`

Then run all three toolchains:

```bash
npm run typecheck
```
```powershell
npx vitest run web/src/pages/Accueil.test.tsx
```
```bash
npm run build:web
```

Expected: all three succeed. **If typecheck passes but Vitest fails to resolve `@/lib/date`, Step 3 did not take.** Then revert the throwaway import and the `void` line.

- [ ] **Step 5: Confirm the revert is clean**

```bash
git diff --stat web/src/pages/Accueil.tsx
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json vite.config.ts vitest.config.ts
git commit -m "build: add the @/* alias to tsconfig, vite and vitest

shadcn's CLI writes @/components/ui and @/lib/utils imports. The alias has to
exist in all three configs: vitest.config.ts is separate in this repo and does
not read vite.config.ts, so omitting it there fails every test importing a
vendored component while the build stays green.

Also corrects that file's comment, which still explained itself in terms of the
old front end and said it would become redundant once the cutover landed. It
did; merging the two configs is sub-project B's business."
```

---

## Task 8: `shadcn init`, and the token mapping

**This is the one task where a component library could quietly neutralise the band's palette.** Read `docs/superpowers/specs/2026-08-29-visual-foundation-design.md` first. The band is a youth Guggenmusik that performs in UV costumes at night; neon on black *is* the identity, and the palette is not decoration.

The mapping is **one-directional**: shadcn's semantic names become aliases of the *Scène* tokens and never introduce a colour of their own.

**Files:**
- Create: `components.json`
- Create: `web/src/lib/utils.ts`
- Modify: `web/src/styles.css`
- Modify: `package.json` / `package-lock.json`

- [ ] **Step 1: Run the init**

```bash
npx shadcn@latest init
```

Answer: style **new-york**, base colour **neutral** (it is discarded in Step 3 — the mapping replaces it), CSS file `web/src/styles.css`, CSS variables **yes**, components alias `@/components`, utils alias `@/lib/utils`.

This installs `class-variance-authority`, `clsx` and `tailwind-merge`, writes `components.json` and `web/src/lib/utils.ts`, and inserts token blocks into `web/src/styles.css`.

- [ ] **Step 2: Move the new dependencies to `devDependencies`**

This project has **no runtime dependencies by design** — the build bundles everything, and even `react` is a devDependency. If the init added anything to `dependencies`, move it:

```bash
node -e "const p=require('./package.json');console.log('deps:',JSON.stringify(p.dependencies))"
```

Move every entry except `@fontsource-variable/karla` and `@fontsource/bungee` into `devDependencies`, then:

```bash
npm install
```

- [ ] **Step 3: Replace the generated token block with the one-directional mapping**

The init writes `:root` and `.dark` blocks full of neutral `oklch()` values. **Delete both** and put this in their place, immediately after the existing `@theme { ... }` block in `web/src/styles.css`:

```css
/**
 * shadcn/ui's token vocabulary, mapped ONTO the Scène palette.
 *
 * This mapping is ONE-DIRECTIONAL on purpose: every name here is an ALIAS of a
 * --color-* token defined in the @theme block above, and none of them
 * introduces a colour of its own. The palette therefore keeps exactly one
 * source of truth and cannot drift as vendored components are added.
 *
 * This is the single point at which a component library could quietly
 * neutralise a palette that IS the band's identity. Anyone editing it should
 * read docs/superpowers/specs/2026-08-29-visual-foundation-design.md first.
 *
 * --color-pink is DELIBERATELY ABSENT. shadcn spends --accent on hover
 * SURFACES, and the palette's rule is "emphasis only -- never a whole
 * surface", so --accent gets a violet tint instead and pink stays hand-applied
 * where it already is: the band name in the header.
 *
 * THERE IS NO .dark BLOCK, and there must not be one. Scène commits to a single
 * look -- the visual-foundation spec rejected dark mode explicitly, as "two
 * would double the surface for nobody who has asked". shadcn init writes a
 * .dark block by default; it was deleted. Leaving it would mean a stray `dark`
 * class renders a design nobody approved, and nothing in the test suite would
 * notice.
 */
:root {
  --radius: 0.5rem;

  --background: var(--color-ground);
  --foreground: var(--color-ink);

  --card: var(--color-panel);
  --card-foreground: var(--color-ink);
  --popover: var(--color-panel);
  --popover-foreground: var(--color-ink);

  --primary: var(--color-violet);
  --primary-foreground: #fff;

  --secondary: var(--color-panel);
  --secondary-foreground: var(--color-ink);

  --muted: var(--color-ground);
  --muted-foreground: var(--color-ink-muted);

  --accent: color-mix(in oklab, var(--color-violet) 10%, white);
  --accent-foreground: var(--color-violet);

  --destructive: var(--color-danger);
  --destructive-foreground: #fff;

  --border: var(--color-line);
  --input: var(--color-line);
  --ring: var(--color-violet);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

- [ ] **Step 4: Prove there is no `.dark` block left**

```bash
grep -n "\.dark\|prefers-color-scheme" web/src/styles.css
```

Expected: **no matches.** If anything matches, delete it — see the comment above.

- [ ] **Step 5: Confirm the palette is intact**

```bash
grep -c "oklch(" web/src/styles.css
```

Expected: `0`. Every `oklch()` value the init wrote belongs to its neutral base palette and must be gone. The only `color-mix` is `--accent`.

- [ ] **Step 6: Lint, format, build**

```bash
npm run fix
npm run lint:css
npm run build:web
```

Expected: all succeed. Stylelint knows Tailwind's at-rules via `.stylelintrc.json`'s `ignoreAtRules`; `@theme inline` is the same `@theme` at-rule and needs no new entry. **If Stylelint complains about `@theme`, do not add a new ignore — check that you did not introduce a different at-rule.**

- [ ] **Step 7: Commit**

```bash
git add components.json web/src/lib/utils.ts web/src/styles.css package.json package-lock.json
git commit -m "build(web): init shadcn/ui, mapped onto the Scene palette

The mapping is one-directional: every shadcn token is an alias of a --color-*
token from the @theme block, and none introduces a colour of its own, so the
palette keeps one source of truth as vendored components arrive.

The .dark block init writes is deleted -- Scene commits to a single look and the
visual-foundation spec rejected dark mode explicitly. A stray 'dark' class would
otherwise render a design nobody approved, and no test would notice.

--color-pink is deliberately absent from shadcn's vocabulary: it spends --accent
on hover surfaces and the palette's rule is emphasis only, never a whole
surface."
```

---

## Task 9: Vendor `button` and `card`

**Files:**
- Create: `web/src/components/ui/button.tsx`
- Create: `web/src/components/ui/card.tsx`

- [ ] **Step 1: Add them**

```bash
npx shadcn@latest add button card
```

This also installs `@radix-ui/react-slot`, which is what `asChild` needs — and `asChild` is how a router `Link` gets button styling without a second component.

- [ ] **Step 2: Strip the `"use client"` directives**

They are meaningless outside Next.js.

```bash
grep -rn '"use client"' web/src/components/ui/
```

Delete each such line, and the blank line after it.

- [ ] **Step 3: Move any new dependency to `devDependencies`, as in Task 8 Step 2**

- [ ] **Step 4: Give `Button` the touch-target floor**

Vendored components are ours once vendored. In `web/src/components/ui/button.tsx`, add to the base class string in the `cva` call:

```
min-h-touch
```

and add this comment immediately above the `buttonVariants` declaration:

```tsx
/**
 * VENDORED from shadcn/ui and then edited. Two deliberate local changes:
 *
 * 1. `min-h-touch` (44px, from --spacing-touch in styles.css) on the base
 *    variant. Every interactive control in this app has a floor, and putting it
 *    here is what stops it being a convention that survives until the next page
 *    is written.
 * 2. This app NEVER uses the `disabled` attribute on a button -- disabling the
 *    focused control blurs it to <body>, so an in-flight submit silently throws
 *    focus away. It uses aria-disabled plus an early return in the handler. The
 *    `aria-disabled:` variants below style that, and the `disabled:` ones are
 *    kept only because vendored markup may still pass the attribute.
 */
```

Add the `aria-disabled` styling to the base class string too:

```
aria-disabled:pointer-events-none aria-disabled:opacity-50
```

> `min-h-touch` does not exist until Task 12 defines `--spacing-touch`. That is fine — an unknown Tailwind class is inert, not an error — but it means Task 12's verification step is what proves this line works.

- [ ] **Step 5: Give `Card` an `asChild` prop**

Two of the 28 panel sites this component replaces are **list items** — the
events list and the admin summary list both render `<li>`s inside a named `<ul>`,
where a `<div>` is invalid markup and breaks the `listitem` role query their
tests use. shadcn's `Card` is a hard-coded `div`.

Radix's `Slot` is already installed for `Button`, so this is a four-line edit. In
`web/src/components/ui/card.tsx`, change the `Card` function to:

```tsx
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "div";
  return (
    <Component
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6",
        className,
      )}
      {...props}
    />
  );
}
```

and add the import at the top of the file:

```tsx
import { Slot } from "@radix-ui/react-slot";
```

Add this comment above `Card`:

```tsx
/**
 * VENDORED from shadcn/ui, plus an `asChild` prop.
 *
 * shadcn's Card is a hard-coded div. Two of the panel surfaces it replaces here
 * are LIST ITEMS -- the events list and the admin summary list are both a named
 * <ul>, where a div is invalid markup and breaks the listitem role query those
 * pages' tests rely on. asChild lets the card BE the <li> instead of wrapping
 * one, using the same Radix Slot that Button already pulls in.
 *
 * The base `gap-6 py-6` rhythm is meant for the CardHeader/CardContent/
 * CardFooter composition. A compact tile overrides it by passing its own
 * spacing -- `cn()` is tailwind-merge, so the caller's class wins rather than
 * both landing in the class list.
 */
```

- [ ] **Step 6: Format and typecheck**

```bash
npm run fix
npm run typecheck
```

Expected: both succeed. `npm run fix` is required after every `shadcn add`: vendored output is not Prettier-clean against this repo's config, and CI's `format:check` would fail on it.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ui package.json package-lock.json
git commit -m "build(web): vendor shadcn button and card

Two local edits, both recorded in the file: min-h-touch on the base variant so
the 44px floor lives in one place, and aria-disabled styling because this app
never uses the disabled attribute -- disabling a focused control blurs it to
body, so every submit here uses aria-disabled plus an early return.

Card gains an asChild prop: two of the panel surfaces it replaces are list
items, and shadcn's Card is a hard-coded div. It uses the same Radix Slot that
Button already installs.

'use client' directives stripped; they are meaningless outside Next."
```

---

## Task 10: Vendor `table` and `input`

Both have zero dependencies. `label` is deliberately **not** vendored: `FormField` already owns the `aria-invalid` / `aria-describedby` / error-`id` wiring, and its comment explains why that belongs in one place — a `describedby` pointing at a non-existent id announces nothing and nothing complains. It keeps its native `<label htmlFor>`.

**Files:**
- Create: `web/src/components/ui/table.tsx`
- Create: `web/src/components/ui/input.tsx`

- [ ] **Step 1: Add them**

```bash
npx shadcn@latest add table input
```

- [ ] **Step 2: Strip `"use client"` as in Task 9 Step 2**

- [ ] **Step 3: Give `Input` the touch-target floor**

In `web/src/components/ui/input.tsx`, add `min-h-touch` to the class string, with:

```tsx
/**
 * VENDORED from shadcn/ui, plus `min-h-touch` — the same 44px floor as Button.
 *
 * NOT wired up directly by pages. web/src/components/FormField.tsx is the only
 * entry point for a text field in this app, because it owns the aria-invalid /
 * aria-describedby / error-id wiring that is trivially correct and just as
 * trivially copy-pasted wrong. FormField renders this.
 */
```

- [ ] **Step 4: Format and typecheck**

```bash
npm run fix
npm run typecheck
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui
git commit -m "build(web): vendor shadcn table and input

shadcn's label is deliberately NOT vendored: FormField already owns the
aria-invalid / aria-describedby / error-id wiring and stays the only entry point
for a text field, rendering this Input inside its own native label."
```

---

## Task 11: Vendor `sonner` and `alert-dialog`

**`sonner` must be hand-edited on arrival.** Its registry item declares `["sonner", "next-themes"]` as dependencies and its source imports `useTheme` from `next-themes` — a Next.js package, in a Vite project, for a site that has exactly one theme.

**Files:**
- Create: `web/src/components/ui/sonner.tsx`
- Create: `web/src/components/ui/alert-dialog.tsx`
- Modify: `web/src/components/Layout.tsx`

- [ ] **Step 1: Add them**

```bash
npx shadcn@latest add sonner alert-dialog
```

- [ ] **Step 2: Remove `next-themes` immediately**

```bash
npm uninstall next-themes
```

- [ ] **Step 3: Rewrite `web/src/components/ui/sonner.tsx` without it**

Replace the whole file with:

```tsx
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * VENDORED from shadcn/ui and rewritten.
 *
 * The registry version imports useTheme from `next-themes` and declares it as a
 * dependency. That is a Next.js package, this is a Vite app, and Scène commits
 * to a single light look -- so the import is gone, next-themes is not
 * installed, and the theme is fixed.
 *
 * Colours come through the shadcn token aliases in styles.css, which are
 * one-directional aliases of the Scène palette, so a toast matches the rest of
 * the app without naming a colour here.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-panel group-[.toaster]:text-ink group-[.toaster]:border-line group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ink-muted",
          actionButton: "group-[.toast]:bg-violet group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-ground group-[.toast]:text-ink-muted",
        },
      }}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Prove `next-themes` is gone**

```bash
grep -rn "next-themes" web/src package.json
```

Expected: **no matches.**

- [ ] **Step 5: Strip `"use client"` from `alert-dialog.tsx` as in Task 9 Step 2**

- [ ] **Step 6: Mount the `Toaster` once, in the layout**

In `web/src/components/Layout.tsx`, add the import:

```tsx
import { Toaster } from "./ui/sonner";
```

and render it immediately before the closing `</>` of the returned fragment, after `<footer>`:

```tsx
      {/* Mounted once here rather than per page: the layout route survives
          navigation, so a toast raised by a mutation is not unmounted by the
          redirect that follows it. */}
      <Toaster />
```

- [ ] **Step 7: Write a test that the toaster mounts**

Create `web/src/components/ui/sonner.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Toaster } from "./sonner";

// The one thing worth pinning about a vendored, rewritten component: it renders
// at all, without next-themes. If the registry version is ever re-added by a
// `shadcn add`, this fails on the missing module rather than at runtime in a
// browser.
test("the toaster renders without a theme provider", () => {
  const { container } = render(<Toaster />);
  expect(container).toBeTruthy();
});
```

- [ ] **Step 8: Format, typecheck, test**

```bash
npm run fix
npm run typecheck
```
```powershell
npm run test:web
```

Expected: all PASS. Every existing test must still pass — `Layout.test.tsx` asserts on roles and French text and gains an inert element.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ui web/src/components/Layout.tsx package.json package-lock.json
git commit -m "build(web): vendor shadcn sonner and alert-dialog, without next-themes

The sonner registry item imports useTheme from next-themes and declares it as a
dependency. That is a Next.js package in a Vite app for a site with one theme,
so the import is gone, the package is uninstalled, and a test pins that the
component renders without it -- so a future 'shadcn add' that restores the
registry version fails in the suite rather than in a browser.

The Toaster mounts once in Layout, which survives navigation, so a toast raised
by a mutation outlives the redirect after it."
```

---

## Task 12: E1's own tokens, and the focus ring

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add the three tokens to the existing `@theme` block**

Inside the `@theme { ... }` block in `web/src/styles.css`, after `--color-danger`:

```css
  /* The floor for every interactive control: 44px. Applied through Button and
     Input's base variants rather than by hand, so it is a rule rather than a
     convention that lasts until the next page is written. */
  --spacing-touch: 2.75rem;

  /* ONE width for the chrome and for page shells, with prose constrained
     INSIDE it by --container-text.

     Before this, the header/nav/footer were max-w-5xl while most pages were
     max-w-3xl, so at 1280 the nav's first item started at x=143 and the page
     content at x=272 -- a visible misalignment on every page. Pages used five
     different widths between them. PageSection owns these now. */
  --container-shell: 72rem;
  --container-text: 44rem;
```

- [ ] **Step 2: Add the focus-ring utility**

At the end of `web/src/styles.css`:

```css
/* One visible focus ring, from one place.
   focus-visible rather than focus, so a mouse click on a button does not leave
   a ring behind while a keyboard tab does. */
@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--color-violet);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 3: Verify Tailwind actually generates the utilities**

**This is the step that matters.** A missing Tailwind class is inert, not an error — it fails silently as an unstyled element, exactly as the visual-foundation spec warned about the `canetons-red` rename. Do not assume `--spacing-touch` yields `min-h-touch`.

```bash
npm run build:web
grep -o "min-h-touch\|max-w-shell\|max-w-text\|focus-ring" dist/build/assets/*.css | sort -u
```

Expected: `min-h-touch` appears (Button and Input use it as of Tasks 9 and 10). `max-w-shell`, `max-w-text` and `focus-ring` will **not** appear yet — nothing uses them, and Tailwind only emits classes it finds in the source. That is expected.

To prove all four generate, add them temporarily to `web/src/pages/Accueil.tsx`'s section element:

```tsx
    <section className="focus-ring mx-auto max-w-shell max-w-text px-4 py-8">
```

then rebuild and re-grep. Expected: all four appear. **If `min-h-touch` is absent, `--spacing-touch` is not feeding the spacing utilities** — switch it to an explicit `@utility min-h-touch { min-height: 2.75rem; }` and re-verify before continuing. Then revert the throwaway classes.

- [ ] **Step 4: Confirm the revert**

```bash
git diff --stat web/src/pages/Accueil.tsx
```

Expected: no output.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint:css
npm run fix
git add web/src/styles.css
git commit -m "feat(web): add touch-target and container tokens, and one focus ring

--spacing-touch is the 44px floor, applied through Button and Input's base
variants so it is a rule and not a convention.

--container-shell and --container-text retire five competing page widths. The
chrome was max-w-5xl while most pages were max-w-3xl, so at 1280 the nav's first
item started at x=143 and the content at x=272 -- visible on every page.

The generated utilities were verified in the built CSS rather than assumed: an
unknown Tailwind class is inert, not an error, and fails silently as an unstyled
element."
```

---

## Task 13: `PageSection`

**Files:**
- Create: `web/src/components/PageSection.tsx`
- Test: `web/src/components/PageSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { PageSection } from "./PageSection";

test("it renders its children inside a section", () => {
  render(
    <PageSection>
      <h1>Bienvenue</h1>
    </PageSection>,
  );
  expect(screen.getByRole("heading", { name: "Bienvenue" })).toBeInTheDocument();
});

// The width is the whole reason this component exists, and it is the one thing
// no other test in the suite can see -- so it is asserted here, at the single
// place that owns it, rather than on sixteen pages.
test("the default width is the shell, and the other two are opt-in", () => {
  const { container: shell } = render(<PageSection>a</PageSection>);
  expect(shell.firstChild).toHaveClass("max-w-shell");

  const { container: text } = render(<PageSection width="text">b</PageSection>);
  expect(text.firstChild).toHaveClass("max-w-text");

  const { container: form } = render(<PageSection width="form">c</PageSection>);
  expect(form.firstChild).toHaveClass("max-w-md");
});

test("a caller can add classes without losing the width", () => {
  const { container } = render(<PageSection className="mt-10">a</PageSection>);
  expect(container.firstChild).toHaveClass("max-w-shell");
  expect(container.firstChild).toHaveClass("mt-10");
});
```

> This file deliberately asserts class names, which the rest of the suite does not. That is the point of extracting the component: the rule is asserted once, here, instead of being invisible across sixteen pages. It does not weaken the plan's acceptance criterion, which is about tests that *already exist* not needing to change.

- [ ] **Step 2: Run it and verify it fails**

```powershell
npx vitest run web/src/components/PageSection.test.tsx
```

Expected: FAIL — `Failed to resolve import "./PageSection"`.

- [ ] **Step 3: Implement it**

```tsx
import { cn } from "@/lib/utils";

/**
 * The page shell: the centred column, the gutter and the vertical rhythm.
 *
 * WHY IT EXISTS. Pages hand-wrote `mx-auto max-w-… px-4 py-8` about
 * thirty-five times, between them using FIVE different widths -- max-w-3xl,
 * 5xl, md, 4xl and 2xl -- while the header, nav and footer were fixed at
 * max-w-5xl. So at 1280 the nav's first item started at x=143 and the page
 * content at x=272: a misalignment visible on every page of the site.
 *
 * Three widths, and no more:
 *   shell — the default, and the same width as the chrome, so gutters line up
 *   text  — a prose column, kept near 65 characters
 *   form  — a single narrow form, as /authentification_inscription wants
 *
 * `section` rather than `div`: every page's outermost element already was one.
 */
export function PageSection({
  children,
  width = "shell",
  className,
}: {
  children: React.ReactNode;
  width?: "shell" | "text" | "form";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-auto px-4 py-8",
        width === "shell" && "max-w-shell",
        width === "text" && "max-w-text",
        width === "form" && "max-w-md",
        className,
      )}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

```powershell
npx vitest run web/src/components/PageSection.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PageSection.tsx web/src/components/PageSection.test.tsx
git commit -m "feat(web): add PageSection, which owns the three page widths

Pages hand-wrote the shell about thirty-five times using five different widths,
while the chrome was fixed at max-w-5xl -- so at 1280 the nav started at x=143
and the content at x=272, visibly misaligned on every page.

Its test asserts class names, which the rest of the suite deliberately does not.
That is the point of extracting it: the width rule is pinned once here instead
of being invisible across sixteen pages."
```

---

## Task 14: `StatTile`

**Files:**
- Create: `web/src/components/StatTile.tsx`
- Test: `web/src/components/StatTile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StatTile } from "./StatTile";

test("it shows the number and its label", () => {
  render(<StatTile label="Convoqués" value={5} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("Convoqués")).toBeInTheDocument();
});

// The admin summary renders these in a named <ul>, so the tile has to be a
// list item there. A <div> inside a <ul> is invalid markup and breaks the
// listitem role query the page's own test relies on.
test("it renders as a list item so it can sit in the summary list", () => {
  render(
    <ul>
      <StatTile label="Participe" value={3} />
    </ul>,
  );
  expect(screen.getByRole("listitem")).toHaveTextContent("Participe");
});

test("it keeps the data-tile hook the admin page's test uses", () => {
  const { container } = render(
    <ul>
      <StatTile label="Participe" value={3} />
    </ul>,
  );
  expect(container.querySelector("[data-tile]")).not.toBeNull();
});
```

- [ ] **Step 2: Run it and verify it fails**

```powershell
npx vitest run web/src/components/StatTile.test.tsx
```

Expected: FAIL — `Failed to resolve import "./StatTile"`.

- [ ] **Step 3: Implement it**

```tsx
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One number and its label, from the /inscriptions_admin summary.
 *
 * On a phone the four of these used to stack full-width and cost 470px of an
 * 844px screen for four numbers. The page grids them 2-up below `sm` now; this
 * component only has to be happy at either width.
 *
 * `li`, not `div`: the page renders them inside a named <ul> with
 * aria-live="polite", and a div there is invalid markup that breaks the
 * listitem query the page's test uses.
 *
 * `data-tile` is kept because InscriptionsAdmin.test.tsx selects on it -- the
 * tiles and the table below share the words "Participe" and "Ne participe pas",
 * so an accessible-name query for one of them would match a tile AND several
 * table cells at once.
 *
 * `gap-0 p-5` overrides the vendored Card's `gap-6 py-6`, which is meant for its
 * Header/Content/Footer composition rather than a compact tile. cn() is
 * tailwind-merge, so these win outright instead of both classes landing.
 */
export function StatTile({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card asChild className={cn("gap-0 p-5 text-center", className)}>
      <li data-tile>
        <p className="font-display text-4xl text-violet">{value}</p>
        <p className="mt-1 text-sm text-ink-muted">{label}</p>
      </li>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test**

```powershell
npx vitest run web/src/components/StatTile.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/StatTile.tsx web/src/components/StatTile.test.tsx
git commit -m "feat(web): add StatTile for the admin summary

An li rather than a div, because the page renders these inside a named ul with
aria-live and a div there is invalid markup that breaks the listitem query.
Keeps the data-tile hook: the tiles and the table share the words 'Participe'
and 'Ne participe pas', so an accessible-name query would match both."
```

---

## Task 15: `EventCard`

The shared card for `/planning_repet` and `/sinscrire`. `/sinscrire` is a squeezed three-column table today; without this it would become a second, near-identical card tree.

**Files:**
- Create: `web/src/components/EventCard.tsx`
- Test: `web/src/components/EventCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { EventCard } from "./EventCard";

const EVENT = {
  date: "2026-09-20",
  title: "Concert d'automne",
  weekend: 0,
};

test("the date is the card's heading and the title sits under it", () => {
  render(<EventCard event={EVENT} />);
  expect(
    screen.getByRole("heading", { name: "dimanche 20 septembre 2026", level: 3 }),
  ).toBeInTheDocument();
  expect(screen.getByText("Concert d'automne")).toBeInTheDocument();
});

// The heading LEVEL is the assertion worth having: both pages already own an
// h1, and /inscriptions_admin an h2, so a card that emitted h2 would break the
// document outline on one page and not the other.
test("a weekend event's heading spans two days", () => {
  render(<EventCard event={{ ...EVENT, weekend: 1 }} />);
  expect(
    screen.getByRole("heading", {
      name: "dimanche 20 septembre 2026 au lundi 21 septembre 2026",
      level: 3,
    }),
  ).toBeInTheDocument();
});

test("children render as the card's body and actions as its footer", () => {
  render(
    <EventCard event={EVENT} actions={<button type="button">Modifier</button>}>
      <p>19:00 – 22:00</p>
    </EventCard>,
  );
  expect(screen.getByText("19:00 – 22:00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The reason the actions are a SLOT and not absolutely positioned. The old
// EventActions was `absolute top-2 right-2`, and at 390px it rendered on top of
// the date -- "dimanche 20 se[Modifier]2(". A footer cannot overlap the heading
// at any width.
test("the actions are not absolutely positioned over the heading", () => {
  const { container } = render(
    <EventCard event={EVENT} actions={<button type="button">Supprimer</button>} />,
  );
  const footer = container.querySelector("[data-event-actions]")!;
  expect(footer.className).not.toContain("absolute");
});

test("it renders as a list item so it can sit in the events list", () => {
  render(
    <ul>
      <EventCard event={EVENT} />
    </ul>,
  );
  expect(within(screen.getByRole("listitem")).getByRole("heading", { level: 3 })).toBeTruthy();
});
```

- [ ] **Step 2: Run it and verify it fails**

```powershell
npx vitest run web/src/components/EventCard.test.tsx
```

Expected: FAIL — `Failed to resolve import "./EventCard"`.

- [ ] **Step 3: Implement it**

```tsx
import { Card } from "@/components/ui/card";
import { formatEventDate, formatEventDateRange } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Only what the card renders. Both pages pass a wider event object through. */
export type EventCardEvent = {
  date: string;
  title: string;
  weekend: number;
};

/**
 * One event, as a card: the date as the heading, the title under it, then
 * whatever the page wants in the body and the footer.
 *
 * SHARED BY /planning_repet AND /sinscrire on purpose. /sinscrire was a
 * three-column table squeezed into 390px -- every cell wrapping to three lines,
 * its action button 28px tall -- and rebuilding it as cards without this
 * component would mean a second, near-identical card tree to keep in step
 * forever. The two pages differ in their body and their footer, which is
 * exactly what `children` and `actions` are.
 *
 * THE ACTIONS ARE A FOOTER SLOT, NOT AN OVERLAY. /planning_repet's controls
 * were `absolute top-2 right-2`, which at 390px rendered the Modifier and
 * Supprimer buttons ON TOP of the event date -- the one thing the card exists to
 * tell you. Desktop was fine, which is why nothing caught it, and no unit or
 * e2e test could: both assert on roles and text, and the text was all present in
 * the DOM. It was only wrong on screen. A footer cannot overlap the heading at
 * any width, so the fix is structural rather than a spacing tweak.
 *
 * h3, because both pages already own an h1 and /inscriptions_admin an h2. A card
 * that emitted h2 would break the outline on one page and not the other, which
 * is why the level is asserted in the test rather than left to look right.
 */
export function EventCard({
  event,
  children,
  actions,
  className,
}: {
  event: EventCardEvent;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card asChild className={cn("gap-0 p-5 shadow-sm", className)}>
      <li>
        <h3 className="font-bold">
          {event.weekend ? formatEventDateRange(event.date) : formatEventDate(event.date)}
        </h3>
        <p className="mt-1 font-display text-lg">{event.title}</p>

        {children ? <div className="mt-3 text-ink-muted">{children}</div> : null}

        {actions ? (
          <div data-event-actions className="mt-4 flex flex-wrap gap-2">
            {actions}
          </div>
        ) : null}
      </li>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test**

```powershell
npx vitest run web/src/components/EventCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run the whole suite and the build**

```powershell
npm run test:web
```
```bash
npm run typecheck && npm run build:web
```

Expected: all PASS. **No page uses `EventCard` yet**, so every existing test must still pass untouched. That is the checkpoint for this plan: the foundation exists and has changed nothing on screen.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/EventCard.tsx web/src/components/EventCard.test.tsx
git commit -m "feat(web): add EventCard, shared by the planning and signup lists

The actions are a footer SLOT, not an overlay. /planning_repet's controls were
absolute top-2 right-2 and at 390px rendered on top of the event date -- the one
thing the card exists to tell you. Neither the unit nor the e2e suite could see
it: both assert on roles and text, and the text was all in the DOM. It was only
wrong on screen, so the fix is structural.

h3 because both pages own an h1 and /inscriptions_admin an h2; the level is
asserted rather than left to look right.

No page uses it yet -- E1b wires it up."
```

---

## Definition of done for E1a

- [ ] `docker compose exec -w /var/www/html/api-laravel web php artisan test` — all green.
- [ ] `npm run check` — green (typecheck, Pint, node tests, Vitest, ESLint, Stylelint, Prettier, secret guard).
- [ ] `npm run build:web` — green.
- [ ] `grep -rn "next-themes" web/src package.json` — no matches.
- [ ] `grep -n "\.dark\|oklch(" web/src/styles.css` — no matches.
- [ ] `grep -rn '"use client"' web/src/components/ui/` — no matches.
- [ ] **Every pre-existing web test passes untouched** except the two date assertions in `PlanningRepet.test.tsx`, which Task 5 replaces for a stated reason. No page has been restyled.
- [ ] `npx vite --mode mock --port 5199 --strictPort`, log in as `demo.user`: `/sinscrire` shows three events and **not** "Répétition du samedi"; `curl "http://localhost:5199/api/events?include=past"` includes it.

**Do not open a PR from this plan alone unless you intend to ship the API fix on its own** — which is a legitimate choice, since it is real user value with no visual change. E1b builds on this branch. Per the project's standing rule, **do not merge**: a merge to `main` auto-deploys TEST.

## What E1a deliberately does not do

Everything visual. No page is restyled, no page uses `PageSection`, `StatTile` or `EventCard`, the chrome and phone nav are untouched, `EventActions` still uses `window.confirm` and `window.alert`, `/sinscrire` is still a squeezed table, and `/planning_repet` has no past-events disclosure. All of that is **E1b**, whose plan is `docs/superpowers/plans/2026-08-31-e1b-chrome-and-pages.md`.

Adding an index on `events.date` is out of scope: the column is unindexed today, the table holds four rows in the seed and a few hundred at most in production, and a migration on this shared host is a risk with no payoff at that volume.
