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
  signups = structuredClone(SEED_SIGNUPS);
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

/**
 * The occasion, mirroring App\Support\Occasion exactly.
 *
 * It has to be exact: orval types every one of these as a STRING LITERAL
 * (Scramble read them off the PHP constants), so a paraphrase does not
 * compile. Copy from api/app/Support/Occasion.php when the real copy changes.
 */
const OCCASION = {
  title: "Souper des 25 ans des Canetons",
  subtitle: "Sortie du nouveau costume · Soirée guggen",
  date: "2027-11-13",
  dateDisplay: "13 novembre 2027",
  teaser:
    "Fêtez avec nous les 25 ans des Canetons ! Nouveau costume, un souper d'anniversaire et une soirée guggen.",
  invitation: "Amis et familles, réservez votre place et votre menu.",
  maxGuests: 30,
  menus: [
    {
      value: "meat",
      label: "Viande",
      description: "Rôti de bœuf, sauce aux morilles, gratin dauphinois et légumes de saison.",
      price: "CHF 45.–",
    },
    {
      value: "child",
      label: "Enfant",
      description: "Émincé de poulet, frites maison et compote.",
      price: "CHF 20.–",
    },
    {
      value: "vegetarian",
      label: "Végétarien",
      description: "Risotto aux champignons et légumes rôtis de saison.",
      price: "CHF 40.–",
    },
  ],
} as const;

/**
 * A REAL challenge, not a stub: `challenge` is the actual SHA-256 of
 * `salt + ANSWER`, so web/src/api/altcha.ts solves it exactly as it solves the
 * server's. A stub would make every mocked submission fail at the captcha and
 * read as a bug in the page.
 *
 * ANSWER is small so a test costs four digests. `maxnumber` stays 50000
 * because orval types it as that literal — it is only the upper bound, and the
 * solver returns at the first match.
 */
const ALTCHA_SALT = "mock-salt";
const ALTCHA_ANSWER = 3;

async function mockChallenge() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ALTCHA_SALT + ALTCHA_ANSWER),
  );
  return {
    algorithm: "SHA-256" as const,
    challenge: [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
    maxnumber: 50000 as const,
    salt: ALTCHA_SALT,
    signature: "mock-signature",
  };
}

type MockSignup = {
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  email: string;
  table_name: string;
  menus: string[];
};

/**
 * Three tables, one of them holding two reservations, and at least one zero in
 * every column — the admin page renders a zero as "–" and groups by table, and
 * neither is visible in a fixture where every cell is populated.
 */
const SEED_SIGNUPS: MockSignup[] = [
  {
    first_name: "Ada",
    last_name: "Lovelace",
    address: "Rue du Test 1, 1700 Fribourg",
    phone: "+41 79 000 00 01",
    email: "ada@example.com",
    table_name: "Famille Lovelace",
    menus: ["meat", "vegetarian"],
  },
  {
    first_name: "Alan",
    last_name: "Turing",
    address: "Rue du Test 2, 1700 Fribourg",
    phone: "+41 79 000 00 02",
    email: "alan@example.com",
    table_name: "Famille Lovelace",
    menus: ["meat"],
  },
  {
    first_name: "Grace",
    last_name: "Hopper",
    address: "Rue du Test 3, 1700 Fribourg",
    phone: "+41 79 000 00 03",
    email: "grace@example.com",
    table_name: "Amis du kiosque",
    menus: ["child", "vegetarian"],
  },
  {
    first_name: "Edsger",
    last_name: "Dijkstra",
    address: "Rue du Test 4, 1700 Fribourg",
    phone: "+41 79 000 00 04",
    email: "edsger@example.com",
    table_name: "Table du comité",
    menus: ["meat"],
  },
];

let signups: MockSignup[] = structuredClone(SEED_SIGNUPS);

const MENU_VALUES = ["meat", "child", "vegetarian"] as const;

/**
 * Mirrors App\Support\SignupStats::compute(), including first-seen grouping.
 *
 * The SORT is not part of compute() and is not decoration: the real
 * SignupController::index() orders `table_name, id` BEFORE calling compute(),
 * so first-seen order there IS alphabetical order. Without sorting here the
 * mock returns tables in seed-insertion order, and the mocked API quietly
 * disagrees with the real one about row order — the kind of divergence that
 * lets a suite go green against a lie.
 */
function computeSummary(unsorted: MockSignup[]) {
  const rows = [...unsorted].sort((a, b) => a.table_name.localeCompare(b.table_name));
  const zero = () => ({ meat: 0, child: 0, vegetarian: 0 });
  const menuTotals = zero();
  let totalPersons = 0;
  const tables: {
    name: string;
    personCount: number;
    menuCounts: ReturnType<typeof zero>;
    signups: unknown[];
  }[] = [];

  for (const row of rows) {
    const counts = zero();
    for (const menu of row.menus) {
      counts[menu as (typeof MENU_VALUES)[number]]++;
      menuTotals[menu as (typeof MENU_VALUES)[number]]++;
      totalPersons++;
    }
    let table = tables.find((entry) => entry.name === row.table_name);
    if (!table) {
      table = { name: row.table_name, personCount: 0, menuCounts: zero(), signups: [] };
      tables.push(table);
    }
    table.personCount += row.menus.length;
    for (const value of MENU_VALUES) table.menuCounts[value] += counts[value];
    table.signups.push({
      first_name: row.first_name,
      last_name: row.last_name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      personCount: row.menus.length,
      menuCounts: counts,
    });
  }

  return {
    totalPersons,
    totalTables: tables.length,
    menuTotals,
    tables,
    // snake_case date_display, as the real endpoint returns it — /api/config
    // camelCases the same field. Known asymmetry; see the design doc.
    occasion: {
      title: OCCASION.title,
      subtitle: OCCASION.subtitle,
      date: OCCASION.date,
      date_display: OCCASION.dateDisplay,
      teaser: OCCASION.teaser,
      invitation: OCCASION.invitation,
    },
  };
}

const overrides = [
  // NOT in the OpenAPI document — it is Sanctum's own route, outside /api — so
  // orval generates no handler for it. But http.ts primes it before every
  // mutating request, so without this every write in the mocked app fails on an
  // unhandled request. Found by the write tests below; they are the only reason
  // this is here.
  http.get("/sanctum/csrf-cookie", () => new HttpResponse(null, { status: 204 })),

  http.get("/api/config", () =>
    HttpResponse.json({ env: "dev", features: { souper_signup: true }, occasion: OCCASION }),
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

  http.get("/api/altcha", async () => HttpResponse.json(await mockChallenge())),

  // Hand-written because the generated handler always succeeds. The four
  // properties pinned here are the real endpoint's, IN ITS ORDER:
  // honeypot first (a trapped bot gets a plain 201 and learns nothing), then
  // validation, then the captcha, then the write.
  http.post("/api/signups", async ({ request }) => {
    const body = (await request.json()) as Partial<MockSignup> & {
      hp?: string;
      altcha?: string;
    };

    if ((body.hp ?? "").trim() !== "") {
      return HttpResponse.json({ ok: true }, { status: 201 });
    }

    const required: (keyof MockSignup)[] = [
      "first_name",
      "last_name",
      "address",
      "phone",
      "email",
      "table_name",
    ];
    // Typed explicitly, because `params` appears only on some entries — an
    // array inferred from the `required` map below would be {field, reason}
    // and reject the too_long push.
    const fields: { field: string; reason: string; params?: Record<string, unknown> }[] = required
      .filter((field) => String(body[field] ?? "").trim() === "")
      .map((field) => ({ field, reason: "required" }));

    // Laravel's max:255 (max:64 on phone), reported the same way here.
    //
    // `params.max` is NOT optional: web/src/i18n/fr.ts renders too_long as
    // "est trop long (maximum {{max}} caractères)", and i18next prints a
    // missing interpolation value LITERALLY — a mock without it puts a raw
    // {{max}} on screen, and the test asserting the French string fails in a
    // way that looks like a translation bug.
    for (const field of required) {
      const value = String(body[field] ?? "");
      const limit = field === "phone" ? 64 : 255;
      if (value.length > limit) {
        fields.push({ field, reason: "too_long", params: { max: limit } });
      }
    }

    const menus = Array.isArray(body.menus) ? body.menus : [];
    if (menus.length < 1 || menus.length > OCCASION.maxGuests) {
      fields.push({ field: "menus", reason: "invalid_format" });
    }

    if (fields.length > 0) {
      return HttpResponse.json(
        { error: "Invalid form submission", code: "validation_failed", fields },
        { status: 422 },
      );
    }

    if (!body.altcha) {
      return HttpResponse.json(
        { error: "Anti-bot verification failed", code: "captcha_failed", fields: [] },
        { status: 403 },
      );
    }

    signups = [...signups, { ...(body as MockSignup) }];
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  // view_summary is admin-only, mirrored here so the guards behave the same in
  // the mocked app as against the real API.
  http.get("/api/signups", ({ request }) => {
    if (!currentUser) return unauthenticated();
    if (currentUser.role !== "admin") return forbidden();
    if (new URL(request.url).searchParams.get("format") === "xlsx") {
      return new HttpResponse("mock-xlsx", {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    }
    return HttpResponse.json(computeSummary(signups));
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
