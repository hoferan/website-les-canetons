<?php

namespace App\Http\Resources;

use App\Models\RegistrationOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One bookable option, as the public form and the committee's editor both
 * see it.
 *
 * `priceCents` travels as an INTEGER, never a formatted string. Currency
 * formatting is a display concern and belongs beside the language it is
 * rendered in — which for this project means web/src/i18n/, the only place
 * French exists. Sending "CHF 45.-" from here would put French in an API
 * body and make a total impossible to compute.
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
            'priceCents' => $this->price_cents,
            'sortOrder' => $this->sort_order,
        ];
    }
}
