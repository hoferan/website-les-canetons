<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommitteeMemberResource;
use App\Models\Member;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

// No group description here: only one controller per group may carry it (a
// second wins or loses silently, by discovery order). BandController holds it.
#[Group('Public pages', weight: 55)]
class CommitteeController extends Controller
{
    /**
     * List the committee.
     *
     * Anonymous. Returns everyone holding a committee seat who has consented
     * to appear, in the band's own rank order, with the name of the seat they
     * hold.
     *
     * The seat name is content the committee maintains, so it is rendered
     * verbatim and is never translated.
     */
    #[Endpoint(operationId: 'committee.index')]
    public function index(): AnonymousResourceCollection
    {
        // Ordered by the seat's rank (`committee_functions.sort_order`), then by
        // name. Several people hold "Membre" at once, and without the name
        // tie-break their cards would reorder between two requests.
        $committee = Member::query()
            ->select('members.*')
            ->with('committeeFunction')
            ->join('committee_functions', 'committee_functions.id', '=', 'members.committee_function_id')
            ->where('members.public_visible', true)
            ->orderBy('committee_functions.sort_order')
            ->orderBy('members.last_name')
            ->orderBy('members.first_name')
            ->get();

        return CommitteeMemberResource::collection($committee);
    }
}
