<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Editing one row of the planning.
 *
 * PATCH, so every rule is `sometimes`: a form posting only the field it
 * changed must not blank the others.
 *
 * `sometimes` is not the same as `nullable`, and the two nullable columns need
 * both — `sometimes` means "skip this field if absent", `nullable` means "null
 * is a legal value when present". Without `sometimes` an absent field fails
 * `required`; without `nullable` an explicit null fails the type rules.
 * Clearing the attire is an explicit null, so both matter. UpdateMemberRequest
 * makes the same call at more length, for the same situation.
 *
 * RULE ORDER IS LOAD-BEARING, exactly as StoreEventRequest documents: ApiError
 * reports only the FIRST failed rule per field, so `required` comes before the
 * type rules and `date` before the comparison — an unparseable end is a format
 * problem, and comparing it to anything reports the wrong thing. Pinned by
 * EventWriteTest::test_editing_reports_an_unparseable_end_as_a_format_error.
 */
class UpdateEventRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Null-safe deliberately, the same call UpdateMemberRequest makes:
        // ApiErrorVocabularyTest instantiates every FormRequest outside a
        // request to read its rules() keys, so there is no bound route model
        // then and `$event->starts_at` would fatal. At runtime route-model
        // binding guarantees one.
        /** @var Event|null $event */
        $event = $this->route('event');

        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'startsAt' => ['sometimes', 'required', 'date'],
            'endsAt' => ['sometimes', 'required', 'date', ...$this->afterTheStart($event)],
            'location' => ['sometimes', 'required', 'string', 'max:255'],
            'attire' => ['sometimes', 'nullable', 'string', 'max:255'],
            'isPublic' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
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
