---
status: accepted
date: 2026-10-15
decision-makers: André Hofer
---

# Keep serving when AUTO_MIGRATE is off, because it is the outage switch

## Context and Problem Statement

[ADR-0008](0008-migrate-on-the-first-request-after-a-deploy.md) applies pending
migrations from `RunPendingMigrations` on the first request after a deploy, and
`AUTO_MIGRATE` in each server's `_api/.env` switches that off.

With the flag on, a migration that throws makes every `/api/*` request answer 503
`service_unavailable` and retries on the next request. That takes down the whole
site, because the SPA renders nothing until `GET /api/v1/config` answers.

With the flag off, `handle()` skips the check and serves the request against
whatever schema the server has. Until 2026-09-14 CLAUDE.md and `api/.env.example`
said the opposite, that the flag off answered 503 on pending work. The docs were
corrected to match the code, and issue #112 asked whether the code should change
to match the old docs instead.

The host has no shell and refuses remote database logins. When a migration fails
in a loop, `_api/.env` is the one thing an operator can still change, by hand,
over FTP. `staging/README.md` already uses `AUTO_MIGRATE=false` that way: it
brings the site back against the half-applied schema while the fix is written.

Should `AUTO_MIGRATE=false` keep serving, or refuse with 503 while migrations are
pending?

## Considered Options

- Keep serving against the schema the server has
- Refuse with 503 while anything is pending
- Refuse with 503, and add a second key that serves anyway

## Decision Outcome

Chosen option: "Keep serving against the schema the server has", because it is the
only way to end an outage caused by a failing migration without a shell, and the
code already behaves this way.

`AUTO_MIGRATE=false` stops the migration and nothing else. It is an emergency
switch, set by hand while a failing migration is fixed and set back to `true`
afterwards.

### Consequences

- Good, because a migration failing in a loop can be stopped from the FTP client,
  and the site comes back within one request.
- Good, because nothing changes: no code, no new `.env` key, no deploy refused by
  the config-shape pre-flight.
- Bad, because a server left on `false` answers requests against a schema the code
  may have outgrown, and nothing on screen says so. Backward-compatible migrations
  ([ADR-0008](0008-migrate-on-the-first-request-after-a-deploy.md)) keep that
  survivable for the length of an incident, and the switch should stay off no
  longer than that.

### Confirmation

`AutoMigrateTest::test_the_toggle_off_leaves_a_pending_migration_alone` writes a
pending migration, turns the flag off, and asserts that the request answers 200 and
the migration does not run. Making the flag fail closed fails that test.

## Pros and Cons of the Options

### Refuse with 503 while anything is pending

- Good, because no request is ever served against an outdated schema.
- Bad, because a failing migration then has no way out short of deploying a fix.
  Flipping the flag would swap one 503 for another, and the site stays down for as
  long as the fix takes.
- Bad, because the check for pending work would run with the flag off too, so
  turning it off would no longer save anything per request.

### Refuse with 503, and add a second key that serves anyway

- Good, because both stances become available.
- Bad, because a new key in `api/.env.example` refuses every server's next deploy
  until it is added by hand, for a stance nobody has asked for.

## More Information

Issue #112 raised the question. The recovery steps are in `staging/README.md`,
under "Database migrations & recovery". Revisit if a server ever has to hold a
schema still for longer than an incident, for instance during a rollback that takes
days.
