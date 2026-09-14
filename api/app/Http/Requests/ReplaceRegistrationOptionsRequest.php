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
        // REPLACE-ALL, matching PUT /members/{member}/roles rather than three
        // per-option endpoints: the committee edits the list as a set in one
        // form, and an "add one" API cannot express removal — which is the
        // half the booked-option invariant exists for.
        //
        // priceCents is an INTEGER and nullable. Never a float — binary
        // floating point cannot represent 0.1, and this is money.
        return [
            // `present`, not `required`: an event may legitimately have no
            // options, and `required` refuses an empty array.
            // The example carries one entry WITH an id and one without,
            // because that difference is what makes this a replacement rather
            // than an update, and it is the part the description above cannot
            // show.
            /**
             * The whole list, replacing whatever the event offered before. Send `[]` to offer nothing.
             *
             * @example [{"id":7,"label":"Repas adulte","description":"Jambon, gratin et salade","priceCents":4500,"sortOrder":0},{"label":"Repas enfant","description":null,"priceCents":2000,"sortOrder":1}]
             */
            'options' => ['present', 'array', 'max:50'],

            // Nullable rather than absent-or-int: the client sends the whole
            // list back, and a new row has no id yet.
            // Scoped to THIS event. An unscoped id updates zero rows and
            // the controller moves on, so the committee submits three
            // options, gets 200, and sees two — silent loss rather than a
            // refusal.
            /** The id of an existing option of this event, to update it. Omit or send `null` to create a new one. */
            'options.*.id' => [
                'nullable',
                'integer',
                Rule::exists('event_registration_options', 'id')->where('event_id', $this->eventId()),
            ],
            /** What the guest sees on the booking form, for example "Repas adulte". */
            'options.*.label' => ['required', 'string', 'max:255'],
            'options.*.description' => ['nullable', 'string', 'max:255'],

            // gte:0 rather than gt:0 — an option really can cost nothing,
            // and that is different from having no price at all (null).
            /** Integer centimes: `4500` is CHF 45.00. `0` is free; `null` is an option with no price of its own. */
            'options.*.priceCents' => ['nullable', 'integer', 'gte:0', 'max:1000000'],
            /** Where this option sits on the form, lowest first, ties broken by id. Omitted, it takes the entry position in the list you send. */
            'options.*.sortOrder' => ['nullable', 'integer', 'gte:0', 'max:1000'],
        ];
    }
}
