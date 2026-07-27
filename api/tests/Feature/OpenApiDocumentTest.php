<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * The exported OpenAPI document must describe what this API actually returns.
 *
 * Scramble infers most shapes from the controllers correctly, but it cannot know
 * about App\Exceptions\ApiError: out of the box it documents Laravel's default
 * 422 {message, errors} for validation, while this API answers 400
 * {error, code, fields[]}. App\Support\Scramble\* fixes that, and this test is
 * what stops the fix from silently regressing — a wrong error type in the
 * document becomes a wrong error type in the generated client.
 */
class OpenApiDocumentTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $path = sys_get_temp_dir().'/openapi-test.json';
        Artisan::call('scramble:export', ['--path' => $path]);
        $this->document = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_validation_failures_are_documented_as_400_not_422(): void
    {
        $contact = $this->document['paths']['/contact']['post']['responses'];

        $this->assertArrayHasKey('400', $contact, 'Validation is documented under the wrong status.');
        $this->assertArrayNotHasKey('422', $contact, "422 is Laravel's default shape; this API does not use it.");
    }

    public function test_the_validation_response_carries_the_error_contract(): void
    {
        $schema = $this->resolve($this->document['paths']['/contact']['post']['responses']['400']);
        $properties = $schema['properties'];

        $this->assertSame(['validation_failed'], $properties['code']['enum']);
        $this->assertSame('array', $properties['fields']['type']);
        $this->assertSame(
            ['field', 'reason'],
            $properties['fields']['items']['required'],
            'field and reason are always present; params is optional.'
        );
        $this->assertArrayNotHasKey('errors', $properties, "Laravel's native errors bag must not appear.");
    }

    public function test_unauthenticated_responses_carry_the_error_contract(): void
    {
        $schema = $this->resolve($this->document['paths']['/user']['get']['responses']['401']);

        $this->assertSame(['not_authenticated'], $schema['properties']['code']['enum']);
    }

    /**
     * Follow a $ref into components, since Scramble emits shared error responses
     * by reference rather than inline.
     *
     * @param  array<string,mixed>  $response
     * @return array<string,mixed>
     */
    private function resolve(array $response): array
    {
        if (isset($response['$ref'])) {
            $name = basename(str_replace('\\', '/', $response['$ref']));
            $response = $this->document['components']['responses'][$name];
        }

        return $response['content']['application/json']['schema'];
    }
}
