<?php

namespace App\Http\Resources;

use App\Models\Registration;
use App\Models\RegistrationChoice;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One booking on the committee's guest list.
 *
 * Carries the totals the exports need — `guestCount` and `totalCents` —
 * rather than leaving the client to sum them, so the spreadsheet, the
 * screen and the confirmation mail cannot disagree about what a booking
 * comes to.
 *
 * `totalCents` is NULL, not zero, when nothing booked has a price. A free
 * event owes nothing; an event whose prices live in the descriptions owes an
 * unknown amount, and "CHF 0.-" would assert the first about the second.
 *
 * @mixin Registration
 */
class RegistrationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'address' => $this->address,
            /** Seating preference the guest gave, or null. */
            'tableName' => $this->table_name,
            /** What was booked: one entry per option, each with its quantity. */
            'choices' => $this->choices(),
            /** How many people this booking covers, summed across its choices. */
            'guestCount' => $this->guest_count,
            /** What the booking comes to, in centimes. Null when nothing booked carries a price, which is not the same as zero. */
            'totalCents' => $this->total_cents,
            'createdAt' => $this->created_at->utc()->toIso8601String(),
        ];
    }

    /**
     * A typed private method, not an inline map: Scramble cannot see through
     * `->map(closure)` and generates `string[]` for a list built that way,
     * silently. Measured on this project, and the reason every non-scalar
     * here goes through a docblocked method.
     *
     * @return list<array<string, mixed>>
     */
    private function choices(): array
    {
        return $this->resource->choices
            ->map(fn (RegistrationChoice $choice): array => [
                'optionId' => $choice->option_id,
                'label' => $choice->option?->label,
                'quantity' => $choice->quantity,
                'priceCents' => $choice->option?->price_cents,
            ])
            ->values()
            ->all();
    }
}
