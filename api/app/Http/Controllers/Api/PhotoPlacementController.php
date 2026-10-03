<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PlacePhotoRequest;
use App\Http\Resources\PhotoResource;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Section;
use App\Models\SitePhoto;
use App\Support\Audit;
use App\Support\ImageReference;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * Puts a library photo in one place, or takes it out.
 *
 * ONE WRITE PER PLACE, because a photo is chosen on the page that shows it,
 * one place at a time. Each write sets a single value, so two editors working
 * on different places cannot overwrite each other, and none of them carries
 * `If-Match`: see App\Http\Middleware\ConditionalWrite for why.
 */
#[Group('Images')]
class PhotoPlacementController extends Controller
{
    /**
     * Places the band photo or the concert photo. Requires `images.manage`.
     *
     * `{slot}` is `band` (the band page) or `concert` (the home page). Send
     * `imageId` null to empty the slot.
     */
    #[Endpoint(operationId: 'photoPlacement.site')]
    #[Response(200, 'The photo the slot now shows, or null.')]
    public function site(PlacePhotoRequest $request, string $slot): JsonResponse
    {
        /** @var SitePhoto $place */
        $place = SitePhoto::query()->findOrFail($slot);

        return $this->place($request, $place, 'site_photo', null, $slot);
    }

    /** Places a register's photo on the band page. Requires `images.manage`. */
    #[Endpoint(operationId: 'photoPlacement.register')]
    #[Response(200, 'The photo the register now shows, or null.')]
    public function register(PlacePhotoRequest $request, Section $section): JsonResponse
    {
        return $this->place($request, $section, 'section', $section->id, $section->name);
    }

    /** Places a history entry's photo. Requires `history.manage` and `images.manage`. */
    #[Endpoint(operationId: 'photoPlacement.history')]
    #[Response(200, 'The photo the entry now shows, or null.')]
    public function history(PlacePhotoRequest $request, HistoryEntry $historyEntry): JsonResponse
    {
        $label = $historyEntry->title_fr ?? $historyEntry->title_de ?? $historyEntry->occurred_on->toDateString();

        return $this->place($request, $historyEntry, 'history_entry', $historyEntry->id, mb_substr($label, 0, 80));
    }

    private function place(PlacePhotoRequest $request, Model $place, string $type, ?int $id, string $label): JsonResponse
    {
        $imageId = $request->imageId();

        ImageReference::guard(
            fn () => $place->forceFill(['image_id' => $imageId])->save(),
            ['imageId' => $imageId],
        );
        Audit::record($request->user(), $imageId === null ? 'photo.removed' : 'photo.placed', $type, $id, $label);

        return response()->json([
            'photo' => PhotoResource::of($imageId === null ? null : Image::query()->find($imageId)),
        ]);
    }
}
