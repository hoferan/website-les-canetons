<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * 2026_07_27_000001_drop_schema_migrations_table, which drops App\Migrator's
 * ledger. (Laravel's own history is the separate `migrations` table.)
 *
 * No test database has a `schema_migrations` table; only servers that ran the
 * numbered-SQL migrator do. Asserting the table is absent after the suite is
 * vacuously true and would pass with an empty migration body. So each test
 * builds the table in its real shape, fills it with the two rows the servers
 * hold, asserts they are there, and only then replays the migration.
 *
 * RefreshDatabase has already applied the migration, so deleting its row from
 * `migrations` makes it pending again, and `artisan migrate` runs the real
 * registered file through the real migrator.
 */
class DropSchemaMigrationsTableTest extends TestCase
{
    use RefreshDatabase;

    /** The App\Migrator ledger the migration drops. */
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
        // cannot undo the table. Drop it by hand and restore the ledger row, or
        // the next test migrates underneath itself.
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

    /** The case that matters on a server: a populated `schema_migrations` is gone afterwards. */
    public function test_it_drops_a_populated_schema_migrations_table(): void
    {
        $this->createOldLedger();

        // Without this precondition the assertion below measures nothing.
        self::assertTrue(Schema::hasTable(self::TABLE), 'The old ledger was not set up; the drop below would prove nothing.');
        self::assertSame(2, DB::table(self::TABLE)->count());

        $this->replayMigration();

        self::assertFalse(Schema::hasTable(self::TABLE), 'The migration left the old ledger in place.');
    }

    /** A fresh install and CI never had the table; the migration must still succeed. */
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
     * down() is deliberately empty: a restored but empty ledger would tell the
     * old migrator that nothing had ever been applied.
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
     * Make the applied migration pending again and run `artisan migrate`.
     * Nothing else is pending under RefreshDatabase, so only this file runs.
     */
    private function replayMigration(): void
    {
        DB::table('migrations')->where('migration', self::MIGRATION)->delete();

        self::assertSame(0, Artisan::call('migrate', ['--force' => true]), Artisan::output());
    }
}
