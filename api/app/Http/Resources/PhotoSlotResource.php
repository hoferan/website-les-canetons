<?php

namespace App\Http\Resources;

use App\Models\PhotoSlot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A slot and the photo it shows, as every page reads it: the slot's name, the
 * largest size and every size as a `srcset`. No alt text: the page describes
 * the photo by what it shows.
 *
 * @mixin PhotoSlot
 */
class PhotoSlotResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'slot' => $this->slot,
            'url' => ImageResource::largestUrl($this->image),
            'width' => $this->image->width,
            'height' => $this->image->height,
            /** Every size as an HTML `srcset`, smallest first. */
            'srcset' => ImageResource::srcset($this->image),
        ];
    }
}
