<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommitteeMemberResource;
use App\Models\Member;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

// NO DESCRIPTION ON THIS ONE. Scramble takes a group's description from the
// attribute, and only one controller per group may carry one — a second
// silently wins or loses depending on discovery order. BandController holds it.
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
        // ORDERED BY RANK, then by name. Until 2026-09-14 this was ordered by
        // name alone and carried a long comment saying why it had to be: a seat
        // was free text on the member row with nothing beside it ranking one
        // above another, so the page printed the caissière above the présidente
        // and sorting by the text itself would have been a claim about
        // seniority the band never made. `committee_functions.sort_order` is
        // that missing fact, which is the whole reason the table exists.
        //
        // The name tie-break is not decoration: several people hold "Membre" at
        // once, and without it their cards reorder themselves between two
        // requests for no reason a reader can see.
        //
        // THE TRIM FILTER IS GONE WITH THE COLUMN. A typed title had three ways
        // to say "no seat" — null, '', and '   ' — and the last two survived a
        // plain `!= ''` only because MySQL's PAD SPACE collation says so, which
        // would have stopped being true on a NO PAD database. A foreign key has
        // one way to say nobody.
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
