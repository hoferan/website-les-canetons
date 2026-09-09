# R1c — Events and attendance

**Status:** approved 2026-09-09. Supersedes parts of
`2026-09-05-rebuild-design.md` — see §7, which lists every correction.

**Depends on:** R1a (schema, permissions, hardened auth) and R1b (the roster,
`/account`, the login screen, the route guards). Both are built and verified.

---

## 1. What this release is

The band's planning, and the answer to "who is coming?".

R1c gives the committee a screen to enter the season and gives every player a
one-tap way to say whether they will be there. It ends with a chase list: not a
report of who said yes, but the names of the people who have not answered yet.

**It is the members' tool only.** Nothing here is visible to an anonymous
visitor. `is_public` exists as a column and the form sets it, but no public
`/events` page is built — that waits for R2, which is when the public face of
the site ships as a whole. Event registration — the Souper's guest list, the
options, the export — is R3 and no part of it appears here, not even its
columns.

### What an event is, and is not

Settled 2026-09-09 against the live planning at `/planning_repet`:

**Every event in the system needs an attendance answer.** There is no case for
one that does not. Rehearsals, gigs, the AG, a musical weekend, the Souper —
the band is expected at all of them, and "who is coming?" is the question the
tool exists to answer.

**Committee meetings are not events.** They are organised over WhatsApp and are
never entered here. This is why the release drops `attendance_enabled` (C5):
the flag existed to model the committee meeting, and the committee meeting is
out of scope by choice rather than by flag.

### What the live data actually looks like

Measured from PROD on 2026-09-09, because the shape of the real planning drove
three decisions below:

- **19 events in the season, 13 of them rehearsals.** Eleven are byte-identical:
  *samedi, 10:00–12:00, Werkhof, Tenue libre*.
- **Four Saturdays are skipped** — 17 and 24 October, 26 December, 2 January.
  School holidays. Any generator that assumes "every Saturday" invents four
  rehearsals nobody wants.
- **Two rehearsals are variants.** "Répétition + apéritif pour les membres
  amis" carries a different attire; "Répétition + apéritif de Noël" ends at
  13:00 rather than 12:00.
- **One event spans two days** — "Weekend musical", 3–4 October. The current
  schema cannot express this, which is what `starts_at`/`ends_at` fixes.
- **Two events collide on 3 October** — the AG (09:30–11:00) and that same
  musical weekend. Nothing in a list makes this visible.
- **Three events carry no attire at all**, and two put "horaires à confirmer"
  *in the title* because the schema offers nowhere else to say it.

---

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| **C1** | **The members' tool only.** No public `/events`, no home page, no `/contact` page. | R1a and R1b delivered the members' half; keeping R1c to the same audience keeps one plan-sized release and one coherent thing to verify. The public face is R2's job and ships together or not at all. |
| **C2** | **No attendance deadline.** The "À répondre" block sorts by start date. | D6 promises a per-event deadline and §8 ships it in R1, but §3's schema has no column for it and nobody has asked for one. Building an unrequested field, then ordering a screen by it, is speculative work. A deadline can be added later; §7 records that D6 is deferred, not cancelled. |
| **C3** | **Serial events are a generator, not an entity.** Creating a series writes N independent `events` rows and stores no rule, no `series_id`, nothing linking them. | This is the decision that answers "how does a player attend one event of a series?" — they attend an ordinary event, because after creation that is all it is. `UNIQUE(event_id, member_id)` needs no special case, "this event or the whole series?" is never asked on any edit or delete screen, and the two rehearsal variants in the live data are just rows edited afterwards. The cost is real and accepted: renaming Werkhof is 13 edits. That happens roughly never; unticking four holidays happens every season. |
| **C4** | **`/events` shows upcoming events by default**, with past ones revealed on demand, newest first. | "The planning" means what is ahead. By next carnival the full list is a hundred rehearsals to scroll past on the phone this design keeps optimising for. But "how many came to the last three rehearsals?" is a question a direction actually asks, so the history stays reachable rather than being dropped. |
| **C5** | **`attendance_enabled` is not built.** Every event needs an answer. | See §1. The flag's only use case — the committee meeting — is out of scope by choice. A column with no case is a branch no test can reach and a question every form has to ask for no reason. |
| **C6** | **`ends_at` is nullable**, where §3 has it required. | A carnival gig finishes when it finishes. The live data shows the committee typing "horaires à confirmer" into the *title* while filling in an invented 09:30–11:00, which is the schema forcing a lie. The event card already renders a range only when the dates differ, so a null end simply renders a start. |
| **C7** | **The three `registration_*` columns are not created.** | They are R3's, and this project already carries two columns nothing reads (`public_visible`, `instructor_of_section_id`) as known debts from R1b. R3's own migration adds them, next to the code that reads them. |
| **C8** | **The calendar is an additive, feature-flagged view that exists only at `md` and up.** | A month grid cannot carry the primary interaction: seven columns at 390px give ~50px cells, and §4 demands two ≥44px targets per unanswered event. Rather than compromise the answering flow, the calendar is simply absent on phones — it serves somebody planning a season at a desk, which is never the bus case. It is an overview, not a second way to do the main job. |
| **C9** | **Feature flags are added to `GET /api/config`.** | `CLAUDE.md` already states that endpoint "drives the non-prod corner ribbon and the feature flags", and `ConfigController` returns only `env`. The mechanism has to exist before C8 can hide behind it, and it is infrastructure worth having on its own. |
| **C10** | **Two plans: events first, attendance second.** | Attendance genuinely depends on events existing, so the seam is real rather than administrative. It also puts a browser-verification checkpoint in the middle instead of at the end of ~24 tasks, which is where this project's defects have historically been caught. |

---

## 3. Domain model

### `events`

```
id
title           string
starts_at       datetime
ends_at         datetime NULL
location        string
attire          string NULL
is_public       boolean  default FALSE
notes           text NULL
created_at, updated_at
```

`starts_at`/`ends_at` as datetimes replace the old `date` plus two `TIME`
columns **and** the `weekend` boolean. The current schema cannot express an
event crossing midnight — which for a carnival Guggenmusik is most gigs — and
`weekend` exists only to make the card render a date range. Both problems
vanish: the card renders a range when the dates differ.

**`is_public` defaults to FALSE.** §3 of the 2026-09-05 spec records a live
defect where `/planning_repet` shows rehearsals to strangers. A default of false
means the accident can only fall the safe way: an event is private unless
somebody says otherwise. Nothing reads the column in R1c; R2 does.

**`attire` is nullable** because three events in the live planning have none.

### `attendance`

```
id
event_id               FK events   ON DELETE CASCADE
member_id              FK members  ON DELETE CASCADE
status                 enum('yes','no')
note                   string NULL
recorded_by_member_id  FK members  ON DELETE SET NULL
created_at, updated_at
UNIQUE(event_id, member_id)
```

**Stored values are English** (`yes`/`no`); the UI reads *Oui* / *Non*. This is
the project's standing rule and the existing `responses.answer` column already
followed it.

**`recorded_by_member_id` is NULL when self-answered** and set when somebody
with `attendance.record_for_others` answered on a member's behalf, so the screen
can say *"réponse saisie par la direction"* rather than implying the member
replied. `ON DELETE SET NULL`, matching `audit_log`: losing the recorder must
never delete the answer.

**There is no "maybe".** Two states, two buttons, two ≥44px targets. A third
option is what makes a chase list unanswerable.

### Who is answerable

`Member::isPlayer()` — having a register — exactly as R1a defined it and R1b
built it. Dominique Direction organises, plays in nothing, and never appears in
an attendance list.

**There is deliberately no permission for answering.** Making it a grant is what
produced the old bug where an admin could not say whether they were coming, and
left the "Pas de réponse" counts meaningless. Bastien Both plays *and* manages;
he answers for himself and runs the chase list, and that is the case the old
either/or role matrix could not express.

### Permissions used

| Action | Gate |
| --- | --- |
| Create, edit, delete an event | `events.manage` |
| Answer for yourself | none — `auth` plus `isPlayer()` |
| See the chase list | `attendance.view_all` |
| Answer on someone's behalf | `attendance.record_for_others` |

All four already exist in `App\Support\Permission` and are granted by the
`direction` role. R1c is the release that gives three of them their first
enforcement point.

---

## 4. API surface

Every route below sits inside the existing `auth:sanctum` + `no-store` group.
`no-store` is not optional: `/events` varies by identity, and a shared proxy
that cached one member's view would serve it to another.

### R1c-1 — events

```
GET    /api/events            the planning; upcoming by default, ?past=1 for history
POST   /api/events            create one                                events.manage
POST   /api/events/series     create N from an explicit list of dates    events.manage
GET    /api/events/{event}    one event
PATCH  /api/events/{event}    edit                                       events.manage
DELETE /api/events/{event}    delete                                     events.manage
```

**`?past=1` returns past events ONLY, newest first** — it is the other half of
the list, not a superset of it. "Past" means `starts_at` before the start of
today in Europe/Zurich, so an event happening this evening stays in the
planning all day rather than disappearing at its own start time. Default
ordering is `starts_at` ascending; `?past=1` reverses it, because history is
read backwards from now.

**`/events/series` takes a list of dates, not a recurrence rule.** The browser
computes the Saturdays, shows them for approval, and posts the ones that
survived:

```json
{
  "template": { "title": "Répétition", "location": "Werkhof",
                "attire": "Libre", "isPublic": false,
                "startTime": "10:00", "endTime": "12:00" },
  "dates": ["2026-09-05", "2026-09-12", "..."]
}
```

No rule engine exists on either side of the wire, and the server writes exactly
the rows the committee looked at. Dates are `YYYY-MM-DD` and times are `HH:MM`,
composed into datetimes **server-side in Europe/Zurich** — a browser in another
timezone must not shift a rehearsal by an hour. The whole batch is one
transaction: a partial season is worse than none.

It answers `201` with the created events, in the same shape `GET /api/events`
returns, so the client refreshes from the response rather than guessing what
landed. `dates` is capped — 60 is roughly two seasons of weekly rehearsals and
well past any honest use — so a malformed request cannot ask the server to
write ten thousand rows.

### R1c-2 — attendance

```
PUT    /api/events/{event}/attendance            my answer {status, note}
DELETE /api/events/{event}/attendance            withdraw it
GET    /api/events/{event}/attendance            the chase list      attendance.view_all
PUT    /api/events/{event}/attendance/{member}   answer for someone  attendance.record_for_others
```

**`PUT` is an idempotent upsert**, so tapping *Oui* and then *Non* needs no
create-versus-update branch in the client and cannot race itself into two rows —
`UNIQUE(event_id, member_id)` is the backstop.

**`DELETE` exists because of undo.** §4 requires an answer to be "immediately
undoable", and undoing a *first* answer must return the event to unanswered
rather than to *Non*.

**`GET /api/events/{event}/attendance` returns every answerable member**, not
just those who replied. Each carries their id, name, register and
`{status, note, recordedByDirection}` or null. Returning only the answers would
push "who has not replied?" — the entire point of the screen — into a client-side
diff against a separately-fetched roster, which is two requests that can
disagree.

**`GET /api/events` embeds `myAttendance`** on each event — `{status, note,
recordedByDirection}` or null. One request renders the whole list with both
buttons in the right state; a per-event fetch would defeat one-tap answering on
a bus with poor signal. It costs one join and is pinned by a query-count test,
the same way `GET /api/members` is.

---

## 5. Screens

| URL | What | Gate |
| --- | --- | --- |
| `/events` | The planning. "À répondre" pinned on top, then chronological. Answer buttons inline | any member |
| `/events/new` | The create form | `events.manage` |
| `/events/new/series` | The generator and its date preview | `events.manage` |
| `/events/:id` | One event | any member |
| `/events/:id/edit` | The edit form | `events.manage` |
| `/events/:id/attendance` | The chase list | `attendance.view_all` |

### `/events` — the one screen that matters

Two rules from §4 of the 2026-09-05 spec govern it, and neither is negotiable:

**Answering is one tap, from the list, without navigating.** The product is a
13-year-old on a phone on a bus. Two ≥44px targets per unanswered event, an
optimistic update, no page change, and an undo. A note expands in place and
never gates the answer — requiring a reason is how you get no answers.

**The list is ordered by urgency, not by date.** An "À répondre" block pins
unanswered upcoming events to the top, soonest first; the planning follows
chronologically below. This is why the old site had a second page,
`/inscriptions_utilisateurs`; under this design that page has no reason to
exist, because "my answers" is the top of the one screen.

### `/events/new/series` — the generator

One form — weekday, start and end time, location, attire, title, and a date
range — then **a preview listing every date it would create, each with a
checkbox**, defaulted on. The committee unticks the four holidays and presses
create. Existing events on those dates are shown alongside, so a clash like
3 October is visible before it is created rather than after.

### `/events/:id/attendance` — a chase list, not a report

Headline counts first — `24 oui · 3 non · 9 sans réponse` — then **the nine
names**, then one button that copies them for WhatsApp. Cards grouped by
register below `md`; the table appears only at `md` and up.

The thing it must not become is a report of who said yes. Today
`InscriptionsAdmin` renders a table that scrolls sideways at 390px and answers
"who is coming?" when the real question is "who must I still chase?".

Somebody holding `attendance.record_for_others` can set an answer from this
screen, against a name in the "sans réponse" group. The result is marked as
recorded by the direction wherever it is shown.

### Navigation

The nav gains **"Événements"**, visible to any logged-in member. This is the
first entry that is neither public nor permission-gated, so `Layout`'s `NAV`
needs a third category alongside the public list and the `DIRECTION_NAV` group
R1b added. The Direction group gains nothing: `/events/new` and the chase list
are reached from the events screens themselves, not from the chrome.

---

## 6. The calendar

**Not the main feature.** An addition for overview, feature-flagged, and its own
task at the end of R1c-2.

It renders only at `md` and up and **does not exist on a phone at all**. That is
the honest resolution of the conflict in C8 rather than a compromise: a month
grid is for somebody planning a season at a desk.

- A `Liste / Calendrier` toggle sits beside the list header on wide screens
  only. The list is the default and remains the sole phone view.
- Clicking a day **filters the list below** rather than navigating. The calendar
  stays an overview and never becomes a second way to do the primary job.
- Hand-rolled: CSS grid plus `Intl.DateTimeFormat`. The project has no runtime
  dependency beyond two fonts and the bundle is already 452 KB; a calendar
  library would add a stylesheet to fight with the design tokens and dark-mode
  utilities this project deliberately strips.
- Gated by a `calendar` flag from `GET /api/config`, **off in every environment**
  until it has been looked at on TEST.

### Feature flags (C9)

`GET /api/config` gains a `features` object of booleans, each read from that
server's `.env` as `FEATURE_<NAME>` with a safe default of **off**. The calendar
is `FEATURE_CALENDAR`, surfacing as `features.calendar`.

The key set is a fixed list in code, not whatever the environment happens to
hold: this response is public and unauthenticated, and — as `ConfigController`
already warns — returning config wholesale would expose a file that also carries
database and mail secrets. Adding a flag is a code change, which also means
`api/.env.example` gains the key, which means the deploy CLI's config-shape
pre-flight will refuse every server until it is set. That is the intended
behaviour and not a surprise to discover during a deploy.

---

## 7. Corrections to the 2026-09-05 spec

These are recorded here rather than edited into that document, so the approved
design stays readable as what was approved.

| Where | Correction |
| --- | --- |
| §3 `events` | **`attendance_enabled` is not built** (C5). Its only case, the committee meeting, is out of scope by choice. |
| §3 `events` | **`ends_at` is nullable** (C6). |
| §3 `events` | **The `registration_*` columns are R3's** (C7) and are not created here. |
| §3 `events` | The "three independent facets" table is down to one live facet in R1c, `is_public`, which nothing reads until R2. |
| D6 / §8 | **The per-event attendance deadline is deferred, not cancelled** (C2). §8's R1 row lists it as shipping; it does not ship here. §4's "deadline-first" ordering becomes start-date-first. |
| §4 | **A serial-event generator is added** (C3). The 2026-09-05 spec never mentions recurrence, and the live planning is 13 rehearsals with four holiday gaps. |
| §4 | **Past events** get an explicit rule (C4); the spec described "the planning" without saying where it ends. |
| §8 | The R1 row bundles the members' tool with `/`, `/events` public and `/contact`. **R1c delivers the members' half only** (C1); the public pages move to R2. |

---

## 8. Slicing

### R1c-1 — events

Schema and model, the CRUD API, `/events` with its list, the create and edit
form, the series generator with its preview, and delete with the damage named.
Plus the feature-flag mechanism (C9), which is infrastructure and is claimed by
the docs already.

Ends somewhere a browser can open and use: the committee can enter the whole
season, including the thirteen rehearsals, and see it.

### R1c-2 — attendance

The attendance table and API, one-tap answering with optimistic update and undo,
the "À répondre" block, on-behalf recording, the chase list with its copy
button, and the flagged calendar as the final task.

It also **goes back and fixes R1b's member-delete dialog**. That dialog
currently says only *"perdra immédiatement son accès au site"*. Once attendance
exists, the spec's own naming-the-damage example applies verbatim —
*"Supprimer Léa Rossier — 3 réponses à venir seront effacées"* — because
deleting a member cascades their answers. R1b's `ConfirmByTypingName` copy was
written knowing this would come.

---

## 9. Carried out of R1c

- **No public `/events`, no home page, no `/contact` page** (C1). R2.
- **No event registration** (C7). R3.
- **No attendance deadline** (C2). Deferred, and D6 stands as an intention.
- **`is_public` is settable and nothing reads it.** Same known-debt shape as
  R1b's `public_visible`; R2 is what makes it mean something.
- **No series editing.** By C3 there is no series to edit — a season-wide change
  is N edits. If that ever hurts enough, the fix is a bulk-edit screen, not a
  recurrence model retro-fitted under existing rows.
- **No "peut-être".** Two states only.
- **Contact-form anti-abuse still has no owner.** Unchanged by this release, and
  now the third spec to say so.
- **`npm run smoke` is still broken on this branch** — `tools/smoke-docker.mjs`
  asserts souper endpoints R1a deleted. Not R1c's work, but it has now
  outlasted two releases and needs an owner in R1d.

---

## 10. Risks worth naming

**A green suite is not a rendered page.** Every R1b task that touched a screen
was verified in a real browser at 390px and 1280px, and that is what caught the
things the tests did not. R1c holds to it, and the "one tap, optimistic,
undoable" flow in particular cannot be trusted to Vitest alone.

**Optimistic updates hide failures.** An answer that is rolled back must say so
— a silent revert reads as the tap not registering, and the member taps again.
The rollback path needs a test that asserts the message, not just the state.

**Timezone.** Dates enter as `YYYY-MM-DD` plus `HH:MM` and become datetimes in
Europe/Zurich server-side. A test must pin this against a request made from
another timezone, or the season silently shifts by an hour for whoever is
travelling.

**The generator writes many rows at once.** One transaction, and a mass-create
that half-succeeds must leave nothing behind. Twenty rows is also the first
place in this project where a single request writes more than a handful, so it
gets a query-count test like the roster's.

**The plan will be stale in places by the time it is executed.** R1b's was, in
four separate ways, each recorded at the head of that plan file. Verify every
requirement against the code as it actually is before implementing it.
