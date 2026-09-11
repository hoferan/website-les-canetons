<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * What a response says about itself, and what it should stop saying.
 *
 * Every assertion here was a real defect on 2026-09-11, and every one of them
 * came from the same place: Scramble reads a controller's Response object,
 * which is built to be SENT rather than to be described, so transport detail
 * arrives with the content and prose does not arrive at all.
 */
class ResponseHygieneTest extends TestCase
{
    /**
     * RFC 9110 §7.6.1. A contract cannot promise these: they are negotiated per
     * connection and a proxy may change any of them.
     */
    private const HOP_BY_HOP = [
        'transfer-encoding', 'connection', 'keep-alive', 'upgrade',
        'te', 'trailer', 'proxy-authenticate', 'proxy-authorization',
    ];

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $document = json_decode((string) file_get_contents(base_path('openapi.json')), true);

        self::assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $this->document = $document;
    }

    /**
     * Thirty operations answered a success with an empty description, or with a
     * type name already visible in the schema beside it.
     *
     * The sidebar of a reference is a list of those sentences. Without them the
     * only way to learn what a `200` means is to read the request handler,
     * which a third party does not have.
     */
    public function test_every_success_says_what_it_means(): void
    {
        $bare = [];

        foreach ($this->operations() as $where => $operation) {
            foreach ($operation['responses'] ?? [] as $status => $response) {
                if (str_starts_with((string) $status, '2') && trim((string) ($response['description'] ?? '')) === '') {
                    $bare[] = "{$where} -> {$status}";
                }
            }
        }

        self::assertSame([], $bare, "These successes carry no description:\n  - ".implode("\n  - ", $bare));
    }

    public function test_no_response_promises_a_hop_by_hop_header(): void
    {
        $promised = [];

        foreach ($this->operations() as $where => $operation) {
            foreach ($operation['responses'] ?? [] as $status => $response) {
                foreach (array_keys($response['headers'] ?? []) as $header) {
                    if (in_array(strtolower((string) $header), self::HOP_BY_HOP, true)) {
                        $promised[] = "{$where} -> {$status}: {$header}";
                    }
                }
            }
        }

        self::assertSame([], $promised, "These are connection details, not contract:\n  - ".implode("\n  - ", $promised));
    }

    /**
     * A media type is the key OpenAPI matches content on, so `text/csv` and
     * `text/csv; charset=UTF-8` are two different entries describing one body,
     * and a tool looking for the first finds nothing.
     */
    public function test_no_media_type_carries_a_parameter(): void
    {
        $parameterised = [];

        foreach ($this->operations() as $where => $operation) {
            foreach ($operation['responses'] ?? [] as $status => $response) {
                foreach (array_keys($response['content'] ?? []) as $mediaType) {
                    if (str_contains((string) $mediaType, ';')) {
                        $parameterised[] = "{$where} -> {$status}: {$mediaType}";
                    }
                }
            }
        }

        self::assertSame([], $parameterised, "These media types carry a parameter:\n  - ".implode("\n  - ", $parameterised));
    }

    public function test_a_file_body_says_it_is_bytes(): void
    {
        $export = $this->document['paths']['/events/{event}/registrations.{format}']['get']['responses']['200']['content'] ?? [];

        $xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        self::assertArrayHasKey($xlsx, $export, 'The export no longer declares a spreadsheet body.');
        self::assertSame('binary', $export[$xlsx]['schema']['format'] ?? null);

        // The text formats must NOT be marked binary — the rule is about the
        // media type, not about "anything that downloads".
        self::assertArrayNotHasKey('format', $export['text/csv']['schema'] ?? []);
    }

    // ------------------------------------------------------------- the credential

    public function test_the_document_names_the_cookie_the_api_actually_sets(): void
    {
        $schemes = $this->document['components']['securitySchemes'] ?? [];

        self::assertNotEmpty($schemes, 'The document declares no security scheme, so "does this need a session" is left to inference.');

        $scheme = $schemes['sessionCookie'] ?? null;

        self::assertIsArray($scheme, 'The session cookie scheme is gone or renamed.');
        self::assertSame('apiKey', $scheme['type'] ?? null);
        self::assertSame('cookie', $scheme['in'] ?? null);
        self::assertSame(config('session.cookie'), $scheme['name'] ?? null);

        self::assertSame([['sessionCookie' => []]], $this->document['security'] ?? null);
    }

    /**
     * Which operations are anonymous, compared against the ROUTES rather than
     * against a list.
     *
     * `security: []` is the only machine-readable way the document says "no
     * session needed". Reading it off `auth:sanctum` means a route that gains or
     * loses authentication says so in the contract without anybody remembering
     * to edit it.
     */
    public function test_exactly_the_unauthenticated_routes_are_marked_public(): void
    {
        $wrong = [];
        $checked = 0;

        foreach (collect(Route::getRoutes()) as $route) {
            $uri = '/'.ltrim($route->uri(), '/');

            if (! str_starts_with($uri, '/api/v1/')) {
                continue;
            }

            $path = substr($uri, strlen('/api/v1'));
            $method = strtolower($route->methods()[0]);
            $operation = $this->document['paths'][$path][$method] ?? null;

            if ($operation === null) {
                continue;
            }

            $checked++;
            $needsSession = in_array('auth:sanctum', $route->gatherMiddleware(), true);
            $marked = ($operation['security'] ?? null) === [];

            if ($needsSession === $marked) {
                $wrong[] = strtoupper($method).' '.$path.($needsSession
                    ? ' needs a session and is marked public'
                    : ' is anonymous and inherits the session requirement');
            }
        }

        // A floor, so a path that stops matching the document fails here rather
        // than leaving the assertion below to pass on an empty comparison.
        self::assertGreaterThan(25, $checked, 'Matched almost no routes to operations; this test is comparing nothing.');

        self::assertSame([], $wrong, implode("\n  - ", $wrong));
    }

    /**
     * @return iterable<string, array<string, mixed>>
     */
    private function operations(): iterable
    {
        foreach ($this->document['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (! in_array($method, ['get', 'post', 'put', 'patch', 'delete'], true)) {
                    continue;
                }

                yield strtoupper($method).' '.$path => $operation;
            }
        }
    }
}
