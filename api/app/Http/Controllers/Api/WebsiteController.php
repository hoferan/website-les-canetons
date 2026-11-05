<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportWebsiteRequest;
use App\Http\Resources\ImageResource;
use App\Models\ContentBlock;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\PhotoSlot;
use App\Models\Section;
use App\Support\Audit;
use App\Support\Iso8601;
use App\Support\WebsiteImport;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The public website as one document, to set another server up the same
 * (#336, ADR 0039): the content blocks, the photo library and where its photos are
 * shown, and the history. Members, events, roles, registers, committee seats
 * and event tags stay on the server they were entered on.
 */
#[Group('Website', 'The public website as a whole, carried from one server to another. Every route here needs `content.manage`, `images.manage` and `history.manage`.', weight: 67)]
class WebsiteController extends Controller
{
    /** The bundle's shape. A reader refuses any other; 1 carried single texts. */
    public const FORMAT = 2;

    /**
     * Replaces this server's website with the one sent. Requires
     * `content.manage`, `images.manage` and `history.manage`.
     *
     * Upload every photo to the library first (POST /images); a photo the
     * library does not hold refuses the whole import. The content blocks,
     * the photo slots and the history are replaced in one transaction, so a refused
     * import changes nothing. No `If-Match`: replacing everything is the
     * point, and the page asks for a typed confirmation before it sends this.
     */
    #[Endpoint(operationId: 'website.import')]
    #[Response(200, 'What was imported, and each register photo that found no register of its name.')]
    public function import(ImportWebsiteRequest $request): JsonResponse
    {
        /** @var array{blocks: list<array{key: string, data: array<string, mixed>}>, slots: list<array{slot: string, sha256: string, label?: ?string, path?: ?string, registerName?: ?string}>, history: list<array<string, mixed>>} $bundle */
        $bundle = $request->validated();
        $result = WebsiteImport::apply($bundle);

        Audit::record(
            $request->user(),
            'website.imported',
            'website',
            null,
            "blocks={$result['blocks']} slots={$result['slots']} history={$result['history']}",
        );

        return response()->json($result);
    }

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
     *
     * `exportedFrom` is the host the export was asked of, so the importing
     * page can say which server a file comes from. A format 2 file written
     * before it existed has none.
     */
    #[Endpoint(operationId: 'website.export')]
    #[Response(200, 'The website: content blocks, photo library, photo slots and history.')]
    public function export(Request $request): JsonResponse
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
            'exportedFrom' => $request->getHost(),
            'blocks' => ContentBlock::query()->orderBy('key')->get()
                ->map(fn (ContentBlock $block): array => [
                    'key' => $block->key,
                    /**
                     * The block's content, an object even when empty.
                     *
                     * @var array<string, mixed>
                     */
                    'data' => (object) $block->data,
                ])
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
