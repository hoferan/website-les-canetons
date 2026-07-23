<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UsersMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_instruments_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('instruments'));
        $this->assertTrue(Schema::hasColumns('instruments', ['id', 'name', 'created_at', 'updated_at']));
    }

    public function test_users_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('users'));
        $this->assertTrue(Schema::hasColumns('users', [
            'id', 'username', 'password', 'role', 'instrument_id', 'created_at', 'updated_at',
        ]));
    }

    public function test_username_is_unique(): void
    {
        \App\Models\User::create(['username' => 'dup', 'password' => 'x', 'role' => 'user']);

        $this->expectException(\Illuminate\Database\QueryException::class);
        \App\Models\User::create(['username' => 'dup', 'password' => 'y', 'role' => 'user']);
    }
}
