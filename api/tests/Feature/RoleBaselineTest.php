<?php

namespace Tests\Feature;

use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RoleBaselineTest extends TestCase
{
    use RefreshDatabase;

    public function test_roles_carry_a_baseline_marker_that_defaults_to_false(): void
    {
        $this->assertTrue(Schema::hasColumn('roles', 'is_baseline'));
        $this->assertFalse(Role::factory()->create()->fresh()->is_baseline);
    }

    public function test_the_marker_migration_is_safe_to_run_twice(): void
    {
        $migration = require database_path('migrations/2026_09_29_000001_add_is_baseline_to_roles.php');

        $migration->up();
        $migration->up();

        $this->assertTrue(Schema::hasColumn('roles', 'is_baseline'));
    }

    public function test_exactly_one_role_is_the_baseline(): void
    {
        $this->assertTrue(Role::baseline()->is_baseline);
        $this->assertSame(1, Role::where('is_baseline', true)->count());
    }
}
