<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A season, as one template plus the list of dates it happens on.
 *
 * There is no recurrence rule. Send exactly the dates you want, as `Y-m-d`
 * strings, up to 60 of them; the caller is what decides which weeks are
 * skipped for school holidays. One independent event is created per date, and
 * afterwards nothing links them: editing or deleting one leaves the rest
 * alone.
 *
 * The template carries `startTime` and `endTime` as `H:i` wall-clock strings
 * rather than the instants a single event takes. Each date is combined with
 * those times in Europe/Zurich, so a season spanning the daylight-saving
 * change keeps the same time on the clock throughout.
 */
class StoreEventSeriesRequest extends FormRequest
{
    /**
     * The largest season this endpoint will write in one request.
     *
     * Two seasons of weekly rehearsals is roughly 26 dates less than this, so
     * 60 is well past any honest use while still refusing the malformed
     * request that asks a shared host to write ten thousand rows. The cap is
     * a validation rule rather than a check in the controller so that a
     * refusal costs no database work and reports against `dates` like every
     * other field.
     */
    public const MAX_DATES = 60;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // A LIST OF DATES, NOT A RECURRENCE RULE (decision C3). The browser
        // computes the candidate dates, the committee unticks the ones that
        // fall in school holidays, and what arrives here is exactly the rows
        // they looked at. No rule engine exists on either side of the wire,
        // and after the request there is no series — just N ordinary events.
        //
        // The H:i times are the whole point of the shape: a season spans the
        // daylight-saving change, so the one thing every event in it shares
        // is the time on the clock in Fribourg, not an offset.
        // App\Support\BandTime::compose() turns each (date, time) pair into
        // the right instant; see
        // EventSeriesTest::test_the_wall_clock_time_is_the_same_in_summer_and_winter.
        //
        // RULE ORDER: `required` leads every list, because ApiError reports
        // only the FIRST failed rule per field and an empty field must report
        // `required` rather than a format complaint.
        //
        // The format-before-comparison order on `template.endTime` is kept
        // for consistency with StoreEventRequest, but — MEASURED 2026-09-10 —
        // it is NOT load-bearing here, unlike there. Reversing it on `endsAt`
        // changes that field's reported reason from `invalid_format` to
        // `must_be_after`; reversing it here does not, and '25:00' still
        // reports `invalid_format` either way. Different rule pair
        // (`date_format:H:i` + `after:<field>` rather than `date` +
        // `after:<field>`), different behaviour. So do not copy the claim
        // from one file to the other without re-measuring, and do not read
        // test_an_unparseable_end_time_is_a_format_error_not_a_comparison as
        // pinning an ordering — it pins the reported reason, which is what
        // the committee actually reads.
        return [
            /**
             * The event every date is stamped out from.
             *
             * @example {"title":"Répétition","location":"Local des Canetons, Fribourg","attire":null,"isPublic":false,"notes":null,"startTime":"20:00","endTime":"22:00"}
             */
            'template' => ['required', 'array'],
            'template.title' => ['required', 'string', 'max:255'],
            /** Where it happens, as free text. The same for every date. */
            'template.location' => ['required', 'string', 'max:255'],
            /** What to wear. Optional. */
            'template.attire' => ['nullable', 'string', 'max:255'],
            /** Whether the generated events appear on the public agenda. Applies to all of them. */
            'template.isPublic' => ['required', 'boolean'],
            'template.notes' => ['nullable', 'string'],

            // H:i, because these are wall-clock times and not instants — see
            // the class docblock. date_format rather than a regex so '25:00'
            // and '10:70' are refused rather than composed into nonsense.
            /** Start time as `H:i`, for example `20:00`. Read as a wall-clock time in Europe/Zurich on each date. */
            'template.startTime' => ['required', 'date_format:H:i'],
            /** End time as `H:i`, strictly after `startTime`. Every generated event begins and ends on its own date. */
            'template.endTime' => ['required', 'date_format:H:i', 'after:template.startTime'],

            // NO `min:1`, deliberately. Laravel's `required` already refuses an
            // empty array, and it reports the reason a French reader can act on
            // ("Dates est requis"). `min` would report `too_short`, whose copy
            // interpolates a character count — ApiError's REASONS docblock
            // records that `min` is committed to the string-length reading, so
            // an array minimum here would tell the committee their list of
            // dates "est trop court (minimum 1 caractères)".
            // The example is the real 2026 autumn rehearsal season as the
            // committee would enter it: Tuesday evenings, with the school
            // holidays simply absent from the list. That gap is the whole
            // argument for sending dates rather than a recurrence rule, and it
            // is the part no description can show.
            /**
             * The dates to generate, at least one and at most 60. Order does not matter.
             *
             * @example ["2026-10-06","2026-10-13","2026-11-03","2026-11-10"]
             */
            'dates' => ['required', 'array', 'max:'.self::MAX_DATES],

            // Y-m-d only. An ISO instant would carry an offset, and the whole
            // point of this endpoint is that the offset is derived per date
            // from the band's zone rather than sent.
            /** One calendar date as `Y-m-d`, for example `2026-11-14`. No time and no offset: both come from the template. */
            'dates.*' => ['required', 'date_format:Y-m-d'],
        ];
    }
}
