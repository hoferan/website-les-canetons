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

One derived status line per member card, after `Rôles`.

- `web/src/members/loginStatus.ts` — new, the derivation
- `web/src/members/loginStatus.test.ts` — new, a case per combination
- `web/src/pages/Members.tsx` — one `<p>` in the card
- `web/src/pages/Members.test.tsx` — the rendered assertion
- `web/src/lib/date.ts` — one date formatter
- `web/src/mocks/handlers.ts` — a `mustChangePassword: true` fixture member

No API change, no migration, no `npm run openapi && npm run generate:api`:
`MemberResource` already ships both fields (`:47` and `:48`) and
`web/src/api/generated/model/memberResource.ts:311` already types
`lastLoginAt`.

## The state set

Four combinations exist. The status names all four, rather than collapsing
`mustChangePassword` over the date:

| `mustChangePassword` | `lastLoginAt` | Rendered |
| --- | --- | --- |
| `true` | `null` | `Aucune connexion, mot de passe provisoire` |
| `true` | date | `Dernière connexion le 1 septembre 2026, mot de passe provisoire` |
| `false` | `null` | `Aucune connexion` |
| `false` | date | `Dernière connexion le 1 septembre 2026` |

**Why four and not three.** The obvious collapse is to let the provisional
password win outright, on the grounds that it is the actionable fact. It is
actionable — but the two rows it merges call for *different* actions. A
provisional password never used may never have reached the person at all, and
wants a phone call asking whether they got it. A provisional password already
used means they are in and have not finished, and wants a reminder to change
it. Merging them is also the exact distinction the issue asked for — "issued
but not yet used" versus "in use" — so a three-state version would close the
issue without answering it.

**Why one line and not two fields.** `Dernière connexion` and `Mot de passe
provisoire` are independent facts and the card labels every field, so two lines
would be defensible. They are one line because the second fact is a qualifier
on the first in every case where both are true, and because a card that is
already four lines plus an action row pays for a fifth on every member to say
something about a minority of them.

## The copy

**No gendered participles.** `Jamais connecté` needs agreement with the member,
and this codebase has no inclusive-writing convention to reach for — the one
place the question comes up sidesteps it by agreeing with *personne* instead
(`web/src/pages/Members.tsx:449`). `Aucune connexion` and `Dernière connexion`
agree with nothing, so the question never arises.

**The line is self-labelling, so it carries no prefix.** Every other field on
the card is `Label : value`, because the real `<th>` went away when the card
became the only layout (#130) and the label is what puts the meaning next to
the value in the reading order. `Identifiant : demo.player` needs its prefix.
`Dernière connexion le 1 septembre 2026` already contains its own, and
`Connexion : Dernière connexion le …` is the prefix twice.

## No new colour

The line renders at the weight of the other card fields. There is no warning
token in `@theme`, and `--color-danger` must not stand in for one: it was split
out of the old `--color-canetons-red` precisely because that colour "did double
duty as brand AND error" (`web/src/styles.css:43`), and a member who has not
logged in is neither.

A muted line among muted lines is admittedly a quiet answer to "the committee
has no way to see who is waiting". If it proves too quiet against a real
roster, the fix is a token that means *attention* with something behind it,
which is its own change and its own issue — not `text-danger` borrowed here
because it was the nearest red.

## Components

**`loginStatus(member): string`** is a pure function over
`Pick<MemberResource, "mustChangePassword" | "lastLoginAt">`, not over the
whole resource, so its tests need no fixture member. It returns the finished
sentence. All four combinations are reachable from its signature, which is what
makes the table above testable as a table.

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
   table, failing before the function exists.
2. `Members.test.tsx` — the roster renders the status, asserted against the
   fixture members covering the never-logged-in, the has-logged-in and the
   provisional-password cases.

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
