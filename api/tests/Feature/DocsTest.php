<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The API reference, served to a developer rather than to the SPA.
 *
 * Every test here sets config('docs.enabled') explicitly. phpunit.xml does not
 * pin API_DOCS_ENABLED, so an ambient value would be whatever
 * docker/api/env.docker says.
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
     * Hiding the reference would be security through obscurity:
     * web/src/api/generated/endpoints.ts ships inside the SPA bundle every
     * visitor downloads, with every path, method and type. auth:sanctum and
     * the permission middleware protect this API, and documenting it weakens
     * neither. The risk is the console, which is gated on its own (below).
     * Read config/docs.php before changing this default.
     */
    public function test_the_reference_defaults_to_on(): void
    {
        // Read from the config file with the variable absent, not from
        // config('docs.enabled'), which phpunit.xml or the container may have
        // set. Same technique as SessionLifetimeTest's secure-cookie default.
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
     * The console is the dangerous half on a live site. The page primes the
     * CSRF cookie and sends credentials so that "Send" performs the request,
     * which on a live site is one click from DELETE /api/v1/events/{event}
     * against real data for anyone logged in as the committee.
     *
     * Asserted on the rendered page, not on config('docs.interactive'): a test
     * through the config would pass with the Blade expression deleted.
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
     * Read from the config file, like the enabled default above. An unset
     * APP_ENV reads as production and turns the console off, the same
     * fail-safe direction App\Support\Environment takes for the ribbon. The
     * unsafe answer here would be silent.
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
        // Deliberate: TEST and QA are behind HTTP Basic Auth, and requiring a
        // session would hide the login endpoint's documentation until you
        // have logged in.
        config(['docs.enabled' => true]);

        $this->assertGuest();
        $this->get('/api/docs')->assertOk();
    }

    public function test_the_document_never_points_at_production(): void
    {
        // The most important assertion in this file. api/openapi.json pins
        // servers to the production URL so the export is byte-identical on
        // every machine (CI's drift check depends on it), and Scalar builds
        // every "Send" from that list. Served untouched, the docs page on TEST
        // would fire real requests, mutating ones included, at the live site.
        config(['docs.enabled' => true]);

        $servers = $this->getJson('/api/docs.json')->assertOk()->json('servers');

        $this->assertCount(1, $servers, 'One server, so there is nothing to pick wrongly.');
        // Relative, and carrying the version prefix: a rewrite that dropped
        // the /v1 would point every "Send" button at routes that do not exist.
        $this->assertSame('/api/v1', $servers[0]['url']);
    }

    public function test_the_server_label_names_the_environment_you_are_reading(): void
    {
        // The description is display text and says which host you are about
        // to send requests to, which the relative URL alone does not.
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
        // The env ribbon's fail-safe: a misspelled APP_ENV must not label the
        // live API as staging. Both read App\Support\Environment.
        config(['docs.enabled' => true]);
        config(['app.env' => 'staging-2']);

        $this->getJson('/api/docs.json')
            ->assertOk()
            ->assertJsonPath('servers.0.description', 'Production');
    }

    public function test_the_label_can_never_become_a_route(): void
    {
        // The url is the safety property and the description only a label, so
        // the label must never be something a reader could send a request to.
        config(['docs.enabled' => true]);
        config(['app.env' => 'test']);

        $description = $this->getJson('/api/docs.json')->assertOk()->json('servers.0.description');

        $this->assertStringNotContainsString('http', $description);
        $this->assertStringNotContainsString('lescanetons.org', $description);
        $this->assertStringNotContainsString('/', $description);
    }

    public function test_the_document_server_is_relative_so_it_cannot_name_an_environment(): void
    {
        // A relative URL resolves against the page's own origin (OpenAPI 3.1),
        // so the host you read the docs on is the host you call. An absolute
        // URL would depend on APP_URL being right in each server's
        // hand-written .env.
        config(['docs.enabled' => true]);

        $url = $this->getJson('/api/docs.json')->assertOk()->json('servers.0.url');

        $this->assertStringStartsWith('/', $url);
        $this->assertStringNotContainsString('http', $url);
        $this->assertStringNotContainsString('lescanetons.org', $url);
    }

    /**
     * The published contract names nothing internal.
     *
     * An internal name (the framework, a class that raised an error) is
     * useless to a reader and goes stale the moment the class moves.
     * Descriptions are prose nothing else checks, so the whole document is
     * scanned, catching a leak into a schema title, an example or an
     * operation summary too.
     */
    public function test_the_document_names_nothing_internal(): void
    {
        config(['docs.enabled' => true]);

        $document = (string) $this->getJson('/api/docs.json')->assertOk()->getContent();

        $forbidden = [
            'App\\' => 'an application namespace',
            'Illuminate\\' => 'a framework namespace',
            '.php' => 'a source file',
            'Laravel' => 'the framework',
            'Eloquent' => 'the ORM',
            'Scramble' => 'the document generator',
            'artisan' => 'the console tool',
        ];

        foreach ($forbidden as $needle => $what) {
            $this->assertStringNotContainsString(
                $needle,
                $document,
                "The published contract names {$what} (\"{$needle}\"). Readers cannot use it, "
                .'and it goes stale the moment that code moves.'
            );
        }

        // `::method()` in prose, such as "See ApiError::validation()".
        $this->assertDoesNotMatchRegularExpression(
            '/[A-Za-z]+::[a-zA-Z]+\(\)/',
            $document,
            'The published contract references a PHP method.'
        );
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
        // The rewrite touches one key; this notices if it grows.
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
        // and Scramble's own view passes its whole renderer config through, so
        // a page modelled on it inherits the proxy. That would send request
        // bodies off-site, lose the session cookie, and fail on TEST, where the
        // proxy has no Basic Auth credentials. These requests are same-origin.
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
        // 419 {"code":"invalid_session"}. web/src/api/http.ts replays it for
        // the SPA; a docs page that skipped it would 419 on the first POST.
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
