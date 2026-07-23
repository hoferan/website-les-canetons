<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UsedChallengesMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_table_has_an_id_primary_key(): void
    {
        $this->assertTrue(Schema::hasTable('used_challenges'));
        $this->assertTrue(Schema::hasColumns('used_challenges', ['id', 'signature', 'created_at', 'updated_at']));
    }

    public function test_signature_is_unique(): void
    {
        DB::table('used_challenges')->insert(['signature' => str_repeat('a', 64)]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('used_challenges')->insert(['signature' => str_repeat('a', 64)]);
    }

    public function test_id_auto_increments(): void
    {
        $firstId = DB::table('used_challenges')->insertGetId(['signature' => str_repeat('b', 64)]);
        $secondId = DB::table('used_challenges')->insertGetId(['signature' => str_repeat('c', 64)]);

        $this->assertGreaterThan($firstId, $secondId);
    }
}
