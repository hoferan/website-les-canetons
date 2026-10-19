<?php

namespace App\Casts;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A datetime column that holds a UTC instant, whatever the writer hands it.
 *
 * Not the `datetime` cast: given '2026-09-05T10:00:00+02:00', Laravel parses
 * the offset, keeps it, then formats with the model's date format, which has
 * no offset. The Fribourg wall-clock hour lands in a column every reader
 * treats as UTC, two hours late:
 *
 *     2026-09-05T10:00:00+02:00  ->  stored 08:00 UTC  ->  reads back 10:00 Zurich
 *     with the plain cast        ->  stored 10:00 UTC  ->  reads back 12:00 Zurich
 *
 * EventController::index() also splits the planning on
 * BandTime::startOfToday(), a real UTC instant, so such a row would fall on
 * the wrong side of upcoming/past for two hours a day.
 *
 * On the column rather than the endpoint, so every writer (update endpoint,
 * series generator, seeder, import) is correct without remembering.
 *
 * Not in App\Support\BandTime: this class knows nothing about Fribourg. The
 * offset arrives inside the value and this only keeps it, while BandTime is
 * the one place that knows the band's zone.
 *
 * It does not fix a string with no offset. '2026-09-05 10:00:00' is read as
 * UTC (PHP's default timezone is config('app.timezone')), which is right for
 * a value read from the database and wrong for one a client typed as Fribourg
 * wall-clock. The two are indistinguishable here, so an offsetless client
 * value must go through BandTime::compose() or be pinned by a Form Request
 * first. A trailing `Z` is an explicit offset and parses correctly.
 *
 * @implements CastsAttributes<CarbonImmutable, mixed>
 */
final class UtcDateTime implements CastsAttributes
{
    /**
     * Immutable on purpose: with a class cast the instance handed out is the
     * one Eloquent caches, so `$event->starts_at->addHour()` on a mutable
     * Carbon would silently change the model.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?CarbonImmutable
    {
        return $value === null ? null : self::instant($value);
    }

    /**
     * Returns the storage string rather than a date object, because Eloquent
     * hands a class cast's return value straight to the query builder. The
     * model's own date format keeps it in step with how the column is read
     * back.
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
