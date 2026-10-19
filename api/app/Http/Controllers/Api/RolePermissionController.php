<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReplaceRolePermissionsRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;

#[Group('Members', weight: 50)]
class RolePermissionController extends Controller
{
    /**
     * Replace what a role grants.
     *
     * Requires `roles.manage` and the `If-Match` from the role's read.
     * `permissions` is everything the role grants afterwards, so send the ones
     * it should keep too. The change reaches every holder on their next
     * request.
     *
     * Refuses with `409 baseline_role_is_fixed` for the baseline role,
     * `409 cannot_remove_last_administrator` or
     * `409 cannot_remove_last_role_administrator` when the change would leave
     * nobody holding that permission, and `409 cannot_demote_self` when the
     * caller would lose one of them. When several apply, the baseline refusal
     * comes first and a last-holder refusal before the self-demotion.
     */
    #[Endpoint(operationId: 'rolePermission.replace')]
    #[Response(200, 'The role as it now stands.')]
    #[Emits('baseline_role_is_fixed', 'cannot_remove_last_administrator', 'cannot_remove_last_role_administrator', 'cannot_demote_self')]
    public function __invoke(ReplaceRolePermissionsRequest $request, Role $role): JsonResponse
    {
        $permissions = $request->permissions();

        // Checked before the write, so a refusal leaves no trace.
        //
        // Unlike PUT /members/{member}/roles, no sessions are ended. Every
        // request reads its permissions afresh (EffectivePermissions), so a
        // removed grant stops working on the holder's next request, and ending
        // every `musician` session after an edit would log the whole band out.
        AccessIntegrity::assertMayReplacePermissions($request->user(), $role, $permissions);

        $role->syncPermissions($permissions);

        Audit::record($request->user(), 'role.permissions_replaced', 'role', $role->id, (string) ($role->label_fr ?? $role->key));

        return response()->json(new RoleResource($role->load('members')));
    }
}
