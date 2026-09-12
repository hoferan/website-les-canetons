<?php

namespace Tests\Feature;

use App\Support\Emits;
use App\Support\ErrorVocabulary;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * What an action says it can refuse with, and what the document says about it.
 *
 * The companion to Tests\Feature\DeclaredCodesTest, which asks only whether a
 * code reaches the contract SOMEWHERE. This one asks whether it reaches the
 * operation that raises it, which is the half a generated client narrows on.
 *
 * DERIVED FROM THE ROUTES, not from a list written out here, so an eleventh
 * annotated action is covered without an edit — and an extension that quietly
 * stops running fails here rather than going green on a document it no longer
 * touches. That failure is the one the whole A3 family of tests exists for: a
 * Scramble transformer that is never called changes nothing and says nothing.
 */
class EmittedCodesTest extends TestCase
{
    private const DOCUMENT = __DIR__.'/../../openapi.json';

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $document = json_decode((string) file_get_contents(self::DOCUMENT), true);

        $this->assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $this->document = $document;
    }

    public function test_every_code_an_action_declares_exists_in_the_vocabulary(): void
    {
        $checked = 0;
        $unknown = [];

        foreach ($this->annotations() as $where => $codes) {
            foreach ($codes as $code) {
                $checked++;

                if (ErrorVocabulary::statusFor($code) === null) {
                    $unknown[] = "{$where}: {$code}";
                }
            }
        }

        $this->assertGreaterThanOrEqual(15, $checked, 'Found almost no #[Emits] codes; this test is reading the wrong thing.');

        $this->assertSame([], $unknown, sprintf(
            "These #[Emits] codes are in no vocabulary entry:\n  - %s\n\n"
            .'A typo here is silent: App\Support\Scramble\DocumentsFailureModes drops a code it '
            .'cannot place, so the contract simply never mentions it.',
            implode("\n  - ", $unknown)
        ));
    }

    public function test_every_code_an_action_declares_reaches_that_operation(): void
    {
        $checked = 0;
        $missing = [];

        foreach ($this->annotations() as $where => $codes) {
            [$verb, $path] = explode(' ', $where, 2);
            $operation = $this->document['paths'][$path][strtolower($verb)] ?? null;

            if ($operation === null) {
                $missing[] = "{$where}: the operation is absent from the document";

                continue;
            }

            foreach ($codes as $code) {
                $checked++;
                $status = (string) ErrorVocabulary::statusFor($code);
                $declared = $this->codesOf($operation['responses'][$status] ?? null);

                if (! in_array($code, $declared, true)) {
                    $missing[] = sprintf(
                        '%s: %s is not in the %s enum (%s)',
                        $where,
                        $code,
                        $status,
                        $declared === [] ? 'no such response' : implode(', ', $declared),
                    );
                }
            }
        }

        $this->assertGreaterThanOrEqual(15, $checked, 'Found almost no #[Emits] codes; this test is reading the wrong thing.');

        $this->assertSame([], $missing, "The document is short of what these actions can answer with:\n  - ".implode("\n  - ", $missing));
    }

    public function test_no_code_is_declared_under_a_status_it_is_never_emitted_with(): void
    {
        // The other direction, and the one that catches a code filed under the
        // wrong number: a `409` enum naming `not_answerable` would look
        // plausible in a diff and be wrong in every client.
        $checked = 0;
        $wrong = [];

        foreach ($this->document['paths'] as $path => $item) {
            foreach ($item as $verb => $operation) {
                if (! in_array($verb, ['get', 'post', 'put', 'patch', 'delete'], true)) {
                    continue;
                }

                foreach ($operation['responses'] ?? [] as $status => $response) {
                    foreach ($this->codesOf($response) as $code) {
                        $checked++;
                        $expected = ErrorVocabulary::statusFor($code);

                        if ($expected !== null && $expected !== (int) $status) {
                            $wrong[] = strtoupper($verb)." {$path}: {$code} is declared under {$status}, and is emitted with {$expected}";
                        }
                    }
                }
            }
        }

        $this->assertGreaterThan(50, $checked, 'Found almost no declared codes; this test is reading the document wrong.');

        $this->assertSame([], array_values(array_unique($wrong)), "Codes declared under the wrong status:\n  - ".implode("\n  - ", array_unique($wrong)));
    }

    /**
     * The `code` enum of one response, through a $ref if it is one.
     *
     * @return list<string>
     */
    private function codesOf(mixed $response): array
    {
        if (! is_array($response)) {
            return [];
        }

        if (isset($response['$ref'])) {
            $name = (string) preg_replace('#^.*/#', '', (string) $response['$ref']);
            $response = $this->document['components']['responses'][$name] ?? [];
        }

        $enum = $response['content']['application/problem+json']['schema']['properties']['code']['enum'] ?? [];

        return is_array($enum) ? array_map('strval', $enum) : [];
    }

    /**
     * "VERB /path" => the codes that action's #[Emits] declares.
     *
     * Read from the ROUTE TABLE through reflection, so this sees what the
     * document generator sees rather than a copy of it.
     *
     * @return array<string, list<string>>
     */
    private function annotations(): array
    {
        $found = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            $action = $route->getActionName();

            // An INVOKABLE controller reports its class with no `@method`, and
            // six of this API's actions are invokable — including two that
            // carry #[Emits]. Skipping them would have quietly dropped a third
            // of what this test checks, which is what the floor below caught.
            [$class, $method] = str_contains($action, '@')
                ? explode('@', $action, 2)
                : [$action, '__invoke'];

            // `Closure` for a route defined inline, which has no action class
            // to reflect and answers method_exists() yes for __invoke.
            if ($class === 'Closure' || ! class_exists($class) || ! method_exists($class, $method)) {
                continue;
            }

            $codes = [];

            foreach ((new \ReflectionMethod($class, $method))->getAttributes(Emits::class) as $attribute) {
                foreach ($attribute->newInstance()->codes as $code) {
                    $codes[] = $code;
                }
            }

            if ($codes === []) {
                continue;
            }

            // Scramble strips the configured api_path, so `api/v1/contact` is
            // published as `/contact`.
            $path = '/'.ltrim(substr($route->uri(), strlen('api/v1')), '/');

            foreach ($route->methods() as $verb) {
                if ($verb !== 'HEAD') {
                    $found["{$verb} {$path}"] = $codes;
                }
            }
        }

        return $found;
    }
}
