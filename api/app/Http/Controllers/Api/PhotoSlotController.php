<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PlacePhotoRequest;
use App\Http\Resources\PhotoResource;
use App\Http\Resources\PhotoSlotResource;
use App\Models\Image;
use App\Models\PhotoSlot;
use App\Support\Audit;
use App\Support\ImageReference;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The photo slots: every place on the site that shows a library photo.
 *
 * A slot is named by the page that shows it, and the name is free, so a new
 * place for a photo needs no change here. See the photo_slots migration.
 */
#[Group('Images')]
class PhotoSlotController extends Controller
{
    /**
     * Every slot that shows a photo, by name. Public.
     *
     * A slot with no photo is absent, and the page shows its placeholder.
     * No photo carries alt text: the page describes each by what it shows.
     * An event's poster (`event-{id}`) is not listed: it comes with the event.
     */
    #[Endpoint(operationId: 'photoSlot.index')]
    public function index(): AnonymousResourceCollection
    {
        return PhotoSlotResource::collection(
            PhotoSlot::query()->with('image')->orderBy('slot')->get()
                ->reject(fn (PhotoSlot $slot): bool => PhotoSlot::isEventPoster($slot->slot))
                ->values(),
        );
    }

    /**
     * Puts a photo in a slot, or takes it out. Requires `images.manage`.
     *
     * `{slot}` is the page's name for the place: letters, digits, `.`, `_` and
     * `-`, at most 64 characters. Send `imageId` null to empty the slot.
     * `label` and `path` are how the library names and links the place. No
     * `If-Match`: the write sets one value, so there is nothing half-written
     * to lose.
     */
    #[Endpoint(operationId: 'photoSlot.update')]
    #[Response(200, 'The photo the slot now shows, or null.')]
    public function update(PlacePhotoRequest $request, string $slot): JsonResponse
    {
        $imageId = $request->imageId();

        if ($imageId === null) {
            PhotoSlot::query()->whereKey($slot)->delete();
        } else {
            // An upsert, so a slot's row is made by its first placement, and
            // two first placements arriving at once are settled by the key.
            ImageReference::guard(fn () => PhotoSlot::query()->upsert(
                [[
                    'slot' => $slot,
                    'image_id' => $imageId,
                    'label' => $request->label(),
                    'path' => $request->path(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]],
                ['slot'],
                ['image_id', 'label', 'path', 'updated_at'],
            ), ['imageId' => $imageId]);
        }

        Audit::record($request->user(), $imageId === null ? 'photo.removed' : 'photo.placed', 'photo_slot', null, $slot);

        return response()->json([
            'photo' => PhotoResource::of($imageId === null ? null : Image::query()->find($imageId)),
        ]);
    }
}
