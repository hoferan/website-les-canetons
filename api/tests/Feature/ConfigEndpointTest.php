<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The SPA's only source of server configuration, including the env ribbon.
 * Public on purpose: an anonymous visitor sees the ribbon.
 */
class ConfigEndpointTest extends TestCase
{
    public function test_it_is_public(): void
    {
        $this->getJson('/api/v1/config')->assertStatus(200);
    }

    public function test_it_reports_the_environment(): void
    {
        config(['app.env' => 'test']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'test');
    }

    /**
     * Anything that is not a known non-prod environment collapses to prod, so a
     * stale or misspelled APP_ENV cannot paint a staging ribbon on the live site.
     */
    public function test_an_unknown_environment_collapses_to_prod(): void
    {
        config(['app.env' => 'staging-2']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'prod');
    }

    /**
     * Docker dev sets APP_ENV=local, Laravel's own value, which other code
     * (Scramble's docs-UI gate) keys off, so it cannot be renamed to `dev`.
     * The response translates `local` onto `dev`, or the SPA would show no
     * ribbon in local development.
     */
    public function test_local_is_mapped_to_the_dev_ribbon(): void
    {
        config(['app.env' => 'local']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'dev');
    }

    /**
     * Laravel's production value lands on 'prod' through the fallback today;
     * pinning it keeps an edit to the translation from breaking it silently.
     */
    public function test_production_is_mapped_to_prod(): void
    {
        config(['app.env' => 'production']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'prod');
    }

    /** Pinned directly so the translation's own `dev` entry cannot drift. */
    public function test_dev_is_mapped_to_dev(): void
    {
        config(['app.env' => 'dev']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'dev');
    }

    /**
     * The QA ribbon exists to stop someone mistaking it for production, and a
     * typo in the `qa` entry would otherwise ship unnoticed.
     */
    public function test_qa_is_mapped_to_qa(): void
    {
        config(['app.env' => 'qa']);

        $this->getJson('/api/v1/config')->assertJsonPath('env', 'qa');
    }

    /**
     * A leak guard. This endpoint is public, so a careless config() spread here
     * would publish database or mail credentials. The key check is an
     * allowlist: any new top-level key fails until it is added deliberately.
     */
    public function test_it_exposes_only_allowlisted_keys(): void
    {
        $body = $this->getJson('/api/v1/config')->json();

        $this->assertSame(['env', 'features'], array_keys($body));

        $serialised = (string) json_encode($body);
        foreach (['password', 'secret', 'token', 'DB_', 'MAIL_', 'hmac'] as $needle) {
            $this->assertStringNotContainsStringIgnoringCase(
                $needle,
                $serialised,
                "The public config response looks like it leaked a credential ({$needle})."
            );
        }
    }

    /**
     * The flag set is fixed in code, not read from the environment: the config
     * it draws from also carries secrets, so the shape is a reviewed list.
     */
    public function test_it_reports_every_known_feature_flag(): void
    {
        $this->getJson('/api/v1/config')
            ->assertOk()
            ->assertJsonStructure(['env', 'features' => ['calendar']]);
    }

    public function test_a_flag_is_off_when_the_environment_says_nothing(): void
    {
        config(['features.calendar' => null]);

        $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('features.calendar', false);
    }

    public function test_a_flag_is_on_only_when_the_environment_turns_it_on(): void
    {
        config(['features.calendar' => true]);

        $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('features.calendar', true);
    }

    /**
     * .env values arrive as strings. Without a cast, "false" is truthy in
     * JavaScript and the flag is permanently on wherever somebody wrote it out
     * longhand.
     */
    public function test_the_flags_are_booleans_not_strings(): void
    {
        config(['features.calendar' => 'false']);

        $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('features.calendar', false);
    }

    /**
     * '0' and '' are the other longhand .env shapes; with 'false' above, the
     * fail-closed rule is checked on all three.
     */
    public function test_the_digit_zero_string_reads_as_false(): void
    {
        config(['features.calendar' => '0']);

        $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('features.calendar', false);
    }

    public function test_the_empty_string_reads_as_false(): void
    {
        config(['features.calendar' => '']);

        $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('features.calendar', false);
    }

    /**
     * A cached response would keep a stale ribbon after a server-side change.
     *
     * Not an exact match: Symfony's Response::prepare() appends ", private" to
     * Cache-Control whenever a session cookie is present (this route runs
     * after StartSession, so one always is). That only tightens the directive,
     * so the test checks that `no-store` is present.
     */
    public function test_it_is_not_cacheable(): void
    {
        $header = $this->getJson('/api/v1/config')->headers->get('Cache-Control');

        $this->assertNotNull($header, 'Expected a Cache-Control header.');
        $this->assertStringContainsString('no-store', $header);
    }
}
