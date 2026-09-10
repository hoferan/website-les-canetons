<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SectionResource;
use App\Models\Section;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Members', weight: 50)]
class SectionController extends Controller
{
    /**
     * List the registers.
     *
     * Requires `members.manage`. Read-only reference data, for a client
     * building the roster form.
     *
     * Returns every register ("pupitre") with its name, in the order the
     * band has configured. A member's register is what makes them a player,
     * and therefore answerable for an event.
     */
    public function index(): AnonymousResourceCollection
    {
        // The return type is AnonymousResourceCollection rather than
        // JsonResponse deliberately: it is what lets Scramble emit a $ref to
        // a named schema. Wrapping this in response()->json() would erase the
        // type and generate `string[]` in the client — measured, not
        // inferred.
        //
        // `index()` rather than `__invoke()`, even though this controller has
        // one action: Scramble names the operation after controller + method
        // and drops the method for a single-action controller, so `__invoke`
        // would generate the hook `useSection` for something that returns a
        // list. `index` gives `useSectionIndex`.
        //
        // The assignment below is what keeps this block out of the published
        // reference: Scramble serves the comment preceding a return as the
        // 200 response description, and a blank line is not enough to break
        // the association.
        $registers = Section::orderBy('sort_order')->get();

        return SectionResource::collection($registers);
    }
}
