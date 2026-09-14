<?php

namespace Tests\Feature;

use PHPUnit\Framework\TestCase;

/**
 * The two constraints the document used to state on the way in and not on the
 * way out.
 *
 * A timestamp arrived as `format: date-time` and left as a bare `string`, and a
 * number carried the `maximum` its rules imposed but not the minimum — the
 * accepted and the returned spellings of one value, documented differently. Both
 * are now produced by a mechanism rather than by an annotation per field
 * (App\Support\Iso8601 with its schema extension, and
 * App\Support\Scramble\DocumentsNumericFloors), so what these tests guard is
 * that the mechanism still runs. A Scramble extension that stops being called
 * changes nothing and says nothing.
 *
 * Both derivations read the document or the source rather than a list written
 * out here, so a tenth timestamp or a seventh bound is covered without an edit.
 * Each carries a floor for the same reason ApiErrorVocabularyTest's do: a
 * derivation that silently matches nothing would otherwise pass.
 *
 * A plain PHPUnit TestCase — it reads two files and needs no booted framework.
 */
class PublishedConstraintsTest extends TestCase
{
    private const DOCUMENT = __DIR__.'/../../openapi.json';

    private const REQUESTS_DIR = __DIR__.'/../../app/Http/Requests';

    /**
     * Timestamps known to be in the document, so a scan that stops finding
     * properties fails here rather than passing on an empty set.
     */
    private const MUST_INCLUDE_TIMESTAMPS = [
        'startsAt', 'endsAt', 'recordedAt', 'createdAt', 'lastLoginAt',
        'registrationOpensAt', 'registrationClosesAt', 'opensAt', 'closesAt',
    ];

    /** The same floor for the numeric bounds. */
    private const MUST_INCLUDE_BOUNDS = [
        'registrationMaxGuests', 'quantity', 'priceCents', 'sortOrder',
    ];

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $document = json_decode((string) file_get_contents(self::DOCUMENT), true);

        self::assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $this->document = $document;
    }

    public function test_every_timestamp_the_api_returns_says_it_is_one(): void
    {
        $found = [];
        $bare = [];

        foreach ($this->document['components']['schemas'] as $name => $schema) {
            foreach ($this->properties($schema) as $property => $spec) {
                if (! str_ends_with($property, 'At')) {
                    continue;
                }

                $found[] = $property;

                if (($spec['format'] ?? null) !== 'date-time') {
                    $bare[] = "{$name}.{$property}";
                }
            }
        }

        $this->assertScanWorked($found, self::MUST_INCLUDE_TIMESTAMPS, 'timestamps');

        self::assertSame([], $bare, sprintf(
            "These timestamps are published as a bare string:\n  - %s\n\n"
            .'A Resource renders one through App\\Support\\Iso8601, which '
            .'App\\Support\\Scramble\\Iso8601ToSchema turns into `format: date-time`. '
            .'A field that left as `->toIso8601String()` is indistinguishable from a title.',
            implode("\n  - ", $bare)
        ));
    }

    /**
     * A nullable timestamp must stay nullable, which is the half a format is
     * most likely to cost.
     *
     * Scramble reads the EXPRESSION rather than the declared return type, so a
     * `?Iso8601` helper publishes a required `string` and every generated client
     * stops expecting the null. It has happened once, to `registrationOpensAt`.
     */
    public function test_a_timestamp_that_can_be_absent_is_still_nullable(): void
    {
        $optional = [
            'EventResource' => ['registrationOpensAt', 'registrationClosesAt'],
            'RegistrationFormResource' => ['opensAt', 'closesAt'],
            'MemberResource' => ['lastLoginAt'],
        ];

        foreach ($optional as $schema => $properties) {
            foreach ($properties as $property) {
                $type = $this->document['components']['schemas'][$schema]['properties'][$property]['type'] ?? null;

                self::assertSame(['string', 'null'], $type, "{$schema}.{$property} lost its null.");
            }
        }
    }

    public function test_every_numeric_floor_a_rule_enforces_is_published(): void
    {
        $rules = $this->numericFloors();

        $this->assertScanWorked(array_keys($rules), self::MUST_INCLUDE_BOUNDS, 'numeric bounds');

        foreach ($rules as $field => $minimum) {
            $published = $this->requestProperties($field);

            self::assertNotSame([], $published, "No request schema in the document carries a `{$field}` property.");

            foreach ($published as $where => $spec) {
                self::assertSame($minimum, $spec['minimum'] ?? null, sprintf(
                    '%s publishes no lower bound, while its rules reject anything under %d. '
                    .'Scramble maps `max:` and drops `gt:`/`gte:`; '
                    .'App\\Support\\Scramble\\DocumentsNumericFloors is what closes that.',
                    $where,
                    $minimum
                ));
            }
        }
    }

    // ---------------------------------------------------------- the derivations

    /**
     * Every `gt:`/`gte:` rule in a Form Request, as field name => the `minimum`
     * it implies.
     *
     * Read from the source rather than by instantiating each Form Request,
     * because several of them reach for the current route inside rules().
     *
     * @return array<string, int>
     */
    private function numericFloors(): array
    {
        $floors = [];

        foreach (glob(self::REQUESTS_DIR.'/*.php') ?: [] as $file) {
            $source = (string) file_get_contents($file);

            preg_match_all(
                "/'([A-Za-z0-9_.*]+)'\s*=>\s*\[[^\]]*'(gte?):(\d+)'/",
                $source,
                $matches,
                PREG_SET_ORDER
            );

            foreach ($matches as [, $key, $rule, $bound]) {
                // `options.*.priceCents` is one property named `priceCents`
                // inside a nested object; the document has no dotted names.
                $field = (string) array_slice(explode('.', $key), -1)[0];

                // gt:N on an integer is minimum N+1, which is the same set.
                $floors[$field] = $rule === 'gte' ? (int) $bound : (int) $bound + 1;
            }
        }

        return $floors;
    }

    /**
     * Every place a request schema declares a property of this name, keyed by
     * where it is so a failure names it.
     *
     * Request schemas only: a response can carry the same field with no bound,
     * legitimately — `EventResource.registrationMaxGuests` reports what was
     * stored rather than constraining what may be sent.
     *
     * @return array<string, array<string, mixed>>
     */
    private function requestProperties(string $field): array
    {
        $found = [];

        foreach ($this->document['components']['schemas'] as $name => $schema) {
            if (! str_ends_with($name, 'Request')) {
                continue;
            }

            foreach ($this->properties($schema) as $property => $spec) {
                if ($property === $field) {
                    $found["{$name}.{$field}"] = $spec;
                }
            }
        }

        return $found;
    }

    /**
     * Every property of a schema, including the ones inside a nested object or
     * an array's items — `options.*.priceCents` lives two levels down.
     *
     * @param  array<string, mixed>  $schema
     * @return array<string, array<string, mixed>>
     */
    private function properties(array $schema): array
    {
        $properties = [];

        foreach ($schema['properties'] ?? [] as $name => $spec) {
            if (! is_array($spec)) {
                continue;
            }

            $properties[$name] = $spec;
            $properties = [...$properties, ...$this->properties($spec)];

            if (isset($spec['items']) && is_array($spec['items'])) {
                $properties = [...$properties, ...$this->properties($spec['items'])];
            }
        }

        return $properties;
    }

    /**
     * @param  list<string>  $found
     * @param  list<string>  $floor
     */
    private function assertScanWorked(array $found, array $floor, string $label): void
    {
        $missing = array_values(array_diff($floor, $found));

        self::assertSame([], $missing, sprintf(
            'The %s derivation found none of: %s. It has stopped matching, and every '
            .'assertion below it would pass on an empty set.',
            $label,
            implode(', ', $missing)
        ));
    }
}
