<?php

namespace App\Models;

use Database\Factories\ContactMessageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A message somebody sent through the public contact form.
 *
 * Stored raw and escaped at output time. `handled_at` is what the committee
 * inbox reads: null means the item is still open.
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

    /** Who marked this handled, or null while it is open — or after they left the band. */
    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'handled_by_member_id');
    }
}
