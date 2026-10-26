<?php

namespace App\Models;

use App\Support\BookingChangeKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One change to one booking: the journal the committee inbox nets against
 * its read mark (ADR 0035).
 *
 * `registration_id` has no foreign key on purpose. A cancelled booking's row
 * is deleted, and the journal is the only place left that says it existed.
 *
 * `actor_label` is the name captured when the change was made, as
 * App\Support\Audit does, so "by Paul" survives Paul's account being deleted.
 * Both actor columns are null for a guest on the public form.
 *
 * @property int $id
 * @property int $event_id
 * @property int|null $registration_id
 * @property BookingChangeKind $kind
 * @property int|null $actor_member_id
 * @property string|null $actor_label
 * @property Carbon $created_at
 */
class BookingChange extends Model
{
    // Never updated: a change happened or it did not.
    public const UPDATED_AT = null;

    protected $fillable = [
        'event_id',
        'registration_id',
        'kind',
        'actor_member_id',
        'actor_label',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['kind' => BookingChangeKind::class, 'created_at' => 'datetime'];
    }
}
