<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommitteeFunctionResource;
use App\Models\CommitteeFunction;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

// NO DESCRIPTION ON THIS ONE. Scramble takes a group's description from the
// attribute and only one controller per group may carry one; MemberController
// holds the "Members" group's.
#[Group('Members', weight: 50)]
class CommitteeFunctionController extends Controller
{
    /**
     * List the committee's seats.
     *
     * Requires `members.manage`. Read-only reference data, for a client
     * building the roster form.
     *
     * Returns every seat with its name and its rank, in rank order. A member
     * holding one appears on the public committee page under that heading;
     * a member holding none does not appear there at all.
     */
    public function index(): AnonymousResourceCollection
    {
        // `index()` rather than `__invoke()`, and the return type is the
        // resource collection rather than a JsonResponse, for the two reasons
        // SectionController sets out at length: the method name is what gives
        // the generated hook a plural name, and wrapping this in
        // response()->json() erases the type Scramble needs to emit a $ref.
        //
        // The assignment is load-bearing too — Scramble serves the comment
        // preceding a return as the 200 response description.
        $seats = CommitteeFunction::orderBy('sort_order')->get();

        return CommitteeFunctionResource::collection($seats);
    }
}
