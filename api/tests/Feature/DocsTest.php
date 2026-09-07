<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The API reference, served to a developer rather than to the SPA.
 *
 * Every test here sets config('docs.enabled') explicitly. phpunit.xml does not
 * pin API_DOCS_ENABLED, so leaving it ambient would make these tests read
 * whatever docker/api/env.docker happens to say — the exact trap that shipped
 * two red SessionLifetimeTest cases on this branch.
 */
class DocsTest extends TestCase
{
    use RefreshDatabase;

    public function test_both_routes_are_invisible_when_the_flag_is_off(): void
    {
        // 404, not 403: a 403 confirms the feature exists on this host.
        config(['docs.enabled' => false]);

        $this->get('/api/docs')->assertNotFound();
        $this->getJson('/api/docs.json')->assertNotFound();
    }

    public function test_the_flag_defaults_to_off(): void
    {
        // The property that matters on a server: a PROD .env that sets the key
        // to nothing, or a host provisioned before the key existed, must not
        // serve an interactive console over the whole API surface.
        //
        // Read from the config FILE with the variable absent, not from
        // config('docs.enabled') — phpunit.xml or the container may have set
        // it, and this asserts the default rather than the ambient value. Same
        // technique as SessionLifetimeTest's secure-cookie default test.
        $variable = 'API_DOCS_ENABLED';
        $fromEnv = array_key_exists($variable, $_ENV) ? $_ENV[$variable] : null;
        $fromServer = array_key_exists($variable, $_SERVER) ? $_SERVER[$variable] : null;
        $fromProcess = getenv($variable);

        unset($_ENV[$variable], $_SERVER[$variable]);
        putenv($variable);

        try {
            $config = require config_path('docs.php');
            $this->assertFalse($config['enabled']);
        } finally {
            if ($fromEnv !== null) {
                $_ENV[$variable] = $fromEnv;
            }
            if ($fromServer !== null) {
                $_SERVER[$variable] = $fromServer;
            }
            if ($fromProcess !== false) {
                putenv("{$variable}={$fromProcess}");
            }
        }
    }

    public function test_the_routes_answer_when_the_flag_is_on(): void
    {
        config(['docs.enabled' => true]);

        $this->get('/api/docs')->assertOk();
        $this->getJson('/api/docs.json')->assertOk();
    }

    public function test_the_docs_need_no_login(): void
    {
        // Deliberate. TEST and QA are behind HTTP Basic Auth, PROD has the flag
        // off, and requiring a session would mean you cannot read the login
        // endpoint's own documentation until you have logged in.
        config(['docs.enabled' => true]);

        $this->assertGuest();
        $this->get('/api/docs')->assertOk();
    }

    public function test_the_document_never_points_at_production(): void
    {
        // THE most important assertion in this file. api/openapi.json pins
        // servers to https://lescanetons.org/api so that the export is
        // byte-identical on every machine (CI's drift check depends on that) —
        // and Scalar builds every "Send" from that list. Served untouched, the
        // docs page on TEST would fire real requests, including mutating ones,
        // at the live site.
        config(['docs.enabled' => true]);

        $servers = $this->getJson('/api/docs.json')->assertOk()->json('servers');

        $this->assertSame([['url' => '/api', 'description' => 'Cet environnement']], $servers);
    }

    public function test_the_document_server_is_relative_so_it_cannot_name_an_environment(): void
    {
        // A relative URL is resolved by the reader against the page's own
        // origin (OpenAPI 3.1). Whatever host you are reading the docs on IS
        // the host you are calling, so it cannot name the wrong environment —
        // it names none. An absolute URL would depend on APP_URL being right
        // in each server's hand-written .env.
        config(['docs.enabled' => true]);

        $url = $this->getJson('/api/docs.json')->assertOk()->json('servers.0.url');

        $this->assertStringStartsWith('/', $url);
        $this->assertStringNotContainsString('http', $url);
        $this->assertStringNotContainsString('lescanetons.org', $url);
    }

    public function test_the_document_is_the_committed_one_and_not_an_empty_object(): void
    {
        // Proves the file was actually read. A controller that failed to load
        // it and returned [] would satisfy every servers assertion above.
        config(['docs.enabled' => true]);

        $body = $this->getJson('/api/docs.json')->assertOk();

        $body->assertJsonPath('openapi', '3.1.0');
        // A path the SPA client is generated from, so it cannot quietly vanish.
        $this->assertArrayHasKey('/config', $body->json('paths'));
    }

    public function test_nothing_else_in_the_document_is_altered(): void
    {
        // The rewrite is one key. If it ever grows, this is what notices.
        config(['docs.enabled' => true]);

        $served = $this->getJson('/api/docs.json')->assertOk()->json();
        $committed = json_decode(file_get_contents(base_path('openapi.json')), true);

        unset($served['servers'], $committed['servers']);
        $this->assertSame($committed, $served);
    }

    public function test_a_missing_document_is_a_404_rather_than_a_500(): void
    {
        // It means the artifact is incomplete. A docs page is not worth an
        // error page, and a 500 on a shared host means reading logs over FTP.
        config(['docs.enabled' => true]);
        config(['docs.document' => base_path('does-not-exist.json')]);

        $this->getJson('/api/docs.json')->assertNotFound();
    }
}
