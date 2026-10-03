<?php

namespace App\Http\Resources;

use App\Models\Section;
use App\Models\SitePhoto;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Where every placeable photo sits: the band photo, the concert photo and one
 * per register.
 *
 * One shape for the read and the write, so a client edits what it was given
 * and sends it back. It is also what the `site_photos` entity tag is computed
 * over (see App\Support\EntityTag), which keeps the tag moving for anything a
 * client could change here, including a register's photo, which lives on the
 * register's own row.
 *
 * A slot says which library image sits there (`imageId`), and nothing else:
 * the page describes it by the register's name or the band's. The public pages
 * get the richer PhotoResource instead.
 *
 * @property array{site: Collection<string, SitePhoto>, registers: Collection<int, Section>} $resource
 */
class PhotoPlacementsResource extends JsonResource
{
    /** Reads the placements as they stand now. */
    public static function current(): self
    {
        return new self([
            'site' => SitePhoto::query()->get()->keyBy('slot'),
            'registers' => Section::query()->orderBy('sort_order')->orderBy('id')->get(),
        ]);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** The photo of the band. */
            'band' => $this->slot('band'),
            /** The photo that announces the next concert. */
            'concert' => $this->slot('concert'),
            /** One row per register, in the band's own order. A PUT must list every one. */
            'registers' => PhotoPlacementRegisterResource::collection($this->resource['registers']),
        ];
    }

    /**
     * A slot whose row is missing reads as empty, so a database that lost a
     * `site_photos` row answers the same as one that never placed anything.
     *
     * The id is cast because a bare `$row?->image_id` on an untyped collection
     * item is published as `string|null` in the API document. A comment inside
     * the array would be published as the field's description, so the note
     * lives here.
     *
     * @return array{imageId: int|null}
     */
    private function slot(string $slot): array
    {
        $row = $this->resource['site']->get($slot);

        return [
            'imageId' => $row?->image_id === null ? null : (int) $row->image_id,
        ];
    }
}
