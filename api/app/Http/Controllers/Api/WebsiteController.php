<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ImageResource;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\PhotoSlot;
use App\Models\Section;
use App\Models\TextOverride;
use App\Support\Iso8601;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;

/**
 * The public website as one document, to set another server up the same
 * (#336, ADR 0038): the texts, the photo library and where its photos are
 * shown, and the history. Members, events, roles, registers, committee seats
 * and event tags stay on the server they were entered on.
 */
#[Group('Website', 'The public website as a whole, carried from one server to another. Every route here needs `content.manage`, `images.manage` and `history.manage`.', weight: 67)]
class WebsiteController extends Controller
{
    /** The bundle's shape. A reader refuses any other. */
    public const FORMAT = 1;

    /**
     * The website as one document. Requires `content.manage`, `images.manage`
     * and `history.manage`.
     *
     * A photo travels as the URLs of its stored sizes, which the browser
     * fetches one by one, so no single answer carries the whole library. A
     * slot and a history entry name their photo by its SHA-256. An event's
     * poster is not part of the website, and a history entry's photo comes
     * with the entry. A register's photo carries the register's name, since
     * ids differ from one server to the next.
     */
    #[Endpoint(operationId: 'website.export')]
    #[Response(200, 'The website: texts, photo library, photo slots and history.')]
    public function export(): JsonResponse
    {
        $images = Image::query()->with('sizes')->orderBy('id')->get();
        $shaById = $images->pluck('sha256', 'id');
        $registers = Section::query()->pluck('name', 'id');

        $slots = PhotoSlot::query()->orderBy('slot')->get()
            ->reject(fn (PhotoSlot $slot): bool => PhotoSlot::isEventPoster($slot->slot)
                || preg_match('/^history-\d+$/', $slot->slot) === 1)
            ->map(fn (PhotoSlot $slot): array => [
                'slot' => $slot->slot,
                'sha256' => $shaById[$slot->image_id],
                'label' => $slot->label,
                'path' => $slot->path,
                'registerName' => preg_match('/^register-(\d+)$/', $slot->slot, $m) === 1
                    ? ($registers[(int) $m[1]] ?? null)
                    : null,
            ])
            ->values();

        $historyPhotos = PhotoSlot::query()->where('slot', 'like', 'history-%')->pluck('image_id', 'slot');

        return response()->json([
            'format' => self::FORMAT,
            'exportedAt' => Iso8601::utc(now()),
            'texts' => TextOverride::query()->orderBy('key')->get()
                ->map(fn (TextOverride $text): array => ['key' => $text->key, 'fr' => $text->fr, 'de' => $text->de])
                ->values(),
            'images' => $images->map(fn (Image $image): array => [
                'sha256' => $image->sha256,
                'name' => $image->name,
                'sizes' => $image->sizes->sortByDesc('width')->map(fn ($size): array => [
                    'width' => $size->width,
                    'height' => $size->height,
                    'sha256' => $size->sha256,
                    'url' => ImageResource::url($size->sha256),
                ])->values(),
            ])->values(),
            'slots' => $slots,
            'history' => HistoryEntry::query()->orderBy('occurred_on')->orderBy('id')->get()
                ->map(function (HistoryEntry $entry) use ($historyPhotos, $shaById): array {
                    $imageId = $historyPhotos[PhotoSlot::forHistory($entry->id)] ?? null;

                    return [
                        'occurredOn' => $entry->occurred_on->toDateString(),
                        'precision' => $entry->precision,
                        'titleFr' => $entry->title_fr,
                        'bodyFr' => $entry->body_fr,
                        'titleDe' => $entry->title_de,
                        'bodyDe' => $entry->body_de,
                        'important' => (bool) $entry->important,
                        'icon' => $entry->icon,
                        'photoSha256' => $imageId === null ? null : $shaById[$imageId],
                    ];
                })->values(),
        ]);
    }
}
