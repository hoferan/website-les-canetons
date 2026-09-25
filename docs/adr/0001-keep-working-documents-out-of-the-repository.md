---
status: accepted
date: 2026-09-25
decision-makers: André Hofer
---

# Keep working documents out of the repository

## Context and Problem Statement

Work on this project runs through Superpowers skills, which write a design spec and
an implementation plan for each piece of work. By September 2026 `docs/superpowers/`
held 104 of them, about 3.4 MB, and every one was tracked.

They were wrong soon after they were written. The code moved on and the documents
stayed. Several deploy designs from July replaced each other within days. The central
rebuild design of 2026-09-05 proposed deleting `RunPendingMigrations` and the QA and
PROD tooling, and neither happened. The authorization model it replaced is still
described in older specs next to it. A reader had no way to tell which document still
held.

Code comments had started to depend on them. About ninety comments pointed at "design
§3", "§4.4", "the R3 spec §9" or a decision id such as D13 or B7, which a reader has
to open a 30 KB document to follow, and which silently point at the wrong thing once
the document is superseded.

Where do specs and plans live, and where does a decision that must outlive its piece
of work go?

## Considered Options

- Git-ignore `docs/superpowers/` and promote lasting decisions into the repository
- Keep tracking every spec and plan in `docs/superpowers/`

## Decision Outcome

Chosen option: "Git-ignore `docs/superpowers/` and promote lasting decisions into the
repository", because a tracked spec or plan goes stale as soon as the code moves on,
and a reader cannot tell which one still holds.

Specs and plans are still written, locally, as scaffolding for one piece of work.

A decision that must outlive its piece of work goes into one of these, in order of
preference:

1. A test, a type or a lint rule, when the decision can be enforced.
2. A comment in the file the decision constrains.
3. `CLAUDE.md`, for conventions that change how every task is done.
4. A record in `docs/adr/`, for a decision with no natural home in code. The format is
   [ADR-0000](0000-use-markdown-architectural-decision-records.md).

Nothing in the repository cites a spec, a plan, a section number or a decision id from
one. A comment that needs a reason gives the reason, or points at an ADR or an issue.

### Consequences

- Good, because the repository describes only the project that exists. A contributor
  reads the code, `CLAUDE.md`, `docs/traps.md` and these records.
- Bad, because promoting a decision has to happen while it is being made. A decision
  recorded only in a plan is not recorded, because the plan never reaches anybody
  else.
- Bad, because what the documents said about decisions that were later reversed is
  gone from the tree, on purpose. The git history before this change still has them.

The 104 documents were read before they were removed, and the decisions still in force
were written up as ADRs 0002 to 0024.

## Pros and Cons of the Options

### Keep tracking every spec and plan in `docs/superpowers/`

- Bad, because the documents stay while the code moves on, and nothing tells a reader
  which of them still holds.
- Bad, because code comments come to cite section numbers and decision ids that need a
  30 KB document to follow, and that point at the wrong thing once the document is
  superseded.
