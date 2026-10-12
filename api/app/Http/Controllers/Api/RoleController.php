<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RenameRoleRequest;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

#[Group('Members', weight: 50)]
class RoleController extends Controller
{
    /**
     * List the roles.
     *
     * Requires `members.manage` or `roles.manage`: the roster form reads it
     * to assign roles, and the role editor to list them.
     *
     * Returns every role with what it grants and the names the committee
     * typed. A role with neither name is a seeded one nobody has renamed;
     * translate its `key` instead.
     */
    #[Endpoint(operationId: 'role.index')]
    public function index(): AnonymousResourceCollection
    {
        // `index()`, not `__invoke()` — see SectionController for why.
        //
        // The permissions travel with the role rather than being fetched
        // per member: see App\Http\Resources\RoleResource.
        $roles = Role::orderBy('id')->get();

        return RoleResource::collection($roles);
    }

    /**
     * Read one role, with who holds it.
     *
     * Requires `roles.manage`. Quote the `ETag` it returns in the `If-Match`
     * header of a rename, a grant change or a delete. `holders` is what a
     * delete takes the role from, so a client confirming one can name them.
     */
    #[Endpoint(operationId: 'role.show')]
    public function show(Role $role): RoleResource
    {
        return new RoleResource($role->load('members'));
    }

    /**
     * Create a role.
     *
     * Requires `roles.manage`. Takes the role's names and everything it
     * grants, and answers `201` with it. Nobody holds a new role until
     * somebody is given it on the roster, so creating one changes nobody's
     * permissions.
     */
    #[Endpoint(operationId: 'role.store')]
    #[Response(201, 'The new role.')]
    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = DB::transaction(function () use ($request): Role {
            $role = Role::create([
                // Identity the committee never sees or types. Prefixed so a
                // created role can never take a key the catalogue translates.
                'key' => 'custom-'.Str::lower((string) Str::ulid()),
                'label_fr' => $request->validated('labelFr'),
                'label_de' => $request->validated('labelDe'),
            ]);
            $role->syncPermissions($request->permissions());

            return $role;
        });

        Audit::record($request->user(), 'role.created', 'role', $role->id, (string) $role->label_fr);

        return response()->json(new RoleResource($role->load('members')), 201);
    }

    /**
     * Rename a role.
     *
     * Requires `roles.manage` and the `If-Match` from its read. Replaces both
     * names; a blank German name is stored as null. Refuses the baseline role
     * with `409 baseline_role_is_fixed`.
     */
    #[Endpoint(operationId: 'role.update')]
    #[Response(200, 'The role as it now stands.')]
    #[Emits('baseline_role_is_fixed')]
    public function update(RenameRoleRequest $request, Role $role): JsonResponse
    {
        AccessIntegrity::assertMayRename($role);

        $role->fill([
            'label_fr' => $request->validated('labelFr'),
            'label_de' => $request->validated('labelDe'),
        ])->save();

        Audit::record($request->user(), 'role.renamed', 'role', $role->id, (string) $role->label_fr);

        return response()->json(new RoleResource($role->load('members')));
    }

    /**
     * Delete a role.
     *
     * Requires `roles.manage` and the `If-Match` from its read. Everybody who
     * held it loses it, and with it whatever only it granted them; the read's
     * `holders` names them. Refuses with `409 baseline_role_is_fixed` for the
     * baseline role, `409 cannot_remove_last_administrator` or
     * `409 cannot_remove_last_role_administrator` when it is the last source
     * of either permission, and `409 cannot_demote_self` when the caller would
     * lose one of them.
     */
    #[Endpoint(operationId: 'role.destroy')]
    #[Response(200, 'Deleted.')]
    #[Emits('baseline_role_is_fixed', 'cannot_remove_last_administrator', 'cannot_remove_last_role_administrator', 'cannot_demote_self')]
    public function destroy(Request $request, Role $role): JsonResponse
    {
        AccessIntegrity::assertMayDeleteRole($request->user(), $role);

        // Captured before the delete, because the row is gone by the time
        // anyone reads the audit back. member_roles and role_permissions
        // cascade.
        $id = $role->id;
        $label = (string) ($role->label_fr ?? $role->key);
        $role->delete();

        Audit::record($request->user(), 'role.deleted', 'role', $id, $label);

        return response()->json(['ok' => true]);
    }
}
