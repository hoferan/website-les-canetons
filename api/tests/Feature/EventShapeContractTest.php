<?php

namespace Tests\Feature;

use App\Models\Event;
use PHPUnit\Framework\TestCase;

/**
 * Drift guard: the event shape is written twice, and these two must agree.
 *
 * WHY TWICE. Scramble cannot infer a response type through
 * EventController::index()'s Collection::map(), so the shape is declared in a
 * #[Response] attribute on that method. It has to be a LITERAL there —
 * Scramble resolves Event's `@phpstan-type EventShape` alias to a bare object
 * with no properties — so the same field list also exists in the array
 * Event::toFrontendShape() actually returns.
 *
 * WHAT DRIFT COSTS. Add a field to toFrontendShape() and forget the attribute,
 * and the OpenAPI document silently under-describes the response: the generated
 * TypeScript client has no such property, so every SPA call site that reads it
 * fails to compile — or worse, the reverse, where the attribute promises a
 * field the API never sends and the SPA renders undefined. Neither shows up in
 * any other test, because both sides are internally consistent.
 *
 * It extends PHPUnit's TestCase rather than Tests\TestCase: it reads a JSON
 * file and constructs one unsaved model, and needs no booted framework or
 * database.
 */
class EventShapeContractTest extends TestCase
{
    /**
     * The committed OpenAPI document, which CI's openapi-drift job already
     * keeps in step with what Scramble emits — so asserting against this file
     * is asserting against the attribute.
     */
    private const OPENAPI = __DIR__.'/../../openapi.json';

    public function test_the_documented_event_shape_matches_what_the_model_returns(): void
    {
        $documented = $this->documentedEventProperties();
        $actual = array_keys((new Event)->toFrontendShape());

        sort($documented);
        sort($actual);

        self::assertSame($documented, $actual, implode("\n", [
            "The event shape in EventController::index()'s #[Response] attribute has drifted",
            'from what Event::toFrontendShape() returns.',
            '',
            'Update BOTH, then run `npm run openapi && npm run generate:api` and commit',
            'api/openapi.json and web/src/api/generated/ with the change.',
        ]));
    }

    public function test_every_documented_property_is_required(): void
    {
        $schema = $this->eventItemSchema();

        // The SPA reads every field unconditionally; an optional one would type
        // as `field?: string` in the generated client and quietly become a
        // `possibly undefined` at each call site.
        self::assertSame(
            array_keys($schema['properties']),
            $schema['required'] ?? [],
            'Every property of an event is always present; none may be optional.'
        );
    }

    /** @return list<string> */
    private function documentedEventProperties(): array
    {
        return array_keys($this->eventItemSchema()['properties']);
    }

    /** @return array{properties: array<string, mixed>, required?: list<string>} */
    private function eventItemSchema(): array
    {
        self::assertFileExists(self::OPENAPI, 'Run `npm run openapi` to generate it.');

        $document = json_decode((string) file_get_contents(self::OPENAPI), true, 512, JSON_THROW_ON_ERROR);
        $schema = $document['paths']['/events']['get']['responses'][200]['content']['application/json']['schema'] ?? null;

        self::assertIsArray($schema, 'GET /events has no documented 200 response schema at all.');
        self::assertSame('array', $schema['type'] ?? null, 'GET /events must document an array.');
        self::assertIsArray(
            $schema['items']['properties'] ?? null,
            'GET /events documents an array with no item properties — the #[Response] attribute '
            .'on EventController::index() is missing or unresolvable, and the generated client '
            .'will be untyped.'
        );

        return $schema['items'];
    }
}
