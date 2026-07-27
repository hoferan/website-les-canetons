<?php

namespace Tests\Feature;

use App\Support\Occasion;
use Tests\TestCase;

/**
 * The SPA's only source of server configuration.
 *
 * Replaces what the old app rendered server-side from config.php: the env ribbon
 * (App\Env), the souper_signup gate (App\Features) and the occasion copy. Public
 * on purpose — an anonymous visitor sees both the ribbon and the signup form.
 */
class ConfigEndpointTest extends TestCase
{
    public function test_it_is_public(): void
    {
        $this->getJson('/api/config')->assertStatus(200);
    }

    public function test_it_reports_the_environment(): void
    {
        config(['app.env' => 'test']);

        $this->getJson('/api/config')->assertJsonPath('env', 'test');
    }

    /**
     * Mirrors App\Env exactly: anything that is not a known non-prod environment
     * collapses to prod, so a stale or misspelled APP_ENV can never paint a
     * staging ribbon on the live site.
     */
    public function test_an_unknown_environment_collapses_to_prod(): void
    {
        config(['app.env' => 'staging-2']);

        $this->getJson('/api/config')->assertJsonPath('env', 'prod');
    }

    /**
     * The regression this endpoint must not repeat: Docker dev sets
     * APP_ENV=local (Laravel's own idiomatic value for local development —
     * other code, e.g. Scramble's docs-UI gate, keys off that literal string,
     * so renaming it to `dev` is not an option). Locally the OLD app's
     * config.docker.php sets its own 'env' to 'dev' and shows a DEV ribbon, so
     * this response must translate `local` onto `dev` too, or the SPA would
     * show no ribbon at all in local development.
     */
    public function test_local_is_mapped_to_the_dev_ribbon(): void
    {
        config(['app.env' => 'local']);

        $this->getJson('/api/config')->assertJsonPath('env', 'dev');
    }

    /**
     * Laravel's idiomatic production value must land on 'prod' deliberately,
     * not merely by falling through the same branch as a genuinely unknown
     * value — pinning this stops a future edit to the translation map from
     * silently breaking it.
     */
    public function test_production_is_mapped_to_prod(): void
    {
        config(['app.env' => 'production']);

        $this->getJson('/api/config')->assertJsonPath('env', 'prod');
    }

    public function test_the_occasion_is_absent_when_the_feature_is_off(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $this->getJson('/api/config')
            ->assertJsonPath('features.souper_signup', false)
            ->assertJsonPath('occasion', null);
    }

    public function test_the_occasion_is_served_when_the_feature_is_on(): void
    {
        config(['app.souper_signup_enabled' => true]);

        $response = $this->getJson('/api/config');

        $response->assertJsonPath('occasion.title', Occasion::active()['title']);
        $response->assertJsonPath('occasion.maxGuests', Occasion::MAX_GUESTS);
        $response->assertJsonPath('occasion.menus.0.value', Occasion::MENU_VALUES[0]);
        $response->assertJsonPath('occasion.menus.0.label', Occasion::MENU_LABELS[Occasion::MENU_VALUES[0]]);
    }

    /**
     * MENU_INFO (description + price) is the reason MENU_INFO was moved into
     * App\Support\Occasion at all — this pins it so a future refactor cannot
     * silently drop it from the response while the label/value fields above
     * keep passing.
     */
    public function test_the_menus_carry_description_and_price(): void
    {
        config(['app.souper_signup_enabled' => true]);

        $response = $this->getJson('/api/config');

        $value = Occasion::MENU_VALUES[0];
        $response->assertJsonPath('occasion.menus.0.description', Occasion::MENU_INFO[$value]['description']);
        $response->assertJsonPath('occasion.menus.0.price', Occasion::MENU_INFO[$value]['price']);
    }

    /**
     * LEAK GUARD. This endpoint is public and unauthenticated, so it is the one
     * place where a careless config() spread would publish database or mail
     * credentials to the internet. The assertion is an allowlist, not a
     * blocklist: any new top-level key fails until it is added deliberately.
     */
    public function test_it_exposes_only_allowlisted_keys(): void
    {
        config(['app.souper_signup_enabled' => true]);

        $body = $this->getJson('/api/config')->json();

        $this->assertSame(['env', 'features', 'occasion'], array_keys($body));
        $this->assertSame(['souper_signup'], array_keys($body['features']));

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
     * A stale flag or ribbon would survive a server-side change, so this must
     * never be cached — the old app re-read config.php on every request.
     *
     * Not an exact-match assertion: Symfony's Response::prepare() appends
     * ", private" to Cache-Control whenever a session cookie is present (this
     * route runs after StartSession, so one always is), regardless of what the
     * controller set. That addition only tightens the directive further — it
     * never weakens it into something revalidate-and-reuse — so this asserts
     * the `no-store` directive is really present rather than the header's exact
     * string value.
     */
    public function test_it_is_not_cacheable(): void
    {
        $header = $this->getJson('/api/config')->headers->get('Cache-Control');

        $this->assertNotNull($header, 'Expected a Cache-Control header.');
        $this->assertStringContainsString('no-store', $header);
    }
}
