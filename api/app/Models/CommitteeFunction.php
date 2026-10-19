<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A seat on the committee, such as "Présidente" or "Responsable costumes".
 *
 * Reference data, seeded by 2026_09_14_000001 and edited in the database:
 * the API only reads it. `sort_order` lets /committee list the seats in the
 * band's rank order instead of alphabetically.
 *
 * No factory: a fresh test database already holds the seeded seats, and tests
 * look up the one they want by name.
 */
class CommitteeFunction extends Model
{
    protected $fillable = ['name', 'sort_order'];

    /** @return HasMany<Member, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(Member::class);
    }
}
