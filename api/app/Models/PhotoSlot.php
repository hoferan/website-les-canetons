<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One place on the site that shows a library photo, keyed by a slot name the
 * page chooses. See the migration for why the key is free.
 *
 * @property string $slot
 * @property int $image_id
 * @property string|null $label
 * @property string|null $path
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class PhotoSlot extends Model
{
    /**
     * What a slot name may be: letters, digits, `.`, `_` and `-`, starting
     * with a letter or digit, at most 64 characters. A GUID fits, and so does
     * a readable name. Used as the route's constraint, so anything else is a
     * 404 that never reaches the database.
     */
    public const KEY = '[A-Za-z0-9][A-Za-z0-9._-]{0,63}';

    protected $primaryKey = 'slot';

    public $incrementing = false;

    protected $keyType = 'string';

    /** The slot of a history entry's photo, which goes when the entry does. */
    public static function forHistory(int $entryId): string
    {
        return "history-{$entryId}";
    }

    /** The slot of an event's poster, which goes when the event does. */
    public static function forEvent(int $eventId): string
    {
        return "event-{$eventId}";
    }

    /**
     * Whether a slot is an event's poster. Those are read on the event, which
     * decides who may see it, and never from the public list of slots, where a
     * draft's poster would tell a stranger the draft exists.
     */
    public static function isEventPoster(string $slot): bool
    {
        return preg_match('/^event-\d+$/', $slot) === 1;
    }

    /** @return BelongsTo<Image, $this> */
    public function image(): BelongsTo
    {
        return $this->belongsTo(Image::class);
    }
}
