<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use Tests\TestCase;

/**
 * The pages every problem document's `type` URI points at.
 *
 * The test that matters most is the last one: it takes the `type` off a REAL
 * error response and fetches it. Everything else here could pass while the two
 * halves still disagreed about how a URI is spelled.
 */
class ProblemPagesTest extends TestCase
{
    public function test_the_index_lists_every_problem_type(): void
    {
        $codes = $this->getJson('/api/problems')
            ->assertOk()
            ->json('problems.*.code');

        $this->assertSame(ErrorVocabulary::codes(), $codes);
    }

    public function test_one_problem_type_is_a_document(): void
    {
        $this->getJson('/api/problems/not-authenticated')
            ->assertOk()
            ->assertJson([
                'code' => 'not_authenticated',
                'type' => '/api/problems/not-authenticated',
                'status' => 401,
                'title' => 'Not authenticated',
            ])
            // The detail is the whole reason these pages exist: it says the
            // thing the status code cannot.
            ->assertJsonPath('detail', fn (string $detail) => str_contains($detail, '419'));
    }

    /**
     * A `type` URI is hyphenated; a `code` is snake_case. Somebody with the
     * code in front of them will type that, so both resolve.
     */
    public function test_the_underscored_spelling_resolves_too(): void
    {
        $this->getJson('/api/problems/not_authenticated')
            ->assertOk()
            ->assertJsonPath('code', 'not_authenticated');
    }

    public function test_a_browser_gets_a_page_and_a_tool_gets_json(): void
    {
        $page = $this->get('/api/problems/not-authenticated', [
            'Accept' => 'text/html,application/xhtml+xml,*/*;q=0.8',
        ])->assertOk();

        $this->assertStringContainsString('text/html', (string) $page->headers->get('Content-Type'));
        $page->assertSee('not_authenticated');

        $json = $this->getJson('/api/problems/not-authenticated')->assertOk();
        $this->assertStringContainsString('application/json', (string) $json->headers->get('Content-Type'));
    }

    /**
     * An unknown code answers in the very contract it documents — and that 404's
     * own `type` points back here, at a page that does exist.
     */
    public function test_an_unknown_problem_type_is_itself_a_problem_document(): void
    {
        $this->getJson('/api/problems/not-a-real-problem')
            ->assertStatus(404)
            ->assertJsonPath('code', 'not_found')
            ->assertJsonPath('type', '/api/problems/not-found');
    }

    /**
     * Unversioned, unlike everything in routes/api.php. A problem type outlives
     * a contract version, and clients branch on `type`, so it can never move.
     */
    public function test_the_pages_are_not_under_the_version_prefix(): void
    {
        $this->getJson('/api/problems')->assertOk();
        $this->getJson('/api/v1/problems')->assertStatus(404);
    }

    /**
     * Ungated, unlike /api/docs. That reference describes the whole schema;
     * this describes what one token means, and the same vocabulary already
     * ships to every visitor inside the SPA bundle. A `type` that resolved only
     * where API_DOCS_ENABLED happened to be on would be worse than one that
     * never resolved.
     */
    public function test_the_pages_do_not_depend_on_the_docs_flag(): void
    {
        config(['docs.enabled' => false]);

        $this->getJson('/api/problems')->assertOk();
        $this->getJson('/api/problems/not-found')->assertOk();
    }

    /**
     * THE ONE THAT CLOSES THE LOOP.
     *
     * Every other test here asserts the two halves separately and would pass
     * with them disagreeing — a `type` built one way and a route matching
     * another. This provokes a real failure, reads the `type` the API actually
     * emitted, and fetches it.
     */
    public function test_the_type_uri_from_a_real_error_resolves(): void
    {
        $type = $this->getJson('/api/v1/me')->assertStatus(401)->json('type');

        $this->assertIsString($type);
        $this->assertSame('/api/problems/not-authenticated', $type);

        // Fetch it by the PATH the emitted URI carries, so a change to either
        // the base or the route breaks this.
        $path = parse_url($type, PHP_URL_PATH);

        $this->getJson((string) $path)
            ->assertOk()
            ->assertJsonPath('code', 'not_authenticated');
    }

    /**
     * RELATIVE, and this guards the decision rather than the plumbing.
     *
     * An absolute production URL was the first attempt, and it had two faults
     * at once. It never resolved on a developer's machine — the URI named a
     * host the laptop was not — and, worse, a server running a newer build
     * emits codes production does not have yet, so its error documents pointed
     * at a production page that 404s for a type which genuinely exists on the
     * machine that answered.
     *
     * A relative reference fixes both while KEEPING the property that made the
     * absolute form attractive: the string is byte-identical in every
     * environment, so a client that branches on `type` still works when it is
     * pointed from a local stack at production. Per-host absolute URLs would
     * have given one problem type three identities and broken exactly that.
     */
    public function test_the_type_uri_is_relative_so_it_resolves_on_whichever_host_answered(): void
    {
        $type = (string) $this->getJson('/api/v1/me')->assertStatus(401)->json('type');

        $this->assertStringStartsWith('/', $type);
        $this->assertStringNotContainsString('://', $type, 'An absolute type names one host for every environment.');
        $this->assertStringNotContainsString('lescanetons.org', $type);
    }
}
