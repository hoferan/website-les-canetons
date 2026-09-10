<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A new entry on the planning: a rehearsal, a gig or a concert.
 *
 * `startsAt` and `endsAt` are both required, and the end must come strictly
 * after the start. The end may fall on a later day; a two-day event such as a
 * carnival weekend is an ordinary row here, not a special case.
 *
 * `isPublic` is required rather than defaulted, because showing an event to
 * strangers is a decision somebody makes per event. `attire` and `notes` are
 * optional and stay empty for the many rows that need neither.
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
        // `endsAt` is REQUIRED and must come AFTER `startsAt`. Required
        // because the column is (C6, 2026_09_09_000001): a nullable end is
        // what would let the `weekend` boolean creep back, since without an
        // end there is nothing to read "this runs over two days" off. After,
        // because nothing else enforced it and a mistyped hour produces an
        // event of negative length — it sorts and renders in ways nobody has
        // designed for.
        //
        // The rule is `after`, not `same day` plus an hour comparison:
        // "Weekend musical, 3-4 October" is a real row on the live planning,
        // and spanning two days is precisely the case C6 dissolved the flag
        // for.
        //
        // `attire` and `notes` are nullable because half the planning has
        // neither — a rehearsal in ordinary clothes with nothing to add is the
        // common row, and requiring the committee to type something into both
        // is how "-" ends up on the screen.
        //
        // `isPublic` is required rather than defaulted, the same call
        // StoreMemberRequest makes for `publicVisible`.
        //
        // Field names are camelCase, matching what the SPA sends and what
        // App\Exceptions\ApiError echoes into fields[].field, where
        // web/src/i18n/fr.ts looks them up. Renaming one silently breaks its
        // French error message.
        //
        // RULE ORDER IS LOAD-BEARING: ApiError reports only the FIRST failed
        // rule per field, so `required` comes first everywhere (an empty title
        // reports `required`, not `invalid_type`) and `date` precedes `after`
        // on `endsAt` — an unparseable end is a format problem, and comparing
        // it to anything would report the wrong thing.
        return [
            'title' => ['required', 'string', 'max:255'],
            /** ISO 8601 with an offset. The event happens at this wall-clock time in Europe/Zurich. */
            'startsAt' => ['required', 'date'],
            /** ISO 8601 with an offset, strictly after `startsAt`. May fall on a later day; a two-day event is normal. */
            'endsAt' => ['required', 'date', 'after:startsAt'],
            /** Where it happens, as free text. Nothing geocodes it. */
            'location' => ['required', 'string', 'max:255'],
            /** What to wear, for example "Costume complet". Optional. */
            'attire' => ['nullable', 'string', 'max:255'],
            /** Whether the event appears on the public agenda. Members see it either way. */
            'isPublic' => ['required', 'boolean'],
            /** Anything else members should read. Optional, up to 5000 characters. */
            'notes' => ['nullable', 'string', 'max:5000'],

            // The registration window. Setting a close date is what enables
            // public registration at all (D9), so these three are how a
            // souper is switched on without touching the database.
            /** When public bookings start. Null means bookings are open as soon as `registrationClosesAt` is set. */
            'registrationOpensAt' => ['nullable', 'date'],
            /** When public bookings stop. Setting this is what opens the event to public registration at all; null means it takes no bookings. */
            'registrationClosesAt' => ['nullable', 'date', 'after:registrationOpensAt'],
            /** The largest number of people one booking may cover, 1 to 100. Null means no cap. */
            'registrationMaxGuests' => ['nullable', 'integer', 'gt:0', 'max:100'],
        ];
    }
}
