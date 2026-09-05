<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditEntry extends Model
{
    protected $table = 'audit_log';

    // Only created_at exists — an audit entry is never updated.
    public const UPDATED_AT = null;

    protected $fillable = [
        'actor_member_id',
        'action',
        'target_type',
        'target_id',
        'target_label',
    ];

    /** @return BelongsTo<Member, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'actor_member_id');
    }
}
