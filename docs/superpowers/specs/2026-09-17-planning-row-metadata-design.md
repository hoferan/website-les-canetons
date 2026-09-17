# Public visibility and answer counts on each planning row

Design for [#93](https://github.com/hoferan/website-les-canetons/issues/93).
Decided 2026-09-17.

## The problem

`/planning` renders each event as a card carrying title, date, `Lieu` and
`Tenue`, and nothing else. Two facts the committee needs are a click away on
every row.

`isPublic` has been on `EventResource` since the field existed and is rendered
nowhere, so there is no way to tell which events the public can see without
opening each one. And learning that eight of twenty have answered means opening
`Qui vient ?`, reading it, going back, and repeating per event — for a season
of roughly forty rows.

## Scope

One metadata strip under the event title: a `Public` chip, `12/18 réponses`,
and a booking count where the event takes bookings.

- `api/app/Http/Resources/EventResource.php` — three new nullable integers
- `api/app/Http/Controllers/Api/EventController.php` — the aggregates, and one
  resolution of the caller's permissions per request
- `api/app/Models/Event.php` — one `HasManyThrough` so `withSum` has a relation
  to name
- `api/app/Http/Controllers/Api/EventSeriesController.php` — the same aggregate
  load on the path that also returns an `EventResource`
- `web/src/events/EventCard.tsx` — a third slot, `meta`
- `web/src/events/EventMeta.tsx` — new, the strip itself
- `web/src/pages/Events.tsx` — composes the strip and decides what it is given
- `web/src/mocks/handlers.ts` — the three fields, mirroring the server
- `web/src/api/generated/` — regenerated, committed

### Deliberately not in this issue

**A "how many are actually coming" breakdown** (`9 oui · 3 non · 6 sans
réponse`). More informative than a fraction, and three times the width on a
390px card that #118 is already open about. The fraction is what the issue
asked for and what the chase list header can be read against.

**Per-option totals** — "12 repas adulte, 7 repas enfant". That is
[#115](https://github.com/hoferan/website-les-canetons/issues/115), on the
guest-list screen where the kitchen reads it, not on the planning.

**A capacity cap read against the booking count.** That is
[#114](https://github.com/hoferan/website-les-canetons/issues/114). This issue
surfaces the number; it does not act on it.

## Nothing is stored

The counts are query-time aggregates. There is **no new column, no migration,
and no cached total** — a stored count is a count that drifts, and this one
would have to be invalidated by every answer, every booking and every member
who joins or leaves a register.

`withCount` and `withSum` compile to correlated subselects bolted onto the list
query that already runs:

```sql
select events.*,
  (select count(*) from attendance
     where attendance.event_id = events.id
       and exists (select 1 from members
                    where members.id = attendance.member_id
                      and members.section_id is not null)) as attendance_count,
  (select coalesce(sum(rc.quantity), 0) from registration_choices rc
     inner join registrations r on r.id = rc.registration_id
     where r.event_id = events.id) as registration_choices_sum_quantity
from events where starts_at >= ? order by starts_at asc
```

Eloquent hydrates `$event->attendance_count` onto the model instance for the
life of the request and forgets it.

A per-event endpoint — `GET /events/{event}/attendance/count` — was considered
and rejected: rendering a planning of twenty rows would be twenty HTTP
requests, an N+1 over the network on the screen the whole band opens from a
phone. A single `GET /api/v1/events/summary` for the whole list was the
defensible version of that idea, and was rejected too: it makes the planning
two requests whose answers can disagree about the same list, which is the
reasoning `AttendanceController::index()`'s docblock already rejects for the
chase list. Three integers do not justify a second endpoint.

## Who sees what, and why the gate is server-side

| Fact | Reaches the client when | Why |
| --- | --- | --- |
| `12/18 réponses` | caller holds `attendance.view_all` | the gate on the chase list it summarises |
| `n personnes` | caller holds `registrations.view` | the gate on the guest list it summarises |
| `Public` chip | caller holds `events.manage` | committee housekeeping a player cannot act on |

**The answer count is withheld from players in the response, not in the SPA.**
Knowing that twelve people have already said yes can move a thirteenth
person's own answer, so the count is not merely something a player has no use
for — it is something that would change what the screen is measuring. CLAUDE.md
is explicit that the SPA's guards mirror the API for UX only; a count left on
the wire and hidden by `can()` is a real leak, readable in the network tab.

`isPublic` is the exception and stays unconditional on the wire. It has been
part of the published contract since the field existed, it is not sensitive —
it says whether an event appears on `/agenda`, which anyone can verify by
opening `/agenda` — and making a published field disappear for some callers
buys no confidentiality. Only the **chip** is gated, in the SPA.

`demo.committee` holds `registrations.view` without `attendance.view_all`, so
the two gates are independently exercised by a seeded account. Anything that
collapses them into one "committee" check breaks that member, the way
`demo.both` breaks an either/or role matrix.

## The counts must be invisible to the ETag

`EntityTag::state()` derives an event's tag by rendering `EventResource`
itself — deliberately, so a new field is covered the moment it is added, with
nothing to remember. It renders it through `bare()`, a `Request::create('/')`
with no authenticated user, so the tag cannot depend on who is asking;
`test_an_events_tag_does_not_depend_on_who_is_asking` pins that.

Left alone, the three counts would break two things at once:

- a member answering an event would move that event's tag, so a committee
  member's pending edit of the **title** would answer `412` for a reason that
  has nothing to do with the title — precisely the failure the docblock
  describes for `myAttendance`;
- the tag would differ between a caller who may see answers and one who may
  not.

Both are avoided by one rule, and it is the rule `myAttendance` already
follows: **each count field reports `null` when its aggregate is not loaded on
the model.** The event arm of `state()` is `(new EventResource($model))
->toArray(self::bare())` with no `->load()` at all — unlike the member and
registration arms beside it — so all three aggregates are absent there, read
`null`, and drop out of the hash.

The no-user case falls out for free: `Request::create('/')` has no user
resolver, so `$request->user()` answers `null` and every gate is false. Note
that this is `user()` and not `session()`, which on a bare request *throws*
rather than answering null — the trap `docs/traps.md` already records.

This makes `null` mean both "not loaded" and "not yours to see". The overload
is invisible to every consumer — the SPA renders the strip only when `can()`
passes *and* the value is non-null, and the ETag path wants `null` either
way — and it is preferred to a second sentinel value that could itself reach
the tag.

## The API shape

Three nullable integers on `EventResource`, each written as a ternary over a
boolean resolved once per request:

| Field | Type | Source |
| --- | --- | --- |
| `answeredCount` | `int \| null` | `withCount` on `attendance`, constrained to members currently in a register |
| `answerableCount` | `int \| null` | one `COUNT(*)` on members with a register |
| `guestCount` | `int \| null` | `withSum('registrationChoices', 'quantity')` through a new `HasManyThrough` on `Event` |

A ternary rather than a helper method, and that is not stylistic. The nullable
timestamps directly above these lines are ternaries because Scramble reads the
expression rather than the signature: a `?Iso8601` helper was tried and
silently retyped `registrationOpensAt` from `string|null` to `string` in the
published contract, making an optional field required for every generated
client. No resource in this repository uses `$this->when()`, so how Scramble
types a conditionally-present field here is unverified — the known-good pattern
is preferred over finding out on a contract change.

`answeredCount` counts only answers from members **currently** in a register,
so the fraction cannot read `19/18` when somebody who answered has since left
theirs, and so the strip and the chase list it links to count the same
population. That was the argument for the denominator in the first place.

`answerableCount` is a property of the roster, not of the event, so it is the
same number on every row. It is carried per row anyway rather than in the
collection envelope: the same resource renders a single event through `show()`,
and a client reading one event should not have to fetch a list to learn the
denominator.

**Every path that returns an `EventResource` loads the aggregates** — `index`,
`show`, `store`, `update`, and the series generator — so the shape is the same
everywhere rather than "the list has counts and a single read does not".

The caller's permissions are resolved **once per request**, in the controller.
`Member::hasPermission()` runs `EffectivePermissions::for()`, which issues a
query on every call, so checking it inside the resource would be an N+1 that
nothing in the suite would catch.

### Query cost

The two subselects ride the existing list query. The denominator is one extra
`COUNT`. `GET /api/v1/events` goes from 2 queries to 3, constant in the number
of events.

That is the current ceiling of
`test_listing_the_planning_costs_a_fixed_number_of_queries`, whose assertion
becomes `<= 4` with its comment rewritten to name the third query. The test's
stated purpose is that the endpoint "should not scale queries with events",
and three constant queries honour it; the spare room the R1c comment describes
as "deliberate and now spent" is being spent again, deliberately.

## The SPA

**`EventCard` gains a third slot, `meta`.** Its docblock states that it knows
nothing about permissions — `actions` and `answer` both arrive already decided
by the screen — so a card that read `can("events.manage")` to draw a chip would
break the one rule that file states about itself. `meta` follows `actions`
exactly: passed, or not passed.

**`web/src/events/EventMeta.tsx`** is new, presentational and permission-blind.
It takes four optional props — `isPublic`, `answered`, `answerable`, `guests` —
and renders nothing at all when none arrive. `Events.tsx` is already 451 lines;
a component with its own test keeps the strip out of it.

`Events.tsx` decides what the strip is given, from the flags it already holds:

| Prop | Passed when |
| --- | --- |
| `isPublic` | `mayManage`, and only when true |
| `answered` / `answerable` | `maySeeAnswers` |
| `guests` | `maySeeGuests && event.takesRegistrations` |

The `Public` chip renders only for a public event. Within an audience that all
holds `events.manage`, absence is unambiguous, and the planning is mostly
rehearsals — a `Privé` chip on almost every row is noise. `guests` follows the
same condition as the `Inscriptions` button, so a rehearsal does not grow a
booking count that can never move.

**Placement:** inside the title column, directly under the date line, as a
`flex flex-wrap gap-tight` row. It sits in the `min-w-0` column beside
`actions`, so it wraps on its own at 390px rather than widening the card. That
matters here: #89's failure was a box that could not shrink dragging the
document 223px sideways, and #118 is still open about the action row directly
above this one.

### Copy and accessible names

French, UI text only, per the language rule.

| State | Renders | Accessible name |
| --- | --- | --- |
| public | `Public` chip | — |
| answers | `12/18 réponses` | `12 réponses sur 18` |
| no answers yet | `0/18 réponses` | `0 réponse sur 18` |
| bookings | `6 personnes` / `1 personne` | — |
| takes bookings, none yet | `Aucune inscription` | — |

`12/18` is given an `aria-label` because a screen reader renders it as a date
or as a fraction, neither of which is what it says. The zero state is shown
rather than hidden: on the planning, `0/18` *is* the chase cue.

**Past events keep the strip.** The fraction stops being a chase cue and
becomes a record of who answered, which is worth having on the screen that
already shows the past.

## What proves it

The leak is the thing to pin, since it is the reason the gate is server-side.

- **A player's `GET /api/v1/events` carries `null` for all three.** Written
  first, watched fail, and mutation-tested by hand: drop the ternary and it
  must go red. This is the assertion most at risk of passing against nothing.
- **The two gates are independent.** `demo.committee` holds `registrations.view`
  and not `attendance.view_all`, so `guestCount` arrives while the fraction
  does not.
- **`answeredCount` ignores an answer from a member no longer in a register** —
  the `19/18` guard.
- **`guestCount` sums quantities, not rows.** One booking for four reads `4`,
  not `1`.
- **Answering an event does not move that event's ETag.** New test, and the
  regression the null rule exists to prevent.
  `test_an_events_tag_does_not_depend_on_who_is_asking` must also still pass
  untouched.
- **The query budget**, raised to 4, with the comment naming the third query.

On the web side: the strip is absent for a player, mirroring the API test at
the UI layer; the `Public` chip appears only with `events.manage`; `0/18`
renders rather than hiding; `n personnes` appears only on an event that takes
bookings. `web/src/mocks/handlers.ts` gains the three fields — a mocked handler
that does not mirror the server is how a green suite ends up over a broken page
here.

`npm run openapi && npm run generate:api`, committed, or CI's `openapi-drift`
job fails. No new error tokens, so `web/src/i18n/fr.ts` is untouched.

**Closing evidence for the issue:** a 390px screenshot of `/planning` showing
the strip on a five-action souper card, and the leak test failing before the
gate and passing after.
