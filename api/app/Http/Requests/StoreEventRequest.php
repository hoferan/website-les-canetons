<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A new entry on the planning: a rehearsal, a gig or a concert, created as a
 * draft. Only the title is required, so a draft can be written before the
 * venue is known. The full rules run when it is published.
 *
 * When both dates are sent the end must come strictly after the start. The end
 * may fall on a later day; a two-day event such as a carnival weekend is an
 * ordinary row.
 *
 * `isPublic` defaults to false; it only matters once the event is published.
 * `attire` and `notes` are optional.
 *
 * The three `registration*` fields open the event to public bookings. Setting
 * `registrationClosesAt` is what switches registration on at all; leave it
 * null and the public form answers `404`.
 */
class StoreEventRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `endsAt` must come after `startsAt`, or a mistyped hour makes an
        // event of negative length. The rule is `after`, not same-day plus an
        // hour comparison, because an event may span two days.
        //
        // `attire` and `notes` are nullable because most rows need neither,
        // and requiring them is how "-" ends up on the screen.
        //
        // App\Exceptions\ApiError echoes these field names into the error's
        // field list, where web/src/i18n/fr.ts looks them up, so renaming one
        // breaks its translated error message.
        //
        // Rule order matters: ApiError reports only the first failed rule per
        // field, so `required` comes first (an empty title reports `required`,
        // not `invalid_type`) and `date` precedes `after` on `endsAt`, so an
        // unparseable end reports a format problem.
        //
        // Setting a registration close date is what enables public
        // registration (ADR 0020), so the three `registration*` fields switch
        // a souper on without touching the database.
        return [
            'title' => ['required', 'string', 'max:255'],
            /** ISO 8601. Send any offset and it is honoured; no offset is read as UTC. Stored and returned as UTC. Optional on a draft, required to publish. */
            'startsAt' => ['nullable', 'date'],
            /** ISO 8601 with an offset, strictly after `startsAt` when both are sent. May fall on a later day; a two-day event is normal. Optional on a draft, required to publish. */
            'endsAt' => ['nullable', 'date', 'after:startsAt'],
            /** Where it happens, as free text. Nothing geocodes it. Optional on a draft, required to publish. */
            'location' => ['nullable', 'string', 'max:255'],
            /** What to wear, for example "Costume complet". Optional. */
            'attire' => ['nullable', 'string', 'max:255'],
            /** Whether the event appears on the public agenda once published. Members see it either way. Defaults to false. */
            'isPublic' => ['sometimes', 'boolean'],
            /** Anything else members should read. Optional, up to 5000 characters. */
            'notes' => ['nullable', 'string', 'max:5000'],

            /** When public bookings start. Null means bookings are open as soon as `registrationClosesAt` is set. */
            'registrationOpensAt' => ['nullable', 'date'],
            /** When public bookings stop. Setting this is what opens the event to public registration at all; null means it takes no bookings. */
            'registrationClosesAt' => ['nullable', 'date', 'after:registrationOpensAt'],
            /** The largest number of people one booking may cover, 1 to 100. Null means no cap. */
            'registrationMaxGuests' => ['nullable', 'integer', 'gt:0', 'max:100'],
            /** Ids from `GET /event-tags`. A repeated id counts once. */
            'tagIds' => ['sometimes', 'array', 'max:8'],
            'tagIds.*' => ['integer', 'exists:event_tags,id'],
        ];
    }
}
