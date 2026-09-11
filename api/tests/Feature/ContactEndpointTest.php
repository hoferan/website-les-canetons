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
        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::VALID), $this->publicWriteHeaders())
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
        $response = $this->postJson('/api/v1/contact', $this->publicWriteBody(), $this->publicWriteHeaders());

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');

        // These names must match i18n.js's fields.* keys exactly.
        $fields = array_column($response->json('fields'), 'field');
        $this->assertSame(['lastName', 'firstName', 'email', 'subject', 'message'], $fields);
    }

    public function test_it_rejects_a_malformed_email(): void
    {
        $response = $this->postJson('/api/v1/contact', $this->publicWriteBody(['email' => 'not-an-email'] + self::VALID), $this->publicWriteHeaders());

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'email',
            'reason' => 'invalid_format',
        ]);
    }

    public function test_it_stores_raw_input_without_escaping(): void
    {
        // Escaping happens at output time, not storage time.
        $this->postJson('/api/v1/contact', $this->publicWriteBody(['message' => '<b>hi</b>'] + self::VALID), $this->publicWriteHeaders())->assertOk();

        $this->assertSame('<b>hi</b>', ContactMessage::latest('id')->first()->message);
    }

    public function test_it_rejects_a_get(): void
    {
        $this->getJson('/api/v1/contact')->assertStatus(405);
    }
}
