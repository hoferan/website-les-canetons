# The members' area — design

**Date:** 2026-08-29
**Branch:** `feat/spa-cutover`
**Status:** approved, ready for a plan

Sub-project **C**. Four routes: `/sinscrire`, `/inscriptions_utilisateurs`,
`/inscriptions_admin`, `/admin`.

**A and B are done**, so this lands on a finished design system and a working
login. When this ships, **only the three flag-gated souper routes (D) remain on
`Placeholder`.**

This is the first sub-project that is not a straight port: it touches the API, it
is the first to wire the route guards to real URLs, and it has to fix a
generated type that is currently wrong.

## What the members' area does

Members answer *"am I playing on Saturday?"*. The Team Direction reads the
answers. That is the whole feature, and it is the reason the site has a login.

| Route | Who | What |
| --- | --- | --- |
| `/sinscrire` | any member | Upcoming events. One row per event, with a per-row action that differs by capability. |
| `/inscriptions_utilisateurs?id=N` | `respond` | The participation form for one event. |
| `/inscriptions_admin?id=N` | `view_summary` | Who answered what, and how many of each register. |
| `/admin` | `manage_events` | The admin's landing page. |

### The capability matrix is not a hierarchy, and this is where that bites

```
user      → respond
moderator → respond
admin     → manage_events, view_summary
```

**An admin cannot respond.** The Team Direction organises events; it does not
vote in them. So on `/sinscrire` a member sees "S'inscrire" and an admin sees
"Résumé" — *different buttons on the same row*, not one button with different
permissions. Anyone who assumes admin ⊃ user will build this wrong, and the
guards will not catch it because `RequireCapability` is UX only; Laravel's
`capability:` middleware is the enforcement.

## The three fixes this sub-project carries

### 1. `GET /api/responses` is typed `string[]` and is not

`web/src/api/generated/endpoints.ts` declares:

```ts
export type responseIndexResponse200 = { data: string[]; status: 200 };
```

The endpoint actually returns a list of objects. `ResponseController::index()`
already documents the real shape in a docblock:

```php
@return array<int, array{username: string, instrument: ?string, response: ?string}>
```

Scramble cannot infer through the `Collection::map` that builds it — the same
reason `GET /api/events` was wrong, and the fix is the same one, already proven
in this codebase:

```php
#[ApiResponse(status: 200, type: 'list<array{username: string, instrument: string|null, response: string|null}>')]
```

It must be a **literal**, not a `@phpstan-type` alias — Scramble resolves an
alias to a property-less object, which is how `GET /api/events` ended up as
`string[]` in the first place.

That leaves the shape written twice, in the attribute and the docblock. **A
contract test makes that duplication safe**, mirroring the existing
`api/tests/Feature/EventShapeContractTest.php`: it fails if the two disagree.

`openapi-drift` in CI will **not** catch any of this — it checks that the
committed document matches what Scramble emits, not that what Scramble emits is
right.

### 2. The instrument list is hardcoded in the front end

`inscriptions_admin.js` carries nine French instrument names in an array —
"Trompette", "Trombone", "Sousaphone", "Cloches", "Batterie", "Lyre",
"Grosses-Caisse", "Comite", "Maquillage" — while the database has an
`instruments` table that no route exposes. Two sources of truth, one of them in
a JavaScript file.

**The list is derived from the response instead.** `ResponseController::index()`
returns *every* user with their instrument, whether or not they answered, so
the register list falls out of the data. No hardcoded French in code, no drift
from the table, and no new endpoint.

What this loses: a register that **no user plays** disappears from the summary
instead of showing a zero. That is the correct behaviour — a count of zero for
an instrument nobody in the band plays is noise, and a register with members who
simply have not answered still appears, with its zero.

### 3. `/admin` becomes a real hub

The old page was two buttons: "Ajouter un événement", linking to
`/planning_repet?admin=true`, and "Se déconnecter". Both are now redundant — the
planning page shows admins the event form automatically, and logout lives on the
login route.

Rather than reproduce two buttons that no longer do anything distinct, `/admin`
becomes the page it was trying to be: an admin landing page linking to the
things an admin does — manage the planning, and read the attendance summaries.
It stays gated on `manage_events`.

## Guards: the first real use

Nothing has been wrapped in `RequireAuth` or `RequireCapability` until now —
`grep RequireAuth web/src/routes.tsx` returns nothing. They are unit-tested and
they already carry the attempted path into router state, but no URL has ever
exercised the bounce.

| Route | Guard |
| --- | --- |
| `/sinscrire` | `RequireAuth` — any member; the row actions differ inside |
| `/inscriptions_utilisateurs` | `RequireCapability capability="respond"` |
| `/inscriptions_admin` | `RequireCapability capability="view_summary"` |
| `/admin` | `RequireCapability capability="manage_events"` |

The behaviour these encode, and which must be tested now that it is reachable:

- an **anonymous** visitor is redirected to the login route, carrying the path
  they wanted;
- a **logged-in** member without the capability is **refused in place**, not
  redirected — bouncing someone already past the login form reads as "your
  session expired" and invites them to log in again at something they will never
  be allowed to see;
- after logging in from a bounce, they land on **the page they originally
  wanted**, which `safeReturnTo` already handles.

## The pages

### `/sinscrire` — Événements à venir

A table: Date, Titre, Inscription. Rows come from `GET /api/events`, which
already returns each event's `response` for the calling user.

The action cell, by capability:

- `respond` and no answer yet → **"S'inscrire"**, linking to
  `/inscriptions_utilisateurs?id=N`
- `respond` and already answered → **"Choix enregistré"**, disabled
- `view_summary` → **"Résumé"**, linking to `/inscriptions_admin?id=N`

The old page sorted client-side by date. **The API already orders by date**, as
`/planning_repet` established, so the re-sort is dropped — with a test pinning
the order so a change in the API's ordering fails there rather than being
papered over in the UI.

### `/inscriptions_utilisateurs?id=N` — the participation form

Reads the event id from the query string. Fields: the member's username
(read-only, from the session), and a participation select —
"Je participe" / "Je ne participe pas", posting `participate` /
`notparticipate`. Submits `POST /api/responses`.

**It shows which event it is about.** The old page did not: the heading was
"Inscription à l'événement" and nothing on screen said which one. That is a
defect, not a feature, and the event's date and title come free from the list
already loaded.

A missing or non-numeric `?id=` renders a French error rather than posting
garbage — the API answers `validation_failed` with `invalid_number`, which
`translateApiError` already renders.

### `/inscriptions_admin?id=N` — the summary

Three tiles: **Participe**, **Ne participe pas**, **En attente** (the members
who have not answered — `rows.length` minus the other two). Then a table of
username / instrument / participation, and a per-register count of those
participating.

`aria-live="polite"` on the tiles, as the old page had.

### `/admin` — the hub

Links to `/planning_repet` and `/sinscrire`, with a line each saying what they
are for. Gated on `manage_events`.

## Testing

- **The capability split on `/sinscrire`** — a `user` sees "S'inscrire", an
  `admin` sees "Résumé", and neither sees the other's. This is the assertion
  that catches someone assuming admin ⊃ user.
- **"Choix enregistré" is disabled** when the event already carries a response.
- **Each guard**, at its real URL: anonymous → redirected; wrong capability →
  refused in place; right capability → through.
- **The summary counts**, including En attente, against a fixture with all three
  states.
- **The instrument counts** count only participants, not everyone with that
  instrument.
- **A missing `?id=`** renders a French error rather than posting.
- **The contract test** on the API side.

The mocked backend needs `GET /api/responses` hand-written — the generated
handler returns faker data, and every one of these assertions is about specific
counts.

## Out of scope

- The souper — D.
- Any change to `POST /api/responses`, which works.
- Editing a response once given. The old site had no such feature; "Choix
  enregistré" is final. Worth raising with the band later, but not something to
  invent here.

## Risks

- **The capability matrix.** Stated three times above because it is the one
  thing here that intuition gets wrong.
- **`?id=` is user input** on two routes. It is a route the API gates on
  capability, and the API validates the value — but the SPA should not render a
  summary for a garbage id and call it empty.
- **The generated client must be regenerated** after the API attribute lands:
  `npm run openapi && npm run generate:api`, and the result committed. CI's
  `openapi-drift` job fails if either is stale.
- **`GET /api/signups` is still typed `string`** and stays that way — it is D's
  to fix, and touching it here would mean regenerating a client for an endpoint
  nothing in this sub-project calls.
