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
     * Well past any honest season, while refusing a request that asks the
     * shared host to write thousands of rows. A validation rule, so a refusal
     * costs no database work and reports against `dates`.
     */
    public const MAX_DATES = 60;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // A list of dates, not a recurrence rule. The browser computes the
        // candidate dates, the committee unticks the school holidays, and
        // exactly those rows arrive here. After the request there is no
        // series, only ordinary events.
        //
        // The times are H:i because a season spans the daylight-saving change,
        // so what its events share is the time on the clock in Fribourg, not
        // an offset. App\Support\BandTime::compose() turns each (date, time)
        // pair into an instant; see
        // EventSeriesTest::test_the_wall_clock_time_is_the_same_in_summer_and_winter.
        // date_format refuses '25:00' and '10:70' instead of composing them.
        //
        // `required` leads every list, because ApiError reports only the first
        // failed rule per field.
        //
        // The format-before-comparison order on `template.endTime` matches
        // StoreEventRequest but does not matter here: with `date_format:H:i`
        // '25:00' reports `invalid_format` in either order, unlike `date` on
        // `endsAt`. test_an_unparseable_end_time_is_a_format_error_not_a_comparison
        // pins the reported reason, not the order.
        //
        // `dates` has no `min:1`: `required` already refuses an empty array
        // with a reason the committee can act on, and ApiError reads `min` as a
        // string length, so its copy would count characters.
        //
        // Each date is Y-m-d with no offset, because the offset is derived per
        // date from the band's zone.
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
            /** Ids from `GET /event-tags`, put on every generated event. A repeated id counts once. */
            'template.tagIds' => ['sometimes', 'array', 'max:8'],
            'template.tagIds.*' => ['integer', 'exists:event_tags,id'],

            /** Start time as `H:i`, for example `20:00`. Read as a wall-clock time in Europe/Zurich on each date. */
            'template.startTime' => ['required', 'date_format:H:i'],
            /** End time as `H:i`, strictly after `startTime`. Every generated event begins and ends on its own date. */
            'template.endTime' => ['required', 'date_format:H:i', 'after:template.startTime'],

            /**
             * The dates to generate, at least one and at most 60. Order does not matter.
             *
             * @example ["2026-10-06","2026-10-13","2026-11-03","2026-11-10"]
             */
            'dates' => ['required', 'array', 'max:'.self::MAX_DATES],

            /** One calendar date as `Y-m-d`, for example `2026-11-14`. No time and no offset: both come from the template. */
            'dates.*' => ['required', 'date_format:Y-m-d'],
        ];
    }
}
