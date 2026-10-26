<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Somebody marked an inbox item read, for the whole committee (ADR 0035).
 *
 * Keyed by inbox kind and the item's id, so the next source that needs a
 * shared read mark reuses this table instead of adding a column.
 *
 * Append-only. The current mark is the newest row, and "mark as unread"
 * deletes it, which brings back the counts as they stood at the mark before.
 *
 * `read_up_to` is a cursor into the source's own journal (for
 * `eventBookings`, a `booking_changes.id`), not a time: the reader marks what
 * their screen showed, so a change that lands while they read stays unread.
 *
 * @property int $id
 * @property string $kind
 * @property int $subject_id
 * @property int $read_up_to
 * @property int|null $read_by_member_id
 * @property string|null $read_by_label
 * @property Carbon $created_at
 */
class InboxRead extends Model
{
    public const EVENT_BOOKINGS = 'eventBookings';

    public const UPDATED_AT = null;

    protected $fillable = [
        'kind',
        'subject_id',
        'read_up_to',
        'read_by_member_id',
        'read_by_label',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    /** The mark in force for one item, or null when nobody has read it. */
    public static function latestFor(string $kind, int $subjectId): ?self
    {
        return self::query()
            ->where('kind', $kind)
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();
    }
}
