<?php

namespace App\Support;

use App\Models\AuditEntry;
use App\Models\Member;

/**
 * Records a privileged mutation.
 *
 * $targetLabel is captured by the CALLER, before the mutation, because the
 * target is usually gone by the time anyone reads this back. Passing
 * $target->fullName() after a delete would record an empty string.
 */
final class Audit
{
    public static function record(
        ?Member $actor,
        string $action,
        string $targetType,
        ?int $targetId,
        string $targetLabel,
    ): AuditEntry {
        return AuditEntry::create([
            'actor_member_id' => $actor?->id,
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'target_label' => $targetLabel,
        ]);
    }
}
