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

        // The member a reader is most likely to follow.
        $this->assertSame(
            ErrorVocabulary::documentationFor('validation_failed'),
            $documented['documentation'],
            'The documented `documentation` link is not the one this API emits for that code.'
        );
        $this->assertSame($real['documentation'], $documented['documentation']);
        $this->assertSame($real['code'], $documented['code']);
        $this->assertSame($real['status'], $documented['status']);
    }

    /**
     * Every problem type is described. The generated section makes this true by
     * construction today — ErrorVocabulary::markdown() writes it — so this
     * really guards the day somebody replaces that with hand-written prose,
     * which is precisely when it would stop being true and nothing would say so.
     */
    public function test_every_problem_type_appears_in_the_reference(): void
    {
        $description = $this->description();

        foreach (ErrorVocabulary::codes() as $code) {
            // NO BACKTICKS: Scalar builds each heading's route from its plain
            // text, so a code span there collapses every one of these to the
            // same empty slug and none is addressable. This assertion is what
            // keeps them routable, which is what `documentation` depends on.
            $this->assertStringContainsString(
                '### '.$code.PHP_EOL,
                $description,
                "The reference documents no problem type `{$code}` as a plain-text heading."
            );
        }
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
     * `documentation` points at a heading this very description contains.
     *
     * The fragment is Scalar's slug for that heading. A stale one fails softly
     * in a browser — the reader lands on the reference without scrolling — so
     * this asserts the part that can be checked here: that the heading it names
     * exists at all.
     */
    public function test_every_documentation_link_names_a_heading_that_exists(): void
    {
        $description = $this->description();

        foreach (ErrorVocabulary::codes() as $code) {
            $fragment = parse_url(ErrorVocabulary::documentationFor($code), PHP_URL_FRAGMENT);

            // Scalar's route for a `### <code>` heading is the description
            // path plus the heading slugified — lowercased, underscores and
            // spaces to hyphens. Measured in a browser, not assumed.
            $this->assertSame(
                'description/'.str_replace('_', '-', $code),
                $fragment,
                "The documentation link for `{$code}` does not match Scalar's slug for its heading."
            );

            $this->assertStringContainsString('### '.$code.PHP_EOL, $description);
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
