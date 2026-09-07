<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SectionResource;
use App\Models\Section;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class SectionController extends Controller
{
    /**
     * The registers, in their configured order.
     *
     * The return type is AnonymousResourceCollection rather than JsonResponse
     * deliberately: it is what lets Scramble emit a $ref to a named schema.
     * Wrapping this in response()->json() would erase the type and generate
     * `string[]` in the client — measured, not inferred.
     *
     * `index()` rather than `__invoke()`, even though this controller has one
     * action: Scramble names the operation after controller + method and drops
     * the method for a single-action controller, so `__invoke` would generate
     * the hook `useSection` for something that returns a list. `index` gives
     * `useSectionIndex`.
     */
    public function index(): AnonymousResourceCollection
    {
        return SectionResource::collection(Section::orderBy('sort_order')->get());
    }
}
