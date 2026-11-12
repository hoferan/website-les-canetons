# 0006 · No versioning while there is one consumer

Status: accepted, 2026-11-12

## Context

Semantic versioning tells consumers what an upgrade will cost them. The only consumer is the app in the same commit, deployed atomically with the library.

## Decision

The design system has no version number, no changelog and no Changesets. A change to the public API is a change to its callers in the same pull request, and the PR title (Conventional Commits, already enforced) is the record. Breaking changes are therefore free but must be complete: no deprecated alias is left behind. The triggers to revisit are a second consumer or a move to a built package (ADR 0001).

## Alternatives considered

- **Changesets in a single package.** Ceremony without a reader.
- **Version field maintained by hand.** Goes stale silently, which this repo's CLAUDE.md warns against for prose trackers.

## Consequences

- Good: no release overhead; refactors stay atomic.
- Bad: nothing teaches semver; that lesson is deferred to approach 3 or 4 if a real consumer appears.
