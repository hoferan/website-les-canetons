# Login state on the roster

Design for [#94](https://github.com/hoferan/website-les-canetons/issues/94).
Decided 2026-09-18.

## The problem

`/members` renders each member as a card carrying name, `Identifiant`,
`Pupitre` and `Rôles`. Nothing on it says whether the person can actually log
in, or ever has.

The issue reports this as "a member created through `Ajouter une personne` gets
no password", and asks for three states, one of them **never issued**. That
premise has since changed and the spec records the correction rather than
carrying it forward:

- `2026_09_08_000001_require_member_credentials` made `members.password`
  `NOT NULL`.
- `MemberController::store()` generates a password for every new member
  (`api/app/Http/Controllers/Api/MemberController.php:142`) and answers `201`
  with it, shown once.

So **no member without a credential can exist**, and "never issued" is not a
state the roster can be in. What remains is two independent facts, both already
on the wire:

| Field | Meaning |
| --- | --- |
| `mustChangePassword` | Still on a committee-issued password. Every screen but `/account` is blocked until they change it. |
| `lastLoginAt` | `null` until the first successful login. Written by logging in; no endpoint can set it. |

The committee's real question is not "who has a credential" — everyone does —
but **whose credential is still the committee's, and who has never used one**.

## Scope

Pills for what needs acting on, plus a last-login line, per member card,
after `Rôles`.

- `web/src/members/loginStatus.ts` — new, the derivation
- `web/src/members/loginStatus.test.ts` — new, a case per combination
- `web/src/members/LoginState.tsx` — new, the pills and the line
- `web/src/pages/Members.tsx` — one component in the card
- `web/src/pages/Members.test.tsx` — the rendered assertions
- `web/src/lib/date.ts` — one date formatter
- `web/src/mocks/handlers.ts` — a `mustChangePassword: true` fixture member

No API change, no migration, no `npm run openapi && npm run generate:api`:
`MemberResource` already ships both fields (`:47` and `:48`) and
`web/src/api/generated/model/memberResource.ts:311` already types
`lastLoginAt`.

## Revised 2026-09-18, after seeing it on screen

**The first version of this design was built and rejected.** It rendered one
muted sentence per card — `Aucune connexion, mot de passe provisoire` — at the
weight of the other card fields, with no colour, on the reasoning recorded
below under *No new colour*. On the real roster it reads as prose among prose:
accurate, and overlooked. The committee's question is not "what is this
person's account state" but "whose row do I have to do something about", and a
sentence answers the first.

So the two facts now split **by what each is for**:

- A state somebody may have to act on is a **pill**: short, solid, scannable.
- A date nobody has to act on is **reference text** under it.

An account in normal use therefore raises **no pill at all**. That absence is
the signal — a roster where every row carries a pill is a roster where a pill
means nothing.

### What each combination renders

| `mustChangePassword` | `lastLoginAt` | Pills | Text |
| --- | --- | --- | --- |
| `true` | `null` | `Jamais utilisé` `Provisoire` | — |
| `true` | date | `Provisoire` | `Dernière connexion le 1 septembre 2026` |
| `false` | `null` | `Jamais utilisé` | — |
| `false` | date | — | `Dernière connexion le 1 septembre 2026` |

Pill order is fixed: `Jamais utilisé` first, because it is the one that may
mean the credential never reached the person at all; `Provisoire` beside it
says the committee still holds it.

### The copy

`Jamais utilisé` and `Provisoire` — two words and one. **Still no participle
agreeing with the member**: `Jamais connecté` would need to, and `utilisé`
agrees with `le compte` instead. `Provisoire` alone is not a phrase, so it
carries `aria-label="Mot de passe provisoire"`: a screen reader reaches the
pill without the card around it to supply the noun.

### Colour: no new token after all

The pills are **solid pink**, matching the inbox count badge
(`web/src/components/Layout.tsx:247`) rather than introducing anything. That
badge is already this app's "something needs you" affordance, and a second one
should speak the same language. `--color-pink` is documented in
`web/src/styles.css:39` as *emphasis only — never a whole surface*, and a pill
is emphasis.

`--color-danger` is still **not** borrowed, for the reason the superseded
section below gives: it is error-only by construction, and a member who has not
logged in is not an error.

### Superseded: why the first version carried no colour

Kept because the reasoning about `--color-danger` still binds, and because the
next person to find this line too quiet should know it was argued once.

> The line renders at the weight of the other card fields. There is no warning
> token in `@theme`, and `--color-danger` must not stand in for one: it was
> split out of the old `--color-canetons-red` precisely because that colour
> "did double duty as brand AND error" (`web/src/styles.css:43`), and a member
> who has not logged in is neither.
>
> A muted line among muted lines is admittedly a quiet answer to "the committee
> has no way to see who is waiting". If it proves too quiet against a real
> roster, the fix is a token that means *attention* with something behind it.

It was too quiet against a real roster. The fix turned out not to need a new
token, because an attention affordance already existed.

### Why four combinations still, and not three

The tempting collapse is to let the provisional password win outright and drop
the date with it. It merges two rows that want different things: a password
never used may never have reached the person at all, and one already used means
they are in and have not finished. Under the pill split this costs nothing —
the two facts no longer compete for one sentence.

## Components

**`loginState(member)`** is a pure function over
`Pick<MemberResource, "mustChangePassword" | "lastLoginAt">`, not over the
whole resource, so its tests need no fixture member. It returns
`{ pills, lastLogin }` — structure, not markup — so the table above is testable
as a table, with no render and no MSW.

**`LoginState`** renders that structure, and holds every styling decision. The
split is what keeps "which pills does this member raise" testable apart from
"what colour is a pill". It follows `EventMeta`'s precedent: given nothing to
say, it says nothing.

**The date formatter** goes in `web/src/lib/date.ts`. Note that
`web/src/pages/Inbox.tsx:9` and `web/src/pages/ContactMessages.tsx:35` each
hold a private `Intl.DateTimeFormat` for the same `fr-CH`/`Europe/Zurich`
shape; the new one goes in the shared home rather than becoming a third private
copy. **Those two are deliberately not refactored here** — unrelated to this
issue, and each is load-bearing for its own screen's tests.

The last-login format carries **no time**, unlike those two. A contact message
arriving at 12:05 is a worklist item whose minute matters; a last login is read
as "recently or not", and a time makes the longest line on the card longer for
nothing.

## Testing

Test-driven, in this order:

1. `loginStatus.test.ts` — one case per row of the table, written against the
   table, failing before the function exists. Including the case that must
   raise NO pill: that silence is load-bearing, so it is asserted rather than
   assumed.
2. `Members.test.tsx` — the roster renders the pills and the line, asserted
   against the fixture members covering the never-used, the in-use and the
   provisional-password cases, plus the terse pill's accessible name.

**The fixture that is missing.** `web/src/mocks/handlers.ts:365` already
carries a deliberate non-null `lastLoginAt` on member 1, with a comment saying
it is there "so the roster renders BOTH branches" and that the instant is fixed
so screenshots do not drift. No mock member has `mustChangePassword: true`, so
the provisional-password branches are unrenderable in the mocked backend and in
Playwright. One fixture member gains it, keeping the same reasoning: a real
state that the seeded roster can be in, pinned to a fixed value.

## Closing evidence

Per `CLAUDE.md`, evidence rather than assertion: a screenshot of `/members`
showing cards in more than one state, from the Playwright mock-mode run, plus
the failing-then-passing `loginStatus` cases.
