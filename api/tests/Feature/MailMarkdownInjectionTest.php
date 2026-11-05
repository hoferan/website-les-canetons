<?php

namespace Tests\Feature;

use App\Mail\ContactMessageReceived;
use App\Mail\RegistrationConfirmation;
use App\Models\ContactMessage;
use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\OptionKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What a visitor types into a public form must not turn into a link or an
 * image in the mails the band sends.
 *
 * Both mails are Markdown mails. `{{ }}` escapes HTML but not Markdown, so
 * without secured encoding (AppServiceProvider) a first name of
 * `[Payez ici](https://…)` arrives as a working link, in the band's template,
 * at whatever address the visitor typed into the booking form.
 *
 * Rendered for real, because Mail::fake() never renders the view. Each field
 * gets its own host, so the test also proves every field reaches the mail:
 * the host has to show up as text and never in an href or a src.
 */
class MailMarkdownInjectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_booking_confirmation_turns_no_typed_text_into_a_link_or_an_image(): void
    {
        $event = Event::factory()->takingRegistrations()->create(['title' => 'Souper de soutien']);
        $allergies = RegistrationOption::factory()->kind(OptionKind::Text)
            ->create(['event_id' => $event->id, 'label' => 'Allergies']);

        $registration = Registration::factory()->create([
            'event_id' => $event->id,
            'first_name' => self::injected('first-name'),
            'table_name' => self::injected('table-name'),
        ]);
        RegistrationChoice::create([
            'registration_id' => $registration->id,
            'option_id' => $allergies->id,
            'value' => self::injected('answer'),
        ]);

        $html = (string) (new RegistrationConfirmation($registration->fresh(), $event))->render();

        $this->assertNoInjectedTarget($html, ['first-name', 'table-name', 'answer']);
    }

    public function test_the_contact_notification_turns_no_typed_text_into_a_link_or_an_image(): void
    {
        $message = ContactMessage::create([
            'first_name' => self::injected('first-name'),
            'last_name' => self::injected('last-name'),
            'email' => 'ada@example.com',
            'subject' => self::injected('subject'),
            'message' => self::injected('message'),
        ]);

        $html = (string) (new ContactMessageReceived($message))->render();

        $this->assertNoInjectedTarget($html, ['first-name', 'last-name', 'subject', 'message']);
    }

    public function test_an_ordinary_name_still_reads_as_typed(): void
    {
        // The escaping must not show up as stray backslashes or entities in
        // the text a guest reads.
        $event = Event::factory()->takingRegistrations()->create(['title' => 'Souper de soutien']);
        $registration = Registration::factory()->create([
            'event_id' => $event->id,
            'first_name' => 'Zoé-Lou d’Orsonnens [Jr]',
            'table_name' => 'Table <des> Canetons',
        ]);

        $html = (string) (new RegistrationConfirmation($registration->fresh(), $event))->render();
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5);

        $this->assertStringContainsString('Bonjour Zoé-Lou d’Orsonnens [Jr],', $text);
        $this->assertStringContainsString('Table <des> Canetons', $text);
    }

    /** A link and a remote image, both pointing at a host named after the field. */
    private static function injected(string $field): string
    {
        return "[Payez ici](https://{$field}.evil.example/pay) ![](https://{$field}.evil.example/p.gif)";
    }

    /** @param  list<string>  $fields */
    private function assertNoInjectedTarget(string $html, array $fields): void
    {
        preg_match_all('/\b(?:href|src)\s*=\s*(["\'])(.*?)\1/i', $html, $matches);
        $targets = implode("\n", $matches[2]);

        foreach ($fields as $field) {
            $host = "{$field}.evil.example";

            $this->assertStringContainsString($host, $html, "The {$field} field never reached the mail.");
            $this->assertStringNotContainsString($host, $targets, "The {$field} field became a link or an image.");
        }
    }
}
