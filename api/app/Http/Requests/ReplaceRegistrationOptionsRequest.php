<?php

namespace App\Http\Requests;

use App\Models\Event;
use App\Support\FormAudience;
use App\Support\OptionKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

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
 *
 * Each entry is one block of the form, by `kind` (ADR 0032): `quantity`,
 * `text`, `choice` and `yes_no` are answered, `heading` and `paragraph` are
 * only read. An entry without a kind is a quantity. Price, capacity and
 * `countsGuests` belong to a quantity only, and `answers` to a choice only.
 * A quantity without `countsGuests` counts people, as every option did
 * before the kinds existed.
 */
class ReplaceRegistrationOptionsRequest extends FormRequest
{
    /**
     * Fills the two defaults an older body leaves out.
     *
     * Before the kinds existed, no client sent `kind` or `countsGuests`. Read
     * as false, a missing tick would untick every souper menu on its next
     * save, or refuse it with option_shape_locked once booked. A `false` on
     * another kind is dropped, because it is the only value that kind can
     * have and a client may well echo back what it read.
     */
    protected function prepareForValidation(): void
    {
        $options = $this->input('options');

        if (! is_array($options)) {
            return;
        }

        foreach ($options as $index => $option) {
            if (! is_array($option)) {
                continue;
            }

            $option['kind'] ??= OptionKind::Quantity->value;

            if ($option['kind'] === OptionKind::Quantity->value) {
                $option['countsGuests'] ??= true;
            } elseif (($option['countsGuests'] ?? null) === false) {
                unset($option['countsGuests']);
            }

            $options[$index] = $option;
        }

        $this->merge(['options' => $options]);
    }

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
            /** What this block is: `quantity`, `text`, `choice`, `yes_no`, `heading` or `paragraph`. Omitted, it is a `quantity`. A block somebody has answered cannot change kind. */
            'options.*.kind' => ['sometimes', Rule::enum(OptionKind::class)],
            /** What the guest sees on the booking form, for example "Repas adulte". Optional on a paragraph only. */
            'options.*.label' => ['required_unless:options.*.kind,paragraph', 'nullable', 'string', 'max:255'],
            /** Help text under the label, or a paragraph's body, which it requires. */
            'options.*.description' => ['required_if:options.*.kind,paragraph', 'nullable', 'string', 'max:2000'],
            /** Whether the guest must answer this block. Default `false`. Turning it on later changes no booking already made. */
            'options.*.required' => ['sometimes', 'boolean'],
            /** Quantities only: whether the number is people, added up against the per-booking maximum. Omitted on a quantity, it is `true`. A block somebody has booked cannot flip it. */
            'options.*.countsGuests' => ['prohibited_unless:options.*.kind,quantity', 'boolean'],

            /** Quantities only. Integer centimes: `4500` is CHF 45.00. `0` is free; `null` is an option with no price of its own. */
            'options.*.priceCents' => ['prohibited_unless:options.*.kind,quantity', 'nullable', 'integer', 'gte:0', 'max:1000000'],
            /** Quantities only. How many of this option can be booked across every guest, at least 1. Omit or send `null` for no limit. Lowering it below what is booked already stops further bookings and changes none. */
            'options.*.capacity' => ['prohibited_unless:options.*.kind,quantity', 'nullable', 'integer', 'gte:1', 'max:100000'],

            /** Choices only, and required there: 2 to 20 answers, in order. Send each answer's `id` back to keep it; a booking that picked an answer stays on it through a rename. An answer somebody picked cannot be removed. */
            'options.*.answers' => ['required_if:options.*.kind,choice', 'prohibited_unless:options.*.kind,choice', 'array', 'max:20'],
            /** The id from a previous read. Omit it for a new answer, and the server assigns one. */
            'options.*.answers.*.id' => ['nullable', 'string', 'max:16'],
            'options.*.answers.*.label' => ['required', 'string', 'max:255'],
            /** Where this option sits on the form, lowest first, ties broken by id. Omitted, it takes the entry position in the list you send. */
            'options.*.sortOrder' => ['nullable', 'integer', 'gte:0', 'max:1000'],

            // The form's own settings, which the form editor saves with the
            // blocks so one save is one write under one tag. All six or none:
            // a missing one would be ambiguous between "unchanged" and
            // "cleared", and the editor always has all six.
            /** The form's settings, the same six the event carries. Omit to leave them as they are; send all six to change any. */
            'form' => ['sometimes', 'array'],
            /** Whether the public may use the form (ADR 0033). Closed, the form answers 404. */
            'form.registrationEnabled' => ['required_with:form', 'boolean'],
            /** When public bookings start. Null means as soon as the form is open. */
            'form.registrationOpensAt' => ['present_with:form', 'nullable', 'date'],
            /** When public bookings stop. Null means the event has no form: the blocks are kept, and nobody can book. */
            'form.registrationClosesAt' => ['present_with:form', 'nullable', 'date', 'after:form.registrationOpensAt'],
            /** The largest number of people one booking may cover, 1 to 100. Null means no cap. */
            'form.registrationMaxGuests' => ['present_with:form', 'nullable', 'integer', 'gt:0', 'max:100'],
            /** Whether the form asks for a postal address. */
            'form.registrationAsksAddress' => ['required_with:form', 'boolean'],
            /** Whether the form asks who the guest would like to sit with. */
            'form.registrationAsksTable' => ['required_with:form', 'boolean'],
            // Optional where the six are not: a screen loaded before this
            // setting existed sends the six it knows, and must not be refused
            // or flip a members form back to public.
            /** Who may fill in the form: `public`, anybody, or `members`, logged-in members only. Omit to leave it as it is. */
            'form.registrationAudience' => ['sometimes', Rule::enum(FormAudience::class)],
        ];
    }

    /**
     * A choice needs two answers to be a choice.
     *
     * A closure because Laravel's `min` on an array reports `too_short`,
     * whose copy says the text is too short.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach ((array) $this->input('options', []) as $index => $option) {
                    if (! is_array($option) || ($option['kind'] ?? null) !== OptionKind::Choice->value) {
                        continue;
                    }

                    if (is_array($option['answers'] ?? null) && count($option['answers']) < 2) {
                        $validator->errors()->add("options.{$index}.answers", 'too_few_answers');
                    }
                }
            },
        ];
    }
}
