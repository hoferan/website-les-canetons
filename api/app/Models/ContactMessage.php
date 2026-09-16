<?php

namespace App\Models;

use Database\Factories\ContactMessageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A message somebody sent through the public contact form.
 *
 * Stored raw and escaped at output time. `handled_at` is what the committee
 * inbox reads: null means the item is still open.
 *
 * The @property tags say what casts() already does at runtime, plus what
 * Eloquent's own timestamp handling does for `created_at`/`updated_at`.
 * Static analysis cannot read either, so without them these read as their raw
 * column types and every caller has to defend against a type that never
 * occurs. Attendance.php and Member.php carry the same block for the same
 * reason.
 *
 * `created_at` is `useCurrent()` in the migration, so it is never null on a
 * persisted row. `updated_at`, `handled_at`, `handled_by_member_id` and
 * `subject` are all nullable columns.
 *
 * @property int $id
 * @property string $first_name
 * @property string $last_name
 * @property string $email
 * @property string|null $subject
 * @property string $message
 * @property Carbon $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $handled_at
 * @property int|null $handled_by_member_id
 */
class ContactMessage extends Model
{
    /** @use HasFactory<ContactMessageFactory> */
    use HasFactory;

    protected $fillable = [
        'last_name',
        'first_name',
        'email',
        'subject',
        'message',
        'handled_at',
        'handled_by_member_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['handled_at' => 'datetime'];
    }

    /**
     * Who marked this handled, or null while it is open — or after they left
     * the band.
     *
     * @return BelongsTo<Member, $this>
     */
    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'handled_by_member_id');
    }
}
