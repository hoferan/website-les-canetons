# Roster Login State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Superseded in part, 2026-09-18.** This plan was executed as written and
> the result was rejected on review of the real screen: one muted sentence per
> card reads as prose among prose and gets overlooked. What an administrator
> may have to act on is now a pill, and the last-login date is reference text
> beneath it. The tasks below are the historical record of how the branch was
> built; **the design record is the spec**, which carries the revision and the
> superseded reasoning. Read the spec, not this, for what the screen does.

**Goal:** Show on each `/members` card whether that member has ever logged in, and whether they are still on a committee-issued password.

**Architecture:** Two pure functions and one `<p>`. `formatLastLogin()` in the shared date module turns an ISO instant into a French date; `loginStatus()` in `web/src/members/` derives one sentence from the two fields `MemberResource` already carries. `Members.tsx` renders the sentence. No API, migration, or client regeneration is involved — both fields are already on the wire.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, MSW for the mocked backend, Playwright (mock mode) for the screenshot.

**Spec:** `docs/superpowers/specs/2026-09-18-roster-login-state-design.md`

**Issue:** [#94](https://github.com/hoferan/website-les-canetons/issues/94)

## Global Constraints

- **Everything is written in English** except user-visible UI text. Identifiers, comments, test names: English. The rendered strings in this plan: French.
- **French copy uses no gendered participles.** `Aucune connexion` / `Dernière connexion`, never `Jamais connecté`. There is no inclusive-writing convention in this codebase to fall back on.
- **No new colour token, and `text-danger` is not borrowed.** `--color-danger` is error-only by construction (`web/src/styles.css:43`). The status line renders at the weight of the other card fields.
- **Never hand-edit `web/src/api/generated/`.** Nothing in this plan needs to.
- **Run the web suite from PowerShell, not Git Bash**, if working on Windows — Vitest 4 loads two runner instances from a lowercase drive letter and every file fails to collect. Not applicable in a Linux web session.
- **`npm install` in this environment rewrites `package-lock.json`**, stripping `libc` fields because npm here is 10.9.7 and the lockfile was written by npm 11+. If `git status` shows it modified, `git checkout -- package-lock.json` — never commit it.
- The four rendered outcomes, verbatim:

  | `mustChangePassword` | `lastLoginAt` | Rendered |
  | --- | --- | --- |
  | `true` | `null` | `Aucune connexion, mot de passe provisoire` |
  | `true` | date | `Dernière connexion le 1 septembre 2026, mot de passe provisoire` |
  | `false` | `null` | `Aucune connexion` |
  | `false` | date | `Dernière connexion le 1 septembre 2026` |

---

## File Structure

| File | Responsibility |
| --- | --- |
| `web/src/lib/date.ts` (modify) | Gains `formatLastLogin(iso)`. Joins the two existing exports; this is the shared home for date formatting. |
| `web/src/lib/date.test.ts` (modify) | Gains the cases for it. |
| `web/src/members/loginStatus.ts` (create) | The derivation, and the only place the four combinations are decided. |
| `web/src/members/loginStatus.test.ts` (create) | One case per combination. |
| `web/src/pages/Members.tsx` (modify) | Renders the sentence in the card. |
| `web/src/pages/Members.test.tsx` (modify) | Asserts the rendered result per fixture member. |
| `web/src/mocks/handlers.ts` (modify) | A fixture member carrying `mustChangePassword: true`. |

`loginStatus` lives in `web/src/members/` beside `MemberForm.tsx` and `GeneratedPasswordDialog.tsx` rather than inside `Members.tsx`, so its tests need no render and no MSW.

---

### Task 1: The date formatter

**Files:**
- Modify: `web/src/lib/date.ts`
- Test: `web/src/lib/date.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatLastLogin(iso: string): string` — an ISO-8601 instant in, `"1 septembre 2026"` out. Zurich time, no time-of-day.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/date.test.ts`, and add `formatLastLogin` to the existing `import { ... } from "./date";` line at the top:

```ts
test("a login instant renders as a French date without a time", () => {
  expect(formatLastLogin("2026-09-01T19:30:00+02:00")).toBe("1 septembre 2026");
});

// The reason the formatter pins a timeZone rather than using the viewer's.
// This instant is 31 December in UTC and 1 January in Fribourg; a committee
// member reading the roster is in Fribourg, and the API sends UTC.
test("a login instant is rendered in Zurich time, not UTC", () => {
  expect(formatLastLogin("2026-12-31T23:30:00Z")).toBe("1 janvier 2027");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run web/src/lib/date.test.ts`

Expected: FAIL. The import of `formatLastLogin` does not resolve, so the file fails to collect.

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/date.ts`:

```ts
/**
 * A last-login instant as a French date: "1 septembre 2026".
 *
 * NO TIME, unlike the near-identical formatters in Inbox.tsx and
 * ContactMessages.tsx. A contact message is a worklist item whose minute
 * matters; a last login is read as "recently or not", and the minute only
 * makes the longest line on a roster card longer.
 *
 * THE TIMEZONE IS PINNED, and that is not cosmetic: the API sends UTC, and an
 * evening login in Fribourg is the previous day in UTC. Formatted in the
 * viewer's zone it would also differ between two committee members reading the
 * same roster.
 */
const LAST_LOGIN = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatLastLogin(iso: string): string {
  return LAST_LOGIN.format(new Date(iso));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run web/src/lib/date.test.ts`

Expected: PASS, 7 tests (5 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/date.ts web/src/lib/date.test.ts
git commit -m "feat(web): format a last-login instant as a French date"
```

---

### Task 2: The derivation

**Files:**
- Create: `web/src/members/loginStatus.ts`
- Test: `web/src/members/loginStatus.test.ts`

**Interfaces:**
- Consumes: `formatLastLogin(iso: string): string` from Task 1, imported from `../lib/date`.
- Produces: `loginStatus(member: LoginStatusFields): string`, where
  `type LoginStatusFields = Pick<MemberResource, "mustChangePassword" | "lastLoginAt">`.
  Both the function and the type are exported.

- [ ] **Step 1: Write the failing test**

Create `web/src/members/loginStatus.test.ts`:

```ts
import { expect, test } from "vitest";

import { loginStatus } from "./loginStatus";

// One case per combination of the two fields. All four are reachable, which is
// why the status names all four rather than letting one field win: a
// provisional password never used may never have reached the person, while one
// already used means they are in and have not finished. Different phone calls.

test("a provisional password that has never been used says both things", () => {
  expect(loginStatus({ mustChangePassword: true, lastLoginAt: null })).toBe(
    "Aucune connexion, mot de passe provisoire",
  );
});

test("a provisional password that has been used keeps the date", () => {
  expect(
    loginStatus({ mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
  ).toBe("Dernière connexion le 1 septembre 2026, mot de passe provisoire");
});

test("an account that has never been used says so", () => {
  expect(loginStatus({ mustChangePassword: false, lastLoginAt: null })).toBe(
    "Aucune connexion",
  );
});

test("an account in use reads as its last login", () => {
  expect(
    loginStatus({ mustChangePassword: false, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
  ).toBe("Dernière connexion le 1 septembre 2026");
});

// No participle agrees with the member anywhere in this vocabulary. "Jamais
// connecté" would need to, and this codebase has no inclusive-writing
// convention to reach for.
test("no rendered status carries a participle that agrees with the member", () => {
  const every = [
    loginStatus({ mustChangePassword: true, lastLoginAt: null }),
    loginStatus({ mustChangePassword: true, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
    loginStatus({ mustChangePassword: false, lastLoginAt: null }),
    loginStatus({ mustChangePassword: false, lastLoginAt: "2026-09-01T19:30:00+02:00" }),
  ];
  for (const status of every) {
    expect(status).not.toMatch(/connecté/i);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run web/src/members/loginStatus.test.ts`

Expected: FAIL. `./loginStatus` does not exist, so the file fails to collect.

- [ ] **Step 3: Write the implementation**

Create `web/src/members/loginStatus.ts`:

```ts
import type { MemberResource } from "../api/generated/model";
import { formatLastLogin } from "../lib/date";

/**
 * The two fields the status is derived from, and nothing else.
 *
 * Pick rather than the whole resource, so a test needs two fields rather than
 * a fixture member — and so nothing here can quietly start depending on a
 * third field without saying so in this type.
 */
export type LoginStatusFields = Pick<MemberResource, "mustChangePassword" | "lastLoginAt">;

/**
 * Whether this person can actually log in, and whether they ever have.
 *
 * FOUR OUTCOMES, NOT THREE. The tempting collapse is to let the provisional
 * password win outright and drop the date with it. It merges two rows that
 * want different things: a password never used may never have reached the
 * person at all, and one already used means they are in and have not finished.
 *
 * The issue this comes from (#94) asks for a "never issued" state as well.
 * There is no such state: 2026_09_08_000001_require_member_credentials made
 * members.password NOT NULL and MemberController::store() generates one for
 * every new member. Everybody has a credential; the question is whose it is.
 */
export function loginStatus(member: LoginStatusFields): string {
  const connection =
    member.lastLoginAt === null
      ? "Aucune connexion"
      : `Dernière connexion le ${formatLastLogin(member.lastLoginAt)}`;

  return member.mustChangePassword ? `${connection}, mot de passe provisoire` : connection;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run web/src/members/loginStatus.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/members/loginStatus.ts web/src/members/loginStatus.test.ts
git commit -m "feat(web): derive a member's login status from their two account fields"
```

---

### Task 3: The fixture that makes the provisional branch renderable

**Files:**
- Modify: `web/src/mocks/handlers.ts` (the `initialMembers()` fixture, member id 4)

**Interfaces:**
- Consumes: nothing.
- Produces: a mocked roster in which at least one member has `mustChangePassword: true`, so Task 4's assertion and the Playwright screenshot both have the branch to render.

**Why this is its own task and its own commit:** it changes shared fixture data that every roster test reads. A reviewer can weigh it on its own, and if it breaks an unrelated test that is the commit to look at.

- [ ] **Step 1: Run the roster suite first, to know what green looks like before the fixture moves**

Run: `npx vitest run web/src/pages/Members.test.tsx web/src/mocks/handlers.test.ts`

Expected: PASS. Record the test count; Step 3 compares against it.

- [ ] **Step 2: Change member 4's fixture**

In `web/src/mocks/handlers.ts`, inside `initialMembers()`, find the member with `id: 4` (Camille Committee) and change `mustChangePassword: false` to the commented `true` below. Leave every other field, and every other member, alone:

```ts
      username: "demo.committee",
      // TRUE, WHERE THE SEEDER SAYS FALSE — deliberately, and for the same
      // reason member 1 carries a lastLoginAt the seeder leaves null: the
      // roster renders a status derived from this field, and a mock that
      // mirrored DevSeeder byte-for-byte would leave the branch unrenderable
      // in both the mocked backend and Playwright.
      //
      // It reads as a member the committee has issued a password to who has
      // not used it yet, which is a state a real roster is in most of the time
      // just after somebody is added.
      mustChangePassword: true,
      lastLoginAt: null,
```

- [ ] **Step 3: Run the suites again to see what the fixture change touched**

Run: `npx vitest run web/src/pages/Members.test.tsx web/src/mocks/handlers.test.ts`

Expected: PASS, the same count as Step 1. If anything fails, it is a test that was reading member 4's account state; fix the test to state what it means rather than reverting the fixture.

- [ ] **Step 4: Commit**

```bash
git add web/src/mocks/handlers.ts
git commit -m "test(web): give a mocked member a provisional password"
```

---

### Task 4: The status on the card

**Files:**
- Modify: `web/src/pages/Members.tsx` (the card body, after the `Rôles` line)
- Test: `web/src/pages/Members.test.tsx`

**Interfaces:**
- Consumes: `loginStatus(member)` from Task 2, and the `mustChangePassword: true` fixture from Task 3.
- Produces: a `<p data-testid="member-login-status">` inside each `[data-member]` card.

- [ ] **Step 1: Write the failing test**

Append to `web/src/pages/Members.test.tsx`. `rowFor` and `renderRoster` already exist at the top of that file:

```ts
/**
 * #94. The roster said nothing about whether a person could actually log in,
 * so a member still holding a committee-issued password looked identical to
 * one using the site every week.
 */
test("each card says whether the account has ever been used", async () => {
  await renderRoster();

  // demo.direction, the one fixture member with a last login.
  expect(within(rowFor("Direction")).getByTestId("member-login-status")).toHaveTextContent(
    "Dernière connexion le 1 septembre 2026",
  );

  // demo.player, who has a password of their own and has never used it.
  expect(within(rowFor("Player")).getByTestId("member-login-status")).toHaveTextContent(
    "Aucune connexion",
  );
});

test("a member still on a committee-issued password says so", async () => {
  await renderRoster();

  expect(within(rowFor("Committee")).getByTestId("member-login-status")).toHaveTextContent(
    "Aucune connexion, mot de passe provisoire",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run web/src/pages/Members.test.tsx`

Expected: FAIL on the two new tests, with `Unable to find an element by: [data-testid="member-login-status"]`. Every pre-existing test in the file still passes.

- [ ] **Step 3: Render it**

In `web/src/pages/Members.tsx`, add the import beside the existing ones:

```tsx
import { loginStatus } from "../members/loginStatus";
```

and add the line to the card, directly after the `Rôles` paragraph:

```tsx
            <p className="text-sm">Rôles&nbsp;: {rolesOf(member, labelForRole)}</p>
            {/* NO `Label : value` PREFIX, unlike every field above it, and
                that is not an oversight. The card labels each field because
                the real <th> went when the card became the only layout
                (#130) — the label is what puts the meaning beside the value
                in the reading order. This value carries its own: "Connexion :
                Dernière connexion le …" is the label twice. */}
            <p data-testid="member-login-status" className="text-sm text-ink-muted">
              {loginStatus(member)}
            </p>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run web/src/pages/Members.test.tsx`

Expected: PASS, the whole file.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Members.tsx web/src/pages/Members.test.tsx
git commit -m "feat(web): show login state on each roster card

Closes #94"
```

---

### Task 5: Verification and the closing evidence

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a green `npm run check`, and a 390px screenshot of `/members` for the issue.

`CLAUDE.md`: *"Close with evidence, not assertion. A green suite is routinely green over a visibly broken page here."* Steps 3-5 are that evidence.

- [ ] **Step 1: Run the whole web suite**

Run: `npm run test:web`

Expected: PASS. If a test outside `Members.test.tsx` fails, it is almost certainly Task 3's fixture change — read that test before changing anything.

- [ ] **Step 2: Run the full gate**

Run: `npm run check`

Expected: PASS — typecheck, Pint, both test suites, eslint, stylelint, prettier, secret guard.

Note `npm run lint:types` prints a notice and exits 0 in a web session: Larastan is not installed here by choice, so **no PHP is type-checked locally**. This change touches no PHP, so nothing is owed — but do not read that 0 as coverage.

- [ ] **Step 3: Take the screenshot**

Write `web/e2e/roster-login-state.screenshot.ts` as a throwaway spec, run it, then delete it — it is evidence, not a test the suite should carry:

```ts
import { expect, test } from "@playwright/test";

test("roster at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill("demo.direction");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.goto("/members");
  await expect(page.getByTestId("roster-cards")).toBeVisible();
  await page.screenshot({ path: "/tmp/roster-login-state.png", fullPage: true });
});
```

Run: `npx playwright test web/e2e/roster-login-state.screenshot.ts`

If the login selectors do not match, read `web/e2e/members.spec.ts` — it already logs in and its selectors are the ones that work.

Expected: a PNG at `/tmp/roster-login-state.png` showing cards in more than one state. **Look at it.** A green suite over a broken page is the failure mode this step exists for.

- [ ] **Step 4: Delete the throwaway spec**

```bash
rm web/e2e/roster-login-state.screenshot.ts
git status --short   # expect: clean, apart from package-lock.json if npm install ran
```

- [ ] **Step 5: Push**

```bash
git push -u origin claude/milestone-issues-web-gu9q07
```

- [ ] **Step 6: Report**

Post the screenshot and the failing-then-passing `loginStatus` cases as the issue's closing evidence. State plainly anything that was not run.

---

## Deliberately not in this plan

**Refactoring `Inbox.tsx:9` and `ContactMessages.tsx:35`** onto the shared formatter. Each holds its own `Intl.DateTimeFormat` for a similar shape, and after Task 1 there are three. Unrelated to this issue, and each is load-bearing for its own screen's tests.

**A colour or badge for the states that need attention.** No warning token exists and `--color-danger` is error-only. If a muted line proves too quiet against a real roster, that is an issue with a real token behind it.

**The `demo.young` fixture contradiction.** Member 5 is commented "the account is used — just not by the member" (a parent logs in on the child's behalf) and carries `lastLoginAt: null`. Task 4 renders that as `Aucune connexion`, so the fixture now visibly contradicts its own comment. It is left alone here because deciding which of the two is wrong is a question for whoever owns the seeded roster, not a side effect of this change. Raise it on the issue.
