# Write a migration

Laravel owns the schema. Migrations live in `api/database/migrations/` and
build the whole database from empty. ADRs 0008 and 0030 have the reasoning;
this page is the practice.

## Why the rules are strict here

On a server, migrations run **on the first request after a deploy**.
`App\Http\Middleware\RunPendingMigrations` sits in front of every `/api/*`
request and `/sanctum/csrf-cookie`. When it finds pending migrations it takes a
MySQL advisory lock, runs `artisan migrate --force` and lets the request
through. Nobody runs them by hand, because this host has no shell and its
firewall keeps CI out.

So a migration that throws takes the whole site down:

- Every `/api/*` request answers 503, the SPA cannot load its configuration,
  and visitors see "Le site n’a pas pu démarrer".
- The failed migration is not recorded, so the next request runs it again,
  from the top.
- MariaDB commits every DDL statement on its own, so nothing rolls back. The
  second run starts against whatever the first one left behind.

Hence the two rules from `CLAUDE.md`. Every migration is:

- **idempotent**: running it again after it stopped halfway finishes the job
  and breaks nothing;
- **backward compatible**: the code that is already deployed keeps working
  against the new schema, because the code and the schema never change at the
  same instant, and a rollback deploys older code onto the newer schema.

The recovery steps, for when it happens anyway, are in
[the runbook](../../staging/README.md#migrations-and-recovery).

## Make it idempotent

Guard **every** statement on its own, so a run that died between two statements
finishes on the next request.

```php
public function up(): void
{
    if (! Schema::hasTable('photo_slots')) {
        Schema::create('photo_slots', function (Blueprint $table) {
            // ...
        });
    }

    if (! Schema::hasColumn('registrations', 'phone_e164')) {
        Schema::table('registrations', function (Blueprint $table) {
            $table->string('phone_e164')->nullable()->after('phone');
        });
    }
}
```

Real examples to copy:

| Pattern | Example |
| --- | --- |
| A table and its foreign key, one guard each | `2026_10_02_000002_create_photo_slots_table.php` |
| Add a column, then a backfill that can run again | `2026_10_13_000002_add_phone_e164_to_registrations.php` |
| A backfill that must run **only** with the column, because running it twice would change meaning | `2026_09_30_000001_add_published_at_to_events.php` |
| Grant a permission to a role | `2026_10_12_000001_grant_roles_manage.php` |

For data, use `insertOrIgnore` against a primary or unique key, or check with
`exists()` first. No migration in the repository uses `upsert` or
`updateOrInsert`; they would overwrite whatever the committee has edited since.

The early migrations from `2026_09_05` call `Schema::create` with no guard.
They ran long ago on every server; do not copy them.

## Make it backward compatible

Add, then use, then remove, in separate deploys:

- A new column is `nullable()` or has a default, so the old code's inserts
  still work.
- Do not rename or drop a column the deployed code reads. Add the new one, move
  the code over, and drop the old one in a later pull request.
  `add_phone_e164_to_registrations` adds `phone_e164` and leaves `phone` alone.
- Keep each migration small. The request that runs it has no timeout of its
  own; a long `ALTER` is cut off by PHP's `max_execution_time` and retried on
  the next request. If you would not want it running inside a page load, run it
  by hand before the deploy (below).

## Reference data goes in migrations, not seeders

Registers, roles, permission grants and event tags reach a server through
migrations. **Seeders never run on a server**: nothing there calls `db:seed`,
and the deploy artifact does not even contain `database/seeders/`.

`api/database/seeders/DevSeeder.php` is for local development only. It creates
the five `demo.*` accounts with the password `demo`. The Docker `web`
container runs it on every start.

Reference data that the committee can edit is the delicate case. Write it
**once, on the run that creates its table**, and never again:

- `2026_09_14_000001_seat_the_committee.php` seeds the committee seats inside
  the same `if (! Schema::hasTable(...))` that creates the table. Its comment
  explains why.
- `2026_09_07_000001_seed_registers_and_roles.php` does `insertOrIgnore` of the
  registers on every run. That brings back a register the committee renamed:
  the old name is free again in the unique index, so it is inserted a second
  time. Do not copy that part.
- A role's permissions are written only when the migration creates the role.
  Re-syncing them would undo what the committee changed on `/roles`.

A new permission is granted to an existing role by its own small migration,
like `grant_roles_manage`: look the role up, return quietly if it is gone,
`insertOrIgnore` the grant, and have `down()` remove only that one grant.

The first administrator comes from the `bootstrap_first_administrator`
migration, from `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` in
`_api/.env`. It does nothing once anybody holds `members.manage`.

## MariaDB 10.3

Production runs 10.3.8. The Docker stack and CI run `mariadb:10.3`; a Claude
Code web session has 10.11, so check anything schema-shaped against the 10.3
container.

- **A second `timestamp` column** that is `NOT NULL` fails with `1067 Invalid
  default value`. Use `dateTime()`. See [`docs/traps.md`](../traps.md#mariadb-103-the-second-timestamp-column-in-a-table)
  and `2026_09_12_000001_create_idempotency_keys_table.php`.
- **`binary()` is a 64 KB `BLOB`**, and `TEXT` is 64 KB too. For anything
  bigger, add the column with a raw `ALTER TABLE ... MEDIUMBLOB`, behind a
  `hasColumn` guard, as `2026_10_02_000001_create_images_table.php` does.
- **No `json()` columns** exist yet. If you add one, test it on 10.3 first.

## Test it

Write a feature test in `api/tests/Feature/` that loads the migration file and
calls `up()` and `down()` directly. `RefreshDatabase` has already migrated the
test database, so that is the only way to see the migration act on existing
data. `GrantRolesManageTest` is the template:

```php
private function migration(): Migration
{
    return require database_path('migrations/2026_10_12_000001_grant_roles_manage.php');
}
```

Cover at least:

- it does what it says on a database that already has data;
- **running it twice** leaves the same result as running it once;
- what the committee may have changed in between (a renamed or deleted row)
  survives;
- `down()` undoes only what `up()` did.

For a migration that can stop halfway, `ImageSchemaTest` has a test that cuts
a run off between the table and its key and checks that the next run adds the
key.

No test runs every migration twice, so a migration without a test of its own
is checked by nobody.

## Run it

Locally:

```bash
npm run artisan -- migrate
npm run artisan -- migrate:status
npm run test:api
```

The stack also migrates on its own: on the `web` container's start, and on the
first API request, as on a server.

On a server, migrations apply themselves on the first request after the
deploy. `npm run dbmigrate:<env>` lets you be that first request and read the
result:

```bash
npm run dbmigrate:test -- --dry-run   # lists what is pending, changes nothing
npm run dbmigrate:test                # applies, and prints applied[] and any error
```

With no flag it applies. It needs `SITE_URL` and `MIGRATE_TOKEN` in
`.env.test`, and on TEST and QA the Basic Auth credentials as well. After any
deploy, `GET /api/health` lists the migrations still pending.

It runs over HTTP like every other request, so it is held to the same PHP time
limit. Running a heavy migration by hand gets you a migration you watched, not
a faster one. For one that is heavy, ship it in a pull request of its own,
ahead of the code that needs it, and trigger it yourself right after that
deploy.
