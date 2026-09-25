# 0014. Authorize by permission, never by role

Status: Accepted, 2026-09-05

## Context

The old site had three roles in a hierarchy: `user`, `moderator` and `admin`. `admin`
could manage events and see the summary, and therefore could not say whether they were
coming. `moderator` was identical to `user`. `admin` was a shared account that nobody
owned.

A band needs people who play and organise at once, a committee that only reads
bookings, and a direction that manages everything and plays nothing. A hierarchy
cannot express that.

## Decision

A permission is a case of the PHP enum `App\Support\Permission`, and exists only if
middleware checks it. A role is data: rows in `roles` and `role_permissions`, assigned
through `member_roles`. A member's effective permissions are the union of their roles'
(`EffectivePermissions`). There are no grants to a single member.

Enforcement is the `permission:<name>` route middleware (`RequirePermission`), always
paired with `auth:sanctum` so an anonymous caller gets 401 and not 403. Nothing
compares a role key. `roleKeys` in `/me` is for display. The SPA's guards and nav
mirror the permissions for convenience only. The nav leaves out an entry the member
cannot use, and a guarded route refuses in place rather than redirecting.

Read and write are separate permissions per domain, so a role that only looks cannot
destroy: `registrations.view` and `registrations.manage`, `messages.view` and
`messages.manage`, `attendance.view_all` and `attendance.record_for_others`.

Answering an event is not a permission. A member is answerable if they play in a
register (`Member::isPlayer()`, a non-null `section_id`). Making it a grant is exactly
what locked `admin` out before. The seeded `demo.both`, who plays and manages, is the
case that breaks if anyone brings an either/or back.

## Consequences

Which roles exist and what each grants is changed by hand in the database until a role
editor is built. That editor carries a safety gap: `AccessIntegrity` stops anyone
deleting or demoting the last holder of `members.manage`, but nothing yet guards
editing what a role grants, so an editor shipped without that check could strip
`members.manage` from `direction` and lock the band out, with no shell to repair it.

Registers and roles are reference data seeded by migrations, since there is no shell to
run a seeder. A role's permissions are seeded only when the role is new, so edits are
never overwritten. A new permission therefore needs its own additive grant migration,
or every screen behind it answers 403 on existing servers.

Adding a permission before its middleware exists is forbidden. `system.manage` waits
for the editor.

Registers and roles have an immutable `key`, and the SPA translates the name by that
key. When the editor arrives they gain per-locale labels stored as data.

Every privileged change is written to `audit_log` through `App\Support\Audit`.
