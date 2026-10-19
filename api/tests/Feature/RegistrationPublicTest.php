<?php

namespace Tests\Feature;

use App\Http\Middleware\PublicWriteGuard;
use App\Mail\RegistrationConfirmation;
use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Support\FormToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The public half of registration: the form's data, and booking a place.
 * Anonymous throughout: the people booking are not band members.
 */
class RegistrationPublicTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private RegistrationOption $meat;

    private RegistrationOption $child;

    protected function setUp(): void
    {
        parent::setUp();
        $this->event = Event::factory()->takingRegistrations()->create(['title' => 'Souper de soutien']);
        $this->meat = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $this->child = RegistrationOption::factory()->labelled('Menu enfant', 2000)
            ->create(['event_id' => $this->event->id, 'sort_order' => 1]);
    }

    /** Headers whose token is old enough to pass the timing check; see TestCase. */
    private function headers(): array
    {
        return $this->publicWriteHeaders();
    }

    private function agedToken(int $ageSeconds = 30): string
    {
        return $this->publicWriteHeaders($ageSeconds)[PublicWriteGuard::TOKEN_HEADER];
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge($this->publicWriteBody([
            'firstName' => 'Delphine',
            'lastName' => 'Maillard',
            'email' => 'delphine@example.test',
            'phone' => '079 322 12 57',
            'address' => null,
            'tableName' => null,
            'choices' => [
                ['optionId' => $this->meat->id, 'quantity' => 2],
            ],
        ]), $overrides);
    }

    private function url(?Event $event = null): string
    {
        return '/api/v1/events/'.($event ?? $this->event)->id.'/registrations';
    }

    // ------------------------------------------------------------ the form

    public function test_anybody_may_read_the_form_without_logging_in(): void
    {
        $this->getJson("/api/v1/events/{$this->event->id}/registration")
            ->assertOk()
            ->assertJsonPath('event.title', 'Souper de soutien')
            ->assertJsonPath('open', true)
            ->assertJsonPath('options.0.label', 'Menu viande')
            ->assertJsonPath('options.0.priceCents', 4500)
            ->assertJsonPath('options.1.label', 'Menu enfant');
    }

    public function test_the_form_never_leaks_the_bands_internal_notes(): void
    {
        // Reachable without a session, so it carries only the facts a
        // stranger needs to recognise the event.
        $this->event->update(['notes' => 'Rappeler à Marc d’apporter la caisse.']);

        $body = $this->getJson("/api/v1/events/{$this->event->id}/registration")->assertOk()->json();

        $this->assertStringNotContainsString('caisse', json_encode($body));
        $this->assertArrayNotHasKey('notes', $body['event']);
        $this->assertArrayNotHasKey('isPublic', $body['event']);
    }

    public function test_an_event_taking_no_registrations_is_a_404_not_a_403(): void
    {
        // A stranger must not learn that an event exists but is not taking
        // bookings: that is the band's private planning.
        $private = Event::factory()->create();

        $this->getJson("/api/v1/events/{$private->id}/registration")->assertStatus(404);
    }

    public function test_a_closed_form_still_answers_so_it_can_say_so(): void
    {
        $closed = Event::factory()->registrationClosed()->create();

        $this->getJson("/api/v1/events/{$closed->id}/registration")
            ->assertOk()
            ->assertJsonPath('open', false);
    }

    // --------------------------------------------------------- the booking

    public function test_a_stranger_books_a_place(): void
    {
        Mail::fake();

        $this->postJson($this->url(), $this->payload(), $this->headers())
            ->assertStatus(201)
            ->assertJsonPath('firstName', 'Delphine')
            ->assertJsonPath('guestCount', 2)
            ->assertJsonPath('totalCents', 9000);

        $booking = Registration::query()->sole();
        $this->assertSame('delphine@example.test', $booking->email);
        $this->assertSame($this->event->id, $booking->event_id);
        $this->assertSame(1, $booking->choices()->count());
    }

    public function test_a_booking_may_mix_options(): void
    {
        Mail::fake();

        $this->postJson($this->url(), $this->payload([
            'choices' => [
                ['optionId' => $this->meat->id, 'quantity' => 3],
                ['optionId' => $this->child->id, 'quantity' => 1],
            ],
        ]), $this->headers())
            ->assertStatus(201)
            ->assertJsonPath('guestCount', 4)
            ->assertJsonPath('totalCents', 15_500);
    }

    public function test_it_confirms_by_email(): void
    {
        Mail::fake();

        $this->postJson($this->url(), $this->payload(), $this->headers())->assertStatus(201);

        Mail::assertSent(
            RegistrationConfirmation::class,
            fn (RegistrationConfirmation $mail) => $mail->hasTo('delphine@example.test')
        );
    }

    public function test_the_confirmation_puts_each_detail_on_its_own_line(): void
    {
        // Rendered for real, because Mail::fake() never renders the view.
        //
        // Markdown reads a bare newline as a space. Written as consecutive
        // lines, the bold labels come out as one wrapped paragraph in the HTML
        // part, which is what a mail client shows. The plain-text part keeps
        // the break, so reading the source or the text alternative hides it.
        $option = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $registration = Registration::factory()
            ->withChoice($option)
            ->create(['event_id' => $this->event->id, 'table_name' => 'Table des Canetons']);

        $rendered = (new RegistrationConfirmation($registration->fresh(), $this->event))->render();

        foreach (self::blockTexts($rendered) as $block) {
            $found = array_filter(
                ['Quand :', 'Où :', 'Total :', 'Table :'],
                fn (string $label) => str_contains($block, $label),
            );

            $this->assertLessThan(2, count($found), 'Two labels share one rendered block: '.$block);
        }

        // The sign-off is two lines in the source and has to be two on screen.
        $this->assertNotContains(
            'Merci et à bientôt, Les Canetons de Fribourg',
            self::blockTexts($rendered),
        );
    }

    /**
     * The rendered HTML as the blocks a reader sees, one per entry.
     *
     * A newline in the source is not a break on screen. HTML collapses it to a
     * space, so it is flattened before the block tags become breaks. Splitting
     * on it would report a run-on paragraph as two tidy blocks.
     *
     * @return list<string>
     */
    private static function blockTexts(string $html): array
    {
        $flattened = preg_replace('/\s+/', ' ', $html) ?? $html;
        $broken = preg_replace('#</(p|h[1-6]|td|th|tr|div|li)>|<br\s*/?>#i', "\n", $flattened) ?? $flattened;

        return array_values(array_filter(
            array_map(
                fn (string $block) => trim(html_entity_decode(strip_tags($block))),
                explode("\n", $broken),
            ),
            fn (string $block) => $block !== '',
        ));
    }

    public function test_a_failing_mail_server_does_not_lose_the_booking(): void
    {
        // Best-effort on purpose (ADR 0009). The row is already committed and
        // this host has no queue to retry from; an SMTP blip must not lose a
        // registration.
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));

        $this->postJson($this->url(), $this->payload(), $this->headers())->assertStatus(201);

        $this->assertSame(1, Registration::query()->count());
    }

    public function test_a_booking_for_a_closed_form_is_refused(): void
    {
        $closed = Event::factory()->registrationClosed()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $closed->id]);

        $this->postJson($this->url($closed), $this->payload([
            'choices' => [['optionId' => $option->id, 'quantity' => 1]],
        ]), $this->headers())
            ->assertStatus(409)
            ->assertJson(['code' => 'registration_closed']);

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_booking_before_the_form_opens_says_so_differently(): void
    {
        // Two codes, because "come back on the 3rd" and "you have missed it"
        // send the reader somewhere different.
        $early = Event::factory()->registrationNotYetOpen()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $early->id]);

        $this->postJson($this->url($early), $this->payload([
            'choices' => [['optionId' => $option->id, 'quantity' => 1]],
        ]), $this->headers())
            ->assertStatus(409)
            ->assertJson(['code' => 'registration_not_open']);
    }

    public function test_an_event_taking_no_registrations_cannot_be_booked(): void
    {
        $private = Event::factory()->create();

        $this->postJson($this->url($private), $this->payload(), $this->headers())
            ->assertStatus(404);
    }

    public function test_an_option_from_another_event_is_refused(): void
    {
        // The foreign key alone would accept it; the `exists` rule is scoped
        // to this event's options.
        $other = RegistrationOption::factory()->create();

        $this->postJson($this->url(), $this->payload([
            'choices' => [['optionId' => $other->id, 'quantity' => 1]],
        ]), $this->headers())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.optionId');

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_the_per_booking_guest_cap_is_enforced(): void
    {
        $this->event->update(['registration_max_guests' => 4]);

        $this->postJson($this->url(), $this->payload([
            'choices' => [
                ['optionId' => $this->meat->id, 'quantity' => 3],
                ['optionId' => $this->child->id, 'quantity' => 2],
            ],
        ]), $this->headers())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices')
            ->assertJsonPath('errors.0.reason', 'too_many_guests');

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_exactly_the_cap_is_accepted(): void
    {
        // The boundary from the other side: refusing 5 says nothing about
        // whether 4 works.
        Mail::fake();
        $this->event->update(['registration_max_guests' => 4]);

        $this->postJson($this->url(), $this->payload([
            'choices' => [['optionId' => $this->meat->id, 'quantity' => 4]],
        ]), $this->headers())->assertStatus(201);
    }

    public function test_required_details_are_required(): void
    {
        $this->postJson($this->url(), $this->payload(['phone' => '']), $this->headers())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'phone')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_a_booking_with_no_choices_is_refused(): void
    {
        $this->postJson($this->url(), $this->payload(['choices' => []]), $this->headers())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices');

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_bad_choice_writes_nothing_at_all(): void
    {
        // One transaction: a booking whose choices half-landed is a guest
        // the cook cannot count.
        $this->postJson($this->url(), $this->payload([
            'choices' => [
                ['optionId' => $this->meat->id, 'quantity' => 1],
                ['optionId' => 999_999, 'quantity' => 1],
            ],
        ]), $this->headers())->assertStatus(400);

        $this->assertSame(0, Registration::query()->count());
    }

    // ----------------------------------------------------- the write guard

    public function test_a_filled_honeypot_is_refused(): void
    {
        $payload = $this->payload();
        $payload[PublicWriteGuard::HONEYPOT_FIELD] = 'http://spam.example';

        $this->postJson($this->url(), $payload, $this->headers())
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_submission_with_no_token_is_refused(): void
    {
        $this->postJson($this->url(), $this->payload())
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);
    }

    public function test_an_instant_submission_is_refused(): void
    {
        // Nobody reads and fills a form in under two seconds.
        $this->postJson($this->url(), $this->payload(), [
            PublicWriteGuard::TOKEN_HEADER => FormToken::issue(),
        ])
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);
    }

    public function test_a_stale_token_is_refused(): void
    {
        $this->postJson($this->url(), $this->payload(), [
            PublicWriteGuard::TOKEN_HEADER => $this->agedToken(FormToken::MAX_AGE_SECONDS + 60),
        ])->assertStatus(422);
    }

    public function test_a_forged_token_is_refused(): void
    {
        $this->postJson($this->url(), $this->payload(), [
            PublicWriteGuard::TOKEN_HEADER => (time() - 30).'.notasignature',
        ])->assertStatus(422);
    }

    public function test_the_timing_window_is_two_seconds_to_two_hours(): void
    {
        // Pinned to the literals. The other tests derive their fixtures from
        // these constants, so they pin the comparison and not the policy. The
        // lower end must never refuse a real person, and the upper end lets
        // somebody fill a form at their own pace.
        $this->assertSame(2, FormToken::MIN_AGE_SECONDS);
        $this->assertSame(7200, FormToken::MAX_AGE_SECONDS);
    }

    public function test_the_token_endpoint_issues_a_usable_one(): void
    {
        $token = $this->getJson('/api/v1/form-token')->assertOk()->json('token');

        $this->assertIsString($token);
        // Not yet valid: it is brand new.
        $this->assertFalse(FormToken::isValid($token));
    }

    public function test_the_contact_form_is_guarded_too(): void
    {
        // POST /api/v1/contact goes through the same guard. No token and no
        // decoy field: both refuse.
        $this->postJson('/api/v1/contact', [
            'firstName' => 'A',
            'lastName' => 'B',
            'email' => 'a@example.test',
            'subject' => 'Bonjour',
            'message' => 'Coucou',
        ])
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);
    }

    public function test_the_contact_form_still_works_with_a_token(): void
    {
        $this->postJson('/api/v1/contact', $this->publicWriteBody([
            'firstName' => 'A',
            'lastName' => 'B',
            'email' => 'a@example.test',
            'subject' => 'Bonjour',
            'message' => 'Coucou',
        ]), $this->headers())->assertSuccessful();
    }

    public function test_omitting_the_decoy_field_is_refused(): void
    {
        // filled(null) is false, so a guard that only checked whether the
        // decoy had a value would let through a caller that does not send it,
        // which is what a script posting a hand-written body does. The payload
        // is otherwise valid.
        $payload = $this->payload();
        unset($payload[PublicWriteGuard::HONEYPOT_FIELD]);

        $this->postJson($this->url(), $payload, $this->headers())
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_a_blank_app_key_refuses_every_submission(): void
    {
        // Fails closed. PHP hash_hmac accepts an empty key and returns a
        // digest anybody can recompute offline, and api/.env.example ships
        // APP_KEY empty for the operator to fill. Nothing else on this path
        // catches it: an anonymous request carries no Origin, so Sanctum
        // never starts a session and the encrypter is never resolved.
        config(['app.key' => '']);

        $this->postJson($this->url(), $this->payload(), $this->headers())
            ->assertStatus(422)
            ->assertJson(['code' => 'spam_suspected']);
    }
}
