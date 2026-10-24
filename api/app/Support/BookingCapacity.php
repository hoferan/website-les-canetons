<?php

namespace App\Support;

use App\Models\Event;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Refuses a booking that asks for more of an option than is left (ADR 0031).
 *
 * The count and the write after it have to be one step, or two bookings
 * reading the last place both get it. So the caller locks the event's row
 * (lock()) as the first statement of its transaction, and a second booking
 * for the same event waits there until the first commits.
 *
 * It must be the transaction's first statement. InnoDB's REPEATABLE READ
 * fixes a transaction's snapshot at its first plain read, so any read before
 * the lock would make the count miss a booking committed while this one
 * waited.
 */
final class BookingCapacity
{
    public static function lock(Event $event): void
    {
        Event::query()->whereKey($event->id)->lockForUpdate()->first();
    }

    /**
     * Each refusal is reported against `choices.N.quantity`, N being the
     * position in what was sent, so the form can mark the option that ran
     * out. Throwing rolls the transaction back.
     *
     * `$exceptRegistrationId` leaves one booking's own places out of the
     * count: a member changing their answers may keep the places they hold
     * (ADR 0034).
     *
     * @param  list<array{optionId: int, quantity?: int|null, value?: string|null}>  $choices
     */
    public static function refuse(Event $event, array $choices, ?int $exceptRegistrationId = null): void
    {
        $options = $event->registrationOptions()
            ->whereIn('id', array_column($choices, 'optionId'))
            ->withSum(
                ['choices' => fn ($query) => $query->when(
                    $exceptRegistrationId !== null,
                    fn ($query) => $query->where('registration_id', '!=', $exceptRegistrationId),
                )],
                'quantity',
            )
            ->get()
            ->keyBy('id');

        // A validator of its own rather than withMessages(), because
        // ApiErrorVocabularyTest finds reasons by scanning for errors()->add().
        $validator = Validator::make([], []);

        foreach ($choices as $index => $choice) {
            $remaining = $options->get($choice['optionId'])?->remaining();

            if ($remaining !== null && ($choice['quantity'] ?? 0) > $remaining) {
                $validator->errors()->add("choices.{$index}.quantity", 'not_enough_places');
            }
        }

        if ($validator->errors()->isNotEmpty()) {
            throw new ValidationException($validator);
        }
    }
}
