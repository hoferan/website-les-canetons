<?php

namespace App\Http\Requests;

use App\Support\Occasion;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Field names are snake_case because signup.js posts them that way and
 * App\Exceptions\ApiError echoes them straight into fields[].field, where
 * i18n.js looks them up. (The contact form uses camelCase — the two forms
 * genuinely differ; do not normalise either to the other.)
 *
 * Rule ORDER is load-bearing: ApiError reports only the first failed rule per
 * field, so `required` must come first (an empty field reports `required`, not
 * `invalid_format`) and `max` must precede `email` (an over-long address
 * reports `too_long`). Field order mirrors App\Dto\SignupInput's attribute
 * order, so the reported fields[] list keeps the legacy endpoint's sequence.
 *
 * `occasion` is deliberately absent: the controller fixes it to
 * Occasion::ACTIVE server-side and never reads it from the request.
 */
class SignupRequest extends FormRequest
{
    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'email' => ['required', 'string', 'max:255', 'email'],
            'table_name' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * `menus` is validated by Occasion::normalizeMenus(), not by Laravel rules.
     *
     * The accepted values and the 1..MAX_GUESTS guest cap then live in that one
     * method, instead of being split across an `array`, a `min`, a `max` and an
     * `in` rule. The message added here IS the reason token; see
     * App\Exceptions\ApiError::validation() for how a closure-added error with
     * no failed rule still reaches fields[].
     *
     * That token must be a PARAMLESS one, which is why it is 'invalid_format'
     * and not the more specific-looking 'invalid_value' the legacy endpoint
     * emitted. Two independent reasons, either sufficient:
     *
     *  - i18n.js renders invalid_value as "doit être l'une des valeurs
     *    suivantes : {{allowed}}", and i18next prints a missing interpolation
     *    value literally — a closure-added error has nowhere to carry `params`,
     *    so the user would read a raw {{allowed}}. Structurally, invalid_value
     *    is reachable only via the `in` rule, which does supply them.
     *  - invalid_format ("n'est pas dans un format valide") is also the more
     *    accurate of the two here, because normalizeMenus() rejects on COUNT as
     *    well as on value — an empty list or more than MAX_GUESTS entries is not
     *    a "must be one of the following values" problem at all.
     *
     * Supplying params.allowed => Occasion::MENU_VALUES was considered and
     * rejected: those are English enum values (meat/child/vegetarian), so
     * showing them to a French user is worse than a generic message, and it
     * would still be the wrong sentence for the count-based rejections.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if (Occasion::normalizeMenus($this->input('menus')) === null) {
                    $validator->errors()->add('menus', 'invalid_format');
                }
            },
        ];
    }

    /**
     * The normalised menus list, guaranteed non-null once validation passed.
     *
     * @return array<int, string>
     */
    public function menus(): array
    {
        return Occasion::normalizeMenus($this->input('menus'));
    }
}
