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
     * The accepted values, the 1..MAX_GUESTS guest cap and the reason token the
     * UI receives then all live in that one method, exactly as the legacy
     * endpoint had them — instead of being split across an `array`, a `min`, a
     * `max` and an `in` rule whose reported reasons would differ from the old
     * contract. The message added here IS the reason token; see
     * App\Exceptions\ApiError::validation() for how a closure-added error with
     * no failed rule still reaches fields[].
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if (Occasion::normalizeMenus($this->input('menus')) === null) {
                    $validator->errors()->add('menus', 'invalid_value');
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
