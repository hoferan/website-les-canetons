<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicSectionResource;
use App\Models\Section;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Public pages', 'What the public site renders about the band itself. Anonymous, read-only, and limited to the people who have consented to appear.', weight: 55)]
class BandController extends Controller
{
    /**
     * List the band, register by register.
     *
     * Anonymous. Returns every register in the band's own order, each with the
     * members who play in it and the instructors who teach it.
     *
     * **Only people who have consented to appear are listed.** Consent is per
     * person and defaults to off, because most of the band are minors. A
     * register whose members have all withheld it comes back with an empty
     * `members` list rather than being dropped, so a reader cannot mistake
     * withheld consent for an empty register.
     *
     * Nothing here is an account detail: three fields per person, and a name is
     * the only one a visitor learns.
     */
    #[Endpoint(operationId: 'band.index')]
    public function index(): AnonymousResourceCollection
    {
        // Registers have a conventional order, held in `sort_order`, so this
        // does not sort by name.
        //
        // Eager-loading both relations keeps this at three queries whatever
        // the band's size. Each relation carries its own consent filter (see
        // Section), so the controller cannot forget it.
        //
        // Assigned first so Scramble does not publish this comment as the 200
        // description.
        $registers = Section::with(['publicMembers', 'publicInstructors'])
            ->orderBy('sort_order')
            ->get();

        return PublicSectionResource::collection($registers);
    }
}
