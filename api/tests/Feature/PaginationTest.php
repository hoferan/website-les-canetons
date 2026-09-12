<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Section;
use App\Support\Page;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every collection this API answers with comes in one envelope.
 *
 * `{data, meta}` plus an RFC 8288 `Link` header — see
 * App\Http\Middleware\PaginatesCollections for why every collection and not
 * only the ones that are big today.
 *
 * THE SCAN IS THE POINT OF THIS FILE. Asserting the envelope on `/members`
 * proves one endpoint; what has to be true is that no endpoint anywhere answers
 * a bare array, and that the published document says the same about the same
 * endpoints. Both halves are derived — one from the live routes, one from
 * openapi.json — so a collection added next year is covered without editing
 * this file, and a Scramble extension that silently stops running fails here
 * rather than quietly shipping a document describing a shape the API no longer
 * has.
 */
class PaginationTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $this->document = json_decode((string) file_get_contents(base_path('openapi.json')), true);

        self::assertIsArray($this->document, 'api/openapi.json did not parse; every assertion below would be vacuous.');
    }

    /**
     * Somebody who may read every collection at once.
     *
     * `direction` carries members.manage, attendance.view_all and
     * registrations.view, which between them reach all seven reads below, and
     * events.manage for the options. In a register too, so the chase list has
     * a row.
     */
    private function reader(): Member
    {
        return Member::factory()
            ->named('Dominique', 'Direction')
            ->administrator()
            ->inSection(Section::where('name', 'Cloches')->sole())
            ->create();
    }

    /**
     * Every collection this API reads, as a URL a test can actually call.
     *
     * @return array<string, string>
     */
    private function collectionUrls(Event $event): array
    {
        return [
            'roster' => '/api/v1/members',
            'registers' => '/api/v1/sections',
            'roles' => '/api/v1/roles',
            'planning' => '/api/v1/events',
            'chase list' => "/api/v1/events/{$event->id}/attendance",
            'guest list' => "/api/v1/events/{$event->id}/registrations",
            'bookable options' => "/api/v1/events/{$event->id}/registration-options",
        ];
    }

    public function test_every_collection_this_api_reads_answers_in_the_envelope(): void
    {
        $event = Event::factory()->create();
        $urls = $this->collectionUrls($event);

        // A FLOOR, so a scan that stops finding things fails instead of passing
        // vacuously. Seven is what exists today; a new collection raises it.
        self::assertGreaterThanOrEqual(7, count($urls));

        $reader = $this->reader();

        foreach ($urls as $what => $url) {
            $response = $this->actingAsMember($reader)->getJson($url)->assertOk();
            $body = $response->json();

            self::assertIsArray($body['data'] ?? null, "The $what is not enveloped: `data` is missing or not a list.");
            self::assertSame(
                ['total', 'limit', 'offset'],
                array_keys($body['meta'] ?? []),
                "The $what carries the wrong `meta`."
            );
            self::assertSame(count($body['data']), $body['meta']['total'], "The $what miscounts itself.");
            self::assertNotNull($response->headers->get('Link'), "The $what hands out no Link header.");
        }
    }

    /**
     * The other half of the scan: nothing in the DOCUMENT still promises a bare
     * array.
     *
     * Derived rather than listed. An operation whose success schema is an array
     * is one the middleware would envelope at runtime, leaving the document
     * describing a shape the API does not send — which is the failure a
     * generated client compiles straight into its types.
     */
    public function test_the_document_promises_no_bare_array_anywhere(): void
    {
        $bare = [];
        $enveloped = [];

        foreach ($this->document['paths'] as $path => $operations) {
            foreach ($operations as $method => $operation) {
                foreach ($operation['responses'] ?? [] as $status => $response) {
                    if ((int) $status < 200 || (int) $status > 299) {
                        continue;
                    }

                    $schema = $response['content']['application/json']['schema'] ?? null;

                    if (($schema['type'] ?? null) === 'array') {
                        $bare[] = strtoupper($method).' '.$path;
                    }

                    if (($schema['properties']['data']['type'] ?? null) === 'array') {
                        $enveloped[] = strtoupper($method).' '.$path;
                    }
                }
            }
        }

        self::assertSame([], $bare, 'These operations still answer with a bare array.');

        // The floor again, and here it is what would notice
        // App\Support\Scramble\DocumentsPagination not running at all: with the
        // extension silent the list above would name these instead — but the
        // day both lists are empty, nothing else in this file would say so.
        self::assertGreaterThanOrEqual(8, count($enveloped), 'The document describes no collections at all.');
    }

    public function test_a_documented_collection_says_how_to_page_it(): void
    {
        $checked = 0;

        foreach ($this->document['paths'] as $path => $operations) {
            foreach ($operations as $method => $operation) {
                $schema = $operation['responses']['200']['content']['application/json']['schema'] ?? null;

                if ($method !== 'get' || ($schema['properties']['data']['type'] ?? null) !== 'array') {
                    continue;
                }

                $parameters = array_column($operation['parameters'] ?? [], 'name');

                self::assertContains('limit', $parameters, "GET $path does not document `limit`.");
                self::assertContains('offset', $parameters, "GET $path does not document `offset`.");
                self::assertArrayHasKey(
                    'Link',
                    $operation['responses']['200']['headers'] ?? [],
                    "GET $path does not document its Link header."
                );

                $checked++;
            }
        }

        self::assertGreaterThanOrEqual(7, $checked, 'No documented collection reads were checked.');
    }

    /**
     * The one write that answers with a collection.
     *
     * It gets the envelope — one shape for that collection whichever verb asked
     * for it — and NOT the Link header, because `rel="next"` on a URL you would
     * have to PUT again is not a link anybody should follow.
     */
    public function test_replacing_the_bookable_options_answers_in_the_envelope_without_links(): void
    {
        $event = Event::factory()->create();

        $response = $this->actingAsMember($this->reader())
            ->putJson(
                "/api/v1/events/{$event->id}/registration-options",
                ['options' => [['label' => 'Repas'], ['label' => 'Dessert']]],
                $this->ifMatch('event.options', $event),
            )
            ->assertOk();

        self::assertCount(2, $response->json('data'));
        self::assertSame(2, $response->json('meta.total'));
        self::assertNull($response->headers->get('Link'), 'A write must not hand out collection links.');
    }

    /**
     * Nothing that is not a collection is touched.
     *
     * The guest-list JSON export is the one that would hurt: it is a downloaded
     * FILE whose body happens to be JSON, and enveloping it would corrupt every
     * saved copy. It is an object, which is the whole reason the middleware
     * keys on the body being a list.
     */
    public function test_an_object_response_is_left_exactly_as_it_was(): void
    {
        $event = Event::factory()->create();
        $reader = $this->reader();

        foreach (['/api/v1/me', '/api/v1/config', "/api/v1/events/{$event->id}/registrations.json"] as $url) {
            $body = $this->actingAsMember($reader)->getJson($url)->assertOk()->json();

            self::assertArrayNotHasKey('meta', $body, "$url was enveloped and should not have been.");
        }
    }

    public function test_an_empty_collection_is_still_a_collection(): void
    {
        $event = Event::factory()->create();

        $response = $this->actingAsMember($this->reader())
            ->getJson("/api/v1/events/{$event->id}/registrations")
            ->assertOk();

        // Without the envelope this is `[]`, and a client would have to handle
        // two shapes for the case it is likeliest to meet first.
        self::assertSame([], $response->json('data'));
        self::assertSame(0, $response->json('meta.total'));
        self::assertStringContainsString('rel="first"', (string) $response->headers->get('Link'));
        self::assertStringNotContainsString('rel="next"', (string) $response->headers->get('Link'));
    }

    public function test_a_limit_returns_that_many_rows_and_still_counts_the_whole_collection(): void
    {
        Member::factory()->count(4)->create();

        $response = $this->actingAsMember($this->reader())
            ->getJson('/api/v1/members?limit=2')
            ->assertOk();

        self::assertCount(2, $response->json('data'));

        // THE POINT OF `total`: a screen can write "5 membres" without having
        // been sent five of them.
        self::assertSame(5, $response->json('meta.total'));
        self::assertSame(2, $response->json('meta.limit'));
    }

    public function test_an_offset_skips_and_the_pages_together_are_the_collection(): void
    {
        Member::factory()->count(4)->create();

        $reader = $this->reader();

        $first = $this->actingAsMember($reader)->getJson('/api/v1/members?limit=2&offset=0')->json('data');
        $second = $this->actingAsMember($reader)->getJson('/api/v1/members?limit=2&offset=2')->json('data');
        $third = $this->actingAsMember($reader)->getJson('/api/v1/members?limit=2&offset=4')->json('data');
        $whole = $this->actingAsMember($reader)->getJson('/api/v1/members')->json('data');

        self::assertSame(
            array_column($whole, 'id'),
            array_column([...$first, ...$second, ...$third], 'id'),
            'Walking the pages does not reconstruct the collection.',
        );
    }

    public function test_the_links_say_where_the_rest_is(): void
    {
        Member::factory()->count(4)->create();

        $reader = $this->reader();

        $first = (string) $this->actingAsMember($reader)
            ->getJson('/api/v1/members?limit=2')->headers->get('Link');

        self::assertStringNotContainsString('rel="prev"', $first, 'The first page has nothing before it.');
        self::assertStringContainsString('offset=2>; rel="next"', $first);
        self::assertStringContainsString('offset=4>; rel="last"', $first);

        $last = (string) $this->actingAsMember($reader)
            ->getJson('/api/v1/members?limit=2&offset=4')->headers->get('Link');

        self::assertStringContainsString('offset=2>; rel="prev"', $last);
        self::assertStringNotContainsString('rel="next"', $last, 'The last page has nothing after it.');
    }

    /**
     * Following `next` off `/events?past=1` must stay in the past.
     *
     * A Link header that dropped the caller's own filters would hand them page
     * two of a DIFFERENT collection, which is the kind of bug that looks like
     * missing data rather than like broken paging.
     */
    public function test_the_links_carry_the_callers_own_filters(): void
    {
        Event::factory()->count(3)->create([
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->subMonth()->addHours(2),
        ]);

        $link = (string) $this->actingAsMember($this->reader())
            ->getJson('/api/v1/events?past=1&limit=2')->headers->get('Link');

        self::assertStringContainsString('past=1', $link);

        // Compared against how many links there ARE rather than against a
        // number typed here, so this stays true when a page gains or loses a
        // `prev`.
        self::assertSame(
            substr_count($link, 'rel="'),
            substr_count($link, 'past=1'),
            'Every link must carry the filter, not just the first.',
        );
    }

    public function test_an_unreasonable_limit_is_clamped_rather_than_refused(): void
    {
        $response = $this->actingAsMember($this->reader())
            ->getJson('/api/v1/members?limit=100000')
            ->assertOk();

        // Not a 400. These parameters are a hint about how much to send, and
        // `meta` reports what was applied — see App\Support\Page.
        self::assertSame(Page::MAX_LIMIT, $response->json('meta.limit'));
    }

    public function test_a_limit_that_is_not_a_number_is_ignored_rather_than_read_as_zero(): void
    {
        Member::factory()->count(2)->create();

        $reader = $this->reader();

        foreach (['abc', '', '2.5', '-1', '0'] as $nonsense) {
            $response = $this->actingAsMember($reader)
                ->getJson('/api/v1/members?limit='.urlencode($nonsense))
                ->assertOk();

            // The failure this guards against is a cast: `(int) "abc"` is 0,
            // and a limit of 0 answers every collection in the system with
            // nothing at all.
            self::assertNotSame([], $response->json('data'), "`?limit=$nonsense` emptied the collection.");
        }
    }

    public function test_omitting_the_parameters_returns_the_whole_collection(): void
    {
        Member::factory()->count(4)->create();

        $response = $this->actingAsMember($this->reader())->getJson('/api/v1/members')->assertOk();

        // The reason the SPA needs no paging: the default is above every
        // collection this system holds.
        self::assertSame(Page::DEFAULT_LIMIT, $response->json('meta.limit'));
        self::assertSame(0, $response->json('meta.offset'));
        self::assertCount($response->json('meta.total'), $response->json('data'));
    }
}
