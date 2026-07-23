<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchemaTimestampsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_events_table_has_timestamps(): void
    {
        $this->assertTrue(Schema::hasTable('events'));
        $this->assertTrue(Schema::hasColumns('events', [
            'id', 'date', 'title', 'start_time', 'end_time',
            'location', 'attire', 'weekend', 'created_at', 'updated_at',
        ]));
    }

    public function test_responses_table_has_timestamps(): void
    {
        $this->assertTrue(Schema::hasTable('responses'));
        $this->assertTrue(Schema::hasColumns('responses', [
            'id', 'user_id', 'event_id', 'answer', 'created_at', 'updated_at',
        ]));
    }
}
