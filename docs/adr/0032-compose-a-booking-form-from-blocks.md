---
status: accepted
date: 2026-10-23
decision-makers: André Hofer
---

# Compose an event's booking form from blocks the committee assembles

## Context and Problem Statement

[ADR-0020](0020-registration-is-a-property-of-an-event.md) made a booking a
quantity per option, and an option a priced line such as "Repas adulte, CHF 45".
The quantities were the people count, which the per-booking maximum and, since
[ADR-0031](0031-cap-an-option-under-a-lock.md), each option's capacity count
against.

That covers the souper and nothing else. The committee also wants to ask
"Végétarien ?", "Which t-shirt size?", "What do you bring?" or "How many
bottles?", and to run a form with no menu at all, such as a picnic list.
André's words for the goal are a form builder the committee uses "like lego"
(#114).

How should a form hold blocks of different kinds, and stay countable?

## Considered Options

- Typed blocks: the shared settings as columns, one JSON column for what a kind
  adds
- A kind column plus one column per setting of every kind
- The whole form as one document per event, and each booking's answers as one
  document

## Decision Outcome

Chosen option: "Typed blocks", because what has to be counted under the ADR 0031
lock stays in real columns, and a new kind needs code rather than a migration.

- An option has a `kind`: `quantity`, `text`, `choice` or `yes_no`, which a guest
  answers, or `heading` or `paragraph`, which a guest only reads. Price,
  capacity and `counts_guests` belong to a quantity, and a choice keeps its
  answers in `settings`.
- Menu and number are one kind. A quantity that `counts_guests` is people, like
  every option before; one that does not is a count of something else
  ("bottles"). The people count is the sum of the ticked quantities, and the
  per-booking maximum and the planning badge use that sum.
- A form with a ticked block needs at least one person per booking
  (`no_guests`), because the migrated souper's menus are all optional and a
  per-block `required` cannot say "a meal, adult or child". A form with none
  takes a booking of answers alone.
- A booking answers each block once, never per person. A quantity fills
  `registration_choices.quantity`; every other kind fills `value`: the text,
  the chosen answer's id, or `yes` / `no`.
- A choice's answers carry a server-assigned id, which the booking stores, so
  renaming an answer renames it everywhere. It is `id` and not `key` because
  `AccessDecidedByPermissionTest` reads every comparison on a `key` field as a
  role check.
- Once a block has an answer, its kind and its `counts_guests` stay fixed
  (`409 option_shape_locked`), and a choice keeps every answer somebody picked
  (`409 choice_answer_in_use`). Its wording, price and capacity stay editable.
- The table, model and route keep their names (`event_registration_options`,
  `RegistrationOption`, `/registration-options`). Renaming a table is not
  backward compatible on a deploy that migrates on its first request.

### Consequences

- Good, because the souper keeps working unchanged: the migration makes every
  existing option a quantity that counts people.
- Good, because the guest list, the export and the mail read every answer from
  one place, `RegistrationChoice::answerText()`.
- Bad, because the replace-all PUT now carries per-kind rules and two more
  refusals, and its id-less adoption has to match the kind as well as the label.
- Bad, because a booking answers once for everybody it covers: "who at the
  table eats what" would need another shape.

### Confirmation

`RegistrationBlocksTest` covers the kinds, the locks and the answers.
`RegistrationSchemaTest` pins the migration of existing options.
`RegistrationCapacityTest` still pins the ADR 0031 lock order.

## Pros and Cons of the Options

### A kind column plus one column per setting

- Good, because it is the smallest first change.
- Bad, because every new kind adds columns and a migration, and most columns are
  empty on most rows.

### The whole form as one document

- Good, because any shape fits.
- Bad, because counting places under a lock, tallying "12 red, 5 blue" and
  reading old answers after the committee edits the form all have to be done
  over JSON.

## More Information

Two follow-ups were split out: the committee correcting a booking's answers
(#317), and forms open to members only (#318).
