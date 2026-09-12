<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Event;
use App\Models\RegistrationOption;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The two anonymous POSTs, and the key that makes a retry safe.
 *
 * The failure is real and it is somebody else's money: a guest on a phone at
 * the hall taps Book, the connection stalls, they tap again, and the caterer
 * counts two meals for one person. The same guest sees one confirmation and
 * knows nothing about the second booking until the committee telephones.
 */
class IdempotentWriteTest extends TestCase
{
    use RefreshDatabase;

    private const CONTACT = [
        'lastName' => 'Lovelace',
        'firstName' => 'Ada',
        'email' => 'ada@example.com',
        'subject' => 'Bonjour',
        'message' => 'Un message.',
    ];

    public function test_a_submission_without_a_key_is_refused_and_stores_nothing(): void
    {
        $this->postJson(
            '/api/v1/contact',
            $this->publicWriteBody(self::CONTACT),
            $this->publicWriteHeaders(key: null),
        )
            ->assertStatus(400)
            ->assertJson(['code' => 'idempotency_key_required']);

        $this->assertSame(0, ContactMessage::query()->count());
    }

    public function test_a_key_too_short_to_be_unique_is_refused(): void
    {
        // A caller sending `1` would collide with every other caller sending
        // `1`, and these endpoints are anonymous: the key space is shared by
        // everyone on the internet. Refusing a short one is the only moment we
        // can say so.
        $this->postJson(
            '/api/v1/contact',
            $this->publicWriteBody(self::CONTACT),
            $this->publicWriteHeaders(key: '1'),
        )
            ->assertStatus(400)
            ->assertJson(['code' => 'idempotency_key_invalid']);

        $this->assertSame(0, ContactMessage::query()->count());
    }

    public function test_the_second_tap_returns_the_first_answer_and_stores_nothing_new(): void
    {
        $key = (string) Str::uuid();
        $body = $this->publicWriteBody(self::CONTACT);

        $first = $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))
            ->assertOk();

        $second = $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))
            ->assertOk();

        $this->assertSame($first->getContent(), $second->getContent());
        $this->assertSame(1, ContactMessage::query()->count());

        // The replay says so, so a client that retried can tell a fresh
        // acceptance from an echo of one it already had.
        $this->assertNull($first->headers->get('Idempotency-Replayed'));
        $this->assertSame('true', $second->headers->get('Idempotency-Replayed'));
    }

    public function test_a_booking_tapped_twice_is_booked_once(): void
    {
        $option = $this->bookableOption();
        $key = (string) Str::uuid();

        $body = $this->publicWriteBody([
            'firstName' => 'Ada',
            'lastName' => 'Lovelace',
            'email' => 'ada@example.com',
            'phone' => '+41 79 000 00 00',
            'choices' => [['optionId' => $option->id, 'quantity' => 2]],
        ]);

        $first = $this->postJson(
            "/api/v1/events/{$option->event_id}/registrations",
            $body,
            $this->publicWriteHeaders(key: $key),
        )->assertStatus(201);

        $second = $this->postJson(
            "/api/v1/events/{$option->event_id}/registrations",
            $body,
            $this->publicWriteHeaders(key: $key),
        )->assertStatus(201);

        // The status travels with the stored response, so a replay of a 201 is
        // a 201 — a client branching on the status sees what it saw the first
        // time.
        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertSame(1, $option->event->registrations()->count());
    }

    public function test_the_same_key_with_a_different_body_is_refused(): void
    {
        $key = (string) Str::uuid();

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::CONTACT), $this->publicWriteHeaders(key: $key))
            ->assertOk();

        $this->postJson(
            '/api/v1/contact',
            $this->publicWriteBody(['message' => 'Autre chose.'] + self::CONTACT),
            $this->publicWriteHeaders(key: $key),
        )
            ->assertStatus(409)
            ->assertJson(['code' => 'idempotency_key_reuse']);

        // The refusal is a refusal to WRITE, and it does not overwrite the
        // stored answer either: the first submission stands.
        $this->assertSame(1, ContactMessage::query()->count());
        $this->assertSame('Un message.', ContactMessage::query()->sole()->message);
    }

    public function test_one_key_does_not_cover_two_different_endpoints(): void
    {
        // The key is scoped to the endpoint it was used against. A guest whose
        // booking and whose message happen to carry the same key is making two
        // submissions, and neither is a retry of the other.
        $option = $this->bookableOption();
        $key = (string) Str::uuid();

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::CONTACT), $this->publicWriteHeaders(key: $key))
            ->assertOk();

        $this->postJson(
            "/api/v1/events/{$option->event_id}/registrations",
            $this->publicWriteBody([
                'firstName' => 'Ada',
                'lastName' => 'Lovelace',
                'email' => 'ada@example.com',
                'phone' => '+41 79 000 00 00',
                'choices' => [['optionId' => $option->id, 'quantity' => 1]],
            ]),
            $this->publicWriteHeaders(key: $key),
        )->assertStatus(201);
    }

    public function test_a_key_whose_request_failed_can_be_used_again(): void
    {
        // Nothing was written, so nothing is being retried — the key has to go
        // back to the client. Holding it would mean a guest who mistyped their
        // address had to reload the whole form to correct it.
        $key = (string) Str::uuid();

        $this->postJson(
            '/api/v1/contact',
            $this->publicWriteBody(['email' => 'pas-une-adresse'] + self::CONTACT),
            $this->publicWriteHeaders(key: $key),
        )->assertStatus(400)->assertJson(['code' => 'validation_failed']);

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::CONTACT), $this->publicWriteHeaders(key: $key))
            ->assertOk();

        $this->assertSame(1, ContactMessage::query()->count());
    }

    public function test_a_retry_while_the_first_attempt_is_still_running_is_refused(): void
    {
        $key = (string) Str::uuid();
        $body = $this->publicWriteBody(self::CONTACT);

        $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))->assertOk();

        // Put the stored row back the way it looked mid-request, keeping the
        // fingerprint the first request computed — which is what makes this a
        // test of the in-flight branch rather than of the collision branch
        // beside it.
        $this->rewindToInFlight($key, startedSecondsAgo: 0);

        $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))
            ->assertStatus(409)
            ->assertJson(['code' => 'idempotency_key_reuse']);

        $this->assertSame(1, ContactMessage::query()->count());
    }

    public function test_a_key_stranded_by_a_crashed_request_is_taken_over(): void
    {
        // A request that dies between claiming the key and answering — a PHP
        // fatal, a worker this shared host killed — leaves a row nothing will
        // ever complete. Without the takeover the guest's key is unusable
        // until it expires a day later, and every retry answers 409 with
        // nothing they can do about it.
        $key = (string) Str::uuid();
        $body = $this->publicWriteBody(self::CONTACT);

        $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))->assertOk();

        ContactMessage::query()->delete();
        $this->rewindToInFlight($key, startedSecondsAgo: 120);

        $this->postJson('/api/v1/contact', $body, $this->publicWriteHeaders(key: $key))->assertOk();

        $this->assertSame(1, ContactMessage::query()->count());
    }

    public function test_expired_keys_are_swept_by_traffic(): void
    {
        // There is no scheduler on this host and no shell to install one from,
        // so the sweep rides on writes the way Laravel's session garbage
        // collection does. The lottery is config so a test can make it
        // certain; left to chance this would pass 98 runs in a hundred while
        // proving nothing.
        config(['api.idempotency.lottery' => [100, 100]]);

        DB::table('idempotency_keys')->insert([
            'idempotency_key' => 'expired-'.Str::uuid(),
            'endpoint' => '/api/v1/contact',
            'fingerprint' => str_repeat('0', 64),
            'status' => 'completed',
            'response_status' => 200,
            'response_body' => '{"ok":true}',
            'created_at' => now()->subDays(2),
            'expires_at' => now()->subDay(),
        ]);

        $this->postJson('/api/v1/contact', $this->publicWriteBody(self::CONTACT), $this->publicWriteHeaders())
            ->assertOk();

        // The row this request wrote survives; the stale one is gone.
        $this->assertSame(1, DB::table('idempotency_keys')->count());
        $this->assertSame(0, DB::table('idempotency_keys')->where('expires_at', '<', now())->count());
    }

    /**
     * Puts a stored key back the way it looked mid-request.
     *
     * Through a real submission first, so the fingerprint is the one the
     * middleware computed rather than one this test worked out for itself — a
     * test that recomputed it would agree with itself and could pass against a
     * fingerprint the API never produces.
     */
    private function rewindToInFlight(string $key, int $startedSecondsAgo): void
    {
        DB::table('idempotency_keys')
            ->where('idempotency_key', $key)
            ->update([
                'status' => 'in_progress',
                'response_status' => null,
                'response_content_type' => null,
                'response_body' => null,
                'created_at' => now()->subSeconds($startedSecondsAgo),
            ]);
    }

    /** An event taking bookings, with one thing on the menu. */
    private function bookableOption(): RegistrationOption
    {
        $event = Event::factory()->create([
            'registration_opens_at' => now()->subDay(),
            'registration_closes_at' => now()->addWeek(),
            'registration_max_guests' => 10,
        ]);

        return RegistrationOption::factory()->create(['event_id' => $event->id]);
    }
}
