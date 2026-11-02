<?php

namespace App\Http\Resources;

use App\Models\TextOverride;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One changed text, keyed by its catalogue path.
 *
 * @mixin TextOverride
 */
class TextOverrideResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->key,
            'fr' => $this->fr,
            'de' => $this->de,
            'updatedAt' => Iso8601::utc($this->updated_at),
        ];
    }
}
