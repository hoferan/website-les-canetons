<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation for POST/PUT /api/events.
 *
 * Field names are camelCase because planning_repet.js posts them that way and
 * App\Exceptions\ApiError echoes them straight into fields[].field, where both
 * app/assets/js/i18n.js (for the French message) and planning_repet.js's
 * EVENT_FIELD_INPUT_IDS map (for highlighting the offending input) look them up.
 * The DB columns are snake_case; the mapping happens in EventController, not
 * here — do not normalise either direction.
 *
 * Rule ORDER is load-bearing: ApiError reports only the first failed rule per
 * field, so `required` must come first (an empty field reports `required`, not
 * `invalid_type`) and `max` must precede any format-ish rule (an over-long
 * title reports `too_long`). Field order mirrors App\Dto\EventInput's attribute
 * order, so the reported fields[] list keeps the legacy endpoint's sequence.
 *
 * `attire` is deliberately NOT required — the old DTO annotated it #[TypeString,
 * MaxLength(255)] with no #[Required], because a rehearsal with no dress code is
 * legitimate. An absent or blank tenue is normalised to '' by the controller.
 *
 * `id` is deliberately absent too: it identifies WHICH event a PUT/DELETE acts
 * on, not a property of the event itself, and is now a `/events/{id}` route
 * parameter (routes/api.php), constrained to digits by whereNumber() — so it
 * is validated by routing, not by this request. Laravel resolves the
 * FormRequest before the controller body runs, so field validation still
 * happens first, exactly as the legacy endpoint's own id check used to run
 * after field validation.
 */
class EventRequest extends FormRequest
{
    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'date' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'startTime' => ['required', 'string'],
            'endTime' => ['required', 'string'],
            'location' => ['required', 'string', 'max:255'],
            'attire' => ['nullable', 'string', 'max:255'],
            'weekend' => ['nullable', 'boolean'],
        ];
    }
}
