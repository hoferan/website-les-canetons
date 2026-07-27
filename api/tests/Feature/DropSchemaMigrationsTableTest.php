<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * 2026_07_27_000001_drop_schema_migrations_table — retiring App\Migrator's old
 * ledger. (Not Laravel's history; that is the separate `migrations` table.)
 *
 * THE TRAP THIS FILE EXISTS TO AVOID. No test database has ever had a
 * `schema_migrations` table: only servers that ran the deleted numbered-SQL
 * migrator do. So "run the suite, assert the table is absent" is vacuously true
 * on every fresh database and would pass just as happily with an EMPTY
 * migration body — proving nothing about the one environment (TEST, then QA and
 * PROD) where this migration actually has work to do.
 *
 * So the drop is proved against a table that genuinely exists: build the old
 * table in its real shape, fill it with the two rows the servers really hold,
 * assert both are there, and only then replay the migration. That assertion
 * fails loudly if the migration body ever stops dropping anything.
 *
 * Replaying is what makes this reachable at all. RefreshDatabase has already
 * applied every real migration by the time a test runs, so the migration under
 * test is spent; deleting its row from the `migrations` ledger makes it pending
 * again and `artisan migrate` then runs the real registered file — not a
 * hand-rolled copy of it — through the real migrator.
 */
class DropSchemaMigrationsTableTest extends TestCase
{
    use RefreshDatabase;

    /** The old App\Migrator ledger, and the whole point of the migration. */
    private const TABLE = 'schema_migrations';

    /** As the `migrations` table records the migration under test. */
    private const MIGRATION = '2026_07_27_000001_drop_schema_migrations_table';

    /** The migration's batch before a test replayed it, so tearDown can put it back. */
    private ?int $originalBatch = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalBatch = DB::table('migrations')
            ->where('migration', self::MIGRATION)
            ->value('batch');
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot undo a table this test created. Undo it by hand, and put the
        // ledger row back exactly as it was, or the next test migrates
        // underneath itself.
        Schema::dropIfExists(self::TABLE);

        if ($this->originalBatch !== null) {
            DB::table('migrations')->where('migration', self::MIGRATION)->delete();
            DB::table('migrations')->insert([
                'migration' => self::MIGRATION,
                'batch' => $this->originalBatch,
            ]);
        }

        parent::tearDown();
    }

    /**
     * The only case that matters in production, and the only one a vacuous test
     * cannot fake: a real, populated `schema_migrations` is gone afterwards.
     */
    public function test_it_drops_a_populated_schema_migrations_table(): void
    {
        $this->createOldLedger();

        // The precondition, asserted rather than assumed — if this ever stops
        // holding, the test below is measuring nothing.
        self::assertTrue(Schema::hasTable(self::TABLE), 'The old ledger was not set up; the drop below would prove nothing.');
        self::assertSame(2, DB::table(self::TABLE)->count());

        $this->replayMigration();

        self::assertFalse(Schema::hasTable(self::TABLE), 'The migration left the old ledger in place.');
    }

    /**
     * What happens on every fresh install and in CI, where the table was never
     * created: the migration must succeed rather than error on a missing table.
     */
    public function test_it_is_a_no_op_when_the_table_was_never_created(): void
    {
        self::assertFalse(Schema::hasTable(self::TABLE));

        $this->replayMigration();

        self::assertFalse(Schema::hasTable(self::TABLE));
    }

    /** A replayed migration must land back in Laravel's own ledger. */
    public function test_the_migration_is_recorded_in_laravels_ledger(): void
    {
        $this->createOldLedger();

        $this->replayMigration();

        self::assertSame(
            1,
            DB::table('migrations')->where('migration', self::MIGRATION)->count(),
            'The migration ran but was not recorded, so it would run again on every request.'
        );
    }

    /**
     * down() is deliberately empty: a restored-but-empty ledger would tell the
     * old migrator that nothing had ever been applied. Pinning it here so that
     * a later "helpful" rollback path cannot be added without this failing.
     */
    public function test_down_deliberately_does_not_restore_the_table(): void
    {
        $migration = require database_path('migrations/'.self::MIGRATION.'.php');

        $migration->down();

        self::assertFalse(Schema::hasTable(self::TABLE), 'down() recreated the old ledger; it must stay irreversible.');
    }

    /** The old table exactly as App\Migrator made it, with the rows the servers hold. */
    private function createOldLedger(): void
    {
        Schema::create(self::TABLE, function (Blueprint $table) {
            $table->string('version', 255)->primary();
            $table->timestamp('applied_at')->useCurrent();
        });

        DB::table(self::TABLE)->insert([
            ['version' => '001_create_signups', 'applied_at' => '2026-01-01 00:00:00'],
            ['version' => '002_create_used_challenges', 'applied_at' => '2026-01-02 00:00:00'],
        ]);
    }

    /**
     * Make the real, already-applied migration pending again and run it through
     * `artisan migrate`. Nothing else is pending under RefreshDatabase, so this
     * runs exactly the one file under test.
     */
    private function replayMigration(): void
    {
        DB::table('migrations')->where('migration', self::MIGRATION)->delete();

        self::assertSame(0, Artisan::call('migrate', ['--force' => true]), Artisan::output());
    }
}
