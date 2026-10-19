<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * POST /api/migrate is gated by a shared secret in the X-Migrate-Token request
 * header, never a body or query parameter (MigrateController says why). The
 * tests pin both halves: the header works, and the two parameter spellings do
 * not.
 *
 * They also pin the response contract, which tools/dbmigrate.mjs owns: it reads
 * `status`, `applied[]` and `pending[]` and appends `?mode=dry-run|apply`. The
 * shape is asserted key by key, and `mode=dry-run` is asserted to leave the
 * schema and the `migrations` table untouched by looking at both.
 *
 * With every real migration already applied, "dry-run changed nothing" would be
 * vacuously true, so a throwaway probe migration gives the endpoint something
 * pending to report or (wrongly) apply.
 */
class MigrateTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'test-token-123';

    /** Table the probe migration creates; also the marker we look for. */
    private const PROBE_TABLE = 'migrate_probe';

    /** Directory registered as an extra migration path, per test. */
    private string $probePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->probePath = storage_path('framework/testing/migrate-probe');
        File::deleteDirectory($this->probePath);
        File::ensureDirectoryExists($this->probePath);
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot undo an applied probe. Undo it by hand.
        Schema::dropIfExists(self::PROBE_TABLE);
        DB::table('migrations')->where('migration', 'like', '2099_%_probe%')->delete();
        File::deleteDirectory($this->probePath);

        parent::tearDown();
    }

    // ------------------------------------------------------------ the token gate

    public function test_migrate_requires_a_valid_token(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', [], ['X-Migrate-Token' => 'wrong-token']);

        $response->assertStatus(403);
    }

    public function test_migrate_requires_a_token_at_all(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', []);

        $response->assertStatus(403);
    }

    /**
     * An unconfigured MIGRATE_TOKEN must refuse everything. Without the
     * empty-token guard, hash_equals('', '') would open the endpoint on a
     * server whose configuration is missing the key.
     */
    public function test_migrate_refuses_when_no_token_is_configured(): void
    {
        config(['app.migrate_token' => null]);

        $this->postJson('/api/migrate', [], ['X-Migrate-Token' => ''])->assertStatus(403);
        $this->postJson('/api/migrate', [], ['X-Migrate-Token' => 'anything'])->assertStatus(403);
    }

    /**
     * The gate is checked before `mode` is read, so no value of it, `mode=apply`
     * included, gets past.
     */
    public function test_the_token_gate_applies_in_every_mode(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $this->writeProbeMigration();

        foreach (['', '?mode=dry-run', '?mode=apply', '?mode=nonsense'] as $query) {
            $this->postJson('/api/migrate'.$query, [], ['X-Migrate-Token' => 'wrong-token'])
                ->assertStatus(403);
        }

        // Nothing ran behind any of them.
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE));
    }

    /**
     * A secret in the query string is written to Apache's access log, so
     * ?token=… must not work even with the correct secret.
     */
    public function test_migrate_rejects_a_token_passed_as_a_query_parameter(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate?token='.self::TOKEN);

        $response->assertStatus(403);
    }

    /** Only the header spelling may work. */
    public function test_migrate_rejects_a_token_passed_as_a_body_parameter(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', ['token' => self::TOKEN]);

        $response->assertStatus(403);
    }

    // ------------------------------------------------------- the response shape

    public function test_migrate_accepts_the_token_in_a_header(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()
            ->assertJsonStructure(['status', 'ok', 'mode', 'environment', 'applied', 'pending', 'output'])
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('ok', true);

        self::assertIsArray($response->json('applied'));
        self::assertIsArray($response->json('pending'));
    }

    // ------------------------------------------------------------ mode=dry-run

    /**
     * `npm run dbmigrate:<env> -- --dry-run` is what an operator runs to see
     * what would change without changing it.
     *
     * The test checks that the schema and the ledger are what they were, which
     * a dry-run flag that quietly stops working would fail.
     */
    public function test_dry_run_reports_pending_and_applies_nothing(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $name = $this->writeProbeMigration();

        $rowsBefore = DB::table('migrations')->count();

        $response = $this->postJson('/api/migrate?mode=dry-run', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('mode', 'dry-run')
            ->assertJsonPath('applied', []);

        self::assertContains($name, $response->json('pending'), 'dry-run must report the pending migration by name.');

        self::assertFalse(
            Schema::hasTable(self::PROBE_TABLE),
            'dry-run created the probe table — it applied the migration for real.'
        );
        self::assertSame(
            $rowsBefore,
            DB::table('migrations')->count(),
            'dry-run changed the migrations ledger.'
        );
        self::assertSame(
            0,
            DB::table('migrations')->where('migration', $name)->count(),
            'dry-run recorded the migration as run.'
        );
    }

    /**
     * A missing `mode` means dry-run, the safe default: a hand-rolled curl, a
     * health probe or a misconfigured caller arrives without a query string.
     */
    public function test_a_missing_mode_defaults_to_dry_run(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $name = $this->writeProbeMigration();

        $response = $this->postJson('/api/migrate', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()->assertJsonPath('mode', 'dry-run');

        self::assertContains($name, $response->json('pending'));
        self::assertFalse(Schema::hasTable(self::PROBE_TABLE));
    }

    /** An unrecognised mode falls back to the safe one rather than to apply. */
    public function test_an_unknown_mode_defaults_to_dry_run(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $this->writeProbeMigration();

        $this->postJson('/api/migrate?mode=nonsense', [], ['X-Migrate-Token' => self::TOKEN])
            ->assertOk()
            ->assertJsonPath('mode', 'dry-run');

        self::assertFalse(Schema::hasTable(self::PROBE_TABLE));
    }

    // -------------------------------------------------------------- mode=apply

    public function test_apply_runs_the_migrations_and_reports_them_as_applied(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $name = $this->writeProbeMigration();

        $response = $this->postJson('/api/migrate?mode=apply', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'apply');

        self::assertContains($name, $response->json('applied'), 'apply must report what it ran, by name.');
        self::assertNotContains($name, $response->json('pending'), 'an applied migration is no longer pending.');

        self::assertTrue(Schema::hasTable(self::PROBE_TABLE), 'apply did not actually run the migration.');
        self::assertSame(1, DB::table('migrations')->where('migration', $name)->count());
    }

    /**
     * Apply with nothing outstanding is the normal post-deploy case: it
     * succeeds with an empty applied[] and re-runs nothing.
     */
    public function test_apply_with_nothing_pending_succeeds_with_an_empty_applied_list(): void
    {
        config(['app.migrate_token' => self::TOKEN]);

        $response = $this->postJson('/api/migrate?mode=apply', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('applied', [])
            ->assertJsonPath('pending', []);
    }

    // ------------------------------------------------------------- the failure

    /**
     * tools/dbmigrate.mjs exits non-zero on a non-2xx or on a status other
     * than 'ok', and that exit code gates the CI deploy step. Both signals are
     * pinned, since the caller treats either as failure.
     */
    public function test_a_failing_migration_is_reported_as_a_failure(): void
    {
        config(['app.migrate_token' => self::TOKEN]);
        $this->writeFailingProbeMigration();

        $response = $this->postJson('/api/migrate?mode=apply', [], ['X-Migrate-Token' => self::TOKEN]);

        $response->assertStatus(500)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('ok', false)
            ->assertJsonPath('mode', 'apply');

        self::assertStringContainsString('probe migration exploded', (string) $response->json('error'));
    }

    // ----------------------------------------------------------- probe plumbing

    /**
     * Writes a throwaway migration into a directory registered on the migrator,
     * which is how `artisan migrate` discovers extra paths
     * (BaseCommand::getMigrationPaths() merges Migrator::paths() with
     * database/migrations), so the endpoint sees it like a real one. The 2099_
     * prefix sorts it after every real migration.
     *
     * @return string the migration name, as the migrations table records it
     */
    private function writeProbeMigration(): string
    {
        return $this->writeMigration('2099_01_01_000000_create_migrate_probe_table', <<<'PHP'
            <?php

            use Illuminate\Database\Migrations\Migration;
            use Illuminate\Database\Schema\Blueprint;
            use Illuminate\Support\Facades\Schema;

            return new class extends Migration
            {
                public function up(): void
                {
                    Schema::create('migrate_probe', function (Blueprint $table) {
                        $table->id();
                    });
                }

                public function down(): void
                {
                    Schema::dropIfExists('migrate_probe');
                }
            };
            PHP);
    }

    /** A migration that throws before touching anything, to exercise the error path. */
    private function writeFailingProbeMigration(): string
    {
        return $this->writeMigration('2099_01_01_000001_failing_probe_migration', <<<'PHP'
            <?php

            use Illuminate\Database\Migrations\Migration;

            return new class extends Migration
            {
                public function up(): void
                {
                    throw new RuntimeException('probe migration exploded');
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
