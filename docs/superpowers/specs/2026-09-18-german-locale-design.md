# A German locale

Design for the German (de-CH) translation of the SPA. Decided 2026-09-18.

Issues are created from [§ Delivery](#delivery) once this spec is approved; this
document is the shared premise all of them refer back to, so that nine pull
requests do not each re-argue the same four decisions.

## Why this exists, and why it was not planned

It was raised as a developer problem: the person building this site is a native
German speaker, comfortable in English, and **not confident in French**. Verifying
UI and UX against screens written entirely in French is guesswork, and guesswork
is how copy defects reach a member.

It is not in the milestone planning. Six milestones exist — R4 through R9 — and
none concerns language; none of the 30 open issues mentions a second locale. The
only trace anywhere is a line in [#104](https://github.com/hoferan/website-les-canetons/issues/104)
recording, as a known consequence, that a user-typed history "a future German
locale cannot reach". So this is ad-hoc work, and the first thing it needs is a
written premise.

The verification argument is what prompted it. The argument for **shipping** it is
separate and was made deliberately: Fribourg is a bilingual canton, and a
Guggenmusik that presents itself in both languages is presenting itself to its
whole canton.

## The four decisions

| Question                    | Decision                                                    |
| --------------------------- | ----------------------------------------------------------- |
| Dev aid or shipped feature? | **Shipped.** German is real content, reviewed, permanent    |
| How is a locale addressed?  | **Path prefix `/de/*`.** French stays unprefixed            |
| Which German?               | **Swiss Standard German, `de-CH`, formal _Sie_ throughout** |
| How is it delivered?        | **Machinery first, then one PR per area**                   |

Each is expanded below where it has consequences.

### Shipped, not a developer aid

The consequence is accepted explicitly: **every new UI string from PR 9 onward
costs two translations instead of one, permanently.** That is the price of the
bilingual-canton argument, and it is the reason the alternative — German as a
throwaway verification locale that never reaches a member — was considered and
rejected rather than never raised.

### `de-CH`, and _Sie_

Swiss Standard German: `ss` and never `ß`, Swiss conventions for dates and
numbers. **Written dialect (Schwiizertütsch) was rejected**: it has no
standardised orthography, so spelling decisions accumulate with no authority to
settle them; it degrades screen-reader and browser language handling; and it
cannot be handed to a translator later.

_Sie_ throughout, mirroring the existing French, which is consistently _vous_ —
39 occurrences against 5, and those five are substring false positives. The
French uses _vous_ even in the members' area, addressing fellow band members
(`Vous ne pouvez pas supprimer votre propre compte`, `Vous venez`). Mirroring it
keeps every German string a 1:1 translation of its French counterpart, so the
two catalogues stay mechanically comparable and a reviewer never has to ask
whether a difference between them was intentional.

Informal _du_ is arguably more natural for a Swiss Verein and was rejected for
that comparability, not because it reads worse.

**The URL segment is `/de`, the i18next language and `<html lang>` are `de-CH`.**
There is one German variant, the short segment is friendlier, and the mapping
between the two lives in exactly one module.

## Where the French actually is

This was the finding that set the size of the work. `web/src/i18n/fr.ts` is not
the UI catalogue:

- **`fr.ts` is 250 lines and is almost entirely the API error vocabulary** —
  `errors.*`, `validation.*`, `fields.*` — plus three page-ish sections that
  arrived later (`roles`, `contactMessages`, `inbox`).
- **No component calls `t()`.** The 15 files importing from `../i18n` import
  `translateApiError`, `roleLabel` and `roleHint` — named helpers, not a
  translation hook. `useTranslation` appears nowhere, and `react-i18next` is not
  a dependency; `package.json` carries bare `i18next` (`^26.3.6`).
- **The UI French is hard-coded JSX literals across roughly 60 non-generated
  files** — 531 lines carrying an accented character under `web/src/pages`,
  `web/src/components` and `web/src/events` alone. The heaviest: `Events.tsx`
  42, `Members.tsx` 38, `EventRegistrations.tsx` 30, `EventForm.tsx` 29,
  `EventAttendance.tsx` 25, `EventBooking.tsx` 24, then a long tail.
- **39 test files and 3 e2e specs assert rendered French strings.**

So "add German" is two jobs stacked: **extract the UI strings into catalogues at
all**, then write the German. The second is the easy half.

### A stale line in CLAUDE.md, found on the way

`CLAUDE.md` describes `web/src/routes.tsx` as "the route table — French URLs,
unchanged". The table is English: `/agenda`, `/band`, `/committee`, `/history`,
`/join`, `/events`, `/members`, `/inbox`. `routes.tsx`'s own docblock confirms it
("Legacy French paths are NOT redirected"). Same family as the four false claims
in [#112](https://github.com/hoferan/website-les-canetons/issues/112); it should
be corrected there or in PR 1.

Fortunately it means **URLs are already language-neutral** and nothing wants
translating into `/verein`.

## Architecture

### Locale resolution — the URL always wins

A new module, `web/src/i18n/locale.ts`, containing no React and no router:

```ts
localeFromPath("/de/agenda"); // → { locale: "de-CH", basename: "/de" }
localeFromPath("/de"); // → { locale: "de-CH", basename: "/de" }
localeFromPath("/agenda"); // → { locale: "fr",    basename: "/"   }
localeFromPath("/"); // → { locale: "fr",    basename: "/"   }
```

`main.tsx` calls it once against `window.location.pathname` before `createRoot`,
initialises i18next with that language, sets `document.documentElement.lang`, and
passes `basename` to `BrowserRouter`.

**It must match `/de` as a whole path segment**, never as a string prefix — a
future route named `/design` or `/depot` would otherwise resolve as German with a
mangled basename. The tests pin this case directly.

**Why a pure function of a string, rather than a hook or a router feature:** unit
tests mount `MemoryRouter`, not `BrowserRouter`, so `basename` is never exercised
there. Locale resolution has to be testable without a router, and every component
has to be renderable in a chosen locale without one.

### `BrowserRouter basename` is what makes this cheap

`web/src/App.tsx` mounts `<BrowserRouter>` with no `basename` today. Setting it
makes every existing `<Link to="/agenda">` and `navigate("/events")` resolve under
the prefix **with no change at any call site** — which removes the part of
prefixed routing that is normally expensive.

Two things are deliberately unaffected:

- **API calls.** `web/src/api/http.ts` uses `fetch("/api/v1/…")`. `fetch` is not
  router-aware, so basename cannot reach it and `/de/api/v1/…` can never be
  requested. This is correct and must stay so.
- **The `.htaccess`.** The SPA fallback is a catch-all, so `/de/anything` already
  serves the shell. **No server change, no overlay change, no deploy concern.**

Anything reaching for `window.location` directly bypasses `basename` and needs
auditing in PR 1 — `web/src/lib/returnTo.ts` and `web/src/api/download.ts` are the
known candidates.

### Persistence: localStorage decides one thing only

`localStorage["lescanetons.locale"]` records an explicit switcher choice, and is
consulted in **exactly one place**: a visit to the bare root `/`, which redirects
once to `/de` when that is the stored choice.

**It never overrides the URL.** If it did, a `/de/agenda` link sent to a
German-speaking friend could render French because _their_ browser remembered a
preference — defeating the entire reason prefixed URLs were chosen over a
client-side preference.

**There is no detection from `navigator.language`,** deliberately. A francophone
band's home page should not silently become German because a visitor's laptop is
set to German, and auto-redirecting the root harms indexing of the French site.
The switcher is discoverable; that is sufficient.

### Switching is a navigation, not a re-render

`basename` is fixed at mount, so the switcher calls `window.location.assign()`
with the same page under the other prefix, having written the choice to
localStorage. This is a property worth keeping rather than a limitation worked
around: each locale gets a clean boot with no stale i18next state, and there is no
partially-re-rendered tree to reason about.

### Catalogues

`fr.ts` **keeps its exact current structure** — bare identifier keys, no
TypeScript syntax inside the object literal — because
`api/tests/Feature/ApiErrorVocabularyTest.php` regex-matches and brace-walks it,
as its own docblock warns.

`web/src/i18n/de.ts` sits beside it:

```ts
import { fr } from "./fr";

export const de: typeof fr = {
  /* … */
};
```

`typeof fr` makes **TypeScript fail the build on a missing or extra key**, for
free, because `fr`'s values infer as `string` rather than as literals. A Vitest
key-path walk backs it up, because a deep TS structural error is close to
unreadable while a test can list precisely which paths are absent.

**Implementation note:** the annotation `: typeof fr` sits outside the braces and
so does not violate `fr.ts`'s no-TS-syntax rule, which is about the literal's
interior. But the PHP test locates its target with a regex over the file, and
that regex must be widened to tolerate `export const de: typeof fr = {` as well
as `export const fr = {`. Verify this rather than assuming it.

### Consumption

- `translateApiError`, `roleLabel` and `roleHint` already call `i18next.t`, so
  they resolve in the active locale automatically. **Their ~15 call sites need no
  change at all.**
- Components get a plain `t(key, params)`, **exported from
  `web/src/i18n/index.ts`** alongside the three existing helpers, so there is one
  import path for everything i18n. **No `react-i18next`, no provider, no hook.**
  Locale is constant for a page's lifetime, so the re-render machinery a hook
  exists to provide would buy nothing, and this keeps the dependency list as it
  is.
- `fallbackLng: "fr"`. A key present in `fr` and absent from `de` renders French.
  That is what makes a partially-migrated app usable rather than broken, and it
  is why `/de/*` is not advertised until PR 9.

## The PHP vocabulary test starts demanding German

`ApiErrorVocabularyTest` is extended to read `de.ts` as well as `fr.ts`.

A shipped locale whose error messages silently fall back to French is a
half-feature, and that test exists precisely to stop wrong-language text — and raw
English tokens — reaching a screen. Extending it is cheap; the machinery is
already there.

**Consequence: PR 1 translates the entire error vocabulary** — all of `errors`,
`validation` and `fields`. That is the most mechanical part of the whole job and
it is self-contained, so it belongs in the foundation PR rather than being spread
across the slices.

It also means every _future_ error token is forced to arrive with German copy,
which is the point.

## #147, folded in and slightly widened

[#147](https://github.com/hoferan/website-les-canetons/issues/147) is folded into
PR 1 by decision, because German cannot be formatted by `fr-CH` formatters and
doing the two changes separately means touching the same three files twice.

`web/src/lib/date.ts` becomes the only place instants are formatted, and
locale-aware:

- `formatArrived` (`Inbox.tsx:9-21`) and `formatReceived`
  (`ContactMessages.tsx:35-47`) — byte-identical to each other — collapse into
  one shared function. **Both screens' tests assert the rendered string**, so
  those assertions are read first and French output is kept identical.
- `formatLastLogin` **stays separate.** Different shape, no time-of-day, for the
  reason its docblock gives. #147 says so explicitly and it is easy to get wrong.
- `LONG` moves from `fr-FR` to the active locale. For its option set `fr-FR` and
  `fr-CH` render identically, so French output does not change — `date.ts`'s own
  docblock already records that equivalence.
- **`formatEventDateRange` hard-codes the French word `" au "`.** This is not in
  #147 and is a translatable string hiding inside a date helper; it becomes a
  catalogue key.

`Europe/Zurich` stays pinned everywhere, for the reason `formatLastLogin`'s
docblock gives: the API sends UTC, an evening login in Fribourg is the previous
day in UTC, and formatting in the viewer's zone would also differ between two
committee members reading the same roster.

## Testing

**The default locale in tests stays French, so all 39 existing test files pass
unchanged.** This is deliberate and load-bearing: it keeps every slice's diff
confined to the strings that slice actually moved, which is the only thing making
nine PRs reviewable.

`web/src/test/renderWithSession.tsx` gains an optional `locale`, for the handful
of tests that assert German.

New coverage in PR 1:

| What                                          | Why                                             |
| --------------------------------------------- | ----------------------------------------------- |
| `localeFromPath` cases, including `/design`   | The whole-segment rule is a real trap           |
| Catalogue key-path completeness               | The readable version of the TS structural error |
| `<html lang>` is set from the locale          | Silent, and invisible on screen if wrong        |
| The root-path redirect from stored choice     | The one place localStorage is read              |
| `fr.ts` and `de.ts` both satisfy the PHP test | Runs under `npm run test:api`                   |

PR 9 adds an e2e spec: load `/de`, assert German nav and `html[lang="de-CH"]`,
switch back to French, assert the round-trip. E2E is where this feature is
actually verified by the person who asked for it, so it is not optional.

## Delivery

Nine pull requests, one issue each, per `CLAUDE.md`'s one-issue-one-branch-one-PR
rule.

| PR    | Contents                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | `locale.ts`, i18next `de-CH`, `basename`, `<html lang>`, `t()`, test helper, completeness test, **the full error vocabulary in German**, **#147**, and `Layout.tsx`'s nav chrome as the worked example |
| 2     | Public pages — Home, Agenda, Band, Committee, History, Join, Contact, NotFound                                                                                                                         |
| 3     | Auth and account — Login, Account, guards, session chrome                                                                                                                                              |
| 4     | Events and planning — Events, EventForm, SeriesForm, EventCard, the date helpers' copy                                                                                                                 |
| 5     | Attendance — EventAttendance, AttendanceControls, the two dialogs, chase list                                                                                                                          |
| 6     | Members — Members, MemberForm, the password dialogs                                                                                                                                                    |
| 7     | Registrations — EventBooking, EventRegistrations, EventRegistrationOptions                                                                                                                             |
| 8     | Inbox and messages — largely catalogued already, a short one                                                                                                                                           |
| **9** | The language switcher, `hreflang` alternates, the e2e spec                                                                                                                                             |

**`/de/*` works from PR 1 onward if the URL is typed**, which is exactly what the
verification use-case needs, while nothing advertises it until PR 9. That is what
lets this ship with **no feature flag** — and therefore no new key in
`api/.env.example`.

That last point is not incidental. `App\Support\Features` fixes its key set in
code, backed by `.env` keys such as `FEATURE_CALENDAR`, and the deploy
pre-flight compares key sets: a `FEATURE_GERMAN` would **refuse QA's and PROD's
next deploy** until each server's `.env` was hand-edited. Both are already
blocked on six such keys ([#113](https://github.com/hoferan/website-les-canetons/issues/113)).
Avoiding the flag avoids all of it.

`hreflang` waits for PR 9 deliberately: pointing crawlers at half-translated
pages is worse than pointing them nowhere.

The slice boundaries in PRs 2–8 are adjustable. The ordering is not arbitrary —
public pages first, because they are the ones a stranger in Fribourg reaches.

**The implementation plan that follows this spec covers PR 1 only.** PRs 2–8 are
mechanical repetitions of a pattern PR 1 establishes and do not each need a plan;
PR 9 gets its own once the catalogue is complete and there is something real to
switch between.

## What German will never reach

Per the editability ladder in `CLAUDE.md`, user-typed content renders verbatim and
no translation layer touches it:

- Event titles, venues and dress codes
- Registration option labels and descriptions
- Contact message bodies, and guest names on the list
- Member names, and any register or role name typed by hand
- The history, once [#104](https://github.com/hoferan/website-les-canetons/issues/104)
  makes it editable content

**A German visitor will see `Répétition` as an event title.** This is inherent to
the model, understood when that model was chosen, and recorded here so that
nobody files it as a translation bug.

## Risks accepted

- **PRs 2–8 collide with R6**, which has 8 open issues touching the same pages.
  Whichever lands second resolves the conflict. Sequencing is worth deciding, but
  does not block starting.
- **Every new UI string costs two translations from PR 9 onward.** Permanent, and
  the direct consequence of shipping rather than building a dev aid.
- **A half-translated `/de/` between PR 1 and PR 9** shows German where it exists
  and French where it does not. Mitigated by the switcher not existing yet, so
  only someone typing the URL — which is to say, the developer verifying — can
  reach that state.

## Closing evidence

Not a green suite. Per `CLAUDE.md`, a green suite is routinely green over a
visibly broken page here.

- PR 1: a screenshot of `/de/agenda` rendering the German nav chrome over
  otherwise-French page content, plus `document.documentElement.lang` reading
  `de-CH`, plus `npm run test:api` green with the extended vocabulary test.
- Each slice: a screenshot of its area at `/de/*`, in German.
- PR 9: the e2e spec passing, and the switcher round-tripping `/agenda` ⇄
  `/de/agenda` with the scroll position and session intact.
