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
}
