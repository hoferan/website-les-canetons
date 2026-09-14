<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A seat on the committee — "Présidente", "Responsable costumes".
 *
 * Reference data, seeded by 2026_09_14_000001 and edited in the database until
 * the deferred editor ships, exactly like Section. `sort_order` is the point of
 * the table: it is what lets /committee print the seats in the band's own rank
 * order instead of alphabetically.
 *
 * No factory. A fresh test database already holds the eight seeded seats, so a
 * factory here would mostly produce a ninth nobody meant to create; tests look
 * the seat they want up by name, as they do for registers.
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
