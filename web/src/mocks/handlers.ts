import { HttpResponse, http } from "msw";

import type { ApiErrorField } from "../api/http";
import { getLesCanetonsAPIMock } from "../api/generated/endpoints.msw";
import { REFUSED } from "../images/photoName";
import { plannedSizes } from "../images/shrink";
import type {
  AttendanceResource,
  AuthMe200,
  ChaseListEntryResource,
  CommitteeFunctionResource,
  ContactMessageResource,
  ContactRequest,
  EventResource,
  EventTagResource,
  HandleContactMessageRequest,
  HistoryEntryResource,
  ImageResource,
  ImageResourceUsagesItem,
  InboxItemResource,
  InboxSummary200Counts,
  MemberResource,
  RecordMemberAttendanceRequest,
  RecordOwnAttendanceRequest,
  RegistrationOptionResource,
  RegistrationResource,
  RegistrationResourceChoicesItem,
  ReplaceRegistrationOptionsRequest,
  RoleResource,
  StoreRegistrationRequest,
  UpdateRegistrationRequest,
  SectionResource,
  StoreHistoryEntryRequest,
  StoreEventTagRequest,
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
 * It is a real little backend rather than a fixture dump: a screen that
 * creates a member and then lists them must see what it created, or the test
 * is asserting against a fixture instead of a flow.
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
    sectionName: null,
    committeeFunctionName: null,
    roleKeys: ["direction", "member"],
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
      "registrations.manage",
      // The 2026_09_15_000002 migration's own grant: `direction` reads AND
      // clears the inbox.
      "messages.view",
      "messages.manage",
      "history.manage",
      "images.manage",
      "events.view",
      "account.manage",
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
    sectionName: "Cloches",
    committeeFunctionName: null,
    roleKeys: ["member", "musician"],
    permissions: ["events.view", "account.manage", "attendance.respond"],
  },
  // BOTH — the case the old role matrix could not express: an organiser who
  // also plays. See DevSeeder's own comment for why this case matters.
  //
  // mustChangePassword: true here on purpose, matching the roster row for
  // this same id in initialMembers() below — POST /me/password treats the
  // session and the roster row as one fact, so the two must agree. Edit one,
  // edit the other.
  "demo.both": {
    id: 3,
    username: "demo.both",
    firstName: "Bastien",
    lastName: "Both",
    isPlayer: true,
    mustChangePassword: true,
    sectionName: "Trompettes",
    committeeFunctionName: null,
    roleKeys: ["direction", "member", "musician"],
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
      "registrations.manage",
      "messages.view",
      "messages.manage",
      "history.manage",
      "images.manage",
      "events.view",
      "account.manage",
      "attendance.respond",
    ],
  },
  // The `committee` role's own permissions: registrations.view is the reason
  // the role exists, and messages.view was added by the 2026_09_15_000002
  // migration — a prestation enquiry is committee business, so somebody in
  // this role has to be able to read one. Both are read-only: this is the
  // case that proves the guards read a PERMISSION rather than "is this
  // person privileged".
  "demo.committee": {
    id: 4,
    username: "demo.committee",
    firstName: "Camille",
    lastName: "Committee",
    isPlayer: true,
    mustChangePassword: false,
    sectionName: "Trombones",
    committeeFunctionName: "Responsable intendance",
    roleKeys: ["committee", "member", "musician"],
    permissions: [
      "registrations.view",
      "messages.view",
      "events.view",
      "account.manage",
      "attendance.respond",
    ],
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
    sectionName: "Cloches",
    committeeFunctionName: null,
    roleKeys: ["member", "musician"],
    permissions: ["events.view", "account.manage", "attendance.respond"],
  },
  // Edits the roster and the history and holds nothing else: no images.manage,
  // so the history form shows the current photo and sends no photo key. A
  // session fixture only, like demo.mustchange; no roster row stands behind it.
  "demo.roster": {
    id: 7,
    username: "demo.roster",
    firstName: "Rosa",
    lastName: "Roster",
    isPlayer: false,
    mustChangePassword: false,
    sectionName: null,
    committeeFunctionName: null,
    roleKeys: ["member"],
    permissions: ["members.manage", "history.manage", "events.view", "account.manage"],
  },
  // A young member whose parent uses the login on their behalf. Plays and
  // holds no organising permission.
  "demo.young": {
    id: 5,
    username: "demo.young",
    firstName: "Nadia",
    lastName: "Sansconnexion",
    isPlayer: true,
    mustChangePassword: false,
    sectionName: "Batteurs",
    committeeFunctionName: null,
    roleKeys: ["member", "musician"],
    permissions: ["events.view", "account.manage", "attendance.respond"],
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

/**
 * Test seam: who the mocked backend currently believes is logged in.
 *
 * The read half of setMockUser, and it exists for logout: the button hands the
 * browser to `/` with a full page load, which jsdom does not perform, so the
 * only way to see that the SERVER half happened is to ask the mock whether the
 * session is gone.
 */
export function currentMockUser(): MockUser | null {
  return currentUser;
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
 * The committee's seats, mirroring the 2026_09_14_000001 migration exactly —
 * the band's own RANK order, ids in insertion order.
 *
 * The order is the whole reason the table exists, so a mock that listed them
 * alphabetically would hide the only bug this feature was built to fix.
 */
const COMMITTEE_FUNCTIONS: CommitteeFunctionResource[] = [
  { id: 1, name: "Présidente", sortOrder: 1 },
  { id: 2, name: "Vice-présidente - secrétaire", sortOrder: 2 },
  { id: 3, name: "Responsable prestations", sortOrder: 3 },
  { id: 4, name: "Responsable caisse", sortOrder: 4 },
  { id: 5, name: "Responsable intendance", sortOrder: 5 },
  { id: 6, name: "Responsable costumes", sortOrder: 6 },
  { id: 7, name: "Responsable Team Direction", sortOrder: 7 },
  { id: 8, name: "Membre", sortOrder: 8 },
];

/**
 * The two roles 2026_09_07_000001 seeds, with what each grants — including
 * the committee inbox tokens 2026_09_15_000002 granted onto both roles
 * afterwards, which is why they are not part of that first migration's own
 * set.
 *
 * No display name, deliberately (ADR 0014): the API is English without
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
      "registrations.manage",
      "messages.view",
      "messages.manage",
      "history.manage",
      "images.manage",
    ],
  },
  { id: 2, key: "committee", permissions: ["registrations.view", "messages.view"] },
  { id: 3, key: "member", permissions: ["events.view", "account.manage"] },
  { id: 4, key: "musician", permissions: ["attendance.respond"] },
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

/* ------------------------------------------------------------------------ *
 * The image library (#105)
 *
 * Declared ahead of the history because a seeded entry carries a photo, and
 * that fixture is built when this module loads.
 * ------------------------------------------------------------------------ */

/** App\Models\Image's cap, from api.images.capacity. */
const IMAGE_CAPACITY = 100;

/** How many sizes one upload carries, from api.images.max_parts. */
const IMAGE_MAX_PARTS = 3;

/**
 * One stored size of a photo, as `image_files` holds it. `data` is there for
 * a size that was uploaded: the file route serves it, so a rotation in the
 * browser has a real JPEG to decode. A seeded size has none and is served as
 * a placeholder.
 */
type MockSize = {
  width: number;
  height: number;
  bytes: number;
  /** The digest of the size's bytes, which names its URL, as `image_files.sha256` does. */
  sha256: string;
  data?: Uint8Array<ArrayBuffer>;
};

/**
 * A library photo: `width`, `height` and `sha256` are its largest size's,
 * `bytes` the total of every size, and `sizes` runs smallest first, as
 * ImageResource lists them.
 */
type MockImage = {
  id: number;
  name: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  sizes: MockSize[];
  createdAt: string;
};

/**
 * The sizes the browser would have sent for a photo of this size, smallest
 * first, sharing `bytes` between them. A seeded photo needs them because every
 * URL the pages draw names one. A seeded size has no bytes to hash, so its
 * digest is made up from the photo's id and the width: distinct per size, as a
 * real digest would be.
 */
function seededSizes(id: number, width: number, height: number, bytes: number): MockSize[] {
  const planned = plannedSizes(width, height);
  const share = Math.floor(bytes / planned.length);
  return planned
    .map((size, index) => ({
      ...size,
      bytes: index === 0 ? bytes - share * (planned.length - 1) : share,
      sha256: `${String(size.width).padStart(8, "0")}${String(id).padStart(56, "0")}`,
    }))
    .reverse();
}

/**
 * One photo slot, as a photo_slots row holds it: the image, and the label and
 * path the page sent with the placement. An empty slot has no entry.
 */
type PhotoSlot = { imageId: number; label: string | null; path: string | null };

/**
 * Two images, with fixed digests: the file handler below answers a placeholder
 * for any name it knows, so nothing needs to exist on disk. Image 1 is the band
 * photo, image 2 the Trompettes photo and a history entry's, so an image with
 * several usages renders in the library too.
 */
function initialImages(): MockImage[] {
  return [
    {
      id: 1,
      name: "Le groupe au Carnaval 2026",
      sha256: "1".repeat(64),
      width: 1600,
      height: 1067,
      bytes: 412_000,
      sizes: seededSizes(1, 1600, 1067, 412_000),
      createdAt: "2026-09-26T00:00:00+00:00",
    },
    {
      id: 2,
      name: "Trompettes en répétition",
      sha256: "2".repeat(64),
      width: 1280,
      height: 960,
      bytes: 318_000,
      sizes: seededSizes(2, 1280, 960, 318_000),
      createdAt: "2026-09-27T00:00:00+00:00",
    },
  ];
}

/** Keyed by slot name. Every other slot is empty: the concert, the godparents, every other register. */
function initialPhotoSlots(): Record<string, PhotoSlot> {
  return {
    band: { imageId: 1, label: "Photo du groupe", path: "/band" },
    "register-5": { imageId: 2, label: "Trompettes", path: "/band" },
    "history-4": { imageId: 2, label: "Histoire\u00a0: Le flambeau passe", path: "/history" },
  };
}

let images: MockImage[] = initialImages();
let nextImageId = 3;
let photoSlots = initialPhotoSlots();

/** ImageResource::url(): one size, named by the digest of its bytes. */
const sizeUrl = (size: MockSize) => `/api/v1/images/${size.sha256}.jpg`;

/** ImageResource::largestUrl(): the photo's own size, which is its largest. */
const imageUrl = (image: MockImage) => {
  const largest = image.sizes.reduce((a, b) => (b.width > a.width ? b : a));
  return sizeUrl(largest);
};

/** ImageResource::srcset(): every size, smallest first. */
const srcsetOf = (image: MockImage) =>
  image.sizes.map((size) => `${sizeUrl(size)} ${size.width}w`).join(", ");

/** The photo a placement shows, or null when the slot is empty. Only a history entry passes alt text. */
function photoOf(imageId: number | null) {
  const image = images.find((candidate) => candidate.id === imageId);
  return image
    ? { url: imageUrl(image), width: image.width, height: image.height, srcset: srcsetOf(image) }
    : null;
}

/**
 * Test seam: add a photo that nothing shows, and return its id.
 *
 * Both seeded photos are in use, and an upload cannot run in jsdom, so this is
 * how a test gets a photo the library can delete. Each one is newer than the
 * last, so the newest-first order is predictable.
 */
export function addUnusedMockImage(name = `Photo inutilisée ${nextImageId}`): number {
  const id = nextImageId++;
  images = [
    ...images,
    {
      id,
      name,
      sha256: id.toString(16).padStart(64, "a"),
      width: 1200,
      height: 800,
      bytes: 250_000,
      sizes: seededSizes(id, 1200, 800, 250_000),
      createdAt: new Date(Date.UTC(2026, 8, 27 + id)).toISOString().replace(".000Z", "+00:00"),
    },
  ];
  return id;
}

function resetImages(): void {
  images = initialImages();
  nextImageId = 3;
  photoSlots = initialPhotoSlots();
}

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
      committeeFunctionId: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [1, 3],
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
      committeeFunctionId: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [3, 4],
    },
    {
      // BOTH — plays and organises. The case the old either/or role matrix
      // could not express; if someone reintroduces one, this row is what breaks.
      //
      // TRUE, WHERE THE SEEDER SAYS FALSE — deliberately, and for the same
      // reason member 1 carries a lastLoginAt the seeder leaves null: the
      // roster renders a status derived from this field, and a mock that
      // mirrored DevSeeder byte-for-byte would leave the branch unrenderable
      // in both the mocked backend and Playwright.
      //
      // The session fixture for this same id (USERS["demo.both"]) carries the
      // same value on purpose: the POST /me/password handler treats the
      // roster row and the session as one fact about one account, and this is
      // the one account whose session no test drives, so flipping it here
      // costs no test churn.
      id: 3,
      firstName: "Bastien",
      lastName: "Both",
      username: "demo.both",
      mustChangePassword: true,
      lastLoginAt: null,
      sectionId: 5,
      sectionName: "Trompettes",
      isPlayer: true,
      committeeFunctionId: null,
      // THE ONE INSTRUCTOR, mirroring DevSeeder. A different column from
      // sectionId, so the public band page lists them under the trumpets as a
      // player and under the drummers as an instructor — the only place that
      // branch can be looked at without a server.
      instructorOfSectionId: 1,
      publicVisible: true,
      roleIds: [1, 3, 4],
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
      // The SEAT, not the role, is what puts somebody on the public committee
      // page. `committee` grants registrations.view; this is a row in
      // committee_functions. A demo roster where the two coincide is how
      // somebody comes to believe they are one field.
      committeeFunctionId: 5,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [2, 3, 4],
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
      committeeFunctionId: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [3, 4],
    },
  ];
}

/**
 * MUTABLE MODULE STATE, reset by resetMockState() between tests — the same
 * pattern as the mocked session above, and for the same reason.
 */
let members: MemberResource[] = initialMembers();

/**
 * A roster row as the PUBLIC endpoints render it: three fields, and not one of
 * them an account detail.
 *
 * Written out rather than spread-and-delete, for the reason
 * App\Http\Resources\PublicMemberResource gives: the protection against
 * publishing a username is that no line here mentions one, and a `{...member}`
 * with two deletions publishes every field added after it.
 */
function publicly(member: MemberResource): {
  id: number;
  firstName: string;
  lastName: string;
} {
  return { id: member.id, firstName: member.firstName, lastName: member.lastName };
}

/** The next id, mirroring an auto-increment: never reuses a deleted one. */
let nextMemberId = 6;

/**
 * Test seam: withdraw or grant one member's consent to appear publicly.
 *
 * A seam rather than a `server.use()` override of /band, because the point of
 * the two public handlers is that they READ THE ROSTER — a test that replaced
 * the endpoint would prove the page renders a list and nothing about the one
 * rule the endpoint exists to enforce.
 */
export function setMemberVisibility(id: number, visible: boolean): void {
  const member = members.find((row) => row.id === id);
  if (member) {
    member.publicVisible = visible;
  }
}

/**
 * Test seam: give one member a committee seat, or take it away.
 *
 * Null is the only way to say "no seat" now. It used to be three — null, '' and
 * '   ' — because the seat was free text the roster form blanked rather than
 * cleared, and both the API and this mock had to read all three the same way.
 */
export function setMemberSeat(id: number, committeeFunctionId: number | null): void {
  const member = members.find((row) => row.id === id);
  if (member) {
    member.committeeFunctionId = committeeFunctionId;
  }
}

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

/** `exists:images,id`, which the real error map leaves on the generic reason. */
function refuseUnknownImage(imageId: number | null | undefined) {
  return imageId != null && !images.some((image) => image.id === imageId)
    ? problem(400, "validation_failed", "Invalid form submission", [
        { field: "imageId", reason: "invalid_format" },
      ])
    : null;
}

/** Route-model binding's own answer for an id nothing matches. */
const notFound = () => problem(404, "not_found", "Not found");

/** Whether the caller holds events.manage: the only people who know a draft exists. */
function mayManageEvents(): boolean {
  return currentUser?.permissions.includes("events.manage") ?? false;
}

/** The events the caller may know about: a draft is invisible without events.manage. */
function visibleEvents(): EventResource[] {
  return mayManageEvents() ? events : events.filter((event) => event.publishedAt !== null);
}

/**
 * The start as a number to sort and split on. An undated draft sorts before
 * everything, which is where the real list puts it.
 */
function startMs(event: EventResource): number {
  return event.startsAt === null ? Number.NEGATIVE_INFINITY : Date.parse(event.startsAt);
}

function compareStart(a: EventResource, b: EventResource): number {
  const [x, y] = [startMs(a), startMs(b)];
  return x === y ? 0 : x < y ? -1 : 1;
}

/**
 * Mirrors the event.published middleware and, for writes, the 409 a manager
 * gets: 404 for somebody who may not know the draft exists, 409
 * event_not_published for somebody who may but cannot answer it.
 */
function refuseDraft(event: EventResource, write: boolean) {
  if (event.publishedAt !== null) {
    return null;
  }
  if (!mayManageEvents()) {
    return notFound();
  }
  return write
    ? conflict("event_not_published", "This event is still a draft and takes no answers")
    : null;
}

/* ------------------------------------------------------------------------ *
 * Collections
 * ------------------------------------------------------------------------ */

/** The default and the cap the real App\Support\Page applies. */
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

/**
 * Whether `q` is a substring of any of `fields`, ignoring case and accents.
 *
 * What the real endpoints get from the `utf8mb4_unicode_ci` collation (see
 * App\Support\Search): "helene" finds "Hélène". A mock matching exactly would
 * let a screen test pass on input the real API folds differently. Stripping
 * the combining marks after NFD is close enough to the collation for names and
 * places; it is not a claim to reproduce it.
 */
function matchesSearch(fields: string[], q: string): boolean {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const needle = fold(q);
  return fields.some((field) => fold(field).includes(needle));
}

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
function collection<T>(
  rows: T[],
  request: Request,
  status = 200,
  // An enveloped list can still carry an entity tag: `etag:event.options` sits
  // on a route whose body is a collection, because the facet is the option
  // LIST rather than any one row. It is the one collection in this API that
  // hands a tag out, which is also what makes its write conditional.
  extraHeaders: Record<string, string> = {},
): Response {
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
    status === 200
      ? { headers: { Link: links.join(", "), ...extraHeaders } }
      : { status, headers: extraHeaders },
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
/**
 * The upcoming/past boundary, mirroring EventController::index and
 * App\Support\BandTime::startOfToday: the START OF TODAY, not now, so an
 * event that began an hour ago stays in the planning of somebody running late.
 *
 * The browser's own midnight rather than Fribourg's, which is the one place
 * this mock knowingly differs from the server. A test runner and a developer
 * are both in the band's zone in practice, and teaching the mock about
 * Europe/Zurich would mean reimplementing BandTime in TypeScript to answer a
 * question no screen asks.
 */
function startOfTodayMs(): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

function at(dayOffset: number, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const when = new Date();
  when.setDate(when.getDate() + dayOffset);
  when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return when.toISOString();
}

/**
 * The four tags the seed migration writes (#107), without `eventCount`: the
 * list handler counts it from the event store, as the API does.
 */
function initialEventTags(): EventTagResource[] {
  return [
    { id: 1, labelFr: "Répétition", labelDe: "Probe", colour: "violet", celebrate: false },
    { id: 2, labelFr: "Concert", labelDe: "Konzert", colour: "teal", celebrate: false },
    { id: 3, labelFr: "Sortie", labelDe: "Auftritt", colour: "amber", celebrate: false },
    { id: 4, labelFr: "Carnaval", labelDe: "Fasnacht", colour: "pink", celebrate: true },
  ];
}

let eventTags: EventTagResource[] = initialEventTags();

/** The compact tags for these ids, in the tag order, as an event carries them. */
function tagsFromIds(ids: readonly number[] | undefined): EventTagResource[] {
  const wanted = new Set(ids ?? []);
  return eventTags.filter((tag) => wanted.has(tag.id));
}

/**
 * Test seam: turn one tag's confetti on or off, on the tag and on every event
 * carrying a copy of it. The only seeded tag that has it, Carnaval, is on a
 * draft no player can see.
 */
export function setMockTagCelebrates(tagId: number, celebrate: boolean): void {
  eventTags = eventTags.map((tag) => (tag.id === tagId ? { ...tag, celebrate } : tag));
  events = events.map((event) => ({
    ...event,
    tags: tagsFromIds(event.tags.map((tag) => tag.id)),
  }));
}

/** How many events carry the tag, drafts included, as the API counts. */
function eventsCarrying(tagId: number): number {
  return events.filter((event) => event.tags.some((tag) => tag.id === tagId)).length;
}

/**
 * The tag request's own refusals: a missing French name, and one another tag
 * already has under MariaDB's case-insensitive comparison.
 */
function refuseTagBody(body: StoreEventTagRequest, self: number | null) {
  const labelFr = body.labelFr?.trim() ?? "";
  if (labelFr === "") {
    return problem(400, "validation_failed", "Invalid form submission", [
      { field: "labelFr", reason: "required" },
    ]);
  }
  const taken = eventTags.some(
    (tag) => tag.id !== self && tag.labelFr.toLocaleLowerCase() === labelFr.toLocaleLowerCase(),
  );
  return taken
    ? problem(400, "validation_failed", "Invalid form submission", [
        { field: "labelFr", reason: "already_taken" },
      ])
    : null;
}

/** Which seeded event carries which tags, by title. */
const SEEDED_TAGS: Record<string, number[]> = {
  Répétition: [1],
  "Répétition + apéritif de Noël": [1],
  "Weekend musical": [1],
  "Vendanges Cheyres": [3],
  "Concert d'automne": [2],
  "Sortie de fin de saison": [3, 4],
};

/**
 * The seeded planning, mirroring the band's real season rather than inventing
 * one: Saturday rehearsals at the Werkhof, the Christmas
 * one that runs an hour long, the two-day musical weekend, a gig, and one
 * rehearsal already past.
 *
 * SIX EVENTS, so the count is assertable. Five upcoming and one past, which is
 * what gives `?past=1` something to return and keeps the default list from
 * being the whole store.
 */
function initialEvents(): EventResource[] {
  const published: Omit<EventResource, "publishedAt" | "tags">[] = [
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
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
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
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
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
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
    },
    {
      // The two-day case, which is the whole reason `ends_at` is a datetime
      // rather than a time beside a `weekend` boolean.
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
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
    },
    {
      // The missing-attire case: the card has to render without one.
      //
      // AND THE ONLY PUBLIC ONE, which is what gives the front page's agenda
      // something to render. It is also the honest split: a gig is somewhere
      // anybody may come and watch, and five rehearsals are not. With every
      // event private the agenda renders nothing, which is correct and
      // unlookable-at.
      id: 5,
      title: "Vendanges Cheyres",
      startsAt: at(35, "11:00"),
      endsAt: at(35, "16:30"),
      location: "Cheyres",
      attire: null,
      isPublic: true,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
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
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
    },
    {
      // THE ONLY EVENT THAT TAKES BOOKINGS, and the one the four registration
      // screens are looked at against. The souper generalised (ADR 0020):
      // registration is a property of an event, so this is an ordinary row with
      // three dates filled in rather than a second kind of thing.
      //
      // Its window is open NOW and closes before the event, which is the
      // ordinary state and the only one in which the public form can be
      // filled in at all. Both other states — not yet open, and closed — are
      // reachable by editing those two dates in /events/:id/edit, which is
      // also the only way to check that the form says the right thing in each.
      id: 7,
      title: "Souper de soutien",
      startsAt: at(42, "18:30"),
      endsAt: at(42, "23:30"),
      location: "Salle de la Grenette, Fribourg",
      attire: "Costume complet",
      isPublic: true,
      notes: "Le comité tient la caisse.",
      registrationOpensAt: at(-14, "00:00"),
      registrationClosesAt: at(35, "23:59"),
      registrationMaxGuests: 6,
      takesRegistrations: true,
      myAttendance: null,
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
    },
  ];

  // TWO DRAFTS, one dated and one with nothing but a title, which is the pair
  // the committee's list has to place: the dateless one has no start to sort
  // by. The dated one is public on purpose. A draft marked public must still
  // appear nowhere, and a seed that was not public could never show it.
  const drafts: Omit<EventResource, "tags">[] = [
    {
      id: 8,
      title: "Concert d'automne",
      startsAt: at(20, "17:00"),
      endsAt: at(20, "19:00"),
      location: "Église Saint-Nicolas",
      attire: null,
      isPublic: true,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
      publishedAt: null,
    },
    {
      id: 9,
      title: "Sortie de fin de saison",
      startsAt: null,
      endsAt: null,
      location: null,
      attire: null,
      isPublic: false,
      notes: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      registrationMaxGuests: null,
      takesRegistrations: false,
      myAttendance: null,
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
      publishedAt: null,
    },
  ];

  return [
    ...published.map((event) => ({ ...event, publishedAt: "2026-09-01T00:00:00+00:00" })),
    ...drafts,
  ].map((event) => ({ ...event, tags: tagsFromIds(SEEDED_TAGS[event.title]) }));
}

let events: EventResource[] = initialEvents();

/** Mirrors an auto-increment: never reuses a deleted id. */
let nextEventId = 10;

function resetEvents(): void {
  eventTags = initialEventTags();
  events = initialEvents();
  nextEventId = 10;
}

/* ------------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------------ */

/**
 * The four entries the seed migration writes, shortened. Entry 3 also
 * carries German, so the mocked /de/history shows both branches.
 */
function initialHistory(): HistoryEntryResource[] {
  const stamp = { createdAt: "2026-09-26T00:00:00+00:00", updatedAt: "2026-09-26T00:00:00+00:00" };
  return [
    {
      id: 1,
      occurredOn: "2002-10-01",
      precision: "month",
      important: true,
      icon: "flag",
      titleFr: "Les débuts",
      bodyFr:
        "La guggen d’enfants « Les Canetons » de Fribourg s’est officiellement créée en octobre 2002.",
      titleDe: null,
      bodyDe: null,
      ...stamp,
    },
    {
      id: 2,
      occurredOn: "2007-01-01",
      precision: "year",
      important: false,
      icon: null,
      titleFr: null,
      bodyFr: "Dès la saison 2007/2008, les Directeurs (tous d’anciens Canetons) se sont succédé.",
      titleDe: null,
      bodyDe: null,
      ...stamp,
    },
    {
      id: 3,
      occurredOn: "2019-01-01",
      precision: "year",
      important: false,
      icon: "music",
      titleFr: "Delphine Maillard et Laura Mantel",
      bodyFr: null,
      titleDe: "Delphine Maillard und Laura Mantel",
      bodyDe: null,
      ...stamp,
    },
    {
      id: 4,
      occurredOn: "2026-01-01",
      precision: "year",
      important: false,
      icon: "users",
      titleFr: "Le flambeau passe",
      bodyFr: "Elles passent le flambeau à Lilou Keller et Anaïs Meuwly.",
      titleDe: null,
      bodyDe: null,
      ...stamp,
    },
  ];
}

let historyEntries: HistoryEntryResource[] = initialHistory();
let nextHistoryId = 5;

function resetHistory(): void {
  historyEntries = initialHistory();
  nextHistoryId = 5;
}

/** StoreHistoryEntryRequest's normalisation: blank text is none, and the date is truncated to its precision. */
function normaliseHistory(body: StoreHistoryEntryRequest) {
  const text = (value: string | null | undefined) =>
    value && value.trim() !== "" ? value.trim() : null;
  const [year, month] = body.occurredOn.split("-");
  const occurredOn =
    body.precision === "year"
      ? `${year}-01-01`
      : body.precision === "month"
        ? `${year}-${month}-01`
        : body.occurredOn;
  return {
    occurredOn,
    precision: body.precision,
    important: body.important,
    icon: body.icon ?? null,
    titleFr: text(body.titleFr),
    bodyFr: text(body.bodyFr),
    titleDe: text(body.titleDe),
    bodyDe: text(body.bodyDe),
  };
}

function hasHistoryText(body: ReturnType<typeof normaliseHistory>): boolean {
  return [body.titleFr, body.bodyFr, body.titleDe, body.bodyDe].some((value) => value !== null);
}
/* ------------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------------ */

/** The undo window (ADR 0018), in milliseconds: AttendanceIntegrity::UNDO_WINDOW_MINUTES. */
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
 * An instant far enough back that the undo window has closed.
 *
 * Seeded answers are SETTLED on purpose. Recorded "just now" every one of them
 * would offer an undo, and the five-minute window — the rule that keeps the
 * withdrawal reason from being decorative — would never be seen in the state it spends its life
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
 * a withdrawal collects, an answer the direction entered on somebody's behalf, and a
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
 * How many answerable members have replied to an event.
 *
 * COUNTS THROUGH THE ROSTER rather than over the answers map, so an answer
 * from somebody who is in no register is not counted — the same constraint
 * EventController::counts() puts in the subselect. The `answers` map is keyed
 * by answerKey(eventId, memberId).
 */
function answeredCountFor(eventId: number): number {
  return members.filter((member) => member.isPlayer && answers.has(answerKey(eventId, member.id)))
    .length;
}

/** The denominator: everybody in a register. A property of the roster, not of the event. */
function answerableCount(): number {
  return members.filter((member) => member.isPlayer).length;
}

/**
 * How many PEOPLE are booked at an event.
 *
 * Reads each booking's own `guestCount`, which totalsOf() already computed
 * from its choices. Summing the lines a second time here is exactly the
 * disagreement that function's docblock exists to prevent.
 */
function guestsFor(eventId: number): number {
  return registrations
    .filter((booking) => booking.eventId === eventId)
    .reduce((sum, booking) => sum + booking.guestCount, 0);
}

/**
 * The committee's counts, gated exactly as the server gates them.
 *
 * MIRRORS App\Http\Resources\EventResource, including the two DIFFERENT
 * permissions: the seeded committee role holds registrations.view without
 * attendance.view_all. A mock that hands a player these numbers is a mock the
 * SPA's own leak test passes against, which is worse than no mock.
 */
function withCommitteeCounts(event: EventResource): EventResource {
  const maySeeAnswers = currentMockUser()?.permissions.includes("attendance.view_all") ?? false;
  const maySeeGuests = currentMockUser()?.permissions.includes("registrations.view") ?? false;

  return {
    ...event,
    answeredCount: maySeeAnswers ? answeredCountFor(event.id) : null,
    answerableCount: maySeeAnswers ? answerableCount() : null,
    guestCount: maySeeGuests ? guestsFor(event.id) : null,
  };
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
function refuseIfEndsBeforeStart(startsAt: string | null, endsAt: string | null) {
  // A draft may have neither, and there is nothing to compare then.
  if (startsAt === null || endsAt === null || Date.parse(endsAt) > Date.parse(startsAt)) {
    return null;
  }
  return problem(400, "validation_failed", "Invalid form submission", [
    { field: "endsAt", reason: "must_be_after" },
  ]);
}

/* ------------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------------ */

/**
 * The event id lives beside the resource rather than inside it, in both
 * stores below, because the API never publishes it: an option is only ever
 * read through its event's URL, and a booking through the guest list of one.
 * Modelling it as a field of the resource would make every handler able to
 * typecheck against a shape the server does not send.
 */
type MockOption = RegistrationOptionResource & { eventId: number };
type MockRegistration = RegistrationResource & { eventId: number };

/**
 * What event 7 offers.
 *
 * ONE PRICED, ONE CHEAPER, ONE WITHOUT A PRICE AT ALL, which is the shape the
 * screens have to be looked at against: `priceCents: null` is an option whose
 * price lives in its description or which is simply not sold, and it is a
 * different thing from a free one. A seed where every option had a price
 * would let a booking total ship having never met the null it must not print
 * as "CHF 0.00".
 */
function initialOptions(): MockOption[] {
  return [
    {
      eventId: 7,
      id: 1,
      label: "Repas adulte",
      description: "Jambon, gratin et salade",
      priceCents: 4500,
      sortOrder: 0,
    },
    {
      eventId: 7,
      id: 2,
      label: "Repas enfant",
      description: "Jusqu’à 12 ans",
      priceCents: 2000,
      sortOrder: 1,
    },
    {
      eventId: 7,
      id: 3,
      label: "Sans repas",
      description: "Vous venez écouter, vous ne mangez pas",
      priceCents: null,
      sortOrder: 2,
    },
  ];
}

/**
 * Two bookings, and between them they exercise everything the guest list has
 * to render: several lines against one booking, an option nobody took, an
 * optional field left empty, and a booking whose total is null because
 * nothing it took carries a price.
 *
 * `createdAt` is FIXED rather than relative, unlike the planning's dates. A
 * guest list is a record of what happened, so nothing about it goes stale as
 * the seed ages, and a fixed stamp is what lets a test assert the column.
 */
function initialRegistrations(): MockRegistration[] {
  return [
    {
      eventId: 7,
      id: 1,
      firstName: "Jeanne",
      lastName: "Aebischer",
      email: "jeanne.aebischer@example.ch",
      phone: "079 123 45 67",
      address: "Route des Alpes 12, 1700 Fribourg",
      tableName: "Avec la famille Python",
      choices: [
        { optionId: 1, label: "Repas adulte", quantity: 2, priceCents: 4500 },
        { optionId: 2, label: "Repas enfant", quantity: 3, priceCents: 2000 },
      ],
      guestCount: 5,
      totalCents: 15000,
      paidAt: null,
      createdAt: "2026-09-01T18:24:00.000Z",
    },
    {
      eventId: 7,
      id: 2,
      firstName: "Marc",
      lastName: "Python",
      email: "marc.python@example.ch",
      phone: "026 322 10 10",
      address: null,
      tableName: null,
      choices: [{ optionId: 3, label: "Sans repas", quantity: 1, priceCents: null }],
      guestCount: 1,
      // Null, not zero: this booking owes an unknown amount rather than
      // nothing, and the two must be visibly different on screen.
      totalCents: null,
      paidAt: null,
      createdAt: "2026-09-02T09:05:00.000Z",
    },
  ];
}

let options: MockOption[] = initialOptions();
let registrations: MockRegistration[] = initialRegistrations();
let nextOptionId = 4;
let nextRegistrationId = 3;

function resetRegistrations(): void {
  options = initialOptions();
  registrations = initialRegistrations();
  nextOptionId = 4;
  nextRegistrationId = 3;
}

/**
 * A stored row as the API publishes it: without the event id it is keyed on.
 *
 * `delete` on a copy rather than a rest destructure, matching
 * `withoutMyAttendance` above — the destructure leaves a bound name nothing
 * reads, which this project's eslint rules refuse, and a cast would be a lie
 * the compiler stops checking.
 */
function published<T extends { eventId: number }>(row: T): Omit<T, "eventId"> {
  const resource = { ...row };
  delete (resource as Partial<T>).eventId;
  return resource;
}

/** One event's options, in the order both the form and the editor show them. */
function optionsFor(eventId: number): RegistrationOptionResource[] {
  return options
    .filter((option) => option.eventId === eventId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map(published);
}

/**
 * The `event.options` facet, which is a SEPARATE tag from the event's.
 *
 * The options are absent from EventResource, so conditioning their write on
 * the event's tag would both miss every option change and refuse a good
 * options edit because somebody corrected the dress code. Mirroring the two
 * facets here is what lets a screen be wrong about which one it quotes and
 * be caught for it.
 */
function optionsTag(eventId: number): string {
  return mockEntityTag(optionsFor(eventId));
}

function registrationTag(registration: MockRegistration): string {
  return mockEntityTag(published(registration));
}

/**
 * What a booking covers and what it comes to, recomputed from its lines.
 *
 * The server sends both as fields of RegistrationResource so the spreadsheet,
 * the screen and the confirmation mail cannot disagree; a mock that let a
 * screen sum the lines itself would leave that agreement untested. Null when
 * nothing taken carries a price, which is not zero.
 */
function totalsOf(choices: RegistrationResourceChoicesItem[]): {
  guestCount: number;
  totalCents: number | null;
} {
  const priced = choices.filter((choice) => choice.priceCents !== null);

  return {
    guestCount: choices.reduce((sum, choice) => sum + choice.quantity, 0),
    totalCents:
      priced.length === 0
        ? null
        : priced.reduce((sum, choice) => sum + (choice.priceCents ?? 0) * choice.quantity, 0),
  };
}

/** Mirrors Event::registrationIsOpen(): the close date is the switch. */
function registrationIsOpen(event: EventResource): boolean {
  if (event.registrationClosesAt === null) {
    return false;
  }

  const now = Date.now();
  const opens = event.registrationOpensAt;

  return (
    (opens === null || Date.parse(opens) <= now) && now <= Date.parse(event.registrationClosesAt)
  );
}

/**
 * An event with its DERIVED field put back.
 *
 * `takesRegistrations` is computed by the server from `registration_closes_at`
 * and is not a column. A mocked write that spread the request body over the
 * stored row left it at its old value, so switching registration on through
 * the event form produced an event the rest of the mocked app still thought
 * took no bookings.
 */
function withRegistrationFlag(event: EventResource): EventResource {
  return { ...event, takesRegistrations: event.registrationClosesAt !== null };
}

/** The four facts PublicEventResource publishes, plus what registration added to it. */
function publicEvent(event: EventResource) {
  // Only ever handed a published event, which has all four; the real resource
  // throws on a draft for the same reason.
  if (event.startsAt === null || event.endsAt === null || event.location === null) {
    throw new Error("A draft reached publicEvent");
  }

  return {
    id: event.id,
    title: event.title,
    tags: event.tags.map(({ id, labelFr, labelDe, colour, celebrate }) => ({
      id,
      labelFr,
      labelDe,
      colour,
      celebrate,
    })),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    registrationOpen: registrationIsOpen(event),
  };
}

/**
 * The guest list as rows, mirroring App\Support\GuestList.
 *
 * ONE ROW-BUILDER, FOUR FORMATS on the server, and the same here for the same
 * reason: the four downloads must not be able to disagree. One column per
 * option, because that is what the kitchen counts, and a zero rather than a
 * blank for an option a booking did not take, because a column of blanks and
 * numbers does not sum.
 */
function guestListOf(eventId: number): {
  headers: string[];
  rows: (string | number | null)[][];
  totals: (string | number | null)[];
} {
  const eventOptions = optionsFor(eventId);
  const bookings = registrations
    .filter((registration) => registration.eventId === eventId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const francs = (cents: number | null) => (cents === null ? null : Math.round(cents) / 100);

  const headers = [
    "Nom",
    "Prénom",
    "E-mail",
    "Téléphone",
    "Adresse",
    "Table",
    ...eventOptions.map((option) => option.label),
    "Personnes",
    "Total CHF",
    "Payé le",
    "Inscrit le",
  ];

  const rows = bookings.map((booking) => [
    booking.lastName,
    booking.firstName,
    booking.email,
    booking.phone,
    booking.address,
    booking.tableName,
    ...eventOptions.map(
      (option) => booking.choices.find((choice) => choice.optionId === option.id)?.quantity ?? 0,
    ),
    booking.guestCount,
    francs(booking.totalCents),
    booking.paidAt === null ? null : booking.paidAt.slice(0, 16).replace("T", " "),
    booking.createdAt.slice(0, 16).replace("T", " "),
  ]);

  const priced = bookings
    .map((booking) => booking.totalCents)
    .filter((cents): cents is number => cents !== null);

  const totals = [
    "Total",
    "",
    "",
    "",
    "",
    "",
    ...eventOptions.map((option) =>
      bookings.reduce(
        (sum, booking) =>
          sum + (booking.choices.find((choice) => choice.optionId === option.id)?.quantity ?? 0),
        0,
      ),
    ),
    bookings.reduce((sum, booking) => sum + booking.guestCount, 0),
    priced.length === 0 ? null : francs(priced.reduce((sum, cents) => sum + cents, 0)),
    "",
    "",
  ];

  return { headers, rows, totals };
}

/* ------------------------------------------------------------------------ *
 * The committee inbox
 * ------------------------------------------------------------------------ */

/**
 * The public's own words, in the order GET /contact-messages returns them:
 * newest first, `id` descending to match — so this array needs no re-sort
 * before that handler hands it out.
 *
 * TWO OPEN, ONE HANDLED, which is what both the inbox and its summary read.
 * One open message carries no subject, so its inbox row falls back to the
 * opening of the body, mirroring ContactMessageSource exactly; the other
 * carries a long one, so the archive is looked at against a body that
 * actually wraps. The handled one carries who dealt with it and when, so the
 * archive's "handled" column has something other than null to render.
 */
function initialContactMessages(): ContactMessageResource[] {
  return [
    {
      id: 3,
      firstName: "Isabelle",
      lastName: "Dupasquier",
      email: "isabelle.dupasquier@example.ch",
      subject: "Prestation pour un mariage",
      message:
        "Bonjour, nous nous marions le 20 juin 2027 à Fribourg et aimerions beaucoup surprendre nos invités avec votre guggenmusik pendant le cocktail. Seriez-vous disponibles à cette date, et quel serait le tarif pour une prestation d'une trentaine de minutes ? Nous sommes flexibles sur l'horaire. Merci d'avance et au plaisir de vous lire.",
      receivedAt: "2026-09-15T10:05:00+00:00",
      handledAt: null,
      handledBy: null,
    },
    {
      id: 2,
      firstName: "Yannick",
      lastName: "Rossier",
      email: "y.rossier@example.ch",
      subject: null,
      message:
        "Bonjour, vous cherchez des musiciens ? Je joue de la trompette depuis trois ans et j'aimerais bien essayer une répétition.",
      receivedAt: "2026-09-12T14:20:00+00:00",
      handledAt: null,
      handledBy: null,
    },
    {
      id: 1,
      firstName: "Sophie",
      lastName: "Chappuis",
      email: "sophie.chappuis@example.ch",
      subject: null,
      message:
        "Bonjour, est-ce que les Canetons pourraient venir jouer pour l'anniversaire de mon papa le 3 mai ? C'est une petite fête de famille à Marly. Merci d'avance !",
      receivedAt: "2026-09-08T09:15:00+00:00",
      handledAt: "2026-09-09T07:40:00+00:00",
      handledBy: "Dominique Direction",
    },
  ];
}

let contactMessages: ContactMessageResource[] = initialContactMessages();

function resetContactMessages(): void {
  contactMessages = initialContactMessages();
}

/**
 * Mirrors Iso8601::utc's own rendering: ISO 8601, UTC, an explicit offset —
 * `+00:00`, not `.toISOString()`'s `Z`. The real API's Carbon formatter never
 * emits `Z`, so a write handler that did would hand a screen a timestamp
 * shape it never sees from the server.
 */
function isoNowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** `str($message)->limit(120)` mirrored: the same suffix, the same cut. */
function limitedTo(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/** Still open, newest first — the set both GET /inbox and its summary count. */
function openContactMessages(): ContactMessageResource[] {
  return contactMessages.filter((message) => message.handledAt === null);
}

/**
 * One open message as InboxItemResource, mirroring ContactMessageSource: the
 * subject when there is one, else the opening of the body, and a deep link
 * back to the archive with this row already open — the inbox is a way
 * through to the work, not a second place to do it.
 */
function toInboxItem(message: ContactMessageResource): InboxItemResource {
  return {
    kind: "contactMessage",
    id: message.id,
    title: `${message.firstName} ${message.lastName}`.trim(),
    summary: message.subject || limitedTo(message.message, 120),
    // `receivedAt` is non-null on ContactMessageResource, so this is a plain
    // pass-through rather than a fallback for a nullable field.
    arrivedAt: message.receivedAt,
    path: `/contact-messages?open=${message.id}`,
  };
}

/**
 * Whoever is logged in, the way ContactMessageResource renders `handledBy`
 * once a message is handled.
 */
function actorDisplayName(): string {
  return `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim();
}

/**
 * Whether the caller holds `messages.view`.
 *
 * A plain boolean rather than another refuseWithout(), because GET /inbox and
 * GET /inbox/summary FILTER on this permission rather than refusing its
 * absence — mirrors InboxRegistry, whose whole point is that the nav badge is
 * safe to call before a caller has worked out what they may do at all.
 */
function mayReadMessages(): boolean {
  return currentUser?.permissions.includes("messages.view") ?? false;
}

/** Test seam: every mock store is module state, so every test must reset them all. */
export function resetMockState(): void {
  setCurrentUser(null);
  // Before the roster and history: their fixtures read the images.
  resetImages();
  resetRoster();
  // Dropping this line fails tests only when the WHOLE FILE runs, which reads
  // as flakiness and is not — the roster store proved it first.
  resetEvents();
  resetHistory();
  resetAnswers();
  resetRegistrations();
  resetContactMessages();
}

/** Tied to the model, not retyped as a bare string[]: a field rename in
 * ContactRequest is a compile error here rather than a mock silently rejecting
 * a field the API no longer has. */
const REQUIRED: (keyof ContactRequest)[] = ["lastName", "firstName", "email", "subject", "message"];

/**
 * An image as ImageResource renders it, with every place it is shown, in the
 * order Image::usagesOf() lists them: the band-page slots, registers, history
 * entries.
 */
function imageResource(image: MockImage): ImageResource {
  const usages: ImageResourceUsagesItem[] = [];

  for (const slot of Object.keys(photoSlots).sort()) {
    const placed = photoSlots[slot];
    if (placed?.imageId === image.id) {
      usages.push({ slot, label: placed.label, path: placed.path });
    }
  }

  return {
    id: image.id,
    name: image.name,
    url: imageUrl(image),
    width: image.width,
    height: image.height,
    srcset: srcsetOf(image),
    bytes: image.bytes,
    sizes: image.sizes.map((size) => ({
      width: size.width,
      height: size.height,
      bytes: size.bytes,
      url: sizeUrl(size),
    })),
    createdAt: image.createdAt,
    usages,
  };
}

/**
 * PlacePhotoRequest: `imageId` must be sent, null empties the place, and a
 * number must name a library image. Answers the body to store, or the refusal.
 */
async function placedImageId(request: Request): Promise<{ imageId: number | null } | Response> {
  const body = (await request.json()) as { imageId?: unknown };
  if (!("imageId" in body)) {
    return problem(400, "validation_failed", "Invalid form submission", [
      { field: "imageId", reason: "required" },
    ]);
  }
  const imageId = body.imageId ?? null;
  if (imageId !== null && typeof imageId !== "number") {
    return problem(400, "validation_failed", "Invalid form submission", [
      { field: "imageId", reason: "invalid_format" },
    ]);
  }
  return refuseUnknownImage(imageId) ?? { imageId };
}

/**
 * The `files[]` parts of a multipart body, in the order sent, and its text
 * fields by name.
 *
 * Read by hand rather than through `request.formData()`: under Vitest the
 * request is built from jsdom's FormData and parsed by Node's, and the two
 * realms' `File` classes disagree, so the parser asserts and the handler 500s.
 * Reading the body as latin-1 keeps one character per byte, so the indexes found
 * in the text are indexes into the bytes.
 */
async function multipartBody(
  request: Request,
): Promise<{ files: Uint8Array<ArrayBuffer>[]; fields: Map<string, string> }> {
  const files: Uint8Array<ArrayBuffer>[] = [];
  const fields = new Map<string, string>();
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(request.headers.get("Content-Type") ?? "");
  const delimiter = boundary ? `--${boundary[1] ?? boundary[2]}` : null;
  if (delimiter === null) {
    return { files, fields };
  }

  const raw = new Uint8Array(await request.arrayBuffer());
  const text = Array.from(raw, (byte) => String.fromCharCode(byte)).join("");

  let offset = 0;
  for (const part of text.split(delimiter)) {
    const partStart = offset;
    offset += part.length + delimiter.length;
    const headerEnd = part.indexOf("\r\n\r\n");
    const name = headerEnd === -1 ? null : /name="([^"]*)"/.exec(part.slice(0, headerEnd))?.[1];
    if (name == null) {
      continue;
    }
    const start = partStart + headerEnd + 4;
    // The CRLF before the next delimiter belongs to the delimiter, not the part.
    const bytes = raw.slice(start, partStart + part.length - 2);
    if (name === "files[]") {
      files.push(bytes);
    } else {
      fields.set(name, new TextDecoder().decode(bytes));
    }
  }
  return { files, fields };
}

/**
 * A photo's name as the API stores it: trimmed, as Laravel's TrimStrings
 * does, and refused when blank, longer than 120 characters, or carrying a
 * control or bidirectional formatting character.
 */
function photoNameOrReason(value: unknown): { name: string } | { reason: string } {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "") {
    return { reason: "required" };
  }
  if (Array.from(name).length > 120) {
    return { reason: "too_long" };
  }
  // App\Support\PhotoName's not_regex, which the API reports as invalid_format.
  if (new RegExp(REFUSED.source, "u").test(name)) {
    return { reason: "invalid_format" };
  }
  return { name };
}

const invalidField = (field: string, reason: string) =>
  problem(400, "validation_failed", "Invalid form submission", [{ field, reason }]);

/**
 * ReceivesImageSizes, which an upload and a replacement share: the count
 * before any part is read, then each part, then the set. The sizes come back
 * largest first, each with its bytes.
 */
async function checkedSizes(
  parts: Uint8Array<ArrayBuffer>[],
): Promise<(MockSize & { data: Uint8Array<ArrayBuffer> })[] | Response> {
  if (parts.length > IMAGE_MAX_PARTS) {
    return invalidField("files", "image_set_too_many");
  }
  const sizes: (MockSize & { data: Uint8Array<ArrayBuffer> })[] = [];
  for (const [index, data] of parts.entries()) {
    const size = jpegSize(data);
    if (!size) {
      return invalidField(`files.${index}`, "image_not_jpeg");
    }
    sizes.push({ ...size, bytes: data.length, sha256: await sha256Hex(data), data });
  }
  const problemWithSet = setProblem(sizes);
  if (problemWithSet) {
    return invalidField("files", problemWithSet);
  }
  return sizes.sort((a, b) => b.width - a.width);
}

/** App\Support\ImageSet::check(): distinct widths, and every size the shape of the largest. */
function setProblem(sizes: { width: number; height: number }[]): string | null {
  const widths = sizes.map((size) => size.width);
  if (new Set(widths).size !== widths.length) {
    return "image_set_widths_repeated";
  }
  const largest = [...sizes].sort((a, b) => b.width - a.width)[0];
  if (!largest) {
    return null;
  }
  const landscape = largest.width >= largest.height;
  const off = (size: { width: number; height: number }) =>
    landscape
      ? Math.abs(size.height - (size.width * largest.height) / largest.width)
      : Math.abs(size.width - (size.height * largest.width) / largest.height);
  return sizes.some((size) => off(size) > 1) ? "image_set_aspect_mismatch" : null;
}

/**
 * The pixel size a JPEG declares, read from its first start-of-frame marker, or
 * null when the bytes are not a JPEG. The mock's whole share of JpegInspector:
 * the size limits and the metadata checks are the server's, and a screen's own
 * shrinking step is what keeps a real upload inside them.
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return null;
  }
  let at = 2;
  while (at + 8 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1] ?? 0;
    // SOF0-SOF15, except DHT (c4), JPG (c8) and DAC (cc), which are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0),
        width: ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0),
      };
    }
    at += 2 + (((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0));
  }
  return null;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * What GET /api/v1/images/{sha256}.jpg answers here: a flat tinted
 * rectangle of that size's own dimensions, labelled with the image id and width.
 *
 * Nothing under web/public/ stands in for a photograph, because that directory
 * ships in the deployed artifact. The tint differs per image so a screenshot
 * can tell two apart, and the size is real so that every layout rule (aspect
 * ratio, crop, `width`/`height` attributes) meets the proportions the library
 * holds.
 */
function placeholderSvg(image: MockImage, size: MockSize): string {
  const hue = (image.id * 67) % 360;
  const font = Math.max(12, Math.round(Math.min(size.width, size.height) / 8));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    `<rect width="100%" height="100%" fill="hsl(${hue} 45% 62%)"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${font}" fill="#fff">Photo ${image.id} · ${size.width}w</text>`,
    `</svg>`,
  ].join("");
}

/** One fixed stamp, so a test can send a wrong one and watch the guard refuse. */
const MOCK_FORM_TOKEN = "mock-form-token";

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

  // THE TWO PUBLIC PEOPLE-PAGES, derived from the same mutable roster the
  // members screen edits rather than from a second fixture. That is what makes
  // the mocked app answer the question this endpoint exists for: tick
  // "Visible publiquement" off for Perrine in /members and she leaves the band
  // page, which is the behaviour a committee has to be able to trust.
  //
  // Both mirror the server's filter — `publicVisible`, and for the committee a
  // non-empty title — because a mocked handler that served everybody would let
  // a screen ship having never rendered the empty state that today's roster
  // actually produces.
  // The public agenda, read off the same event store the planning uses — so
  // ticking "Visible publiquement" on an event in /events/:id/edit puts it on
  // the front page, which is the only way that flag can be seen to work.
  http.get("/api/v1/agenda", ({ request }) =>
    collection(
      events
        // Both filters, as on the server: a draft marked public appears nowhere.
        .filter(
          (event) =>
            event.publishedAt !== null && event.isPublic && startMs(event) >= startOfTodayMs(),
        )
        .sort(compareStart)
        .map(publicEvent),
      request,
    ),
  ),

  http.get("/api/v1/band", ({ request }) =>
    collection(
      SECTIONS.map((section) => ({
        id: section.id,
        name: section.name,
        members: members
          .filter((member) => member.publicVisible && member.sectionId === section.id)
          .map(publicly),
        instructors: members
          .filter((member) => member.publicVisible && member.instructorOfSectionId === section.id)
          .map(publicly),
      })),
      request,
    ),
  ),

  // PUBLIC, and a list like every other: each placed slot by name.
  http.get("/api/v1/photo-slots", ({ request }) =>
    collection(
      Object.keys(photoSlots)
        .sort()
        .flatMap((slot) => {
          const photo = photoOf(photoSlots[slot]?.imageId ?? null);
          return photo ? [{ slot, ...photo }] : [];
        }),
      request,
    ),
  ),

  // BY RANK, then by name — mirroring CommitteeController, whose ordering IS
  // the feature. Several people hold "Membre" at once, so the name tie-break is
  // what keeps two cards from swapping places between renders.
  http.get("/api/v1/committee", ({ request }) =>
    collection(
      members
        .flatMap((member) => {
          const seat = COMMITTEE_FUNCTIONS.find((row) => row.id === member.committeeFunctionId);

          // Reading the seat IS the "holds one" check: an id pointing at
          // nothing and no id at all are the same answer, and the real
          // endpoint's inner join says so too.
          return member.publicVisible && seat ? [{ member, seat }] : [];
        })
        .sort(
          (a, b) =>
            a.seat.sortOrder - b.seat.sortOrder ||
            a.member.lastName.localeCompare(b.member.lastName, "fr") ||
            a.member.firstName.localeCompare(b.member.firstName, "fr"),
        )
        .map(({ member, seat }) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          function: seat.name,
        })),
      request,
    ),
  ),

  // Hand-written because the generated handler always succeeds, and the whole
  // point of a contact form is what it does when it does not. The required set
  // mirrors api/app/Http/Requests/ContactRequest.php exactly — including
  // `subject`, which the OLD HTML form did not mark required even though the
  // API always has.
  // The stamp every anonymous form fetches as it renders. The real one is
  // signed and carries the minting time; this one only has to be a string the
  // handler below can recognise, because nothing in the SPA reads it.
  http.get("/api/v1/form-token", () => HttpResponse.json({ token: MOCK_FORM_TOKEN })),

  http.post("/api/v1/contact", async ({ request }) => {
    // THE GUARD RUNS AHEAD OF VALIDATION, exactly as PublicWriteGuard does on
    // the server — which is the ordering `npm run smoke` got wrong for a week,
    // asserting a 400 on a bare POST and receiving the 422. A mocked handler
    // that validated first would let a form ship with no token at all and only
    // fail against Apache.
    //
    // WHAT IS DELIBERATELY NOT MIRRORED IS THE TWO-SECOND FLOOR. The server
    // refuses a token younger than that; enforcing it here would make every
    // test of this form sleep two seconds to pass, and the rule it protects —
    // fetch the token when the form renders — is already structural in
    // Contact.tsx, where the query is pinned. Presence is checked; age is the
    // server's.
    const body = (await request.json()) as Partial<Record<keyof ContactRequest, string>>;

    // `website` must arrive PRESENT and empty. An absent field is refused as
    // firmly as a filled one: omitting it is how a hand-written body would
    // otherwise walk past a honeypot.
    if (request.headers.get("X-Form-Token") !== MOCK_FORM_TOKEN || body.website !== "") {
      return problem(422, "spam_suspected", "Submission looks automated");
    }

    const key = request.headers.get("Idempotency-Key");
    if (key === null) {
      return problem(400, "idempotency_key_required", "Idempotency-Key header required");
    }
    if (key.length < 16 || key.length > 255) {
      return problem(400, "idempotency_key_invalid", "Idempotency-Key is not usable");
    }
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

  http.get(
    "/api/v1/committee-functions",
    ({ request }) => refuseWithoutMembersManage() ?? collection(COMMITTEE_FUNCTIONS, request),
  ),

  // Ordered by name, like the real endpoint: this screen is scanned for a
  // person, and a mock answering in insertion order would hide a sorting bug.
  http.get("/api/v1/members", ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    // THE FILTERS THE REAL ENDPOINT TAKES (#97), applied before the envelope
    // slices, as MemberController does. Malformed values are not refused here:
    // the screen only ever sends ids it was handed, and the refusals are
    // pinned by MemberSearchTest against the real thing.
    const query = new URL(request.url).searchParams;
    const q = query.get("q")?.trim() ?? "";
    const section = query.get("section");
    const role = query.get("role");

    const ordered = [...members]
      .filter(
        (member) =>
          q === "" ||
          matchesSearch(
            [
              member.firstName,
              member.lastName,
              member.username,
              `${member.firstName} ${member.lastName}`,
              `${member.lastName} ${member.firstName}`,
            ],
            q,
          ),
      )
      .filter(
        (member) =>
          section === null ||
          section === "" ||
          (section === "none" ? member.sectionId === null : member.sectionId === Number(section)),
      )
      .filter((member) => role === null || role === "" || member.roleIds.includes(Number(role)))
      .sort(
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
  // IT GRANTS THE BASELINE ROLE AND NOTHING ELSE, like the real API, and it
  // ignores any roleIds in the body. Every account holds `member`; any other
  // role is the separate, guarded step, and a mock that granted it here would
  // hide that step from every test.
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
      committeeFunctionId: body.committeeFunctionId ?? null,
      instructorOfSectionId: body.instructorOfSectionId ?? null,
      publicVisible: body.publicVisible ?? false,
      // The baseline `member` role of ROLES, and never `musician`: a register
      // grants nothing by itself.
      roleIds: [3],
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
      "committeeFunctionId",
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

  // The ONE endpoint that still re-authenticates (ADR 0017). Knowing the
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

    // The split is on the START OF TODAY, not on now — see startOfTodayMs().
    const boundary = startOfTodayMs();

    // Anything that is not exactly '1' is the default upcoming view, the same
    // fail-safe direction the real endpoint takes: a truncated or misspelled
    // value must never be the one that hides events.
    const past = new URL(request.url).searchParams.get("past") === "1";
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const tag = new URL(request.url).searchParams.get("tag");

    // EVERY DRAFT BELONGS TO THE DEFAULT HALF, dated or not, and none to the
    // history: a draft cannot ride the start-date split, and one dated last
    // week is still unfinished business.
    const planning = visibleEvents()
      .filter((event) => {
        if (past) {
          return event.publishedAt !== null && startMs(event) < boundary;
        }
        return event.publishedAt === null || startMs(event) >= boundary;
      })
      // `?q=` narrows either half, on the title or the place (#97).
      .filter((event) => q === "" || matchesSearch([event.title, event.location ?? ""], q))
      // `?tag=` narrows to the events carrying it (#107).
      .filter((event) => tag === null || event.tags.some((carried) => carried.id === Number(tag)))
      .sort((a, b) => (past ? compareStart(b, a) : compareStart(a, b)));

    return collection(planning.map(withMyAttendance).map(withCommitteeCounts), request);
  }),

  // Any member reads the tags; the count includes drafts, as the API's does.
  http.get("/api/v1/event-tags", ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    return collection(
      eventTags.map((tag) => ({
        ...tag,
        eventCount: eventsCarrying(tag.id),
      })),
      request,
    );
  }),

  // The single read the editor's rename and delete start from. Its tag is
  // over the tag alone, as EntityTag's is: another event being tagged
  // meanwhile must not refuse a rename.
  http.get("/api/v1/event-tags/:id", ({ params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }
    const found = eventTags.find((tag) => tag.id === Number(params.id));
    return found
      ? HttpResponse.json(
          { ...found, eventCount: eventsCarrying(found.id) },
          { headers: { ETag: mockEntityTag(found) } },
        )
      : notFound();
  }),

  http.post("/api/v1/event-tags", async ({ request }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }
    const body = (await request.json()) as StoreEventTagRequest;
    const invalid = refuseTagBody(body, null);
    if (invalid) {
      return invalid;
    }
    const tag: EventTagResource = {
      id: Math.max(0, ...eventTags.map((existing) => existing.id)) + 1,
      labelFr: body.labelFr.trim(),
      labelDe: body.labelDe?.trim() ? body.labelDe.trim() : null,
      colour: body.colour,
      celebrate: body.celebrate,
    };
    eventTags = [...eventTags, tag];
    return HttpResponse.json({ ...tag, eventCount: 0 }, { status: 201 });
  }),

  http.put("/api/v1/event-tags/:id", async ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }
    const existing = eventTags.find((tag) => tag.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    const body = (await request.json()) as StoreEventTagRequest;
    const invalid = refuseTagBody(body, existing.id);
    if (invalid) {
      return invalid;
    }
    const updated: EventTagResource = {
      ...existing,
      labelFr: body.labelFr.trim(),
      labelDe: body.labelDe?.trim() ? body.labelDe.trim() : null,
      colour: body.colour,
      celebrate: body.celebrate,
    };
    eventTags = eventTags.map((tag) => (tag.id === updated.id ? updated : tag));
    // The events carry a copy, as the API's eager load would hand back.
    events = events.map((event) => ({
      ...event,
      tags: tagsFromIds(event.tags.map((tag) => tag.id)),
    }));
    return HttpResponse.json({ ...updated, eventCount: eventsCarrying(updated.id) });
  }),

  http.delete("/api/v1/event-tags/:id", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }
    const existing = eventTags.find((tag) => tag.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    eventTags = eventTags.filter((tag) => tag.id !== existing.id);
    events = events.map((event) => ({
      ...event,
      tags: event.tags.filter((tag) => tag.id !== existing.id),
    }));
    return HttpResponse.json({ ok: true });
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
      template: Omit<EventResource, "id" | "startsAt" | "endsAt" | "publishedAt" | "tags"> & {
        startTime: string;
        endTime: string;
        tagIds?: number[];
      };
      dates: string[];
    };

    // One event per date, each independent — no series_id, nothing linking
    // them. The generator is the only thing that knows they arrived
    // together, and it forgets immediately.
    const created: EventResource[] = body.dates.map((date) => {
      const day = new Date(`${date}T00:00:00`);
      const offset = Math.round((day.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
      return {
        id: nextEventId++,
        title: body.template.title,
        tags: tagsFromIds(body.template.tagIds),
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
        answeredCount: null,
        answerableCount: null,
        guestCount: null,
        // A generated season is written as drafts: a wrong recurrence rule
        // must not land every date on everybody's planning at once.
        publishedAt: null,
      };
    });

    events = [...events, ...created];

    // ENVELOPED, and 201 is exactly why this one was missed the first time.
    // The generator answers with the events it just wrote, which is a
    // collection whatever status carries it, and the real middleware keys on
    // any successful JSON list body rather than on 200.
    return collection(created.map(withCommitteeCounts), request, 201);
  }),

  http.post("/api/v1/events", async ({ request }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    // Only the title is required: "I do not know the venue yet" is the reason
    // a draft gets written, and every create is a draft.
    const body = (await request.json()) as Partial<
      Omit<EventResource, "id" | "publishedAt" | "tags">
    > & {
      tagIds?: number[];
    };
    if (!body.title?.trim()) {
      return problem(400, "validation_failed", "Invalid form submission", [
        { field: "title", reason: "required" },
      ]);
    }
    const invalid = refuseIfEndsBeforeStart(body.startsAt ?? null, body.endsAt ?? null);
    if (invalid) {
      return invalid;
    }

    const event = withRegistrationFlag({
      id: nextEventId++,
      title: body.title,
      tags: tagsFromIds(body.tagIds),
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      location: body.location ?? null,
      attire: body.attire ?? null,
      isPublic: body.isPublic ?? false,
      notes: body.notes ?? null,
      registrationOpensAt: body.registrationOpensAt ?? null,
      registrationClosesAt: body.registrationClosesAt ?? null,
      registrationMaxGuests: body.registrationMaxGuests ?? null,
      takesRegistrations: false,
      myAttendance: null,
      answeredCount: null,
      answerableCount: null,
      guestCount: null,
      publishedAt: null,
    });
    events = [...events, event];
    return HttpResponse.json(withCommitteeCounts(event), { status: 201 });
  }),

  http.get("/api/v1/events/:id", ({ params }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    const event = visibleEvents().find((candidate) => candidate.id === Number(params.id));
    // The read the two conditional writes below start from. The event's tag
    // deliberately ignores `myAttendance`, which is the caller's own answer, so
    // answering an event does not invalidate a pending edit of it.
    return event
      ? HttpResponse.json(withCommitteeCounts(withMyAttendance(event)), {
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

    // `tagIds` is taken off before the spread below: it names tags, it is not
    // a field of the event, and absent means "keep them" as on the API.
    const { tagIds, ...patch } = (await request.json()) as Partial<
      Omit<EventResource, "id" | "publishedAt" | "tags">
    > & { tagIds?: number[] };

    // A DRAFT may lose its dates and location, a published event may not; the
    // stored row decides, not the request.
    if (existing.publishedAt !== null) {
      const cleared = (["startsAt", "endsAt", "location"] as const).filter(
        (field) => field in patch && patch[field] === null,
      );
      if (cleared.length > 0) {
        return problem(
          400,
          "validation_failed",
          "Invalid form submission",
          cleared.map((field) => ({ field, reason: "required" })),
        );
      }
    }

    const updated = withRegistrationFlag({
      ...existing,
      ...patch,
      tags: tagIds === undefined ? existing.tags : tagsFromIds(tagIds),
    });

    // The comparison reaches for the STORED start when the patch does not
    // carry one — the real Form Request's whole subtlety, mirrored so the
    // screen meets the same refusal.
    const invalid = refuseIfEndsBeforeStart(updated.startsAt, updated.endsAt);
    if (invalid) {
      return invalid;
    }

    events = events.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    return HttpResponse.json(withCommitteeCounts(updated), {
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

  // PUBLISHING is its own act. It owes the current tag, like the other
  // writes, and it is the only POST that does.
  http.post("/api/v1/events/:id/publish", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const existing = events.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(withoutMyAttendance(existing)));
    if (stale) {
      return stale;
    }

    // Already published is not an error, and moves nothing.
    if (existing.publishedAt === null) {
      const missing = (["startsAt", "endsAt", "location"] as const).filter(
        (field) => existing[field] === null,
      );
      if (missing.length > 0) {
        return problem(
          422,
          "event_incomplete",
          "The event is missing fields it needs to be published",
          missing.map((field) => ({ field, reason: "required" })),
        );
      }
    }

    const updated = {
      ...existing,
      publishedAt: existing.publishedAt ?? new Date().toISOString(),
    };
    events = events.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    return HttpResponse.json(withCommitteeCounts(withMyAttendance(updated)), {
      headers: { ETag: mockEntityTag(withoutMyAttendance(updated)) },
    });
  }),

  http.delete("/api/v1/events/:id/publish", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const existing = events.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(withoutMyAttendance(existing)));
    if (stale) {
      return stale;
    }

    if (existing.publishedAt !== null) {
      const answered = [...answers.keys()].some((key) => key.startsWith(`${existing.id}:`));
      const booked = registrations.some((booking) => booking.eventId === existing.id);
      if (answered || booked) {
        return conflict("event_has_answers", "Members have already answered or booked this event");
      }
    }

    const updated = { ...existing, publishedAt: null };
    events = events.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    return HttpResponse.json(withCommitteeCounts(withMyAttendance(updated)), {
      headers: { ETag: mockEntityTag(withoutMyAttendance(updated)) },
    });
  }),

  /* ---------------------------------------------------------------------- *
   * The image library (#105)
   * ---------------------------------------------------------------------- */

  // Newest first, like ImageController::index(). Registered before the
  // single-segment route below so `summary` is not read as an id.
  http.get("/api/v1/images", ({ request }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    return collection(
      [...images]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        .map(imageResource),
      request,
    );
  }),

  http.get("/api/v1/images/summary", () => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    return HttpResponse.json({
      count: images.length,
      capacity: IMAGE_CAPACITY,
      bytesTotal: images.reduce((total, image) => total + image.bytes, 0),
    });
  }),

  // One size of a photo, public, as ImageFileController serves it: the path
  // is the digest of the size's own bytes. Any other segment is left to the
  // `/images/{id}` route below, which answers 404 for it.
  http.get("/api/v1/images/:file", ({ params }) => {
    const file = /^([0-9a-f]{64})\.jpg$/.exec(String(params.file));
    if (!file) {
      return undefined;
    }
    for (const image of images) {
      const size = image.sizes.find((candidate) => candidate.sha256 === file[1]);
      if (!size) {
        continue;
      }
      const headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: `"${size.sha256}"`,
      };
      return size.data
        ? new HttpResponse(size.data, { headers: { ...headers, "Content-Type": "image/jpeg" } })
        : new HttpResponse(placeholderSvg(image, size), {
            headers: { ...headers, "Content-Type": "image/svg+xml" },
          });
    }
    return notFound();
  }),

  // `/images/{id}`, behind images.manage. `summary` is registered above.
  http.get("/api/v1/images/:segment", ({ params }) => {
    const segment = String(params.segment);

    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    const image = /^\d+$/.test(segment)
      ? images.find((candidate) => candidate.id === Number(segment))
      : undefined;
    if (!image) {
      return notFound();
    }
    const resource = imageResource(image);
    return HttpResponse.json(resource, { headers: { ETag: mockEntityTag(resource) } });
  }),

  http.post("/api/v1/images", async ({ request }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }

    const { files: parts, fields } = await multipartBody(request);
    if (parts.length === 0) {
      return invalidField("files", "required");
    }
    const named = photoNameOrReason(fields.get("name"));
    if ("reason" in named) {
      return invalidField("name", named.reason);
    }
    const sizes = await checkedSizes(parts);
    if (sizes instanceof Response) {
      return sizes;
    }
    const largest = sizes[0] as MockSize & { data: Uint8Array<ArrayBuffer> };

    // The duplicate answers before the cap does, as the controller orders it:
    // a photo the library already holds is returned even when it is full.
    const sha256 = await sha256Hex(largest.data);
    const existing = images.find((candidate) => candidate.sha256 === sha256);
    if (existing) {
      return HttpResponse.json(imageResource(existing));
    }
    if (images.length >= IMAGE_CAPACITY) {
      return problem(409, "image_library_full", "The image library is full");
    }

    const created: MockImage = {
      id: nextImageId++,
      name: named.name,
      sha256,
      width: largest.width,
      height: largest.height,
      bytes: sizes.reduce((total, size) => total + size.bytes, 0),
      sizes: [...sizes].reverse(),
      createdAt: new Date().toISOString(),
    };
    images = [...images, created];
    return HttpResponse.json(imageResource(created), { status: 201 });
  }),

  // ImageController::update(): a new name, trimmed, under If-Match.
  http.patch("/api/v1/images/:id", async ({ request, params }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    const image = images.find((candidate) => candidate.id === Number(params.id));
    if (!image) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(imageResource(image)));
    if (stale) {
      return stale;
    }
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const named = photoNameOrReason(body.name);
    if ("reason" in named) {
      return invalidField("name", named.reason);
    }
    const renamed = { ...image, name: named.name };
    images = images.map((candidate) => (candidate.id === image.id ? renamed : candidate));
    const resource = imageResource(renamed);
    return HttpResponse.json(resource, { headers: { ETag: mockEntityTag(resource) } });
  }),

  // ImageController::replace(): new sizes for the same id, checked as an
  // upload is. Its own photo again changes nothing; another image's photo is
  // a 409.
  http.post("/api/v1/images/:id/file", async ({ request, params }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    const image = images.find((candidate) => candidate.id === Number(params.id));
    if (!image) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(imageResource(image)));
    if (stale) {
      return stale;
    }
    const { files: parts } = await multipartBody(request);
    if (parts.length === 0) {
      return invalidField("files", "required");
    }
    const sizes = await checkedSizes(parts);
    if (sizes instanceof Response) {
      return sizes;
    }
    const largest = sizes[0] as MockSize & { data: Uint8Array<ArrayBuffer> };
    const sha256 = await sha256Hex(largest.data);

    let current = image;
    if (sha256 !== image.sha256) {
      if (images.some((candidate) => candidate.sha256 === sha256)) {
        return conflict("image_already_in_library", "Another image already holds this photo");
      }
      current = {
        ...image,
        sha256,
        width: largest.width,
        height: largest.height,
        bytes: sizes.reduce((total, size) => total + size.bytes, 0),
        sizes: [...sizes].reverse(),
      };
      images = images.map((candidate) => (candidate.id === image.id ? current : candidate));
    }
    const resource = imageResource(current);
    return HttpResponse.json(resource, { headers: { ETag: mockEntityTag(resource) } });
  }),

  http.delete("/api/v1/images/:id", ({ request, params }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    const image = images.find((candidate) => candidate.id === Number(params.id));
    if (!image) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(imageResource(image)));
    if (stale) {
      return stale;
    }
    if (imageResource(image).usages.length > 0) {
      return conflict("image_in_use", "This image is still shown on the site");
    }
    images = images.filter((candidate) => candidate.id !== image.id);
    return HttpResponse.json({ ok: true });
  }),

  // One slot per write, a single value and so with no If-Match, as
  // PhotoSlotController does it. The name is free within PhotoSlot::KEY.
  http.put("/api/v1/photo-slots/:slot", async ({ request, params }) => {
    const refusal = refuseWithout("images.manage");
    if (refusal) {
      return refusal;
    }
    const slot = String(params.slot);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(slot)) {
      return notFound();
    }
    const body = (await request.clone().json()) as { label?: string | null; path?: string | null };
    const placed = await placedImageId(request);
    if (placed instanceof Response) {
      return placed;
    }
    if (placed.imageId === null) {
      photoSlots = Object.fromEntries(Object.entries(photoSlots).filter(([name]) => name !== slot));
    } else {
      photoSlots = {
        ...photoSlots,
        [slot]: { imageId: placed.imageId, label: body.label ?? null, path: body.path ?? null },
      };
    }
    return HttpResponse.json({ photo: photoOf(placed.imageId) });
  }),

  /* ---------------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------------- */

  // PUBLIC, like the real list, and oldest first.
  http.get("/api/v1/history", ({ request }) =>
    collection(
      [...historyEntries].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id),
      request,
    ),
  ),

  http.get("/api/v1/history/:id", ({ params }) => {
    const refusal = refuseWithout("history.manage");
    if (refusal) {
      return refusal;
    }
    const found = historyEntries.find((candidate) => candidate.id === Number(params.id));
    return found
      ? HttpResponse.json(found, { headers: { ETag: mockEntityTag(found) } })
      : notFound();
  }),

  http.post("/api/v1/history", async ({ request }) => {
    const refusal = refuseWithout("history.manage");
    if (refusal) {
      return refusal;
    }
    const raw = (await request.json()) as StoreHistoryEntryRequest;
    const body = normaliseHistory(raw);
    if (!hasHistoryText(body)) {
      return problem(422, "history_entry_empty", "A history entry needs a title or a text");
    }
    const now = new Date().toISOString();
    const created: HistoryEntryResource = {
      ...body,
      id: nextHistoryId++,
      createdAt: now,
      updatedAt: now,
    };
    historyEntries = [...historyEntries, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.put("/api/v1/history/:id", async ({ request, params }) => {
    const refusal = refuseWithout("history.manage");
    if (refusal) {
      return refusal;
    }
    const existing = historyEntries.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    const raw = (await request.json()) as StoreHistoryEntryRequest;
    const body = normaliseHistory(raw);
    if (!hasHistoryText(body)) {
      return problem(422, "history_entry_empty", "A history entry needs a title or a text");
    }
    const updated: HistoryEntryResource = {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    historyEntries = historyEntries.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );
    return HttpResponse.json(updated, { headers: { ETag: mockEntityTag(updated) } });
  }),

  http.delete("/api/v1/history/:id", ({ request, params }) => {
    const refusal = refuseWithout("history.manage");
    if (refusal) {
      return refusal;
    }
    const existing = historyEntries.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    historyEntries = historyEntries.filter((candidate) => candidate.id !== existing.id);
    // Its photo slot goes with it, as HistoryEntryController::destroy() does.
    photoSlots = Object.fromEntries(
      Object.entries(photoSlots).filter(([name]) => name !== `history-${existing.id}`),
    );
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
    const hidden = refuseDraft(event, false);
    if (hidden) {
      return hidden;
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
    const draft = refuseDraft(event, true);
    if (draft) {
      return draft;
    }

    if (!currentUser.isPlayer) {
      return notAnswerable();
    }

    const body = (await request.json()) as RecordOwnAttendanceRequest;
    const key = answerKey(event.id, currentUser.id);
    const existing = answers.get(key) ?? null;

    // Taking back a yes costs a reason (ADR 0018). It lands as an ORDINARY
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

  // UNDO, and it expires after five minutes.
  http.delete("/api/v1/events/:id/attendance", ({ params }) => {
    if (!currentUser) {
      return unauthenticated();
    }

    const target = events.find((candidate) => candidate.id === Number(params.id));
    const draft = target ? refuseDraft(target, true) : null;
    if (draft) {
      return draft;
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
    const draft = refuseDraft(event, true);
    if (draft) {
      return draft;
    }

    const member = members.find((candidate) => candidate.id === Number(params.member));
    if (!member) {
      return notFound();
    }

    // The caller's own row is refused, checked BEFORE answerability, exactly
    // as the real controller orders it. This route is exempt from the
    // withdrawal reason rule, which is
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
      // NO REASON REQUIRED, withdrawal included (ADR 0018): the committee is
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

    const target = events.find((candidate) => candidate.id === Number(params.id));
    const draft = target ? refuseDraft(target, true) : null;
    if (draft) {
      return draft;
    }

    const memberId = Number(params.member);
    if (currentUser?.id === memberId) {
      return conflict("cannot_record_for_self", "Answer for yourself from the planning");
    }

    answers.delete(answerKey(Number(params.id), memberId));
    return HttpResponse.json({ ok: true });
  }),

  /* ---------------------------------------------------------------------- *
   * Registration
   * ---------------------------------------------------------------------- */

  // What the public booking form needs to render itself. ANONYMOUS, and 404
  // for an event that takes no bookings whether or not it exists — a stranger
  // must not be able to walk the ids and learn the band's planning.
  //
  // An event that IS enabled but outside its window answers 200 with
  // `open: false`, so the form can say when bookings start or that they have
  // closed. `open` is the server's answer and never derived from the two
  // dates by the client, whose clock may be wrong.
  http.get("/api/v1/events/:id/registration", ({ params }) => {
    const event = events.find((candidate) => candidate.id === Number(params.id));

    // A draft is a 404 here for EVERYONE, a logged-in manager included: the
    // public routes are the visitor's view of the event.
    if (!event || event.publishedAt === null || event.registrationClosesAt === null) {
      return notFound();
    }

    return HttpResponse.json({
      event: publicEvent(event),
      options: optionsFor(event.id),
      maxGuests: event.registrationMaxGuests,
      opensAt: event.registrationOpensAt,
      closesAt: event.registrationClosesAt,
      open: registrationIsOpen(event),
    });
  }),

  // Booking a place. The second anonymous write in the whole API, and it
  // meets the same three protections the contact form does — see that handler
  // for why the two-second floor is the server's alone.
  http.post("/api/v1/events/:id/registrations", async ({ request, params }) => {
    const event = events.find((candidate) => candidate.id === Number(params.id));

    // BEFORE the guard and before validation, matching
    // StoreRegistrationRequest::prepareForValidation. With this check later,
    // booking an event that takes none answered a complaint about
    // `choices.0.optionId` — because the option genuinely is not this
    // event's — and leaked that the event exists. A draft answers the same 404.
    if (!event || event.publishedAt === null || event.registrationClosesAt === null) {
      return notFound();
    }

    const body = (await request.json()) as Partial<StoreRegistrationRequest>;

    if (request.headers.get("X-Form-Token") !== MOCK_FORM_TOKEN || body.website !== "") {
      return problem(422, "spam_suspected", "Submission looks automated");
    }

    const key = request.headers.get("Idempotency-Key");
    if (key === null) {
      return problem(400, "idempotency_key_required", "Idempotency-Key header required");
    }
    if (key.length < 16 || key.length > 255) {
      return problem(400, "idempotency_key_invalid", "Idempotency-Key is not usable");
    }

    if (!registrationIsOpen(event)) {
      // Two codes, because the two are different news: "come back on the 3rd"
      // and "you have missed it" send the reader to different places.
      return event.registrationOpensAt !== null &&
        Date.parse(event.registrationOpensAt) > Date.now()
        ? conflict("registration_not_open", "Registration has not opened yet")
        : conflict("registration_closed", "Registration has closed");
    }

    const required: (keyof StoreRegistrationRequest)[] = [
      "firstName",
      "lastName",
      "email",
      "phone",
    ];
    const missing = required.filter((field) => String(body[field] ?? "").trim() === "");
    const chosen = (body.choices ?? []).filter((choice) => choice.quantity > 0);

    if (missing.length > 0 || chosen.length === 0) {
      return problem(400, "validation_failed", "Invalid form submission", [
        ...missing.map((field) => ({ field, reason: "required" })),
        ...(chosen.length === 0 ? [{ field: "choices", reason: "required" }] : []),
      ]);
    }

    // The per-booking cap, which is a property of the WHOLE choices array
    // against a number on the event — so it is raised against `choices` and
    // its token is PARAMLESS, exactly as the closure validator on the server
    // must be: that path emits field and reason only, and an interpolating
    // French string would print a literal {{max}} on a guest's screen.
    const guests = chosen.reduce((sum, choice) => sum + choice.quantity, 0);
    if (event.registrationMaxGuests !== null && guests > event.registrationMaxGuests) {
      return problem(400, "validation_failed", "Invalid form submission", [
        { field: "choices", reason: "too_many_guests" },
      ]);
    }

    const eventOptions = optionsFor(event.id);
    const choices: RegistrationResourceChoicesItem[] = [];

    for (const choice of chosen) {
      const option = eventOptions.find((candidate) => candidate.id === choice.optionId);
      if (!option) {
        return problem(400, "validation_failed", "Invalid form submission", [
          { field: "choices.0.optionId", reason: "exists" },
        ]);
      }
      choices.push({
        optionId: option.id,
        label: option.label,
        quantity: choice.quantity,
        priceCents: option.priceCents,
      });
    }

    const booking: MockRegistration = {
      eventId: event.id,
      id: nextRegistrationId++,
      firstName: String(body.firstName),
      lastName: String(body.lastName),
      email: String(body.email),
      phone: String(body.phone),
      address: body.address?.trim() ? body.address : null,
      tableName: body.tableName?.trim() ? body.tableName : null,
      choices,
      ...totalsOf(choices),
      paidAt: null,
      createdAt: new Date().toISOString(),
    };

    registrations = [...registrations, booking];

    return HttpResponse.json(published(booking), { status: 201 });
  }),

  // THE GUEST LIST. `registrations.view` and nothing more — the `committee`
  // role holds that as its only permission, so this must not also let anybody
  // amend or cancel.
  http.get("/api/v1/events/:id/registrations", ({ request, params }) => {
    const refusal = refuseWithout("registrations.view");
    if (refusal) {
      return refusal;
    }

    const listed = events.find((candidate) => candidate.id === Number(params.id));
    const hidden = listed ? refuseDraft(listed, false) : null;
    if (hidden) {
      return hidden;
    }

    return collection(
      registrations
        .filter((registration) => registration.eventId === Number(params.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(published),
      request,
    );
  }),

  // The same list as a file. THE XLSX BODY IS A PLACEHOLDER and not a real
  // workbook: nothing in the SPA parses it — the screen hands the blob
  // straight to the browser — so what a test of this can establish is that the
  // request is made, refused or allowed, and named. The other three are the
  // real thing, because they are legible and cost nothing to produce honestly.
  http.get("/api/v1/events/:id/registrations.:format", ({ params }) => {
    const refusal = refuseWithout("registrations.view");
    if (refusal) {
      return refusal;
    }

    const format = String(params.format);
    const event = events.find((candidate) => candidate.id === Number(params.id));
    const hidden = event ? refuseDraft(event, false) : null;
    if (hidden) {
      return hidden;
    }
    const list = guestListOf(Number(params.id));
    const stem =
      (event?.title ?? "evenement")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") + "-inscriptions";

    const attachment = (type: string, body: BodyInit) =>
      new HttpResponse(body, {
        headers: {
          "Content-Type": type,
          "Content-Disposition": `attachment; filename="${stem}.${format}"`,
        },
      });

    const cell = (value: string | number | null) => (value === null ? "" : String(value));

    if (format === "json") {
      return HttpResponse.json(list, {
        headers: { "Content-Disposition": `attachment; filename="${stem}.json"` },
      });
    }

    if (format === "csv") {
      // The BOM and the semicolons are the server's, and they are the whole
      // reason that export is usable: Swiss Excel reads a BOM-less UTF-8 CSV
      // in the system codepage and splits on ';', not ','.
      const lines = [list.headers, ...list.rows, list.totals].map((row) =>
        row.map((value) => `"${cell(value).replace(/"/g, '""')}"`).join(";"),
      );
      return attachment("text/csv; charset=UTF-8", `\ufeff${lines.join("\r\n")}\r\n`);
    }

    if (format === "md") {
      const line = (row: (string | number | null)[]) => `| ${row.map(cell).join(" | ")} |`;
      const body = [
        line(list.headers),
        `| ${list.headers.map(() => "---").join(" | ")} |`,
        ...list.rows.map(line),
        line(list.totals),
      ].join("\n");
      return attachment("text/markdown; charset=UTF-8", `${body}\n`);
    }

    return attachment(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "not a real workbook: see the mocked backend",
    );
  }),

  // The read the two conditional writes below start from, and the reason it
  // is gated on `registrations.manage` rather than on view: it exists for the
  // people who amend a booking, and the guest list already shows the rest of
  // the committee everything it carries.
  http.get("/api/v1/registrations/:id", ({ params }) => {
    const refusal = refuseWithout("registrations.manage");
    if (refusal) {
      return refusal;
    }

    const booking = registrations.find((candidate) => candidate.id === Number(params.id));
    if (!booking) {
      return notFound();
    }

    return HttpResponse.json(published(booking), {
      headers: { ETag: registrationTag(booking) },
    });
  }),

  http.patch("/api/v1/registrations/:id", async ({ request, params }) => {
    const refusal = refuseWithout("registrations.manage");
    if (refusal) {
      return refusal;
    }

    const index = registrations.findIndex((candidate) => candidate.id === Number(params.id));
    const existing = registrations[index];
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, registrationTag(existing));
    if (stale) {
      return stale;
    }

    const patch = (await request.json()) as UpdateRegistrationRequest;

    // WHAT WAS ORDERED IS NOT EDITABLE, and the allow-list is what says so:
    // `choices` on the body is ignored rather than applied, matching
    // UpdateRegistrationRequest, which has no such field. A wrong order is
    // cancelled and re-booked.
    const updated: MockRegistration = {
      ...existing,
      firstName: patch.firstName ?? existing.firstName,
      lastName: patch.lastName ?? existing.lastName,
      email: patch.email ?? existing.email,
      phone: patch.phone ?? existing.phone,
      // array_key_exists, not `??`: both an omitted field and an explicit
      // null are nullish, so `??` would make clearing an address silently do
      // nothing — the exact trap the server's own comment names.
      address: "address" in patch ? (patch.address ?? null) : existing.address,
      tableName: "tableName" in patch ? (patch.tableName ?? null) : existing.tableName,
      // A second `true` keeps the first stamp, as the server does: the stamp
      // records when the money came in.
      paidAt:
        patch.paid === undefined
          ? existing.paidAt
          : patch.paid
            ? (existing.paidAt ?? new Date().toISOString())
            : null,
    };

    registrations = registrations.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    );

    return HttpResponse.json(published(updated), {
      headers: { ETag: registrationTag(updated) },
    });
  }),

  http.delete("/api/v1/registrations/:id", ({ request, params }) => {
    const refusal = refuseWithout("registrations.manage");
    if (refusal) {
      return refusal;
    }

    const existing = registrations.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, registrationTag(existing));
    if (stale) {
      return stale;
    }

    registrations = registrations.filter((candidate) => candidate.id !== existing.id);
    return HttpResponse.json({ ok: true });
  }),

  // WHAT AN EVENT OFFERS IS PART OF THE EVENT, so both of these are
  // `events.manage` rather than a registration permission — the same act as
  // setting its date.
  http.get("/api/v1/events/:id/registration-options", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const eventId = Number(params.id);

    // An empty list rather than a 404 for an event taking no bookings, unlike
    // the public read: configuring an event that does not take them YET is
    // exactly when the committee opens this.
    return collection(optionsFor(eventId), request, 200, {
      ETag: optionsTag(eventId),
    });
  }),

  http.put("/api/v1/events/:id/registration-options", async ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const eventId = Number(params.id);
    if (!events.some((candidate) => candidate.id === eventId)) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, optionsTag(eventId));
    if (stale) {
      return stale;
    }

    const incoming = ((await request.json()) as ReplaceRegistrationOptionsRequest).options;

    const labelled = (id: number) =>
      registrations.some(
        (registration) =>
          registration.eventId === eventId &&
          registration.choices.some((choice) => choice.optionId === id),
      );

    // CHECKED BEFORE ANYTHING IS WRITTEN, and against what SURVIVES rather
    // than against the ids sent: an entry with no id adopts an existing
    // option of the same label, which is what makes a replayed first save
    // converge instead of deleting and re-creating the list. Checking ids
    // alone would refuse a plain retry.
    const keptIds = incoming
      .map((option) => option.id)
      .filter((id): id is number => typeof id === "number");
    const labels = incoming.map((option) => option.label);

    const booked = options
      .filter((option) => option.eventId === eventId)
      .filter((option) => !keptIds.includes(option.id) && !labels.includes(option.label))
      .filter((option) => labelled(option.id));

    if (booked.length > 0) {
      return conflict(
        "option_has_registrations",
        `An option cannot be removed while people have booked it: ${booked
          .map((option) => option.label)
          .join(", ")}`,
      );
    }

    const claimed: number[] = [];
    let next = options.filter((option) => option.eventId !== eventId);

    incoming.forEach((option, index) => {
      const adopted =
        option.id ??
        options.find(
          (candidate) => candidate.eventId === eventId && candidate.label === option.label,
        )?.id;

      const id = adopted ?? nextOptionId++;
      claimed.push(id);

      next = [
        ...next,
        {
          eventId,
          id,
          label: option.label,
          description: option.description ?? null,
          priceCents: option.priceCents ?? null,
          // Falls back to the entry's position, so a client sending the list
          // in order gets that order without numbering it.
          sortOrder: option.sortOrder ?? index,
        },
      ];
    });

    options = next.filter((option) => option.eventId !== eventId || claimed.includes(option.id));

    return collection(optionsFor(eventId), request, 200, { ETag: optionsTag(eventId) });
  }),

  /* ---------------------------------------------------------------------- *
   * The committee inbox
   * ---------------------------------------------------------------------- */

  // FILTERED, NOT REFUSED — mirrors InboxRegistry exactly: a caller holding
  // none of the relevant permissions gets an empty inbox rather than a 403,
  // because the nav badge has to stay safe to call before anybody has worked
  // out what a session may act on.
  http.get("/api/v1/inbox", ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    return collection(mayReadMessages() ? openContactMessages().map(toInboxItem) : [], request);
  }),

  // NOT A LIST: bare {total, counts}, matching InboxController::summary
  // exactly. `counts` is an OBJECT even when it is empty, never `[]` — the
  // real API forces this with an `(object)` cast, because a client reading
  // `counts.contactMessage` against an array is a different bug.
  http.get("/api/v1/inbox/summary", () => {
    if (!currentUser) {
      return unauthenticated();
    }
    const open = mayReadMessages() ? openContactMessages().length : 0;
    const counts: InboxSummary200Counts = mayReadMessages() ? { contactMessage: open } : {};
    return HttpResponse.json({ total: open, counts });
  }),

  // THE ARCHIVE. Gated on messages.view, unlike the inbox above: a caller who
  // may not read a message must not be able to count them either by paging
  // through this instead.
  http.get("/api/v1/contact-messages", ({ request }) => {
    const refusal = refuseWithout("messages.view");
    if (refusal) {
      return refusal;
    }
    const handled = new URL(request.url).searchParams.get("handled");
    const rows =
      handled === null
        ? contactMessages
        : contactMessages.filter((message) => (message.handledAt !== null) === (handled === "1"));
    return collection(rows, request);
  }),

  // ONE MESSAGE, UNWRAPPED, carrying the ETag the two writes below require —
  // the list above hands out none, so a screen acting straight from a row
  // would be refused with 428.
  http.get("/api/v1/contact-messages/:id", ({ params }) => {
    const refusal = refuseWithout("messages.view");
    if (refusal) {
      return refusal;
    }
    const message = contactMessages.find((candidate) => candidate.id === Number(params.id));
    if (!message) {
      return notFound();
    }
    return HttpResponse.json(message, { headers: { ETag: mockEntityTag(message) } });
  }),

  // Marking a message handled, or putting it back — reopening is not an
  // error, exactly as ContactMessageController::handle documents it: a
  // message marked handled by mistake is a normal thing to correct.
  http.patch("/api/v1/contact-messages/:id", async ({ request, params }) => {
    const refusal = refuseWithout("messages.manage");
    if (refusal) {
      return refusal;
    }
    const index = contactMessages.findIndex((candidate) => candidate.id === Number(params.id));
    // Reading the row IS the existence check: noUncheckedIndexedAccess types
    // contactMessages[index] as possibly undefined, and findIndex's -1 lands
    // there too.
    const existing = contactMessages[index];
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    const body = (await request.json()) as Partial<HandleContactMessageRequest>;
    const updated: ContactMessageResource = {
      ...existing,
      handledAt: body.handled ? isoNowUtc() : null,
      handledBy: body.handled ? actorDisplayName() : null,
    };
    contactMessages[index] = updated;
    return HttpResponse.json(updated, { headers: { ETag: mockEntityTag(updated) } });
  }),

  // Deleting what the spam guard did not catch. Requires If-Match, so a
  // message somebody else has just dealt with cannot be removed by a screen
  // that has not seen that yet.
  http.delete("/api/v1/contact-messages/:id", ({ request, params }) => {
    const refusal = refuseWithout("messages.manage");
    if (refusal) {
      return refusal;
    }
    const index = contactMessages.findIndex((candidate) => candidate.id === Number(params.id));
    const existing = contactMessages[index];
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, mockEntityTag(existing));
    if (stale) {
      return stale;
    }
    contactMessages.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

/**
 * Order matters: MSW uses the FIRST matching handler, so the hand-written ones
 * must come before the generated catch-alls.
 */
export const handlers = [...overrides, ...getLesCanetonsAPIMock()];
