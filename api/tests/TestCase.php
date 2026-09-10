<?php

namespace Tests;

use App\Http\Middleware\PublicWriteGuard;
use App\Models\Member;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Acts as a member the way a real browser does.
     *
     * BOTH EXTRAS ARE REQUIRED, and neither is obvious:
     *
     *   - the `Origin` header makes Sanctum treat this as a request from a
     *     stateful frontend, which is what attaches a session store to it at
     *     all;
     *   - `auth.started_at` satisfies EnforceAbsoluteSessionLifetime, which
     *     fails closed on a session it cannot date.
     *
     * Get either wrong and the request answers 401, which reads as a broken
     * endpoint rather than a broken test. That three-line incantation was
     * copy-pasted into ten test files and twenty-four call sites before it
     * moved here.
     */
    protected function actingAsMember(Member $member): static
    {
        return $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }

    /**
     * A body that satisfies PublicWriteGuard, merged over the caller"s own.
     *
     * The decoy field must be PRESENT and empty. A real form always renders
     * it, so sending it costs a browser nothing; omitting it is what a
     * script does, and that is the case the guard exists to catch.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function publicWriteBody(array $payload = []): array
    {
        return array_merge([PublicWriteGuard::HONEYPOT_FIELD => ''], $payload);
    }

    /**
     * Headers that satisfy App\Http\Middleware\PublicWriteGuard.
     *
     * The token is built by SIGNING A PAST TIMESTAMP rather than by issuing
     * one and waiting. The guard's whole point is that a real form takes
     * seconds to fill in, so a suite that actually slept would add two
     * seconds to every public-write test — and the thing worth testing is
     * the signature and the window, not the clock.
     *
     * @return array<string, string>
     */
    protected function publicWriteHeaders(int $ageSeconds = 30): array
    {
        $issuedAt = (string) (time() - $ageSeconds);

        return [
            PublicWriteGuard::TOKEN_HEADER => $issuedAt.'.'
                .hash_hmac('sha256', $issuedAt, (string) config('app.key')),
        ];
    }
}
