<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation for POST /api/responses — a member's own RSVP for one event.
 *
 * Field names are camelCase because inscriptions_utilisateurs.js posts them that
 * way and App\Exceptions\ApiError echoes them straight into fields[].field,
 * where app/assets/js/i18n.js looks them up (fields.eventId => "Événement",
 * fields.participation => "Participation"). The column is `answer`; that mapping
 * happens in ResponseController, not here.
 *
 * There is deliberately NO field naming a user. The answer is always recorded
 * for the session's own user, so a userId/username in the body has nothing to
 * bind to — see ResponseController::store().
 *
 * Rule ORDER is load-bearing: ApiError reports only the first failed rule per
 * field, so `required` comes first (an absent field reports `required`, not
 * `invalid_type`). Field order mirrors App\Dto\ResponseInput's attribute order,
 * so the reported fields[] list keeps the legacy endpoint's sequence.
 */
class ResponseRequest extends FormRequest
{
    /**
     * The accepted — and stored — answers, in the events table's enum order.
     *
     * ENGLISH enum values, deliberately: only the on-screen label is French
     * ("Participe" / "Ne participe pas", computed in inscriptions_admin.js and
     * the RSVP page's <select>). One constant so the `in` rule below, the
     * database enum and any consumer cannot drift apart.
     */
    public const ANSWERS = ['participate', 'notparticipate'];

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            // `integer` accepts a numeric STRING, which is what the frontend
            // sends — inscriptions_utilisateurs.js reads the id out of the query
            // string. It is also what makes `gt` compare numerically rather than
            // by string length (Validator::getSize() treats the value as a number
            // only when a numeric rule is present).
            //
            // gt:0 maps to the PARAMLESS 'invalid_number', not the legacy
            // endpoint's 'invalid_value': i18n.js renders invalid_value as "doit
            // être l'une des valeurs suivantes : {{allowed}}" and only the `in`
            // rule can supply that list. See ApiError::REASONS.
            'eventId' => ['required', 'integer', 'gt:0'],
            // The STRING form of `in`, not Rule::in(...): ApiError keys its
            // reason map on the failed rule's name, and an object rule arrives as
            // a class name that never matches — so Rule::in() would silently
            // degrade this to the generic 'invalid_format' and lose the
            // params.allowed list the French message interpolates.
            'participation' => ['required', 'in:'.implode(',', self::ANSWERS)],
        ];
    }
}
