<?php

namespace App\Models;

// Note: Notifiable/MustVerifyEmail traits from Laravel's default scaffold are
// intentionally omitted — this project sends no notification emails and has
// no email-verification flow, matching the old app's Auth behavior exactly.
//
// Deliberately no canRespond()/canManageEvents()/canViewSummary() convenience
// methods here yet — nothing in this sub-project needs capability gating
// (login/logout/user don't check it), so adding untested, unused wrappers
// around App\Support\Capability would be scope creep. Sub-project 2b (events/
// responses) adds them when it actually needs them.
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    protected $fillable = ['username', 'password', 'role', 'instrument_id'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }
}
