# E1c — one events page — Design

**Date:** 2026-09-01
**Status:** approved, not yet planned
**Builds on:** `2026-08-31-e1-mobile-and-component-library-design.md`, and the two plans that implemented it (E1a, E1b) on `feat/e1-mobile-and-component-library`.

## The problem

`/planning_repet` and `/sinscrire` are two pages that, after E1b, do very nearly
the same thing. Both call `GET /api/events`, both render the same `EventCard`,
both list the same upcoming events in the same order. They differ in which
buttons hang off each card — and the buttons are already chosen per card by
capability, not per page.

So a member who wants to answer for Saturday reads the schedule on one page and
answers on another, and an admin who wants to see who is coming reads the event
on one page and the summary from the other. The split is an artefact of the old
site's page-per-verb structure, not a distinction anyone using the site holds.

What each page has that the other does not:

| | `/planning_repet` | `/sinscrire` |
| --- | --- | --- |
| Auth | **public — no guard** | `RequireAuth` |
| `h1` | "Planning des prestations et des répétitions" | "Événements à venir" |
| Card body | times · location · **Tenue** | times · location |
| Actions | admin: Modifier / Supprimer | `respond`: two answers; `view_summary`: Résumé |
| Extras | past-events disclosure, admin event form | — |
| Nav | "Planning et répétitions" | "Inscriptions" |

Every row but the first is cosmetic or additive. The first is the actual design
question, and it decides whether this is a merge or a removal.

## The decision

**One public page at `/planning_repet`, whose cards carry every control, each
gated by the capability that already gates it today.**

Public, because `/planning_repet` is public now: anyone can see when the band
plays, it is linked from the main nav, and `GET /api/events` is deliberately a
public endpoint that answers anonymous callers with `response: null`. Making the
merged page members-only would delete the public schedule, which is a content
decision nobody asked for. Making it public costs nothing, because the answer
controls are per-card and capability-gated either way.

### What each visitor sees

| Looking at it | Card body | Actions on each card |
| --- | --- | --- |
| Anonymous | date, title, times · location, Tenue | none |
| `user` / `moderator` (`respond`) | same | **Je participe** / **Je ne participe pas**, then the saved answer + **Modifier** |
| `admin` (`manage_events`, `view_summary`) | same | **Résumé**, **Modifier**, **Supprimer** |

The capability matrix is **not a hierarchy** and this page is where that is most
visible: an admin holds `manage_events` and `view_summary` and does **not** hold
`respond`, so an admin gets no answer buttons at all. `App\Support\Capability`
enforces it; this page mirrors it for UX, as everything else does.

The admin event form stays below the list, admin-only, unchanged.

### The hint

An anonymous visitor sees a schedule and no controls, with nothing to suggest
that more exists. Above the list, **only when nobody is logged in**:

> Connectez-vous pour indiquer votre participation.

with a link to `/authentification_inscription`. A logged-in member never sees
it — they have the buttons in front of them, and a banner that repeats what the
UI already shows is noise on every visit.

### Naming

The nav collapses two entries into one, labelled **"Événements"**. The `h1`
becomes "Événements" to match, keeping the existing "sous réserve de
modifications" subtitle.

"Événements" rather than keeping either old label: "Planning et répétitions"
never mentions signing up, and "Inscriptions" describes a members-only action on
a page half its audience reads as a public schedule. The nav is French UI text,
which is the one place French belongs.

## Routing

`/sinscrire` **redirects** to `/planning_repet` — client-side `<Navigate replace>`,
pinned by a test in `routes.test.tsx`. URLs are frozen in this project: the same
reasoning that keeps `/inscriptions_utilisateurs` alive as a deep-link fallback
keeps `/sinscrire` resolving rather than 404ing, because members have it
bookmarked and the nav has pointed at it for years.

Four things point at `/sinscrire` today and all of them move to the surviving
URL rather than relying on the redirect:

| Where | Change |
| --- | --- |
| `Layout.tsx` — `NAV` | two entries become one, labelled "Événements" |
| `Layout.tsx` — `ACTIVE_ALIASES` | `/inscriptions_admin` and `/inscriptions_utilisateurs` map to `/planning_repet` |
| `Admin.tsx` — `DESTINATIONS` | its two cards ("Planning et répétitions", "Inscriptions") collapse into one |
| `InscriptionsUtilisateurs.tsx` | `onSuccess: () => navigate("/planning_repet")` |

A redirect that everything else also relies on is a redirect nobody notices has
broken. It exists for bookmarks, not for the app's own links.

### `RequireAuth` is deleted

`/sinscrire` is its **only** call site. `RequireCapability` already performs the
identical anonymous → login-with-`returnTo` bounce (`guards.tsx` lines 51-53),
so nothing is lost but the component itself. It goes, with its test.

Keeping an unused guard is exactly the kind of thing sub-project B exists to
sweep later; deleting it here, in the change that orphans it, is cheaper than
leaving a note for a future session.

## The archive gains one action

Past events currently carry no controls at all — E1b's reasoning was that
putting destructive buttons on an archive invites the misclick they guard
against, and that stands.

But merging the pages puts **Résumé** on the same page as the disclosure, and an
admin looking at last week's concert is then one click from *who actually came* —
which is the most useful moment for that summary, not the least. So past cards
get **Résumé only**, for `view_summary`:

- no answer buttons — answering an event that has happened is meaningless, and
  `/inscriptions_utilisateurs` already falls through to its "Aucun événement"
  branch for exactly this reason;
- no **Supprimer** — the original reasoning is untouched;
- **Modifier** is not added either. An admin correcting a past event is rare
  enough to go through the upcoming list's form, and every destructive-adjacent
  control kept off the archive is one fewer misclick.

## Tests

**Changing:**

| File | Why |
| --- | --- |
| `Sinscrire.test.tsx` | deleted — the page is gone; its role-matrix and one-tap coverage moves to `PlanningRepet.test.tsx` rather than being lost |
| `PlanningRepet.test.tsx` | gains the answer controls, the admin `Résumé`, the anonymous hint, and the archive's `Résumé` |
| `routes.test.tsx` | pins that `/sinscrire` redirects rather than 404s |
| `Layout.test.tsx` | one nav entry named "Événements" where there were two |
| `InscriptionsUtilisateurs.test.tsx` | post-answer navigation target |
| `guards.test.tsx` | `RequireAuth`'s cases go with it |
| `web/e2e/members.spec.ts` | retargets the guard-bounce test |

**The guard-bounce test is the one to watch.** *"a guard bounce returns you to
the page you wanted"* proves itself today by visiting `/sinscrire` anonymously
and expecting the login form. That route stops being guarded, so the test must
retarget to `/inscriptions_admin` — same mechanism, same assertion, a route that
is still guarded. Without this the test would pass against a page that never
bounces and would be asserting nothing.

**Not changing:** every API test. This design does not touch the backend.

## What this deliberately does not do

- **No API change.** `GET /api/events` already serves every case this needs.
- **No new component.** `EventCard`, `AnswerControls`, `EventActions`,
  `ButtonLink` and `StatTile` all exist and all fit.
- `/inscriptions_admin` and `/inscriptions_utilisateurs` stay as they are — the
  first is where **Résumé** goes, the second remains a deep-link fallback.
- No change to `PhotoPending`, page copy, motion, or the hidden pages. Those are
  E2.
- **PROD stays blocked on content** (`<Tbd>` and `<PhotoPending>`), which this
  does not touch and cannot unblock.

## Risks

**The public page now renders member controls conditionally.** A capability bug
here shows an anonymous visitor a button that 401s rather than opening a hole —
Laravel is the only enforcement — but it would look broken. The role matrix is
already covered per card, and the merged page's tests assert all three states.

**One page now serves three audiences.** If it grows a fourth concern it will
need splitting again — but by concern, not by verb, which is what went wrong the
first time.
