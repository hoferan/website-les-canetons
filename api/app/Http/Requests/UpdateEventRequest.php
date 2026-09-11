<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Changes to one entry on the planning.
 *
 * A PATCH: send only the fields that change. An omitted field is left as it
 * is, and an explicit `null` clears one of the optional fields.
 *
 * The two date comparisons still hold when only one half is sent. A request
 * carrying `endsAt` but not `startsAt` is compared against the start already
 * stored, so an end cannot be moved before a beginning it did not send; the
 * same goes for `registrationClosesAt` against a stored
 * `registrationOpensAt`.
 *
 * Clearing `registrationClosesAt` with an explicit `null` is how public
 * registration is switched off again; the bookings already taken are kept.
 */
class UpdateEventRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // PATCH, so every rule is `sometimes`: a form posting only the field
        // it changed must not blank the others.
        //
        // `sometimes` is not the same as `nullable`, and the nullable columns
        // need both — `sometimes` means "skip this field if absent",
        // `nullable` means "null is a legal value when present". Without
        // `sometimes` an absent field fails `required`; without `nullable` an
        // explicit null fails the type rules. Clearing the attire is an
        // explicit null, so both matter. UpdateMemberRequest makes the same
        // call at more length, for the same situation.
        //
        // RULE ORDER IS LOAD-BEARING, exactly as StoreEventRequest documents:
        // ApiError reports only the FIRST failed rule per field, so `required`
        // comes before the type rules and `date` before the comparison — an
        // unparseable end is a format problem, and comparing it to anything
        // reports the wrong thing. Pinned by
        // EventWriteTest::test_editing_reports_an_unparseable_end_as_a_format_error.
        //
        // Null-safe deliberately, the same call UpdateMemberRequest makes:
        // ApiErrorVocabularyTest instantiates every FormRequest outside a
        // request to read its rules() keys, so there is no bound route model
        // then and `$event->starts_at` would fatal. At runtime route-model
        // binding guarantees one.
        /** @var Event|null $event */
        $event = $this->route('event');

        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            /** ISO 8601. Send any offset and it is honoured; no offset is read as UTC. Stored and returned as UTC. */
            'startsAt' => ['sometimes', 'required', 'date'],
            /** ISO 8601 with an offset, strictly after the start. Compared against `startsAt` when that is sent too, and against the stored start otherwise. */
            'endsAt' => ['sometimes', 'required', 'date', ...$this->afterTheStart($event)],
            /** Where it happens, as free text. */
            'location' => ['sometimes', 'required', 'string', 'max:255'],
            /** What to wear. Send `null` to clear it. */
            'attire' => ['sometimes', 'nullable', 'string', 'max:255'],
            /** Whether the event appears on the public agenda. Members see it either way. */
            'isPublic' => ['sometimes', 'boolean'],
            /** Anything else members should read. Send `null` to clear it. */
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],

            // The registration window. Nullable throughout, and clearing
            // registrationClosesAt is how registration is switched OFF —
            // which is why these need `sometimes` AND `nullable`, like every
            // other optional column on this form.
            /** When public bookings start. Send `null` for bookings that are open as soon as the close date is set. */
            'registrationOpensAt' => ['sometimes', 'nullable', 'date'],
            /** When public bookings stop. Send `null` to switch public registration off; bookings already taken are kept. Must fall after the opening, whether that is sent here or already stored. */
            'registrationClosesAt' => ['sometimes', 'nullable', 'date', ...$this->afterTheOpening($event)],
            /** The largest number of people one booking may cover, 1 to 100. Send `null` for no cap. */
            'registrationMaxGuests' => ['sometimes', 'nullable', 'integer', 'gt:0', 'max:100'],
        ];
    }

    /**
     * What `registrationClosesAt` must come after.
     *
     * The same PATCH trap `afterTheStart()` documents, on the other date
     * pair: `after:registrationOpensAt` compares against another INPUT
     * field, so a request that changes only the close date would be
     * compared against nothing and pass. Falls back to the stored opening.
     *
     * An event with no opening date has no lower bound at all, because a
     * null opening means "open as soon as the close date is set".
     *
     * @return array<int, string>
     */
    private function afterTheOpening(?Event $event): array
    {
        if ($this->has('registrationOpensAt')) {
            return $this->input('registrationOpensAt') === null
                ? []
                : ['after:registrationOpensAt'];
        }

        if ($event?->registration_opens_at === null) {
            return [];
        }

        return ['after:'.$event->registration_opens_at->toIso8601String()];
    }

    /**
     * What `endsAt` must come after.
     *
     * THE PLAIN `after:startsAt` FORM IS WRONG ON A PATCH. It compares against
     * another INPUT field, and when that field was not sent Laravel resolves
     * it to null and the comparison passes vacuously — so a form posting only
     * a corrected end time could set it before the beginning, and the row that
     * C6 made `ends_at` NOT NULL for becomes an event of negative length after
     * all. Measured by mutation 2026-09-10: with the plain form, PATCHing an
     * endsAt an hour before the stored start answers 200 and stores it.
     *
     * @return array<int, string>
     */
    private function afterTheStart(?Event $event): array
    {
        // A request that carries its own start is compared against that, the
        // create form's behaviour exactly — including reporting a garbage
        // start against `startsAt` rather than against the end.
        if ($this->has('startsAt')) {
            return ['after:startsAt'];
        }

        // Otherwise the STORED start, as an ISO 8601 instant so the parameter
        // carries its own offset. Safe as a rule string: Laravel splits a rule
        // on the FIRST colon only, so the time's colons survive, and the value
        // holds no comma to be read as a second parameter.
        //
        // No event bound means no comparison at all — see rules() on why this
        // has to survive being called with nothing bound.
        return $event === null ? [] : ['after:'.$event->starts_at->toIso8601String()];
    }
}
