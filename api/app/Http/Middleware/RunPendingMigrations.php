<?php

namespace App\Http\Middleware;

use App\Exceptions\SchemaUnavailable;
use Closure;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Throwable;
use UnexpectedValueException;

/**
 * Applies pending migrations on the first Laravel request after a deploy,
 * guarded by a MySQL advisory lock so concurrent PHP-FPM workers cannot
 * double-apply or race. Prepended to BOTH middleware groups in
 * bootstrap/app.php — `api` for routes/api.php and `web` for Sanctum's
 * GET /sanctum/csrf-cookie, which app/assets/js/api.js primes before every
 * mutating call and which would otherwise 500 in StartSession on a
 * never-migrated server. See that file for the ordering argument.
 *
 * WHY THIS EXISTS AT ALL — and it is not "convenience".
 *
 * The deploy host firewalls the GitHub runner's IP. FTP out of a runner works
 * (that is how every deploy runs); an inbound HTTP request from a runner to the
 * site does not. So CI physically CANNOT call POST /api/migrate after it
 * uploads. Without something on the request path, a merge to main deploys new
 * code to TEST over FTP and then nothing ever migrates it: the API serves
 * against yesterday's schema until a human notices and runs
 * `npm run dbmigrate:test` by hand.
 *
 * This is a port of the old app's App\AutoMigrator (deleted at c18b623 when the
 * old SQL migration system was retired — that change reasoned about who OWNS
 * the schema, which is now Laravel, and missed that the old class was also the
 * only thing that TRIGGERED a migration on this host). Same shape, same lock
 * name, same argument.
 *
 * POST /api/migrate stays exactly as it was: it is the explicit, operator-driven
 * path, it is what `npm run dbmigrate:<env>` calls from a machine that CAN reach
 * the site, and it is the only way to get a dry run. This middleware is the
 * safety net under it, not its replacement.
 *
 * ------------------------------------------------------------------ hot path
 *
 * Nearly every request has nothing pending, so that case must be cheap. It
 * costs, per request: one glob of database/migrations (13 files today), one
 * information_schema lookup for the `migrations` table, and one
 * `SELECT migration FROM migrations` — two round trips on the already-open
 * local connection, no advisory lock, no migration class booted, no cache
 * access. Measured on the local Docker stack (PHP 8.4/MariaDB 10.3), averaged
 * over 300 calls:
 *
 *     glob migration files       2.095 ms      <- the whole cost, effectively
 *     repositoryExists()         0.254 ms
 *     getRepository()->getRan()  0.199 ms
 *     (a bare SELECT 1           0.192 ms)     <- i.e. both queries ARE just
 *                                                 their round trips
 *     total                      ~2.5 ms
 *
 * Read that glob number as a local-dev artefact, not the server cost:
 * database/migrations is a Windows bind mount in the dev stack, where every
 * stat() crosses the VM boundary. On a server the directory is on local disk
 * behind PHP's realpath cache, and the honest expectation is a few hundred
 * microseconds — the two DB round trips, which are irreducible.
 *
 * Even the pessimistic 2.5 ms is bounded and constant. It is worth checking
 * again if database/migrations ever grows by an order of magnitude, since the
 * scan is the part that scales with file count.
 *
 * That is not free, and it is deliberately not cached. A cache would have to be
 * invalidated by the deploy, and the deploy is an FTP upload that cannot run
 * anything on the server — which is the very constraint this class exists for.
 * Any cache with a TTL just reintroduces a window in which the API serves
 * against the wrong schema. Two indexed reads on a warm connection is the price
 * of not having that window.
 *
 * ------------------------------------------------------- why a raw GET_LOCK
 *
 * NOT Cache::lock() and NOT `php artisan migrate --isolated`. Both route
 * through the cache store, which this project configures as the `database`
 * store (CACHE_STORE=database, set project-wide — see api/.env.example), and
 * the `cache` table is ITSELF created by a migration. On a
 * fresh or never-migrated server, taking the lock would query a table that the
 * lock exists to let us create. GET_LOCK is a server-level function and needs
 * no table, so it works on an empty database.
 *
 * The lock is held on the CONNECTION, so every statement here is pinned to the
 * write PDO (useReadPdo: false) — the same one `artisan migrate` writes
 * through. A GET_LOCK taken on a read connection would guard nothing.
 */
class RunPendingMigrations
{
    /**
     * Shared with the deleted App\AutoMigrator on purpose. During any overlap
     * where both an old-app request and an API request could migrate the same
     * database, the same name is what makes them exclude each other. Advisory
     * lock names are server-wide, not per-database, which is fine here: the two
     * apps share one database anyway.
     */
    private const LOCK_NAME = 'lescanetons_migrate';

    /**
     * Long enough for a realistic migration run to finish while a second worker
     * waits, short enough that a wedged migration surfaces as a 503 rather than
     * pinning an FPM worker until the request times out.
     */
    private const LOCK_TIMEOUT_SECONDS = 30;

    /**
     * Overridable only so a test can ask for a 0-second wait: proving that an
     * unavailable lock produces a 503 means holding the lock on another
     * connection and then making a request, and at the real value that test
     * would sit there for half a minute. Nothing in the application overrides
     * this.
     */
    protected function lockTimeoutSeconds(): int
    {
        return self::LOCK_TIMEOUT_SECONDS;
    }

    public function handle(Request $request, Closure $next): Response
    {
        // Default TRUE (see config/app.php). A server that simply does not have
        // the key must still self-heal — a silently-disabled server is the exact
        // failure this whole class exists to prevent, so the fail-safe direction
        // here is "missing means ON", not "missing means OFF".
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

        if (! $this->acquireLock()) {
            // 0 = timed out waiting for a worker that is already migrating,
            // NULL = error. Either way we do not know the schema is current, so
            // the request must not be served.
            throw new SchemaUnavailable(sprintf(
                'Could not acquire the migration lock (%s) within %d seconds; '
                .'migrations are pending and the schema may be out of date.',
                self::LOCK_NAME,
                $this->lockTimeoutSeconds()
            ));
        }

        try {
            // Re-check UNDER the lock. Between the hot-path check above and the
            // lock being granted, a concurrent worker may have queued ahead of
            // us and finished the whole run — in which case there is nothing
            // left to do and re-running `migrate` would be wasted work on every
            // worker that piled up behind the first one.
            if ($this->hasPending()) {
                $this->migrate();
            }
        } finally {
            $this->releaseLock();
        }
    }

    /**
     * Are there migration files that the `migrations` table has no row for?
     *
     * The paths are assembled the way BaseCommand::getMigrationPaths() does, so
     * this cannot disagree with what `artisan migrate` would actually pick up,
     * including any path a service provider registered.
     *
     * Deliberately a boolean and deliberately separate from
     * MigrateController::pendingMigrations(), which answers a different
     * question (WHICH migrations, by name, for a JSON body an operator reads).
     * That endpoint's behaviour is pinned by tooling outside this repo and is
     * left untouched.
     *
     * protected, not private, only so AutoMigrateTest can call it on a
     * throwaway subclass. The never-migrated branch below is the one state that
     * cannot be reached through an HTTP test — reaching it means dropping the
     * `migrations` table, and the request that follows would then try to re-run
     * every migration against a database whose tables already exist (the
     * framework's own create_cache_table is not guarded, so it would fail for a
     * reason unrelated to what is being tested). Calling this directly is the
     * only way to assert the thing that matters: that a missing ledger reports
     * "everything is pending" instead of throwing SQLSTATE 42S02.
     */
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

        // On a database that has never been migrated the ledger does not exist
        // yet — which is the state of EVERY server the first time this ships.
        // Asking the repository would throw (SQLSTATE 42S02), so treat a missing
        // repository as "everything is pending" rather than letting it escape as
        // a 500 that no operator can act on.
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
            // A migration that throws must not be swallowed into a normal
            // response: the schema is now half-applied, which is strictly worse
            // than not having migrated at all.
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

    /**
     * GET_LOCK returns 1 (acquired), 0 (timed out) or NULL (error). Only 1 may
     * be read as success; the string comparison is because the driver hands
     * these back as strings on MariaDB.
     */
    private function acquireLock(): bool
    {
        $row = DB::selectOne(
            'SELECT GET_LOCK(?, ?) AS acquired',
            [self::LOCK_NAME, $this->lockTimeoutSeconds()],
            useReadPdo: false
        );

        if ($row === null) {
            // GET_LOCK always returns a row; no row means something other than
            // MariaDB answered (a stubbed connection in a test, say). Refusing
            // is the safe direction, but it is a programming error rather than
            // an operational one, so it is not a SchemaUnavailable.
            throw new UnexpectedValueException('GET_LOCK returned no row; the connection is not MariaDB/MySQL.');
        }

        return (string) $row->acquired === '1';
    }

    /**
     * Best-effort by design: the lock is released automatically when the
     * connection closes at the end of the request, so a failure here cannot
     * strand it. Throwing out of a finally{} would replace the real exception
     * (a failed migration) with a meaningless one, which is the opposite of
     * failing loud.
     */
    private function releaseLock(): void
    {
        try {
            DB::selectOne(
                'SELECT RELEASE_LOCK(?)',
                [self::LOCK_NAME],
                useReadPdo: false
            );
        } catch (Throwable) {
            // Intentionally ignored; see the docblock.
        }
    }
}
