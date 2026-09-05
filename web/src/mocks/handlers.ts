import { HttpResponse, http } from "msw";

import { getLesCanetonsAPIMock } from "../api/generated/endpoints.msw";
import type { AuthMe200, ContactRequest } from "../api/generated/model";

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
 * POST /login accepts the same three seeded accounts DevSeeder creates
 * (api/database/seeders/DevSeeder.php), and GET /me reports whoever logged in
 * with the same shape AuthController::me returns. So the mocked app exercises
 * the actual login flow and the actual guards — a switcher would leave both
 * untested.
 *
 * Note the aggregate's name, getLesCanetonsAPIMock: orval derives it from the
 * OpenAPI document's title, which is why tools/openapi.mjs pins APP_NAME. An
 * unpinned title renames this export between machines.
 *
 * During the R1a rebuild this file only covers what the API still has:
 * /api/config, /api/contact, and auth (/api/login, /api/logout, /api/me). The
 * event/signup/response/altcha handlers and the Occasion fixture that used to
 * live here modeled the domain Task 1 deleted; later tasks bring their mocked
 * replacements back alongside the real endpoints.
 */

// Tied to the generated model, not retyped by hand: a shape change in
// AuthController::me is a compile error here rather than a mock silently
// drifting from the real contract.
type MockUser = AuthMe200;

const USERS: Record<string, MockUser> = {
  // Organises, does not play — mirrors DevSeeder's demo.direction exactly.
  "demo.direction": {
    id: 1,
    username: "demo.direction",
    firstName: "Dominique",
    lastName: "Direction",
    isPlayer: false,
    mustChangePassword: false,
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
    ],
  },
  // Plays, organises nothing.
  "demo.player": {
    id: 2,
    username: "demo.player",
    firstName: "Perrine",
    lastName: "Player",
    isPlayer: true,
    mustChangePassword: false,
    permissions: [],
  },
  // BOTH — the case the old role matrix could not express: an organiser who
  // also plays. See DevSeeder's own comment for why this case matters.
  "demo.both": {
    id: 3,
    username: "demo.both",
    firstName: "Bastien",
    lastName: "Both",
    isPlayer: true,
    mustChangePassword: false,
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
    ],
  },
};

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

function setCurrentUser(user: MockUser | null): void {
  currentUser = user;
  writeSession(user);
}

/** Test seam: start a test from a known session. */
export function setMockUser(username: keyof typeof USERS | null): void {
  setCurrentUser(username ? (USERS[username] ?? null) : null);
}

/** Test seam: every mock store is module state, so every test must reset them all. */
export function resetMockState(): void {
  setCurrentUser(null);
}

const unauthenticated = () =>
  HttpResponse.json(
    { error: "Not authenticated", code: "not_authenticated", fields: [] },
    { status: 401 },
  );

/** Tied to the model, not retyped as a bare string[]: a field rename in
 * ContactRequest is a compile error here rather than a mock silently rejecting
 * a field the API no longer has. */
const REQUIRED: (keyof ContactRequest)[] = ["lastName", "firstName", "email", "subject", "message"];

const overrides = [
  // NOT in the OpenAPI document — it is Sanctum's own route, outside /api — so
  // orval generates no handler for it. But http.ts primes it before every
  // mutating request, so without this every write in the mocked app fails on an
  // unhandled request. Found by the write tests below; they are the only reason
  // this is here.
  http.get("/sanctum/csrf-cookie", () => new HttpResponse(null, { status: 204 })),

  // Mirrors App\Http\Controllers\Api\ConfigController exactly: `env` only.
  http.get("/api/config", () => HttpResponse.json({ env: "dev" })),

  http.get("/api/me", () => (currentUser ? HttpResponse.json(currentUser) : unauthenticated())),

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
        // 400, NOT Laravel's default 422: ApiError::validation() ends
        // `self::json(400, 'validation_failed', ...)` for every validation
        // failure in this API, and OpenApiDocumentTest pins it
        // ("422 is Laravel's default shape; this API does not use it").
        { status: 400 },
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
    // Deliberately no identity in this body — mirrors AuthController::login
    // exactly, which returns only {ok: true}: the client asks GET /api/me for
    // identity, so there is exactly one shape describing who you are.
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/logout", () => {
    setCurrentUser(null);
    return HttpResponse.json({ ok: true });
  }),
];

/**
 * Order matters: MSW uses the FIRST matching handler, so the hand-written ones
 * must come before the generated catch-alls.
 */
export const handlers = [...overrides, ...getLesCanetonsAPIMock()];
