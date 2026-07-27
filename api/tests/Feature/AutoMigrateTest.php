<?php

namespace Tests\Feature;

use App\Http\Middleware\RunPendingMigrations;
use Illuminate\Database\Connection;
use Illuminate\Database\Events\MigrationsStarted;
use Illuminate\Database\Events\NoPendingMigrations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * App\Http\Middleware\RunPendingMigrations — the self-healing schema.
 *
 * WHAT IS ACTUALLY BEING PROTECTED. The deploy host firewalls the GitHub
 * runner's IP: CI can FTP a deploy up but cannot call POST /api/migrate
 * afterwards. This middleware is therefore the ONLY migration trigger a
 * deployed server has, and every property below is one an operator would
 * otherwise have to discover from a broken TEST site.
 *
 * The probe-migration plumbing is lifted from MigrateTest, for the same reason
 * that file has it: with every real migration already applied by
 * RefreshDatabase, "nothing pending" is the only state a test can reach on its
 * own, and half these assertions would be vacuous. Registering a throwaway
 * migration path gives the middleware something genuinely pending to act on.
 *
 * AUTO_MIGRATE is pinned false in phpunit.xml, so each test that wants the
 * middleware live turns it on with config([...]) — the same pattern
 * SouperSignupFlagTest uses for its flag.
 *
 * ---------------------------------------------------- what is NOT tested here
 *
 * The concurrency property — "two PHP-FPM workers that find the same pending
 * migration apply it exactly once" — is not directly testable in PHPUnit.
 * Reaching it needs two processes racing into the same middleware, and this
 * suite is a single process making a synchronous request. What IS asserted, as
 * the closest observable proxies:
 *
 *   - the advisory lock is genuinely HELD by the migrating connection while a
 *     migration runs (test_the_lock_is_held_by_the_migrating_connection),
 *   - it is RELEASED afterwards, on both the success and the failure path
 *     (test_the_lock_is_released_after_a_successful_migration,
 *      test_the_lock_is_released_after_a_failed_migration),
 *   - a request that cannot get the lock is REFUSED rather than served
 *     (test_an_unavailable_lock_is_a_503) — a real second connection holds it,
 *     which is exactly what the losing worker in a race sees.
 *
 * What remains unproven by this file is the re-check under the lock: that the
 * worker which waited and then won the lock notices the winner already did the
 * work and skips it. It is a two-process property. Its failure mode is benign
 * (`artisan migrate` with nothing pending is a no-op that reports success), so
 * the cost of the gap is wasted work on a burst of concurrent first requests,
 * not a double-applied migration — MySQL's advisory lock is what rules that
 * out, and that is what the four tests above pin.
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

        // The precise signal for "a migration run was attempted". Asserting on
        // the schema alone cannot tell "the middleware ran `migrate` and it had
        // nothing to do" apart from "the middleware never ran `migrate`", and
        // the difference between those two is the entire hot path.
        //
        // BOTH events, which is the load-bearing part: Migrator::runPending()
        // fires MigrationsStarted only when it has something to run and
        // NoPendingMigrations otherwise, so listening to the first alone would
        // score a wasteful `migrate` call on every request as a clean hot path
        // — passing the one test it exists to fail.
        $this->migrationRuns = 0;
        $count = function (): void {
            $this->migrationRuns++;
        };
        Event::listen(MigrationsStarted::class, $count);
        Event::listen(NoPendingMigrations::class, $count);

        // A route with no auth, no capability and no feature gate, so a failure
        // here is unambiguously the middleware's. It is registered into the
        // `api` group, which is what carries RunPendingMigrations.
        Route::middleware('api')->get('/api/auto-migrate-probe', fn () => response()->json(['ok' => true]));
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot undo an applied probe. Undo it by hand, or the leftovers
        // outlive this test.
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
     * The case that is true on essentially every request ever served. It must
     * cost a pending-check and nothing else — no `migrate` run, no lock.
     */
    public function test_nothing_pending_means_no_migration_is_attempted(): void
    {
        config(['app.auto_migrate' => true]);

        $ledgerBefore = DB::table('migrations')->count();

        $this->getJson('/api/auto-migrate-probe')
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

        $this->getJson('/api/auto-migrate-probe')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(1, $this->migrationRuns);
        self::assertTrue(Schema::hasTable(self::PROBE_TABLE), 'The pending migration was not applied.');
        self::assertSame(1, DB::table('migrations')->where('migration', $name)->count());
    }

    /**
     * The deploy-shaped sequence, and the one that decides whether this is
     * affordable: repair on the first request, then nothing at all on the
     * second. A middleware that re-ran `migrate` every time would still pass the
     * test above.
     */
    public function test_the_next_request_does_no_work_at_all(): void
    {
        config(['app.auto_migrate' => true]);
        $this->writeProbeMigration();

        $this->getJson('/api/auto-migrate-probe')->assertOk();
        self::assertSame(1, $this->migrationRuns);

        $this->getJson('/api/auto-migrate-probe')->assertOk();

        self::assertSame(1, $this->migrationRuns, 'The second request re-ran `migrate` with nothing pending.');
        self::assertTrue($this->lockIsFree());
    }

    // ---------------------------------------------------------------- the toggle

    /**
     * AUTO_MIGRATE=false is a deliberate maintenance stance, so it must be
     * total: the request is served, and the pending migration is left exactly
     * where it was.
     */
    public function test_the_toggle_off_leaves_a_pending_migration_alone(): void
    {
        config(['app.auto_migrate' => false]);
        $name = $this->writeProbeMigration();

        $this->getJson('/api/auto-migrate-probe')
            ->assertOk()
            ->assertJsonPath('ok', true);

        self::assertSame(0, $this->migrationRuns);
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE), 'The toggle was off and the migration ran anyway.');
        self::assertSame(0, DB::table('migrations')->where('migration', $name)->count());
    }

    /**
     * The default is what a server that never got an AUTO_MIGRATE line gets, and
     * getting it backwards is the exact bug being fixed — a silently-disabled
     * server looks fine until the API is broken. Read from config/app.php's own
     * expression rather than trusting the .env of whatever is running the suite.
     */
    public function test_the_default_is_on_when_the_key_is_absent(): void
    {
        // Reads config/app.php with AUTO_MIGRATE genuinely absent from the
        // environment, which is what a server whose .env predates this key
        // actually has. It cannot just require the file as-is: phpunit.xml pins
        // AUTO_MIGRATE=false for the suite, so env() would answer that and the
        // assertion would be about the pin rather than the default.
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
     * The state of EVERY server the first time this ships: the `migrations`
     * table does not exist, so the repository cannot be read. That must report
     * "everything is pending", not throw SQLSTATE 42S02 — otherwise the one
     * moment the middleware exists for is the one moment it 500s.
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
        // MariaDB, so RefreshDatabase's transaction cannot put it back, and
        // re-deriving it with `artisan migrate` is not an option either: with
        // the ledger gone every migration looks pending and the framework's own
        // (unguarded) create_cache_table would fail against tables that already
        // exist. Restoring the exact rows is the only faithful undo.
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
     * The lock must be held by the connection that is doing the migrating —
     * MariaDB's IS_USED_LOCK returns the id of the holding session, so
     * comparing it to CONNECTION_ID() inside the migration proves both that a
     * lock was taken and that it was taken on the write connection the
     * migration itself runs through. A GET_LOCK on some other connection would
     * guard nothing and would pass a mere "is the lock held" check.
     */
    public function test_the_lock_is_held_by_the_migrating_connection(): void
    {
        config(['app.auto_migrate' => true]);
        $marker = $this->probePath.'/holder.txt';
        $this->writeLockObservingProbeMigration($marker);

        $this->getJson('/api/auto-migrate-probe')->assertOk();

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

        $this->getJson('/api/auto-migrate-probe')->assertOk();

        self::assertTrue($this->lockIsFree(), 'The migration lock was left held after a successful run.');
    }

    /**
     * The release lives in a finally{}, and this is what says so. A lock stranded
     * by a failing migration would be released only when that FPM worker's
     * connection closed — meanwhile every other worker would wait out the full
     * timeout and 503, turning one broken migration into a site-wide stall.
     */
    public function test_the_lock_is_released_after_a_failed_migration(): void
    {
        config(['app.auto_migrate' => true]);
        $this->writeFailingProbeMigration();

        $this->getJson('/api/auto-migrate-probe')->assertStatus(503);

        self::assertTrue($this->lockIsFree(), 'The migration lock was left held after a failed run.');
    }

    /**
     * What the losing worker in a real race sees. A second, genuinely separate
     * connection holds the lock, so GET_LOCK cannot succeed — and the request
     * must be refused rather than served against a schema nobody has confirmed.
     *
     * The middleware is swapped for a subclass with a 0-second lock wait; at the
     * real 30s this test would spend half a minute proving the same thing.
     */
    public function test_an_unavailable_lock_is_a_503(): void
    {
        config(['app.auto_migrate' => true]);
        $this->useZeroWaitLock();
        $name = $this->writeProbeMigration();

        self::assertTrue($this->grabLockOnAnotherConnection(), 'Fixture check: the other connection must get the lock.');

        $this->getJson('/api/auto-migrate-probe')
            ->assertStatus(503)
            ->assertJsonPath('code', 'service_unavailable');

        self::assertSame(0, $this->migrationRuns, 'The middleware migrated without holding the lock.');
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE));
        self::assertSame(0, DB::table('migrations')->where('migration', $name)->count());
    }

    // ------------------------------------------------------------- the failure

    /**
     * A failed migration must fail the REQUEST. Serving a 200 against a
     * half-applied schema is the failure mode that costs the most to find,
     * because it produces wrong answers rather than errors.
     *
     * The body is asserted too, not just the status: /api/* answers in the
     * project's {error, code, fields[]} contract and app/assets/js/i18n.js is
     * what turns `code` into French. A 503 carrying Laravel's native
     * {message, exception} shape would reach the visitor as the generic
     * "Une erreur est survenue".
     */
    public function test_a_failing_migration_surfaces_as_a_503_in_the_error_contract(): void
    {
        config(['app.auto_migrate' => true]);
        $name = $this->writeFailingProbeMigration();

        $response = $this->getJson('/api/auto-migrate-probe');

        $response->assertStatus(503)
            ->assertJsonPath('code', 'service_unavailable')
            ->assertJsonPath('error', 'Service unavailable')
            ->assertJsonMissingPath('message');

        self::assertSame(
            0,
            DB::table('migrations')->where('migration', $name)->count(),
            'A migration that threw must not be recorded as run.'
        );
    }

    // ------------------------------------------------------------ the placement

    /**
     * RunPendingMigrations must be the FIRST middleware on the `api` group.
     *
     * Not tidiness. SESSION_DRIVER=database and CACHE_STORE=database mean
     * StartSession and the cache both read tables that a migration creates, and
     * Sanctum's EnsureFrontendRequestsAreStateful pulls the session middleware
     * in. On a never-migrated server, anything ahead of this would 500 before
     * the thing that would have created its table ever ran. bootstrap/app.php
     * gets that ordering from calling prependToGroup() AFTER statefulApi(),
     * which is not self-evident from reading it — hence this test.
     */
    public function test_the_middleware_runs_before_everything_else_on_the_api_group(): void
    {
        $group = app('router')->getMiddlewareGroups()['api'] ?? [];

        self::assertNotEmpty($group, 'The `api` middleware group is empty; this assertion reads nothing.');
        self::assertSame(
            RunPendingMigrations::class,
            $group[0],
            "RunPendingMigrations is no longer first on the `api` group. Anything ahead of it runs\n"
            .'against a schema that may not exist yet. Order comes from prependToGroup() being '
            ."called AFTER statefulApi() in bootstrap/app.php.\nGroup is now: "
            .implode(', ', array_map('strval', $group))
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
     * SESSION, so asking the default connection whether the lock is free would
     * be asking the connection that might be holding it — which answers "free"
     * for its own lock in some cases and, worse, could take the lock itself.
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
     * Write a throwaway migration into a directory registered on the migrator,
     * which is how `artisan migrate` discovers extra paths
     * (BaseCommand::getMigrationPaths() merges Migrator::paths() with
     * database/migrations) — so the middleware sees it exactly as it sees a real
     * one. The 2099_ prefix sorts it last, after every real migration.
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
