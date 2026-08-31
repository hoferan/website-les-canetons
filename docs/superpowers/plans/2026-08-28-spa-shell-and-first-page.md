# SPA Shell and First Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running React app — boot gate, router with every URL, layout, guards, i18n and a mocked backend — with `/planning_repet` ported end to end, proving the architecture before it is repeated across the remaining sixteen routes.

**Architecture:** `main.tsx` fetches `GET /api/config` and `GET /api/user` before rendering anything, puts both in context, then hands over to React Router. Data comes from the orval-generated TanStack Query hooks, which reach the API through `web/src/api/http.ts`. In development the whole API can be served by MSW handlers generated from the same OpenAPI document, so the SPA runs with no Docker at all.

**Tech Stack:** React 19.2, React Router 7, TanStack Query 5, Tailwind 4, MSW 2.15, Vitest + Testing Library, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-28-spa-clean-cutover-and-mocks-design.md`, amending `docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md`.

---


> **Status, 2026-08-29: Tasks 1-8 complete, Tasks 9-10 remaining.** Executed inline on `feat/spa-cutover`, commits `847e524`..`267b0e7`. Deviations found while running it are recorded in the steps themselves and in the notes at the end. See `docs/continue-here.md` before picking this up.
## Plan roadmap

This plan is **Plan 2 of 2**. Plan 1 (`2026-08-28-spa-clean-slate.md`) is complete.

**Branch:** continue on `feat/spa-cutover`. Still do not merge — a merge auto-deploys TEST, and after this plan sixteen routes are still placeholders. See spec §9.

## Two defects to fix before anything consumes a hook

Both were found while writing this plan, in code already committed. Neither is caught by any existing test, and either one makes the first page's data layer silently wrong — so they are Tasks 1 and 2, before a single component is written.

**1. The mutator's return shape contradicts the generated types.** orval's `httpClient: "fetch"` convention is that a mutator returns `{ data, status, headers }`, and the generated types say so: `eventIndexResponse = { data: …; status: 200 } & { headers: Headers }`. `customFetch` returns the parsed body instead. So `useEventIndex().data` is *typed* as the wrapper and is *actually* the bare array — every call site that writes `result.data` gets `undefined`, with no type error. The seven tests in `http.test.ts` all assert request shape or error handling; **none asserts what a successful call returns**, which is why this survived.

**2. `GET /api/events` is typed `string[]`.** Scramble cannot infer through `Collection::map(fn (Event $e): array => …)`, so `api/openapi.json` declares the events list as an array of strings and the generated client repeats it. `/planning_repet` is built on that endpoint. The `openapi-drift` CI job does not help: it checks the committed document matches what Scramble *currently emits*, not that the shape is *right*.

`GET /responses` (`array of string`) and `GET /signups` (`string`) have the same problem. They are **out of scope here** — `/inscriptions_admin` and `/signups_admin` are later plans — but they are recorded in Task 2 so the next person does not rediscover them.

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `web/src/api/http.ts` | Mutator — gains the `{data, status, headers}` wrapper | 1 |
| `api/app/Models/Event.php` | Gains an array-shape docblock Scramble can read | 2 |
| `web/src/mocks/handlers.ts` | Generated MSW handlers + the four realistic overrides | 3 |
| `web/src/mocks/browser.ts` / `node.ts` | Worker (dev) and server (tests) | 3 |
| `web/src/session/SessionProvider.tsx` | Boot gate; holds config + user; exposes `useSession` | 4 |
| `web/src/session/capabilities.ts` | The capability matrix, mirrored from Laravel | 4 |
| `web/src/routes.tsx` | Route table — every French URL | 5 |
| `web/src/components/Layout.tsx` | Header, nav, footer, env ribbon | 6 |
| `web/src/components/guards.tsx` | `RequireAuth`, `RequireCapability` | 7 |
| `web/src/lib/date.ts` | French date formatting | 8 |
| `web/src/pages/PlanningRepet.tsx` | The ported page | 8, 9 |
| `web/e2e/planning.spec.ts` | Playwright smoke against the mocked app | 10 |

---

## Task 1: Make the mutator's return match the generated types

**Files:**
- Modify: `web/src/api/http.ts`
- Test: `web/src/api/http.test.ts`

- [x] **Step 1: Write the failing tests**

Add to `web/src/api/http.test.ts`:

```ts
test("a successful call returns orval's { data, status, headers } envelope", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify([{ id: 1, title: "Répétition" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const result = await customFetch<{ data: unknown; status: number; headers: Headers }>("/events", {
    method: "GET",
  });

  expect(result.status).toBe(200);
  expect(result.data).toEqual([{ id: 1, title: "Répétition" }]);
  expect(result.headers).toBeInstanceOf(Headers);
});

test("a 204 carries a null body inside the envelope, not a bare undefined", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

  const result = await customFetch<{ data: unknown; status: number }>("/logout", {
    method: "POST",
  });

  expect(result.status).toBe(204);
  expect(result.data).toBeNull();
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npm run test:web`
Expected: FAIL — `result.status` is `undefined`, because the current mutator returns the parsed body itself.

- [x] **Step 3: Wrap the return**

In `web/src/api/http.ts`, replace the tail of `customFetch`:

```ts
  if (!response.ok) {
    throw await toApiError(response);
  }

  // orval's `httpClient: 'fetch'` contract: a mutator returns the envelope, not
  // the bare body. Every generated signature says so —
  // `eventIndexResponse = { data: …; status: 200 } & { headers: Headers }` —
  // so returning the body alone type-checks at every call site and is undefined
  // at runtime. Do not "simplify" this back.
  const data = response.status === 204 ? null : await response.json();

  return { data, status: response.status, headers: response.headers } as T;
}
```

and update the function's docblock to record the envelope as part of the contract.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm run test:web`
Expected: PASS — 15 tests (13 from Plan 1 plus these 2).

- [x] **Step 5: Prove the types now line up**

Create `web/src/api/contract.test.ts`:

```ts
import { expectTypeOf, test } from "vitest";

import { eventIndex } from "./generated/endpoints";

// A compile-time guard, not a runtime one: if the mutator ever stops returning
// the envelope, or orval stops generating it, this stops type-checking. Cheaper
// than discovering it through an undefined at a call site.
test("the generated response type carries data, status and headers", () => {
  expectTypeOf(eventIndex).returns.resolves.toHaveProperty("data");
  expectTypeOf(eventIndex).returns.resolves.toHaveProperty("status");
  expectTypeOf(eventIndex).returns.resolves.toHaveProperty("headers");
});
```

Run: `npm run test:web && npm run typecheck`
Expected: both pass.

- [x] **Step 6: Commit**

```bash
git add web/src/api
git commit -m "fix(web): return orval's { data, status, headers } envelope from the mutator

Every generated signature declares it, so returning the bare body type-checked
everywhere and was undefined at runtime. No test caught it: all seven asserted
request shape or error handling, none the value of a successful call."
```

---

## Task 2: Type `GET /api/events` in the contract

**Files:**
- Modify: `api/app/Models/Event.php`
- Regenerate: `api/openapi.json`, `web/src/api/generated/`

- [x] **Step 1: Add the array shape Scramble can read**

In `api/app/Models/Event.php`, give `toFrontendShape()` a precise `@return`:

```php
    /**
     * @return array{
     *     id: int,
     *     date: string,
     *     title: string,
     *     startTime: string,
     *     endTime: string,
     *     location: string,
     *     attire: string|null,
     *     weekend: int,
     *     response: string|null,
     * }
     */
    public function toFrontendShape(?string $ownAnswer = null): array
```

Keep the existing docblock prose above it — the camelCase warning and the IDOR note both still apply.

- [x] **Step 2: Regenerate and inspect**

```bash
npm run openapi
node -e "const s=require('./api/openapi.json');console.log(JSON.stringify(s.paths['/events'].get.responses['200'].content['application/json'].schema,null,2))"
```
Expected: `type: array` with an `items` object listing the nine properties — not `items: { type: "string" }`.

If it is still `string`, Scramble did not pick the docblock up through the `Collection::map` chain. Fall back to annotating the controller directly rather than fighting the inference:

```php
use Dedoc\Scramble\Attributes\Response as ScrambleResponse;
```

and describe the 200 on `EventController::index()`. Do not hand-edit `api/openapi.json` — CI regenerates and diffs it.

- [x] **Step 3: Regenerate the client**

Run: `npm run generate:api`
Expected: `web/src/api/generated/model/` gains an events item type, and `eventIndexResponse200.data` is an array of that type rather than `string[]`.

- [x] **Step 4: Verify**

```bash
npm run typecheck
npm run test:web
docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventTest
```
Expected: all pass. The docblock changes no behaviour, so the Laravel suite must be unaffected.

- [x] **Step 5: Commit**

```bash
git add api/app/Models/Event.php api/openapi.json web/src/api/generated
git commit -m "fix(api): describe the events list shape so the generated client is typed

Scramble could not infer through Collection::map and emitted array-of-string,
so the SPA's main endpoint arrived untyped. GET /responses and GET /signups
have the same problem and are left for the plans that need them."
```

> **Known gaps, deliberately left:** `GET /api/responses` is `array of string` and `GET /api/signups` is `string`. Fix each in the plan that builds `/inscriptions_admin` and `/signups_admin`. `openapi-drift` will not flag them — it checks the document matches what Scramble emits, not that the shape is correct.

---

## Task 3: The mocked backend

**Files:**
- Modify: `orval.config.ts`, `package.json`, `web/src/main.tsx`, `.gitignore`
- Create: `web/src/mocks/handlers.ts`, `web/src/mocks/browser.ts`, `web/src/mocks/node.ts`, `web/public/mockServiceWorker.js` (generated)

- [x] **Step 1: Turn on orval's MSW generation**

In `orval.config.ts`, inside the `canetons` entry alongside `output.target`:

```ts
      mock: {
        type: "msw",
        // Deterministic, so a mocked page looks the same on every reload and a
        // snapshot-style assertion is possible. Faker's default is seeded per
        // call, which makes the events list reshuffle on every render.
        useExamples: true,
      },
```

- [x] **Step 2: Regenerate and see what appeared**

```bash
npm run generate:api
ls web/src/api/generated/
grep -oE "export const get[A-Za-z]+Mock(Handler)?" web/src/api/generated/endpoints.msw.ts | sort -u
```
Expected: a new `endpoints.msw.ts` exporting `getCanetonsMock()` (every handler) plus one `getXMockHandler` per operation.

- [x] **Step 3: Install the service worker**

```bash
npx msw init web/public --save
```

This writes `web/public/mockServiceWorker.js`. `tools/build.mjs` already strips it from `dist/build/` (added in Plan 1), so it cannot reach a server. Add it to `.gitignore`? **No** — commit it. MSW's worker must match the installed MSW version, and `msw init` is a manual step someone will forget; committing it makes a fresh clone work.

- [x] **Step 4: Write the realistic overrides**

Create `web/src/mocks/handlers.ts`:

```ts
import { HttpResponse, http } from "msw";

import { getCanetonsMock } from "../api/generated/endpoints.msw";

/**
 * The mocked backend.
 *
 * The bulk is generated from api/openapi.json, so it cannot drift from the real
 * contract. Four endpoints are hand-written on top, because generated faker
 * data describes SHAPE and this project needs CONTENT: a page laid out around
 * "Lorem ipsum" tells you nothing about whether the real French copy fits.
 *
 * Authentication is deliberately real: POST /login accepts the same three
 * seeded demo accounts the Docker stack has, and GET /user reports whoever
 * logged in. So the mocked app exercises the actual login flow and the actual
 * guards, rather than a dev-only role switcher that would then be untested.
 */

const USERS: Record<string, { username: string; role: string }> = {
  "demo.admin": { username: "demo.admin", role: "admin" },
  "demo.moderator": { username: "demo.moderator", role: "moderator" },
  "demo.user": { username: "demo.user", role: "user" },
};

let currentUser: { username: string; role: string } | null = null;

/** Test seam: lets a test start from a known session state. */
export function setMockUser(username: keyof typeof USERS | null): void {
  currentUser = username ? (USERS[username] ?? null) : null;
}

type MockEvent = {
  id: number;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  attire: string | null;
  weekend: number;
  response: string | null;
};

let events: MockEvent[] = [
  {
    id: 1,
    date: "2026-09-20",
    title: "Concert d'automne",
    startTime: "19:00:00",
    endTime: "22:00:00",
    location: "Salle communale",
    attire: "Costume des canetons",
    weekend: 0,
    response: null,
  },
  {
    id: 2,
    date: "2026-10-10",
    title: "Assemblée générale",
    startTime: "20:00:00",
    endTime: "22:30:00",
    location: "Local des Canetons",
    attire: null,
    weekend: 0,
    response: null,
  },
  {
    id: 3,
    date: "2026-11-14",
    title: "Week-end de répétition",
    startTime: "09:00:00",
    endTime: "18:00:00",
    location: "Chalet de la Berra",
    attire: "Tenue de sport",
    weekend: 1,
    response: null,
  },
];

/** Test seam: resets both mock stores between tests. */
export function resetMockState(): void {
  currentUser = null;
  events = events.slice(0, 3);
}

const overrides = [
  http.get("/api/config", () =>
    HttpResponse.json({
      env: "dev",
      features: { souper_signup: false },
      occasion: null,
    }),
  ),

  http.get("/api/user", () =>
    currentUser
      ? HttpResponse.json(currentUser)
      : HttpResponse.json(
          { error: "Not authenticated", code: "not_authenticated", fields: [] },
          { status: 401 },
        ),
  ),

  http.post("/api/login", async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const user = body.username ? USERS[body.username] : undefined;
    if (!user || body.password !== "demo") {
      return HttpResponse.json(
        { error: "Incorrect username or password", code: "invalid_credentials", fields: [] },
        { status: 401 },
      );
    }
    currentUser = user;
    return HttpResponse.json({ role: user.role });
  }),

  http.post("/api/logout", () => {
    currentUser = null;
    return HttpResponse.json({ ok: true });
  }),

  http.get("/api/events", () => HttpResponse.json(events)),

  http.post("/api/events", async ({ request }) => {
    const body = (await request.json()) as Omit<MockEvent, "id" | "response">;
    events = [
      ...events,
      { ...body, id: Math.max(0, ...events.map((e) => e.id)) + 1, response: null },
    ];
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  http.put("/api/events/:id", async ({ params, request }) => {
    const body = (await request.json()) as Omit<MockEvent, "id" | "response">;
    const id = Number(params.id);
    events = events.map((e) => (e.id === id ? { ...e, ...body } : e));
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/events/:id", ({ params }) => {
    events = events.filter((e) => e.id !== Number(params.id));
    return HttpResponse.json({ ok: true });
  }),
];

// Order matters: MSW uses the FIRST matching handler, so the hand-written ones
// must come before the generated catch-alls.
export const handlers = [...overrides, ...getCanetonsMock()];
```

- [x] **Step 5: Wire the worker and the test server**

Create `web/src/mocks/browser.ts`:

```ts
import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
```

Create `web/src/mocks/node.ts`:

```ts
import { setupServer } from "msw/node";

import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

- [x] **Step 6: Start the worker in development only**

At the top of `web/src/main.tsx`, before the render:

```tsx
// Mocked backend, opt-in per run: `npm run dev:mock`. Guarded on import.meta.env.DEV
// as well as the flag so the worker can never start in a built bundle, even if
// VITE_MOCK_API somehow leaked into a production build's environment.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") {
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
}
```

`onUnhandledRequest: "bypass"` so Vite's own module and HMR requests pass through untouched. This makes `main.tsx` a top-level-await module, which Vite supports for ESM targets.

Set the flag through **Vite's mode files**, not a shell prefix: a bare
`VITE_MOCK_API=1 vite` does not work in cmd or PowerShell, and `cross-env` is a
dependency this does not need.

Create `web/.env.mock` (Vite loads `.env.[mode]` from its `root`, which is `web/`):

```
VITE_MOCK_API=1
```

and add the script to `package.json`:

```json
"dev:mock": "vite --mode mock",
```

`.env.mock` is committed — it holds a flag, not a secret, and a fresh clone
should get a working `dev:mock`. Check `.gitignore` does not exclude it: the
existing `.env*` rules are written for the repo root, so confirm with
`git check-ignore -v web/.env.mock` and add a negation if it is caught.

- [x] **Step 7: Point Vitest at the mock server**

Create `web/src/setupTests.ts`:

```ts
import { afterAll, afterEach, beforeAll } from "vitest";

import { resetMockState, setMockUser } from "./mocks/handlers";
import { server } from "./mocks/node";

// error, not bypass: in a test an unhandled request is a missing handler, and
// silently letting it through produces a confusing failure much later.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockState();
  setMockUser(null);
});
afterAll(() => server.close());
```

and register it in `vitest.config.ts`:

```ts
    setupFiles: ["web/src/setupTests.ts"],
```

- [x] **Step 8: Verify the mocks answer**

```bash
npm run test:web
npm run dev:mock
```
Then load http://localhost:5173 and confirm in the browser console that MSW logs `[MSW] Mocking enabled.` — with no Docker running.

- [x] **Step 9: Commit**

```bash
git add orval.config.ts package.json vitest.config.ts web/
git commit -m "feat(web): a mocked backend generated from the OpenAPI document

Handlers come from api/openapi.json via orval, so they cannot drift from the
real contract. Four endpoints are hand-written for content rather than shape;
login and /user keep real session semantics so the guards are exercised for
real rather than through a dev-only role switcher."
```

---

## Task 4: The boot gate and the session

**Files:**
- Create: `web/src/session/SessionProvider.tsx`, `web/src/session/capabilities.ts`, `web/src/session/SessionProvider.test.tsx`

- [x] **Step 1: Mirror the capability matrix**

Create `web/src/session/capabilities.ts`:

```ts
/**
 * The capability matrix, mirrored from api/app/Support/Capability.php.
 *
 * NOT a hierarchy: admin manages events and views summaries but may NOT
 * respond; user/moderator respond but may not manage. Keep the two in step —
 * this copy is UX only. Laravel's `capability:` middleware is the only thing
 * that enforces anything, so a mistake here shows the wrong buttons, it does
 * not open a hole.
 */
export const CAPABILITIES = {
  user: ["respond"],
  moderator: ["respond"],
  admin: ["manage_events", "view_summary"],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof CAPABILITIES;
export type Capability = (typeof CAPABILITIES)[Role][number];

export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role || !(role in CAPABILITIES)) return false;
  return (CAPABILITIES[role as Role] as readonly string[]).includes(capability);
}
```

- [x] **Step 2: Write the failing tests**

Create `web/src/session/SessionProvider.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { SessionProvider, useSession } from "./SessionProvider";

function Probe() {
  const { config, user } = useSession();
  return (
    <div>
      <span data-testid="env">{config.env}</span>
      <span data-testid="role">{user?.role ?? "anonymous"}</span>
    </div>
  );
}

function renderWithProviders() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

test("nothing renders until config has resolved", async () => {
  renderWithProviders();
  expect(screen.queryByTestId("env")).toBeNull();
  expect(await screen.findByTestId("env")).toHaveTextContent("dev");
});

test("a 401 from /user is a normal answer meaning anonymous, not an error", async () => {
  renderWithProviders();
  expect(await screen.findByTestId("role")).toHaveTextContent("anonymous");
});

test("a logged-in user's role reaches the context", async () => {
  setMockUser("demo.admin");
  renderWithProviders();
  expect(await screen.findByTestId("role")).toHaveTextContent("admin");
});
```

Add `@testing-library/jest-dom` for `toHaveTextContent`:

```bash
npm install --save-dev @testing-library/jest-dom
```

and import it in `web/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [x] **Step 3: Run them to verify they fail**

Run: `npm run test:web`
Expected: FAIL — `Cannot find module './SessionProvider'`.

- [x] **Step 4: Implement the provider**

Create `web/src/session/SessionProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";

import { useAuthUser, useConfig } from "../api/generated/endpoints";
import type { AuthUser200, Config200 } from "../api/generated/model";
import { ApiError } from "../api/http";
import { can, type Capability } from "./capabilities";

type Session = {
  config: Config200;
  user: AuthUser200 | null;
  can: (capability: Capability) => boolean;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession was called outside SessionProvider — the boot gate did not run.");
  }
  return session;
}

/**
 * The boot gate.
 *
 * Nothing below renders until GET /api/config has resolved. That is deliberate:
 * the env ribbon and the feature flags come from it, and rendering first would
 * flash the wrong chrome — on PROD, a non-prod ribbon.
 *
 * A 401 from GET /api/user is a NORMAL answer meaning "anonymous", not a
 * failure, so it is caught rather than retried or surfaced.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const config = useConfig({ query: { retry: false, staleTime: Infinity } });
  const user = useAuthUser({
    query: {
      retry: false,
      staleTime: Infinity,
      // A 401 resolves to null instead of rejecting, so an anonymous visitor is
      // not an error state anywhere downstream.
      throwOnError: false,
    },
  });

  if (config.isPending || user.isPending) {
    return null;
  }

  if (config.isError) {
    return (
      <p role="alert">
        Le site n’a pas pu démarrer. Veuillez réessayer dans quelques instants.
      </p>
    );
  }

  const role = user.isError
    ? null
    : (user.data?.data ?? null);

  // A 401 is expected; anything else from /user is worth knowing about.
  if (user.isError && !(user.error instanceof ApiError && user.error.status === 401)) {
    console.error("Unexpected failure reading the session:", user.error);
  }

  const value: Session = {
    config: config.data.data,
    user: role,
    can: (capability) => can(role?.role, capability),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
```

Note `config.data.data` and `user.data?.data` — the outer `.data` is TanStack Query's, the inner one is the orval envelope from Task 1. That double `.data` is ugly but it is the contract; do not paper over it with a wrapper hook that hides which is which.

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm run test:web`
Expected: PASS, 3 new tests.

- [x] **Step 5a: Extract the test harness the next four tasks all need**

Create `web/src/test/renderWithSession.tsx`, and rewrite Step 2's tests to use it:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { SessionProvider } from "../session/SessionProvider";

/**
 * Renders a node behind the real providers and WAITS FOR THE BOOT GATE.
 *
 * SessionProvider renders null until config and user have resolved, so a test
 * that asserts immediately after render() sees an empty tree and fails in a way
 * that looks like a component bug. Awaiting here means every test starts from a
 * booted app.
 *
 * retry: false — a test that hits an unmocked endpoint should fail at once, not
 * after three retries and a timeout.
 */
export async function renderWithSession(ui: ReactNode, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const result = render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <div data-testid="booted">{ui}</div>
      </SessionProvider>
    </QueryClientProvider>,
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter> },
  );

  await screen.findByTestId("booted");
  return result;
}

export { waitForElementToBeRemoved };
```

- [x] **Step 6: Mount it in `main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SessionProvider } from "./session/SessionProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API is same-origin and cheap; refetching on every window focus
      // produces a request storm on a members' page left open in a tab.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [x] **Step 7: Commit**

```bash
git add web/src/session web/src/main.tsx web/src/setupTests.ts package.json package-lock.json
git commit -m "feat(web): boot gate holding config and session, with the capability matrix

Nothing renders before GET /api/config resolves, so the env ribbon and feature
flags are never wrong on first paint. A 401 from /user is a normal answer
meaning anonymous. The capability matrix mirrors Laravel's and is UX only."
```

---

## Task 5: The router

**Files:**
- Create: `web/src/routes.tsx`, `web/src/pages/Placeholder.tsx`, `web/src/pages/NotFound.tsx`
- Modify: `web/src/App.tsx`, `package.json`

- [x] **Step 1: Install React Router**

```bash
npm install --save-dev react-router-dom@^7
```

- [x] **Step 2: Write the failing test**

Create `web/src/routes.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { AppRoutes } from "./routes";

test.each([
  ["/", "Accueil"],
  ["/historique", "Historique"],
  ["/planning_repet", "Planning et répétitions"],
  ["/comite_teamdirection", "Contact Canetons"],
])("%s renders its page", async (path, heading) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

test("an unknown URL renders the 404 view rather than nothing", () => {
  render(
    <MemoryRouter initialEntries={["/pas-une-page"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
});
```

- [x] **Step 3: Run it to verify it fails**

Run: `npm run test:web`
Expected: FAIL — `Cannot find module './routes'`.

- [x] **Step 4: Create the placeholder and 404 pages**

`web/src/pages/Placeholder.tsx`:

```tsx
/**
 * Every route that exists but has not been ported yet. Deliberately visible
 * rather than blank: navigation is complete from day one, and what is missing
 * is obvious to anyone clicking around.
 */
export function Placeholder({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-canetons-red">{title}</h1>
      <p className="mt-4 text-gray-600">Cette page n’a pas encore été reprise.</p>
    </section>
  );
}
```

`web/src/pages/NotFound.tsx`:

```tsx
import { Link } from "react-router-dom";

/**
 * A SOFT 404: the server answered 200 with the shell (the .htaccess fallback is
 * a catch-all by design — see config/htaccess/site.htaccess), and this view is
 * what the visitor sees. Same page as before the cutover, different status.
 */
export function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="text-6xl font-bold text-canetons-red">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-4 text-gray-600">
        Oups&nbsp;! La page que vous recherchez n’existe pas ou a été déplacée.
      </p>
      <Link to="/" className="mt-6 inline-block underline">
        Retour à l’accueil
      </Link>
    </section>
  );
}
```

- [x] **Step 5: Create the route table**

`web/src/routes.tsx` — every URL from the deleted `app/src/routes.php`, unchanged:

```tsx
import { Route, Routes } from "react-router-dom";

import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";
import { useSession } from "./session/SessionProvider";

/**
 * The URL set is FROZEN: these are the paths the live site has today, and the
 * cutover is explicitly "no URL changes" (2026-07-27 spec, non-goals). The
 * French slugs and the underscores are not tidied.
 *
 * The three souper routes exist only when the feature is on, exactly as the old
 * route table registered them conditionally — a disabled server genuinely has
 * no such page rather than an empty one.
 */
export function AppRoutes() {
  const { config } = useSession();

  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Accueil" />} />
      <Route path="/historique" element={<Placeholder title="Historique" />} />
      <Route path="/canetons" element={<Placeholder title="Les canetons" />} />
      <Route path="/cd" element={<Placeholder title="CD" />} />
      <Route path="/commencement" element={<Placeholder title="Commencer les Canetons" />} />
      <Route path="/moniteurs" element={<Placeholder title="Moniteurs" />} />
      <Route path="/sponsors" element={<Placeholder title="Sponsors et liens amis" />} />
      <Route path="/multimedia" element={<Placeholder title="Multimédia" />} />
      <Route path="/contact" element={<Placeholder title="Contact" />} />
      <Route path="/comite_teamdirection" element={<Placeholder title="Contact Canetons" />} />
      <Route
        path="/authentification_inscription"
        element={<Placeholder title="Connexion" />}
      />
      <Route path="/sinscrire" element={<Placeholder title="Inscriptions" />} />
      <Route path="/confirmation" element={<Placeholder title="Confirmation" />} />
      <Route
        path="/inscriptions_utilisateurs"
        element={<Placeholder title="Mes inscriptions" />}
      />
      <Route path="/planning_repet" element={<Placeholder title="Planning et répétitions" />} />
      <Route path="/admin" element={<Placeholder title="Administration" />} />
      <Route path="/inscriptions_admin" element={<Placeholder title="Inscriptions (admin)" />} />

      {config.features.souper_signup ? (
        <>
          <Route path="/signup" element={<Placeholder title="S’inscrire au souper" />} />
          <Route path="/signup_thanks" element={<Placeholder title="Merci" />} />
          <Route path="/signups_admin" element={<Placeholder title="Souper (admin)" />} />
        </>
      ) : null}

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

- [x] **Step 6: Mount the router**

Replace `web/src/App.tsx`:

```tsx
import { BrowserRouter } from "react-router-dom";

import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

`web/src/App.test.tsx` from Plan 1 asserts a heading that no longer exists — replace its body with a check that the router mounts and renders the home route.

- [x] **Step 7: Run the tests**

Run: `npm run test:web && npm run typecheck`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add web/src package.json package-lock.json
git commit -m "feat(web): the route table, with every URL the live site has today

URLs are frozen by the cutover spec, underscores and all. Unported routes
render a visible placeholder so navigation is complete and the gaps are
obvious. Unknown URLs get the 404 view — a soft 404 by design."
```

---

## Task 6: Layout — header, nav, footer, env ribbon

**Files:**
- Create: `web/src/components/Layout.tsx`, `web/src/components/EnvRibbon.tsx`, `web/src/components/Layout.test.tsx`
- Modify: `web/src/App.tsx`

- [x] **Step 1: Write the failing tests**

Create `web/src/components/Layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { EnvRibbon } from "./EnvRibbon";

test.each([
  ["test", true],
  ["qa", true],
  ["dev", true],
  ["prod", false],
])("env %s shows a ribbon: %s", (env, shown) => {
  render(
    <MemoryRouter>
      <EnvRibbon env={env} />
    </MemoryRouter>,
  );
  const ribbon = screen.queryByText(env.toUpperCase());
  expect(Boolean(ribbon)).toBe(shown);
});

test("an unknown env is treated as prod and shows nothing", () => {
  render(
    <MemoryRouter>
      <EnvRibbon env="something-else" />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("presentation")).toBeNull();
});
```

- [x] **Step 2: Run it to verify it fails, then implement the ribbon**

`web/src/components/EnvRibbon.tsx`:

```tsx
const NON_PROD = ["dev", "test", "qa"];

/**
 * The non-prod corner ribbon. An unknown or missing env is treated as PROD —
 * i.e. no ribbon — so the live site stays clean by default rather than by
 * configuration. That was the old App\Env behaviour and it is kept.
 */
export function EnvRibbon({ env }: { env: string }) {
  if (!NON_PROD.includes(env)) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-0 top-0 z-50 origin-top-right translate-x-1/4 translate-y-8 rotate-45 bg-canetons-red px-12 py-1 text-center text-sm font-bold tracking-wider text-white shadow"
    >
      {env.toUpperCase()}
    </div>
  );
}
```

- [x] **Step 3: Build the layout**

The nav's links and their **order** are taken verbatim from the deleted
`app/partials/navigation.php` (`git show dcd7862^:app/partials/navigation.php`
if you want to check). Note the order is not alphabetical and not the route
table's order — reproduce it exactly.

`web/src/components/Layout.tsx`:

```tsx
import { ExternalLink, Menu } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";
import { EnvRibbon } from "./EnvRibbon";

/**
 * Link set and order copied from app/partials/navigation.php. Not alphabetical,
 * not the route table's order — the band is used to this one.
 */
const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/commencement", label: "Commencer les Canetons" },
  { to: "/comite_teamdirection", label: "Contact Canetons" },
  { to: "/canetons", label: "Les canetons" },
  { to: "/moniteurs", label: "Moniteurs" },
  { to: "/planning_repet", label: "Planning et répétitions" },
  { to: "/sinscrire", label: "Inscriptions" },
  { to: "/cd", label: "CD" },
  { to: "/sponsors", label: "Sponsors et liens amis" },
  { to: "/historique", label: "Historique" },
];

/**
 * The two inscription sub-pages highlight the "Inscriptions" item, matching the
 * old setActiveNavigation() behaviour.
 */
const ALIASES: Record<string, string> = {
  "/inscriptions_admin": "/sinscrire",
  "/inscriptions_utilisateurs": "/sinscrire",
};

export function Layout() {
  const { config, user } = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = ALIASES[pathname] ?? pathname;

  return (
    <>
      <EnvRibbon env={config.env} />

      <header>
        <div className="flex items-center gap-4 px-4 py-3">
          <img
            src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
            alt="Logo"
            className="h-16 w-auto"
          />
          <h1 className="text-xl font-bold">Guggenmusik Les Canetons de Fribourg</h1>
        </div>

        <nav>
          <button
            type="button"
            aria-label="Menu de navigation"
            aria-expanded={open}
            aria-controls="nav-menu"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="m-2 md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <ul
            id="nav-menu"
            className={`${open ? "block" : "hidden"} md:flex md:flex-wrap md:gap-4 px-4 pb-3`}
          >
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setOpen(false)}
                  className={active === item.to ? "font-bold underline" : undefined}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              {/* External, so a plain anchor and not a NavLink. */}
              <a
                href="https://www.flickr.com/photos/201962767@N02/collections"
                target="_blank"
                rel="noreferrer"
              >
                Galerie <ExternalLink className="inline h-4 w-4 align-middle" />
              </a>
            </li>
            <li>
              <NavLink to="/multimedia" onClick={() => setOpen(false)}>
                Multimédia
              </NavLink>
            </li>
            <li>
              <NavLink to="/authentification_inscription" onClick={() => setOpen(false)}>
                {user ? user.username : "Connexion"}
              </NavLink>
            </li>
          </ul>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-12 border-t py-6 text-center text-sm text-gray-600">
        <p>
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. Tous droits
          réservés.
        </p>
      </footer>
    </>
  );
}
```

**Icons come from `lucide-react`** — the same icon set the old site used, as
React components instead of `<i data-lucide>` placeholders converted by a
`createIcons()` pass. Install it in Step 0 of this task:

```bash
npm install --save-dev lucide-react@^1.35
```

Import each icon by name; tree-shaking keeps only what is used, so there is no
central icon registry to maintain (the old `assets/js/icons.js` existed only
because the vanilla library needed one):

```tsx
import { ExternalLink, Menu } from "lucide-react";
```

and in the markup, `<Menu className="h-6 w-6" />` for the hamburger,
`<ExternalLink className="inline h-4 w-4 align-middle" />` after the Galerie
label. Sizes are Tailwind utilities now rather than the old `icon-md`/`icon-sm`
classes; keep to `h-4 w-4` for an icon inline in text and `h-6 w-6` for one that
is the whole control, which is what those two classes meant.

Do not set `fill` or `stroke`: Lucide icons are stroke-only and inherit
`currentColor`, so colour them on the parent as before.

- [x] **Step 3a: Wrap the routes in the layout**

In `web/src/routes.tsx`, nest every existing `<Route>` inside a layout route:

```tsx
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Placeholder title="Accueil" />} />
        {/* … every other route, unchanged … */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
```

- [x] **Step 4: Verify**

Run: `npm run test:web && npm run dev:mock`, then click every nav link and confirm each renders its placeholder and the ribbon says DEV.

- [x] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): layout with header, nav, footer and the env ribbon

The ribbon treats an unknown env as prod — no ribbon — so the live site stays
clean by default rather than by configuration, as App\\Env did."
```

---

## Task 7: Route guards

**Files:**
- Create: `web/src/components/guards.tsx`, `web/src/components/guards.test.tsx`

- [x] **Step 1: Write the failing tests**

The negative cases are the point: the matrix is not a hierarchy, so an admin must be refused `respond`.

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { RequireCapability } from "./guards";

const secret = <p>contenu réservé</p>;

test("a user may respond", async () => {
  setMockUser("demo.user");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(await screen.findByText("contenu réservé")).toBeInTheDocument();
});

test("an admin may NOT respond — the matrix is not a hierarchy", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(screen.queryByText("contenu réservé")).toBeNull();
});

test("a user may NOT manage events", async () => {
  setMockUser("demo.user");
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(screen.queryByText("contenu réservé")).toBeNull();
});

test("an admin may manage events", async () => {
  setMockUser("demo.admin");
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(await screen.findByText("contenu réservé")).toBeInTheDocument();
});

test("an anonymous visitor is sent to the login page, not shown a 403", async () => {
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(screen.queryByText("contenu réservé")).toBeNull();
});
```

`renderWithSession` comes from Task 4 Step 5a. Add its imports to this file:

```tsx
import { QueryClient } from "@tanstack/react-query";
```

is **not** needed — the harness owns the client.

- [x] **Step 2: Implement**

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import type { Capability } from "../session/capabilities";
import { useSession } from "../session/SessionProvider";

/**
 * UX only. Laravel's `capability:` middleware is the sole enforcement — these
 * guards decide what to SHOW, and a mistake here shows a wrong button, it does
 * not open a hole. An anonymous visitor is redirected to the login page; a
 * logged-in one without the capability is shown a refusal, because bouncing
 * them to a login form they are already past is confusing.
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { user, can } = useSession();

  if (!user) return <Navigate to="/authentification_inscription" replace />;
  if (!can(capability)) return <p role="alert">Accès refusé.</p>;

  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (!user) return <Navigate to="/authentification_inscription" replace />;
  return <>{children}</>;
}
```

- [x] **Step 3: Verify and commit**

Run: `npm run test:web`
Expected: PASS, 5 new tests including both negative cases.

```bash
git add web/src
git commit -m "feat(web): auth and capability route guards

Both negative cases are tested, because the matrix is not a hierarchy: an admin
must be refused `respond` and a user refused `manage_events`."
```

---

## Task 8: `/planning_repet` — the public list

**Files:**
- Create: `web/src/lib/date.ts`, `web/src/lib/date.test.ts`, `web/src/pages/PlanningRepet.tsx`, `web/src/pages/PlanningRepet.test.tsx`
- Modify: `web/src/routes.tsx`

Parity reference: `git show dcd7862^:app/assets/js/planning_repet.js` and
`git show dcd7862^:app/assets/css/planning_repet.css`.

- [x] **Step 1: French dates, with tests first**

`web/src/lib/date.test.ts`:

```ts
import { expect, test } from "vitest";

import { formatEventDate, formatEventDateRange } from "./date";

test("a date renders as a long French date", () => {
  expect(formatEventDate("2026-12-05")).toBe("samedi 5 décembre 2026");
});

test("a weekend renders as a range", () => {
  expect(formatEventDateRange("2026-11-14")).toBe(
    "samedi 14 novembre 2026 au dimanche 15 novembre 2026",
  );
});

test("a date string is parsed as a plain date, not shifted by the timezone", () => {
  // "2026-12-05" parsed as UTC midnight renders as the 4th in any negative
  // offset. The old app hit this and parsed local; keep that.
  expect(formatEventDate("2026-01-01")).toContain("1 janvier 2026");
});
```

`web/src/lib/date.ts`:

```ts
const LONG = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * Parses "YYYY-MM-DD" as a LOCAL date. `new Date("2026-12-05")` is UTC
 * midnight, which renders as the 4th anywhere west of Greenwich — a bug the old
 * app had to avoid too.
 */
function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

export function formatEventDate(iso: string): string {
  return LONG.format(parseLocalDate(iso));
}

/** A weekend event spans the given day and the next. */
export function formatEventDateRange(iso: string): string {
  const start = parseLocalDate(iso);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `${LONG.format(start)} au ${LONG.format(end)}`;
}
```

- [x] **Step 2: Write the failing page test**

```tsx
import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

test("the events are listed, oldest first, with their details", async () => {
  await renderWithSession(<PlanningRepet />);

  const items = await screen.findAllByRole("listitem");
  expect(items).toHaveLength(3);

  const first = within(items[0]!);
  expect(first.getByText("dimanche 20 septembre 2026")).toBeInTheDocument();
  expect(first.getByText(/Concert d’automne|Concert d'automne/)).toBeInTheDocument();
  expect(first.getByText("19:00")).toBeInTheDocument();
  expect(first.getByText("Salle communale")).toBeInTheDocument();
});

test("a weekend event shows a date range", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(
    await screen.findByText("samedi 14 novembre 2026 au dimanche 15 novembre 2026"),
  ).toBeInTheDocument();
});

test("an event with no attire omits the Tenue line entirely", async () => {
  await renderWithSession(<PlanningRepet />);
  const items = await screen.findAllByRole("listitem");
  expect(within(items[1]!).queryByText(/Tenue/)).toBeNull();
});

test("an anonymous visitor sees no admin controls", async () => {
  await renderWithSession(<PlanningRepet />);
  await screen.findAllByRole("listitem");
  expect(screen.queryByRole("button", { name: /Supprimer/ })).toBeNull();
  expect(screen.queryByRole("form")).toBeNull();
});
```

- [x] **Step 3: Run it to verify it fails, then implement the list**

```tsx
import { useEventIndex } from "../api/generated/endpoints";
import { formatEventDate, formatEventDateRange } from "../lib/date";
import { useSession } from "../session/SessionProvider";

/** "19:00:00" -> "19:00". The API returns SQL TIME; the old page sliced it too. */
const hhmm = (time: string) => time.slice(0, 5);

export function PlanningRepet() {
  const { can } = useSession();
  const events = useEventIndex();

  if (events.isPending) return <p>Chargement…</p>;
  if (events.isError) {
    return <p role="alert">Le planning n’a pas pu être chargé. Veuillez réessayer.</p>;
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Planning des prestations et des répétitions</h1>
      <h2 className="text-lg text-gray-600">sous réserve de modifications</h2>

      <ul className="mt-6 space-y-4">
        {events.data.data.map((event) => (
          <li key={event.id} className="relative rounded border p-4">
            <p className="font-bold">
              {event.weekend ? formatEventDateRange(event.date) : formatEventDate(event.date)}
            </p>
            <p>
              <strong>Titre :</strong> {event.title}
            </p>
            <p>
              <strong>Heure de début :</strong> {hhmm(event.startTime)}
            </p>
            <p>
              <strong>Heure de fin :</strong> {hhmm(event.endTime)}
            </p>
            <p>
              <strong>Lieu :</strong> {event.location}
            </p>
            {event.attire ? (
              <p>
                <strong>Tenue :</strong> {event.attire}
              </p>
            ) : null}
            {can("manage_events") ? <EventActions event={event} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`EventActions` arrives in Task 9. Stub it at the bottom of this file so the task stands on its own, and delete the stub when Task 9 adds the real one:

```tsx
// Replaced in Task 9. Present so this task's admin path renders nothing rather
// than failing to compile.
function EventActions(_props: { event: unknown }) {
  return null;
}
```

The API already orders by date, so there is no client-side sort. The old page re-sorted defensively; that is dropped deliberately, and the first test pins the order so a change in the API's ordering fails here.

- [x] **Step 4: Route it and verify**

Replace the `/planning_repet` placeholder in `web/src/routes.tsx` with `<PlanningRepet />`.

Run: `npm run test:web && npm run dev:mock`, then load http://localhost:5173/planning_repet.

- [x] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): port the planning list to React at parity

Dates are parsed as local, not UTC — \"2026-12-05\" as UTC midnight renders as
the 4th west of Greenwich. No client-side re-sort: the API orders by date and
a test pins it, so a change there fails here instead of being papered over."
```

---

## Task 9: `/planning_repet` — the admin form

**Files:**
- Create: `web/src/pages/EventActions.tsx`, `web/src/pages/EventForm.tsx`, `web/src/pages/EventForm.test.tsx`
- Modify: `web/src/pages/PlanningRepet.tsx`

- [ ] **Step 1: Write the failing tests**

`@testing-library/user-event` is not installed yet:

```bash
npm install --save-dev @testing-library/user-event@^14
```

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

test("an admin sees the form and the per-event controls", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByLabelText("Date :")).toBeInTheDocument();
  expect(await screen.findAllByRole("button", { name: "Supprimer" })).toHaveLength(3);
});

test("creating an event adds it to the list", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  await screen.findAllByRole("listitem");

  await userEvent.type(await screen.findByLabelText("Date :"), "2026-12-05");
  await userEvent.type(screen.getByLabelText("Titre :"), "Cortège");
  await userEvent.type(screen.getByLabelText("Heure de début :"), "14:00");
  await userEvent.type(screen.getByLabelText("Heure de fin :"), "17:00");
  await userEvent.type(screen.getByLabelText("Lieu :"), "Vieille-Ville");
  await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

  await waitFor(async () =>
    expect(await screen.findAllByRole("listitem")).toHaveLength(4),
  );
});

test("a validation error renders in French against the offending field", async () => {
  setMockUser("demo.admin");
  // Override the create handler for this test only: the mocked backend accepts
  // everything, and the point here is the error path.
  server.use(
    http.post("/api/events", () =>
      HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "startTime", reason: "required" }],
        },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  await userEvent.click(await screen.findByRole("button", { name: "Ajouter" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Le formulaire contient des erreurs.",
  );
  expect(screen.getByText("Heure de début est requis")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure de début :")).toHaveAttribute("aria-invalid", "true");
});

test("the submit button is disabled while the request is in flight", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  const submit = await screen.findByRole("button", { name: "Ajouter" });
  await userEvent.click(submit);
  expect(submit).toBeDisabled();
  await waitFor(() => expect(submit).toBeEnabled());
});
```

- [ ] **Step 2: Implement the form**

Create `web/src/pages/EventForm.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import {
  getEventIndexQueryKey,
  useEventStore,
  useEventUpdate,
} from "../api/generated/endpoints";
import type { EventRequest } from "../api/generated/model";
import { ApiError } from "../api/http";
import { translateApiError, type TranslatedError } from "../i18n";

export type EditableEvent = EventRequest & { id: number };

const EMPTY: EventRequest = {
  date: "",
  title: "",
  startTime: "",
  endTime: "",
  location: "",
  attire: "",
  weekend: false,
};

const FIELDS = [
  { name: "date", label: "Date :", type: "date", required: true },
  { name: "title", label: "Titre :", type: "text", required: true },
  { name: "startTime", label: "Heure de début :", type: "time", required: true },
  { name: "endTime", label: "Heure de fin :", type: "time", required: true },
  { name: "location", label: "Lieu :", type: "text", required: true },
  { name: "attire", label: "Tenue :", type: "text", required: false },
] as const;

/**
 * Create/edit form for an event. Admin-only — the caller gates it.
 *
 * `attire` is deliberately not required: a rehearsal with no dress code is
 * legitimate, and the API's EventRequest agrees.
 */
export function EventForm({
  editing,
  onDone,
}: {
  editing: EditableEvent | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<EventRequest>(EMPTY);
  const [error, setError] = useState<TranslatedError | null>(null);
  const queryClient = useQueryClient();

  // Fill the form when the list asks to edit an event, and clear it when the
  // edit is finished or cancelled.
  useEffect(() => {
    setValues(editing ? { ...editing } : EMPTY);
    setError(null);
  }, [editing]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });

  /**
   * The generated hooks type TError as the DECLARED error models, but what the
   * mutator actually throws is always an ApiError. Narrow with instanceof —
   * never trust the declared type here.
   */
  const onError = (thrown: unknown) => {
    setError(
      thrown instanceof ApiError
        ? translateApiError(thrown)
        : { message: "L’enregistrement a échoué. Veuillez réessayer.", fields: [] },
    );
  };

  const onSuccess = () => {
    setError(null);
    setValues(EMPTY);
    onDone();
    void refresh();
  };

  const create = useEventStore({ mutation: { onSuccess, onError } });
  const update = useEventUpdate({ mutation: { onSuccess, onError } });
  const pending = create.isPending || update.isPending;

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    if (editing) {
      update.mutate({ id: editing.id, data: values });
    } else {
      create.mutate({ data: values });
    }
  };

  const messageFor = (field: string) =>
    error?.fields.find((entry) => entry.field === field)?.message;

  return (
    <form onSubmit={submit} className="mt-8 space-y-3 rounded border p-4">
      {error ? (
        <p role="alert" className="text-canetons-red">
          {error.message}
        </p>
      ) : null}

      {FIELDS.map((field) => {
        const problem = messageFor(field.name);
        return (
          <div key={field.name}>
            <label htmlFor={`event-${field.name}`}>{field.label}</label>
            <input
              id={`event-${field.name}`}
              type={field.type}
              required={field.required}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `event-${field.name}-error` : undefined}
              value={(values[field.name] as string | null) ?? ""}
              onChange={(changeEvent) =>
                setValues((previous) => ({ ...previous, [field.name]: changeEvent.target.value }))
              }
              className={problem ? "border-canetons-red" : undefined}
            />
            {problem ? (
              <span id={`event-${field.name}-error`} className="block text-sm text-canetons-red">
                {problem}
              </span>
            ) : null}
          </div>
        );
      })}

      <div>
        <label htmlFor="event-weekend">Weekend</label>
        <input
          id="event-weekend"
          type="checkbox"
          checked={Boolean(values.weekend)}
          onChange={(changeEvent) =>
            setValues((previous) => ({ ...previous, weekend: changeEvent.target.checked }))
          }
        />
      </div>

      {/* Disabled for the duration, and re-enabled by the mutation settling
          either way — a slow network must never leave a legitimate retry
          permanently blocked. */}
      <button type="submit" disabled={pending}>
        {editing ? "Modifier" : "Ajouter"}
      </button>
      {editing ? (
        <button type="button" onClick={onDone} disabled={pending}>
          Annuler
        </button>
      ) : null}
    </form>
  );
}
```

`TranslatedError` is already exported from `web/src/i18n/index.ts` (Plan 1).

**The form keeps its values on failure** — `setValues` is not called in
`onError` — so the admin corrects and resubmits rather than retyping. That was
the old page's behaviour and it is deliberate.

- [ ] **Step 3: Implement the per-event controls**

Create `web/src/pages/EventActions.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";

import { getEventIndexQueryKey, useEventDestroy } from "../api/generated/endpoints";
import type { EditableEvent } from "./EventForm";

/**
 * Real <button>s, not the old page's click handlers on <span>s.
 *
 * That is a deliberate parity BREAK: the old controls were keyboard-unreachable
 * and unnamed to a screen reader. Everything else about the page reproduces the
 * old behaviour; this one does not, because reproducing it would mean shipping
 * an accessibility bug on purpose.
 */
export function EventActions({
  event,
  onEdit,
}: {
  event: EditableEvent;
  onEdit: (event: EditableEvent) => void;
}) {
  const queryClient = useQueryClient();
  const destroy = useEventDestroy({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() }),
      onError: () => window.alert("La suppression de l’événement a échoué. Veuillez réessayer."),
    },
  });

  return (
    <div className="absolute right-2 top-2 flex gap-2">
      <button type="button" onClick={() => onEdit(event)}>
        Modifier
      </button>
      <button
        type="button"
        disabled={destroy.isPending}
        onClick={() => {
          if (window.confirm("Êtes-vous sûr de vouloir supprimer cet événement?")) {
            destroy.mutate({ id: event.id });
          }
        }}
      >
        Supprimer
      </button>
    </div>
  );
}
```

- [ ] **Step 3a: Wire them into the page**

In `web/src/pages/PlanningRepet.tsx`, replace the Task 8 stub:

```tsx
  const [editing, setEditing] = useState<EditableEvent | null>(null);
```

render `<EventActions event={event} onEdit={setEditing} />` in place of the
stub, and after the `</ul>`:

```tsx
      {can("manage_events") ? (
        <EventForm editing={editing} onDone={() => setEditing(null)} />
      ) : null}
```

- [ ] **Step 4: Verify**

Run: `npm run test:web && npm run typecheck && npm run lint:js`
Then `npm run dev:mock` and exercise create, edit, delete and a validation error by hand as `demo.admin`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): admin create, edit and delete on the planning page

Field errors render in French against the offending input and the form keeps
its values, as the old page did. The per-event controls become real buttons
rather than click handlers on spans, which were keyboard-unreachable."
```

---

## Task 10: End-to-end smoke and final verification

**Files:**
- Create: `web/e2e/planning.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Point Playwright at the mocked dev server**

In `playwright.config.ts`, change `webServer.command` to `npx vite --mode mock --port 5173`, so the E2E run gets the mocked backend and needs no Docker.

- [ ] **Step 2: Write the spec**

```ts
import { expect, test } from "@playwright/test";

test("the planning page lists events", async ({ page }) => {
  await page.goto("/planning_repet");
  await expect(page.getByRole("heading", { name: /Planning des prestations/ })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(3);
});

test("an anonymous visitor sees no admin form", async ({ page }) => {
  await page.goto("/planning_repet");
  await expect(page.getByRole("listitem").first()).toBeVisible();
  await expect(page.getByLabel("Date :")).toHaveCount(0);
});

test("an unknown URL renders the SPA's 404 view", async ({ page }) => {
  await page.goto("/pas-une-page");
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});
```

- [ ] **Step 3: Run the whole suite**

```bash
npm run check
npm run test:e2e
npm run build
npm run dev && npm run smoke
docker compose exec -w /var/www/html/api-laravel web php artisan test
```
Expected: `check` green; E2E green; the artifact built; 13/13 smoke; 230 Laravel tests.

- [ ] **Step 4: Verify against the REAL API, not only the mocks**

The mocks cannot prove the contract. Run the stack, open http://localhost:5173/planning_repet (proxying to the real Laravel), and confirm:

- the list renders the seeded events;
- logging in as `demo.admin` shows the form, and create/edit/delete all persist across a reload;
- logging in as `demo.user` shows the list and **no** form;
- submitting an empty form renders French field errors.

A discrepancy between this and the mocked run means the mocks have drifted from the contract — fix the contract, not the mock.

- [ ] **Step 5: Commit**

```bash
git add web/e2e playwright.config.ts
git commit -m "test(web): end-to-end smoke for the planning page against the mocks"
```

- [ ] **Step 6: Do not merge**

Sixteen routes are still placeholders. `main` stays at `ffedf84` and TEST keeps serving today's site until they are ported. See spec §9.

---

## Notes for whoever executes this

- **The dev server in the `assets` container needs two env vars**, both set in
  docker-compose.yml and both discovered the hard way. `VITE_API_PROXY_TARGET`
  must be `http://web`: inside that container `localhost:8090` is the container
  itself, so the proxy answers 502 for every API call and the SPA looks broken
  with no clue why. `VITE_USE_POLLING=1` is needed because bind-mount
  filesystem events do not reach the container on Docker Desktop — without it
  an edit never triggers HMR and the page keeps serving the previous version,
  which reads as "my change did nothing".
- **Name any list the page renders** (`aria-label`). The layout's nav is also a
  list, so an unscoped `getByRole("listitem")` counts nav items too — four
  events came back as seventeen rows.
- **Text split across a `<strong>` label defeats `getByText`.** Assert on the
  row's `textContent`, and remember JSX keeps the space after `</strong>`.

- **The double `.data` is real.** `query.data.data` — TanStack Query's, then orval's envelope. Do not hide it behind a wrapper hook; hiding which is which is how the Task 1 defect went unnoticed.
- **Narrow errors with `instanceof ApiError`.** The generated `TError` is the declared error model, but the mutator always throws `ApiError`.
- **Never `fetch("/api/…")` directly** — CSRF priming lives in the mutator.
- **`npm run check` does not build** and does not run the Laravel suite; run both separately.
- **In Git Bash, prefix `docker compose exec` with `MSYS_NO_PATHCONV=1`.**
