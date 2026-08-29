import { HttpResponse, http } from "msw";

import { getLesCanetonsAPIMock } from "../api/generated/endpoints.msw";
import type { ContactRequest } from "../api/generated/model";

/**
 * The mocked backend, so the SPA can be developed and tested with no Docker.
 *
 * The bulk is GENERATED from api/openapi.json, so it cannot describe a contract
 * the real API does not have. A handful are hand-written on top, because
 * generated faker data describes SHAPE and this project needs CONTENT: a page
 * laid out around "Lorem ipsum" tells you nothing about whether the real French
 * copy fits.
 *
 * Authentication is deliberately real rather than a dev-only role switcher:
 * POST /login accepts the same three seeded accounts the Docker stack has, and
 * GET /user reports whoever logged in. So the mocked app exercises the actual
 * login flow and the actual guards — a switcher would leave both untested.
 *
 * Note the aggregate's name, getLesCanetonsAPIMock: orval derives it from the
 * OpenAPI document's title, which is why tools/openapi.mjs pins APP_NAME. An
 * unpinned title renames this export between machines.
 */

type MockUser = { username: string; role: string };

const USERS: Record<string, MockUser> = {
  "demo.admin": { username: "demo.admin", role: "admin" },
  "demo.moderator": { username: "demo.moderator", role: "moderator" },
  "demo.user": { username: "demo.user", role: "user" },
};

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

/** Mirrors docker/db/init/02-seed.sql closely enough to judge a layout. */
const SEED: MockEvent[] = [
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

/**
 * The mocked session, persisted per tab.
 *
 * MSW's handlers run in the PAGE, not in the service worker, so module state
 * dies with every reload — and a mocked login therefore did not survive one,
 * while a real Sanctum session, being a cookie, does. That is mock drift from
 * the contract, not a harmless simplification: it made "log in, refresh, still
 * an admin" behave differently in the mocked app than against the real API.
 *
 * sessionStorage is the closest analogue available: scoped to one tab, gone
 * when the tab is, invisible to any other test or window. Reads and writes are
 * wrapped because it throws outright in a few contexts (a browser set to block
 * site data), where forgetting the session is the right fallback.
 */
const SESSION_KEY = "msw:user";

function readSession(): MockUser | null {
  try {
    const stored = globalThis.sessionStorage?.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as MockUser) : null;
  } catch {
    return null;
  }
}

function writeSession(user: MockUser | null): void {
  try {
    if (user) {
      globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      globalThis.sessionStorage?.removeItem(SESSION_KEY);
    }
  } catch {
    // Nothing to do: the session simply does not outlive this page.
  }
}

let currentUser: MockUser | null = readSession();
let events: MockEvent[] = structuredClone(SEED);

function setCurrentUser(user: MockUser | null): void {
  currentUser = user;
  writeSession(user);
}

/** Test seam: start a test from a known session. */
export function setMockUser(username: keyof typeof USERS | null): void {
  setCurrentUser(username ? (USERS[username] ?? null) : null);
}

/** Test seam: both mock stores are module state, so every test must reset them. */
export function resetMockState(): void {
  setCurrentUser(null);
  events = structuredClone(SEED);
}

const unauthenticated = () =>
  HttpResponse.json(
    { error: "Not authenticated", code: "not_authenticated", fields: [] },
    { status: 401 },
  );

/** Tied to the model, not retyped as a bare string[]: a field rename in
 * ContactRequest is a compile error here rather than a mock silently 422ing on
 * a field the API no longer has. */
const REQUIRED: (keyof ContactRequest)[] = ["lastName", "firstName", "email", "subject", "message"];

const overrides = [
  // NOT in the OpenAPI document — it is Sanctum's own route, outside /api — so
  // orval generates no handler for it. But http.ts primes it before every
  // mutating request, so without this every write in the mocked app fails on an
  // unhandled request. Found by the write tests below; they are the only reason
  // this is here.
  http.get("/sanctum/csrf-cookie", () => new HttpResponse(null, { status: 204 })),

  http.get("/api/config", () =>
    HttpResponse.json({ env: "dev", features: { souper_signup: false }, occasion: null }),
  ),

  http.get("/api/user", () => (currentUser ? HttpResponse.json(currentUser) : unauthenticated())),

  // Hand-written because the generated handler always succeeds, and the whole
  // point of a contact form is what it does when it does not. The required set
  // mirrors api/app/Http/Requests/ContactRequest.php exactly — including
  // `subject`, which the OLD HTML form did not mark required even though the
  // API always has.
  http.post("/api/contact", async ({ request }) => {
    const body = (await request.json()) as Partial<Record<keyof ContactRequest, string>>;
    // Laravel's `required` treats "0" as present and a whitespace-only string
    // as absent — the opposite of plain falsiness in both cases. `!body[field]`
    // used to disagree with the real API on exactly those two values.
    const missing = REQUIRED.filter((field) => (body[field] ?? "").trim() === "");
    if (missing.length > 0) {
      return HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: missing.map((field) => ({ field, reason: "required" })),
        },
        { status: 422 },
      );
    }
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/login", async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const user = body.username ? USERS[body.username] : undefined;
    if (!user || body.password !== "demo") {
      return HttpResponse.json(
        { error: "Incorrect username or password", code: "invalid_credentials", fields: [] },
        { status: 401 },
      );
    }
    setCurrentUser(user);
    return HttpResponse.json({ role: user.role });
  }),

  http.post("/api/logout", () => {
    setCurrentUser(null);
    return HttpResponse.json({ ok: true });
  }),

  http.get("/api/events", () => HttpResponse.json(events)),

  // The three writes below mirror the API's authorisation, not just its shape:
  // `manage_events` belongs to admin alone, so a mocked non-admin gets the same
  // 401/403 the real API would. Without that the guards would look correct in
  // the mocked app and fail against the real one.
  http.post("/api/events", async ({ request }) => {
    if (!currentUser) return unauthenticated();
    if (currentUser.role !== "admin") return forbidden();
    const body = (await request.json()) as Omit<MockEvent, "id" | "response">;
    events = [
      ...events,
      { ...body, id: Math.max(0, ...events.map((event) => event.id)) + 1, response: null },
    ];
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  http.put("/api/events/:id", async ({ params, request }) => {
    if (!currentUser) return unauthenticated();
    if (currentUser.role !== "admin") return forbidden();
    const body = (await request.json()) as Omit<MockEvent, "id" | "response">;
    const id = Number(params.id);
    events = events.map((event) => (event.id === id ? { ...event, ...body, id } : event));
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/events/:id", ({ params }) => {
    if (!currentUser) return unauthenticated();
    if (currentUser.role !== "admin") return forbidden();
    events = events.filter((event) => event.id !== Number(params.id));
    return HttpResponse.json({ ok: true });
  }),
];

function forbidden() {
  return HttpResponse.json(
    { error: "Access denied", code: "access_denied", fields: [] },
    { status: 403 },
  );
}

/**
 * Order matters: MSW uses the FIRST matching handler, so the hand-written ones
 * must come before the generated catch-alls.
 */
export const handlers = [...overrides, ...getLesCanetonsAPIMock()];
