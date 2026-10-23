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
        // it changed must not blank the others. The nullable columns also need
        // `nullable`, or an explicit null (clearing the attire, or
        // registrationClosesAt to switch registration off) fails the type
        // rules.
        //
        // Rule order matters, as in StoreEventRequest: `required` before the
        // type rules and `date` before the comparison, so an unparseable end
        // reports a format problem. Pinned by
        // EventWriteTest::test_editing_reports_an_unparseable_end_as_a_format_error.
        //
        // Null-safe: ApiErrorVocabularyTest instantiates every FormRequest
        // outside a request to read its rules() keys, with no bound route
        // model.
        /** @var Event|null $event */
        $event = $this->route('event');

        // A draft may lose its dates and location, a published event may not.
        // The stored row decides, so nobody can un-date a published event by
        // sending null. With nothing bound the rules are being read to build
        // the API reference, which documents the null a draft accepts.
        $mayBeEmpty = $event !== null && ! $event->isDraft() ? ['required'] : ['nullable'];

        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            /** ISO 8601. Send any offset and it is honoured; no offset is read as UTC. Stored and returned as UTC. Send `null` to clear it on a draft; a published event refuses that with `required`. */
            'startsAt' => ['sometimes', ...$mayBeEmpty, 'date'],
            /** ISO 8601 with an offset, strictly after the start. Compared against `startsAt` when that is sent too, and against the stored start otherwise. Send `null` to clear it on a draft; a published event refuses that with `required`. */
            'endsAt' => ['sometimes', ...$mayBeEmpty, 'date', ...$this->afterTheStart($event)],
            /** Where it happens, as free text. Send `null` to clear it on a draft; a published event refuses that with `required`. */
            'location' => ['sometimes', ...$mayBeEmpty, 'string', 'max:255'],
            /** What to wear. Send `null` to clear it. */
            'attire' => ['sometimes', 'nullable', 'string', 'max:255'],
            /** Whether the event appears on the public agenda. Members see it either way. */
            'isPublic' => ['sometimes', 'boolean'],
            /** Anything else members should read. Send `null` to clear it. */
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],

            /** When public bookings start. Send `null` for bookings that are open as soon as the close date is set. */
            'registrationOpensAt' => ['sometimes', 'nullable', 'date'],
            /** When public bookings stop. Send `null` to switch public registration off; bookings already taken are kept. Must fall after the opening, whether that is sent here or already stored. */
            'registrationClosesAt' => ['sometimes', 'nullable', 'date', ...$this->afterTheOpening($event)],
            /** The largest number of people one booking may cover, 1 to 100. Send `null` for no cap. */
            'registrationMaxGuests' => ['sometimes', 'nullable', 'integer', 'gt:0', 'max:100'],
            /** Whether the public may use the form (ADR 0033). A new form is closed until the committee opens it; closed, the form answers 404. */
            'registrationEnabled' => ['sometimes', 'boolean'],
            /** Whether the form asks for a postal address. Default true. */
            'registrationAsksAddress' => ['sometimes', 'boolean'],
            /** Whether the form asks who the guest would like to sit with. Default true. */
            'registrationAsksTable' => ['sometimes', 'boolean'],
            /** Ids from `GET /event-tags`, replacing the event's tags. Leave it out to keep them; send `[]` to clear them. */
            'tagIds' => ['sometimes', 'array', 'max:8'],
            'tagIds.*' => ['integer', 'exists:event_tags,id'],
        ];
    }

    /**
     * What `registrationClosesAt` must come after.
     *
     * The PATCH trap `afterTheStart()` describes, on the other date pair:
     * without an opening in the request, falls back to the stored one.
     *
     * An event with no opening date has no lower bound, because a null
     * opening means "open as soon as the close date is set".
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
     * The plain `after:startsAt` form is wrong on a PATCH: it compares against
     * another input field, and when that field was not sent the comparison
     * passes, so an end sent alone could fall before the stored start.
     *
     * @return array<int, string>
     */
    private function afterTheStart(?Event $event): array
    {
        // A request carrying its own start is compared against it, as on
        // create, so a garbage start is reported against `startsAt`.
        if ($this->has('startsAt')) {
            return ['after:startsAt'];
        }

        // Otherwise the stored start, as an ISO 8601 instant carrying its own
        // offset. Safe in a rule string: Laravel splits a rule on the first
        // colon only, and the value holds no comma.
        //
        // No bound event (see rules()) or a draft with no start means no
        // comparison.
        return $event?->starts_at === null ? [] : ['after:'.$event->starts_at->toIso8601String()];
    }
}
