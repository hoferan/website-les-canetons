# Tappable contact details on the guest list

Design for [#98](https://github.com/hoferan/website-les-canetons/issues/98).
Decided 2026-09-16.

## The problem

`/events/{id}/registrations` renders every phone number and e-mail address as
plain text. `grep -rn "mailto:\|tel:" web/src` returns one hit, and it is a
comment in `Join.tsx` explaining why that page deliberately has none. Chasing a
guest list from a phone — which is the one context that screen is used in —
therefore means retyping a number by hand.

The same screen has a second defect the issue names: the table shown from `md`
up has **no address column at all** (Nom, Contact, Table, Commande, Personnes,
Total, Actions), while the card shown below `md` renders
`booking.address`. The desktop view carries less than the phone view for the
same row.

## Scope

`web/src/pages/EventRegistrations.tsx`, one new component, and two small
changes to `web/src/components/ui/table.tsx`.

**Contact details appear nowhere else that this issue reaches.** Members carry
no e-mail and no phone — the schema never had them
(`api/app/Models/Member.php:17-21`). `/join`'s two numbers are placeholders and
are deliberately unlinked (`web/src/pages/Join.tsx:26`). `comite@lescanetons.org`
was pulled from `/committee` by the 2026-08-31 content audit because it was
being scraped. The only other render of a contact is `EventBooking.tsx:194`,
where a guest reads back their *own* address on a confirmation screen; that is
not a chase context and is left alone.

### Deliberately not in this issue

**Normalising `phone` to E.164 in the API.** `StoreRegistrationRequest:80` is
`['required', 'string', 'max:64']` with the docblock "A telephone number, in
whatever form the guest writes it" — free text, no format validation, no
normalisation. Uniform stored data is wanted and is the right destination, but
it is a Composer dependency, a write-path change, a new validation token with
French copy, a backfill migration, and it silently changes the four guest-list
exports and the confirmation mail. Per CLAUDE.md — one issue, one branch, one
PR — that is its own issue.

It also carries a trap this issue must not pre-empt: normalising against a
default region is **destructive** in the backend in a way it is not in an
`href`. A French guest typing `06 12 34 56 78` normalises against region CH to
`+41612345678`, and the DB then holds the only copy of the number, wrong, when
`StoreRegistrationRequest` calls that field "how the committee reaches them the
evening before". A backend design has to answer that — store raw *and*
normalised, or normalise only when the number is unambiguous.

**One row description shared by both layouts.** Three pages
(`EventRegistrations`, `EventAttendance`, `Members`) each hand-maintain two
layouts of the same row, both in the DOM at once. The missing address column is
not an oversight but the predictable outcome: somebody added `address` to the
card and nothing forced the table to follow. Fixing the column leaves the class
of bug intact. That is a design-system change across three pages, and its own
issue.

**Keyboard-reachable scroll containers.** `EventRegistrations.tsx:371` and
`EventAttendance.tsx:223` are both plain `overflow-x-auto` divs with no
`tabIndex`, no `role` and no label, and neither table carries the `min-w-*`
that would give the container something to scroll. It spans two pages and
belongs to [#15](https://github.com/hoferan/website-les-canetons/issues/15),
the SPA a11y audit.

## Why the table stays a table

Considered and rejected: replacing the table with cards at every width.

A table's value is column alignment — the eye runs *down* a column. "Who has no
table assignment?", "are there two Duponts?", "which booking is the big one?"
are column reads, and cards destroy vertical alignment by construction. A souper
guest list runs to 60-80 bookings. For a screen-reader user the trade is worse
still: a real `<table>` with real `<th>` gives table navigation mode, with the
column header re-announced per cell, and a flat list of cards gives none of it.

The accessibility anti-pattern is tables used for *layout*. This is data: N
guests by seven attributes. The table is correct; three defects in how it is
built are not, and two of them are in the markup this issue rewrites.

## Design

### 1. `web/src/components/ContactLink.tsx` (new)

Exports a pure `telHref(phone: string): string | null` and a `ContactLink`
component, so the derivation is unit-testable without rendering.

`telHref` keeps a leading `+`, strips every character that is not a digit, and
returns `null` when no digit survives:

| Stored value | `href` |
| --- | --- |
| `079 123 45 67` | `tel:0791234567` |
| `+41 79 123 45 67` | `tel:+41791234567` |
| `079/123.45.67` | `tel:0791234567` |
| `0041 79 123 45 67` | `tel:0041791234567` |
| `à demander` | `null` — plain text, no link |
| `` (empty) | `null` |

**The displayed text is always the stored value, verbatim.** The link is added;
the number is never rewritten on screen. That is also what makes this forward
compatible with the E.164 issue above: sanitising an already-normalised number
is a no-op, so the front end does not change again when the backend does.

`mailto:` takes the trimmed address, and falls back to plain text when the
value is empty or still contains whitespace, `?` or `&` after trimming — two
lines that stop a malformed value injecting headers into the mail client. The
field is server-validated as `email`, so this is a belt on top of a brace.

**The accessible name is the value itself; there is no `aria-label`.** An
override such as "Écrire à Jean Dupont" would *hide* the address from a
screen-reader user, and the address or number is the distinguishing thing.
This is the opposite call from the one at `web/src/pages/Members.tsx:490-501`,
and deliberately: a bare "Supprimer" carries nothing, an e-mail address carries
everything.

### 2. The card, below `md`

E-mail and phone become links in place. **The address stays plain text** — no
`geo:` link, no maps URL. A maps URL built from a free-text address is the trap
the 2026-08-31 audit caught in `Join.tsx`, where a hardcoded origin sent every
visitor somewhere confidently wrong.

Contact links get `min-h-8` and `py-1`, ~32px. That clears WCAG 2.2 AA's 24x24
minimum with margin and does not use the 44px `--spacing-touch` floor:
[#118](https://github.com/hoferan/website-les-canetons/issues/118) establishes
that floor as a **button** convention, and three stacked 44px text links would
add roughly 100px to every card on the screen most read from a phone.

### 3. The table, `md` and up

The address becomes the Contact cell's third line, in the card's order:

```
Nom          Contact                            Table   Commande
------------------------------------------------------------------
Dupont Jean  jean@example.ch                    12      2 × Jambon
             079 123 45 67
             Rue de Lausanne 4, 1700 Fribourg
```

No eighth column: `TableCell` carries `whitespace-nowrap`, so a `max:255`
address in a column of its own would not wrap but force the whole table wide,
into a scroll container that is not keyboard-reachable (left to #15 above). The
address span overrides that with `whitespace-normal` and a `max-w`, so it wraps
inside the cell.

**The `<br />` at `EventRegistrations.tsx:391-393` goes** — but not for the
reason usually given. NVDA and JAWS *do* honour a `<br>` as a line boundary in
browse mode, so the cell is not read as one run-on string. It goes because a
`<br>`-separated run is a single text flow: there is no element to hang the
address's `whitespace-normal` and `max-w` on, and no three things for a
screen-reader user to select between. Three siblings in a `flex flex-col` are
three facts that can each be styled and reached.

### 4. `scope="col"` on `TableHead`

`grep -rn "scope=" web/src` returns nothing across the whole SPA. `TableHead`
renders a bare `<th>`, and in both of its usages it is a column header in a
single header row, so `scope="col"` is a safe default; the props spread still
lets a caller override it.

While in that file, correct one line of its docblock. `table.tsx:9-17`
justifies stripping shadcn's own scroll wrapper on the grounds that
"/signups_admin's is a `role="region"` with `tabIndex={0}` and its own label" —
**that page does not exist.** It belonged to the `app/` front-controller app
deleted in the SPA cutover, and neither surviving table page does what the
comment claims. The comment is describing dead code as if it were a live
precedent.

### Two classes that are inert unless authored exactly

Both of these pass code review and pass a jsdom test while doing nothing in a
real browser, so neither can be verified by a green suite — only by the 390px
screenshot.

- **`min-h-8` on a bare `<a>` does nothing.** `min-height` does not apply to a
  non-replaced inline box. The link must carry `inline-flex items-center` for
  the tap target to exist at all.
- **`max-w-*` on a bare `<span>` does nothing**, for the same reason. The
  address span must be `block`.

And one that is a silent lie rather than inert: **`scope="col"` must be
authored *above* `{...props}`** in `TableHead`. JSX takes the last occurrence,
so `<th {...props} scope="col">` cannot be overridden by a caller, and this
design's claim that it can would be false.

## Testing

TDD: every test below is written failing first.

`web/src/components/ContactLink.test.tsx` — the `telHref` table above, case by
case, plus the `mailto:` fallbacks.

`web/src/pages/EventRegistrations.test.tsx` — **scoped to `guest-cards` or
`guest-table`**, never queried globally. The file's own docblock records why:
both layouts are in the DOM at once, so a global query finds each guest twice.

- card: the e-mail renders as `<a href="mailto:…">`
- card: `079 123 45 67` renders as `<a href="tel:0791234567">`
- card: a phone with no digits renders no link
- table: the address appears in the Contact cell — **fails against `main`
  today**, and is the assertion that closes the parity half of the issue
- table: e-mail, phone and address are three distinct elements, no `<br>`
- table: every `<th>` carries `scope="col"`

## Closing evidence

Per CLAUDE.md, an issue closes with evidence rather than assertion: a 390px and
a 1280px screenshot of `/events/{id}/registrations` showing the links and the
address on both layouts, and the address-in-table assertion shown red against
`main` and green after.

Note a web session has no `:8090` parity stack, so the screenshots come from
Playwright against the mocked backend, not from the built artifact.
