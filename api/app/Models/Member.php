<?php

namespace App\Models;

use App\Support\EffectivePermissions;
use App\Support\Permission;
use Database\Factories\MemberFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * A person the band tracks for events. Every member has an account
 * (`username` and `password` are NOT NULL); people the band only displays are
 * content, not rows here. The members migration explains why there is no
 * email and no role column.
 *
 * Notifiable and MustVerifyEmail are deliberately absent: nothing here sends a
 * notification, and there is no address to verify.
 *
 * The @property tags repeat what casts() does at runtime, which static
 * analysis cannot read.
 *
 * @property Carbon|null $last_login_at
 * @property bool $must_change_password
 * @property bool $public_visible
 */
class Member extends Authenticatable
{
    /** @use HasFactory<MemberFactory> */
    use HasFactory;

    protected $fillable = [
        'first_name',
        'last_name',
        'section_id',
        'username',
        'password',
        'must_change_password',
        'committee_function_id',
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

    /**
     * The seat this person holds on the committee, if any.
     *
     * Usually null. Whether it is set decides who appears on the public
     * /committee page.
     *
     * @return BelongsTo<CommitteeFunction, $this>
     */
    public function committeeFunction(): BelongsTo
    {
        return $this->belongsTo(CommitteeFunction::class);
    }

    public function fullName(): string
    {
        return $this->first_name.' '.$this->last_name;
    }

    /**
     * This member's answers, across every event.
     *
     * The chase list does not load answers through this relation: it fetches
     * one event's answers in a single query and setRelation()s them onto the
     * roster as `attendance`, to avoid an N+1.
     *
     * @return HasMany<Attendance, $this>
     */
    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    /** @return BelongsToMany<Role, $this> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'member_roles');
    }

    /** @return Collection<int, Permission> */
    public function permissions(): Collection
    {
        return EffectivePermissions::for($this->id);
    }

    public function hasPermission(Permission $permission): bool
    {
        return $this->permissions()->contains($permission);
    }
}
