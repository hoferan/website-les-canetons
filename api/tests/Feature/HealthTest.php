<?php

namespace Tests\Feature;

use App\Support\Environment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * GET /api/health: whether this server answers, whether its database does,
 * and which deploy it is running.
 *
 * Every request here is a guest's, as a monitor's is: no cookie, no token.
 *
 * The deploy marker is pointed at a file of the test's own, because the real
 * one sits in the document root above `_api/` and exists only on a server.
 */
class HealthTest extends TestCase
{
    use RefreshDatabase;

    private string $marker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->marker = storage_path('framework/testing/deployment.json');
        File::ensureDirectoryExists(dirname($this->marker));
        File::delete($this->marker);
        config(['api.deployment_marker' => $this->marker]);
    }

    protected function tearDown(): void
    {
        File::delete($this->marker);

        parent::tearDown();
    }

    public function test_a_healthy_server_reports_its_deploy_and_its_checks(): void
    {
        File::put($this->marker, json_encode([
            'environment' => 'test',
            'commit' => '34de845aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'shortCommit' => '34de845',
            'ref' => 'main',
            'deployedAt' => '2026-10-16T09:30:00.000Z',
            'runUrl' => 'https://github.com/hoferan/website-les-canetons/actions/runs/1',
        ]));

        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson([
                'status' => 'ok',
                'environment' => Environment::name(),
                'deployment' => [
                    'commit' => '34de845aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    'ref' => 'main',
                    'deployedAt' => '2026-10-16T09:30:00.000Z',
                ],
                'checks' => [
                    'database' => 'ok',
                    'pendingMigrations' => [],
                ],
            ]);
    }

    public function test_a_server_with_no_deploy_marker_still_answers(): void
    {
        // The local stack and a server deployed by hand have none.
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('deployment', null);
    }

    public function test_an_unreadable_marker_is_reported_as_absent(): void
    {
        File::put($this->marker, '{ not json');

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('deployment', null);
    }

    public function test_pending_migrations_are_listed_by_name(): void
    {
        // Only reachable with AUTO_MIGRATE=false, where the server serves on
        // purpose against the schema it has (ADR 0030). Otherwise the
        // migration middleware applies them before this answers, or answers
        // 503 itself.
        config(['app.auto_migrate' => false]);
        DB::table('migrations')
            ->where('migration', '2026_09_07_000001_seed_registers_and_roles')
            ->delete();

        try {
            $this->getJson('/api/health')
                ->assertOk()
                ->assertJsonPath('checks.pendingMigrations', ['2026_09_07_000001_seed_registers_and_roles']);
        } finally {
            DB::table('migrations')->insert([
                'migration' => '2026_09_07_000001_seed_registers_and_roles',
                'batch' => 1,
            ]);
        }
    }

    public function test_an_unreachable_database_answers_503(): void
    {
        // Skipping the migration middleware, which would otherwise be the
        // first thing to meet the dead connection.
        config(['app.auto_migrate' => false]);

        // The real server refuses a wrong password. A copy of the connection is
        // used, so the one RefreshDatabase holds its transaction on is left
        // alone.
        $default = config('database.default');
        config([
            'database.connections.refused' => [
                ...config("database.connections.{$default}"),
                'password' => 'not-the-password',
            ],
            'database.default' => 'refused',
        ]);

        try {
            $response = $this->getJson('/api/health');
        } finally {
            config(['database.default' => $default]);
            DB::purge('refused');
        }

        $response->assertStatus(503)
            ->assertJsonPath('status', 'fail')
            ->assertJsonPath('checks.database', 'fail')
            ->assertJsonPath('checks.pendingMigrations', null);
    }
}
