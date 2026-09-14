<?php

namespace Tests;

use App\Http\Middleware\IdempotentWrite;
use App\Http\Middleware\PublicWriteGuard;
use App\Models\Member;
use App\Support\EntityTag;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

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
     *
     * THE FLUSH IS THE THIRD, and it is what lets a test act as a SECOND
     * member after a first has already made a request. Without it that second
     * request answers 401 — measured 2026-09-12 — because the session from the
     * first is still started, so `withSession()` below never re-stamps
     * `auth.started_at` and EnforceAbsoluteSessionLifetime does what it
     * promises and fails closed. It reads as "the endpoint rejects this
     * member", which is a lie, and the two tests it caught were about two
     * committee members racing each other — precisely the scenario that cannot
     * be written without switching.
     *
     * Flushing is also what a browser does: a different person is a different
     * session, not the same one with a new name on it.
     */
    protected function actingAsMember(Member $member): static
    {
        $this->flushSession();

        return $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }

    /**
     * The `If-Match` header a conditional write owes for this thing.
     *
     * Every PATCH, DELETE and replace-all PUT on an event, a member, a booking
     * or an event's options is refused with 428 without one — see
     * App\Http\Middleware\ConditionalWrite. A test that is about what the write
     * DOES should not have to perform a read first to say so, so this reads the
     * tag straight out of App\Support\EntityTag.
     *
     * THROUGH THE SAME CODE THE MIDDLEWARE USES, deliberately. A helper that
     * computed a tag its own way would agree with itself and disagree with the
     * API, and every test here would pass against a broken gate.
     * Tests\Feature\ConditionalWriteTest is where the header is exercised the
     * way a client really gets it, over HTTP, from the read that hands it out.
     *
     * @return array<string, string>
     */
    protected function ifMatch(string $facet, Model $model): array
    {
        return ['If-Match' => (string) EntityTag::compute($facet, $model)];
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
     * THE IDEMPOTENCY KEY IS FRESH ON EVERY CALL, which is what a real form
     * does: one key per render, so two submissions of the same form are two
     * submissions and a retry of one is a retry. Pass `key:` to reuse one on
     * purpose — that is a retry — or `key: null` to send none and be refused.
     * See App\Http\Middleware\IdempotentWrite.
     *
     * @return array<string, string>
     */
    protected function publicWriteHeaders(int $ageSeconds = 30, ?string $key = ''): array
    {
        $issuedAt = (string) (time() - $ageSeconds);

        $headers = [
            PublicWriteGuard::TOKEN_HEADER => $issuedAt.'.'
                .hash_hmac('sha256', $issuedAt, (string) config('app.key')),
        ];

        if ($key === null) {
            return $headers;
        }

        $headers[IdempotentWrite::HEADER] = $key === '' ? (string) Str::uuid() : $key;

        return $headers;
    }
}
