<?php

namespace Tests\Feature;

use App\Support\AttendanceStatus;
use App\Support\Environment;
use App\Support\ErrorVocabulary;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every field of this contract whose values are a closed set says so.
 *
 * WHY A TEST AND NOT THE DRIFT CHECK. CI's `openapi-drift` job proves
 * api/openapi.json matches the code that generated it, which is a different
 * guarantee and does not cover this one: return `$status->value` instead of
 * `$status` from a Resource and the document regenerates cleanly, drift passes,
 * and the field quietly goes back to being an open `string`. Four of the five
 * fields below were exactly that until 2026-09-11 — documented in prose, open
 * in the schema — so the mistake is not hypothetical.
 *
 * WHAT IT COSTS A CONSUMER. orval turns an enum into a TypeScript union and a
 * bare string into `string`, so a closed set here is the difference between the
 * compiler refusing `status === "maybe"` and a branch that silently never runs.
 *
 * Each assertion compares the document against the CODE that owns the set — the
 * enum, the vocabulary, the route's own constraint — never against a list
 * retyped here, so adding a fifth environment or a fifth export format needs no
 * edit to this file.
 */
class ClosedSetsTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $this->document = json_decode(file_get_contents(base_path('openapi.json')), true);

        self::assertIsArray($this->document, 'api/openapi.json did not parse; every assertion below would be vacuous.');
    }

    public function test_an_attendance_answer_carries_the_two_values_it_can_have(): void
    {
        $schema = $this->document['components']['schemas']['AttendanceStatus'] ?? null;

        self::assertIsArray($schema, 'AttendanceStatus is no longer a named schema in the document.');
        self::assertSame(AttendanceStatus::values(), $schema['enum'] ?? null);

        // The Resource must REFERENCE it. An inline `{"type":"string"}` on the
        // property would leave the component orphaned and this test green.
        self::assertSame(
            '#/components/schemas/AttendanceStatus',
            $this->document['components']['schemas']['AttendanceResource']['properties']['status']['$ref'] ?? null,
            'AttendanceResource.status no longer points at the enum.'
        );
    }

    public function test_the_environment_is_one_of_the_four_this_project_knows(): void
    {
        $schema = $this->document['components']['schemas']['Environment'] ?? null;

        self::assertIsArray($schema, 'Environment is no longer a named schema in the document.');
        self::assertSame(
            array_column(Environment::cases(), 'value'),
            $schema['enum'] ?? null
        );

        self::assertSame(
            '#/components/schemas/Environment',
            $this->document['paths']['/config']['get']['responses']['200']['content']['application/json']['schema']['properties']['env']['$ref'] ?? null,
            'GET /config no longer publishes env as the closed set.'
        );
    }

    /**
     * The one place a CLOSED set would be wrong, asserted for the same reason as
     * the rest.
     *
     * `features` is a map whose membership is the server's business: the
     * endpoint documents that a flag it says nothing about reads as false, so
     * pinning today's single flag as a required property would contradict its
     * own contract and break every client the day a second flag lands.
     */
    public function test_the_feature_flags_are_an_open_map_of_booleans(): void
    {
        $features = $this->document['paths']['/config']['get']['responses']['200']['content']['application/json']['schema']['properties']['features'] ?? null;

        self::assertSame(['type' => 'object', 'additionalProperties' => ['type' => 'boolean']], $features);
    }

    public function test_a_validation_failure_names_a_reason_from_the_vocabulary(): void
    {
        $errors = $this->document['components']['responses']['ValidationException']['content']['application/problem+json']['schema']['properties']['errors'] ?? null;

        self::assertIsArray($errors, 'The validation problem no longer describes its errors array.');
        self::assertSame(ErrorVocabulary::REASONS, $errors['items']['properties']['reason']['enum'] ?? null);
    }

    /**
     * The export format, compared against the ROUTE rather than against a list.
     *
     * This is the assertion that would notice
     * App\Support\Scramble\ConstrainsPathParameters silently not running — a
     * Scramble extension that is never called changes nothing and reports
     * nothing, which is how an hour went missing once already.
     */
    public function test_the_export_format_is_the_set_the_router_enforces(): void
    {
        $route = collect(Route::getRoutes())
            ->first(fn ($route) => str_ends_with($route->uri(), 'registrations.{format}'));

        self::assertNotNull($route, 'The guest-list export route has moved; this test found no route to read.');

        $constraint = $route->wheres['format'] ?? null;

        self::assertIsString($constraint, 'The export route no longer constrains {format}, so the router no longer answers 404 for an unknown one.');

        $parameters = $this->document['paths']['/events/{event}/registrations.{format}']['get']['parameters'] ?? [];
        $format = collect($parameters)->firstWhere('name', 'format');

        self::assertSame(explode('|', $constraint), $format['schema']['enum'] ?? null);
    }

    public function test_the_history_flag_documents_the_only_value_that_does_anything(): void
    {
        $parameters = $this->document['paths']['/events']['get']['parameters'] ?? [];
        $past = collect($parameters)->firstWhere('name', 'past');

        self::assertSame('1', $past['schema']['const'] ?? null);
    }
}
