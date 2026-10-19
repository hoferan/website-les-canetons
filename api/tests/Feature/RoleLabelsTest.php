<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A role's names, typed by the committee in the editor (#194, ADR 0026).
 *
 * Both columns are nullable. A seeded role nobody has renamed has neither, and
 * the SPA shows the catalogue's translation of its key, which keeps French and
 * German out of the migrations.
 */
class RoleLabelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_roles_carry_a_french_and_a_german_name(): void
    {
        $this->assertTrue(Schema::hasColumns('roles', ['label_fr', 'label_de']));
    }

    public function test_the_migration_is_safe_to_run_twice(): void
    {
        $migration = require database_path('migrations/2026_10_12_000002_add_labels_to_roles.php');

        $migration->up();
        $migration->up();

        $this->assertTrue(Schema::hasColumns('roles', ['label_fr', 'label_de']));
    }
}
