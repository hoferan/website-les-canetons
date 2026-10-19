import { HttpResponse, http } from "msw";

import type { ApiErrorField } from "../api/http";
import { StoreRoleRequestPermissionsItem } from "../api/generated/model";
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
  ReorderSectionsRequest,
  SectionResource,
  StoreHistoryEntryRequest,
  StoreEventTagRequest,
  StoreSectionRequest,
} from "../api/generated/model";

/**
 * The mocked backend, so the SPA can be developed and tested with no Docker.
 *
 * The bulk is generated from api/openapi.json, so it cannot describe a
 * contract the real API does not have. A handful of handlers are hand-written
 * on top, because faker data describes shape and this project needs content:
 * a page laid out around "Lorem ipsum" says nothing about whether the real
 * French copy fits.
 *
 * Authentication is real rather than a role switcher: POST /login accepts the
 * accounts DevSeeder creates (api/database/seeders/DevSeeder.php), and GET /me
 * reports whoever logged in in the shape AuthController::me returns, so the
 * mocked app exercises the actual login flow and guards.
 *
 * orval derives the aggregate's name, getLesCanetonsAPIMock, from the OpenAPI
 * document's title, which is why tools/openapi.mjs pins APP_NAME.
 *
 * It keeps state: a screen that creates a member and then lists them sees
 * what it created, so a test asserts against a flow, not a fixture.
 */

// The generated model, so a shape change in AuthController::me is a compile
// error here.
type MockUser = AuthMe200;

/** Seeded roles as /me names them: by key, with no typed name. */
function seeded(...keys: string[]): MockUser["roles"] {
  return keys.map((key) => ({ key, labelFr: null, labelDe: null }));
}

const USERS = {
  // Organises, does not play. Mirrors DevSeeder's demo.direction.
  "demo.direction": {
    id: 1,
    username: "demo.direction",
    firstName: "Dominique",
    lastName: "Direction",
    mustChangePassword: false,
    sectionName: null,
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("direction", "member"),
    permissions: [
      "events.manage",
      "attendance.view_all",
      "attendance.record_for_others",
      "members.manage",
      "registrations.view",
      "registrations.manage",
      // Migration 2026_09_15_000002: `direction` reads and clears the inbox.
      "messages.view",
      "messages.manage",
      "history.manage",
      "images.manage",
      "roles.manage",
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
    mustChangePassword: false,
    sectionName: "Cloches",
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member", "musician"),
    permissions: ["events.view", "account.manage", "attendance.respond"],
  },
  // An organiser who also plays; DevSeeder's comment says why this case
  // matters.
  //
  // mustChangePassword matches this id's roster row in initialMembers():
  // POST /me/password treats the session and the roster row as one fact, so
  // edit both together.
  "demo.both": {
    id: 3,
    username: "demo.both",
    firstName: "Bastien",
    lastName: "Both",
    mustChangePassword: true,
    sectionName: "Trompettes",
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("direction", "member", "musician"),
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
      "roles.manage",
      "events.view",
      "account.manage",
      "attendance.respond",
    ],
  },
  // The `committee` role: registrations.view, and messages.view because a
  // prestation enquiry is committee business. Both are read-only, so this
  // account proves the guards read a permission rather than "is this person
  // privileged".
  "demo.committee": {
    id: 4,
    username: "demo.committee",
    firstName: "Camille",
    lastName: "Committee",
    mustChangePassword: false,
    sectionName: "Trombones",
    sectionNameDe: null,
    committeeFunctionName: "Responsable intendance",
    roles: seeded("committee", "member", "musician"),
    permissions: [
      "registrations.view",
      "messages.view",
      "events.view",
      "account.manage",
      "attendance.respond",
    ],
  },
  // A first login: a committee-issued password that must be replaced. A
  // session fixture with no roster row, since what it represents is a state
  // of the session. Its id is above the seeded roster's (1 to 5), though the
  // first member created in the mock is also given 6.
  "demo.mustchange": {
    id: 6,
    username: "demo.mustchange",
    firstName: "Marceau",
    lastName: "Nouveau",
    mustChangePassword: true,
    sectionName: "Cloches",
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member", "musician"),
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
    mustChangePassword: false,
    sectionName: null,
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member"),
    permissions: ["members.manage", "history.manage", "events.view", "account.manage"],
  },
  // A young member whose parent uses the login on their behalf. Plays and
  // holds no organising permission.
  "demo.young": {
    id: 5,
    username: "demo.young",
    firstName: "Nadia",
    lastName: "Sansconnexion",
    mustChangePassword: false,
    sectionName: "Batteurs",
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member", "musician"),
    permissions: ["events.view", "account.manage", "attendance.respond"],
  },
  // The two cases that prove the register is display only (#192), session
  // fixtures with no roster row. One sits in a register without musician, so
  // nothing asks them to answer; the other holds musician in no register, and
  // is asked.
  "demo.registeronly": {
    id: 8,
    username: "demo.registeronly",
    firstName: "Rita",
    lastName: "Registeronly",
    mustChangePassword: false,
    sectionName: "Cloches",
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member"),
    permissions: ["events.view", "account.manage"],
  },
  "demo.unplaced": {
    id: 9,
    username: "demo.unplaced",
    firstName: "Ulysse",
    lastName: "Unplaced",
    mustChangePassword: false,
    sectionName: null,
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded("member", "musician"),
    permissions: ["events.view", "account.manage", "attendance.respond"],
  },
  // No role at all, not even the baseline: the API refuses to produce this
  // (#193), so only a hand edit in the database leaves an account like it.
  // It proves that /events and /account ask for a permission, not a session.
  "demo.nobaseline": {
    id: 10,
    username: "demo.nobaseline",
    firstName: "Noé",
    lastName: "Sansrole",
    mustChangePassword: false,
    sectionName: null,
    sectionNameDe: null,
    committeeFunctionName: null,
    roles: seeded(),
    permissions: [],
  },
} satisfies Record<string, MockUser>;

/**
 * The mocked session, persisted per tab.
 *
 * MSW's handlers run in the page, not in the service worker, so module state
 * dies with every reload, while a real Sanctum session (a cookie) survives
 * one. sessionStorage is the closest analogue: scoped to one tab, gone with
 * it, invisible to any other test or window. Reads and writes are wrapped
 * because it throws in a few contexts (a browser set to block site data),
 * where forgetting the session is the right fallback.
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
 * Drops the session when the tab no longer has it, checked on every request.
 *
 * A real session lives in a cookie, so it can expire while a page is open,
 * and the next request is the first to hear of it. Module state only reads
 * the stored session at load. Checking on each request lets an e2e spec
 * expire the session mid-page by removing the key, the way login.spec.ts does
 * before a full load.
 *
 * Only the removal is read back. A login in some other way than the handlers
 * would be a different seam, and nothing needs one.
 */
function forgetLostSession(): void {
  try {
    if (currentUser && globalThis.sessionStorage?.getItem(SESSION_KEY) === null) {
      currentUser = null;
    }
  } catch {
    // Storage is blocked, so module state is the only session there is.
  }
}

/**
 * Test seam: who the mocked backend currently believes is logged in.
 *
 * It exists for logout: the button hands the browser to `/` with a full page
 * load, which jsdom does not perform, so a test sees the server half only by
 * asking the mock whether the session is gone.
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
 * App\Exceptions\ApiError::json(), so the error shape cannot drift between
 * call sites.
 *
 * `instance` is the one member this mock does not always fill: resolvers that
 * destructure `request` pass a path, the rest send an empty string. It is in
 * the contract for a third party reading a log, and nothing in the SPA reads
 * it.
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
      // Fixed, so screenshots and snapshots do not change on every run.
      requestId: MOCK_REQUEST_ID,
      // The real API takes this from App\Support\ErrorVocabulary by code.
      // Nothing in the SPA reads `detail`, so the mock does not copy that list.
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
 * The registers, mirroring migration 2026_09_07_000001 exactly: the band's
 * own order, ids in insertion order, so a mocked screen shows the registers a
 * real server has.
 */
function initialSections(): SectionResource[] {
  return [
    { id: 1, name: "Batteurs", nameDe: null, sortOrder: 1 },
    { id: 2, name: "Grosses-caisses", nameDe: null, sortOrder: 2 },
    { id: 3, name: "Lyre", nameDe: null, sortOrder: 3 },
    { id: 4, name: "Cloches", nameDe: null, sortOrder: 4 },
    { id: 5, name: "Trompettes", nameDe: null, sortOrder: 5 },
    { id: 6, name: "Trombones", nameDe: null, sortOrder: 6 },
  ];
}

/** Mutable, for the register editor; always kept in display order. */
let sections: SectionResource[] = initialSections();

/** A register as the list and the single read answer it: with who plays in and teaches it. */
function sectionRead(section: SectionResource): SectionResource {
  return {
    ...section,
    playerCount: members.filter((member) => member.sectionId === section.id).length,
    instructorCount: members.filter((member) => member.instructorOfSectionId === section.id).length,
  };
}

/** The tag, over the register alone, as EntityTag's is: the counts move with the roster. */
function sectionTag(section: SectionResource): string {
  return mockEntityTag({
    id: section.id,
    name: section.name,
    nameDe: section.nameDe,
    sortOrder: section.sortOrder,
  });
}

function refuseSectionBody(body: StoreSectionRequest, self: number | null) {
  const name = body.name?.trim() ?? "";
  if (name === "") {
    return problem(400, "validation_failed", "Invalid form submission", [
      { field: "name", reason: "required" },
    ]);
  }
  const taken = sections.some((section) => section.id !== self && section.name === name);
  return taken
    ? problem(400, "validation_failed", "Invalid form submission", [
        { field: "name", reason: "already_taken" },
      ])
    : null;
}

/**
 * The committee's seats, mirroring migration 2026_09_14_000001 exactly: the
 * band's rank order, ids in insertion order. The order is the reason the
 * table exists, so an alphabetical mock would hide the bug it prevents.
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
 * The seeded roles and what each grants, `direction` including the tokens
 * later migrations granted it.
 *
 * No typed name on any of them, as on a real database nobody has edited: the
 * UI resolves the name from `key` through web/src/i18n/fr.ts. A role made in
 * the mocked editor gets the names it was given.
 */
function initialRoles(): RoleResource[] {
  return [
    {
      id: 1,
      key: "direction",
      labelFr: null,
      labelDe: null,
      isBaseline: false,
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
        "roles.manage",
      ],
    },
    {
      id: 2,
      key: "committee",
      labelFr: null,
      labelDe: null,
      isBaseline: false,
      permissions: ["registrations.view", "messages.view"],
    },
    {
      id: 3,
      key: "member",
      labelFr: null,
      labelDe: null,
      isBaseline: true,
      permissions: ["events.view", "account.manage"],
    },
    {
      id: 4,
      key: "musician",
      labelFr: null,
      labelDe: null,
      isBaseline: false,
      permissions: ["attendance.respond"],
    },
  ];
}

/**
 * Mutable, like the roster: the mocked role editor changes it, and
 * resetRoles() puts the seeded four back between tests. Changed in place, so
 * every handler holding the array sees the same one.
 */
const ROLES: RoleResource[] = initialRoles();
let nextRoleId = 5;

function resetRoles(): void {
  ROLES.splice(0, ROLES.length, ...initialRoles());
  nextRoleId = 5;
}

/** One role as GET /roles/{role} renders it: with who holds it, by last name. */
function roleRead(role: RoleResource): RoleResource {
  const holders = members
    .filter((member) => member.roleIds.includes(role.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map((member) => ({ id: member.id, firstName: member.firstName, lastName: member.lastName }));
  return { ...role, holders };
}

/**
 * What every role write does first, in the real API's order: the permission,
 * the role, the tag (ConditionalWrite runs before the controller), then the
 * baseline, which no write may touch.
 */
async function roleForWrite(request: Request, id: number): Promise<RoleResource | Response> {
  const refusal = refuseWithout("roles.manage");
  if (refusal) {
    return refusal;
  }
  const role = ROLES.find((candidate) => candidate.id === id);
  if (!role) {
    return notFound();
  }
  const stale = refuseWithoutIfMatch(request, mockEntityTag(roleRead(role)));
  if (stale) {
    return stale;
  }
  if (role.isBaseline) {
    return conflict(
      "baseline_role_is_fixed",
      "The baseline role is held by every account and grants a fixed set of permissions",
    );
  }
  return role;
}

/** RenameRoleRequest's rules: a French name, unique among the roles; both at most 60. */
function refuseRoleBody(
  body: { labelFr?: string | null; labelDe?: string | null },
  selfId: number | null,
) {
  const labelFr = body.labelFr?.trim() ?? "";
  const errors: ApiErrorField[] = [];
  if (labelFr === "") {
    errors.push({ field: "labelFr", reason: "required" });
  } else if (labelFr.length > 60) {
    errors.push({ field: "labelFr", reason: "too_long", params: { max: 60 } });
  } else if (
    ROLES.some(
      (role) => role.id !== selfId && role.labelFr?.toLowerCase() === labelFr.toLowerCase(),
    )
  ) {
    errors.push({ field: "labelFr", reason: "already_taken" });
  }
  if ((body.labelDe?.trim().length ?? 0) > 60) {
    errors.push({ field: "labelDe", reason: "too_long", params: { max: 60 } });
  }
  return errors.length > 0
    ? problem(400, "validation_failed", "Invalid form submission", errors)
    : null;
}

/** ReplaceRolePermissionsRequest's rules: a list, of names the enum knows. */
function refusePermissionList(permissions: string[] | undefined) {
  const known: readonly string[] = Object.values(StoreRoleRequestPermissionsItem);
  if (!Array.isArray(permissions)) {
    return problem(400, "validation_failed", "Invalid form submission", [
      { field: "permissions", reason: "invalid_type" },
    ]);
  }
  const unknown = permissions.findIndex((permission) => !known.includes(permission));
  return unknown === -1
    ? null
    : problem(400, "validation_failed", "Invalid form submission", [
        { field: `permissions.${unknown}`, reason: "invalid_value" },
      ]);
}

/**
 * App\Support\AccessIntegrity for a role write: `permissions` is what the role
 * would grant, or null once it is deleted. Refuses taking a guarded
 * permission from its last holder, then the caller taking one from
 * themselves.
 */
function refuseLockout(roleId: number, permissions: string[] | null) {
  const guarded = [
    ["members.manage", "cannot_remove_last_administrator"],
    ["roles.manage", "cannot_remove_last_role_administrator"],
  ] as const;
  const holders = (permission: string, changed: boolean) =>
    members
      .filter((member) =>
        member.roleIds.some((id) => {
          const grants =
            changed && id === roleId
              ? (permissions ?? [])
              : (ROLES.find((role) => role.id === id)?.permissions ?? []);
          return grants.includes(permission);
        }),
      )
      .map((member) => member.id);

  for (const [permission, code] of guarded) {
    if (holders(permission, false).length > 0 && holders(permission, true).length === 0) {
      return conflict(code, "This change would leave nobody holding that permission");
    }
  }
  for (const [permission] of guarded) {
    const self = currentUser?.id;
    if (
      self !== undefined &&
      holders(permission, false).includes(self) &&
      !holders(permission, true).includes(self)
    ) {
      return conflict("cannot_demote_self", "A member cannot remove their own administration");
    }
  }
  return null;
}

/**
 * Whether a roster row answers for events: one of its roles grants
 * attendance.respond, whatever its register says. The real API asks the same
 * question of the same data, through EffectivePermissions::holders().
 */
function answersEvents(member: { roleIds: number[] }): boolean {
  return member.roleIds.some((roleId) =>
    ROLES.find((role) => role.id === roleId)?.permissions.includes("attendance.respond"),
  );
}

/** The password the seeded accounts use, and so the one re-authentication takes. */
const ACTOR_PASSWORD = "demo";

/**
 * Fixed, so a screenshot stays stable and a test can assert what it shows. It
 * matches App\Support\GeneratedPassword's shape (three hyphenated groups of
 * four, from an alphabet without confusable characters), which is what the UI
 * formats and an administrator reads down the phone.
 */
const GENERATED_PASSWORD = "kanu-7rex-mp34";

/* ------------------------------------------------------------------------ *
 * The image library
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

/** The event whose poster a slot is, mirroring PhotoSlot::isEventPoster(); null for any other slot. */
function posterEventId(slot: string): number | null {
  const match = /^event-(\d+)$/.exec(slot);
  return match ? Number(match[1]) : null;
}

/** The photo a placement shows, or null when the slot is empty. */
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
 * The seeded roster, mirroring DevSeeder in its insertion order rather than
 * the order the screen shows: the real GET /api/v1/members sorts by name, so
 * pre-sorted rows would hide a sorting bug in the mocked endpoint or a screen.
 *
 * Every member has an account (migration 2026_09_08_000001), so there is no
 * person-without-a-login row: people the band only displays are content.
 *
 * A function, so resetRoster() hands out a fresh clone each time and one
 * test's edit cannot reach the next.
 */
function initialMembers(): MemberResource[] {
  return [
    {
      id: 1,
      firstName: "Dominique",
      lastName: "Direction",
      username: "demo.direction",
      mustChangePassword: false,
      // Set where DevSeeder leaves it null, so the roster renders both "last
      // seen" and "never": only logging in writes the column, and no endpoint
      // can. A fixed instant, so screenshots do not change.
      lastLoginAt: "2026-09-01T19:30:00+02:00",
      // Organises, does not play, so never in an attendance list.
      sectionId: null,
      sectionName: null,
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
      committeeFunctionId: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [3, 4],
    },
    {
      // Plays and organises: the case an either/or role model breaks.
      //
      // mustChangePassword is true where DevSeeder says false, for the same
      // reason member 1 has a lastLoginAt: the roster renders a status derived
      // from it, and this keeps that branch renderable in the mock and in
      // Playwright. USERS["demo.both"] carries the same value, because
      // POST /me/password treats the roster row and the session as one fact.
      id: 3,
      firstName: "Bastien",
      lastName: "Both",
      username: "demo.both",
      mustChangePassword: true,
      lastLoginAt: null,
      sectionId: 5,
      sectionName: "Trompettes",
      committeeFunctionId: null,
      // The one instructor, mirroring DevSeeder. A different column from
      // sectionId, so the public band page lists them under the trumpets as a
      // player and under the drummers as an instructor.
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
      // The seat, not the role, puts somebody on the public committee page.
      // `committee` grants registrations.view; this is a row in
      // committee_functions. The two are separate fields.
      committeeFunctionId: 5,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [2, 3, 4],
    },
    {
      // Their parent uses the login on their behalf, so the account is used
      // and has a lastLoginAt; without one the roster labels this card
      // "Jamais utilisé" (#148).
      id: 5,
      firstName: "Nadia",
      lastName: "Sansconnexion",
      username: "demo.young",
      mustChangePassword: false,
      lastLoginAt: "2026-09-12T18:05:00+02:00",
      sectionId: 1,
      sectionName: "Batteurs",
      committeeFunctionId: null,
      instructorOfSectionId: null,
      publicVisible: true,
      roleIds: [3, 4],
    },
  ];
}

/** Mutable module state, reset by resetMockState() between tests. */
let members: MemberResource[] = initialMembers();

/**
 * A roster row as the public endpoints render it: three fields, none of them
 * an account detail.
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
 * A seam rather than a `server.use()` override of /band, because the two
 * public handlers read the roster: a test that replaced the endpoint would
 * prove nothing about the rule it enforces.
 */
export function setMemberVisibility(id: number, visible: boolean): void {
  const member = members.find((row) => row.id === id);
  if (member) {
    member.publicVisible = visible;
  }
}

/**
 * Test seam: give one register a German name, as the register editor would.
 * Every reader of the mocked registers then carries it, so a German page can
 * be checked without driving the editor first.
 */
export function setSectionNameDe(id: number, nameDe: string | null): void {
  sections = sections.map((section) => (section.id === id ? { ...section, nameDe } : section));
}

/**
 * Test seam: give one member a committee seat, or take it away with null.
 */
export function setMemberSeat(id: number, committeeFunctionId: number | null): void {
  const member = members.find((row) => row.id === id);
  if (member) {
    member.committeeFunctionId = committeeFunctionId;
  }
}

/**
 * Test seam: set one member's roles outright, past every rule the PUT applies.
 *
 * For the states the API refuses to produce, such as an account without the
 * baseline role, which only a hand edit in the database can leave behind.
 */
export function setMemberRoles(id: number, roleIds: number[]): void {
  const member = members.find((row) => row.id === id);
  if (member) {
    member.roleIds = roleIds;
  }
}

/**
 * A rough stand-in for the API's E.164 reading, which uses
 * libphonenumber: a ten-digit Swiss national number or an explicit `+`
 * number, without letters, and null for anything else. Close enough for a
 * screen to show both cases; the API's own tests pin the real rules.
 */
function mockE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (/\p{L}/u.test(trimmed) || trimmed.slice(1).includes("+")) {
    return null;
  }
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  return /^0[1-9]\d{8}$/.test(digits) ? `+41${digits.slice(1)}` : null;
}

function resetRoster(): void {
  sections = initialSections();
  members = initialMembers();
  nextMemberId = 6;
}

function sectionOf(sectionId: number | null): string | null {
  return sections.find((section) => section.id === sectionId)?.name ?? null;
}

/**
 * Mirrors `auth:sanctum` + `permission:<permission>`: 401 when nobody is
 * logged in, 403 when they are but do not hold it, the split the real routes
 * get by pairing the two middlewares.
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
 * App\Support\Search): "helene" finds "Hélène". Stripping the combining marks
 * after NFD is close enough to the collation for names and places, without
 * reproducing it.
 */
function matchesSearch(fields: string[], q: string): boolean {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const needle = fold(q);
  return fields.some((field) => fold(field).includes(needle));
}

/**
 * One collection, enveloped and paged the way the real API does it, so the
 * component tests agree with the API's shape rather than with a bare array.
 *
 * The clamping is mirrored too, nonsense included: a bad `limit` is ignored
 * rather than refused.
 */
function collection<T>(
  rows: T[],
  request: Request,
  status = 200,
  // An enveloped list can still carry an entity tag: `etag:event.options` sits
  // on a route whose body is a collection, because the facet is the option
  // list rather than any one row. It is the one collection in this API that
  // hands a tag out.
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
    // The Link header goes on reads only, matching the middleware: nobody
    // should follow a `rel="next"` to a URL they would have to POST again.
    status === 200
      ? { headers: { Link: links.join(", "), ...extraHeaders } }
      : { status, headers: extraHeaders },
  );
}

/* ------------------------------------------------------------------------ *
 * Conditional writes
 * ------------------------------------------------------------------------ */

/**
 * The ETag the real API hands out, modelled closely enough to be wrong about.
 *
 * Not the server's algorithm (a sha256 of the rendered Resource, see
 * App\Support\EntityTag): the SPA depends only on a tag changing when the
 * thing changes and on a write without one being refused, and a cheap
 * deterministic hash models both. FNV-1a because jsdom has no synchronous
 * crypto digest.
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
 * An event's state as its tag sees it: without the caller's own answer and
 * without the poster.
 *
 * `myAttendance` is the caller's answer, so a tag over it would differ between
 * two committee members looking at the same event, and a member answering an
 * event would invalidate their own pending edit of it. The real API gets this
 * by rendering the Resource with no relations loaded.
 *
 * The poster has a write of its own with no If-Match, and App\Support\EntityTag
 * leaves it out so that picking one in the form does not 412 the publish after.
 */
function eventTagState(event: EventResource): Omit<EventResource, "myAttendance" | "poster"> {
  const state = { ...event };
  delete (state as Partial<EventResource>).myAttendance;
  delete (state as Partial<EventResource>).poster;
  return state;
}

/**
 * The refusal a conditional write earns, or null to let it through.
 *
 * Mirrors App\Http\Middleware\ConditionalWrite, so a screen that cannot save
 * fails here as it would against the real API: 428 for an absent header, 412
 * for one naming a state the thing has left, strong comparison, and `*`
 * matching anything that exists.
 */
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
 * Mirrors App\Support\AccessIntegrity: 409, not 403, because the caller has
 * the permission and the request conflicts with the state of the system.
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
 * The upcoming/past boundary, mirroring EventController::index and
 * App\Support\BandTime::startOfToday: the start of today, not now, so an
 * event that began an hour ago stays in the planning of somebody running late.
 *
 * The browser's own midnight rather than Fribourg's, which is where this mock
 * knowingly differs from the server: test runners and developers are in the
 * band's zone, and no screen needs BandTime reimplemented in TypeScript.
 */
function startOfTodayMs(): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

/**
 * An instant this many days from now, at a Fribourg wall-clock time.
 *
 * Relative to now, never fixed: a seeded season of literal dates falls into
 * the past, and `/events` then renders empty in every screenshot and demo.
 */
function at(dayOffset: number, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const when = new Date();
  when.setDate(when.getDate() + dayOffset);
  when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return when.toISOString();
}

/**
 * The four tags the seed migration writes, without `eventCount`: the
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
 * The seeded planning, mirroring the band's real season: Saturday rehearsals
 * at the Werkhof, the Christmas one an hour longer, the two-day musical
 * weekend, a gig, the souper, one rehearsal already past, and two drafts.
 *
 * Seven published events, so the count is assertable: six upcoming and one
 * past, which gives `?past=1` something to return and keeps the default list
 * from being the whole store.
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
      poster: null,
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
      poster: null,
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
      poster: null,
    },
    {
      // The two-day case, which is why `ends_at` is a datetime rather than a
      // time beside a `weekend` boolean.
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
      poster: null,
    },
    {
      // The missing-attire case: the card has to render without one.
      //
      // Public, like the souper, which gives the front page's agenda something
      // to render: a gig is somewhere anybody may come and watch, and
      // rehearsals are not.
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
      poster: null,
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
      poster: null,
    },
    {
      // The only event that takes bookings, and the one the four registration
      // screens are looked at against. Registration is a property of an event
      // (ADR 0020), so this is an ordinary row with three dates filled in.
      //
      // Its window is open now and closes before the event: the ordinary
      // state, and the only one in which the public form can be filled in.
      // Not yet open and closed are reachable by editing those two dates in
      // /events/:id/edit.
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
      poster: null,
    },
  ];

  // Two drafts, one dated and one with nothing but a title, which is the pair
  // the committee's list has to place: the dateless one has no start to sort
  // by. The dated one is public on purpose, to show that a draft marked public
  // still appears nowhere.
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
      poster: null,
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
      poster: null,
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
 * A map rather than a field on the event, because `myAttendance` is the
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
 * Seeded answers are settled on purpose. Recorded "just now", every one of
 * them would offer an undo, and the screens would never show an answer past
 * the five-minute window, which is where answers spend their life.
 */
function settledAt(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

/**
 * The seeded answers, all against event 1: the next rehearsal, and so the
 * event the chase list is read about.
 *
 * One of each state the screen has to render: a yes, a no carrying the reason
 * a withdrawal collects, an answer the direction entered on somebody's
 * behalf, and a member nobody has heard from. That last one is Bastien, who is
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
 * Counts through the roster rather than over the answers map, so an answer
 * from somebody who no longer answers for events is not counted: the same
 * constraint EventController::counts() puts in the subselect.
 */
function answeredCountFor(eventId: number): number {
  return members.filter(
    (member) => answersEvents(member) && answers.has(answerKey(eventId, member.id)),
  ).length;
}

/** The denominator: everybody who answers for events. A property of the roster, not of the event. */
function answerableCount(): number {
  return members.filter(answersEvents).length;
}

/**
 * How many people are booked at an event.
 *
 * Reads each booking's own `guestCount`, which totalsOf() computed from its
 * choices, so the two cannot disagree.
 */
function guestsFor(eventId: number): number {
  return registrations
    .filter((booking) => booking.eventId === eventId)
    .reduce((sum, booking) => sum + booking.guestCount, 0);
}

/**
 * The committee's counts, gated exactly as the server gates them.
 *
 * Mirrors App\Http\Resources\EventResource, including the two different
 * permissions: the seeded committee role holds registrations.view without
 * attendance.view_all. A mock that handed a player these numbers would let
 * the SPA's own leak test pass.
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
 * The refusal for somebody whose roles grant no attendance.respond.
 *
 * Its own code rather than `access_denied`, as in the real API: on the
 * on-behalf route the caller holds every permission it needs, and it is the
 * member being answered for who is not asked. Dominique Direction is the
 * case: she organises and plays nothing.
 */
const notAnswerable = () =>
  problem(403, "not_answerable", "This member holds no role granting attendance.respond");

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
 * As a field of the resource, every handler could typecheck against a shape
 * the server does not send.
 */
type MockOption = RegistrationOptionResource & { eventId: number };
type MockRegistration = RegistrationResource & { eventId: number };

/**
 * What event 7 offers.
 *
 * One priced, one cheaper, one without a price at all. `priceCents: null` is
 * an option whose price lives in its description or which is not sold, which
 * differs from a free one, and a booking total must not print it as
 * "CHF 0.00".
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
 * `createdAt` is fixed, unlike the planning's dates: a guest list records
 * what happened, so nothing goes stale as the seed ages, and a fixed stamp
 * lets a test assert the column.
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
      phoneE164: "+41791234567",
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
      phoneE164: "+41263221010",
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
 * `delete` on a copy rather than a rest destructure, as in `eventTagState`:
 * the destructure leaves a bound name nothing reads, which this project's
 * eslint rules refuse, and a cast would stop the compiler checking.
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
 * The `event.options` facet, a separate tag from the event's.
 *
 * The options are absent from EventResource, so conditioning their write on
 * the event's tag would miss every option change and refuse a good options
 * edit because somebody corrected the dress code. Two facets here catch a
 * screen quoting the wrong one.
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
 * the screen and the confirmation mail cannot disagree. The total is null
 * when nothing taken carries a price, which is not zero.
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
 * An event with its derived field put back.
 *
 * `takesRegistrations` is computed by the server from `registration_closes_at`
 * and is not a column, so a write that spreads the request body over the
 * stored row would leave it at its old value.
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
    poster: event.poster,
    registrationOpen: registrationIsOpen(event),
  };
}

/**
 * The guest list as rows, mirroring App\Support\GuestList.
 *
 * One row builder for four formats, as on the server, so the four downloads
 * cannot disagree. One column per
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
 * newest first, `id` descending to match, so this array needs no re-sort
 * before that handler hands it out.
 *
 * Two open, one handled, which is what both the inbox and its summary read.
 * One open message carries no subject, so its inbox row falls back to the
 * opening of the body, mirroring ContactMessageSource; the other carries a
 * long body that wraps in the archive. The handled one carries who dealt with
 * it and when, so the archive's "handled" column has something to render.
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
 * Mirrors Iso8601::utc's rendering: ISO 8601, UTC, with an explicit
 * `+00:00` rather than `.toISOString()`'s `Z`, which the real API never
 * emits.
 */
function isoNowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** `str($message)->limit(120)` mirrored: the same suffix, the same cut. */
function limitedTo(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/** Still open, newest first: the set both GET /inbox and its summary count. */
function openContactMessages(): ContactMessageResource[] {
  return contactMessages.filter((message) => message.handledAt === null);
}

/**
 * One open message as InboxItemResource, mirroring ContactMessageSource: the
 * subject when there is one, else the opening of the body, and a deep link
 * back to the archive with this row already open: the inbox leads to the
 * work and is not a second place to do it.
 */
function toInboxItem(message: ContactMessageResource): InboxItemResource {
  return {
    kind: "contactMessage",
    id: message.id,
    title: `${message.firstName} ${message.lastName}`.trim(),
    summary: message.subject || limitedTo(message.message, 120),
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
 * GET /inbox/summary filter on this permission rather than refusing its
 * absence. Mirrors InboxRegistry, which makes the nav badge safe to call
 * before a caller knows what they may do.
 */
function mayReadMessages(): boolean {
  return currentUser?.permissions.includes("messages.view") ?? false;
}

/** Test seam: every mock store is module state, so every test must reset them all. */
export function resetMockState(): void {
  setCurrentUser(null);
  // Before the roster and history: their fixtures read the images.
  resetImages();
  resetRoles();
  resetRoster();
  // Dropping a reset fails tests only when a whole file runs, which looks
  // like flakiness and is not.
  resetEvents();
  resetHistory();
  resetAnswers();
  resetRegistrations();
  resetContactMessages();
}

/** Typed by the model, so a field rename in ContactRequest is a compile error here. */
const REQUIRED: (keyof ContactRequest)[] = ["lastName", "firstName", "email", "subject", "message"];

/**
 * An image as ImageResource renders it, with every place it is shown, ordered
 * by slot name as Image::usagesOf() lists them.
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
 * null when the bytes are not a JPEG. This is all the mock takes from
 * JpegInspector: the size limits and metadata checks are the server's, and a
 * screen's own shrinking step keeps a real upload inside them.
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
  // First, and answering nothing: a resolver that returns undefined passes the
  // request on to the handler that owns it.
  http.all("/api/*", () => {
    forgetLostSession();
  }),

  // Sanctum's own route, outside /api and the OpenAPI document, so orval
  // generates no handler for it. http.ts primes it before every mutating
  // request, so without this every mocked write fails on an unhandled request.
  http.get("/sanctum/csrf-cookie", () => new HttpResponse(null, { status: 204 })),

  // Mirrors App\Http\Controllers\Api\ConfigController: `env` and `features`.
  // The calendar flag is on here and off by default on a real server, so the
  // mocked app is where the calendar can be looked at.
  http.get("/api/v1/config", () => HttpResponse.json({ env: "dev", features: { calendar: true } })),

  http.get("/api/v1/me", () => (currentUser ? HttpResponse.json(currentUser) : unauthenticated())),

  // The public agenda, read off the same event store the planning uses, so
  // ticking "Visible publiquement" on an event in /events/:id/edit puts it on
  // the front page.
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

  // The two public people pages (/band and /committee) derive from the
  // roster the members screen edits, not from a second fixture: tick
  // "Visible publiquement" off for Perrine in /members and she leaves the band
  // page. Both mirror the server's filter: `publicVisible`, and for the
  // committee a seat.
  http.get("/api/v1/band", ({ request }) =>
    collection(
      sections.map((section) => ({
        id: section.id,
        name: section.name,
        nameDe: section.nameDe,
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

  // Public, and a list like every other: each placed slot by name. An
  // event's poster is not listed, as on the server: it comes with the event.
  http.get("/api/v1/photo-slots", ({ request }) =>
    collection(
      Object.keys(photoSlots)
        .filter((slot) => posterEventId(slot) === null)
        .sort()
        .flatMap((slot) => {
          const photo = photoOf(photoSlots[slot]?.imageId ?? null);
          return photo ? [{ slot, ...photo }] : [];
        }),
      request,
    ),
  ),

  // By rank, then by name, mirroring CommitteeController, whose ordering is
  // the feature. Several people hold "Membre" at once, so the name tie-break
  // keeps two cards from swapping places between renders.
  http.get("/api/v1/committee", ({ request }) =>
    collection(
      members
        .flatMap((member) => {
          const seat = COMMITTEE_FUNCTIONS.find((row) => row.id === member.committeeFunctionId);

          // Reading the seat is the "holds one" check: an id pointing at
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

  // The stamp every anonymous form fetches as it renders. The real one is
  // signed and carries the minting time; this one only has to be a string the
  // handler below can recognise, because nothing in the SPA reads it.
  http.get("/api/v1/form-token", () => HttpResponse.json({ token: MOCK_FORM_TOKEN })),

  // Hand-written because the generated handler always succeeds, and a contact
  // form matters most when it does not. The required set mirrors
  // api/app/Http/Requests/ContactRequest.php.
  http.post("/api/v1/contact", async ({ request }) => {
    // The guard runs ahead of validation, as PublicWriteGuard does on the
    // server, so a bare POST answers 422 rather than 400.
    //
    // The two-second floor is deliberately not mirrored: the server refuses a
    // token younger than that, and enforcing it here would make every test of
    // this form sleep. The rule it protects (fetch the token when the form
    // renders) is structural in Contact.tsx, where the query is pinned.
    // Presence is checked here; age is the server's.
    const body = (await request.json()) as Partial<Record<keyof ContactRequest, string>>;

    // `website` must arrive present and empty. An absent field is refused as
    // firmly as a filled one, or a hand-written body would walk past the
    // honeypot by omitting it.
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
    // as absent, the opposite of plain falsiness in both cases.
    const missing = REQUIRED.filter((field) => (body[field] ?? "").trim() === "");
    if (missing.length > 0) {
      // 400, not Laravel's default 422: ApiError::validation() answers 400
      // for every validation failure in this API, and OpenApiDocumentTest
      // pins it.
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
    // The username is untyped input from the request body, so USERS is read
    // as a plain string-indexed record rather than through the literal key
    // union `satisfies` gives it.
    const user = body.username ? (USERS as Record<string, MockUser>)[body.username] : undefined;
    if (!user || body.password !== "demo") {
      return problem(401, "invalid_credentials", "Incorrect username or password");
    }
    setCurrentUser(user);
    // No identity in this body, as in AuthController::login: the client asks
    // GET /api/v1/me, so one shape describes who you are.
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
    ({ request }) => refuseWithoutMembersManage() ?? collection(sections.map(sectionRead), request),
  ),

  http.post("/api/v1/sections", async ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const body = (await request.json()) as StoreSectionRequest;
    const invalid = refuseSectionBody(body, null);
    if (invalid) {
      return invalid;
    }
    const created: SectionResource = {
      id: Math.max(0, ...sections.map((section) => section.id)) + 1,
      name: body.name.trim(),
      nameDe: body.nameDe?.trim() ? body.nameDe.trim() : null,
      sortOrder: Math.max(0, ...sections.map((section) => section.sortOrder)) + 1,
    };
    sections = [...sections, created];
    return HttpResponse.json(sectionRead(created), { status: 201 });
  }),

  // Before /api/v1/sections/:id, so `order` is never read as an id.
  http.put("/api/v1/sections/order", async ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const { sectionIds } = (await request.json()) as ReorderSectionsRequest;
    const known = sections.map((section) => section.id);
    const exact =
      sectionIds.length === known.length &&
      new Set(sectionIds).size === sectionIds.length &&
      sectionIds.every((id) => known.includes(id));
    if (!exact) {
      return problem(
        409,
        "registers_changed",
        "The list does not name every register exactly once. Read it again.",
      );
    }
    sections = sectionIds.map((id, position) => ({
      ...sections.find((section) => section.id === id)!,
      sortOrder: position + 1,
    }));
    return collection(sections.map(sectionRead), request);
  }),

  http.get("/api/v1/sections/:id", ({ params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const found = sections.find((section) => section.id === Number(params.id));
    return found
      ? HttpResponse.json(sectionRead(found), { headers: { ETag: sectionTag(found) } })
      : notFound();
  }),

  http.patch("/api/v1/sections/:id", async ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const existing = sections.find((section) => section.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, sectionTag(existing));
    if (stale) {
      return stale;
    }
    const body = (await request.json()) as StoreSectionRequest;
    const invalid = refuseSectionBody(body, existing.id);
    if (invalid) {
      return invalid;
    }
    const updated: SectionResource = {
      ...existing,
      name: body.name.trim(),
      nameDe: body.nameDe?.trim() ? body.nameDe.trim() : null,
    };
    sections = sections.map((section) => (section.id === updated.id ? updated : section));
    // The roster carries a copy of the French name, as MemberResource does.
    members = members.map((member) =>
      member.sectionId === updated.id ? { ...member, sectionName: updated.name } : member,
    );
    return HttpResponse.json(sectionRead(updated), { headers: { ETag: sectionTag(updated) } });
  }),

  http.delete("/api/v1/sections/:id", ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const existing = sections.find((section) => section.id === Number(params.id));
    if (!existing) {
      return notFound();
    }
    const stale = refuseWithoutIfMatch(request, sectionTag(existing));
    if (stale) {
      return stale;
    }
    const read = sectionRead(existing);
    if ((read.playerCount ?? 0) > 0 || (read.instructorCount ?? 0) > 0) {
      return problem(
        409,
        "register_in_use",
        "Somebody plays in or teaches this register. Move them to another one first.",
      );
    }
    sections = sections.filter((section) => section.id !== existing.id);
    return HttpResponse.json({ ok: true });
  }),

  // Either permission reads the list, as on the real route: the roster form
  // assigns roles, the role editor shapes them.
  http.get("/api/v1/roles", ({ request }) =>
    currentUser?.permissions.includes("roles.manage")
      ? collection(ROLES, request)
      : (refuseWithoutMembersManage() ?? collection(ROLES, request)),
  ),

  /* ------------------------------------------------------------------------ *
   * The role editor. Each write checks the role's tag, which covers its
   * holders, and the lockout rule App\Support\AccessIntegrity applies.
   * ---------------------------------------------------------------------- */

  http.get("/api/v1/roles/:id", ({ params }) => {
    const refusal = refuseWithout("roles.manage");
    if (refusal) {
      return refusal;
    }
    const role = ROLES.find((candidate) => candidate.id === Number(params.id));
    if (!role) {
      return notFound();
    }
    const read = roleRead(role);
    return HttpResponse.json(read, { headers: { ETag: mockEntityTag(read) } });
  }),

  http.post("/api/v1/roles", async ({ request }) => {
    const refusal = refuseWithout("roles.manage");
    if (refusal) {
      return refusal;
    }
    const body = (await request.json()) as {
      labelFr?: string | null;
      labelDe?: string | null;
      permissions?: string[];
    };
    const invalid = refuseRoleBody(body, null) ?? refusePermissionList(body.permissions);
    if (invalid) {
      return invalid;
    }
    const id = nextRoleId++;
    const role: RoleResource = {
      id,
      key: `custom-${id}`,
      labelFr: body.labelFr!.trim(),
      labelDe: body.labelDe?.trim() ? body.labelDe.trim() : null,
      isBaseline: false,
      permissions: [...new Set(body.permissions)],
    };
    ROLES.push(role);
    return HttpResponse.json(roleRead(role), { status: 201 });
  }),

  http.patch("/api/v1/roles/:id", async ({ request, params }) => {
    const found = await roleForWrite(request, Number(params.id));
    if (found instanceof Response) {
      return found;
    }
    const body = (await request.json()) as { labelFr?: string | null; labelDe?: string | null };
    const invalid = refuseRoleBody(body, found.id);
    if (invalid) {
      return invalid;
    }
    found.labelFr = body.labelFr!.trim();
    found.labelDe = body.labelDe?.trim() ? body.labelDe.trim() : null;
    const read = roleRead(found);
    return HttpResponse.json(read, { headers: { ETag: mockEntityTag(read) } });
  }),

  http.put("/api/v1/roles/:id/permissions", async ({ request, params }) => {
    const found = await roleForWrite(request, Number(params.id));
    if (found instanceof Response) {
      return found;
    }
    const body = (await request.json()) as { permissions?: string[] };
    const invalid = refusePermissionList(body.permissions);
    if (invalid) {
      return invalid;
    }
    const permissions = [...new Set(body.permissions)];
    const locked = refuseLockout(found.id, permissions);
    if (locked) {
      return locked;
    }
    found.permissions = permissions;
    const read = roleRead(found);
    return HttpResponse.json(read, { headers: { ETag: mockEntityTag(read) } });
  }),

  http.delete("/api/v1/roles/:id", async ({ request, params }) => {
    const found = await roleForWrite(request, Number(params.id));
    if (found instanceof Response) {
      return found;
    }
    const locked = refuseLockout(found.id, null);
    if (locked) {
      return locked;
    }
    ROLES.splice(ROLES.indexOf(found), 1);
    for (const member of members) {
      member.roleIds = member.roleIds.filter((roleId) => roleId !== found.id);
    }
    return HttpResponse.json({ ok: true });
  }),

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
    // The filters the real endpoint takes, applied before the envelope
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

  // One person, and the read every conditional write on the roster starts
  // from. The roster list above hands out no tag, so a screen that edited
  // straight from a list row would be refused with 428.
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

  // Creating a person creates an account and mints its password, returned
  // once. It grants the baseline role and nothing else, like the real API,
  // and ignores any roleIds in the body: any other role is the separate,
  // guarded step, which a mock granting it here would hide from every test.
  http.post("/api/v1/members", async ({ request }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const body = (await request.json()) as Partial<MemberResource>;

    // Mirrors StoreMemberRequest's `unique:members,username`: a duplicate has
    // to land on the username field, in French, without closing the form the
    // administrator is typing in.
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
    // Reading the row is the existence check: noUncheckedIndexedAccess types
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
    // An allow-list, not a blanket spread, because Laravel's validated()
    // returns only the fields UpdateMemberRequest declares rules for and
    // drops the rest. Applying everything would let a screen appear to change
    // roleIds or the id itself here, and do nothing against the real API.
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
    // Derived from section_id in the real Resource, so recomputed here.
    updated.sectionName = sectionOf(updated.sectionId);
    members[index] = updated;
    // The tag of what the write just produced, so a second edit needs no read
    // in between: Members.tsx chains the roles call onto it.
    return HttpResponse.json(updated, { headers: { ETag: mockEntityTag(updated) } });
  }),

  // Mirrors AccessIntegrity, including its ordering: orphaning administration
  // outranks self-deletion when both apply, because it is the more
  // informative refusal.
  http.delete("/api/v1/members/:id", ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const id = Number(params.id);
    const index = members.findIndex((member) => member.id === id);
    // Reading the row is the existence check: noUncheckedIndexedAccess types
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
  // "add this one" API cannot express removal, which is the half the
  // invariants exist for.
  http.put("/api/v1/members/:id/roles", async ({ request, params }) => {
    const refusal = refuseWithoutMembersManage();
    if (refusal) {
      return refusal;
    }
    const id = Number(params.id);
    const index = members.findIndex((member) => member.id === id);
    // Reading the row is the existence check: noUncheckedIndexedAccess types
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
    // Checked first, as App\Support\AccessIntegrity does.
    if (!ROLES.some((role) => role.isBaseline && roleIds.includes(role.id))) {
      return conflict(
        "baseline_role_is_fixed",
        "The baseline role is held by every account and grants a fixed set of permissions",
      );
    }
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
    // Reading the row is the existence check: noUncheckedIndexedAccess types
    // members[index] as possibly undefined, and findIndex's -1 lands there too.
    const existing = members[index];
    if (!existing) {
      return notFound();
    }
    members[index] = { ...existing, mustChangePassword: true };
    return HttpResponse.json({ generatedPassword: GENERATED_PASSWORD, sessionsEnded: 1 });
  }),

  // The one endpoint that re-authenticates (ADR 0017). The current password
  // is this operation's own input: without it a borrowed, unlocked phone
  // locks the real owner out of their own account.
  http.post("/api/v1/me/password", async ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    // Mirrors AccountPasswordRequest's `min:8` and its rule order: the
    // current password is verified first, so a wrong one is reported as
    // reauth_failed rather than masked by a length complaint.
    //
    // params.min is required: 'too_short' interpolates {{min}}, and i18next
    // prints a missing value literally ("minimum {{min}} caractères").
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
  // The planning. Gated on being logged in and nothing else, like the real
  // route: everybody in the band needs to know when the next rehearsal is.
  http.get("/api/v1/events", ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }

    // The split is on the start of today, not on now: see startOfTodayMs().
    const boundary = startOfTodayMs();

    // Anything that is not exactly '1' is the default upcoming view, the same
    // fail-safe direction the real endpoint takes: a truncated or misspelled
    // value must never be the one that hides events.
    const past = new URL(request.url).searchParams.get("past") === "1";
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const tag = new URL(request.url).searchParams.get("tag");

    // Every draft belongs to the default half, dated or not, and none to the
    // history: a draft cannot ride the start-date split, and one dated last
    // week is still unfinished business.
    const planning = visibleEvents()
      .filter((event) => {
        if (past) {
          return event.publishedAt !== null && startMs(event) < boundary;
        }
        return event.publishedAt === null || startMs(event) >= boundary;
      })
      // `?q=` narrows either half, on the title or the place.
      .filter((event) => q === "" || matchesSearch([event.title, event.location ?? ""], q))
      // `?tag=` narrows to the events carrying it.
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

  // Before /api/v1/events/:id, so `series` is never read as an id: MSW takes
  // the first handler whose path matches, and `:id` would bind the literal.
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

    // One independent event per date, with no series_id or anything else
    // linking them.
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
        poster: null,
        // A generated season is written as drafts: a wrong recurrence rule
        // must not land every date on everybody's planning at once.
        publishedAt: null,
      };
    });

    events = [...events, ...created];

    // Enveloped despite the 201: the events it just wrote are a collection
    // whatever status carries them, and the real middleware keys on any
    // successful JSON list body rather than on 200.
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
      poster: null,
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
          headers: { ETag: mockEntityTag(eventTagState(event)) },
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
    // Reading the row is the existence check: noUncheckedIndexedAccess makes
    // events[index] `EventResource | undefined`, which covers index === -1.
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(eventTagState(existing)));
    if (stale) {
      return stale;
    }

    // `tagIds` is taken off before the spread below: it names tags, it is not
    // a field of the event, and absent means "keep them" as on the API.
    const { tagIds, ...patch } = (await request.json()) as Partial<
      Omit<EventResource, "id" | "publishedAt" | "tags">
    > & { tagIds?: number[] };

    // A draft may lose its dates and location, a published event may not; the
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

    // The comparison uses the stored start when the patch does not carry
    // one, as the real Form Request does.
    const invalid = refuseIfEndsBeforeStart(updated.startsAt, updated.endsAt);
    if (invalid) {
      return invalid;
    }

    events = events.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    return HttpResponse.json(withCommitteeCounts(updated), {
      headers: { ETag: mockEntityTag(eventTagState(updated)) },
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

    const stale = refuseWithoutIfMatch(request, mockEntityTag(eventTagState(existing)));
    if (stale) {
      return stale;
    }

    events = events.filter((candidate) => candidate.id !== id);
    // The poster's slot goes with the event, as Event::booted() does it.
    photoSlots = Object.fromEntries(
      Object.entries(photoSlots).filter(([slot]) => posterEventId(slot) !== id),
    );
    return HttpResponse.json({ ok: true });
  }),

  // Publishing is its own act, and owes the current tag like the other
  // writes.
  http.post("/api/v1/events/:id/publish", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const existing = events.find((candidate) => candidate.id === Number(params.id));
    if (!existing) {
      return notFound();
    }

    const stale = refuseWithoutIfMatch(request, mockEntityTag(eventTagState(existing)));
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
      headers: { ETag: mockEntityTag(eventTagState(updated)) },
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

    const stale = refuseWithoutIfMatch(request, mockEntityTag(eventTagState(existing)));
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
      headers: { ETag: mockEntityTag(eventTagState(updated)) },
    });
  }),

  /* ---------------------------------------------------------------------- *
   * The image library
   * ---------------------------------------------------------------------- */

  // Newest first, like ImageController::index().
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

  // `/images/{id}`, behind images.manage. `summary` is registered above so it
  // is not read as an id.
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
    // Written through to the event, which is where the server reads it from.
    const posterOf = posterEventId(slot);
    if (posterOf !== null) {
      events = events.map((event) =>
        event.id === posterOf ? { ...event, poster: photoOf(placed.imageId) } : event,
      );
    }
    return HttpResponse.json({ photo: photoOf(placed.imageId) });
  }),

  /* ---------------------------------------------------------------------- *
   * History
   * ---------------------------------------------------------------------- */

  // Public, like the real list, and oldest first.
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

  // The chase list: every answerable member, whether or not they replied.
  // Returning only the answers would push "who has not replied?" into a
  // client-side diff against a separately fetched roster, two requests that
  // can disagree.
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

    // Answerable means holding attendance.respond through a role, as in the
    // real chase list. The register only says where somebody plays.
    const rows: ChaseListEntryResource[] = members
      .filter(answersEvents)
      .sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      )
      .map((member) => ({
        memberId: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        sectionName: member.sectionName,
        sectionNameDe: sections.find((section) => section.id === member.sectionId)?.nameDe ?? null,
        attendance: answers.get(answerKey(event.id, member.id)) ?? null,
      }));

    return collection(rows, request);
  }),

  // Answering for yourself. The route asks only for a session; a caller whose
  // roles grant no attendance.respond is refused as not_answerable.
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

    if (!currentUser.permissions.includes("attendance.respond")) {
      return notAnswerable();
    }

    const body = (await request.json()) as RecordOwnAttendanceRequest;
    const key = answerKey(event.id, currentUser.id);
    const existing = answers.get(key) ?? null;

    // Taking back a yes costs a reason (ADR 0018). It lands as an ordinary
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

  // Undo, which expires after five minutes.
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

  // Answering on somebody's behalf: the phone call to the committee.
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

    // The caller's own row is refused, checked before answerability as the
    // real controller orders it. This route is exempt from the withdrawal
    // reason rule, so aimed at yourself it would let Bastien, who plays and
    // holds the permission, take back his own yes for free.
    if (currentUser?.id === member.id) {
      return conflict("cannot_record_for_self", "Answer for yourself from the planning");
    }

    if (!answersEvents(member)) {
      return notAnswerable();
    }

    const body = (await request.json()) as RecordMemberAttendanceRequest;

    const recorded: AttendanceResource = {
      status: body.status,
      // No reason required, withdrawal included (ADR 0018): the committee is
      // writing down what they were told, and inventing a reason on somebody
      // else's behalf puts words in their mouth.
      note: body.note?.trim() ? body.note : null,
      recordedByDirection: true,
      recordedAt: new Date().toISOString(),
    };

    answers.set(answerKey(event.id, member.id), recorded);
    return HttpResponse.json(recorded);
  }),

  // Taking one back. Not subject to the five-minute window: correcting a
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

  // What the public booking form needs to render itself. Anonymous, and 404
  // for an event that takes no bookings whether or not it exists: a stranger
  // must not be able to walk the ids and learn the band's planning.
  //
  // An event that is enabled but outside its window answers 200 with
  // `open: false`, so the form can say when bookings start or that they have
  // closed. `open` is the server's answer and never derived from the two
  // dates by the client, whose clock may be wrong.
  http.get("/api/v1/events/:id/registration", ({ params }) => {
    const event = events.find((candidate) => candidate.id === Number(params.id));

    // A draft is a 404 here for everyone, a logged-in manager included: the
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

  // Booking a place. The other anonymous write in the API, with the same
  // three protections as the contact form; that handler says why the
  // two-second floor is the server's alone.
  http.post("/api/v1/events/:id/registrations", async ({ request, params }) => {
    const event = events.find((candidate) => candidate.id === Number(params.id));

    // Before the guard and validation, matching
    // StoreRegistrationRequest::prepareForValidation. Checked later, booking
    // an event that takes none would answer a complaint about
    // `choices.0.optionId` and leak that the event exists. A draft answers
    // the same 404.
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

    // The per-booking cap compares the whole choices array with a number on
    // the event, so it is raised against `choices` with no params, as the
    // server's closure validator does: that path emits field and reason only,
    // and an interpolating French string would print a literal {{max}}.
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
      phoneE164: mockE164(String(body.phone)),
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

  // The guest list, behind `registrations.view` alone. The `committee` role
  // holds that without registrations.manage, so this must not let anybody
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

  // The same list as a file. The xlsx body is a placeholder, not a workbook:
  // the screen hands the blob straight to the browser, so a test can only
  // establish that the request is made, refused or allowed, and named. The
  // other three formats are real, because they cost nothing to produce.
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
      // The BOM and the semicolons are the server's: Swiss Excel reads a
      // BOM-less UTF-8 CSV in the system codepage and splits on ';', not ','.
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

    // What was ordered is not editable: `choices` on the body is ignored,
    // matching UpdateRegistrationRequest, which has no such field. A wrong
    // order is cancelled and re-booked.
    const updated: MockRegistration = {
      ...existing,
      firstName: patch.firstName ?? existing.firstName,
      lastName: patch.lastName ?? existing.lastName,
      email: patch.email ?? existing.email,
      phone: patch.phone ?? existing.phone,
      phoneE164: patch.phone === undefined ? existing.phoneE164 : mockE164(patch.phone),
      // array_key_exists, not `??`: both an omitted field and an explicit
      // null are nullish, so `??` would make clearing an address do nothing,
      // the trap the server's own comment names.
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

  // What an event offers is part of the event, so both of these are
  // `events.manage` rather than a registration permission, the same act as
  // setting its date.
  http.get("/api/v1/events/:id/registration-options", ({ request, params }) => {
    const refusal = refuseWithout("events.manage");
    if (refusal) {
      return refusal;
    }

    const eventId = Number(params.id);

    // An empty list rather than a 404 for an event taking no bookings, unlike
    // the public read: configuring an event that does not take them yet is
    // when the committee opens this.
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

    // Checked before anything is written, and against what survives rather
    // than against the ids sent: an entry with no id adopts an existing
    // option of the same label, so a replayed first save converges instead of
    // deleting and re-creating the list. Checking ids alone would refuse a
    // plain retry.
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

  // Filtered, not refused, mirroring InboxRegistry: a caller holding none of
  // the relevant permissions gets an empty inbox rather than a 403, so the
  // nav badge stays safe to call before anybody knows what a session may do.
  http.get("/api/v1/inbox", ({ request }) => {
    if (!currentUser) {
      return unauthenticated();
    }
    return collection(mayReadMessages() ? openContactMessages().map(toInboxItem) : [], request);
  }),

  // Not a list: bare {total, counts}, matching InboxController::summary.
  // `counts` is an object even when empty, never `[]`; the real API forces
  // this with an `(object)` cast.
  http.get("/api/v1/inbox/summary", () => {
    if (!currentUser) {
      return unauthenticated();
    }
    const open = mayReadMessages() ? openContactMessages().length : 0;
    const counts: InboxSummary200Counts = mayReadMessages() ? { contactMessage: open } : {};
    return HttpResponse.json({ total: open, counts });
  }),

  // The archive. Gated on messages.view, unlike the inbox above: a caller who
  // may not read a message must not be able to count them by paging through
  // this instead.
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

  // One message, unwrapped, carrying the ETag the two writes below require.
  // The list above hands out none, so a screen acting straight from a row
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

  // Marking a message handled, or putting it back. Reopening is not an
  // error, as ContactMessageController::handle documents: a message marked
  // handled by mistake is a normal thing to correct.
  http.patch("/api/v1/contact-messages/:id", async ({ request, params }) => {
    const refusal = refuseWithout("messages.manage");
    if (refusal) {
      return refusal;
    }
    const index = contactMessages.findIndex((candidate) => candidate.id === Number(params.id));
    // Reading the row is the existence check: noUncheckedIndexedAccess types
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
 * Order matters: MSW uses the first matching handler, so the hand-written ones
 * must come before the generated catch-alls.
 */
export const handlers = [...overrides, ...getLesCanetonsAPIMock()];
