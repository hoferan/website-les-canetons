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
 * `remaining` changes with every booking, so the `event.options` tag leaves
 * it out (App\Support\EntityTag): a guest booking must not refuse the
 * committee's save.
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
            /** What this block is. `quantity`, `text`, `choice` and `yes_no` are answered; `heading` and `paragraph` are only read. */
            'kind' => $this->kind,
            /** Null only on a paragraph without a title. */
            'label' => $this->label,
            /** Help text under the label, or a paragraph's body. */
            'description' => $this->description,
            /** Whether a booking must answer this block. Always false on a heading or a paragraph. */
            'required' => $this->required,
            /** Whether this quantity is people, added up against the per-booking maximum. Always false on other kinds. */
            'countsGuests' => $this->counts_guests,
            /**
             * A choice's answers in order; empty on every other kind. A booking stores the `key`.
             *
             * @var list<array{key: string, label: string}>
             */
            'answers' => $this->resource->answers(),
            /** Price in centimes: 4500 is CHF 45.00. Null when the option is free or priced in its description. */
            'priceCents' => $this->price_cents,
            /** How many of this option can be booked across every guest. Null when there is no limit. */
            'capacity' => $this->capacity,
            /** Places still free under `capacity`, never below 0; 0 is sold out. Null when there is no limit. */
            'remaining' => $this->remaining(),
            /** Ascending display order. */
            'sortOrder' => $this->sort_order,
        ];
    }
}
