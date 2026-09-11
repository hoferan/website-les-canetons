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

    /**
     * REVERSED on 2026-09-11. This asserted the flag defaulted to OFF, on the
     * grounds that exposing the API surface was itself a risk.
     *
     * It is not, and that default was security through obscurity:
     * web/src/api/generated/endpoints.ts ships inside the SPA bundle every
     * visitor downloads, carrying every path, method and type more
     * machine-readably than the reference does. What protects this API is
     * auth:sanctum and the permission middleware, and documenting it weakens
     * neither.
     *
     * What WAS real about the old restriction is the console, not the content —
     * and that is now gated on its own, by the test below. Read config/docs.php
     * before reversing this again.
     */
    public function test_the_reference_defaults_to_on(): void
    {
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
            $this->assertTrue($config['enabled']);
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

    /**
     * The console is the half that is actually dangerous on a live site.
     *
     * The page primes the CSRF cookie and sends credentials so that "Send"
     * genuinely performs the request — which is the point of it on a local
     * stack, and one click from DELETE /api/v1/events/{event} against real data
     * for anyone reading the reference while logged in as the committee.
     *
     * Asserted on the RENDERED PAGE rather than on config('docs.interactive'),
     * because the config value is only worth anything if the view reads it. A
     * test through the config would pass with the Blade expression deleted.
     */
    public function test_the_try_it_console_is_hidden_in_production(): void
    {
        config(['docs.enabled' => true, 'docs.interactive' => false]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertSee('hideTestRequestButton: true', escape: false);
    }

    public function test_the_try_it_console_is_available_everywhere_else(): void
    {
        config(['docs.enabled' => true, 'docs.interactive' => true]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertSee('hideTestRequestButton: false', escape: false);
    }

    /**
     * The default the flag lands on when a server has never heard of the key.
     *
     * Read from the config FILE, like the enabled default above. APP_ENV unset
     * must read as production and turn the console OFF — the same fail-safe
     * direction App\Support\Environment takes for the staging ribbon, and the
     * one that matters, because the unsafe answer here is silent.
     */
    public function test_the_console_defaults_to_off_when_the_environment_is_unknown(): void
    {
        $keys = ['API_DOCS_INTERACTIVE', 'APP_ENV'];
        $saved = [];

        foreach ($keys as $key) {
            $saved[$key] = [
                'env' => array_key_exists($key, $_ENV) ? $_ENV[$key] : null,
                'server' => array_key_exists($key, $_SERVER) ? $_SERVER[$key] : null,
                'process' => getenv($key),
            ];
            unset($_ENV[$key], $_SERVER[$key]);
            putenv($key);
        }

        try {
            $config = require config_path('docs.php');
            $this->assertFalse($config['interactive']);
        } finally {
            foreach ($keys as $key) {
                if ($saved[$key]['env'] !== null) {
                    $_ENV[$key] = $saved[$key]['env'];
                }
                if ($saved[$key]['server'] !== null) {
                    $_SERVER[$key] = $saved[$key]['server'];
                }
                if ($saved[$key]['process'] !== false) {
                    putenv("{$key}={$saved[$key]['process']}");
                }
            }
        }
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

        $this->assertCount(1, $servers, 'One server, so there is nothing to pick wrongly.');
        // Relative, and carrying the version prefix: the committed document
        // pins https://lescanetons.org/api/v1, and a rewrite that dropped the
        // /v1 would point every "Send" button at routes that no longer exist.
        $this->assertSame('/api/v1', $servers[0]['url']);
    }

    public function test_the_server_label_names_the_environment_you_are_reading(): void
    {
        // The description is display text, so it earns its place by saying
        // WHICH host you are about to send requests to. "This environment"
        // said nothing the relative URL did not already say.
        config(['docs.enabled' => true]);

        foreach (['test' => 'TEST environment', 'local' => 'Local dev', 'qa' => 'QA environment'] as $appEnv => $label) {
            config(['app.env' => $appEnv]);

            $this->getJson('/api/docs.json')
                ->assertOk()
                ->assertJsonPath('servers.0.description', $label);
        }
    }

    public function test_an_unknown_environment_is_labelled_production(): void
    {
        // The same fail-safe the env ribbon has, and for the same reason: a
        // misspelled APP_ENV must not label the live API as staging. Shared
        // via App\Support\Environment so the two cannot drift apart.
        config(['docs.enabled' => true]);
        config(['app.env' => 'staging-2']);

        $this->getJson('/api/docs.json')
            ->assertOk()
            ->assertJsonPath('servers.0.description', 'Production');
    }

    public function test_the_label_can_never_become_a_route(): void
    {
        // The url is the safety property; the description is only a label.
        // This keeps them apart: whatever the label says, it must not be
        // something a reader could send a request to. A wrong label mislabels;
        // it must never misroute.
        config(['docs.enabled' => true]);
        config(['app.env' => 'test']);

        $description = $this->getJson('/api/docs.json')->assertOk()->json('servers.0.description');

        $this->assertStringNotContainsString('http', $description);
        $this->assertStringNotContainsString('lescanetons.org', $description);
        $this->assertStringNotContainsString('/', $description);
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

    public function test_the_page_points_at_this_apps_document(): void
    {
        config(['docs.enabled' => true]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSee('/api/docs.json');
    }

    public function test_the_page_does_not_route_requests_through_a_third_party(): void
    {
        // api/config/scramble.php sets proxyUrl => https://proxy.scalar.com,
        // and Scramble's own view passes its whole renderer config through — so
        // anyone modelling this page on that file inherits it. That would send
        // request bodies off-site, lose the session cookie on the hop, and fail
        // opaquely on TEST, where the proxy has no Basic Auth credentials.
        // These requests are same-origin and need no proxy.
        config(['docs.enabled' => true]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertDontSee('proxy.scalar.com')
            ->assertDontSee('proxyUrl', false);
    }

    public function test_the_page_replays_the_csrf_token_so_try_it_is_not_419(): void
    {
        // Sanctum's stateful SPA mode puts /api/v1/* behind the `web` middleware
        // group, so a mutating request without X-XSRF-TOKEN answers
        // 419 {"code":"invalid_session"}. web/src/api/http.ts does this for the
        // SPA; a docs page that skipped it would 419 on the first POST and
        // look broken rather than protected.
        config(['docs.enabled' => true]);

        $page = $this->get('/api/docs')->assertOk();

        $page->assertSee('X-XSRF-TOKEN', false);
        $page->assertSee('XSRF-TOKEN', false);
        // The cookie has to exist before it can be replayed, and only
        // /sanctum/csrf-cookie plants it.
        $page->assertSee('/sanctum/csrf-cookie', false);
        // Without this the session cookie is not sent and every authenticated
        // endpoint answers 401.
        $page->assertSee('credentials', false);
    }
}
