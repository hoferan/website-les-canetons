<?php

namespace Tests\Feature;

use App\Mail\ContactMessageReceived;
use App\Models\ContactMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
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
        $fields = array_column($response->json('errors'), 'field');
        $this->assertSame(['lastName', 'firstName', 'email', 'subject', 'message'], $fields);
    }

    public function test_it_rejects_a_malformed_email(): void
    {
        $response = $this->postJson('/api/v1/contact', $this->publicWriteBody(['email' => 'not-an-email'] + self::VALID), $this->publicWriteHeaders());

        $response->assertStatus(400)->assertJsonPath('errors.0', [
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

    // ------------------------------------------- telling the committee

    public function test_it_mails_the_committee(): void
    {
        Mail::fake();
        config(['mail.from.address' => 'comite@example.com']);

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::VALID), $this->publicWriteHeaders())->assertOk();

        Mail::assertSent(
            ContactMessageReceived::class,
            fn (ContactMessageReceived $mail) => $mail->hasTo('comite@example.com')
                && $mail->hasReplyTo('ada@example.com')
        );
    }

    public function test_a_failing_mail_server_does_not_lose_the_message(): void
    {
        // BEST-EFFORT ON PURPOSE, as the booking confirmation is (G5). The
        // row is already committed and the committee can read it in their
        // inbox; an SMTP blip must not show a visitor an error for something
        // that worked.
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::VALID), $this->publicWriteHeaders())
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('contact_messages', ['email' => 'ada@example.com']);
    }

    public function test_the_notification_renders_what_the_committee_needs(): void
    {
        // Rendered for real, because Mail::fake() never renders the view and
        // ContactController swallows what the send throws. A template that
        // only breaks in production would pass every other test here and
        // then send nothing, silently, on the server.
        $message = ContactMessage::create([
            'last_name' => 'Lovelace',
            'first_name' => 'Ada',
            'email' => 'ada@example.com',
            'subject' => 'Bonjour',
            'message' => 'Un message.',
        ]);

        $rendered = (new ContactMessageReceived($message))->render();

        $this->assertStringContainsString('Ada', $rendered);
        $this->assertStringContainsString('Lovelace', $rendered);
        $this->assertStringContainsString('ada@example.com', $rendered);
        $this->assertStringContainsString('Un message.', $rendered);
    }

    public function test_it_rejects_a_get(): void
    {
        $this->getJson('/api/v1/contact')->assertStatus(405);
    }
}
