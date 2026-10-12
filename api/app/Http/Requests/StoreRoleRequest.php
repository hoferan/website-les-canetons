<?php

namespace App\Http\Requests;

use App\Support\Permission;

/**
 * A new role: its names, as RenameRoleRequest takes them, and everything it
 * grants. Nobody holds a new role, so granting anything here locks nobody out
 * and needs no AccessIntegrity check.
 */
class StoreRoleRequest extends RenameRoleRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return parent::rules() + ReplaceRolePermissionsRequest::permissionRules();
    }

    /** @return array<int, Permission> */
    public function permissions(): array
    {
        return ReplaceRolePermissionsRequest::toPermissions($this->validated('permissions'));
    }
}
