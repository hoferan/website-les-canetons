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
            // Not quite on GET /blocks: PaginatesCollections decodes the body
            // to arrays and encodes it again, so an empty stored block goes
            // out as `[]` there. The SPA parses `[]` against the block's
            // schema, fails, and shows the default, which is what an empty
            // block means anyway.
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
