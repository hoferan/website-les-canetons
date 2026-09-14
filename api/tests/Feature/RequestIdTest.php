<?php

namespace Tests\Feature;

use App\Http\Middleware\RequestId;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The identifier that turns "it said something went wrong" into a log line.
 *
 * It has to hold on three axes, and each is its own test below: it is on EVERY
 * response and not only on failures; it is the SAME value in the header and in
 * the problem document, or quoting one to search the other is useless; and an
 * inbound one is honoured only when it is a well-formed ULID, so a caller
 * cannot write arbitrary text into our logs.
 */
class RequestIdTest extends TestCase
{
    public function test_every_response_carries_one(): void
    {
        // A SUCCESS, deliberately. The identifier exists for support, and the
        // request somebody needs to find is often the one that worked.
        $response = $this->getJson('/api/v1/config')->assertOk();

        $this->assertTrue(
            Str::isUlid($response->headers->get(RequestId::HEADER) ?? ''),
            'A successful response carried no X-Request-Id.'
        );
    }

    public function test_the_header_and_the_problem_document_agree(): void
    {
        $response = $this->getJson('/api/v1/me')->assertStatus(401);

        $this->assertSame(
            $response->headers->get(RequestId::HEADER),
            $response->json('requestId'),
            'The header and the body name different requests, so neither can be used to find the other.'
        );
    }

    public function test_a_well_formed_inbound_id_is_honoured(): void
    {
        $inbound = (string) Str::ulid();

        $response = $this->getJson('/api/v1/config', [RequestId::HEADER => $inbound])->assertOk();

        $this->assertSame($inbound, $response->headers->get(RequestId::HEADER));
    }

    /**
     * The half that matters for safety. Without the ULID check, a caller could
     * put anything — a newline, a log-forging payload, a megabyte — into a value
     * that is written to the log and echoed back.
     */
    public function test_a_malformed_inbound_id_is_replaced_rather_than_echoed(): void
    {
        $response = $this->getJson('/api/v1/config', [
            RequestId::HEADER => "not-a-ulid\ninjected",
        ])->assertOk();

        $issued = $response->headers->get(RequestId::HEADER);

        $this->assertNotSame("not-a-ulid\ninjected", $issued);
        $this->assertTrue(Str::isUlid($issued ?? ''), 'The replacement was not a ULID either.');
    }

    /**
     * Two requests, two identifiers. Obvious, and worth pinning: caching the
     * ULID anywhere static — which RequestId::current() deliberately does NOT do
     * beyond the current request's Context — would give every request in a
     * worker's lifetime the same id and quietly make the whole feature useless.
     */
    public function test_two_requests_get_different_identifiers(): void
    {
        $first = $this->getJson('/api/v1/config')->headers->get(RequestId::HEADER);
        $second = $this->getJson('/api/v1/config')->headers->get(RequestId::HEADER);

        $this->assertNotSame($first, $second);
    }
}
