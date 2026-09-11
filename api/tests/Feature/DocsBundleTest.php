<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The third-party bundle the reference page loads.
 *
 * The page is public by default now, and the bundle is 3.7 MB of somebody
 * else's JavaScript. Three properties are worth pinning, and none of them was
 * true before 2026-09-11.
 */
class DocsBundleTest extends TestCase
{
    private const CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.68.0/dist/browser/standalone.min.js';

    protected function setUp(): void
    {
        parent::setUp();
        config(['docs.enabled' => true]);
    }

    /**
     * A VERSION, not the bare package path.
     *
     * jsdelivr resolves `@scalar/api-reference` to whatever is published as
     * latest, re-resolved on every visit. That is how an "Ask AI" button, a
     * "Deploy" menu, MCP generation and a GitHub import arrived on this page
     * with no commit on our side — and it means any Scalar release can change
     * or break a public page nobody has touched.
     */
    public function test_the_bundle_is_pinned_to_a_version(): void
    {
        $page = (string) $this->get('/api/docs')->assertOk()->getContent();

        $this->assertStringContainsString(self::CDN, $page);
        $this->assertStringNotContainsString(
            '"https://cdn.jsdelivr.net/npm/@scalar/api-reference"',
            $page,
            'The bare package path resolves to `latest`; that is not a dependency, it is a subscription.'
        );
    }

    /**
     * Subresource integrity. An unpinned script from a CDN on a public page
     * executes whatever is served; with this the browser refuses anything that
     * is not the exact bundle that was reviewed.
     */
    public function test_the_bundle_carries_an_integrity_hash(): void
    {
        $this->get('/api/docs')
            ->assertOk()
            ->assertSee('integrity="sha384-', escape: false)
            ->assertSee('crossorigin="anonymous"', escape: false);
    }

    /**
     * Scalar's developer-tools toolbar is where "Ask AI", "Ask AI Agent" and
     * "Generate MCP" live. There is no per-feature switch in the bundle — no
     * hideAskAi or anything like it — so this flag is the whole mechanism.
     *
     * Its default is "localhost", which already kept it off deployed
     * environments. "never" makes its absence a decision rather than a default
     * somebody else owns and can change.
     */
    public function test_the_developer_tools_toolbar_is_off(): void
    {
        $this->get('/api/docs')
            ->assertOk()
            ->assertSee("showDeveloperTools: 'never'", escape: false);
    }

    /**
     * THREE switches, because Scalar surfaces this in three places and no
     * single flag covers all of them — measured in a browser on 2026-09-11,
     * not inferred from the schema. With only showDeveloperTools set to
     * "never", the toolbar went but the sidebar's "Ask AI" button and the
     * "Generate MCP" layer both remained on the page.
     *
     * Each defaults to enabled based on the URL the page is served from, so
     * they were live locally and would become live anywhere Scalar decided a
     * host qualified.
     */
    public function test_the_ai_and_mcp_integrations_are_off(): void
    {
        $page = $this->get('/api/docs')->assertOk();

        $page->assertSee('agent: { disabled: true }', escape: false);
        $page->assertSee('mcp: { disabled: true }', escape: false);
    }

    /**
     * The view and config/scramble.php name the same URL. They drifted apart
     * silently before, which is survivable while both are the bare package path
     * and is not once a version is in the string.
     */
    public function test_the_view_and_the_config_name_the_same_bundle(): void
    {
        $configured = config('scramble.renderers.scalar.cdn');

        $this->assertSame(self::CDN, $configured);

        $this->assertStringContainsString(
            (string) $configured,
            (string) $this->get('/api/docs')->assertOk()->getContent(),
        );
    }
}
