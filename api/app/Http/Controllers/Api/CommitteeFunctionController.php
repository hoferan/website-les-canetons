<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommitteeFunctionResource;
use App\Models\CommitteeFunction;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

// No group description here: only one controller per group may carry it, and
// MemberController holds the "Members" one.
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
        // `index()` gives the generated hook a plural name, and returning the
        // resource collection (not response()->json()) keeps the type Scramble
        // needs to emit a $ref. See SectionController.
        //
        // Assigned first so Scramble does not publish this comment as the 200
        // description.
        $seats = CommitteeFunction::orderBy('sort_order')->get();

        return CommitteeFunctionResource::collection($seats);
    }
}
