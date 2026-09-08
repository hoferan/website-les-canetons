<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MemberController extends Controller
{
    /**
     * The whole roster — everyone, account or not.
     *
     * Ordered by name because this screen is scanned for a person, not browsed
     * by register. Grouping by register is the UI's business, and it has
     * sectionName to do it with.
     *
     * with() is not an optimisation to revisit later: ~45 members without it is
     * three queries each on a shared host, and the screen that administers the
     * band is the one that would feel it. Pinned by
     * MemberIndexTest::test_listing_the_roster_costs_a_fixed_number_of_queries.
     */
    public function index(): AnonymousResourceCollection
    {
        return MemberResource::collection(
            Member::with(['section', 'roles'])
                ->orderBy('last_name')
                ->orderBy('first_name')
                ->get()
        );
    }
}
