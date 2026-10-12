<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderSectionsRequest;
use App\Http\Requests\StoreSectionRequest;
use App\Http\Resources\SectionResource;
use App\Models\PhotoSlot;
use App\Models\Section;
use App\Support\Audit;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

#[Group('Members', weight: 50)]
class SectionController extends Controller
{
    /**
     * List the registers.
     *
     * Requires `members.manage`. The roster form reads it to offer a
     * register, and the register editor to list them.
     *
     * Returns every register ("pupitre") with its names, in the order the
     * band has configured, and how many members play in and teach each one.
     * A register groups and displays; it grants nothing.
     */
    public function index(): AnonymousResourceCollection
    {
        // The return type is AnonymousResourceCollection rather than
        // JsonResponse deliberately: it is what lets Scramble emit a $ref to
        // a named schema. Wrapping this in response()->json() would erase the
        // type and generate `string[]` in the client — measured, not
        // inferred.
        //
        // `index()` rather than `__invoke()`: Scramble names the operation
        // after controller + method and drops the method for a single-action
        // controller, which is how this one started. `index` gives
        // `useSectionIndex`.
        //
        // The assignment below is what keeps this block out of the published
        // reference: Scramble serves the comment preceding a return as the
        // 200 response description, and a blank line is not enough to break
        // the association.
        $registers = Section::withCount(['members', 'instructors'])->orderBy('sort_order')->orderBy('id')->get();

        return SectionResource::collection($registers);
    }

    /**
     * Read one register.
     *
     * Requires `members.manage`. Quote the `ETag` it returns in the
     * `If-Match` header of a rename or a delete.
     */
    #[Endpoint(operationId: 'section.show')]
    public function show(Section $section): SectionResource
    {
        return new SectionResource($section->loadCount(['members', 'instructors']));
    }

    /**
     * Create a register.
     *
     * Requires `members.manage`. The new register goes last on the band page
     * and the roster form. Answers `201` with it.
     */
    #[Endpoint(operationId: 'section.store')]
    #[Response(201, 'The new register.')]
    public function store(StoreSectionRequest $request): JsonResponse
    {
        $section = Section::create([
            'name' => $request->validated('name'),
            'name_de' => $request->validated('nameDe'),
            'sort_order' => (int) Section::query()->max('sort_order') + 1,
        ]);
        Audit::record($request->user(), 'section.created', 'section', $section->id, $section->name);

        return response()->json(new SectionResource($section->loadCount(['members', 'instructors'])), 201);
    }

    /**
     * Rename a register.
     *
     * Requires `members.manage` and the `If-Match` from its read. Replaces
     * both names; a blank German name is stored as null.
     */
    #[Endpoint(operationId: 'section.update')]
    #[Response(200, 'The register as it now stands.')]
    public function update(StoreSectionRequest $request, Section $section): JsonResponse
    {
        $section->fill([
            'name' => $request->validated('name'),
            'name_de' => $request->validated('nameDe'),
        ])->save();

        // The library lists where each photo is shown by the label the band
        // page stored with it, so the register's photo follows the rename.
        PhotoSlot::query()->where('slot', self::photoSlot($section))->update(['label' => $section->name]);

        Audit::record($request->user(), 'section.renamed', 'section', $section->id, $section->name);

        return response()->json(new SectionResource($section->loadCount(['members', 'instructors'])));
    }

    /**
     * Put the registers in a new order.
     *
     * Requires `members.manage`. Takes every register's id, first to last;
     * the band page and the roster form follow it. Refuses with
     * `409 registers_changed` when the list does not name every register
     * exactly once, which means somebody added or deleted one meanwhile:
     * read the list again.
     *
     * No `If-Match`: the body is the whole order, so there is no part of
     * somebody else's order it could keep or lose. Two people reordering at
     * once leave the order the second one chose, which is the one they saw.
     */
    #[Endpoint(operationId: 'section.reorder')]
    #[Response(200, 'Every register, in the new order.')]
    #[Emits('registers_changed')]
    public function reorder(ReorderSectionsRequest $request): JsonResponse
    {
        $ids = $request->sectionIds();
        $existing = Section::query()->pluck('id')->all();

        if (count($ids) !== count(array_unique($ids)) || array_diff($existing, $ids) !== [] || array_diff($ids, $existing) !== []) {
            return ApiError::json(409, 'registers_changed', 'The list does not name every register exactly once. Read it again.');
        }

        DB::transaction(function () use ($ids): void {
            foreach ($ids as $position => $id) {
                Section::query()->whereKey($id)->update(['sort_order' => $position + 1]);
            }
        });
        Audit::record($request->user(), 'section.reordered', 'section', null, implode(',', $ids));

        return response()->json(SectionResource::collection(
            Section::withCount(['members', 'instructors'])->orderBy('sort_order')->orderBy('id')->get(),
        ));
    }

    /**
     * Delete a register.
     *
     * Requires `members.manage` and the `If-Match` from its read. Refuses
     * with `409 register_in_use` while anybody plays in or teaches it: move
     * them to another register first. Its photo on the band page goes with
     * it.
     */
    #[Endpoint(operationId: 'section.destroy')]
    #[Response(200, 'Deleted.')]
    #[Emits('register_in_use')]
    public function destroy(Request $request, Section $section): JsonResponse
    {
        // ONE STATEMENT, NOT A COUNT AND THEN A DELETE. Both foreign keys
        // are nullOnDelete, so a roster edit that put somebody in this
        // register between a count and the delete would lose it silently.
        // The NOT EXISTS is evaluated by the DELETE itself.
        $deleted = Section::query()->whereKey($section->id)
            ->whereNotExists(fn ($members) => $members->from('members')
                ->whereColumn('members.section_id', 'sections.id')
                ->orWhereColumn('members.instructor_of_section_id', 'sections.id'))
            ->delete();

        if ($deleted === 0) {
            return ApiError::json(409, 'register_in_use', 'Somebody plays in or teaches this register. Move them to another one first.');
        }

        PhotoSlot::query()->where('slot', self::photoSlot($section))->delete();
        Audit::record($request->user(), 'section.deleted', 'section', $section->id, $section->name);

        return response()->json(['ok' => true]);
    }

    /** The band page's photo slot for a register; see web/src/images/photoSlots.ts. */
    private static function photoSlot(Section $section): string
    {
        return "register-{$section->id}";
    }
}
