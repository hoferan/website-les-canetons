<?php

namespace Tests\Feature;

use App\Http\Middleware\RunPendingMigrations;
use Illuminate\Database\Connection;
use Illuminate\Database\Events\MigrationsStarted;
use Illuminate\Database\Events\NoPendingMigrations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * App\Http\Middleware\RunPendingMigrations: the self-healing schema.
 *
 * The deploy host firewalls the GitHub runner's IP, so CI can FTP a deploy up
 * but cannot call POST /api/migrate afterwards. This middleware is the only
 * migration trigger a deployed server has (ADR 0030).
 *
 * The probe-migration plumbing comes from MigrateTest: RefreshDatabase has
 * applied every real migration, so "nothing pending" is the only state a test
 * reaches on its own. A throwaway migration path gives the middleware
 * something pending to act on.
 *
 * phpunit.xml pins AUTO_MIGRATE false, so each test that wants the middleware
 * live turns it on with config([...]), as MigrateTest does for
 * app.migrate_token.
 *
 * Not tested here: that two PHP-FPM workers finding the same pending migration
 * apply it once. That needs two processes racing, and this suite is one
 * process. The closest observable proxies are asserted:
 *
 *   - the advisory lock is held by the migrating connection while a migration
 *     runs (test_the_lock_is_held_by_the_migrating_connection),
 *   - it is released afterwards on both paths
 *     (test_the_lock_is_released_after_a_successful_migration,
 *      test_the_lock_is_released_after_a_failed_migration),
 *   - a request that cannot get the lock is refused, with a real second
 *     connection holding it, as the losing worker in a race sees
 *     (test_an_unavailable_lock_is_a_503).
 *
 * The re-check under the lock (the worker that waited notices the work is
 * done) stays unproven. Its failure is benign: `artisan migrate` with nothing
 * pending is a no-op, so the cost is wasted work on a burst of first requests.
 * The advisory lock is what rules out a double-applied migration.
 */
class AutoMigrateTest extends TestCase
{
    use RefreshDatabase;

    /** Must match RunPendingMigrations::LOCK_NAME. */
    private const LOCK_NAME = 'lescanetons_migrate';

    /** Table the probe migration creates; also the marker we look for. */
    private const PROBE_TABLE = 'auto_migrate_probe';

    /** A second, independent DB connection, for looking at the lock from outside. */
    private const OTHER_CONNECTION = 'auto_migrate_probe_connection';

    /** Directory registered as an extra migration path, per test. */
    private string $probePath;

    /** How many times `artisan migrate` was invoked during the current test. */
    private int $migrationRuns = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->probePath = storage_path('framework/testing/auto-migrate-probe');
        File::deleteDirectory($this->probePath);
        File::ensureDirectoryExists($this->probePath);

        // Counts attempted migration runs. The schema alone cannot tell "ran
        // `migrate` with nothing to do" from "never ran `migrate`", which is
        // the whole hot path.
        //
        // Both events are needed: Migrator::runPending() fires
        // MigrationsStarted only when it has something to run and
        // NoPendingMigrations otherwise, so the first alone would score a
        // needless `migrate` on every request as a clean hot path.
        $this->migrationRuns = 0;
        $count = function (): void {
            $this->migrationRuns++;
        };
        Event::listen(MigrationsStarted::class, $count);
        Event::listen(NoPendingMigrations::class, $count);

        // No auth, permission or feature gate, so a failure here is the
        // middleware's. The `api` group carries RunPendingMigrations.
        Route::middleware('api')->get('/api/v1/auto-migrate-probe', fn () => response()->json(['ok' => true]));
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot undo an applied probe.
        Schema::dropIfExists(self::PROBE_TABLE);
        DB::table('migrations')->where('migration', 'like', '2099_%_auto_migrate_probe%')->delete();
        File::deleteDirectory($this->probePath);

        // Disconnecting drops the session that held the lock, so a test that
        // took one cannot wedge the next.
        DB::purge(self::OTHER_CONNECTION);

        parent::tearDown();
    }

    // ------------------------------------------------------------- the hot path

    /**
     * True on almost every request served, so it must cost a pending-check and
     * nothing else: no `migrate` run, no lock.
     */
    public function test_nothing_pending_means_no_migration_is_attempted(): void
    {
        config(['app.auto_migrate' => true]);

        $ledgerBefore = DB::table('migrations')->count();

        $this->getJson('/api/v1/auto-migrate-probe')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(0, $this->migrationRuns, 'The middleware ran `migrate` with nothing pending.');
        self::assertSame($ledgerBefore, DB::table('migrations')->count());
        self::assertTrue($this->lockIsFree(), 'The hot path took the advisory lock; it must not.');
    }

    // ---------------------------------------------------------- the repair path

    public function test_a_pending_migration_is_applied_and_the_request_still_succeeds(): void
    {
        config(['app.auto_migrate' => true]);
        $name = $this->writeProbeMigration();

        $this->getJson('/api/v1/auto-migrate-probe')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(1, $this->migrationRuns);
        self::assertTrue(Schema::hasTable(self::PROBE_TABLE), 'The pending migration was not applied.');
        self::assertSame(1, DB::table('migrations')->where('migration', $name)->count());
    }

    /**
     * The deploy-shaped sequence: repair on the first request, nothing on the
     * second. A middleware that re-ran `migrate` every time would still pass
     * the test above.
     */
    public function test_the_next_request_does_no_work_at_all(): void
    {
        config(['app.auto_migrate' => true]);
        $this->writeProbeMigration();

        $this->getJson('/api/v1/auto-migrate-probe')->assertOk();
        self::assertSame(1, $this->migrationRuns);

        $this->getJson('/api/v1/auto-migrate-probe')->assertOk();

        self::assertSame(1, $this->migrationRuns, 'The second request re-ran `migrate` with nothing pending.');
        self::assertTrue($this->lockIsFree());
    }

    /**
     * The route a visitor can reach first on a fresh server. web/src/api/http.ts
     * primes GET /sanctum/csrf-cookie before writing, so a login or a contact
     * submit starts here, on the `web` group, whose StartSession reads the
     * `sessions` table a migration creates.
     */
    public function test_the_sanctum_cookie_route_also_repairs_the_schema(): void
    {
        config(['app.auto_migrate' => true]);
        $name = $this->writeProbeMigration();

        $this->get('/sanctum/csrf-cookie')->assertNoContent();

        self::assertSame(1, $this->migrationRuns);
        self::assertTrue(Schema::hasTable(self::PROBE_TABLE), 'The `web` group did not repair the schema.');
        self::assertSame(1, DB::table('migrations')->where('migration', $name)->count());
    }

    // ---------------------------------------------------------------- the toggle

    /**
     * AUTO_MIGRATE=false ends an outage caused by a failing migration, so the
     * request is served and the pending migration left alone. A 503 here would
     * leave no way to bring the site back without a shell (ADR 0030).
     */
    public function test_the_toggle_off_leaves_a_pending_migration_alone(): void
    {
        config(['app.auto_migrate' => false]);
        $name = $this->writeProbeMigration();

        $this->getJson('/api/v1/auto-migrate-probe')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(0, $this->migrationRuns);
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE), 'The toggle was off and the migration ran anyway.');
        self::assertSame(0, DB::table('migrations')->where('migration', $name)->count());
    }

    /**
     * A server whose .env has no AUTO_MIGRATE line gets the default, and a
     * silently disabled server looks fine until the API breaks. Read from
     * config/app.php's own expression, not the .env running the suite.
     */
    public function test_the_default_is_on_when_the_key_is_absent(): void
    {
        // AUTO_MIGRATE is removed from the environment first: phpunit.xml pins
        // it false, so env() would otherwise answer the pin, not the default.
        $original = [
            '_ENV' => array_key_exists('AUTO_MIGRATE', $_ENV) ? $_ENV['AUTO_MIGRATE'] : null,
            '_SERVER' => array_key_exists('AUTO_MIGRATE', $_SERVER) ? $_SERVER['AUTO_MIGRATE'] : null,
            'putenv' => getenv('AUTO_MIGRATE'),
        ];

        unset($_ENV['AUTO_MIGRATE'], $_SERVER['AUTO_MIGRATE']);
        putenv('AUTO_MIGRATE');

        try {
            self::assertNull(Env::get('AUTO_MIGRATE'), 'Fixture check: the key is still visible to env().');

            $config = require __DIR__.'/../../config/app.php';

            self::assertTrue(
                $config['auto_migrate'],
                'AUTO_MIGRATE must default to TRUE. A server that never got the key must still '
                .'self-heal: it is the only migration trigger the host allows, and a silently '
                .'disabled server is the exact failure this middleware exists to prevent.'
            );
        } finally {
            foreach (['_ENV' => &$_ENV, '_SERVER' => &$_SERVER] as $name => &$bag) {
                if ($original[$name] === null) {
                    unset($bag['AUTO_MIGRATE']);
                } else {
                    $bag['AUTO_MIGRATE'] = $original[$name];
                }
            }
            unset($bag);

            if ($original['putenv'] === false) {
                putenv('AUTO_MIGRATE');
            } else {
                putenv('AUTO_MIGRATE='.$original['putenv']);
            }
        }
    }

    // ----------------------------------------------------------- the empty ledger

    /**
     * A never-migrated server has no `migrations` table. That must report
     * "everything is pending", not throw SQLSTATE 42S02, or the middleware
     * 500s at the one moment it exists for.
     *
     * Called directly rather than over HTTP; see the note on
     * RunPendingMigrations::hasPending() for why an HTTP test cannot reach this
     * branch cleanly.
     */
    public function test_a_missing_migrations_table_reports_everything_as_pending(): void
    {
        $middleware = $this->exposedMiddleware();

        self::assertFalse($middleware->pending(), 'Fixture check: nothing should be pending yet.');

        // Snapshot the ledger before dropping it. DDL implicitly commits on
        // MariaDB, so RefreshDatabase cannot put it back, and `artisan migrate`
        // cannot either: with the ledger gone every migration looks pending,
        // and the framework's unguarded create_cache_table fails against
        // existing tables. Restoring the exact rows is the only faithful undo.
        $ledger = DB::table('migrations')->get()->map(fn ($row) => (array) $row)->all();
        self::assertNotEmpty($ledger, 'Fixture check: the ledger must have rows to restore.');

        Schema::drop('migrations');

        try {
            self::assertTrue(
                $middleware->pending(),
                'A never-migrated database must report every migration as pending, not throw.'
            );
        } finally {
            $this->app->make('migrator')->getRepository()->createRepository();
            DB::table('migrations')->insert($ledger);
        }

        self::assertFalse(
            $this->exposedMiddleware()->pending(),
            'The ledger was not restored; the rest of the suite would migrate underneath itself.'
        );
    }

    // ---------------------------------------------------------------- the lock

    /**
     * The lock must be held by the connection doing the migrating. MariaDB's
     * IS_USED_LOCK returns the holding session's id, so comparing it with
     * CONNECTION_ID() inside the migration proves the lock was taken on the
     * connection the migration runs through. A GET_LOCK on another connection
     * would guard nothing and still pass an "is the lock held" check.
     */
    public function test_the_lock_is_held_by_the_migrating_connection(): void
    {
        config(['app.auto_migrate' => true]);
        $marker = $this->probePath.'/holder.txt';
        $this->writeLockObservingProbeMigration($marker);

        $this->getJson('/api/v1/auto-migrate-probe')->assertOk();

        self::assertFileExists($marker, 'The probe migration never ran.');
        self::assertSame(
            'held-by-me',
            trim((string) File::get($marker)),
            'The advisory lock was not held by the connection running the migration.'
        );
    }

    public function test_the_lock_is_released_after_a_successful_migration(): void
    {
        config(['app.auto_migrate' => true]);
        $this->writeProbeMigration();

        $this->getJson('/api/v1/auto-migrate-probe')->assertOk();

        self::assertTrue($this->lockIsFree(), 'The migration lock was left held after a successful run.');
    }

    /**
     * Pins the release in a finally{}. A lock stranded by a failing migration
     * would last until that FPM worker's connection closed, and every other
     * worker would wait out the full timeout and 503.
     */
    public function test_the_lock_is_released_after_a_failed_migration(): void
    {
        config(['app.auto_migrate' => true]);
        $this->writeFailingProbeMigration();

        $this->getJson('/api/v1/auto-migrate-probe')->assertStatus(503);

        self::assertTrue($this->lockIsFree(), 'The migration lock was left held after a failed run.');
    }

    /**
     * What the losing worker in a race sees. A separate connection holds the
     * lock, so GET_LOCK fails, and the request is refused rather than served
     * against an unconfirmed schema.
     *
     * The middleware is swapped for a subclass with a 0-second lock wait
     * instead of the real 30s.
     */
    public function test_an_unavailable_lock_is_a_503(): void
    {
        config(['app.auto_migrate' => true]);
        $this->useZeroWaitLock();
        $name = $this->writeProbeMigration();

        self::assertTrue($this->grabLockOnAnotherConnection(), 'Fixture check: the other connection must get the lock.');

        $this->getJson('/api/v1/auto-migrate-probe')
            ->assertStatus(503)
            ->assertJsonPath('code', 'service_unavailable');

        self::assertSame(0, $this->migrationRuns, 'The middleware migrated without holding the lock.');
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE));
        self::assertSame(0, DB::table('migrations')->where('migration', $name)->count());
    }

    // ------------------------------------------------------------- the failure

    /**
     * A failed migration must fail the request. A 200 against a half-applied
     * schema produces wrong answers instead of errors, which costs the most to
     * find.
     *
     * The body is asserted too: /api/v1/* answers with a problem document, and
     * translateApiError() in web/src/i18n/ turns its `code` into copy. Laravel's
     * native {message, exception} shape would reach the visitor as the
     * generic fallback sentence.
     */
    public function test_a_failing_migration_surfaces_as_a_503_in_the_error_contract(): void
    {
        config(['app.auto_migrate' => true]);
        $name = $this->writeFailingProbeMigration();

        $response = $this->getJson('/api/v1/auto-migrate-probe');

        $response->assertStatus(503)
            ->assertJsonPath('code', 'service_unavailable')
            ->assertJsonPath('title', 'Service unavailable')
            ->assertJsonMissingPath('message');

        self::assertSame(
            0,
            DB::table('migrations')->where('migration', $name)->count(),
            'A migration that threw must not be recorded as run.'
        );
    }

    // ------------------------------------------------------------ the placement

    /**
     * RunPendingMigrations must be the first middleware on the `api` group.
     *
     * With SESSION_DRIVER=database and CACHE_STORE=database, StartSession and
     * the cache read tables a migration creates, and Sanctum's
     * EnsureFrontendRequestsAreStateful pulls the session middleware in. On a
     * never-migrated server anything ahead of this would 500 before its table
     * existed. bootstrap/app.php gets the order from calling prependToGroup()
     * after statefulApi(), which is not obvious from reading it.
     */
    public function test_the_middleware_runs_before_everything_else_on_the_api_group(): void
    {
        $this->assertFirstInGroup('api');
    }

    /**
     * The same guarantee for `web`, whose route is Sanctum's
     * GET /sanctum/csrf-cookie. web/src/api/http.ts primes it before writing,
     * so it can be the first request a visitor makes on a fresh server, and
     * its StartSession reads the `sessions` table a migration creates.
     */
    public function test_the_middleware_runs_before_everything_else_on_the_web_group(): void
    {
        $this->assertFirstInGroup('web');
    }

    /**
     * Group order is not enough: Router::gatherRouteMiddleware() sorts what it
     * gathers, and StartSession is on the kernel's priority list while this
     * middleware is not. So this asserts the order the pipeline runs for the
     * real Sanctum route. StartSession is the one that reads `sessions` and
     * 500s on a never-migrated server.
     */
    public function test_the_middleware_is_sorted_ahead_of_start_session_on_the_sanctum_route(): void
    {
        $router = app('router');

        $route = collect($router->getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === 'sanctum/csrf-cookie');

        self::assertNotNull($route, 'Sanctum no longer registers /sanctum/csrf-cookie; this assertion reads nothing.');

        $gathered = $router->gatherRouteMiddleware($route);

        $mine = array_search(RunPendingMigrations::class, $gathered, true);
        $session = array_search(StartSession::class, $gathered, true);

        self::assertNotFalse($mine, 'RunPendingMigrations is not on /sanctum/csrf-cookie at all.');
        self::assertNotFalse($session, 'StartSession is not on /sanctum/csrf-cookie; this assertion reads nothing.');
        self::assertSame(0, $mine, 'RunPendingMigrations must be the very first middleware on this route.');
        self::assertLessThan(
            $session,
            $mine,
            "The priority sort hoisted StartSession above RunPendingMigrations. On a never-migrated\n"
            ."server StartSession reads a `sessions` table the migration would have created.\n"
            .'Sorted order is now: '.implode(', ', array_map('strval', $gathered))
        );
    }

    /**
     * A request that traverses both groups must migrate once and must not hang.
     *
     * SortedMiddleware::sortMiddleware() ends in Router::uniqueMiddleware(), so
     * the duplicate is collapsed before the pipeline is built. Even
     * un-deduplicated it would be harmless: all the work happens before
     * $next(), so the lock is released before an inner copy could run, and
     * that copy finds nothing pending. This pins the observable result.
     *
     * No route in the app carries both groups, so this registers one.
     */
    public function test_traversing_both_groups_migrates_once_and_does_not_deadlock(): void
    {
        config(['app.auto_migrate' => true]);
        Route::middleware(['web', 'api'])
            ->get('/api/v1/auto-migrate-both-groups', fn () => response()->json(['ok' => true]));

        $name = $this->writeProbeMigration();

        $this->getJson('/api/v1/auto-migrate-both-groups')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(1, $this->migrationRuns, 'The migration ran more than once in a single request.');
        self::assertSame(1, DB::table('migrations')->where('migration', $name)->count());
        self::assertTrue($this->lockIsFree(), 'The lock was left held after a two-group request.');
    }

    private function assertFirstInGroup(string $group): void
    {
        $middleware = app('router')->getMiddlewareGroups()[$group] ?? [];

        self::assertNotEmpty($middleware, "The `{$group}` middleware group is empty; this assertion reads nothing.");
        self::assertSame(
            RunPendingMigrations::class,
            $middleware[0],
            "RunPendingMigrations is no longer first on the `{$group}` group. Anything ahead of it runs\n"
            .'against a schema that may not exist yet. Order comes from prependToGroup() being '
            ."called AFTER statefulApi() in bootstrap/app.php.\nGroup is now: "
            .implode(', ', array_map('strval', $middleware))
        );
    }

    // ----------------------------------------------------------------- plumbing

    /** Is the advisory lock free, seen from a connection that is not ours? */
    private function lockIsFree(): bool
    {
        $row = $this->otherConnection()->selectOne(
            'SELECT IS_FREE_LOCK(?) AS free',
            [self::LOCK_NAME],
            useReadPdo: false
        );

        return $row !== null && (string) $row->free === '1';
    }

    private function grabLockOnAnotherConnection(): bool
    {
        $row = $this->otherConnection()->selectOne(
            'SELECT GET_LOCK(?, 0) AS got',
            [self::LOCK_NAME],
            useReadPdo: false
        );

        return $row !== null && (string) $row->got === '1';
    }

    /**
     * A second connection to the same database. GET_LOCK is scoped to a
     * session, so the default connection might be the holder: it can answer
     * "free" for its own lock, and could take the lock itself.
     */
    private function otherConnection(): Connection
    {
        if (! config('database.connections.'.self::OTHER_CONNECTION)) {
            config([
                'database.connections.'.self::OTHER_CONNECTION => config('database.connections.mysql'),
            ]);
        }

        return DB::connection(self::OTHER_CONNECTION);
    }

    /** A middleware instance whose pending-check can be called from a test. */
    private function exposedMiddleware(): object
    {
        return new class extends RunPendingMigrations
        {
            public function pending(): bool
            {
                return $this->hasPending();
            }
        };
    }

    /**
     * Swap the container's RunPendingMigrations for one that will not wait on
     * the lock. Middleware is resolved out of the container by class name
     * (Pipeline::carry -> $container->make), so a binding is enough.
     */
    private function useZeroWaitLock(): void
    {
        $this->app->bind(RunPendingMigrations::class, fn () => new class extends RunPendingMigrations
        {
            protected function lockTimeoutSeconds(): int
            {
                return 0;
            }
        });
    }

    /**
     * Write a throwaway migration into a directory registered on the migrator.
     * BaseCommand::getMigrationPaths() merges Migrator::paths() with
     * database/migrations, so the middleware sees it as it sees a real one.
     * The 2099_ prefix sorts it after every real migration.
     *
     * @return string the migration name, as the migrations table records it
     */
    private function writeProbeMigration(): string
    {
        return $this->writeMigration('2099_01_01_000000_create_auto_migrate_probe_table', <<<'PHP'
            <?php

            use Illuminate\Database\Migrations\Migration;
            use Illuminate\Database\Schema\Blueprint;
            use Illuminate\Support\Facades\Schema;

            return new class extends Migration
            {
                public function up(): void
                {
                    Schema::create('auto_migrate_probe', function (Blueprint $table) {
                        $table->id();
                    });
                }

                public function down(): void
                {
                    Schema::dropIfExists('auto_migrate_probe');
                }
            };
            PHP);
    }

    /**
     * A probe that records, from inside the migration, whether the advisory
     * lock is held by the very connection running it.
     */
    private function writeLockObservingProbeMigration(string $marker): string
    {
        $markerLiteral = var_export($marker, true);

        return $this->writeMigration('2099_01_01_000002_auto_migrate_probe_lock_observer', <<<PHP
            <?php

            use Illuminate\Database\Migrations\Migration;
            use Illuminate\Support\Facades\DB;

            return new class extends Migration
            {
                public function up(): void
                {
                    \$row = DB::selectOne(
                        "SELECT IS_USED_LOCK('lescanetons_migrate') = CONNECTION_ID() AS mine"
                    );

                    file_put_contents(
                        {$markerLiteral},
                        (\$row !== null && (string) \$row->mine === '1') ? 'held-by-me' : 'not-held-by-me'
                    );
                }

                public function down(): void {}
            };
            PHP);
    }

    /** A migration that throws before touching anything, to exercise the failure path. */
    private function writeFailingProbeMigration(): string
    {
        return $this->writeMigration('2099_01_01_000001_auto_migrate_probe_explodes', <<<'PHP'
            <?php

            use Illuminate\Database\Migrations\Migration;

            return new class extends Migration
            {
                public function up(): void
                {
                    throw new RuntimeException('auto-migrate probe exploded');
                }

                public function down(): void {}
            };
            PHP);
    }

    private function writeMigration(string $name, string $body): string
    {
        File::put($this->probePath.'/'.$name.'.php', $body."\n");
        $this->app->make('migrator')->path($this->probePath);

        return $name;
    }
}
