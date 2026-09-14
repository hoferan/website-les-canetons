# R3 — Event registration

**Status:** approved 2026-09-10. Supersedes the three-table sketch in
`2026-09-05-rebuild-design.md` §3, which this refines rather than contradicts.

**Why now, out of release order.** R3 was scheduled after R2, and its schema was
deferred by decision C7. André chose on 2026-09-10 to settle *all* remaining
schema before any more frontend work, for a reason specific to this host:
there is no shell on the shared server, migrations run on the request path, and
a migration that fails takes the whole API down with a 503 until
`AUTO_MIGRATE=false`. Every migration is therefore a deploy-time risk, and
fewer of them is worth reordering releases for. Building the screens comes
after, and the API is expected to change a little when it does — that is
normal and was explicitly accepted.

---

## 1. What this replaces

The souper, generalised. Registration is **a property of an event** (D9), not a
separate feature, so all of this stays deleted: `Occasion` with its
MENU_VALUES / MENU_LABELS / MENU_INFO lockstep problem, `ACTIVE_OCCASION`,
`SOUPER_SIGNUP_ENABLED`, `EnsureSouperSignupEnabled`, and the conditional route
registration in both `api.php` and `routes.tsx`.

**Next year's souper becomes a form the committee fills in, not a deploy.**

The old shape, recovered from `2026_07_23_000004_create_signups_table.php`
before it was deleted, is what this normalises:

```
signups(occasion, first_name, last_name, address, phone, email,
        table_name, menus TEXT)
```

`menus` was a per-guest list — `["meat","meat","child"]` — capped at a
`MAX_GUESTS` constant, with `table_name` for seating. So the old system already
did quantities; it just did them in a text column keyed by a hard-coded
occasion string.

---

## 2. Decisions

| | Decision | Why |
| --- | --- | --- |
| **G1** | **No capacity limit.** Registration is governed by dates alone. | The old souper had no capacity check either, and adding one puts a count-then-insert race on the one endpoint strangers can hammer. The committee watches the list and closes the date early if it fills. |
| **G2** | **No guest self-service.** One public POST; the committee corrects and cancels. | Every additional anonymous endpoint is another thing to rate-limit, and a cancel token is a credential over personal data. |
| **G3** | **Prices are integer centimes**, formatted at display. | Totals become possible — per line, per booking, and a sum the committee can check against the cash box. Never a float: this is money. |
| **G4** | **Name, email and phone required**; address and table_name optional. | A Swiss committee reaches someone by phone the evening before. Address is rarely acted on. |
| **G5** | **Confirmation mail is inline and best-effort.** | See §7. There is no queue worker on this host and no way to run one. |
| **G6** | **Four export formats, server-side**, from one shared row-builder. | XLSX is what a committee member actually opens. |
| **G7** | **`registrations.manage` is a new permission**; options are `events.manage`. | Editing personal data and cancelling a booking is a different act from reading the list. Configuring an event's registration is configuring the event. |
| **G8** | **Honeypot + submit-timing on both public write endpoints.** | Gives §6's orphaned anti-abuse item an owner at last, and fixes `/api/contact`, which has no protection of any kind today. |

---

## 3. Schema

### `events` — three new columns

```
registration_opens_at     datetime NULL   -- NULL = open as soon as closes_at is set
registration_closes_at    datetime NULL   -- THE ENABLE SWITCH
registration_max_guests   int NULL        -- per-BOOKING cap (the old MAX_GUESTS)
```

**Registration is enabled iff `registration_closes_at IS NOT NULL`** — no
separate boolean, per D9. A flag beside a date is a flag that drifts out of step
with it.

`registration_opens_at` exists so the committee can prepare an event whose form
is not yet live. NULL means "open now, subject to the close date".

These are the columns the events migration's docblock already named as
"deliberately absent: the `registration_*` columns (a later release owns them)".
This is that release.

### `event_registration_options`

```
id
event_id       FK events ON DELETE CASCADE
label          string
description    string NULL
price_cents    int NULL          -- 4500 = CHF 45.-
sort_order     int
created_at, updated_at
INDEX (event_id, sort_order)
```

`price_cents` is **nullable**, so a free option, or one whose price is stated in
the description, is expressible without inventing a zero that means "unknown".

**Integer centimes, never a decimal or a float.** Binary floating point cannot
represent 0.1 exactly, and money that is off by a rappen in the tenth row is
money the committee has to reconcile by hand.

### `registrations`

```
id
event_id       FK events ON DELETE CASCADE
first_name     string
last_name      string
email          string
phone          string
address        string NULL
table_name     string NULL
created_at, updated_at
INDEX (event_id)
```

### `registration_choices`

```
id
registration_id  FK registrations             ON DELETE CASCADE
option_id        FK event_registration_options ON DELETE RESTRICT
quantity         int
UNIQUE (registration_id, option_id)
```

**`option_id` is RESTRICT, not CASCADE, and that asymmetry is the point.**
Deleting a registration should take its choices with it — they mean nothing
alone. Deleting an *option* that people have already booked would silently
rewrite what those people ordered, so it is refused instead (see
`option_has_registrations` in §5).

`UNIQUE (registration_id, option_id)` makes "3 × meat" one row carrying a
quantity rather than three rows, which is what makes a total a `SUM` instead of
a `COUNT` over a text column.

### `App\Support\Permission`

Gains one case:

```php
case RegistrationsManage = 'registrations.manage';
```

Granted to `direction` by a seed migration, alongside the existing grants. The
`committee` role keeps `registrations.view` as its only permission, so the role
whose entire purpose is reading the guest list can still do exactly that and
nothing more — which is what option three of that decision would have broken.

Adding the case is legitimate under the enum's own rule ("a permission is real
only if some middleware checks it") because this release adds the middleware
that checks it, in the same change.

---

## 4. API surface

```
PUBLIC — anonymous
  GET  /api/events/{event}/registration      the form's data
  POST /api/events/{event}/registrations     book                    [PublicWriteGuard]
  GET  /api/form-token                       the timing token        (see §6)

COMMITTEE — inside auth:sanctum + no-store
  GET    /api/events/{event}/registrations          registrations.view
  GET    /api/events/{event}/registrations.{fmt}    registrations.view
  PATCH  /api/registrations/{registration}          registrations.manage
  DELETE /api/registrations/{registration}          registrations.manage
  PUT    /api/events/{event}/registration-options   events.manage
```

`{fmt}` is `xlsx` | `csv` | `md` | `json`.

### The public read is new, and necessary

An anonymous form has to know what it is offering, and `GET /api/events/{event}`
sits behind `auth:sanctum`. So `GET /api/events/{event}/registration` returns
only what a stranger may see:

```json
{
  "event": { "title": "...", "startsAt": "...", "endsAt": "...", "location": "..." },
  "options": [{ "id": 1, "label": "...", "description": null, "priceCents": 4500 }],
  "maxGuests": 6,
  "opensAt": "...", "closesAt": "...",
  "open": true
}
```

**Not the whole event.** `notes` is internal, and `is_public` is R2's business.
An event with `registration_closes_at IS NULL` answers **404**, not 403: a
stranger should not learn that an event exists but is not taking bookings.

### Options are replace-all

`PUT`, not three per-option endpoints, matching `PUT /members/{member}/roles`:
the committee edits the option list as a set in one form, and an "add one" API
cannot express removal. The body is the complete list; entries carrying an `id`
are updated, entries without one are created, and absent ones are deleted —
unless deleting one would orphan a booking, which is `409
option_has_registrations`.

### Deleting an event must name the damage

`DELETE /api/events/{event}` answers a bare `{ok: true}` today. Both cascades
now hang off it, so it grows counts:

```json
{ "ok": true, "attendanceDeleted": 12, "registrationsDeleted": 43 }
```

R1c-1's Task 12 ("deleting an event, with the damage named") is the screen that
renders this, and R1c-2 adds the attendance half of the number.

---

## 5. Error vocabulary

Every token below needs French copy in `web/src/i18n/fr.ts` or
`ApiErrorVocabularyTest` fails.

| Status | Code | When |
| --- | --- | --- |
| 422 | `spam_suspected` | honeypot filled, or submitted too fast / too late |
| 404 | — | registration not enabled on this event (deliberately not 403) |
| 409 | `registration_not_open` | before `registration_opens_at` |
| 409 | `registration_closed` | after `registration_closes_at` |
| 409 | `option_has_registrations` | a `PUT` would delete a booked option |
| 400 | `validation_failed` + `fields[].reason = too_many_guests` | the booking exceeds `registration_max_guests` |

New `fields.*` labels: `choices`, `tableName`, `label`, `priceCents`,
`sortOrder`. Deep paths cost one entry each, not one per level, because
`translateApiError` falls back to a path's last segment (added in R1c-1 Task 7)
— so `choices.*.optionId` resolves to `optionId`.

`too_many_guests` is raised from a closure validator, so it must be a
**paramless** token: that path emits `field` and `reason` only, and a token
whose French interpolates would print a literal `{{max}}` on screen.

---

## 6. Anti-abuse — `PublicWriteGuard`

One middleware, applied to **both** anonymous write endpoints:

```
POST /api/contact                        <- fixes the orphan
POST /api/events/{event}/registrations
```

Two checks:

1. **A decoy field** that must arrive absent or empty.
2. **A signed timestamp.** `GET /api/form-token` returns an HMAC of the issue
   time, signed with `APP_KEY` — no storage, no table, no cache entry. The guard
   refuses a submission whose token is under **2 seconds** or over **2 hours**
   old.

Either failure answers `422 spam_suspected`.

**Deliberately not single-use.** The Altcha replay guard that used to exist
(`App\Support\ChallengeGuard`, `Cache::add`) made its challenges one-shot, which
is right for proof-of-work and wrong here: a guest who hits a validation error
and resubmits would be rejected for it, and the form would have to re-fetch a
token on every failed attempt. Replaying a valid token inside its own window is
a marginal attack next to that friction.

**Altcha proof-of-work is a non-goal** (§9). §6 of the rebuild spec asked for
it; honeypot and timing are the server-only two thirds, and the third needs a
browser widget, which does not belong in an API-only phase.

---

## 7. Confirmation mail

Sent **inline, after the transaction commits, and best-effort**: a failure is
logged and the booking still answers 201.

**There is no queue, and this host cannot have one cheaply.** A database queue
needs something to drain it: no shell access (the constraint behind seeding
reference data in migrations and running migrations from request middleware),
no supervisor, so it would need a cron job configured by hand in the hosting
panel on each of TEST, QA and PROD. That is the same class of per-server manual
step as `_api/.env`, and its failure mode is worse than inline's — if cron is
absent or misconfigured, mail silently never sends. Draining the queue from the
request path, the way `RunPendingMigrations` works, would push SMTP latency onto
a random visitor instead of onto the person who submitted the form.

What a queue would buy is not blocking ~1–3s on SMTP, plus retries. For one mail
per registration, at the moment somebody deliberately submitted a form, that is
a poor trade. Revisit only if measured SMTP latency is bad; the path then is a
`jobs` table plus cron, and the first step is confirming the host offers cron at
all.

`QUEUE_CONNECTION` is `sync` in both `api/.env.example` and
`docker/api/env.docker` and stays that way.

---

## 8. Exports

`GET /api/events/{event}/registrations.{xlsx|csv|md|json}`, gated on
`registrations.view`.

**One shared row-builder, four formatters.** The formats must not be able to
disagree about what a guest list contains, so each renders the same array of
rows and a test asserts they agree.

XLSX uses **`openspout/openspout`** — roughly 1 MB, streaming, and needs only
`ext-zip`. Not `phpoffice/phpspreadsheet`, which is ~10 MB and also wants
`ext-gd`; the vendor bundle ships over FTP to a shared host that is already
flaky under concurrency.

Rows carry: name, email, phone, address, table, each option's quantity, the
booking total, and the timestamp. A totals row closes the sheet, which is what
`price_cents` exists for.

---

## 9. Non-goals

- **Total or per-option capacity** (G1). Dates are the whole gate.
- **Guest self-service edit or cancel** (G2). No token column.
- **Payment, or payment status.** The band takes money at the door.
- **A waiting list.** Follows from having no capacity.
- **Altcha proof-of-work** (§6). Needs a browser widget.
- **A public `/events` listing.** Still R2's. This adds one public read scoped
  to a single event's registration form.

---

## 10. Risks

**`ext-zip` is unverified on the shared host.** If it is missing, only XLSX
breaks, and only on the server — locally it works. CSV is the fallback, and this
must be checked on TEST before PROD. Worth an explicit probe rather than waiting
for a 500.

**Guest personal data now has no retention policy.** Name, email, phone and
address for anonymous strangers, kept indefinitely, for an event that happens
once a year. Swiss nFADP territory. Not solved here, and recorded so it is not
solved by accident either — the natural home is a committee-facing "purge
bookings older than N" action, or a note in a privacy page R2 owns.

**The public POST is the first anonymous write since the contact form**, and it
writes four related rows inside a transaction rather than one. The guard in §6
is what stands in front of it; the absence of capacity (G1) is what keeps it
lock-free.

**Deleting an event destroys bookings silently** unless the UI says so. §4's
counts exist for that, and the screen that renders them is R1c-1's Task 12.
