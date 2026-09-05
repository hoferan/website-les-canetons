<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Role extends Model
{
    protected $fillable = ['key', 'label_fr'];

    /** @return BelongsToMany<Member, $this> */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'member_roles');
    }

    /** @return Collection<int, Permission> */
    public function permissions(): Collection
    {
        return DB::table('role_permissions')
            ->where('role_id', $this->id)
            ->pluck('permission')
            ->map(fn (string $value): ?Permission => Permission::tryFrom($value))
            ->filter()
            ->values();
    }

    /**
     * Replace this role's permissions with exactly the given set.
     *
     * @param  array<int, Permission>  $permissions
     */
    public function syncPermissions(array $permissions): void
    {
        DB::transaction(function () use ($permissions): void {
            DB::table('role_permissions')->where('role_id', $this->id)->delete();

            $rows = collect($permissions)
                ->unique()
                ->map(fn (Permission $permission): array => [
                    'role_id' => $this->id,
                    'permission' => $permission->value,
                ])
                ->all();

            if ($rows !== []) {
                DB::table('role_permissions')->insert($rows);
            }
        });
    }
}
