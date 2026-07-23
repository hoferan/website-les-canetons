<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactSignupsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_contact_messages_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('contact_messages'));
        $this->assertTrue(Schema::hasColumns('contact_messages', [
            'id', 'last_name', 'first_name', 'email', 'subject', 'message', 'created_at', 'updated_at',
        ]));
    }

    public function test_signups_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('signups'));
        $this->assertTrue(Schema::hasColumns('signups', [
            'id', 'occasion', 'first_name', 'last_name', 'address', 'phone', 'email',
            'table_name', 'menus', 'created_at', 'updated_at',
        ]));
    }
}
