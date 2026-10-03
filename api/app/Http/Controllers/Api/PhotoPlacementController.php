<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePhotoPlacementsRequest;
use App\Http\Resources\PhotoPlacementsResource;
use App\Models\Section;
use App\Models\SitePhoto;
use App\Support\Audit;
use App\Support\ImageReference;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Support\Facades\DB;

#[Group('Images')]
class PhotoPlacementController extends Controller
{
    /**
     * Where each photo is placed. Requires `images.manage`.
     *
     * The band photo, the concert photo and one slot per register, each the
     * id of a library image or null. Read this before replacing the
     * placements, and quote the `ETag` it returns in the `If-Match` header of
     * the PUT.
     */
    #[Endpoint(operationId: 'photoPlacement.show')]
    #[Response(200, 'Every slot and what sits in it.')]
    public function show(): PhotoPlacementsResource
    {
        return PhotoPlacementsResource::current();
    }

    /**
     * Places photos. Requires `images.manage` and the `If-Match` from the read.
     *
     * Send the complete placements, in the shape the read returns. Replaying
     * the same body leaves the same placements, and `imageId` null empties a
     * slot. The register list must name every register exactly once, or the
     * request answers `400 validation_failed` against `registers`, as it does
     * for an `imageId` that is not in the library.
     *
     * Returns the placements as they now stand.
     */
    #[Endpoint(operationId: 'photoPlacement.update')]
    #[Response(200, 'The placements as they now stand.')]
    public function update(UpdatePhotoPlacementsRequest $request): PhotoPlacementsResource
    {
        /** @var array{band: array<string, mixed>, concert: array<string, mixed>, registers: list<array<string, mixed>>} $body */
        $body = $request->validated();

        $references = [];
        foreach (SitePhoto::SLOTS as $slot) {
            $references["{$slot}.imageId"] = $body[$slot]['imageId'] ?? null;
        }
        foreach ($body['registers'] as $index => $row) {
            $references["registers.{$index}.imageId"] = $row['imageId'] ?? null;
        }

        ImageReference::guard(fn () => DB::transaction(function () use ($body): void {
            foreach (SitePhoto::SLOTS as $slot) {
                SitePhoto::query()->whereKey($slot)->update(['image_id' => $body[$slot]['imageId']]);
            }

            foreach ($body['registers'] as $row) {
                Section::query()->whereKey($row['sectionId'])->update(['image_id' => $row['imageId']]);
            }
        }), $references);

        Audit::record($request->user(), 'photos.placed', 'photos', null, 'band page photos');

        return PhotoPlacementsResource::current();
    }
}
