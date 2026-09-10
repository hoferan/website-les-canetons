<?php

namespace App\Models;

use App\Casts\UtcDateTime;
use Carbon\CarbonImmutable;
use Database\Factories\EventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A rehearsal or gig on the planning. The committee enters it, every member
 * reads it, and (a later release) responds to it.
 *
 * `starts_at`/`ends_at` replace the old date + two TIME columns + `weekend`
 * boolean: a multi-day event is one whose start and end fall on different
 * days, so there is no flag to keep in step with them. `ends_at` is NOT NULL
 * (decision C6) — see the migration for why that is what makes the flag
 * unnecessary rather than merely redundant.
 *
 * The @property tags below say what casts() already does at runtime. Larastan
 * runs at level 5 and cannot read casts(), so without them these read as their
 * raw column types and every caller has to defend against a type that never
 * occurs. Member.php carries the same block for the same reason.
 *
 * @property CarbonImmutable $starts_at
 * @property CarbonImmutable $ends_at
 * @property bool $is_public
 */
class Event extends Model
{
    /** @use HasFactory<EventFactory> */
    use HasFactory;

    /**
     * Mirrors the column default. Eloquent's create() only ever inserts
     * attributes it was given — it never reads back a DB-side DEFAULT after
     * the insert — so a caller that omits `is_public` (as
     * App\Http\Controllers will, once one exists) would otherwise see it as
     * null in the same request rather than false. Declaring it here keeps the
     * model's view of a fresh row consistent with what the migration defaults
     * the column to.
     */
    protected $attributes = [
        'is_public' => false,
    ];

    protected $fillable = [
        'title',
        'starts_at',
        'ends_at',
        'location',
        'attire',
        'is_public',
        'notes',
    ];

    /**
     * Every answer for this event.
     *
     * GET /api/events loads it CONSTRAINED TO THE CALLER, which is what
     * makes `myAttendance` one extra query for the whole list rather than
     * one per row. The chase list does not use this relation at all — it
     * fetches the answers once and setRelation()s them onto the roster.
     *
     * @return HasMany<Attendance, $this>
     */
    public function attendance(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    protected function casts(): array
    {
        return [
            // NOT 'datetime'. That cast keeps an incoming offset and then
            // formats it away, storing a Fribourg wall-clock hour in a column
            // every reader treats as UTC — measured, with numbers, in
            // App\Casts\UtcDateTime's docblock. It sits on the column rather
            // than on the endpoint that happens to write it today, so the
            // next writer is correct without knowing any of this.
            'starts_at' => UtcDateTime::class,
            'ends_at' => UtcDateTime::class,
            'is_public' => 'boolean',
        ];
    }
}
