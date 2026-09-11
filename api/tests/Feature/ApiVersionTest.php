<?php

namespace Tests\Feature;

use App\Http\Middleware\ApiVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The contract is mounted at /api/v1, and carries the machinery that will one
 * day retire it.
 *
 * Two things are pinned here. First, that the prefix is real — a route answers
 * under it and does not answer without it — because a prefix that silently
 * failed to apply would leave every URL working exactly as before and nothing
 * would notice until a v2 needed to exist.
 *
 * Second, that the retirement headers are absent by default and correct when
 * configured. They are three headers in three different wire formats (RFC 9745
 * wants a structured-field Date, RFC 8594 an HTTP-date, RFC 8288 a bracketed
 * URL), and the whole point of building them before they are needed is that
 * nobody has to get all three right during the week they matter.
 */
class ApiVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_contract_answers_under_the_version_prefix(): void
    {
        $this->getJson('/api/v1/config')->assertOk();
    }

    /**
     * The negative half, and it is the one that can actually fail. Without it,
     * a withRouting() call that ignored apiPrefix entirely would still pass the
     * test above — because /api/v1/config would simply not exist and the SPA
     * fallback is not in play here.
     */
    public function test_the_old_unversioned_path_is_gone(): void
    {
        $this->getJson('/api/config')->assertNotFound();
    }

    /**
     * routes/meta.php is deliberately NOT versioned: it describes and operates
     * the API rather than being part of it, and the deploy tooling posts to
     * /api/migrate from a script nobody wants to re-release in lockstep with a
     * contract version.
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
     * A malformed date emits NOTHING rather than something wrong. A client that
     * parses a garbage Sunset and believes this API stops answering on the
     * wrong day is worse off than one that never saw the header.
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
     * Configure a deprecation and the unversioned reference must stay silent —
     * it is not the thing being retired.
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
