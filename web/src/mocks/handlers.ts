import { HttpResponse, http } from "msw";

import type { ApiErrorField } from "../api/http";
import { getLesCanetonsAPIMock } from "../api/generated/endpoints.msw";
import type {
  AttendanceResource,
  AuthMe200,
  ChaseListEntryResource,
  ContactRequest,
  EventResource,
  MemberResource,
  RecordMemberAttendanceRequest,
  RecordOwnAttendanceRequest,
  RoleResource,
  SectionResource,
} from "../api/generated/model";

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
 * POST /login accepts the same five seeded accounts DevSeeder creates
 * (api/database/seeders/DevSeeder.php), and GET /me reports whoever logged in
 * with the same shape AuthController::me returns. So the mocked app exercises
 * the actual login flow and the actual guards — a switcher would leave both
 * untested.
 *
 * Note the aggregate's name, getLesCanetonsAPIMock: orval derives it from the
 * OpenAPI document's title, which is why tools/openapi.mjs pins APP_NAME. An
 * unpinned title renames this export between machines.
 *
 * During the R1a rebuild this file only covered what the API still had:
 * /api/v1/config, /api/v1/contact, and auth. R1b adds the roster — reference data,
 * /api/v1/members and the account password — and it is a real little backend
 * rather than a fixture dump: a screen that creates a member and then lists
 * them must see what it created, or the test is asserting against a fixture
 * instead of a flow. The event/signup/response/altcha handlers that used to
 * live here modeled the domain R1a deleted; R1c brings their replacements back
 * alongside the real endpoints.
 */

// Tied to the generated model, not retyped by hand: a shape change in
// AuthController::me is a compile error here rather than a mock silently
// drifting from the real contract.
type MockUser = AuthMe200;

const USERS = {
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
  // The `committee` role's single permission. Somebody has to hold it, or the
  // one screen it opens is never looked at — and it is the case that proves
  // the guards read a PERMISSION rather than "is this person privileged".
  "demo.committee": {
    id: 4,
    username: "demo.committee",
    firstName: "Camille",
    lastName: "Committee",
    isPlayer: true,
    mustChangePassword: false,
    permissions: ["registrations.view"],
  },
  // A FIRST LOGIN: a committee-issued password that must be replaced. A
  // session fixture with no roster row, deliberately — the five above mirror
  // DevSeeder, and what this one represents is a state of the SESSION. Its id
  // is outside the roster's range so it can never collide with a real row.
  "demo.mustchange": {
    id: 6,
    username: "demo.mustchange",
    firstName: "Marceau",
    lastName: "Nouveau",
    isPlayer: true,
    mustChangePassword: true,
    permissions: [],
  },
  // A young member whose parent uses the login on their behalf. Plays, holds
  // nothing.
  "demo.young": {
    id: 5,
    username: "demo.young",
    firstName: "Nadia",
    lastName: "Sansconnexion",
    isPlayer: true,
    mustChangePassword: false,
    permissions: [],
  },
} satisfies Record<string, MockUser>;

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

/** A valid ULID, so anything that validates the shape of one still passes. */
export const MOCK_REQUEST_ID = "01JB3K7QW8ZXMOCKMOCKMOCK00";

/**
 * The one place this mocked backend builds a failure, mirroring
 * App\Exceptions\ApiError::json() on the real one.
 *
 * It exists for the same reason that one does: an error shape assembled inline
 * at a dozen call sites drifts, and a mock that drifts from the server is worse
 * than no mock — it makes the SPA pass against a contract nothing serves.
 *
 * `instance` is optional here and it is the one member this mock does not always
 * fill. MSW resolvers that already destructure `request` pass a path; the rest
 * send an empty string. Nothing in the SPA reads it — it is in the contract for
 * a third party reading a log — so a faithful `type`, `code`, `errors` and
 * `requestId` matter and this one does not.
 */
export function problem(
  status: number,
  code: string,
  title: string,
  errors: ApiErrorField[] = [],
  instance = "",
) {
  return HttpResponse.json(
    {
      title,
      status,
      instance,
      code,
      errors,
      // Fixed, not random: a mocked screenshot or a snapshot that changed on
      // every run because of an identifier nobody asserts would be noise.
      requestId: MOCK_REQUEST_ID,
      // The real API sources this from App\Support\ErrorVocabulary by code.
      // The mock does not carry that list: nothing in the SPA reads `detail`,
      // and duplicating 21 English paragraphs here to satisfy a shape no screen
      // renders would be a second place for them to go stale.
      detail: `Mocked detail for ${code}.`,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

const unauthenticated = () => problem(401, "not_authenticated", "Not authenticated");

/* ------------------------------------------------------------------------ *
 * The roster
 * ------------------------------------------------------------------------ */

/**
 * The registers, mirroring the 2026_09_07_000001 migration EXACTLY — the band's
 * own order, ids in insertion order.
 *
 * A synthetic register list here would mean every mocked screenshot and every
 * component test showed a set of pupitres no server has, which is the one thing
 * a mocked screen is supposed to rule out.
 */
const SECTIONS: SectionResource[] = [
  { id: 1, name: "Batteurs", sortOrder: 1 },
  { id: 2, name: "Grosses-caisses", sortOrder: 2 },
  { id: 3, name: "Lyre", sortOrder: 3 },
  { id: 4, name: "Cloches", sortOrder: 4 },
  { id: 5, name: "Trompettes", sortOrder: 5 },
  { id: 6, name: "Trombones", sortOrder: 6 },
];

/**
 * The two roles the same migration seeds, with what each grants.
 *
 * No display name, deliberately (decision B6): the API is English without
 * exception, and the UI resolves the French from `key` through
 * web/src/i18n/fr.ts. A `label` here would let a screen render a name the real
 * API never sends.
 */
const ROLES: RoleResource[] = [
  {
    id: 1,
    key: "direction",
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
    ],
  },
  { id: 2, key: "committee", permissions: ["registrations.view"] },
];

/** The password the seeded accounts use, and so the one re-authentication takes. */
const ACTOR_PASSWORD = "demo";

/**
 * A FIXED value, deliberately. A random one would make a screenshot diff-noisy
 * and leave a test unable to assert what it shows. It still matches
 * App\Support\GeneratedPassword's shape — three groups of four, hyphenated,
 * drawn from an alphabet with every confusable character removed — which is
 * what the UI formats and what an administrator reads down the phone.
 */
const GENERATED_PASSWORD = "kanu-7rex-mp34";

/**
 * The seeded roster, mirroring DevSeeder, in ITS insertion order rather than
 * the order the screen shows: the real GET /api/v1/members sorts by name, so a
 * mock that stored them pre-sorted would hide a sorting bug in the endpoint's
 * mocked stand-in and in any screen that re-sorted them itself.
 *
 * EVERY MEMBER HAS AN ACCOUNT (2026_09_08_000001). There is no
 * person-without-a-login row here, because there can be none in the database:
 * people the band merely displays are content, not members.
 *
 * A function, not a constant, so resetRoster() hands out a fresh clone each
 * time. A shared array would let one test's edit reach the next.
 */
function initialMembers(): MemberResource[] {
  return [
    {
      id: 1,
      firstName: "Dominique",
      lastName: "Direction",
      username: "demo.direction",
      mustChangePassword: false,
      // The one non-null lastLoginAt, so the roster renders BOTH branches —
      // "last seen" and "never". DevSeeder leaves the column null, but the
      // column is written by logging in and no endpoint can set it, so a mock
      // that mirrored the seeder byte-for-byte would leave the populated branch
      // unrenderable. A fixed instant, for the same reason the password is
      // fixed: a moving one makes every screenshot differ.
      lastLoginAt: "2026-09-01T19:30:00+02:00",
      // Organises, does not play — so never in an attendance list.
      sectionId: null,
      sectionName: null,
      isPlayer: false,
      committeeTitle: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [1],
    },
    {
      id: 2,
      firstName: "Perrine",
      lastName: "Player",
      username: "demo.player",
      mustChangePassword: false,
      lastLoginAt: null,
      sectionId: 4,
      sectionName: "Cloches",
      isPlayer: true,
      committeeTitle: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [],
    },
    {
      // BOTH — plays and organises. The case the old either/or role matrix
      // could not express; if someone reintroduces one, this row is what breaks.
      id: 3,
      firstName: "Bastien",
      lastName: "Both",
      username: "demo.both",
      mustChangePassword: false,
      lastLoginAt: null,
      sectionId: 5,
      sectionName: "Trompettes",
      isPlayer: true,
      committeeTitle: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [1],
    },
    {
      id: 4,
      firstName: "Camille",
      lastName: "Committee",
      username: "demo.committee",
      mustChangePassword: false,
      lastLoginAt: null,
      sectionId: 6,
      sectionName: "Trombones",
      isPlayer: true,
      committeeTitle: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [2],
    },
    {
      // Their parent uses the login on their behalf, so the account is used —
      // just not by the member.
      id: 5,
      firstName: "Nadia",
      lastName: "Sansconnexion",
      username: "demo.young",
      mustChangePassword: false,
      lastLoginAt: null,
      sectionId: 1,
      sectionName: "Batteurs",
      isPlayer: true,
      committeeTitle: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [],
    },
  ];
}

/**
 * MUTABLE MODULE STATE, reset by resetMockState() between tests — the same
 * pattern as the mocked session above, and for the same reason.
 */
let members: MemberResource[] = initialMembers();

/** The next id, mirroring an auto-increment: never reuses a deleted one. */
let nextMemberId = 6;

function resetRoster(): void {
  members = initialMembers();
  nextMemberId = 6;
}

function sectionOf(sectionId: number | null): string | null {
  return SECTIONS.find((section) => section.id === sectionId)?.name ?? null;
}

/**
 * Mirrors `auth:sanctum` + `permission:<permission>`, so the SPA's guards are
 * exercised rather than assumed: 401 when nobody is logged in, 403 when they
 * are but do not hold it — the split the real routes get by pairing the two
 * middlewares, and the reason an anonymous caller is not told the endpoint
 * exists at all.
 *
 * Takes the permission rather than hard-coding one, because the planning is
 * gated on `events.manage` and a near-copy of this function is how the two
 * would drift: the 401-before-403 ordering is the part that matters and it
 * should exist once.
 *
 * Returns the refusal, or null when the caller may proceed.
 */
function refuseWithout(permission: string) {
  if (!currentUser) {
    return unauthenticated();
  }
  if (!currentUser.permissions.includes(permission)) {
    return problem(403, "access_denied", "Access denied");
  }
  return null;
}

const refuseWithoutMembersManage = () => refuseWithout("members.manage");

/** Route-model binding's own answer for an id nothing matches. */
const notFound = () => problem(404, "not_found", "Not found");

/* ------------------------------------------------------------------------ *
 * Collections
 * ------------------------------------------------------------------------ */

/** The default and the cap the real App\Support\Page applies. */
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

/**
 * One collection, enveloped and paged the way the real API does it.
 *
 * The mocked backend earns its keep by REFUSING and RESHAPING the way the real
 * one does — that is why it already mirrors 401 against 403, `already_taken`
 * and the self-demotion guard. An envelope is the same kind of fact: a handler
 * still answering a bare array would let every screen typecheck against a shape
 * the server stopped sending, and the component tests would agree with the mock
 * rather than with the API.
 *
 * The clamping is mirrored too, nonsense included, because "a bad `limit` is
 * ignored rather than refused" is a behaviour a screen may one day depend on
 * and there is nowhere else for it to be exercised in the browser.
 */
function collection<T>(rows: T[], request: Request, status = 200): Response {
  const query = new URL(request.url).searchParams;

  const whole = (value: string | null, fallback: number, min: number, max: number): number => {
    const parsed = value !== null && /^-?\d+$/.test(value) ? Number(value) : NaN;
    return Number.isNaN(parsed) ? fallback : Math.max(min, Math.min(max, parsed));
  };

  const limit = whole(query.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = whole(query.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const total = rows.length;

  // Relative, like the real Link header: path and query, no scheme or host.
  const url = new URL(request.url);
  const at = (start: number): string => {
    const link = new URL(url);
    link.searchParams.set("limit", String(limit));
    link.searchParams.set("offset", String(start));
    return `<${link.pathname}${link.search}>`;
  };

  const links = [`${at(0)}; rel="first"`];
  if (offset > 0) {
    links.push(`${at(Math.max(0, offset - limit))}; rel="prev"`);
  }
  if (offset + limit < total) {
    links.push(`${at(offset + limit)}; rel="next"`);
  }
  links.push(`${at(total === 0 ? 0 : Math.floor((total - 1) / limit) * limit)}; rel="last"`);

  return HttpResponse.json(
    { data: rows.slice(offset, offset + limit), meta: { total, limit, offset } },
    // The Link header goes on reads only, matching the middleware: a
    // `rel="next"` on a URL you would have to POST or PUT again is not a link
    // anybody should follow.
    status === 200 ? { headers: { Link: links.join(", ") } } : { status },
  );
}

/* ------------------------------------------------------------------------ *
 * Conditional writes
 * ------------------------------------------------------------------------ */

/**
 * The ETag the real API hands out, modelled well enough to be wrong about.
 *
 * NOT the server's algorithm and it must not be: the real tag is a sha256 of
 * the rendered Resource (App\Support\EntityTag) and a mock reproducing it
 * would be asserting that two hashes agree, which nothing in the SPA depends
 * on. What the SPA depends on is that a tag CHANGES when the thing changes and
 * that a write without one is refused, and a cheap deterministic hash models
 * both. FNV-1a because jsdom has no synchronous crypto digest.
 */
export function mockEntityTag(state: unknown): string {
  const json = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index++) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `"${hash.toString(16).padStart(8, "0")}"`;
}

/**
 * The refusal a conditional write earns, or null to let it through.
 *
 * WITHOUT THIS THE MOCKED BACKEND WOULD ACCEPT WHAT THE REAL ONE REFUSES, and
 * every test of the roster would pass against a screen that cannot save
 * anything — which is exactly the class of defect the mocks exist to catch.
 * Mirrors App\Http\Middleware\ConditionalWrite: 428 for an absent header,
 * 412 for one naming a state the thing has left, strong comparison, and `*`
 * matching anything that exists.
 */
/**
 * An event's state with the caller's own answer taken out.
 *
 * `myAttendance` is the CALLER's answer and nobody else's, so a tag computed
 * over it would differ between two committee members looking at the same event
 * — and a member answering an event would invalidate their own pending edit of
 * it. The real API gets this for free by rendering the Resource with no
 * relations loaded; here it has to be said.
 */
function withoutMyAttendance(event: EventResource): Omit<EventResource, "myAttendance"> {
  const state = { ...event };
  delete (state as Partial<EventResource>).myAttendance;
  return state;
}

function refuseWithoutIfMatch(request: Request, current: string) {
  const header = request.headers.get("If-Match");

  if (header === null || header.trim() === "") {
    return problem(428, "if_match_required", "If-Match is required on this request");
  }

  if (header.trim() === "*") {
    return null;
  }

  const quoted = header.split(",").map((candidate) => candidate.trim());

  return quoted.includes(current)
    ? null
    : problem(412, "if_match_failed", "The If-Match header does not match the current state");
}

/**
 * Mirrors App\Support\AccessIntegrity: 409, not 403 — the caller HAS the
 * permission, the request conflicts with the state of the system.
 */
function conflict(code: string, title: string) {
  return problem(409, code, title);
}

/** True when removing these members would leave nobody holding members.manage. */
function wouldOrphanAdministration(excludedMemberIds: number[]): boolean {
  return !members.some(
    (member) =>
      !excludedMemberIds.includes(member.id) &&
      member.roleIds.some((roleId) =>
        ROLES.find((role) => role.id === roleId)?.permissions.includes("members.manage"),
      ),
  );
}

/**
 * An instant this many days from now, at a Fribourg wall-clock time.
 *
 * RELATIVE TO NOW, NEVER FIXED. A seeded season written as literal dates falls
 * into the past the moment it is a month old, and `/events` then renders empty
 * for every future reader — including every screenshot and every demo.
 */
function at(dayOffset: number, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const when = new Date();
  when.setDate(when.getDate() + dayOffset);
  when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return when.toISOString();
}

/**
 * The seeded planning, mirroring the real season recorded in the R1c spec §1
 * rather than inventing one: Saturday rehearsals at the Werkhof, the Christmas
 * one that runs an hour long, the two-day musical weekend, a gig, and one
 * rehearsal already past.
 *
 * SIX EVENTS, so the count is assertable. Five upcoming and one past, which is
 * what gives `?past=1` something to return and keeps the default list from
 * being the whole store.
 */
function initialEvents(): EventResource[] {
  return [
    {
      id: 1,
      title: "Répétition",
      startsAt: at(7, "10:00"),
      endsAt: at(7, "12:00"),
      location: "Werkhof",
      attire: "Libre",
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
    {
      id: 2,
      title: "Répétition",
      startsAt: at(14, "10:00"),
      endsAt: at(14, "12:00"),
      location: "Werkhof",
      attire: "Libre",
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
    {
      id: 3,
      title: "Répétition + apéritif de Noël",
      startsAt: at(21, "10:00"),
      endsAt: at(21, "13:00"),
      location: "Werkhof",
      attire: "Libre",
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
    {
      // The two-day case, which is the whole reason `ends_at` is a datetime
      // rather than a time beside a `weekend` boolean (C6).
      id: 4,
      title: "Weekend musical",
      startsAt: at(28, "09:00"),
      endsAt: at(29, "16:00"),
      location: "Campus, Lac Noir",
      attire: "Libre",
      isPublic: false,
      notes: "Repas et logement compris.",
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
    {
      // The missing-attire case: the card has to render without one.
      id: 5,
      title: "Vendanges Cheyres",
      startsAt: at(35, "11:00"),
      endsAt: at(35, "16:30"),
      location: "Cheyres",
      attire: null,
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
    {
      // The only past one.
      id: 6,
      title: "Répétition",
      startsAt: at(-7, "10:00"),
      endsAt: at(-7, "12:00"),
      location: "Werkhof",
      attire: "Libre",
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
    },
  ];
}

let events: EventResource[] = initialEvents();

/** Mirrors an auto-increment: never reuses a deleted id. */
let nextEventId = 7;

function resetEvents(): void {
  events = initialEvents();
  nextEventId = 7;
}

/* ------------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------------ */

/** C12's undo window, in milliseconds: AttendanceIntegrity::UNDO_WINDOW_MINUTES. */
const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * The answers, keyed by event and member.
 *
 * A MAP RATHER THAN A FIELD ON THE EVENT, because `myAttendance` is the
 * caller's own answer and nobody else's: one event carries a different one per
 * member, so keeping it on the row would show Perrine's answer to Bastien. The
 * events store holds `myAttendance: null` and every read projects the caller's
 * answer onto the copy it hands out.
 */
const answers = new Map<string, AttendanceResource>();

function answerKey(eventId: number, memberId: number): string {
  return `${eventId}:${memberId}`;
}

/**
 * An instant far enough back that C12's undo window has closed.
 *
 * Seeded answers are SETTLED on purpose. Recorded "just now" every one of them
 * would offer an undo, and the five-minute window — the rule that keeps C11
 * from being decorative — would never be seen in the state it spends its life
 * in.
 */
function settledAt(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

/**
 * The seeded answers, all against event 1 — the next rehearsal, and so the
 * event the chase list is read about.
 *
 * One of each state the screen has to render: a yes, a no carrying the reason
 * C11 collects, an answer the direction entered on somebody's behalf, and a
 * member nobody has heard from. That last one is Bastien, who is therefore
 * also the row an on-behalf write is aimed at.
 */
function resetAnswers(): void {
  answers.clear();
  answers.set(answerKey(1, 2), {
    status: "yes",
    note: null,
    recordedByDirection: false,
    recordedAt: settledAt(),
  });
  answers.set(answerKey(1, 4), {
    status: "no",
    note: "Malade",
    recordedByDirection: false,
    recordedAt: settledAt(),
  });
  answers.set(answerKey(1, 5), {
    status: "yes",
    note: "Son papa a téléphoné",
    recordedByDirection: true,
    recordedAt: settledAt(),
  });
}

resetAnswers();

/** The caller's own answer for an event, or null when they have not given one. */
function myAnswerFor(eventId: number): AttendanceResource | null {
  if (!currentUser) {
    return null;
  }
  return answers.get(answerKey(eventId, currentUser.id)) ?? null;
}

/** One event as the caller sees it: the stored row plus their own answer. */
function withMyAttendance(event: EventResource): EventResource {
  return { ...event, myAttendance: myAnswerFor(event.id) };
}

/**
 * The refusal for somebody who is in no register.
 *
 * A 403 that is NOT about a missing permission — there is none for answering —
 * which is why it carries its own code rather than `access_denied`. Dominique
 * Direction is the case: she organises and plays nothing.
 */
const notAnswerable = () =>
  problem(
    403,
    "not_answerable",
    "This member is not in a register and is not answerable for events",
  );

/**
 * The API's `endsAt`-after-`startsAt` refusal, in the shape ApiError renders.
 * Returns the refusal, or null when the pair is fine.
 */
function refuseIfEndsBeforeStart(startsAt: string, endsAt: string) {
  if (Date.parse(endsAt) > Date.parse(startsAt)) {
    return null;
  }
  return problem(400, "validation_failed", "Invalid form submission", [
    { field: "endsAt", reason: "must_be_after" },
  ]);
}

/** Test seam: every mock store is module state, so every test must reset them all. */
export function resetMockState(): void {
  setCurrentUser(null);
  resetRoster();
  // Dropping this line fails tests only when the WHOLE FILE runs, which reads
  // as flakiness and is not — R1b proved it on the roster store.
  resetEvents();
  resetAnswers();
}

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
  // The calendar flag is ON here and off on every real server, which is the
  // point of a mocked backend: until somebody has looked at the calendar on
  // TEST, this is the only place it can be looked at at all.
  http.get("/api/v1/config", () => HttpResponse.json({ env: "dev", features: { calendar: true } })),

  http.get("/api/v1/me", () => (currentUser ? HttpResponse.json(currentUser) : unauthenticated())),

  // Hand-written because the generated handler always succeeds, and the whole
  // point of a contact form is what it does when it does not. The required set
  // mirrors api/app/Http/Requests/ContactRequest.php exactly — including
  // `subject`, which the OLD HTML form did not mark required even though the
  // API always has.
  http.post("/api/v1/contact", async ({ request }) => {
    const body = (await request.json()) as Partial<Record<keyof ContactRequest, string>>;
    // Laravel's `required` treats "0" as present and a whitespace-only string
    // as absent — the opposite of plain falsiness in both cases. `!body[field]`
    // used to disagree with the real API on exactly those two values.
    const missing = REQUIRED.filter((field) => (body[field] ?? "").trim() === "");
    if (missing.length > 0) {
      // 400, NOT Laravel's default 422: ApiError::validation() ends
      // `self::json(400, 'validation_failed', ...)` for every validation
      // failure in this API, and OpenApiDocumentTest pins it
      // ("422 is Laravel's default shape; this API does not use it").
      return problem(
        400,
        "validation_failed",
        "Invalid form submission",
        missing.map((field) => ({ field, reason: "required" })),
      );
    }
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/v1/login", async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    // Unlike setMockUser's test seam, this handler stands in for a real login
    // request: the username is untyped input from the request body, so it is
    // deliberately looked up against USERS as a plain string-indexed record
    // rather than against the literal key union `satisfies` gives USERS.
    const user = body.username ? (USERS as Record<string, MockUser>)[body.username] : undefined;
    if (!user || body.password !== "demo") {
      return problem(401, "invalid_credentials", "Incorrect username or password");
    }
    setCurrentUser(user);
    // Deliberately no identity in this body — mirrors AuthController::login
    // exactly, which returns only {ok: true}: the client asks GET /api/v1/me for
    // identity, so there is exactly one shape describing who you are.
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/v1/logout", () => {
    setCurrentUser(null);
    return HttpResponse.json({ ok: true });
  }),

  /* ---------------------------------------------------------------------- *
   * The roster. Every one of these mirrors a refusal the real API makes, so
   * the screens' guards are exercised rather than assumed.
   * ---------------------------------------------------------------------- */

  http.get(
    "/api/v1/sections",
    ({ request }) => refuseWithoutMembersManage() ?? collection(SECTIONS, request),
  ),

  http.get(
    "/api/v1/roles",
    ({ request }) => refuseWithoutMembersManage() ?? collection(ROLES, request),
  ),

  // Ordered by name, like the real endpoint: this screen is scanned for a
  // person, and a mock answering in insertion order would hide a sorting bug.
  http.get("/api/v1/members", ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const ordered = [...members].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    return collection(ordered, request);
  }),

  // ONE PERSON, and the read every conditional write on the roster starts
  // from. The roster list above hands out no tag, deliberately, so a screen
  // that edited straight from a list row would be refused with 428.
  http.get("/api/v1/members/:id", ({ params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const member = members.find((row) => row.id === Number(params.id));
    if (!member) {
      return notFound();
    }
    return HttpResponse.json(member, { headers: { ETag: mockEntityTag(member) } });
  }),

  // Creating a person creates an ACCOUNT and mints its password, returned once.
  // IT GRANTS NO ROLES — the real API does not either, and a mock that did
  // would hide the second, separately-guarded step from every test.
  http.post("/api/v1/members", async ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const body = (await request.json()) as Partial<MemberResource>;

    // Mirrors StoreMemberRequest's `unique:members,username`. The rule the
    // screen most needs a mock for: a duplicate has to land on the username
    // field, in French, without closing the form the administrator is typing in.
    if (members.some((member) => member.username === body.username)) {
      return problem(400, "validation_failed", "Invalid form submission", [
        { field: "username", reason: "already_taken" },
      ]);
    }

    const member: MemberResource = {
      id: nextMemberId++,
      firstName: body.firstName ?? "",
      lastName: body.lastName ?? "",
      username: body.username ?? "",
      // A password an administrator read down the phone is not a secret worth
      // keeping, so the real API forces a change. Mirrored here.
      mustChangePassword: true,
      lastLoginAt: null,
      sectionId: body.sectionId ?? null,
      sectionName: sectionOf(body.sectionId ?? null),
      isPlayer: (body.sectionId ?? null) !== null,
      committeeTitle: body.committeeTitle ?? null,
      instructorOfSectionId: body.instructorOfSectionId ?? null,
      publicVisible: body.publicVisible ?? false,
      roleIds: [],
    };
    members.push(member);
    return HttpResponse.json({ member, generatedPassword: GENERATED_PASSWORD }, { status: 201 });
  }),

  http.patch("/api/v1/members/:id", async ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const index = members.findIndex((member) => member.id === Number(params.id));
    // Reading the row IS the existence check: noUncheckedIndexedAccess types
    // members[index] as possibly undefined, and findIndex's -1 lands there too.
    const existing = members[index];
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    const body = (await request.json()) as Partial<MemberResource>;
    // PATCH, so spread over what is there: a form posting only the field it
    // changed must not blank the others.
    //
    // An ALLOW-LIST, not a blanket spread, because Laravel's validated()
    // returns only the fields UpdateMemberRequest declares rules for and
    // silently drops the rest. A mock that applied everything would let a
    // screen appear to change roleIds, username's uniqueness, or the id itself
    // here — and then do nothing at all against the real API.
    const editable = [
      "firstName",
      "lastName",
      "username",
      "sectionId",
      "committeeTitle",
      "instructorOfSectionId",
      "publicVisible",
    ] as const;
    const updated = { ...existing };
    for (const field of editable) {
      // in, not a truthiness test: clearing a register is an explicit null,
      // which the real request accepts and `body.sectionId ?? existing` would
      // silently discard.
      if (field in body) {
        Object.assign(updated, { [field]: body[field] });
      }
    }
    // Both are DERIVED from section_id in the real Resource, so they can never
    // disagree with it. Recomputing them is what keeps that true here.
    updated.sectionName = sectionOf(updated.sectionId);
    updated.isPlayer = updated.sectionId !== null;
    members[index] = updated;
    // The tag of what the write just produced, so a second edit needs no read
    // in between — which is what Members.tsx chains the roles call onto.
    return HttpResponse.json(updated, { headers: { ETag: mockEntityTag(updated) } });
  }),

  // Mirrors AccessIntegrity, INCLUDING its ordering: orphaning administration
  // outranks self-deletion when both apply, because it is the more informative
  // refusal. Without these the mocked app would let flows through that the real
  // API answers 409 to.
  http.delete("/api/v1/members/:id", ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const id = Number(params.id);
    const index = members.findIndex((member) => member.id === id);
    // Reading the row IS the existence check: noUncheckedIndexedAccess types
    // members[index] as possibly undefined, and findIndex's -1 lands there too.
    const existing = members[index];
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    if (wouldOrphanAdministration([id])) {
      return conflict(
        "cannot_remove_last_administrator",
        "This is the last member who can administer members",
      );
    }
    if (currentUser?.id === id) {
      return conflict("cannot_delete_self", "A member cannot delete their own account");
    }
    members.splice(index, 1);
    return HttpResponse.json({ ok: true, sessionsEnded: 1 });
  }),

  // Replacing roles is PUT, not PATCH: roleIds is the complete set, and an
  // "add this one" API cannot express removal — which is the half the
  // invariants exist for.
  http.put("/api/v1/members/:id/roles", async ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const id = Number(params.id);
    const index = members.findIndex((member) => member.id === id);
    // Reading the row IS the existence check: noUncheckedIndexedAccess types
    // members[index] as possibly undefined, and findIndex's -1 lands there too.
    const existing = members[index];
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    const body = (await request.json()) as { roleIds?: number[] };
    const roleIds = body.roleIds ?? [];
    const keepsAdministration = roleIds.some((roleId) =>
      ROLES.find((role) => role.id === roleId)?.permissions.includes("members.manage"),
    );
    // Same priority as the delete above, and for the same reason.
    if (!keepsAdministration && wouldOrphanAdministration([id])) {
      return conflict(
        "cannot_remove_last_administrator",
        "This is the last member who can administer members",
      );
    }
    if (currentUser?.id === id && !keepsAdministration) {
      return conflict(
        "cannot_demote_self",
        "A member cannot remove their own member administration",
      );
    }
    const member = { ...existing, roleIds };
    members[index] = member;
    return HttpResponse.json(
      { member, sessionsEnded: 1 },
      { headers: { ETag: mockEntityTag(member) } },
    );
  }),

  http.post("/api/v1/members/:id/password", ({ params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const index = members.findIndex((member) => member.id === Number(params.id));
    // Reading the row IS the existence check: noUncheckedIndexedAccess types
    // members[index] as possibly undefined, and findIndex's -1 lands there too.
    const existing = members[index];
    if (!existing) {
      return notFound();
    }
    members[index] = { ...existing, mustChangePassword: true };
    return HttpResponse.json({ generatedPassword: GENERATED_PASSWORD, sessionsEnded: 1 });
  }),

  // The ONE endpoint that still re-authenticates (decision B7). Knowing the
  // current password is this operation's own input, not ceremony: without it a
  // borrowed, unlocked phone locks the real owner out of their own account.
  http.post("/api/v1/me/password", async ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    // Mirrors AccountPasswordRequest's `min:8`, and its rule ORDER: the
    // current password is verified first, so a wrong one is reported as
    // reauth_failed rather than being masked by a length complaint.
    //
    // params.min is REQUIRED, not decorative: 'too_short' interpolates {{min}},
    // and i18next prints a missing interpolation value literally — a mock that
    // omitted it would let a screen ship reading "minimum {{min}} caractères".
    if (body.currentPassword !== ACTOR_PASSWORD) {
      return problem(403, "reauth_failed", "Password confirmation failed");
    }
    if ((body.newPassword ?? "").length < 8) {
      return problem(400, "validation_failed", "Invalid form submission", [
        { field: "newPassword", reason: "too_short", params: { min: 8 } },
      ]);
    }
    setCurrentUser({ ...currentUser, mustChangePassword: false });
    // Their roster row carries the same flag, so the screen that lists it
    // agrees with the session the moment the change lands.
    members = members.map((member) =>
      member.id === currentUser?.id ? { ...member, mustChangePassword: false } : member,
    );
    return HttpResponse.json({ ok: true, sessionsEnded: 1 });
  }),
  // THE PLANNING. Reading it needs no permission — everybody in the band needs
  // to know when the next rehearsal is — so this one is gated on nothing but
  // being logged in, exactly like the real route.
  http.get("/api/v1/events", ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }

    // The split is on the START OF TODAY, not on now: a rehearsal that began
    // an hour ago stays in the planning of somebody running late. Mirrors
    // EventController::index and BandTime::startOfToday.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const boundary = startOfToday.getTime();

    // Anything that is not exactly '1' is the default upcoming view, the same
    // fail-safe direction the real endpoint takes: a truncated or misspelled
    // value must never be the one that hides events.
    const past = new URL(request.url).searchParams.get("past") === "1";

    const planning = events
      .filter((event) =>
        past ? Date.parse(event.startsAt) < boundary : Date.parse(event.startsAt) >= boundary,
      )
      .sort((a, b) =>
        past
          ? Date.parse(b.startsAt) - Date.parse(a.startsAt)
          : Date.parse(a.startsAt) - Date.parse(b.startsAt),
      );

    return collection(planning.map(withMyAttendance), request);
  }),

  // BEFORE /api/v1/events/:id, so `series` is never read as an id. MSW matches
  // the first handler whose path matches, and `:id` would happily bind the
  // literal string.
  http.post("/api/v1/events/series", async ({ request }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const body = (await request.json()) as {
      template: Omit<EventResource, "id" | "startsAt" | "endsAt"> & {
        startTime: string;
        endTime: string;
      };
      dates: string[];
    };

    // One event per date, each independent — no series_id, nothing linking
    // them (C3). The generator is the only thing that knows they arrived
    // together, and it forgets immediately.
    const created = body.dates.map((date) => {
      const day = new Date(`${date}T00:00:00`);
      const offset = Math.round((day.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
      return {
        id: nextEventId++,
        title: body.template.title,
        startsAt: at(offset, body.template.startTime),
        endsAt: at(offset, body.template.endTime),
        location: body.template.location,
        attire: body.template.attire,
        isPublic: body.template.isPublic,
        notes: body.template.notes,
        registrationOpensAt: null,
        registrationClosesAt: null,
        registrationMaxGuests: null,
        takesRegistrations: false,
        myAttendance: null,
      };
    });

    events = [...events, ...created];

    // ENVELOPED, and 201 is exactly why this one was missed the first time.
    // The generator answers with the events it just wrote, which is a
    // collection whatever status carries it, and the real middleware keys on
    // any successful JSON list body rather than on 200.
    return collection(created, request, 201);
  }),

  http.post("/api/v1/events", async ({ request }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const body = (await request.json()) as Omit<EventResource, "id">;
    const invalid = refuseIfEndsBeforeStart(body.startsAt, body.endsAt);
    if (invalid) {
      return invalid;
    }

    const event: EventResource = { ...body, id: nextEventId++ };
    events = [...events, event];
    return HttpResponse.json(event, { status: 201 });
  }),

  http.get("/api/v1/events/:id", ({ params }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    const event = events.find((candidate) => candidate.id === Number(params.id));
    // The read the two conditional writes below start from. The event's tag
    // deliberately ignores `myAttendance`, which is the caller's own answer, so
    // answering an event does not invalidate a pending edit of it.
    return event
      ? HttpResponse.json(withMyAttendance(event), {
          headers: { ETag: mockEntityTag(withoutMyAttendance(event)) },
        })
      : notFound();
  }),

  http.patch("/api/v1/events/:id", async ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const index = events.findIndex((candidate) => candidate.id === Number(params.id));
    const existing = events[index];
    // Reading the row IS the existence check: noUncheckedIndexedAccess makes
    // events[index] `EventResource | undefined`, which replaces the
    // index === -1 branch rather than sitting after it.
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(withoutMyAttendance(existing)));
    if (stale) {
      return stale;
    }

    const patch = (await request.json()) as Partial<Omit<EventResource, "id">>;
    const updated: EventResource = { ...existing, ...patch };

    // The comparison reaches for the STORED start when the patch does not
    // carry one — the real Form Request's whole subtlety, mirrored so the
    // screen meets the same refusal.
    const invalid = refuseIfEndsBeforeStart(updated.startsAt, updated.endsAt);
    if (invalid) {
      return invalid;
    }

    events = events.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    return HttpResponse.json(updated, {
      headers: { ETag: mockEntityTag(withoutMyAttendance(updated)) },
    });
  }),

  http.delete("/api/v1/events/:id", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const id = Number(params.id);
    const existing = events.find((candidate) => candidate.id === id);
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(withoutMyAttendance(existing)));
    if (stale) {
      return stale;
    }

    events = events.filter((candidate) => candidate.id !== id);
    return HttpResponse.json({ ok: true });
  }),

  /* ---------------------------------------------------------------------- *
   * Attendance
   * ---------------------------------------------------------------------- */

  // THE CHASE LIST. Every answerable member, whether or not they replied —
  // returning only the answers would push "who has not replied?", the entire
  // point of the screen, into a client-side diff against a separately fetched
  // roster, which is two requests that can disagree.
  http.get("/api/v1/events/:id/attendance", ({ request, params }) => {
    const refusal = refuseWithout("attendance.view_all");
    if (refusal) {
      return refusal;
    }

    const event = events.find((candidate) => candidate.id === Number(params.id));
    if (!event) {
      return notFound();
    }

    // Answerable means being in a register, which is Member::isPlayer() and
    // deliberately not a permission: making it one is how the old site ended
    // up unable to ask an organiser whether they were coming.
    const rows: ChaseListEntryResource[] = members
      .filter((member) => member.isPlayer)
      .sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      )
      .map((member) => ({
        memberId: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        sectionName: member.sectionName,
        attendance: answers.get(answerKey(event.id, member.id)) ?? null,
      }));

    return collection(rows, request);
  }),

  // ANSWERING FOR YOURSELF. No permission gates it, and none could: being in a
  // register is what makes somebody answerable.
  http.put("/api/v1/events/:id/attendance", async ({ request, params }) => {
    if (!currentUser) {
      return unauthenticated();
    }

    const event = events.find((candidate) => candidate.id === Number(params.id));
    if (!event) {
      return notFound();
    }

    if (!currentUser.isPlayer) {
      return notAnswerable();
    }

    const body = (await request.json()) as RecordOwnAttendanceRequest;
    const key = answerKey(event.id, currentUser.id);
    const existing = answers.get(key) ?? null;

    // C11: taking back a yes costs a reason. It lands as an ORDINARY
    // validation failure against `note` rather than as a code of its own, so
    // the dialog shows it under the field the member is looking at.
    if (existing?.status === "yes" && body.status === "no" && !body.note?.trim()) {
      return problem(400, "validation_failed", "Invalid form submission", [
        { field: "note", reason: "required" },
      ]);
    }

    const recorded: AttendanceResource = {
      status: body.status,
      note: body.note?.trim() ? body.note : null,
      // Cleared, including when this overwrites something the direction
      // entered: the member correcting it themselves is exactly when "saisie
      // par la direction" stops being true.
      recordedByDirection: false,
      recordedAt: new Date().toISOString(),
    };

    // An upsert, like the real PUT: tapping Oui then Non needs no
    // create-versus-update branch and cannot race itself into two rows.
    answers.set(key, recorded);
    return HttpResponse.json(recorded);
  }),

  // UNDO, and it expires (C12).
  http.delete("/api/v1/events/:id/attendance", ({ params }) => {
    if (!currentUser) {
      return unauthenticated();
    }

    const key = answerKey(Number(params.id), currentUser.id);
    const existing = answers.get(key);

    // Idempotent rather than 404: undo is reached from a toast, and a double
    // tap on a flaky connection must not read as an error to the member.
    if (!existing) {
      return HttpResponse.json({ ok: true });
    }

    if (Date.now() - Date.parse(existing.recordedAt) >= UNDO_WINDOW_MS) {
      return conflict("answer_already_settled", "This answer can no longer be undone");
    }

    answers.delete(key);
    return HttpResponse.json({ ok: true });
  }),

  // ANSWERING ON SOMEBODY'S BEHALF — the phone call to the committee.
  http.put("/api/v1/events/:id/attendance/:member", async ({ request, params }) => {
    const refusal = refuseWithout("attendance.record_for_others");
    if (refusal) {
      return refusal;
    }

    const event = events.find((candidate) => candidate.id === Number(params.id));
    if (!event) {
      return notFound();
    }

    const member = members.find((candidate) => candidate.id === Number(params.member));
    if (!member) {
      return notFound();
    }

    // C14, checked BEFORE answerability, exactly as the real controller orders
    // it. This route is exempt from C11's reason rule (C13), which is
    // precisely why aiming it at yourself has to be refused: Bastien plays and
    // holds the permission, and could otherwise take back his own yes for
    // free.
    if (currentUser?.id === member.id) {
      return conflict("cannot_record_for_self", "Answer for yourself from the planning");
    }

    if (!member.isPlayer) {
      return notAnswerable();
    }

    const body = (await request.json()) as RecordMemberAttendanceRequest;

    const recorded: AttendanceResource = {
      status: body.status,
      // NO REASON REQUIRED, withdrawal included (C13): the committee is
      // writing down what they were told, and inventing a reason on somebody
      // else's behalf puts words in their mouth.
      note: body.note?.trim() ? body.note : null,
      recordedByDirection: true,
      recordedAt: new Date().toISOString(),
    };

    answers.set(answerKey(event.id, member.id), recorded);
    return HttpResponse.json(recorded);
  }),

  // Taking one back. NOT subject to the five-minute window: correcting a
  // mis-aimed entry an hour later is the case it exists for.
  http.delete("/api/v1/events/:id/attendance/:member", ({ params }) => {
    const refusal = refuseWithout("attendance.record_for_others");
    if (refusal) {
      return refusal;
    }

    const memberId = Number(params.member);
    if (currentUser?.id === memberId) {
      return conflict("cannot_record_for_self", "Answer for yourself from the planning");
    }

    answers.delete(answerKey(Number(params.id), memberId));
    return HttpResponse.json({ ok: true });
  }),
];

/**
 * Order matters: MSW uses the FIRST matching handler, so the hand-written ones
 * must come before the generated catch-alls.
 */
export const handlers = [...overrides, ...getLesCanetonsAPIMock()];
