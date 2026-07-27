<?php

namespace Tests\Feature;

use App\Support\Scramble\AccessDeniedExceptionResponse;
use Dedoc\Scramble\Support\Type\ObjectType;
use Illuminate\Support\Facades\Artisan;
use ReflectionClass;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
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
 *
 * AccessDeniedExceptionResponse never surfaces in the exported document (see
 * its class docblock), so it is pinned separately by exercising toResponse()
 * directly instead of looking it up here.
 */
class OpenApiDocumentTest extends TestCase
{
    /**
     * Generated once per test-class run (not per test method) and reused —
     * exporting the whole document is the expensive part, and nothing here
     * mutates it.
     *
     * @var array<string,mixed>|null
     */
    private static ?array $document = null;

    public function test_validation_failures_are_documented_as_400_not_422(): void
    {
        $contact = $this->document()['paths']['/contact']['post']['responses'];

        $this->assertArrayHasKey('400', $contact, 'Validation is documented under the wrong status.');
        $this->assertArrayNotHasKey('422', $contact, "422 is Laravel's default shape; this API does not use it.");
    }

    public function test_the_validation_response_carries_the_error_contract(): void
    {
        $schema = $this->resolve($this->document()['paths']['/contact']['post']['responses']['400']);
        $properties = $schema['properties'];

        $this->assertSame(['validation_failed'], $properties['code']['enum']);
        $this->assertSame('array', $properties['fields']['type']);
        $this->assertSame(
            ['field', 'reason'],
            $properties['fields']['items']['required'],
            'field and reason are always present; params is optional.'
        );
        $this->assertContains(
            'fields',
            $schema['required'],
            'ApiError::validation() always populates at least one field entry, so a real 400 body always carries `fields`.'
        );
        $this->assertArrayNotHasKey('errors', $properties, "Laravel's native errors bag must not appear.");
    }

    public function test_unauthenticated_responses_carry_the_error_contract(): void
    {
        $schema = $this->resolve($this->document()['paths']['/user']['get']['responses']['401']);

        $this->assertSame(['not_authenticated'], $schema['properties']['code']['enum']);
    }

    /**
     * Scramble has no way to infer a 403 through the custom `capability:*`
     * middleware alias (see AccessDeniedExceptionResponse's docblock), so the
     * exported document never contains one to look up. Instantiate the
     * extension without its constructor — toResponse() and shouldHandle()
     * touch none of the injected Infer/TypeTransformer/Components
     * collaborators — and call the real methods directly, so this stays
     * pinned to the actual implementation rather than a re-description of it.
     */
    public function test_the_access_denied_extension_documents_403_directly(): void
    {
        $extension = (new ReflectionClass(AccessDeniedExceptionResponse::class))->newInstanceWithoutConstructor();
        $type = new ObjectType(AccessDeniedHttpException::class);

        $this->assertTrue($extension->shouldHandle($type), 'Should handle AccessDeniedHttpException.');

        $response = $extension->toResponse($type);

        $this->assertSame(403, $response->code);

        $schema = $response->content['application/json']->toArray();
        $this->assertSame(['access_denied'], $schema['properties']['code']['enum']);
    }

    /** @return array<string,mixed> */
    private function document(): array
    {
        if (self::$document === null) {
            $path = sys_get_temp_dir().'/openapi-test.json';
            Artisan::call('scramble:export', ['--path' => $path]);
            self::$document = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        return self::$document;
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
            $responses = $this->document()['components']['responses'] ?? [];

            $this->assertArrayHasKey(
                $name,
                $responses,
                "Expected a shared response component named '{$name}' (from \$ref '{$response['$ref']}'), ".
                'but components.responses has no such key. Scramble may have changed how it names/encodes refs.'
            );

            $response = $responses[$name];
        }

        return $response['content']['application/json']['schema'];
    }
}
