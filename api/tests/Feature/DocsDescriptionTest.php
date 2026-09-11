<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The reference's prose, checked against the API it describes.
 *
 * WHY THIS EXISTS. `info.description` is the first and often only thing a
 * developer reads, and until 2026-09-11 it was the single artifact in this
 * system with no guard at all — every other claim gets pinned by something.
 * It drifted within a day of being written, and André found it by reading the
 * page rather than by any test failing. Three contradictions at once: the
 * worked example showed a `type` the API had stopped emitting, one sentence
 * asserted those URIs were "not currently documents you can fetch" while the
 * section below it linked them, and a third described a page that no longer
 * existed.
 *
 * None of that is exotic. Prose about a contract rots exactly as fast as the
 * contract moves, and the only prose worth trusting is prose something checks.
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
     * THE ONE THAT MATTERS. The worked example is the thing a developer copies,
     * so it is compared against a problem document the API actually emits —
     * member for member, not merely "looks about right".
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

        // `detail` is the member this whole design now rests on, so the example
        // has to show one — abbreviated with an ellipsis, since the real
        // sentence is longer than an example wants to be.
        $this->assertStringStartsWith(
            substr((string) ErrorVocabulary::detailFor('validation_failed'), 0, 40),
            (string) $documented['detail'],
            'The documented `detail` does not begin like the one this API emits.'
        );
    }

    /**
     * Claims that were true once and are not any more.
     *
     * Each of these strings was in the description at some point today and each
     * described a design that has since been replaced. They are listed by the
     * exact words rather than by a pattern, because the point is not to forbid a
     * shape — it is to make sure these particular corpses stay buried.
     */
    public function test_the_reference_makes_no_retired_claim(): void
    {
        $description = $this->description();

        $retired = [
            // The absolute production URL, which never resolved off production.
            'https://lescanetons.org/problems/' => 'there is no `type` member at all now',
            // Asserted while the section below it linked them.
            'not currently documents you can fetch' => 'that sentence described URIs that no longer exist',
            // The relative-URL endpoint, deleted with its controller.
            '/api/problems/' => 'the /api/problems endpoint no longer exists',
            'standalone page' => 'there is no page; this section is the documentation',
            // The URN, which replaced the URLs and was then deleted itself.
            'urn:lescanetons:problem:' => '`type` was removed: it was a constant prefix in front of `code`',
            // The generated catalogue of twenty-one sections, replaced by an
            // inline `detail` on every error.
            '## Problem types' => 'the catalogue is gone; every error carries its own `detail`',
            '"documentation"' => 'there is no `documentation` member any more',
        ];

        foreach ($retired as $claim => $why) {
            $this->assertStringNotContainsString(
                $claim,
                $description,
                "The reference still says \"{$claim}\" — {$why}."
            );
        }
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
