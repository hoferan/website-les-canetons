<?php

namespace App\Http\Middleware;

use App\Exceptions\SchemaUnavailable;
use App\Support\MigrationLock;
use Closure;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Applies pending migrations on the first Laravel request after a deploy,
 * guarded by a MySQL advisory lock so concurrent PHP-FPM workers cannot
 * double-apply or race (ADR 0008). Prepended to both middleware groups in
 * bootstrap/app.php: `api` for routes/api.php and `web` for Sanctum's
 * GET /sanctum/csrf-cookie, which the SPA primes and which would otherwise 500
 * in StartSession on a never-migrated server. That file has the ordering
 * argument.
 *
 * The deploy host firewalls the GitHub runners, so CI cannot call
 * POST /api/migrate after it uploads over FTP. Without something on the request
 * path, a deploy to TEST would serve against the old schema until somebody runs
 * `npm run dbmigrate:test` by hand.
 *
 * POST /api/migrate remains the explicit operator path: `npm run
 * dbmigrate:<env>` calls it, and it is the only way to get a dry run. That
 * route opts out of this middleware (routes/meta.php), or a dry run would apply
 * everything before the controller read `mode`. It takes the same lock instead.
 *
 * Hot path: nearly every request has nothing pending, and that costs one glob
 * of database/migrations plus two round trips (the information_schema lookup
 * for `migrations` and `SELECT migration FROM migrations`), with no lock, no
 * migration class booted and no cache access. On the local Docker stack that is
 * about 2.5 ms, almost all of it the glob over a Windows bind mount; on a
 * server's local disk expect a few hundred microseconds. The glob scales with
 * the number of migration files.
 *
 * It is not cached on purpose. A cache would have to be invalidated by the
 * deploy, which is an FTP upload that cannot run anything on the server, and a
 * TTL reopens a window in which the API serves against the wrong schema.
 *
 * The lock is App\Support\MigrationLock, which says why it is a raw GET_LOCK.
 */
class RunPendingMigrations
{
    /**
     * Overridable only so the test proving that an unavailable lock produces a
     * 503 can wait 0 seconds instead of 30.
     */
    protected function lockTimeoutSeconds(): int
    {
        return MigrationLock::TIMEOUT_SECONDS;
    }

    public function handle(Request $request, Closure $next): Response
    {
        // Defaults to true (config/app.php): a server without the key must
        // still migrate itself.
        if (config('app.auto_migrate')) {
            $this->maybeMigrate();
        }

        return $next($request);
    }

    private function maybeMigrate(): void
    {
        // Hot path: nothing pending -> no lock, no work. Nearly every request.
        if (! $this->hasPending()) {
            return;
        }

        if (! MigrationLock::acquire($this->lockTimeoutSeconds())) {
            // Timed out behind a worker that is migrating, or an error. Either
            // way the schema may not be current, so the request is not served.
            throw new SchemaUnavailable(sprintf(
                'Could not acquire the migration lock (%s) within %d seconds; '
                .'migrations are pending and the schema may be out of date.',
                MigrationLock::NAME,
                $this->lockTimeoutSeconds()
            ));
        }

        try {
            // Re-checked under the lock: a worker queued ahead may already
            // have finished the run.
            if ($this->hasPending()) {
                $this->migrate();
            }
        } finally {
            MigrationLock::release();
        }
    }

    /**
     * Are there migration files that the `migrations` table has no row for?
     *
     * The paths are assembled the way BaseCommand::getMigrationPaths() does, so
     * this agrees with what `artisan migrate` picks up, including any path a
     * service provider registered.
     *
     * Separate from MigrateController::pendingMigrations(), which lists the
     * pending migrations by name for an operator and is pinned by tooling
     * outside this repo.
     *
     * Protected only so AutoMigrateTest can call it on a subclass. The
     * never-migrated branch cannot be reached through an HTTP test: dropping
     * the `migrations` table makes the next request re-run every migration
     * against existing tables, and the framework's create_cache_table is not
     * guarded.
     */
    /** @phpstan-impure It queries the migrations table, so two calls in one request can legitimately disagree — which is why the check is repeated under the lock. */
    protected function hasPending(): bool
    {
        /** @var Migrator $migrator */
        $migrator = app('migrator');

        $files = $migrator->getMigrationFiles(
            array_merge($migrator->paths(), [database_path('migrations')])
        );

        if ($files === []) {
            return false;
        }

        // On a never-migrated database the ledger does not exist, and asking
        // the repository would throw (SQLSTATE 42S02). Everything is pending.
        if (! $migrator->repositoryExists()) {
            return true;
        }

        return array_diff(array_keys($files), $migrator->getRepository()->getRan()) !== [];
    }

    private function migrate(): void
    {
        try {
            $exitCode = Artisan::call('migrate', ['--force' => true]);
        } catch (Throwable $e) {
            // The schema may now be half-applied, so the request is not served.
            throw new SchemaUnavailable(
                'Automatic migration failed: '.$e->getMessage(),
                previous: $e
            );
        }

        // A command that merely exits non-zero throws nothing, and would
        // otherwise read as success.
        if ($exitCode !== 0) {
            throw new SchemaUnavailable(sprintf(
                'Automatic migration failed: artisan migrate exited with code %d. Output: %s',
                $exitCode,
                trim(Artisan::output())
            ));
        }
    }
}
