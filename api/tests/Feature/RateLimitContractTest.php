<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A rate-limited request answers in the contract, like every other failure.
 *
 * ThrottleRequestsException is an HttpException, and ApiError::invalidSession()
 * returns null for every status but 419, so without explicit handling the
 * middleware's 429 falls through to Laravel's default renderer: no `code` for a
 * client to branch on, and a stack trace wherever APP_DEBUG is on. That would
 * hit GET /api/v1/form-token and the two public writes, all anonymous.
 *
 * The login lockout's 429 is raised through ApiError by our own code, so login
 * tests do not cover the middleware's 429.
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

        // `detail` tells the caller to read Retry-After.
        $this->assertStringContainsString('Retry-After', (string) $response->json('detail'));
    }

    /**
     * A body carrying `exception` or `trace` escaped the contract, and on an
     * anonymous endpoint that leaks internals.
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
     * builds a fresh response, so the headers are carried across explicitly.
     * Without them a client is told to back off but not for how long.
     */
    public function test_the_backoff_headers_survive(): void
    {
        $response = $this->exhaustTheFormTokenLimit();

        $this->assertNotNull($response->headers->get('Retry-After'));
        $this->assertSame('10', $response->headers->get('X-RateLimit-Limit'));
        $this->assertSame('0', $response->headers->get('X-RateLimit-Remaining'));
    }
}
