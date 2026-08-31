<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drift guard: the response-summary shape is written twice, and the two must
 * agree.
 *
 * WHY TWICE. Scramble cannot infer through the Collection::map that
 * ResponseController::summary() builds its payload with — it emitted
 * `string[]`, which type-checked at every SPA call site and was wrong about
 * every field. So the shape is declared in a #[Response] attribute on index(),
 * and it has to be a LITERAL: Scramble resolves a @phpstan-type alias to a
 * property-less object, which is exactly how GET /api/events ended up untyped.
 *
 * WHY THIS ONE NEEDS A DATABASE, unlike EventShapeContractTest. The event shape
 * has a seam — Event::toFrontendShape() — callable on an unsaved model. This
 * one does not: summary() is a query. The only honest way to learn what the
 * endpoint returns is to ask it.
 */
class ResponseShapeContractTest extends TestCase
{
    use RefreshDatabase;

    private const OPENAPI = __DIR__.'/../../openapi.json';

    public function test_the_documented_shape_matches_what_the_endpoint_returns(): void
    {
        [$event, $admin] = $this->seedOneEventAndAnAdmin();

        $rows = $this->actingAs($admin)
            ->getJson('/api/responses?eventId='.$event->id)
            ->assertOk()
            ->json();

        self::assertNotEmpty($rows, 'The endpoint returned no rows, so this proves nothing.');

        $documented = $this->documentedProperties();
        $actual = array_keys($rows[0]);

        sort($documented);
        sort($actual);

        self::assertSame($documented, $actual, implode("\n", [
            "The shape in ResponseController::index()'s #[Response] attribute has drifted",
            'from what the endpoint actually returns.',
            '',
            'Update BOTH the attribute and summary()\'s @return, then run',
            '`npm run openapi && npm run generate:api` and commit api/openapi.json',
            'and web/src/api/generated/ with the change.',
        ]));
    }

    /**
     * One event, one ordinary member (so the LEFT JOIN in summary() yields a
     * row — an admin-only event would otherwise return an empty array, which
     * would make the shape assertion above vacuous), and an admin to call the
     * endpoint as. Follows ResponseSummaryTest's helpers: plain ::create(),
     * not a factory — Event has none, and User's factory defaults to the
     * 'user' role anyway.
     *
     * @return array{0: Event, 1: User}
     */
    private function seedOneEventAndAnAdmin(): array
    {
        $event = Event::create([
            'date' => '2027-01-09',
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 0,
        ]);

        User::create([
            'username' => 'demo.member',
            'password' => 'x',
            'role' => 'user',
            'instrument_id' => null,
        ]);

        $admin = User::create([
            'username' => 'zz.admin',
            'password' => 'x',
            'role' => 'admin',
            'instrument_id' => null,
        ]);

        return [$event, $admin];
    }

    /** @return list<string> */
    private function documentedProperties(): array
    {
        self::assertFileExists(self::OPENAPI, 'Run `npm run openapi` to generate it.');

        $document = json_decode((string) file_get_contents(self::OPENAPI), true, 512, JSON_THROW_ON_ERROR);
        $schema = $document['paths']['/responses']['get']['responses'][200]['content']['application/json']['schema'] ?? null;

        self::assertIsArray($schema, 'GET /responses has no documented 200 response schema at all.');
        self::assertSame('array', $schema['type'] ?? null, 'GET /responses must document an array.');
        self::assertIsArray(
            $schema['items']['properties'] ?? null,
            'GET /responses documents an array with no item properties — the #[Response] '
            .'attribute on ResponseController::index() is missing or unresolvable, and the '
            .'generated client will be untyped.'
        );

        return array_keys($schema['items']['properties']);
    }
}
