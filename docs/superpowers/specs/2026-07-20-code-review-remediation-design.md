# Code review remediation (2026-07-20 full-codebase review)

**Date:** 2026-07-20
**Status:** Approved (design)

## Problem

A full-codebase review (not tied to a specific PR/diff — the branch had no
open diff at review time) covered all of `app/` (44 PHP files, 11 JS files)
using 7 parallel finder agents across correctness, security, and
cleanup/convention angles, then verified every candidate against the live
code with a second pass of verifier agents. 23 findings were CONFIRMED, 1
PLAUSIBLE, 1 REFUTED (a documented legacy-URL exception, no action). The full
findings with failure scenarios live in the delivered report
(`code-review-report.html`, sent to the user 2026-07-20); this document turns
those findings into a sequenced, PR-sized remediation plan.

The findings span unrelated subsystems (auth, event CRUD, contact form,
migrations, admin JS) with no single coherent feature to build — so rather
than one feature plan, this spec groups them into **5 independent PRs**,
ordered by severity and by file-level dependency, each shippable and
testable on its own.

## Decision

Ship 5 PRs in sequence. Each PR gets its own branch off `main` and its own
task set in the companion implementation plan
(`docs/superpowers/plans/2026-07-20-code-review-remediation.md`). PRs 2-5 are
independent of each other except where noted below; PR 2 has one hard
dependency on PR 1 (a shared `UserRepository` change), so PR 1 must merge
first if the two are worked in parallel.

| PR | Branch | Theme | Findings covered |
|----|--------|-------|-------------------|
| 1 | `fix/security-auth-xss-admin-exposure` | Security-critical | S1 plaintext passwords, S2 stored XSS, S3 public admin form markup, S4 CSRF logout |
| 2 | `fix/api-validation-reliability` | API validation & reliability (prevents uncaught 500s + one silent data-corruption bug) | C1 weekend flag reset, C2 events.php validation, C3 contact.php length validation (+ V1 French var names, same file), C4 responses.php missing-event crash, C5 stale-session crash |
| 3 | `fix/admin-js-reliability` | Admin JS correctness | J1 missing `response.ok` checks, J2 no double-submit guard — folded into one refactor since both touch the same submit handler (also resolves the "duplicated create/update fetch block" cleanup finding as a side effect) |
| 4 | `fix/auth-ux-migration-order` | Low-severity auth UX + one latent bug | C6 `Migrator` lexicographic sort, C7 lost post-login redirect target, C8 RSVP page missing capability check |
| 5 | `chore/dedupe-api-and-date-helpers` | Cleanup (no bug, maintainability only) | Shared JSON/405 helper across `app/api/*.php`, `ResponseRepository::allForEvent` double-subquery → single `LEFT JOIN`, shared French date-format helper (`main.js`) used by `planning_repet.js` + `sinscrire.js` |

**Deliberately excluded from this plan:** the hardcoded-instrument-list
finding in `inscriptions_admin.js` (verified PLAUSIBLE, not CONFIRMED — the
"obvious" fix of deriving the list from fetched data would silently drop
instruments with zero participants from the summary table, so it isn't a
strict improvement without further design work). Revisit only if it becomes
a real maintenance pain.

## Goals

1. Close all 4 security findings (S1-S4) without adding an external
   dependency (no CAPTCHA service, no new Composer package — `password_hash`/
   `password_verify` are PHP core).
2. Fix every finding that currently produces an **uncaught fatal / raw 500**
   under this app's strict `mysqli_report(MYSQLI_REPORT_ERROR|STRICT)` mode,
   replacing it with the endpoint's normal JSON error contract (400/401/404).
3. Fix the one **silent data-corruption** bug (C1 — partial event PUT
   resetting `weekend` to false) at the root (the repository layer), not by
   patching every caller.
4. Preserve backward compatibility for existing data: **no forced password
   reset**. Existing plaintext rows in `users.password` must keep working
   through a transparent verify-then-upgrade path on next login (expand
   pattern, not big-bang migration — consistent with
   `sql/migrations/README.md`'s expand-contract rule, even though this
   particular change needs no schema migration, only a data-shape change at
   the application layer).
5. Every fix ships with a regression test where the project's test
   infrastructure supports it (PHPUnit for all PHP changes). **JS has no unit
   test runner in this project** (confirmed: `package.json` only defines
   `lint:js`/`format:check`, no test script) — JS-only fixes (PR 3) are
   verified manually via `npm run serve` + browser interaction instead, and
   that manual check is spelled out as an explicit plan step, not skipped.

## Non-goals

- **No forced credential rotation.** S1's fix upgrades hashes lazily on
  successful login; it does not invalidate existing sessions or force a
  password reset banner. (If the team wants to additionally force a reset
  because the plaintext values may already be compromised, that's a separate,
  explicit follow-up decision — not silently bundled here.)
- **No new auth mechanism** (no 2FA, no CAPTCHA, no rate limiting on login).
  Out of scope for a review-remediation pass.
- **No JS test framework introduction.** Adding one (Vitest, Jest, etc.) is a
  real, separate tooling decision with build/CI implications — not smuggled
  into a bugfix PR. PR 3's JS changes are manually verified instead.
- **No behavior change to `app/api/migrate.php` or the migration HTTP
  trigger flow.** PR 4's `Migrator` fix only changes file *ordering*, not the
  apply/record logic.
- **No CSRF token framework.** S4's fix is a same-origin method guard
  (matching the pattern every other `app/api/*.php` endpoint already uses),
  not a new token-based CSRF system.

## Cross-cutting notes for implementers

- **`Database::connect()`** sets `mysqli_report(MYSQLI_REPORT_ERROR |
  MYSQLI_REPORT_STRICT)` globally (`app/src/Database.php:17`) — any mysqli
  error not explicitly validated against beforehand becomes an uncaught
  `mysqli_sql_exception`. This is *why* PR 2 exists: several endpoints relied
  on that to "fail" instead of validating first.
- **No user-registration write path exists in `app/`.** All `users` rows are
  provisioned out-of-band (direct DB access by the maintainer); the seed data
  (`docker/db/init/02-seed.sql`) hardcodes plaintext `'demo'` for every
  synthetic account with a comment noting the app compares plaintext. PR 1
  updates that comment once the code no longer does.
- **Test conventions already established** (do not deviate): pure-logic
  tests extend `PHPUnit\Framework\TestCase` directly (see
  `tests/Unit/AuthTest.php`); anything touching the DB extends
  `IntegrationTestCase` (`tests/Integration/IntegrationTestCase.php`), which
  connects once and wraps each test in a transaction rolled back in
  `tearDown()` — tests never need to clean up rows they insert, *except*
  `Migrator` tests, which do DDL that implicitly commits in MariaDB and so
  clean up explicitly (see `tests/Integration/MigratorTest.php`).
- **Route registration is untouched by this plan.** All API routes already
  accept `GET/POST/PUT/DELETE` uniformly (`app/src/routes.php:74`) and rely on
  each endpoint checking `$_SERVER['REQUEST_METHOD']` itself — S4's fix adds
  that check to `logout.php`, matching every sibling endpoint; it does not
  change `routes.php`.

## Sequencing / how to work this across sessions

Each PR in the table above corresponds 1:1 to a numbered task group in the
implementation plan. A future session (or this one, continued) should:

1. Read this spec once for the "why" and the dependency note (PR 2 needs
   PR 1's `UserRepository` change).
2. Open the plan doc, pick the next unstarted PR's task group.
3. Execute with `superpowers:subagent-driven-development` or
   `superpowers:executing-plans` per that skill's normal flow — a fresh
   worktree per PR (`superpowers:using-git-worktrees`) is recommended since
   the PRs are independent enough to parallelize except for the PR1→PR2
   dependency noted above.
4. `npm run check` must pass before opening each PR (PHP lint + PHPUnit +
   ESLint + Stylelint + Prettier + secret guard — see root `CLAUDE.md`).
