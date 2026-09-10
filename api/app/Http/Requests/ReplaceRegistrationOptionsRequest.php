<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The committee editing an event's bookable options, as a complete set.
 *
 * REPLACE-ALL, matching PUT /members/{member}/roles rather than three
 * per-option endpoints: the committee edits the list as a set in one form,
 * and an "add one" API cannot express removal — which is the half the
 * booked-option invariant exists for.
 *
 * Entries carrying an `id` are updated, entries without one are created, and
 * anything absent is deleted — unless somebody has booked it, which is
 * refused with `option_has_registrations` rather than allowed to rewrite
 * what that person ordered.
 *
 * `priceCents` is an INTEGER and nullable: 4500 is CHF 45.-, and null is a
 * free option or one whose price lives in the description. Never a float —
 * binary floating point cannot represent 0.1, and this is money.
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
        return [
            // `present`, not `required`: an event may legitimately have no
            // options, and `required` refuses an empty array.
            'options' => ['present', 'array', 'max:50'],

            // Nullable rather than absent-or-int: the client sends the whole
            // list back, and a new row has no id yet.
            // Scoped to THIS event. An unscoped id updates zero rows and
            // the controller moves on, so the committee submits three
            // options, gets 200, and sees two — silent loss rather than a
            // refusal.
            'options.*.id' => [
                'nullable',
                'integer',
                Rule::exists('event_registration_options', 'id')->where('event_id', $this->eventId()),
            ],
            'options.*.label' => ['required', 'string', 'max:255'],
            'options.*.description' => ['nullable', 'string', 'max:255'],

            // gte:0 rather than gt:0 — an option really can cost nothing,
            // and that is different from having no price at all (null).
            'options.*.priceCents' => ['nullable', 'integer', 'gte:0', 'max:1000000'],
            'options.*.sortOrder' => ['nullable', 'integer', 'gte:0', 'max:1000'],
        ];
    }
}
