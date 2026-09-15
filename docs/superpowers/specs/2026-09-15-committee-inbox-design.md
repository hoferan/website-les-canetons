# The committee inbox — and contact messages that reach somebody

**Status:** approved 2026-09-15. Closes [#88](https://github.com/hoferan/website-les-canetons/issues/88).

**Why now.** `POST /api/v1/contact` has stored a `contact_messages` row and
answered `{"ok": true}` since 2026-07-23. It sends no mail, and no read route
exists anywhere in the API. Every message the public has ever sent — prestation
enquiries included — is invisible to everybody, while the contact page promises
"Écrivez au comité" and the controller's own `#[Response]` annotation claims
the message was "Accepted and sent to the committee". That annotation ships in
`api/openapi.json` and on the Scalar page, so the documented contract is the
opposite of the behaviour.

Fixing only that would produce a screen nobody visits. André's call on
2026-09-15 was to build the general thing instead: a committee inbox of items
needing action, of which contact messages are the first kind.

---

## 1. Decisions

| | Decision | Date |
| --- | --- | --- |
| D1 | **No mail in this release.** Mailing the committee on receipt is its own issue. | 2026-09-15 |
| D2 | **The inbox is a worklist, not a feed.** An item appears because somebody must act, and leaves when it is handled. | 2026-09-15 |
| D3 | **One source at v1:** contact messages. | 2026-09-15 |
| D4 | **Computed at read time.** No `inbox_items` table, no producer contract. | 2026-09-15 |
| D5 | **Handled state is shared**, and records who handled it. | 2026-09-15 |
| D6 | **`messages.view` and `messages.manage` are separate.** Manage is `direction` only. | 2026-09-15 |
| D7 | **Both writes are conditional**, with a single-thing read to get the tag from. | 2026-09-15 |
| D8 | **Two screens:** `/inbox` is the worklist, `/contact-messages` is that source's archive. | 2026-09-15 |
| D9 | The nav says **Boîte de réception**. | 2026-09-15 |

**Attendance answers were considered as a source and rejected** (D3). They are
the high-volume event in this system — every member against every event — and
the signal the committee actually wants from them is the inverse: who has *not*
answered, which `/events/:id/attendance` already shows. An inbox that fills
with thirty rows after each rehearsal is an inbox nobody opens.

---

## 2. The inbox model

`App\Support\Inbox\InboxItem` is a readonly value object: an id, a `kind`, a
title, a one-line summary, when it arrived, the permission needed to act on it,
and the path where you act. It is not an Eloquent model and has no table — a
source builds one per row it answers with.

A source implements `App\Support\Inbox\InboxSource`:

```php
public function kind(): string;
public function permission(): Permission;
public function openItems(): Collection;   // of InboxItem
public function openCount(): int;
```

`InboxRegistry` holds the registered sources. `ContactMessageSource` is the
only one today, and it answers "every `contact_messages` row with
`handled_at IS NULL`". Nothing else in the API knows the inbox exists.

**Why computed rather than materialised (D4).** The whole of #88 is a write
that happened and nothing surfaced. A materialised `inbox_items` table needs a
producer in every controller that creates something, and a producer somebody
forgets to call reproduces exactly that bug — silently, with the row sitting in
its own table looking fine. A computed inbox cannot drift from its sources
because it has no state of its own: if the row is there and unhandled, it is in
the inbox. It also needs no backfill for the messages already stored, and no
cascade when one is deleted.

The cost is one query per source per load. At this band's volume that is noise,
and `InboxSource` is the seam: a materialised table can be slid underneath
later without any caller noticing.

---

## 3. Schema

One migration, `hasColumn`-guarded in the style every migration here uses —
`RunPendingMigrations` re-checks on every request, so it must be safe to re-run.

`contact_messages` gains:

- **`handled_at TIMESTAMP NULL`** — the definition of open is `NULL`.
- **`handled_by_member_id`** — nullable FK to `members`, `nullOnDelete`.

**Why record who (D5).** The state is shared: Camille marking a prestation
enquiry handled marks it handled for the whole committee, which is right for an
inbox one person answers on the band's behalf. But shared state without an
author answers the wrong question. "Has this been dealt with" is worth much
less than "did somebody actually reply, and who" — and `nullOnDelete` keeps
that record readable when a member leaves the band.

No other tables change, and none are created.

---

## 4. Permissions

Two new cases on `App\Support\Permission`:

- `MessagesView = 'messages.view'` — read the inbox, read messages.
- `MessagesManage = 'messages.manage'` — mark handled, reopen, delete.

`direction` holds both; `committee` holds view only. This mirrors
`registrations.view` / `registrations.manage` and exists for the same reason:
the token that merely looks must not carry the power to destroy. A prestation
enquiry is committee business, so the committee must see it — but binning
somebody's message is direction's call.

**A grant migration is required, and the feature is dead on TEST without it.**
`2026_09_07_000001_seed_registers_and_roles` seeds `direction` with
`Permission::cases()`, so a *fresh* database picks up both new tokens for free.
It deliberately returns early for a role that already exists, because a role's
permissions become the committee's business once seeded and a re-sync would
undo their edits on the next deploy. On TEST, where both roles exist, that
means nobody would hold either token and every screen here would 403 for
everyone. `2026_09_10_000003_grant_registrations_manage.php` is the precedent
for precisely this situation; the new migration copies it — additive,
`insertOrIgnore`, granting the two new tokens and re-syncing nothing else.

---

## 5. API surface

| Route | Gate |
| --- | --- |
| `GET /api/v1/inbox` | `auth:sanctum`; filtered by permission server-side |
| `GET /api/v1/inbox/summary` | `auth:sanctum`; `{total, counts: {contactMessages: n}}` |
| `GET /api/v1/contact-messages` | `messages.view`; paginated; `?handled=0` or `1` |
| `GET /api/v1/contact-messages/{m}` | `messages.view`; issues the `ETag` |
| `PATCH /api/v1/contact-messages/{m}` | `messages.manage`; `etag:contact_message`; `{handled: bool}` |
| `DELETE /api/v1/contact-messages/{m}` | `messages.manage`; `etag:contact_message` |

**The inbox filters rather than refuses.** A member holding none of the
relevant permissions gets an empty inbox, not a 403 — the nav entry is already
hidden from them, and a 403 on a screen the nav offered would be a bug report.
Anonymous still gets 401.

**`PATCH` stamps `handled_at` and `handled_by_member_id` from the session;
`{handled: false}` clears both.** Reopening is not an error and emits no new
code — a message wrongly marked handled is a normal thing to correct.

**Both writes are conditional (D7).** A `contact_message` facet joins
`App\Support\EntityTag::FACETS`, and `GET /api/v1/contact-messages/{m}` is the
single-thing read that hands the tag out — a collection hands out none.

The facet is computed over **`handled_at` and `updated_at` coalesced to
`created_at`**, and the coalesce is load-bearing rather than defensive:
`2026_07_23_000003` created `updated_at` as nullable with no default, so every
message stored before this release has `updated_at IS NULL`. A facet reading it
raw would hand the same tag to every legacy row, and `If-Match` would then let
a write aimed at one of them succeed against any other. This follows the rule in CLAUDE.md
literally rather than claiming the attendance exemption, because more
management is expected on this inbox and retrofitting concurrency control after
the fact is how you end up without it.

**`GET /api/v1/inbox/summary` is deliberately not a list**, so
`PaginatesCollections` leaves its body alone. `GET /api/v1/inbox` is one, and
is enveloped for free.

`ContactController`'s `#[Response]` is corrected to describe what it does —
stored for the committee to read, nothing sent to the address given — and
`openapi.json` plus the generated client are regenerated. CI's `openapi-drift`
job fails if either is stale.

---

## 6. Error vocabulary

**No new tokens.** Every refusal here already has one: `unauthenticated`, the
permission middleware's refusal, `ConditionalWrite`'s missing-`If-Match` and
stale-tag answers, and a 404 for a message that is gone. If implementation
turns up a refusal with no existing token, it gets one *and* French copy in
`web/src/i18n/fr.ts` in the same commit — `ApiErrorVocabularyTest` reads that
file directly and fails otherwise.

---

## 7. Web

- **`/inbox`** — session-guarded. Open items grouped by kind, each row linking
  to where you act. Empty state is the normal state and should read like it.
- **`/contact-messages`** — `messages.view`. The archive for this one source:
  open and handled, filterable. A message expands in place, and *that expansion
  is the single read* that yields the `ETag` the mark-handled and delete
  controls write with. Delete takes a plain confirm, not `ConfirmByTypingName`
  — that ceremony is for destroying a member.
- **Nav.** `DIRECTION_NAV` gains `Boîte de réception` with an unread count from
  the summary endpoint. That list already filters on `can()`, so it stays
  invisible to anyone without the permission. **The count is fetched on
  navigation and invalidated by the writes on this screen — it does not poll.**
  A background timer against a shared host, for a number that changes a few
  times a month, buys nothing and costs every member a request a minute.
- **MSW** handlers for all six routes, enveloping the two collections through
  `collection()`.

**Why both screens (D8).** The inbox is the worklist across sources; handled
messages have to live somewhere, and that somewhere is the source's own
archive. When bookings become the second source their archive is already the
registrations screen — so this split is what the second source assumes, and
building one screen now would mean splitting it then.

---

## 8. Non-goals

- **Mail on receipt** (D1) — its own issue, in R4.
- **Bookings and attendance as inbox sources** — the interface is the point;
  adding one later is a class and a registry line.
- **Per-user read state.** Shared is correct for a committee of five who each
  answer on the band's behalf. A general notification centre would want
  per-user, and that is a different design with a pivot table.
- **Assignment, snooze, or any per-item state the source does not have.** These
  are the arguments for a materialised table, and none of them has been asked
  for.
- **Push or in-app notification.** The nav badge is the whole delivery
  mechanism.

---

## 9. Risks

- **The grant migration is the one that can silently kill this.** Ship without
  it and every screen 403s for everyone on TEST, with the code perfectly
  correct. A migration test against a database where both roles already exist
  is the mitigation, and it is the most valuable test in this spec.
- **`openapi.json` drift.** Six new routes and a corrected annotation; CI
  catches it, but regenerate in the same commit rather than at the end.
- **The worklist/archive split reads as duplication** while there is one
  source. Accepted: it is what the second source needs, and the alternative is
  a rewrite at exactly the moment another feature is landing.

---

## 10. Order of work

1. Schema migration, then the permission cases and the grant migration — with
   its test first.
2. `InboxSource`, `InboxRegistry`, `ContactMessageSource`.
3. The six routes, their resources, the `contact_message` facet; regenerate
   `openapi.json` and the client.
4. `/contact-messages`, then `/inbox`, then the nav badge.
5. `npm run check`, and the Laravel suite in Docker.
