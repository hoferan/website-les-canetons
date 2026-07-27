<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const VALID = [
        'lastName' => 'Lovelace',
        'firstName' => 'Ada',
        'email' => 'ada@example.com',
        'subject' => 'Bonjour',
        'message' => 'Un message.',
    ];

    public function test_it_stores_a_message(): void
    {
        $this->postJson('/api/contact', self::VALID)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('contact_messages', [
            'last_name' => 'Lovelace',
            'first_name' => 'Ada',
            'email' => 'ada@example.com',
            'subject' => 'Bonjour',
            'message' => 'Un message.',
        ]);
    }

    public function test_it_reports_missing_fields_with_camelcase_names(): void
    {
        $response = $this->postJson('/api/contact', []);

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');

        // These names must match i18n.js's fields.* keys exactly.
        $fields = array_column($response->json('fields'), 'field');
        $this->assertSame(['lastName', 'firstName', 'email', 'subject', 'message'], $fields);
    }

    public function test_it_rejects_a_malformed_email(): void
    {
        $response = $this->postJson('/api/contact', ['email' => 'not-an-email'] + self::VALID);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'email',
            'reason' => 'invalid_format',
        ]);
    }

    public function test_it_stores_raw_input_without_escaping(): void
    {
        // Escaping happens at output time, not storage time.
        $this->postJson('/api/contact', ['message' => '<b>hi</b>'] + self::VALID)->assertOk();

        $this->assertSame('<b>hi</b>', ContactMessage::latest('id')->first()->message);
    }

    public function test_it_rejects_a_get(): void
    {
        $this->getJson('/api/contact')->assertStatus(405);
    }
}
