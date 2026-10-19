<?php

namespace App\Http\Resources;

use App\Models\RegistrationOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One bookable option, as the public form and the committee's editor both
 * see it.
 *
 * `priceCents` travels as an integer, never a formatted string: currency
 * formatting happens in web/src/i18n/, and a string like "CHF 45.-" could not
 * be summed.
 *
 * @mixin RegistrationOption
 */
class RegistrationOptionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'description' => $this->description,
            /** Price in centimes: 4500 is CHF 45.00. Null when the option is free or priced in its description. */
            'priceCents' => $this->price_cents,
            /** Ascending display order. */
            'sortOrder' => $this->sort_order,
        ];
    }
}
