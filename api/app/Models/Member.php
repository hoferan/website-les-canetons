<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A person associated with the band. See the members migration for why
 * credentials are nullable and why there is no email and no role column.
 *
 * Notifiable and MustVerifyEmail are deliberately absent: nothing here sends a
 * notification, and there is no address to verify.
 */
class Member extends Authenticatable
{
    protected $fillable = [
        'first_name',
        'last_name',
        'section_id',
        'username',
        'password',
        'must_change_password',
        'committee_title',
        'instructor_of_section_id',
        'public_visible',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'must_change_password' => 'boolean',
            'public_visible' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Section, $this> */
    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function fullName(): string
    {
        return $this->first_name.' '.$this->last_name;
    }

    /** Whether this person plays, and is therefore answerable for events. */
    public function isPlayer(): bool
    {
        return $this->section_id !== null;
    }
}
