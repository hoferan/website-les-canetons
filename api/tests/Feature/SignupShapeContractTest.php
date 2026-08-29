<?php

namespace Tests\Feature;

use App\Models\Signup;
use App\Models\User;
use App\Support\Occasion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drift guard: the signup-summary shape is written twice, and the two must
 * agree.
 *
 * WHY TWICE. Scramble cannot infer through the Collection::map that
 * SignupController::index() builds its rows with, nor through
 * SignupStats::compute() — it emitted `"type": "string"` for the whole
 * response, which made the generated client's summary a bare string. That is
 * the third instance of one failure: GET /events and GET /responses were both
 * `string[]` for the same reason. So the shape is declared in a #[Response]
 * attribute, and it has to be a LITERAL — Scramble resolves a @phpstan-type
 * alias to a property-less object.
 *
 * WHY THIS ONE NEEDS A DATABASE, like ResponseShapeContractTest and unlike
 * EventShapeContractTest: there is no seam callable on an unsaved model.
 * SignupStats::compute() runs over rows, so the only honest way to learn what
 * the endpoint returns is to ask it.
 *
 * WHY IT ASSERTS ON application/json SPECIFICALLY. index() returns
 * JsonResponse|StreamedResponse, because `?format=xlsx` streams a spreadsheet.
 * The 200 therefore documents TWO content types, and the spreadsheet one is
 * legitimately a string. An assertion that took whichever came first would
 * pass on the xlsx branch and prove nothing about the JSON the SPA parses.
 */
class SignupShapeContractTest extends TestCase
{
    use RefreshDatabase;

    private const OPENAPI = __DIR__.'/../../openapi.json';

    /**
     * The endpoint is gated by souper_signup, which config/app.php defaults
     * OFF, so without this every request below 404s. Same setUp as
     * SignupSummaryTest.
     */
    protected function setUp(): void
    {
        parent::setUp();

        config(['app.souper_signup_enabled' => true]);
    }

    public function test_the_documented_shape_matches_what_the_endpoint_returns(): void
    {
        $body = $this->seedAndFetch();

        $this->assertShapeMatches($this->documentedSchema(), $body, '$');
    }

    /**
     * Two tables, one of them holding two reservations, and every menu used at
     * least once — so `tables[]`, `tables[].signups[]` and every count are all
     * non-empty. An empty list documents nothing: the recursive check below
     * cannot descend into an array with no first element, and the assertion
     * would pass vacuously.
     */
    private function seedAndFetch(): array
    {
        $this->signup('Table B', ['meat', 'child']);
        $this->signup('Table A', ['vegetarian']);
        $this->signup('Table B', ['meat']);

        $admin = User::create([
            'username' => 'zz.admin',
            'password' => 'x',
            'role' => 'admin',
            'instrument_id' => null,
        ]);

        $body = $this->actingAs($admin)->getJson('/api/signups')->assertOk()->json();

        self::assertNotEmpty($body['tables'] ?? [], 'No tables came back, so this proves nothing.');
        self::assertNotEmpty(
            $body['tables'][0]['signups'] ?? [],
            'No signups came back inside a table, so the nested shape proves nothing.'
        );

        return $body;
    }

    /** @param  string[]  $menus */
    private function signup(string $tableName, array $menus): void
    {
        Signup::create([
            'occasion' => Occasion::ACTIVE,
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1, 1700 Fribourg',
            'phone' => '+41 79 000 00 00',
            'email' => 'ada@example.com',
            'table_name' => $tableName,
            'menus' => $menus,
        ]);
    }

    /**
     * Walks the documented schema and the real body together, comparing the key
     * set at EVERY level rather than only the top one. Nested drift is the kind
     * that matters here: the whole point of the attribute is that the SPA can
     * read `tables[].signups[].menuCounts.meat` with a real type behind it.
     */
    private function assertShapeMatches(array $schema, mixed $actual, string $path): void
    {
        $type = $schema['type'] ?? null;

        if ($type === 'object') {
            self::assertIsArray($actual, "{$path} should be an object.");

            $documented = array_keys($schema['properties'] ?? []);
            $real = array_keys($actual);
            sort($documented);
            sort($real);

            self::assertSame($documented, $real, implode("\n", [
                "The shape in SignupController::index()'s #[Response] attribute has drifted",
                "from what the endpoint actually returns, at {$path}.",
                '',
                'Update the attribute, then run `npm run openapi && npm run generate:api`',
                'and commit api/openapi.json and web/src/api/generated/ with the change.',
            ]));

            foreach ($schema['properties'] as $key => $child) {
                $this->assertShapeMatches($child, $actual[$key], "{$path}.{$key}");
            }

            return;
        }

        if ($type === 'array') {
            self::assertIsArray($actual, "{$path} should be an array.");
            if ($actual === []) {
                return;
            }
            $this->assertShapeMatches($schema['items'], $actual[0], "{$path}[0]");
        }

        // Scalars: the key set is what drifts. Types are pinned by
        // SignupSummaryTest, which asserts on real values.
    }

    private function documentedSchema(): array
    {
        self::assertFileExists(self::OPENAPI, 'Run `npm run openapi` to generate it.');

        $document = json_decode((string) file_get_contents(self::OPENAPI), true, 512, JSON_THROW_ON_ERROR);

        // application/json BY NAME. The same 200 also documents the xlsx
        // media type, whose schema is legitimately a string.
        $schema = $document['paths']['/signups']['get']['responses'][200]['content']['application/json']['schema'] ?? null;

        self::assertIsArray($schema, 'GET /signups documents no JSON 200 response schema at all.');
        self::assertIsArray(
            $schema['properties'] ?? null,
            'GET /signups documents a JSON 200 with no properties — the #[Response] attribute '
            .'on SignupController::index() is missing or unresolvable, and the generated '
            .'client will be untyped.'
        );

        return $schema;
    }
}
