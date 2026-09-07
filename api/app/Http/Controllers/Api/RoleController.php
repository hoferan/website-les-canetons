<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class RoleController extends Controller
{
    /** `index()`, not `__invoke()` — see SectionController for why. */
    public function index(): AnonymousResourceCollection
    {
        return RoleResource::collection(Role::orderBy('id')->get());
    }
}
