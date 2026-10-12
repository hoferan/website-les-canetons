<?php

namespace App\Http\Requests;

use App\Support\Permission;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Everything a role is to grant afterwards, replacing what it grants now.
 *
 * `permissions` must be sent, even when empty: a role may grant nothing. An
 * unknown name fails validation against its own index, `permissions.0` and so
 * on. A name sent twice is granted once.
 */
class ReplaceRolePermissionsRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return self::permissionRules();
    }

    /** @return array<string, array<int, mixed>> */
    public static function permissionRules(): array
    {
        return [
            /** Every permission the role grants afterwards, by name. Send `[]` for none. */
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::in(array_column(Permission::cases(), 'value'))],
        ];
    }

    /** @return array<int, Permission> */
    public function permissions(): array
    {
        return self::toPermissions($this->validated('permissions'));
    }

    /**
     * Validated names as cases, each once. Deduplicated as strings: comparing
     * enum cases while sorting throws.
     *
     * @param  array<int, string>  $values
     * @return array<int, Permission>
     */
    public static function toPermissions(array $values): array
    {
        return array_map(
            fn (string $value): Permission => Permission::from($value),
            array_values(array_unique($values)),
        );
    }
}
