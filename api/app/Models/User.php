<?php

namespace App\Models;

// Intentional deviation from Laravel's default user (documented so it stays a
// deliberate decision, not something a future maintainer "fixes" back):
// this project authenticates by USERNAME, not email. Members are children
// aged ~6-16 in the Guggenmusik who often have no email, and we don't force
// parents to share one — so there is no email/name/email_verified_at column.
// Auth::attempt works unchanged against the username field (Laravel's auth
// core is field-agnostic). Passwords are always stored hashed via the
// 'hashed' cast below; admins set/reset them in the members' admin UI (the
// plaintext they type is hashed on save), so end users need no crypto
// knowledge while the database stays secure at rest.
//
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
