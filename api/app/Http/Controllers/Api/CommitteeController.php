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
     * to appear, with the title they hold.
     *
     * The title is free text the committee typed, so it is rendered verbatim
     * and is never translated.
     */
    #[Endpoint(operationId: 'committee.index')]
    public function index(): AnonymousResourceCollection
    {
        // ORDERED BY NAME, NOT BY TITLE, and that is a decision rather than a
        // default. A committee has a conventional hierarchy — président first,
        // then vice-président, then the rest — but nothing in the data says so:
        // `committee_title` is free text with no rank beside it. Ordering by it
        // would sort "Caissier" above "Président" and look like a claim about
        // seniority that the band never made, and hardcoding a list of titles
        // in PHP would make a developer the owner of something the committee
        // types (design §3.1, the editability ladder). Alphabetical is the
        // honest answer until a rank column exists.
        //
        // A BLANK `committee_title` IS NO SEAT, not a seat with a blank name:
        // the roster form writes '' rather than null when somebody clears the
        // field, and a card headed by nothing above a member's name is worse
        // than their absence.
        //
        // TRIM rather than `!= ''`, and the difference is a collation. MySQL's
        // PAD SPACE collations already treat '   ' as equal to '', so the
        // simpler comparison happens to work on this database and would stop
        // working on one built with a NO PAD collation — which is the default
        // for utf8mb4_0900_* on MySQL 8. Depending on that silently is how a
        // filter comes apart on a server nobody tested against.
        $committee = Member::query()
            ->where('public_visible', true)
            ->whereNotNull('committee_title')
            ->whereRaw('TRIM(committee_title) != ?', [''])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        return CommitteeMemberResource::collection($committee);
    }
}
