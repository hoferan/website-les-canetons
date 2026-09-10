<?php

namespace App\Casts;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A datetime column that holds a UTC instant, whatever the writer hands it.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE `datetime` CAST. MEASURED 2026-09-10
 * against the docker stack: handing Event::create() the raw string
 * '2026-09-05T10:00:00+02:00' with a plain `datetime` cast persists
 * `2026-09-05 10:00:00`. Laravel parses the offset, KEEPS it, then formats the
 * result with the model's date format — which has no offset in it. So the
 * Fribourg wall-clock hour is written into a column every reader treats as
 * UTC, and the event lands two hours LATE:
 *
 *     2026-09-05T10:00:00+02:00  ->  stored 08:00 UTC  ->  reads back 10:00 Zurich
 *     with the plain cast        ->  stored 10:00 UTC  ->  reads back 12:00 Zurich
 *
 * That is not only a wrong time on screen. EventController::index() splits the
 * planning on BandTime::startOfToday(), a real UTC instant, so a row two hours
 * out also falls on the wrong side of upcoming/past for two hours a day.
 *
 * ON THE COLUMN, NOT ON THE ENDPOINT. This started life as a private helper on
 * EventController and moved here in review: `->utc()` is a property of what
 * the column means, so a second writer — an update endpoint, a series
 * generator, a seeder, an import — is correct by construction rather than by
 * remembering. A helper on one controller is the one shape that guarantees the
 * next one copy-pastes it.
 *
 * Not App\Support\BandTime either, which was considered and rejected: this
 * class knows nothing about Fribourg. The offset arrives inside the value, and
 * all this does is refuse to throw it away. BandTime's docblock claims to be
 * exactly one place that knows the band's zone, and putting an offset-agnostic
 * conversion there would falsify that.
 *
 * WHAT IT DOES NOT FIX: a string carrying no offset at all. '2026-09-05
 * 10:00:00' is read as UTC, because PHP's default timezone is
 * config('app.timezone') — which is right for a value that came out of the
 * database (that is exactly how it was stored) and wrong for one a client
 * typed as Fribourg wall-clock. Both cases pass through here indistinguishably,
 * so an offsetless value from a client must be composed through
 * BandTime::compose() or pinned by a Form Request before it gets this far. A
 * trailing `Z` is NOT part of that trap — it is an explicit offset and parses
 * as the correct instant.
 *
 * @implements CastsAttributes<CarbonImmutable, mixed>
 */
final class UtcDateTime implements CastsAttributes
{
    /**
     * Immutable, deliberately, for the reason BandTime gives: a caller that
     * writes `$event->starts_at->utc()` or `->addHour()` and expects the model
     * to be untouched is a bug a mutable Carbon does not catch — and with a
     * class cast the instance handed out is the one Eloquent caches, so the
     * mutation would stick.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?CarbonImmutable
    {
        return $value === null ? null : self::instant($value);
    }

    /**
     * Returns the storage string rather than a date object: Eloquent hands a
     * class cast's return value straight to the query builder, so the
     * conversion has to be finished here. The model's own date format is used
     * rather than a literal, so this cannot drift from how the connection
     * reads the column back.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : self::instant($value)->format($model->getDateFormat());
    }

    private static function instant(mixed $value): CarbonImmutable
    {
        return CarbonImmutable::parse($value)->utc();
    }
}
