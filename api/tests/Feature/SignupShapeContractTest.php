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
     * Two tables, one of them holding two reservations.
     *
     * WHAT THE FIXTURE HAS TO GUARANTEE is only that neither `tables` nor
     * `tables[0].signups` comes back empty: the walk below cannot descend into
     * an array with no first element, so on an empty list it would pass
     * vacuously. The two assertions at the end rule that out.
     *
     * The rest is headroom, not coverage, and the two obvious readings of it
     * are both wrong. The walk descends `tables[0]` and `tables[0].signups[0]`
     * ONLY, so Table B and its second reservation are never visited. And the
     * spread of menus buys nothing either: SignupStats::zeroCounts() seeds all
     * three menu keys with array_fill_keys, so `menuCounts` has its three keys
     * whatever anyone ordered. It is shaped this way because it mirrors
     * SignupSummaryTest's fixture, and so that it still says something if the
     * walk ever checks past element 0.
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

            // Guarded rather than defaulted to []: a documented object with no
            // `properties` is the untyped-attribute failure one level down, and
            // it should say so here rather than warn on an undefined key and
            // then TypeError inside the recursion below.
            $properties = $schema['properties'] ?? null;
            self::assertIsArray(
                $properties,
                "{$path} is documented as an object with no properties, so nothing below it is typed."
            );

            $documented = array_keys($properties);
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

            // Required-ness, pinned at every level for the same reason
            // EventShapeContractTest pins it at its one level: the SPA reads
            // each of these fields unconditionally, and an optional one types
            // as `field?:` in the generated client, which turns every call site
            // into a possibly-undefined. Checked here rather than as a separate
            // flat test because this recursion already reaches all six levels.
            $required = $schema['required'] ?? [];
            sort($required);

            self::assertSame($documented, $required, implode("\n", [
                "Every property documented at {$path} is always present in the response,",
                'so every one of them must be listed as `required`.',
            ]));

            foreach ($properties as $key => $child) {
                $this->assertShapeMatches($child, $actual[$key], "{$path}.{$key}");
            }

            return;
        }

        if ($type === 'array') {
            self::assertIsArray($actual, "{$path} should be an array.");
            if ($actual === []) {
                return;
            }

            $items = $schema['items'] ?? null;
            self::assertIsArray(
                $items,
                "{$path} is documented as an array with no items schema, so its elements are untyped."
            );

            $this->assertShapeMatches($items, $actual[0], "{$path}[0]");

            return;
        }

        // Scalars. This is the same failure the attribute itself exists to
        // prevent — a bare scalar where a structure belongs — read the other
        // way round and one level down, so it is asserted rather than assumed:
        // a field documented as a string that starts returning {iso, display}
        // would otherwise fall out of both branches above, taking its whole
        // subtree with it, unchecked.
        self::assertIsNotArray($actual, "{$path} is documented as a scalar but came back as a structure.");

        // VALUE types are deliberately not pinned: a string documented as an
        // int passes this walk. SignupSummaryTest asserts on real values for
        // some of these fields — the totals, menuTotals, occasion.title,
        // tables[].name — but not for the contact fields, the per-signup counts
        // or five of the six occasion fields, so do not read this walk as
        // covering more than key sets, required-ness and scalar-vs-structure.
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
