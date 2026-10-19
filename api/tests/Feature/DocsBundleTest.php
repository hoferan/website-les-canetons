<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The third-party bundle the reference page loads.
 *
 * The page can be public, and the bundle is 3.7 MB of somebody else's
 * JavaScript, so its version, integrity and features are pinned here.
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
     * A version, not the bare package path: jsdelivr resolves
     * `@scalar/api-reference` to the latest release on every visit, so any
     * Scalar release could add features to or break a page nobody touched.
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
     * Subresource integrity: the browser refuses anything but the exact
     * bundle that was reviewed.
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
     * "Generate MCP" live. The bundle has no per-feature switch, so this flag
     * is the whole mechanism. Its default is "localhost"; "never" keeps it off
     * even if Scalar changes that default.
     */
    public function test_the_developer_tools_toolbar_is_off(): void
    {
        $this->get('/api/docs')
            ->assertOk()
            ->assertSee("showDeveloperTools: 'never'", escape: false);
    }

    /**
     * Scalar surfaces these in three places and no single flag covers them:
     * with only showDeveloperTools set to "never", the sidebar's "Ask AI"
     * button and the "Generate MCP" layer stay on the page (checked in a
     * browser). Each defaults to enabled depending on the host serving the
     * page.
     */
    public function test_the_ai_and_mcp_integrations_are_off(): void
    {
        $page = $this->get('/api/docs')->assertOk();

        $page->assertSee('agent: { disabled: true }', escape: false);
        $page->assertSee('mcp: { disabled: true }', escape: false);
    }

    /**
     * The view and config/scramble.php name the same URL, so a version bump
     * cannot change one and silently miss the other.
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
