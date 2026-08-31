# The souper — design

**Date:** 2026-08-29
**Branch:** `feat/spa-cutover`
**Status:** approved, ready for a plan

Sub-project **D**, and the last one. Three routes — `/signup`, `/signup_thanks`,
`/signups_admin` — plus the call-to-action on `/accueil` that was deferred
because it had nowhere to link, and the type fix on `GET /api/signups` that C
left behind.

**A, B and C are done.** When this ships,
`grep -c "<Placeholder" web/src/routes.tsx` returns **0**, which is the agreed
green light for the merge to `main` — the moment the live site changes hands
from the PHP app to the SPA. Confirm with André before merging; that merge
auto-deploys TEST.

## What the souper is

The band is turning 25. The occasion — currently
`anniversary-supper`, *"Souper des 25 ans des Canetons"*, 13 November 2027 — is
an anniversary dinner with a new costume, open to friends and families, not only
to members. So this sub-project is the **only** part of the site where an
anonymous member of the public writes to the database.

That single fact shapes everything below: the write endpoint is public, and
therefore it is the one endpoint with anti-abuse machinery, and the one whose
read side is locked to `view_summary` because it lists every guest's name,
address, phone and email.

| Route | Who | What |
| --- | --- | --- |
| `/signup` | anyone, anonymous | Reserve a table: contact details plus one menu per guest. |
| `/signup_thanks` | anyone | Static confirmation. |
| `/signups_admin` | `view_summary` | Totals by menu and by table, every reservation, and the xlsx export. |

All three exist **only while `SOUPER_SIGNUP_ENABLED` is on**, exactly as the old
route table registered them conditionally. `routes.tsx` already gates them on
`config.features.souper_signup`; a server with the feature off has no such page
rather than an empty one, and `GET /api/config` returns `occasion: null` there,
so no copy about an unannounced event is published either.

### The API half is already built

Unusually for this cutover, there is almost nothing to write on the Laravel
side. `SignupController`, `AltchaController`, `SignupRequest`, `Occasion`,
`SignupStats`, `ChallengeGuard`, `SignupConfirmation` and the
`feature.souper_signup` middleware all exist, are tested, and are documented in
`api/routes/api.php`. `GET /api/config` already ships every field the form and
the CTA need: `title`, `subtitle`, `date`, `dateDisplay`, `teaser`,
`invitation`, `maxGuests`, and `menus[]` as `{value, label, description,
price}`.

D consumes all of that. It changes exactly one thing on the API: the *declared
type* of `GET /api/signups`.

## The fix D must carry: `GET /api/signups` is typed `string`

`web/src/api/generated/endpoints.msw.ts` says it plainly:

```ts
export const getSignupIndexResponseMock = (): string =>
```

The endpoint returns an object. This is the third instance of one failure —
Scramble cannot infer through a `Collection::map`, so `GET /api/events` was
`string[]`, `GET /api/responses` was `string[]`, and this one is `string`.
**`openapi-drift` will not flag it**: that job checks the committed document
matches what Scramble emits, not that the shape is right.

The fix is the one proven twice already:

```php
use Dedoc\Scramble\Attributes\Response as ApiResponse;

#[ApiResponse(status: 200, type: '...')]
public function index(Request $request): JsonResponse|StreamedResponse
```

Two constraints carry over from C, and one is new:

1. **The type must be a LITERAL.** Scramble resolves a `@phpstan-type` alias to
   a property-less object, which is how the shape ends up written twice and why
   a contract test is mandatory.
2. **The contract test needs a database.** As with the response shape, there is
   no `toFrontendShape()`-style seam callable on an unsaved model:
   `SignupStats::compute()` runs over rows. So
   `api/tests/Feature/SignupShapeContractTest.php` is copied from
   `ResponseShapeContractTest.php`, not from `EventShapeContractTest.php`, and
   asks the endpoint.
3. **New here: `index()` has two return types.** `JsonResponse|StreamedResponse`,
   because `?format=xlsx` streams a spreadsheet. The attribute pins the JSON
   200; the test must assert against the JSON branch specifically and must not
   be satisfied by the xlsx one.

The shape, from `SignupStats::compute() + ['occasion' => Occasion::active()]`:

```
totalPersons  int
totalTables   int
menuTotals    {meat:int, child:int, vegetarian:int}
tables[]      { name:string, personCount:int,
                menuCounts:{meat,child,vegetarian},
                signups[]: { first_name, last_name, address, phone, email,
                             personCount, menuCounts } }
occasion      { title, subtitle, date, date_display, teaser, invitation }
```

### A wart this types faithfully rather than fixes

`occasion` here is the **raw** `Occasion::active()` array, carrying
**`date_display`**. `GET /api/config` ships the same concept camelCased as
**`dateDisplay`**. Two names for one field, in one API.

D types it as it is. Normalising would be an unforced change to a shipped
endpoint, and `/signups_admin` reads only `occasion.title`. The contract test
pins the asymmetry so it cannot drift further, and this paragraph is the record
that it is known rather than overlooked. If the two are ever unified, unify them
in one deliberate change with both tests updated together.

## `/signup` — the public reservation form

The only public write in the system, and a faithful port of `signup.php` +
`signup.js` with three deliberate departures, listed below.

### Where the copy comes from

`useSession().config.occasion` — no extra fetch. The route only exists when the
feature is on, and `occasion` is non-null exactly when the feature is on, but
the type is nullable and the page narrows it rather than asserting past it.

Title, subtitle, teaser and invitation head the page. The menu cards — label,
price, description — come from `occasion.menus`, so the three menus and their
prices are never restated in the front end. `Occasion::MENU_INFO` is the single
source of truth for them and `ConfigController::menuEntry()` throws rather than
publish a blank price.

### The contact fieldset

`first_name`, `last_name`, `address`, `phone`, `email`, `table_name` — **all
six in snake_case**, because `SignupRequest` validates them that way and
`ApiError` echoes the field name straight into `fields[].field`, which
`translateApiError()` looks up. The contact form uses camelCase. **The two forms
genuinely differ; do not normalise either to the other.** All six names, and
`menus`, already have French labels in `web/src/i18n/fr.ts`.

The fields go through `FormField` + `useApiFormError`, the same as `/contact`
and the event form, so a rejected field's message lands against the offending
input.

### Departure 1: no table-name suggestions

The old form server-rendered a `<datalist>` of every existing table name, with
the hint *"Commencez à taper : les tables déjà créées vous seront proposées."*
The label is *"nom de famille ou nom de table"* — so on a **public,
unauthenticated** page that datalist let anyone enumerate the surnames of
everyone who had reserved.

**Decided: drop it.** The field stays free-text and required; the hint is
reworded to carry the affordance without the list — the point was always
*"choisissez la même table pour être placés ensemble"*, and that instruction
survives without publishing anyone's name. No new endpoint is added.

The cost is real and accepted: a typo puts a family at two tables and nothing
warns them. The admin summary groups by exact string, so a mismatch is visible
on `/signups_admin` and fixable in the database.

### The honeypot

A `website` field, visually hidden, `aria-hidden`, `tabIndex={-1}`,
`autoComplete="off"`, submitted as `hp`. `SignupController::store()` checks it
**first**, before validation, and answers a plain `201 {"ok":true}` without
storing or mailing, so a trapped bot never learns it was trapped. The front end
must keep the field present and must keep sending it; an empty string is the
pass.

### The menu picker: per-person rows

Decided: **port the old interaction**, one row per guest — `Personne N`, a
three-option `<select>` built from `occasion.menus`, and a ✕ remove button —
starting with one row, with **＋ Ajouter une personne** below.

A per-menu quantity stepper was considered. The payload is identical (the API
only ever counts `menus[]`; order is never read) and it is fewer clicks for a
table of eight. It was rejected as a visible change to a page returning visitors
have used, and because one-row-per-person is how a family actually fills the
form in.

Two things the old picker lacked are added:

- **The 30-guest cap is enforced before submit.** `occasion.maxGuests` is 30.
  The old JS had no cap at all: a 31st row made the round trip, was rejected by
  `Occasion::normalizeMenus()`, and surfaced as a generic
  `alert("Échec de l'envoi du formulaire")` naming no cause. Adding is refused
  at the cap with a message that says why.
- **A running total** — how many people, and how many of each menu.

### Departure 2: the proof-of-work, in its own module

`web/src/api/altcha.ts`, one export:

```ts
solveChallenge(challenge: Altcha200): Promise<string>
```

Hash `salt + n` with SHA-256 for `n = 0…maxnumber`, compare the hex digest to
`challenge`, and return the base64-encoded
`{algorithm, challenge, number, salt, signature}` payload. Throw if the space is
exhausted or the challenge is malformed — **fail closed**, matching the server,
where an unverifiable challenge is a refusal and never a pass.

Not a Web Worker: `AltchaController::MAX_NUMBER` is 50 000, the average is a few
thousand, and every `crypto.subtle.digest` already yields to the event loop. Not
the old recursive promise chain either — a plain loop reads better and the
recursion bought nothing.

It is a separate module precisely so it can be unit-tested without a form: build
a challenge whose answer is known, assert the returned payload decodes to that
number. If jsdom has no `crypto.subtle`, that one file runs under
`@vitest-environment node`.

### Departure 3: real errors instead of `alert()`

The old page caught **every** failure — a 503 from `/altcha`, an unsolvable
challenge, a validation rejection, a network error — into one
`alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et
réessayer.")`.

D uses `useApiFormError` + `FormError`, as `/contact` does: the summary region
carries the message, and per-field problems land against their inputs.
`captcha_failed` already has French copy in `fr.ts`
(*"Vérification anti-robot échouée, veuillez réessayer."*).

### Submitting

On submit: solve the challenge first, with the button showing **Vérification…**
and `aria-disabled` — `aria-disabled`, not `disabled`, as `Login.tsx` and
`Contact.tsx` do, with an early return in the handler as the real double-submit
guard. Then POST. On success, `navigate("/signup_thanks")` — pushed, not
replaced, so Back returns to the form, matching the old
`window.location.href`. On failure the button is restored and **the values are
not cleared**: a rejected reservation must not make someone retype it.

## `/signup_thanks`

Static, and **always reachable** — no navigation-state gate. This mirrors the
already-shipped `/confirmation`, which is the same thing for the contact form:
its own URL rather than an inline success state, because that is what the old
page was and the path is in the wild.

Content is the old page's: 🎉🦆, *"Merci pour votre inscription !"*, the lead
naming `occasion.title`, the note about the confirmation e-mail and the spam
folder, *"Rendez-vous le {dateDisplay} !"*, and a link back to `/`.

Both dynamic values come from `config.occasion`.

## `/signups_admin`

Wrapped in `RequireCapability capability="view_summary"` in `routes.tsx` — the
same guard `/inscriptions_admin` uses, and for the same reason: `admin` alone
holds `view_summary`, and this page lists every guest's name, address, phone and
email. The guard is UX only; `capability:view_summary` on the route is the
enforcement, and the feature gate runs before it, so a disabled server 404s an
anonymous caller rather than 401ing them.

Structure, from `signups_admin.js`:

- **Five tiles** — Total personnes, Total tables, Viande, Enfant, Végétarien —
  as a **named** `<ul aria-label>`, following `/inscriptions_admin`. Naming the
  list is not cosmetic: the layout's nav is a list too, and an unscoped
  `getByRole("listitem")` counts nav items.
- **One table**, `Table / Contact · Tél. · Viande · Enfant · Végét. · Total`,
  with a group row per table followed by a row per reservation. The contact cell
  is the name in `<strong>` over the address. A zero renders as **–**, not `0`.
- **A `Total général` foot row.**
- **The export** as a plain `<a href="/api/signups?format=xlsx">⬇ Exporter en
  Excel</a>` — a normal navigation, which carries the session cookie. The
  generated client cannot stream a download, and routing a file through
  `customFetch` to rebuild it as a blob would buy nothing.

Pending and error states follow `/inscriptions_admin`: *Chargement…*, and a
`role="alert"` failure line.

## The `/accueil` call-to-action

Restored, flag-gated, from `accueil.php`. Rendered only when
`config.features.souper_signup` **and** `config.occasion` are both truthy — the
second is what narrows the type, not a redundant check.

The card shows 🦆🎉, the title, the subtitle and the display date, then splits on
capability, exactly as the old page did:

- `view_summary` → *"Consultez les inscriptions : totaux par menu et par
  table."* and **Voir les inscriptions** → `/signups_admin`
- everyone else, including anonymous visitors → the teaser, the invitation, and
  **S'inscrire au souper** → `/signup`

Note the split is on capability, not on being logged in: a `user` or `moderator`
sees the public half, because they may not read the summary.

`Accueil.tsx`'s docblock, which currently explains why the CTA is absent, is
replaced.

## Mocks

`web/src/mocks/handlers.ts` today answers `GET /api/config` with
`features: { souper_signup: false }, occasion: null`. **Under the mocked backend
the three souper routes therefore do not exist at all** — which means Playwright
has never seen them. D flips the flag on and adds the occasion, then adds three
handlers:

- `GET /api/altcha` — must return a **genuinely solvable** challenge: a real
  SHA-256 of `salt + n` for a small chosen `n`. A stub the solver cannot solve
  makes the mocked form permanently unsubmittable, and the failure looks like a
  bug in the page.

  `maxnumber` stays **50000**: orval types it as that literal (Scramble read it
  off `AltchaController::MAX_NUMBER`), so a mock typed `Altcha200` cannot shrink
  it — and does not need to. It is only the upper bound; the solver returns at
  the first match, so a challenge answered by `n = 3` costs four digests.
- `POST /api/signups` — accepts, validates enough to exercise the French field
  errors, and honours the honeypot.
- `GET /api/signups` — a seeded summary with at least two tables, a
  multi-reservation table and at least one zero cell, so the grouping, the
  `–` rendering and the totals are all visible.

Two existing assertions pin the old values and must move with it:

- `web/src/mocks/handlers.test.ts:18` — `expect(result.data.features).toEqual({ souper_signup: false })`
- `web/src/routes.test.tsx:46` — already forces `souper_signup: true` **with
  `occasion: null`**, which breaks the moment a souper page reads the occasion
  copy.

## Testing

**Vitest** — `altcha.test.ts` (solves a known challenge; rejects a malformed one
and an exhausted space), `Signup.test.tsx` (rows add, remove and renumber; the
cap refuses a 31st with a reason; the honeypot is present and hidden; a field
error lands on its own input; no double submit), `SignupsAdmin.test.tsx` (five
tiles, group rows, `–` for zero, the foot total, the export href),
`SignupThanks.test.tsx`, and `Accueil.test.tsx` for all three CTA states —
admin, non-admin, and flag off.

**Playwright** — a souper spec against MSW: fill the form end to end and land on
`/signup_thanks`; an admin reads the summary; a non-admin is refused at
`/signups_admin`. A context per role — the mocked session lives in
`sessionStorage` and pages in one context share it.

**Laravel** — `SignupShapeContractTest.php`, then
`npm run openapi && npm run generate:api`, and the regenerated client is
committed.

## Verification

The suites are necessary and have never been sufficient: **every sub-project so
far shipped a defect a fully green suite could not see.** So, in order:

1. `npm run check`, `npx vitest run`, `npm run test:e2e`, `npm run build`,
   `npm run smoke`, and the Laravel suite in Docker.
2. **Look at the rendered pages.** Drive Playwright over all three routes and
   `/accueil`, screenshot, and read the PNGs — at desktop width and at 390px,
   where the nav collapses behind the hamburger.
3. **Verify against the real Laravel API**, not only the mocks. The dev stack is
   already configured for it — `SOUPER_SIGNUP_ENABLED=true`, a real
   `ALTCHA_HMAC_SECRET`, and `CACHE_STORE=database`, which
   `verifyChallenge()` requires or it fails closed. Confirm: a reservation
   persists across a reload and reaches the `signups` table; an over-long field
   comes back in French against the offending input; the admin summary counts
   the new reservation; the xlsx export downloads and opens.

Then `grep -c "<Placeholder" web/src/routes.tsx` returns 0, and
`docs/continue-here.md` is rewritten for the merge.

## Out of scope

- **Any change to the signup API's behaviour.** Only its declared type changes.
- **Unifying `date_display` and `dateDisplay`** — recorded above as a known
  wart.
- **A public table-name endpoint** — decided against.
- **The merge to `main` itself.** D ends with the green light, not with the
  merge; André confirms that separately.
