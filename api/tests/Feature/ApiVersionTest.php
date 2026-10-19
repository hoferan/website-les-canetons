<?php

namespace Tests\Feature;

use App\Http\Middleware\ApiVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The contract is mounted at /api/v1 and carries the headers that will retire
 * it.
 *
 * The prefix is checked both ways (a route answers under it and not without
 * it), because a prefix that failed to apply would leave every URL working and
 * nothing would notice until a v2 existed.
 *
 * The retirement headers are absent by default and correct when configured.
 * They use three wire formats: RFC 9745 a structured-field Date, RFC 8594 an
 * HTTP-date, RFC 8288 a bracketed URL.
 */
class ApiVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_contract_answers_under_the_version_prefix(): void
    {
        $this->getJson('/api/v1/config')->assertOk();
    }

    /**
     * The negative half: a route that answered both with and without the
     * prefix would pass the test above.
     */
    public function test_the_old_unversioned_path_is_gone(): void
    {
        $this->getJson('/api/config')->assertNotFound();
    }

    /**
     * routes/meta.php is deliberately unversioned: it describes and operates
     * the API rather than being part of it, and the deploy tooling posts to
     * /api/migrate from a script that should not move with a contract version.
     */
    public function test_the_meta_routes_stay_unversioned(): void
    {
        // 403, not 404: the route exists and refused the missing token. A 404
        // here would mean it had moved under the prefix with everything else.
        $this->postJson('/api/migrate')->assertStatus(403);

        $this->postJson('/api/v1/migrate')->assertNotFound();
    }

    public function test_nothing_is_announced_while_the_version_is_current(): void
    {
        $response = $this->getJson('/api/v1/config')->assertOk();

        $this->assertFalse($response->headers->has('Deprecation'));
        $this->assertFalse($response->headers->has('Sunset'));
        $this->assertFalse($response->headers->has('Link'));
    }

    public function test_a_deprecated_version_announces_all_three(): void
    {
        config([
            'api.deprecation.at' => '2026-11-01 00:00:00 UTC',
            'api.deprecation.sunset' => '2027-08-01 00:00:00 UTC',
            'api.deprecation.successor' => '/api/v2',
        ]);

        $response = $this->getJson('/api/v1/config')->assertOk();

        // RFC 9745: a structured-field Date, which is "@" then unix seconds.
        $this->assertSame('@'.strtotime('2026-11-01 00:00:00 UTC'), $response->headers->get('Deprecation'));

        // RFC 8594: an HTTP-date, always GMT.
        $this->assertSame('Sun, 01 Aug 2027 00:00:00 GMT', $response->headers->get('Sunset'));

        // RFC 8288 with the RFC 5829 relation.
        $this->assertSame('</api/v2>; rel="successor-version"', $response->headers->get('Link'));
    }

    /**
     * A malformed date emits no header. A client that believes a garbage
     * Sunset is worse off than one that never saw the header.
     */
    public function test_an_unparseable_date_announces_nothing(): void
    {
        config([
            'api.deprecation.at' => 'next tuesday-ish',
            'api.deprecation.sunset' => '',
        ]);

        $response = $this->getJson('/api/v1/config')->assertOk();

        $this->assertFalse($response->headers->has('Deprecation'));
        $this->assertFalse($response->headers->has('Sunset'));
    }

    /**
     * The meta routes share the `api` middleware group, so the only thing
     * keeping the retirement headers off them is ApiVersion's own prefix check.
     */
    public function test_the_unversioned_meta_routes_are_never_announced(): void
    {
        config([
            'api.deprecation.at' => '2026-11-01 00:00:00 UTC',
            'api.deprecation.successor' => '/api/v2',
            'docs.enabled' => true,
        ]);

        $response = $this->getJson('/api/docs.json');

        $this->assertFalse($response->headers->has('Deprecation'));
        $this->assertFalse($response->headers->has('Link'));
    }

    public function test_the_prefix_constant_is_what_routes_are_mounted_at(): void
    {
        $this->assertSame('api/v1', ApiVersion::PREFIX);
    }
}
