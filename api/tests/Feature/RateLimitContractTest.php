<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A rate-limited request answers in the contract, like every other failure.
 *
 * FOUND BY A BLACK-BOX REVIEW on 2026-09-11, and it is the same hole as the 404
 * that A2 closed — closed only for 404. ThrottleRequestsException IS an
 * HttpException, ApiError::invalidSession() returns null for every status but
 * 419, so the middleware's 429 fell through to Laravel's default renderer:
 *
 *     {"message":"Too Many Attempts.","exception":"…","file":"…","trace":[45 frames]}
 *
 * On GET /api/v1/form-token and the two public writes — anonymous,
 * internet-facing endpoints. Two defects in one: no `code` for a client to
 * branch on, and a stack trace to an unauthenticated caller wherever APP_DEBUG
 * is on.
 *
 * The login lockout's 429 was always correct, because our own code raises that
 * one through ApiError. Only the middleware's escaped — which is precisely why
 * a suite full of 429 assertions stayed green.
 */
class RateLimitContractTest extends TestCase
{
    use RefreshDatabase;

    /** The public throttle is 10 a minute per IP; 11 requests guarantee one refusal. */
    private function exhaustTheFormTokenLimit(): TestResponse
    {
        $response = null;

        for ($i = 0; $i < 12; $i++) {
            $response = $this->getJson('/api/v1/form-token');

            if ($response->getStatusCode() === 429) {
                return $response;
            }
        }

        $this->fail('The public rate limit did not fire in 12 requests; this test asserts nothing.');
    }

    public function test_a_throttled_request_is_a_problem_document(): void
    {
        $response = $this->exhaustTheFormTokenLimit();

        $this->assertSame('application/problem+json', $response->headers->get('Content-Type'));

        $response->assertJsonPath('code', 'rate_limited');
        $response->assertJsonPath('status', 429);

        // `detail` is what tells the caller to read Retry-After, so its absence
        // would leave them guessing at a backoff.
        $this->assertStringContainsString('Retry-After', (string) $response->json('detail'));
    }

    /**
     * The failure mode this replaced, asserted directly. A body carrying
     * `exception` or `trace` means the contract was escaped again — and on an
     * anonymous endpoint that is an information leak, not just an inconsistency.
     */
    public function test_a_throttled_request_leaks_no_framework_internals(): void
    {
        $body = (string) $this->exhaustTheFormTokenLimit()->getContent();

        $this->assertStringNotContainsString('"exception"', $body);
        $this->assertStringNotContainsString('"trace"', $body);
        $this->assertStringNotContainsString('vendor/laravel', $body);
        $this->assertStringNotContainsString('Too Many Attempts.', $body);
    }

    /**
     * Retry-After survives the rewrite.
     *
     * ThrottleRequests puts it on the exception, and rendering through ApiError
     * builds a fresh response — so the headers have to be carried across
     * deliberately. Without this, a client is told to back off and not told for
     * how long, which is the one thing a 429 exists to say.
     */
    public function test_the_backoff_headers_survive(): void
    {
        $response = $this->exhaustTheFormTokenLimit();

        $this->assertNotNull($response->headers->get('Retry-After'));
        $this->assertSame('10', $response->headers->get('X-RateLimit-Limit'));
        $this->assertSame('0', $response->headers->get('X-RateLimit-Remaining'));
    }
}
