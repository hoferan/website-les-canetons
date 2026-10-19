<?php

namespace Tests;

use App\Http\Middleware\IdempotentWrite;
use App\Http\Middleware\PublicWriteGuard;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Support\EntityTag;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    /**
     * Acts as a member the way a real browser does.
     *
     * All three extras are required:
     *
     *   - the `Origin` header makes Sanctum treat this as a request from a
     *     stateful frontend, which is what attaches a session store to it;
     *   - `auth.started_at` satisfies EnforceAbsoluteSessionLifetime, which
     *     fails closed on a session it cannot date;
     *   - the flush lets a test act as a second member after a first has made
     *     a request. Without it the first session is still started,
     *     `withSession()` never re-stamps `auth.started_at`, and the second
     *     request answers 401. A browser does the same: a different person is
     *     a different session.
     *
     * Get any of them wrong and the request answers 401, which looks like a
     * broken endpoint when the test is what is broken.
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
     * A conditional write without one is refused with 428 (see
     * App\Http\Middleware\ConditionalWrite). This reads the tag straight out of
     * App\Support\EntityTag, so a test about what a write does needs no read
     * first. It uses the same code as the middleware on purpose: a helper that
     * computed the tag its own way would agree with itself and let every test
     * pass against a broken gate. Tests\Feature\ConditionalWriteTest takes the
     * header from the read over HTTP, the way a client does.
     *
     * @return array<string, string>
     */
    protected function ifMatch(string $facet, Model $model): array
    {
        return ['If-Match' => (string) EntityTag::compute($facet, $model)];
    }

    /**
     * Puts an image in a photo slot the way its first placement does, by
     * making the slot's row, or updates the row that is there.
     */
    protected function placePhoto(string $slot, int $imageId, ?string $label = null, ?string $path = null): void
    {
        PhotoSlot::query()->upsert(
            [[
                'slot' => $slot,
                'image_id' => $imageId,
                'label' => $label,
                'path' => $path,
                'created_at' => now(),
                'updated_at' => now(),
            ]],
            ['slot'],
            ['image_id', 'label', 'path', 'updated_at'],
        );
    }

    /** The image a slot shows, or null when the slot has no row. */
    protected function slotImage(string $slot): ?int
    {
        $id = PhotoSlot::query()->whereKey($slot)->value('image_id');

        return $id === null ? null : (int) $id;
    }

    /**
     * A body that satisfies PublicWriteGuard, merged over the caller's own.
     *
     * The decoy field must be present and empty. A real form always renders
     * it; omitting it is what a script does, and the guard refuses that.
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
     * The token signs a past timestamp so the suite never sleeps through the
     * guard's minimum fill-in time.
     *
     * The idempotency key is fresh on every call, one per render as in a real
     * form. Pass `key:` to reuse one (a retry), or `key: null` to send none
     * and be refused. See App\Http\Middleware\IdempotentWrite.
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
