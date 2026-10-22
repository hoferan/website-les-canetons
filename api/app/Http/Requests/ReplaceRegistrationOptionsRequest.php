<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The complete list of things that can be booked at one event.
 *
 * This is a replacement, not a partial update. Send the whole list every
 * time: an entry carrying an `id` updates that option, an entry without one
 * creates a new option, and any existing option missing from the list is
 * deleted. Deleting an option somebody has already booked is refused with
 * `option_has_registrations` rather than rewriting what that person ordered.
 *
 * Send `options: []` to leave the event with nothing bookable. At most 50
 * entries. An `id` must belong to this event.
 *
 * `priceCents` is an integer number of centimes, so 4500 is CHF 45.00. Zero
 * is a free option; `null` means the option carries no price at all, for
 * instance when the price is spelled out in the description.
 *
 * `capacity` caps how many of an option can be booked in all; `null` is no
 * limit. Zero is refused, because an option nobody can book is a removed one.
 */
class ReplaceRegistrationOptionsRequest extends FormRequest
{
    /**
     * The event these options belong to, or 0 outside a real request.
     *
     * Zero rather than null so the `exists` rule below stays well-formed:
     * ApiErrorVocabularyTest instantiates every FormRequest to read its
     * rules() keys, with no route bound.
     */
    private function eventId(): int
    {
        $event = $this->route('event');

        return $event instanceof Event ? $event->id : 0;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Replace-all, like PUT /members/{member}/roles: the committee edits
        // the list as a set in one form, and an "add one" API cannot express
        // removal, which is what the booked-option invariant guards.
        //
        // priceCents is a nullable integer, never a float, because this is
        // money.
        //
        // `options` is `present`, not `required`, since `required` refuses the
        // empty array of an event with nothing bookable. Its example has one
        // entry with an id and one without, which is what makes this a
        // replacement.
        //
        // `options.*.id` is nullable because a new row has no id yet, and
        // scoped to this event: an id from another event would update zero
        // rows and the controller would answer 200 with an option missing.
        //
        // `priceCents` is gte:0 because a free option (0) differs from one
        // with no price (null).
        return [
            /**
             * The whole list, replacing whatever the event offered before. Send `[]` to offer nothing.
             *
             * @example [{"id":7,"label":"Repas adulte","description":"Jambon, gratin et salade","priceCents":4500,"sortOrder":0},{"label":"Repas enfant","description":null,"priceCents":2000,"sortOrder":1}]
             */
            'options' => ['present', 'array', 'max:50'],

            /** The id of an existing option of this event, to update it. Omit or send `null` to create a new one. */
            'options.*.id' => [
                'nullable',
                'integer',
                Rule::exists('event_registration_options', 'id')->where('event_id', $this->eventId()),
            ],
            /** What the guest sees on the booking form, for example "Repas adulte". */
            'options.*.label' => ['required', 'string', 'max:255'],
            'options.*.description' => ['nullable', 'string', 'max:255'],

            /** Integer centimes: `4500` is CHF 45.00. `0` is free; `null` is an option with no price of its own. */
            'options.*.priceCents' => ['nullable', 'integer', 'gte:0', 'max:1000000'],
            /** How many of this option can be booked across every guest, at least 1. Omit or send `null` for no limit. Lowering it below what is booked already stops further bookings and changes none. */
            'options.*.capacity' => ['nullable', 'integer', 'gte:1', 'max:100000'],
            /** Where this option sits on the form, lowest first, ties broken by id. Omitted, it takes the entry position in the list you send. */
            'options.*.sortOrder' => ['nullable', 'integer', 'gte:0', 'max:1000'],
        ];
    }
}
