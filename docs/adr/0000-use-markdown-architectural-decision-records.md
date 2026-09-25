---
status: accepted
date: 2026-09-25
decision-makers: André Hofer
---

# Use Markdown Architectural Decision Records

## Context and Problem Statement

The decisions that shape this project were scattered across 104 design specs and
plans, most of them stale, and across long paragraphs in `CLAUDE.md`. A reader could
not tell which decision still held, what was weighed against it, or what it costs.
Where should those decisions live, and in what form?

## Considered Options

- MADR 4, Markdown Architectural Decision Records
- Michael Nygard's original format: context, decision, consequences
- No records; keep decisions in `CLAUDE.md` and code comments

## Decision Outcome

Chosen option: "MADR 4", because it records the options that were rejected as well as
the one chosen, and a rejected option is exactly what a later contributor would
otherwise propose again. It is plain Markdown in the repository, so it is reviewed in
the same pull request as the code it explains.

Records live in `docs/adr/` as `NNNN-title-with-dashes.md`, numbered in the order
written. Each starts from [`adr-template.md`](adr-template.md), which keeps MADR's
front matter and the sections this project uses: Context and Problem Statement,
Considered Options, Decision Outcome with its Consequences, and an optional
Confirmation saying what enforces the decision. Pros and Cons of the Options and More
Information are added when a record needs them.

A record that a later one replaces gets `status: superseded by ADR-NNNN`, and the
later one says what it supersedes. `README.md` in this directory is the index.

### Consequences

- Good, because each decision carries its alternatives and its cost in one short file.
- Good, because the format is widely known and needs no tooling.
- Bad, because a record describes a decision, and nothing checks that the code still
  matches it. Where a test, a type or a lint rule can enforce a decision, the record
  names it under Confirmation instead of restating the rule.

## More Information

MADR: <https://adr.github.io/madr/>. Where decisions go instead of specs and plans is
[ADR-0001](0001-keep-working-documents-out-of-the-repository.md).
