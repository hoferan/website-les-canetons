<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The reference's prose, checked against the API it describes.
 *
 * `info.description` is often the only thing a developer reads, and prose
 * about a contract drifts as fast as the contract moves, so its worked example
 * is compared with what the API emits.
 */
class DocsDescriptionTest extends TestCase
{
    private function description(): string
    {
        $description = config('scramble.info.description');

        $this->assertIsString($description);
        $this->assertNotEmpty($description, 'The reference has no description; this guard reads nothing.');

        return $description;
    }

    /**
     * The worked example is what a developer copies, so it is compared member
     * for member with a problem document the API emits.
     */
    public function test_the_worked_example_matches_a_real_problem_document(): void
    {
        Route::post('/api/v1/_description_probe', fn () => request()->validate([
            'endsAt' => ['required'],
        ]));

        $real = $this->postJson('/api/v1/_description_probe', [])->assertStatus(400)->json();

        $documented = $this->exampleFromDescription();

        $this->assertSame(
            array_keys($real),
            array_keys($documented),
            "The example in info.description no longer matches what the API emits.\n"
            .'Fix the ```json block under "## Errors" in config/scramble.php.'
        );

        $this->assertSame($real['code'], $documented['code']);
        $this->assertSame($real['status'], $documented['status']);

        // The example must show a `detail`, abbreviated with an ellipsis
        // because the real sentence is long.
        $this->assertStringStartsWith(
            substr((string) ErrorVocabulary::detailFor('validation_failed'), 0, 40),
            (string) $documented['detail'],
            'The documented `detail` does not begin like the one this API emits.'
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function exampleFromDescription(): array
    {
        $description = $this->description();

        $errors = strstr($description, '## Errors');
        $this->assertIsString($errors, 'The reference has no "## Errors" section.');

        $this->assertTrue(
            (bool) preg_match('/```json\s*(\{.*?\})\s*```/s', $errors, $matches),
            'No JSON example found under "## Errors".'
        );

        $decoded = json_decode($matches[1], true);

        $this->assertIsArray($decoded, 'The example under "## Errors" is not valid JSON.');

        return $decoded;
    }
}
