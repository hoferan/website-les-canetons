<?php

namespace App\Models;

use Database\Factories\EventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

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
 * @property Carbon $starts_at
 * @property Carbon $ends_at
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

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'is_public' => 'boolean',
        ];
    }
}
