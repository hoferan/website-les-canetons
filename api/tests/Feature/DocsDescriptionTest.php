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

        // The two members a reader is most likely to copy into their own code.
        $this->assertSame(
            ErrorVocabulary::typeUri('validation_failed'),
            $documented['type'],
            'The documented `type` is not the one this API emits for that code.'
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
            $this->assertStringContainsString(
                '### `'.$code.'`',
                $description,
                "The reference documents no problem type `{$code}`."
            );
            $this->assertStringContainsString(ErrorVocabulary::typeUri($code), $description);
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
            'https://lescanetons.org/problems/' => 'the `type` is a URN now, not an absolute URL',
            // Asserted while the section below it linked them.
            'not currently documents you can fetch' => 'a URN is not "not currently" fetchable, it is never fetchable',
            // The relative-URL endpoint, deleted with its controller.
            '/api/problems/' => 'the /api/problems endpoint no longer exists',
            'standalone page' => 'there is no page; this section is the documentation',
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
    public function test_the_documentation_member_names_a_section_that_exists(): void
    {
        $fragment = parse_url(ErrorVocabulary::DOCUMENTATION, PHP_URL_FRAGMENT);
        $heading = str_replace('-', ' ', basename((string) $fragment));

        $this->assertStringContainsString(
            '## '.ucfirst($heading),
            $this->description(),
            'The `documentation` member points at a section the reference does not have.'
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
