<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Members', weight: 50)]
class RoleController extends Controller
{
    /**
     * List the roles.
     *
     * Requires `members.manage`. Read-only reference data, for a client
     * building the roster form.
     *
     * Returns every role with the permissions it grants. A role carries no
     * display name: `key` is the fixed identifier and the client translates
     * it.
     */
    public function index(): AnonymousResourceCollection
    {
        // `index()`, not `__invoke()` — see SectionController for why.
        //
        // The permissions travel with the role rather than being fetched
        // per member: see App\Http\Resources\RoleResource.
        $roles = Role::orderBy('id')->get();

        return RoleResource::collection($roles);
    }
}
