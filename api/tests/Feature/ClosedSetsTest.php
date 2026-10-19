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
 * CI's `openapi-drift` job only proves api/openapi.json matches the code that
 * generated it. Return `$status->value` instead of `$status` from a Resource
 * and the document regenerates cleanly, drift passes, and the field becomes an
 * open `string`.
 *
 * orval turns an enum into a TypeScript union and a bare string into `string`,
 * so a closed set lets the compiler refuse `status === "maybe"` instead of
 * leaving a branch that never runs.
 *
 * Each assertion compares the document with the code that owns the set (the
 * enum, the vocabulary, the route's constraint), never with a list retyped
 * here, so a new value needs no edit to this file.
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

        // The Resource must reference it. An inline `{"type":"string"}` on the
        // property would leave the component orphaned and the check above green.
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
     * The one place a closed set would be wrong. `features` is a map whose
     * membership is the server's business: the endpoint documents that an
     * unmentioned flag reads as false, so pinning today's flags as required
     * properties would contradict that and break clients when a flag is added.
     */
    public function test_the_feature_flags_are_an_open_map_of_booleans(): void
    {
        $features = $this->document['paths']['/config']['get']['responses']['200']['content']['application/json']['schema']['properties']['features'] ?? null;

        self::assertSame(['type' => 'object', 'additionalProperties' => ['type' => 'boolean']], $features);
    }

    public function test_a_validation_failure_names_a_reason_from_the_vocabulary(): void
    {
        $errors = $this->document['components']['responses']['Problem400']['content']['application/problem+json']['schema']['properties']['errors'] ?? null;

        self::assertIsArray($errors, 'The 400 problem no longer describes its errors array.');
        self::assertSame(ErrorVocabulary::REASONS, $errors['items']['properties']['reason']['enum'] ?? null);
    }

    /**
     * The export format, compared with the route's own constraint.
     *
     * This is the assertion that notices
     * App\Support\Scramble\ConstrainsPathParameters not running: a Scramble
     * extension that is never called changes nothing and reports nothing.
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
