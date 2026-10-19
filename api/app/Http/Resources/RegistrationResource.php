<?php

namespace App\Http\Resources;

use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One booking on the committee's guest list.
 *
 * Carries `guestCount` and `totalCents` rather than leaving the client to sum
 * them, so the spreadsheet, the screen and the confirmation mail agree.
 *
 * `totalCents` is null, not zero, when nothing booked has a price: prices
 * written in the descriptions are an unknown amount, not CHF 0.
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
            /** The number as the guest typed it. This is what to show. */
            'phone' => $this->phone,
            /** The same number in E.164, to dial, or null when it could not be read as one: show and dial `phone` then. Read as Swiss unless it starts with `+` or `00`. */
            'phoneE164' => $this->phone_e164,
            'address' => $this->address,
            /** Seating preference the guest gave, or null. */
            'tableName' => $this->table_name,
            /** What was booked: one entry per option, each with its quantity. */
            'choices' => $this->choices(),
            /** How many people this booking covers, summed across its choices. */
            'guestCount' => $this->guest_count,
            /** What the booking comes to, in centimes. Null when nothing booked carries a price, which is not the same as zero. */
            'totalCents' => $this->total_cents,
            /** When the committee recorded the payment, or null while it is unpaid. */
            'paidAt' => $this->paid_at === null ? null : Iso8601::utc($this->paid_at),
            'createdAt' => Iso8601::utc($this->created_at),
        ];
    }

    /**
     * A typed method, not an inline map: Scramble cannot see through
     * `->map(closure)` and silently generates `string[]` for a list built
     * that way.
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
