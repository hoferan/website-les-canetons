<?php

namespace App\Http\Resources;

use App\Models\ContentBlock;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One changed content block, keyed by its name.
 *
 * @mixin ContentBlock
 */
class ContentBlockResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->key,
            /**
             * The block's content, an object even when empty.
             *
             * @var array<string, mixed>
             */
            'data' => (object) $this->data,
            'updatedAt' => Iso8601::utc($this->updated_at),
        ];
    }
}
